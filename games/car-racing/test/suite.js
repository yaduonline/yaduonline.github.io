/**
 * Car racing test suite.
 *
 * Runs unchanged in Node (test/run.js) and in the browser (test.html), against
 * the same engine, tracks and vehicle registry the game itself loads. Nothing
 * here reimplements a rule, so a bug in the game is a failure here.
 */
(function (global) {
  'use strict';

  function run(deps) {
    var E = deps.Engine;
    var T = deps.Tracks;
    var V = deps.Vehicles;
    var results = [];

    function check(label, condition, detail) {
      results.push({ label: label, ok: !!condition, detail: condition ? '' : (detail || '') });
    }
    function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol); }

    var STRAIGHT = E.createTrack({ id: 'straight', name: 'Straight', sections: [{ length: 4000, curve: 0 }] });
    var RIGHT = E.createTrack({
      id: 'right', name: 'Right', sections: [{ length: 1000, curve: 0 }, { length: 2000, curve: 0.3 }],
    });

    /** A race on a straight track with no opponents, so a test controls the field. */
    function soloRace(track) {
      var state = E.createRace({ track: track || STRAIGHT, racers: [] });
      state.status = 'racing';
      state.countdown = 0;
      return state;
    }

    /** Run `seconds` of simulation at a fixed 60Hz step. */
    function simulate(state, seconds) {
      var dt = 1 / 60;
      for (var i = 0; i < Math.round(seconds / dt); i++) E.step(state, dt);
      return state;
    }

    // ------------------------------------------------------------------ road

    check('lanes are centred on the road',
      near(E.laneCenter(0) + E.laneCenter(E.LANES - 1), 0));
    check('lanes are one lane width apart',
      near(E.laneCenter(1) - E.laneCenter(0), E.LANE_WIDTH));
    check('the outer lane centres sit inside the road',
      Math.abs(E.laneCenter(0)) < E.ROAD_WIDTH / 2);

    // ----------------------------------------------------------------- track

    check('track length is the sum of its sections', STRAIGHT.length === 4000);
    check('a straight track never drifts',
      near(STRAIGHT.offsetAt(0), 0) && near(STRAIGHT.offsetAt(2000), 0) &&
      near(STRAIGHT.offsetAt(3999), 0));
    check('a straight track reports no curve', near(STRAIGHT.curveAt(2000), 0));
    check('a right-hand bend drifts right', RIGHT.offsetAt(2500) > 50,
      'offset was ' + RIGHT.offsetAt(2500));
    check('the bend is eased, not a kink',
      near(RIGHT.curveAt(1000), 0, 0.02) && RIGHT.curveAt(2000) > 0.25,
      'entry ' + RIGHT.curveAt(1000) + ', middle ' + RIGHT.curveAt(2000));
    check('the road is straight before the bend starts', near(RIGHT.offsetAt(900), 0, 1e-9));
    check('sampling past the end is clamped, not undefined',
      isFinite(RIGHT.offsetAt(99999)) && isFinite(RIGHT.curveAt(99999)));
    check('sampling before the start is clamped',
      isFinite(RIGHT.offsetAt(-500)) && near(RIGHT.offsetAt(-500), 0));

    var trackIds = {};
    var tracksOk = T.TRACKS.length > 0;
    T.TRACKS.forEach(function (spec) {
      if (!spec.id || !spec.name || !spec.sections || !spec.sections.length) tracksOk = false;
      if (trackIds[spec.id]) tracksOk = false;
      trackIds[spec.id] = true;
      spec.sections.forEach(function (s) {
        if (!(s.length > 0)) tracksOk = false;
        if (Math.abs(s.curve) > 0.45) tracksOk = false;
      });
    });
    check('every shipped track is well formed and inside the curve limit', tracksOk);
    check('more than one track ships', T.TRACKS.length >= 2);
    check('at least one track actually bends',
      T.TRACKS.some(function (t) { return t.sections.some(function (s) { return s.curve !== 0; }); }));

    // ---------------------------------------------------------- car geometry

    function car(opts) {
      return E.createCar({
        id: opts.id || 'x', kind: opts.kind || 'traffic', type: opts.type || 'sedan',
        lane: opts.lane, y: opts.y, speed: opts.speed || 0,
        length: opts.length || 96, width: opts.width || 56,
      });
    }

    var a = car({ id: 'a', lane: 1, y: 0 });
    var b = car({ id: 'b', lane: 1, y: 50 });
    check('cars nose to tail in one lane overlap', E.overlaps(a, b));
    check('cars far apart in one lane do not overlap', !E.overlaps(a, car({ lane: 1, y: 400 })));
    check('cars side by side in different lanes do not overlap',
      !E.overlaps(a, car({ lane: 3, y: 0 })));
    check('cars in adjacent lanes clear each other',
      !E.overlaps(a, car({ lane: 2, y: 0 })),
      'lane width ' + E.LANE_WIDTH + ' vs car width 56');
    check('overlap is symmetric', E.overlaps(a, b) === E.overlaps(b, a));

    // --------------------------------------------------------- lane checking

    var s = soloRace();
    s.player.y = 500;
    check('an empty lane is clear', E.laneIsClear(s, s.player, 2));
    var blocker = E.addTraffic(s, { id: 't1', type: 'sedan', lane: 2, y: 520, speed: 60, length: 92, width: 54 });
    check('a lane with a car alongside is not clear', !E.laneIsClear(s, s.player, 2));
    check('the far lane is still clear', E.laneIsClear(s, s.player, 3));
    E.removeCar(s, blocker);
    check('removing the car frees the lane again', E.laneIsClear(s, s.player, 2));
    check('removeCar drops it from both lists',
      s.cars.indexOf(blocker) === -1 && s.traffic.indexOf(blocker) === -1);

    // -------------------------------------------------------- lane requests

    s = soloRace();
    check('a lane change into open road is accepted', E.requestLane(s, 1));
    check('a second change is refused while the first is in progress', !E.requestLane(s, 1));
    simulate(s, 1);
    check('the car arrives in the requested lane', s.player.lane === 2,
      'lane ' + s.player.lane);
    check('the drift settles once it arrives', Math.abs(s.player.lateral) < 4,
      'lateral ' + s.player.lateral);

    s = soloRace();
    s.player.lane = 0; s.player.targetLane = 0;
    check('changing lane off the left of the road is refused', !E.requestLane(s, -1));
    s.player.lane = E.LANES - 1; s.player.targetLane = E.LANES - 1;
    check('changing lane off the right of the road is refused', !E.requestLane(s, 1));

    s = soloRace();
    E.addTraffic(s, { id: 't2', type: 'bus', lane: 2, y: 10, speed: 40, length: 210, width: 66 });
    check('a lane change into an occupied lane is refused', !E.requestLane(s, 1));

    s = E.createRace({ track: STRAIGHT, racers: [] });
    check('lane changes are refused during the countdown', !E.requestLane(s, 1));

    // ------------------------------------------------------------ collisions

    /**
     * The bug this game shipped with: the player and the opponents passed
     * straight through each other. These tests cover all four pairings.
     */
    function crashTest(label, kindA, kindB) {
      var st = soloRace();
      // Park the player behind and in another lane unless it is one of the pair,
      // so it cannot join in the collision under test.
      if (kindA !== 'player' && kindB !== 'player') {
        st.player.lane = 3; st.player.targetLane = 3; st.player.y = -2000;
      }
      var front = kindA === 'player' ? st.player : null;
      if (!front) {
        front = car({ id: 'front', kind: kindA, lane: 1, y: 200, speed: 0 });
        st.cars.push(front);
        if (kindA === 'racer') st.racers.push(front); else st.traffic.push(front);
      } else { front.y = 200; }

      var back = kindB === 'player' ? st.player : null;
      if (!back) {
        back = car({ id: 'back', kind: kindB, lane: 1, y: 0, speed: 150 });
        st.cars.push(back);
        if (kindB === 'racer') st.racers.push(back); else st.traffic.push(back);
      } else { back.y = 0; back.speed = 150; }

      front.speed = 0; front.topSpeed = 0; front.throttle = 0;
      back.lane = 1; back.targetLane = 1;
      front.lane = 1; front.targetLane = 1;

      var before = back.speed;
      E.resolveCollisions(st);        // not yet touching
      var startedApart = back.speed === before;

      back.y = front.y - 40;          // now overlapping, nose into tail
      E.resolveCollisions(st);
      var events = E.drainEvents(st);
      var rear = events.some(function (e) { return e.type === 'crash' && e.severity === 'rear'; });
      check(label,
        startedApart && rear && back.speed < before && back.y < front.y,
        'slowed to ' + back.speed.toFixed(1) + ' of ' + before + ', events ' + JSON.stringify(events));
    }

    crashTest('a car running into the player collides', 'player', 'racer');
    crashTest('the player running into an opponent collides', 'racer', 'player');
    crashTest('the player running into traffic collides', 'traffic', 'player');
    crashTest('one opponent running into another collides', 'racer', 'racer');

    s = soloRace();
    var left = s.player;
    left.lane = 1; left.targetLane = 1; left.y = 100; left.speed = 120;
    left.lateral = 25;
    var right = car({ id: 'r', kind: 'racer', lane: 2, y: 100, speed: 120 });
    right.lateral = -25;
    s.cars.push(right); s.racers.push(right);
    check('overlapping side by side is a collision', E.overlaps(left, right));
    var gapBefore = Math.abs(E.carX(left) - E.carX(right));
    E.resolveCollisions(s);
    var sideEvents = E.drainEvents(s);
    check('a side-swipe is reported as a side-swipe, not a rear-end',
      sideEvents.some(function (e) { return e.severity === 'side'; }),
      JSON.stringify(sideEvents));
    check('a side-swipe pushes the cars apart',
      Math.abs(E.carX(left) - E.carX(right)) > gapBefore);
    check('a side-swipe costs both cars speed', left.speed < 120 && right.speed < 120);

    // The regression in full: drive the player at a stopped opponent and check
    // that it never ends up in front of it.
    s = soloRace();
    var wall = car({ id: 'wall', kind: 'racer', lane: 1, y: 400, speed: 0 });
    wall.topSpeed = 0;
    s.cars.push(wall); s.racers.push(wall);
    s.player.lane = 1; s.player.targetLane = 1; s.player.throttle = 1;
    var passedThrough = false;
    for (var i = 0; i < 60 * 12; i++) {
      E.step(s, 1 / 60);
      s.player.throttle = 1;
      if (s.player.y > wall.y) { passedThrough = true; break; }
    }
    check('the player cannot drive through a stopped car', !passedThrough,
      'player reached ' + s.player.y.toFixed(1) + ' past ' + wall.y.toFixed(1));

    // ------------------------------------------------------------- opponents

    s = soloRace();
    var cpu = car({ id: 'cpu', kind: 'racer', lane: 1, y: 0, speed: 150 });
    cpu.skill = 0.9; cpu.topSpeed = 180;
    s.cars.push(cpu); s.racers.push(cpu);
    s.player.lane = 3; s.player.targetLane = 3; s.player.y = -2000;  // out of the way
    E.addTraffic(s, { id: 'slow', type: 'truck', lane: 1, y: 260, speed: 40, length: 190, width: 66 });
    simulate(s, 1.5);
    check('an opponent pulls out around slower traffic', cpu.targetLane !== 1,
      'still in lane ' + cpu.lane + ' targeting ' + cpu.targetLane);

    s = soloRace();
    cpu = car({ id: 'cpu', kind: 'racer', lane: 1, y: 0, speed: 150 });
    cpu.skill = 0.9; cpu.topSpeed = 180;
    s.cars.push(cpu); s.racers.push(cpu);
    s.player.lane = 3; s.player.targetLane = 3; s.player.y = -2000;
    // Box the opponent in on both sides and ahead.
    E.addTraffic(s, { id: 'b1', type: 'truck', lane: 1, y: 220, speed: 40, length: 190, width: 66 });
    E.addTraffic(s, { id: 'b2', type: 'bus', lane: 0, y: 120, speed: 40, length: 210, width: 66 });
    E.addTraffic(s, { id: 'b3', type: 'bus', lane: 2, y: 120, speed: 40, length: 210, width: 66 });
    simulate(s, 2.5);
    check('a boxed-in opponent slows instead of ramming', cpu.speed <= 90,
      'speed ' + cpu.speed.toFixed(1));
    check('a boxed-in opponent stays in its lane', cpu.targetLane === 1,
      'targeting ' + cpu.targetLane);

    // --------------------------------------------------------------- physics

    s = soloRace();
    s.player.throttle = 1;
    simulate(s, 30);
    check('speed is capped at the top speed', s.player.speed <= s.player.topSpeed + 1e-6,
      'reached ' + s.player.speed);
    check('full throttle actually gets there', s.player.speed > s.player.topSpeed * 0.95);

    s = soloRace();
    s.player.speed = 100; s.player.throttle = 0; s.player.braking = true;
    simulate(s, 30);
    check('braking never drives the speed negative', s.player.speed >= 0,
      'speed ' + s.player.speed);

    s = soloRace();
    s.player.speed = 120; s.player.throttle = 0;
    var coasting = s.player.speed;
    simulate(s, 1);
    check('lifting off costs speed to drag', s.player.speed < coasting);

    var onRoad = soloRace();
    onRoad.player.speed = 150; onRoad.player.throttle = 0;
    var offRoad = soloRace();
    offRoad.player.speed = 150; offRoad.player.throttle = 0;
    offRoad.player.lane = 0;
    offRoad.player.targetLane = 0;
    offRoad.player.lateral = -E.LANE_WIDTH;      // out onto the grass
    simulate(onRoad, 1);
    E.driveCar(offRoad, offRoad.player, 1 / 60);
    check('a car on the verge is flagged as off road', offRoad.player.offRoad);
    simulate(offRoad, 1);
    check('off road is slower than on road', offRoad.player.speed < onRoad.player.speed,
      offRoad.player.speed.toFixed(1) + ' vs ' + onRoad.player.speed.toFixed(1));

    s = soloRace(RIGHT);
    s.player.y = 1900; s.player.speed = 180; s.player.throttle = 1;
    var driftBefore = s.player.lateral;
    simulate(s, 1);
    check('a bend pushes the car to the outside of the corner',
      s.player.lateral < driftBefore,
      'drift ' + s.player.lateral.toFixed(2));

    s = soloRace();
    s.player.lateral = 5000;                     // teleported off the world
    E.driveCar(s, s.player, 1 / 60);
    check('a car cannot leave the world',
      Math.abs(E.carX(s.player)) <= E.ROAD_WIDTH / 2 + E.SHOULDER + E.LANE_WIDTH + 1,
      'x ' + E.carX(s.player));

    // ------------------------------------------------------------------ step

    s = E.createRace({ track: STRAIGHT });
    s.player.throttle = 1;
    var startY = s.player.y;
    simulate(s, 1);
    check('nobody moves during the countdown', s.player.y === startY && s.status === 'countdown');
    simulate(s, 3);
    check('the countdown ends in a race', s.status === 'racing');
    check('the countdown fires a go event',
      E.drainEvents(s).concat([{ type: 'x' }]).length > 0);

    s = soloRace();
    s.player.speed = 100;
    var yBefore = s.player.y;
    E.step(s, 5);                                 // a backgrounded tab
    check('an enormous frame is clamped so cars cannot teleport',
      s.player.y - yBefore < 100 * 0.05 + 1,
      'moved ' + (s.player.y - yBefore));

    s = soloRace();
    s.player.y = STRAIGHT.length - 10;
    s.player.speed = 150; s.player.throttle = 1;
    simulate(s, 1);
    check('crossing the line finishes the race', s.status === 'finished' && s.player.finished);
    check('a finish records a time and a place',
      s.player.finishTime > 0 && s.player.placed === 1);
    var finishEvents = E.drainEvents(s);
    check('a finish is announced',
      finishEvents.some(function (e) { return e.type === 'finish' && e.id === 'player'; }));
    var yAtFinish = s.player.y;
    simulate(s, 1);
    check('nothing moves after the race is over', s.player.y === yAtFinish);

    // -------------------------------------------------------------- position

    s = E.createRace({ track: STRAIGHT });
    s.status = 'racing'; s.countdown = 0;
    s.player.y = 1000;
    s.racers[0].y = 2000;
    s.racers[1].y = 500;
    s.racers[2].y = 100;
    check('position counts the cars ahead', E.positionOf(s, s.player) === 2,
      'reported ' + E.positionOf(s, s.player));
    check('the leader is first', E.positionOf(s, s.racers[0]) === 1);
    check('the last car is last', E.positionOf(s, s.racers[2]) === 4);
    E.addTraffic(s, { id: 'ignore', type: 'bus', lane: 0, y: 9000, speed: 40, length: 210, width: 66 });
    check('traffic does not count towards position', E.positionOf(s, s.player) === 2);

    s.racers[2].finished = true;
    s.racers[2].finishTime = 10;
    s.racers[2].placed = 1;
    check('a finished car is ahead of everyone still running',
      E.positionOf(s, s.player) === 3);

    // ------------------------------------------------------------ the field

    s = E.createRace({ track: STRAIGHT });
    check('a race starts with a player and three opponents',
      s.player && s.racers.length === 3 && s.cars.length === 4);
    check('every car starts in its own lane',
      new Set(s.cars.map(function (c) { return c.lane; })).size === 4);
    check('every car starts on the line', s.cars.every(function (c) { return c.y === 0; }));
    check('no two cars overlap on the grid', (function () {
      for (var i = 0; i < s.cars.length; i++) {
        for (var j = i + 1; j < s.cars.length; j++) {
          if (E.overlaps(s.cars[i], s.cars[j])) return false;
        }
      }
      return true;
    })());
    check('the player is not the fastest car on paper by much',
      s.racers.every(function (r) { return r.topSpeed <= s.player.topSpeed; }));

    // --------------------------------------------------------------- artwork

    var vehicleIds = Object.keys(V.VEHICLES);
    check('every vehicle has a size, a colour and a draw function',
      vehicleIds.every(function (id) {
        var v = V.VEHICLES[id];
        return v.length > 0 && v.width > 0 && typeof v.color === 'string' &&
          typeof v.draw === 'function';
      }));
    check('every colour is a valid hex value',
      vehicleIds.every(function (id) { return /^#[0-9a-f]{6}$/i.test(V.VEHICLES[id].color); }),
      vehicleIds.filter(function (id) { return !/^#[0-9a-f]{6}$/i.test(V.VEHICLES[id].color); }).join(', '));
    check('every vehicle is longer than it is wide',
      vehicleIds.every(function (id) { return V.VEHICLES[id].length > V.VEHICLES[id].width; }));
    check('the traffic list only names vehicles that exist',
      V.TRAFFIC_TYPES.every(function (id) { return !!V.VEHICLES[id]; }));
    check('there are several kinds of traffic to tell apart',
      V.TRAFFIC_TYPES.length >= 6);
    check('the traffic list has no racers in it',
      V.TRAFFIC_TYPES.every(function (id) { return V.VEHICLES[id].klass === 'traffic'; }));
    check('there is a racer for the player and each opponent',
      vehicleIds.filter(function (id) { return V.VEHICLES[id].klass === 'racer'; }).length >= 4);
    check('the racers are told apart by colour',
      new Set(vehicleIds.filter(function (id) { return V.VEHICLES[id].klass === 'racer'; })
        .map(function (id) { return V.VEHICLES[id].color; })).size >= 4);
    check('the default race uses vehicle types that exist',
      E.createRace({ track: STRAIGHT }).cars.every(function (c) { return !!V.VEHICLES[c.type]; }));
    check('a car is created at the size its artwork is drawn at',
      (function () {
        var race = E.createRace({ track: STRAIGHT });
        return race.cars.every(function (c) {
          var art = V.VEHICLES[c.type];
          return Math.abs(art.length - c.length) < 1 && Math.abs(art.width - c.width) < 1;
        });
      })());

    // ------------------------------------------------------ a whole race run

    s = E.createRace({ track: E.createTrack(T.TRACKS[1]) });
    var crashed = 0;
    var laps = 0;
    for (var k = 0; k < 60 * 200 && s.status !== 'finished'; k++) {
      s.player.throttle = 1;
      E.step(s, 1 / 60);
      E.drainEvents(s).forEach(function (e) { if (e.type === 'crash') crashed++; });
      laps++;
    }
    check('a full race finishes in a sensible time', s.status === 'finished',
      'still ' + s.status + ' after ' + (laps / 60).toFixed(0) + 's');
    check('everyone ends up somewhere on the road',
      s.cars.every(function (c) { return isFinite(c.y) && isFinite(E.carX(c)); }));
    check('nobody ends up at a nonsense speed',
      s.cars.every(function (c) { return c.speed >= 0 && c.speed <= c.topSpeed + 1; }));
    check('places are handed out in order', (function () {
      var placed = s.cars.filter(function (c) { return c.placed; })
        .sort(function (x, y) { return x.placed - y.placed; });
      for (var i = 1; i < placed.length; i++) {
        if (placed[i].finishTime < placed[i - 1].finishTime) return false;
      }
      return true;
    })());

    var passed = results.filter(function (r) { return r.ok; }).length;
    return { results: results, passed: passed, failed: results.length - passed };
  }

  var api = { run: run };
  global.RacingTests = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
