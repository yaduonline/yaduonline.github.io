#!/usr/bin/env node
'use strict';

/**
 * Unjam puzzle generator.
 *
 *   node tools/generate.js            build puzzles.js
 *   node tools/generate.js --survey   print the move-count distribution only
 *
 * For each random arrangement of blocks, explore every position reachable from
 * it (its cluster), measure every position's exact distance to a solve, and
 * keep the farthest one. See DESIGN.md -> Generator.
 */

const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

const SEED = 20260926;
const CLUSTER_LIMIT = 250000;
const TIME_BUDGET_MS = Number(process.env.UNJAM_BUDGET_MS) || 20 * 60 * 1000;

// Pack bands and sizes. Keep REQUIREMENTS.md in step with these.
const PACKS = [
  { id: 'beginner', name: 'Beginner', min: 3, max: 9, count: 100 },
  { id: 'intermediate', name: 'Intermediate', min: 10, max: 16, count: 100 },
  { id: 'advanced', name: 'Advanced', min: 17, max: 24, count: 100 },
  { id: 'expert', name: 'Expert', min: 25, max: 99, count: 100 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A random legal arrangement: the red block in the exit row, then up to
 * `target` more blocks dropped wherever they fit. No horizontal block goes in
 * the exit row - to the right of red it makes the puzzle unsolvable, to the
 * left it can never matter.
 */
function randomArrangement(rand, target) {
  const S = E.SIZE;
  const grid = new Int8Array(S * S).fill(-1);
  const pieces = [];
  const pos = [];

  function fits(piece, p) {
    if (p < 0 || p + piece.len > S) return false;
    for (let k = 0; k < piece.len; k++) {
      const cell = piece.horiz ? piece.line * S + p + k : (p + k) * S + piece.line;
      if (grid[cell] >= 0) return false;
    }
    return true;
  }
  function put(piece, p) {
    const id = pieces.length;
    pieces.push(piece);
    pos.push(p);
    for (let k = 0; k < piece.len; k++) {
      const cell = piece.horiz ? piece.line * S + p + k : (p + k) * S + piece.line;
      grid[cell] = id;
    }
  }

  put({ horiz: true, len: 2, line: E.EXIT_ROW }, Math.floor(rand() * 4));

  for (let tries = 0; tries < 300 && pieces.length < target + 1; tries++) {
    const horiz = rand() < 0.5;
    const len = rand() < 0.28 ? 3 : 2;
    const line = Math.floor(rand() * S);
    if (horiz && line === E.EXIT_ROW) continue;
    const p = Math.floor(rand() * (S - len + 1));
    const piece = { horiz, len, line };
    if (fits(piece, p)) put(piece, p);
  }
  return { pieces, pos };
}

/** The hardest position of the arrangement's cluster, or null. */
function hardest(arrangement) {
  const found = E.cluster(arrangement.pieces, arrangement.pos, CLUSTER_LIMIT);
  if (!found) return null;
  let best = -1;
  let boards = [];
  for (let s = 0; s < found.states.length; s++) {
    const d = found.dist[s];
    if (d > best) { best = d; boards = [s]; } else if (d === best) boards.push(s);
  }
  if (best < 1) return null;
  // Deterministic tie-break on the encoding.
  let board = null;
  for (const s of boards) {
    const b = E.serialize(arrangement.pieces, found.states[s]);
    if (board === null || b < board) board = b;
  }
  return { board, min: best, size: found.states.length, pieces: arrangement.pieces.length };
}

function packFor(min) {
  return PACKS.find((p) => min >= p.min && min <= p.max) || null;
}

function generate(options) {
  const rand = mulberry32(SEED);
  const seen = new Set();
  const buckets = new Map(PACKS.map((p) => [p.id, []]));
  const histogram = {};
  const started = Date.now();
  let attempts = 0;

  function full() {
    // The top band is the hard one to fill; stop once every pack has plenty
    // to choose from.
    return PACKS.every((p) => buckets.get(p.id).length >= p.count * (p.id === 'expert' ? 1 : 3));
  }

  while (!full() && Date.now() - started < TIME_BUDGET_MS) {
    attempts++;
    // Measured: dense arrangements are both quicker to explore (small
    // clusters) and far likelier to hide a long puzzle - at 16 blocks about
    // one in a thousand needs 25+ moves, at 10 blocks one in four thousand.
    // Sparse ones still come up, and fill the easy packs.
    const target = rand() < 0.2 ? 6 + Math.floor(rand() * 6) : 12 + Math.floor(rand() * 4);
    const found = hardest(randomArrangement(rand, target));
    if (!found || seen.has(found.board)) continue;
    seen.add(found.board);
    histogram[found.min] = (histogram[found.min] || 0) + 1;
    const pack = packFor(found.min);
    if (pack) buckets.get(pack.id).push(found);

    if (options.verbose && attempts % 2000 === 0) {
      const counts = PACKS.map((p) => p.name + ' ' + buckets.get(p.id).length).join(', ');
      const top = Math.max(...Object.keys(histogram).map(Number));
      process.stderr.write(`${attempts} tried, ${seen.size} distinct, top ${top} | ${counts} | ${Math.round((Date.now() - started) / 1000)}s\n`);
    }
  }
  return { buckets, histogram, attempts, seen: seen.size, ms: Date.now() - started };
}

/**
 * Take `count` from a bucket spread evenly across its move counts, so a pack
 * climbs through its band instead of bunching at the easy end.
 */
function choose(list, count) {
  const byMin = new Map();
  list.forEach((p) => {
    if (!byMin.has(p.min)) byMin.set(p.min, []);
    byMin.get(p.min).push(p);
  });
  for (const group of byMin.values()) group.sort((a, b) => (a.board < b.board ? -1 : 1));
  const keys = [...byMin.keys()].sort((a, b) => a - b);
  const picked = [];
  let round = 0;
  while (picked.length < count) {
    let added = false;
    for (const k of keys) {
      const group = byMin.get(k);
      if (round < group.length && picked.length < count) { picked.push(group[round]); added = true; }
    }
    if (!added) break;
    round++;
  }
  return picked.sort((a, b) => a.min - b.min || b.size - a.size || (a.board < b.board ? -1 : 1));
}

function write(buckets) {
  const lines = [];
  lines.push('/**');
  lines.push(' * Unjam puzzles - GENERATED FILE, DO NOT EDIT BY HAND.');
  lines.push(' *');
  lines.push(' * Rebuild with:  node tools/generate.js');
  lines.push(' *');
  lines.push(' * board: 36 cells row by row. "." empty, "A" the red block, other letters');
  lines.push(' * the wooden blocks. min: exact fewest moves. states: size of the cluster');
  lines.push(' * the puzzle was chosen from (every position reachable from it).');
  lines.push(' */');
  lines.push('(function (global) {');
  lines.push("  'use strict';");
  lines.push('');
  lines.push('  var PACKS = [');
  const report = [];
  PACKS.forEach((pack) => {
    const chosen = choose(buckets.get(pack.id), pack.count);
    report.push(`${pack.name}: ${chosen.length} (moves ${chosen[0] && chosen[0].min}-${chosen.length && chosen[chosen.length - 1].min})`);
    lines.push(`    { id: '${pack.id}', name: '${pack.name}', band: [${pack.min}, ${pack.max}], puzzles: [`);
    chosen.forEach((p, n) => {
      lines.push(`      { id: '${pack.id[0]}${n + 1}', board: '${p.board}', min: ${p.min}, states: ${p.size} },`);
    });
    lines.push('    ] },');
  });
  lines.push('  ];');
  lines.push('');
  lines.push('  global.UNJAM_PACKS = PACKS;');
  lines.push("  if (typeof module !== 'undefined' && module.exports) module.exports = PACKS;");
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this);");
  lines.push('');
  fs.writeFileSync(path.join(__dirname, '..', 'puzzles.js'), lines.join('\n'));
  return report;
}

if (require.main === module) {
  const survey = process.argv.includes('--survey');
  const result = generate({ verbose: true });
  process.stderr.write(`\n${result.attempts} arrangements, ${result.seen} distinct puzzles, ${Math.round(result.ms / 1000)}s\n`);
  process.stderr.write('moves: ' + Object.keys(result.histogram).sort((a, b) => a - b)
    .map((k) => `${k}:${result.histogram[k]}`).join(' ') + '\n');
  if (!survey) {
    const report = write(result.buckets);
    process.stderr.write(report.join('\n') + '\n');
  }
}

module.exports = { PACKS, mulberry32, randomArrangement, hardest, choose };
