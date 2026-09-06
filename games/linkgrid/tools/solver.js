'use strict';

/**
 * Exact Linkgrid solver.
 *
 * A Linkgrid solution assigns every cell of an N x N grid to exactly one colour,
 * such that each colour's cells form a simple path between that colour's two
 * endpoints. The solver enumerates solutions exhaustively (with pruning) and can
 * stop early once `limit` solutions have been found, which is what the generator
 * uses to prove uniqueness.
 *
 * Node counts are deterministic for a given puzzle, so they double as the
 * difficulty signal used when ranking generated puzzles into tiers.
 */

const EMPTY = -1;

function idx(n, r, c) {
  return r * n + c;
}

/**
 * Build the flat working state for a puzzle.
 * `endpoints` is an array of { color, a: [r,c], b: [r,c] }.
 */
function makeState(size, endpoints) {
  const n = size;
  const owner = new Int16Array(n * n).fill(EMPTY);
  const k = endpoints.length;
  const startAt = new Int32Array(k);
  const goalAt = new Int32Array(k);

  const sorted = endpoints.slice().sort((x, y) => x.color - y.color);
  sorted.forEach((e, i) => {
    startAt[i] = idx(n, e.a[0], e.a[1]);
    goalAt[i] = idx(n, e.b[0], e.b[1]);
    owner[startAt[i]] = i;
    owner[goalAt[i]] = i;
  });

  return { n, k, owner, startAt, goalAt };
}

function neighbourList(n) {
  // Precomputed adjacency: flat cell index -> array of flat neighbour indices.
  const list = new Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const out = [];
      if (r > 0) out.push(idx(n, r - 1, c));
      if (r < n - 1) out.push(idx(n, r + 1, c));
      if (c > 0) out.push(idx(n, r, c - 1));
      if (c < n - 1) out.push(idx(n, r, c + 1));
      list[idx(n, r, c)] = out;
    }
  }
  return list;
}

/**
 * Count solutions for a puzzle, stopping once `limit` have been found.
 *
 * Returns { count, nodes, nodesToFirst, exhausted, solutions }.
 * `exhausted` is false when the node budget ran out, in which case `count` is a
 * lower bound and the puzzle should be discarded rather than trusted.
 */
function countSolutions(puzzle, options = {}) {
  const limit = options.limit === undefined ? 2 : options.limit;
  const maxNodes = options.maxNodes === undefined ? 4000000 : options.maxNodes;
  const collect = options.collect === true;
  // 'full' uses every prune; 'basic' keeps only the dead-cell deduction, which
  // is roughly what a human notices. Node counts under 'basic' therefore make a
  // better proxy for how much searching a player has to do.
  const prune = options.prune === 'basic' ? 'basic' : 'full';
  // When set, only "clean" solutions count: no path may run alongside itself,
  // i.e. each colour's cells form an induced path. This is the standard
  // Numberlink convention and it is what makes a designed solution unique.
  const noSelfTouch = options.noSelfTouch === true;

  const { n, k, owner, startAt, goalAt } = makeState(puzzle.size, puzzle.endpoints);
  const adj = neighbourList(n);
  const cells = n * n;

  // Per-colour head position; heads start on the colour's `a` endpoint.
  const head = Int32Array.from(startAt);
  const done = new Uint8Array(k);
  // Path stacks, used only when `collect` is on.
  const trail = collect ? Array.from(startAt, (s) => [s]) : null;

  const solutions = [];
  let count = 0;
  let nodes = 0;
  let nodesToFirst = 0;
  let exhausted = true;

  // Scratch buffers reused by the pruning passes.
  const compId = new Int32Array(cells);
  const stack = new Int32Array(cells);
  const compOpen = new Int32Array(cells);

  function isOpenPoint(cell, color) {
    // A cell counts as an open connection point if some unfinished colour can
    // still attach a path segment to it.
    for (let c = color; c < k; c++) {
      if (done[c]) continue;
      if (cell === head[c] || cell === goalAt[c]) return true;
    }
    return false;
  }

  /**
   * Prune 1: every empty cell must keep at least two usable connections, since
   * it will end up in the middle of some path.
   * Prune 2: every connected region of empty cells must touch at least two open
   * connection points, and each unfinished colour must still be able to reach
   * its goal through empty space.
   */
  function feasible(color) {
    // --- degree check -------------------------------------------------------
    for (let cell = 0; cell < cells; cell++) {
      if (owner[cell] !== EMPTY) continue;
      let deg = 0;
      const nb = adj[cell];
      for (let i = 0; i < nb.length; i++) {
        const m = nb[i];
        if (owner[m] === EMPTY || isOpenPoint(m, color)) {
          deg++;
          if (deg >= 2) break;
        }
      }
      if (deg < 2) return false;
    }

    if (prune === 'basic') return true;

    // --- empty-region connectivity -----------------------------------------
    compId.fill(-1);
    let comps = 0;
    for (let cell = 0; cell < cells; cell++) {
      if (owner[cell] !== EMPTY || compId[cell] !== -1) continue;
      const id = comps++;
      let sp = 0;
      stack[sp++] = cell;
      compId[cell] = id;
      while (sp > 0) {
        const cur = stack[--sp];
        const nb = adj[cur];
        for (let i = 0; i < nb.length; i++) {
          const m = nb[i];
          if (owner[m] === EMPTY && compId[m] === -1) {
            compId[m] = id;
            stack[sp++] = m;
          }
        }
      }
    }

    if (comps > 0) {
      for (let i = 0; i < comps; i++) compOpen[i] = 0;
      // Count open points touching each empty region.
      for (let c = color; c < k; c++) {
        if (done[c]) continue;
        for (const point of [head[c], goalAt[c]]) {
          const nb = adj[point];
          let seen = -1;
          for (let i = 0; i < nb.length; i++) {
            const m = nb[i];
            if (owner[m] !== EMPTY) continue;
            const id = compId[m];
            if (id === seen) continue;
            seen = id;
            compOpen[id]++;
          }
        }
      }
      for (let i = 0; i < comps; i++) {
        // A region needs somewhere to come in and somewhere to leave.
        if (compOpen[i] < 2) return false;
      }
    }

    // --- per-colour reachability -------------------------------------------
    for (let c = color; c < k; c++) {
      if (done[c]) continue;
      const h = head[c];
      const g = goalAt[c];
      let adjacent = false;
      const nb = adj[h];
      for (let i = 0; i < nb.length; i++) if (nb[i] === g) adjacent = true;
      if (adjacent) continue;

      let reachable = false;
      const headComps = new Set();
      for (const m of adj[h]) if (owner[m] === EMPTY) headComps.add(compId[m]);
      if (headComps.size === 0) return false;
      for (const m of adj[g]) {
        if (owner[m] === EMPTY && headComps.has(compId[m])) {
          reachable = true;
          break;
        }
      }
      if (!reachable) return false;
    }

    return true;
  }

  /**
   * Number of cells already owned by `color` that are adjacent to `cell`.
   * For a clean path this must be exactly one (the cell we arrived from) while
   * growing, so a count above one means the path would touch itself.
   */
  function touchCount(cell, color, ignore) {
    let count = 0;
    const nb = adj[cell];
    for (let i = 0; i < nb.length; i++) {
      const m = nb[i];
      if (m !== ignore && owner[m] === color) count++;
    }
    return count;
  }

  function recordSolution() {
    count++;
    if (count === 1) nodesToFirst = nodes;
    if (collect) {
      solutions.push(trail.map((t) => t.map((cell) => [Math.floor(cell / n), cell % n])));
    }
  }

  function solveColor(color) {
    if (nodes > maxNodes) {
      exhausted = false;
      return true; // unwind
    }
    if (color === k) {
      // All colours routed; the degree pruning guarantees full coverage, but
      // verify explicitly so the solver is trustworthy on its own.
      for (let cell = 0; cell < cells; cell++) if (owner[cell] === EMPTY) return false;
      recordSolution();
      return count >= limit;
    }
    // A colour whose two endpoints are already adjacent has only one clean
    // route: the direct two-cell path.
    let forcedClose = false;
    if (noSelfTouch) {
      for (const m of adj[head[color]]) if (m === goalAt[color]) forcedClose = true;
    }
    return extend(color, forcedClose);
  }

  function extend(color, mustClose) {
    nodes++;
    if (nodes > maxNodes) {
      exhausted = false;
      return true;
    }

    const h = head[color];
    const goal = goalAt[color];
    const nb = adj[h];

    for (let i = 0; i < nb.length; i++) {
      const next = nb[i];
      if (mustClose && next !== goal) continue;

      if (next === goal) {
        // Closing move: the goal endpoint must not brush the rest of the path.
        if (noSelfTouch && touchCount(goal, color, h) > 0) continue;
        // Close this colour and move on.
        done[color] = 1;
        head[color] = goal;
        if (collect) trail[color].push(goal);
        const prevHead = h;
        if (feasible(color + 1) && solveColor(color + 1)) return true;
        done[color] = 0;
        head[color] = prevHead;
        if (collect) trail[color].pop();
        continue;
      }

      if (owner[next] !== EMPTY) continue;

      let closeNext = false;
      if (noSelfTouch) {
        const touches = touchCount(next, color, h);
        // Brushing the goal endpoint is only legal if we step onto it next.
        if (touches > 1) continue;
        if (touches === 1) {
          let brushesGoal = false;
          for (const m of adj[next]) if (m !== h && owner[m] === color && m === goal) brushesGoal = true;
          if (!brushesGoal) continue;
          closeNext = true;
        }
      }

      owner[next] = color;
      head[color] = next;
      if (collect) trail[color].push(next);
      if (feasible(color)) {
        if (extend(color, closeNext)) return true;
      }
      if (collect) trail[color].pop();
      head[color] = h;
      owner[next] = EMPTY;
    }
    return false;
  }

  if (feasible(0)) solveColor(0);
  if (nodes > maxNodes) exhausted = false;

  return { count, nodes, nodesToFirst, exhausted, solutions };
}

/** Convenience: true when the puzzle has exactly one solution. */
function isUnique(puzzle, options = {}) {
  const res = countSolutions(puzzle, { ...options, limit: 2 });
  return res.exhausted && res.count === 1;
}

module.exports = { countSolutions, isUnique, makeState, EMPTY };
