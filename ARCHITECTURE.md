# PlainSync architecture

## Product invariant

Markdown is the portable document format. A PlainSync document must remain useful after all PlainSync-specific metadata is removed.

## Current alpha

```text
Browser editor
  ├── local documents → browser storage
  ├── import/export   → normal .md files
  └── shared document API
        ├── Cloudflare → D1
        └── Node/VPS   → atomic /data/documents.json
```

The client uses optimistic revisions. Every update includes its expected revision. A stale update receives the latest server copy and the interface asks the user which version to retain. No change is silently overwritten.

## Runtime boundaries

- `app/plainsync-editor.tsx`: editor, preview, file import/export, PWA install, and sync client.
- `app/api/documents`: small HTTP document API.
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

## Collaboration direction

The next collaboration layer will represent the exact Markdown source as `Y.Text`. Comments and suggestions will live outside the Markdown and use Yjs relative positions plus text-quote fallbacks. Durable stores will materialize both compacted Yjs state and readable Markdown snapshots.

Git will be an import/publish boundary, not the real-time database. Agent operations will require an expected revision and record actor, session, source, and reason.

## Security boundaries

- Markdown rendering is sanitized before it reaches the page.
- Shared keys are stored as SHA-256 hashes.
- API writes require the edit key and an expected revision.
- Content is limited to 1 MB during the alpha.
- Local drafts are explicitly device-local.
- Telemetry is absent and disabled by design.
