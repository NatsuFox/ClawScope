/**
 * Storage Layer Tests
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { TraceStorage } from '../src/storage.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, 'tmp', 'test-trace');

test('TraceStorage', async (t) => {
  let storage;

  t.beforeEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });

    // Initialize storage
    storage = new TraceStorage(TEST_DIR);
    await storage.initialize();
  });

  t.afterEach(async () => {
    // Close storage
    if (storage) {
      storage.close();
    }

    // Clean up
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  await t.test('should initialize directory structure', async () => {
    const rawDir = path.join(TEST_DIR, 'raw');
    const derivedDir = path.join(TEST_DIR, 'derived');
    const dbPath = path.join(TEST_DIR, 'normalized.db');

    const rawExists = await fs.access(rawDir).then(() => true).catch(() => false);
    const derivedExists = await fs.access(derivedDir).then(() => true).catch(() => false);
    const dbExists = await fs.access(dbPath).then(() => true).catch(() => false);

    assert.strictEqual(rawExists, true, 'raw directory should exist');
    assert.strictEqual(derivedExists, true, 'derived directory should exist');
    assert.strictEqual(dbExists, true, 'database should exist');
  });

  await t.test('should write and read raw events', async () => {
    const events = [
      {
        type: 'model.usage',
        ts: 1710778500000,
        runId: 'run_001',
        model: 'claude-opus-4',
        tokens: { input: 100, output: 50, total: 150 },
        costUsd: 0.005,
        durationMs: 2500
      },
      {
        type: 'tool_start',
        ts: 1710778502500,
        runId: 'run_001',
        toolCallId: 'toolu_001',
        data: { toolName: 'Bash', args: { command: 'ls' } }
      }
    ];

    await storage.writeRawEvents(events, 'agent_events.jsonl');
    const readEvents = await storage.readRawEvents('agent_events.jsonl');

    assert.strictEqual(readEvents.length, 2);
    assert.strictEqual(readEvents[0].type, 'model.usage');
    assert.strictEqual(readEvents[1].type, 'tool_start');
  });

  await t.test('should write and read normalized spans', async () => {
    const spans = [
      {
        record_id: 'span_001',
        trace_id: 'trace_001',
        category: 'MODEL',
        subtype: 'model.usage',
        name: 'Model: claude-opus-4',
        start_at: '2026-03-18T10:00:00.000Z',
        end_at: '2026-03-18T10:00:02.500Z',
        duration_ms: 2500,
        status: 'success',
        fidelity: 'exact',
        runId: 'run_001',
        model_name: 'claude-opus-4',
        token_input: 100,
        token_output: 50,
        costUsd: 0.005,
        attributes: { test: 'value' }
      }
    ];

    await storage.writeSpans(spans);
    const readSpans = storage.readSpansByTrace('trace_001');

    assert.strictEqual(readSpans.length, 1);
    assert.strictEqual(readSpans[0].record_id, 'span_001');
    assert.strictEqual(readSpans[0].category, 'MODEL');
    assert.strictEqual(readSpans[0].model_name, 'claude-opus-4');
    assert.deepStrictEqual(readSpans[0].attributes, { test: 'value' });
  });

  await t.test('should query spans by runId', async () => {
    const spans = [
      {
        record_id: 'span_001',
        trace_id: 'trace_001',
        category: 'MODEL',
        subtype: 'model.usage',
        name: 'Model Call',
        start_at: '2026-03-18T10:00:00.000Z',
        end_at: '2026-03-18T10:00:02.500Z',
        duration_ms: 2500,
        status: 'success',
        fidelity: 'exact',
        runId: 'run_001',
        attributes: {}
      },
      {
        record_id: 'span_002',
        trace_id: 'trace_001',
        category: 'TOOL',
        subtype: 'tool_execution',
        name: 'Tool: Bash',
        start_at: '2026-03-18T10:00:03.000Z',
        end_at: '2026-03-18T10:00:05.000Z',
        duration_ms: 2000,
        status: 'success',
        fidelity: 'exact',
        runId: 'run_001',
        attributes: {}
      },
      {
        record_id: 'span_003',
        trace_id: 'trace_001',
        category: 'MODEL',
        subtype: 'model.usage',
        name: 'Model Call 2',
        start_at: '2026-03-18T10:00:06.000Z',
        end_at: '2026-03-18T10:00:08.000Z',
        duration_ms: 2000,
        status: 'success',
        fidelity: 'exact',
        runId: 'run_002',
        attributes: {}
      }
    ];

    await storage.writeSpans(spans);
    const run1Spans = storage.readSpansByRun('run_001');

    assert.strictEqual(run1Spans.length, 2);
    assert.strictEqual(run1Spans[0].record_id, 'span_001');
    assert.strictEqual(run1Spans[1].record_id, 'span_002');
  });

  await t.test('should query spans with filters', async () => {
    const spans = [
      {
        record_id: 'span_001',
        trace_id: 'trace_001',
        category: 'MODEL',
        subtype: 'model.usage',
        name: 'Cheap Model',
        start_at: '2026-03-18T10:00:00.000Z',
        end_at: '2026-03-18T10:00:01.000Z',
        duration_ms: 1000,
        status: 'success',
        fidelity: 'exact',
        costUsd: 0.001,
        attributes: {}
      },
      {
        record_id: 'span_002',
        trace_id: 'trace_001',
        category: 'MODEL',
        subtype: 'model.usage',
        name: 'Expensive Model',
        start_at: '2026-03-18T10:00:02.000Z',
        end_at: '2026-03-18T10:00:05.000Z',
        duration_ms: 3000,
        status: 'success',
        fidelity: 'exact',
        costUsd: 0.05,
        attributes: {}
      }
    ];

    await storage.writeSpans(spans);

    // Query expensive spans
    const expensiveSpans = storage.querySpans({
      trace_id: 'trace_001',
      min_cost: 0.01
    });

    assert.strictEqual(expensiveSpans.length, 1);
    assert.strictEqual(expensiveSpans[0].record_id, 'span_002');

    // Query long-duration spans
    const longSpans = storage.querySpans({
      trace_id: 'trace_001',
      min_duration_ms: 2000
    });

    assert.strictEqual(longSpans.length, 1);
    assert.strictEqual(longSpans[0].record_id, 'span_002');
  });

  await t.test('should write and read trace metadata', async () => {
    const trace = {
      trace_id: 'trace_001',
      trace_name: 'Test Trace',
      start_at: '2026-03-18T10:00:00.000Z',
      end_at: '2026-03-18T10:00:10.000Z',
      duration_ms: 10000,
      total_cost: 0.025,
      total_agents: 1,
      total_spans: 5,
      schema_version: 2,
      trace_contract_version: 'clawscope-trace/v2',
      trace_semantics: 'single-run',
      agent_identity_mode: 'run_id',
      supports_waterfall: true,
      supports_cost_analysis: true,
      supports_message_log: true,
      supports_multi_agent: false,
      status: 'complete',
      attributes: { note: 'test trace metadata' },
    };

    await storage.writeTrace(trace);
    const readTrace = storage.readTrace('trace_001');

    assert.strictEqual(readTrace.trace_id, 'trace_001');
    assert.strictEqual(readTrace.trace_name, 'Test Trace');
    assert.strictEqual(readTrace.duration_ms, 10000);
    assert.strictEqual(readTrace.total_cost, 0.025);
    assert.strictEqual(readTrace.trace_contract_version, 'clawscope-trace/v2');
    assert.strictEqual(readTrace.trace_semantics, 'single-run');
    assert.strictEqual(readTrace.agent_identity_mode, 'run_id');
    assert.strictEqual(readTrace.supports_multi_agent, false);
    assert.deepStrictEqual(readTrace.attributes, { note: 'test trace metadata' });
  });

  await t.test('should generate summary', async () => {
    const spans = [
      {
        record_id: 'span_001',
        trace_id: 'trace_001',
        category: 'MODEL',
        subtype: 'model.usage',
        name: 'Model Call 1',
        start_at: '2026-03-18T10:00:00.000Z',
        end_at: '2026-03-18T10:00:02.000Z',
        duration_ms: 2000,
        status: 'success',
        fidelity: 'exact',
        costUsd: 0.01,
        token_input: 100,
        token_output: 50,
        attributes: {}
      },
      {
        record_id: 'span_002',
        trace_id: 'trace_001',
        category: 'MODEL',
        subtype: 'model.usage',
        name: 'Model Call 2',
        start_at: '2026-03-18T10:00:03.000Z',
        end_at: '2026-03-18T10:00:05.000Z',
        duration_ms: 2000,
        status: 'success',
        fidelity: 'exact',
        costUsd: 0.015,
        token_input: 150,
        token_output: 75,
        attributes: {}
      },
      {
        record_id: 'span_003',
        trace_id: 'trace_001',
        category: 'TOOL',
        subtype: 'tool_execution',
        name: 'Tool: Bash',
        start_at: '2026-03-18T10:00:06.000Z',
        end_at: '2026-03-18T10:00:08.000Z',
        duration_ms: 2000,
        status: 'success',
        fidelity: 'exact',
        attributes: {}
      }
    ];

    await storage.writeSpans(spans);
    await storage.writeTrace({
      trace_id: 'trace_001',
      trace_name: 'Test Trace',
      start_at: '2026-03-18T10:00:00.000Z',
      end_at: '2026-03-18T10:00:08.000Z',
      duration_ms: 8000
    });

    const summary = storage.generateSummary('trace_001');

    assert.strictEqual(summary.trace_id, 'trace_001');
    assert.strictEqual(summary.total_spans, 3);
    assert.strictEqual(summary.total_cost, 0.025);
    assert.strictEqual(summary.total_tokens, 375);
    assert.strictEqual(summary.category_stats.MODEL.count, 2);
    assert.strictEqual(summary.category_stats.TOOL.count, 1);
  });

  await t.test('should write and read summary', async () => {
    const summary = {
      trace_id: 'trace_001',
      total_spans: 10,
      total_cost: 0.05,
      category_stats: {
        MODEL: { count: 3, total_duration_ms: 6000 },
        TOOL: { count: 7, total_duration_ms: 14000 }
      }
    };

    await storage.writeSummary('trace_001', summary);
    const readSummary = await storage.readSummary('trace_001');

    assert.deepStrictEqual(readSummary, summary);
  });
});
