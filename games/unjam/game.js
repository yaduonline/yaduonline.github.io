/**
 * Unjam UI: screens, layout, drag and keyboard input, persistence.
 *
 * All rules live in engine.js. This file sizes the tray to the space
 * available, positions the blocks, and turns input into engine calls.
 */
(function () {
  'use strict';

  var Engine = globalThis.UnjamEngine;
  var PACKS = globalThis.UNJAM_PACKS;
  var PROGRESS_KEY = 'unjam-progress';
  var LAST_KEY = 'unjam-last';

  var FRAME = 0.4;      // tray wall thickness, in cells
  var MAX_CELL = 110;   // only so the tray cannot get absurd on a big monitor
  var DRAG_SLOP = 4;    // px of travel before a press counts as a drag

  // After a solve: the red block slides out, the result shows in place of the
  // controls, then the tray fades across to the next puzzle on its own.
  var ADVANCE_MS = 1700;   // from the solve to the fade starting
  var FADE_MS = 220;       // keep in step with #tray's opacity transition

  var el = {};
  var progress = {};
  var screen = 'packs';
  var packIndex = -1;
  var puzzleIndex = -1;
  var game = null;
  var blocks = [];
  var ghost = null;
  var cell = 0;
  var drag = null;
  var hintFor = null;   // position key the hint on screen was computed for
  var advanceTimer = null;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  // -------------------------------------------------------------------------
  // Persistence: fewest moves per solved puzzle, and the last puzzle opened.
  // -------------------------------------------------------------------------

  function loadProgress() {
    try {
      var data = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch (err) {
      return {};
    }
  }

  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (err) { /* play on */ }
  }

  function loadLast() {
    try { return localStorage.getItem(LAST_KEY); } catch (err) { return null; }
  }

  function saveLast(id) {
    try { localStorage.setItem(LAST_KEY, id); } catch (err) { /* play on */ }
  }

  function isPerfect(puzzle) {
    return progress[puzzle.id] !== undefined && progress[puzzle.id] <= puzzle.min;
  }

  function findPuzzle(id) {
    for (var p = 0; p < PACKS.length; p++) {
      for (var q = 0; q < PACKS[p].puzzles.length; q++) {
        if (PACKS[p].puzzles[q].id === id) return { pack: p, index: q };
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Routing. Screens live in the URL hash, so the phone's back gesture goes up
  // a level instead of leaving the game, and a reload lands where you were.
  //   #            packs
  //   #expert      puzzle list
  //   #expert/12   puzzle 12 of that pack
  // -------------------------------------------------------------------------

  function go(hash) {
    if (location.hash.replace(/^#/, '') === hash) route();
    else location.hash = hash;
  }

  /**
   * Move on without adding a history entry, so the back gesture after a run of
   * puzzles goes up to the list rather than back through every one of them.
   */
  function replaceWith(hash) {
    try {
      history.replaceState(null, '', '#' + hash);
      route();
    } catch (err) {
      go(hash);
    }
  }

  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var p = -1;
    for (var i = 0; i < PACKS.length; i++) if (PACKS[i].id === parts[0]) p = i;
    var n = parseInt(parts[1], 10);
    if (p >= 0 && n >= 1 && n <= PACKS[p].puzzles.length) openPuzzle(p, n - 1);
    else if (p >= 0) showList(p);
    else showPacks();
  }

  function setScreen(name) {
    cancelAdvance();
    screen = name;
    el.screenPacks.hidden = name !== 'packs';
    el.screenList.hidden = name !== 'list';
    el.screenPlay.hidden = name !== 'play';
    el.playStats.hidden = name !== 'play';
    el.btnUp.hidden = name === 'packs';
    document.body.classList.toggle('playing', name === 'play');
    window.scrollTo(0, 0);
  }

  function upOneLevel() {
    if (screen === 'play') go(PACKS[packIndex].id);
    else go('');
  }

  // -------------------------------------------------------------------------
  // Pack and puzzle-list screens
  // -------------------------------------------------------------------------

  function tally(pack) {
    var solved = 0;
    var perfect = 0;
    pack.puzzles.forEach(function (p) {
      if (progress[p.id] !== undefined) solved++;
      if (isPerfect(p)) perfect++;
    });
    return { solved: solved, perfect: perfect };
  }

  function showPacks() {
    setScreen('packs');
    game = null;
    el.title.textContent = 'Unjam';
    el.crumb.textContent = 'Slide the blocks. Free the red one.';
    document.title = 'Unjam';

    el.packs.textContent = '';
    PACKS.forEach(function (pack) {
      var t = tally(pack);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pack';
      button.innerHTML =
        '<span class="pack-name"></span>' +
        '<span class="pack-note"></span>' +
        '<span class="pack-note"></span>' +
        '<span class="pack-bar" aria-hidden="true"><span></span></span>';
      var spans = button.querySelectorAll('span');
      spans[0].textContent = pack.name;
      spans[1].textContent = pack.band[0] + '–' + (pack.band[1] > 90 ? pack.puzzles[pack.puzzles.length - 1].min : pack.band[1]) + ' moves';
      spans[2].textContent = t.solved + ' / ' + pack.puzzles.length + ' solved · ' + t.perfect + ' perfect';
      spans[4].style.width = (100 * t.solved / pack.puzzles.length) + '%';
      button.setAttribute('aria-label', pack.name + ', ' + spans[1].textContent + ', ' + spans[2].textContent);
      button.addEventListener('click', function () { go(pack.id); });
      el.packs.appendChild(button);
    });

    var last = findPuzzle(loadLast() || '');
    el.continue.hidden = !last;
    if (last) {
      el.continueBtn.textContent = 'Continue: ' + PACKS[last.pack].name + ' ' + (last.index + 1) + ' →';
      el.continueBtn.onclick = function () { go(PACKS[last.pack].id + '/' + (last.index + 1)); };
    }
  }

  function showList(p) {
    setScreen('list');
    game = null;
    packIndex = p;
    var pack = PACKS[p];
    var t = tally(pack);
    el.title.textContent = pack.name;
    el.crumb.textContent = t.solved + ' / ' + pack.puzzles.length + ' solved · ' + t.perfect + ' perfect';
    document.title = 'Unjam · ' + pack.name;

    el.chips.textContent = '';
    var focusTarget = null;
    pack.puzzles.forEach(function (puzzle, n) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      var best = progress[puzzle.id];
      var label = 'Puzzle ' + (n + 1) + ', ' + puzzle.min + ' moves at best';
      if (best !== undefined) {
        button.classList.add('solved');
        label += isPerfect(puzzle) ? ', solved perfectly' : ', solved in ' + best;
      }
      button.innerHTML = '<span class="chip-n"></span><span class="chip-min"></span>' +
        (isPerfect(puzzle) ? '<span class="star" aria-hidden="true">★</span>' : '');
      button.children[0].textContent = String(n + 1);
      button.children[1].textContent = 'par ' + puzzle.min;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', function () { go(pack.id + '/' + (n + 1)); });
      el.chips.appendChild(button);
      if (!focusTarget && best === undefined) focusTarget = button;
    });
    // Land on the first unsolved puzzle, so the next one to play is one key away.
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  // -------------------------------------------------------------------------
  // Play screen
  // -------------------------------------------------------------------------

  function openPuzzle(p, n) {
    packIndex = p;
    puzzleIndex = n;
    var pack = PACKS[p];
    var puzzle = pack.puzzles[n];
    game = Engine.createGame(puzzle);
    saveLast(puzzle.id);

    setScreen('play');
    el.title.textContent = pack.name + ' ' + (n + 1);
    var best = progress[puzzle.id];
    el.crumb.textContent = best === undefined ? 'Not solved yet' :
      (isPerfect(puzzle) ? 'Solved perfectly' : 'Solved in ' + best);
    document.title = 'Unjam · ' + pack.name + ' ' + (n + 1);
    el.finish.hidden = true;
    el.controls.hidden = false;

    buildTray();
    layout();
    updateStats();
    // Arriving by an automatic advance the tray was faded out; bring it back.
    requestAnimationFrame(function () { el.tray.classList.remove('leaving'); });
    announce(pack.name + ' puzzle ' + (n + 1) + '. Can be solved in ' + puzzle.min + ' moves.');
  }

  function buildTray() {
    blocks.forEach(function (b) { b.remove(); });
    blocks = [];
    if (ghost) { ghost.remove(); ghost = null; }
    hintFor = null;

    game.pieces.forEach(function (piece, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'block ' + (piece.horiz ? 'h' : 'v') + (i === Engine.RED ? ' red' : ' t' + (i % 3));
      b.dataset.piece = String(i);
      // Shift each block's grain so no two look cut from the same plank.
      b.style.setProperty('--grain', ((i * 37) % 23) + 'px');
      if (i === Engine.RED) {
        b.innerHTML = '<svg class="mark" viewBox="0 0 24 16" aria-hidden="true">' +
          '<path d="M2 3l6 5-6 5M11 3l6 5-6 5" fill="none" stroke="currentColor" ' +
          'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      b.addEventListener('pointerdown', onPointerDown);
      b.addEventListener('keydown', onBlockKey);
      el.tray.appendChild(b);
      blocks.push(b);
    });
    labelBlocks();
  }

  function describe(i) {
    var piece = game.pieces[i];
    var p = game.pos[i];
    var name = i === Engine.RED ? 'Red block' : 'Wooden block';
    var span = (p + 1) + (piece.len === 2 ? ' and ' : ' to ') + (p + piece.len);
    return name + ', ' + (piece.horiz ? 'horizontal' : 'vertical') + ', ' + piece.len + ' long, ' +
      (piece.horiz ? 'row ' + (piece.line + 1) + ', columns ' + span
        : 'column ' + (piece.line + 1) + ', rows ' + span);
  }

  function labelBlocks() {
    blocks.forEach(function (b, i) { b.setAttribute('aria-label', describe(i)); });
  }

  /**
   * Size the tray to the space the flex layout gave it. The container sits
   * between the bar and the controls, so both, and the safe area, are already
   * subtracted - nothing is guessed.
   */
  function layout() {
    if (!game || screen !== 'play') return;
    var area = el.trayArea.getBoundingClientRect();
    if (!area.width || !area.height) return;
    // Snap, don't glide: without this every block slides in from the tray's
    // corner when a puzzle opens, and across the tray on every resize.
    el.tray.classList.add('still');
    cell = Math.floor(Math.min(area.width, area.height) / (Engine.SIZE + 2 * FRAME));
    cell = Math.max(10, Math.min(cell, MAX_CELL));
    var frame = Math.round(cell * FRAME);
    var gap = Math.max(1, Math.round(cell * 0.05));
    el.tray.style.setProperty('--cell', cell + 'px');
    el.tray.style.setProperty('--frame', frame + 'px');
    el.tray.style.setProperty('--gap', gap + 'px');

    game.pieces.forEach(function (piece, i) {
      var b = blocks[i];
      var long = piece.len * cell - 2 * gap;
      var short = cell - 2 * gap;
      b.style.width = (piece.horiz ? long : short) + 'px';
      b.style.height = (piece.horiz ? short : long) + 'px';
      place(i, 0);
    });
    if (ghost) placeGhost();
    void el.tray.offsetWidth;
    requestAnimationFrame(function () { el.tray.classList.remove('still'); });
  }

  /** Put block i at its engine position, shifted `offset` px along its axis. */
  function place(i, offset) {
    var piece = game.pieces[i];
    var along = game.pos[i] * cell + offset;
    var across = piece.line * cell;
    var x = piece.horiz ? along : across;
    var y = piece.horiz ? across : along;
    blocks[i].style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  }

  function updateStats() {
    if (!game) return;
    el.moves.textContent = String(game.moves);
    el.target.textContent = String(game.puzzle.min);
    el.btnUndo.disabled = !game.history.length || game.solved;
    el.btnRestart.disabled = !game.history.length && !game.hints;
    el.btnHint.disabled = game.solved;
  }

  function announce(message) {
    el.live.textContent = '';
    // A fresh node each time so a repeated message is still read out.
    setTimeout(function () { el.live.textContent = message; }, 20);
  }

  // -------------------------------------------------------------------------
  // Moves
  // -------------------------------------------------------------------------

  function commit(i, to) {
    var from = game.pos[i];
    if (!Engine.slide(game, i, to)) { place(i, 0); return false; }
    clearHint();
    place(i, 0);
    blocks[i].setAttribute('aria-label', describe(i));
    updateStats();
    var dir = game.pieces[i].horiz ? (to > from ? 'right' : 'left') : (to > from ? 'down' : 'up');
    var dist = Math.abs(to - from);
    if (game.solved) solved();
    else announce('Moved ' + dir + ' ' + dist + '. ' + game.moves + ' move' + (game.moves === 1 ? '' : 's') + '.');
    return true;
  }

  function undo() {
    if (!game || !Engine.undo(game)) return;
    clearHint();
    game.pieces.forEach(function (piece, i) { place(i, 0); });
    labelBlocks();
    updateStats();
    announce('Undone. ' + game.moves + ' moves.');
  }

  function restart() {
    if (!game) return;
    cancelAdvance();
    Engine.restart(game);
    clearHint();
    el.finish.hidden = true;
    el.controls.hidden = false;
    blocks[Engine.RED].classList.remove('exiting');
    game.pieces.forEach(function (piece, i) { place(i, 0); });
    labelBlocks();
    updateStats();
    announce('Restarted.');
  }

  function showHint() {
    if (!game || game.solved) return;
    var key = Engine.keyOf(game.pos);
    var h = Engine.hint(game);
    if (!h) return;
    if (hintFor !== key) { game.hints++; hintFor = key; }
    clearHint(true);

    ghost = document.createElement('div');
    ghost.className = 'ghost';
    ghost.dataset.piece = String(h.piece);
    ghost.dataset.to = String(h.to);
    el.tray.appendChild(ghost);
    placeGhost();

    var b = blocks[h.piece];
    b.classList.remove('hinted');
    void b.offsetWidth; // restart the pulse
    b.classList.add('hinted');
    b.focus({ preventScroll: true });
    updateStats();
    var piece = game.pieces[h.piece];
    var dir = piece.horiz ? (h.to > game.pos[h.piece] ? 'right' : 'left') : (h.to > game.pos[h.piece] ? 'down' : 'up');
    announce('Hint: move the ' + describe(h.piece).replace(/^(Red|Wooden) block/, function (m) { return m.toLowerCase(); }) +
      ' ' + dir + ' ' + Math.abs(h.to - game.pos[h.piece]) + '. ' + h.remaining + ' moves from a solve.');
  }

  function placeGhost() {
    var i = Number(ghost.dataset.piece);
    var piece = game.pieces[i];
    var to = Number(ghost.dataset.to);
    var b = blocks[i];
    ghost.style.width = b.style.width;
    ghost.style.height = b.style.height;
    var x = piece.horiz ? to * cell : piece.line * cell;
    var y = piece.horiz ? piece.line * cell : to * cell;
    ghost.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  }

  function clearHint(keepCount) {
    if (ghost) { ghost.remove(); ghost = null; }
    blocks.forEach(function (b) { b.classList.remove('hinted'); });
    if (!keepCount) hintFor = null;
  }

  function solved() {
    var puzzle = game.puzzle;
    var previous = progress[puzzle.id];
    if (previous === undefined || game.moves < previous) {
      progress[puzzle.id] = game.moves;
      saveProgress();
    }

    // Out through the gap: two cells takes it clear of the wall.
    var red = blocks[Engine.RED];
    red.classList.add('exiting');
    place(Engine.RED, cell * 2 + Math.round(cell * FRAME));

    var perfect = game.moves <= puzzle.min;
    el.finishTitle.textContent = perfect ? 'Perfect' : 'Solved';
    var detail = game.moves + ' move' + (game.moves === 1 ? '' : 's') +
      (perfect ? ', the fewest possible.' : ' · par ' + puzzle.min + '.');
    if (game.hints) detail += ' ' + game.hints + ' hint' + (game.hints === 1 ? '' : 's') + '.';
    el.finishDetail.textContent = detail;
    var next = nextHash();
    el.finishNext.textContent = next ? 'Next: ' + nameOf(next) : 'Every pack done';
    el.crumb.textContent = perfect || isPerfect(puzzle) ? 'Solved perfectly' : 'Solved in ' + progress[puzzle.id];
    updateStats();
    announce('Solved in ' + game.moves + ' moves. ' + (perfect ? 'Perfect.' : 'Par is ' + puzzle.min + '.') +
      (next ? ' Next, ' + nameOf(next) + '.' : ''));

    // There is nothing to admire in a solved tray - it is mostly the absence
    // of the red block - so show the result briefly and carry on by itself.
    el.controls.hidden = true;
    el.finish.hidden = false;
    var still = reducedMotion && reducedMotion.matches;
    cancelAdvance();
    advanceTimer = setTimeout(function () {
      if (!game || !game.solved || game.puzzle !== puzzle || screen !== 'play') return;
      el.tray.classList.add('leaving');
      advanceTimer = setTimeout(function () {
        advanceTimer = null;
        if (!game || game.puzzle !== puzzle || screen !== 'play') return;
        if (next) replaceWith(next);
        else go('');
      }, still ? 0 : FADE_MS);
    }, ADVANCE_MS);
  }

  /** Leaving the screen, or restarting, calls off a pending advance. */
  function cancelAdvance() {
    clearTimeout(advanceTimer);
    advanceTimer = null;
    if (el.tray) el.tray.classList.remove('leaving');
  }

  /** The hash of the puzzle after this one, or null after the very last. */
  function nextHash() {
    var pack = PACKS[packIndex];
    if (puzzleIndex + 1 < pack.puzzles.length) return pack.id + '/' + (puzzleIndex + 2);
    if (packIndex + 1 < PACKS.length) return PACKS[packIndex + 1].id + '/1';
    return null;
  }

  function nameOf(hash) {
    var parts = hash.split('/');
    for (var i = 0; i < PACKS.length; i++) if (PACKS[i].id === parts[0]) return PACKS[i].name + ' ' + parts[1];
    return hash;
  }

  // -------------------------------------------------------------------------
  // Drag
  // -------------------------------------------------------------------------

  function onPointerDown(event) {
    if (!game || game.solved || drag) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    var b = event.currentTarget;
    var i = Number(b.dataset.piece);
    var piece = game.pieces[i];
    var r = Engine.pieceRange(game, i);
    drag = {
      i: i,
      id: event.pointerId,
      start: piece.horiz ? event.clientX : event.clientY,
      lo: (r.min - game.pos[i]) * cell,
      hi: (r.max - game.pos[i]) * cell,
      offset: 0,
      moved: false,
    };
    try { b.setPointerCapture(event.pointerId); } catch (err) { /* old browsers */ }
    b.addEventListener('pointermove', onPointerMove);
    b.addEventListener('pointerup', onPointerUp);
    b.addEventListener('pointercancel', onPointerUp);
    b.addEventListener('lostpointercapture', onPointerUp);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    var piece = game.pieces[drag.i];
    var delta = (piece.horiz ? event.clientX : event.clientY) - drag.start;
    if (!drag.moved && Math.abs(delta) < DRAG_SLOP) return;
    if (!drag.moved) {
      drag.moved = true;
      blocks[drag.i].classList.add('dragging');
    }
    // Clamped to the range worked out at the start: it stops against whatever
    // is in the way rather than passing through it.
    drag.offset = Math.max(drag.lo, Math.min(drag.hi, delta));
    place(drag.i, drag.offset);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    var d = drag;
    drag = null;
    var b = blocks[d.i];
    b.removeEventListener('pointermove', onPointerMove);
    b.removeEventListener('pointerup', onPointerUp);
    b.removeEventListener('pointercancel', onPointerUp);
    b.removeEventListener('lostpointercapture', onPointerUp);
    b.classList.remove('dragging');
    if (!d.moved) {
      // A tap picks the block for the keyboard.
      b.focus({ preventScroll: true });
      return;
    }
    var to = game.pos[d.i] + Math.round(d.offset / cell);
    if (event.type === 'pointercancel' || to === game.pos[d.i]) place(d.i, 0);
    else commit(d.i, to);
  }

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  var DIRS = {
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    ArrowUp: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
  };

  /**
   * Arrows along a block's own axis slide it one cell. Arrows across it move
   * focus to the nearest block that way, so the whole tray is reachable from
   * the arrow keys alone and there is no mode to toggle.
   */
  function onBlockKey(event) {
    var dir = DIRS[event.key];
    if (!dir || !game) return;
    event.preventDefault();
    event.stopPropagation();
    var i = Number(event.currentTarget.dataset.piece);
    var piece = game.pieces[i];
    var along = piece.horiz ? dir.dx : dir.dy;
    if (along) {
      if (game.solved) return;
      var to = game.pos[i] + along;
      var r = Engine.pieceRange(game, i);
      if (to >= r.min && to <= r.max) commit(i, to);
      else announce('Blocked.');
      return;
    }
    var j = neighbour(i, dir);
    if (j >= 0) blocks[j].focus({ preventScroll: true });
  }

  function centre(i) {
    var piece = game.pieces[i];
    var mid = game.pos[i] + piece.len / 2;
    return piece.horiz ? { x: mid, y: piece.line + 0.5 } : { x: piece.line + 0.5, y: mid };
  }

  function neighbour(i, dir) {
    var from = centre(i);
    var best = -1;
    var bestScore = Infinity;
    for (var j = 0; j < game.pieces.length; j++) {
      if (j === i) continue;
      var c = centre(j);
      var ahead = (c.x - from.x) * dir.dx + (c.y - from.y) * dir.dy;
      if (ahead <= 0.01) continue;
      var aside = Math.abs((c.x - from.x) * dir.dy) + Math.abs((c.y - from.y) * dir.dx);
      var score = ahead + aside * 2;
      if (score < bestScore) { bestScore = score; best = j; }
    }
    return best;
  }

  function onKeyDown(event) {
    if (screen !== 'play' || !game) return;
    var key = event.key;
    var mod = event.ctrlKey || event.metaKey;
    if ((key === 'z' || key === 'Z') && mod && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (mod || event.altKey) return; // leave the browser's own shortcuts alone
    if (key === 'u' || key === 'U') undo();
    else if (key === 'r' || key === 'R') restart();
    else if (key === 'h' || key === 'H') showHint();
    else if (DIRS[key] && document.activeElement && !document.activeElement.classList.contains('block')) {
      // Arrows with nothing picked pick the red block.
      event.preventDefault();
      blocks[Engine.RED].focus({ preventScroll: true });
    }
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  /**
   * Activate a button on a touch's pointerup as well as on click, whichever
   * comes first, ignoring the other for half a second.
   *
   * Back was reported as needing two taps on a phone. It is shown or moved at
   * the instant a tap ends (opening a pack or a puzzle), which is the same
   * shape as Linkgrid's finish-panel buttons, where a control appearing under
   * a finger as a touch ends missed the click from the next tap; this is the
   * fix that worked there. The dedupe matters doubly here: Back fired twice
   * would go up two levels. A pointerup only counts if the finger barely
   * moved, so a scroll that starts on the button is not a press.
   */
  function onActivate(button, handler) {
    var TAP_SLOP = 10;
    var RECENT_MS = 500;
    var firedAt = 0;
    var startX = 0;
    var startY = 0;

    function fire(event) {
      var now = Date.now();
      if (now - firedAt < RECENT_MS) return;
      firedAt = now;
      handler(event);
    }

    button.addEventListener('click', fire);
    button.addEventListener('pointerdown', function (event) {
      startX = event.clientX;
      startY = event.clientY;
    });
    button.addEventListener('pointerup', function (event) {
      if (event.pointerType === 'mouse') return; // a mouse's click is reliable
      if (Math.abs(event.clientX - startX) > TAP_SLOP || Math.abs(event.clientY - startY) > TAP_SLOP) return;
      fire(event);
    });
  }

  function collect() {
    [
      'bar', 'btnUp', 'title', 'crumb', 'playStats', 'moves', 'target',
      'screenPacks', 'screenList', 'screenPlay', 'packs', 'chips', 'continue', 'continueBtn',
      'trayArea', 'tray', 'controls', 'btnUndo', 'btnRestart', 'btnHint',
      'finish', 'finishTitle', 'finishDetail', 'finishNext', 'live',
    ].forEach(function (name) { el[name] = document.getElementById(name); });
  }

  function boot() {
    collect();
    if (!Engine || !PACKS || !el.tray) return;
    progress = loadProgress();

    onActivate(el.btnUp, upOneLevel);
    el.btnUndo.addEventListener('click', undo);
    el.btnRestart.addEventListener('click', restart);
    el.btnHint.addEventListener('click', showHint);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('hashchange', route);

    if (typeof ResizeObserver === 'function') new ResizeObserver(layout).observe(el.trayArea);
    else window.addEventListener('resize', layout);

    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
