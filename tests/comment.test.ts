import { expect, test } from "bun:test";
import { COMMENT_MARKER, renderComment } from "../src/comment";

const decision = {
  labels: [
    { name: "bug", probability: 0.97, apply: true },
    { name: "docs", probability: 0.12, apply: false },
  ],
  spam: { probability: 0.02, close: false },
  duplicate: { number: 12, title: "Crash on startup", confidence: 0.93 },
};

test("dry-run comment says nothing was changed", () => {
  const body = renderComment(decision, { dryRun: true, latencyMs: 142 });
  expect(body.startsWith(COMMENT_MARKER)).toBe(true);
  expect(body).toContain("dry run, no changes made");
  expect(body).toContain("| `bug` | 97% | would apply |");
  expect(body).toContain("**Possible duplicate of #12** (confidence 93%)");
  expect(body).toContain("in 142 ms");
});

test("live comment reports applied labels and closed spam", () => {
  const body = renderComment({ ...decision, spam: { probability: 0.99, close: true } }, { dryRun: false, latencyMs: 90 });
  expect(body).toContain("| `bug` | 97% | applied |");
  expect(body).toContain("Spam probability: 99%, closed");
});
