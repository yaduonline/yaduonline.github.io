/**
 * Tetris rules engine.
 *
 * Pure game logic with no DOM access, so the browser UI, the browser test page
 * and the Node test runner all exercise exactly the same code. Loaded as a
 * classic script (globalThis.TetrisEngine) or via require().
 */
(function (global) {
  'use strict';

  var COLS = 10;
  var ROWS = 20;
  var SPAWN_ROWS = 2; // hidden rows above the visible field, where pieces appear

  var LOCK_DELAY_MS = 500;
  var MAX_LOCK_RESETS = 15; // stops a piece being held up forever

  /**
   * Pieces in their spawn orientation, on the smallest square that lets them
   * rotate about a consistent centre - 4x4 for I, 3x3 for the rest, 2x2 for O
   * (which never actually turns).
   */
  var SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  };

  var TYPES = ['I', 'J', 'L', 'O', 'S', 'Z', 'T'];

  /**
   * Super Rotation System kick tables. For each rotation transition, the
   * offsets to try in order; the first that fits wins. I has its own table
   * because it rotates about a different centre. O never kicks.
   *
   * Keys are "from>to" using rotation indices 0-3.
   */
  var KICKS_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };

  var KICKS_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };

  var LINE_SCORES = [0, 100, 300, 500, 800];

  // -------------------------------------------------------------------------
  // Pure helpers
  // -------------------------------------------------------------------------

  /** Rotate a square matrix a quarter turn. `dir` is 1 clockwise, -1 anti. */
  function rotateMatrix(matrix, dir) {
    var size = matrix.length;
    var out = [];
    for (var y = 0; y < size; y++) {
      out.push(new Array(size).fill(0));
    }
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (dir > 0) out[c][size - 1 - r] = matrix[r][c];
        else out[size - 1 - c][r] = matrix[r][c];
      }
    }
    return out;
  }

  function emptyGrid() {
    var grid = [];
    for (var y = 0; y < ROWS + SPAWN_ROWS; y++) {
      grid.push(new Array(COLS).fill(null));
    }
    return grid;
  }

  /**
   * Does `matrix` placed at `pos` overlap a wall, the floor, or a locked cell?
   * Above the top of the grid is allowed: pieces spawn partly off-screen.
   */
  function collides(grid, matrix, pos) {
    for (var y = 0; y < matrix.length; y++) {
      for (var x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        var gx = pos.x + x;
        var gy = pos.y + y;
        if (gx < 0 || gx >= COLS) return true;
        if (gy >= grid.length) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  /** Row indices that are completely filled, top to bottom. */
  function fullRows(grid) {
    var rows = [];
    for (var y = 0; y < grid.length; y++) {
      var full = true;
      for (var x = 0; x < COLS; x++) {
        if (!grid[y][x]) { full = false; break; }
      }
      if (full) rows.push(y);
    }
    return rows;
  }

  /** Remove the given rows and drop everything above them down. */
  function removeRows(grid, rows) {
    var next = grid.filter(function (row, y) {
      return rows.indexOf(y) === -1;
    });
    while (next.length < grid.length) {
      next.unshift(new Array(COLS).fill(null));
    }
    return next;
  }

  /** How far down this piece can fall from where it is. */
  function dropDistance(grid, matrix, pos) {
    var distance = 0;
    while (!collides(grid, matrix, { x: pos.x, y: pos.y + distance + 1 })) {
      distance++;
    }
    return distance;
  }

  /** Milliseconds between gravity steps at a given level. */
  function gravityInterval(level) {
    return Math.max(60, 1000 - (level - 1) * 90);
  }

  // -------------------------------------------------------------------------
  // Bag randomiser
  // -------------------------------------------------------------------------

  /**
   * 7-bag: shuffle all seven types, deal them out, shuffle again. Guarantees
   * every piece within any seven, so no long droughts - the old build drew
   * uniformly at random and could deal the same piece many times over.
   */
  function makeBag(random) {
    var rng = random || Math.random;
    var queue = [];
    function refill() {
      var bag = TYPES.slice();
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
      queue = queue.concat(bag);
    }
    return {
      next: function () {
        if (queue.length === 0) refill();
        return queue.shift();
      },
      peek: function () {
        if (queue.length === 0) refill();
        return queue[0];
      },
    };
  }

  // -------------------------------------------------------------------------
  // Game state
  // -------------------------------------------------------------------------

  function spawnPosition(type) {
    // Centre the piece, sitting in the hidden rows.
    var width = SHAPES[type].length;
    return { x: Math.floor((COLS - width) / 2), y: 0 };
  }

  function createGame(options) {
    var opts = options || {};
    var game = {
      cols: COLS,
      rows: ROWS,
      spawnRows: SPAWN_ROWS,
      grid: emptyGrid(),
      bag: makeBag(opts.random),
      piece: null,
      nextType: null,
      score: 0,
      level: 1,
      lines: 0,
      status: 'ready', // ready | playing | paused | clearing | over
      gravityMs: 0,
      lockMs: 0,
      lockResets: 0,
      grounded: false,
      clearing: [],
      clearMs: 0,
      events: [],
    };
    game.nextType = game.bag.next();
    return game;
  }

  /** Take the next piece from the bag. Sets status to 'over' if it will not fit. */
  function spawn(game) {
    var type = game.nextType;
    game.nextType = game.bag.next();
    game.piece = {
      type: type,
      matrix: SHAPES[type].map(function (row) { return row.slice(); }),
      rotation: 0,
      pos: spawnPosition(type),
    };
    game.grounded = false;
    game.lockMs = 0;
    game.lockResets = 0;

    if (collides(game.grid, game.piece.matrix, game.piece.pos)) {
      game.status = 'over';
      game.events.push({ type: 'gameover', score: game.score });
      return false;
    }
    return true;
  }

  function start(game) {
    game.grid = emptyGrid();
    game.score = 0;
    game.level = 1;
    game.lines = 0;
    game.clearing = [];
    game.clearMs = 0;
    game.gravityMs = 0;
    game.events = [];
    game.status = 'playing';
    spawn(game);
    return game;
  }

  /**
   * A move that succeeds while the piece is resting on something restarts the
   * lock timer, up to a limit. That is what lets a player slide a piece into
   * place at the last moment without being able to stall forever.
   */
  function touchLock(game) {
    if (!game.grounded) return;
    if (game.lockResets >= MAX_LOCK_RESETS) return;
    game.lockResets++;
    game.lockMs = 0;
  }

  function updateGrounded(game) {
    game.grounded = collides(game.grid, game.piece.matrix, {
      x: game.piece.pos.x,
      y: game.piece.pos.y + 1,
    });
    if (!game.grounded) game.lockMs = 0;
  }

  /** Shift the piece. Returns true if it moved. */
  function move(game, dx, dy) {
    if (game.status !== 'playing' || !game.piece) return false;
    var target = { x: game.piece.pos.x + dx, y: game.piece.pos.y + dy };
    if (collides(game.grid, game.piece.matrix, target)) return false;
    game.piece.pos = target;
    touchLock(game);
    updateGrounded(game);
    return true;
  }

  /** Rotate the piece, trying each kick offset in turn. */
  function rotate(game, dir) {
    if (game.status !== 'playing' || !game.piece) return false;
    var piece = game.piece;
    if (piece.type === 'O') return false; // square: rotation is a no-op

    var from = piece.rotation;
    var to = (from + (dir > 0 ? 1 : 3)) % 4;
    var candidate = rotateMatrix(piece.matrix, dir);
    var table = piece.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    var offsets = table[from + '>' + to] || [[0, 0]];

    for (var i = 0; i < offsets.length; i++) {
      // Kick tables are written in x-right / y-up; the grid is y-down.
      var target = {
        x: piece.pos.x + offsets[i][0],
        y: piece.pos.y - offsets[i][1],
      };
      if (!collides(game.grid, candidate, target)) {
        piece.matrix = candidate;
        piece.pos = target;
        piece.rotation = to;
        touchLock(game);
        updateGrounded(game);
        return true;
      }
    }
    return false;
  }

  /** Soft drop one row, scoring a point if it moved. */
  function softDrop(game) {
    if (move(game, 0, 1)) {
      game.score += 1;
      game.gravityMs = 0;
      return true;
    }
    return false;
  }

  /** Drop to the landing position and lock immediately. */
  function hardDrop(game) {
    if (game.status !== 'playing' || !game.piece) return false;
    var distance = dropDistance(game.grid, game.piece.matrix, game.piece.pos);
    game.piece.pos = { x: game.piece.pos.x, y: game.piece.pos.y + distance };
    game.score += distance * 2;
    lock(game);
    return true;
  }

  /** Where the ghost sits. */
  function ghostY(game) {
    if (!game.piece) return 0;
    return game.piece.pos.y + dropDistance(game.grid, game.piece.matrix, game.piece.pos);
  }

  /**
   * Write the piece into the grid and deal with any completed rows. Clearing
   * runs as its own status so the UI can flash the rows before they vanish.
   */
  function lock(game) {
    var piece = game.piece;
    for (var y = 0; y < piece.matrix.length; y++) {
      for (var x = 0; x < piece.matrix[y].length; x++) {
        if (!piece.matrix[y][x]) continue;
        var gy = piece.pos.y + y;
        var gx = piece.pos.x + x;
        if (gy >= 0 && gy < game.grid.length) game.grid[gy][gx] = piece.type;
      }
    }
    game.events.push({ type: 'lock' });

    var rows = fullRows(game.grid);
    if (rows.length) {
      game.status = 'clearing';
      game.clearing = rows;
      game.clearMs = 220;
      return;
    }
    game.piece = null;
    if (!spawn(game)) return;
  }

  /** Apply the pending line clear: score it, remove the rows, spawn again. */
  function finishClear(game) {
    var count = game.clearing.length;
    game.grid = removeRows(game.grid, game.clearing);
    game.clearing = [];

    game.score += LINE_SCORES[count] * game.level;
    game.lines += count;
    var nextLevel = Math.floor(game.lines / 10) + 1;
    if (nextLevel !== game.level) {
      game.level = nextLevel;
      game.events.push({ type: 'level', level: game.level });
    }
    game.events.push({ type: 'lines', count: count });

    game.status = 'playing';
    game.piece = null;
    spawn(game);
  }

  /**
   * Advance the game by `deltaMs`. The UI calls this once per frame; the tests
   * call it with explicit deltas.
   *
   * Gravity and the lock timer are separate clocks. The old build reset the
   * gravity counter on every successful move, so a player who kept nudging the
   * piece sideways could stop it falling indefinitely.
   */
  function tick(game, deltaMs) {
    if (game.status === 'clearing') {
      game.clearMs -= deltaMs;
      if (game.clearMs <= 0) finishClear(game);
      return game;
    }
    if (game.status !== 'playing' || !game.piece) return game;

    game.gravityMs += deltaMs;
    var interval = gravityInterval(game.level);
    while (game.gravityMs >= interval && game.status === 'playing') {
      game.gravityMs -= interval;
      if (!collides(game.grid, game.piece.matrix, { x: game.piece.pos.x, y: game.piece.pos.y + 1 })) {
        game.piece.pos = { x: game.piece.pos.x, y: game.piece.pos.y + 1 };
        updateGrounded(game);
      } else {
        game.grounded = true;
        break;
      }
    }

    if (game.grounded && game.status === 'playing') {
      game.lockMs += deltaMs;
      if (game.lockMs >= LOCK_DELAY_MS) lock(game);
    }
    return game;
  }

  function pause(game) {
    if (game.status === 'playing') game.status = 'paused';
    else if (game.status === 'paused') game.status = 'playing';
    return game.status;
  }

  /** Drain queued events, so the UI can react to them once each. */
  function drainEvents(game) {
    var out = game.events;
    game.events = [];
    return out;
  }

  var api = {
    COLS: COLS,
    ROWS: ROWS,
    SPAWN_ROWS: SPAWN_ROWS,
    TYPES: TYPES,
    SHAPES: SHAPES,
    LOCK_DELAY_MS: LOCK_DELAY_MS,
    MAX_LOCK_RESETS: MAX_LOCK_RESETS,
    rotateMatrix: rotateMatrix,
    emptyGrid: emptyGrid,
    collides: collides,
    fullRows: fullRows,
    removeRows: removeRows,
    dropDistance: dropDistance,
    gravityInterval: gravityInterval,
    makeBag: makeBag,
    createGame: createGame,
    start: start,
    spawn: spawn,
    move: move,
    rotate: rotate,
    softDrop: softDrop,
    hardDrop: hardDrop,
    ghostY: ghostY,
    lock: lock,
    tick: tick,
    pause: pause,
    drainEvents: drainEvents,
  };

  global.TetrisEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
