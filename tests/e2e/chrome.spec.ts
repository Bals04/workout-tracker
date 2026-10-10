import { test, expect } from '@playwright/test';
import { openApp, tab, WEDNESDAY, MONDAY } from './helpers';

test.describe('Top bar', () => {
  test('shows the product name', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await expect(page.locator('.brand__name')).toHaveText('Bals workout planner');
    await expect(page.locator('.brand__meta')).toHaveCount(0);
    // One page heading, with the product brand in the app bar.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gym Progress Tracker');
    await expect(page).toHaveTitle(/Bals workout planner v1\.0/);
  });

  test('the brand name is not truncated at phone width', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    const clipped = await page.locator('.brand__name').evaluate(
      el => el.scrollWidth > el.clientWidth + 1
    );
    expect(clipped, 'brand name is ellipsised — shorten it or the bar').toBe(false);
  });

  test('the brand tile keeps its contrast in both themes', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.locator('#btn-theme').click();
      const { bg, fg } = await page.locator('.brand__tile').evaluate(el => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, fg: cs.color };
      });
      expect(bg, `${theme} tile background`).not.toBe('rgba(0, 0, 0, 0)');
      expect(fg).not.toBe(bg);
    }
  });

  test('header actions stay reachable beside a long name', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    const [brand, actions] = await Promise.all([
      page.locator('.brand').boundingBox(),
      page.locator('.appbar__actions').boundingBox(),
    ]);
    // no overlap between the lockup and the buttons
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(actions!.x + 1);
    await expect(page.locator('#btn-theme')).toBeVisible();
    await expect(page.locator('#btn-settings')).toBeVisible();
  });
});

test.describe('Bottom bar', () => {
  test('the indicator sits behind the active tab', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    const pill = page.locator('.tabbar__pill');
    await expect(page.locator('.tabbar')).toHaveClass(/is-ready/);

    const settle = () => page.locator('.tabbar__pill').evaluate(
      el => Promise.all(el.getAnimations().map(a => a.finished))
    );
    await settle();

    for (const view of ['today', 'week', 'meals', 'stats'] as const) {
      await page.locator(`.tab[data-nav="${view}"]`).click();
      await settle();
      const [p, t] = await Promise.all([
        pill.boundingBox(),
        page.locator(`.tab[data-nav="${view}"]`).boundingBox(),
      ]);
      // within a pixel of the active tab's box
      expect(Math.abs(p!.x - t!.x), `${view} x`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(p!.width - t!.width), `${view} width`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(p!.y - t!.y), `${view} y`).toBeLessThanOrEqual(1.5);
    }
  });

  test('the indicator follows a viewport resize', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await tab(page, 'Progress').click();
    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForTimeout(450);

    const [p, t] = await Promise.all([
      page.locator('.tabbar__pill').boundingBox(),
      page.locator('.tab[data-nav="stats"]').boundingBox(),
    ]);
    expect(Math.abs(p!.x - t!.x)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(p!.width - t!.width)).toBeLessThanOrEqual(1.5);
  });

  test('every tab is a comfortable tap target', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    const boxes = await page.locator('.tab').evaluateAll(els =>
      els.map(e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; })
    );
    expect(boxes).toHaveLength(4);
    for (const b of boxes) {
      expect(b.h).toBeGreaterThanOrEqual(48);
      expect(b.w).toBeGreaterThanOrEqual(48);
    }
  });

  test('labels and icons are all present', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await expect(page.locator('.tab__label')).toHaveText(['Today', 'Plan', 'Meals', 'Progress']);
    await expect(page.locator('.tab__icon svg')).toHaveCount(4);
  });

  test('the bar does not cover page content', async ({ page }) => {
    await openApp(page, MONDAY);
    // the last thing in the scroll area must clear the fixed bar
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(150);
    const [credit, bar] = await Promise.all([
      page.locator('.credit').boundingBox(),
      page.locator('.tabbar').boundingBox(),
    ]);
    expect(credit!.y + credit!.height).toBeLessThanOrEqual(bar!.y + 1);
  });

  test('the active tab is the only one marked current', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await tab(page, 'Plan').click();
    await expect(page.locator('.tab[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.tab[aria-current="page"] .tab__label')).toHaveText('Plan');
  });
});
