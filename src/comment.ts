import type { Decision } from "./triage.js";

/** Hidden marker used to find and update this action's comment on re-runs. */
export const COMMENT_MARKER = "<!-- jev-triage -->";

const MAX_LABEL_ROWS = 5;

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function renderComment(decision: Decision, opts: { dryRun: boolean; latencyMs: number }): string {
  const verb = opts.dryRun ? "would apply" : "applied";
  const lines: string[] = [COMMENT_MARKER];

  lines.push(opts.dryRun ? "### Triage (dry run, no changes made)" : "### Triage");
  lines.push("");

  const rows = decision.labels.slice(0, MAX_LABEL_ROWS);
  if (rows.length > 0) {
    lines.push("| Label | Probability | |", "| --- | --- | --- |");
    for (const row of rows) {
      lines.push(`| \`${row.name}\` | ${pct(row.probability)} | ${row.apply ? verb : ""} |`);
    }
    lines.push("");
  }

  if (decision.duplicate) {
    lines.push(
      `**Possible duplicate of #${decision.duplicate.number}** (confidence ${pct(decision.duplicate.confidence)})`,
      "",
    );
  }

  const spamNote = decision.spam.close ? (opts.dryRun ? ", would close" : ", closed") : "";
  lines.push(`Spam probability: ${pct(decision.spam.probability)}${spamNote}`, "");

  lines.push(
    `<sub>Classified by [Jev](https://typesafe.ai) in ${opts.latencyMs} ms · jev-triage</sub>`,
  );

  return lines.join("\n");
}
