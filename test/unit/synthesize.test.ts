import { describe, it, expect } from "vitest";
import { buildSynthesizeChangeSet } from "../../src/core/synthesize.js";

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
});
