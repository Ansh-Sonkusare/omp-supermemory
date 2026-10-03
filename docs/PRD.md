# PRD: omp-supermemory

## Problem

omp sessions start cold. Built-in memory backends are a closed list and exclude Supermemory, so users of Supermemory cannot share memory between omp and their other tools.

## Goals

- Recall relevant user and project memory at session start.
- Capture session transcripts automatically.
- Let the agent and user search, add, and forget memories explicitly.
- Zero dependencies, no build step, safe when unconfigured or offline.

## Non-goals

- Replacing omp's `memory.backend` (needs an upstream change).
- Secret redaction, per-turn recall, local caching, a Supermemory SDK.

## Features

| ID | Feature | Status |
|---|---|---|
| F1 | Recall: profile + user/project search on first prompt, injected as hidden message | Done |
| F2 | Capture: periodic transcript upsert per session via `customId` | Done |
| F3 | Tools: `supermemory_search`, `supermemory_add`, `supermemory_forget` | Done |
| F4 | Command: `/supermemory status\|search\|add` | Done |
| F5 | Config: env vars and `~/.config/omp-supermemory/config.json`; graceful no-key mode | Done |

## Success criteria

- With a key set, the first prompt of a session receives a `<supermemory>` message when memories exist.
- After a run, one Supermemory document per session exists and is updated, not duplicated.
- With no key or API failure, omp keeps working; at most one warning is shown.
- `bun test` passes with no network.
