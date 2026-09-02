/* Screenshots for a quick visual pass. node tools/shots.js */
const { chromium, devices } = require('@playwright/test');
const path = require('path');

const OUT = path.join(__dirname, '..', 'test-results', 'shots');
const MONDAY = new Date('2026-08-31T09:00:00');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(MONDAY);
  await page.goto('http://localhost:5173/');
  await page.waitForSelector('.setbtn');
  await page.waitForTimeout(900);           // let the artwork paint

  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });

  await shot('01-today-dark');

  // partially logged, so the ring and complete states show
  for (const i of [0, 1, 4]) await page.locator('.setbtn').nth(i).click();
  await page.waitForTimeout(300);
  await shot('02-today-logging');

  await page.locator('#rest-skip').click();
  await page.locator('.tab[data-nav="week"]').click();
  await page.waitForTimeout(800);
  await shot('03-plan');

  await page.locator('.daycard').nth(0).click();
  await page.waitForTimeout(700);
  await shot('04-day-editor');

  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByLabel('Search exercises').fill('squat');
  await page.waitForTimeout(700);
  await shot('05-picker');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.tab[data-nav="stats"]').click();
  await page.waitForTimeout(400);
  await shot('06-progress');

  // light theme, to check the inverted artwork
  await page.locator('.tab[data-nav="today"]').click();
  await page.locator('#btn-theme').click();
  await page.waitForTimeout(700);
  await shot('07-today-light');

  // Wednesday: the rest day
  const p2 = await ctx.newPage();
  await p2.clock.setFixedTime(new Date('2026-09-02T09:00:00'));
  await p2.goto('http://localhost:5173/');
  await p2.waitForTimeout(700);
  await p2.screenshot({ path: path.join(OUT, '08-rest-day.png'), fullPage: true });

  await browser.close();
  console.log('screenshots ->', OUT);
})();
