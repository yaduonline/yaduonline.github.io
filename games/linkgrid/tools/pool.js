#!/usr/bin/env node
'use strict';

/**
 * Build the candidate pool for one board size and cache it on disk.
 *
 *   node tools/pool.js 8            # explore 8x8, write tools/.pools/8.json
 *   node tools/pool.js 8 --rounds 600
 *   node tools/pool.js 8 --force    # ignore an existing cache
 *
 * `tools/build.js` runs one of these per size, in parallel. The cache exists so
 * that tuning the tier bands does not mean re-running the search.
 */

const fs = require('fs');
const path = require('path');
const { explorePool } = require('./generate.js');

const CACHE_DIR = path.join(__dirname, '.pools');

/**
 * Exploration budget per size. Bigger boards need more rounds to fill the hard
 * end of the range, and each round costs more, so this is where most of the
 * build's wall time goes.
 */
const BUDGET = {
  // colorCounts reaches well below the old size-2..size+1 default. Every
  // count below "size - 1" or so is only reachable by chance (mergeDown's
  // shake is not guaranteed to find a legal merge down to a given k - see
  // GENERATION.md), so the lower end relies on explorePool already retrying
  // buildPartition up to 10 times per chain, across many chains, to turn a
  // per-attempt chance of a few percent into several working seeds.
  5: { chains: 12, rounds: 500, colorCounts: [2, 3, 4, 5, 6] },
  6: { chains: 12, rounds: 500, colorCounts: [2, 3, 4, 5, 6, 7] },
  7: { chains: 12, rounds: 500, colorCounts: [3, 4, 5, 6, 7, 8] },
  8: { chains: 10, rounds: 500, colorCounts: [3, 4, 5, 6, 7, 8, 9] },
  9: { chains: 10, rounds: 450, colorCounts: [4, 5, 6, 7, 8, 9, 10] },
  10: { chains: 10, rounds: 400, colorCounts: [4, 5, 6, 7, 8, 9, 10, 11] },
};

function cachePath(size) {
  return path.join(CACHE_DIR, size + '.json');
}

function readCache(size) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(size), 'utf8'));
  } catch (err) {
    return null;
  }
}

/** Explore one size, returning the pool as plain data. */
function buildPool(size, options = {}) {
  const budget = { ...(BUDGET[size] || { chains: 8, rounds: 400 }), ...options };
  const started = Date.now();

  const pool = explorePool(size, {
    chains: budget.chains,
    rounds: budget.rounds,
    colorCounts: budget.colorCounts,
  });

  return {
    size,
    chains: budget.chains,
    rounds: budget.rounds,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    candidates: pool.map((c) => ({
      colors: c.colors,
      endpoints: c.endpoints,
      solution: c.solution,
      searchNodes: c.stats.searchNodes,
      searchExhausted: c.stats.searchExhausted,
      fingerprint: c.fingerprint,
    })),
  };
}

function main() {
  const size = Number(process.argv[2]);
  if (!Number.isInteger(size)) {
    process.stderr.write('usage: node tools/pool.js <size> [--rounds N] [--chains N] [--force]\n');
    process.exit(2);
  }

  const argOf = (name) => {
    const at = process.argv.indexOf(name);
    return at === -1 ? undefined : Number(process.argv[at + 1]);
  };
  const force = process.argv.includes('--force');

  if (!force) {
    const cached = readCache(size);
    if (cached) {
      process.stderr.write(`${size}x${size}: reusing cached pool of ${cached.candidates.length}\n`);
      return;
    }
  }

  const pool = buildPool(size, {
    rounds: argOf('--rounds'),
    chains: argOf('--chains'),
  });

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(size), JSON.stringify(pool));

  const nodes = pool.candidates.map((c) => c.searchNodes).sort((a, b) => a - b);
  process.stderr.write(
    `${size}x${size}: ${pool.candidates.length} candidates in ${pool.seconds}s ` +
    `(nodes ${nodes[0]}..${nodes[nodes.length - 1]}, median ${nodes[nodes.length >> 1]})\n`
  );
}

if (require.main === module) main();

module.exports = { buildPool, readCache, cachePath, BUDGET };
