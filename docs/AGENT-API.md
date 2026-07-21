# PlainSync agent API

PlainSync exposes the same portable Markdown used by the editor. A running instance publishes an OpenAPI 3.1 description at:

```text
GET /api/openapi
```

No account or vendor SDK is required. The document id is in the shared URL query and its role-scoped key is after `#key=`. Send that key as a bearer token; never put it in a server log or a request query.

```bash
PLAIN_SYNC_URL=https://docs.example.com
DOCUMENT_ID=replace-me
DOCUMENT_KEY=replace-me
```

## Read Markdown and revision

```bash
curl "$PLAIN_SYNC_URL/api/documents/$DOCUMENT_ID" \
  -H "Authorization: Bearer $DOCUMENT_KEY"
```

The response contains `document.content`, `document.revision`, and `role`.

## Replace Markdown safely

Only an editor key can replace content. Always send the revision you read:

```bash
curl -X PUT "$PLAIN_SYNC_URL/api/documents/$DOCUMENT_ID" \
  -H "Authorization: Bearer $DOCUMENT_KEY" \
  -H "Content-Type: application/json" \
  --data '{
    "title": "Release notes",
    "content": "# Release notes\n\nUpdated by an agent.\n",
    "expectedRevision": 12,
    "actor": "release-notes-agent"
  }'
```

A stale revision returns HTTP `409` with the latest readable document. Re-read, incorporate the new content, and retry intentionally. Never blindly loop over a conflict.

## Comments and review

Editor and commenter keys can add a comment:

```bash
curl -X POST "$PLAIN_SYNC_URL/api/documents/$DOCUMENT_ID/comments" \
  -H "Authorization: Bearer $DOCUMENT_KEY" \
  -H "Content-Type: application/json" \
  --data '{
    "body": "The source does not support this claim yet.",
    "quote": "Adoption doubled this quarter",
    "authorName": "fact-check-agent"
  }'
```

Use `GET /api/documents/{id}/comments` to read the discussion. Only an editor key may resolve a comment through `PATCH /api/documents/{id}/comments/{commentId}`.

## History and named checkpoints

```text
GET  /api/documents/{id}/history
POST /api/documents/{id}/history
```

The POST body accepts `label` and `actor`. Automatic versions are created whenever materialized Markdown or its title changes. Named versions are retained independently of the rolling automatic-history limit.

## Conflict-free Yjs transport

Interactive clients exchange base64-encoded Yjs updates through `POST /api/documents/{id}/sync`. Send an optional `update`, the caller's `stateVector`, presence details, and an actor label. The response returns the missing Yjs `update`, materialized document, caller role, and active participants.

REST clients do not need Yjs. Use the expected-revision replacement endpoint unless the client already maintains a `Y.Doc`.

## Recommended agent policy

1. Give agents commenter links by default.
2. Require a human to grant an editor link for direct document mutation.
3. Include a stable actor name on writes and snapshots.
4. Treat HTTP `409` as a review event, not an error to overwrite.
5. Export or checkpoint important documents before unattended bulk changes.
