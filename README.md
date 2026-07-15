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

Run `npm run data:ingest` to crawl the complete paginated podcast archive. It discovers AMA posts, snapshots only new episode pages in `raw-cache/`, and writes one normalized canonical JSON file per newly discovered monthly AMA. Existing canonical episode IDs/source URLs are skipped, making scheduled runs incremental.

## Quality checks

```sh
npm run ci
```

The GitHub Actions Pages workflow runs these checks and publishes the static `out/` folder. The monthly ingest workflow opens a reviewable PR containing any newly ingested canonical content.
