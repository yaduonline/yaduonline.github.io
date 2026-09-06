/**
 * Linkgrid rules engine.
 *
 * Pure game logic with no DOM access, so the browser UI, the browser test page
 * and the Node test runner all exercise exactly the same code. Loaded as a
 * classic script (globalThis.LinkgridEngine) or via require().
 */
(function (global) {
  'use strict';

  var EMPTY = -1;

  function key(r, c) {
    return r + ',' + c;
  }

  function clonePaths(paths) {
    return paths.map(function (path) {
      return path.map(function (cell) {
        return [cell[0], cell[1]];
      });
    });
  }

  function snapshot(game) {
    return {
      owner: game.owner.slice(),
      paths: clonePaths(game.paths),
    };
  }

  function restore(game, state) {
    game.owner.set(state.owner);
    game.paths = clonePaths(state.paths);
  }

  /**
   * Validate a puzzle definition. Returns an array of problems; empty means the
   * level is well formed.
   */
  function validateLevel(level) {
    var problems = [];
    if (!level || typeof level !== 'object') return ['level is not an object'];
    var size = level.size;
    if (!Number.isInteger(size) || size < 2) problems.push('size must be an integer >= 2');
    if (!Array.isArray(level.endpoints) || level.endpoints.length === 0) {
      problems.push('endpoints must be a non-empty array');
      return problems;
    }
    var seen = Object.create(null);
    level.endpoints.forEach(function (endpoint, index) {
      if (endpoint.color !== index) problems.push('endpoint ' + index + ' has color ' + endpoint.color);
      [endpoint.a, endpoint.b].forEach(function (cell, which) {
        var label = 'endpoint ' + index + (which === 0 ? '.a' : '.b');
        if (!Array.isArray(cell) || cell.length !== 2) {
          problems.push(label + ' is not a [row, col] pair');
          return;
        }
        if (!Number.isInteger(cell[0]) || !Number.isInteger(cell[1]) ||
            cell[0] < 0 || cell[1] < 0 || cell[0] >= size || cell[1] >= size) {
          problems.push(label + ' is outside the grid');
          return;
        }
        var k = key(cell[0], cell[1]);
        if (seen[k] !== undefined) problems.push(label + ' shares a cell with endpoint ' + seen[k]);
        seen[k] = index;
      });
      if (Array.isArray(endpoint.a) && Array.isArray(endpoint.b) &&
          endpoint.a[0] === endpoint.b[0] && endpoint.a[1] === endpoint.b[1]) {
        problems.push('endpoint ' + index + ' has both dots on the same cell');
      }
    });
    return problems;
  }

  /** Create fresh play state for a level. Throws on a malformed level. */
  function createGame(level) {
    var problems = validateLevel(level);
    if (problems.length) throw new Error('Invalid Linkgrid level: ' + problems.join('; '));

    var size = level.size;
    var game = {
      level: level,
      size: size,
      colors: level.endpoints.length,
      endpoints: level.endpoints.map(function (e) {
        return [[e.a[0], e.a[1]], [e.b[0], e.b[1]]];
      }),
      owner: new Int16Array(size * size).fill(EMPTY),
      paths: [],
      active: null,
      history: [],
      moves: 0,
    };

    game.endpoints.forEach(function (pair, color) {
      game.owner[pair[0][0] * size + pair[0][1]] = color;
      game.owner[pair[1][0] * size + pair[1][1]] = color;
      game.paths.push([]);
    });

    return game;
  }

  function ownerAt(game, r, c) {
    if (r < 0 || c < 0 || r >= game.size || c >= game.size) return EMPTY;
    return game.owner[r * game.size + c];
  }

  function isEndpoint(game, color, r, c) {
    var pair = game.endpoints[color];
    if (!pair) return false;
    return (pair[0][0] === r && pair[0][1] === c) || (pair[1][0] === r && pair[1][1] === c);
  }

  function indexInPath(path, r, c) {
    for (var i = 0; i < path.length; i++) {
      if (path[i][0] === r && path[i][1] === c) return i;
    }
    return -1;
  }

  /** Drop every cell from `from` onwards, releasing ownership of non-dots. */
  function truncatePath(game, color, from) {
    var path = game.paths[color];
    for (var i = path.length - 1; i >= from; i--) {
      var cell = path[i];
      if (!isEndpoint(game, color, cell[0], cell[1])) {
        game.owner[cell[0] * game.size + cell[1]] = EMPTY;
      }
    }
    path.length = Math.max(0, from);
  }

  /** A colour is connected when its route runs dot to dot. */
  function isConnected(game, color) {
    var path = game.paths[color];
    if (!path || path.length < 2) return false;
    var first = path[0];
    var last = path[path.length - 1];
    return isEndpoint(game, color, first[0], first[1]) &&
           isEndpoint(game, color, last[0], last[1]) &&
           !(first[0] === last[0] && first[1] === last[1]);
  }

  /** Head of a colour's route, or null when it has not been started. */
  function headOf(game, color) {
    var path = game.paths[color];
    return path.length ? path[path.length - 1] : null;
  }

  /**
   * Begin editing at a cell.
   *
   * Grabbing a dot restarts that colour from the dot. Grabbing a cell partway
   * along a route keeps everything up to that cell and continues from there,
   * which is what players expect when they correct the tail of a route.
   */
  function grab(game, r, c) {
    var color = ownerAt(game, r, c);
    if (color === EMPTY) return false;

    var before = snapshot(game);
    var path = game.paths[color];

    if (isEndpoint(game, color, r, c)) {
      // Restart from this dot. Drawing from the far dot is equally valid, so the
      // stored route always begins at whichever dot the player grabbed.
      truncatePath(game, color, 0);
      game.owner[r * game.size + c] = color;
      path.push([r, c]);
    } else {
      var at = indexInPath(path, r, c);
      if (at < 0) return false;
      truncatePath(game, color, at + 1);
    }

    game.active = { color: color, before: before, changed: false, startedAt: [r, c] };
    return true;
  }

  /**
   * Try to add one orthogonally adjacent cell to the active route.
   * Returns true when the board changed.
   */
  function stepTo(game, r, c) {
    var active = game.active;
    if (!active) return false;
    if (r < 0 || c < 0 || r >= game.size || c >= game.size) return false;

    var color = active.color;
    var path = game.paths[color];
    var head = path[path.length - 1];
    if (!head) return false;
    if (Math.abs(head[0] - r) + Math.abs(head[1] - c) !== 1) return false;

    // Retracing your own route trims it back: drag-back is the undo gesture.
    var at = indexInPath(path, r, c);
    if (at >= 0) {
      if (at === path.length - 1) return false;
      truncatePath(game, color, at + 1);
      active.changed = true;
      return true;
    }

    // A route that already runs dot to dot is closed; trim it before extending.
    if (path.length > 1 && isEndpoint(game, color, head[0], head[1])) return false;

    var occupant = ownerAt(game, r, c);
    if (occupant === color) {
      // The only cell of our own colour that is not on the path is the far dot,
      // and stepping onto it is how a route is completed.
      if (!isEndpoint(game, color, r, c)) return false;
    } else if (occupant !== EMPTY) {
      // Another colour's dot is immovable; the rest of its route gives way.
      if (isEndpoint(game, occupant, r, c)) return false;
      var otherAt = indexInPath(game.paths[occupant], r, c);
      if (otherAt < 0) return false;
      truncatePath(game, occupant, otherAt);
    }

    game.owner[r * game.size + c] = color;
    path.push([r, c]);
    active.changed = true;
    return true;
  }

  /**
   * Extend towards a cell that may be several cells away, which happens
   * whenever a pointer moves faster than the browser samples it. Walks one cell
   * at a time and stops at the first illegal step, so a fast drag draws the same
   * route a slow one would.
   */
  function extendTo(game, r, c) {
    if (!game.active) return false;
    var moved = false;
    var guard = game.size * game.size * 2;

    while (guard-- > 0) {
      var head = headOf(game, game.active.color);
      if (!head || (head[0] === r && head[1] === c)) break;

      var dr = Math.sign(r - head[0]);
      var dc = Math.sign(c - head[1]);
      var rowFirst = Math.abs(r - head[0]) >= Math.abs(c - head[1]);
      var tries = [];
      if (dr !== 0) tries.push([head[0] + dr, head[1]]);
      if (dc !== 0) tries.push([head[0], head[1] + dc]);
      if (!rowFirst) tries.reverse();

      var stepped = false;
      for (var i = 0; i < tries.length; i++) {
        if (stepTo(game, tries[i][0], tries[i][1])) {
          stepped = true;
          moved = true;
          break;
        }
      }
      if (!stepped) break;
    }
    return moved;
  }

  /** Abandon the current edit, restoring the board to the pre-grab state. */
  function cancel(game) {
    if (!game.active) return false;
    restore(game, game.active.before);
    game.active = null;
    return true;
  }

  /**
   * Finish the current edit. Returns { changed, solved }.
   *
   * An edit that drew nothing is rolled back, so tapping a dot without dragging
   * leaves an existing route alone instead of wiping it. An edit that did draw
   * becomes one undo step.
   */
  function release(game) {
    var active = game.active;
    game.active = null;
    if (!active) return { changed: false, solved: isSolved(game) };
    if (!active.changed) {
      restore(game, active.before);
      return { changed: false, solved: isSolved(game) };
    }
    game.history.push(active.before);
    game.moves++;
    return { changed: true, solved: isSolved(game) };
  }

  /** Undo the last completed edit. */
  function undo(game) {
    if (game.active) cancel(game);
    var previous = game.history.pop();
    if (!previous) return false;
    restore(game, previous);
    return true;
  }

  /** Clear every route back to bare dots. */
  function restart(game) {
    game.active = null;
    game.history = [];
    game.moves = 0;
    game.owner.fill(EMPTY);
    game.paths = game.endpoints.map(function (pair, color) {
      game.owner[pair[0][0] * game.size + pair[0][1]] = color;
      game.owner[pair[1][0] * game.size + pair[1][1]] = color;
      return [];
    });
    return game;
  }

  function filledCount(game) {
    var count = 0;
    for (var i = 0; i < game.owner.length; i++) if (game.owner[i] !== EMPTY) count++;
    return count;
  }

  function connectedCount(game) {
    var count = 0;
    for (var color = 0; color < game.colors; color++) if (isConnected(game, color)) count++;
    return count;
  }

  /** Solved means every colour is connected and every cell is used. */
  function isSolved(game) {
    if (connectedCount(game) !== game.colors) return false;
    return filledCount(game) === game.size * game.size;
  }

  /** Apply a full solution (used by tests). */
  function applySolution(game, solution) {
    restart(game);
    solution.forEach(function (path, color) {
      path.forEach(function (cell) {
        game.owner[cell[0] * game.size + cell[1]] = color;
      });
      game.paths[color] = path.map(function (cell) {
        return [cell[0], cell[1]];
      });
    });
    return game;
  }

  var api = {
    EMPTY: EMPTY,
    validateLevel: validateLevel,
    createGame: createGame,
    ownerAt: ownerAt,
    isEndpoint: isEndpoint,
    headOf: headOf,
    grab: grab,
    stepTo: stepTo,
    extendTo: extendTo,
    cancel: cancel,
    release: release,
    undo: undo,
    restart: restart,
    isConnected: isConnected,
    connectedCount: connectedCount,
    filledCount: filledCount,
    isSolved: isSolved,
    applySolution: applySolution,
  };

  global.LinkgridEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
