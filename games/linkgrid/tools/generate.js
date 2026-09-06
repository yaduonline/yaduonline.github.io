'use strict';

/**
 * Linkgrid puzzle generator.
 *
 * Puzzles are built by annealing a partition of the whole grid into *induced*
 * paths - paths that never run alongside themselves. See GENERATION.md for why
 * that is the shape of solution worth searching for; in short it guarantees
 * full coverage, keeps the colour count at Flow-like levels, and makes the
 * intended solution the only clean solution.
 *
 * Everything is driven by a seeded RNG, so re-running the build reproduces the
 * shipped puzzle set exactly.
 */

const { countSolutions } = require('./solver.js');
const { measure, gateFailures, structureFailures } = require('./quality.js');

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32)
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng, n) => Math.floor(rng() * n);

// ---------------------------------------------------------------------------
// Grid helpers. Cells are flat indices r * n + c inside the generator.
// ---------------------------------------------------------------------------

function adjacency(n) {
  const adj = new Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const out = [];
      if (r > 0) out.push((r - 1) * n + c);
      if (r < n - 1) out.push((r + 1) * n + c);
      if (c > 0) out.push(r * n + c - 1);
      if (c < n - 1) out.push(r * n + c + 1);
      adj[r * n + c] = out;
    }
  }
  return adj;
}

/** Corner slots: 0 up-left, 1 up-right, 2 down-left, 3 down-right. */
const CORNER_COUNT = 4;

/**
 * Bend statistics for one path: interior bends, border bends, and how many
 * bends of each corner orientation it contains.
 */
function pathStats(path, n) {
  const corners = [0, 0, 0, 0];
  let interior = 0;
  let border = 0;

  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1];
    const b = path[i];
    const c = path[i + 1];
    const inR = ((b / n) | 0) - ((a / n) | 0);
    const inC = (b % n) - (a % n);
    const outR = ((c / n) | 0) - ((b / n) | 0);
    const outC = (c % n) - (b % n);
    if (inR === outR && inC === outC) continue;

    const br = (b / n) | 0;
    const bc = b % n;
    if (br > 0 && bc > 0 && br < n - 1 && bc < n - 1) interior++;
    else border++;

    // The two grid sides used at this cell: where we came in, and where we go.
    const vertical = inR !== 0 ? -inR : outR;
    const horizontal = inC !== 0 ? -inC : outC;
    corners[(vertical < 0 ? 0 : 2) + (horizontal < 0 ? 0 : 1)]++;
  }

  return { interior, border, corners, length: path.length };
}

/**
 * Starting partition: straight rows, then split the longest path repeatedly
 * until there are `k` of them. Straight rows are already induced paths, so the
 * annealer starts from a legal (if very dull) solution. Splitting only ever
 * increases the count, so `k` must be at least the grid size.
 */
function initialPartition(n, k) {
  const paths = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(r * n + c);
    paths.push(row);
  }
  while (paths.length < k) {
    let longest = 0;
    for (let i = 1; i < paths.length; i++) {
      if (paths[i].length > paths[longest].length) longest = i;
    }
    if (paths[longest].length < 4) break;
    const path = paths[longest];
    const half = Math.floor(path.length / 2);
    paths[longest] = path.slice(0, half);
    paths.push(path.slice(half));
  }
  return paths;
}

const DEFAULT_WEIGHTS = {
  interiorBend: 3, // reward for a bend away from the border
  borderBend: 0, // border bends are neither rewarded nor punished
  bendCap: 0.5, // bends past this share of a route's cells earn nothing, which
  //              stops the search collapsing into uniform diagonal staircases
  straightPenalty: 40, // a colour with no bends at all
  shortPenalty: 60, // a colour shorter than three cells
  lengthPenalty: 0.1, // mild pull towards equal-length colours
  cornerBalance: 4, // global penalty on uneven corner orientations
  startTemperature: 5,
};

/**
 * Anneal an induced-path partition.
 *
 * The only move is "hand the cell at one end of a route to a neighbouring route
 * that can legally extend to it". That move keeps every invariant intact - full
 * coverage, contiguous routes, no route touching itself - so every state the
 * search visits is a valid solution and nothing ever needs repairing.
 */
function anneal(n, k, rng, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const iterations = options.iterations || 5000 * n * n;
  const adj = adjacency(n);
  const cells = n * n;
  const targetLength = cells / k;

  const paths = options.start ? options.start.map((p) => p.slice()) : initialPartition(n, k);
  const owner = new Int32Array(cells).fill(-1);
  paths.forEach((path, i) => path.forEach((cell) => (owner[cell] = i)));

  const stats = paths.map((path) => pathStats(path, n));
  const cornerTotals = [0, 0, 0, 0];
  for (const s of stats) {
    for (let i = 0; i < CORNER_COUNT; i++) cornerTotals[i] += s.corners[i];
  }

  function localScore(s) {
    const usable = Math.min(s.interior, Math.ceil(weights.bendCap * s.length));
    let score = weights.interiorBend * usable + weights.borderBend * s.border;
    if (s.interior + s.border === 0) score -= weights.straightPenalty;
    if (s.length < 3) score -= weights.shortPenalty;
    score -= weights.lengthPenalty * Math.abs(s.length - targetLength) ** 1.5;
    return score;
  }

  /** Spread of the four corner orientations across the board; flat is best. */
  function cornerPenalty(totals) {
    return weights.cornerBalance * (Math.max(...totals) - Math.min(...totals));
  }

  for (let step = 0; step < iterations; step++) {
    const temperature = Math.max(0.01, weights.startTemperature * (1 - step / iterations));

    const ai = randInt(rng, paths.length);
    const from = paths[ai];
    if (from.length < 3) continue; // a colour needs its two dots plus slack

    const fromTail = rng() < 0.5;
    const cell = fromTail ? from[from.length - 1] : from[0];

    // Which neighbouring routes can accept this cell at one of their own ends?
    const targets = [];
    for (const m of adj[cell]) {
      const bi = owner[m];
      if (bi === ai) continue;
      const other = paths[bi];
      const atHead = other[0] === m;
      if (!atHead && other[other.length - 1] !== m) continue;
      // Induced-path rule: the cell may touch its new route only at that end.
      let touches = 0;
      for (const y of adj[cell]) if (owner[y] === bi) touches++;
      if (touches !== 1) continue;
      targets.push({ bi, atHead });
    }
    if (!targets.length) continue;

    const pick = targets[randInt(rng, targets.length)];
    const other = paths[pick.bi];
    const newFrom = fromTail ? from.slice(0, -1) : from.slice(1);
    const newOther = pick.atHead ? [cell].concat(other) : other.concat([cell]);

    const newFromStats = pathStats(newFrom, n);
    const newOtherStats = pathStats(newOther, n);
    const oldFromStats = stats[ai];
    const oldOtherStats = stats[pick.bi];

    const totals = cornerTotals.slice();
    for (let i = 0; i < CORNER_COUNT; i++) {
      totals[i] += newFromStats.corners[i] + newOtherStats.corners[i] -
        oldFromStats.corners[i] - oldOtherStats.corners[i];
    }

    const delta =
      localScore(newFromStats) + localScore(newOtherStats) -
      localScore(oldFromStats) - localScore(oldOtherStats) +
      cornerPenalty(cornerTotals) - cornerPenalty(totals);

    if (delta >= 0 || rng() < Math.exp(delta / temperature)) {
      paths[ai] = newFrom;
      paths[pick.bi] = newOther;
      owner[cell] = pick.bi;
      stats[ai] = newFromStats;
      stats[pick.bi] = newOtherStats;
      for (let i = 0; i < CORNER_COUNT; i++) cornerTotals[i] = totals[i];
    }
  }

  return options.flat ? paths : paths.map((path) => path.map((cell) => [(cell / n) | 0, cell % n]));
}

/**
 * Merge two routes into one, given that `aEnd` and `bEnd` are the touching ends.
 */
function joinPaths(a, b, aAtHead, bAtHead) {
  const left = aAtHead ? a.slice().reverse() : a.slice();
  const right = bAtHead ? b.slice() : b.slice().reverse();
  return left.concat(right);
}

/**
 * Reduce a partition to `k` routes by merging neighbours.
 *
 * Two routes may merge only when their sole point of contact is one end each -
 * otherwise the merged route would run alongside itself. Straight rows never
 * qualify, so the caller warms the partition up with a short anneal first, and
 * this function anneals again whenever it runs out of legal merges.
 *
 * Returns null if `k` could not be reached.
 */
function mergeDown(n, start, k, rng, options = {}) {
  const adj = adjacency(n);
  let paths = start.map((p) => p.slice());
  const owner = new Int32Array(n * n).fill(-1);
  const reindex = () => paths.forEach((path, i) => path.forEach((cell) => (owner[cell] = i)));
  reindex();

  const warmup = options.warmupIterations || 400 * n * n;

  for (let stall = 0; paths.length > k && stall < 12; ) {
    const options_ = [];
    for (let i = 0; i < paths.length; i++) {
      const a = paths[i];
      for (const aAtHead of [true, false]) {
        const aEnd = aAtHead ? a[0] : a[a.length - 1];
        for (const m of adj[aEnd]) {
          const j = owner[m];
          if (j === i) continue;
          const b = paths[j];
          const bAtHead = b[0] === m;
          if (!bAtHead && b[b.length - 1] !== m) continue;
          // The merged route stays induced only if this is the single contact.
          let contacts = 0;
          for (const cell of a) {
            for (const y of adj[cell]) if (owner[y] === j) contacts++;
          }
          if (contacts !== 1) continue;
          options_.push({ i, j, aAtHead, bAtHead });
        }
      }
    }

    if (!options_.length) {
      // Nothing can merge yet; shake the partition and look again.
      paths = anneal(n, paths.length, rng, {
        ...options,
        start: paths,
        iterations: warmup,
        flat: true,
      });
      reindex();
      stall++;
      continue;
    }

    const pick = options_[randInt(rng, options_.length)];
    const merged = joinPaths(paths[pick.i], paths[pick.j], pick.aAtHead, pick.bAtHead);
    const keep = Math.min(pick.i, pick.j);
    const drop = Math.max(pick.i, pick.j);
    paths[keep] = merged;
    paths.splice(drop, 1);
    reindex();
    stall = 0;
  }

  return paths.length === k ? paths : null;
}

/**
 * Build a partition with exactly `k` routes, whatever `k` is relative to `n`.
 * Above the grid size the starting rows are split; below it they are annealed
 * loose and then merged.
 */
function buildPartition(n, k, rng, options = {}) {
  if (k >= n) return anneal(n, k, rng, options);

  let paths = anneal(n, n, rng, {
    ...options,
    iterations: options.warmupIterations || 400 * n * n,
    flat: true,
  });
  paths = mergeDown(n, paths, k, rng, options);
  if (!paths) return null;
  return anneal(n, k, rng, { ...options, start: paths });
}

// ---------------------------------------------------------------------------
// Candidates and pools
// ---------------------------------------------------------------------------

function endpointsOf(solution) {
  return solution.map((path, color) => ({
    color,
    a: path[0].slice(),
    b: path[path.length - 1].slice(),
  }));
}

/**
 * Check a partition end to end: structure, bend quality, uniqueness, difficulty.
 * Returns null when it fails any check.
 *
 * `searchNodes` is how much searching is left once the easy deductions run out,
 * and is the difficulty signal the tiers are built from.
 */
function evaluateCandidate(size, solution, options = {}) {
  if (!solution) return null;
  const colors = solution.length;
  const endpoints = endpointsOf(solution);
  const puzzle = { size, endpoints };

  if (structureFailures(puzzle, solution).length) return null;

  const metrics = measure(size, solution);
  if (gateFailures(metrics, options.gates).length) return null;

  // A dot may not double as another colour's dot.
  const seen = new Set();
  for (const endpoint of endpoints) {
    for (const cell of [endpoint.a, endpoint.b]) {
      const cellKey = cell[0] + ',' + cell[1];
      if (seen.has(cellKey)) return null;
      seen.add(cellKey);
    }
  }

  const maxNodes = options.maxNodes || 2000000;
  const clean = countSolutions(puzzle, { limit: 2, maxNodes, noSelfTouch: true });
  if (!clean.exhausted || clean.count !== 1) return null;

  const search = countSolutions(puzzle, {
    limit: 1,
    maxNodes,
    noSelfTouch: true,
    prune: 'basic',
  });

  return {
    size,
    colors,
    endpoints,
    solution,
    metrics,
    stats: {
      cleanSolutions: clean.count,
      solverNodes: clean.nodesToFirst,
      searchNodes: search.exhausted ? search.nodesToFirst : maxNodes,
      searchExhausted: search.exhausted,
    },
  };
}

/** Build one candidate from scratch at the given colour count. */
function buildCandidate(size, colors, seed, options = {}) {
  const rng = makeRng(seed);
  const solution = buildPartition(size, colors, rng, options);
  if (!solution || solution.length !== colors) return null;
  const candidate = evaluateCandidate(size, solution, options);
  if (candidate) candidate.seed = seed;
  return candidate;
}

/** Weights that turn `anneal` into a plain random walk over legal moves. */
const KICK_WEIGHTS = {
  interiorBend: 0,
  borderBend: 0,
  bendCap: 1,
  straightPenalty: 0,
  shortPenalty: 0,
  lengthPenalty: 0,
  cornerBalance: 0,
  startTemperature: 1,
};

const toFlat = (size, solution) => solution.map((route) => route.map((c) => c[0] * size + c[1]));

/**
 * Explore the space of valid puzzles for one board size.
 *
 * Sampling fresh partitions only ever finds easy puzzles: the hard ones are a
 * thin tail. So each chain instead walks - kick the current partition with a
 * short random walk of legal moves, polish the bends back with a cool anneal,
 * and step to the result whenever it is not much easier than where we stand.
 * Every distinct valid puzzle the walk passes through is collected, which is why
 * one run yields puzzles across the whole difficulty range rather than only the
 * hardest one found.
 */
function explorePool(size, options = {}) {
  const colorCounts = options.colorCounts || [size - 2, size - 1, size, size + 1];
  const chains = options.chains || 6;
  const rounds = options.rounds || 250;
  const kick = options.kick || 40;
  const polish = options.polish || 200 * size * size;
  const tolerance = options.tolerance === undefined ? 0.6 : options.tolerance;

  const seen = new Set(options.knownFingerprints || []);
  const pool = [];

  for (const colors of colorCounts) {
    if (colors < 2) continue;
    for (let chain = 0; chain < chains; chain++) {
      const rng = makeRng((size * 7919 + colors * 104729 + chain * 2654435761) >>> 0);

      let current = null;
      for (let attempt = 0; attempt < 10 && !current; attempt++) {
        const solution = buildPartition(size, colors, rng, options);
        current = evaluateCandidate(size, solution, options);
      }
      if (!current) continue;

      for (let round = 0; round < rounds; round++) {
        const kicked = anneal(size, colors, rng, {
          ...options,
          start: toFlat(size, current.solution),
          iterations: kick,
          weights: KICK_WEIGHTS,
          flat: true,
        });
        const polished = anneal(size, colors, rng, {
          ...options,
          start: kicked,
          iterations: polish,
          weights: { ...(options.weights || {}), startTemperature: 0.8 },
        });
        const candidate = evaluateCandidate(size, polished, options);
        if (!candidate) continue;

        const fingerprint = fingerprintOf(candidate.endpoints);
        if (!seen.has(fingerprint)) {
          seen.add(fingerprint);
          candidate.fingerprint = fingerprint;
          pool.push(candidate);
          if (options.onCandidate) options.onCandidate(candidate, pool.length);
        }
        // Step even when slightly worse, so a chain is not trapped at a peak.
        if (candidate.stats.searchNodes >= current.stats.searchNodes * tolerance) {
          current = candidate;
        }
      }
    }
  }

  return pool;
}

/** Stable identity for a puzzle: its endpoint layout. */
function fingerprintOf(endpoints) {
  return endpoints
    .map((e) => e.a[0] + ',' + e.a[1] + '-' + e.b[0] + ',' + e.b[1])
    .sort()
    .join('|');
}

module.exports = {
  makeRng,
  adjacency,
  pathStats,
  initialPartition,
  anneal,
  mergeDown,
  buildPartition,
  endpointsOf,
  evaluateCandidate,
  buildCandidate,
  explorePool,
  fingerprintOf,
  DEFAULT_WEIGHTS,
};
