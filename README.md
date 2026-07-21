# PlainSync

PlainSync is an open-source, local-first Markdown workspace for people and AI agents. It keeps Markdown as plain text, gives humans a calm writing and preview experience, and makes sharing self-hostable.

![PlainSync — Markdown that stays yours](public/og.png)

## What works today

- Open, drag, edit, preview, and export `.md` files.
- GitHub-Flavored Markdown, tables, task lists, and fenced code blocks.
- Local drafts saved on the device with no account.
- Private edit links backed by revision-checked synchronization.
- Conflict protection when two versions change at once.
- Installable PWA for macOS and Windows.
- Light and dark modes, keyboard shortcuts, and responsive layouts.
- Cloudflare Workers + D1 deployment.
- Docker/VPS deployment with a persistent local data volume.

PlainSync is an alpha. Live synchronization currently polls every three seconds. CRDT collaboration, comments, suggestions, Git adapters, CLI file watching, and MCP tools are on the public roadmap.

## Start locally

PlainSync requires Node.js 22 or newer.

```bash
git clone <your-plain-sync-repository>
cd plainsync
npm install
npm run dev
```

Open `http://localhost:3000`. The same commands work in Terminal on macOS, PowerShell on Windows, and a Linux shell.

### Install it as a desktop app

Open PlainSync in Chrome or Edge, then select **Install PlainSync** from the browser menu. It opens in its own window on macOS and Windows and retains local drafts for offline use.

## Self-host on a VPS

Install Docker and run:

```bash
docker compose up -d
```

PlainSync is available at `http://your-server:3000`. Shared documents are stored in the `plainsync-data` Docker volume. Updating is intentionally ordinary:

```bash
git pull
docker compose up -d --build
```

For a public server, put Caddy, nginx, Traefik, or your existing HTTPS proxy in front of port 3000. See [the VPS guide](docs/SELF-HOSTING.md#vps-with-docker) for a Caddy example and backups.

## Deploy to Cloudflare

You need a Cloudflare account and Wrangler authentication. The deploy script works on macOS, Windows, and Linux:

```bash
npm install
npx wrangler login
npm run deploy:cloudflare
```

The script finds or creates a D1 database, builds the application, wires the database binding, and deploys the Worker. See [the Cloudflare guide](docs/SELF-HOSTING.md#cloudflare-workers--d1).

## Keyboard shortcuts

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Open Markdown | `⌘ O` | `Ctrl O` |
| Save Markdown | `⌘ S` | `Ctrl S` |
| Create/copy share link | `⌘ ⇧ S` | `Ctrl Shift S` |

## How shared links work

Creating a share link generates a random 192-bit edit key. Only the SHA-256 hash is stored on the server. The key remains in the URL fragment, which browsers do not send in normal HTTP requests; the PlainSync client sends it in an authorization header when reading or writing that document.

Possession of an alpha share link grants edit access. Treat it like a private invitation. Account permissions and read-only links are planned before the stable release.

## Architecture

The web application consumes the same Markdown and synchronization interfaces used by its API. Cloudflare stores shared documents in D1. The VPS build uses an atomic JSON store in the mounted `/data` volume, so it needs no external database.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries, storage choices, and the path toward CRDT collaboration and agent tools.

## Development

```bash
npm install
npm run dev
npm run lint
npm test
```

Database schema changes live in `db/schema.ts`. Generate migration files with:

```bash
npm run db:generate
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Apache-2.0. Use PlainSync privately, commercially, or as a foundation for another product. Attribution and license notices must be retained.
