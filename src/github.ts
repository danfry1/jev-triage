import type { getOctokit } from "@actions/github";
import { COMMENT_MARKER } from "./comment.js";
import type { Candidate, Issue, Label } from "./triage.js";

type Octokit = ReturnType<typeof getOctokit>;

export interface Repo {
  owner: string;
  repo: string;
}

export async function getIssue(octokit: Octokit, repo: Repo, issueNumber: number): Promise<Issue> {
  const { data } = await octokit.rest.issues.get({ ...repo, issue_number: issueNumber });
  return {
    number: data.number,
    title: data.title,
    body: data.body ?? "",
    authorAssociation: data.author_association ?? "NONE",
    labels: data.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean),
  };
}

export async function listLabels(octokit: Octokit, repo: Repo): Promise<Label[]> {
  const labels = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    ...repo,
    per_page: 100,
  });
  return labels.map((l) => ({ name: l.name, description: l.description ?? null }));
}

/** Most recently created open issues, excluding pull requests and the issue itself. */
export async function listCandidates(
  octokit: Octokit,
  repo: Repo,
  exclude: number,
  limit: number,
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (let page = 1; candidates.length < limit; page++) {
    const { data } = await octokit.rest.issues.listForRepo({
      ...repo,
      state: "open",
      sort: "created",
      direction: "desc",
      per_page: 100,
      page,
    });
    for (const item of data) {
      if (item.pull_request || item.number === exclude) continue;
      candidates.push({ number: item.number, title: item.title });
    }
    if (data.length < 100) break;
  }
  return candidates.slice(0, limit);
}

export async function upsertComment(octokit: Octokit, repo: Repo, issueNumber: number, body: string) {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    ...repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const existing = comments.find((c) => c.body?.startsWith(COMMENT_MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({ ...repo, comment_id: existing.id, body });
  } else {
    await octokit.rest.issues.createComment({ ...repo, issue_number: issueNumber, body });
  }
}

export async function addLabels(octokit: Octokit, repo: Repo, issueNumber: number, labels: string[]) {
  if (labels.length === 0) return;
  await octokit.rest.issues.addLabels({ ...repo, issue_number: issueNumber, labels });
}

export async function closeAsNotPlanned(octokit: Octokit, repo: Repo, issueNumber: number) {
  await octokit.rest.issues.update({
    ...repo,
    issue_number: issueNumber,
    state: "closed",
    state_reason: "not_planned",
  });
}
