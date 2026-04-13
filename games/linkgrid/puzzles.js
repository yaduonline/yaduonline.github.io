(function (global) {
  'use strict';

  const TEMPLATE_SPECS = [
    { tier: 1, orientation: 'vertical', colorCount: 2, variant: 0 },
    { tier: 1, orientation: 'vertical', colorCount: 3, variant: 0 },
    { tier: 1, orientation: 'vertical', colorCount: 4, variant: 0 },
    { tier: 1, orientation: 'horizontal', colorCount: 2, variant: 0 },
    { tier: 2, orientation: 'horizontal', colorCount: 3, variant: 0 },
    { tier: 2, orientation: 'horizontal', colorCount: 4, variant: 0 },
    { tier: 2, orientation: 'vertical', colorCount: 3, variant: 1, flipRows: true },
    { tier: 2, orientation: 'horizontal', colorCount: 3, variant: 1, flipCols: true },
    { tier: 3, orientation: 'vertical', colorCount: 4, variant: 1, flipCols: true },
    { tier: 3, orientation: 'horizontal', colorCount: 4, variant: 1, flipRows: true },
    { tier: 4, orientation: 'vertical', colorCount: 5, variant: 0 },
    { tier: 4, orientation: 'horizontal', colorCount: 5, variant: 0 },
    { tier: 4, orientation: 'vertical', colorCount: 2, variant: 1, flipRows: true, flipCols: true },
    { tier: 4, orientation: 'horizontal', colorCount: 2, variant: 1, flipRows: true, flipCols: true },
    { tier: 5, orientation: 'vertical', colorCount: 3, variant: 2, flipCols: true, reversePath: true },
    { tier: 5, orientation: 'horizontal', colorCount: 3, variant: 2, flipRows: true, reversePath: true },
  ];

  function range(length) {
    return Array.from({ length }, (_, index) => index);
  }

  function keyOf(cell) {
    return cell[0] + ',' + cell[1];
  }

  function makeBands(size, colorCount, variant) {
    const bands = new Array(colorCount).fill(Math.floor(size / colorCount));
    const remainder = size % colorCount;

    for (let index = 0; index < remainder; index += 1) {
      bands[(variant + index) % colorCount] += 1;
    }

    if (variant % 2 === 1) {
      bands.reverse();
    }

    return bands;
  }

  function buildSnakePath(size, orientation, start, span) {
    const path = [];

    if (orientation === 'vertical') {
      for (let offset = 0; offset < span; offset += 1) {
        const column = start + offset;
        const rows = offset % 2 === 0 ? range(size) : range(size).reverse();
        for (const row of rows) {
          path.push([row, column]);
        }
      }
      return path;
    }

    for (let offset = 0; offset < span; offset += 1) {
      const row = start + offset;
      const columns = offset % 2 === 0 ? range(size) : range(size).reverse();
      for (const column of columns) {
        path.push([row, column]);
      }
    }
    return path;
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
    const bands = makeBands(size, Math.min(spec.colorCount, size), spec.variant || 0);
    const solution = [];
    let cursor = 0;

    for (let color = 0; color < bands.length; color += 1) {
      const span = bands[color];
      const rawPath = buildSnakePath(size, spec.orientation, cursor, span);
      const path = transformPath(rawPath, size, spec);
      solution.push({ color, path });
      cursor += span;
    }

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