# Handoff

Snapshot: 2026-10-04. Both repositories are clean and pushed; nothing is in flight.

## Repositories

| Repo | Branch | Head | State |
|---|---|---|---|
| https://github.com/Ansh-Sonkusare/omp-supermemory (local `~/omp-supermemory`) | `main` | `caeb2a3` | 52 tests pass, `tsc` clean |
| https://github.com/Ansh-Sonkusare/oh-my-pi (local `~/omp-fork`) | `feat/supermemory-memory-backend` | `65c7793` | `tsgo` + `oxlint` clean; supermemory, redaction, hindsight and memory-backend suites pass (110 tests) |

The fork's native addon is not built from source. `packages/natives/native/pi_natives.darwin-arm64.node` was copied from the npm package `@oh-my-pi/pi-natives-darwin-arm64@18.6.0` (gitignored). Repeat that after a fresh clone, or Settings imports fail at load.

## Done

- Extension: first-prompt recall, per-session capture (`customId` upsert), `supermemory_search` / `supermemory_add` / `supermemory_forget`, `/supermemory status|search|add`, hybrid search, forget fallback to document delete, 409 retry (1/2/4/8 s, abortable), secret redaction (incl. PEM blocks and Bearer tokens) on every upload, professional README covering Supermemory Cloud and self-hosted.
- Fork: `memory.backend: supermemory` backed by omp's `recall` / `retain` / `learn` tools, settings + UI, docs (`docs/memory.md`, `docs/environment-variables.md`), recall prompt gates `reflect` / `memory_edit`.
- Verified end to end in real omp (extension) and in the fork's CLI against self-hosted supermemory-server with Ollama.
- GitHub secret-scanning alerts 1 and 2 resolved as `used_in_tests`; fixtures now assembled at runtime. Old literals remain in history (fake values; no rotation needed).
- Worker anti-stall rules recorded in `~/.omp/agent/RULES.md` and `~/.omp/agent/agents/poteto-worker.md`; `task.maxEffort` saved as `high`.

## Upstream status (decision pending)

- Do not open an issue: upstream `CONTRIBUTING.md` says not to file issues for work you are about to submit (their bot picks them up).
- An open PR already covers this: https://github.com/can1357/oh-my-pi/pull/6378 (panosAthDBX, +8.4k lines, 50 files, prior discussion https://github.com/can1357/oh-my-pi/discussions/5710). A second PR would likely be closed as a duplicate.
- Options: (A) comment on #6378 offering our pieces (409 retry, PEM/Bearer redaction) or the smaller branch; (B) ask on their Discord first; (C) submit anyway. Any PR body needs at least one sentence written by the owner. No AI attribution in commits or descriptions (verified none exists today).
- Related issue for an extension-pluggable backend API: https://github.com/can1357/oh-my-pi/issues/7902.

## Next task (was in progress, nothing written yet)

Close the extension's gaps relative to #6378, then document the remainder. Planned split, three parallel workers, disjoint files:

1. `src/client.ts`, `src/config.ts`, `src/format.ts` + tests
   - `clearContainer(tag)` → `DELETE /v3/documents/bulk` with `{containerTags:[tag]}`, returns `{deletedCount}`.
   - `configError` when `baseUrl` is plaintext `http:` to a non-loopback host (allow `localhost`, `127.0.0.0/8`, `::1`; `host.docker.internal` is not loopback). Treat as unconfigured.
   - Escape `& < >` in recalled text; wrapper states content is untrusted data. New `formatCompactionContext(...)` returning escaped bullet lines.
2. `src/index.ts` + `test/index.test.ts`
   - `pi.on("session.compacting", ...)` returns `{ context: string[] }` from profile + both searches (main agent only).
   - `/supermemory clear [user|project]` behind `ctx.ui.confirm`.
   - `/supermemory capture` force-uploads the latest transcript.
   - `/supermemory status` adds a live probe (`profile` with a 5 s timeout).
3. `docs/COMPARISON.md` (new; extension vs fork vs #6378 table, "gaps an extension cannot close", recommendation), README section linking to it, `docs/TODO.md` update.

Native-only gaps that stay documented, not fixed: `/memory` command integration, built-in `recall`/`retain` tools, subagent memory sharing, prompt-admission / retry / transcript-replacement safety, SDK-restricted sessions.

## Still untested

- Hosted `api.supermemory.ai` (needs an API key).
- Symlink and `config.yml` install methods on a clean omp.
- `qwen2.5:1.5b` through `supermemory-server` (it wraps JSON in a markdown fence; may fail strict parsing).

## Local environment

- Self-hosted server: `/tmp/smdocker` was a temporary clone of https://github.com/Ansh-Sonkusare/supermemory-docker; re-clone if `/tmp` was cleared. `.env` used `OPENAI_BASE_URL=http://host.docker.internal:11434/v1`. Start with `docker compose up -d --build` (OrbStack: `orb start`). Key: `docker compose exec -T supermemory cat /data/api-key`. Recommended `SUPERMEMORY_THRESHOLD=0.3` locally.
- Ollama models on disk: `qwen2.5:7b` (4.7 GB), `qwen2.5:1.5b` (986 MB, Q4_K_M; ~0.8 s vs ~2.6 s per extraction, coarser facts). Use 1.5b for tests.
- Port 8787 is taken by the headroom proxy; the mock server (`scripts/mock-server.ts`) defaults to 8787, so pass another port (e.g. `18787`).
- All services (Supermemory container, Ollama, mock) are stopped.
