import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, projectTag, userTag } from "../src/config";

const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

let tmp: string;
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "omp-sm-")));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("loadConfig", () => {
  test("defaults", () => {
    expect(loadConfig({}, tmp)).toEqual({
      apiKey: undefined,
      baseUrl: "https://api.supermemory.ai",
      recallLimit: 5,
      similarityThreshold: 0.6,
      captureEveryNTurns: 1,
      autoRecall: true,
    });
  });

  test("env overrides", () => {
    expect(
      loadConfig(
        {
          SUPERMEMORY_API_KEY: "sk-env",
          SUPERMEMORY_API_URL: "http://localhost:9999",
          SUPERMEMORY_RECALL_LIMIT: "12",
          SUPERMEMORY_THRESHOLD: "0.25",
          SUPERMEMORY_CAPTURE_EVERY: "0",
          SUPERMEMORY_AUTO_RECALL: "false",
        },
        tmp,
      ),
    ).toEqual({
      apiKey: "sk-env",
      baseUrl: "http://localhost:9999",
      recallLimit: 12,
      similarityThreshold: 0.25,
      captureEveryNTurns: 0,
      autoRecall: false,
    });
  });

  test("non-numeric env falls back to defaults", () => {
    const cfg = loadConfig({ SUPERMEMORY_RECALL_LIMIT: "abc", SUPERMEMORY_THRESHOLD: "" }, tmp);
    expect(cfg.recallLimit).toBe(5);
    expect(cfg.similarityThreshold).toBe(0.6);
  });

  test("api key from config file, env wins", () => {
    mkdirSync(join(tmp, ".config", "omp-supermemory"), { recursive: true });
    writeFileSync(join(tmp, ".config", "omp-supermemory", "config.json"), '{"apiKey":"sk-file"}');
    expect(loadConfig({}, tmp).apiKey).toBe("sk-file");
    expect(loadConfig({ SUPERMEMORY_API_KEY: "sk-env" }, tmp).apiKey).toBe("sk-env");
  });

  test("invalid config file is ignored", () => {
    mkdirSync(join(tmp, ".config", "omp-supermemory"), { recursive: true });
    writeFileSync(join(tmp, ".config", "omp-supermemory", "config.json"), "{not json");
    expect(loadConfig({}, tmp).apiKey).toBeUndefined();
  });
});

describe("userTag", () => {
  test("hashes USER", () => {
    expect(userTag({ USER: "alice" })).toBe("omp_user_" + sha16("alice"));
  });
});

describe("projectTag", () => {
  test("stable across subdirs of the same git root", () => {
    const root = join(tmp, "My-Repo.v2");
    mkdirSync(join(root, ".git"), { recursive: true });
    mkdirSync(join(root, "a", "b"), { recursive: true });
    const expected = "omp_project_my_repo_v2_" + sha16(root);
    expect(projectTag(root)).toBe(expected);
    expect(projectTag(join(root, "a", "b"))).toBe(expected);
  });

  test("without git, uses cwd", () => {
    const dir = join(tmp, "plain");
    mkdirSync(dir);
    expect(projectTag(dir)).toBe("omp_project_plain_" + sha16(dir));
  });
});
