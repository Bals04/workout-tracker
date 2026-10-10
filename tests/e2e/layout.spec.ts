import { test, expect } from '@playwright/test';
import { openApp, tab, sheet, MONDAY, WEDNESDAY } from './helpers';

/**
 * Layout regressions are easy to miss by eye, so measure instead.
 * A two-digit rep target once rendered as "1" because the stepper
 * input was squeezed below its content width.
 */
test.describe('Layout integrity', () => {
  test('no stepper clips its value', async ({ page }) => {
    await openApp(page, MONDAY);
    await tab(page, 'Plan').click();
    await page.getByRole('tab', { name: 'Monday', exact: true }).click();
    await page.getByRole('button', { name: 'Edit session', exact: true }).click();
    await expect(sheet(page)).toBeVisible();

    const clipped = await page.locator('.stepper input').evaluateAll(els =>
      els
        .map(el => {
          const i = el as HTMLInputElement;
          // width needed for the text vs width actually available
          const probe = document.createElement('span');
          probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
          const cs = getComputedStyle(i);
          probe.style.font = cs.font;
          probe.style.letterSpacing = cs.letterSpacing;
          probe.textContent = i.value;
          document.body.append(probe);
          const needed = probe.getBoundingClientRect().width;
          probe.remove();
          return { value: i.value, needed, available: i.clientWidth };
        })
        .filter(r => r.needed > r.available - 1)
    );
    expect(clipped, `clipped steppers: ${JSON.stringify(clipped)}`).toEqual([]);
  });

  test('the page never scrolls sideways', async ({ page }) => {
    for (const when of [MONDAY, WEDNESDAY]) {
      await openApp(page, when);
      for (const view of ['today', 'week', 'stats'] as const) {
        await page.locator(`.tab[data-nav="${view}"]`).click();
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, `${view} view overflows`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('tap targets on the set chips are big enough for a thumb', async ({ page }) => {
    await openApp(page, MONDAY);
    const boxes = await page.locator('.setbtn').evaluateAll(els =>
      els.map(e => {
        const r = e.getBoundingClientRect();
        return { w: r.width, h: r.height };
      })
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.h).toBeGreaterThanOrEqual(36);
      expect(b.w).toBeGreaterThanOrEqual(44);
    }
  });

  test('the rest timer does not cover the bottom navigation', async ({ page }) => {
    await openApp(page, MONDAY);
    await page.locator('.setbtn').first().click();
    await expect(page.locator('#resttimer')).toBeVisible();

    // the dock slides up on a `both`-filled animation; measuring
    // mid-flight reads its off-screen start position
    await page.locator('#resttimer').evaluate(el =>
      Promise.all(el.getAnimations().map(a => a.finished))
    );

    const [dock, bar] = await Promise.all([
      page.locator('#resttimer').boundingBox(),
      page.locator('.tabbar').boundingBox(),
    ]);
    expect(dock!.y + dock!.height).toBeLessThanOrEqual(bar!.y + 1);
  });

  test('long session names do not break the hero', async ({ page }) => {
    await openApp(page, MONDAY);
    await tab(page, 'Plan').click();
    await page.getByRole('tab', { name: 'Monday', exact: true }).click();
    await page.getByRole('button', { name: 'Edit session', exact: true }).click();
    await page.locator('#day-title').fill('Supercalifragilistic Chest Shoulders Triceps Session');
    await page.locator('#day-title').blur();
    await page.keyboard.press('Escape');
    await tab(page, 'Today').click();

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Tab switching on a phone', () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test('each tab shows its own content on the first screen', async ({ page }) => {
    await openApp(page, MONDAY);
    for (const [name, view] of [['Today', 'today'], ['Meals', 'meals'], ['Progress', 'stats']] as const) {
      await tab(page, name).click();
      const top = await page.locator(`#view-${view}`).evaluate(el => el.getBoundingClientRect().top);
      expect(top, `${name} content starts on screen`).toBeLessThan(400);
    }
    // the plan keeps its header
    await tab(page, 'Plan').click();
    await expect(page.locator('.training-intro')).toBeVisible();
  });
});
