import fs from 'fs/promises';
import path from 'path';

import {
  buildTraceMetadata,
  getDefaultCodexSessionsDir,
  makeSpan,
  normalizeRange,
  readJsonl,
  readJsonlIfExists,
  safeJsonParse,
  snippet,
  statSafe,
  toTimestampMs,
  walkFiles,
} from './base.js';

const DEFAULT_INDEX_PATH = path.join(process.env.HOME || '/root', '.codex', 'session_index.jsonl');
const DEFAULT_HISTORY_PATH = path.join(process.env.HOME || '/root', '.codex', 'history.jsonl');

async function loadSessionIndex(indexPath = DEFAULT_INDEX_PATH) {
  const records = await readJsonlIfExists(indexPath);
  const index = new Map();
  for (const record of records) {
    if (record.id && !index.has(record.id)) {
      index.set(record.id, record);
    }
  }
  return index;
}

async function loadHistory(historyPath = DEFAULT_HISTORY_PATH) {
  const records = await readJsonlIfExists(historyPath);
  const history = new Map();
  for (const record of records) {
    if (!record.session_id) {
      continue;
    }
    if (!history.has(record.session_id)) {
      history.set(record.session_id, []);
    }
    history.get(record.session_id).push(record);
  }
  return history;
}

export const codexHarness = {
  name: 'codex',

  async discoverSessions({ root = getDefaultCodexSessionsDir(), limit = 50 } = {}) {
    const files = await walkFiles(
      root,
      (filePath, entry) => entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.startsWith('rollout-')
    ).catch(() => []);

    const sessions = [];
    for (const filePath of files) {
      const stats = await statSafe(filePath);
      sessions.push({
        harness: 'codex',
        session_id: path.basename(filePath, '.jsonl'),
        path: filePath,
        updated_at: stats?.mtime?.toISOString() || null,
      });
    }

    sessions.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    return sessions.slice(0, limit);
  },

  async loadSession(inputPath, options = {}) {
    const absolutePath = path.resolve(inputPath);
    const records = await readJsonl(absolutePath);
    const sessionMeta = records.find((record) => record.type === 'session_meta')?.payload || {};
    const turnContext = records.find((record) => record.type === 'turn_context')?.payload || {};
    const sessionIndex = await loadSessionIndex(options.indexPath);
    const history = await loadHistory(options.historyPath);

    const sessionId = sessionMeta.id || path.basename(absolutePath, '.jsonl');
    const indexEntry = sessionIndex.get(sessionId);

    return {
      harness: 'codex',
      inputPath: absolutePath,
      sessionId,
      sessionMeta,
      turnContext,
      indexEntry,
      history: history.get(sessionId) || [],
      records,
      rawFiles: [{ filename: path.basename(absolutePath), records }],
    };
  },

  async normalizeSession(raw) {
    const spans = [];
    const pendingTurns = new Map();
    const pendingCalls = new Map();
    const sessionId = raw.sessionId;
    let currentTurnId = raw.turnContext.turn_id || null;

    for (const record of raw.records) {
      const timestampMs = toTimestampMs(record.timestamp);
      const payload = record.payload || {};

      if (record.type === 'event_msg') {
        if (payload.type === 'task_started') {
          pendingTurns.set(payload.turn_id, {
            startMs: timestampMs,
            payload,
          });
          currentTurnId = payload.turn_id;
        } else if (payload.type === 'task_complete' || payload.type === 'turn_aborted') {
          const pendingTurn = pendingTurns.get(payload.turn_id || currentTurnId) || {
            startMs: timestampMs,
            payload: {},
          };
          const { start_at, end_at, duration_ms } = normalizeRange(
            pendingTurn.startMs,
            timestampMs,
            1
          );
          spans.push(
            makeSpan({
              record_id: `span_codex_turn_${payload.turn_id || currentTurnId || timestampMs}`,
              trace_id: sessionId,
              category: 'AGENT',
              subtype: payload.type,
              name: payload.type === 'task_complete' ? 'Codex Turn' : 'Codex Turn Aborted',
              start_at,
              end_at,
              duration_ms,
              status: payload.type === 'task_complete' ? 'success' : 'cancelled',
              fidelity: 'exact',
              runId: payload.turn_id || currentTurnId,
              sessionKey: sessionId,
              attributes: payload,
            })
          );
          pendingTurns.delete(payload.turn_id || currentTurnId);
          if ((payload.turn_id || currentTurnId) === currentTurnId) {
            currentTurnId = null;
          }
        } else if (payload.type === 'user_message') {
          const { start_at, end_at, duration_ms } = normalizeRange(timestampMs, timestampMs, 1);
          spans.push(
            makeSpan({
              record_id: `span_codex_user_${timestampMs}_${spans.length}`,
              trace_id: sessionId,
              category: 'MESSAGE',
              subtype: 'user.prompt',
              name: `User: ${snippet(payload.message)}`,
              start_at,
              end_at,
              duration_ms,
              status: 'success',
              fidelity: 'exact',
              runId: currentTurnId,
              sessionKey: sessionId,
              attributes: {
                text: payload.message,
                images: payload.images,
                local_images: payload.local_images,
                text_elements: payload.text_elements,
              },
            })
          );
        } else if (payload.type === 'agent_message') {
          const { start_at, end_at, duration_ms } = normalizeRange(timestampMs, timestampMs, 1);
          spans.push(
            makeSpan({
              record_id: `span_codex_agent_message_${timestampMs}_${spans.length}`,
              trace_id: sessionId,
              category: 'MESSAGE',
              subtype: `assistant.${payload.phase || 'message'}`,
              name: `Assistant: ${snippet(payload.message)}`,
              start_at,
              end_at,
              duration_ms,
              status: 'success',
              fidelity: 'exact',
              runId: currentTurnId,
              sessionKey: sessionId,
              attributes: {
                text: payload.message,
                phase: payload.phase,
              },
            })
          );
        } else if (payload.type === 'token_count') {
          const { start_at, end_at, duration_ms } = normalizeRange(timestampMs, timestampMs, 1);
          spans.push(
            makeSpan({
              record_id: `span_codex_token_count_${timestampMs}`,
              trace_id: sessionId,
              category: 'SYSTEM',
              subtype: 'token_count',
              name: 'Token Count Update',
              start_at,
              end_at,
              duration_ms,
              status: 'success',
              fidelity: 'exact',
              sessionKey: sessionId,
              attributes: payload,
            })
          );
        }
      } else if (record.type === 'turn_context') {
        const { start_at, end_at, duration_ms } = normalizeRange(timestampMs, timestampMs, 1);
        currentTurnId = payload.turn_id || currentTurnId;
        spans.push(
          makeSpan({
            record_id: `span_codex_context_${payload.turn_id || timestampMs}`,
            trace_id: sessionId,
            category: 'CONTEXT',
            subtype: 'turn_context',
            name: 'Turn Context',
            start_at,
            end_at,
            duration_ms,
            status: 'success',
            fidelity: 'exact',
            runId: payload.turn_id || currentTurnId,
            sessionKey: sessionId,
            attributes: payload,
          })
        );
      } else if (record.type === 'response_item') {
        if (payload.type === 'function_call') {
          pendingCalls.set(payload.call_id, {
            startMs: timestampMs,
            call: payload,
            turnId: currentTurnId,
          });
        } else if (payload.type === 'function_call_output') {
          const pendingCall = pendingCalls.get(payload.call_id);
          const { start_at, end_at, duration_ms } = normalizeRange(
            pendingCall?.startMs ?? timestampMs,
            timestampMs,
            1
          );
          spans.push(
            makeSpan({
              record_id: `span_codex_tool_${payload.call_id}`,
              trace_id: sessionId,
              category: 'TOOL',
              subtype: 'function_call',
              name: `Tool: ${pendingCall?.call?.name || 'Unknown'}`,
              start_at,
              end_at,
              duration_ms,
              status: 'success',
              fidelity: pendingCall ? 'exact' : 'inferred',
              runId: pendingCall?.turnId || currentTurnId,
              sessionKey: sessionId,
              toolCallId: payload.call_id,
              tool_name: pendingCall?.call?.name,
              attributes: {
                arguments: safeJsonParse(pendingCall?.call?.arguments),
                output: safeJsonParse(payload.output),
              },
            })
          );
          pendingCalls.delete(payload.call_id);
        } else if (payload.type === 'web_search_call') {
          const { start_at, end_at, duration_ms } = normalizeRange(timestampMs, timestampMs, 1);
          spans.push(
            makeSpan({
              record_id: `span_codex_web_${timestampMs}_${spans.length}`,
              trace_id: sessionId,
              category: 'TOOL',
              subtype: 'web_search_call',
              name: `Tool: web_search.${payload.action?.type || 'unknown'}`,
              start_at,
              end_at,
              duration_ms,
              status: payload.status || 'success',
              fidelity: 'derived',
              runId: currentTurnId,
              sessionKey: sessionId,
              tool_name: 'web_search',
              attributes: payload,
            })
          );
        } else if (payload.type === 'reasoning') {
          const { start_at, end_at, duration_ms } = normalizeRange(timestampMs, timestampMs, 1);
          spans.push(
            makeSpan({
              record_id: `span_codex_reasoning_${timestampMs}_${spans.length}`,
              trace_id: sessionId,
              category: 'CONTEXT',
              subtype: 'reasoning',
              name: 'Reasoning',
              start_at,
              end_at,
              duration_ms,
              status: 'success',
              fidelity: 'derived',
              runId: currentTurnId,
              sessionKey: sessionId,
              attributes: payload,
            })
          );
        }
      }
    }

    for (const [callId, pendingCall] of pendingCalls) {
      const { start_at, end_at, duration_ms } = normalizeRange(
        pendingCall.startMs,
        pendingCall.startMs,
        1
      );
      spans.push(
        makeSpan({
          record_id: `span_codex_tool_${callId}`,
          trace_id: sessionId,
          category: 'TOOL',
          subtype: 'function_call',
          name: `Tool: ${pendingCall.call?.name || 'Unknown'}`,
          start_at,
          end_at,
          duration_ms,
          status: 'timeout',
          fidelity: 'inferred',
          runId: pendingCall.turnId,
          sessionKey: sessionId,
          toolCallId: callId,
          tool_name: pendingCall.call?.name,
          attributes: {
            arguments: safeJsonParse(pendingCall.call?.arguments),
          },
        })
      );
    }

    spans.sort((a, b) => a.start_at.localeCompare(b.start_at));

    const trace = buildTraceMetadata({
      trace_id: sessionId,
      trace_name:
        raw.indexEntry?.thread_name || raw.sessionMeta.agent_nickname || `Codex ${path.basename(raw.inputPath)}`,
      spans,
      source_harness: 'codex',
      source_session_id: sessionId,
      source_path: raw.inputPath,
      cwd: raw.sessionMeta.cwd || raw.turnContext.cwd,
      git_branch: raw.sessionMeta.git?.branch || null,
      attributes: {
        cli_version: raw.sessionMeta.cli_version,
        model_provider: raw.sessionMeta.model_provider,
        source: raw.sessionMeta.source,
        originator: raw.sessionMeta.originator,
        latest_user_prompts: raw.history.slice(-5),
      },
    });

    return { spans, trace, rawFiles: raw.rawFiles };
  },
};
