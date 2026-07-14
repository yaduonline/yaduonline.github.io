// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Mobile Tetris Interaction Tests', () => {
  // Emulate an iPhone 12 viewport and touchscreen capability
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    // Go to the Tetris game page relative to baseURL
    await page.goto('/games/tetris/index.html');
    // Start game
    const restartBtn = page.locator('#restart-btn');
    await restartBtn.click();
  });

  test('should verify layout is split and visible on mobile viewport', async ({ page }) => {
    const leftBtn = page.locator('#btn-left');
    const rotateBtn = page.locator('#btn-rotate');
    const dropBtn = page.locator('#btn-drop');

    await expect(leftBtn).toBeVisible();
    await expect(rotateBtn).toBeVisible();
    await expect(dropBtn).toBeVisible();

    // Verify left and rotate buttons are split horizontally
    const leftBox = await leftBtn.boundingBox();
    const rotateBox = await rotateBtn.boundingBox();
    
    if (leftBox && rotateBox) {
      // Left button (control-pad) must be to the left of the rotate button (action-pad)
      expect(leftBox.x).toBeLessThan(rotateBox.x);
    }
  });

  test('should support continuous movement via press-and-hold (DAS)', async ({ page }) => {
    const leftBtn = page.locator('#btn-left');
    
    // Check initial position of active piece (typically around center, like x=4 or x=3)
    const initialX = await page.evaluate(() => window.state.activePiece.pos.x);
    expect(initialX).toBeDefined();

    // Get bounding box of the left button to dispatch mouse hold events
    const box = await leftBtn.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      
      // Move mouse to button and press down
      await page.mouse.move(x, y);
      await page.mouse.down();
      
      // Wait for 500ms (220ms initial DAS delay + multiple 50ms intervals)
      await page.waitForTimeout(500);
      
      // Release mouse
      await page.mouse.up();
      
      // Check active piece position after hold
      const activeX = await page.evaluate(() => window.state.activePiece.pos.x);
      
      // If auto-repeat worked, it should have moved multiple steps to the left
      // A single click would move by -1 (typically resulting in x=3 or x=2),
      // whereas holding for 500ms should move it to the wall (x=0 or x=-1 depending on block type)
      expect(activeX).toBeLessThan(initialX - 1);
    }
  });
});
