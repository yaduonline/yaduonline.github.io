#!/usr/bin/env node
'use strict';

/**
 * Node test runner.
 *
 *   node test/run.js           # rules + puzzle data + solver uniqueness
 *   node test/run.js --quick   # skip the solver pass (much faster)
 *
 * The same checks (minus the solver pass) run in the browser via test.html.
 */

const Engine = require('../engine.js');
const Quality = require('../tools/quality.js');
const puzzles = require('../puzzles.js');
const solutions = require('../solutions.js');
const suite = require('./suite.js');
const { countSolutions } = require('../tools/solver.js');

const quick = process.argv.includes('--quick');
const outcome = suite.run({ Engine, Quality, puzzles, solutions });

/**
 * Solver pass: confirm each shipped puzzle still has exactly one solution in
 * which no route runs alongside itself, and that it is the shipped solution.
 */
function solverChecks() {
  const levels = Object.keys(puzzles)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((size) => puzzles[size]);

  const ambiguous = [];
  const mismatched = [];

  for (const level of levels) {
    const result = countSolutions(level, {
      limit: 2,
      maxNodes: 3000000,
      noSelfTouch: true,
      collect: true,
    });
    if (!result.exhausted || result.count !== 1) {
      ambiguous.push(`${level.id} (${result.exhausted ? result.count : 'over budget'})`);
      continue;
    }
    const found = JSON.stringify(result.solutions[0]);
    const shipped = JSON.stringify(solutions[level.id]);
    const reversed = JSON.stringify(solutions[level.id].map((route) => route.slice().reverse()));
    if (found !== shipped && found !== reversed) mismatched.push(level.id);
  }

  outcome.results.push({
    label: 'every puzzle has exactly one clean solution',
    ok: ambiguous.length === 0,
    detail: ambiguous.slice(0, 5).join(', '),
  });
  outcome.results.push({
    label: 'the shipped solution is that solution',
    ok: mismatched.length === 0,
    detail: mismatched.slice(0, 5).join(', '),
  });
}

if (!quick) solverChecks();

const passed = outcome.results.filter((r) => r.ok).length;
const failed = outcome.results.length - passed;

for (const result of outcome.results) {
  const mark = result.ok ? '✓' : '✗';
  process.stdout.write(`${mark} ${result.label}${result.detail ? '  -- ' + result.detail : ''}\n`);
}
process.stdout.write(`\n${passed} passed, ${failed} failed${quick ? ' (quick mode)' : ''}\n`);
process.exit(failed ? 1 : 0);
