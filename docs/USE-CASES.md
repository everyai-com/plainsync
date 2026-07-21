# PlainSync use cases

PlainSync is useful when Markdown is the right storage format but a raw text editor or Git pull request is the wrong collaboration interface.

## 1. Human review for agent-generated documents

**Problem:** An agent produces a plan, report, proposal, or research summary in Markdown. Reviewers copy it into another document tool to comment, then somebody must reconcile two formats.

**PlainSync pattern:** Create a shared document through the API, let the agent write with an editor key, and give people commenter or read-only links. Every accepted change remains Markdown. Humans can comment, inspect history, restore a snapshot, and export the file.

Examples:

- Product requirements and implementation plans
- Research and due-diligence reports
- Customer briefs and meeting summaries
- Policy drafts and internal proposals
- Long-form content generated from a prompt or dataset

## 2. Docs-as-code without requiring everyone to use Git

**Problem:** Engineers want documentation in the repository. Writers, designers, clients, or community reviewers may not want to edit branches and pull requests.

**PlainSync pattern:** Collaborate in a document-style interface, export clean `.md`, then commit it through the team's normal Git workflow. PlainSync-specific comments and presence never pollute the Markdown.

This works well for READMEs, guides, changelogs, runbooks, architecture decisions, and documentation pages.

## 3. Release notes and recurring reports

**Problem:** A scheduled agent assembles release notes, incident summaries, analytics reports, or status updates. Direct publication is risky, while reviewing raw job output is unpleasant.

**PlainSync pattern:** The automation updates a document with an expected revision and actor name. A human reviews the diff through history, leaves comments, names an approved snapshot, and exports or publishes it.

The revision check prevents an unattended job from silently overwriting a newer human edit.

## 4. Private documentation on infrastructure you control

**Problem:** A team needs collaborative documents but cannot or does not want to use another hosted document platform.

**PlainSync pattern:** Deploy one container to a VPS or use Cloudflare Workers + D1. Local drafts remain in each browser until shared. Shared state stays in the infrastructure selected by the operator.

Suitable early-alpha examples include internal technical notes, project workspaces, community documentation, and private prototypes. Regulated or highly sensitive use should wait for account authentication, key rotation, and a completed security review.

## 5. A Markdown review surface inside a commercial product

**Problem:** A product already generates Markdown but needs a human review step. Building a collaborative editor, comments, history, roles, persistence, and self-hosting from scratch is expensive.

**PlainSync pattern:** Deploy or fork the reference application and integrate through the HTTP API. The MIT license permits commercial use, modification, rebranding, redistribution, and paid hosting.

PlainSync is not yet a stable embeddable React package. Today, the supported integration boundary is the API or a product-specific fork. The roadmap extracts reusable `@plainsync/*` packages after those interfaces stabilize.

## 6. Local writing across macOS and Windows

**Problem:** Someone wants a focused Markdown editor without converting files into an application-specific database.

**PlainSync pattern:** Download the native macOS or Windows app, open and save normal `.md` files, and keep drafts local. The desktop app can use hosted PlainSync or connect to a self-hosted server. The installable browser PWA remains available as a lightweight alternative.

## When PlainSync is not the right tool

Choose something else when you need:

- Rich page layout, spreadsheets, or slide authoring
- Enterprise identity and detailed organization policy today
- Fully offline multi-device synchronization
- A mature hosted SLA or regulated-data certification
- A stable npm component library today

PlainSync focuses deliberately on portable Markdown collaboration. Its value comes from doing that boundary well instead of becoming another general-purpose office suite.
