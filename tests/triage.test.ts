import { describe, expect, test } from "bun:test";
import type { ChoiceResponse, NoulResponse } from "@typesafe-ai/sdk";
import { MAX_DUPLICATE_CANDIDATES, buildQuestions, buildState, decide, type Thresholds } from "../src/triage";

const thresholds: Thresholds = { label: 0.8, maxLabels: 2, spam: 0.95, duplicate: 0.9 };
const labels = [
  { name: "bug", description: "Something isn't working" },
  { name: "docs", description: null },
  { name: "enhancement", description: "New feature or request" },
];
const candidates = [
  { number: 12, title: "Crash on startup" },
  { number: 7, title: "Add dark mode" },
];

const yes = (p: number): NoulResponse => ({ type: "noul", noul: p });
const pick = (choice: string, confidence: number): ChoiceResponse => ({
  type: "choice",
  choice,
  confidence,
  probabilities: { [choice]: confidence },
});

describe("buildQuestions", () => {
  test("asks one noul per label plus spam and duplicate", () => {
    const questions = buildQuestions(labels, candidates);
    expect(Object.keys(questions)).toEqual(["label_0", "label_1", "label_2", "spam", "duplicate"]);
    expect(questions.label_0).toMatchObject({ type: "noul", criteria: { true: "Something isn't working" } });
    expect(questions.label_1).toMatchObject({ type: "noul", criteria: null });
    expect(questions.duplicate).toMatchObject({
      type: "choice",
      criteria: { none: expect.any(String), issue_12: "Crash on startup", issue_7: "Add dark mode" },
    });
  });

  test("omits the duplicate question without candidates", () => {
    expect(buildQuestions(labels, [])).not.toHaveProperty("duplicate");
  });

  test("caps duplicate options at the choice limit", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ number: i + 1, title: `Issue ${i + 1}` }));
    const question = buildQuestions([], many).duplicate;
    if (question?.type !== "choice") throw new Error("expected choice");
    expect(Object.keys(question.criteria)).toHaveLength(MAX_DUPLICATE_CANDIDATES + 1);
  });
});

describe("buildState", () => {
  test("truncates very long bodies", () => {
    const state = buildState({ number: 1, title: "t", body: "x".repeat(20_000), authorAssociation: "NONE", labels: [] });
    expect(state.body.length).toBeLessThan(8_100);
    expect(state.body.endsWith("[truncated]")).toBe(true);
  });
});

describe("decide", () => {
  test("applies confident labels, highest first, up to the maximum", () => {
    const decision = decide(
      { label_0: yes(0.85), label_1: yes(0.95), label_2: yes(0.9), spam: yes(0.01) },
      labels,
      [],
      thresholds,
    );
    expect(decision.labels.map((l) => [l.name, l.apply])).toEqual([
      ["docs", true],
      ["enhancement", true],
      ["bug", false],
    ]);
  });

  test("ignores labels below the threshold", () => {
    const decision = decide({ label_0: yes(0.79), label_1: yes(0.1), label_2: yes(0.2), spam: yes(0) }, labels, [], thresholds);
    expect(decision.labels.some((l) => l.apply)).toBe(false);
  });

  test("closes spam only at or above the threshold", () => {
    const base = { label_0: yes(0), label_1: yes(0), label_2: yes(0) };
    expect(decide({ ...base, spam: yes(0.95) }, labels, [], thresholds).spam.close).toBe(true);
    expect(decide({ ...base, spam: yes(0.94) }, labels, [], thresholds).spam.close).toBe(false);
  });

  test("flags a confident duplicate", () => {
    const decision = decide(
      { label_0: yes(0), label_1: yes(0), label_2: yes(0), spam: yes(0), duplicate: pick("issue_12", 0.93) },
      labels,
      candidates,
      thresholds,
    );
    expect(decision.duplicate).toEqual({ number: 12, title: "Crash on startup", confidence: 0.93 });
  });

  test("does not flag a duplicate for none or low confidence", () => {
    const base = { label_0: yes(0), label_1: yes(0), label_2: yes(0), spam: yes(0) };
    expect(decide({ ...base, duplicate: pick("none", 0.99) }, labels, candidates, thresholds).duplicate).toBeNull();
    expect(decide({ ...base, duplicate: pick("issue_12", 0.6) }, labels, candidates, thresholds).duplicate).toBeNull();
  });

  test("throws when an expected answer is missing", () => {
    expect(() => decide({ spam: yes(0) }, labels, [], thresholds)).toThrow('Missing noul answer for "label_0"');
  });
});
