# TODO

## Done
- [x] Config loading (env, config file, tags)
- [x] Supermemory HTTP client (search, profile, add, forget)
- [x] Recall formatting and transcript extraction
- [x] First-prompt recall hook
- [x] Periodic capture hook
- [x] Tools and `/supermemory` command
- [x] Tests with mocked fetch
- [x] Smoke test in real omp against a mock server (`scripts/mock-server.ts`)
- [x] Smoke test in real omp against self-hosted supermemory-server (docker)
- [x] Hybrid search so chunks are recalled without LLM memory extraction
- [x] `forget` falls back to document delete for chunk hits
- [x] Retry `forget` on 409 while a document is still processing (1/2/4/8s backoff, verified live)
- [x] Redact secrets (incl. PEM blocks, bearer tokens) before every upload, in extension and fork
- [x] Fork docs: `SUPERMEMORY_*` env vars; recall prompt gates `reflect`/`memory_edit`

## Next
- [ ] Smoke test against hosted api.supermemory.ai account
- [ ] Verify symlink and `config.yml` install paths on a clean omp

## Later
- [x] Native `memory.backend: supermemory` in omp fork: branch `feat/supermemory-memory-backend` on `Ansh-Sonkusare/oh-my-pi`, verified in the fork CLI against self-hosted server
- [ ] Open upstream PR (owner); ~1,810 added lines across 23 files, so split into client+settings / backend / tools+docs
- [ ] Inject memory context on compaction
- [ ] Per-user opt-out tags
