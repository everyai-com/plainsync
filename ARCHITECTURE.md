# PlainSync architecture

## Product invariant

Markdown is the portable document format. A PlainSync document must remain useful after all PlainSync-specific metadata is removed.

## Current alpha

```text
Browser editor
  ├── local documents → browser storage
  ├── import/export   → normal .md files
  └── shared document API
        ├── Yjs updates + durable presence
        ├── role-scoped invitation keys
        ├── comments + relative anchors
        ├── automatic and named history
        ├── Cloudflare → D1
        └── Node/VPS   → atomic /data/documents.json
```

Interactive editors exchange Yjs updates, which merge concurrent Markdown edits without a last-write-wins conflict. The readable Markdown source is materialized on every accepted update and receives a monotonic revision. REST replacements still require an expected revision, which gives scripts and agents a simple stale-write guard.

## Runtime boundaries

- `app/plainsync-editor.tsx`: editor, preview, file import/export, PWA install, and sync client.
- `app/api/documents`: document, CRDT sync, history, and comment APIs.
- `db/documents.ts`: portable persistence boundary with D1 and Node adapters.
- `db/schema.ts`: relational schema used for generated Cloudflare migrations.
- `worker/index.ts`: Cloudflare Worker entry point.
- `public/sw.js`: offline application shell, never an authority for shared records.

## Planned packages

As the API stabilizes, the codebase will be extracted without changing the reference application's behavior:

```text
packages/core           document operations and revisions
packages/editor         embeddable React/CodeMirror editor
packages/collaboration  Yjs state, awareness, and annotations
packages/client         browser and Node SDK
packages/cli            filesystem watching and Git workflows
packages/mcp            agent-safe resources and tools
```

## Collaboration model

The exact Markdown source is represented as `Y.Text`. The server compacts Yjs state while materializing readable Markdown and version snapshots. Comments live outside the Markdown and store Yjs relative positions plus text-quote fallbacks, keeping exports clean and anchors resilient.

The current transport exchanges compact updates over HTTP polling so Cloudflare and single-container VPS installs need no separate WebSocket service. The transport is replaceable; the persisted Yjs model is not tied to polling.

Git will be an import/publish boundary, not the real-time database. Agent replacements require an expected revision and history records their actor label.

## Security boundaries

- Markdown rendering is sanitized before it reaches the page.
- Shared keys are stored as SHA-256 hashes.
- CRDT writes require an editor key; REST replacements also require an expected revision.
- Commenter keys can add comments but cannot alter Markdown or resolve threads.
- Read-only keys cannot alter documents or comments.
- Content is limited to 1 MB during the alpha.
- Local drafts are explicitly device-local.
- Telemetry is absent and disabled by design.
