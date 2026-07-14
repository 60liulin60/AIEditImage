import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://localhost:5177/login');
  await page.waitForTimeout(1500);

  await page.fill('input[autocomplete="email"]', 'admin@example.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button.login-btn');
  await page.waitForTimeout(2000);

  await page.goto('http://localhost:5177/configs');
  await page.waitForTimeout(1000);

  await page.click('button:has-text("新增配置")');
  await page.waitForTimeout(500);

  await page.click('.config-form-dialog .el-select__wrapper');
  await page.waitForTimeout(800);

  const overlay = await page.locator('.el-overlay').first();
  const dialog = await page.locator('.config-form-dialog').first();
  const dropdown = await page.locator('.el-select__popper').first();

  const overlayZ = await overlay.evaluate(el => window.getComputedStyle(el).zIndex);
  const dialogZ = await dialog.evaluate(el => window.getComputedStyle(el).zIndex);
  const dropdownZ = await dropdown.evaluate(el => window.getComputedStyle(el).zIndex);
  const dropdownVisible = await dropdown.isVisible();

  console.log('overlay z-index:', overlayZ);
  console.log('dialog z-index:', dialogZ);
  console.log('dropdown z-index:', dropdownZ);
  console.log('dropdown visible:', dropdownVisible);

  await page.screenshot({ path: 'dialog-z-index.png', fullPage: true });
  await browser.close();
})();
