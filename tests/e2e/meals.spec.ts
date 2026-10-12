import { test, expect, Page } from '@playwright/test';
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
  const OLD_PLAN = [
    '5 boiled eggs, 3 okra, 200g rice',
    '160g chicken breast, 100g of rice, 2 okra/banana',
    '160g chicken breast, 200g of rice, 2 okra/banana',
    '160g chicken breast, 5 oakra',
  ];

  /** Load the app with the plan as it was saved before foods were itemised. */
  async function withOldPlan(page: Page) {
    const errors = await openApp(page, LUNCH);
    await page.evaluate(plan => {
      const s = JSON.parse(localStorage.getItem('weekplan.v1') || '{}');
      localStorage.setItem('weekplan.v1', JSON.stringify({ ...s, mealPlan: plan }));
    }, OLD_PLAN);
    await page.reload();
    await tab(page, 'Meals').click();
    return errors;
  }

  const macro = (page: Page, label: string) => page.locator('.macro').filter({ hasText: label });
  const search = (page: Page) => sheet(page).getByRole('searchbox', { name: 'Search foods' });

  test('an old text plan becomes foods with macros', async ({ page }) => {
    const errors = await withOldPlan(page);
    await expect(page.locator('.planmeal')).toHaveCount(4);
    const first = page.getByRole('article', { name: '1st meal' });
    await expect(first.locator('.food__name')).toContainText(['Egg, boiled', 'Okra', 'White rice (cooked)']);
    await expect(first.locator('.food__amt')).toHaveText(['5 pcs', '3 pcs', '200 g']);
    // chicken is weighed raw, and "oakra" still finds okra
    await expect(page.getByRole('article', { name: '4th meal' }).locator('.food__name'))
      .toContainText(['Chicken breast (raw)', 'Okra']);
    await expect(page.locator('.food__p').filter({ hasText: '—' })).toHaveCount(0);
    await expect(macro(page, 'Protein').locator('.macro__of')).toHaveText('of 156g');
    expect(errors).toEqual([]);
  });

  test('meals are ticked off and either/or foods are picked per day', async ({ page }) => {
    await withOldPlan(page);
    await expect(page.locator('.macros__head strong')).toHaveText('0 of 4 meals done');

    await page.getByRole('button', { name: '1st meal done' }).click();
    await expect(page.locator('.macros__head strong')).toHaveText('1 of 4 meals done');
    await expect(macro(page, 'Protein').locator('strong')).toHaveText('38');

    const second = page.getByRole('article', { name: '2nd meal' });
    await expect(second.getByRole('button', { name: '2 pcs Okra' })).toHaveAttribute('aria-pressed', 'true');
    await second.getByRole('button', { name: '2 pcs Banana' }).click();
    await expect(second.getByRole('button', { name: '2 pcs Banana' })).toHaveAttribute('aria-pressed', 'true');
    await expect(macro(page, 'Protein').locator('.macro__of')).toHaveText('of 158g');

    await page.reload();
    await tab(page, 'Meals').click();
    await expect(page.getByRole('button', { name: '1st meal done' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('article', { name: '2nd meal' }).getByRole('button', { name: '2 pcs Banana' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('a plan is built food by food', async ({ page }) => {
    const errors = await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    await sheet(page).getByRole('button', { name: 'Add food to 1st meal' }).click();
    await search(page).fill('chicken');
    await sheet(page).getByRole('button', { name: /Chicken breast \(raw\)/ }).click();

    await expect(sheet(page).locator('.sheet__title')).toHaveText('Meal plan');
    const amount = sheet(page).getByRole('spinbutton', { name: 'Amount of Chicken breast (raw)' });
    await amount.fill('160');
    await amount.blur();

    // an either/or
    await sheet(page).getByRole('button', { name: 'Add food to 1st meal' }).click();
    await search(page).fill('okra');
    await sheet(page).getByRole('button', { name: /^Okra/ }).click();
    await sheet(page).getByRole('button', { name: '+ or another food' }).nth(1).click();
    await search(page).fill('banana');
    await sheet(page).getByRole('button', { name: /^Banana/ }).click();
    await expect(sheet(page).locator('.mealedit__or')).toHaveCount(1);

    await sheet(page).getByRole('button', { name: 'Done' }).click();
    const meal = page.getByRole('article', { name: '1st meal' });
    await expect(meal.locator('.food__amt').first()).toHaveText('160 g');
    await expect(meal.locator('.food__p').first()).toHaveText('36g');
    await expect(meal.getByRole('button', { name: '1 pc Banana' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('foods can be found in the USDA database and are kept', async ({ page }) => {
    await page.route('https://api.nal.usda.gov/**', route => route.fulfill({
      json: { foods: [{
        fdcId: 2646170, dataType: 'Foundation', description: 'Salmon, Atlantic, wild, raw',
        foodNutrients: [
          { nutrientId: 1003, value: 19.8 }, { nutrientId: 1004, value: 6.34 },
          { nutrientId: 1005, value: -0.2 }, { nutrientId: 2048, value: 142 },
        ],
      }] },
    }));
    await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    await sheet(page).getByRole('button', { name: 'Add food to 1st meal' }).click();
    await search(page).fill('atlantic salmon');
    await sheet(page).getByRole('button', { name: 'Search USDA for "atlantic salmon"' }).click();
    const hit = sheet(page).getByRole('button', { name: /Salmon, Atlantic, wild, raw/ });
    await expect(hit).toContainText('19.8g protein · 142 kcal / 100 g');
    await hit.click();
    await sheet(page).getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.food__p').first()).toHaveText('19.8g');

    // next time it is one of "your foods", no network needed
    await page.getByRole('button', { name: 'Edit plan' }).click();
    await sheet(page).getByRole('button', { name: 'Add food to 1st meal' }).click();
    await search(page).fill('wild salmon');
    await expect(sheet(page).locator('.foodlist').first().getByRole('button', { name: /Salmon, Atlantic, wild, raw/ })).toBeVisible();
  });

  test('a used-up search limit points to the key in Settings', async ({ page }) => {
    await page.route('https://api.nal.usda.gov/**', route => route.fulfill({ status: 429, body: '' }));
    await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    await sheet(page).getByRole('button', { name: 'Add food to 1st meal' }).click();
    await search(page).fill('quinoa');
    await search(page).press('Enter');
    await expect(sheet(page).locator('.foodlist__note--error')).toContainText('key in Settings');
  });
});
