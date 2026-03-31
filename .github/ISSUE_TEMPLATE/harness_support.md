---
name: New Harness Support
about: Request or propose support for a new agent runtime / harness
labels: enhancement, harness
assignees: ''
---

## Harness Name

Name and link to the agent runtime or harness.

## Session / Trace Format

Describe the format of the session artifacts this harness produces. Include:

- File format (JSONL, JSON, SQLite, …)
- Default output location
- A sample snippet (anonymize any sensitive data)

## Key Event Types

List the most important event or span types this harness emits, e.g.:

- Model call start / end
- Tool call start / end
- Context compression
- Sub-agent delegation

## Motivation

Why is this harness important to support? Who uses it and for what workflows?

## Are You Willing to Contribute?

- [ ] Yes, I can help implement the normalizer
- [ ] I can provide sample traces for testing
- [ ] I can only provide the request at this time
