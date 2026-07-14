// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Tetris Game tests', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the Tetris game page relative to baseURL
    await page.goto('/games/tetris/index.html');
  });

  test('should load the page and show correct elements', async ({ page }) => {
    // Check that title is correct
    await expect(page).toHaveTitle(/Tetris/);

    // Verify main gameplay canvases are visible
    const tetrisCanvas = page.locator('#tetris-canvas');
    await expect(tetrisCanvas).toBeVisible();

    const nextCanvas = page.locator('#next-canvas');
    await expect(nextCanvas).toBeVisible();

    // Verify score elements
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#level')).toHaveText('1');
  });

  test('should allow clicking restart button', async ({ page }) => {
    const restartBtn = page.locator('#restart-btn');
    await expect(restartBtn).toBeVisible();
    await restartBtn.click();
    
    // Verify score resets or is set to 0
    await expect(page.locator('#score')).toHaveText('0');
  });
});
