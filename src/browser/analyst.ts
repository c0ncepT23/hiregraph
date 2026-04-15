import { getClient } from '../llm/client.js';
import type { RecipeStep } from './types.js';
import type { FormField } from './observer.js';

const ANALYST_SYSTEM_PROMPT = `You are an expert at mapping job application form fields to applicant data. You receive:
1. A screenshot of the form
2. A list of ACTUAL form fields extracted from the DOM (with their real CSS selectors)
3. Sanitized HTML for additional context

Your job: map each form field to the correct action type and value expression.

CRITICAL: Use the EXACT selectors provided in the form fields list. Do NOT invent or guess selectors. Every selector in your output MUST come directly from the extracted fields list.

Return a JSON object:
{
  "id": "step_<descriptive_name>",
  "description": "What this step covers",
  "detection_selector": "<selector of the first visible field from the list>",
  "actions": [
    {
      "id": "<short_field_name>",
      "description": "Human-readable label of the field",
      "selector": "<EXACT selector from the extracted fields list>",
      "action_type": "fill | upload_file | combobox | checkbox | radio | select_option | click",
      "value_expression": "<see mapping rules below>"
    }
  ],
  "next_button_selector": "<selector of Submit/Next button from the list, or null>",
  "is_submit_step": false
}

## Action Type Rules (based on the field's tag and type)
- input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea → "fill"
- input[type="file"] or button with "upload"/"resume" in label → "upload_file"
- input[role="combobox"] or select-like custom dropdowns → "combobox"
- input[type="checkbox"] → "checkbox"
- input[type="radio"] → "radio"
- select (native) → "select_option"
- button[type="submit"] or apply/submit button → "click"

## Value Expression Mapping
Map based on the field's label, placeholder, name, or surrounding text:

### Direct profile fields (use these exact strings):
- First name → resume.first_name
- Last name → resume.last_name
- Full name → resume.full_name
- Email → resume.email
- Phone number → resume.phone_number
- Phone country code → resume.phone_country_code
- City → resume.city
- State → resume.state
- Country → resume.country
- LinkedIn → resume.linkedin_url
- GitHub → resume.github_url
- Portfolio/Website → resume.portfolio_url
- Current CTC/salary (annual) → resume.current_ctc
- Current monthly salary → resume.current_ctc_monthly
- Expected CTC/salary → resume.expected_ctc
- Notice period → resume.notice_period
- Visa sponsorship → resume.visa_sponsorship
- Work authorization → resume.work_authorization
- Resume/CV upload → resume.file

### Experience fields:
- Company name → experiences.0.company_name
- Job title/role → experiences.0.title
- Start year → experiences.0.start_year
- End year → experiences.0.end_year

### Education fields:
- School/University → educations.0.school_name
- Degree → educations.0.degree
- Major/Field → educations.0.major

### For all other questions (custom text areas, screening questions):
- Use "llm_answer"

### Skip these (set value_expression to null):
- Fields already pre-filled with values
- "Apply with LinkedIn" buttons
- Social login buttons
- Hidden or decorative elements

## Rules
- ONLY use selectors from the provided form fields list
- Skip fields that are not visible or already filled
- For native <select> with options provided, use "select_option"
- For custom dropdowns (role=combobox), use "combobox"
- Set is_submit_step=true if the button says Submit/Apply (final step)
- Set is_submit_step=false if the button says Next/Continue`;

/**
 * Analyze form fields and map them to recipe actions.
 * Uses pre-extracted form fields for accurate selectors.
 */
export async function analyzeFormStep(
  html: string,
  screenshot: Buffer,
  previousStepIds: string[],
  formFields: FormField[],
): Promise<RecipeStep> {
  const client = getClient();

  const contextNote = previousStepIds.length > 0
    ? `\nPrevious steps already captured: ${previousStepIds.join(', ')}. Do NOT repeat fields from those steps.`
    : '';

  // Format extracted fields for the LLM
  const fieldsText = formFields.map((f, i) => {
    const parts = [
      `${i + 1}. <${f.tag}${f.type ? ` type="${f.type}"` : ''}>`,
      `   selector: ${f.selector}`,
    ];
    if (f.name) parts.push(`   name: ${f.name}`);
    if (f.id) parts.push(`   id: ${f.id}`);
    if (f.label) parts.push(`   label: "${f.label}"`);
    if (f.placeholder) parts.push(`   placeholder: "${f.placeholder}"`);
    if (f.ariaLabel) parts.push(`   aria-label: "${f.ariaLabel}"`);
    if (f.required) parts.push(`   required: true`);
    if (f.value) parts.push(`   current value: "${f.value}"`);
    if (f.options && f.options.length > 0) parts.push(`   options: [${f.options.join(', ')}]`);
    if (f.parentText) parts.push(`   context: "${f.parentText.slice(0, 150)}"`);
    return parts.join('\n');
  }).join('\n\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: ANALYST_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: screenshot.toString('base64'),
          },
        },
        {
          type: 'text',
          text: `Map these form fields to applicant data.${contextNote}

=== EXTRACTED FORM FIELDS (use these exact selectors) ===
${fieldsText}

=== HTML (for additional context) ===
${html.slice(0, 20000)}`,
        },
      ],
    }],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response from analyst');

  const raw = block.text;

  // Extract JSON
  let jsonStr: string | null = null;

  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  if (!jsonStr) {
    const braceStart = raw.indexOf('{');
    const braceEnd = raw.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      jsonStr = raw.slice(braceStart, braceEnd + 1);
    }
  }

  if (!jsonStr) {
    throw new Error(`No JSON found in analyst response: ${raw.slice(0, 200)}`);
  }

  try {
    const step = JSON.parse(jsonStr) as RecipeStep;

    // Validate: ensure all selectors actually came from the extracted fields
    const validSelectors = new Set(formFields.map(f => f.selector));
    for (const action of step.actions) {
      if (!validSelectors.has(action.selector)) {
        // Try to find a matching field by partial match
        const match = formFields.find(f =>
          f.selector.includes(action.selector) ||
          action.selector.includes(f.selector) ||
          (f.name && action.selector.includes(f.name)) ||
          (f.id && action.selector.includes(f.id))
        );
        if (match) {
          action.selector = match.selector;
        }
      }
    }

    return step;
  } catch (err) {
    throw new Error(`Failed to parse analyst response as JSON: ${jsonStr.slice(0, 200)}`);
  }
}
