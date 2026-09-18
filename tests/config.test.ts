import { describe, expect, test } from "bun:test";
import { readConfig } from "../src/config";

const defaults: Record<string, string> = {
  "api-key": "key",
  "github-token": "gh",
  "dry-run": "true",
  "label-threshold": "0.8",
  "max-labels": "3",
  "spam-threshold": "0.95",
  "duplicate-threshold": "0.9",
  "max-duplicate-candidates": "100",
  "exclude-labels": "duplicate, Good First Issue\nwontfix",
  "duplicate-label": "duplicate",
  "spam-label": "spam",
  comment: "auto",
};
const reader = (overrides: Record<string, string> = {}) => (name: string) => ({ ...defaults, ...overrides })[name] ?? "";

describe("readConfig", () => {
  test("parses defaults", () => {
    const config = readConfig(reader());
    expect(config.dryRun).toBe(true);
    expect(config.thresholds).toEqual({ label: 0.8, maxLabels: 3, spam: 0.95, duplicate: 0.9 });
    expect([...config.excludeLabels]).toEqual(["duplicate", "good first issue", "wontfix"]);
    expect(config.model).toBeUndefined();
    expect(config.issueNumber).toBeUndefined();
  });

  test("requires an api key", () => {
    expect(() => readConfig(reader({ "api-key": " " }))).toThrow('"api-key" is required');
  });

  test("rejects out-of-range thresholds", () => {
    expect(() => readConfig(reader({ "label-threshold": "1.5" }))).toThrow('"label-threshold"');
    expect(() => readConfig(reader({ "max-duplicate-candidates": "300" }))).toThrow('"max-duplicate-candidates"');
  });

  test("rejects invalid booleans and comment modes", () => {
    expect(() => readConfig(reader({ "dry-run": "yes" }))).toThrow('"dry-run"');
    expect(() => readConfig(reader({ comment: "sometimes" }))).toThrow('"comment"');
  });

  test("reads an explicit issue number", () => {
    expect(readConfig(reader({ "issue-number": "42" })).issueNumber).toBe(42);
  });
});
