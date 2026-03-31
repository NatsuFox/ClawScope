#!/usr/bin/env node

/**
 * ClawScope Viewer Server
 *
 * Simple HTTP server that exposes normalized traces to the browser-based viewer
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync as Database } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const TRACES_DIR = process.env.TRACES_DIR || path.join(__dirname, '../../traces');

// CORS headers for development
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function parseJson(value, fallback = {}) {
  if (typeof value !== 'string') {
    return value ?? fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTraceRow(trace) {
  if (!trace) {
    return null;
  }
  return {
    ...trace,
    supports_waterfall: Boolean(trace.supports_waterfall),
    supports_cost_analysis: Boolean(trace.supports_cost_analysis),
    supports_message_log: Boolean(trace.supports_message_log),
    supports_multi_agent: Boolean(trace.supports_multi_agent),
    attributes: parseJson(trace.attributes, {}),
  };
}

/**
 * Main request handler
 */
async function handleRequest(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // List available traces
    if (pathname === '/api/traces') {
      await handleListTraces(req, res);
      return;
    }

    // Get trace metadata
    if (pathname.match(/^\/api\/traces\/[^/]+$/)) {
      const traceId = pathname.split('/').pop();
      await handleGetTrace(req, res, traceId);
      return;
    }

    // Get trace spans
    if (pathname.match(/^\/api\/traces\/[^/]+\/spans$/)) {
      const traceId = pathname.split('/')[3];
      await handleGetSpans(req, res, traceId);
      return;
    }

    // Get trace summary
    if (pathname.match(/^\/api\/traces\/[^/]+\/summary$/)) {
      const traceId = pathname.split('/')[3];
      await handleGetSummary(req, res, traceId);
      return;
    }

    // 404
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error('Error handling request:', error);
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * List all available traces
 */
async function handleListTraces(req, res) {
  const traces = [];

  // Scan traces directory
  const entries = await fs.promises.readdir(TRACES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const traceDir = path.join(TRACES_DIR, entry.name);
    const dbPath = path.join(traceDir, 'normalized.db');

    // Check if database exists
    try {
      await fs.promises.access(dbPath);

      // Open database and read trace metadata
      const db = new Database(dbPath, { readonly: true });
      const traceRows = db.prepare('SELECT * FROM traces ORDER BY created_at DESC LIMIT 1').all();
      db.close();

      if (traceRows.length > 0) {
        traces.push({
          ...normalizeTraceRow(traceRows[0]),
          directory: entry.name,
        });
      }
    } catch (error) {
      // Skip traces without database
      continue;
    }
  }

  res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ traces }));
}

/**
 * Get trace metadata
 */
async function handleGetTrace(req, res, traceId) {
  const dbPath = findTraceDatabase(traceId);
  if (!dbPath) {
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Trace not found' }));
    return;
  }

  const db = new Database(dbPath, { readonly: true });
  const trace = db.prepare('SELECT * FROM traces WHERE trace_id = ?').get(traceId);
  db.close();

  if (!trace) {
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Trace not found' }));
    return;
  }

  res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ trace: normalizeTraceRow(trace) }));
}

/**
 * Get trace spans
 */
async function handleGetSpans(req, res, traceId) {
  const dbPath = findTraceDatabase(traceId);
  if (!dbPath) {
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Trace not found' }));
    return;
  }

  const db = new Database(dbPath, { readonly: true });
  const spans = db.prepare('SELECT * FROM spans WHERE trace_id = ? ORDER BY start_at ASC').all(traceId);
  db.close();

  // Parse attributes JSON
  const parsedSpans = spans.map(span => ({
    ...span,
    attributes: JSON.parse(span.attributes || '{}'),
  }));

  res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ spans: parsedSpans }));
}

/**
 * Get trace summary
 */
async function handleGetSummary(req, res, traceId) {
  const dbPath = findTraceDatabase(traceId);
  if (!dbPath) {
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Trace not found' }));
    return;
  }

  const traceDir = path.dirname(dbPath);
  const summaryPath = path.join(traceDir, 'derived', `${traceId}_summary.json`);

  try {
    const summaryContent = await fs.promises.readFile(summaryPath, 'utf8');
    const summary = JSON.parse(summaryContent);

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ summary }));
  } catch (error) {
    // Generate summary on-the-fly if not found
    const db = new Database(dbPath, { readonly: true });
    const spans = db.prepare('SELECT * FROM spans WHERE trace_id = ?').all(traceId);
    const trace = db.prepare('SELECT * FROM traces WHERE trace_id = ?').get(traceId);
    db.close();

    const summary = generateSummary(traceId, trace, spans);

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ summary }));
  }
}

/**
 * Find database path for trace ID
 */
function findTraceDatabase(traceId) {
  // Try direct match
  const directPath = path.join(TRACES_DIR, traceId, 'normalized.db');
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // Scan all trace directories
  const entries = fs.readdirSync(TRACES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dbPath = path.join(TRACES_DIR, entry.name, 'normalized.db');
    if (!fs.existsSync(dbPath)) continue;

    // Check if this database contains the trace
    try {
      const db = new Database(dbPath, { readonly: true });
      const trace = db.prepare('SELECT trace_id FROM traces WHERE trace_id = ?').get(traceId);
      db.close();

      if (trace) {
        return dbPath;
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

/**
 * Generate summary from spans
 */
function generateSummary(traceId, trace, spans) {
  const categoryStats = {};
  let totalCost = 0;
  let totalTokens = 0;

  for (const span of spans) {
    // Category stats
    if (!categoryStats[span.category]) {
      categoryStats[span.category] = {
        count: 0,
        total_duration_ms: 0,
        total_cost: 0,
      };
    }
    categoryStats[span.category].count++;
    categoryStats[span.category].total_duration_ms += span.duration_ms;

    // Cost aggregation
    if (span.costUsd) {
      categoryStats[span.category].total_cost += span.costUsd;
      totalCost += span.costUsd;
    }

    // Token aggregation
    if (span.token_input || span.token_output) {
      totalTokens += (span.token_input || 0) + (span.token_output || 0);
    }
  }

  return {
    trace_id: traceId,
    trace_name: trace?.trace_name,
    source_harness: trace?.source_harness,
    trace_semantics: trace?.trace_semantics,
    agent_identity_mode: trace?.agent_identity_mode,
    supports_waterfall: Boolean(trace?.supports_waterfall),
    supports_cost_analysis: Boolean(trace?.supports_cost_analysis),
    supports_message_log: Boolean(trace?.supports_message_log),
    supports_multi_agent: Boolean(trace?.supports_multi_agent),
    start_at: trace?.start_at,
    end_at: trace?.end_at,
    duration_ms: trace?.duration_ms,
    total_spans: spans.length,
    total_cost: totalCost,
    total_tokens: totalTokens,
    category_stats: categoryStats,
    attributes: parseJson(trace?.attributes, {}),
    generated_at: new Date().toISOString(),
  };
}

/**
 * Start server
 */
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log('ClawScope Viewer Server');
  console.log('======================');
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Traces directory: ${TRACES_DIR}`);
  console.log();
  console.log('API Endpoints:');
  console.log(`  GET /api/traces                    - List all traces`);
  console.log(`  GET /api/traces/:id                - Get trace metadata`);
  console.log(`  GET /api/traces/:id/spans          - Get trace spans`);
  console.log(`  GET /api/traces/:id/summary        - Get trace summary`);
  console.log();
  console.log('Press Ctrl+C to stop');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});
