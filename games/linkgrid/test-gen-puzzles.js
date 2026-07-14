#!/usr/bin/env node
// Tests for puzzle generation algorithm

const {
  generatePuzzle,
  generatePuzzlePack,
  generatePuzzles,
} = require('./gen-puzzles.js');

/**
 * Test utilities
 */
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`✗ ${message}`);
  }
}

function assertEquals(actual, expected, message) {
  if (actual === expected) {
    testsPassed++;
    console.log(`✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`✗ ${message} (expected ${expected}, got ${actual})`);
  }
}

/**
 * Test suite
 */

console.log('=== Puzzle Generation Tests ===\n');

// Test 1: Generate 5x5 puzzle
console.log('Test 1: Generate 5x5 puzzle');
const puzzle5x5 = generatePuzzle(5, 1);
assert(puzzle5x5.endpoints, 'Puzzle endpoints exist');
assert(Array.isArray(puzzle5x5.endpoints), 'Endpoints is an array');
assert(puzzle5x5.endpoints.length > 0, 'Puzzle has at least one color pair');
console.log(`  Generated ${puzzle5x5.endpoints.length} color pairs\n`);

// Test 2: Verify endpoint structure
console.log('Test 2: Verify endpoint structure');
const endpoint = puzzle5x5.endpoints[0];
assert(endpoint.color !== undefined, 'Endpoint has color property');
assert(Array.isArray(endpoint.a) && endpoint.a.length === 2, 'Endpoint has point a [r, c]');
assert(Array.isArray(endpoint.b) && endpoint.b.length === 2, 'Endpoint has point b [r, c]');
assertEquals(endpoint.a[0] >= 0 && endpoint.a[0] < 5, true, 'Point a row is within grid');
assertEquals(endpoint.b[0] >= 0 && endpoint.b[0] < 5, true, 'Point b row is within grid');
console.log();

// Test 3: Verify endpoints are distinct
console.log('Test 3: Verify endpoints are distinct');
const endpointStr1 = JSON.stringify(endpoint.a);
const endpointStr2 = JSON.stringify(endpoint.b);
assert(endpointStr1 !== endpointStr2, 'Endpoints a and b are different cells');
console.log();

// Test 4: Generate 6x6 puzzle
console.log('Test 4: Generate 6x6 puzzle');
const puzzle6x6 = generatePuzzle(6, 2);
assert(puzzle6x6.endpoints, 'Puzzle endpoints exist');
assertEquals(puzzle6x6.endpoints.length >= 3, true, '6x6 puzzle has at least 3 colors');
console.log(`  Generated ${puzzle6x6.endpoints.length} color pairs\n`);

// Test 5: Tier affects color count
console.log('Test 5: Tier affects color count');
const puzzleTier1 = generatePuzzle(5, 1);
const puzzleTier5 = generatePuzzle(5, 5);
const colorsTier1 = puzzleTier1.endpoints.length;
const colorsTier5 = puzzleTier5.endpoints.length;
assert(colorsTier5 >= colorsTier1, 'Tier 5 has at least as many colors as Tier 1');
console.log(`  Tier 1: ${colorsTier1} colors, Tier 5: ${colorsTier5} colors\n`);

// Test 6: Generate puzzle pack
console.log('Test 6: Generate puzzle pack');
const pack = generatePuzzlePack(5, 3);
assertEquals(pack.length === 15, true, 'Pack has 15 puzzles (5 tiers × 3 per tier)');
assert(pack[0].id, 'First puzzle has ID');
assertEquals(pack[0].id.startsWith('5-'), true, 'Puzzle IDs start with size');
console.log(`  Generated pack with ${pack.length} puzzles\n`);

// Test 7: All puzzles in pack have correct structure
console.log('Test 7: Puzzle pack structure');
let packValid = true;
pack.forEach((p, i) => {
  if (!p.id || !p.size || !p.tier || !p.endpoints) {
    packValid = false;
    console.error(`  Puzzle ${i} missing required fields`);
  }
  if (p.size !== 5) {
    packValid = false;
    console.error(`  Puzzle ${i} has wrong size`);
  }
});
assert(packValid, 'All puzzles have correct structure and size');
console.log();

// Test 8: Tier assignment
console.log('Test 8: Tier assignment');
let tiersValid = true;
for (let tier = 1; tier <= 5; tier++) {
  const tierPuzzles = pack.filter(p => p.tier === tier);
  if (tierPuzzles.length !== 3) {
    tiersValid = false;
    console.error(`  Tier ${tier} has ${tierPuzzles.length} puzzles (expected 3)`);
  }
}
assert(tiersValid, 'All tiers have correct number of puzzles');
console.log();

// Test 9: Generate full puzzle set
console.log('Test 9: Generate full puzzle set');
const allPuzzles = generatePuzzles();
assert(allPuzzles['5'], 'Puzzle set includes 5x5');
assert(allPuzzles['6'], 'Puzzle set includes 6x6');
assert(allPuzzles['7'], 'Puzzle set includes 7x7');
assert(allPuzzles['8'], 'Puzzle set includes 8x8');
assert(allPuzzles['9'], 'Puzzle set includes 9x9');
assert(allPuzzles['10'], 'Puzzle set includes 10x10');
console.log();

// Test 10: Unique puzzle IDs
console.log('Test 10: Unique puzzle IDs');
const allIds = new Set();
let duplicateIds = false;
for (const size in allPuzzles) {
  allPuzzles[size].forEach(p => {
    if (allIds.has(p.id)) {
      duplicateIds = true;
      console.error(`  Duplicate ID: ${p.id}`);
    }
    allIds.add(p.id);
  });
}
assert(!duplicateIds, 'All puzzle IDs are unique');
console.log();

// Test 11: No endpoint overlaps within same puzzle
console.log('Test 11: No endpoint overlaps within same puzzle');
let overlapsFound = false;
for (const size in allPuzzles) {
  allPuzzles[size].forEach(puzzle => {
    const cellSet = new Set();
    puzzle.endpoints.forEach(ep => {
      const aKey = `${ep.a[0]},${ep.a[1]}`;
      const bKey = `${ep.b[0]},${ep.b[1]}`;
      if (cellSet.has(aKey) || cellSet.has(bKey)) {
        overlapsFound = true;
        console.error(`  Puzzle ${puzzle.id} has endpoint overlap`);
      }
      cellSet.add(aKey);
      cellSet.add(bKey);
    });
  });
}
assert(!overlapsFound, 'No endpoint overlaps within puzzles');
console.log();

// Summary
console.log('=== Test Summary ===');
const total = testsPassed + testsFailed;
console.log(`Passed: ${testsPassed}/${total}`);
if (testsFailed > 0) {
  console.log(`Failed: ${testsFailed}/${total}`);
  process.exit(1);
} else {
  console.log('All tests passed!');
  process.exit(0);
}
