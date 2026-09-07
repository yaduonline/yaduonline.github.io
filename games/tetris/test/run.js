#!/usr/bin/env node
'use strict';

/**
 * Node test runner.
 *
 *   node test/run.js
 *
 * The same checks run in the browser via test.html.
 */

const Engine = require('../engine.js');
const suite = require('./suite.js');

const outcome = suite.run({ Engine });

for (const result of outcome.results) {
  const mark = result.ok ? '✓' : '✗';
  process.stdout.write(`${mark} ${result.label}${result.detail ? '  -- ' + result.detail : ''}\n`);
}
process.stdout.write(`\n${outcome.passed} passed, ${outcome.failed} failed\n`);
process.exit(outcome.failed ? 1 : 0);
