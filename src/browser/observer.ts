import type { Page, Frame } from 'playwright';

export interface FormField {
  tag: string;           // input, textarea, select, button
  type?: string;         // text, email, file, checkbox, radio, etc.
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  label?: string;        // associated <label> text
  required?: boolean;
  value?: string;        // current value (if pre-filled)
  options?: string[];    // for <select> elements
  visible: boolean;
  selector: string;      // best CSS selector for this element
  parentText?: string;   // nearby text context (helps identify the field)
}

export interface PageCapture {
  html: string;
  screenshot: Buffer;
  formFields: FormField[];
}

/**
 * Capture full-page screenshot, sanitized HTML, and extracted form fields.
 */
export async function capturePageState(page: Page): Promise<PageCapture> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Scroll to trigger lazy-loaded content
  await page.evaluate(() => {
    if (document.body) window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Capture screenshot
  const screenshot = await page.screenshot({ fullPage: true, type: 'png' });

  // Extract form fields — check main frame and iframes
  let formFields = await extractFormFields(page);

  // If few inputs found in main frame, check iframes
  const inputCount = formFields.filter(f => ['input', 'textarea', 'select'].includes(f.tag) && f.type !== 'submit').length;
  if (inputCount < 2) {
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;
      try {
        const frameFields = await extractFormFieldsFromFrame(frame);
        const frameInputs = frameFields.filter(f => ['input', 'textarea', 'select'].includes(f.tag) && f.type !== 'submit').length;
        if (frameInputs > inputCount) {
          formFields = frameFields;
          break;
        }
      } catch { /* iframe might be cross-origin */ }
    }
  }

  // Get sanitized HTML (lighter version since we have structured fields)
  const rawHtml = await page.content();
  const html = sanitizeHtml(rawHtml);

  return { html, screenshot, formFields };
}

/**
 * Extract form fields from an iframe.
 */
async function extractFormFieldsFromFrame(frame: Frame): Promise<FormField[]> {
  return extractFormFieldsImpl(frame);
}

/**
 * Extract all interactive form elements from the page with their real attributes.
 * This runs in the browser context via page.evaluate().
 */
async function extractFormFields(page: Page): Promise<FormField[]> {
  return extractFormFieldsImpl(page);
}

async function extractFormFieldsImpl(context: Page | Frame): Promise<FormField[]> {
  return context.evaluate(() => {
    const fields: any[] = [];
    const selectors = [
      'input:not([type="hidden"])',
      'textarea',
      'select',
      'button[type="submit"]',
      'button:not([type])',
      '[role="combobox"]',
      '[role="listbox"]',
      '[contenteditable="true"]',
      '[data-baseweb="input"] input',
      '[data-baseweb="textarea"] textarea',
      '[data-baseweb="select"] input',
    ];

    const seen = new Set<Element>();

    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);

        const htmlEl = el as HTMLElement;
        const inputEl = el as HTMLInputElement;
        const selectEl = el as HTMLSelectElement;

        // Check visibility
        const rect = htmlEl.getBoundingClientRect();
        const style = window.getComputedStyle(htmlEl);
        const visible = rect.width > 0 && rect.height > 0 &&
          style.display !== 'none' && style.visibility !== 'hidden' &&
          style.opacity !== '0';

        if (!visible) return;

        // Find associated label
        let label = '';
        const id = htmlEl.id;
        if (id) {
          const labelEl = document.querySelector(`label[for="${id}"]`);
          if (labelEl) label = labelEl.textContent?.trim() || '';
        }
        if (!label) {
          // Check parent label
          const parentLabel = htmlEl.closest('label');
          if (parentLabel) label = parentLabel.textContent?.trim() || '';
        }
        if (!label) {
          // Check aria-labelledby
          const labelledBy = htmlEl.getAttribute('aria-labelledby');
          if (labelledBy) {
            const labelEl = document.getElementById(labelledBy);
            if (labelEl) label = labelEl.textContent?.trim() || '';
          }
        }
        if (!label) {
          // Check nearby text (parent's direct text or previous sibling)
          const parent = htmlEl.parentElement;
          if (parent) {
            const prevSibling = htmlEl.previousElementSibling;
            if (prevSibling && ['LABEL', 'SPAN', 'DIV', 'P'].includes(prevSibling.tagName)) {
              label = prevSibling.textContent?.trim()?.slice(0, 100) || '';
            }
          }
        }

        // Build the best selector
        let selector = '';
        const tag = htmlEl.tagName.toLowerCase();
        const name = htmlEl.getAttribute('name');
        const dataTestId = htmlEl.getAttribute('data-testid') || htmlEl.getAttribute('data-test-id');
        const ariaLabel = htmlEl.getAttribute('aria-label');
        const type = htmlEl.getAttribute('type');
        const role = htmlEl.getAttribute('role');

        if (dataTestId) {
          selector = `[data-testid="${dataTestId}"]`;
        } else if (name) {
          selector = `${tag}[name="${name}"]`;
        } else if (id) {
          selector = `#${CSS.escape(id)}`;
        } else if (ariaLabel) {
          selector = `${tag}[aria-label="${ariaLabel}"]`;
        } else if (role && role !== tag) {
          selector = `[role="${role}"]`;
        } else {
          // Last resort: tag + type
          selector = type ? `${tag}[type="${type}"]` : tag;
        }

        // Get select options
        let options: string[] | undefined;
        if (tag === 'select') {
          options = Array.from(selectEl.options)
            .map(opt => opt.text.trim())
            .filter(t => t.length > 0)
            .slice(0, 20);
        }

        // Get parent text context
        let parentText = '';
        const fieldContainer = htmlEl.closest('[class*="field"], [class*="form-group"], [class*="question"], fieldset, .field, .form-row');
        if (fieldContainer) {
          parentText = fieldContainer.textContent?.trim()?.slice(0, 200) || '';
        }

        fields.push({
          tag,
          type: type || undefined,
          name: name || undefined,
          id: id || undefined,
          placeholder: htmlEl.getAttribute('placeholder') || undefined,
          ariaLabel: ariaLabel || undefined,
          label: label || undefined,
          required: inputEl.required || htmlEl.getAttribute('aria-required') === 'true',
          value: inputEl.value || undefined,
          options,
          visible: true,
          selector,
          parentText: parentText || undefined,
        });
      });
    }

    return fields;
  });
}

/**
 * Strip scripts, styles, SVGs, comments to reduce tokens.
 * Lighter now since form fields are extracted separately.
 */
function sanitizeHtml(html: string): string {
  let cleaned = html;
  cleaned = cleaned.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleaned.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  if (cleaned.length > 30000) {
    cleaned = cleaned.slice(0, 30000);
  }
  return cleaned.trim();
}
