import { MAX_DUPLICATE_CANDIDATES, type Thresholds } from "./triage.js";

export type CommentMode = "auto" | "always" | "never";

export interface Config {
  apiKey: string;
  githubToken: string;
  model: string | undefined;
  baseURL: string | undefined;
  dryRun: boolean;
  thresholds: Thresholds;
  excludeLabels: Set<string>;
  fallbackLabel: string | undefined;
  duplicateLabel: string | undefined;
  maxDuplicateCandidates: number;
  spamLabel: string | undefined;
  comment: CommentMode;
  issueNumber: number | undefined;
}

/** Reads a named input; mirrors `core.getInput`, which returns "" when unset. */
export type InputReader = (name: string) => string;

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function number(read: InputReader, name: string, min: number, max: number): number {
  const raw = read(name).trim();
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Input "${name}" must be a number between ${min} and ${max}, got "${raw}"`);
  }
  return value;
}

function boolean(read: InputReader, name: string): boolean {
  const raw = read(name).trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Input "${name}" must be "true" or "false", got "${raw}"`);
}

function list(value: string): Set<string> {
  return new Set(
    value
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function readConfig(read: InputReader): Config {
  const apiKey = optional(read("api-key"));
  if (!apiKey) throw new Error('Input "api-key" is required. Store your TypeSafe key as a repository secret.');

  const comment = read("comment").trim() || "auto";
  if (comment !== "auto" && comment !== "always" && comment !== "never") {
    throw new Error(`Input "comment" must be "auto", "always" or "never", got "${comment}"`);
  }

  const issueRaw = optional(read("issue-number"));

  return {
    apiKey,
    githubToken: read("github-token"),
    model: optional(read("model")),
    baseURL: optional(read("base-url")),
    dryRun: boolean(read, "dry-run"),
    thresholds: {
      label: number(read, "label-threshold", 0, 1),
      maxLabels: number(read, "max-labels", 0, 100),
      spam: number(read, "spam-threshold", 0, 1),
      duplicate: number(read, "duplicate-threshold", 0, 1),
    },
    excludeLabels: list(read("exclude-labels")),
    fallbackLabel: optional(read("fallback-label")),
    duplicateLabel: optional(read("duplicate-label")),
    maxDuplicateCandidates: number(read, "max-duplicate-candidates", 0, MAX_DUPLICATE_CANDIDATES),
    spamLabel: optional(read("spam-label")),
    comment,
    issueNumber: issueRaw === undefined ? undefined : number(read, "issue-number", 1, Number.MAX_SAFE_INTEGER),
  };
}
