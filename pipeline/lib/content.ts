import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { episodeSchema, type CanonicalEpisode } from "./schema";

export const root = process.cwd();
export const contentDir = join(root, "content", "episodes");
export const outputDir = join(root, "public", "data");
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export async function readEpisodes(): Promise<CanonicalEpisode[]> {
  try {
    const files = (await readdir(contentDir)).filter((file) => file.endsWith(".json")).sort();
    return Promise.all(
      files.map(async (file) =>
        episodeSchema.parse(JSON.parse(await readFile(join(contentDir, file), "utf8")))
      )
    );
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function writeJson(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, stableJson(value));
}
export async function cleanOutput() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
}
