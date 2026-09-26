#!/usr/bin/env node
'use strict';

/**
 * Node test runner.
 *
 *   node test/run.js           everything, including re-solving all 400 puzzles
 *   node test/run.js --quick   skip the re-solve
 *
 * The same checks run in the browser via test.html.
 */

const Engine = require('../engine.js');
const Packs = require('../puzzles.js');
const suite = require('./suite.js');

const started = Date.now();
const outcome = suite.run({ Engine, Packs, full: !process.argv.includes('--quick') });

for (const result of outcome.results) {
  const mark = result.ok ? '✓' : '✗';
  process.stdout.write(`${mark} ${result.label}${result.detail ? '  -- ' + result.detail : ''}\n`);
}
process.stdout.write(`\n${outcome.passed} passed, ${outcome.failed} failed (${Date.now() - started}ms)\n`);
process.exit(outcome.failed ? 1 : 0);
