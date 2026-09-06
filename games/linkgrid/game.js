/**
 * Linkgrid UI: screens, input and canvas rendering.
 *
 * All rules live in engine.js; this file only turns pointer, keyboard and
 * button events into engine calls and paints the result.
 */
(function () {
  'use strict';

  var Engine = globalThis.LinkgridEngine;
  // puzzles/index.js ships only the manifest; each pack's puzzles are fetched
  // the first time that board size is opened.
  var PACKS = globalThis.LINKGRID_PACKS || [];
  var STORAGE_KEY = 'linkgrid-progress-v2';

  // Static hosting caches JS for four hours but HTML for ten minutes, so a
  // deploy that changes what game.js expects from the page can otherwise pair
  // new HTML with a stale script. index.html versions its script URLs; packs
  // fetched later inherit that same version, so the set always moves together.
  var ASSET_VERSION = (function () {
    try {
      var src = document.currentScript && document.currentScript.src;
      var found = src && src.match(/[?&]v=([^&]*)/);
      return found ? found[1] : '';
    } catch (err) {
      return '';
    }
  })();
  var VERSION_QUERY = ASSET_VERSION ? '?v=' + ASSET_VERSION : '';

  function packs() { return globalThis.LINKGRID_PUZZLES || {}; }

  // Twelve hues, spaced far enough apart to stay tellable on a small board.
  var PALETTE = [
    '#d95f5f', '#e08b3c', '#c9a726', '#8faa39',
    '#4da96b', '#2fa79c', '#3f97c9', '#5a7fd4',
    '#7b6fd0', '#a462c4', '#cf5fa2', '#a3714a',
  ];

  var THEME = {
    boardFill: '#e7e3d8',
    gridLine: '#d3cec0',
    dotRing: '#fbf8f1',
    cursor: '#3f5b56',
    shadow: 'rgba(63, 74, 77, 0.14)',
  };

  var el = {};
  var ctx = null;
  var state = {
    screen: 'packs',
    size: null,
    levelId: null,
    game: null,
    cursor: { r: 0, c: 0 },
    cursorVisible: false,
    cell: 0,
    progress: loadProgress(),
    pointerId: null,
    drawQueued: false,
  };

  // -------------------------------------------------------------------------
  // Progress persistence
  // -------------------------------------------------------------------------

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object' || !parsed.solved) return { solved: {} };
      return { solved: parsed.solved };
    } catch (err) {
      // Private browsing or a corrupt value: play on without saved progress.
      return { solved: {} };
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch (err) {
      /* nothing we can do; progress simply will not persist */
    }
  }

  function solvedIds(size) {
    return state.progress.solved[size] || [];
  }

  function isSolvedLevel(size, id) {
    return solvedIds(size).indexOf(id) !== -1;
  }

  function markSolved(size, id) {
    if (isSolvedLevel(size, id)) return;
    state.progress.solved[size] = solvedIds(size).concat([id]);
    saveProgress();
  }

  // -------------------------------------------------------------------------
  // Level lookup
  // -------------------------------------------------------------------------

  function levelsFor(size) {
    return packs()[size] || [];
  }

  var loading = {};

  /** Fetch one board size's puzzles, once. */
  function loadPack(size) {
    if (levelsFor(size).length) return Promise.resolve(levelsFor(size));
    if (loading[size]) return loading[size];
    loading[size] = new Promise(function (resolve, reject) {
      var tag = document.createElement('script');
      tag.src = './puzzles/' + size + '.js' + VERSION_QUERY;
      tag.onload = function () {
        if (levelsFor(size).length) resolve(levelsFor(size));
        else reject(new Error('pack ' + size + ' loaded but is empty'));
      };
      tag.onerror = function () { reject(new Error('could not load pack ' + size)); };
      document.head.appendChild(tag);
    });
    loading[size].catch(function () { delete loading[size]; });
    return loading[size];
  }

  /** Position of a puzzle within its own difficulty tier, 1-based. */
  function indexInTier(size, level) {
    var within = levelsFor(size).filter(function (other) { return other.tier === level.tier; });
    return within.indexOf(level) + 1;
  }

  function findLevel(size, id) {
    var levels = levelsFor(size);
    for (var i = 0; i < levels.length; i++) if (levels[i].id === id) return levels[i];
    return null;
  }

  function nextLevel(size, id) {
    var levels = levelsFor(size);
    for (var i = 0; i < levels.length; i++) {
      if (levels[i].id === id) return levels[i + 1] || null;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Screens
  // -------------------------------------------------------------------------

  function setScreen(screen) {
    state.screen = screen;
    el.screenPacks.hidden = screen !== 'packs';
    el.screenLevels.hidden = screen !== 'levels';
    el.screenPuzzle.hidden = screen !== 'puzzle';
    el.btnBack.hidden = screen === 'packs';
    el.puzzleActions.hidden = screen !== 'puzzle';

    if (screen === 'packs') el.crumb.textContent = 'Choose a board size';
    if (screen === 'levels') el.crumb.textContent = state.size + ' by ' + state.size + ' puzzles';
    if (screen === 'puzzle') {
      var level = findLevel(state.size, state.levelId);
      var inTier = level
        ? levelsFor(state.size).filter(function (o) { return o.tier === level.tier; }).length
        : 0;
      el.crumb.textContent = level
        ? state.size + ' by ' + state.size + ' · difficulty ' + level.tier +
          ' · puzzle ' + indexInTier(state.size, level) + ' of ' + inTier
        : state.size + ' by ' + state.size;
    }

    if (screen !== 'puzzle') hideOverlay();

    requestAnimationFrame(function () {
      var target = screen === 'puzzle'
        ? el.board
        : (screen === 'packs' ? el.packs : el.levels).querySelector('button');
      if (target) target.focus();
    });
  }

  function renderPacks() {
    el.packs.innerHTML = '';
    PACKS.forEach(function (pack) {
      var size = pack.size;
      var total = pack.count;
      // The pack itself is not loaded yet, so trust the manifest for the total.
      var solved = Math.min(solvedIds(size).length, total);
      var button = document.createElement('button');
      button.className = 'card' + (total && solved >= total ? ' complete' : '');
      button.type = 'button';
      button.setAttribute('aria-label',
        size + ' by ' + size + ' board, ' + solved + ' of ' + total + ' solved');
      button.innerHTML =
        '<span class="card-title">' + size + ' × ' + size + '</span>' +
        '<span class="card-note">' + solved + ' / ' + total + ' solved</span>';
      button.addEventListener('click', function () { openPack(size); });
      el.packs.appendChild(button);
    });
  }

  function openPack(size) {
    state.size = size;
    if (levelsFor(size).length) {
      renderLevels();
      setScreen('levels');
      return;
    }
    el.levels.innerHTML = '<p class="loading">Loading ' + size + ' × ' + size + ' puzzles…</p>';
    setScreen('levels');
    loadPack(size).then(function () {
      if (state.size !== size) return;
      renderLevels();
    }, function () {
      el.levels.innerHTML = '<p class="loading">Could not load these puzzles. ' +
        'Check your connection and try again.</p>';
    });
  }

  function renderLevels() {
    var size = state.size;
    var levels = levelsFor(size);
    el.levels.innerHTML = '';

    var tiers = [];
    levels.forEach(function (level) {
      if (tiers.indexOf(level.tier) === -1) tiers.push(level.tier);
    });
    tiers.sort(function (a, b) { return a - b; });

    tiers.forEach(function (tier) {
      var inTier = levels.filter(function (level) { return level.tier === tier; });
      var solvedHere = inTier.filter(function (level) {
        return isSolvedLevel(size, level.id);
      }).length;

      var section = document.createElement('section');
      section.className = 'tier';

      var heading = document.createElement('h3');
      heading.className = 'tier-title';
      heading.textContent = 'Difficulty ' + tier;
      var note = document.createElement('span');
      note.className = 'tier-note';
      note.textContent = solvedHere + ' / ' + inTier.length;
      heading.appendChild(note);
      section.appendChild(heading);

      var grid = document.createElement('div');
      grid.className = 'tier-grid';
      inTier.forEach(function (level, index) {
        var solved = isSolvedLevel(size, level.id);
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip' + (solved ? ' solved' : '');
        button.textContent = String(index + 1);
        button.setAttribute('aria-label',
          'Difficulty ' + tier + ', puzzle ' + (index + 1) + ' of ' + inTier.length +
          ', ' + level.colors + ' colours' + (solved ? ', solved' : ''));
        button.addEventListener('click', function () { startLevel(level); });
        grid.appendChild(button);
      });
      section.appendChild(grid);
      el.levels.appendChild(section);
    });
  }

  // -------------------------------------------------------------------------
  // Playing a level
  // -------------------------------------------------------------------------

  function startLevel(level) {
    state.size = level.size;
    state.levelId = level.id;
    state.game = Engine.createGame(level);
    state.cursor = { r: level.endpoints[0].a[0], c: level.endpoints[0].a[1] };
    hideOverlay();
    setScreen('puzzle');
    layout();
    updateStatus();
    draw();
  }

  function restartLevel() {
    if (!state.game) return;
    Engine.restart(state.game);
    hideOverlay();
    announce('Board cleared.');
    updateStatus();
    draw();
  }

  function undoMove() {
    if (!state.game) return;
    if (Engine.undo(state.game)) {
      hideOverlay();
      announce('Undid the last route.');
    } else {
      announce('Nothing to undo.');
    }
    updateStatus();
    draw();
  }

  function updateStatus() {
    var game = state.game;
    if (!game) return;
    var connected = Engine.connectedCount(game);
    var filled = Engine.filledCount(game);
    var cells = game.size * game.size;
    el.statConnected.textContent = connected + ' / ' + game.colors;
    el.statFilled.textContent = filled + ' / ' + cells;
    el.btnUndo.disabled = game.history.length === 0;
    el.board.setAttribute('aria-label',
      'Linkgrid board, ' + game.size + ' by ' + game.size + '. ' +
      connected + ' of ' + game.colors + ' colours connected, ' +
      filled + ' of ' + cells + ' cells filled.');
  }

  function announce(message) {
    el.live.textContent = message;
  }

  function finishMove(result) {
    updateStatus();
    draw();
    if (result && result.solved) {
      markSolved(state.size, state.levelId);
      renderPacks();
      renderLevels();
      showOverlay();
      announce('Solved in ' + state.game.moves + ' moves.');
    }
  }

  function showOverlay() {
    var upcoming = nextLevel(state.size, state.levelId);
    el.btnNext.hidden = !upcoming;
    el.overlayMoves.textContent = state.game.moves + (state.game.moves === 1 ? ' move' : ' moves');
    el.overlay.hidden = false;
    requestAnimationFrame(function () {
      (upcoming ? el.btnNext : el.btnReplay).focus();
    });
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  // -------------------------------------------------------------------------
  // Canvas layout and rendering
  // -------------------------------------------------------------------------

  function layout() {
    var game = state.game;
    if (!game) return;
    var cssSize = el.board.clientWidth;
    if (!cssSize) return;
    var ratio = window.devicePixelRatio || 1;
    var pixels = Math.round(cssSize * ratio);
    if (el.board.width !== pixels || el.board.height !== pixels) {
      el.board.width = pixels;
      el.board.height = pixels;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    state.cell = cssSize / game.size;
  }

  function requestDraw() {
    if (state.drawQueued) return;
    state.drawQueued = true;
    requestAnimationFrame(function () {
      state.drawQueued = false;
      draw();
    });
  }

  function centreOf(cell) {
    return [cell[1] * state.cell + state.cell / 2, cell[0] * state.cell + state.cell / 2];
  }

  function draw() {
    var game = state.game;
    if (!game || !ctx) return;
    var cell = state.cell;
    if (!cell) return;
    var span = cell * game.size;

    ctx.clearRect(0, 0, span, span);
    ctx.fillStyle = THEME.boardFill;
    ctx.fillRect(0, 0, span, span);

    ctx.strokeStyle = THEME.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 1; i < game.size; i++) {
      var at = Math.round(i * cell) + 0.5;
      ctx.moveTo(at, 0);
      ctx.lineTo(at, span);
      ctx.moveTo(0, at);
      ctx.lineTo(span, at);
    }
    ctx.stroke();

    var activeColor = game.active ? game.active.color : -1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (var color = 0; color < game.colors; color++) {
      var path = game.paths[color];
      if (!path || path.length < 2) continue;
      var connected = Engine.isConnected(game, color);

      ctx.beginPath();
      var start = centreOf(path[0]);
      ctx.moveTo(start[0], start[1]);
      for (var j = 1; j < path.length; j++) {
        var point = centreOf(path[j]);
        ctx.lineTo(point[0], point[1]);
      }

      ctx.strokeStyle = PALETTE[color % PALETTE.length];
      ctx.globalAlpha = connected || color === activeColor ? 1 : 0.55;
      ctx.lineWidth = cell * (connected ? 0.36 : 0.3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Endpoint dots sit on top so a route never hides where it must start.
    for (var c2 = 0; c2 < game.colors; c2++) {
      var pair = game.endpoints[c2];
      var done = Engine.isConnected(game, c2);
      for (var d = 0; d < 2; d++) {
        var centre = centreOf(pair[d]);
        var radius = cell * 0.3;
        ctx.beginPath();
        ctx.arc(centre[0], centre[1], radius, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE[c2 % PALETTE.length];
        ctx.fill();
        if (done) {
          // A pale ring marks the pairs that are already joined up.
          ctx.beginPath();
          ctx.arc(centre[0], centre[1], radius * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = THEME.dotRing;
          ctx.fill();
        }
      }
    }

    // The head of the route being drawn.
    if (game.active) {
      var head = Engine.headOf(game, game.active.color);
      if (head) {
        var hp = centreOf(head);
        ctx.beginPath();
        ctx.arc(hp[0], hp[1], cell * 0.17, 0, Math.PI * 2);
        ctx.fillStyle = THEME.dotRing;
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    if (state.cursorVisible) {
      ctx.strokeStyle = THEME.cursor;
      ctx.lineWidth = Math.max(2, cell * 0.07);
      var inset = ctx.lineWidth;
      ctx.strokeRect(
        state.cursor.c * cell + inset,
        state.cursor.r * cell + inset,
        cell - inset * 2,
        cell - inset * 2
      );
    }
  }

  // -------------------------------------------------------------------------
  // Pointer input
  // -------------------------------------------------------------------------

  function cellFromEvent(event) {
    var game = state.game;
    if (!game) return null;
    var rect = el.board.getBoundingClientRect();
    if (!rect.width) return null;
    var size = rect.width / game.size;
    var c = Math.floor((event.clientX - rect.left) / size);
    var r = Math.floor((event.clientY - rect.top) / size);
    if (r < 0 || c < 0 || r >= game.size || c >= game.size) return null;
    return { r: r, c: c };
  }

  function onPointerDown(event) {
    var game = state.game;
    if (!game || !el.overlay.hidden) return;
    var cell = cellFromEvent(event);
    if (!cell) return;

    event.preventDefault();
    state.cursor = cell;
    state.cursorVisible = false;
    state.pointerId = event.pointerId;
    try {
      el.board.setPointerCapture(event.pointerId);
    } catch (err) {
      /* capture is a nicety; dragging still works without it */
    }

    if (!Engine.grab(game, cell.r, cell.c)) {
      announce('Start a route from a coloured dot or from a route you have drawn.');
    }
    requestDraw();
  }

  function onPointerMove(event) {
    var game = state.game;
    if (!game || !game.active || event.pointerId !== state.pointerId) return;
    var cell = cellFromEvent(event);
    if (!cell) return;
    if (Engine.extendTo(game, cell.r, cell.c)) {
      state.cursor = cell;
      updateStatus();
      requestDraw();
    }
  }

  function onPointerUp(event) {
    var game = state.game;
    if (!game || event.pointerId !== state.pointerId) return;
    state.pointerId = null;
    try {
      el.board.releasePointerCapture(event.pointerId);
    } catch (err) {
      /* already released */
    }
    finishMove(Engine.release(game));
  }

  function onPointerCancel() {
    var game = state.game;
    if (!game) return;
    state.pointerId = null;
    Engine.cancel(game);
    updateStatus();
    requestDraw();
  }

  // -------------------------------------------------------------------------
  // Keyboard input
  // -------------------------------------------------------------------------

  var ARROWS = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };

  function describeCursor() {
    var game = state.game;
    var r = state.cursor.r;
    var c = state.cursor.c;
    var owner = Engine.ownerAt(game, r, c);
    var where = 'row ' + (r + 1) + ', column ' + (c + 1) + ': ';
    if (owner === Engine.EMPTY) return where + 'empty';
    var label = 'colour ' + (owner + 1);
    if (Engine.isEndpoint(game, owner, r, c)) return where + label + ' dot';
    return where + label + ' route';
  }

  function onKeyDown(event) {
    var game = state.game;
    if (!game) return;

    if (!el.overlay.hidden) return;

    if (event.key === 'Escape') {
      if (Engine.cancel(game)) announce('Cancelled.');
      state.cursorVisible = true;
      updateStatus();
      requestDraw();
      event.preventDefault();
      return;
    }

    if (event.key === 'z' && (event.metaKey || event.ctrlKey)) {
      undoMove();
      event.preventDefault();
      return;
    }

    if (event.key === 'u' || event.key === 'U') {
      undoMove();
      event.preventDefault();
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      restartLevel();
      event.preventDefault();
      return;
    }

    if (event.key === ' ' || event.key === 'Enter') {
      state.cursorVisible = true;
      if (game.active) {
        finishMove(Engine.release(game));
        announce('Route finished.');
      } else if (Engine.grab(game, state.cursor.r, state.cursor.c)) {
        announce('Drawing colour ' + (game.active.color + 1) + '. Use the arrow keys.');
        requestDraw();
      } else {
        announce('Nothing to draw here. Move to a coloured dot first.');
      }
      event.preventDefault();
      return;
    }

    var delta = ARROWS[event.key];
    if (!delta) return;

    event.preventDefault();
    state.cursorVisible = true;
    var r = Math.min(game.size - 1, Math.max(0, state.cursor.r + delta[0]));
    var c = Math.min(game.size - 1, Math.max(0, state.cursor.c + delta[1]));
    if (r === state.cursor.r && c === state.cursor.c) return;
    state.cursor = { r: r, c: c };

    if (game.active) {
      if (!Engine.stepTo(game, r, c)) announce('Blocked.');
    } else {
      announce(describeCursor());
    }
    updateStatus();
    requestDraw();
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  function collect() {
    [
      'crumb', 'btnBack', 'puzzleActions', 'btnRestart', 'btnUndo',
      'screenPacks', 'screenLevels', 'screenPuzzle', 'packs', 'levels',
      'board', 'statConnected', 'statFilled', 'live', 'overlay',
      'overlayMoves', 'btnNext', 'btnReplay', 'btnLevels',
    ].forEach(function (name) {
      el[name] = document.getElementById(name);
    });
  }

  function wire() {
    ctx = el.board.getContext('2d');

    el.board.addEventListener('pointerdown', onPointerDown);
    el.board.addEventListener('pointermove', onPointerMove);
    el.board.addEventListener('pointerup', onPointerUp);
    el.board.addEventListener('pointercancel', onPointerCancel);
    el.board.addEventListener('keydown', onKeyDown);
    el.board.addEventListener('focus', function () {
      state.cursorVisible = true;
      requestDraw();
    });
    el.board.addEventListener('blur', function () {
      state.cursorVisible = false;
      requestDraw();
    });

    el.btnBack.addEventListener('click', function () {
      if (state.screen === 'puzzle') {
        renderLevels();
        setScreen('levels');
      } else {
        renderPacks();
        setScreen('packs');
      }
    });
    el.btnRestart.addEventListener('click', restartLevel);
    el.btnUndo.addEventListener('click', undoMove);
    el.btnReplay.addEventListener('click', function () {
      hideOverlay();
      restartLevel();
      el.board.focus();
    });
    el.btnLevels.addEventListener('click', function () {
      renderLevels();
      setScreen('levels');
    });
    el.btnNext.addEventListener('click', function () {
      var upcoming = nextLevel(state.size, state.levelId);
      if (upcoming) startLevel(upcoming);
    });

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () {
        layout();
        requestDraw();
      }).observe(el.board);
    } else {
      window.addEventListener('resize', function () {
        layout();
        requestDraw();
      });
    }
  }

  function boot() {
    collect();
    if (!Engine || !PACKS.length) {
      // Almost always a half-stale cache: this page paired with an older
      // script. Offer the fix rather than leaving a dead end.
      el.crumb.textContent = 'This page did not load correctly';
      el.packs.innerHTML =
        '<p class="loading">Some of the game files are out of date in your ' +
        'browser cache. Reloading fetches fresh copies.</p>';
      var again = document.createElement('button');
      again.type = 'button';
      again.textContent = 'Reload';
      again.addEventListener('click', function () {
        location.replace(location.pathname + '?r=' + Date.now());
      });
      el.packs.appendChild(again);
      return;
    }
    wire();
    renderPacks();
    setScreen('packs');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
