(function (global) {
  'use strict';

  const TEMPLATE_SPECS = [
    { tier: 1, style: 'row-snake', weights: [4, 6, 5, 4, 6], variant: 0 },
    { tier: 1, style: 'column-snake', weights: [5, 4, 6, 5, 5], variant: 1, flipRows: true },
    { tier: 1, style: 'row-snake', weights: [3, 5, 4, 6, 7], variant: 2, flipCols: true },
    { tier: 2, style: 'column-snake', weights: [6, 5, 4, 7, 3], variant: 0 },
    { tier: 2, style: 'row-snake', weights: [5, 3, 6, 4, 7], variant: 1, flipRows: true },
    { tier: 2, style: 'column-snake', weights: [4, 7, 5, 3, 6], variant: 2, flipCols: true },
    { tier: 2, style: 'row-snake', weights: [3, 4, 5, 6, 7], variant: 3, reversePath: true },
    { tier: 3, style: 'column-snake', weights: [7, 4, 5, 6, 3], variant: 1, flipRows: true, reversePath: true },
    { tier: 3, style: 'row-snake', weights: [4, 6, 3, 7, 5], variant: 2, flipCols: true },
    { tier: 3, style: 'column-snake', weights: [5, 5, 4, 6, 5], variant: 3 },
    { tier: 4, style: 'row-snake', weights: [6, 4, 5, 3, 7], variant: 4, flipRows: true },
    { tier: 4, style: 'column-snake', weights: [3, 7, 4, 6, 5], variant: 2, flipCols: true },
    { tier: 4, style: 'row-snake', weights: [5, 4, 7, 3, 6], variant: 1, reversePath: true },
    { tier: 5, style: 'column-snake', weights: [6, 3, 5, 7, 4], variant: 0, flipRows: true, flipCols: true },
    { tier: 5, style: 'row-snake', weights: [4, 7, 3, 6, 5], variant: 2, flipRows: true, reversePath: true },
    { tier: 5, style: 'column-snake', weights: [5, 6, 4, 3, 7], variant: 1, flipCols: true, reversePath: true },
  ];

  function range(length) {
    return Array.from({ length }, (_, index) => index);
  }

  function keyOf(cell) {
    return cell[0] + ',' + cell[1];
  }

  function buildSnakePath(size, orientation) {
    const path = [];

    if (orientation === 'vertical') {
      for (let column = 0; column < size; column += 1) {
        const rows = column % 2 === 0 ? range(size) : range(size).reverse();
        for (const row of rows) {
          path.push([row, column]);
        }
      }
      return path;
    }

    for (let row = 0; row < size; row += 1) {
      const columns = row % 2 === 0 ? range(size) : range(size).reverse();
      for (const column of columns) {
        path.push([row, column]);
      }
    }
    return path;
  }

  function buildTraversal(size, style) {
    if (style === 'column-snake') return buildSnakePath(size, 'vertical');
    return buildSnakePath(size, 'horizontal');
  }

  function makeSegmentLengths(totalCells, weights, variant) {
    const count = weights.length;
    const minimum = totalCells >= count * 3 ? 3 : 2;
    const lengths = new Array(count).fill(minimum);
    const remaining = totalCells - count * minimum;
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let used = 0;

    for (let index = 0; index < count; index += 1) {
      const extra = Math.floor((remaining * weights[index]) / totalWeight);
      lengths[index] += extra;
      used += extra;
    }

    let leftover = remaining - used;
    let offset = variant % count;
    while (leftover > 0) {
      lengths[offset] += 1;
      leftover -= 1;
      offset = (offset + 1) % count;
    }

    return variant % 2 === 1 ? lengths.reverse() : lengths;
  }

  function splitTraversal(path, lengths) {
    const segments = [];
    let cursor = 0;

    for (const length of lengths) {
      segments.push(path.slice(cursor, cursor + length));
      cursor += length;
    }

    return segments;
  }

  function weightsForSize(spec, size) {
    const weights = spec.weights.slice();
    if (size <= 5 && weights.length > 4) {
      let mergeIndex = 0;
      let smallestPair = weights[0] + weights[1];
      for (let index = 1; index < weights.length - 1; index += 1) {
        const pairWeight = weights[index] + weights[index + 1];
        if (pairWeight < smallestPair) {
          smallestPair = pairWeight;
          mergeIndex = index;
        }
      }
      weights[mergeIndex] += weights[mergeIndex + 1];
      weights.splice(mergeIndex + 1, 1);
    }
    return weights;
  }

  function transformPath(path, size, spec) {
    let next = path.map(([row, column]) => [
      spec.flipRows ? size - 1 - row : row,
      spec.flipCols ? size - 1 - column : column,
    ]);

    if (spec.reversePath) {
      next = next.slice().reverse();
    }

    return next;
  }

  function buildPuzzle(size, levelNumber, spec) {
    const traversal = transformPath(buildTraversal(size, spec.style), size, spec);
    const lengths = makeSegmentLengths(size * size, weightsForSize(spec, size), spec.variant || 0);
    const solution = splitTraversal(traversal, lengths).map((path, color) => ({ color, path }));

    return {
      id: size + '-' + levelNumber,
      size,
      tier: spec.tier,
      endpoints: solution.map(({ color, path }) => ({
        color,
        a: path[0],
        b: path[path.length - 1],
      })),
      solution,
    };
  }

  function buildPuzzleSet() {
    const puzzles = {};

    for (const size of [5, 6, 7, 8, 9, 10]) {
      puzzles[size] = TEMPLATE_SPECS.map((spec, index) => buildPuzzle(size, index + 1, spec));
    }

    return puzzles;
  }

  function sameCell(a, b) {
    return a[0] === b[0] && a[1] === b[1];
  }

  function isOrthogonalStep(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
  }

  function isBorderCell(cell, size) {
    return cell[0] === 0 || cell[1] === 0 || cell[0] === size - 1 || cell[1] === size - 1;
  }

  function countTurns(path) {
    let turns = 0;
    for (let index = 2; index < path.length; index += 1) {
      const dr1 = path[index - 1][0] - path[index - 2][0];
      const dc1 = path[index - 1][1] - path[index - 2][1];
      const dr2 = path[index][0] - path[index - 1][0];
      const dc2 = path[index][1] - path[index - 1][1];
      if (dr1 !== dr2 || dc1 !== dc2) turns += 1;
    }
    return turns;
  }

  function validatePuzzle(puzzle) {
    const errors = [];
    const seenCells = new Map();

    if (!Array.isArray(puzzle.solution) || puzzle.solution.length === 0) {
      return ['Missing solution paths'];
    }

    for (const { color, path } of puzzle.solution) {
      if (!Array.isArray(path) || path.length < 2) {
        errors.push('Color ' + color + ' does not have a valid path');
        continue;
      }

      const colorCells = new Set();
      for (const cell of path) {
        const [row, column] = cell;
        if (row < 0 || row >= puzzle.size || column < 0 || column >= puzzle.size) {
          errors.push('Color ' + color + ' uses an out-of-bounds cell');
          continue;
        }

        const key = keyOf(cell);
        if (colorCells.has(key)) {
          errors.push('Color ' + color + ' revisits cell ' + key);
        }
        colorCells.add(key);

        if (seenCells.has(key)) {
          errors.push('Cell ' + key + ' is reused by colors ' + seenCells.get(key) + ' and ' + color);
        } else {
          seenCells.set(key, color);
        }
      }

      for (let index = 1; index < path.length; index += 1) {
        if (!isOrthogonalStep(path[index - 1], path[index])) {
          errors.push('Color ' + color + ' has a non-orthogonal step');
        }
      }

      const puzzleEndpoint = puzzle.endpoints.find((entry) => entry.color === color);
      if (!puzzleEndpoint) {
        errors.push('Missing endpoint definition for color ' + color);
        continue;
      }

      const matches =
        (sameCell(puzzleEndpoint.a, path[0]) && sameCell(puzzleEndpoint.b, path[path.length - 1])) ||
        (sameCell(puzzleEndpoint.a, path[path.length - 1]) && sameCell(puzzleEndpoint.b, path[0]));

      if (!matches) {
        errors.push('Endpoint mismatch for color ' + color);
      }
    }

    if (seenCells.size !== puzzle.size * puzzle.size) {
      errors.push('Puzzle does not cover all cells');
    }

    const turnCounts = puzzle.solution.map(({ path }) => countTurns(path));
    const turningPaths = turnCounts.filter((turns) => turns > 0).length;
    const interiorEndpoints = puzzle.endpoints.reduce((count, endpoint) => {
      return count + (isBorderCell(endpoint.a, puzzle.size) ? 0 : 1) + (isBorderCell(endpoint.b, puzzle.size) ? 0 : 1);
    }, 0);
    const totalTurns = turnCounts.reduce((sum, turns) => sum + turns, 0);

    const minimumTurningPaths = puzzle.size <= 5
      ? Math.max(2, Math.floor(puzzle.solution.length * 0.4))
      : Math.max(3, Math.floor(puzzle.solution.length * 0.6));
    const minimumInteriorEndpoints = puzzle.size <= 5 ? 1 : 2;
    const minimumTurns = puzzle.size <= 5
      ? Math.max(2, puzzle.solution.length - 2)
      : puzzle.solution.length;

    if (turningPaths < minimumTurningPaths) {
      errors.push('Puzzle is too straight-lined');
    }
    if (interiorEndpoints < minimumInteriorEndpoints) {
      errors.push('Puzzle does not place enough endpoints away from the border');
    }
    if (totalTurns < minimumTurns) {
      errors.push('Puzzle does not have enough bends');
    }

    return errors;
  }

  function validatePuzzleSet(puzzles) {
    const failures = [];

    for (const size of Object.keys(puzzles)) {
      for (const puzzle of puzzles[size]) {
        const errors = validatePuzzle(puzzle);
        if (errors.length > 0) {
          failures.push({ id: puzzle.id, errors });
        }
      }
    }

    return failures;
  }

  const LINKGRID_PUZZLES = buildPuzzleSet();

  global.LINKGRID_PUZZLES = LINKGRID_PUZZLES;
  global.LINKGRID_VALIDATE_PUZZLES = validatePuzzleSet;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      LINKGRID_PUZZLES,
      validatePuzzle,
      validatePuzzleSet,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);