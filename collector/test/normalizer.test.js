/**
 * Normalizer Tests
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { Normalizer } from '../src/normalizer.js';

test('Normalizer', async (t) => {
  let normalizer;

  t.beforeEach(() => {
    normalizer = new Normalizer();
  });

  await t.test('should normalize model.usage event', async () => {
    const events = [
      {
        type: 'model.usage',
        ts: 1710778500000,
        runId: 'run_001',
        sessionKey: 'agent:discord:session_123',
        model: 'claude-opus-4',
        provider: 'anthropic',
        tokens: { input: 100, output: 50, cacheRead: 25, total: 150 },
        costUsd: 0.005,
        durationMs: 2500,
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].category, 'MODEL');
    assert.strictEqual(spans[0].subtype, 'model.usage');
    assert.strictEqual(spans[0].model_name, 'claude-opus-4');
    assert.strictEqual(spans[0].provider, 'anthropic');
    assert.strictEqual(spans[0].token_input, 100);
    assert.strictEqual(spans[0].token_output, 50);
    assert.strictEqual(spans[0].token_cache, 25);
    assert.strictEqual(spans[0].costUsd, 0.005);
    assert.strictEqual(spans[0].duration_ms, 2500);
    assert.strictEqual(spans[0].fidelity, 'exact');
  });

  await t.test('should normalize tool execution from start/end events', async () => {
    const events = [
      {
        type: 'tool_start',
        ts: 1710778500000,
        runId: 'run_001',
        toolCallId: 'toolu_001',
        data: { toolName: 'Bash', args: { command: 'ls -la' } }
      },
      {
        type: 'tool_end',
        ts: 1710778502500,
        runId: 'run_001',
        toolCallId: 'toolu_001',
        data: { durationMs: 2500 }
      },
      {
        type: 'tool_result',
        ts: 1710778502550,
        runId: 'run_001',
        toolCallId: 'toolu_001',
        data: { result: 'file1.txt\nfile2.txt', isError: false }
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].category, 'TOOL');
    assert.strictEqual(spans[0].subtype, 'tool_execution');
    assert.strictEqual(spans[0].tool_name, 'Bash');
    assert.strictEqual(spans[0].toolCallId, 'toolu_001');
    assert.strictEqual(spans[0].duration_ms, 2500);
    assert.strictEqual(spans[0].status, 'success');
    assert.strictEqual(spans[0].fidelity, 'exact');
  });

  await t.test('should normalize lifecycle events', async () => {
    const events = [
      {
        type: 'lifecycle',
        ts: 1710778500000,
        runId: 'run_001',
        sessionKey: 'agent:discord:session_123',
        stream: 'lifecycle',
        data: { phase: 'start', startedAt: 1710778500000 }
      },
      {
        type: 'lifecycle',
        ts: 1710778510000,
        runId: 'run_001',
        sessionKey: 'agent:discord:session_123',
        stream: 'lifecycle',
        data: { phase: 'end', endedAt: 1710778510000 }
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].category, 'AGENT');
    assert.strictEqual(spans[0].subtype, 'lifecycle');
    assert.strictEqual(spans[0].duration_ms, 10000);
    assert.strictEqual(spans[0].status, 'success');
    assert.strictEqual(spans[0].fidelity, 'exact');
  });

  await t.test('should normalize webhook events', async () => {
    const events = [
      {
        type: 'webhook.received',
        ts: 1710778500000,
        channel: 'discord',
        updateType: 'message',
        data: { chatId: 'chat_123' }
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].category, 'WEBHOOK');
    assert.strictEqual(spans[0].subtype, 'webhook.received');
    assert.strictEqual(spans[0].channel, 'discord');
    assert.strictEqual(spans[0].updateType, 'message');
  });

  await t.test('should normalize message events', async () => {
    const events = [
      {
        type: 'message.queued',
        ts: 1710778500000,
        channel: 'discord',
        sessionKey: 'agent:discord:session_123',
        queueDepth: 3
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].category, 'MESSAGE');
    assert.strictEqual(spans[0].subtype, 'message.queued');
    assert.strictEqual(spans[0].channel, 'discord');
    assert.strictEqual(spans[0].queueDepth, 3);
  });

  await t.test('should normalize session events', async () => {
    const events = [
      {
        type: 'session.state',
        ts: 1710778500000,
        sessionKey: 'agent:discord:session_123',
        queueDepth: 2,
        data: { prevState: 'idle', state: 'processing', reason: 'message_received' }
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].category, 'SESSION');
    assert.strictEqual(spans[0].subtype, 'session.state');
    assert.strictEqual(spans[0].sessionKey, 'agent:discord:session_123');
    assert.strictEqual(spans[0].queueDepth, 2);
  });

  await t.test('should normalize queue events', async () => {
    const events = [
      {
        type: 'queue.lane.enqueue',
        ts: 1710778500000,
        lane: 'default',
        queueDepth: 5
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].category, 'QUEUE');
    assert.strictEqual(spans[0].subtype, 'queue.lane.enqueue');
    assert.strictEqual(spans[0].lane, 'default');
    assert.strictEqual(spans[0].queueDepth, 5);
  });

  await t.test('should establish parent-child relationships', async () => {
    const events = [
      {
        type: 'lifecycle',
        ts: 1710778500000,
        runId: 'run_001',
        data: { phase: 'start' }
      },
      {
        type: 'model.usage',
        ts: 1710778501000,
        runId: 'run_001',
        model: 'claude-opus-4',
        durationMs: 2000
      },
      {
        type: 'tool_start',
        ts: 1710778503500,
        runId: 'run_001',
        toolCallId: 'toolu_001',
        data: { toolName: 'Bash' }
      },
      {
        type: 'tool_end',
        ts: 1710778505000,
        runId: 'run_001',
        toolCallId: 'toolu_001'
      },
      {
        type: 'lifecycle',
        ts: 1710778510000,
        runId: 'run_001',
        data: { phase: 'end' }
      }
    ];

    const spans = await normalizer.normalize(events);

    // Find spans
    const lifecycleSpan = spans.find(s => s.category === 'AGENT');
    const modelSpan = spans.find(s => s.category === 'MODEL');
    const toolSpan = spans.find(s => s.category === 'TOOL');

    // Verify hierarchy
    assert.ok(lifecycleSpan);
    assert.ok(modelSpan);
    assert.ok(toolSpan);

    // Model and tool should be children of lifecycle
    assert.strictEqual(modelSpan.parent_span_id, lifecycleSpan.record_id);
    assert.strictEqual(toolSpan.parent_span_id, lifecycleSpan.record_id);
  });

  await t.test('should establish causal relationships', async () => {
    const events = [
      {
        type: 'model.usage',
        ts: 1710778500000,
        runId: 'run_001',
        model: 'claude-opus-4',
        durationMs: 2000
      },
      {
        type: 'tool_start',
        ts: 1710778502500,
        runId: 'run_001',
        toolCallId: 'toolu_001',
        data: { toolName: 'Bash' }
      },
      {
        type: 'tool_end',
        ts: 1710778504000,
        runId: 'run_001',
        toolCallId: 'toolu_001'
      }
    ];

    const spans = await normalizer.normalize(events);

    const modelSpan = spans.find(s => s.category === 'MODEL');
    const toolSpan = spans.find(s => s.category === 'TOOL');

    // Tool should be caused by model
    assert.strictEqual(toolSpan.caused_by_span_id, modelSpan.record_id);
  });

  await t.test('should deduplicate events', async () => {
    const events = [
      {
        type: 'model.usage',
        ts: 1710778500000,
        runId: 'run_001',
        seq: 1,
        model: 'claude-opus-4',
        durationMs: 2000
      },
      {
        type: 'model.usage',
        ts: 1710778500000,
        runId: 'run_001',
        seq: 1,
        model: 'claude-opus-4',
        durationMs: 2000
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
  });

  await t.test('should reorder out-of-order events', async () => {
    const events = [
      {
        type: 'tool_end',
        ts: 1710778502500,
        runId: 'run_001',
        toolCallId: 'toolu_001'
      },
      {
        type: 'tool_start',
        ts: 1710778500000,
        runId: 'run_001',
        toolCallId: 'toolu_001',
        data: { toolName: 'Bash' }
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].category, 'TOOL');
    assert.strictEqual(spans[0].duration_ms, 2500);
  });

  await t.test('should handle missing end events', async () => {
    const events = [
      {
        type: 'tool_start',
        ts: 1710778500000,
        runId: 'run_001',
        toolCallId: 'toolu_001',
        data: { toolName: 'Bash' }
      }
    ];

    const spans = await normalizer.normalize(events);

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].category, 'TOOL');
    assert.strictEqual(spans[0].status, 'timeout');
    assert.strictEqual(spans[0].fidelity, 'inferred');
    assert.strictEqual(spans[0].duration_ms, 30000); // default timeout
  });

  await t.test('should validate spans', () => {
    const validSpan = {
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
      attributes: {}
    };

    const validation = normalizer.validateSpan(validSpan);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  await t.test('should detect invalid spans', () => {
    const invalidSpan = {
      record_id: 'span_001',
      trace_id: 'trace_001',
      category: 'INVALID_CATEGORY',
      subtype: 'test',
      name: 'Test',
      start_at: '2026-03-18T10:00:02.500Z',
      end_at: '2026-03-18T10:00:00.000Z', // end before start
      duration_ms: 2500,
      status: 'success',
      fidelity: 'invalid_fidelity',
      attributes: {}
    };

    const validation = normalizer.validateSpan(invalidSpan);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.length > 0);
  });
});
