# PlainSync

**Markdown for people and AI agents.**

[![CI](https://github.com/everyai-com/plainsync/actions/workflows/ci.yml/badge.svg)](https://github.com/everyai-com/plainsync/actions/workflows/ci.yml)
[![Desktop](https://img.shields.io/github/v/release/everyai-com/plainsync?label=desktop&color=315b9a)](https://github.com/everyai-com/plainsync/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-2e6a51.svg)](LICENSE)

[Use online](https://plainsync-open-markdown.tradephani.chatgpt.site/) · [Download for Mac or Windows](https://github.com/everyai-com/plainsync/releases/latest) · [Self-host](docs/SELF-HOSTING.md) · [Fork the source](https://github.com/everyai-com/plainsync/fork)

PlainSync gives humans a calm document editor and agents exact Markdown. Use the hosted app, install the desktop app, or run the whole stack yourself. Your documents remain ordinary `.md` files.

![PlainSync — Markdown for people and agents](public/og.png)

## Use it your way

| Path | Best for |
| --- | --- |
| **[Open in your browser](https://plainsync-open-markdown.tradephani.chatgpt.site/)** | Start writing immediately; local drafts need no account |
| **[Download the desktop app](https://github.com/everyai-com/plainsync/releases/latest)** | Install PlainSync on macOS or Windows |
| **[Self-host it](docs/SELF-HOSTING.md)** | Keep the app, API, and shared documents on infrastructure you control |
| **[Fork it](https://github.com/everyai-com/plainsync/fork)** | Rebrand it, extend it, or ship it inside another product under MIT |

The desktop app uses hosted PlainSync by default. Choose **Server → Connect to another server** to use your own deployment. Alpha installers are not code-signed yet, so macOS Gatekeeper or Windows SmartScreen may ask you to confirm the first launch.

## Self-host in one command

```bash
git clone https://github.com/everyai-com/plainsync.git
cd plainsync
docker compose up -d
```

Or develop locally with Node.js 22+:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Why PlainSync

- **One source of truth.** Agents write Markdown; people review the same document.
- **No lock-in.** Import, edit, save, and export normal `.md` files.
- **Local by default.** Drafts stay on the device until someone chooses Share.
- **Ready to build on.** Comments, roles, history, Yjs collaboration, OpenAPI, Cloudflare, and Docker are included.
- **Commercial use is welcome.** MIT permits modification, redistribution, rebranding, and paid products.

## Build with it

PlainSync includes a revision-aware REST API and publishes its OpenAPI document at `/api/openapi`.

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

Read the [developer guide](docs/DEVELOPER-GUIDE.md), [agent API reference](docs/AGENT-API.md), [desktop guide](docs/DESKTOP.md), and [example use cases](docs/USE-CASES.md).

## Contribute

Pick a [`good first issue`](https://github.com/everyai-com/plainsync/labels/good%20first%20issue), read [CONTRIBUTING.md](CONTRIBUTING.md), and open a focused pull request. No contributor agreement or signed commit is required.

PlainSync is an alpha. Read [SECURITY.md](SECURITY.md) before using it for sensitive documents and see [ROADMAP.md](ROADMAP.md) for planned SDKs, CLI tools, Git adapters, MCP support, and embeddable packages.

## License

[MIT](LICENSE). Use it, fork it, self-host it, rebrand it, and build a business with it.
