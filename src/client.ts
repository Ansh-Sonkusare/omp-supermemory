export interface MemoryHit {
  id: string;
  text: string;
  similarity: number;
  updatedAt?: string;
  documentId?: string;
}

export class SupermemoryError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SupermemoryError";
    this.status = status;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  if (signal?.aborted) {
    reject(signal.reason);
    return promise;
  }
  const onAbort = () => {
    clearTimeout(timer);
    reject(signal!.reason);
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve();
  }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
  return promise;
}

interface ClientConfig {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retryDelaysMs?: number[];
}

export class SupermemoryClient {
  #cfg: ClientConfig;

  constructor(cfg: ClientConfig) {
    this.#cfg = cfg;
  }

  async #request<T>(method: string, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const { apiKey, baseUrl, timeoutMs = 15000 } = this.#cfg;
    const doFetch = this.#cfg.fetch ?? fetch;
    const timeout = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await doFetch(baseUrl.replace(/\/+$/, "") + path, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (e) {
      throw new SupermemoryError(`${method} ${path} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    const text = await res.text();
    if (!res.ok) throw new SupermemoryError(`${method} ${path} -> ${res.status}: ${text}`, res.status);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async search(
    q: string,
    containerTag: string,
    opts: { limit?: number; threshold?: number; signal?: AbortSignal } = {},
  ): Promise<MemoryHit[]> {
    const res = await this.#request<{
      results?: {
        id: string;
        memory?: string;
        chunk?: string;
        similarity: number;
        updatedAt?: string;
        documents?: { id: string }[];
      }[];
    }>(
      "POST",
      "/v4/search",
      { q, containerTag, limit: opts.limit, threshold: opts.threshold, searchMode: "hybrid" },
      opts.signal,
    );
    return (res.results ?? []).map(r => ({
      id: r.id,
      text: r.memory ?? r.chunk ?? "",
      similarity: r.similarity,
      updatedAt: r.updatedAt,
      documentId: r.documents?.[0]?.id,
    }));
  }

  async profile(containerTag: string, q?: string, signal?: AbortSignal): Promise<{ static: string[]; dynamic: string[] }> {
    const res = await this.#request<{ profile?: { static?: string[]; dynamic?: string[] } }>(
      "POST",
      "/v4/profile",
      { containerTag, q },
      signal,
    );
    return { static: res.profile?.static ?? [], dynamic: res.profile?.dynamic ?? [] };
  }

  async add(
    content: string,
    containerTag: string,
    opts: { customId?: string; metadata?: Record<string, string | number | boolean>; signal?: AbortSignal } = {},
  ): Promise<{ id: string }> {
    const res = await this.#request<{ id: string }>(
      "POST",
      "/v3/documents",
      { content, containerTag, customId: opts.customId, metadata: opts.metadata },
      opts.signal,
    );
    return { id: res.id };
  }

  async forget(id: string, containerTag: string, signal?: AbortSignal): Promise<void> {
    try {
      await this.#deleteRetrying409("/v4/memories", { id, containerTag }, signal);
    } catch (e) {
      // Hybrid search returns chunks whose id is a document-chunk id, not a memory id.
      if (!(e instanceof SupermemoryError) || e.status !== 404) throw e;
      await this.#deleteRetrying409(`/v3/documents/${encodeURIComponent(id)}`, undefined, signal);
    }
  }

  // 409 means the server is still processing the document; wait and retry.
  async #deleteRetrying409(path: string, body: unknown, signal?: AbortSignal): Promise<void> {
    const delays = this.#cfg.retryDelaysMs ?? [1000, 2000, 4000, 8000];
    for (let attempt = 0; ; attempt++) {
      try {
        await this.#request("DELETE", path, body, signal);
        return;
      } catch (e) {
        if (!(e instanceof SupermemoryError) || e.status !== 409 || attempt >= delays.length) throw e;
      }
      await sleep(delays[attempt]!, signal);
    }
  }
}
