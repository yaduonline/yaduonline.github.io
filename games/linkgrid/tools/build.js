#!/usr/bin/env node
'use strict';

/**
 * Build the shipped puzzle set.
 *
 *   node tools/build.js            # regenerate puzzles.js and solutions.js
 *   node tools/build.js --dry-run  # print the summary without writing files
 *
 * Generation is fully seeded, so a rebuild without argument changes reproduces
 * the same puzzles.
 */

const fs = require('fs');
const path = require('path');
const { generatePool, difficultyScore } = require('./generate.js');
const { GATES } = require('./quality.js');

const SIZES = [5, 6, 7, 8, 9, 10];
const TIERS = 5;
const PER_TIER = 3;
const POOL_PER_COLOR_COUNT = 12;

/**
 * Colour counts tried for a size. The starting partition is one route per row,
 * which the annealer can only split further, so `size` is the floor; a couple
 * more gives shorter routes and an easier puzzle.
 */
function colorChoices(size) {
  return [size, size + 1, size + 2];
}

function buildSize(size, log) {
  const pool = [];
  for (const colors of colorChoices(size)) {
    const part = generatePool(size, colors, POOL_PER_COLOR_COUNT, { maxSeeds: 400 });
    log(`  ${size}x${size}: ${part.length} candidates with ${colors} colours`);
    pool.push(...part);
  }

  pool.forEach((candidate) => {
    candidate.difficulty = difficultyScore(candidate);
  });
  pool.sort((a, b) => a.difficulty - b.difficulty);

  const wanted = TIERS * PER_TIER;
  if (pool.length < wanted) {
    throw new Error(`only ${pool.length} candidates for ${size}x${size}, need ${wanted}`);
  }

  // Spread the selection evenly across the ranked pool so the tiers step up in
  // difficulty instead of clustering.
  const chosen = [];
  for (let i = 0; i < wanted; i++) {
    chosen.push(pool[Math.round((i * (pool.length - 1)) / (wanted - 1))]);
  }

  return chosen.map((candidate, index) => ({
    id: `${size}-${index + 1}`,
    size,
    tier: Math.floor(index / PER_TIER) + 1,
    colors: candidate.colors,
    endpoints: candidate.endpoints,
    solution: candidate.solution,
    metrics: candidate.metrics,
    stats: candidate.stats,
    difficulty: candidate.difficulty,
    seed: candidate.seed,
  }));
}

function formatCell(cell) {
  return `[${cell[0]},${cell[1]}]`;
}

function renderPuzzlesFile(bySize) {
  const lines = [];
  lines.push('/**');
  lines.push(' * Linkgrid puzzle data - GENERATED FILE, DO NOT EDIT BY HAND.');
  lines.push(' *');
  lines.push(' * Rebuild with:  node tools/build.js');
  lines.push(' * Every puzzle covers its whole grid and has exactly one solution in which');
  lines.push(' * no route runs alongside itself. See GENERATION.md.');
  lines.push(' */');
  lines.push('(function (global) {');
  lines.push("  'use strict';");
  lines.push('');
  lines.push('  var PUZZLES = {');
  for (const size of SIZES) {
    lines.push(`    ${size}: [`);
    for (const puzzle of bySize[size]) {
      const endpoints = puzzle.endpoints
        .map((e) => `{ color: ${e.color}, a: ${formatCell(e.a)}, b: ${formatCell(e.b)} }`)
        .join(', ');
      lines.push(`      { id: '${puzzle.id}', size: ${puzzle.size}, tier: ${puzzle.tier}, colors: ${puzzle.colors},`);
      lines.push(`        endpoints: [${endpoints}] },`);
    }
    lines.push('    ],');
  }
  lines.push('  };');
  lines.push('');
  lines.push('  global.LINKGRID_PUZZLES = PUZZLES;');
  lines.push("  if (typeof module !== 'undefined' && module.exports) module.exports = PUZZLES;");
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this);");
  lines.push('');
  return lines.join('\n');
}

function renderSolutionsFile(bySize) {
  const lines = [];
  lines.push('/**');
  lines.push(' * Linkgrid reference solutions - GENERATED FILE, DO NOT EDIT BY HAND.');
  lines.push(' *');
  lines.push(' * Rebuild with:  node tools/build.js');
  lines.push(' * Only the tests load this file; the game itself never ships solutions.');
  lines.push(' */');
  lines.push('(function (global) {');
  lines.push("  'use strict';");
  lines.push('');
  lines.push('  var SOLUTIONS = {');
  for (const size of SIZES) {
    for (const puzzle of bySize[size]) {
      const routes = puzzle.solution
        .map((route) => '[' + route.map(formatCell).join(',') + ']')
        .join(',\n      ');
      lines.push(`    '${puzzle.id}': [`);
      lines.push(`      ${routes}`);
      lines.push('    ],');
    }
  }
  lines.push('  };');
  lines.push('');
  lines.push('  global.LINKGRID_SOLUTIONS = SOLUTIONS;');
  lines.push("  if (typeof module !== 'undefined' && module.exports) module.exports = SOLUTIONS;");
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this);");
  lines.push('');
  return lines.join('\n');
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const log = (message) => process.stderr.write(message + '\n');
  const bySize = {};

  log('Linkgrid puzzle build');
  log(`gates: ${JSON.stringify(GATES)}`);

  for (const size of SIZES) {
    const started = Date.now();
    bySize[size] = buildSize(size, log);
    log(`  ${size}x${size}: selected ${bySize[size].length} puzzles in ${Date.now() - started}ms`);
  }

  log('');
  log('size  id     tier colors len(min-max) straight int/border bendsPerCell search');
  for (const size of SIZES) {
    for (const puzzle of bySize[size]) {
      const m = puzzle.metrics;
      const ratio = m.borderBendDensity ? m.interiorBendDensity / m.borderBendDensity : Infinity;
      log(
        `${String(size).padStart(2)}   ${puzzle.id.padEnd(6)} ${puzzle.tier}    ` +
        `${String(puzzle.colors).padStart(2)}     ${String(m.minLength).padStart(2)}-${String(m.maxLength).padEnd(2)}` +
        `        ${m.straightShare.toFixed(2)}     ${ratio.toFixed(2)}       ` +
        `${m.bendsPerCell.toFixed(2)}        ${puzzle.stats.searchNodes}`
      );
    }
  }

  if (dryRun) {
    log('\n--dry-run: no files written');
    return;
  }

  const root = path.join(__dirname, '..');
  fs.writeFileSync(path.join(root, 'puzzles.js'), renderPuzzlesFile(bySize));
  fs.writeFileSync(path.join(root, 'solutions.js'), renderSolutionsFile(bySize));
  log('\nwrote puzzles.js and solutions.js');
}

main();
