#!/usr/bin/env node
'use strict';

/**
 * Build the shipped puzzle set from the cached candidate pools.
 *
 *   node tools/pool.js 5 & ... node tools/pool.js 10 &   # explore (parallel)
 *   node tools/build.js                                  # band, select, emit
 *   node tools/build.js --dry-run                        # summary only
 *
 * Writes puzzles/<size>.js, puzzles/index.js and solutions/<size>.js.
 */

const fs = require('fs');
const path = require('path');
const { evaluateCandidate, fingerprintOf } = require('./generate.js');
const { GATES } = require('./quality.js');
const { encode } = require('./routes.js');
const { readCache } = require('./pool.js');

const ALL_SIZES = [5, 6, 7, 8, 9, 10];
const TIERS = 5;
const PER_TIER = 20;

/**
 * `--sizes 5,6` limits the build to some board sizes. Only for iterating
 * locally: the result is an incomplete manifest, and the test suite fails on it.
 */
const sizesArg = process.argv.indexOf('--sizes');
const SIZES = sizesArg === -1
  ? ALL_SIZES
  : process.argv[sizesArg + 1].split(',').map(Number);

/**
 * Search-node count of the hardest puzzle in the previous, fifteen-per-size
 * release. Player feedback put that puzzle at "difficulty 2 to 3", so it is
 * pinned to the tier 2 / tier 3 boundary and the rest of the ladder is built
 * around it. Measured with the same solver setting the tiers use.
 */
const LEGACY_MAX = { 5: 38, 6: 103, 7: 292, 8: 2711, 9: 19969, 10: 152674 };

const ROOT = path.join(__dirname, '..');

function percentile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/**
 * Tier boundaries for one size, in search nodes.
 *
 * `b2` is the anchor above. Below it the two easy tiers split the range
 * geometrically; above it the three hard tiers step geometrically up to what
 * the search actually reached, so tier 5 is as hard as the board allows.
 */
function tierEdges(size, nodes) {
  const sorted = nodes.slice().sort((a, b) => a - b);
  const low = Math.max(1, percentile(sorted, 0.05));
  const b2 = LEGACY_MAX[size];
  const high = Math.max(percentile(sorted, 0.99), b2 * 1.2);

  const b1 = Math.round(Math.sqrt(low * b2));
  const ratio = high / b2;
  const b3 = Math.round(b2 * Math.pow(ratio, 1 / 3));
  const b4 = Math.round(b2 * Math.pow(ratio, 2 / 3));
  return [b1, b2, b3, b4];
}

function tierOf(nodes, edges) {
  for (let i = 0; i < edges.length; i++) if (nodes <= edges[i]) return i + 1;
  return TIERS;
}

/** Take `count` entries spread evenly across an ordered list. */
function spread(list, count) {
  if (count <= 0) return [];
  if (list.length <= count) return list.slice();
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(list[Math.round((i * (list.length - 1)) / (count - 1))]);
  }
  return out;
}

/** Legacy puzzles, re-measured so they sit on the same difficulty scale. */
function loadLegacy(size) {
  const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy.json'), 'utf8'));
  return all
    .filter((entry) => entry.size === size)
    .map((entry) => {
      const candidate = evaluateCandidate(size, entry.solution, {});
      if (!candidate) throw new Error(`legacy puzzle ${entry.id} no longer passes the gates`);
      candidate.id = entry.id;
      candidate.fingerprint = fingerprintOf(candidate.endpoints);
      return candidate;
    });
}

function selectForSize(size, log) {
  const cached = readCache(size);
  if (!cached) throw new Error(`no pool for ${size}x${size}; run: node tools/pool.js ${size}`);

  const legacy = loadLegacy(size);
  const pinned = new Set(legacy.map((c) => c.fingerprint));

  const fresh = cached.candidates
    .filter((c) => !pinned.has(c.fingerprint))
    .map((c) => ({
      size,
      colors: c.colors,
      endpoints: c.endpoints,
      solution: c.solution,
      fingerprint: c.fingerprint,
      stats: { searchNodes: c.searchNodes, searchExhausted: c.searchExhausted },
    }));

  const everything = legacy.concat(fresh);
  const edges = tierEdges(size, everything.map((c) => c.stats.searchNodes));

  const chosen = [];
  const shortfalls = [];
  for (let tier = 1; tier <= TIERS; tier++) {
    const band = everything
      .filter((c) => tierOf(c.stats.searchNodes, edges) === tier)
      .sort((a, b) => a.stats.searchNodes - b.stats.searchNodes);

    // Puzzles from the previous release keep their place, so a player's solved
    // markers survive the expansion.
    const keep = band.filter((c) => c.id);
    const rest = band.filter((c) => !c.id);
    const picked = keep.concat(spread(rest, PER_TIER - keep.length));
    if (picked.length < PER_TIER) {
      shortfalls.push(`tier ${tier}: ${picked.length}/${PER_TIER}`);
    }
    picked.sort((a, b) => a.stats.searchNodes - b.stats.searchNodes);
    picked.forEach((c) => {
      c.tier = tier;
      chosen.push(c);
    });
  }

  if (shortfalls.length) {
    log(`  ${size}x${size}: SHORT - ${shortfalls.join(', ')} (explore more: node tools/pool.js ${size} --force --rounds N)`);
  }

  // Numbering: legacy ids stay, new puzzles continue from the next free number.
  const used = new Set(chosen.filter((c) => c.id).map((c) => Number(c.id.split('-')[1])));
  let next = 1;
  chosen.forEach((c) => {
    if (c.id) return;
    while (used.has(next)) next++;
    used.add(next);
    c.id = `${size}-${next}`;
  });

  return { puzzles: chosen, edges, short: shortfalls.length > 0 };
}

function formatCell(cell) {
  return `[${cell[0]},${cell[1]}]`;
}

function header(title) {
  return [
    '/**',
    ` * ${title} - GENERATED FILE, DO NOT EDIT BY HAND.`,
    ' *',
    ' * Rebuild with:  node tools/pool.js <size>  then  node tools/build.js',
    ' */',
  ];
}

function renderPackFile(size, puzzles) {
  const lines = header(`Linkgrid ${size}x${size} puzzles`);
  lines.push('(function (global) {');
  lines.push("  'use strict';");
  lines.push('');
  lines.push('  var PACK = [');
  for (const puzzle of puzzles) {
    const endpoints = puzzle.endpoints
      .map((e) => `{ color: ${e.color}, a: ${formatCell(e.a)}, b: ${formatCell(e.b)} }`)
      .join(', ');
    lines.push(`    { id: '${puzzle.id}', size: ${size}, tier: ${puzzle.tier}, colors: ${puzzle.colors},`);
    lines.push(`      endpoints: [${endpoints}] },`);
  }
  lines.push('  ];');
  lines.push('');
  lines.push('  global.LINKGRID_PUZZLES = global.LINKGRID_PUZZLES || {};');
  lines.push(`  global.LINKGRID_PUZZLES[${size}] = PACK;`);
  lines.push("  if (typeof module !== 'undefined' && module.exports) module.exports = PACK;");
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this);");
  lines.push('');
  return lines.join('\n');
}

function renderManifest(bySize) {
  const lines = header('Linkgrid pack manifest');
  lines.push('(function (global) {');
  lines.push("  'use strict';");
  lines.push('');
  lines.push('  var PACKS = [');
  for (const size of SIZES) {
    const puzzles = bySize[size].puzzles;
    const perTier = [];
    for (let tier = 1; tier <= TIERS; tier++) {
      perTier.push(puzzles.filter((p) => p.tier === tier).length);
    }
    lines.push(`    { size: ${size}, count: ${puzzles.length}, perTier: [${perTier.join(', ')}] },`);
  }
  lines.push('  ];');
  lines.push('');
  lines.push('  global.LINKGRID_PACKS = PACKS;');
  lines.push("  if (typeof module !== 'undefined' && module.exports) module.exports = PACKS;");
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this);");
  lines.push('');
  return lines.join('\n');
}

function renderSolutionFile(size, puzzles) {
  const lines = header(`Linkgrid ${size}x${size} reference solutions`);
  lines.push(' // Routes are "row,col:MOVES" - see tools/routes.js. Tests only.');
  lines.push('(function (global) {');
  lines.push("  'use strict';");
  lines.push('');
  lines.push('  var PACK = {');
  for (const puzzle of puzzles) {
    const routes = encode(puzzle.solution).map((r) => `'${r}'`).join(', ');
    lines.push(`    '${puzzle.id}': [${routes}],`);
  }
  lines.push('  };');
  lines.push('');
  lines.push('  global.LINKGRID_SOLUTIONS = global.LINKGRID_SOLUTIONS || {};');
  lines.push(`  Object.assign(global.LINKGRID_SOLUTIONS, PACK);`);
  lines.push("  if (typeof module !== 'undefined' && module.exports) module.exports = PACK;");
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this);");
  lines.push('');
  return lines.join('\n');
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const log = (message) => process.stderr.write(message + '\n');
  const bySize = {};
  let short = false;

  log('Linkgrid puzzle build');
  log(`gates: ${JSON.stringify(GATES)}`);
  log('');
  log('size   tier edges (search nodes)            per tier: median difficulty');

  for (const size of SIZES) {
    const result = selectForSize(size, log);
    bySize[size] = result;
    short = short || result.short;

    const medians = [];
    for (let tier = 1; tier <= TIERS; tier++) {
      const band = result.puzzles.filter((p) => p.tier === tier)
        .map((p) => p.stats.searchNodes).sort((a, b) => a - b);
      medians.push(band.length ? band[band.length >> 1] : '-');
    }
    log(
      `${String(size).padStart(2)}x${size}  ` +
      `[${result.edges.join(', ')}]`.padEnd(34) +
      medians.join('  ')
    );
  }

  log('');
  const all = SIZES.flatMap((size) => bySize[size].puzzles);
  log(`total ${all.length} puzzles, colours ${Math.min(...all.map((p) => p.colors))}-${Math.max(...all.map((p) => p.colors))}`);
  if (short) log('WARNING: at least one tier is short; explore more before shipping');

  if (dryRun) {
    log('\n--dry-run: no files written');
    return;
  }

  fs.mkdirSync(path.join(ROOT, 'puzzles'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'solutions'), { recursive: true });
  for (const size of SIZES) {
    fs.writeFileSync(path.join(ROOT, 'puzzles', size + '.js'), renderPackFile(size, bySize[size].puzzles));
    fs.writeFileSync(path.join(ROOT, 'solutions', size + '.js'), renderSolutionFile(size, bySize[size].puzzles));
  }
  fs.writeFileSync(path.join(ROOT, 'puzzles', 'index.js'), renderManifest(bySize));
  log('\nwrote puzzles/ and solutions/');
}

main();
