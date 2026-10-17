import { test, expect } from '@playwright/test';
import { openApp, tab, sheet, WEDNESDAY, MONDAY } from './helpers';

async function openDay(page, index: number) {
  await tab(page, 'Plan').click();
  await page.locator('.plan-tab').nth(index).click();
  await page.getByRole('button', { name: 'Edit session', exact: true }).click();
  await expect(sheet(page)).toBeVisible();
}

test.describe('Day editor', () => {
  test('opens for the day you tapped', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await openDay(page, 0);
    await expect(page.locator('#sheet-title')).toHaveText('Monday');
    await expect(page.locator('#day-title')).toHaveValue('Push');
  });

  test('renaming the session sticks', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    await page.locator('#day-title').fill('Chest & Shoulders');
    await page.locator('#day-title').blur();
    await page.locator('[data-close-sheet]').last().click();

    await expect(page.locator('.day-board')).toContainText('Chest & Shoulders');
    await tab(page, 'Today').click();
    await expect(page.locator('.hero__title')).toHaveText('Chest & Shoulders');
  });

  test('sets and reps steppers change the target', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);

    const setsInput = page.locator('.editrow').first().getByLabel('Sets', { exact: true });
    await expect(setsInput).toHaveValue('4');
    await page.locator('.editrow').first()
      .getByRole('button', { name: 'Increase Sets' }).click();
    await expect(setsInput).toHaveValue('5');

    const repsInput = page.locator('.editrow').first().getByLabel('Reps', { exact: true });
    await expect(repsInput).toHaveValue('8');
    await page.locator('.editrow').first()
      .getByRole('button', { name: 'Decrease Reps' }).click();
    await expect(repsInput).toHaveValue('7');

    // the change reaches Today: 5 sets on the first exercise
    await page.locator('[data-close-sheet]').last().click();
    await tab(page, 'Today').click();
    await expect(page.locator('.excard').first().locator('.setbtn')).toHaveCount(5);
    await expect(page.locator('.excard').first().locator('.setbtn').first()).toContainText('7');
  });

  test('typing a value directly is clamped to the allowed range', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    const setsInput = page.locator('.editrow').first().getByLabel('Sets', { exact: true });
    await setsInput.fill('999');
    await setsInput.blur();
    await expect(setsInput).toHaveValue('20');   // max
    await setsInput.fill('0');
    await setsInput.blur();
    await expect(setsInput).toHaveValue('1');    // min
  });

  test('weight stepper uses 2.5 kg increments', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    const kg = page.locator('.editrow').first().getByLabel('Kg', { exact: true });
    await expect(kg).toHaveValue('40');
    await page.locator('.editrow').first().getByRole('button', { name: 'Increase Kg' }).click();
    await expect(kg).toHaveValue('42.5');
  });

  test('a timed exercise asks for seconds, not reps', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await openDay(page, 4);                                   // Friday, contains Plank
    const plank = page.locator('.editrow').filter({ hasText: 'Plank' });
    await expect(plank.getByLabel('Secs', { exact: true })).toHaveValue('45');
    await expect(plank.getByLabel('Reps', { exact: true })).toHaveCount(0);
  });

  test('removing an exercise drops it from the day', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    await expect(page.locator('.editrow')).toHaveCount(4);
    await page.locator('.editrow').first().getByRole('button', { name: /^Remove/ }).click();
    await expect(page.locator('.editrow')).toHaveCount(3);
    await expect(page.locator('.editrow').first()).toContainText('Overhead Press');
  });

  test('reordering moves an exercise up', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    await expect(page.locator('.editrow').nth(0)).toContainText('Bench Press');
    await page.locator('.editrow').nth(1).getByRole('button', { name: 'Move up' }).click();
    await expect(page.locator('.editrow').nth(0)).toContainText('Overhead Press');
    await expect(page.locator('.editrow').nth(1)).toContainText('Bench Press');
  });

  test('the first row cannot move up and the last cannot move down', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    await expect(page.locator('.editrow').first().getByRole('button', { name: 'Move up' })).toBeDisabled();
    await expect(page.locator('.editrow').last().getByRole('button', { name: 'Move down' })).toBeDisabled();
  });
});

test.describe('Rest days', () => {
  test('toggling rest on empties the day view', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);

    const toggle = page.getByRole('switch', { name: 'Rest day' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(page.getByRole('switch', { name: 'Rest day' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.empty h3')).toHaveText('Marked as a rest day');

    await page.locator('[data-close-sheet]').last().click();
    await tab(page, 'Today').click();
    await expect(page.locator('.hero')).toHaveClass(/hero--rest/);
    await expect(page.locator('.setbtn')).toHaveCount(0);
  });

  test('toggling rest off restores the exercises', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await openDay(page, 2);                                   // Wednesday, the rest day
    const toggle = page.getByRole('switch', { name: 'Rest day' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(page.locator('.empty h3')).toHaveText('No exercises yet');
  });

  test('adding an exercise to a rest day turns it into a training day', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await openDay(page, 2);
    await page.getByRole('button', { name: 'Add an exercise' }).click();
    await expect(page.locator('#sheet-title')).toHaveText('Add exercise');

    await page.getByLabel('Search exercises').fill('goblet squat');
    await expect(page.locator('.pickrow').first()).toContainText('Goblet Squat');
    await page.locator('.pickrow').first().click();
    await page.locator('[data-close-sheet]').last().click();   // back to the day editor

    await expect(page.getByRole('switch', { name: 'Rest day' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.editrow')).toHaveCount(1);
  });
});

test.describe('Exercise picker', () => {
  test('searches the library by name', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    await sheet(page).getByRole('button', { name: 'Add exercise' }).click();

    await page.getByLabel('Search exercises').fill('bulgarian');
    await expect(page.locator('.pickrow')).toHaveCount(2);
    // the plain name outranks the Smith-machine variant
    await expect(page.locator('.pickrow').nth(0)).toContainText('Bulgarian Split Squat');
    await expect(page.locator('.pickrow').nth(1)).toContainText('Smith Machine');
  });

  test('filters by muscle and by equipment', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    await sheet(page).getByRole('button', { name: 'Add exercise' }).click();

    await page.getByRole('button', { name: 'Biceps', exact: true }).click();
    const rows = page.locator('.pickrow');
    await expect(rows.first()).toContainText('Biceps');
    const bicepCount = await rows.count();
    expect(bicepCount).toBeGreaterThan(3);

    await page.getByRole('button', { name: 'Dumbbell', exact: true }).click();
    await expect(page.locator('.pickrow').first()).toContainText('Dumbbell');
    expect(await page.locator('.pickrow').count()).toBeLessThan(bicepCount);
  });

  test('reports when nothing matches', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    await sheet(page).getByRole('button', { name: 'Add exercise' }).click();
    await page.getByLabel('Search exercises').fill('zzzzqqq');
    await expect(page.locator('.empty h3')).toHaveText('Nothing found');
  });

  test('adding an exercise appends it with sensible defaults', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    await sheet(page).getByRole('button', { name: 'Add exercise' }).click();
    await page.getByLabel('Search exercises').fill('face pull');
    await expect(page.locator('.pickrow').first()).toContainText('Face Pull');
    await page.locator('.pickrow').first().click();
    await page.locator('[data-close-sheet]').last().click();

    await expect(page.locator('.editrow')).toHaveCount(5);
    const added = page.locator('.editrow').last();
    await expect(added).toContainText('Face Pull');
    await expect(added.getByLabel('Sets', { exact: true })).toHaveValue('3');
    await expect(added.getByLabel('Reps', { exact: true })).toHaveValue('10');
  });

  test('closing the picker returns to the day editor', async ({ page }) => {
    await openApp(page, MONDAY);
    await openDay(page, 0);
    await sheet(page).getByRole('button', { name: 'Add exercise' }).click();
    await expect(page.locator('#sheet-title')).toHaveText('Add exercise');
    await page.locator('[data-close-sheet]').last().click();
    await expect(page.locator('#sheet-title')).toHaveText('Monday');
  });
});

test.describe('Copy and clear', () => {
  test('copying a day replicates it onto another', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await openDay(page, 0);                                   // Monday / Push
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Thursday' }).click();
    await page.locator('[data-close-sheet]').last().click();

    await page.getByRole('tab', { name: 'Thursday', exact: true }).click();
    const thursday = page.locator('.day-board');
    await expect(thursday).toContainText('Push');
    await expect(thursday).toContainText('4 exercises');
  });

  test('clearing a day removes every exercise', async ({ page }) => {
    await openApp(page, WEDNESDAY);
    await openDay(page, 0);
    await page.getByRole('button', { name: 'Clear this day' }).click();
    await page.locator('.confirm-dialog').getByRole('button', { name: 'Clear day' }).click();
    await expect(page.locator('.empty h3')).toHaveText('No exercises yet');
  });
});

test('the V-Squat added to the library can be picked and shows its artwork', async ({ page }) => {
  await openApp(page, WEDNESDAY);
  await tab(page, 'Plan').click();
  await page.locator('#day-tab-mon').click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await sheet(page).getByRole('searchbox', { name: 'Search exercises' }).fill('v squat');
  // the hyphen does not matter, and the exact name ranks first
  const row = sheet(page).locator('.pickrow').first();
  await expect(row).toContainText('V-Squat');
  await expect(row).toContainText('Quads · Machine');
  const loaded = await row.locator('.exfig img').first().evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    return img.naturalWidth;
  });
  expect(loaded).toBe(512);
});

test('the Smith Machine Shoulder Press can be picked and shows both frames', async ({ page }) => {
  await openApp(page, WEDNESDAY);
  await tab(page, 'Plan').click();
  await page.locator('#day-tab-mon').click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await sheet(page).getByRole('searchbox', { name: 'Search exercises' }).fill('smith shoulder press');
  const row = sheet(page).locator('.pickrow').first();
  await expect(row).toContainText('Smith Machine Shoulder Press');
  await expect(row).toContainText('Shoulders · Machine');
  const sizes = await row.locator('.exfig img').evaluateAll(imgs =>
    Promise.all(imgs.map(async (img: HTMLImageElement) => { await img.decode(); return img.naturalWidth; })));
  expect(sizes).toEqual([512, 512]);
});
