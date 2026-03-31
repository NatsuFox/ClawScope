/**
 * Integration Tests
 *
 * End-to-end tests using realistic OpenClaw traces
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { Normalizer } from '../src/normalizer.js';
import { TraceStorage } from '../src/storage.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TEST_DIR = path.join(__dirname, 'tmp', 'integration');

async function loadFixture(filename) {
  const content = await fs.readFile(path.join(FIXTURES_DIR, filename), 'utf8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

test('Integration Tests', async (t) => {
  await t.test('should normalize basic trace end-to-end', async () => {
    const traceDir = path.join(TEST_DIR, 'basic-trace');
    await fs.rm(traceDir, { recursive: true, force: true });

    // Load events
    const events = await loadFixture('basic-trace-events.jsonl');
    assert.strictEqual(events.length, 13);

    // Initialize storage
    const storage = new TraceStorage(traceDir);
    await storage.initialize();

    // Normalize
    const normalizer = new Normalizer();
    const spans = await normalizer.normalize(events);

    // Verify span count
    assert.ok(spans.length >= 10, `Expected at least 10 spans, got ${spans.length}`);

    // Write to storage
    await storage.writeSpans(spans);

    // Verify categories present
    const categories = new Set(spans.map(s => s.category));
    assert.ok(categories.has('WEBHOOK'));
    assert.ok(categories.has('MESSAGE'));
    assert.ok(categories.has('SESSION'));
    assert.ok(categories.has('AGENT'));
    assert.ok(categories.has('MODEL'));
    assert.ok(categories.has('TOOL'));

    // Verify lifecycle span exists
    const lifecycleSpan = spans.find(s => s.category === 'AGENT' && s.subtype === 'lifecycle');
    assert.ok(lifecycleSpan, 'Lifecycle span should exist');
    assert.strictEqual(lifecycleSpan.runId, 'run_001');

    // Verify model spans
    const modelSpans = spans.filter(s => s.category === 'MODEL');
    assert.strictEqual(modelSpans.length, 2);
    assert.strictEqual(modelSpans[0].model_name, 'claude-opus-4');
    assert.ok(modelSpans[0].costUsd > 0);
    assert.ok(modelSpans[0].token_input > 0);

    // Verify tool span
    const toolSpans = spans.filter(s => s.category === 'TOOL');
    assert.strictEqual(toolSpans.length, 1);
    assert.strictEqual(toolSpans[0].tool_name, 'Read');
    assert.strictEqual(toolSpans[0].status, 'success');

    // Verify parent-child relationships
    const modelSpan = modelSpans[0];
    const toolSpan = toolSpans[0];
    assert.strictEqual(modelSpan.parent_span_id, lifecycleSpan.record_id);
    assert.strictEqual(toolSpan.parent_span_id, lifecycleSpan.record_id);

    // This fixture overlaps the first model span and tool span in time, so
    // the normalizer keeps the lifecycle hierarchy but does not assert a
    // causal edge that would fail temporal validation.
    assert.strictEqual(toolSpan.caused_by_span_id, undefined);

    // Query by runId
    const runSpans = storage.readSpansByRun('run_001');
    assert.ok(runSpans.length >= 4);

    // Generate summary
    const traceId = spans[0].trace_id;
    await storage.writeTrace({
      trace_id: traceId,
      trace_name: 'Basic Trace',
      start_at: spans[0].start_at,
      end_at: spans[spans.length - 1].end_at,
      duration_ms: new Date(spans[spans.length - 1].end_at).getTime() - new Date(spans[0].start_at).getTime(),
      total_spans: spans.length,
    });

    const summary = storage.generateSummary(traceId);
    assert.ok(summary.total_cost > 0);
    assert.ok(summary.total_tokens > 0);
    assert.ok(summary.category_stats.MODEL);
    assert.ok(summary.category_stats.TOOL);

    storage.close();
    await fs.rm(traceDir, { recursive: true, force: true });
  });

  await t.test('should normalize multi-agent trace', async () => {
    const traceDir = path.join(TEST_DIR, 'multi-agent-trace');
    await fs.rm(traceDir, { recursive: true, force: true });

    // Load events
    const events = await loadFixture('multi-agent-trace-events.jsonl');
    assert.strictEqual(events.length, 24);

    // Initialize storage
    const storage = new TraceStorage(traceDir);
    await storage.initialize();

    // Normalize
    const normalizer = new Normalizer();
    const spans = await normalizer.normalize(events);

    // Verify multiple runs
    const runIds = new Set(spans.filter(s => s.runId).map(s => s.runId));
    assert.strictEqual(runIds.size, 3); // coordinator + 2 specialists

    // Verify lifecycle spans for each run
    const lifecycleSpans = spans.filter(s => s.category === 'AGENT' && s.subtype === 'lifecycle');
    assert.strictEqual(lifecycleSpans.length, 3);

    // Verify coordinator run
    const coordinatorSpan = lifecycleSpans.find(s => s.runId === 'run_coordinator_001');
    assert.ok(coordinatorSpan);

    // Verify specialist runs
    const specialistASpan = lifecycleSpans.find(s => s.runId === 'run_specialist_a_001');
    const specialistBSpan = lifecycleSpans.find(s => s.runId === 'run_specialist_b_001');
    assert.ok(specialistASpan);
    assert.ok(specialistBSpan);

    // Verify model calls in each run
    const coordinatorModels = spans.filter(s => s.category === 'MODEL' && s.runId === 'run_coordinator_001');
    const specialistAModels = spans.filter(s => s.category === 'MODEL' && s.runId === 'run_specialist_a_001');
    const specialistBModels = spans.filter(s => s.category === 'MODEL' && s.runId === 'run_specialist_b_001');

    assert.strictEqual(coordinatorModels.length, 2);
    assert.strictEqual(specialistAModels.length, 2);
    assert.strictEqual(specialistBModels.length, 2);

    // Verify tool calls
    const toolSpans = spans.filter(s => s.category === 'TOOL');
    assert.strictEqual(toolSpans.length, 2); // Grep and Read

    // Write to storage
    await storage.writeSpans(spans);

    // Query by session
    const sessionSpans = storage.readSpansBySession('agent:slack:session_002');
    assert.ok(sessionSpans.length > 0);

    // Generate summary
    const traceId = spans[0].trace_id;
    const summary = storage.generateSummary(traceId);
    assert.ok(summary.total_cost > 0);
    assert.strictEqual(summary.category_stats.AGENT.count, 3); // 3 lifecycle spans

    storage.close();
    await fs.rm(traceDir, { recursive: true, force: true });
  });

  await t.test('should normalize error trace', async () => {
    const traceDir = path.join(TEST_DIR, 'error-trace');
    await fs.rm(traceDir, { recursive: true, force: true });

    // Load events
    const events = await loadFixture('error-trace-events.jsonl');
    assert.strictEqual(events.length, 18);

    // Initialize storage
    const storage = new TraceStorage(traceDir);
    await storage.initialize();

    // Normalize
    const normalizer = new Normalizer();
    const spans = await normalizer.normalize(events);

    // Verify lifecycle span has error status
    const lifecycleSpan = spans.find(s => s.category === 'AGENT' && s.subtype === 'lifecycle');
    assert.ok(lifecycleSpan);
    assert.strictEqual(lifecycleSpan.status, 'error');

    // Verify tool errors
    const toolSpans = spans.filter(s => s.category === 'TOOL');
    const toolExecutionSpans = toolSpans.filter(s => s.subtype === 'tool_execution');
    assert.strictEqual(toolSpans.length, 3);
    assert.strictEqual(toolExecutionSpans.length, 2);
    assert.strictEqual(toolExecutionSpans[0].status, 'error');
    assert.strictEqual(toolExecutionSpans[1].status, 'error');

    // Verify tool.loop event
    const toolLoopSpan = spans.find(s => s.subtype === 'tool.loop');
    assert.ok(toolLoopSpan);

    // Verify session.stuck event
    const sessionStuckSpan = spans.find(s => s.subtype === 'session.stuck');
    assert.ok(sessionStuckSpan);

    // Verify webhook.error event
    const webhookErrorSpan = spans.find(s => s.subtype === 'webhook.error');
    assert.ok(webhookErrorSpan);

    // Write to storage
    await storage.writeSpans(spans);

    // Query error spans
    const errorSpans = spans.filter(s => s.status === 'error');
    assert.ok(errorSpans.length >= 3);

    storage.close();
    await fs.rm(traceDir, { recursive: true, force: true });
  });

  await t.test('should normalize queue trace', async () => {
    const traceDir = path.join(TEST_DIR, 'queue-trace');
    await fs.rm(traceDir, { recursive: true, force: true });

    // Load events
    const events = await loadFixture('queue-trace-events.jsonl');
    assert.strictEqual(events.length, 16);

    // Initialize storage
    const storage = new TraceStorage(traceDir);
    await storage.initialize();

    // Normalize
    const normalizer = new Normalizer();
    const spans = await normalizer.normalize(events);

    // Verify queue events
    const queueSpans = spans.filter(s => s.category === 'QUEUE');
    assert.strictEqual(queueSpans.length, 2);
    assert.strictEqual(queueSpans[0].subtype, 'queue.lane.enqueue');
    assert.strictEqual(queueSpans[1].subtype, 'queue.lane.dequeue');

    // Verify run.attempt event
    const runAttemptSpan = spans.find(s => s.category === 'RUN');
    assert.ok(runAttemptSpan);
    assert.strictEqual(runAttemptSpan.subtype, 'run.attempt');

    // Verify system heartbeat
    const heartbeatSpan = spans.find(s => s.category === 'SYSTEM');
    assert.ok(heartbeatSpan);
    assert.strictEqual(heartbeatSpan.subtype, 'diagnostic.heartbeat');

    // Write to storage
    await storage.writeSpans(spans);

    // Query by category
    const queueSpansFromDb = storage.readSpansByCategory(spans[0].trace_id, 'QUEUE');
    assert.strictEqual(queueSpansFromDb.length, 2);

    storage.close();
    await fs.rm(traceDir, { recursive: true, force: true });
  });

  await t.test('should validate all test traces', async () => {
    const fixtures = [
      'basic-trace-events.jsonl',
      'multi-agent-trace-events.jsonl',
      'error-trace-events.jsonl',
      'queue-trace-events.jsonl',
    ];

    const normalizer = new Normalizer();

    for (const fixture of fixtures) {
      const events = await loadFixture(fixture);
      const spans = await normalizer.normalize(events);

      // Validate each span
      for (const span of spans) {
        const validation = normalizer.validateSpan(span);
        if (!validation.valid) {
          console.error(`Invalid span in ${fixture}:`, span.record_id, validation.errors);
        }
        assert.strictEqual(validation.valid, true, `Span ${span.record_id} in ${fixture} should be valid`);
      }

      // Validate relationships
      const relationshipErrors = validateRelationships(spans);
      assert.strictEqual(relationshipErrors.length, 0, `${fixture} should have valid relationships`);
    }
  });
});

/**
 * Helper: Validate relationships
 */
function validateRelationships(spans) {
  const errors = [];
  const spanMap = new Map(spans.map(s => [s.record_id, s]));

  for (const span of spans) {
    // Validate parent exists
    if (span.parent_span_id) {
      const parent = spanMap.get(span.parent_span_id);
      if (!parent) {
        errors.push(`Span ${span.record_id} references non-existent parent ${span.parent_span_id}`);
      } else {
        // Validate temporal containment
        if (parent.start_at > span.start_at || parent.end_at < span.end_at) {
          errors.push(`Parent ${parent.record_id} does not temporally contain child ${span.record_id}`);
        }
      }
    }

    // Validate caused_by exists
    if (span.caused_by_span_id) {
      const cause = spanMap.get(span.caused_by_span_id);
      if (!cause) {
        errors.push(`Span ${span.record_id} references non-existent cause ${span.caused_by_span_id}`);
      }
    }
  }

  return errors;
}
