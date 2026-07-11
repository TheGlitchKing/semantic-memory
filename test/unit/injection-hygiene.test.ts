import { describe, it, expect } from "vitest";
import { formatContextBlock } from "../../hooks/vault-context.js";

const hit = (path: string, score: number) => ({ path, score, snippet: "x" });
const countHitLines = (block: string) => (block.match(/^- `/gm) || []).length;

describe("injection hygiene (formatContextBlock)", () => {
  it("score-gates: injects nothing when the best hit is weak", () => {
    const block = formatContextBlock("prompt", "thanks", [hit("a.md", 0.2), hit("b.md", 0.19), hit("c.md", 0.15)]);
    expect(block).toBe("");
  });

  it("injects when a hit clears the threshold", () => {
    const block = formatContextBlock("prompt", "how does auth work", [hit("auth.md", 0.5)]);
    expect(block).toContain("auth.md");
  });

  it("dedupes archive twins by basename (keeps the first/highest, drops the copy)", () => {
    const block = formatContextBlock("prompt", "q", [
      hit("archive/x.md", 0.6),
      hit("archive/pre-restructure/x.md", 0.55),
      hit("other.md", 0.5),
    ]);
    expect(block).toContain("`archive/x.md`");
    expect(block).not.toContain("pre-restructure");
    expect(block).toContain("`other.md`");
  });

  it("caps at top-3 hits", () => {
    const block = formatContextBlock(
      "prompt",
      "q",
      ["a.md", "b.md", "c.md", "d.md", "e.md", "f.md"].map((p, i) => hit(p, 0.6 - i * 0.01))
    );
    expect(countHitLines(block)).toBe(3);
  });

  it("keeps the compact cite-or-deflect scoping (behavior preserved) but is far shorter", () => {
    const block = formatContextBlock("prompt", "q", [hit("a.md", 0.5)]);
    expect(block).toContain("project prose lookup");
    expect(block).toContain("ignore this block silently");
    expect(block).toContain('Do NOT narrate "X unrelated"');
    // The old ~150-word instructions paragraph is gone.
    expect(block).not.toContain("This block is injected on every prompt");
    const instructions = block.split("\n").find((l) => l.startsWith("Instructions:"))!;
    expect(instructions.length).toBeLessThan(320); // was ~700 chars
  });
});
