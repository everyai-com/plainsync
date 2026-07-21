# PlainSync

**The Markdown workspace that humans and AI agents can share.**

[![CI](https://github.com/everyai-com/plainsync/actions/workflows/ci.yml/badge.svg)](https://github.com/everyai-com/plainsync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2e6a51.svg)](LICENSE)
[![Self-host: Cloudflare or Docker](https://img.shields.io/badge/self--host-Cloudflare%20%7C%20Docker-2e6a51.svg)](docs/SELF-HOSTING.md)

PlainSync is an open-source, local-first editor and collaboration server for plain `.md` files. Humans get a calm document interface. Agents get exact Markdown and a revision-aware API. You keep the files, the server, and the deployment.

![PlainSync — Markdown that stays yours](public/og.png)

## The problem

AI agents naturally produce Markdown. Developers keep documentation in Markdown. But most human review happens in rich-text tools such as Google Docs or Notion.

That creates an awkward split:

- Copying between Markdown and rich text breaks formatting and creates stale versions.
- Git is excellent for source control but uncomfortable for many writers, reviewers, and clients.
- Agent output often arrives as a finished blob instead of something a human can comment on safely.
- Commercial editors can lock collaboration, export, or self-hosting behind a hosted plan.
- Teams handling private material may not want their documents on somebody else's service.

PlainSync makes Markdown the shared source of truth. Collaboration metadata—comments, presence, roles, and history—stays around the file instead of replacing it with a proprietary format.

## Why developers use it

| You are building… | PlainSync gives you… |
| --- | --- |
| An AI writing or research product | A review surface where agents write Markdown and humans comment, restore, or export it |
| A docs-as-code workflow | A friendly editor for non-Git collaborators without giving up `.md` files |
| An internal documentation tool | A self-hosted workspace with no required account system or third-party document cloud |
| A release-notes or reporting agent | A revision-aware REST API, named snapshots, and attributable writes |
| A commercial product or client portal | MIT-licensed source you may use, modify, brand, host, and sell |
| A local desktop writing workflow | An installable macOS/Windows PWA whose local drafts stay on the device |

Read [six concrete workflows](docs/USE-CASES.md) or go directly to the [developer integration guide](docs/DEVELOPER-GUIDE.md).

## Use PlainSync three ways

### 1. Run the complete workspace

Use PlainSync as a ready-to-run Markdown editor for your team or community. It includes multiplayer editing, comments, history, role-specific links, preview, import, and export.

```bash
git clone https://github.com/everyai-com/plainsync.git
cd plainsync
npm install
npm run dev
```

Open `http://localhost:3000`. These commands work in macOS Terminal, Windows PowerShell, and Linux shells. Node.js 22 or newer is required.

### 2. Self-host it

On a VPS with Docker:

```bash
docker compose up -d
```

On Cloudflare Workers + D1:

```bash
npm install
npx wrangler login
npm run deploy:cloudflare
```

Both deployments run the same application and API. See [the self-hosting guide](docs/SELF-HOSTING.md) for HTTPS, backups, upgrades, and Windows notes.

### 3. Connect an agent or another application

Create a shared document:

```js
const response = await fetch("https://docs.example.com/api/documents", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Launch brief",
    content: "# Launch brief\n\nDrafted by an agent.\n",
  }),
});

const { document, accessTokens } = await response.json();
```

The response includes separate editor, commenter, and read-only keys. Give agents the least-powerful link they need; use the expected-revision API for safe writes.

PlainSync publishes an OpenAPI description at `/api/openapi`. Continue with the [developer guide](docs/DEVELOPER-GUIDE.md) and [agent API reference](docs/AGENT-API.md).

> PlainSync is currently an application and HTTP API, not a stable drop-in React package. Embeddable `@plainsync/*` packages are planned after the interfaces settle.

## What works today

- Exact GitHub-Flavored Markdown source and sanitized preview
- Open, drag, edit, save, and export normal `.md` files
- Device-local drafts with no account or telemetry
- Conflict-free Yjs collaboration and live presence
- Editor, commenter, and read-only invitation links
- Text-anchored comments with resolve/reopen controls
- Automatic history, named snapshots, and restoration
- Revision-aware REST API and live OpenAPI document
- Installable PWA for macOS and Windows
- Cloudflare Workers + D1 and Docker/VPS deployment

PlainSync is an alpha. Yjs updates currently travel over a small polling transport so Cloudflare and a single-container VPS need no extra real-time service. Authentication accounts, key rotation, suggestion acceptance, Git adapters, CLI watching, SDKs, and MCP tools remain on the [roadmap](ROADMAP.md).

## Design principles

1. **Markdown remains useful everywhere.** Removing PlainSync metadata must still leave a normal document.
2. **Humans and agents are peers.** Both use documented interfaces, visible history, and explicit permissions.
3. **Export is never a premium feature.** Your content is always available as Markdown.
4. **Self-hosting is a product feature.** Cloudflare and an ordinary VPS are supported paths.
5. **Local means local.** A local draft does not leave the device until someone chooses Share.
6. **Commercial use is welcome.** Fork it, embed the API, rebrand it, or build a business with it under MIT.

## Security model

A shared document receives independent random editor, commenter, and read-only keys. The server stores only SHA-256 hashes. Keys stay in the URL fragment and are sent to the API through an authorization header.

Links are bearer capabilities: anyone holding one receives its role. Account-backed membership, expiry, and key rotation are not implemented yet, so PlainSync should not currently hold regulated or highly sensitive documents. Read [SECURITY.md](SECURITY.md) before exposing an instance publicly.

## Architecture

The reference app uses CodeMirror, React, Yjs, and a small document API. Cloudflare stores durable state in D1. The VPS build uses an atomic JSON store in `/data`, so no external database is required.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for runtime boundaries and the package-extraction plan.

## Contributing

There are useful contributions at every level:

- Improve a confusing sentence or add a real integration example.
- Test keyboard, mobile, screen-reader, Windows, or self-hosting behavior.
- Pick a scoped task from [contributor ideas](docs/CONTRIBUTOR-IDEAS.md).
- Help design the CLI, Git adapters, SDK, MCP server, or embeddable packages.

No contributor agreement or signed commit is required. Fork the repository, make a focused change, and open a pull request. The issue and pull-request templates will guide you.

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## License

[MIT](LICENSE). Use PlainSync privately or commercially; modify it, redistribute it, self-host it, rebrand it, or include it in a paid product. Keep the MIT copyright and permission notice with copies of the software.
