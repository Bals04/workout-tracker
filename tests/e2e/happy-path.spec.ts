import { test, expect } from '@playwright/test';
import { openApp, tab, sheet, WEDNESDAY, MONDAY, SATURDAY } from './helpers';

test.describe('Today view', () => {
  test('shows the seeded rest day on a Wednesday', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await expect(page.locator('.hero__title')).toHaveText('Rest');
    await expect(page.locator('.hero')).toHaveClass(/hero--rest/);
    await expect(page.locator('.restcard h3')).toBeVisible();
    // a rest day offers no set chips to tick
    await expect(page.locator('.setbtn')).toHaveCount(0);
  });

  test("shows Monday's Push session with tappable sets", async ({ page }) => {
    await openApp(page, MONDAY);
    await expect(page.locator('.hero__title')).toHaveText('Push');
    // 4 seeded exercises: 4 + 3 + 3 + 3 = 13 sets
    await expect(page.locator('.excard')).toHaveCount(4);
    await expect(page.locator('.setbtn')).toHaveCount(13);
    await expect(page.locator('.hero__sub')).toContainText('0');
    await expect(page.locator('.hero__sub')).toContainText('13');
  });

  test('a Saturday shows its own plan, a rest day by default', async ({ page }) => {
    await openApp(page, SATURDAY);
    await expect(page.locator('.hero__title')).toHaveText('Rest');
    await expect(page.locator('.hero--rest')).toBeVisible();
  });

  test('a weekend day turned into a training day shows its session', async ({ page }) => {
    await openApp(page, SATURDAY);
    await tab(page, 'Plan').click();
    await page.locator('#day-tab-sat').click();
    await page.getByRole('button', { name: 'Make training day' }).click();
    await page.getByRole('button', { name: 'Add exercise' }).click();
    await page.locator('.sheet .pickrow').first().click();
    await page.keyboard.press('Escape');
    await tab(page, 'Today').click();
    await expect(page.locator('.excard')).toHaveCount(1);
    await expect(page.locator('.setbtn').first()).toBeVisible();
  });
});

test.describe('Logging sets', () => {
  test('tapping a set records it and advances the ring', async ({ page }) => {
    await openApp(page, MONDAY);

    const first = page.locator('.setbtn').first();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await first.click();
    await expect(page.locator('.setbtn').first()).toHaveAttribute('aria-pressed', 'true');

    await expect(page.locator('.excard').first().locator('.excard__count')).toHaveText('1/4');
    await expect(page.locator('.ring__label strong')).toContainText('8%'); // 1 of 13
  });

  test('tapping again un-records the set', async ({ page }) => {
    await openApp(page, MONDAY);
    await page.locator('.setbtn').first().click();
    await expect(page.locator('.excard').first().locator('.excard__count')).toHaveText('1/4');
    await page.locator('.setbtn').first().click();
    await expect(page.locator('.excard').first().locator('.excard__count')).toHaveText('0/4');
  });

  test('completing every set marks the session complete', async ({ page }) => {
    await openApp(page, MONDAY);
    const count = await page.locator('.setbtn').count();
    for (let i = 0; i < count; i++) {
      await page.locator('.setbtn').nth(i).click();
    }
    await expect(page.locator('.ring__check')).toBeVisible();
    await expect(page.locator('.restcard h3')).toHaveText('Session complete');
    await expect(page.locator('.excard.is-complete')).toHaveCount(4);
  });

  test('logged sets survive a reload', async ({ page }) => {
    await openApp(page, MONDAY);
    await page.locator('.setbtn').first().click();
    await expect(page.locator('.excard').first().locator('.excard__count')).toHaveText('1/4');

    // reload without clearing storage this time
    await page.reload();
    await expect(page.locator('.excard').first().locator('.excard__count')).toHaveText('1/4');
  });
});

test.describe('Plan view', () => {
  test('lists Monday to Friday', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await tab(page, 'Plan').click();

    const cards = page.locator('.plan-tab');
    await expect(cards).toHaveCount(7);
    await expect(cards.nth(0)).toHaveAccessibleName('Monday');
    await expect(cards.nth(4)).toHaveAccessibleName('Friday');
    await expect(cards.nth(5)).toContainText('Rest');
    await expect(cards.nth(6)).toContainText('Rest');
    await expect(cards.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(cards.nth(2)).toHaveClass(/is-rest/);
  });

  test('shows exercises and planned volume per day', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await tab(page, 'Plan').click();
    await page.getByRole('tab', { name: 'Monday', exact: true }).click();
    await expect(page.locator('.day-board')).toContainText('4 exercises');
    await expect(page.locator('.plan-exercise')).toHaveCount(4);
    await expect(page.locator('.volume-badge strong')).toHaveText('3,038');
  });
});

test.describe('Progress view', () => {
  test('renders the week strip and stat tiles', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await tab(page, 'Progress').click();

    await expect(page.locator('.weekstrip__cell')).toHaveCount(7);
    await expect(page.locator('.stat')).toHaveCount(4);
    await expect(page.locator('.weekstrip__dot').nth(2)).toHaveAttribute('data-s', 'rest');
    await expect(page.locator('.empty h3')).toHaveText('No sessions yet');
  });

  test('a logged session appears in history and the stats', async ({ page }) => {
    await openApp(page, MONDAY);
    await page.locator('.setbtn').first().click();
    await page.locator('.setbtn').nth(1).click();

    await tab(page, 'Progress').click();
    await expect(page.locator('.histrow')).toHaveCount(1);
    await expect(page.locator('.histrow__title')).toHaveText('Push');
    // 2 sets logged
    await expect(page.locator('.stat').nth(1).locator('.stat__val')).toHaveText('2');
    // volume = 2 sets x 8 reps x 40 kg = 640 kg
    await expect(page.locator('.stat').nth(2)).toContainText('640');
  });
});
