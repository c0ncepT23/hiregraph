import type { Page } from 'playwright';

/**
 * Detect whether the current page requires login before accessing the job application.
 * Uses a multi-layer heuristic ported from job-auto's LearnerEngine._detect_login_wall().
 *
 * Returns true if login wall detected (should NOT auto-apply).
 */
export async function detectLoginWall(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();

  // 1. URL pattern check — strong signal
  const loginUrlPatterns = ['/login', '/signin', '/sign-in', '/auth', '/sso', '/oauth', '/accounts.google'];
  if (loginUrlPatterns.some(p => url.includes(p))) {
    return true;
  }

  // 2. Blocking indicators — visible password field or login form
  const blockingSelectors = [
    'input[type="password"]:visible',
    'form[action*="login"] input[type="password"]',
    'form[action*="signin"] input[type="password"]',
    '[data-testid="login-form"]',
    '[data-testid="signin-form"]',
  ];

  for (const selector of blockingSelectors) {
    if (await isVisible(page, selector)) {
      return true;
    }
  }

  // 3. Counter-check — if application form fields are visible, it's NOT a login wall
  const formFieldSelectors = [
    'input[name*="firstName"]',
    'input[name*="first_name"]',
    'input[name*="lastName"]',
    'input[name*="last_name"]',
    'input[name*="email"]:not([type="password"])',
    'input[type="file"]',
    '[data-testid*="firstName"]',
    '[data-testid*="first_name"]',
    'button[aria-label*="resume" i]',
    'button[aria-label*="Upload" i]',
  ];

  for (const selector of formFieldSelectors) {
    if (await isVisible(page, selector)) {
      return false;
    }
  }

  // 4. Weak indicators — "Sign in" buttons + contextual text
  const weakSelectors = [
    'button:has-text("Sign in")',
    'a:has-text("Sign in")',
    'button:has-text("Log in")',
    'a:has-text("Log in")',
  ];

  let hasSignInButton = false;
  for (const selector of weakSelectors) {
    if (await isVisible(page, selector)) {
      hasSignInButton = true;
      break;
    }
  }

  if (hasSignInButton) {
    const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
    const loginPhrases = ['sign in to continue', 'log in to continue', 'sign in to apply', 'login to apply'];
    if (loginPhrases.some(p => bodyText.includes(p))) {
      return true;
    }
  }

  // 5. Default: no login wall detected
  return false;
}

async function isVisible(page: Page, selector: string): Promise<boolean> {
  try {
    const loc = page.locator(selector);
    return await loc.first().isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}
