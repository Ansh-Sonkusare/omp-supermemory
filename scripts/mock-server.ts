// Local stand-in for api.supermemory.ai so the extension can be smoke-tested inside real omp without an API key.
// Usage: bun scripts/mock-server.ts [port]  then  SUPERMEMORY_API_URL=http://127.0.0.1:<port> SUPERMEMORY_API_KEY=test omp ...
const port = Number(process.argv[2] ?? 8787);
const docs = new Map<string, { id: string; content: string; containerTag: string }>();
const log: unknown[] = [];

Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		if (url.pathname === "/_log") return Response.json(log);
		const body = req.method === "GET" ? null : await req.json().catch(() => null);
		log.push({ method: req.method, path: url.pathname, auth: req.headers.get("authorization"), body });
		if (url.pathname === "/v3/documents" && req.method === "POST") {
			const id = body.customId ?? crypto.randomUUID();
			docs.set(id, { id, content: body.content, containerTag: body.containerTag });
			return Response.json({ id, status: "queued" });
		}
		if (url.pathname === "/v4/search") {
			const results = [...docs.values()]
				.filter(d => d.containerTag === body.containerTag)
				.map(d => ({ id: d.id, memory: d.content.slice(0, 200), similarity: 0.9, updatedAt: "2026-10-04T00:00:00Z", metadata: null }));
			return Response.json({ results, timing: 1, total: results.length });
		}
		if (url.pathname === "/v4/profile") {
			return Response.json({ profile: { static: ["Prefers Bun over Node"], dynamic: ["Building omp-supermemory"] } });
		}
		if (url.pathname === "/v4/memories" && req.method === "DELETE") {
			docs.delete(body.id);
			return Response.json({ id: body.id, forgotten: true });
		}
		return new Response("not found", { status: 404 });
	},
});
console.log(`mock supermemory listening on ${port}`);
