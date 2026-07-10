import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { Indexer } from "../core/indexer.js";
import { Embedder } from "../core/embedder.js";
import { GraphBuilder } from "../core/graph.js";
import { VectorIndex } from "../core/vector.js";
import { TextSearch } from "../core/search-text.js";
import { NoteCrud } from "../core/crud.js";
import { FrontmatterManager, TagManager } from "../core/frontmatter.js";
import { SessionManager, deriveSessionDir } from "../core/session.js";
import { computeDecay, loadDecayConfig, normalizeVerifiedDate, type DecayConfig } from "../core/decay.js";
import type { IndexedDocument, IndexState } from "../core/types.js";

export interface ServerOptions {
  watch?: boolean;
  waitForReady?: boolean;
  model?: string;
  workers?: number;
  batchSize?: number;
  quantized?: boolean;
  readOnly?: boolean;
  onProgress?: (embedded: number, total: number) => void;
}

export interface DecayBlock {
  multiplier: number;
  age_days: number;
  effective_half_life: number;
  reason: string;
}

export interface EnrichedResult {
  mtime?: string;
  loadPriority?: number;
  status?: string;
  tier?: string;
  domains?: string[];
  decay?: DecayBlock;
}

export interface ServerContext {
  notesPath: string;
  indexPath: string;
  options: ServerOptions;

  indexer: Indexer;
  embedder: Embedder;
  graph: GraphBuilder;
  textSearch: TextSearch;
  crud: NoteCrud;
  frontmatterManager: FrontmatterManager;
  tagManager: TagManager;
  sessions: SessionManager;

  getDocuments(): IndexedDocument[];
  getDocByPath(): Map<string, IndexedDocument>;
  getVectorIndex(): VectorIndex | null;
  getIndexState(): IndexState;
  getIndexProgress(): { embedded: number; total: number };

  tryLoadCachedIndex(): Promise<boolean>;
  fullIndex(): Promise<void>;
  backgroundIndex(): void;
  isIndexingInFlight(): boolean;

  textResponse(text: string): { content: { type: "text"; text: string }[] };
  indexingMessage(): string;
  enrichResult<T extends { path: string }>(r: T): T & EnrichedResult;
  applyPriorityBoost(score: number, path: string): number;
  /**
   * Apply confidence decay to a scored result: multiply its score by the decay
   * multiplier and, when the note is actually decayed (multiplier < 1), attach a
   * `decay` block for the agent to see. No-op when decay is disabled or the note
   * is fresh. Semantic ranking signal only — callers wire it into
   * search_semantic / search_hybrid, never search_text / search_graph.
   */
  applyDecay<T extends { path: string; score: number }>(r: T): T & { decay?: DecayBlock };
  applyDateFilter<T extends { path: string }>(
    results: T[],
    modifiedAfter?: string,
    modifiedBefore?: string
  ): T[];
}

export async function buildContext(notesPath: string, options: ServerOptions = {}): Promise<ServerContext> {
  const indexPath = join(notesPath, ".semantic-sidekick-index");
  await mkdir(indexPath, { recursive: true });

  const indexer = new Indexer(notesPath);
  const embedder = new Embedder(options.model, options.workers, options.batchSize, options.quantized);
  const graph = new GraphBuilder();
  const textSearch = new TextSearch();
  const crud = new NoteCrud(notesPath);
  const frontmatterManager = new FrontmatterManager(notesPath);
  const tagManager = new TagManager(notesPath);
  const sessions = new SessionManager(deriveSessionDir(notesPath));

  let documents: IndexedDocument[] = [];
  let docByPath = new Map<string, IndexedDocument>();
  let vectorIndex: VectorIndex | null = null;
  let indexState: IndexState = "empty";
  let indexProgress = { embedded: 0, total: 0 };
  let indexingPromise: Promise<void> | null = null;

  async function tryLoadCachedIndex(): Promise<boolean> {
    try {
      indexState = "loading";
      await embedder.init();

      const metaPath = join(indexPath, "meta.json");
      let meta: { model?: string; totalChunks?: number; dimensions?: number; indexedAt?: string } | null = null;
      if (existsSync(metaPath)) {
        try {
          meta = JSON.parse(await readFile(metaPath, "utf-8"));
          if (meta?.model && meta.model !== embedder.getModel()) {
            process.stderr.write(`Model changed (${meta.model} → ${embedder.getModel()}), forcing reindex\n`);
            return false;
          }
        } catch {
          meta = null;
        }
      }

      const tempVector = new VectorIndex(embedder.getDimensions());
      const vectorLoaded = await tempVector.load(indexPath);
      if (!vectorLoaded) return false;

      const savedEmbeddings = await embedder.loadEmbeddings(indexPath);
      if (savedEmbeddings.size === 0) return false;

      const graphLoaded = await graph.load(indexPath);
      if (!graphLoaded) return false;

      documents = await indexer.indexAll();
      docByPath = new Map(documents.map((d) => [d.path, d]));
      textSearch.setDocuments(documents);

      vectorIndex = tempVector;

      const currentChunks = documents.reduce((n, d) => n + d.chunks.length, 0);
      const fresh = meta?.totalChunks !== undefined && meta.totalChunks === currentChunks;
      indexState = fresh ? "ready" : "stale";
      return true;
    } catch {
      return false;
    }
  }

  async function fullIndex() {
    indexState = "indexing";
    indexProgress = { embedded: 0, total: 0 };

    await embedder.init();
    const newDocs = await indexer.indexAll();

    const totalChunks = newDocs.reduce((n, d) => n + d.chunks.length, 0);
    indexProgress = { embedded: 0, total: totalChunks };

    const newTextSearch = new TextSearch();
    newTextSearch.setDocuments(newDocs);

    const newGraph = new GraphBuilder();
    newGraph.buildFromDocuments(newDocs);

    const savedEmbeddings = await embedder.loadEmbeddings(indexPath);

    const SAVE_INTERVAL = 100;
    const allChunks: { embedding: Float32Array; docPath: string; chunkIndex: number; text: string }[] = [];
    const cumulativeEmbeddings = new Map<string, Float32Array>(savedEmbeddings);

    type PendingChunk = { text: string; docPath: string; chunkIndex: number };
    const pendingChunks: PendingChunk[] = [];

    for (const doc of newDocs) {
      for (let i = 0; i < doc.chunks.length; i++) {
        const key = `${doc.path}:${i}`;
        const existing = cumulativeEmbeddings.get(key);
        if (existing) {
          allChunks.push({ embedding: existing, docPath: doc.path, chunkIndex: i, text: doc.chunks[i] });
        } else {
          pendingChunks.push({ text: doc.chunks[i], docPath: doc.path, chunkIndex: i });
        }
      }
    }

    indexProgress = { embedded: allChunks.length, total: totalChunks };

    if (pendingChunks.length > 0) {
      let chunksSinceLastSave = 0;
      const alreadyEmbedded = allChunks.length;

      await embedder.embedBatch(
        pendingChunks.map((c) => c.text),
        async (done, _total, embeddings) => {
          if (!embeddings) return;
          const batchStart = done - embeddings.length;
          for (let i = 0; i < embeddings.length; i++) {
            const { docPath, chunkIndex, text } = pendingChunks[batchStart + i];
            const key = `${docPath}:${chunkIndex}`;
            cumulativeEmbeddings.set(key, embeddings[i]);
            allChunks.push({ embedding: embeddings[i], docPath, chunkIndex, text });
            chunksSinceLastSave++;
          }

          const current = alreadyEmbedded + done;
          indexProgress = { embedded: current, total: totalChunks };
          options.onProgress?.(current, totalChunks);

          if (chunksSinceLastSave >= SAVE_INTERVAL) {
            await embedder.saveEmbeddings(cumulativeEmbeddings, indexPath);
            chunksSinceLastSave = 0;
          }
        }
      );
    }

    const newVector = new VectorIndex(embedder.getDimensions());
    newVector.build(
      allChunks.map((c) => c.embedding),
      allChunks.map((c) => ({ docPath: c.docPath, chunkIndex: c.chunkIndex, text: c.text }))
    );

    documents = newDocs;
    docByPath = new Map(documents.map((d) => [d.path, d]));
    textSearch.setDocuments(newDocs);
    graph.buildFromDocuments(newDocs);
    vectorIndex = newVector;
    indexState = "ready";

    await Promise.all([
      graph.save(indexPath),
      newVector.save(indexPath),
      embedder.saveEmbeddings(cumulativeEmbeddings, indexPath),
      indexer.saveDocsCache(indexPath, newDocs),
      writeFile(join(indexPath, "meta.json"), JSON.stringify({
        model: embedder.getModel(),
        dimensions: embedder.getDimensions(),
        totalChunks: allChunks.length,
        indexedAt: new Date().toISOString(),
      })),
    ]);
  }

  function backgroundIndex() {
    if (indexingPromise) return;
    indexingPromise = fullIndex()
      .catch((err) => {
        process.stderr.write(`Index error: ${err?.message ?? err}\n`);
        if (indexState === "indexing") indexState = documents.length > 0 ? "stale" : "empty";
      })
      .finally(() => {
        indexingPromise = null;
      });
  }

  function textResponse(text: string) {
    return { content: [{ type: "text" as const, text }] };
  }

  function indexingMessage(): string {
    if (indexProgress.total > 0) {
      return `Indexing in progress (${indexProgress.embedded}/${indexProgress.total} chunks)... Try again shortly.`;
    }
    return "Indexing in progress... Try again shortly.";
  }

  function enrichResult<T extends { path: string }>(result: T): T & EnrichedResult {
    const doc = docByPath.get(result.path);
    if (!doc) return result;
    return {
      ...result,
      mtime: doc.mtime,
      ...(doc.loadPriority !== undefined && { loadPriority: doc.loadPriority }),
      ...(doc.status !== undefined && { status: doc.status }),
      ...(doc.tier !== undefined && { tier: doc.tier }),
      ...(doc.domains !== undefined && { domains: doc.domains }),
    };
  }

  function applyPriorityBoost(score: number, path: string): number {
    const doc = docByPath.get(path);
    if (doc?.loadPriority === undefined) return score;
    return score * (1 + (doc.loadPriority - 5) * 0.04);
  }

  // Decay config is read once from vault.schema.yml and cached for the process.
  let decayConfig: DecayConfig | null = null;
  function getDecayConfig(): DecayConfig {
    if (!decayConfig) decayConfig = loadDecayConfig(notesPath);
    return decayConfig;
  }

  function applyDecay<T extends { path: string; score: number }>(r: T): T & { decay?: DecayBlock } {
    const cfg = getDecayConfig();
    if (!cfg.enabled) return r;
    const doc = docByPath.get(r.path);
    if (!doc) return r;
    const fm = doc.frontmatter ?? {};
    const d = computeDecay({
      type: typeof fm.type === "string" ? fm.type : undefined,
      last_verified: normalizeVerifiedDate(fm.last_verified),
      evergreen: fm.evergreen === true,
      config: cfg,
    });
    const scored = { ...r, score: r.score * d.multiplier };
    // Only surface the decay block when the note is actually down-weighted —
    // don't clutter healthy results.
    if (d.multiplier < 1) {
      return {
        ...scored,
        decay: {
          multiplier: Math.round(d.multiplier * 1000) / 1000,
          age_days: Math.round(d.age_days),
          effective_half_life: d.effective_half_life,
          reason: d.reason,
        },
      };
    }
    return scored;
  }

  function applyDateFilter<T extends { path: string }>(
    results: T[],
    modifiedAfter?: string,
    modifiedBefore?: string
  ): T[] {
    if (!modifiedAfter && !modifiedBefore) return results;
    const after = modifiedAfter ? new Date(modifiedAfter).getTime() : -Infinity;
    const before = modifiedBefore ? new Date(modifiedBefore).getTime() : Infinity;
    return results.filter((r) => {
      const doc = docByPath.get(r.path);
      if (!doc) return true;
      const t = new Date(doc.mtime).getTime();
      return t >= after && t <= before;
    });
  }

  return {
    notesPath,
    indexPath,
    options,
    indexer,
    embedder,
    graph,
    textSearch,
    crud,
    frontmatterManager,
    tagManager,
    sessions,
    getDocuments: () => documents,
    getDocByPath: () => docByPath,
    getVectorIndex: () => vectorIndex,
    getIndexState: () => indexState,
    getIndexProgress: () => indexProgress,
    tryLoadCachedIndex,
    fullIndex,
    backgroundIndex,
    isIndexingInFlight: () => indexingPromise !== null,
    textResponse,
    indexingMessage,
    enrichResult,
    applyPriorityBoost,
    applyDecay,
    applyDateFilter,
  };
}
