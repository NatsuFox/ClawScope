import fs from 'fs/promises';
import path from 'path';

import {
  buildTraceMetadata,
  decodeClaudeProjectDir,
  getDefaultClaudeProjectsDir,
  makeSpan,
  normalizeRange,
  readJsonl,
  snippet,
  statSafe,
  toTimestampMs,
} from './base.js';

function parseContentBlocks(content) {
  if (Array.isArray(content)) {
    return content;
  }
  return [];
}

function extractTextContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function isCommandNoise(text) {
  return (
    !text ||
    text.startsWith('<command-name>') ||
    text.startsWith('<local-command-stdout>') ||
    text.startsWith('[Request interrupted by user')
  );
}

function isToolResultRecord(record) {
  const content = record?.message?.content;
  return Array.isArray(content) && content.some((block) => block?.type === 'tool_result');
}

function deduplicateAssistantEntries(records) {
  const lastIndexByRequestId = new Map();
  records.forEach((record, index) => {
    if (record.type === 'assistant' && record.requestId) {
      lastIndexByRequestId.set(record.requestId, index);
    }
  });

  return records.filter((record, index) => {
    if (record.type !== 'assistant' || !record.requestId) {
      return true;
    }
    return lastIndexByRequestId.get(record.requestId) === index;
  });
}

function buildModelSpan(record, sessionId, previousTimestampMs) {
  const timestampMs = toTimestampMs(record.timestamp);
  if (timestampMs === null) {
    return null;
  }

  const startMs =
    previousTimestampMs !== null && previousTimestampMs < timestampMs
      ? previousTimestampMs
      : timestampMs;
  const { start_at, end_at, duration_ms } = normalizeRange(startMs, timestampMs, 1);
  const text = extractTextContent(record.message?.content);
  const usage = record.message?.usage || {};

  return makeSpan({
    record_id: `span_claude_model_${record.requestId || record.uuid || timestampMs}`,
    trace_id: sessionId,
    category: 'MODEL',
    subtype: 'assistant.response',
    name: `Assistant: ${snippet(text || record.message?.model || 'response')}`,
    start_at,
    end_at,
    duration_ms,
    status: 'success',
    fidelity: 'derived',
    runId: record.requestId || record.uuid,
    sessionKey: sessionId,
    model_name: record.message?.model,
    token_reasoning:
      usage.reasoning_tokens ??
      usage.thinking_tokens ??
      usage.output_tokens_details?.reasoning_tokens,
    token_input: usage.input_tokens,
    token_output: usage.output_tokens,
    token_cache:
      (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0) || undefined,
    costUsd: record.costUSD,
    attributes: {
      assistant_uuid: record.uuid,
      requestId: record.requestId,
      stop_reason: record.message?.stop_reason,
      entrypoint: record.entrypoint,
      gitBranch: record.gitBranch,
      version: record.version,
      text,
    },
  });
}

function buildSystemSpan(record, sessionId) {
  const timestampMs = toTimestampMs(record.timestamp);
  if (timestampMs === null) {
    return null;
  }

  const subtype = record.subtype || 'system';
  const durationMs =
    subtype === 'turn_duration' && typeof record.durationMs === 'number' ? record.durationMs : 1;
  const startMs = subtype === 'turn_duration' ? timestampMs - durationMs : timestampMs;
  const { start_at, end_at, duration_ms } = normalizeRange(startMs, timestampMs, durationMs);

  return makeSpan({
    record_id: `span_claude_system_${record.uuid || timestampMs}`,
    trace_id: sessionId,
    category: 'SYSTEM',
    subtype,
    name: `System: ${subtype}`,
    start_at,
    end_at,
    duration_ms,
    status: 'success',
    fidelity: subtype === 'turn_duration' ? 'exact' : 'derived',
    sessionKey: sessionId,
    attributes: {
      content: record.content,
      level: record.level,
      isMeta: record.isMeta,
    },
  });
}

function buildContextSpan(record, sessionId) {
  const timestampMs = toTimestampMs(record.timestamp) || Date.now();
  const { start_at, end_at, duration_ms } = normalizeRange(timestampMs, timestampMs, 1);
  return makeSpan({
    record_id: `span_claude_context_${record.leafUuid || timestampMs}`,
    trace_id: sessionId,
    category: 'CONTEXT',
    subtype: 'summary',
    name: 'Context Compaction Summary',
    start_at,
    end_at,
    duration_ms,
    status: 'success',
    fidelity: 'exact',
    sessionKey: sessionId,
    attributes: {
      summary: record.summary,
      leafUuid: record.leafUuid,
    },
  });
}

function buildQueueSpan(record, sessionId) {
  const timestampMs = toTimestampMs(record.timestamp) || Date.now();
  const { start_at, end_at, duration_ms } = normalizeRange(timestampMs, timestampMs, 1);
  return makeSpan({
    record_id: `span_claude_queue_${record.operation || timestampMs}`,
    trace_id: sessionId,
    category: 'QUEUE',
    subtype: `queue.${record.operation || 'operation'}`,
    name: `Queue: ${record.operation || 'operation'}`,
    start_at,
    end_at,
    duration_ms,
    status: 'success',
    fidelity: 'derived',
    sessionKey: sessionId,
    attributes: {
      operation: record.operation,
    },
  });
}

function buildMessageSpan(record, sessionId) {
  const text = extractTextContent(record.message?.content);
  if (isCommandNoise(text)) {
    return null;
  }
  const timestampMs = toTimestampMs(record.timestamp);
  if (timestampMs === null) {
    return null;
  }
  const { start_at, end_at, duration_ms } = normalizeRange(timestampMs, timestampMs, 1);
  return makeSpan({
    record_id: `span_claude_message_${record.uuid || timestampMs}`,
    trace_id: sessionId,
    category: 'MESSAGE',
    subtype: 'user.prompt',
    name: `User: ${snippet(text)}`,
    start_at,
    end_at,
    duration_ms,
    status: 'success',
    fidelity: 'exact',
    sessionKey: sessionId,
    attributes: {
      text,
      promptId: record.promptId,
      permissionMode: record.permissionMode,
    },
  });
}

export const claudeCodeHarness = {
  name: 'claude-code',

  async discoverSessions({ root = getDefaultClaudeProjectsDir(), limit = 50 } = {}) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const sessions = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const projectDir = path.join(root, entry.name);
      const projectEntries = await fs.readdir(projectDir, { withFileTypes: true }).catch(() => []);
      for (const fileEntry of projectEntries) {
        if (!fileEntry.isFile() || !fileEntry.name.endsWith('.jsonl')) {
          continue;
        }
        const filePath = path.join(projectDir, fileEntry.name);
        const stats = await statSafe(filePath);
        sessions.push({
          harness: 'claude-code',
          session_id: path.basename(fileEntry.name, '.jsonl'),
          path: filePath,
          cwd: decodeClaudeProjectDir(entry.name),
          updated_at: stats?.mtime?.toISOString() || null,
        });
      }
    }

    sessions.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    return sessions.slice(0, limit);
  },

  async loadSession(inputPath) {
    const absolutePath = path.resolve(inputPath);
    const records = await readJsonl(absolutePath);
    const sessionId =
      records.find((record) => record.sessionId)?.sessionId || path.basename(absolutePath, '.jsonl');
    const cwd =
      records.find((record) => record.cwd)?.cwd ||
      decodeClaudeProjectDir(path.basename(path.dirname(absolutePath)));
    const gitBranch = records.find((record) => record.gitBranch)?.gitBranch || null;
    const version = records.find((record) => record.version)?.version || null;

    return {
      harness: 'claude-code',
      inputPath: absolutePath,
      sessionId,
      cwd,
      gitBranch,
      version,
      records,
      rawFiles: [{ filename: path.basename(absolutePath), records }],
    };
  },

  async normalizeSession(raw) {
    const records = deduplicateAssistantEntries(raw.records);
    const sessionId = raw.sessionId;
    const spans = [];
    const pendingTools = new Map();
    let previousTimestampMs = null;

    for (const record of records) {
      const timestampMs = toTimestampMs(record.timestamp);

      if (record.type === 'assistant' && record.message?.role === 'assistant') {
        const modelSpan = buildModelSpan(record, sessionId, previousTimestampMs);
        if (modelSpan) {
          spans.push(modelSpan);
        }

        const contentBlocks = parseContentBlocks(record.message?.content);
        for (const block of contentBlocks) {
          if (block?.type !== 'tool_use' || !block.id) {
            continue;
          }
          pendingTools.set(block.id, {
            block,
            startMs: timestampMs,
            requestId: record.requestId || record.uuid,
            assistantUuid: record.uuid,
          });
        }
      } else if (record.type === 'user') {
        if (isToolResultRecord(record)) {
          const resultBlocks = parseContentBlocks(record.message?.content).filter(
            (block) => block?.type === 'tool_result'
          );
          for (const resultBlock of resultBlocks) {
            const toolUseId = resultBlock.tool_use_id || record.sourceToolUseID;
            const pending = toolUseId ? pendingTools.get(toolUseId) : null;
            const { start_at, end_at, duration_ms } = normalizeRange(
              pending?.startMs ?? timestampMs,
              timestampMs,
              1
            );
            spans.push(
              makeSpan({
                record_id: `span_claude_tool_${toolUseId || record.uuid || timestampMs}`,
                trace_id: sessionId,
                category: 'TOOL',
                subtype: 'tool.execution',
                name: `Tool: ${pending?.block?.name || record.toolUseResult?.toolName || 'Unknown'}`,
                start_at,
                end_at,
                duration_ms,
                status:
                  resultBlock.is_error || record.toolUseResult?.isError || record.toolUseResult?.is_error
                    ? 'error'
                    : pending
                      ? 'success'
                      : 'inferred',
                fidelity: pending ? 'derived' : 'inferred',
                runId: pending?.requestId,
                sessionKey: sessionId,
                toolCallId: toolUseId,
                tool_name: pending?.block?.name || record.toolUseResult?.toolName,
                attributes: {
                  assistant_uuid: pending?.assistantUuid || record.sourceToolAssistantUUID,
                  input: pending?.block?.input,
                  tool_result: resultBlock.content,
                  toolUseResult: record.toolUseResult,
                },
              })
            );
            if (toolUseId) {
              pendingTools.delete(toolUseId);
            }
          }
        } else {
          const messageSpan = buildMessageSpan(record, sessionId);
          if (messageSpan) {
            spans.push(messageSpan);
          }
        }
      } else if (record.type === 'system') {
        const systemSpan = buildSystemSpan(record, sessionId);
        if (systemSpan) {
          spans.push(systemSpan);
        }
      } else if (record.type === 'summary') {
        spans.push(buildContextSpan(record, sessionId));
      } else if (record.type === 'queue-operation') {
        spans.push(buildQueueSpan(record, sessionId));
      }

      if (timestampMs !== null) {
        previousTimestampMs = timestampMs;
      }
    }

    for (const [toolUseId, pending] of pendingTools) {
      const { start_at, end_at, duration_ms } = normalizeRange(pending.startMs, pending.startMs, 1);
      spans.push(
        makeSpan({
          record_id: `span_claude_tool_${toolUseId}`,
          trace_id: sessionId,
          category: 'TOOL',
          subtype: 'tool.execution',
          name: `Tool: ${pending.block.name}`,
          start_at,
          end_at,
          duration_ms,
          status: 'timeout',
          fidelity: 'inferred',
          runId: pending.requestId,
          sessionKey: sessionId,
          toolCallId: toolUseId,
          tool_name: pending.block.name,
          attributes: {
            assistant_uuid: pending.assistantUuid,
            input: pending.block.input,
          },
        })
      );
    }

    spans.sort((a, b) => a.start_at.localeCompare(b.start_at));

    const trace = buildTraceMetadata({
      trace_id: sessionId,
      trace_name: `Claude Code: ${path.basename(raw.cwd || sessionId)}`,
      spans,
      source_harness: 'claude-code',
      source_session_id: sessionId,
      source_path: raw.inputPath,
      cwd: raw.cwd,
      git_branch: raw.gitBranch,
      attributes: {
        version: raw.version,
      },
    });

    return { spans, trace, rawFiles: raw.rawFiles };
  },
};
