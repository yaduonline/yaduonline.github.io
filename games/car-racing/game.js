/**
 * Car racing UI: canvas rendering, traffic spawning, input and the race loop.
 *
 * The simulation lives in engine.js and knows nothing about pixels. This file
 * owns the camera, draws the bending road and the cars on it, and turns input
 * into engine calls.
 */
(function () {
  'use strict';

  var Engine = globalThis.RacingEngine;
  var Vehicles = globalThis.RacingVehicles;
  var Tracks = globalThis.RacingTracks;

  var STORAGE_KEY = 'car-racing-best-v3';

  // The camera looks a long way up the road; the player sits low on screen so
  // there is room to read the traffic ahead.
  var PLAYER_SCREEN_FRAC = 0.78;
  // Where the player sits once the race is over. The result panel is anchored to
  // the bottom of the stage, which is exactly where the car is while racing, so
  // the camera eases up the screen to keep the finish itself in view.
  var FINISHED_SCREEN_FRAC = 0.34;
  var cameraFrac = PLAYER_SCREEN_FRAC;
  // World units of road that must stay visible ahead of the player. Raised with
  // the pace, but only enough to keep a short wide window playable: zooming out
  // to buy reaction time also takes away the sense of speed it was bought for,
  // and on a phone the width still binds, so the view there is unchanged.
  var MIN_VIEW_AHEAD = 800;
  var VIEW_DEPTH = 2600;          // world units visible ahead of the player

  // ------------------------------------------------------------------- props
  //
  // Each prop draws centred on the origin, sized in pixels. They are lit from
  // the same side as the cars, and every one carries a drop shadow: on a flat
  // fill of ground colour, the shadow is most of what makes the thing read as
  // an object at all rather than a stain.

  function propShadow(ctx, r, squash) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(r * 0.3, r * 0.26, r, r * (squash || 0.92), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A round canopy seen from above: dark rim, lit crown, a hint of branch. */
  function propTree(ctx, r, prop) {
    propShadow(ctx, r);
    ctx.fillStyle = prop.shade;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = prop.color;
    ctx.beginPath(); ctx.arc(-r * 0.13, -r * 0.15, r * 0.76, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.arc(-r * 0.26, -r * 0.3, r * 0.36, 0, Math.PI * 2); ctx.fill();
  }

  /** Conifer: a tighter, darker crown with radial gaps in it. */
  function propConifer(ctx, r, prop) {
    propShadow(ctx, r * 0.92);
    ctx.fillStyle = prop.shade;
    ctx.beginPath();
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * Math.PI * 2;
      var rr = i % 2 ? r * 0.72 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    // Lit crown, kept close to the rim in tone. Pushed further apart it stops
    // reading as a tree and starts reading as an eye.
    ctx.fillStyle = prop.color;
    ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.14, r * 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.26, r * 0.24, 0, Math.PI * 2); ctx.fill();
  }

  /** Palm: a trunk with fronds thrown out around it. */
  function propPalm(ctx, r, prop) {
    propShadow(ctx, r * 0.8);
    ctx.strokeStyle = prop.shade;
    ctx.lineWidth = Math.max(1.5, r * 0.2);
    ctx.lineCap = 'round';
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5,
        Math.cos(a + 0.35) * r, Math.sin(a + 0.35) * r);
      ctx.stroke();
    }
    ctx.strokeStyle = prop.color;
    ctx.lineWidth = Math.max(1, r * 0.12);
    for (var j = 0; j < 7; j++) {
      var b = (j / 7) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(b) * r * 0.5, Math.sin(b) * r * 0.5,
        Math.cos(b + 0.35) * r * 0.9, Math.sin(b + 0.35) * r * 0.9);
      ctx.stroke();
    }
    ctx.fillStyle = '#6b4f31';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  }

  /** Rock: an angular lump, lit on one side. */
  function propRock(ctx, r, prop) {
    propShadow(ctx, r * 0.85, 0.7);
    ctx.beginPath();
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI * 2;
      var rr = r * (0.72 + ((i * 37) % 11) / 26);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.86);
    }
    ctx.closePath();
    ctx.fillStyle = prop.shade;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-r * 0.16, -r * 0.2, r * 0.52, r * 0.4, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = prop.color;
    ctx.fill();
  }

  /** Bush: a clump of small blobs. */
  function propBush(ctx, r, prop) {
    propShadow(ctx, r * 0.9, 0.8);
    ctx.fillStyle = prop.shade;
    var spots = [[0, 0, 1], [-0.6, 0.2, 0.66], [0.55, 0.28, 0.6], [0.1, -0.6, 0.62]];
    spots.forEach(function (sp) {
      ctx.beginPath(); ctx.arc(sp[0] * r, sp[1] * r, r * sp[2], 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = prop.color;
    ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.2, r * 0.6, 0, Math.PI * 2); ctx.fill();
  }

  /** Cactus: a column with two arms, seen from above. */
  function propCactus(ctx, r, prop) {
    propShadow(ctx, r * 0.55, 0.9);
    ctx.fillStyle = prop.shade;
    Vehicles.roundedRect(ctx, -r * 0.62, -r * 0.22, r * 1.24, r * 0.44, r * 0.2); ctx.fill();
    Vehicles.roundedRect(ctx, -r * 0.22, -r * 0.62, r * 0.44, r * 1.24, r * 0.2); ctx.fill();
    ctx.fillStyle = prop.color;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill();
  }

  /** A city block: flat roof, parapet, a couple of roof boxes. */
  function propBlock(ctx, r, prop) {
    var w = r * 1.5, h = r * 1.9;
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    Vehicles.roundedRect(ctx, -w / 2 + r * 0.22, -h / 2 + r * 0.2, w, h, r * 0.08);
    ctx.fill();
    ctx.fillStyle = prop.shade;
    Vehicles.roundedRect(ctx, -w / 2, -h / 2, w, h, r * 0.08); ctx.fill();
    ctx.fillStyle = prop.color;
    Vehicles.roundedRect(ctx, -w / 2 + r * 0.12, -h / 2 + r * 0.12,
      w - r * 0.24, h - r * 0.24, r * 0.06);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-w * 0.22, -h * 0.3, w * 0.3, h * 0.22);
    ctx.fillRect(w * 0.02, h * 0.06, w * 0.22, h * 0.16);
  }

  /** Street lamp: post, arm, and a lit head over the road side. */
  function propLamp(ctx, r, prop) {
    propShadow(ctx, r * 0.4, 0.8);
    ctx.fillStyle = prop.shade;
    Vehicles.roundedRect(ctx, -r * 0.16, -r * 0.16, r * 1.5, r * 0.32, r * 0.12);
    ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = prop.color;
    ctx.beginPath(); ctx.ellipse(r * 1.4, 0, r * 0.3, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * Roadside scenery.
   *
   * This is not decoration. In a pseudo-top-down racer with no perspective, the
   * only cues that you are moving at all are things crossing the frame: the lane
   * dashes, the traffic, and whatever is beside the road. On a straight, empty
   * stretch the first two give you almost nothing, and the verge used to be a
   * flat fill with a 4px post every 120 units in a colour barely distinct from
   * the ground - so the game read as stationary.
   *
   * Each scenery gets three layers, in rising order of contrast: ground bands,
   * scattered props, and edge markers right against the tarmac where the eye
   * already is.
   */
  var SCENERY = {
    coast: {
      ground: '#e0cfa4', band: 'rgba(146,120,72,0.13)',
      marker: '#f7f8fa', markerBand: '#d0453c',
      density: 0.72,
      props: [
        { draw: propPalm,  weight: 3, size: [17, 27], color: '#3f7d55', shade: '#2a5740' },
        { draw: propRock,  weight: 3, size: [8, 17],  color: '#c0b088', shade: '#8e805d' },
        { draw: propBush,  weight: 2, size: [7, 13],  color: '#7ba06a', shade: '#55744a' },
      ],
    },
    forest: {
      ground: '#43704a', band: 'rgba(20,48,28,0.16)',
      marker: '#f7f8fa', markerBand: '#d0453c',
      density: 0.88,
      props: [
        { draw: propConifer, weight: 5, size: [15, 28], color: '#2f6640', shade: '#1c4128' },
        { draw: propBush,    weight: 2, size: [8, 15],  color: '#4c8551', shade: '#33603a' },
        { draw: propRock,    weight: 2, size: [8, 15],  color: '#7d8078', shade: '#585b55' },
      ],
    },
    city: {
      ground: '#7f858c', band: 'rgba(40,45,52,0.14)',
      marker: '#f7f8fa', markerBand: '#3a4250',
      density: 0.8,
      props: [
        { draw: propBlock, weight: 4, size: [26, 60], color: '#9aa2ac', shade: '#5d656f' },
        { draw: propBlock, weight: 3, size: [22, 44], color: '#b0a79c', shade: '#6e685f' },
        { draw: propLamp,  weight: 3, size: [9, 12],  color: '#d7dce2', shade: '#4a525c' },
      ],
    },
    desert: {
      ground: '#d5b783', band: 'rgba(150,116,66,0.14)',
      marker: '#f7f8fa', markerBand: '#d0453c',
      density: 0.62,
      props: [
        { draw: propCactus, weight: 3, size: [12, 21], color: '#5c8a52', shade: '#3d6138' },
        { draw: propRock,   weight: 4, size: [9, 20],  color: '#b89a6a', shade: '#8a7048' },
        { draw: propBush,   weight: 2, size: [7, 12],  color: '#9a9358', shade: '#6d683d' },
      ],
    },
    meadow: {
      ground: '#7aa971', band: 'rgba(46,84,44,0.13)',
      marker: '#f7f8fa', markerBand: '#d0453c',
      density: 0.75,
      props: [
        { draw: propTree, weight: 4, size: [16, 27], color: '#4b8a4f', shade: '#326237' },
        { draw: propBush, weight: 3, size: [8, 14],  color: '#679c5c', shade: '#456f3f' },
        { draw: propRock, weight: 1, size: [8, 14],  color: '#9aa08c', shade: '#6f7565' },
      ],
    },
  };

  var el = {};
  var ctx = null;
  var race = null;
  var track = null;
  var scenery = SCENERY.meadow;
  var scale = 1;                  // pixels per world unit
  var lastFrame = 0;
  var running = false;
  var best = null;
  var nextTrafficY = 0;
  var trafficSeq = 0;
  var shake = 0;
  var blink = 0;
  var held = { accel: false, brake: false, steer: 0 };

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (err) {
      return {};
    }
  }

  function saveBest(map) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (err) {
      /* private browsing: no persistence, but the race still runs */
    }
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  /**
   * Fit the canvas to its container and pick a scale that shows the whole road
   * with a margin of scenery either side, so bends have somewhere to go.
   */
  function layout() {
    var rect = el.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);

    el.canvas.style.width = rect.width + 'px';
    el.canvas.style.height = rect.height + 'px';
    el.canvas.width = Math.round(rect.width * ratio);
    el.canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Show the road plus roughly a lane of verge on each side...
    var visibleWidth = Engine.ROAD_WIDTH + Engine.LANE_WIDTH * 2.4;
    var byWidth = rect.width / visibleWidth;
    // ...but never so close in that there is no road left to read. On a short,
    // wide stage - a phone on its side, or a desktop window - scaling to the
    // width alone leaves about two car lengths of warning, which is not enough
    // time to react to anything. Letterboxing the road is the better trade.
    var byHeight = (rect.height * PLAYER_SCREEN_FRAC) / MIN_VIEW_AHEAD;
    scale = Math.min(byWidth, byHeight);
    el.canvas.dataset.w = String(rect.width);
    el.canvas.dataset.h = String(rect.height);
  }

  function viewSize() {
    return {
      w: Number(el.canvas.dataset.w) || el.canvas.width,
      h: Number(el.canvas.dataset.h) || el.canvas.height,
    };
  }

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  /** Screen y for a world y, given where the player is. */
  function screenY(worldY, view) {
    var baseY = view.h * cameraFrac;
    return baseY - (worldY - race.player.y) * scale;
  }

  /** Screen x for a point at (worldX across the road) at this worldY. */
  function screenX(worldX, worldY, view) {
    var bend = track.offsetAt(worldY) - track.offsetAt(race.player.y);
    return view.w / 2 + (worldX + bend) * scale;
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  function drawRoad(view) {
    // Derive the ribbon's extent from the canvas rather than fixing it, because
    // the camera moves up the screen at the finish and a fixed margin behind the
    // player then runs out mid-screen, leaving the road ending in mid air.
    var behind = (view.h * (1 - cameraFrac)) / scale + 60;
    var infront = (view.h * cameraFrac) / scale + 60;
    var top = race.player.y + Math.max(VIEW_DEPTH, infront);
    var bottom = race.player.y - behind;
    var stepY = 14 / scale;

    // Verge: flat ground, then banding, then props. All of it is motion cue.
    ctx.fillStyle = scenery.ground;
    ctx.fillRect(0, 0, view.w, view.h);
    drawGroundBands(view, bottom, top);
    drawProps(view, bottom, top);

    // Road surface, built as a ribbon that follows the bend.
    var half = Engine.ROAD_WIDTH / 2 + Engine.SHOULDER;
    ctx.beginPath();
    var y;
    for (y = top; y >= bottom; y -= stepY) {
      ctx.lineTo(screenX(-half, y, view), screenY(y, view));
    }
    for (y = bottom; y <= top; y += stepY) {
      ctx.lineTo(screenX(half, y, view), screenY(y, view));
    }
    ctx.closePath();
    ctx.fillStyle = '#4b4f55';
    ctx.fill();

    // Shoulder lines
    ctx.lineWidth = Math.max(1.5, 4 * scale);
    ctx.strokeStyle = '#eceff2';
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      for (y = top; y >= bottom; y -= stepY) {
        ctx.lineTo(screenX(side * (Engine.ROAD_WIDTH / 2), y, view), screenY(y, view));
      }
      ctx.stroke();
    });

    // Dashed lane separators
    ctx.setLineDash([26 * scale, 22 * scale]);
    ctx.lineWidth = Math.max(1, 3 * scale);
    ctx.strokeStyle = 'rgba(240,243,246,0.72)';
    for (var lane = 1; lane < Engine.LANES; lane++) {
      var x = Engine.laneCenter(lane) - Engine.LANE_WIDTH / 2;
      ctx.beginPath();
      for (y = top; y >= bottom; y -= stepY) {
        ctx.lineTo(screenX(x, y, view), screenY(y, view));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    drawEdgeMarkers(view, bottom, top, half);
  }

  /**
   * Transverse banding on the ground. Cheap, and it covers the case the props
   * cannot: it is continuous, so there is never a stretch of road with nothing
   * moving past. Drawn as sheared quads spanning the full width, which the road
   * ribbon is then painted over.
   */
  function drawGroundBands(view, bottom, top) {
    var spacing = 150;
    var thickness = 74;
    var base = track.offsetAt(race.player.y);
    ctx.fillStyle = scenery.band;
    var first = Math.floor(bottom / spacing) * spacing;
    for (var y = first; y < top; y += spacing) {
      var y0 = y;
      var y1 = y + thickness;
      var sy0 = screenY(y0, view);
      var sy1 = screenY(y1, view);
      if (sy1 > view.h + 4 || sy0 < -4) continue;
      var dx0 = (track.offsetAt(y0) - base) * scale;
      var dx1 = (track.offsetAt(y1) - base) * scale;
      ctx.beginPath();
      ctx.moveTo(dx0 - view.w, sy0);
      ctx.lineTo(dx0 + view.w * 2, sy0);
      ctx.lineTo(dx1 + view.w * 2, sy1);
      ctx.lineTo(dx1 - view.w, sy1);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Stable pseudo-random in [0,1) for a seed. Props must not shimmer. */
  function noise(seed) {
    var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /**
   * Scattered roadside objects. Placement is a hash of the slot index rather
   * than anything random, so a tree stays exactly where it is instead of
   * flickering into a different one each frame.
   *
   * How far out they can go depends on the viewport: on a phone only about a
   * lane's width of verge is visible either side, on a wide window far more.
   */
  function drawProps(view, bottom, top) {
    var spacing = 82;
    var inner = Engine.ROAD_WIDTH / 2 + Engine.SHOULDER + 14;
    // Only as far out as the screen actually reaches. Scattering props into
    // world space that is never drawn just thins out the verge you can see.
    var outer = Math.max(inner + 26, (view.w / 2) / scale);
    var table = scenery.props;
    var totalWeight = 0;
    for (var w = 0; w < table.length; w++) totalWeight += table[w].weight;

    // One prop per slot fills a phone's narrow verge but leaves a wide window
    // looking empty, so the count follows how much verge there is to fill. Each
    // gets its own band across the verge, which keeps them from clumping.
    var perSide = Math.max(1, Math.round((outer - inner) / 150));
    var bandWidth = (outer - inner) / perSide;

    var first = Math.floor(bottom / spacing);
    var last = Math.ceil(top / spacing);
    for (var i = first; i <= last; i++) {
      for (var side = -1; side <= 1; side += 2) {
        for (var k = 0; k < perSide; k++) {
          var seed = (i * 2 + (side > 0 ? 1 : 0)) * 17 + k * 131;
          if (noise(seed) > scenery.density) continue;

          var alongJitter = noise(seed + 0.41);
          var across = noise(seed + 0.77);
          var sizeRoll = noise(seed + 0.19);
          var typeRoll = noise(seed + 0.53) * totalWeight;

          var prop = table[table.length - 1];
          for (var t = 0; t < table.length; t++) {
            typeRoll -= table[t].weight;
            if (typeRoll <= 0) { prop = table[t]; break; }
          }

          var wy = (i + alongJitter) * spacing;
          // The nearest band is biased towards the road: what passes closest to
          // the eye is what sells the speed.
          var offset = k === 0 ? across * across * bandWidth : across * bandWidth;
          var wx = side * (inner + k * bandWidth + offset);
          var sy = screenY(wy, view);
          var r = (prop.size[0] + (prop.size[1] - prop.size[0]) * sizeRoll) * scale;
          if (sy < -r * 4 || sy > view.h + r * 4) continue;
          var sx = screenX(wx, wy, view);
          if (sx < -r * 4 || sx > view.w + r * 4) continue;

          ctx.save();
          ctx.translate(sx, sy);
          prop.draw(ctx, r, prop);
          ctx.restore();
        }
      }
    }
  }

  /**
   * Marker posts right against the tarmac. These are the strongest cue of the
   * three because they are where the eye already is, they are evenly spaced so
   * the rate is readable, and they are white against every ground colour.
   */
  function drawEdgeMarkers(view, bottom, top, half) {
    var spacing = 78;
    var first = Math.floor(bottom / spacing) * spacing;
    var postW = Math.max(2, 5 * scale);
    var postH = Math.max(6, 20 * scale);
    for (var y = first; y < top; y += spacing) {
      var sy = screenY(y, view);
      if (sy < -postH || sy > view.h + postH) continue;
      for (var side = -1; side <= 1; side += 2) {
        var sx = screenX(side * (half + 15), y, view);
        if (sx < -postW * 3 || sx > view.w + postW * 3) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(sx - postW / 2 + postW * 0.4, sy - postH / 2 + postW * 0.4, postW, postH);
        ctx.fillStyle = scenery.marker;
        ctx.fillRect(sx - postW / 2, sy - postH / 2, postW, postH);
        ctx.fillStyle = scenery.markerBand;
        ctx.fillRect(sx - postW / 2, sy - postH / 2, postW, postH * 0.34);
      }
    }
  }

  function drawFinishLine(view) {
    var y = track.length;
    var sy = screenY(y, view);
    if (sy < -60 || sy > view.h + 60) return;
    var half = Engine.ROAD_WIDTH / 2;
    var squares = 12;
    var cellW = (Engine.ROAD_WIDTH / squares) * scale;
    var cellH = 14 * scale;
    for (var i = 0; i < squares; i++) {
      for (var row = 0; row < 2; row++) {
        ctx.fillStyle = (i + row) % 2 ? '#1c1f24' : '#f7f7f7';
        var wx = -half + (i * Engine.ROAD_WIDTH) / squares;
        ctx.fillRect(screenX(wx, y, view), sy + row * cellH - cellH, cellW + 1, cellH);
      }
    }
  }

  function drawCars(view) {
    // Far cars first so nearer ones overlap them correctly.
    var sorted = race.cars.slice().sort(function (a, b) { return b.y - a.y; });
    for (var i = 0; i < sorted.length; i++) {
      var car = sorted[i];
      var sy = screenY(car.y, view);
      if (sy < -200 || sy > view.h + 200) continue;
      var sx = screenX(Engine.carX(car), car.y, view);

      // On a bending track the car really has a heading, so draw it. Seeing
      // your own car point across the road is the whole feedback loop for
      // steering. On the straight track there is nothing to point at, so fall
      // back to a token lean towards whichever lane the car is moving to.
      var heading = track.steering
        ? car.heading
        : (car.targetLane - car.lane) * 0.12;

      Vehicles.drawVehicle(ctx, car.type, sx, sy, scale, {
        heading: heading,
        blink: car.type === 'police' ? (blink % 1) : 0,
        braking: car.braking,
      });

      if (car.kind === 'racer' || car.kind === 'player') {
        ctx.fillStyle = 'rgba(18,22,26,0.72)';
        ctx.font = Math.round(11 * Math.max(0.8, scale * 1.4)) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        var label = car === race.player ? 'YOU' : car.id.toUpperCase();
        var lw = ctx.measureText(label).width + 10;
        Vehicles.roundedRect(ctx, sx - lw / 2, sy - 78 * scale, lw, 16, 5);
        ctx.fill();
        ctx.fillStyle = '#f2f5f8';
        ctx.fillText(label, sx, sy - 78 * scale + 12);
      }
    }
  }

  function draw() {
    if (!race || !ctx) return;
    var view = viewSize();

    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawRoad(view);
    drawFinishLine(view);
    drawCars(view);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Traffic
  // -------------------------------------------------------------------------

  var TRAFFIC_MIX = [
    { type: 'sedan',  weight: 22, speed: [174, 234] },
    { type: 'hatch',  weight: 18, speed: [165, 225] },
    { type: 'suv',    weight: 14, speed: [168, 222] },
    { type: 'taxi',   weight: 10, speed: [180, 240] },
    { type: 'van',    weight: 9,  speed: [144, 192] },
    { type: 'bike',   weight: 9,  speed: [210, 285] },
    { type: 'police', weight: 5,  speed: [216, 276] },
    { type: 'truck',  weight: 7,  speed: [120, 162] },
    { type: 'bus',    weight: 6,  speed: [114, 156] },
  ];

  function pickTrafficType() {
    var total = 0;
    for (var i = 0; i < TRAFFIC_MIX.length; i++) total += TRAFFIC_MIX[i].weight;
    var roll = Math.random() * total;
    for (var j = 0; j < TRAFFIC_MIX.length; j++) {
      roll -= TRAFFIC_MIX[j].weight;
      if (roll <= 0) return TRAFFIC_MIX[j];
    }
    return TRAFFIC_MIX[0];
  }

  /**
   * Would this car still leave at least one lane clear through its stretch of
   * road? Checked over a window long enough to hold the longest vehicle plus
   * the room a car needs to get by.
   */
  function leavesAWayThrough(candidate) {
    var window = 780;
    for (var lane = 0; lane < Engine.LANES; lane++) {
      var open = true;
      if (lane === candidate.lane) continue;
      for (var i = 0; i < race.cars.length; i++) {
        var other = race.cars[i];
        if (other.kind !== 'traffic') continue;
        if (Math.abs(other.y - candidate.y) < (other.length + candidate.length) / 2 + window) {
          if (other.lane === lane) { open = false; break; }
        }
      }
      if (open) return true;
    }
    return false;
  }

  /** Keep the road ahead populated, and retire anything well behind. */
  function updateTraffic() {
    var ahead = race.player.y + VIEW_DEPTH + 400;
    var density = track.trafficDensity;

    while (nextTrafficY < ahead) {
      var gap = (720 + Math.random() * 1020) / Math.max(0.35, density);
      nextTrafficY += gap;
      if (nextTrafficY > track.length + 200) break;

      var pick = pickTrafficType();
      var spec = Vehicles.VEHICLES[pick.type];
      var lane = Math.floor(Math.random() * Engine.LANES);
      var speed = pick.speed[0] + Math.random() * (pick.speed[1] - pick.speed[0]);

      var candidate = {
        id: 'traffic' + (trafficSeq++),
        type: pick.type, lane: lane, y: nextTrafficY,
        speed: speed, length: spec.length, width: spec.width,
      };
      // Do not drop a car on top of something already there.
      var probe = Engine.createCar(candidate);
      var clash = false;
      for (var i = 0; i < race.cars.length; i++) {
        if (Engine.overlaps(probe, race.cars[i])) { clash = true; break; }
      }
      // And never seal the road. Traffic dense enough to fill every lane across
      // one stretch is not a challenge, it is a wall: the field piles into it
      // and the race stops. Spawn only if some lane stays open through here.
      if (!clash && !leavesAWayThrough(candidate)) clash = true;
      if (!clash) Engine.addTraffic(race, candidate);
    }

    for (var t = race.traffic.length - 1; t >= 0; t--) {
      if (race.traffic[t].y < race.player.y - 2100) Engine.removeCar(race, race.traffic[t]);
    }
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function formatTime(seconds) {
    if (seconds === null || seconds === undefined) return '--';
    var m = Math.floor(seconds / 60);
    var s = seconds - m * 60;
    return m > 0 ? m + ':' + (s < 10 ? '0' : '') + s.toFixed(1) : s.toFixed(1) + 's';
  }

  function updateHud() {
    if (!race) return;
    setText(el.speed, Math.round(race.player.speed) + '');
    setText(el.position, Engine.positionOf(race, race.player) + '/' + (race.racers.length + 1));
    setText(el.time, formatTime(race.status === 'countdown' ? null : race.time));
    var pct = Math.max(0, Math.min(1, race.player.y / track.length));
    if (el.progressFill) el.progressFill.style.width = (pct * 100).toFixed(1) + '%';
  }

  function announce(message) {
    if (el.live) el.live.textContent = message;
  }

  // -------------------------------------------------------------------------
  // Race flow
  // -------------------------------------------------------------------------

  function startRace(trackId) {
    var spec = null;
    for (var i = 0; i < Tracks.TRACKS.length; i++) {
      if (Tracks.TRACKS[i].id === trackId) spec = Tracks.TRACKS[i];
    }
    if (!spec) spec = Tracks.TRACKS[0];

    track = Engine.createTrack(spec);
    scenery = SCENERY[spec.scenery] || SCENERY.meadow;
    race = Engine.createRace({ track: track });
    nextTrafficY = 1500;
    trafficSeq = 0;
    shake = 0;
    cameraFrac = PLAYER_SCREEN_FRAC;
    held.steer = 0;
    held.accel = false;
    held.brake = false;

    el.hints.textContent = track.steering
      ? 'Arrows or WASD — hold left/right to steer through the bends, up accelerates, down brakes'
      : 'Arrows or WASD — left/right change lane, up accelerates, down brakes';
    el.btnLeft.setAttribute('aria-label', track.steering ? 'Steer left' : 'Move left');
    el.btnRight.setAttribute('aria-label', track.steering ? 'Steer right' : 'Move right');

    el.trackName.textContent = spec.name;
    el.menu.hidden = true;
    el.result.hidden = true;
    el.stage.hidden = false;
    el.hud.hidden = false;
    el.controls.hidden = false;
    if (el.hints) el.hints.hidden = false;

    layout();
    updateTraffic();
    updateHud();
    setText(el.countdown, '3');
    el.countdown.hidden = false;
    announce(spec.name + '. Get ready.');

    lastFrame = 0;
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  function finishRace() {
    var player = race.player;
    var bestMap = loadBest();
    var previous = bestMap[track.id];
    var isBest = previous === undefined || player.finishTime < previous;
    if (isBest) {
      bestMap[track.id] = player.finishTime;
      saveBest(bestMap);
    }

    el.resultPlace.textContent = 'P' + player.placed;
    el.resultDetail.textContent =
      formatTime(player.finishTime) +
      (isBest ? ' — new best' : previous !== undefined
        ? ' — best ' + formatTime(previous) : '');
    el.result.hidden = false;
    // Nothing left to steer, and the pad would sit under the result panel.
    el.controls.hidden = true;
    if (el.hints) el.hints.hidden = true;
    announce('Finished ' + player.placed + ' of ' + (race.racers.length + 1) +
      ' in ' + formatTime(player.finishTime) + '.');
  }

  function handleEvents() {
    var events = Engine.drainEvents(race);
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (event.type === 'crash') {
        if (event.a === 'player' || event.b === 'player') {
          shake = event.severity === 'rear' ? 9 : 5;
        }
      } else if (event.type === 'go') {
        el.countdown.hidden = true;
        announce('Go.');
      } else if (event.type === 'finish' && event.id === 'player') {
        finishRace();
      }
    }
  }

  function frame(time) {
    var delta = lastFrame ? (time - lastFrame) / 1000 : 0.016;
    lastFrame = time;
    if (delta > 0.05) delta = 0.05;
    blink += delta * 3;

    if (race) {
      race.player.throttle = held.accel ? 1 : 0;
      race.player.braking = held.brake;
      Engine.setSteer(race, held.steer);
      // Coasting still creeps forward, which keeps the game moving on touch.
      if (!held.accel && !held.brake && race.status === 'racing') {
        race.player.throttle = 0.35;
      }

      Engine.step(race, delta);
      handleEvents();
      updateTraffic();
      updateHud();

      if (race.status === 'countdown') {
        var n = Math.ceil(race.countdown - 0.2);
        setText(el.countdown, n > 0 ? String(n) : 'GO');
      }

      if (shake > 0) shake = Math.max(0, shake - delta * 26);
      var wantFrac = race.status === 'finished' ? FINISHED_SCREEN_FRAC : PLAYER_SCREEN_FRAC;
      cameraFrac += (wantFrac - cameraFrac) * Math.min(1, delta * 3.2);
      draw();
    }
    requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  /**
   * Left and right mean different things depending on the track.
   *
   * On the one dead straight track they are lane buttons: press, and the car
   * moves over. On a track that bends they are the wheel, held for as long as
   * you want the car turning, because following the road is the game there.
   */
  function steer(dir, down) {
    if (!race) return;
    if (track && track.steering) {
      if (down) held.steer = dir;
      else if (held.steer === dir) held.steer = 0;
    } else if (down) {
      Engine.requestLane(race, dir);
    }
  }

  function bindHold(button, onDown, onUp) {
    button.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      button.setPointerCapture && button.setPointerCapture(event.pointerId);
      onDown();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
      button.addEventListener(name, function () { onUp(); });
    });
  }

  function onKeyDown(event) {
    if (!race) return;
    var key = event.key;
    if (key === 'ArrowLeft' || key === 'a') { event.preventDefault(); steer(-1, true); }
    else if (key === 'ArrowRight' || key === 'd') { event.preventDefault(); steer(1, true); }
    else if (key === 'ArrowUp' || key === 'w') { event.preventDefault(); held.accel = true; }
    else if (key === 'ArrowDown' || key === 's') { event.preventDefault(); held.brake = true; }
  }

  function onKeyUp(event) {
    var key = event.key;
    if (key === 'ArrowUp' || key === 'w') held.accel = false;
    if (key === 'ArrowDown' || key === 's') held.brake = false;
    if (key === 'ArrowLeft' || key === 'a') steer(-1, false);
    if (key === 'ArrowRight' || key === 'd') steer(1, false);
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  function buildMenu() {
    var bestMap = loadBest();
    el.trackList.innerHTML = '';
    Tracks.TRACKS.forEach(function (spec) {
      var button = document.createElement('button');
      button.className = 'track';
      button.type = 'button';
      var bestTime = bestMap[spec.id];
      button.innerHTML =
        '<span class="track-name">' + spec.name + '</span>' +
        '<span class="track-desc">' + spec.description + '</span>' +
        '<span class="track-best">' +
        (bestTime !== undefined ? 'Best ' + formatTime(bestTime) : 'Not raced yet') +
        '</span>';
      button.addEventListener('click', function () { startRace(spec.id); });
      el.trackList.appendChild(button);
    });
  }

  function showMenu() {
    el.menu.hidden = false;
    el.result.hidden = true;
    el.stage.hidden = true;
    el.hud.hidden = true;
    el.controls.hidden = true;
    if (el.hints) el.hints.hidden = true;
    buildMenu();
  }

  function collect() {
    [
      'stage', 'canvas', 'hud', 'speed', 'position', 'time', 'progressFill',
      'trackName', 'countdown', 'menu', 'trackList', 'result', 'resultPlace',
      'resultDetail', 'btnAgain', 'btnMenu', 'controls', 'hints', 'btnLeft', 'btnRight',
      'btnAccel', 'btnBrake', 'live',
    ].forEach(function (name) {
      el[name] = document.getElementById(name);
    });
  }

  function boot() {
    collect();
    if (!Engine || !Vehicles || !Tracks || !el.canvas) return;
    ctx = el.canvas.getContext('2d');
    best = loadBest();

    // Bound as holds, not taps: on a bending track the button is the wheel and
    // has to stay down. On the straight track only the press is acted on.
    bindHold(el.btnLeft,
      function () { steer(-1, true); },
      function () { steer(-1, false); });
    bindHold(el.btnRight,
      function () { steer(1, true); },
      function () { steer(1, false); });
    bindHold(el.btnAccel,
      function () { held.accel = true; },
      function () { held.accel = false; });
    bindHold(el.btnBrake,
      function () { held.brake = true; },
      function () { held.brake = false; });

    el.btnAgain.addEventListener('click', function () { startRace(track.id); });
    el.btnMenu.addEventListener('click', showMenu);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () { layout(); draw(); }).observe(el.stage);
    } else {
      window.addEventListener('resize', function () { layout(); draw(); });
    }

    showMenu();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
