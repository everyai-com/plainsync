# Contributing to PlainSync

PlainSync needs developers, technical writers, designers, self-hosters, accessibility testers, and people who build with agents. Small, focused improvements are welcome.

## The five-minute contribution path

1. Fork and clone the repository.
2. Create a branch for one focused change.
3. Run `npm install` and `npm run dev`.
4. Make the change and add a test when behavior changes.
5. Run `npm run check`.
6. Open a pull request using the supplied template.

You do not need to sign a contributor agreement or add a DCO sign-off. Contributions are accepted under the project's MIT license.

## Find something to work on

- Browse issues labeled `good first issue` or `help wanted`.
- Choose a scoped task from [docs/CONTRIBUTOR-IDEAS.md](docs/CONTRIBUTOR-IDEAS.md).
- Fix documentation, accessibility, cross-platform, or self-hosting friction you encounter.
- For a new major capability, open a short proposal issue before investing in implementation.

If an issue is unassigned, comment that you would like to work on it. A maintainer can confirm scope and help avoid duplicated effort.

## Local setup

Requirements:

- Node.js 22 or newer
- npm
- Git

```bash
git clone https://github.com/YOUR-USER/plainsync.git
cd plainsync
npm install
npm run dev
```

The development server provides a local Cloudflare-compatible D1 binding. The integration tests also exercise the portable Node/VPS store, so no cloud account or external database is required.

## Before opening a pull request

```bash
npm run check
```

This runs the type check, lint, production build, and integration suite. When changing the database schema, also run:

```bash
npm run db:generate
```

Inspect and commit the generated migration. For user-interface changes, check keyboard behavior, narrow screens, light mode, and dark mode.

## Where code lives

| Area | Location |
| --- | --- |
| Editor and collaboration client | `app/plainsync-editor.tsx` |
| Product styling | `app/globals.css` |
| HTTP routes | `app/api/` |
| Portable persistence | `db/documents.ts` |
| D1 schema and migrations | `db/schema.ts`, `drizzle/` |
| Cloudflare worker boundary | `worker/index.ts` |
| Self-host tooling | `Dockerfile`, `compose.yaml`, `scripts/` |
| Tests | `tests/` |

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing persistence, synchronization, permissions, or public interfaces.

## Project principles

1. Markdown remains portable and readable.
2. Export is never a premium capability.
3. Self-hosting is a supported product path.
4. Agent changes are attributable and reversible.
5. Local documents do not leave the device without an explicit share action.
6. The reference app uses public project interfaces.
7. A hosted convenience must not weaken the self-hosted version.

## Pull-request expectations

- Keep one pull request focused on one problem.
- Explain the user or developer need, not only the code change.
- Add or update tests for behavior changes.
- Document configuration, API, and migration changes.
- Include accessible names and keyboard behavior for interactions.
- Do not add telemetry, proprietary dependencies, or hosted-only product branches.
- Avoid drive-by dependency upgrades unrelated to the change.

Maintainers may ask for a change to be split when that makes review or rollback safer. Draft pull requests are welcome for early technical feedback.

## Getting help

Use [GitHub Discussions](https://github.com/everyai-com/plainsync/discussions) for design questions and usage help. Use an issue for reproducible bugs or an agreed feature proposal. Security problems follow [SECURITY.md](SECURITY.md), not the public issue tracker.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
