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
// Ten difficulty levels, ten puzzles each: the same total per size (100) as
// the previous five-levels-of-twenty release, just sliced finer now that the
// colour floor (see GENERATION.md) gives the hard end enough room to support
// the extra levels distinctly rather than clustering them together.
const TIERS = 10;
const PER_TIER = 10;
// Where the previous release's hardest puzzle sits on the new ladder, as a
// fraction of the way up it. It was pinned to the tier 2/3 boundary out of 5
// tiers (0.4 of the way up) on the theory that was roughly where player
// feedback placed it; that fraction, not the absolute tier index, is what
// carries over when the tier count changes.
const LEGACY_ANCHOR_FRACTION = 0.4;

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
 * Tier boundaries for one size, in search nodes. Returns `TIERS - 1` edges;
 * `tierOf` below turns a search-node count into a tier using them.
 *
 * The anchor sits at LEGACY_ANCHOR_FRACTION of the way up the ladder, at the
 * value of the previous release's hardest puzzle for this size. Below the
 * anchor, edges step geometrically from the 5th percentile of the pool up to
 * it; above, they step geometrically from the anchor up to the hardest the
 * search actually reached, so the top tier is exactly as hard as the board
 * allows rather than an arbitrary multiple.
 */
function tierEdges(size, nodes) {
  const sorted = nodes.slice().sort((a, b) => a - b);
  const low = Math.max(1, percentile(sorted, 0.05));
  const anchor = LEGACY_MAX[size];
  const high = Math.max(percentile(sorted, 0.99), anchor * 1.2);

  const totalEdges = TIERS - 1;
  // 0-based index of the anchor within the edges array, keeping it at the
  // same fractional position regardless of how many tiers there are.
  const anchorIndex = Math.min(
    totalEdges - 1,
    Math.max(0, Math.round(TIERS * LEGACY_ANCHOR_FRACTION) - 1)
  );

  const edges = new Array(totalEdges);
  edges[anchorIndex] = anchor;

  const belowCount = anchorIndex; // edges strictly below the anchor
  const belowRatio = anchor / low;
  for (let i = 0; i < belowCount; i++) {
    edges[i] = Math.round(low * Math.pow(belowRatio, (i + 1) / (belowCount + 1)));
  }

  const aboveCount = totalEdges - anchorIndex - 1; // edges strictly above
  const aboveRatio = high / anchor;
  for (let i = 0; i < aboveCount; i++) {
    edges[anchorIndex + 1 + i] = Math.round(anchor * Math.pow(aboveRatio, (i + 1) / (aboveCount + 1)));
  }

  return edges;
}

function tierOf(nodes, edges) {
  for (let i = 0; i < edges.length; i++) if (nodes <= edges[i]) return i + 1;
  return TIERS;
}

/** Take `count` entries spread evenly across an ordered list. */
function spread(list, count) {
  if (count <= 0) return [];
  if (list.length <= count) return list.slice();
  // A single pick has no "spread" to compute (count - 1 would be zero); the
  // middle of the list is as representative a single choice as any other.
  if (count === 1) return [list[Math.floor((list.length - 1) / 2)]];
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

    // Puzzles from earlier releases keep their place, so a player's solved
    // markers survive. But a tier boundary computed for one tier count does
    // not line up with the bands a puzzle was originally sorted into under a
    // different tier count - rebinning 100 puzzles that were evenly split
    // across 5 old tiers into 10 new ones can easily leave some new tiers
    // holding more legacy puzzles than PER_TIER allows. When that happens,
    // spread() keeps a representative sample across the excess rather than
    // an arbitrary prefix, and the rest are dropped from this build: their
    // solved markers go unused (the game already treats an unknown id as
    // simply absent) rather than distorting the tier's size.
    const keepAll = band.filter((c) => c.id)
      .sort((a, b) => a.stats.searchNodes - b.stats.searchNodes);
    const keep = spread(keepAll, Math.min(keepAll.length, PER_TIER));
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
