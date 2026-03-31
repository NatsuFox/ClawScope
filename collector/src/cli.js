#!/usr/bin/env node

/**
 * ClawScope CLI
 *
 * Command-line interface for importing and validating traces.
 */

import path from 'path';

import { getHarnessAdapter, listHarnesses } from './harnesses/index.js';
import { TraceStorage } from './storage.js';

const commands = {
  import: importCommand,
  discover: discoverCommand,
  normalize: normalizeCommand,
  validate: validateCommand,
  summary: summaryCommand,
  help: helpCommand,
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    helpCommand();
    process.exit(1);
  }

  try {
    await commands[command](args.slice(1));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function parseOptions(args) {
  const options = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    i++;
  }

  return { positional, options };
}

async function importCommand(args) {
  const { positional, options } = parseOptions(args);
  const harnessName = positional[0];
  const inputArg = positional[1];
  const outputArg = positional[2];

  if (!harnessName) {
    console.error('Usage: import <harness> <input> <output-dir> [--trace-name <name>] [--latest]');
    console.error(`  harness: ${listHarnesses().join(', ')}`);
    process.exit(1);
  }

  const harness = getHarnessAdapter(harnessName);

  let inputPath = inputArg;
  if (options.latest) {
    const discovered = await harness.discoverSessions({ limit: 1 });
    if (discovered.length === 0) {
      throw new Error(`No ${harnessName} sessions found`);
    }
    inputPath = discovered[0].path;
    console.log(`Using latest ${harnessName} session: ${inputPath}`);
  }

  if (!inputPath || !outputArg) {
    console.error('Usage: import <harness> <input> <output-dir> [--trace-name <name>] [--latest]');
    process.exit(1);
  }

  const outputDir = path.resolve(outputArg);

  console.log('ClawScope Import');
  console.log('================');
  console.log(`Harness: ${harnessName}`);
  console.log(`Input:   ${path.resolve(inputPath)}`);
  console.log(`Output:  ${outputDir}`);
  console.log();

  console.log('Loading source session...');
  const raw = await harness.loadSession(inputPath, options);

  console.log('Normalizing session...');
  const { spans, trace, rawFiles = [] } = await harness.normalizeSession(raw, options);
  if (options['trace-name']) {
    trace.trace_name = options['trace-name'];
  }

  console.log(`  Generated ${spans.length} spans`);

  console.log('Initializing storage...');
  const storage = new TraceStorage(outputDir);
  await storage.initialize();

  if (rawFiles.length > 0) {
    console.log('Writing raw source files...');
    for (const rawFile of rawFiles) {
      if (!rawFile.records?.length) {
        continue;
      }
      await storage.writeRawEvents(rawFile.records, rawFile.filename);
    }
  }

  console.log('Writing spans...');
  await storage.writeSpans(spans);

  console.log('Writing trace metadata...');
  await storage.writeTrace(trace);

  console.log('Generating summary...');
  const summary = storage.generateSummary(trace.trace_id);
  await storage.writeSummary(trace.trace_id, summary);

  storage.close();

  console.log();
  console.log('✓ Import complete!');
  console.log(`  Trace ID: ${trace.trace_id}`);
  console.log(`  Trace Name: ${trace.trace_name}`);
  console.log(`  Harness: ${trace.source_harness}`);
  console.log(`  Spans: ${trace.total_spans}`);
  console.log(`  Duration: ${trace.duration_ms}ms`);
  console.log(`  Cost: $${(trace.total_cost || 0).toFixed(4)}`);
  console.log();
  console.log(`Database: ${path.join(outputDir, 'normalized.db')}`);
}

async function discoverCommand(args) {
  const { positional, options } = parseOptions(args);
  const harnessName = positional[0];

  if (!harnessName) {
    console.error('Usage: discover <harness> [--limit <n>]');
    console.error(`  harness: ${listHarnesses().join(', ')}`);
    process.exit(1);
  }

  const harness = getHarnessAdapter(harnessName);
  const limit = Number(options.limit || 20);
  const sessions = await harness.discoverSessions({ limit });

  console.log(JSON.stringify(sessions, null, 2));
}

async function normalizeCommand(args) {
  return importCommand(['openclaw', ...args]);
}

async function validateCommand(args) {
  if (args.length < 1) {
    console.error('Usage: validate <trace-dir>');
    console.error('  trace-dir: Directory containing normalized.db');
    process.exit(1);
  }

  const traceDir = path.resolve(args[0]);

  console.log('ClawScope Validator');
  console.log('==================');
  console.log(`Trace: ${traceDir}`);
  console.log();

  const storage = new TraceStorage(traceDir);
  await storage.initialize();

  const traces = storage.listTraces();
  if (traces.length === 0) {
    console.error('Error: No traces found');
    process.exit(1);
  }

  const trace = traces[0];
  console.log(`Trace ID: ${trace.trace_id}`);
  console.log(`Spans: ${trace.total_spans}`);
  console.log();

  const spans = storage.readSpansByTrace(trace.trace_id);

  const { Normalizer } = await import('./normalizer.js');
  const normalizer = new Normalizer();
  let validCount = 0;
  let invalidCount = 0;

  for (const span of spans) {
    const validation = normalizer.validateSpan(span);
    if (validation.valid) {
      validCount++;
    } else {
      invalidCount++;
      console.error(`✗ Span ${span.record_id}:`);
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
    }
  }

  console.log('Validating relationships...');
  const relationshipErrors = validateRelationships(spans);
  if (relationshipErrors.length > 0) {
    console.error(`✗ Found ${relationshipErrors.length} relationship errors:`);
    for (const error of relationshipErrors) {
      console.error(`  - ${error}`);
    }
  } else {
    console.log('✓ All relationships valid');
  }

  storage.close();

  console.log();
  console.log('Validation Summary:');
  console.log(`  Valid spans: ${validCount}`);
  console.log(`  Invalid spans: ${invalidCount}`);
  console.log(`  Relationship errors: ${relationshipErrors.length}`);

  if (invalidCount > 0 || relationshipErrors.length > 0) {
    process.exit(1);
  }
}

async function summaryCommand(args) {
  if (args.length < 1) {
    console.error('Usage: summary <trace-dir>');
    console.error('  trace-dir: Directory containing normalized.db');
    process.exit(1);
  }

  const traceDir = path.resolve(args[0]);
  const storage = new TraceStorage(traceDir);
  await storage.initialize();

  const traces = storage.listTraces();
  if (traces.length === 0) {
    console.error('Error: No traces found');
    process.exit(1);
  }

  const trace = traces[0];
  let summary = await storage.readSummary(trace.trace_id);
  if (!summary) {
    summary = storage.generateSummary(trace.trace_id);
    await storage.writeSummary(trace.trace_id, summary);
  }

  storage.close();

  console.log('ClawScope Trace Summary');
  console.log('======================');
  console.log();
  console.log(`Trace ID: ${summary.trace_id}`);
  console.log(`Trace Name: ${summary.trace_name || '(unnamed)'}`);
  if (summary.source_harness) {
    console.log(`Harness: ${summary.source_harness}`);
  }
  console.log(`Duration: ${summary.duration_ms}ms`);
  console.log(`Total Cost: $${summary.total_cost.toFixed(4)}`);
  console.log(`Total Tokens: ${summary.total_tokens}`);
  console.log(`Total Spans: ${summary.total_spans}`);
  console.log();
  console.log('Category Breakdown:');
  for (const [category, stats] of Object.entries(summary.category_stats)) {
    console.log(`  ${category}:`);
    console.log(`    Count: ${stats.count}`);
    console.log(`    Duration: ${stats.total_duration_ms}ms`);
    console.log(`    Cost: $${stats.total_cost.toFixed(4)}`);
  }
  console.log();
  console.log('Critical Path:');
  console.log(`  Duration: ${summary.critical_path.duration}ms`);
  console.log(`  Spans: ${summary.critical_path.path.length}`);
}

function helpCommand() {
  console.log('ClawScope CLI');
  console.log('============');
  console.log();
  console.log('Usage: clawscope <command> [options]');
  console.log();
  console.log('Commands:');
  console.log(`  import <harness> <input> <output-dir>  Import a harness session (${listHarnesses().join(', ')})`);
  console.log('  discover <harness>                     List local harness sessions');
  console.log('  normalize <input-dir> <output-dir>     Alias for import openclaw');
  console.log('  validate <trace-dir>                   Validate normalized spans');
  console.log('  summary <trace-dir>                    Display trace summary');
  console.log('  help                                   Show this help message');
  console.log();
  console.log('Examples:');
  console.log('  clawscope import claude-code ~/.claude/projects/.../session.jsonl ./traces/claude-session');
  console.log('  clawscope import codex ~/.codex/sessions/.../rollout.jsonl ./traces/codex-session');
  console.log('  clawscope import openclaw ./raw ./traces/openclaw-trace');
  console.log('  clawscope discover claude-code --limit 5');
}

function validateRelationships(spans) {
  const errors = [];
  const spanMap = new Map(spans.map((s) => [s.record_id, s]));

  for (const span of spans) {
    if (span.parent_span_id) {
      const parent = spanMap.get(span.parent_span_id);
      if (!parent) {
        errors.push(`Span ${span.record_id} references non-existent parent ${span.parent_span_id}`);
      } else if (parent.start_at > span.start_at || parent.end_at < span.end_at) {
        errors.push(`Parent ${parent.record_id} does not temporally contain child ${span.record_id}`);
      }
    }

    if (span.caused_by_span_id) {
      const cause = spanMap.get(span.caused_by_span_id);
      if (!cause) {
        errors.push(`Span ${span.record_id} references non-existent cause ${span.caused_by_span_id}`);
      } else if (cause.end_at > span.start_at) {
        errors.push(`Cause ${cause.record_id} ends after effect ${span.record_id} starts`);
      }
    }
  }

  return errors;
}

main();
