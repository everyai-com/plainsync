# PlainSync developer guide

PlainSync can be adopted as a complete self-hosted workspace, an HTTP service behind another product, or a starting point for a specialized Markdown application.

## Choose an integration path

| Goal | Start here |
| --- | --- |
| Give a team a collaborative Markdown workspace | Deploy the reference app with Docker or Cloudflare |
| Send agent output to a human for review | Create documents and role-specific links through the REST API |
| Add Markdown review to a product | Put the PlainSync API behind your product and link into the editor |
| Build a specialized editor | Fork the app and preserve the document/API contracts |
| Embed a React package | Follow the roadmap; stable `@plainsync/*` packages do not exist yet |

## Run the development environment

```bash
git clone https://github.com/everyai-com/plainsync.git
cd plainsync
npm install
npm run dev
```

Open `http://localhost:3000`. Local development includes a Cloudflare-compatible D1 binding. No external database or account is required.

Run the complete verification suite with:

```bash
npm run check
```

## Create a document from an application

```js
const baseUrl = "https://docs.example.com";

const createResponse = await fetch(`${baseUrl}/api/documents`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Architecture proposal",
    content: "# Architecture proposal\n\nInitial agent draft.\n",
  }),
});

if (!createResponse.ok) throw new Error("Could not create PlainSync document");

const { document, accessTokens } = await createResponse.json();

function invitationUrl(token) {
  return `${baseUrl}/?doc=${encodeURIComponent(document.id)}#key=${encodeURIComponent(token)}`;
}

console.log({
  editor: invitationUrl(accessTokens.edit),
  commenter: invitationUrl(accessTokens.suggest),
  reader: invitationUrl(accessTokens.read),
});
```

The fragment key is intentionally unavailable to ordinary server access logs. The browser client reads it and sends it as a bearer token.

## Choose the least-powerful role

- **Editor:** read and change Markdown, resolve comments, create snapshots, and restore history.
- **Commenter:** read and add anchored comments without changing Markdown.
- **Read-only:** read and follow synchronized changes.

Give agents commenter access by default. Grant an editor key only when the workflow explicitly allows direct mutation.

## Update Markdown from an agent

First read the current document and revision:

```js
const headers = { authorization: `Bearer ${accessTokens.edit}` };
const current = await fetch(`${baseUrl}/api/documents/${document.id}`, { headers })
  .then((response) => response.json());
```

Then replace it with the revision you actually read:

```js
const updateResponse = await fetch(`${baseUrl}/api/documents/${document.id}`, {
  method: "PUT",
  headers: {
    ...headers,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    title: current.document.title,
    content: `${current.document.content}\n## Agent follow-up\n\nNew material.\n`,
    expectedRevision: current.document.revision,
    actor: "architecture-agent",
  }),
});

if (updateResponse.status === 409) {
  // A person or another agent changed the document. Re-read and merge intentionally.
}
```

Never automatically retry a `409` by overwriting the newer document. Treat it as a review or merge event.

## Add a review comment

```js
await fetch(`${baseUrl}/api/documents/${document.id}/comments`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${accessTokens.suggest}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    body: "This conclusion needs a source.",
    quote: "The migration has no operational risk.",
    authorName: "risk-review-agent",
  }),
});
```

The browser editor creates stronger Yjs-relative anchors when a person comments on a selection. API clients may supply a text quote as a portable fallback.

## Use Yjs only when you need multiplayer editing

Interactive clients exchange base64 Yjs updates through `POST /api/documents/{id}/sync`. Ordinary integrations should use revision-aware Markdown reads and writes instead. They are simpler, readable, and easier to audit.

See [AGENT-API.md](AGENT-API.md) for endpoint details. Every running instance also serves an OpenAPI 3.1 description at `/api/openapi`.

## Persistence choices

- **Cloudflare:** D1 stores documents, compacted CRDT state, access hashes, comments, versions, and presence records.
- **Node/VPS:** the same logical records are stored atomically in `/data/documents.json`.

Routes do not access platform storage directly. The boundary in `db/documents.ts` keeps the same product behavior on both deployment shapes.

## Customize the product

Common starting points:

- Brand, layout, and interaction: `app/plainsync-editor.tsx`, `app/globals.css`
- Markdown rendering: the `ReactMarkdown` configuration in the editor
- API behavior: `app/api/`
- Persistence or a new storage adapter: `db/documents.ts`
- Relational schema: `db/schema.ts`, then `npm run db:generate`
- Cloudflare headers and worker behavior: `worker/index.ts`

Keep Markdown portable. Comments, presence, roles, and product-specific metadata should remain outside the exported source.

## Production checklist

- Put the VPS deployment behind HTTPS.
- Back up `/data` or the D1 database.
- Limit access to invitation URLs and avoid logging fragments copied by users.
- Document who may receive editor keys.
- Keep the 1 MB document limit unless storage and abuse controls are redesigned.
- Review [SECURITY.md](../SECURITY.md) and the current alpha limitations.
- Test upgrades against a backup before replacing a production instance.

## What to build next

High-value integration contributions include a TypeScript client, CLI file watcher, GitHub/GitLab adapters, MCP server, authentication adapter, and embeddable editor packages. Coordinate interface work in a proposal issue so early implementations converge on one public contract.
