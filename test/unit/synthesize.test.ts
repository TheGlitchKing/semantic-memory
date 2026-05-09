import { describe, it, expect } from "vitest";
import { buildSynthesizeChangeSet, buildPromoteChangeSet } from "../../src/core/synthesize.js";

describe("buildSynthesizeChangeSet", () => {
  it("produces a single create with provenance frontmatter", () => {
    const r = buildSynthesizeChangeSet({
      topic: "Auth Migration",
      answer: "We moved from Passport to Keycloak for SSO.",
      suggested_path: "decisions/auth-migration",
      type: "decision",
      decided_on: "2026-03-15",
      decision_maker: "alice",
      sources: ["https://example.com/rfc-1"],
      confidence: "high",
      status: "active",
    });
    expect(r.path).toBe("decisions/auth-migration.md");
    expect(r.changeset.creates).toHaveLength(1);
    const create = r.changeset.creates![0];
    expect(create.frontmatter).toMatchObject({
      title: "Auth Migration",
      type: "decision",
      status: "active",
      decision_maker: "alice",
      decided_on: "2026-03-15",
      confidence: "high",
      sources: ["https://example.com/rfc-1"],
    });
    expect(create.frontmatter!.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("auto-links related notes in body and appends Related section", () => {
    const r = buildSynthesizeChangeSet({
      topic: "RabbitMQ in the pipeline",
      answer: "The service uses RabbitMQ for fanout. RabbitMQ replaced Kafka last quarter.",
      suggested_path: "notes/rabbitmq-usage.md",
      related_notes: ["rabbitmq-operations.md", "kafka-deprecation.md"],
    });
    const body = r.changeset.creates![0].content;
    // First occurrence of "RabbitMQ" replaced by [[rabbitmq-operations]]
    expect(body).toContain("[[rabbitmq-operations]]");
    // Related section present with both
    expect(body).toContain("## Related");
    expect(body).toContain("[[rabbitmq-operations]]");
    expect(body).toContain("[[kafka-deprecation]]");
  });

  it("does not wikilink inside code blocks", () => {
    const r = buildSynthesizeChangeSet({
      topic: "x",
      answer: "Real text mentions Foo.\n\n```\ncode with Foo\n```\n\nMore Foo.",
      suggested_path: "x.md",
      related_notes: ["Foo"],
    });
    const body = r.changeset.creates![0].content;
    expect(body).toMatch(/```[\s\S]*Foo[\s\S]*```/); // unchanged
    // First occurrence outside code is linked
    expect(body).toMatch(/Real text mentions \[\[Foo\]\]/);
  });

  it("defaults type to 'note' and confidence to 'medium'", () => {
    const r = buildSynthesizeChangeSet({
      topic: "x",
      answer: "body",
      suggested_path: "x",
    });
    expect(r.changeset.creates![0].frontmatter!.type).toBe("note");
    expect(r.changeset.creates![0].frontmatter!.confidence).toBe("medium");
  });

  describe("proposal mode", () => {
    it("rewrites path to proposals/<date>-<slug>.md and forces status:proposal", () => {
      const r = buildSynthesizeChangeSet({
        topic: "Auth Migration",
        answer: "summary",
        suggested_path: "decisions/auth-migration.md",
        type: "decision",
        proposal: true,
      });
      expect(r.is_proposal).toBe(true);
      expect(r.proposed_target).toBe("decisions/auth-migration.md");
      expect(r.path).toMatch(/^proposals\/\d{4}-\d{2}-\d{2}-auth-migration\.md$/);
      expect(r.changeset.creates![0].frontmatter!.status).toBe("proposal");
      expect(r.changeset.creates![0].frontmatter!.proposed_target).toBe("decisions/auth-migration.md");
    });

    it("respects proposal_subdir override", () => {
      const r = buildSynthesizeChangeSet({
        topic: "Outage 2026-05-08",
        answer: "summary",
        suggested_path: "incidents/2026-05-08.md",
        proposal: true,
        proposal_subdir: "proposals/outage",
      });
      expect(r.path).toMatch(/^proposals\/outage\/\d{4}-\d{2}-\d{2}-outage-2026-05-08\.md$/);
    });

    it("non-proposal mode preserves original path and is_proposal undefined", () => {
      const r = buildSynthesizeChangeSet({
        topic: "x",
        answer: "y",
        suggested_path: "notes/x.md",
      });
      expect(r.is_proposal).toBeUndefined();
      expect(r.proposed_target).toBeUndefined();
      expect(r.path).toBe("notes/x.md");
      expect(r.changeset.creates![0].frontmatter!.status).toBe("active");
    });
  });
});

describe("buildPromoteChangeSet", () => {
  it("creates target + deletes proposal, strips proposal markers", () => {
    const r = buildPromoteChangeSet({
      proposal_path: "proposals/2026-05-08-auth.md",
      body: "# Auth\n\nbody.\n",
      frontmatter: {
        title: "Auth",
        type: "decision",
        status: "proposal",
        proposed_target: "decisions/auth.md",
        confidence: "high",
      },
    });
    expect(r.from).toBe("proposals/2026-05-08-auth.md");
    expect(r.to).toBe("decisions/auth.md");
    expect(r.changeset.creates).toHaveLength(1);
    const create = r.changeset.creates![0];
    expect(create.path).toBe("decisions/auth.md");
    expect(create.frontmatter!.status).toBe("active");
    expect(create.frontmatter!.proposed_target).toBeUndefined();
    expect(create.frontmatter!.title).toBe("Auth");
    expect(create.frontmatter!.confidence).toBe("high");
    expect(r.changeset.deletes).toEqual([{ path: "proposals/2026-05-08-auth.md" }]);
  });

  it("respects target_path override", () => {
    const r = buildPromoteChangeSet({
      proposal_path: "proposals/2026-05-08-auth.md",
      target_path: "decisions/auth-overridden.md",
      body: "# Auth\n",
      frontmatter: {
        title: "Auth",
        status: "proposal",
        proposed_target: "decisions/auth.md",
      },
    });
    expect(r.to).toBe("decisions/auth-overridden.md");
    expect(r.changeset.creates![0].path).toBe("decisions/auth-overridden.md");
  });

  it("throws when no target_path and no proposed_target frontmatter", () => {
    expect(() =>
      buildPromoteChangeSet({
        proposal_path: "proposals/x.md",
        body: "x",
        frontmatter: { title: "x", status: "proposal" },
      })
    ).toThrow(/no target_path provided/);
  });
});
