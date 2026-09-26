/**
 * Unjam rules engine and solver.
 *
 * Pure logic with no DOM access, so the game, the browser test page, the Node
 * test runner and the puzzle generator all run exactly the same code. Loaded
 * as a classic script (globalThis.UnjamEngine) or via require().
 */
(function (global) {
  'use strict';

  var SIZE = 6;
  var EXIT_ROW = 2;   // 0-based: the third row
  var RED = 0;        // the red block is always piece 0
  var EMPTY = '.';

  // A position key is sum(pos[i] * SIZE^i). 16 blocks keeps it below 2^53.
  var MAX_PIECES = 16;

  // -------------------------------------------------------------------------
  // Encoding
  // -------------------------------------------------------------------------

  /**
   * Read a 36-character board string into fixed piece shapes and positions.
   *
   *   '.' or 'o'  empty
   *   'A'         the red block
   *   'B'...      other blocks, the letter repeated over each cell
   *
   * Pieces are numbered with the red block first and the rest in the order
   * their letters first appear. Throws on anything malformed.
   */
  function parse(board) {
    if (typeof board !== 'string' || board.length !== SIZE * SIZE) {
      throw new Error('board must be ' + (SIZE * SIZE) + ' characters');
    }
    var cells = {};
    var order = [];
    for (var i = 0; i < board.length; i++) {
      var ch = board[i];
      if (ch === EMPTY || ch === 'o') continue;
      if (!/[A-Z]/.test(ch)) throw new Error('unexpected character "' + ch + '"');
      if (!cells[ch]) { cells[ch] = []; order.push(ch); }
      cells[ch].push(i);
    }
    if (!cells.A) throw new Error('no red block (A)');
    order.splice(order.indexOf('A'), 1);
    order.unshift('A');
    if (order.length > MAX_PIECES) throw new Error('too many blocks');

    var pieces = [];
    var pos = [];
    order.forEach(function (ch) {
      var list = cells[ch];
      var len = list.length;
      if (len < 2 || len > 3) throw new Error('block ' + ch + ' is ' + len + ' long');
      var r0 = Math.floor(list[0] / SIZE);
      var c0 = list[0] % SIZE;
      var horiz = Math.floor(list[1] / SIZE) === r0;
      for (var k = 0; k < len; k++) {
        var r = Math.floor(list[k] / SIZE);
        var c = list[k] % SIZE;
        var ok = horiz ? (r === r0 && c === c0 + k) : (c === c0 && r === r0 + k);
        if (!ok) throw new Error('block ' + ch + ' is not a straight line');
      }
      pieces.push({ horiz: horiz, len: len, line: horiz ? r0 : c0, label: ch });
      pos.push(horiz ? c0 : r0);
    });

    var red = pieces[RED];
    if (!red.horiz || red.len !== 2 || red.line !== EXIT_ROW) {
      throw new Error('red block must be horizontal, 2 long, in the exit row');
    }
    return { pieces: pieces, pos: pos };
  }

  /**
   * Write pieces and positions back to a board string. Letters are assigned
   * afresh: A for red, then B, C, ... in reading order of each block's first
   * cell, so the same arrangement always encodes to the same string.
   */
  function serialize(pieces, pos) {
    var grid = occupancy(pieces, pos);
    var out = new Array(SIZE * SIZE);
    var letters = {};
    var next = 1;
    for (var i = 0; i < grid.length; i++) {
      var p = grid[i];
      if (p < 0) { out[i] = EMPTY; continue; }
      if (letters[p] === undefined) {
        letters[p] = p === RED ? 'A' : String.fromCharCode(65 + next++);
      }
      out[i] = letters[p];
    }
    return out.join('');
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------

  /** Index of cell k (0..len-1) of piece i at position p. */
  function cellOf(piece, p, k) {
    return piece.horiz ? piece.line * SIZE + p + k : (p + k) * SIZE + piece.line;
  }

  /** Flat grid of piece indices, -1 for empty. */
  function occupancy(pieces, pos) {
    var grid = new Int8Array(SIZE * SIZE).fill(-1);
    for (var i = 0; i < pieces.length; i++) {
      for (var k = 0; k < pieces[i].len; k++) grid[cellOf(pieces[i], pos[i], k)] = i;
    }
    return grid;
  }

  /** Cell index at (line, p) along a piece's axis. */
  function axisCell(piece, p) {
    return piece.horiz ? piece.line * SIZE + p : p * SIZE + piece.line;
  }

  /**
   * The lowest and highest position piece i can slide to from where it is,
   * walking outwards until the wall or another block.
   */
  function range(pieces, pos, i, grid) {
    grid = grid || occupancy(pieces, pos);
    var piece = pieces[i];
    var lo = pos[i];
    while (lo > 0 && grid[axisCell(piece, lo - 1)] < 0) lo--;
    var hi = pos[i];
    while (hi + piece.len < SIZE && grid[axisCell(piece, hi + piece.len)] < 0) hi++;
    return { min: lo, max: hi };
  }

  function isSolved(pieces, pos) {
    return pos[RED] === SIZE - pieces[RED].len;
  }

  function keyOf(pos) {
    var key = 0;
    for (var i = pos.length - 1; i >= 0; i--) key = key * SIZE + pos[i];
    return key;
  }

  /** Every single-move successor of a position, as [piece, to] pairs. */
  function movesFrom(pieces, pos) {
    var grid = occupancy(pieces, pos);
    var out = [];
    for (var i = 0; i < pieces.length; i++) {
      var r = range(pieces, pos, i, grid);
      for (var p = r.min; p <= r.max; p++) if (p !== pos[i]) out.push([i, p]);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Solver
  // -------------------------------------------------------------------------

  /**
   * Breadth-first search for the fewest moves to a solved position.
   *
   * Returns { moves, path: [[piece, to], ...], explored } or null when no
   * solution exists. `limit` bounds the states visited, for safety.
   */
  function solve(pieces, start, limit) {
    limit = limit || 2000000;
    var first = start.slice();
    if (isSolved(pieces, first)) return { moves: 0, path: [], explored: 1 };

    // parent map: key -> [parentKey, piece, to]; states kept in a flat queue.
    var parent = new Map();
    parent.set(keyOf(first), null);
    var queue = [first];
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var curKey = keyOf(cur);
      var next = movesFrom(pieces, cur);
      for (var m = 0; m < next.length; m++) {
        var i = next[m][0];
        var to = next[m][1];
        var state = cur.slice();
        state[i] = to;
        var key = keyOf(state);
        if (parent.has(key)) continue;
        parent.set(key, [curKey, i, to]);
        if (i === RED && isSolved(pieces, state)) {
          var path = [];
          var k = key;
          while (parent.get(k)) {
            var link = parent.get(k);
            path.unshift([link[1], link[2]]);
            k = link[0];
          }
          return { moves: path.length, path: path, explored: parent.size };
        }
        if (parent.size > limit) return null;
        queue.push(state);
      }
    }
    return null;
  }

  /**
   * Explore the whole cluster reachable from `start` and give every position
   * its exact distance to the nearest solved position. Used by the generator,
   * and by the tests to check a puzzle is the hardest of its cluster.
   *
   * Returns null if the cluster exceeds `limit` states or has no solution.
   */
  function cluster(pieces, start, limit) {
    limit = limit || 500000;
    var index = new Map();          // key -> state number
    var states = [];                // state number -> pos array
    var edges = [];                 // state number -> neighbour state numbers
    index.set(keyOf(start), 0);
    states.push(start.slice());
    for (var s = 0; s < states.length; s++) {
      var cur = states[s];
      var list = [];
      var next = movesFrom(pieces, cur);
      for (var m = 0; m < next.length; m++) {
        var state = cur.slice();
        state[next[m][0]] = next[m][1];
        var key = keyOf(state);
        var id = index.get(key);
        if (id === undefined) {
          if (states.length >= limit) return null;
          id = states.length;
          index.set(key, id);
          states.push(state);
        }
        list.push(id);
      }
      edges.push(list);
    }

    // Moves are reversible, so the graph is undirected: a multi-source search
    // outward from every solved position gives each position its minimum.
    var dist = new Int16Array(states.length).fill(-1);
    var queue = [];
    for (var t = 0; t < states.length; t++) {
      if (isSolved(pieces, states[t])) { dist[t] = 0; queue.push(t); }
    }
    if (!queue.length) return null;
    for (var h = 0; h < queue.length; h++) {
      var a = queue[h];
      var nb = edges[a];
      for (var e = 0; e < nb.length; e++) {
        if (dist[nb[e]] < 0) { dist[nb[e]] = dist[a] + 1; queue.push(nb[e]); }
      }
    }
    return { states: states, dist: dist };
  }

  // -------------------------------------------------------------------------
  // Game state
  // -------------------------------------------------------------------------

  /** puzzle: { id, board, min } */
  function createGame(puzzle) {
    var parsed = parse(puzzle.board);
    return {
      puzzle: puzzle,
      pieces: parsed.pieces,
      start: parsed.pos.slice(),
      pos: parsed.pos.slice(),
      history: [],
      moves: 0,
      hints: 0,
      solved: false,
    };
  }

  function pieceRange(game, i) {
    return range(game.pieces, game.pos, i);
  }

  /**
   * Slide piece i to position `to`. Returns false (and changes nothing) if the
   * slide is not legal from here.
   *
   * Consecutive slides of the same piece are one move: the last history entry
   * is extended rather than a new one pushed, and removed altogether if the
   * piece ends up back where that move began.
   */
  function slide(game, i, to) {
    if (game.solved) return false;
    if (i < 0 || i >= game.pieces.length) return false;
    if (to === game.pos[i]) return false;
    var r = pieceRange(game, i);
    if (to < r.min || to > r.max) return false;

    var last = game.history[game.history.length - 1];
    if (last && last.piece === i) {
      last.to = to;
      if (last.to === last.from) game.history.pop();
    } else {
      game.history.push({ piece: i, from: game.pos[i], to: to });
    }
    game.pos[i] = to;
    game.moves = game.history.length;
    game.solved = isSolved(game.pieces, game.pos);
    return true;
  }

  function undo(game) {
    if (game.solved) return false;
    var last = game.history.pop();
    if (!last) return false;
    game.pos[last.piece] = last.from;
    game.moves = game.history.length;
    return true;
  }

  function restart(game) {
    game.pos = game.start.slice();
    game.history = [];
    game.moves = 0;
    game.hints = 0;
    game.solved = false;
  }

  /**
   * The next move of an optimal solution from the current position, as
   * { piece, to, remaining }, or null if solved or unsolvable.
   */
  function hint(game) {
    if (game.solved) return null;
    var result = solve(game.pieces, game.pos);
    if (!result || !result.path.length) return null;
    return { piece: result.path[0][0], to: result.path[0][1], remaining: result.moves };
  }

  // -------------------------------------------------------------------------
  // Validation (used by the generator and the tests)
  // -------------------------------------------------------------------------

  /** A list of problems with a board string; empty if it is well formed. */
  function validate(board) {
    var errors = [];
    var parsed;
    try {
      parsed = parse(board);
    } catch (err) {
      return [err.message];
    }
    if (isSolved(parsed.pieces, parsed.pos)) errors.push('already solved');
    return errors;
  }

  var api = {
    SIZE: SIZE,
    EXIT_ROW: EXIT_ROW,
    RED: RED,
    MAX_PIECES: MAX_PIECES,
    parse: parse,
    serialize: serialize,
    occupancy: occupancy,
    range: range,
    isSolved: isSolved,
    keyOf: keyOf,
    movesFrom: movesFrom,
    solve: solve,
    cluster: cluster,
    createGame: createGame,
    pieceRange: pieceRange,
    slide: slide,
    undo: undo,
    restart: restart,
    hint: hint,
    validate: validate,
  };

  global.UnjamEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
