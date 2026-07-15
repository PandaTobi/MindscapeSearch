/**
 * Ingestion deliberately runs only in CI or a maintainer workstation. Source adapters
 * write content-addressed raw snapshots here, then parsers produce canonical content.
 * Network acquisition is intentionally not part of the static browser application.
 */
export interface TranscriptSourceAdapter {
  name: string;
  canParse(html: string): boolean;
  parse(html: string): unknown;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("No reviewed source adapter is configured; ingestion completed without changes.");
}
