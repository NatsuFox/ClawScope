/**
 * Storage Layer for ClawScope
 *
 * Implements three-tier storage:
 * 1. Raw: JSONL files (diagnostic_events.jsonl, agent_events.jsonl)
 * 2. Normalized: SQLite database with optimized indexes
 * 3. Derived: JSON summary files
 */

import { DatabaseSync as Database } from 'node:sqlite';
import fs from 'fs/promises';
import path from 'path';

/**
 * Storage manager for ClawScope traces
 */
export class TraceStorage {
  constructor(traceDir) {
    this.traceDir = traceDir;
    this.dbPath = path.join(traceDir, 'normalized.db');
    this.db = null;
  }

  /**
   * Initialize storage directory and database
   */
  async initialize() {
    // Create directory structure
    await fs.mkdir(this.traceDir, { recursive: true });
    await fs.mkdir(path.join(this.traceDir, 'raw'), { recursive: true });
    await fs.mkdir(path.join(this.traceDir, 'derived'), { recursive: true });

    // Initialize database
    this.db = new Database(this.dbPath);
    await this.createSchema();
    await this.createIndexes();
  }

  /**
   * Create database schema
   */
  async createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spans (
        record_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        category TEXT NOT NULL,
        subtype TEXT NOT NULL,
        name TEXT NOT NULL,

        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,

        parent_span_id TEXT,
        caused_by_span_id TEXT,
        agent_id TEXT,
        origin_agent_id TEXT,
        target_agent_id TEXT,

        status TEXT NOT NULL,
        fidelity TEXT NOT NULL,

        -- OpenClaw correlation fields
        runId TEXT,
        sessionKey TEXT,
        toolCallId TEXT,
        channel TEXT,
        lane TEXT,
        seq INTEGER,

        -- Category-specific fields
        model_name TEXT,
        provider TEXT,
        tool_name TEXT,
        token_reasoning INTEGER,
        token_input INTEGER,
        token_output INTEGER,
        token_cache INTEGER,
        costUsd REAL,
        queueDepth INTEGER,
        updateType TEXT,

        -- Metadata
        attributes TEXT,

        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS traces (
        trace_id TEXT PRIMARY KEY,
        trace_name TEXT,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        total_cost REAL,
        total_agents INTEGER,
        total_spans INTEGER,
        source_harness TEXT,
        source_session_id TEXT,
        source_path TEXT,
        cwd TEXT,
        git_branch TEXT,
        schema_version INTEGER,
        trace_contract_version TEXT,
        trace_semantics TEXT,
        agent_identity_mode TEXT,
        supports_waterfall INTEGER,
        supports_cost_analysis INTEGER,
        supports_message_log INTEGER,
        supports_multi_agent INTEGER,
        status TEXT,
        attributes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Create optimized indexes for OpenClaw queries
   */
  async createIndexes() {
    this.db.exec(`
      -- Core indexes
      CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id);
      CREATE INDEX IF NOT EXISTS idx_spans_category ON spans(category);
      CREATE INDEX IF NOT EXISTS idx_spans_start_at ON spans(start_at);
      CREATE INDEX IF NOT EXISTS idx_spans_parent ON spans(parent_span_id);
      CREATE INDEX IF NOT EXISTS idx_spans_agent_id ON spans(agent_id) WHERE agent_id IS NOT NULL;

      -- OpenClaw-specific indexes
      CREATE INDEX IF NOT EXISTS idx_spans_runId ON spans(runId) WHERE runId IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_spans_sessionKey ON spans(sessionKey) WHERE sessionKey IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_spans_toolCallId ON spans(toolCallId) WHERE toolCallId IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_spans_channel ON spans(channel) WHERE channel IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_spans_lane ON spans(lane) WHERE lane IS NOT NULL;

      -- Composite indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_spans_trace_category ON spans(trace_id, category);
      CREATE INDEX IF NOT EXISTS idx_spans_trace_start ON spans(trace_id, start_at);
      CREATE INDEX IF NOT EXISTS idx_spans_run_category ON spans(runId, category) WHERE runId IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_spans_session_category ON spans(sessionKey, category) WHERE sessionKey IS NOT NULL;

      -- Cost analysis indexes
      CREATE INDEX IF NOT EXISTS idx_spans_cost ON spans(costUsd) WHERE costUsd IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_spans_duration ON spans(duration_ms);
    `);

    const spanColumns = new Set(this.db.prepare('PRAGMA table_info(spans)').all().map((row) => row.name));
    const spanMigrations = [['agent_id', 'ALTER TABLE spans ADD COLUMN agent_id TEXT']];

    for (const [column, sql] of spanMigrations) {
      if (!spanColumns.has(column)) {
        this.db.exec(sql);
      }
    }

    const traceColumns = new Set(this.db.prepare('PRAGMA table_info(traces)').all().map((row) => row.name));
    const migrations = [
      ['source_harness', 'ALTER TABLE traces ADD COLUMN source_harness TEXT'],
      ['source_session_id', 'ALTER TABLE traces ADD COLUMN source_session_id TEXT'],
      ['source_path', 'ALTER TABLE traces ADD COLUMN source_path TEXT'],
      ['cwd', 'ALTER TABLE traces ADD COLUMN cwd TEXT'],
      ['git_branch', 'ALTER TABLE traces ADD COLUMN git_branch TEXT'],
      ['schema_version', 'ALTER TABLE traces ADD COLUMN schema_version INTEGER'],
      ['trace_contract_version', 'ALTER TABLE traces ADD COLUMN trace_contract_version TEXT'],
      ['trace_semantics', 'ALTER TABLE traces ADD COLUMN trace_semantics TEXT'],
      ['agent_identity_mode', 'ALTER TABLE traces ADD COLUMN agent_identity_mode TEXT'],
      ['supports_waterfall', 'ALTER TABLE traces ADD COLUMN supports_waterfall INTEGER'],
      ['supports_cost_analysis', 'ALTER TABLE traces ADD COLUMN supports_cost_analysis INTEGER'],
      ['supports_message_log', 'ALTER TABLE traces ADD COLUMN supports_message_log INTEGER'],
      ['supports_multi_agent', 'ALTER TABLE traces ADD COLUMN supports_multi_agent INTEGER'],
      ['attributes', 'ALTER TABLE traces ADD COLUMN attributes TEXT'],
    ];

    for (const [column, sql] of migrations) {
      if (!traceColumns.has(column)) {
        this.db.exec(sql);
      }
    }
  }

  /**
   * Write raw events to JSONL file
   */
  async writeRawEvents(events, filename = 'diagnostic_events.jsonl') {
    const filePath = path.join(this.traceDir, 'raw', filename);
    const lines = events.map(event => JSON.stringify(event)).join('\n') + '\n';
    await fs.appendFile(filePath, lines, 'utf8');
  }

  /**
   * Read raw events from JSONL file
   */
  async readRawEvents(filename = 'diagnostic_events.jsonl') {
    const filePath = path.join(this.traceDir, 'raw', filename);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read all raw events (diagnostic + agent)
   */
  async readAllRawEvents() {
    const diagnostic = await this.readRawEvents('diagnostic_events.jsonl');
    const agent = await this.readRawEvents('agent_events.jsonl');

    // Merge and sort by timestamp
    return [...diagnostic, ...agent].sort((a, b) => a.ts - b.ts);
  }

  /**
   * Write normalized spans to database
   */
  async writeSpans(spans) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO spans (
        record_id, trace_id, category, subtype, name,
        start_at, end_at, duration_ms,
        parent_span_id, caused_by_span_id, agent_id, origin_agent_id, target_agent_id,
        status, fidelity,
        runId, sessionKey, toolCallId, channel, lane, seq,
        model_name, provider, tool_name,
        token_reasoning, token_input, token_output, token_cache, costUsd,
        queueDepth, updateType,
        attributes
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?
      )
    `);

    this.db.exec('BEGIN');
    for (const span of spans) {
      stmt.run(
        span.record_id,
        span.trace_id,
        span.category,
        span.subtype,
        span.name,
        span.start_at,
        span.end_at,
        span.duration_ms,
        span.parent_span_id || null,
        span.caused_by_span_id || null,
        span.agent_id || null,
        span.origin_agent_id || null,
        span.target_agent_id || null,
        span.status,
        span.fidelity,
        span.runId || null,
        span.sessionKey || null,
        span.toolCallId || null,
        span.channel || null,
        span.lane || null,
        span.seq || null,
        span.model_name || null,
        span.provider || null,
        span.tool_name || null,
        span.token_reasoning || null,
        span.token_input || null,
        span.token_output || null,
        span.token_cache || null,
        span.costUsd || null,
        span.queueDepth || null,
        span.updateType || null,
        JSON.stringify(span.attributes || {})
      );
    }
    this.db.exec('COMMIT');
  }

  /**
   * Read spans by trace ID
   */
  readSpansByTrace(traceId) {
    const stmt = this.db.prepare(`
      SELECT * FROM spans
      WHERE trace_id = ?
      ORDER BY start_at ASC
    `);

    const rows = stmt.all(traceId);
    return rows.map(row => this.deserializeSpan(row));
  }

  /**
   * Read spans by run ID
   */
  readSpansByRun(runId) {
    const stmt = this.db.prepare(`
      SELECT * FROM spans
      WHERE runId = ?
      ORDER BY start_at ASC
    `);

    const rows = stmt.all(runId);
    return rows.map(row => this.deserializeSpan(row));
  }

  /**
   * Read spans by session key
   */
  readSpansBySession(sessionKey) {
    const stmt = this.db.prepare(`
      SELECT * FROM spans
      WHERE sessionKey = ?
      ORDER BY start_at ASC
    `);

    const rows = stmt.all(sessionKey);
    return rows.map(row => this.deserializeSpan(row));
  }

  /**
   * Read spans by category
   */
  readSpansByCategory(traceId, category) {
    const stmt = this.db.prepare(`
      SELECT * FROM spans
      WHERE trace_id = ? AND category = ?
      ORDER BY start_at ASC
    `);

    const rows = stmt.all(traceId, category);
    return rows.map(row => this.deserializeSpan(row));
  }

  /**
   * Query spans with filters
   */
  querySpans(filters = {}) {
    let query = 'SELECT * FROM spans WHERE 1=1';
    const params = [];

    if (filters.trace_id) {
      query += ' AND trace_id = ?';
      params.push(filters.trace_id);
    }

    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.runId) {
      query += ' AND runId = ?';
      params.push(filters.runId);
    }

    if (filters.agent_id) {
      query += ' AND agent_id = ?';
      params.push(filters.agent_id);
    }

    if (filters.sessionKey) {
      query += ' AND sessionKey = ?';
      params.push(filters.sessionKey);
    }

    if (filters.channel) {
      query += ' AND channel = ?';
      params.push(filters.channel);
    }

    if (filters.min_duration_ms) {
      query += ' AND duration_ms >= ?';
      params.push(filters.min_duration_ms);
    }

    if (filters.min_cost) {
      query += ' AND costUsd >= ?';
      params.push(filters.min_cost);
    }

    query += ' ORDER BY start_at ASC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(row => this.deserializeSpan(row));
  }

  /**
   * Write trace metadata
   */
  async writeTrace(trace) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO traces (
        trace_id, trace_name, start_at, end_at, duration_ms,
        total_cost, total_agents, total_spans,
        source_harness, source_session_id, source_path, cwd, git_branch,
        schema_version, trace_contract_version, trace_semantics, agent_identity_mode,
        supports_waterfall, supports_cost_analysis, supports_message_log, supports_multi_agent,
        status, attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      trace.trace_id,
      trace.trace_name || null,
      trace.start_at,
      trace.end_at,
      trace.duration_ms,
      trace.total_cost || null,
      trace.total_agents || null,
      trace.total_spans || null,
      trace.source_harness || null,
      trace.source_session_id || null,
      trace.source_path || null,
      trace.cwd || null,
      trace.git_branch || null,
      trace.schema_version ?? null,
      trace.trace_contract_version || null,
      trace.trace_semantics || null,
      trace.agent_identity_mode || null,
      trace.supports_waterfall === undefined ? null : Number(trace.supports_waterfall),
      trace.supports_cost_analysis === undefined ? null : Number(trace.supports_cost_analysis),
      trace.supports_message_log === undefined ? null : Number(trace.supports_message_log),
      trace.supports_multi_agent === undefined ? null : Number(trace.supports_multi_agent),
      trace.status || 'complete',
      JSON.stringify(trace.attributes || {})
    );
  }

  /**
   * Read trace metadata
   */
  readTrace(traceId) {
    const stmt = this.db.prepare('SELECT * FROM traces WHERE trace_id = ?');
    const row = stmt.get(traceId);
    return row ? this.deserializeTrace(row) : null;
  }

  /**
   * List all traces
   */
  listTraces() {
    const stmt = this.db.prepare('SELECT * FROM traces ORDER BY created_at DESC');
    return stmt.all().map((row) => this.deserializeTrace(row));
  }

  /**
   * Write derived summary
   */
  async writeSummary(traceId, summary) {
    const filePath = path.join(this.traceDir, 'derived', `${traceId}_summary.json`);
    await fs.writeFile(filePath, JSON.stringify(summary, null, 2), 'utf8');
  }

  /**
   * Read derived summary
   */
  async readSummary(traceId) {
    const filePath = path.join(this.traceDir, 'derived', `${traceId}_summary.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Generate summary from spans
   */
  generateSummary(traceId) {
    const spans = this.readSpansByTrace(traceId);
    const trace = this.readTrace(traceId);

    // Calculate statistics
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

    // Find critical path (longest duration chain)
    const criticalPath = this.findCriticalPath(spans);

    return {
      trace_id: traceId,
      trace_name: trace?.trace_name,
      source_harness: trace?.source_harness,
      source_session_id: trace?.source_session_id,
      source_path: trace?.source_path,
      cwd: trace?.cwd,
      git_branch: trace?.git_branch,
      start_at: trace?.start_at,
      end_at: trace?.end_at,
      duration_ms: trace?.duration_ms,
      total_spans: spans.length,
      total_cost: totalCost,
      total_tokens: totalTokens,
      category_stats: categoryStats,
      critical_path: criticalPath,
      schema_version: trace?.schema_version,
      trace_contract_version: trace?.trace_contract_version,
      trace_semantics: trace?.trace_semantics,
      agent_identity_mode: trace?.agent_identity_mode,
      supports_waterfall: trace?.supports_waterfall ?? true,
      supports_cost_analysis: trace?.supports_cost_analysis ?? totalCost > 0,
      supports_message_log: trace?.supports_message_log ?? false,
      supports_multi_agent: trace?.supports_multi_agent ?? false,
      attributes: trace?.attributes || {},
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Find critical path (longest duration chain)
   */
  findCriticalPath(spans) {
    // Build parent-child map
    const childrenMap = new Map();
    for (const span of spans) {
      if (span.parent_span_id) {
        if (!childrenMap.has(span.parent_span_id)) {
          childrenMap.set(span.parent_span_id, []);
        }
        childrenMap.get(span.parent_span_id).push(span);
      }
    }

    // Find root spans (no parent)
    const roots = spans.filter(s => !s.parent_span_id);

    // DFS to find longest path
    function findLongestPath(span) {
      const children = childrenMap.get(span.record_id) || [];
      if (children.length === 0) {
        return { duration: span.duration_ms, path: [span.record_id] };
      }

      let maxChild = { duration: 0, path: [] };
      for (const child of children) {
        const childPath = findLongestPath(child);
        if (childPath.duration > maxChild.duration) {
          maxChild = childPath;
        }
      }

      return {
        duration: span.duration_ms + maxChild.duration,
        path: [span.record_id, ...maxChild.path],
      };
    }

    let criticalPath = { duration: 0, path: [] };
    for (const root of roots) {
      const path = findLongestPath(root);
      if (path.duration > criticalPath.duration) {
        criticalPath = path;
      }
    }

    return criticalPath;
  }

  /**
   * Deserialize span from database row
   */
  deserializeSpan(row) {
    return {
      ...row,
      attributes: JSON.parse(row.attributes || '{}'),
    };
  }

  deserializeTrace(row) {
    return {
      ...row,
      supports_waterfall: Boolean(row.supports_waterfall),
      supports_cost_analysis: Boolean(row.supports_cost_analysis),
      supports_message_log: Boolean(row.supports_message_log),
      supports_multi_agent: Boolean(row.supports_multi_agent),
      attributes: JSON.parse(row.attributes || '{}'),
    };
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Optimize database (vacuum and analyze)
   */
  optimize() {
    this.db.exec('VACUUM');
    this.db.exec('ANALYZE');
  }
}

export default TraceStorage;
