/**
 * Car racing simulation.
 *
 * Pure logic with no DOM and no canvas: the track model, vehicle physics,
 * opponent AI and collision resolution all live here, so the browser game, the
 * browser test page and the Node test runner drive exactly the same code.
 *
 * World coordinates: `y` runs forward along the track in metres-ish units, `x`
 * runs across it with 0 at the road's centre line. The road itself bends, so a
 * car's position on screen also depends on the track's lateral offset at its y.
 */
(function (global) {
  'use strict';

  var LANES = 4;
  var LANE_WIDTH = 90;              // world units
  var ROAD_WIDTH = LANES * LANE_WIDTH;
  var SHOULDER = 26;                // grace beyond the outer lane before it is "off road"

  var MAX_SPEED = 190;
  var ACCEL = 52;                   // units per second squared
  var BRAKE = 95;
  var DRAG = 14;
  var OFFROAD_DRAG = 130;           // grass is slow

  var GRIP = 3.4;                   // how quickly a car snaps to a lane, on a straight

  // Steering, used on tracks that bend. `heading` is the angle of a car's
  // travel measured against the road's forward axis, so a car pointing exactly
  // down the map has heading 0 whatever the road underneath it is doing.
  //
  // The consequence worth knowing: holding a line through a bend of curvature
  // c means holding a heading of atan(c). The sharpest corner in the game is
  // 0.45, so about 24 degrees, and MAX_HEADING leaves room to over-steer past
  // that without letting anyone spin the car round.
  var STEER_RATE = 1.6;             // rad/s while left or right is held
  var STEER_RETURN = 0.5;           // rad/s the wheel unwinds when released
  var MAX_HEADING = 0.6;            // rad, about 34 degrees
  var AI_STEER_GAIN = 0.011;        // rad of correction per unit off the line
  var AI_STEER_DAMP = 0.055;        // ...damped by how fast we are already crossing

  var COLLISION_BUMP = 0.55;        // speed kept by the car behind after a shunt
  // Closing speed below which touching the car in front is a nudge rather than
  // a shunt. Without this, sitting behind slower traffic is a limit cycle: you
  // catch it, get thrown down to 55% of its speed, chase it back up, catch it
  // again - and average out slower than the car you are stuck behind.
  var NUDGE_SPEED = 32;

  function clamp(value, low, high) {
    return value < low ? low : value > high ? high : value;
  }

  /** Lateral centre of a lane, in world units from the road centre line. */
  function laneCenter(lane) {
    return (lane - (LANES - 1) / 2) * LANE_WIDTH;
  }

  // -------------------------------------------------------------------------
  // Track
  // -------------------------------------------------------------------------

  /**
   * Build a track from a list of `{ length, curve }` sections. `curve` is the
   * lateral drift of the centre line per unit of forward travel: 0 is straight,
   * positive bends right, negative bends left.
   *
   * The centre line is integrated once into a lookup table so that asking for
   * the offset at any y during rendering or physics is a cheap array read
   * rather than a walk over the sections.
   */
  function createTrack(spec) {
    var step = 20;
    var sections = spec.sections;
    var total = 0;
    for (var i = 0; i < sections.length; i++) total += sections[i].length;

    var samples = Math.ceil(total / step) + 2;
    var offsets = new Float64Array(samples);
    var curves = new Float64Array(samples);

    var offset = 0;
    var sectionIndex = 0;
    var sectionStart = 0;
    for (var s = 0; s < samples; s++) {
      var y = s * step;
      while (sectionIndex < sections.length - 1 &&
             y >= sectionStart + sections[sectionIndex].length) {
        sectionStart += sections[sectionIndex].length;
        sectionIndex++;
      }
      var section = sections[sectionIndex];
      // Ease the curve in and out across the section so bends do not start
      // with a kink.
      var t = section.length ? (y - sectionStart) / section.length : 0;
      t = Math.max(0, Math.min(1, t));
      var eased = section.curve * Math.sin(Math.PI * t);
      curves[s] = eased;
      offsets[s] = offset;
      offset += eased * step;
    }

    function sampleAt(table, y) {
      if (y <= 0) return table[0];
      var pos = y / step;
      var i0 = Math.floor(pos);
      if (i0 >= samples - 1) return table[samples - 1];
      var frac = pos - i0;
      return table[i0] * (1 - frac) + table[i0 + 1] * frac;
    }

    // Derived, not declared: a track that never turns cannot need steering, and
    // deriving it means the flag can never fall out of step with the sections.
    var bends = false;
    for (var b = 0; b < sections.length; b++) if (sections[b].curve) bends = true;

    return {
      id: spec.id,
      name: spec.name,
      description: spec.description || '',
      length: total,
      steering: bends,
      trafficDensity: spec.trafficDensity === undefined ? 1 : spec.trafficDensity,
      scenery: spec.scenery || 'meadow',
      /** Lateral offset of the road's centre line at this point. */
      offsetAt: function (y) { return sampleAt(offsets, y); },
      /** How sharply the road is turning here. */
      curveAt: function (y) { return sampleAt(curves, y); },
    };
  }

  // -------------------------------------------------------------------------
  // Cars
  // -------------------------------------------------------------------------

  function createCar(options) {
    return {
      id: options.id,
      kind: options.kind,                 // 'player' | 'racer' | 'traffic'
      type: options.type,                 // vehicle type name, for drawing
      lane: options.lane,
      targetLane: options.lane,
      lateral: 0,                         // drift from the lane centre
      heading: 0,                         // steering angle, on tracks that bend
      steerInput: 0,                      // -1, 0 or 1, the player's hands
      y: options.y || 0,
      speed: options.speed || 0,
      topSpeed: options.topSpeed || MAX_SPEED,
      accel: options.accel || ACCEL,
      length: options.length || 96,
      width: options.width || 58,
      throttle: 0,
      braking: false,
      offRoad: false,
      crashCooldown: 0,
      laneCooldown: 0,
      finished: false,
      finishTime: null,
      placed: null,
    };
  }

  /** Where the car actually is across the road, lane plus any drift. */
  function carX(car) {
    return laneCenter(car.lane) + car.lateral;
  }

  /** Do two cars overlap? Compared in road space, so bends do not matter. */
  function overlaps(a, b) {
    var dy = Math.abs(a.y - b.y);
    if (dy >= (a.length + b.length) / 2) return false;
    var dx = Math.abs(carX(a) - carX(b));
    return dx < (a.width + b.width) / 2;
  }

  /**
   * Is this stretch of lane clear for `car`? Used both by the player's lane
   * change and by the opponents' AI, so they cannot disagree about it.
   */
  function laneIsClear(state, car, lane, ahead, behind) {
    var lookAhead = ahead === undefined ? car.length : ahead;
    var lookBehind = behind === undefined ? car.length * 0.6 : behind;
    var probe = {
      y: car.y + (lookAhead - lookBehind) / 2,
      lane: lane,
      lateral: 0,
      length: car.length + lookAhead + lookBehind,
      width: car.width,
    };
    for (var i = 0; i < state.cars.length; i++) {
      var other = state.cars[i];
      if (other === car || other.finished) continue;
      if (overlaps(probe, other)) return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  function createRace(options) {
    var opts = options || {};
    var track = opts.track;
    var random = opts.random || Math.random;

    var state = {
      track: track,
      random: random,
      status: 'countdown',   // countdown | racing | finished
      countdown: 3.2,
      time: 0,
      cars: [],
      player: null,
      racers: [],
      traffic: [],
      events: [],
      finishers: 0,
    };

    var player = createCar({
      id: 'player', kind: 'player', type: 'racer', lane: 1, y: 0,
      topSpeed: MAX_SPEED, accel: ACCEL, length: 96, width: 56,
    });
    state.player = player;
    state.cars.push(player);

    var racerSpec = opts.racers || [
      { id: 'cpu1', type: 'racerRed', lane: 0, topSpeed: 168, accel: ACCEL * 0.92, skill: 0.75 },
      { id: 'cpu2', type: 'racerAmber', lane: 2, topSpeed: 176, accel: ACCEL * 0.95, skill: 0.85 },
      { id: 'cpu3', type: 'racerViolet', lane: 3, topSpeed: 182, accel: ACCEL * 0.98, skill: 0.95 },
    ];
    racerSpec.forEach(function (spec) {
      var car = createCar({
        id: spec.id, kind: 'racer', type: spec.type, lane: spec.lane, y: 0,
        topSpeed: spec.topSpeed, accel: spec.accel, length: 96, width: 56,
      });
      car.skill = spec.skill;
      state.racers.push(car);
      state.cars.push(car);
    });

    return state;
  }

  /** Add a traffic vehicle at a given point on the road. */
  function addTraffic(state, spec) {
    var car = createCar({
      id: spec.id, kind: 'traffic', type: spec.type, lane: spec.lane, y: spec.y,
      speed: spec.speed, topSpeed: spec.speed,
      length: spec.length, width: spec.width,
    });
    state.traffic.push(car);
    state.cars.push(car);
    return car;
  }

  function removeCar(state, car) {
    var i = state.cars.indexOf(car);
    if (i !== -1) state.cars.splice(i, 1);
    var j = state.traffic.indexOf(car);
    if (j !== -1) state.traffic.splice(j, 1);
  }

  // -------------------------------------------------------------------------
  // Physics
  // -------------------------------------------------------------------------

  function driveCar(state, car, dt) {
    if (car.crashCooldown > 0) car.crashCooldown -= dt;

    var wantsAccel = car.throttle > 0 && car.crashCooldown <= 0;
    if (wantsAccel) {
      car.speed += car.accel * car.throttle * dt;
    } else if (car.braking) {
      car.speed -= BRAKE * dt;
    } else {
      car.speed -= DRAG * dt;
    }

    // Grass costs you most of your speed but must not stop you dead: a car at a
    // standstill has no way back onto the road, because steering only moves you
    // if you are moving. Scaling with speed leaves a crawl to limp back on.
    if (car.offRoad) car.speed -= OFFROAD_DRAG * (car.speed / car.topSpeed) * dt;
    car.speed = Math.max(0, Math.min(car.speed, car.topSpeed));

    if (state.track.steering) driveSteered(state, car, dt);
    else driveOnRails(car, dt);

    // Off the tarmac?
    var edge = ROAD_WIDTH / 2 + SHOULDER;
    var x = carX(car);
    car.offRoad = Math.abs(x) > edge - car.width / 2;
    if (Math.abs(x) > edge + LANE_WIDTH) {
      // Never let a car leave the world entirely. Hitting the limit also
      // scrubs off any steering still pointing that way, so a car cannot pin
      // itself against the edge and sit there.
      var side = Math.sign(x);
      var clamped = side * (edge + LANE_WIDTH);
      car.lateral += clamped - x;
      if (Math.sign(car.heading) === side) car.heading = 0;
    }
  }

  /**
   * Movement on a track that bends: the car goes where it is pointed.
   *
   * In road space the centre line itself slides sideways as you travel, at
   * `curve` units across per unit along. So the car's drift relative to the
   * road is the difference between where it is pointing and where the road is
   * going - which is why holding a line through a bend means holding a heading
   * rather than holding a lane, and why letting go runs you off the outside.
   */
  function driveSteered(state, car, dt) {
    // Forward progress costs the cosine of the steering angle: point the car
    // across the road and you stop covering ground down it.
    car.y += car.speed * Math.cos(car.heading) * dt;
    var curve = state.track.curveAt(car.y);
    car.lateral += car.speed *
      (Math.sin(car.heading) - curve * Math.cos(car.heading)) * dt;
    normaliseLane(car);
  }

  /**
   * Movement on a dead straight track, where lane changes are the whole of the
   * steering and are meant to feel instant. Kinematic rather than physical, so
   * a car crawling out of a shunt can still pull over.
   */
  function driveOnRails(car, dt) {
    car.y += car.speed * dt;
    if (car.targetLane !== car.lane) {
      var dir = car.targetLane > car.lane ? 1 : -1;
      car.lateral += dir * LANE_WIDTH * Math.min(1, GRIP * dt);
      if (Math.abs(car.lateral) >= LANE_WIDTH - 1) {
        car.lane += dir;
        car.lateral -= dir * LANE_WIDTH;
      }
    } else {
      car.lateral -= car.lateral * Math.min(1, GRIP * dt);
    }
  }

  /**
   * Keep `lane` as the lane the car is actually nearest to, carrying the
   * remainder in `lateral`. Free steering would otherwise let `lateral` grow
   * without bound, and every collision and AI check reads position through
   * `carX`, which is `laneCenter(lane) + lateral`.
   */
  function normaliseLane(car) {
    while (car.lateral > LANE_WIDTH / 2 && car.lane < LANES - 1) {
      car.lane++;
      car.lateral -= LANE_WIDTH;
    }
    while (car.lateral < -LANE_WIDTH / 2 && car.lane > 0) {
      car.lane--;
      car.lateral += LANE_WIDTH;
    }
    car.targetLane = car.lane;
  }

  // -------------------------------------------------------------------------
  // Steering
  // -------------------------------------------------------------------------

  /** The player's hands: -1 left, 0 straight, 1 right. */
  function setSteer(state, input) {
    state.player.steerInput = input < 0 ? -1 : input > 0 ? 1 : 0;
  }

  function steerPlayer(car, dt) {
    if (car.steerInput) {
      car.heading += car.steerInput * STEER_RATE * dt;
    } else {
      // The wheel returns to centre on its own, but slowly: a long bend still
      // has to be held, and a tap still buys a lasting change of direction.
      var back = STEER_RETURN * dt;
      if (Math.abs(car.heading) <= back) car.heading = 0;
      else car.heading -= Math.sign(car.heading) * back;
    }
    car.heading = clamp(car.heading, -MAX_HEADING, MAX_HEADING);
  }

  /**
   * Everyone who is not the player. Aims at the centre of `targetLane`,
   * damped by how fast the car is already crossing the road so it settles
   * instead of weaving.
   */
  function autoSteer(state, car, dt) {
    var curve = state.track.curveAt(car.y);
    var error = laneCenter(car.targetLane) - carX(car);
    var crossing = car.speed * (Math.sin(car.heading) - curve * Math.cos(car.heading));
    var correction = clamp(error * AI_STEER_GAIN - crossing * AI_STEER_DAMP, -0.5, 0.5);
    var desired = clamp(Math.atan(curve) + correction, -MAX_HEADING, MAX_HEADING);
    var rate = STEER_RATE * 1.5 * dt;   // steadier hands than a thumb on glass
    car.heading += clamp(desired - car.heading, -rate, rate);
  }

  // -------------------------------------------------------------------------
  // Opponent AI
  // -------------------------------------------------------------------------

  /**
   * Opponents drive to their top speed, look ahead in their own lane, and move
   * over when something slower is in the way.
   *
   * Importantly this considers *every* car, the player included. The previous
   * version only looked at traffic, so opponents would drive straight through
   * the player and change lanes into them.
   */
  function driveOpponent(state, car, dt) {
    car.throttle = 1;
    car.braking = false;
    if (car.laneCooldown > 0) car.laneCooldown -= dt;

    var reach = 140 + car.speed * 1.4;
    var blocker = null;
    for (var i = 0; i < state.cars.length; i++) {
      var other = state.cars[i];
      if (other === car || other.finished) continue;
      var gap = other.y - car.y;
      if (gap <= 0 || gap > reach) continue;
      if (Math.abs(carX(other) - carX(car)) > (other.width + car.width) / 2 + 12) continue;
      if (!blocker || other.y < blocker.y) blocker = other;
    }

    if (!blocker) return;

    // Try to go around, preferring the side with room.
    if (car.laneCooldown <= 0 && car.lane === car.targetLane) {
      var options = [];
      if (car.lane > 0) options.push(car.lane - 1);
      if (car.lane < LANES - 1) options.push(car.lane + 1);
      // A more skilled driver checks a longer gap before pulling out.
      var margin = 60 + car.skill * 120;
      for (var o = 0; o < options.length; o++) {
        if (laneIsClear(state, car, options[o], margin, car.length)) {
          car.targetLane = options[o];
          car.laneCooldown = 0.8;
          return;
        }
      }
    }

    // Boxed in: match the blocker's speed rather than ram it.
    if (car.speed > blocker.speed) {
      car.throttle = 0;
      car.braking = blocker.y - car.y < car.length * 1.2;
    }
  }

  // -------------------------------------------------------------------------
  // Collisions
  // -------------------------------------------------------------------------

  /**
   * Resolve every overlapping pair, whatever kind of car they are.
   *
   * The old build checked the player against traffic and opponents against
   * traffic, and nothing else, so the player and the opponents passed straight
   * through each other. Working over the whole list means that cannot recur.
   */
  function resolveCollisions(state) {
    // Two passes: separating one pair can push a car into a third, and a single
    // pass leaves cars visibly interpenetrating whenever traffic bunches up.
    for (var pass = 0; pass < 2; pass++) resolvePass(state, pass === 0);
  }

  function resolvePass(state, report) {
    var cars = state.cars;
    for (var i = 0; i < cars.length; i++) {
      for (var j = i + 1; j < cars.length; j++) {
        var a = cars[i];
        var b = cars[j];
        // A car that has finished is coasting off the end of the track. It is
        // no longer racing and must not become a roadblock on the finish line.
        if (a.finished || b.finished) continue;
        if (!overlaps(a, b)) continue;

        var ahead = a.y >= b.y ? a : b;
        var behind = ahead === a ? b : a;

        var dy = (ahead.length + behind.length) / 2 - (ahead.y - behind.y);
        var dx = (a.width + b.width) / 2 - Math.abs(carX(a) - carX(b));

        // Classify by how the cars are lined up, not by which penetration is
        // smaller. Two cars nose to tail in the same lane overlap fully across
        // their width, so the raw penetrations tie and a rear-end would be
        // mistaken for a side-swipe.
        var lateralGap = Math.abs(carX(a) - carX(b));
        var sameLine = lateralGap < (a.width + b.width) / 4;

        if (sameLine) {
          // Rear-end: push apart along the road. You cannot drive through the
          // car in front, so at the very least you inherit its speed.
          behind.y -= dy * 0.6;
          ahead.y += dy * 0.4;
          var closing = behind.speed - ahead.speed;
          if (closing > 0) {
            behind.speed = ahead.speed;
            if (closing > NUDGE_SPEED) {
              // A real shunt: bounced, and briefly unable to get back on the
              // power. Anything gentler is just tucking in behind.
              behind.speed = ahead.speed * COLLISION_BUMP;
              behind.crashCooldown = Math.max(behind.crashCooldown, 0.35);
              if (report) {
                state.events.push({ type: 'crash', a: behind.id, b: ahead.id, severity: 'rear' });
              }
            }
          }
        } else {
          // Side-swipe: shove them apart across the road.
          var dir = carX(a) < carX(b) ? -1 : 1;
          a.lateral += dir * dx * 0.5;
          b.lateral -= dir * dx * 0.5;
          a.speed *= 0.92;
          b.speed *= 0.92;
          if (report) state.events.push({ type: 'crash', a: a.id, b: b.id, severity: 'side' });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step
  // -------------------------------------------------------------------------

  function positionOf(state, car) {
    var ahead = 1;
    for (var i = 0; i < state.cars.length; i++) {
      var other = state.cars[i];
      if (other === car || other.kind === 'traffic') continue;
      if (other.finished && !car.finished) ahead++;
      else if (!other.finished && !car.finished && other.y > car.y) ahead++;
      else if (other.finished && car.finished && other.finishTime < car.finishTime) ahead++;
    }
    return ahead;
  }

  /** Advance the whole race by `dt` seconds. */
  function step(state, dt) {
    if (dt > 0.05) dt = 0.05;         // a backgrounded tab must not teleport cars

    if (state.status === 'countdown') {
      state.countdown -= dt;
      if (state.countdown <= 0) {
        state.status = 'racing';
        state.events.push({ type: 'go' });
      }
      return state;
    }
    if (state.status === 'finished') return state;

    state.time += dt;

    for (var i = 0; i < state.racers.length; i++) {
      var racer = state.racers[i];
      if (!racer.finished) driveOpponent(state, racer, dt);
      // Past the line, coast on out of the way. Braking to a halt here parks a
      // stationary car across a lane a few metres beyond the finish, and the
      // rest of the field piles into it.
      else { racer.throttle = 0.4; racer.braking = false; }
    }
    for (var t = 0; t < state.traffic.length; t++) {
      var tc = state.traffic[t];
      tc.throttle = tc.speed < tc.topSpeed ? 1 : 0;
    }

    if (state.track.steering) {
      for (var h = 0; h < state.cars.length; h++) {
        var driver = state.cars[h];
        if (driver === state.player) steerPlayer(driver, dt);
        else autoSteer(state, driver, dt);
      }
    }

    for (var c = 0; c < state.cars.length; c++) driveCar(state, state.cars[c], dt);

    resolveCollisions(state);

    // Finish line.
    var line = state.track.length;
    for (var f = 0; f < state.cars.length; f++) {
      var car = state.cars[f];
      if (car.kind === 'traffic' || car.finished) continue;
      if (car.y >= line) {
        car.finished = true;
        car.finishTime = state.time;
        car.placed = ++state.finishers;
        state.events.push({ type: 'finish', id: car.id, place: car.placed, time: car.finishTime });
        if (car === state.player) state.status = 'finished';
      }
    }

    return state;
  }

  function drainEvents(state) {
    var out = state.events;
    state.events = [];
    return out;
  }

  /** Ask the player's car to change lane. Refused if the lane is occupied. */
  function requestLane(state, dir) {
    var car = state.player;
    // On a track that bends, the way across the road is to steer across it.
    if (state.track.steering) return false;
    if (state.status !== 'racing' || car.finished) return false;
    if (car.lane !== car.targetLane) return false;
    var lane = car.targetLane + dir;
    if (lane < 0 || lane >= LANES) return false;
    if (!laneIsClear(state, car, lane, car.length * 0.9, car.length * 0.6)) return false;
    car.targetLane = lane;
    return true;
  }

  var api = {
    LANES: LANES,
    LANE_WIDTH: LANE_WIDTH,
    ROAD_WIDTH: ROAD_WIDTH,
    SHOULDER: SHOULDER,
    MAX_SPEED: MAX_SPEED,
    laneCenter: laneCenter,
    createTrack: createTrack,
    createCar: createCar,
    createRace: createRace,
    addTraffic: addTraffic,
    removeCar: removeCar,
    carX: carX,
    overlaps: overlaps,
    laneIsClear: laneIsClear,
    driveCar: driveCar,
    driveOpponent: driveOpponent,
    resolveCollisions: resolveCollisions,
    positionOf: positionOf,
    step: step,
    drainEvents: drainEvents,
    requestLane: requestLane,
    setSteer: setSteer,
    steerPlayer: steerPlayer,
    autoSteer: autoSteer,
    normaliseLane: normaliseLane,
    MAX_HEADING: MAX_HEADING,
    STEER_RATE: STEER_RATE,
    STEER_RETURN: STEER_RETURN,
  };

  global.RacingEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
