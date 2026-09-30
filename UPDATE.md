# Automated AMA Ingest — Current State & Plan

**Question:** does this project already check for new AMA episodes and publish them automatically?

**Answer: partially, and in practice it has never worked.** The wiring exists, but the schedule
is mismatched to the publication pattern, the PR step is blocked by a repository setting, and
nothing validates the parse before it would ship. This document records the evidence and the
plan to get to a genuinely hands-off weekly update.

---

## 1. What exists today

| Piece                | File                                   | Trigger                                     | Status                         |
| -------------------- | -------------------------------------- | ------------------------------------------- | ------------------------------ |
| Ingest + open PR     | `.github/workflows/ingest-refresh.yml` | cron `17 4 1 * *` (04:17 UTC, 1st of month) | Runs, but ineffective — see §2 |
| Build + deploy Pages | `.github/workflows/build-deploy.yml`   | push to `main`, manual                      | Works                          |

The intended chain is: cron → `npm run data:ingest` → PR → human merge → push to `main` →
`build-deploy` → GitHub Pages. Steps 1 and 5 work. Steps 2–4 do not.

## 2. Why it has never landed an episode

Five independent defects, each verified against the live repo:

**2.1 — The cadence cannot catch a new AMA promptly.**
Every AMA publishes on a **Monday**, but the day-of-month ranges from the 1st to the 17th:

```
2026-03-02 Mon   2026-05-04 Mon   2026-07-13 Mon
2026-04-06 Mon   2026-06-01 Mon   2026-08-03 Mon
```

A cron pinned to the 1st therefore misses almost every episode on its own month's run and only
picks it up the _following_ month. **This just happened:** run `30688150458` fired 2026-08-01
06:39 UTC, found nothing, and reported success in 37s. The August AMA published 2026-08-03 —
two days later. The next scheduled check was 2026-09-01, a **29-day lag**. It was ingested by
hand instead.

**2.2 — The PR step is blocked by repository settings.**
`peter-evans/create-pull-request` requires "Allow GitHub Actions to create and approve pull
requests". The repo currently reports:

```
$ gh api repos/PandaTobi/MindscapeSearch/actions/permissions/workflow
{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}
```

The workflow has never had content to submit, so this has never surfaced — the one run that
fired had an empty diff. The first time it finds a real episode, the step fails.

**2.3 — Nothing validates the parse.**
`ingest-refresh.yml` runs `data:ingest` and goes straight to the PR. It never runs
`data:validate`, the test suite, or a build. And `build-deploy.yml` triggers only on
`push: branches: [main]`, so the PR gets no CI either. A transcript format drift — the exact
risk SPEC §16.1 flags as highest — would reach a human reviewer with no signal attached.

**2.4 — Scheduled workflows will be auto-disabled every January.**
Public repos have their crons disabled after 60 days without repository activity. AMA gaps
routinely exceed that window:

```
70 days: 2023-12-04 -> 2024-02-12
70 days: 2020-12-09 -> 2021-02-17
63 days: 2024-12-02 -> 2025-02-03
63 days: 2022-12-05 -> 2023-02-06
```

There is no January AMA in any year of the corpus. A no-op weekly run pushes no commit, so it
does not itself count as activity — the automation silently switches off over the winter break.

**2.5 — It requires a human merge.**
Even fully repaired, the current shape stops at an open PR. That is deliberate per SPEC §13.2,
but it is not the hands-off behaviour being asked for here.

---

## 3. Target behaviour

> Every Monday evening, check for a new AMA. If one exists, ingest it, prove it is sound, and
> get it onto GitHub so the site redeploys itself.

Design commitments:

- **Weekly, Monday evening, America/Chicago.** Matches the observed Monday publication day and
  cuts worst-case staleness from ~29 days to ~7.
- **Validate before publishing, not after.** The full `npm run ci` gate runs on the ingested
  content inside the ingest workflow. Nothing reaches `main` unless it parses, validates,
  typechecks, tests, and builds.
- **Automated gate replaces the human gate.** SPEC §13.2 chose a PR because parser drift needs
  catching. That rationale is honoured by making the gate mechanical and blocking; the human
  review it describes has never actually occurred, since no PR was ever opened.
- **Fail loudly.** A failed parse opens an issue rather than silently no-opping.

---

## 4. Plan

### 4.1 Replace `.github/workflows/ingest-refresh.yml`

```yaml
name: Weekly ingest refresh
on:
  schedule:
    # Tue 00:47 UTC == Mon 19:47 CDT (summer) / Mon 18:47 CST (winter).
    # GitHub cron is always UTC and never observes DST, so this is chosen to stay
    # on Monday evening in America/Chicago in both halves of the year.
    - cron: "47 0 * * 2"
  workflow_dispatch:

permissions:
  contents: write
  issues: write

concurrency:
  group: ingest
  cancel-in-progress: false

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci

      - name: Discover and ingest new AMA episodes
        id: ingest
        run: |
          npm run data:ingest
          if [ -z "$(git status --porcelain -- content raw-cache)" ]; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            echo "No new AMA episode found."
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
            git status --porcelain -- content raw-cache
          fi

      # The blocking quality gate: schema validation, lint, types, tests, and a
      # full data + site build over the newly ingested content.
      - name: Validate
        if: steps.ingest.outputs.changed == 'true'
        run: npm run ci
        env:
          NEXT_PUBLIC_BASE_PATH: ""
          NEXT_PUBLIC_SITE_URL: https://www.mindscapesear.ch

      - name: Commit and push
        if: steps.ingest.outputs.changed == 'true'
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add content raw-cache
          git commit -m "chore(content): ingest new AMA episode(s)"
          git push

      - name: Report a failed ingest
        if: failure() && steps.ingest.outputs.changed == 'true'
        run: |
          gh issue create \
            --title "Automated AMA ingest failed on $(date -u +%Y-%m-%d)" \
            --body "The weekly ingest produced content that did not pass \`npm run ci\`. This usually means the transcript format changed (SPEC §16.1). Run \`npm run data:ingest\` locally to inspect. Workflow run: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
            --label automation
        env:
          GH_TOKEN: ${{ github.token }}
```

Notes on specific choices:

- Only `content/` and `raw-cache/` are staged. `public/data/**` is gitignored and is rebuilt by
  `build-deploy.yml`, so committing it would be redundant and would produce noisy diffs.
- `npm run ci` is safe to run over freshly-ingested files: `.prettierignore` already excludes
  `content/episodes` and `raw-cache`, so `format:check` will not fail on generated JSON.
  (Verified locally against the just-ingested August episode.)
- Pushing to `main` triggers `build-deploy.yml` through the existing `push` trigger. No change
  is needed there, and no cross-workflow token plumbing is required.
- The minute `:47` is deliberately off-the-hour; GitHub delays crons that bunch on the hour.

### 4.2 Add a keepalive so the cron survives January

Add to the same job, so a quiet winter still counts as repository activity:

```yaml
- name: Keep scheduled workflows enabled
  if: steps.ingest.outputs.changed == 'false'
  uses: gautamkrishnar/keepalive-workflow@v2
```

Alternatively, self-host the equivalent: a monthly empty commit, or simply watch for GitHub's
"scheduled workflow disabled" notification email and re-enable manually. The keepalive action
is the lowest-maintenance option.

### 4.3 Confirm the token can push to `main`

`permissions: contents: write` at workflow level grants push rights even though the repo default
is `read`, so **no settings change is needed for the recommended plan.** But verify `main` has no
branch protection that would reject a bot push:

```sh
gh api repos/PandaTobi/MindscapeSearch/branches/main/protection
```

If protection exists, either exempt `github-actions[bot]` or switch to §5's PR variant.

### 4.4 Add politeness to the crawler

`discoverEpisodes` walks every archive page on every run, and `defaultFetchText` has no delay
between requests. Going from monthly to weekly quadruples that traffic. Before shipping, add a
small inter-request delay (~500 ms) in `pipeline/ingest/index.ts`, per SPEC §5.1's rate-limiting
commitment. This is a one-line change and the only code edit the plan requires.

---

## 5. Alternative: keep the PR gate

If a human sign-off before publication is preferred over full automation, keep §4.1 but replace
the commit/push step with `peter-evans/create-pull-request@v7` plus auto-merge. This preserves
SPEC §13.2 verbatim and still lands the episode without manual work when the gate is green.

It requires one settings change that the recommended plan does not:

```sh
gh api -X PUT repos/PandaTobi/MindscapeSearch/actions/permissions/workflow \
  -F default_workflow_permissions=write -F can_approve_pull_request_reviews=true
```

|                           | §4 direct push (recommended) | §5 PR + auto-merge     |
| ------------------------- | ---------------------------- | ---------------------- |
| Repo settings change      | none                         | required (§2.2)        |
| Validation before publish | yes                          | yes                    |
| Human can intervene       | after the fact, via revert   | before merge           |
| Moving parts              | fewest                       | PR action + auto-merge |
| Matches SPEC §13.2        | amends it                    | verbatim               |

Recommendation: **§4**. The mechanical gate is stronger than a review that has never happened,
and a bad parse is one `git revert` away from resolved.

---

## 6. Verification

1. `gh workflow run "Weekly ingest refresh"` on a branch where the newest episode's JSON has
   been deleted — it should re-ingest exactly that episode, pass `npm run ci`, and push one
   commit touching only `content/` and `raw-cache/`.
2. Run it again immediately with nothing to find — it should no-op, skip validation, and exit
   green without a commit.
3. Temporarily point `podcastUrl` at a fixture that breaks the parser — it should fail the
   `Validate` step, push nothing, and open an issue.
4. After the first real run, confirm `build-deploy` fired from the bot's push and that the new
   episode is present in the deployed `data/manifest.json`.

## 7. Residual risks

- **Publication drifts off Monday.** A Tuesday release waits a full week. Cheap fix if it
  matters: add a second cron (`47 0 * * 5`) — Actions minutes are free on public repos.
- **Silent upstream format change that still validates.** Validation checks schema, IDs, and
  timestamp monotonicity, not semantic quality. A drift producing well-formed but wrong
  segments would ship. Mitigation: the workflow log prints the changed files; the segment count
  per episode in `manifest.json` is a useful smoke signal.
- **Bot commits bypass local pre-commit habits.** Anything enforced only outside `npm run ci`
  will not run. Keep the gate in `npm run ci`.
