import { Page, expect } from '@playwright/test';

/** Wednesday 2026-09-02 — a rest day in the seeded plan. */
export const WEDNESDAY = new Date('2026-09-02T09:00:00');
/** Monday 2026-08-31 — the seeded "Push" session. */
export const MONDAY = new Date('2026-08-31T09:00:00');
/** Saturday 2026-09-05 — outside the Mon–Fri plan. */
export const SATURDAY = new Date('2026-09-05T09:00:00');

/**
 * Load the app with a pinned date and a clean localStorage, so
 * every test starts from the seeded default plan.
 */
export async function openApp(page: Page, when: Date = WEDNESDAY) {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.clock.setFixedTime(when);
  // Clear once, on the first navigation only — later reloads in a test
  // must see the state the test just built, or persistence is untestable.
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.clear();
        sessionStorage.setItem('__seeded', '1');
      }
    } catch {}
  });
  await page.goto('/');
  // the catalog fetch must land before the first render is meaningful
  await expect(page.locator('#view-today')).toBeVisible();
  return errors;
}

export const tab = (page: Page, name: 'Today' | 'Plan' | 'Progress') =>
  page.locator(`.tab[data-nav="${name === 'Today' ? 'today' : name === 'Plan' ? 'week' : 'stats'}"]`);

export const sheet = (page: Page) => page.locator('.sheet-host:not([hidden]) .sheet');
