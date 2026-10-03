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

## Next
- [ ] Smoke test against hosted api.supermemory.ai account
- [ ] Verify symlink and `config.yml` install paths on a clean omp
- [ ] Retry `forget` on 409 while a document is still processing

## Later
- [ ] Native `memory.backend: supermemory` in omp fork (`Ansh-Sonkusare/oh-my-pi`, branch `feat/supermemory-memory-backend`); upstream PR pending owner
- [ ] Inject memory context on compaction
- [ ] Redact secrets from transcripts before capture
- [ ] Per-user opt-out tags
