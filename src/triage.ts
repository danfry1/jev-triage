import type {
  ChoiceResponse,
  NoulResponse,
  Questions,
  ScoreResponse,
} from "@typesafe-ai/sdk";

export interface Label {
  name: string;
  description: string | null;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  authorAssociation: string;
  labels: string[];
}

export interface Candidate {
  number: number;
  title: string;
}

export interface Thresholds {
  /** Minimum yes-probability for a label to be applied. */
  label: number;
  /** Maximum number of labels applied to one issue. */
  maxLabels: number;
  /** Minimum spam probability before the issue is closed. */
  spam: number;
  /** Minimum confidence before an issue is marked as a duplicate. */
  duplicate: number;
}

export interface LabelVerdict {
  name: string;
  probability: number;
  apply: boolean;
}

export interface Decision {
  labels: LabelVerdict[];
  spam: { probability: number; close: boolean };
  duplicate: { number: number; title: string; confidence: number } | null;
}

type Answer = NoulResponse | ChoiceResponse | ScoreResponse;

/** A Choice can hold at most 255 options; one is reserved for "none". */
export const MAX_DUPLICATE_CANDIDATES = 254;
const MAX_BODY_CHARS = 8000;
const NONE = "none";
const SPAM_KEY = "spam";
const DUPLICATE_KEY = "duplicate";

const labelKey = (index: number) => `label_${index}`;
const candidateKey = (number: number) => `issue_${number}`;

export function buildState(issue: Issue) {
  const body =
    issue.body.length > MAX_BODY_CHARS
      ? `${issue.body.slice(0, MAX_BODY_CHARS)}\n[truncated]`
      : issue.body;
  return {
    title: issue.title,
    body,
    author_association: issue.authorAssociation,
  };
}

/**
 * One Noul per label gives independent probabilities, so an issue can be both
 * a `bug` and `documentation`. Spam and duplicate detection ride along in the
 * same request.
 */
export function buildQuestions(labels: Label[], candidates: Candidate[]): Questions {
  const questions: Questions = {};

  labels.forEach((label, index) => {
    questions[labelKey(index)] = {
      type: "noul",
      instructions: `Should this GitHub issue be labelled "${label.name}"?`,
      criteria: label.description ? { true: label.description } : null,
    };
  });

  questions[SPAM_KEY] = {
    type: "noul",
    instructions:
      "Is this issue spam, gibberish, advertising, or otherwise not a genuine bug report, feature request or question about the project?",
  };

  if (candidates.length > 0) {
    const criteria: Record<string, string> = {
      [NONE]: "None of the existing issues describe the same problem or request",
    };
    for (const candidate of candidates.slice(0, MAX_DUPLICATE_CANDIDATES)) {
      criteria[candidateKey(candidate.number)] = candidate.title;
    }
    questions[DUPLICATE_KEY] = {
      type: "choice",
      instructions:
        "Which existing open issue, if any, describes the same problem or request as this one?",
      criteria,
    };
  }

  return questions;
}

function noul(answers: Record<string, Answer>, key: string): number {
  const answer = answers[key];
  if (answer?.type !== "noul") throw new Error(`Missing noul answer for "${key}"`);
  return answer.noul;
}

export function decide(
  answers: Record<string, Answer>,
  labels: Label[],
  candidates: Candidate[],
  thresholds: Thresholds,
): Decision {
  const ranked = labels
    .map((label, index) => ({ name: label.name, probability: noul(answers, labelKey(index)) }))
    .sort((a, b) => b.probability - a.probability);

  let applied = 0;
  const labelVerdicts = ranked.map((verdict) => {
    const apply = verdict.probability >= thresholds.label && applied < thresholds.maxLabels;
    if (apply) applied++;
    return { ...verdict, apply };
  });

  const spamProbability = noul(answers, SPAM_KEY);

  let duplicate: Decision["duplicate"] = null;
  const dup = answers[DUPLICATE_KEY];
  if (dup?.type === "choice" && dup.choice !== NONE && dup.confidence >= thresholds.duplicate) {
    const match = candidates.find((c) => candidateKey(c.number) === dup.choice);
    if (match) duplicate = { number: match.number, title: match.title, confidence: dup.confidence };
  }

  return {
    labels: labelVerdicts,
    spam: { probability: spamProbability, close: spamProbability >= thresholds.spam },
    duplicate,
  };
}
