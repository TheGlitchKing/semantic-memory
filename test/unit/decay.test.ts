import { describe, it, expect } from "vitest";
import { computeDecay, normalizeVerifiedDate, DEFAULT_DECAY_CONFIG, type DecayConfig } from "../../src/core/decay.js";

const NOW = Date.parse("2026-07-10T00:00:00Z");
function daysAgo(n: number): string {
  return new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
}
const cfg = (over: Partial<DecayConfig> = {}): DecayConfig => ({ ...DEFAULT_DECAY_CONFIG, ...over });

describe("computeDecay", () => {
  it("returns 1.0 when disabled", () => {
    const r = computeDecay({ type: "gotcha", last_verified: daysAgo(1000), config: cfg({ enabled: false }), nowMs: NOW });
    expect(r.multiplier).toBe(1.0);
  });

  it("returns ~0.5 at exactly one half-life", () => {
    const r = computeDecay({ type: "note", last_verified: daysAgo(365), config: cfg(), nowMs: NOW });
    expect(r.multiplier).toBeCloseTo(0.5, 2);
    expect(r.age_days).toBeCloseTo(365, 0);
  });

  it("floors at 0.1 when age is many half-lives", () => {
    const r = computeDecay({ type: "gotcha", last_verified: daysAgo(180 * 10), config: cfg(), nowMs: NOW });
    expect(r.multiplier).toBe(0.1);
  });

  it("resolves the per-type half-life (gotcha=180 decays faster than note=365)", () => {
    const gotcha = computeDecay({ type: "gotcha", last_verified: daysAgo(180), config: cfg(), nowMs: NOW });
    const note = computeDecay({ type: "note", last_verified: daysAgo(180), config: cfg(), nowMs: NOW });
    expect(gotcha.multiplier).toBeCloseTo(0.5, 2);
    expect(note.multiplier).toBeGreaterThan(gotcha.multiplier);
    expect(gotcha.effective_half_life).toBe(180);
  });

  it("never decays a type with a null half-life (source)", () => {
    const r = computeDecay({ type: "source", last_verified: daysAgo(5000), config: cfg(), nowMs: NOW });
    expect(r.multiplier).toBe(1.0);
    expect(r.reason).toMatch(/never decays/);
  });

  it("fails open (1.0) when last_verified is missing", () => {
    const r = computeDecay({ type: "note", config: cfg(), nowMs: NOW });
    expect(r.multiplier).toBe(1.0);
  });

  it("fails open (1.0) when last_verified is in the future", () => {
    const r = computeDecay({ type: "note", last_verified: daysAgo(-30), config: cfg(), nowMs: NOW });
    expect(r.multiplier).toBe(1.0);
  });

  it("fails open (1.0) on an unparseable last_verified", () => {
    const r = computeDecay({ type: "note", last_verified: "not-a-date", config: cfg(), nowMs: NOW });
    expect(r.multiplier).toBe(1.0);
  });

  it("pins evergreen notes at 1.0 while verified within 365d", () => {
    const r = computeDecay({ type: "note", last_verified: daysAgo(300), evergreen: true, config: cfg(), nowMs: NOW });
    expect(r.multiplier).toBe(1.0);
    expect(r.evergreen).toBe(true);
  });

  it("lets an evergreen note decay once its verification is older than 365d", () => {
    const r = computeDecay({ type: "note", last_verified: daysAgo(400), evergreen: true, config: cfg(), nowMs: NOW });
    expect(r.multiplier).toBeLessThan(1.0);
  });

  it("normalizeVerifiedDate handles YAML Date objects and strings (regression: unquoted dates)", () => {
    expect(normalizeVerifiedDate("2019-01-01")).toBe("2019-01-01");
    // YAML parses an unquoted `last_verified: 2019-01-01` into a Date
    const asDate = new Date("2019-01-01T00:00:00Z");
    expect(normalizeVerifiedDate(asDate)).toBe(asDate.toISOString());
    expect(normalizeVerifiedDate(undefined)).toBeUndefined();
    expect(normalizeVerifiedDate(42)).toBeUndefined();
    // and the normalized Date flows through computeDecay to actual decay
    const r = computeDecay({ type: "gotcha", last_verified: normalizeVerifiedDate(asDate), config: cfg(), nowMs: NOW });
    expect(r.multiplier).toBeLessThan(1);
  });

  it("hotness boost (when enabled) extends effective half-life", () => {
    const base = computeDecay({ type: "note", last_verified: daysAgo(365), inbound_link_count: 10, config: cfg(), nowMs: NOW });
    const hot = computeDecay({
      type: "note",
      last_verified: daysAgo(365),
      inbound_link_count: 10,
      config: cfg({ hotness_boost: { enabled: true, cap: 2.0 } }),
      nowMs: NOW,
    });
    expect(hot.effective_half_life).toBeGreaterThan(base.effective_half_life);
    expect(hot.multiplier).toBeGreaterThan(base.multiplier);
  });
});
