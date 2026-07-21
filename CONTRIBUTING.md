# Contributing to PlainSync

Thank you for helping make Markdown collaboration easier to own and extend.

## Local setup

```bash
npm install
npm run dev
```

No cloud account or external database is required. Local shared documents use the development D1 binding; production-like Node storage can be exercised through Docker.

Before submitting a change:

```bash
npm run lint
npm test
```

## Project principles

1. Markdown remains portable and readable.
2. Export is never a premium capability.
3. Self-hosting is a supported product path.
4. Agent changes must be attributable and reversible.
5. Local documents do not leave the device without an explicit share action.
6. The reference app may only use public project interfaces.

## Pull requests

- Keep a pull request focused on one problem.
- Add or update tests for behavior changes.
- Document new configuration and migration requirements.
- Include accessible names and keyboard behavior for interactive UI.
- Do not add telemetry, hosted-only branches, or proprietary dependencies.

Small issues suitable for a first contribution should be labeled `good first issue`. Architectural changes start with a short proposal in an issue before implementation.

Contributions are accepted under the Apache-2.0 license and the Developer Certificate of Origin. Add `Signed-off-by: Your Name <email>` to commits with `git commit -s`.
