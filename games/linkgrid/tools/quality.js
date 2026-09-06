/**
 * Quality metrics for a Linkgrid solution.
 *
 * A "solution" here is an array of paths (one per colour), each an array of
 * [row, col] cells. These metrics drive both puzzle generation (which candidates
 * to keep) and the test suite (which asserts the shipped puzzle set still meets
 * the bar).
 *
 * Loaded as a classic script (globalThis.LinkgridQuality) or via require().
 */
(function (global) {
  'use strict';

  /** Corner names, keyed by the pair of grid sides a bend cell connects. */
  const CORNERS = ['up-left', 'up-right', 'down-left', 'down-right'];

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
  }

  function isBorder(cell, size) {
    return cell[0] === 0 || cell[1] === 0 || cell[0] === size - 1 || cell[1] === size - 1;
  }

  function cornerName(inDir, outDir) {
    // The two grid sides the path uses at this cell: it arrived along -inDir and
    // leaves along outDir.
    const sides = [[-inDir[0], -inDir[1]], outDir];
    const vertical = sides.find((d) => d[0] !== 0);
    const horizontal = sides.find((d) => d[1] !== 0);
    if (!vertical || !horizontal) return null; // straight, not a bend
    return (vertical[0] < 0 ? 'up' : 'down') + '-' + (horizontal[1] < 0 ? 'left' : 'right');
  }

  /** Every bend in a path, as { cell, corner, border }. */
  function bendsOf(path, size) {
    const out = [];
    for (let i = 1; i < path.length - 1; i++) {
      const inDir = sub(path[i], path[i - 1]);
      const outDir = sub(path[i + 1], path[i]);
      if (inDir[0] === outDir[0] && inDir[1] === outDir[1]) continue;
      out.push({
        cell: path[i],
        corner: cornerName(inDir, outDir),
        border: isBorder(path[i], size),
      });
    }
    return out;
  }

  /**
   * Compute the full metric set for a solution.
   *
   * Bend density is measured per cell available in each region, so the interior /
   * border comparison is fair even though the two regions differ in size.
   */
  function measure(size, solution) {
    const cells = size * size;
    const borderCells = size <= 2 ? cells : 4 * size - 4;
    const interiorCells = cells - borderCells;

    const lengths = solution.map((p) => p.length);
    const perPathBends = solution.map((p) => bendsOf(p, size));
    const allBends = perPathBends.flat();

    const cornerCounts = Object.fromEntries(CORNERS.map((c) => [c, 0]));
    let borderBends = 0;
    for (const b of allBends) {
      if (b.corner) cornerCounts[b.corner]++;
      if (b.border) borderBends++;
    }
    const interiorBends = allBends.length - borderBends;
    const straightPaths = perPathBends.filter((b) => b.length === 0).length;
    const cornerValues = CORNERS.map((c) => cornerCounts[c]);

    return {
      size,
      colors: solution.length,
      cells,
      totalBends: allBends.length,
      bendsPerCell: allBends.length / cells,
      straightPaths,
      straightShare: straightPaths / solution.length,
      interiorBends,
      borderBends,
      interiorCells,
      borderCells,
      // Bends per available cell in each region.
      interiorBendDensity: interiorCells > 0 ? interiorBends / interiorCells : 0,
      borderBendDensity: borderCells > 0 ? borderBends / borderCells : 0,
      cornerCounts,
      // Share of bends taken by the single most common corner orientation.
      dominantCornerShare: allBends.length ? Math.max(...cornerValues) / allBends.length : 1,
      distinctCorners: cornerValues.filter((v) => v > 0).length,
      minLength: Math.min(...lengths),
      maxLength: Math.max(...lengths),
      meanLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
      longestShare: Math.max(...lengths) / cells,
    };
  }

  /**
   * The bar every shipped puzzle must clear. Thresholds live here so the
   * generator and the tests can never drift apart.
   */
  const GATES = {
    maxStraightShare: 0.25, // fewer than 25% of connections may be bend-free
    minInteriorAdvantage: 1.2, // interior bend density vs border bend density
    minBendsPerCell: 0.3,
    minDistinctCorners: 4, // bends must turn every one of the four ways
    maxDominantCornerShare: 0.4,
    minPathLength: 3,
    maxLongestShare: 0.4, // no single colour may own 40%+ of the board
  };

  /** Returns an array of human-readable gate failures (empty means it passed). */
  function gateFailures(metrics, gates = GATES) {
    const fails = [];
    if (!(metrics.straightShare < gates.maxStraightShare)) {
      fails.push(
        `straightShare ${metrics.straightShare.toFixed(3)} >= ${gates.maxStraightShare}`
      );
    }
    if (metrics.borderBendDensity > 0) {
      const ratio = metrics.interiorBendDensity / metrics.borderBendDensity;
      if (!(ratio >= gates.minInteriorAdvantage)) {
        fails.push(`interior/border bend density ${ratio.toFixed(2)} < ${gates.minInteriorAdvantage}`);
      }
    } else if (metrics.interiorBends === 0) {
      fails.push('no bends anywhere');
    }
    if (metrics.bendsPerCell < gates.minBendsPerCell) {
      fails.push(`bendsPerCell ${metrics.bendsPerCell.toFixed(3)} < ${gates.minBendsPerCell}`);
    }
    if (metrics.distinctCorners < gates.minDistinctCorners) {
      fails.push(`distinctCorners ${metrics.distinctCorners} < ${gates.minDistinctCorners}`);
    }
    if (metrics.dominantCornerShare > gates.maxDominantCornerShare) {
      fails.push(
        `dominantCornerShare ${metrics.dominantCornerShare.toFixed(3)} > ${gates.maxDominantCornerShare}`
      );
    }
    if (metrics.minLength < gates.minPathLength) {
      fails.push(`minLength ${metrics.minLength} < ${gates.minPathLength}`);
    }
    if (metrics.longestShare > gates.maxLongestShare) {
      fails.push(`longestShare ${metrics.longestShare.toFixed(3)} > ${gates.maxLongestShare}`);
    }
    return fails;
  }

  /**
   * Structural validation: the solution must actually tile the grid with simple
   * orthogonal paths that start and end on the puzzle's endpoints.
   */
  function structureFailures(puzzle, solution) {
    const { size } = puzzle;
    const fails = [];
    const seen = new Map();

    if (solution.length !== puzzle.endpoints.length) {
      fails.push(`solution has ${solution.length} paths, puzzle has ${puzzle.endpoints.length} colours`);
      return fails;
    }

    puzzle.endpoints.forEach((endpoint, i) => {
      const path = solution[i];
      if (endpoint.color !== i) fails.push(`colour ${endpoint.color} out of order at index ${i}`);
      if (!path || path.length < 2) {
        fails.push(`colour ${i} path too short`);
        return;
      }
      const first = path[0];
      const last = path[path.length - 1];
      const matches =
        (first[0] === endpoint.a[0] && first[1] === endpoint.a[1] &&
          last[0] === endpoint.b[0] && last[1] === endpoint.b[1]) ||
        (first[0] === endpoint.b[0] && first[1] === endpoint.b[1] &&
          last[0] === endpoint.a[0] && last[1] === endpoint.a[1]);
      if (!matches) fails.push(`colour ${i} path does not join its endpoints`);

      for (let j = 0; j < path.length; j++) {
        const [r, c] = path[j];
        if (r < 0 || c < 0 || r >= size || c >= size) fails.push(`colour ${i} leaves the grid at step ${j}`);
        const key = r + ',' + c;
        if (seen.has(key)) fails.push(`cell ${key} used by colours ${seen.get(key)} and ${i}`);
        seen.set(key, i);
        if (j > 0) {
          const d = Math.abs(path[j][0] - path[j - 1][0]) + Math.abs(path[j][1] - path[j - 1][1]);
          if (d !== 1) fails.push(`colour ${i} makes a non-orthogonal step at ${j}`);
        }
      }
    });

    if (seen.size !== size * size) {
      fails.push(`solution covers ${seen.size} of ${size * size} cells`);
    }
    return fails;
  }

  var api = { measure, bendsOf, isBorder, gateFailures, structureFailures, GATES, CORNERS };
  global.LinkgridQuality = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
