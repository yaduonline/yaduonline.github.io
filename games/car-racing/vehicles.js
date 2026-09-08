/**
 * Vehicle artwork.
 *
 * Every vehicle is drawn on a canvas in its own local space: the origin is the
 * centre of the car and it points up the screen, so the caller only has to
 * translate. Sizes are in world units and match the collision boxes the engine
 * uses, so what you see is what you hit.
 *
 * The shapes are built from curves rather than stacked rectangles, which is
 * what lets a hatchback read differently from a saloon at a glance even when
 * both are forty pixels tall.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- helpers

  function shade(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amount > 0) {
      r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount;
    } else {
      r *= (1 + amount); g *= (1 + amount); b *= (1 + amount);
    }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }

  function roundedRect(ctx, x, y, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  /**
   * The body outline. `nose` and `tail` pinch the front and rear in as a
   * fraction of the width, which is most of what separates a wedge-shaped
   * sports car from a boxy van.
   */
  function bodyPath(ctx, w, l, nose, tail) {
    var hw = w / 2, hl = l / 2;
    var fw = hw * nose, rw = hw * tail;
    ctx.beginPath();
    ctx.moveTo(-fw, -hl);
    ctx.bezierCurveTo(-hw, -hl * 0.62, -hw, hl * 0.3, -rw, hl);
    ctx.lineTo(rw, hl);
    ctx.bezierCurveTo(hw, hl * 0.3, hw, -hl * 0.62, fw, -hl);
    ctx.closePath();
  }

  function wheels(ctx, w, l, opts) {
    var o = opts || {};
    var tyreW = o.tyreW || w * 0.17;
    var tyreL = o.tyreL || l * 0.19;
    var inset = o.inset === undefined ? 0.52 : o.inset;
    var frontAt = o.frontAt === undefined ? -l * 0.28 : o.frontAt;
    var rearAt = o.rearAt === undefined ? l * 0.28 : o.rearAt;
    ctx.fillStyle = '#15181c';
    [frontAt, rearAt].forEach(function (cy) {
      roundedRect(ctx, -w * inset, cy - tyreL / 2, tyreW, tyreL, tyreW * 0.35);
      ctx.fill();
      roundedRect(ctx, w * inset - tyreW, cy - tyreL / 2, tyreW, tyreL, tyreW * 0.35);
      ctx.fill();
    });
  }

  /**
   * Body fill. The highlight is deliberately restrained: a strong centre
   * gradient turns a car into a plastic capsule at these sizes, which is what
   * the first pass looked like.
   */
  function paintBody(ctx, w, l, color) {
    var grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    grad.addColorStop(0, shade(color, -0.3));
    grad.addColorStop(0.32, shade(color, 0.02));
    grad.addColorStop(0.52, shade(color, 0.1));
    grad.addColorStop(0.78, shade(color, -0.04));
    grad.addColorStop(1, shade(color, -0.33));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.stroke();
  }

  /**
   * The greenhouse: windscreen, roof and rear window as one connected mass.
   * Reading a top-down car depends almost entirely on this - a single small
   * rectangle of glass is what made the first attempt look like a bar of soap.
   */
  function cabin(ctx, w, l, opts) {
    var o = opts || {};
    var front = o.front === undefined ? -l * 0.22 : o.front;
    var back = o.back === undefined ? l * 0.28 : o.back;
    var roofW = (o.roofW === undefined ? 0.6 : o.roofW) * w;
    var glassW = (o.glassW === undefined ? 0.72 : o.glassW) * w;
    var screen = (back - front) * (o.screen === undefined ? 0.3 : o.screen);

    // Dark cabin mass, pinched at the roof and flared at the screens.
    ctx.beginPath();
    ctx.moveTo(-glassW / 2, front + screen);
    ctx.lineTo(-roofW / 2, front + screen * 0.15);
    ctx.lineTo(roofW / 2, front + screen * 0.15);
    ctx.lineTo(glassW / 2, front + screen);
    ctx.lineTo(glassW / 2, back - screen);
    ctx.lineTo(roofW / 2, back - screen * 0.15);
    ctx.lineTo(-roofW / 2, back - screen * 0.15);
    ctx.lineTo(-glassW / 2, back - screen);
    ctx.closePath();
    ctx.fillStyle = 'rgba(24,31,40,0.92)';
    ctx.fill();

    // Windscreen, angled so the front of the car is obvious.
    var wsGrad = ctx.createLinearGradient(0, front, 0, front + screen);
    wsGrad.addColorStop(0, 'rgba(176,204,224,0.95)');
    wsGrad.addColorStop(1, 'rgba(96,126,150,0.9)');
    ctx.beginPath();
    ctx.moveTo(-glassW / 2 + w * 0.02, front + screen);
    ctx.lineTo(-roofW / 2 + w * 0.02, front + screen * 0.2);
    ctx.lineTo(roofW / 2 - w * 0.02, front + screen * 0.2);
    ctx.lineTo(glassW / 2 - w * 0.02, front + screen);
    ctx.closePath();
    ctx.fillStyle = wsGrad;
    ctx.fill();

    // Rear screen, dimmer.
    ctx.beginPath();
    ctx.moveTo(-glassW / 2 + w * 0.02, back - screen);
    ctx.lineTo(-roofW / 2 + w * 0.02, back - screen * 0.2);
    ctx.lineTo(roofW / 2 - w * 0.02, back - screen * 0.2);
    ctx.lineTo(glassW / 2 - w * 0.02, back - screen);
    ctx.closePath();
    ctx.fillStyle = 'rgba(120,146,168,0.75)';
    ctx.fill();

    // Roof panel, tinted with the body colour so it does not read as a hole. It
    // spans only the gap between the two screens - painting it edge to edge
    // covers the windscreen, which is what made the canopies read as slabs.
    if (o.roofColor && back - screen > front + screen) {
      ctx.fillStyle = o.roofColor;
      roundedRect(ctx, -roofW / 2 + w * 0.01, front + screen, roofW - w * 0.02,
        (back - screen) - (front + screen), w * 0.03);
      ctx.fill();
    }
  }

  /** Wing mirrors. Small, but a strong cue that this is a car seen from above. */
  function mirrors(ctx, w, l, atY, color) {
    ctx.fillStyle = shade(color, -0.25);
    roundedRect(ctx, -w * 0.56, atY, w * 0.1, l * 0.045, w * 0.02); ctx.fill();
    roundedRect(ctx, w * 0.46, atY, w * 0.1, l * 0.045, w * 0.02); ctx.fill();
  }

  function glass(ctx, x, y, w, h, r, tint) {
    var grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, tint || 'rgba(176,204,224,0.95)');
    grad.addColorStop(1, 'rgba(70,95,118,0.92)');
    roundedRect(ctx, x, y, w, h, r);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function lights(ctx, w, l, opts) {
    var o = opts || {};
    var lw = w * 0.19, lh = l * 0.035;
    ctx.fillStyle = o.headlight || '#ffeeb0';
    roundedRect(ctx, -w * 0.36, -l / 2 + l * 0.02, lw, lh, lh * 0.5); ctx.fill();
    roundedRect(ctx, w * 0.36 - lw, -l / 2 + l * 0.02, lw, lh, lh * 0.5); ctx.fill();
    ctx.fillStyle = o.braking ? '#ff5347' : (o.taillight || '#c0322a');
    roundedRect(ctx, -w * 0.37, l / 2 - l * 0.05, lw, lh, lh * 0.5); ctx.fill();
    roundedRect(ctx, w * 0.37 - lw, l / 2 - l * 0.05, lw, lh, lh * 0.5); ctx.fill();
  }

  // ------------------------------------------------------------- car shapes

  /**
   * Race car: a low sports prototype rather than an open-wheeler. A closed
   * canopy reads as a car at small sizes; the circular open cockpit of the
   * first attempt looked like a porthole.
   */
  function drawRacer(ctx, w, l, color, opts) {
    // Fat tyres, only just proud of the bodywork.
    wheels(ctx, w, l, { inset: 0.53, tyreW: w * 0.17, tyreL: l * 0.2,
      frontAt: -l * 0.29, rearAt: l * 0.28 });

    bodyPath(ctx, w, l, 0.6, 0.92);
    paintBody(ctx, w, l, color);

    // Twin livery stripes over the nose and deck.
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    roundedRect(ctx, -w * 0.13, -l * 0.46, w * 0.075, l * 0.92, w * 0.02); ctx.fill();
    roundedRect(ctx, w * 0.055, -l * 0.46, w * 0.075, l * 0.92, w * 0.02); ctx.fill();

    // Low canopy, pushed back and narrower than a road car's.
    cabin(ctx, w, l, {
      front: -l * 0.12, back: l * 0.2, roofW: 0.42, glassW: 0.56, screen: 0.42,
      roofColor: shade(color, -0.3),
    });

    // Front splitter and air intakes.
    ctx.fillStyle = shade(color, -0.5);
    roundedRect(ctx, -w * 0.42, -l * 0.49, w * 0.84, l * 0.035, w * 0.02); ctx.fill();
    ctx.fillStyle = 'rgba(15,20,26,0.75)';
    roundedRect(ctx, -w * 0.3, -l * 0.4, w * 0.16, l * 0.07, w * 0.02); ctx.fill();
    roundedRect(ctx, w * 0.14, -l * 0.4, w * 0.16, l * 0.07, w * 0.02); ctx.fill();

    // Rear wing on end plates.
    ctx.fillStyle = shade(color, -0.42);
    roundedRect(ctx, -w * 0.5, l * 0.33, w * 0.08, l * 0.15, w * 0.02); ctx.fill();
    roundedRect(ctx, w * 0.42, l * 0.33, w * 0.08, l * 0.15, w * 0.02); ctx.fill();
    ctx.fillStyle = shade(color, -0.58);
    roundedRect(ctx, -w * 0.5, l * 0.37, w, l * 0.075, l * 0.02); ctx.fill();

    lights(ctx, w, l, opts);
  }

  /** Three-box saloon. */
  function drawSedan(ctx, w, l, color, opts) {
    wheels(ctx, w, l, { inset: 0.47, tyreW: w * 0.14 });
    bodyPath(ctx, w, l, 0.8, 0.88);
    paintBody(ctx, w, l, color);
    cabin(ctx, w, l, { front: -l * 0.2, back: l * 0.26, roofColor: shade(color, -0.12) });
    mirrors(ctx, w, l, -l * 0.19, color);
    lights(ctx, w, l, opts);
  }

  /** Hatchback: shorter tail, cabin set further back. */
  function drawHatch(ctx, w, l, color, opts) {
    wheels(ctx, w, l, { inset: 0.47, tyreW: w * 0.14, rearAt: l * 0.31 });
    bodyPath(ctx, w, l, 0.84, 0.96);
    paintBody(ctx, w, l, color);
    cabin(ctx, w, l, { front: -l * 0.2, back: l * 0.36, screen: 0.26,
      roofColor: shade(color, -0.12) });
    mirrors(ctx, w, l, -l * 0.19, color);
    lights(ctx, w, l, opts);
  }

  /** SUV: taller, squarer, roof rails. */
  function drawSuv(ctx, w, l, color, opts) {
    wheels(ctx, w, l, { inset: 0.49, tyreW: w * 0.15, tyreL: l * 0.2 });
    bodyPath(ctx, w, l, 0.9, 0.94);
    paintBody(ctx, w, l, color);
    cabin(ctx, w, l, { front: -l * 0.24, back: l * 0.32, roofW: 0.64, glassW: 0.76,
      screen: 0.24, roofColor: shade(color, -0.14) });
    ctx.fillStyle = 'rgba(16,20,26,0.6)';
    roundedRect(ctx, -w * 0.33, -l * 0.2, w * 0.045, l * 0.5, w * 0.02); ctx.fill();
    roundedRect(ctx, w * 0.285, -l * 0.2, w * 0.045, l * 0.5, w * 0.02); ctx.fill();
    mirrors(ctx, w, l, -l * 0.22, color);
    lights(ctx, w, l, opts);
  }

  /** Panel van: cab glass at the very front, long blank box behind. */
  function drawVan(ctx, w, l, color, opts) {
    wheels(ctx, w, l, { inset: 0.48, tyreW: w * 0.14, frontAt: -l * 0.33, rearAt: l * 0.32 });
    bodyPath(ctx, w, l, 0.94, 0.98);
    paintBody(ctx, w, l, color);
    glass(ctx, -w * 0.34, -l * 0.44, w * 0.68, l * 0.1, w * 0.04);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundedRect(ctx, -w * 0.38, -l * 0.28, w * 0.76, l * 0.66, w * 0.03); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(1, w * 0.022);
    ctx.beginPath(); ctx.moveTo(0, -l * 0.26); ctx.lineTo(0, l * 0.37); ctx.stroke();
    mirrors(ctx, w, l, -l * 0.42, color);
    lights(ctx, w, l, opts);
  }

  /** Articulated truck: short cab, then a pale ribbed trailer. */
  function drawTruck(ctx, w, l, color, opts) {
    var trailerTop = -l * 0.1;
    var trailerH = l * 0.58;

    ctx.fillStyle = '#15181c';
    [[-0.53, l * 0.12], [0.39, l * 0.12], [-0.53, l * 0.3], [0.39, l * 0.3]].forEach(function (p) {
      roundedRect(ctx, w * p[0], p[1], w * 0.14, l * 0.09, w * 0.04); ctx.fill();
    });

    ctx.fillStyle = '#e2e6ea';
    roundedRect(ctx, -w * 0.49, trailerTop, w * 0.98, trailerH, w * 0.04);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = Math.max(1, w * 0.022);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    for (var i = 1; i < 5; i++) {
      var yy = trailerTop + (trailerH * i) / 5;
      ctx.beginPath(); ctx.moveTo(-w * 0.47, yy); ctx.lineTo(w * 0.47, yy); ctx.stroke();
    }

    // Cab, drawn as its own short body up front.
    ctx.save();
    ctx.translate(0, -l * 0.3);
    wheels(ctx, w, l * 0.36, { inset: 0.5, tyreW: w * 0.14, tyreL: l * 0.07,
      frontAt: -l * 0.11, rearAt: l * 0.1 });
    bodyPath(ctx, w * 0.98, l * 0.36, 0.92, 0.99);
    paintBody(ctx, w * 0.98, l * 0.36, color);
    glass(ctx, -w * 0.34, -l * 0.13, w * 0.68, l * 0.08, w * 0.04);
    ctx.restore();

    ctx.fillStyle = '#ffeeb0';
    roundedRect(ctx, -w * 0.38, -l / 2 + l * 0.012, w * 0.17, l * 0.025, l * 0.012); ctx.fill();
    roundedRect(ctx, w * 0.21, -l / 2 + l * 0.012, w * 0.17, l * 0.025, l * 0.012); ctx.fill();
    ctx.fillStyle = opts && opts.braking ? '#ff5347' : '#c0322a';
    roundedRect(ctx, -w * 0.45, l / 2 - l * 0.035, w * 0.15, l * 0.025, l * 0.012); ctx.fill();
    roundedRect(ctx, w * 0.3, l / 2 - l * 0.035, w * 0.15, l * 0.025, l * 0.012); ctx.fill();
  }

  /** City bus: long flat box, windows down both flanks. */
  function drawBus(ctx, w, l, color, opts) {
    wheels(ctx, w, l, { inset: 0.49, tyreW: w * 0.13, frontAt: -l * 0.36,
      rearAt: l * 0.3, tyreL: l * 0.08 });
    roundedRect(ctx, -w / 2, -l / 2, w, l, w * 0.14);
    paintBody(ctx, w, l, color);
    glass(ctx, -w * 0.38, -l * 0.46, w * 0.76, l * 0.07, w * 0.04);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    roundedRect(ctx, -w * 0.34, -l * 0.34, w * 0.68, l * 0.76, w * 0.03); ctx.fill();
    ctx.fillStyle = 'rgba(158,190,214,0.82)';
    for (var i = 0; i < 6; i++) {
      var yy = -l * 0.32 + i * l * 0.115;
      roundedRect(ctx, -w * 0.47, yy, w * 0.09, l * 0.075, w * 0.015); ctx.fill();
      roundedRect(ctx, w * 0.38, yy, w * 0.09, l * 0.075, w * 0.015); ctx.fill();
    }
    lights(ctx, w, l, opts);
  }

  /** Taxi: saloon in cab yellow, roof sign, chequer down the flanks. */
  function drawTaxi(ctx, w, l, color, opts) {
    drawSedan(ctx, w, l, '#f0b429', opts);
    var squares = 7;
    var sh = l * 0.46 / squares;
    for (var i = 0; i < squares; i++) {
      ctx.fillStyle = i % 2 ? '#1c1f24' : '#f7f7f7';
      ctx.fillRect(-w * 0.5, -l * 0.08 + i * sh, w * 0.07, sh);
      ctx.fillRect(w * 0.43, -l * 0.08 + i * sh, w * 0.07, sh);
    }
    ctx.fillStyle = '#fbfbfb';
    roundedRect(ctx, -w * 0.15, -l * 0.03, w * 0.3, l * 0.08, w * 0.025); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(1, w * 0.02);
    ctx.stroke();
  }

  /** Police car: dark body, white doors, light bar that alternates. */
  function drawPolice(ctx, w, l, color, opts) {
    drawSedan(ctx, w, l, '#23282f', opts);
    ctx.fillStyle = 'rgba(244,246,249,0.94)';
    roundedRect(ctx, -w * 0.47, -l * 0.04, w * 0.17, l * 0.3, w * 0.025); ctx.fill();
    roundedRect(ctx, w * 0.3, -l * 0.04, w * 0.17, l * 0.3, w * 0.025); ctx.fill();

    var phase = opts && opts.blink !== undefined ? opts.blink : 0;
    var blueOn = phase < 0.5;
    ctx.fillStyle = blueOn ? '#4a86f0' : '#1d2b45';
    roundedRect(ctx, -w * 0.25, -l * 0.05, w * 0.23, l * 0.06, w * 0.02); ctx.fill();
    ctx.fillStyle = blueOn ? '#4a1d1d' : '#f0503f';
    roundedRect(ctx, w * 0.02, -l * 0.05, w * 0.23, l * 0.06, w * 0.02); ctx.fill();
  }

  /** Motorbike: narrow, wheels in line, rider astride. */
  function drawBike(ctx, w, l, color, opts) {
    ctx.fillStyle = '#15181c';
    roundedRect(ctx, -w * 0.19, -l * 0.47, w * 0.38, l * 0.22, w * 0.14); ctx.fill();
    roundedRect(ctx, -w * 0.19, l * 0.25, w * 0.38, l * 0.22, w * 0.14); ctx.fill();

    bodyPath(ctx, w * 0.78, l * 0.66, 0.45, 0.55);
    var grad = ctx.createLinearGradient(-w * 0.39, 0, w * 0.39, 0);
    grad.addColorStop(0, shade(color, -0.28));
    grad.addColorStop(0.5, shade(color, 0.14));
    grad.addColorStop(1, shade(color, -0.3));
    ctx.fillStyle = grad;
    ctx.fill();

    // Handlebars. Nothing else says two wheels as quickly from above.
    ctx.fillStyle = '#20252c';
    roundedRect(ctx, -w * 0.52, -l * 0.24, w * 1.04, l * 0.045, w * 0.03); ctx.fill();
    ctx.fillStyle = '#454d57';
    roundedRect(ctx, -w * 0.52, -l * 0.25, w * 0.14, l * 0.065, w * 0.03); ctx.fill();
    roundedRect(ctx, w * 0.38, -l * 0.25, w * 0.14, l * 0.065, w * 0.03); ctx.fill();

    // Rider: shoulders, arms reaching to the bars, then the helmet.
    ctx.fillStyle = '#2c323b';
    roundedRect(ctx, -w * 0.34, -l * 0.22, w * 0.13, l * 0.16, w * 0.05); ctx.fill();
    roundedRect(ctx, w * 0.21, -l * 0.22, w * 0.13, l * 0.16, w * 0.05); ctx.fill();
    roundedRect(ctx, -w * 0.31, -l * 0.12, w * 0.62, l * 0.34, w * 0.2); ctx.fill();

    ctx.fillStyle = shade(color, -0.1);
    ctx.beginPath();
    ctx.arc(0, -l * 0.11, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,42,55,0.92)';
    ctx.beginPath();
    ctx.ellipse(0, -l * 0.15, w * 0.16, w * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffeeb0';
    roundedRect(ctx, -w * 0.09, -l * 0.5, w * 0.18, l * 0.035, w * 0.03); ctx.fill();
    ctx.fillStyle = opts && opts.braking ? '#ff5347' : '#c0322a';
    roundedRect(ctx, -w * 0.09, l * 0.47, w * 0.18, l * 0.03, w * 0.03); ctx.fill();
  }

  // --------------------------------------------------------------- registry

  var VEHICLES = {
    // Racers - the player and the three opponents.
    racer:       { length: 96, width: 56, color: '#2aa79b', draw: drawRacer, klass: 'racer' },
    racerRed:    { length: 96, width: 56, color: '#d6453d', draw: drawRacer, klass: 'racer' },
    racerAmber:  { length: 96, width: 56, color: '#e08a20', draw: drawRacer, klass: 'racer' },
    racerViolet: { length: 96, width: 56, color: '#8b5cd6', draw: drawRacer, klass: 'racer' },

    // Everyday traffic.
    sedan:  { length: 92,  width: 54, color: '#7f8c9b', draw: drawSedan, klass: 'traffic' },
    // Khaki, not the teal it used to be: that read as a second player car.
    hatch:  { length: 78,  width: 52, color: '#85894a', draw: drawHatch, klass: 'traffic' },
    suv:    { length: 104, width: 60, color: '#4a5a68', draw: drawSuv, klass: 'traffic' },
    van:    { length: 118, width: 60, color: '#e8e4da', draw: drawVan,   klass: 'traffic' },
    truck:  { length: 190, width: 66, color: '#3d6ea8', draw: drawTruck, klass: 'traffic' },
    bus:    { length: 210, width: 66, color: '#c2603a', draw: drawBus,   klass: 'traffic' },
    taxi:   { length: 92,  width: 54, color: '#f0b429', draw: drawTaxi,  klass: 'traffic' },
    police: { length: 94,  width: 55, color: '#20252c', draw: drawPolice, klass: 'traffic' },
    // Magenta rather than red, which sat too close to the red racer.
    bike:   { length: 70,  width: 30, color: '#b8437f', draw: drawBike,  klass: 'traffic' },
  };

  /**
   * Draw one vehicle centred at (x, y) on the canvas, scaled from world units
   * to pixels. `heading` tilts the car into a bend so it does not slide around
   * corners facing straight up the screen.
   */
  function drawVehicle(ctx, type, x, y, scale, opts) {
    var spec = VEHICLES[type] || VEHICLES.sedan;
    var w = spec.width * scale;
    var l = spec.length * scale;
    var o = opts || {};

    ctx.save();
    ctx.translate(x, y);
    if (o.heading) ctx.rotate(o.heading);

    // Ground shadow, offset a little so the cars feel lifted off the road.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    roundedRect(ctx, -w / 2 + w * 0.06, -l / 2 + l * 0.04, w, l, w * 0.2);
    ctx.fill();
    ctx.restore();

    spec.draw(ctx, w, l, o.color || spec.color, o);
    ctx.restore();
  }

  var api = {
    VEHICLES: VEHICLES,
    drawVehicle: drawVehicle,
    shade: shade,
    roundedRect: roundedRect,
    TRAFFIC_TYPES: ['sedan', 'hatch', 'suv', 'van', 'truck', 'bus', 'taxi', 'police', 'bike'],
  };

  global.RacingVehicles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
