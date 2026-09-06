/**
 * Compact encoding for reference solutions.
 *
 * A route is a start cell plus one character per step, so a 100-cell solution
 * costs about a tenth of what an array of [row, col] pairs costs. Only the
 * tests read solutions, but they read all six hundred of them.
 *
 *   [[2,3],[2,4],[3,4]]  <->  "2,3:RD"
 *
 * Loaded as a classic script (globalThis.LinkgridRoutes) or via require().
 */
(function (global) {
  'use strict';

  var STEPS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };

  function encodeRoute(route) {
    var moves = '';
    for (var i = 1; i < route.length; i++) {
      var dr = route[i][0] - route[i - 1][0];
      var dc = route[i][1] - route[i - 1][1];
      if (dr === -1) moves += 'U';
      else if (dr === 1) moves += 'D';
      else if (dc === -1) moves += 'L';
      else if (dc === 1) moves += 'R';
      else throw new Error('route step ' + i + ' is not orthogonal');
    }
    return route[0][0] + ',' + route[0][1] + ':' + moves;
  }

  function decodeRoute(text) {
    var split = text.indexOf(':');
    var start = text.slice(0, split).split(',');
    var cell = [Number(start[0]), Number(start[1])];
    var route = [cell];
    var moves = text.slice(split + 1);
    for (var i = 0; i < moves.length; i++) {
      var step = STEPS[moves[i]];
      if (!step) throw new Error('unknown step "' + moves[i] + '"');
      cell = [cell[0] + step[0], cell[1] + step[1]];
      route.push(cell);
    }
    return route;
  }

  var encode = function (solution) { return solution.map(encodeRoute); };
  var decode = function (encoded) { return encoded.map(decodeRoute); };

  var api = { encode: encode, decode: decode, encodeRoute: encodeRoute, decodeRoute: decodeRoute };
  global.LinkgridRoutes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
