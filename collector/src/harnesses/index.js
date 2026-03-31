import { claudeCodeHarness } from './claude-code.js';
import { codexHarness } from './codex.js';
import { openClawHarness } from './openclaw.js';

const HARNESSES = {
  openclaw: openClawHarness,
  'claude-code': claudeCodeHarness,
  codex: codexHarness,
};

export function getHarnessAdapter(name) {
  const harness = HARNESSES[name];
  if (!harness) {
    throw new Error(`Unsupported harness: ${name}`);
  }
  return harness;
}

export function listHarnesses() {
  return Object.keys(HARNESSES);
}
