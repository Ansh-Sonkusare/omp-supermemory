# omp-supermemory

An [oh-my-pi](https://github.com/can1357/oh-my-pi) (`omp`) extension that gives the agent persistent memory backed by [Supermemory](https://supermemory.ai).

## Why

omp's `memory.backend` accepts only `off`, `local`, `hindsight`, `mnemopi`, `sharpshooter`. The list is hardcoded and not pluggable, and none of them use Supermemory. This extension hooks the agent lifecycle instead.

## Install

Clone, then use one of:

```sh
git clone https://github.com/Ansh-Sonkusare/omp-supermemory ~/omp-supermemory
cd ~/omp-supermemory && bun install
```

1. Config: in `~/.omp/agent/config.yml`
   ```yaml
   extensions:
     - ~/omp-supermemory
   ```
2. Symlink: `ln -s ~/omp-supermemory ~/.omp/agent/extensions/omp-supermemory`
3. One-off: `omp -e ~/omp-supermemory`

## Configuration

API key: `SUPERMEMORY_API_KEY`, or `{"apiKey": "..."}` in `~/.config/omp-supermemory/config.json`.

| Variable | Default | Meaning |
|---|---|---|
| `SUPERMEMORY_API_KEY` | none | API key (required) |
| `SUPERMEMORY_API_URL` | `https://api.supermemory.ai` | API base URL |
| `SUPERMEMORY_RECALL_LIMIT` | `5` | Max hits per search |
| `SUPERMEMORY_THRESHOLD` | `0.6` | Minimum similarity |
| `SUPERMEMORY_CAPTURE_EVERY` | `1` | Capture every N turns; `0` disables |
| `SUPERMEMORY_AUTO_RECALL` | `true` | `false` disables recall |

Without a key the extension loads, tools return a setup message, and no network calls are made.

## Self-hosting

Run Supermemory locally with [supermemory-docker](https://github.com/Ansh-Sonkusare/supermemory-docker):

```sh
git clone https://github.com/Ansh-Sonkusare/supermemory-docker && cd supermemory-docker
echo 'OPENAI_API_KEY=sk-...' > .env   # any one LLM provider, or an OpenAI-compatible local endpoint
docker compose up -d --build
export SUPERMEMORY_API_URL=http://127.0.0.1:6767
export SUPERMEMORY_API_KEY=$(docker compose exec -T supermemory cat /data/api-key)
```

Fully local (no hosted LLM): point the server at Ollama or `llama-server` (llama.cpp), both OpenAI-compatible. Tested with `qwen2.5:7b`:

```sh
# .env
OPENAI_API_KEY=dummy
OPENAI_BASE_URL=http://host.docker.internal:11434/v1   # llama-server: http://host.docker.internal:8080/v1
OPENAI_MODEL=qwen2.5:7b
```

Notes from testing against `supermemory-server` v0.0.8:

- First request after boot downloads the embedding model (~1 min); recall times out until it finishes.
- Search uses `searchMode: "hybrid"`, so raw document chunks are found even when the server's LLM memory extraction fails or hasn't run yet.
- Local embeddings score lower than the hosted API; `SUPERMEMORY_THRESHOLD=0.3` works better.
- `supermemory_forget` returns `409 Document is still processing` until ingest finalizes; retry after a few seconds.

## How it works

- **Container tags.** User tag `omp_user_<hash of username>` holds cross-project memory. Project tag `omp_project_<dir>_<hash of git root or cwd>` holds per-repo memory.
- **Recall.** On the first prompt of each session (main agent only), the extension fetches the user profile and searches both tags using the prompt. Results are injected as a hidden `<supermemory>` message, framed as background context, not instructions.
- **Capture.** After each agent run (every N turns), the user/assistant text transcript is added to the project tag with `customId = omp_session_<id>`, so later captures update the same document. Tool calls, thinking, and tool results are skipped.

## Tools and command

- `supermemory_search` `{query, scope?: user|project|both, limit?}`
- `supermemory_add` `{content, scope?: user|project}` (default project)
- `supermemory_forget` `{id, scope}`
- `/supermemory status | search <q> | add <text>`

## Privacy

Conversation transcripts are sent to Supermemory's servers. Secrets in transcripts are not redacted yet (see `docs/TODO.md`). Set `SUPERMEMORY_CAPTURE_EVERY=0` to stop capture.

## Development

```sh
bun install
bun test
bun run typecheck
```

See `docs/PRD.md`, `docs/STACK.md`, `docs/TODO.md`. License: MIT.
