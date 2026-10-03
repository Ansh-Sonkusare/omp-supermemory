import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export interface SupermemoryConfig {
  apiKey: string | undefined;
  baseUrl: string;
  recallLimit: number;
  similarityThreshold: number;
  captureEveryNTurns: number;
  autoRecall: boolean;
}

type Env = Record<string, string | undefined>;

const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

function num(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function fileApiKey(home: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(home, ".config", "omp-supermemory", "config.json"), "utf8"));
    return typeof parsed?.apiKey === "string" && parsed.apiKey ? parsed.apiKey : undefined;
  } catch {
    return undefined;
  }
}

export function loadConfig(env: Env = process.env, home: string = homedir()): SupermemoryConfig {
  return {
    apiKey: env.SUPERMEMORY_API_KEY || fileApiKey(home),
    baseUrl: (env.SUPERMEMORY_API_URL || "https://api.supermemory.ai").replace(/\/+$/, ""),
    recallLimit: num(env.SUPERMEMORY_RECALL_LIMIT, 5),
    similarityThreshold: num(env.SUPERMEMORY_THRESHOLD, 0.6),
    captureEveryNTurns: num(env.SUPERMEMORY_CAPTURE_EVERY, 1),
    autoRecall: env.SUPERMEMORY_AUTO_RECALL !== "false",
  };
}

export function userTag(env: Env = process.env): string {
  return "omp_user_" + sha16(env.USER || userInfo().username);
}

function findGitRoot(start: string): string | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

export function projectTag(cwd: string): string {
  const abs = resolve(cwd);
  const root = findGitRoot(abs) ?? abs;
  const name = basename(root).toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return `omp_project_${name}_${sha16(root)}`;
}
