// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Unjam in a real browser: layout budgets, drag, keyboard, a full solve,
 * hints, persistence and theme. The rules themselves are covered by
 * games/unjam/test (node games/unjam/test/run.js).
 *
 *   npx playwright test -c playwright.games.config.js
 *
 * Beginner 1 is
 *   ......
 *   ......
 *   ..AABC    <- exit row
 *   ..DDBC
 *   E...FF
 *   E.GGHH
 * and is solved by B up, C up, A right.
 */

const PAGE = '/games/unjam/';
const block = (page, i) => page.locator(`.block[data-piece="${i}"]`);

async function dragBy(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('block not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

async function cellSize(page) {
  return page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('tray')).getPropertyValue('--cell')));
}

// Every test gets a fresh browser context, so storage starts empty.

test('opens on the packs, full screen, with the way back to the games list', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page).toHaveTitle(/Unjam/);
  await expect(page.locator('.pack')).toHaveCount(4);
  await expect(page.locator('#site-header')).toBeHidden();
  await expect(page.locator('a.game-back')).toHaveAttribute('href', '/games/');
  await page.locator('.pack').first().click();
  await expect(page.locator('.chip')).toHaveCount(100);
  await expect(page.locator('a.game-back')).toBeVisible();
});

test('a phone in portrait gives the tray most of the width and does not scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PAGE + '#expert/100');
  const m = await page.evaluate(() => {
    const t = document.getElementById('tray').getBoundingClientRect();
    const c = document.getElementById('controls').getBoundingClientRect();
    return { share: t.width / innerWidth, scroll: document.documentElement.scrollHeight - innerHeight,
      controlsBottom: c.bottom, controlsHeight: c.height, h: innerHeight };
  });
  expect(m.share).toBeGreaterThanOrEqual(0.85);
  expect(m.scroll).toBeLessThanOrEqual(0);
  expect(m.controlsBottom).toBeLessThanOrEqual(m.h);
  expect(m.controlsHeight).toBeGreaterThanOrEqual(44);
});

test('a phone in landscape gives the tray most of the height', async ({ page }) => {
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto(PAGE + '#expert/100');
  const m = await page.evaluate(() => {
    const t = document.getElementById('tray').getBoundingClientRect();
    return { share: t.height / innerHeight, scrollY: document.documentElement.scrollHeight - innerHeight,
      scrollX: document.documentElement.scrollWidth - innerWidth };
  });
  expect(m.share).toBeGreaterThanOrEqual(0.8);
  expect(m.scrollY).toBeLessThanOrEqual(0);
  expect(m.scrollX).toBeLessThanOrEqual(0);
});

test('dragging slides a block and counts one move', async ({ page }) => {
  await page.goto(PAGE + '#beginner/1');
  const cell = await cellSize(page);
  await dragBy(page, block(page, 1), 0, -2 * cell);
  await expect(page.locator('#moves')).toHaveText('1');
  await expect(block(page, 1)).toHaveAttribute('aria-label', /column 5, rows 1 and 2/);
});

test('a drag stops at whatever is in the way', async ({ page }) => {
  await page.goto(PAGE + '#beginner/1');
  const cell = await cellSize(page);
  // D sits against B on its right; dragging it right goes nowhere.
  await dragBy(page, block(page, 3), 3 * cell, 0);
  await expect(page.locator('#moves')).toHaveText('0');
  await expect(block(page, 3)).toHaveAttribute('aria-label', /row 4, columns 3 and 4/);
  // And left it stops at the wall, however far the pointer goes.
  await dragBy(page, block(page, 3), -6 * cell, 0);
  await expect(block(page, 3)).toHaveAttribute('aria-label', /row 4, columns 1 and 2/);
});

/** Solve the open puzzle optimally, one arrow key at a time, as a player would. */
async function solveWithKeys(page) {
  await page.evaluate(() => {
    const E = window.UnjamEngine;
    const [pack, n] = location.hash.slice(1).split('/');
    const puzzle = window.UNJAM_PACKS.find((p) => p.id === pack).puzzles[Number(n) - 1];
    const q = E.parse(puzzle.board);
    const pos = q.pos.slice();
    for (const [i, to] of E.solve(q.pieces, q.pos).path) {
      const b = document.querySelector(`.block[data-piece="${i}"]`);
      while (pos[i] !== to) {
        const d = to > pos[i] ? 1 : -1;
        const key = q.pieces[i].horiz ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : (d > 0 ? 'ArrowDown' : 'ArrowUp');
        b.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        pos[i] += d;
      }
    }
  });
}

test('solving with the keyboard shows the result and records a perfect solve', async ({ page }) => {
  await page.goto(PAGE + '#beginner/1');
  await block(page, 1).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#moves')).toHaveText('1'); // two presses, one block: one move
  await block(page, 2).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await block(page, 0).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#finish')).toBeVisible();
  await expect(page.locator('#finishTitle')).toHaveText('Perfect');
  await expect(page.locator('#finishNext')).toHaveText('Next: Beginner 2');
  await expect(page.locator('#controls')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('unjam-progress'))).toBe('{"b1":3}');
});

test('a solve moves on to the next puzzle by itself, without a history entry', async ({ page }) => {
  await page.goto(PAGE + '#beginner');
  await page.locator('.chip').first().click();
  await expect(page.locator('#title')).toHaveText('Beginner 1');
  await solveWithKeys(page);
  await expect(page.locator('#finish')).toBeVisible();
  // Nothing pressed: it arrives on its own.
  await expect(page.locator('#title')).toHaveText('Beginner 2', { timeout: 4000 });
  await expect(page).toHaveURL(/#beginner\/2$/);
  await expect(page.locator('#moves')).toHaveText('0');
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('#finish')).toBeHidden();
  await expect(page.locator('#tray')).not.toHaveClass(/leaving/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('tray')).opacity)).toBe('1');
  // Back goes to the list, not to the puzzle just solved.
  await page.goBack();
  await expect(page.locator('#title')).toHaveText('Beginner');
  await expect(page.locator('.chip').first()).toHaveClass(/solved/);
  await expect(page.locator('.chip').first().locator('.star')).toHaveCount(1);
});

test('hints are counted in the result', async ({ page }) => {
  await page.goto(PAGE + '#beginner/1');
  for (let step = 0; step < 6 && await page.locator('#btnHint').isEnabled(); step++) {
    await page.locator('#btnHint').click();
    const ghost = page.locator('.ghost');
    const i = await ghost.getAttribute('data-piece');
    const to = Number(await ghost.getAttribute('data-to'));
    await page.evaluate(({ i, to }) => {
      // Walk the hinted block with its own arrow keys.
      const b = document.querySelector(`.block[data-piece="${i}"]`);
      const horiz = b.classList.contains('h');
      const label = b.getAttribute('aria-label');
      const at = Number((horiz ? label.match(/columns (\d)/) : label.match(/rows (\d)/))[1]) - 1;
      const d = to > at ? 1 : -1;
      const key = horiz ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : (d > 0 ? 'ArrowDown' : 'ArrowUp');
      for (let k = 0; k < Math.abs(to - at); k++) b.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }, { i, to });
    await page.waitForTimeout(50);
  }
  await expect(page.locator('#finish')).toBeVisible();
  await expect(page.locator('#finishDetail')).toContainText('3 hints');
});

test('Back during the pause stays on the list', async ({ page }) => {
  await page.goto(PAGE + '#beginner/1');
  await solveWithKeys(page);
  await expect(page.locator('#finish')).toBeVisible();
  await page.locator('#btnUp').click();
  await expect(page.locator('#title')).toHaveText('Beginner');
  await page.waitForTimeout(2500);
  await expect(page.locator('#title')).toHaveText('Beginner');
  await expect(page.locator('.chip')).toHaveCount(100);
});

test('after the very last puzzle it returns to the packs', async ({ page }) => {
  await page.goto(PAGE + '#expert/100');
  await solveWithKeys(page);
  await expect(page.locator('#finishNext')).toHaveText('Every pack done');
  await expect(page.locator('.pack')).toHaveCount(4, { timeout: 4000 });
});

test('a tap on Back goes up exactly one level, even when both tap and click arrive', async ({ page }) => {
  await page.goto(PAGE + '#beginner/5');
  const up = page.locator('#btnUp');
  const box = await up.boundingBox();
  if (!box) throw new Error('Back not visible');
  expect(box.height).toBeGreaterThanOrEqual(44);
  const at = { pointerId: 3, pointerType: 'touch', isPrimary: true,
    clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, bubbles: true };
  // A touch's release alone is a press - the click it should bring may never come.
  await up.dispatchEvent('pointerdown', at);
  await up.dispatchEvent('pointerup', at);
  await expect(page.locator('#title')).toHaveText('Beginner');
  // And when the click does come straight after, it is not a second press.
  await up.dispatchEvent('click');
  await page.waitForTimeout(100);
  await expect(page.locator('#title')).toHaveText('Beginner');
});

test('undo and restart', async ({ page }) => {
  await page.goto(PAGE + '#beginner/1');
  await block(page, 1).focus();
  await page.keyboard.press('ArrowUp');
  await block(page, 2).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#moves')).toHaveText('2');
  await page.keyboard.press('u');
  await expect(page.locator('#moves')).toHaveText('1');
  await expect(block(page, 2)).toHaveAttribute('aria-label', /rows 3 and 4/);
  await page.locator('#btnRestart').click();
  await expect(page.locator('#moves')).toHaveText('0');
  await expect(block(page, 1)).toHaveAttribute('aria-label', /rows 3 and 4/);
  await expect(page.locator('#btnUndo')).toBeDisabled();
});

test('the phone back gesture goes up a level, not out of the game', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('.pack').nth(2).click();
  await page.locator('.chip').nth(4).click();
  await expect(page.locator('#title')).toHaveText('Advanced 5');
  await page.goBack();
  await expect(page.locator('.chip')).toHaveCount(100);
  await expect(page.locator('#title')).toHaveText('Advanced');
});

test('the continue button returns to the last puzzle', async ({ page }) => {
  await page.goto(PAGE + '#intermediate/7');
  await page.goto(PAGE);
  await expect(page.locator('#continueBtn')).toContainText('Intermediate 7');
  await page.locator('#continueBtn').click();
  await expect(page.locator('#title')).toHaveText('Intermediate 7');
});

test('follows the site theme without a reload', async ({ page }) => {
  await page.goto(PAGE + '#beginner/1');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  const light = await bg();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const dark = await bg();
  expect(light).not.toBe(dark);
  expect(dark).toBe('rgb(22, 25, 29)');
});

test('sends nothing anywhere: every request is to this site', async ({ page, baseURL }) => {
  const hosts = new Set();
  page.on('request', (req) => hosts.add(new URL(req.url()).host));
  await page.goto(PAGE + '#beginner/1');
  await page.locator('#btnHint').click();
  await block(page, 1).focus();
  await page.keyboard.press('ArrowUp');
  expect([...hosts]).toEqual([new URL(String(baseURL)).host]);
});

test('a finger drag works like a mouse drag, and never scrolls the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PAGE + '#beginner/1');
  const touchAction = await page.evaluate(() => [
    getComputedStyle(document.getElementById('tray')).touchAction,
    getComputedStyle(document.querySelector('.block')).touchAction,
  ]);
  expect(touchAction).toEqual(['none', 'none']);

  const cell = await cellSize(page);
  const b = block(page, 1);
  const box = await b.boundingBox();
  if (!box) throw new Error('block not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const at = (dy) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y + dy, bubbles: true });
  await b.dispatchEvent('pointerdown', at(0));
  for (let k = 1; k <= 6; k++) await b.dispatchEvent('pointermove', at(-k * cell / 3));
  await b.dispatchEvent('pointerup', at(-2 * cell));
  await expect(page.locator('#moves')).toHaveText('1');
  await expect(b).toHaveAttribute('aria-label', /rows 1 and 2/);
});

test('a tap without a drag picks the block and moves nothing', async ({ page }) => {
  await page.goto(PAGE + '#beginner/1');
  await block(page, 2).click();
  await expect(page.locator('#moves')).toHaveText('0');
  await expect(block(page, 2)).toBeFocused();
  // Arrows across a block's axis move to a neighbour instead of sliding it.
  await page.keyboard.press('ArrowLeft');
  await expect(block(page, 1)).toBeFocused();
  await expect(page.locator('#moves')).toHaveText('0');
});
