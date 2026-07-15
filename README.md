# Mindscape AMA Search

A static, browser-only search interface for Sean Carroll's Mindscape AMA transcripts. It is designed to deploy to GitHub Pages: no API, backend, database, or server runtime is used.

## Local development

```sh
npm install
npm run dev
```

`npm run build` validates canonical content, creates deterministic `public/data` artifacts, and exports the site to `out/`. Use `NEXT_PUBLIC_BASE_PATH=/repository-name npm run build` for a project Pages deployment.

## Content contract

Canonical source files belong in `content/episodes/` and must follow the episode schema in `pipeline/lib/schema.ts`. `npm run data:validate` is the integrity gate; `npm run data:build` rebuilds generated artifacts. Generated indexes are ignored by Git because they are recreated in CI.

The checked-in corpus starts empty deliberately: production transcript ingestion needs reviewed source adapters and attribution. The static application handles that state safely.

## Quality checks

```sh
npm run ci
```

The GitHub Actions Pages workflow runs these checks and publishes the static `out/` folder. The monthly ingest workflow is a safe no-op until a reviewed source adapter is added, so it cannot silently fetch or publish unreviewed transcript data.
