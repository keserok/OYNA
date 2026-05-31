const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  try {
    await page.goto('http://localhost:4000', { waitUntil: 'load', timeout: 5000 });
    await page.waitForTimeout(1500);
  } catch (e) {
    console.error('Nav error:', e.message);
  }
  await browser.close();
})();
