/**
 * Linkgrid test suite.
 *
 * Runs unchanged in Node (test/run.js) and in the browser (test.html), against
 * the same engine, quality module and puzzle data the game itself uses.
 */
(function (global) {
  'use strict';

  function makeRunner() {
    var results = [];
    function check(label, condition, detail) {
      results.push({ label: label, ok: !!condition, detail: condition ? '' : (detail || '') });
    }
    return { results: results, check: check };
  }

  /** Draw a full solution the way a player would: grab a dot, then step along. */
  function playSolution(Engine, game, solution) {
    for (var color = 0; color < solution.length; color++) {
      var route = solution[color];
      if (!Engine.grab(game, route[0][0], route[0][1])) return 'could not grab colour ' + color;
      for (var i = 1; i < route.length; i++) {
        if (!Engine.stepTo(game, route[i][0], route[i][1])) {
          return 'colour ' + color + ' blocked at step ' + i;
        }
      }
      Engine.release(game);
    }
    return null;
  }

  /**
   * @param {object} deps { Engine, Quality, Routes, puzzles, solutions, packs }
   * @returns {{results: Array, passed: number, failed: number}}
   */
  function run(deps) {
    var Engine = deps.Engine;
    var Quality = deps.Quality;
    var Routes = deps.Routes;
    var puzzles = deps.puzzles;
    var packs = deps.packs;
    var rawSolutions = deps.solutions;

    // Solutions ship as compact "row,col:MOVES" strings.
    var solutions = {};
    Object.keys(rawSolutions).forEach(function (id) {
      solutions[id] = Routes.decode(rawSolutions[id]);
    });

    var runner = makeRunner();
    var check = runner.check;

    // ---------------------------------------------------------------- levels
    var allLevels = [];
    var sizes = Object.keys(puzzles).map(Number).sort(function (a, b) { return a - b; });
    sizes.forEach(function (size) {
      puzzles[size].forEach(function (level) { allLevels.push(level); });
    });

    check('puzzle set covers 5x5 through 10x10',
      sizes.join(',') === '5,6,7,8,9,10', 'sizes were ' + sizes.join(','));
    check('every size ships 100 puzzles',
      sizes.every(function (s) { return puzzles[s].length === 100; }),
      sizes.map(function (s) { return s + ':' + puzzles[s].length; }).join(' '));

    var tierCountProblem = null;
    sizes.forEach(function (size) {
      for (var tier = 1; tier <= 5; tier++) {
        var inTier = puzzles[size].filter(function (level) { return level.tier === tier; });
        if (inTier.length !== 20 && !tierCountProblem) {
          tierCountProblem = size + 'x' + size + ' tier ' + tier + ' has ' + inTier.length;
        }
      }
    });
    check('every size has 20 puzzles at each of the five difficulties',
      tierCountProblem === null, tierCountProblem || '');

    var manifestProblem = null;
    sizes.forEach(function (size) {
      var entry = null;
      packs.forEach(function (pack) { if (pack.size === size) entry = pack; });
      if (!entry) { manifestProblem = 'no manifest entry for ' + size; return; }
      if (entry.count !== puzzles[size].length) {
        manifestProblem = size + ': manifest says ' + entry.count;
      }
    });
    check('the pack manifest matches the packs', manifestProblem === null, manifestProblem || '');

    var ids = {};
    var duplicateId = null;
    allLevels.forEach(function (level) {
      if (ids[level.id]) duplicateId = level.id;
      ids[level.id] = true;
    });
    check('puzzle ids are unique', duplicateId === null, 'duplicate ' + duplicateId);

    var badLevel = null;
    allLevels.forEach(function (level) {
      if (badLevel) return;
      var problems = Engine.validateLevel(level);
      if (problems.length) badLevel = level.id + ': ' + problems.join('; ');
      if (level.colors !== level.endpoints.length) badLevel = level.id + ': colors field mismatch';
      if (!(level.tier >= 1 && level.tier <= 5)) badLevel = level.id + ': tier out of range';
    });
    check('every level is well formed', badLevel === null, badLevel || '');

    // ------------------------------------------------------------- solutions
    var missingSolution = allLevels.filter(function (level) {
      return !solutions[level.id];
    }).map(function (level) { return level.id; });
    check('every puzzle has a reference solution', missingSolution.length === 0,
      missingSolution.join(', '));

    var structureProblem = null;
    var qualityProblem = null;
    allLevels.forEach(function (level) {
      var solution = solutions[level.id];
      if (!solution) return;
      if (!structureProblem) {
        var fails = Quality.structureFailures(level, solution);
        if (fails.length) structureProblem = level.id + ': ' + fails.join('; ');
      }
      if (!qualityProblem) {
        var gate = Quality.gateFailures(Quality.measure(level.size, solution));
        if (gate.length) qualityProblem = level.id + ': ' + gate.join('; ');
      }
    });
    check('every solution tiles its whole grid', structureProblem === null, structureProblem || '');
    check('every solution clears the quality gates', qualityProblem === null, qualityProblem || '');

    // The three headline requirements, asserted directly rather than via GATES.
    var straightBad = [];
    var interiorBad = [];
    var cornerBad = [];
    allLevels.forEach(function (level) {
      var solution = solutions[level.id];
      if (!solution) return;
      var m = Quality.measure(level.size, solution);
      if (!(m.straightShare < 0.25)) straightBad.push(level.id);
      if (!(m.interiorBendDensity > m.borderBendDensity)) interiorBad.push(level.id);
      if (m.distinctCorners < 4) cornerBad.push(level.id);
    });
    check('under 25% of connections are bend-free', straightBad.length === 0, straightBad.join(', '));
    check('bends are denser in the middle than on the edges', interiorBad.length === 0,
      interiorBad.join(', '));
    check('bends turn all four ways', cornerBad.length === 0, cornerBad.join(', '));

    // Difficulty must increase with the tier label. Route length is the part of
    // difficulty visible without a solver, so it is what the shipped data can
    // be checked against.
    var orderingProblem = null;
    sizes.forEach(function (size) {
      var meanFor = function (tier) {
        var inTier = puzzles[size].filter(function (level) { return level.tier === tier; });
        var total = 0;
        inTier.forEach(function (level) {
          total += (size * size) / level.endpoints.length;
        });
        return total / inTier.length;
      };
      var one = meanFor(1);
      var five = meanFor(5);
      if (!(five > one) && !orderingProblem) {
        orderingProblem = size + 'x' + size + ': tier 1 mean route ' + one.toFixed(1) +
          ', tier 5 mean route ' + five.toFixed(1);
      }
    });
    check('harder tiers have longer routes', orderingProblem === null, orderingProblem || '');

    // ------------------------------------------------------- playing a level
    var unplayable = [];
    allLevels.forEach(function (level) {
      var solution = solutions[level.id];
      if (!solution) return;
      var game = Engine.createGame(level);
      var problem = playSolution(Engine, game, solution);
      if (problem) unplayable.push(level.id + ' (' + problem + ')');
      else if (!Engine.isSolved(game)) unplayable.push(level.id + ' (not marked solved)');
    });
    check('every reference solution can be drawn and solves the puzzle',
      unplayable.length === 0, unplayable.slice(0, 3).join('; '));

    // -------------------------------------------------------- rules: basics
    var toy = {
      id: 'toy', size: 3, tier: 1, colors: 2,
      endpoints: [
        { color: 0, a: [0, 0], b: [2, 0] },
        { color: 1, a: [0, 2], b: [2, 2] },
      ],
    };

    check('a malformed level is rejected',
      Engine.validateLevel({ size: 3, endpoints: [{ color: 0, a: [0, 0], b: [0, 0] }] }).length > 0);

    var g = Engine.createGame(toy);
    check('grabbing an empty cell fails', Engine.grab(g, 1, 1) === false);
    check('grabbing a dot succeeds', Engine.grab(g, 0, 0) === true);
    check('a diagonal step is refused', Engine.stepTo(g, 1, 1) === false);
    check('a distant step is refused', Engine.stepTo(g, 2, 0) === false);
    check('an adjacent step is taken', Engine.stepTo(g, 1, 0) === true);
    check('stepping onto another colour dot is refused', Engine.stepTo(g, 1, 1) === true &&
      Engine.stepTo(g, 0, 1) === true && Engine.stepTo(g, 0, 2) === false);

    // ------------------------------------------------- rules: drag-back trim
    g = Engine.createGame(toy);
    Engine.grab(g, 0, 0);
    Engine.stepTo(g, 1, 0);
    Engine.stepTo(g, 1, 1);
    check('route grew to three cells', g.paths[0].length === 3);
    check('dragging back trims', Engine.stepTo(g, 1, 0) === true && g.paths[0].length === 2);
    check('trimmed cell is free again', Engine.ownerAt(g, 1, 1) === Engine.EMPTY);

    // ------------------------------------------- rules: closed route is fixed
    g = Engine.createGame(toy);
    Engine.grab(g, 0, 0);
    Engine.stepTo(g, 1, 0);
    Engine.stepTo(g, 2, 0);
    check('reaching the far dot connects the colour', Engine.isConnected(g, 0) === true);
    check('a closed route will not extend past its dot', Engine.stepTo(g, 2, 1) === false);
    check('a closed route can still be trimmed', Engine.stepTo(g, 1, 0) === true);

    // -------------------------------------------- rules: crossing a neighbour
    g = Engine.createGame(toy);
    Engine.grab(g, 0, 2);
    Engine.stepTo(g, 1, 2);
    Engine.stepTo(g, 1, 1);
    Engine.release(g);
    check('colour 1 occupies the middle', Engine.ownerAt(g, 1, 1) === 1);
    Engine.grab(g, 0, 0);
    Engine.stepTo(g, 0, 1);
    check('crossing another route claims the cell', Engine.stepTo(g, 1, 1) === true &&
      Engine.ownerAt(g, 1, 1) === 0);
    check('the crossed colour loses everything from that cell on',
      g.paths[1].length === 2, 'length ' + g.paths[1].length);

    // -------------------------------------------------- rules: fast drag gaps
    g = Engine.createGame(toy);
    Engine.grab(g, 0, 0);
    var jumped = Engine.extendTo(g, 2, 0);
    check('a jump is filled in cell by cell', jumped === true && g.paths[0].length === 3,
      'length ' + g.paths[0].length);

    // ------------------------------------------------ rules: tap does not wipe
    g = Engine.createGame(toy);
    Engine.grab(g, 0, 0);
    Engine.extendTo(g, 2, 0);
    Engine.release(g);
    var lengthBefore = g.paths[0].length;
    Engine.grab(g, 0, 0);
    Engine.release(g);
    check('tapping a dot without dragging leaves the route alone',
      g.paths[0].length === lengthBefore, 'length ' + g.paths[0].length);

    // ------------------------------------------------- rules: undo and cancel
    g = Engine.createGame(toy);
    Engine.grab(g, 0, 0);
    Engine.extendTo(g, 2, 0);
    Engine.release(g);
    check('an edit is recorded for undo', g.history.length === 1);
    Engine.undo(g);
    check('undo clears the route', g.paths[0].length === 0);

    g = Engine.createGame(toy);
    Engine.grab(g, 0, 0);
    Engine.stepTo(g, 1, 0);
    Engine.cancel(g);
    check('cancel restores the board', g.paths[0].length === 0 &&
      Engine.ownerAt(g, 1, 0) === Engine.EMPTY);

    // ------------------------------------------------------- rules: solving
    g = Engine.createGame(toy);
    Engine.grab(g, 0, 0);
    Engine.extendTo(g, 2, 0);
    Engine.release(g);
    Engine.grab(g, 0, 2);
    Engine.extendTo(g, 2, 2);
    Engine.release(g);
    check('connected pairs with empty cells are not solved', Engine.isSolved(g) === false);
    Engine.grab(g, 1, 0);
    Engine.stepTo(g, 1, 1);
    Engine.release(g);
    check('a colour that leaves its dot is no longer connected',
      Engine.isConnected(g, 0) === false);

    // A 3x3 that a pair of routes can actually cover completely.
    var solvable = {
      id: 'solvable', size: 3, tier: 1, colors: 2,
      endpoints: [
        { color: 0, a: [0, 0], b: [2, 0] },
        { color: 1, a: [0, 2], b: [2, 1] },
      ],
    };

    g = Engine.createGame(solvable);
    Engine.grab(g, 0, 0);
    Engine.extendTo(g, 2, 0);
    Engine.release(g);
    check('straight route reaches its far dot', Engine.isConnected(g, 0) === true);
    check('board is not full yet', Engine.isSolved(g) === false);
    Engine.grab(g, 0, 2);
    Engine.extendTo(g, 0, 1);
    Engine.extendTo(g, 1, 1);
    Engine.extendTo(g, 1, 2);
    Engine.extendTo(g, 2, 2);
    Engine.extendTo(g, 2, 1);
    Engine.release(g);
    check('winding route reaches its far dot', Engine.isConnected(g, 1) === true);
    check('full board with every pair joined is solved', Engine.isSolved(g) === true,
      'filled ' + Engine.filledCount(g) + ' of 9');

    // --------------------------------------------------------- restart clears
    Engine.restart(g);
    check('restart clears every route', Engine.filledCount(g) === 4 &&
      Engine.isSolved(g) === false, 'filled ' + Engine.filledCount(g));

    var passed = runner.results.filter(function (r) { return r.ok; }).length;
    return {
      results: runner.results,
      passed: passed,
      failed: runner.results.length - passed,
    };
  }

  var api = { run: run, playSolution: playSolution };
  global.LinkgridTests = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
