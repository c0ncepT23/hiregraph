import type { Page } from 'playwright';
import { resolveValue } from './value-resolver.js';
import type { RecipeStep, FieldAction, JobData } from './types.js';

/**
 * Execute a single recipe step: fill all fields, then click next/submit.
 * Returns list of filled field IDs and errors.
 */
export async function executeStep(
  page: Page,
  step: RecipeStep,
  jobData: JobData,
  delayFactor = 1.0,
): Promise<{ filled: string[]; skipped: string[]; errors: string[] }> {
  const filled: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // Dismiss popups before filling
  await dismissPopups(page);

  for (const action of step.actions) {
    try {
      // Check if the field is actually visible/present before attempting
      const fieldLoc = page.locator(action.selector);
      const fieldExists = await fieldLoc.count().catch(() => 0);
      if (fieldExists === 0) {
        skipped.push(action.id);
        continue;
      }

      // Wait briefly for the field to be visible (handles fields that appear after other interactions)
      const isVisible = await fieldLoc.first().isVisible({ timeout: 2000 }).catch(() => false);
      if (!isVisible && action.action_type !== 'upload_file') {
        skipped.push(action.id);
        continue;
      }

      // Get available options for radio/select fields
      let options: string[] | undefined;
      if (action.action_type === 'radio' || action.action_type === 'select_option') {
        options = await getFieldOptions(page, action.selector, action.action_type);
      }

      let value = await resolveValue(action.value_expression, jobData, action.description, action.action_type, options);

      if (value === null && action.action_type !== 'click') {
        // Check if this field is required before skipping
        const isRequired = await checkIfRequired(page, action.selector);
        if (isRequired) {
          // Required field — NEVER skip. Escalate to llm_answer.
          value = await resolveValue('llm_answer', jobData, action.description, action.action_type, options);
          if (!value) {
            errors.push(`${action.id}: Required field but no answer available`);
            continue;
          }
        } else {
          skipped.push(action.id);
          continue;
        }
      }

      await executeAction(page, action, value, jobData);
      filled.push(action.id);

      // Human-like delay between actions
      const delay = (0.5 + Math.random()) * 1000 * delayFactor;
      await page.waitForTimeout(delay);
    } catch (err: any) {
      errors.push(`${action.id}: ${err.message}`);
    }
  }

  return { filled, skipped, errors };
}

/**
 * Click the next/submit button for a step.
 */
export async function clickStepButton(page: Page, selector: string): Promise<void> {
  const loc = page.locator(selector);
  await loc.first().scrollIntoViewIfNeeded({ timeout: 3000 });
  await page.waitForTimeout(500);
  // Use force click + noWaitAfter to avoid hanging on same-page success messages
  await loc.first().click({ timeout: 5000, noWaitAfter: true }).catch(() => {
    // Fallback: JS click if normal click fails
    return loc.first().evaluate(el => (el as HTMLElement).click());
  });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

/**
 * Check if a step's detection selector (or its actions) are visible on the page.
 */
export async function isStepVisible(page: Page, step: RecipeStep): Promise<boolean> {
  // Try detection selector first
  try {
    const loc = page.locator(step.detection_selector);
    if (await loc.first().isVisible({ timeout: 3000 })) return true;
  } catch { /* fall through */ }

  // Fallback: check if several action selectors are visible
  let visible = 0;
  for (const action of step.actions.slice(0, 8)) {
    try {
      const loc = page.locator(action.selector);
      if (await loc.first().isVisible({ timeout: 500 })) visible++;
    } catch { /* continue */ }
  }
  return visible >= Math.min(3, step.actions.length);
}

/**
 * Detect CAPTCHA on the page. Returns true if CAPTCHA is present.
 */
export async function detectCaptcha(page: Page): Promise<boolean> {
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="turnstile"]',
    'iframe[title*="challenge"]',
    '[class*="captcha"]',
    'text="Verify you are human"',
    'text="I\'m not a robot"',
    '#cf-turnstile-container',
    '.cf-turnstile',
    '.g-recaptcha',
    '.h-captcha',
  ];

  for (const sel of captchaSelectors) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 500 })) return true;
    } catch { /* continue */ }
  }
  return false;
}

/**
 * Wait for CAPTCHA to be solved (user solves it manually in the browser).
 * Polls every 3s for up to 2 minutes.
 */
export async function waitForCaptchaSolved(page: Page, timeoutMs = 120000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(3000);

    // Check if CAPTCHA is gone
    const stillPresent = await detectCaptcha(page);
    if (!stillPresent) return true;

    // Check if page navigated (submit went through)
    const url = page.url().toLowerCase();
    if (['thank', 'success', 'submitted', 'confirmation'].some(p => url.includes(p))) return true;
  }
  return false;
}

/**
 * Check for submission success by examining URL and page content.
 */
export async function checkSubmitSuccess(page: Page): Promise<boolean> {
  await page.waitForTimeout(3000);

  const url = page.url().toLowerCase();
  const successPatterns = ['thank', 'success', 'confirmation', 'submitted', 'complete', 'applied'];
  if (successPatterns.some(p => url.includes(p))) return true;

  const successSelectors = [
    'text="Thank you"',
    'text="Application submitted"',
    'text="Successfully submitted"',
    'text="Your application has been"',
    'text="We have received your application"',
  ];
  for (const sel of successSelectors) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 1000 })) return true;
    } catch { /* continue */ }
  }

  return false;
}

// === Action Executors ===

async function executeAction(page: Page, action: FieldAction, value: string | null, jobData: JobData): Promise<void> {
  switch (action.action_type) {
    case 'fill':
      return executeFill(page, action, value!);
    case 'click':
      return executeClick(page, action);
    case 'upload_file':
      return executeUploadFile(page, action, value!, jobData);
    case 'combobox':
      return executeCombobox(page, action, value!, jobData);
    case 'checkbox':
      return executeCheckbox(page, action);
    case 'radio':
      return executeRadio(page, action, value!);
    case 'select_option':
      return executeSelectOption(page, action, value!);
    default:
      throw new Error(`Unknown action type: ${action.action_type}`);
  }
}

async function executeFill(page: Page, action: FieldAction, value: string): Promise<void> {
  const loc = page.locator(action.selector);
  if (await loc.count() === 0) throw new Error(`Selector not found: ${action.selector}`);

  await loc.first().scrollIntoViewIfNeeded({ timeout: 3000 });

  // Detect the actual element type — learner sometimes misclassifies dropdowns as fill
  const elInfo = await loc.first().evaluate(el => ({
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    type: el.getAttribute('type'),
    isContentEditable: (el as HTMLElement).isContentEditable,
  }));

  // If it's a <select>, delegate to selectOption
  if (elInfo.tag === 'select') {
    await loc.first().selectOption({ label: value }, { timeout: 3000 }).catch(async () => {
      // Fallback: try by value
      await loc.first().selectOption(value, { timeout: 3000 });
    });
    return;
  }

  // If it's a combobox or non-input element, delegate to combobox strategy
  if (elInfo.role === 'combobox' || elInfo.role === 'listbox' ||
      (elInfo.tag !== 'input' && elInfo.tag !== 'textarea' && !elInfo.isContentEditable)) {
    await executeCombobox(page, action, value);
    return;
  }

  // Skip if field already has a real value (avoid overwriting auto-fill)
  // But always overwrite phone fields (country code dropdown often pre-fills junk like "(+91)")
  const isPhoneField = action.description.toLowerCase().includes('phone') ||
    action.id.toLowerCase().includes('phone');
  if (!isPhoneField) {
    const existing = await loc.first().inputValue().catch(() => '');
    if (existing && existing.length > 1) return;
  }

  // Try normal fill first, fallback to click+type if element rejects .fill()
  try {
    await loc.first().fill(value);
  } catch {
    await loc.first().click({ timeout: 2000 });
    await page.keyboard.type(value, { delay: 50 });
  }

  // Press Tab after year fields to escape focus traps
  const desc = action.description.toLowerCase();
  if (desc.includes('year') || desc.includes('date')) {
    await page.keyboard.press('Tab');
  }
}

async function executeClick(page: Page, action: FieldAction): Promise<void> {
  const loc = page.locator(action.selector);
  if (await loc.count() === 0) throw new Error(`Selector not found: ${action.selector}`);
  await loc.first().scrollIntoViewIfNeeded({ timeout: 3000 });
  await loc.first().click({ timeout: 3000 });
}

async function executeUploadFile(page: Page, action: FieldAction, resumePath: string, _jobData: JobData): Promise<void> {
  // Strategy 1: Selector is directly a file input
  try {
    const loc = page.locator(action.selector);
    const tagName = await loc.first().evaluate(el => el.tagName.toLowerCase());
    const inputType = await loc.first().getAttribute('type');
    if (tagName === 'input' && inputType === 'file') {
      await loc.first().setInputFiles(resumePath);
      return;
    }
  } catch { /* try next strategy */ }

  // Strategy 2: Find file input within parent containers
  try {
    const fileInput = page.locator(`${action.selector} >> xpath=ancestor::div[1]//input[@type='file']`);
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(resumePath);
      return;
    }
  } catch { /* try next strategy */ }

  // Strategy 3: Click the button/label, then find the activated file input
  try {
    const loc = page.locator(action.selector);
    await loc.first().click({ timeout: 3000 });
    await page.waitForTimeout(1000);

    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(resumePath);
      return;
    }
  } catch { /* try last resort */ }

  // Strategy 4: Find ANY file input on the page
  const anyFileInput = page.locator('input[type="file"]');
  if (await anyFileInput.count() > 0) {
    await anyFileInput.first().setInputFiles(resumePath);
    return;
  }

  throw new Error('Could not find file input for resume upload');
}

async function executeCombobox(page: Page, action: FieldAction, value: string, jobData?: JobData): Promise<void> {
  const loc = page.locator(action.selector);
  if (await loc.count() === 0) throw new Error(`Combobox not found: ${action.selector}`);

  await loc.first().scrollIntoViewIfNeeded({ timeout: 3000 });

  // Click to open dropdown
  await loc.first().click({ timeout: 2000 });
  await page.waitForTimeout(500);

  // Check if this element supports .fill() (input/textarea) or needs keyboard input (div)
  const isTypable = await loc.first().evaluate(el => {
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
  }).catch(() => false);

  if (isTypable) {
    await loc.first().fill('');
    await loc.first().fill(value);
  } else {
    // For div-based comboboxes (Zoho, custom dropdowns): look for a nested input or use keyboard
    const nestedInput = page.locator(`${action.selector} input, ${action.selector} ~ input, ${action.selector} + input`);
    if (await nestedInput.count() > 0) {
      await nestedInput.first().fill('');
      await nestedInput.first().fill(value);
    } else {
      // Pure div dropdown -- just type with keyboard after clicking
      await page.keyboard.type(value, { delay: 80 });
    }
  }
  await page.waitForTimeout(1000);

  // Try to pick from dropdown if there's a single exact match
  const optionSelectors = [
    `[role="option"]:has-text("${value}")`,
    `[role="listbox"] [role="option"]:has-text("${value}")`,
    `li:has-text("${value}")`,
  ];

  for (const optSel of optionSelectors) {
    try {
      const options = page.locator(optSel);
      const count = await options.count();
      if (count === 1) {
        await options.first().click({ timeout: 2000 });
        await page.waitForTimeout(300);
        return;
      }
    } catch { /* try next */ }
  }

  // Multiple or no matches -- just dismiss the dropdown and keep typed text
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
}

async function executeCheckbox(page: Page, action: FieldAction): Promise<void> {
  const loc = page.locator(action.selector);
  if (await loc.count() === 0) throw new Error(`Checkbox not found: ${action.selector}`);

  await loc.first().scrollIntoViewIfNeeded({ timeout: 3000 });

  // Check if already checked
  try {
    const isChecked = await loc.first().isChecked();
    if (isChecked) return;
  } catch { /* not a native checkbox, try clicking */ }

  // Strategy 1: Native check
  try {
    await loc.first().check({ force: true, timeout: 1000 });
    return;
  } catch { /* next */ }

  // Strategy 2: Force click
  try {
    await loc.first().click({ force: true, timeout: 1000 });
    return;
  } catch { /* next */ }

  // Strategy 3: Click parent label
  try {
    const label = page.locator(`${action.selector} >> xpath=ancestor::label[1]`);
    if (await label.count() > 0) {
      await label.first().click({ timeout: 1000 });
      return;
    }
  } catch { /* next */ }

  // Strategy 4: Base Web checkbox container
  try {
    const container = page.locator(`${action.selector} >> xpath=ancestor::*[@data-baseweb="checkbox"][1]`);
    if (await container.count() > 0) {
      await container.first().click({ timeout: 1000 });
      return;
    }
  } catch { /* next */ }

  // Strategy 5: label[for=id]
  try {
    const id = await loc.first().getAttribute('id');
    if (id) {
      const label = page.locator(`label[for="${id}"]`);
      if (await label.count() > 0) {
        await label.first().click({ timeout: 1000 });
        return;
      }
    }
  } catch { /* next */ }

  // Strategy 6: JS click
  await loc.first().evaluate(el => (el as HTMLElement).click());
}

async function executeRadio(page: Page, action: FieldAction, value: string): Promise<void> {
  // Try to find radio by value attribute
  const byValue = page.locator(`${action.selector}[value="${value}"]`);
  if (await byValue.count() > 0) {
    await byValue.first().scrollIntoViewIfNeeded({ timeout: 3000 });
    await byValue.first().click({ force: true, timeout: 2000 });
    return;
  }

  // Try by label text
  const byLabel = page.locator(`label:has-text("${value}") input[type="radio"]`);
  if (await byLabel.count() > 0) {
    await byLabel.first().click({ force: true, timeout: 2000 });
    return;
  }

  // Fallback: click the selector directly
  const loc = page.locator(action.selector);
  if (await loc.count() > 0) {
    await loc.first().scrollIntoViewIfNeeded({ timeout: 3000 });
    await loc.first().click({ force: true, timeout: 2000 });
    return;
  }

  throw new Error(`Radio button not found for value: ${value}`);
}

async function executeSelectOption(page: Page, action: FieldAction, value: string): Promise<void> {
  const loc = page.locator(action.selector);
  if (await loc.count() === 0) throw new Error(`Select not found: ${action.selector}`);

  await loc.first().scrollIntoViewIfNeeded({ timeout: 3000 });
  await loc.first().selectOption({ label: value }, { timeout: 3000 });
}

// === Field Options Extraction ===

/**
 * Extract available options for radio/select fields from the DOM.
 */
async function getFieldOptions(page: Page, selector: string, actionType: string): Promise<string[]> {
  try {
    if (actionType === 'select_option') {
      return page.locator(selector).evaluate(el => {
        const select = el as HTMLSelectElement;
        return Array.from(select.options).map(o => o.text.trim()).filter(t => t.length > 0);
      });
    }

    if (actionType === 'radio') {
      // Find all radio buttons in the same group or nearby
      const name = await page.locator(selector).first().getAttribute('name').catch(() => null);
      if (name) {
        return page.evaluate((radioName) => {
          const radios = document.querySelectorAll(`input[type="radio"][name="${radioName}"]`);
          return Array.from(radios).map(r => {
            // Try label text
            const id = r.id;
            if (id) {
              const label = document.querySelector(`label[for="${id}"]`);
              if (label) return label.textContent?.trim() || '';
            }
            // Try parent label
            const parentLabel = r.closest('label');
            if (parentLabel) return parentLabel.textContent?.trim() || '';
            // Try value attribute
            return (r as HTMLInputElement).value || '';
          }).filter(t => t.length > 0);
        }, name);
      }

      // Fallback: look for nearby labels in the field container
      return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return [];
        const container = el.closest('[class*="field"], [class*="question"], fieldset, [role="radiogroup"]');
        if (!container) return [];
        const labels = container.querySelectorAll('label');
        return Array.from(labels).map(l => l.textContent?.trim() || '').filter(t => t.length > 0);
      }, selector);
    }
  } catch { /* ignore */ }
  return [];
}

// === Field Validation ===

/**
 * Check if a form field is required by examining the DOM element.
 */
async function checkIfRequired(page: Page, selector: string): Promise<boolean> {
  try {
    const loc = page.locator(selector);
    if (await loc.count() === 0) return false;

    return await loc.first().evaluate(el => {
      const input = el as HTMLInputElement;
      // Check HTML required attribute
      if (input.required) return true;
      if (input.getAttribute('aria-required') === 'true') return true;

      // Check if parent/nearby has "required" or "*" marker
      const parent = el.closest('[class*="field"], [class*="form-group"], [class*="question"], fieldset');
      if (parent) {
        const text = parent.textContent || '';
        if (text.includes('*') || text.toLowerCase().includes('required')) return true;
      }

      // Check for asterisk in label
      const id = input.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label && (label.textContent?.includes('*') || label.querySelector('.required'))) return true;
      }

      return false;
    });
  } catch {
    return false;
  }
}

// === Popup Handling ===

async function dismissPopups(page: Page): Promise<void> {
  const popupSelectors = [
    'button:has-text("I ACKNOWLEDGE")',
    'button:has-text("Accept All")',
    'button:has-text("Accept all")',
    'button:has-text("Accept Cookies")',
    'button:has-text("Got it")',
    'button:has-text("Dismiss")',
    '[aria-label="Close"]',
    '[aria-label="close"]',
    'button:has-text("Close")',
  ];

  for (const sel of popupSelectors) {
    try {
      const loc = page.locator(sel);
      if (await loc.first().isVisible({ timeout: 300 })) {
        await loc.first().click({ timeout: 1000 });
        await page.waitForTimeout(500);
      }
    } catch { /* expected — most popups won't exist */ }
  }
}
