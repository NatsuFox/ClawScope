/**
 * Harness import tests
 */

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { getHarnessAdapter } from '../src/harnesses/index.js';
import { TraceStorage } from '../src/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TEST_DIR = path.join(__dirname, 'tmp', 'harness-import');

test('Harness importers', async (t) => {
  t.afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  await t.test('should import a Claude Code session into normalized storage', async () => {
    const harness = getHarnessAdapter('claude-code');
    const sessionPath = path.join(FIXTURES_DIR, 'claude-code-session.jsonl');
    const raw = await harness.loadSession(sessionPath);
    const { spans, trace, rawFiles } = await harness.normalizeSession(raw);

    assert.ok(spans.length >= 5);
    assert.strictEqual(trace.trace_id, 'claude-session-1');
    assert.strictEqual(trace.source_harness, 'claude-code');
    assert.strictEqual(trace.cwd, '/tmp/claude-project');
    assert.strictEqual(trace.trace_contract_version, 'clawscope-trace/v2');
    assert.strictEqual(trace.supports_waterfall, true);
    assert.strictEqual(trace.supports_message_log, true);
    assert.strictEqual(trace.supports_multi_agent, false);
    assert.notStrictEqual(trace.agent_identity_mode, 'explicit');

    const categories = new Set(spans.map((span) => span.category));
    assert.ok(categories.has('MESSAGE'));
    assert.ok(categories.has('MODEL'));
    assert.ok(categories.has('TOOL'));
    assert.ok(categories.has('SYSTEM'));
    assert.ok(categories.has('CONTEXT'));
    assert.ok(categories.has('QUEUE'));

    const toolSpan = spans.find((span) => span.category === 'TOOL');
    assert.strictEqual(toolSpan.tool_name, 'Read');
    assert.strictEqual(toolSpan.status, 'success');

    const traceDir = path.join(TEST_DIR, 'claude-trace');
    const storage = new TraceStorage(traceDir);
    await storage.initialize();
    for (const rawFile of rawFiles) {
      await storage.writeRawEvents(rawFile.records, rawFile.filename);
    }
    await storage.writeSpans(spans);
    await storage.writeTrace(trace);

    const savedTrace = storage.readTrace(trace.trace_id);
    const savedSpans = storage.readSpansByTrace(trace.trace_id);
    const summary = storage.generateSummary(trace.trace_id);

    assert.strictEqual(savedTrace.source_harness, 'claude-code');
    assert.strictEqual(savedTrace.source_session_id, 'claude-session-1');
    assert.strictEqual(savedTrace.trace_contract_version, 'clawscope-trace/v2');
    assert.strictEqual(savedTrace.supports_multi_agent, false);
    assert.strictEqual(savedSpans.length, spans.length);
    assert.ok(summary.category_stats.MODEL);
    assert.strictEqual(summary.source_harness, 'claude-code');
    assert.strictEqual(summary.supports_multi_agent, false);

    storage.close();
  });

  await t.test('should import a Codex rollout into normalized storage', async () => {
    const harness = getHarnessAdapter('codex');
    const rolloutPath = path.join(FIXTURES_DIR, 'codex-rollout.jsonl');
    const raw = await harness.loadSession(rolloutPath, {
      indexPath: path.join(FIXTURES_DIR, 'codex-session-index.jsonl'),
      historyPath: path.join(FIXTURES_DIR, 'codex-history.jsonl'),
    });
    const { spans, trace, rawFiles } = await harness.normalizeSession(raw);

    assert.ok(spans.length >= 5);
    assert.strictEqual(trace.trace_id, 'codex-thread-1');
    assert.strictEqual(trace.trace_name, 'Codex README Summary');
    assert.strictEqual(trace.source_harness, 'codex');
    assert.strictEqual(trace.cwd, '/tmp/codex-project');
    assert.strictEqual(trace.trace_contract_version, 'clawscope-trace/v2');
    assert.strictEqual(trace.supports_waterfall, true);
    assert.strictEqual(trace.supports_message_log, true);
    assert.strictEqual(trace.supports_multi_agent, false);
    assert.notStrictEqual(trace.agent_identity_mode, 'explicit');

    const categories = new Set(spans.map((span) => span.category));
    assert.ok(categories.has('AGENT'));
    assert.ok(categories.has('MESSAGE'));
    assert.ok(categories.has('TOOL'));
    assert.ok(categories.has('SYSTEM'));
    assert.ok(categories.has('CONTEXT'));

    const toolSpan = spans.find((span) => span.toolCallId === 'call-read-1');
    assert.strictEqual(toolSpan.tool_name, 'mcp__claude__Read');
    assert.strictEqual(toolSpan.status, 'success');

    const traceDir = path.join(TEST_DIR, 'codex-trace');
    const storage = new TraceStorage(traceDir);
    await storage.initialize();
    for (const rawFile of rawFiles) {
      await storage.writeRawEvents(rawFile.records, rawFile.filename);
    }
    await storage.writeSpans(spans);
    await storage.writeTrace(trace);

    const savedTrace = storage.readTrace(trace.trace_id);
    const summary = storage.generateSummary(trace.trace_id);

    assert.strictEqual(savedTrace.source_harness, 'codex');
    assert.strictEqual(savedTrace.trace_name, 'Codex README Summary');
    assert.strictEqual(savedTrace.supports_multi_agent, false);
    assert.strictEqual(summary.source_harness, 'codex');
    assert.strictEqual(summary.supports_multi_agent, false);

    storage.close();
  });
});
