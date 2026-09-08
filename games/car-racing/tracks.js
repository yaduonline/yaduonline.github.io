/**
 * Track definitions.
 *
 * A track is a list of sections, each with a length and a curve. `curve` is the
 * lateral drift of the road's centre line per unit travelled: 0 is straight,
 * positive bends right, negative bends left. The engine eases each section in
 * and out, so a bend arrives smoothly rather than as a kink.
 *
 * Keep curves within about ±0.45. Beyond that the road leaves the screen faster
 * than a car can follow it, and taking the corner stops being a decision and
 * starts being a coin toss.
 */
(function (global) {
  'use strict';

  var TRACKS = [
    {
      id: 'coast',
      name: 'Coast Run',
      description: 'Long straights, two easy sweepers. A good place to learn.',
      scenery: 'coast',
      trafficDensity: 0.8,
      sections: [
        { length: 1400, curve: 0 },
        { length: 1100, curve: 0.16 },
        { length: 900, curve: 0 },
        { length: 1100, curve: -0.18 },
        { length: 1500, curve: 0 },
      ],
    },
    {
      id: 'ridge',
      name: 'Ridge Pass',
      description: 'Alternating bends with short straights between them.',
      scenery: 'forest',
      trafficDensity: 1,
      sections: [
        { length: 800, curve: 0 },
        { length: 900, curve: 0.3 },
        { length: 500, curve: 0 },
        { length: 900, curve: -0.32 },
        { length: 450, curve: 0 },
        { length: 850, curve: 0.28 },
        { length: 500, curve: -0.24 },
        { length: 1100, curve: 0 },
      ],
    },
    {
      id: 'city',
      name: 'City Loop',
      description: 'Heavy traffic and tight, frequent turns. Patience beats speed.',
      scenery: 'city',
      trafficDensity: 1.7,
      sections: [
        { length: 600, curve: 0 },
        { length: 620, curve: -0.4 },
        { length: 380, curve: 0.36 },
        { length: 520, curve: -0.3 },
        { length: 340, curve: 0 },
        { length: 600, curve: 0.42 },
        { length: 420, curve: -0.38 },
        { length: 560, curve: 0.26 },
        { length: 900, curve: 0 },
      ],
    },
    {
      id: 'desert',
      name: 'Desert Mile',
      description: 'Wide open and fast, with two long committed curves.',
      scenery: 'desert',
      trafficDensity: 0.55,
      sections: [
        { length: 1600, curve: 0 },
        { length: 1500, curve: 0.22 },
        { length: 700, curve: 0 },
        { length: 1500, curve: -0.2 },
        { length: 1700, curve: 0 },
      ],
    },
  ];

  var api = { TRACKS: TRACKS };
  global.RacingTracks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
