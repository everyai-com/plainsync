# PlainSync — agent notes

Canonical agent file for this repo. Any harness that reads `AGENTS.md` (Codex,
Cursor, Copilot, Gemini CLI, Zed, Cline, Windsurf, …) gets it directly.

PlainSync gives humans a calm Markdown editor and agents exact Markdown — a
revision-aware REST API, an OpenAPI document, and a desktop app, all on ordinary
`.md` files.

## Commands

```bash
npm install
npm run dev        # local at http://localhost:3000
npm run check      # typecheck + lint + test — run before pushing
npm run build
npm run desktop    # Electron app (workspace: plainsync-desktop)
docker compose up -d
```

## Shape

- `app/` — the Next.js (vinext) app: editor UI + REST routes.
- `worker/` — the Cloudflare Worker deployment path.
- `desktop/` — the `plainsync-desktop` Electron workspace.
- `db/` + `drizzle/` — schema and migrations.
- `docs/AGENT-API.md` — the agent-facing REST API (create/read/update documents,
  comments, roles, history, exports).
- `docs/DEVELOPER-GUIDE.md`, `docs/SELF-HOSTING.md`, `docs/USE-CASES.md`.
- `.openai/hosting.json` — the hosting/control-plane config consumed by
  `build/sites-vite-plugin.ts`; set the D1 binding there.

## Harness support (MCP)

**No MCP server ships yet.** MCP is on the roadmap — `ARCHITECTURE.md` reserves
`packages/mcp` for "agent-safe resources and tools", and `ROADMAP.md` lists MCP
support as planned. Don't document or generate an MCP endpoint until that package
exists.

Today agents integrate over the **REST API** (see `docs/AGENT-API.md`):

- Revision-aware: replacements require an expected revision, so a stale write fails
  instead of clobbering (no last-write-wins).
- Key-scoped: editor / commenter / viewer access tokens are returned per document.
- Every accepted change materializes readable Markdown with a monotonic revision.

## Invariants

- Markdown is the source of truth — never store a document only in a proprietary
  format; round-trip to ordinary `.md`.
- Keep the human and agent surfaces as two views of one document.
- Drafts stay local until shared; don't add a silent upload path.
