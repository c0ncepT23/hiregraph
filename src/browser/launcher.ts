import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function launchBrowser(options?: {
  headless?: boolean;
  storagePath?: string;
}): Promise<BrowserSession> {
  const headless = options?.headless ?? false;

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const contextOptions: Record<string, unknown> = {
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  };

  if (options?.storagePath) {
    contextOptions.storageState = options.storagePath;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  return { browser, context, page };
}

export async function navigateTo(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    // Fallback: some pages never fully fire domcontentloaded — try commit
    await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
  }
  // Allow page to settle (JS hydration, redirects)
  await page.waitForTimeout(3000);
}

export async function closeBrowser(session: BrowserSession): Promise<void> {
  await session.context.close();
  await session.browser.close();
}
