const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(2000);
  
  // Click Hakem Kirala by finding the text
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('h3')).find(el => el.textContent.includes('HAKEM')).click();
  });
  
  await page.waitForTimeout(2000);
  const items = await page.evaluate(() => {
    return document.querySelectorAll('div.grid > div').length;
  });
  console.log("RENDERED ITEMS:", items);
  await browser.close();
})();
