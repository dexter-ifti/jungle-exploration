import { chromium, devices } from 'playwright';

const iPhone = devices['iPhone 13'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({
  ...iPhone,
});
const page = await context.newPage();

const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

console.log('Navigating in mobile mode...');
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => typeof window.__setT === 'function', { timeout: 20000 });

// Verify mobile HUD elements
const mobileHudVisible = await page.$eval('#hud-mobile', el => window.getComputedStyle(el).display !== 'none');
const desktopHudVisible = await page.$eval('#hud-desktop', el => window.getComputedStyle(el).display !== 'none');
const mobileHintsVisible = await page.$eval('#mobile-hints', el => window.getComputedStyle(el).display !== 'none');

console.log('Mobile HUD visible:', mobileHudVisible);
console.log('Desktop HUD visible:', desktopHudVisible);
console.log('Mobile hints visible:', mobileHintsVisible);

if (!mobileHudVisible || desktopHudVisible) {
  throw new Error('Mobile HUD display mismatch');
}

// Test touch interaction: simulate touchmove on left half for movement
const vp = page.viewportSize();
const startX = Math.floor(vp.width * 0.25);
const startY = Math.floor(vp.height * 0.7);

// Touch drag forward on virtual joystick
await page.evaluate(({ sx, sy }) => {
  const target = document.body;
  const touchObj = new Touch({
    identifier: 1,
    target,
    clientX: sx,
    clientY: sy,
    pageX: sx,
    pageY: sy,
  });
  target.dispatchEvent(new TouchEvent('touchstart', {
    touches: [touchObj],
    targetTouches: [touchObj],
    changedTouches: [touchObj],
    bubbles: true,
    cancelable: true,
  }));
}, { sx: startX, sy: startY });

// Check joystick visible
const joystickDisplay = await page.$eval('#touch-joystick', el => window.getComputedStyle(el).display);
console.log('Touch joystick display after touchstart:', joystickDisplay);

// Move joystick forward
await page.evaluate(({ sx, sy }) => {
  const target = document.body;
  const touchObj = new Touch({
    identifier: 1,
    target,
    clientX: sx,
    clientY: sy - 35,
    pageX: sx,
    pageY: sy - 35,
  });
  target.dispatchEvent(new TouchEvent('touchmove', {
    touches: [touchObj],
    targetTouches: [touchObj],
    changedTouches: [touchObj],
    bubbles: true,
    cancelable: true,
  }));
}, { sx: startX, sy: startY });

await page.waitForTimeout(300);

// Capture screenshot of active touch joystick in portrait
await page.screenshot({ path: 'renders/mobile_portrait.png' });
console.log('Saved renders/mobile_portrait.png');

// Release touch
await page.evaluate(({ sx, sy }) => {
  const target = document.body;
  const touchObj = new Touch({
    identifier: 1,
    target,
    clientX: sx,
    clientY: sy - 35,
    pageX: sx,
    pageY: sy - 35,
  });
  target.dispatchEvent(new TouchEvent('touchend', {
    touches: [],
    targetTouches: [],
    changedTouches: [touchObj],
    bubbles: true,
    cancelable: true,
  }));
}, { sx: startX, sy: startY });

// Landscape mobile test
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'renders/mobile_landscape.png' });
console.log('Saved renders/mobile_landscape.png');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_PAGE_ERRORS');
await browser.close();
console.log('Mobile verification passed successfully!');
