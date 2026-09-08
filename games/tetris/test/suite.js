/**
 * Tetris test suite.
 *
 * Runs unchanged in Node (test/run.js) and in the browser (test.html), against
 * the same engine the game uses. The previous test page reimplemented the rules
 * inside itself, so it could not have caught a bug in the game.
 */
(function (global) {
  'use strict';

  function run(deps) {
    var E = deps.Engine;
    var results = [];
    function check(label, condition, detail) {
      results.push({ label: label, ok: !!condition, detail: condition ? '' : (detail || '') });
    }

    /** A game with a known, empty board and no randomness in the way. */
    function fresh() {
      var g = E.createGame();
      E.start(g);
      return g;
    }

    function place(game, type, x, y) {
      game.piece = {
        type: type,
        matrix: E.SHAPES[type].map(function (r) { return r.slice(); }),
        rotation: 0,
        pos: { x: x, y: y },
      };
      game.grounded = false;
      game.lockMs = 0;
      game.lockResets = 0;
      return game.piece;
    }

    // ------------------------------------------------------------- geometry
    var t = E.SHAPES.T;
    var spun = t;
    for (var i = 0; i < 4; i++) spun = E.rotateMatrix(spun, 1);
    check('four clockwise turns return the original shape',
      JSON.stringify(spun) === JSON.stringify(t));
    check('a turn back undoes a turn',
      JSON.stringify(E.rotateMatrix(E.rotateMatrix(t, 1), -1)) === JSON.stringify(t));

    var everyPieceHasFour = E.TYPES.every(function (type) {
      return E.SHAPES[type].flat().filter(Boolean).length === 4;
    });
    check('every piece is four blocks', everyPieceHasFour);

    // ------------------------------------------------------------ collision
    var g = fresh();
    check('a piece off the left edge collides', E.collides(g.grid, E.SHAPES.T, { x: -2, y: 5 }));
    check('a piece off the right edge collides', E.collides(g.grid, E.SHAPES.T, { x: 9, y: 5 }));
    check('a piece below the floor collides', E.collides(g.grid, E.SHAPES.T, { x: 3, y: 25 }));
    check('open space does not collide', !E.collides(g.grid, E.SHAPES.T, { x: 3, y: 5 }));
    g.grid[10][4] = 'I';
    check('an occupied cell collides', E.collides(g.grid, E.SHAPES.T, { x: 3, y: 9 }));

    // ------------------------------------------------------- rotation kicks
    g = fresh();
    place(g, 'T', 8, 5);
    var kicked = E.rotate(g, 1);
    check('T rotates against the right wall by kicking', kicked && g.piece.pos.x < 8,
      'x is ' + (g.piece && g.piece.pos.x));

    g = fresh();
    place(g, 'I', 7, 5);
    check('I rotates near the right wall', E.rotate(g, 1));

    g = fresh();
    place(g, 'O', 4, 5);
    var beforeO = JSON.stringify(g.piece.matrix);
    E.rotate(g, 1);
    check('O does not rotate', JSON.stringify(g.piece.matrix) === beforeO);

    // ----------------------------------------------------------- line clear
    g = fresh();
    for (var x = 0; x < g.cols; x++) g.grid[21][x] = 'T';
    var rows = E.fullRows(g.grid);
    check('a full row is detected', rows.length === 1 && rows[0] === 21);

    g.grid[20][3] = 'I';
    var cleared = E.removeRows(g.grid, [21]);
    check('the grid keeps its height after a clear', cleared.length === g.grid.length);
    check('rows above shift down', cleared[21][3] === 'I');
    check('a new empty row appears on top', cleared[0].every(function (c) { return c === null; }));

    // -------------------------------------------------------------- scoring
    g = fresh();
    g.level = 2;
    g.status = 'clearing';
    g.clearing = [21, 20, 19, 18];
    g.clearMs = 0;
    E.tick(g, 10);
    check('four lines at level 2 score 1600', g.score === 1600, 'scored ' + g.score);
    check('cleared lines are counted', g.lines === 4);

    g = fresh();
    g.status = 'clearing';
    g.clearing = [21];
    g.clearMs = 0;
    E.tick(g, 10);
    check('one line at level 1 scores 100', g.score === 100, 'scored ' + g.score);

    g = fresh();
    var dropped = place(g, 'O', 4, 0);
    var beforeDrop = g.score;
    // Assert the rule rather than a hand-computed total: two points for every
    // row the piece actually travels.
    var expectedRows = E.dropDistance(g.grid, dropped.matrix, dropped.pos);
    E.hardDrop(g);
    check('a hard drop scores two a row', g.score - beforeDrop === 2 * expectedRows,
      'fell ' + expectedRows + ' rows, scored ' + (g.score - beforeDrop));

    g = fresh();
    place(g, 'O', 4, 0);
    var beforeSoft = g.score;
    E.softDrop(g);
    check('a soft drop scores one a row', g.score - beforeSoft === 1);

    // ---------------------------------------------------------- level rises
    g = fresh();
    g.lines = 9;
    g.status = 'clearing';
    g.clearing = [21];
    g.clearMs = 0;
    E.tick(g, 10);
    check('level rises every ten lines', g.level === 2, 'level ' + g.level);
    check('gravity speeds up with level', E.gravityInterval(2) < E.gravityInterval(1));

    // ------------------------------------------------------- 7-bag fairness
    var bag = E.makeBag();
    var firstSeven = [];
    for (var b = 0; b < 7; b++) firstSeven.push(bag.next());
    check('a bag deals all seven pieces', new Set(firstSeven).size === 7, firstSeven.join(''));
    var secondSeven = [];
    for (var b2 = 0; b2 < 7; b2++) secondSeven.push(bag.next());
    check('the next bag deals all seven again', new Set(secondSeven).size === 7);

    // --------------------------------------------------------- gravity/lock
    // The old build reset the gravity clock on every move, so nudging a piece
    // sideways stopped it falling. Gravity must be independent of input.
    g = fresh();
    place(g, 'T', 3, 0);
    var startY = g.piece.pos.y;
    for (var m = 0; m < 40; m++) {
      E.move(g, m % 2 ? 1 : -1, 0);
      E.tick(g, 50);
    }
    check('sideways moves do not stop the piece falling',
      g.piece && g.piece.pos.y > startY, 'y is ' + (g.piece && g.piece.pos.y));

    // Landing must not lock instantly: there is a grace period to adjust.
    g = fresh();
    place(g, 'O', 4, 19);
    var groundedAt = null;
    var lockedAt = null;
    var elapsed = 0;
    for (var f = 0; f < 300 && lockedAt === null; f++) {
      E.tick(g, 16);
      elapsed += 16;
      if (g.grounded && groundedAt === null) groundedAt = elapsed;
      if (groundedAt !== null && g.grid.some(function (row) {
        return row.some(function (c) { return c === 'O'; });
      })) lockedAt = elapsed;
    }
    var delay = lockedAt - groundedAt;
    check('a landed piece does not lock instantly', delay > 300, 'delay was ' + delay + 'ms');
    check('a landed piece does lock within about half a second',
      delay <= E.LOCK_DELAY_MS + 40, 'delay was ' + delay + 'ms');

    // Moving resets the lock timer, but only so many times.
    g = fresh();
    place(g, 'O', 4, 20);
    E.tick(g, 16);
    var stillFree = 0;
    for (var k = 0; k < 30; k++) {
      E.move(g, k % 2 ? 1 : -1, 0);
      E.tick(g, 100);
      if (g.piece && g.piece.type === 'O') stillFree++;
    }
    check('moving buys time before the lock', stillFree > 5, 'survived ' + stillFree + ' steps');
    // Ask the board, not the current piece. The piece that spawns after ours
    // locks is drawn from the bag, so roughly one run in seven it was another
    // O and this read as "never locked" - a flake in the test, not the engine.
    var oLanded = g.grid.some(function (row) {
      return row.some(function (c) { return c === 'O'; });
    });
    check('but the piece cannot be stalled forever',
      oLanded || g.lockResets >= E.MAX_LOCK_RESETS,
      'landed=' + oLanded + ', resets=' + g.lockResets);

    // ------------------------------------------------------------ ghost/end
    g = fresh();
    place(g, 'O', 4, 0);
    check('the ghost sits on the floor of an empty well', E.ghostY(g) === 20,
      'ghost at ' + E.ghostY(g));
    g.grid[15][4] = 'I';
    check('the ghost stops above an obstacle', E.ghostY(g) === 13, 'ghost at ' + E.ghostY(g));

    g = fresh();
    for (var gx = 0; gx < g.cols; gx++) {
      g.grid[0][gx] = 'I';
      g.grid[1][gx] = 'I';
    }
    g.piece = null;
    E.spawn(g);
    check('the game ends when a new piece will not fit', g.status === 'over');

    // ------------------------------------------------------------ pause
    g = fresh();
    check('pause stops play', E.pause(g) === 'paused');
    place(g, 'T', 3, 5);
    var pausedY = g.piece.pos.y;
    E.tick(g, 2000);
    check('nothing falls while paused', g.piece.pos.y === pausedY);
    check('pause toggles back', E.pause(g) === 'playing');

    var passed = results.filter(function (r) { return r.ok; }).length;
    return { results: results, passed: passed, failed: results.length - passed };
  }

  var api = { run: run };
  global.TetrisTests = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
