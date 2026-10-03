import { basename } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { SupermemoryClient, type MemoryHit } from "./client";
import { loadConfig as realLoadConfig, projectTag, userTag, type SupermemoryConfig } from "./config";
import { formatRecall, transcriptFromMessages } from "./format";
import { redactMemorySecrets } from "./redact";

type ClientLike = Pick<SupermemoryClient, "search" | "profile" | "add" | "forget">;

export interface Deps {
  loadConfig?: () => SupermemoryConfig;
  makeClient?: (cfg: SupermemoryConfig & { apiKey: string }) => ClientLike;
}

const NO_KEY =
  "Supermemory is not configured: set SUPERMEMORY_API_KEY (or write {\"apiKey\": \"...\"} to ~/.config/omp-supermemory/config.json) and restart omp.";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const lines = (label: string, hits: MemoryHit[]) =>
  hits.map((h) => `- [${label}] ${h.documentId ?? h.id}: ${h.text} (similarity ${h.similarity.toFixed(2)})`);

export function createExtension(deps: Deps = {}) {
  return function omp_supermemory(pi: ExtensionAPI): void {
    const cfg = (deps.loadConfig ?? realLoadConfig)();
    const client: ClientLike | undefined = cfg.apiKey
      ? (deps.makeClient ?? ((c) => new SupermemoryClient(c)))({ ...cfg, apiKey: cfg.apiKey })
      : undefined;

    const recalled = new Set<string>();
    const turns = new Map<string, number>();
    let warnedNoKey = false;
    let captureFailed = false;

    const tagFor = (scope: "user" | "project", cwd: string) => (scope === "user" ? userTag() : projectTag(cwd));
    const text = (t: string, details: Record<string, unknown> = {}) => ({
      content: [{ type: "text" as const, text: t }],
      details,
    });

    pi.on("session_start", async (_event, ctx) => {
      if (client || warnedNoKey) return;
      warnedNoKey = true;
      ctx.ui.notify(NO_KEY, "warning");
    });

    pi.on("before_agent_start", async (event, ctx) => {
      if (!client || !cfg.autoRecall || ctx.agent.kind === "sub") return;
      const sessionId = ctx.sessionManager.getSessionId();
      if (recalled.has(sessionId)) return;
      recalled.add(sessionId);

      const opts = { limit: cfg.recallLimit, threshold: cfg.similarityThreshold };
      const [profile, userHits, projectHits] = await Promise.allSettled([
        client.profile(userTag(), event.prompt),
        client.search(event.prompt, userTag(), opts),
        client.search(event.prompt, projectTag(ctx.cwd), opts),
      ]);
      const recall = formatRecall({
        profile: profile.status === "fulfilled" ? profile.value : { static: [], dynamic: [] },
        userHits: userHits.status === "fulfilled" ? userHits.value : [],
        projectHits: projectHits.status === "fulfilled" ? projectHits.value : [],
      });
      if (!recall) return;
      return { message: { customType: "omp-supermemory.recall", content: recall, display: false } };
    });

    pi.on("agent_end", async (event, ctx) => {
      if (!client || ctx.agent.kind === "sub" || event.willContinue || cfg.captureEveryNTurns <= 0) return;
      const sessionId = ctx.sessionManager.getSessionId();
      const n = (turns.get(sessionId) ?? 0) + 1;
      turns.set(sessionId, n);
      if (n % cfg.captureEveryNTurns !== 0) return;
      const transcript = transcriptFromMessages(event.messages);
      if (!transcript) return;
      client
        .add(redactMemorySecrets(transcript), projectTag(ctx.cwd), {
          customId: `omp_session_${sessionId}`,
          metadata: { source: "omp", sessionId, project: basename(ctx.cwd) },
        })
        .catch((e: unknown) => {
          if (captureFailed) return;
          captureFailed = true;
          ctx.ui.notify(`Supermemory capture failed: ${errText(e)}`, "warning");
        });
    });

    pi.registerTool({
      name: "supermemory_search",
      label: "Supermemory Search",
      description: "Search persistent memory (user-wide and/or this project) for relevant past context.",
      parameters: pi.zod.object({
        query: pi.zod.string().describe("What to look for"),
        scope: pi.zod.enum(["user", "project", "both"]).optional().describe("Default: both"),
        limit: pi.zod.number().optional().describe("Max results per scope"),
      }),
      async execute(_id, params: { query: string; scope?: "user" | "project" | "both"; limit?: number }, signal, _onUpdate, ctx) {
        if (!client) return text(NO_KEY);
        const scope = params.scope ?? "both";
        const opts = { limit: params.limit ?? cfg.recallLimit, threshold: cfg.similarityThreshold, signal };
        const scopes = scope === "both" ? (["user", "project"] as const) : ([scope] as const);
        const results = await Promise.all(scopes.map((s) => client.search(params.query, tagFor(s, ctx.cwd), opts)));
        const out = scopes.flatMap((s, i) => lines(s, results[i]));
        return text(out.length ? out.join("\n") : "No matching memories.", { count: out.length });
      },
    });

    pi.registerTool({
      name: "supermemory_add",
      label: "Supermemory Add",
      description: "Save a fact or note to persistent memory (project scope by default).",
      parameters: pi.zod.object({
        content: pi.zod.string().describe("The memory to store"),
        scope: pi.zod.enum(["user", "project"]).optional().describe("Default: project"),
      }),
      async execute(_id, params: { content: string; scope?: "user" | "project" }, signal, _onUpdate, ctx) {
        if (!client) return text(NO_KEY);
        const scope = params.scope ?? "project";
        const { id } = await client.add(redactMemorySecrets(params.content), tagFor(scope, ctx.cwd), { signal });
        return text(`Saved to ${scope} memory (id: ${id}).`, { id, scope });
      },
    });

    pi.registerTool({
      name: "supermemory_forget",
      label: "Supermemory Forget",
      description: "Delete a memory by id (id from supermemory_search results).",
      parameters: pi.zod.object({
        id: pi.zod.string().describe("Memory id"),
        scope: pi.zod.enum(["user", "project"]).describe("Scope the memory lives in"),
      }),
      async execute(_id, params: { id: string; scope: "user" | "project" }, signal, _onUpdate, ctx) {
        if (!client) return text(NO_KEY);
        await client.forget(params.id, tagFor(params.scope, ctx.cwd), signal);
        return text(`Forgot ${params.scope} memory ${params.id}.`, { id: params.id, scope: params.scope });
      },
    });

    pi.registerCommand("supermemory", {
      description: "Supermemory: status | search <query> | add <text>",
      async handler(args, ctx) {
        const [sub = "", ...rest] = args.trim().split(/\s+/);
        const arg = rest.join(" ");
        if (sub === "status") {
          ctx.ui.notify(
            [
              `API key: ${cfg.apiKey ? "set" : "missing"}`,
              `Base URL: ${cfg.baseUrl}`,
              `User tag: ${userTag()}`,
              `Project tag: ${projectTag(ctx.cwd)}`,
            ].join("\n"),
            "info",
          );
          return;
        }
        if (sub !== "search" && sub !== "add") {
          ctx.ui.notify("Usage: /supermemory status | search <query> | add <text>", "info");
          return;
        }
        if (!client) return ctx.ui.notify(NO_KEY, "error");
        if (!arg) return ctx.ui.notify(`Usage: /supermemory ${sub} <${sub === "add" ? "text" : "query"}>`, "info");
        try {
          if (sub === "add") {
            const { id } = await client.add(redactMemorySecrets(arg), projectTag(ctx.cwd));
            ctx.ui.notify(`Saved to project memory (id: ${id}).`, "info");
            return;
          }
          const opts = { limit: cfg.recallLimit, threshold: cfg.similarityThreshold };
          const [u, p] = await Promise.all([
            client.search(arg, userTag(), opts),
            client.search(arg, projectTag(ctx.cwd), opts),
          ]);
          const out = [...lines("user", u), ...lines("project", p)];
          ctx.ui.notify(out.length ? out.join("\n") : "No matching memories.", "info");
        } catch (e) {
          ctx.ui.notify(`Supermemory error: ${errText(e)}`, "error");
        }
      },
    });
  };
}

export default createExtension();
