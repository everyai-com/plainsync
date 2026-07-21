# Security policy

PlainSync is an alpha and should not yet be used for regulated or highly sensitive documents.

Report vulnerabilities privately to the maintainers rather than opening a public issue. A project security email should be added before the repository is announced publicly.

When reporting, include the affected version, deployment shape, reproduction steps, and expected impact. Maintainers should acknowledge a complete report within three working days and publish a fix or mitigation as quickly as practical.

Share links are bearer capabilities. Editor links can change Markdown, resolve comments, restore versions, and create snapshots. Commenter links can read and add comments. Read-only links can only read and follow live changes. The server stores SHA-256 hashes rather than plaintext link keys.

Keys deliberately remain in the URL fragment and are sent to APIs through the `Authorization` header. Avoid posting complete links in public issue trackers, analytics systems, or screenshots. Key expiry and rotation are not implemented yet; rotate access by creating a new shared document and retiring the old record from the self-hosted store.
