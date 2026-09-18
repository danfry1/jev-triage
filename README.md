# jev-triage

A GitHub Action that triages new issues with [Jev](https://typesafe.ai), TypeSafe's System One model. Each new issue gets:

- **Labels** chosen from the repository's own labels. The model can't invent a label that doesn't exist.
- **Duplicate detection** against recent open issues.
- **Spam detection**, with optional auto-close.

Every decision comes with a calibrated probability, so you choose how sure it must be before it acts. A full triage is one request, usually a few hundred milliseconds, and costs roughly $0.0001.

## Quick start

1. Get an API key from the [TypeSafe console](https://console.typesafe.ai/settings/keys).
2. Add it as a repository secret named `TYPESAFE_API_KEY`.
3. Add `.github/workflows/triage.yml`:

```yaml
name: Triage issues

on:
  issues:
    types: [opened]

permissions:
  issues: write

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: danfry1/jev-triage@v0
        with:
          api-key: ${{ secrets.TYPESAFE_API_KEY }}
```

It starts in **dry-run mode**: it comments what it would do and changes nothing. When the suggestions look right, set `dry-run: "false"`.

To backfill or test on existing issues, see [`examples/triage.yml`](examples/triage.yml), which also supports `workflow_dispatch` with an issue number.

## How it works

The issue title, body and author association are sent to Jev as state, with one question per candidate label plus spam and duplicate questions, all in a single request:

| Decision | Question type | Acts when |
| --- | --- | --- |
| Each label | Noul (yes probability) | probability ≥ `label-threshold`, up to `max-labels`, highest first |
| Spam | Noul | probability ≥ `spam-threshold` closes the issue as not planned |
| Duplicate | Choice over recent open issues plus "none" | confidence ≥ `duplicate-threshold` adds `duplicate-label` and comments |

Label descriptions are passed to the model, so descriptive labels triage better.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `api-key` | required | TypeSafe API key |
| `dry-run` | `true` | Comment only, change nothing |
| `label-threshold` | `0.8` | Minimum probability to apply a label |
| `max-labels` | `3` | Maximum labels per issue |
| `exclude-labels` | `duplicate,invalid,wontfix,spam,needs-triage,good first issue,help wanted` | Labels the model never applies |
| `fallback-label` | empty | Applied when no label is confident enough |
| `duplicate-threshold` | `0.9` | Minimum confidence to flag a duplicate |
| `duplicate-label` | `duplicate` | Label for likely duplicates |
| `max-duplicate-candidates` | `100` | Recent open issues compared (0 to 254, 0 disables) |
| `spam-threshold` | `0.95` | Minimum probability to close as spam |
| `spam-label` | `spam` | Added to closed spam, only if the label already exists |
| `comment` | `auto` | `auto` comments on dry runs, duplicates and spam; or `always` / `never` |
| `model` | `jev-latest` | Jev model id |
| `base-url` | TypeSafe API | Override the API URL |
| `issue-number` | event issue | Issue to triage for `workflow_dispatch` runs |

Outputs: `labels` (JSON array), `spam-probability`, `duplicate-of`, `latency-ms`.

## Development

```sh
bun install
bun run typecheck
bun test
bun run build   # writes dist/index.js, which must be committed
```
