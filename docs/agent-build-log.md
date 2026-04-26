# Agent Build Log — Qwen Provider Integration

## Architecture Audit (Phase 0)

**Repo**: Claude Code source (TypeScript/Bun)

**Key files identified:**
- LLM provider: `services/api/client.ts`, `services/api/claude.ts`
- Provider enum: `utils/model/providers.ts` — `APIProvider` type
- Tools: `tools/FileReadTool`, `tools/FileWriteTool`, `tools/FileEditTool`, `tools/BashTool`, `tools/GrepTool`, `tools/GlobTool`
- CLI entry: `main.tsx` (Commander.js + Ink/React)
- Agent loop: `query/` directory

**Decision**: Add Qwen as a self-contained agent entry point (`entrypoints/qwen-agent.ts`) + provider wiring. This avoids modifying Anthropic-specific beta types in `claude.ts` while fully leveraging the existing infrastructure.

---

## Phase 1 — Qwen Provider (DONE)

Files created:
- `services/api/qwen-provider.ts` — OpenAI-compatible Qwen client
- `utils/model/qwen-models.ts` — Qwen model constants

Files modified:
- `utils/model/providers.ts` — added `'qwen'` to `APIProvider`

---

## Phase 2 — Agent Tool Loop (DONE)

Files created:
- `entrypoints/qwen-agent.ts` — Main agent REPL with tool loop

Tools implemented: read_file, write_file, edit_file, list_files, search_text, run_command, git_diff, git_status

---

## Phase 3 — Safety Rules (DONE)

Built into `entrypoints/qwen-agent.ts`:
- git status run before first edit
- read-before-write guard
- no .env printing

---

## Phase 4 — CLI Commands (DONE)

Commands in agent REPL: /init /status /model /config /compact /diff /commit /help

---

## Phase 5 — Timeout Fix (DONE)

- Non-streaming mode via `QWEN_STREAM=false`
- Long outputs written to file
- Response capped at 1000 tokens in chat

---

## Phase 6 — Verification

Run: `npm run build` or `bun run build`
