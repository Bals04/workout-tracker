import { test, expect } from '@playwright/test';
import { openApp, tab, sheet, MONDAY } from './helpers';

/* Chromium's fake device stands in for the phone camera. */
test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

const LUNCH = new Date('2026-08-31T12:34:00');

test.describe('Meal check-in', () => {
  test('starts empty with a camera button', async ({ page }) => {
    const errors = await openApp(page, MONDAY);
    await tab(page, 'Meals').click();
    await expect(page.locator('#view-meals')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No meals yet today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Snap a meal' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a snapped meal is stamped with the time and kept after reload', async ({ page }) => {
    const errors = await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Snap a meal' }).click();

    const cam = page.getByRole('dialog', { name: 'Snap a meal' });
    await expect(cam).toBeVisible();
    const shutter = cam.getByRole('button', { name: 'Take photo' });
    await expect(shutter).toBeEnabled();
    await shutter.click();

    await expect(cam).toHaveCount(0);
    await expect(sheet(page).locator('.sheet__title')).toHaveText('Meal saved');
    await expect(sheet(page).locator('.mealview__stamp')).toContainText('12:34');
    await expect(sheet(page).getByRole('button', { name: 'Send to coach' })).toBeVisible();

    // the photo itself is a real, decoded JPEG
    const size = await sheet(page).locator('.mealview').evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    expect(size.w).toBeGreaterThan(100);
    expect(size.h).toBeGreaterThan(100);

    await page.keyboard.press('Escape');
    await expect(page.locator('.mealcard')).toHaveCount(1);
    await expect(page.locator('.mealcard')).toHaveAccessibleName(/Meal at 12:34/);

    await page.reload();
    await tab(page, 'Meals').click();
    await expect(page.locator('.mealcard')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('closing the camera saves nothing and releases it', async ({ page }) => {
    await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Snap a meal' }).click();
    const cam = page.getByRole('dialog', { name: 'Snap a meal' });
    await expect(cam.getByRole('button', { name: 'Take photo' })).toBeEnabled();
    await cam.getByRole('button', { name: 'Close camera' }).click();
    await expect(cam).toHaveCount(0);
    await expect(page.locator('.mealcard')).toHaveCount(0);
    await expect(page.locator('.app')).not.toHaveAttribute('inert', /.*/);
  });

  test('save to gallery downloads the stamped photo', async ({ page }) => {
    await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Snap a meal' }).click();
    await page.getByRole('button', { name: 'Take photo' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      sheet(page).getByRole('button', { name: 'Save to gallery' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^meal-2026-08-31-1234\d\d\.jpg$/);
    await expect(page.locator('#toast')).toContainText('Saved to Downloads');
  });

  test('a meal can be deleted', async ({ page }) => {
    await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Snap a meal' }).click();
    await page.getByRole('button', { name: 'Take photo' }).click();
    await sheet(page).getByRole('button', { name: 'Delete' }).click();
    await page.locator('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.mealcard')).toHaveCount(0);
  });
});

test.describe('Save to gallery on iPhone', () => {
  // iOS has no download-to-Photos route for web apps, only the share sheet's "Save Image"
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });

  test('opens the share sheet with the photo', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__shared = [];
      navigator.canShare = () => true;
      navigator.share = async (data: any) => { (window as any).__shared.push(data.files.map((f: File) => [f.name, f.type])); };
    });
    await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Snap a meal' }).click();
    await page.getByRole('button', { name: 'Take photo' }).click();
    await sheet(page).getByRole('button', { name: 'Save to gallery' }).click();
    await expect(page.locator('#toast')).toContainText('Save Image');
    const shared = await page.evaluate(() => (window as any).__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0][0][1]).toBe('image/jpeg');
  });
});

test.describe('Meal plan', () => {
  const PLAN = [
    '5 boiled eggs, 3 okra, 200g rice',
    '160g chicken breast, 100g of rice, 2 okra/banana',
    '160g chicken breast, 200g of rice, 2 okra/banana',
    '160g chicken breast, 5 okra',
  ];

  test('meals can be written down, numbered and kept', async ({ page }) => {
    const errors = await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Add your meals' }).click();

    for (let i = 0; i < PLAN.length; i++) {
      if (i) await sheet(page).getByRole('button', { name: /^Add \d+\w\w meal$/ }).click();
      await sheet(page).locator('textarea').nth(i).fill(PLAN[i]);
    }
    // a blank extra meal is dropped on close
    await sheet(page).getByRole('button', { name: 'Add 5th meal' }).click();
    await sheet(page).getByRole('button', { name: 'Done' }).click();

    const rows = page.locator('.mealplan__row');
    await expect(rows).toHaveCount(4);
    await expect(page.locator('.mealplan__n')).toHaveText(['1st meal', '2nd meal', '3rd meal', '4th meal']);
    await expect(page.locator('.mealplan__food')).toHaveText(PLAN);

    await page.reload();
    await tab(page, 'Meals').click();
    await expect(page.locator('.mealplan__food')).toHaveText(PLAN);

    // remove the 2nd meal; the rest renumber
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Remove 2nd meal' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mealplan__food')).toHaveText([PLAN[0], PLAN[2], PLAN[3]]);
    await expect(page.locator('.mealplan__n')).toHaveText(['1st meal', '2nd meal', '3rd meal']);
    expect(errors).toEqual([]);
  });
});
