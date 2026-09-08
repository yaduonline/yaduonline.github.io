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
      // The one track with no bends in it at all. `createTrack` derives its
      // `steering` flag from that, and the game gives it the arcade control
      // scheme: left and right change lane outright, no steering required.
      id: 'sprint',
      name: 'Airfield Sprint',
      description: 'Dead straight. Left and right change lane outright — start here.',
      scenery: 'meadow',
      trafficDensity: 1.15,
      sections: [
        { length: 20000, curve: 0 },
      ],
    },
    {
      id: 'coast',
      name: 'Coast Run',
      description: 'Long straights and four open sweepers. Hold a lean and keep the speed.',
      scenery: 'coast',
      trafficDensity: 0.8,
      sections: [
        { length: 3400, curve: 0 },
        { length: 3600, curve: 0.16 },
        { length: 2400, curve: 0 },
        { length: 3800, curve: -0.18 },
        { length: 2000, curve: 0 },
        { length: 3400, curve: 0.2 },
        { length: 1800, curve: 0 },
        { length: 3600, curve: -0.15 },
        { length: 2400, curve: 0 },
      ],
    },
    {
      id: 'ridge',
      name: 'Ridge Pass',
      description: 'Bend after bend, with just enough straight to unwind in between.',
      scenery: 'forest',
      trafficDensity: 1,
      sections: [
        { length: 2400, curve: 0 },
        { length: 2600, curve: 0.3 },
        { length: 1300, curve: 0 },
        { length: 2600, curve: -0.32 },
        { length: 1100, curve: 0 },
        { length: 2400, curve: 0.28 },
        { length: 1400, curve: -0.24 },
        { length: 1600, curve: 0 },
        { length: 2500, curve: -0.3 },
        { length: 1200, curve: 0 },
        { length: 2600, curve: 0.34 },
        { length: 1300, curve: -0.26 },
        { length: 3000, curve: 0 },
      ],
    },
    {
      id: 'city',
      name: 'City Loop',
      description: 'Heavy traffic and tight, frequent turns. Patience beats speed.',
      scenery: 'city',
      trafficDensity: 1.7,
      sections: [
        { length: 1800, curve: 0 },
        { length: 1900, curve: -0.4 },
        { length: 1200, curve: 0.36 },
        { length: 1600, curve: -0.3 },
        { length: 1000, curve: 0 },
        { length: 1800, curve: 0.42 },
        { length: 1300, curve: -0.38 },
        { length: 1700, curve: 0.26 },
        { length: 1100, curve: 0 },
        { length: 1700, curve: -0.36 },
        { length: 1400, curve: 0.4 },
        { length: 1200, curve: -0.28 },
        { length: 2300, curve: 0 },
      ],
    },
    {
      id: 'desert',
      name: 'Desert Mile',
      description: 'Wide open and fast, with long curves that have to be held.',
      scenery: 'desert',
      trafficDensity: 0.55,
      sections: [
        { length: 4800, curve: 0 },
        { length: 5200, curve: 0.22 },
        { length: 2400, curve: 0 },
        { length: 5200, curve: -0.2 },
        { length: 2600, curve: 0 },
        { length: 4800, curve: 0.24 },
        { length: 5000, curve: 0 },
      ],
    },
  ];

  var api = { TRACKS: TRACKS };
  global.RacingTracks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
