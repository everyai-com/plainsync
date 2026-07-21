# Self-hosting PlainSync

PlainSync has two supported deployment shapes. Both run the same application and document API.

## VPS with Docker

### Requirements

- A VPS with Docker Engine and the Docker Compose plugin.
- 512 MB RAM is enough for an alpha instance; 1 GB is more comfortable during builds.
- HTTPS for any instance exposed to the internet.

### Start

```bash
git clone https://github.com/everyai-com/plainsync.git
cd plainsync
docker compose up -d
```

The service listens on port 3000. Shared data is stored in the named `plainsync-data` volume.

### Put Caddy in front

Example `Caddyfile`:

```caddyfile
docs.example.com {
  reverse_proxy 127.0.0.1:3000
  encode zstd gzip
}
```

Bind the container port to localhost when Caddy runs directly on the host:

```yaml
ports:
  - "127.0.0.1:3000:3000"
```

### Back up

The portable server store is `/data/documents.json`. Create a consistent backup by briefly stopping writes or stopping the container:

```bash
docker compose stop plainsync
docker run --rm -v plainsync_plainsync-data:/source -v "$PWD":/backup alpine \
  tar -czf /backup/plainsync-backup.tgz -C /source .
docker compose start plainsync
```

On Windows PowerShell, use Docker Desktop's volume backup features or replace `$PWD` with an absolute Windows path accepted by Docker Desktop.

### Update

```bash
git pull
docker compose up -d --build
```

The data volume is not replaced during an update.

## Cloudflare Workers + D1

### Automated path

```bash
npm install
npx wrangler login
npm run deploy:cloudflare
```

The script:

1. Lists the D1 databases in the authenticated account.
2. Reuses `plainsync` or creates it when absent.
3. Generates a local deployment configuration ignored by Git.
4. Builds the Worker-compatible application.
5. Deploys the Worker and static assets.

Override the generated names when needed:

```bash
PLAIN_SYNC_D1_NAME=my-docs-db PLAIN_SYNC_WORKER_NAME=my-docs npm run deploy:cloudflare
```

PowerShell:

```powershell
$env:PLAIN_SYNC_D1_NAME="my-docs-db"
$env:PLAIN_SYNC_WORKER_NAME="my-docs"
npm run deploy:cloudflare
```

The schema is initialized safely on first use. The source-controlled Drizzle migration remains the reviewable schema record for future upgrades.

## macOS and Windows

There is no Electron dependency. PlainSync is an installable Progressive Web App:

1. Open the hosted address in Chrome or Edge.
2. Choose **Install PlainSync** in the address bar or browser menu.
3. Launch it from Applications on macOS or the Start menu on Windows.

Local drafts and the application shell remain available offline. Opening a shared document naturally requires access to the self-hosted server.

## Health checks

`GET /api/health` returns:

```json
{ "ok": true, "service": "PlainSync" }
```

The supplied Compose service uses this endpoint automatically.
