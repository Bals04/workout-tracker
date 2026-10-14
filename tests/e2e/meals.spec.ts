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
    // tagging the meal is optional
    await cam.getByRole('button', { name: 'No meal' }).click();
    await shutter.click();

    await expect(cam).toHaveCount(0);
    await expect(sheet(page).locator('.sheet__title')).toHaveText('Meal saved');
    await expect(sheet(page).locator('.mealview__macros')).toHaveCount(0);
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

  test('a photo can be tagged with a planned meal, which carries its macros and ticks it off', async ({ page }) => {
    await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Snap a meal' }).click();
    const cam = page.getByRole('dialog', { name: 'Snap a meal' });

    // the next meal not yet eaten is suggested
    const meals = cam.getByRole('group', { name: /Which meal is this/ });
    await expect(meals.getByRole('button', { name: '1st meal' })).toHaveAttribute('aria-pressed', 'true');
    await meals.getByRole('button', { name: '1st meal' }).click();    // un-pick the suggestion
    await meals.getByRole('button', { name: '2nd meal' }).click();
    await expect(cam.locator('.cam__mealinfo')).toHaveText('2nd meal: 39g protein · 30g carbs · 5g fat · 330 kcal');
    await cam.getByRole('button', { name: 'Take photo' }).click();

    await expect(sheet(page).locator('.sheet__title')).toHaveText('2nd meal saved');
    await expect(sheet(page).locator('.mealview__macros')).toContainText('39g protein');
    await page.keyboard.press('Escape');

    await expect(page.getByRole('button', { name: '2nd meal done' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mealcard')).toHaveAccessibleName(/2nd meal at 12:34/);

    // the next snap suggests the 1st meal, still not eaten
    await page.getByRole('button', { name: 'Snap a meal' }).click();
    await expect(cam.getByRole('group', { name: /Which meal is this/ }).getByRole('button', { name: '1st meal' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('two meals eaten together go on one photo', async ({ page }) => {
    await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Snap a meal' }).click();
    const cam = page.getByRole('dialog', { name: 'Snap a meal' });
    const meals = cam.getByRole('group', { name: /Which meal is this/ });
    await meals.getByRole('button', { name: '1st meal' }).click();
    await meals.getByRole('button', { name: '2nd meal' }).click();
    await meals.getByRole('button', { name: '3rd meal' }).click();
    await expect(meals.getByRole('button', { name: 'No meal' })).toHaveAttribute('aria-pressed', 'false');
    // 39 + 42 g protein, 330 + 460 kcal
    await expect(cam.locator('.cam__mealinfo')).toHaveText('2nd + 3rd meal: 81g protein · 88g carbs · 9g fat · 790 kcal');
    await cam.getByRole('button', { name: 'Take photo' }).click();

    await expect(sheet(page).locator('.sheet__title')).toHaveText('2nd + 3rd meal saved');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '2nd meal done' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '3rd meal done' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '1st meal done' })).toHaveAttribute('aria-pressed', 'false');
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

  /** Start with no meals at all (the default plan file is withheld). */
  async function withEmptyPlan(page: Page) {
    // context-level, so requests the service worker makes are caught too
    await page.context().route('**/data/meal-plan.json', r => r.fulfill({ json: { meals: [] } }));
    const errors = await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    return errors;
  }

  const macro = (page: Page, label: string) => page.locator('.macro').filter({ hasText: label });
  const search = (page: Page) => sheet(page).getByRole('searchbox', { name: 'Search foods' });

  test('the default plan from data/meal-plan.json loads on first run', async ({ page }) => {
    const errors = await openApp(page, LUNCH);
    await tab(page, 'Meals').click();
    await expect(page.locator('.planmeal')).toHaveCount(4);
    await expect(page.getByRole('article', { name: '1st meal' }).locator('.food__amt')).toHaveText(['5 pcs', '3 pcs', '200 g']);
    await expect(page.getByRole('article', { name: '2nd meal' }).getByRole('button', { name: '2 pcs Banana' })).toBeVisible();
    await expect(macro(page, 'Protein').locator('.macro__of')).toHaveText('of 156g');

    // removing every meal does not bring the default back
    await page.getByRole('button', { name: 'Edit plan' }).click();
    for (let i = 0; i < 4; i++) {
      await sheet(page).getByRole('button', { name: /^Remove \d\w\w meal$/ }).first().click();
      await page.locator('dialog').getByRole('button', { name: 'Remove' }).click();
    }
    await page.keyboard.press('Escape');
    await page.reload();
    await tab(page, 'Meals').click();
    await expect(page.getByRole('button', { name: 'Build your meal plan' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a different plan on screen gets an offer to load the saved one', async ({ page }) => {
    // the situation that hid it: a one-meal plan built by hand before the file existed
    await openApp(page, LUNCH);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('weekplan.v1') || '{}');
      localStorage.setItem('weekplan.v1', JSON.stringify({ ...s, mealPlanSeeded: true, mealPlan: [
        { id: 'm1', items: [{ id: 'i1', options: [{ food: 'egg', name: 'Egg, boiled', amount: 5, unit: 'pcs' }] }] },
      ] }));
    });
    await page.reload();
    await tab(page, 'Meals').click();

    const offer = page.getByRole('region', { name: 'Your saved meal plan' });
    await expect(offer).toContainText('4 meals · 156g protein');
    await offer.getByRole('button', { name: 'Load it' }).click();
    await expect(page.locator('.planmeal')).toHaveCount(4);
    await expect(offer).toHaveCount(0);
  });

  test('"Not now" hides the offer for good', async ({ page }) => {
    await withOldPlan(page);
    await page.getByRole('button', { name: 'Edit plan' }).click();
    await sheet(page).getByRole('button', { name: 'Remove 4th meal' }).click();
    await page.locator('dialog').getByRole('button', { name: 'Remove' }).click();
    await page.keyboard.press('Escape');

    const offer = page.getByRole('region', { name: 'Your saved meal plan' });
    await offer.getByRole('button', { name: 'Not now' }).click();
    await expect(offer).toHaveCount(0);
    await page.reload();
    await tab(page, 'Meals').click();
    await expect(page.locator('.planmeal')).toHaveCount(3);
    await expect(offer).toHaveCount(0);
  });

  test('the default plan can be loaded on request over an existing one', async ({ page }) => {
    await withOldPlan(page);
    await page.getByRole('button', { name: 'Edit plan' }).click();
    await sheet(page).getByRole('button', { name: 'Remove 4th meal' }).click();
    await page.locator('dialog').getByRole('button', { name: 'Remove' }).click();
    await expect(sheet(page).locator('.mealedit')).toHaveCount(3);

    await sheet(page).getByRole('button', { name: 'Replace with my default plan' }).click();
    await page.locator('dialog').getByRole('button', { name: 'Replace' }).click();
    await expect(sheet(page).locator('.mealedit')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(macro(page, 'Protein').locator('.macro__of')).toHaveText('of 156g');
  });

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

  test('meals are ticked off, filling the ring, and either/or foods are picked per day', async ({ page }) => {
    await withOldPlan(page);
    await expect(page.locator('.macros__head strong')).toHaveText('0 of 4 meals done');
    await expect(page.locator('.donut')).toHaveAttribute('aria-label', 'Nothing eaten yet today');
    await expect(page.locator('.donut__arc')).toHaveCount(0);

    await page.getByRole('button', { name: '1st meal done' }).click();
    await expect(page.locator('.macros__head strong')).toHaveText('1 of 4 meals done');
    await expect(macro(page, 'Protein').locator('strong')).toHaveText('38');
    // three arcs, one per macro, sized by their share of calories
    await expect(page.locator('.donut__arc')).toHaveCount(3);
    await expect(page.locator('.donut')).toHaveAttribute('aria-label', /Calories eaten today: 659 of 1661\. Protein 23%, Carbs 39%, Fat 38%/);
    await expect(page.locator('.donut__center strong')).toHaveText('659');

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

  test('a plan is built food by food, sizing each as it is picked', async ({ page }) => {
    const errors = await withEmptyPlan(page);
    // an empty plan goes straight to choosing the first food
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    await expect(sheet(page).locator('.sheet__title')).toHaveText('Add to 1st meal');
    await search(page).fill('chicken');
    await sheet(page).getByRole('button', { name: /Chicken breast \(raw\)/ }).click();

    // amount step, with a live preview
    await sheet(page).getByRole('button', { name: '160 g' }).click();
    await expect(sheet(page).locator('.portion__preview')).toContainText('36g protein');
    await sheet(page).getByRole('button', { name: 'Add and pick another' }).click();

    await search(page).fill('okra');
    await sheet(page).getByRole('button', { name: /^Okra/ }).click();
    await sheet(page).getByRole('button', { name: '2', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Add to 1st meal' }).click();

    // back in the editor, then an either/or
    await expect(sheet(page).locator('.sheet__title')).toHaveText('Meal plan');
    await sheet(page).getByRole('button', { name: '+ or another food' }).nth(1).click();
    await search(page).fill('banana');
    await sheet(page).getByRole('button', { name: /^Banana/ }).click();
    await sheet(page).getByRole('button', { name: 'Add as the other choice' }).click();
    await expect(sheet(page).locator('.mealedit__or')).toHaveCount(1);

    await sheet(page).getByRole('button', { name: 'Done' }).click();
    const meal = page.getByRole('article', { name: '1st meal' });
    await expect(meal.locator('.food__amt')).toHaveText(['160 g', '2 pcs']);
    await expect(meal.locator('.food__p').first()).toHaveText('36g');
    await expect(meal.getByRole('button', { name: '1 pc Banana' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('typing "160g chicken breast" adds it in one go', async ({ page }) => {
    await withEmptyPlan(page);
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    await search(page).fill('160g chicken breast');
    await expect(sheet(page).locator('.foodpick--quick')).toContainText('Add 160 g Chicken breast (raw)');
    await search(page).press('Enter');
    await expect(sheet(page).locator('.sheet__title')).toHaveText('Meal plan');
    await expect(sheet(page).getByRole('spinbutton', { name: 'Amount of Chicken breast (raw)' })).toHaveValue('160');

    // "2 okra/banana" becomes an either/or
    await sheet(page).getByRole('button', { name: 'Add food to 1st meal' }).click();
    await search(page).fill('2 okra/banana');
    await sheet(page).locator('.foodpick--quick').click();
    await expect(sheet(page).locator('.mealedit__or')).toHaveCount(1);
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
    await withEmptyPlan(page);
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    await sheet(page).getByRole('tab', { name: 'USDA database' }).click();
    await search(page).fill('atlantic salmon');
    await sheet(page).getByRole('button', { name: 'Search USDA for "atlantic salmon"' }).click();
    const hit = sheet(page).getByRole('button', { name: /Salmon, Atlantic, wild, raw/ });
    await expect(hit).toContainText('19.8g protein · 142 kcal / 100 g');
    await hit.click();
    await sheet(page).getByRole('button', { name: 'Add to 1st meal' }).click();
    await sheet(page).getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.food__p').first()).toHaveText('19.8g');

    // next time it is one of "your foods", no network needed
    await page.getByRole('button', { name: 'Edit plan' }).click();
    await sheet(page).getByRole('button', { name: 'Add food to 1st meal' }).click();
    await sheet(page).getByRole('tab', { name: 'Your foods' }).click();
    await search(page).fill('wild salmon');
    await expect(sheet(page).locator('.foodlist').first().getByRole('button', { name: /Salmon, Atlantic, wild, raw/ })).toBeVisible();
  });

  test('foods come from one chosen source at a time', async ({ page }) => {
    await withEmptyPlan(page);
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    const tabs = sheet(page).getByRole('tablist', { name: 'Where to find the food' });
    await expect(tabs.getByRole('tab')).toHaveText(['Your foods', 'USDA database', 'Enter manually']);
    await expect(tabs.getByRole('tab', { name: 'Your foods' })).toHaveAttribute('aria-selected', 'true');
    await expect(sheet(page).locator('.foodpick').first()).toContainText('Egg, boiled');

    await tabs.getByRole('tab', { name: 'USDA database' }).click();
    await expect(sheet(page).locator('.foodpick')).toHaveCount(0);
    await expect(sheet(page).getByRole('button', { name: 'Type a food to search' })).toBeDisabled();

    await tabs.getByRole('tab', { name: 'Enter manually' }).click();
    await expect(search(page)).toHaveCount(0);
    await sheet(page).getByLabel('Food name').fill('Protein bar');
    await sheet(page).getByLabel('Protein (g / 100 g)').fill('33');
    await sheet(page).getByLabel('Carbs (g / 100 g)').fill('40');
    await sheet(page).getByLabel('Fat (g / 100 g)').fill('12');
    await sheet(page).getByRole('button', { name: 'Save food' }).click();
    // straight on to the amount
    await expect(sheet(page).locator('.portion__name')).toHaveText('Protein bar');
  });

  test('typos still find the food', async ({ page }) => {
    await withEmptyPlan(page);
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    for (const typo of ['chike', 'chiken', 'chikcen brest']) {
      await search(page).fill(typo);
      await expect(sheet(page).locator('.foodpick').first(), typo).toContainText('Chicken breast');
    }
    await search(page).fill('banan');
    await expect(sheet(page).locator('.foodpick').first()).toContainText('Banana');
  });

  test('a USDA search fixes spelling, and sends the food types the API accepts', async ({ page }) => {
    const urls: string[] = [];
    await page.route('https://api.nal.usda.gov/**', route => {
      urls.push(route.request().url());
      route.fulfill({ json: { foods: [{ fdcId: 1, dataType: 'Foundation', description: 'Chicken, breast, raw',
        foodNutrients: [{ nutrientId: 1003, value: 22.5 }, { nutrientId: 1008, value: 120 }] }] } });
    });
    await withEmptyPlan(page);
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    await sheet(page).getByRole('tab', { name: 'USDA database' }).click();
    await search(page).fill('chike brest');
    await search(page).press('Enter');
    await expect(sheet(page).locator('.foodlist')).toContainText('Showing results for "chicken breast".');
    const url = new URL(urls[0]);
    expect(url.searchParams.get('query')).toBe('chicken breast');
    // plain commas: the API answers 400 to %2C
    expect(urls[0]).toContain('dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)');
  });

  test('with your own key, USDA results come as you type', async ({ page }) => {
    let calls = 0;
    await page.route('https://api.nal.usda.gov/**', route => {
      calls++;
      route.fulfill({ json: { foods: [{ fdcId: 2, dataType: 'SR Legacy', description: 'Salmon, raw',
        foodNutrients: [{ nutrientId: 1003, value: 20 }, { nutrientId: 1008, value: 208 }] }] } });
    });
    await withEmptyPlan(page);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('weekplan.v1') || '{}');
      s.settings = { ...s.settings, usdaKey: 'test-key' };
      localStorage.setItem('weekplan.v1', JSON.stringify(s));
    });
    await page.reload();
    await tab(page, 'Meals').click();
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    await sheet(page).getByRole('tab', { name: 'USDA database' }).click();
    await search(page).pressSequentially('salmon', { delay: 30 });
    await expect(sheet(page).getByRole('button', { name: /Salmon, raw/ })).toBeVisible();
    expect(calls).toBe(1);      // one search after typing settles, not one per letter
    await expect(sheet(page).locator('.foodlist__hint')).toHaveCount(0);
  });

  test('a used-up search limit points to the key in Settings', async ({ page }) => {
    await page.route('https://api.nal.usda.gov/**', route => route.fulfill({ status: 429, body: '' }));
    await withEmptyPlan(page);
    await page.getByRole('button', { name: 'Build your meal plan' }).click();
    await search(page).fill('quinoa');
    await search(page).press('Enter');
    await expect(sheet(page).locator('.foodlist__note--error')).toContainText('key in Settings');
  });
});
