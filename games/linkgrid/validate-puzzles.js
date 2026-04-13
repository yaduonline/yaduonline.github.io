'use strict';

const { LINKGRID_PUZZLES, validatePuzzleSet } = require('./puzzles.js');

const failures = validatePuzzleSet(LINKGRID_PUZZLES);

if (failures.length > 0) {
  console.error('Linkgrid puzzle validation failed.');
  for (const failure of failures) {
    console.error('- ' + failure.id + ': ' + failure.errors.join('; '));
  }
  process.exit(1);
}

const counts = Object.fromEntries(
  Object.entries(LINKGRID_PUZZLES).map(([size, puzzles]) => [size, puzzles.length])
);

console.log('Linkgrid puzzle validation passed.');
console.log(JSON.stringify(counts, null, 2));