import { describe, expect, test } from "bun:test";
import { SupermemoryClient, SupermemoryError } from "../src/client";

interface Call {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: unknown;
}

function mock(status: number, payload: unknown) {
  const calls: Call[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string),
    });
    return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
  return { calls, client: new SupermemoryClient({ apiKey: "sk-test", baseUrl: "https://sm.test", fetch: fakeFetch }) };
}

const headers = { Authorization: "Bearer sk-test", "Content-Type": "application/json" };

function sequence(responses: { status: number; payload: string | null }[]) {
  const calls: Call[] = [];
  let i = 0;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers as Record<string, string>,
      body: init.body === undefined ? undefined : JSON.parse(init.body as string),
    });
    const r = responses[i++]!;
    return new Response(r.payload, { status: r.status });
  }) as unknown as typeof fetch;
  return {
    calls,
    client: new SupermemoryClient({
      apiKey: "sk-test",
      baseUrl: "https://sm.test",
      fetch: fakeFetch,
      retryDelaysMs: [0, 0, 0, 0],
    }),
  };
}

describe("SupermemoryClient", () => {
  test("search posts to /v4/search and maps memory/chunk", async () => {
    const { calls, client } = mock(200, {
      results: [
        { id: "m1", memory: "likes tabs", similarity: 0.9, updatedAt: "2026-01-01" },
        { id: "m2", chunk: "a chunk", similarity: 0.7, documents: [{ id: "doc-9" }, { id: "doc-10" }] },
        { id: "m3", similarity: 0.65 },
      ],
    });
    const hits = await client.search("indent", "tag1", { limit: 3, threshold: 0.5 });
    expect(calls).toEqual([
      {
        url: "https://sm.test/v4/search",
        method: "POST",
        headers,
        body: { q: "indent", containerTag: "tag1", limit: 3, threshold: 0.5, searchMode: "hybrid" },
      },
    ]);
    expect(hits).toEqual([
      { id: "m1", text: "likes tabs", similarity: 0.9, updatedAt: "2026-01-01", documentId: undefined },
      { id: "m2", text: "a chunk", similarity: 0.7, updatedAt: undefined, documentId: "doc-9" },
      { id: "m3", text: "", similarity: 0.65, updatedAt: undefined, documentId: undefined },
    ]);
  });

  test("profile posts to /v4/profile", async () => {
    const { calls, client } = mock(200, { profile: { static: ["a"], dynamic: ["b", "c"] } });
    const p = await client.profile("tag1", "hello");
    expect(calls[0]).toEqual({
      url: "https://sm.test/v4/profile",
      method: "POST",
      headers,
      body: { containerTag: "tag1", q: "hello" },
    });
    expect(p).toEqual({ static: ["a"], dynamic: ["b", "c"] });
  });

  test("add posts to /v3/documents", async () => {
    const { calls, client } = mock(200, { id: "doc1", status: "queued" });
    const r = await client.add("content", "tag1", { customId: "cid", metadata: { source: "omp", n: 2 } });
    expect(calls[0]).toEqual({
      url: "https://sm.test/v3/documents",
      method: "POST",
      headers,
      body: { content: "content", containerTag: "tag1", customId: "cid", metadata: { source: "omp", n: 2 } },
    });
    expect(r).toEqual({ id: "doc1" });
  });

  test("forget sends DELETE /v4/memories with body", async () => {
    const { calls, client } = mock(200, {});
    await client.forget("m1", "tag1");
    expect(calls).toEqual([
      {
        url: "https://sm.test/v4/memories",
        method: "DELETE",
        headers,
        body: { id: "m1", containerTag: "tag1" },
      },
    ]);
  });

  test("forget falls back to DELETE /v3/documents/{id} on 404 and accepts 204", async () => {
    const { calls, client } = sequence([
      { status: 404, payload: "Memory not found" },
      { status: 204, payload: null },
    ]);
    await client.forget("doc/1 x", "tag1");
    expect(calls).toEqual([
      {
        url: "https://sm.test/v4/memories",
        method: "DELETE",
        headers,
        body: { id: "doc/1 x", containerTag: "tag1" },
      },
      { url: "https://sm.test/v3/documents/doc%2F1%20x", method: "DELETE", headers, body: undefined },
    ]);
  });

  test("forget rethrows non-404 errors without fallback", async () => {
    const { calls, client } = sequence([{ status: 500, payload: "boom" }]);
    const err = await client.forget("m1", "tag1").catch(e => e);
    expect(err).toBeInstanceOf(SupermemoryError);
    expect(err.status).toBe(500);
    expect(calls.map(c => c.url)).toEqual(["https://sm.test/v4/memories"]);
  });

  test("forget surfaces failure of the document-delete fallback", async () => {
    const { calls, client } = sequence([
      { status: 404, payload: "Memory not found" },
      { status: 404, payload: "Document not found" },
    ]);
    const err = await client.forget("x", "tag1").catch(e => e);
    expect(err).toBeInstanceOf(SupermemoryError);
    expect(err.status).toBe(404);
    expect(err.message).toContain("Document not found");
    expect(calls.map(c => c.url)).toEqual(["https://sm.test/v4/memories", "https://sm.test/v3/documents/x"]);
  });

  test("forget retries the document delete on 409 until it succeeds", async () => {
    const { calls, client } = sequence([
      { status: 404, payload: "Memory not found" },
      { status: 409, payload: "Document is still processing" },
      { status: 409, payload: "Document is still processing" },
      { status: 204, payload: null },
    ]);
    await client.forget("d1", "tag1");
    expect(calls).toEqual([
      { url: "https://sm.test/v4/memories", method: "DELETE", headers, body: { id: "d1", containerTag: "tag1" } },
      { url: "https://sm.test/v3/documents/d1", method: "DELETE", headers, body: undefined },
      { url: "https://sm.test/v3/documents/d1", method: "DELETE", headers, body: undefined },
      { url: "https://sm.test/v3/documents/d1", method: "DELETE", headers, body: undefined },
    ]);
  });

  test("forget throws 409 after 5 attempts", async () => {
    const processing = { status: 409, payload: "Document is still processing" };
    const { calls, client } = sequence([
      { status: 404, payload: "Memory not found" },
      processing,
      processing,
      processing,
      processing,
      processing,
    ]);
    const err = await client.forget("d1", "tag1").catch(e => e);
    expect(err).toBeInstanceOf(SupermemoryError);
    expect(err.status).toBe(409);
    expect(calls.map(c => c.url)).toEqual([
      "https://sm.test/v4/memories",
      "https://sm.test/v3/documents/d1",
      "https://sm.test/v3/documents/d1",
      "https://sm.test/v3/documents/d1",
      "https://sm.test/v3/documents/d1",
      "https://sm.test/v3/documents/d1",
    ]);
  });

  test("forget does not retry a 500 from the document delete", async () => {
    const { calls, client } = sequence([
      { status: 404, payload: "Memory not found" },
      { status: 500, payload: "boom" },
    ]);
    const err = await client.forget("d1", "tag1").catch(e => e);
    expect(err.status).toBe(500);
    expect(calls.map(c => c.url)).toEqual(["https://sm.test/v4/memories", "https://sm.test/v3/documents/d1"]);
  });

  test("forget abort cancels the 409 backoff wait", async () => {
    let n = 0;
    const ac = new AbortController();
    const client = new SupermemoryClient({
      apiKey: "sk-test",
      baseUrl: "https://sm.test",
      fetch: (async () => {
        n++;
        ac.abort(new Error("stop"));
        return new Response("Document is still processing", { status: 409 });
      }) as unknown as typeof fetch,
      retryDelaysMs: [60_000],
    });
    const err = await client.forget("d1", "tag1", ac.signal).catch(e => e);
    expect(err.message).toBe("stop");
    expect(n).toBe(1);
  });

  test("non-2xx throws SupermemoryError with status and body", async () => {
    const { client } = mock(401, "bad key");
    const err = await client.search("q", "t").catch(e => e);
    expect(err).toBeInstanceOf(SupermemoryError);
    expect(err.status).toBe(401);
    expect(err.message).toContain("bad key");
  });

  test("trailing slash in baseUrl is normalized", async () => {
    const calls: string[] = [];
    const client = new SupermemoryClient({
      apiKey: "k",
      baseUrl: "https://sm.test/",
      fetch: (async (url: string) => {
        calls.push(url);
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    await client.search("q", "t");
    expect(calls).toEqual(["https://sm.test/v4/search"]);
  });
});
