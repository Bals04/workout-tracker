import { test, expect } from '@playwright/test';
import { openApp, tab, MONDAY } from './helpers';

test('opens the plan by default with the local font and mascot', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#view-week')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('800 16px Montserrat'))).toBe(true);
  expect(await page.locator('.coach__mascot').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('clear-day confirmation cancels safely and updates totals after confirmation', async ({ page }) => {
  await openApp(page, MONDAY);
  await tab(page, 'Plan').click();
  const total = Number(await page.locator('.training-stat strong').first().textContent());
  await page.getByRole('button', { name: 'Clear day', exact: true }).click();
  const dialog = page.locator('.confirm-dialog');
  await expect(dialog).toHaveAccessibleName('Clear Monday');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.plan-exercise')).toHaveCount(4);
  await page.getByRole('button', { name: 'Clear day', exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear day' }).click();
  await expect(page.locator('.plan-exercise')).toHaveCount(0);
  await expect(page.locator('.training-stat strong').first()).toHaveText(String(total - 4));
  await page.reload();
  await expect(page.locator('.plan-exercise')).toHaveCount(0);
});

test('day tabs support keyboard navigation, and the weekend is editable', async ({ page }) => {
  await openApp(page, MONDAY);
  await tab(page, 'Plan').click();
  await page.getByRole('tab', { name: 'Monday', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Tuesday', exact: true })).toBeFocused();
  await expect(page.locator('.day-board h2')).toHaveText('Tuesday');
  await page.keyboard.press('End');
  await expect(page.locator('.day-board h2')).toHaveText('Sunday');
  // a rest day by default, with the same controls as any other day
  await expect(page.locator('.day-board')).toContainText('Make room for recovery');
  await page.getByRole('button', { name: 'Make training day' }).click();
  await expect(page.getByRole('tab', { name: 'Sunday', exact: true })).not.toHaveClass(/is-rest/);
  await expect(page.getByRole('button', { name: 'Add exercise' })).toBeVisible();
});

test('board add, delete and copy actions persist the plan', async ({ page }) => {
  await openApp(page, MONDAY);
  await tab(page, 'Plan').click();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByLabel('Search exercises').fill('plank');
  await page.locator('.pickrow').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.plan-exercise')).toHaveCount(5);
  await page.locator('.plan-exercise').last().getByRole('button', { name: /^Delete / }).click();
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.plan-exercise')).toHaveCount(4);
  await page.getByRole('button', { name: 'Copy day', exact: true }).click();
  await page.getByRole('button', { name: 'Wednesday', exact: true }).click();
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Replace day' }).click();
  await page.getByRole('tab', { name: 'Wednesday', exact: true }).click();
  await expect(page.locator('.plan-exercise')).toHaveCount(4);
  await page.reload();
  await page.getByRole('tab', { name: 'Wednesday', exact: true }).click();
  await expect(page.locator('.plan-exercise')).toHaveCount(4);
});
