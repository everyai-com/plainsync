# PlainSync governance

PlainSync uses lightweight maintainer governance while the project is young.

## Roles

- **Contributors** report problems, improve documentation, propose designs, and submit code.
- **Maintainers** triage issues, guide scope, review changes, protect releases, and steward public interfaces.

Repeated high-quality contributions and constructive project participation are the path to maintainer responsibility. Repository owners appoint maintainers after discussing expectations and access.

## Decisions

- Small, reversible changes are decided through pull-request review.
- New public APIs, storage formats, security boundaries, packages, or major product behavior begin with a proposal issue.
- Maintainers seek rough consensus. When consensus is not possible, the responsible maintainer documents the decision and tradeoffs.
- Security fixes may be developed privately and explained after a safe release exists.

## Compatibility promise

PlainSync is currently alpha. Interfaces may change, but changes should include migrations, release notes, and a reasonable upgrade path. Exported Markdown must remain portable even when collaboration metadata evolves.

## Project independence

The MIT-licensed repository is the complete product foundation. Hosted convenience features should use public interfaces and must not make the self-hosted version artificially incomplete.
