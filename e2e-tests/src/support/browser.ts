import { Browser, chromium } from '@playwright/test';
import { config } from './config';

/**
 * Uma única instância de Browser para a suíte inteira (barata de reutilizar),
 * com um BrowserContext novo por cenário (isolamento de cookies, storage e sessão).
 */
let browser: Browser | undefined;

export async function launchBrowser(): Promise<Browser> {
  browser = await chromium.launch({
    headless: config.browser.headless,
    executablePath: config.browser.executablePath,
    slowMo: config.browser.slowMo,
  });
  return browser;
}

export function getBrowser(): Browser {
  if (!browser) throw new Error('Browser não foi iniciado: o hook BeforeAll não executou.');
  return browser;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = undefined;
}
