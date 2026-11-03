// Control-inventory ledger: expected observable change, actual result, pass/fail.
import fs from 'node:fs';
import path from 'node:path';
const FILE = path.resolve('test-results/ledger.jsonl');
fs.mkdirSync(path.dirname(FILE), { recursive: true });

export function record(area, control, expected, actual, pass, env = 'Chromium (Playwright, headless), local server, mock quote provider') {
  fs.appendFileSync(FILE, JSON.stringify({ area, control, expected, actual: String(actual), pass: !!pass, env, at: new Date().toISOString() }) + '\n');
}

/** Assert and record in one step. */
export function check(assertFn, area, control, expected, actual, pass) {
  record(area, control, expected, actual, pass);
  assertFn(pass, `${area} / ${control}: expected ${expected}, got ${actual}`);
}
