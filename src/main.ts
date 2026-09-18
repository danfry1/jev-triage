import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { renderComment } from "./comment.js";
import { readConfig } from "./config.js";
import { addLabels, closeAsNotPlanned, getIssue, listCandidates, listLabels, upsertComment } from "./github.js";
import { buildQuestions, buildState, decide } from "./triage.js";

/** Keeps the request well inside Jev's ~32k token budget. */
const MAX_LABELS_CONSIDERED = 150;

function resolveIssueNumber(configured: number | undefined): number | undefined {
  if (configured !== undefined) return configured;
  const issue = context.payload.issue;
  if (!issue) return undefined;
  if (issue.pull_request) return undefined;
  if (issue.user?.type === "Bot") {
    core.info(`Skipping issue #${issue.number} opened by a bot`);
    return undefined;
  }
  return issue.number;
}

async function run() {
  const config = readConfig((name) => core.getInput(name));
  const issueNumber = resolveIssueNumber(config.issueNumber);
  if (issueNumber === undefined) {
    core.info(`Nothing to triage for "${context.eventName}" event`);
    return;
  }

  const octokit = getOctokit(config.githubToken);
  const repo = context.repo;
  const jev = new TypeSafeClient({ apiKey: config.apiKey, baseURL: config.baseURL });

  const issue = await getIssue(octokit, repo, issueNumber);
  const present = new Set(issue.labels.map((l) => l.toLowerCase()));
  const reserved = [config.fallbackLabel, config.duplicateLabel, config.spamLabel].map((l) => l?.toLowerCase());

  const allLabels = await listLabels(octokit, repo);
  const repoLabelNames = new Set(allLabels.map((l) => l.name.toLowerCase()));
  let labels = allLabels.filter((l) => {
    const name = l.name.toLowerCase();
    return !config.excludeLabels.has(name) && !present.has(name) && !reserved.includes(name);
  });
  if (labels.length > MAX_LABELS_CONSIDERED) {
    core.warning(`Repository has ${labels.length} candidate labels; only the first ${MAX_LABELS_CONSIDERED} are considered`);
    labels = labels.slice(0, MAX_LABELS_CONSIDERED);
  }

  const candidates =
    config.maxDuplicateCandidates > 0
      ? await listCandidates(octokit, repo, issue.number, config.maxDuplicateCandidates)
      : [];

  const started = performance.now();
  const result = await jev.systemOne({
    state: buildState(issue),
    questions: buildQuestions(labels, candidates),
    ...(config.model ? { model: config.model } : {}),
  });
  const latencyMs = Math.round(performance.now() - started);

  const decision = decide(result.answers, labels, candidates, config.thresholds);
  core.info(`Jev answered in ${latencyMs} ms (${result.usage.input_tokens} input tokens)`);

  const toApply = decision.labels.filter((l) => l.apply).map((l) => l.name);
  if (toApply.length === 0 && config.fallbackLabel) toApply.push(config.fallbackLabel);
  if (decision.duplicate && config.duplicateLabel) toApply.push(config.duplicateLabel);
  // Adding a label that does not exist creates it, so the spam label is only used if the repo already has one.
  if (decision.spam.close && config.spamLabel && repoLabelNames.has(config.spamLabel.toLowerCase())) {
    toApply.push(config.spamLabel);
  }

  core.setOutput("labels", JSON.stringify(toApply));
  core.setOutput("spam-probability", decision.spam.probability.toString());
  core.setOutput("duplicate-of", decision.duplicate?.number.toString() ?? "");
  core.setOutput("latency-ms", latencyMs.toString());

  const shouldComment =
    config.comment === "always" ||
    (config.comment === "auto" && (config.dryRun || decision.duplicate !== null || decision.spam.close));
  if (shouldComment) {
    await upsertComment(octokit, repo, issue.number, renderComment(decision, { dryRun: config.dryRun, latencyMs }));
  }

  if (config.dryRun) {
    core.info(`Dry run: would apply ${JSON.stringify(toApply)}${decision.spam.close ? " and close as spam" : ""}`);
    return;
  }

  await addLabels(octokit, repo, issue.number, toApply);
  if (decision.spam.close) await closeAsNotPlanned(octokit, repo, issue.number);
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
