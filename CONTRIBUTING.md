# Contributing to ClawScope

Thank you for your interest in contributing. This document covers how to get started, the project conventions, and how to submit changes.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)

---

## Getting Started

1. Fork the repository on GitHub.
2. Clone your fork locally.
3. Set up the development environment (see below).
4. Create a branch for your change.
5. Make your changes, add tests where applicable.
6. Open a pull request against `main`.

---

## Development Setup

**Requirements:** Node.js 18+

```bash
# Collector
cd collector
npm install

# Viewer
cd viewer
npm install

# Viewer server
cd viewer/server
npm install
```

To run the collector tests:

```bash
cd collector
npm test
```

To run the viewer in development mode:

```bash
cd viewer
npm run dev
```

---

## Project Structure

See [README.md § Repository Map](README.md#repository-map) for the directory layout.

Key conventions:

- `collector/` — pure Node.js ESM, no build step, imports via `node:` prefix for built-ins
- `viewer/` — React + Vite, built with `npm run build`
- `viewer/server/` — plain Node.js ESM HTTP server, no framework
- `docs/` — Markdown documentation, keep cross-links relative
- `traces/` — not committed; generated locally by the collector

---

## Making Changes

### Trace model changes

If you change the normalized trace contract (`collector/src/schema/`), update:

1. The relevant design doc in `docs/design/`
2. Any affected normalizer code
3. Any affected viewer rendering code

The raw/normalized/derived boundary is a hard design constraint. Do not couple the viewer to raw harness formats.

### Adding a new harness adapter

1. Add a new normalizer in `collector/src/normalizers/`
2. Register it in `collector/src/cli.js`
3. Add a corresponding doc section to `docs/design/harness-adapters.md`
4. Add a sample trace to `collector/samples/` if possible

### Viewer changes

- Keep the viewer stateless with respect to collection — it reads from the server API only
- New visualizations should work in both replay and (future) live mode
- Do not hardcode harness-specific rendering logic in the viewer

---

## Submitting a Pull Request

- Keep PRs focused. One logical change per PR.
- Fill out the pull request template completely.
- Link any related issues with `Closes #N` or `Relates to #N`.
- Ensure CI passes before requesting review.
- Expect at least one round of review feedback.

---

## Reporting Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) issue template. Include:

- ClawScope version or commit SHA
- Node.js version
- Harness type and session source (Claude Code, Codex, OpenClaw)
- Minimal reproduction steps
- Actual vs. expected behavior

---

## Requesting Features

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) issue template. Before opening a request, check:

- The [roadmap](docs/foundation/roadmap.md) — it may already be planned
- Existing issues — it may already be requested

---

## Code Style

- ESM (`import`/`export`) throughout — no CommonJS
- No transpilation for `collector/` or `viewer/server/` — code runs directly on Node.js 18+
- Prefer explicit over implicit: named exports, explicit file extensions in imports (`.js`)
- No external formatting tool is enforced yet — match the style of the file you are editing

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

Scopes: `collector`, `viewer`, `server`, `schema`, `docs`, `ci`

Examples:

```
feat(collector): add Codex rollout JSONL normalizer
fix(viewer): correct waterfall span overlap calculation
docs(schema): document delegation span attributes
```

Keep the summary line under 72 characters. Use the body to explain *why*, not *what*.
