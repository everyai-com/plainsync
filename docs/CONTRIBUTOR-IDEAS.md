# Contributor ideas

These are useful, bounded directions for contributors. Before starting code, check existing issues and comment on the relevant one or open a short proposal.

## Documentation and examples

- Add a complete example that sends an agent-generated report to human review.
- Document deployment behind nginx or Traefik.
- Add a Windows Docker Desktop backup walkthrough.
- Improve error messages or explain a confusing architecture boundary.
- Translate the README while keeping the English version authoritative.

## Testing and quality

- Add API tests for key expiry or rotation once designed.
- Test keyboard-only workflows and fix focus gaps.
- Audit the editor with VoiceOver or NVDA and document findings.
- Add migration tests for an older VPS data file.
- Exercise concurrent title changes and history retention.

## Product work

- Design the suggest/accept/reject workflow without putting suggestions in Markdown.
- Add comment replies using the existing `parentId` field.
- Improve participant presence while preserving Cloudflare/VPS portability.
- Add a safe document deletion and capability-rotation workflow.
- Add an optional side-by-side version comparison.

## Developer ecosystem

- Propose a small TypeScript client for the current REST API.
- Prototype a cross-platform file watcher CLI.
- Build an MCP resource and tools proof of concept with revision-aware writes.
- Explore GitHub and GitLab import/publish adapters.
- Specify the first `@plainsync/core` package boundary and compatibility tests.

## Self-hosting

- Add a tested Podman workflow.
- Add a health/readiness distinction for orchestration platforms.
- Document D1 backup and restore.
- Reduce the production image size without adding platform-specific behavior.
- Add an upgrade smoke test to CI.

Good first issues should be independently reviewable, avoid redesigning public interfaces, and include a clear definition of done.
