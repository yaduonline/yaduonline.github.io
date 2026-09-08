/**
 * Tetris UI: layout, rendering, input, persistence.
 *
 * All rules live in engine.js; this file sizes the board to the space
 * available, paints it, and turns input into engine calls.
 */
(function () {
  'use strict';

  var Engine = globalThis.TetrisEngine;
  var STORAGE_KEY = 'tetris-best';

  // Muted palette, one hue per piece, distinguishable side by side.
  var COLORS = {
    I: '#4da384',
    J: '#5a8ca0',
    L: '#c26a50',
    O: '#b88d40',
    S: '#7abda6',
    Z: '#5e738c',
    T: '#a6566e',
  };

  /**
   * Board colours, read from CSS rather than fixed here, so the canvas follows
   * the site's theme along with everything else. A white well painted into a
   * dark page is the one part of a game that a stylesheet cannot reach.
   *
   * The piece colours above are deliberately not themed: they are the game, and
   * they read on either background.
   */
  var THEME = {};

  function readTheme() {
    var css = getComputedStyle(document.documentElement);
    function token(name, fallback) {
      var value = css.getPropertyValue(name).trim();
      return value || fallback;
    }
    THEME.well = token('--well', '#ffffff');
    THEME.line = token('--well-line', '#e6e8ec');
    THEME.edge = token('--well-edge', '#cfd4da');
    THEME.ghost = token('--ghost', 'rgba(33, 37, 41, 0.16)');
    THEME.flash = token('--flash', '#ffffff');
  }

  /**
   * The theme can change under us two ways: the visitor picks one (which stamps
   * data-theme on <html>), or their browser flips while "system" is selected.
   */
  function watchTheme(onChange) {
    if (window.MutationObserver) {
      new MutationObserver(onChange).observe(document.documentElement,
        { attributes: true, attributeFilter: ['data-theme'] });
    }
    var query = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (query && query.addEventListener) query.addEventListener('change', onChange);
  }

  // A cap only so the board cannot get absurd on a large monitor. It sits far
  // above anything a phone will ask for, so it never binds on mobile - unlike
  // the previous build's 30px cap, which did.
  var MAX_BLOCK = 48;

  var DAS_MS = 170; // hold this long before a direction repeats
  var ARR_MS = 45;  // then repeat this often

  var el = {};
  var ctx = null;
  var nextCtx = null;
  var game = null;
  var block = 0;
  var best = 0;
  var lastFrame = 0;
  var repeatTimer = null;
  var repeatDelay = null;

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  function loadBest() {
    try {
      return Number(localStorage.getItem(STORAGE_KEY)) || 0;
    } catch (err) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch (err) {
      /* private browsing: play on without persisting */
    }
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  /**
   * Size the board to the space the flex layout actually handed it.
   *
   * The board's container is a flex child between the top bar and the
   * controls, so the browser has already subtracted both, plus the safe-area
   * inset. Measuring it is therefore exact - the previous build added up a few
   * offsetHeight reads and a magic constant, before layout had settled, and
   * was wrong in both directions.
   */
  function layout() {
    if (!game) return;
    var area = el.boardArea.getBoundingClientRect();
    if (!area.width || !area.height) return;

    block = Math.floor(Math.min(area.width / game.cols, area.height / game.rows));
    block = Math.max(1, Math.min(block, MAX_BLOCK));

    var cssWidth = block * game.cols;
    var cssHeight = block * game.rows;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);

    el.board.style.width = cssWidth + 'px';
    el.board.style.height = cssHeight + 'px';
    el.board.width = Math.round(cssWidth * ratio);
    el.board.height = Math.round(cssHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // The preview is sized off the bar, not the board, so it stays legible
    // when the board is small.
    var previewBlock = Math.max(5, Math.min(10, Math.floor(block / 3)));
    var previewCss = previewBlock * 4;
    el.next.style.width = previewCss + 'px';
    el.next.style.height = previewCss + 'px';
    el.next.width = Math.round(previewCss * ratio);
    el.next.height = Math.round(previewCss * ratio);
    nextCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    el.next.dataset.block = String(previewBlock);

    draw();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * Draw one block of a piece.
   *
   * The cell is filled edge to edge, so blocks of the same piece meet with no
   * seam and the grid line underneath does not show through - a piece reads as
   * one continuous shape. The individual blocks are still legible because each
   * carries an inner bevel: a light edge along the top and left, a darker one
   * along the bottom and right. Delineation by shading rather than by gaps.
   */
  function drawCell(target, x, y, size, color) {
    var px = x * size;
    var py = y * size;

    target.fillStyle = color;
    target.fillRect(px, py, size, size);

    // Thin at small block sizes, but never less than a pixel or it vanishes.
    var bevel = Math.max(1, Math.round(size * 0.11));

    target.fillStyle = 'rgba(255, 255, 255, 0.30)';
    target.fillRect(px, py, size, bevel);
    target.fillRect(px, py, bevel, size);

    target.fillStyle = 'rgba(0, 0, 0, 0.17)';
    target.fillRect(px, py + size - bevel, size, bevel);
    target.fillRect(px + size - bevel, py, bevel, size);
  }

  function draw() {
    if (!game || !block) return;
    var width = block * game.cols;
    var height = block * game.rows;
    var hidden = game.spawnRows; // rows above the visible field

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = THEME.well;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = THEME.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c = 1; c < game.cols; c++) {
      var gx = Math.round(c * block) + 0.5;
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
    }
    for (var r = 1; r < game.rows; r++) {
      var gy = Math.round(r * block) + 0.5;
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
    }
    ctx.stroke();

    // Locked cells.
    for (var y = 0; y < game.grid.length; y++) {
      var row = y - hidden;
      if (row < 0) continue;
      var flashing = game.clearing.indexOf(y) !== -1;
      for (var x = 0; x < game.cols; x++) {
        var cell = game.grid[y][x];
        if (!cell) continue;
        drawCell(ctx, x, row, block, flashing ? THEME.flash : COLORS[cell]);
      }
    }

    if (game.piece && game.status !== 'over') {
      // Ghost first, so the live piece paints over it.
      var landing = Engine.ghostY(game);
      ctx.strokeStyle = THEME.ghost;
      ctx.lineWidth = 2;
      forEachCell(game.piece.matrix, function (px, py) {
        var gy2 = landing + py - hidden;
        if (gy2 < 0) return;
        ctx.strokeRect(
          (game.piece.pos.x + px) * block + 2,
          gy2 * block + 2,
          block - 4,
          block - 4
        );
      });

      forEachCell(game.piece.matrix, function (px, py) {
        var gy3 = game.piece.pos.y + py - hidden;
        if (gy3 < 0) return;
        drawCell(ctx, game.piece.pos.x + px, gy3, block, COLORS[game.piece.type]);
      });
    }

    ctx.strokeStyle = THEME.edge;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    drawNext();
  }

  function forEachCell(matrix, fn) {
    for (var y = 0; y < matrix.length; y++) {
      for (var x = 0; x < matrix[y].length; x++) {
        if (matrix[y][x]) fn(x, y);
      }
    }
  }

  function drawNext() {
    if (!game || !game.nextType) return;
    var size = Number(el.next.dataset.block) || 8;
    var span = size * 4;
    nextCtx.clearRect(0, 0, span, span);

    var shape = Engine.SHAPES[game.nextType];
    // Centre the piece in the preview box.
    var minX = 9, maxX = -1, minY = 9, maxY = -1;
    forEachCell(shape, function (x, y) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    var offsetX = (4 - (maxX - minX + 1)) / 2 - minX;
    var offsetY = (4 - (maxY - minY + 1)) / 2 - minY;

    forEachCell(shape, function (x, y) {
      drawCell(nextCtx, x + offsetX, y + offsetY, size, COLORS[game.nextType]);
    });
  }

  // -------------------------------------------------------------------------
  // Status text
  // -------------------------------------------------------------------------

  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function updateStats() {
    if (!game) return;
    setText(el.score, String(game.score));
    setText(el.level, String(game.level));
    setText(el.lines, String(game.lines));
    setText(el.best, String(best));
  }

  function announce(message) {
    el.live.textContent = message;
  }

  function showOverlay(title, detail, buttonLabel) {
    el.overlayTitle.textContent = title;
    el.overlayDetail.textContent = detail || '';
    el.overlayBtn.textContent = buttonLabel;
    el.overlay.hidden = false;
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  // -------------------------------------------------------------------------
  // Game flow
  // -------------------------------------------------------------------------

  function newGame() {
    Engine.start(game);
    hideOverlay();
    updateStats();
    layout();
    announce('New game.');
    el.pauseBtn.textContent = 'Pause';
  }

  function togglePause() {
    if (!game || game.status === 'over' || game.status === 'ready') return;
    var status = Engine.pause(game);
    if (status === 'paused') {
      showOverlay('Paused', '', 'Resume');
      el.pauseBtn.textContent = 'Resume';
      announce('Paused.');
    } else {
      hideOverlay();
      el.pauseBtn.textContent = 'Pause';
      announce('Resumed.');
    }
  }

  function handleEvents() {
    var events = Engine.drainEvents(game);
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (event.type === 'lines') {
        announce(event.count === 4 ? 'Four lines.' : event.count + ' line' +
          (event.count === 1 ? '' : 's') + ' cleared.');
      } else if (event.type === 'level') {
        announce('Level ' + event.level + '.');
      } else if (event.type === 'gameover') {
        if (game.score > best) {
          best = game.score;
          saveBest(best);
        }
        showOverlay('Game over', 'Score ' + game.score, 'Play again');
        announce('Game over. Score ' + game.score + '.');
      }
    }
  }

  function frame(time) {
    var delta = lastFrame ? time - lastFrame : 16;
    lastFrame = time;
    // A backgrounded tab resumes with a huge delta; clamp it so the piece does
    // not teleport to the floor on the first frame back.
    if (delta > 100) delta = 100;

    if (game && (game.status === 'playing' || game.status === 'clearing')) {
      Engine.tick(game, delta);
      handleEvents();
      updateStats();
      draw();
    }
    requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  function act(action) {
    if (!game) return;
    if (game.status === 'ready' || game.status === 'over') return;
    if (game.status === 'paused') return;

    if (action === 'left') Engine.move(game, -1, 0);
    else if (action === 'right') Engine.move(game, 1, 0);
    else if (action === 'down') Engine.softDrop(game);
    else if (action === 'rotateCW') Engine.rotate(game, 1);
    else if (action === 'rotateCCW') Engine.rotate(game, -1);
    else if (action === 'drop') Engine.hardDrop(game);
    handleEvents();
    updateStats();
    draw();
  }

  function stopRepeat() {
    clearTimeout(repeatDelay);
    clearInterval(repeatTimer);
    repeatDelay = null;
    repeatTimer = null;
  }

  /** Fire once now, then repeat after DAS at ARR - so a tap moves one cell. */
  function startRepeat(action) {
    stopRepeat();
    act(action);
    repeatDelay = setTimeout(function () {
      repeatTimer = setInterval(function () { act(action); }, ARR_MS);
    }, DAS_MS);
  }

  function bindButton(button, action, repeats) {
    button.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      if (repeats) startRepeat(action);
      else act(action);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
      button.addEventListener(name, stopRepeat);
    });
    // Keyboard activation of the same buttons.
    button.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        act(action);
      }
    });
  }

  var KEYS = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowUp: 'rotateCW',
    x: 'rotateCW',
    X: 'rotateCW',
    z: 'rotateCCW',
    Z: 'rotateCCW',
  };

  function onKeyDown(event) {
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
      event.preventDefault();
      togglePause();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      if (game && (game.status === 'ready' || game.status === 'over')) newGame();
      else act('drop');
      return;
    }
    var action = KEYS[event.key];
    if (!action) return;
    event.preventDefault();
    act(action);
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  function collect() {
    [
      'board', 'boardArea', 'next', 'score', 'level', 'lines', 'best',
      'live', 'overlay', 'overlayTitle', 'overlayDetail', 'overlayBtn',
      'pauseBtn', 'restartBtn',
      'btnLeft', 'btnRight', 'btnDown', 'btnRotate', 'btnDrop',
    ].forEach(function (name) {
      el[name] = document.getElementById(name);
    });
  }

  function applyTheme() {
    readTheme();
    draw();
  }

  function boot() {
    readTheme();
    watchTheme(applyTheme);
    collect();
    if (!Engine || !el.board) return;

    ctx = el.board.getContext('2d');
    nextCtx = el.next.getContext('2d');
    best = loadBest();
    game = Engine.createGame();

    bindButton(el.btnLeft, 'left', true);
    bindButton(el.btnRight, 'right', true);
    bindButton(el.btnDown, 'down', true);
    bindButton(el.btnRotate, 'rotateCW', false);
    bindButton(el.btnDrop, 'drop', false);

    el.pauseBtn.addEventListener('click', togglePause);
    el.restartBtn.addEventListener('click', newGame);
    el.overlayBtn.addEventListener('click', function () {
      if (game.status === 'paused') togglePause();
      else newGame();
    });
    document.addEventListener('keydown', onKeyDown);

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(layout).observe(el.boardArea);
    } else {
      window.addEventListener('resize', layout);
    }
    window.addEventListener('orientationchange', function () {
      setTimeout(layout, 150);
    });

    updateStats();
    layout();
    showOverlay('Tetris', 'Fill rows to clear them.', 'Start');
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
