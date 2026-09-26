/**
 * Unjam test suite.
 *
 * Runs unchanged in Node (test/run.js) and in the browser (test.html), against
 * the same engine and puzzle data the game uses.
 *
 * deps: { Engine, Packs, full }  - full re-solves every shipped puzzle.
 */
(function (global) {
  'use strict';

  function run(deps) {
    var E = deps.Engine;
    var PACKS = deps.Packs;
    var results = [];
    function check(label, condition, detail) {
      results.push({ label: label, ok: !!condition, detail: condition ? '' : (detail || '') });
    }
    function throws(fn) {
      try { fn(); return false; } catch (err) { return true; }
    }
    function rows() { return Array.prototype.slice.call(arguments).join(''); }

    // A small puzzle with a known answer: B blocks the exit, and has to go
    // down, which needs C out of the way first. Three moves: C left, B down,
    // A right.
    var SMALL = rows(
      '......',
      '....B.',
      'AA..B.',
      '....B.',
      '..CCC.',
      '......'
    );

    // ---------------------------------------------------------- encoding
    var parsed = E.parse(SMALL);
    check('parse finds every block', parsed.pieces.length === 3);
    check('the red block is piece 0', parsed.pieces[0].label === 'A' && parsed.pieces[0].horiz);
    check('a vertical block is read as vertical',
      !parsed.pieces[1].horiz && parsed.pieces[1].len === 3 && parsed.pieces[1].line === 4 && parsed.pos[1] === 1);
    check('a horizontal block is read as horizontal',
      parsed.pieces[2].horiz && parsed.pieces[2].line === 4 && parsed.pos[2] === 2);
    check('serialize round-trips', E.serialize(parsed.pieces, parsed.pos) === SMALL,
      E.serialize(parsed.pieces, parsed.pos));
    check('"o" is accepted as empty', E.parse(SMALL.replace(/\./g, 'o')).pieces.length === 3);

    var relabelled = SMALL.replace(/B/g, 'Q').replace(/C/g, 'D');
    check('serialize renames blocks in reading order', E.serialize(E.parse(relabelled).pieces, E.parse(relabelled).pos) === SMALL);

    check('a board of the wrong length is refused', throws(function () { E.parse('AA'); }));
    check('a board with no red block is refused', throws(function () { E.parse(SMALL.replace(/A/g, '.')); }));
    check('a bent block is refused', throws(function () {
      E.parse(rows('BB....', '.B....', 'AA....', '......', '......', '......'));
    }));
    check('a one-cell block is refused', throws(function () {
      E.parse(rows('B.....', '......', 'AA....', '......', '......', '......'));
    }));
    check('a four-long block is refused', throws(function () {
      E.parse(rows('BBBB..', '......', 'AA....', '......', '......', '......'));
    }));
    check('a red block off the exit row is refused', throws(function () {
      E.parse(rows('AA....', '......', '......', '......', '......', '......'));
    }));
    check('a vertical red block is refused', throws(function () {
      E.parse(rows('......', 'A.....', 'A.....', '......', '......', '......'));
    }));
    check('an already solved board fails validation',
      E.validate(rows('......', '......', '....AA', '......', '......', '......')).length === 1);

    // ------------------------------------------------------------ ranges
    var r = E.range(parsed.pieces, parsed.pos, 0);
    check('red can slide from the wall up to the blocker', r.min === 0 && r.max === 2, JSON.stringify(r));
    r = E.range(parsed.pieces, parsed.pos, 1);
    check('B cannot move down onto C, and can go up to the wall', r.min === 0 && r.max === 1, JSON.stringify(r));
    r = E.range(parsed.pieces, parsed.pos, 2);
    check('C slides left to the wall and right to the edge', r.min === 0 && r.max === 3, JSON.stringify(r));

    // ------------------------------------------------------------ sliding
    var g = E.createGame({ id: 't', board: SMALL, min: 3 });
    check('a slide through another block is refused', !E.slide(g, 1, 3) && g.pos[1] === 1);
    check('a slide off the tray is refused', !E.slide(g, 2, 4) && !E.slide(g, 2, -1));
    check('a slide to where it already is is not a move', !E.slide(g, 0, 0) && g.moves === 0);
    check('a legal slide moves the block', E.slide(g, 0, 2) && g.pos[0] === 2 && g.moves === 1);
    check('sliding the same block again is still one move', E.slide(g, 0, 1) && g.moves === 1);
    check('sliding it back to where it began cancels the move', E.slide(g, 0, 0) && g.moves === 0 && !g.history.length);
    E.slide(g, 2, 0);
    E.slide(g, 1, 3);
    check('slides of different blocks count separately', g.moves === 2);
    check('B could only go down once C moved', g.pos[1] === 3);
    E.slide(g, 2, 1);
    check('returning to a block after another is a new move', g.moves === 3);
    check('undo takes back one move', E.undo(g) && g.pos[2] === 0 && g.moves === 2);
    check('undo again restores the earlier block', E.undo(g) && g.pos[1] === 1 && g.moves === 1);
    E.restart(g);
    check('restart returns to the start', g.pos.join() === g.start.join() && g.moves === 0 && !g.history.length);
    check('undo with nothing to undo does nothing', !E.undo(g));

    // --------------------------------------------------------------- solve
    g = E.createGame({ id: 't', board: SMALL, min: 3 });
    E.slide(g, 2, 0);
    E.slide(g, 1, 3);
    check('not solved before the red block reaches the wall', !g.solved);
    E.slide(g, 0, 4);
    check('reaching the wall solves it', g.solved && g.moves === 3);
    check('a solved game takes no more slides', !E.slide(g, 2, 1));
    check('a solved game cannot be undone into', !E.undo(g) && g.solved);

    // -------------------------------------------------------------- solver
    parsed = E.parse(SMALL);
    var answer = E.solve(parsed.pieces, parsed.pos);
    check('the solver finds the known minimum', answer && answer.moves === 3, answer && answer.moves);
    function replays(board, path) {
      var game = E.createGame({ id: 'x', board: board, min: 0 });
      for (var i = 0; i < path.length; i++) {
        if (!E.slide(game, path[i][0], path[i][1])) return false;
      }
      return game.solved && game.moves === path.length;
    }
    check('the solver\'s path replays through the game rules', replays(SMALL, answer.path));

    var clear = rows('......', '......', 'AA....', '......', '......', '......');
    var p0 = E.parse(clear);
    check('an open exit row is one move', E.solve(p0.pieces, p0.pos).moves === 1);

    var stuck = rows('......', '......', 'AA..BB', '......', '......', '......');
    // Horizontal blocks in the exit row can never clear it. Parse allows the
    // shape; the solver has to say no.
    var p1 = E.parse(stuck);
    check('an unsolvable board has no solution', E.solve(p1.pieces, p1.pos) === null);
    check('an unsolvable board has no cluster distance', E.cluster(p1.pieces, p1.pos) === null);

    var c = E.cluster(parsed.pieces, parsed.pos);
    var startDist = c.dist[0];
    check('cluster distance agrees with the solver', startDist === 3, startDist);
    var reachable = true;
    for (var s = 0; s < c.states.length; s++) if (c.dist[s] < 0) reachable = false;
    check('every position in a cluster can reach a solve', reachable);

    // ---------------------------------------------------------------- hint
    g = E.createGame({ id: 't', board: SMALL, min: 3 });
    var h = E.hint(g);
    check('a hint names a legal move', h && E.slide(g, h.piece, h.to), JSON.stringify(h));
    check('a hint reports the moves left', h && h.remaining === 3);
    var following = E.createGame({ id: 't', board: SMALL, min: 3 });
    for (var step = 0; step < 10 && !following.solved; step++) {
      var hh = E.hint(following);
      E.slide(following, hh.piece, hh.to);
    }
    check('following hints solves in the minimum', following.solved && following.moves === 3, following.moves);
    g = E.createGame({ id: 't', board: SMALL, min: 3 });
    E.slide(g, 2, 3); // a wasted move
    h = E.hint(g);
    check('a hint works from where the player is, not the start', h && h.remaining === 3, h && h.remaining);
    check('there is no hint once solved', E.hint(following) === null);

    // ------------------------------------------------------ the puzzle set
    check('puzzle packs are present', Array.isArray(PACKS) && PACKS.length === 4);
    var seen = {};
    var ids = {};
    var dupes = [];
    var malformed = [];
    var outOfBand = [];
    var unordered = [];
    var total = 0;
    var tooBig = [];
    PACKS.forEach(function (pack) {
      var prev = -1;
      check(pack.name + ' has 100 puzzles', pack.puzzles.length === 100, pack.puzzles.length);
      pack.puzzles.forEach(function (p) {
        total++;
        if (seen[p.board]) dupes.push(p.id);
        seen[p.board] = true;
        if (ids[p.id]) dupes.push('id ' + p.id);
        ids[p.id] = true;
        var errs = E.validate(p.board);
        if (errs.length) malformed.push(p.id + ': ' + errs.join(', '));
        if (p.min < pack.band[0] || p.min > pack.band[1]) outOfBand.push(p.id);
        if (p.min < prev) unordered.push(p.id);
        prev = p.min;
        if (p.states > 250000) tooBig.push(p.id);
        // A board re-encoded must be itself, so duplicates cannot hide behind
        // different letters.
        var q = E.parse(p.board);
        if (E.serialize(q.pieces, q.pos) !== p.board) malformed.push(p.id + ': not canonical');
      });
    });
    check('every puzzle is well formed and not already solved', !malformed.length, malformed.slice(0, 5).join('; '));
    check('no two puzzles are the same', !dupes.length, dupes.slice(0, 5).join(', '));
    check('every puzzle sits in its pack\'s band', !outOfBand.length, outOfBand.slice(0, 5).join(', '));
    check('puzzles never get easier within a pack', !unordered.length, unordered.slice(0, 5).join(', '));
    check('packs do not overlap and climb in order', PACKS.every(function (pack, i) {
      return i === 0 || pack.band[0] > PACKS[i - 1].band[1];
    }));
    check('every state space is small enough to hint live', !tooBig.length, tooBig.join(', '));
    check('400 puzzles in all', total === 400, total);

    if (deps.full) {
      var wrong = [];
      var notHardest = [];
      PACKS.forEach(function (pack) {
        pack.puzzles.forEach(function (p) {
          var q = E.parse(p.board);
          var sol = E.solve(q.pieces, q.pos);
          if (!sol || sol.moves !== p.min || !replays(p.board, sol.path)) {
            wrong.push(p.id + ' stored ' + p.min + ', solved ' + (sol && sol.moves));
          }
        });
      });
      check('every stored minimum is exact, and its solution replays', !wrong.length, wrong.slice(0, 5).join('; '));

      // The generator's promise: each puzzle is the hardest position of its
      // cluster. Checked on the hard end, where it matters.
      PACKS[3].puzzles.forEach(function (p) {
        var q = E.parse(p.board);
        var cl = E.cluster(q.pieces, q.pos);
        var max = 0;
        for (var s = 0; s < cl.dist.length; s++) if (cl.dist[s] > max) max = cl.dist[s];
        if (max !== p.min || cl.states.length !== p.states) notHardest.push(p.id);
      });
      check('each Expert puzzle is the hardest position of its cluster', !notHardest.length, notHardest.slice(0, 5).join(', '));
    }

    var passed = results.filter(function (x) { return x.ok; }).length;
    return { results: results, passed: passed, failed: results.length - passed };
  }

  var api = { run: run };
  global.UnjamTests = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
