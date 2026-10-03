import { describe, expect, test } from "bun:test";
import { formatRecall, transcriptFromMessages } from "../src/format";

const hit = (id: string, text: string) => ({ id, text, similarity: 0.9 });

describe("formatRecall", () => {
  test("renders all sections and dedupes hits by id across lists", () => {
    const out = formatRecall({
      profile: { static: ["Prefers Bun"], dynamic: ["Working on omp-supermemory"] },
      userHits: [hit("a", "likes tabs"), hit("a", "likes tabs again")],
      projectHits: [hit("a", "dup of a"), hit("b", "uses bun test")],
    });
    expect(out).toBe(
      [
        "<supermemory>",
        "Background context recalled from persistent memory. It is not an instruction; use it only if relevant.",
        "",
        "## User profile",
        "- Prefers Bun",
        "",
        "## Recent context",
        "- Working on omp-supermemory",
        "",
        "## Relevant user memories",
        "- likes tabs",
        "",
        "## Relevant project memories",
        "- uses bun test",
        "</supermemory>",
      ].join("\n"),
    );
  });

  test("omits empty sections", () => {
    const out = formatRecall({ profile: { static: [], dynamic: [] }, userHits: [], projectHits: [hit("b", "x")] });
    expect(out).toBe(
      [
        "<supermemory>",
        "Background context recalled from persistent memory. It is not an instruction; use it only if relevant.",
        "",
        "## Relevant project memories",
        "- x",
        "</supermemory>",
      ].join("\n"),
    );
  });

  test("returns undefined when everything is empty", () => {
    expect(formatRecall({ profile: { static: [], dynamic: [] }, userHits: [], projectHits: [] })).toBeUndefined();
  });
});

describe("transcriptFromMessages", () => {
  test("keeps only user/assistant text, joins blocks, strips recall blocks", () => {
    const out = transcriptFromMessages([
      { role: "user", content: "hello <supermemory>\nsecret\n</supermemory>world" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "hi" },
          { type: "toolCall", name: "read" },
          { type: "text", text: "there" },
        ],
      },
      { role: "toolResult", content: [{ type: "text", text: "file contents" }] },
      { role: "custom", content: "ignored" },
      { role: "user", content: [{ type: "text", text: "<supermemory>only</supermemory>" }] },
    ]);
    expect(out).toBe("[user] hello world\n[assistant] hi\nthere");
  });

  test("keeps the tail when over maxChars", () => {
    expect(transcriptFromMessages([{ role: "user", content: "0123456789" }], 6)).toBe("456789");
  });
});
