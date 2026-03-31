# Security Policy

## Supported Versions

ClawScope is currently in active early development. Security fixes are applied to the latest commit on `main`.

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| Older commits | Not guaranteed |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it by opening a [GitHub Security Advisory](https://github.com/powers/ClawScope/security/advisories/new) in this repository. This keeps the report confidential until a fix is ready.

Include as much of the following as possible:

- A description of the vulnerability and its potential impact
- Steps to reproduce or proof-of-concept
- Any suggested mitigations

You can expect an acknowledgement within 5 business days and a status update within 14 days.

## Scope

ClawScope is a **local-first** tool. It is designed to run on your own machine and read local files. It does not transmit trace data to any external service by default.

Areas of particular interest:

- Path traversal or arbitrary file read via the viewer server API
- Code injection via maliciously crafted trace JSONL files
- Unintended exposure of the viewer server beyond localhost

## Out of Scope

- Vulnerabilities in third-party dependencies (report those upstream)
- Issues that require physical access to the machine running ClawScope
- Issues in the `openclaw-source/` reference copy (report those to the OpenClaw project)
