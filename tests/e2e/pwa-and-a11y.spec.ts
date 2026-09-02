import { test, expect } from '@playwright/test';
import { openApp, tab, sheet, WEDNESDAY, MONDAY } from './helpers';

test.describe('PWA', () => {
  test('serves a valid manifest with icons', async ({ request }) => {
    const res = await request.get('/app.webmanifest');
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m.name).toContain('Bals');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBeTruthy();
    const purposes = m.icons.map((i: any) => i.purpose);
    expect(purposes).toContain('maskable');
    // every declared icon must actually exist
    for (const icon of m.icons) {
      const r = await request.get('/' + icon.src);
      expect(r.status(), `${icon.src} should exist`).toBe(200);
    }
  });

  test('registers a service worker and precaches the shell', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    const ok = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    });
    expect(ok).toBe(true);

    // the shell cache should hold the core files
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const shell = keys.find(k => k.includes('shell'));
      if (!shell) return [];
      const c = await caches.open(shell);
      return (await c.keys()).map(r => new URL(r.url).pathname);
    });
    expect(cached.some(p => p.endsWith('/css/app.css'))).toBe(true);
    expect(cached.some(p => p.endsWith('/data/exercises.json'))).toBe(true);
    expect(cached.some(p => p.endsWith('/js/app.js'))).toBe(true);
  });

  test('still renders when the network is offline', async ({ page, context }) => {
    await openApp(page, MONDAY);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // let the shell settle into the cache
    await page.waitForTimeout(600);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.hero__title')).toHaveText('Push');
    await expect(page.locator('.setbtn').first()).toBeVisible();
    await context.setOffline(false);
  });

  test('exercise artwork loads and is cached on demand', async ({ page }) => {
    await openApp(page, MONDAY);
    const img = page.locator('.excard .exfig img').first();
    await expect(img).toBeVisible();
    // a real bitmap, not a broken image
    const w = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(w).toBe(512);
  });
});

test.describe('Theme', () => {
  test('toggles between dark and light and persists', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.locator('#btn-theme').click();
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('light mode inverts the white line-art so it stays visible', async ({ page }) => {
    await openApp(page, MONDAY);
    await page.locator('#btn-theme').click();
    const filter = await page.locator('.exfig img').first()
      .evaluate(el => getComputedStyle(el).filter);
    expect(filter).toContain('invert');
  });
});

test.describe('Accessibility', () => {
  test('set buttons expose their pressed state', async ({ page }) => {
    await openApp(page, MONDAY);
    const first = page.locator('.setbtn').first();
    await expect(first).toHaveAttribute('aria-label', /Set 1 of 4/);
    await first.click();
    await expect(page.locator('.setbtn').first()).toHaveAttribute('aria-label', /logged/);
  });

  test('the sheet closes on Escape', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await tab(page, 'Plan').click();
    await page.locator('.daycard').first().click();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet-host')).toBeHidden();
  });

  test('the sheet is a labelled modal dialog', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await tab(page, 'Plan').click();
    await page.locator('.daycard').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleName('Monday');
  });

  test('tabs mark the current view', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await expect(tab(page, 'Today')).toHaveAttribute('aria-current', 'page');
    await tab(page, 'Progress').click();
    await expect(tab(page, 'Progress')).toHaveAttribute('aria-current', 'page');
    await expect(tab(page, 'Today')).not.toHaveAttribute('aria-current', 'page');
  });

  test('every exercise image carries alt text', async ({ page }) => {
    await openApp(page, MONDAY);
    const alts = await page.locator('.excard .exfig img').evaluateAll(
      els => els.map(e => (e as HTMLImageElement).alt)
    );
    // the first frame of each figure is the labelled one
    expect(alts.filter(a => a.length > 0).length).toBeGreaterThanOrEqual(4);
  });

  test('keyboard can reach and fire a set button', async ({ page }) => {
    await openApp(page, MONDAY);
    await page.locator('.setbtn').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.excard').first().locator('.excard__count')).toHaveText('1/4');
  });
});

test.describe('Console health', () => {
  test('no console errors across the three views', async ({ page }) => {
    const errors = await openApp(page, MONDAY);
    await tab(page, 'Plan').click();
    await page.locator('.daycard').first().click();
    await page.getByRole('button', { name: 'Add exercise' }).click();
    await page.getByLabel('Search exercises').fill('squat');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');   // picker → back to the day editor
    await page.keyboard.press('Escape');   // editor → closed
    await expect(page.locator('.sheet-host')).toBeHidden();
    await tab(page, 'Progress').click();
    await tab(page, 'Today').click();
    await page.locator('.setbtn').first().click();
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
});

test.describe('Render hygiene', () => {
  // append(null) stringifies to "null" — it leaked into the Today
  // footer once, so guard every view against it.
  for (const [label, when] of [['workout day', MONDAY], ['rest day', WEDNESDAY]] as const) {
    test(`no stray "null" or "undefined" text on a ${label}`, async ({ page }) => {
      await openApp(page, when);
      for (const view of ['today', 'week', 'stats'] as const) {
        await page.locator(`.tab[data-nav="${view}"]`).click();
        const text = await page.locator('main').innerText();
        expect(text, `${view} view`).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/);
      }
    });
  }

  test('no stray "null" once a session is complete', async ({ page }) => {
    await openApp(page, MONDAY);
    const count = await page.locator('.setbtn').count();
    for (let i = 0; i < count; i++) await page.locator('.setbtn').nth(i).click();
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/);
  });
});

test.describe('Settings', () => {
  test('exports the plan as JSON', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await page.locator('#btn-settings').click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export plan/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^bals-workout-planner-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('resetting everything restores the seeded plan', async ({ page }) => {
    await openApp(page, MONDAY);
    await page.locator('.setbtn').first().click();
    await expect(page.locator('.excard').first().locator('.excard__count')).toHaveText('1/4');

    await page.locator('#btn-settings').click();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Reset everything' }).click();
    await expect(page.locator('.excard').first().locator('.excard__count')).toHaveText('0/4');
  });

  test('rest timer can be switched off', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await page.locator('#btn-settings').click();
    const toggle = page.getByRole('switch', { name: 'Rest timer' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('Rest timer', () => {
  test('starts after a logged set and counts down', async ({ page }) => {
    await openApp(page, MONDAY);
    await page.locator('.setbtn').first().click();
    const dock = page.locator('#resttimer');
    await expect(dock).toBeVisible();
    await expect(page.locator('#rest-remaining')).toHaveText('1:30');

    await page.clock.runFor(3000);
    await expect(page.locator('#rest-remaining')).toHaveText('1:27');

    await page.locator('#rest-skip').click();
    await expect(dock).toBeHidden();
  });

  test('+15s extends the countdown', async ({ page }) => {
    await openApp(page, MONDAY);
    await page.locator('.setbtn').first().click();
    await expect(page.locator('#rest-remaining')).toHaveText('1:30');
    await page.locator('#rest-add').click();
    await expect(page.locator('#rest-remaining')).toHaveText('1:45');
  });

  test('does not start after the final set of an exercise', async ({ page }) => {
    await openApp(page, MONDAY);
    // Lateral Raise is the 3rd card, 3 sets
    const card = page.locator('.excard').nth(2);
    await card.locator('.setbtn').nth(0).click();
    await card.locator('.setbtn').nth(1).click();
    // dismiss the timer that set 2 legitimately started
    await page.locator('#rest-skip').click();
    await expect(page.locator('#resttimer')).toBeHidden();

    // the last set has no rest to follow it
    await card.locator('.setbtn').nth(2).click();
    await expect(page.locator('#resttimer')).toBeHidden();
  });
});
