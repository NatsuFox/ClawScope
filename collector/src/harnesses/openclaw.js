import fs from 'fs/promises';
import path from 'path';

import { Normalizer } from '../normalizer.js';
import { buildTraceMetadata, readJsonlIfExists } from './base.js';

function classifyOpenClawEvents(events) {
  const diagnosticTypes = new Set(['WEBHOOK', 'MESSAGE', 'SESSION', 'QUEUE', 'SYSTEM']);
  const categoryMap = {
    'model.usage': 'MODEL',
    tool_start: 'TOOL',
    tool_end: 'TOOL',
    tool_result: 'TOOL',
    'tool.loop': 'TOOL',
    'lifecycle.start': 'AGENT',
    'lifecycle.end': 'AGENT',
    'lifecycle.error': 'AGENT',
    lifecycle: 'AGENT',
    'webhook.received': 'WEBHOOK',
    'webhook.processed': 'WEBHOOK',
    'webhook.error': 'WEBHOOK',
    'message.queued': 'MESSAGE',
    'message.processed': 'MESSAGE',
    'session.state': 'SESSION',
    'session.stuck': 'SESSION',
    'queue.lane.enqueue': 'QUEUE',
    'queue.lane.dequeue': 'QUEUE',
    'run.attempt': 'RUN',
    'diagnostic.heartbeat': 'SYSTEM',
  };

  const diagnostic = [];
  const agent = [];
  for (const event of events) {
    const category = categoryMap[event.type];
    if (diagnosticTypes.has(category)) {
      diagnostic.push(event);
    } else {
      agent.push(event);
    }
  }
  return { diagnostic, agent };
}

export const openClawHarness = {
  name: 'openclaw',

  async discoverSessions({ root } = {}) {
    const baseDir = path.resolve(root || '.');
    const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        harness: 'openclaw',
        session_id: entry.name,
        path: path.join(baseDir, entry.name),
      }));
  },

  async loadSession(inputPath) {
    const absolutePath = path.resolve(inputPath);
    const diagnostic = await readJsonlIfExists(path.join(absolutePath, 'diagnostic_events.jsonl'));
    const agent = await readJsonlIfExists(path.join(absolutePath, 'agent_events.jsonl'));
    const events = [...diagnostic, ...agent];
    return {
      harness: 'openclaw',
      inputPath: absolutePath,
      sessionId: path.basename(absolutePath),
      rawFiles: [
        { filename: 'diagnostic_events.jsonl', records: diagnostic },
        { filename: 'agent_events.jsonl', records: agent },
      ],
      events,
    };
  },

  async normalizeSession(raw) {
    const normalizer = new Normalizer();
    const spans = await normalizer.normalize(raw.events);
    const trace = buildTraceMetadata({
      trace_id: spans[0]?.trace_id || raw.sessionId,
      trace_name: `OpenClaw trace ${raw.sessionId}`,
      spans,
      source_harness: 'openclaw',
      source_session_id: raw.sessionId,
      source_path: raw.inputPath,
    });
    return { spans, trace, rawFiles: raw.rawFiles };
  },

  splitRawFiles(events) {
    const { diagnostic, agent } = classifyOpenClawEvents(events);
    return [
      { filename: 'diagnostic_events.jsonl', records: diagnostic },
      { filename: 'agent_events.jsonl', records: agent },
    ];
  },
};
