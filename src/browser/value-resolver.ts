import chalk from 'chalk';
import inquirer from 'inquirer';
import { callHaikuJson } from '../llm/client.js';
import { findCachedAnswer, saveAnswer } from './answer-store.js';
import { isTelegramConfigured, askViaTelegram } from './telegram-prompter.js';
import type { JobData } from './types.js';

// When true, skip interactive prompts — LLM answers everything
let autoMode = false;

export function setAutoMode(enabled: boolean): void {
  autoMode = enabled;
}

/**
 * Resolve a recipe value_expression to an actual value from the user's identity data.
 * Supports: resume.*, experiences.N.*, educations.N.*, llm_answer, null.
 */
export async function resolveValue(
  expression: string | null,
  jobData: JobData,
  fieldDescription: string,
  actionType?: string,
  options?: string[],
): Promise<string | null> {
  if (!expression) return null;

  // Special: resume file path
  if (expression === 'resume.file') {
    return jobData.resume_path;
  }

  // LLM-generated answer for custom questions
  if (expression === 'llm_answer') {
    return resolveCustomQuestion(fieldDescription, jobData, actionType, options);
  }

  // Array paths: experiences.0.company_name, educations.1.degree
  const arrayMatch = expression.match(/^(experiences|educations)\.(\d+)\.(.+)$/);
  if (arrayMatch) {
    const [, arrayName, indexStr, field] = arrayMatch;
    const index = parseInt(indexStr, 10);
    const array = arrayName === 'experiences' ? jobData.experiences : jobData.educations;
    if (index >= array.length) return null;
    const entry = array[index] as unknown as Record<string, unknown>;
    return resolveFromObject(entry, field);
  }

  // resume.* prefix
  if (expression.startsWith('resume.')) {
    const key = expression.slice(7); // strip "resume."
    return resolveFromFlat(jobData, key);
  }

  // Direct flat key lookup
  return resolveFromFlat(jobData, expression);
}

function resolveFromFlat(data: JobData, key: string): string | null {
  const aliases: Record<string, string> = {
    first_name: 'first_name',
    last_name: 'last_name',
    full_name: 'full_name',
    email: 'email',
    phone_number: 'phone_number',
    phone: 'phone_number',
    phone_country_code: 'phone_country_code',
    city: 'city',
    state: 'state',
    country: 'country',
    linkedin_url: 'linkedin_url',
    github_url: 'github_url',
    portfolio_url: 'portfolio_url',
    current_employer: 'current_employer',
    current_company: 'current_employer',
    current_title: 'current_title',
    current_role: 'current_title',
    current_ctc: 'current_ctc',
    current_ctc_monthly: 'current_ctc_monthly',
    expected_ctc: 'expected_ctc',
    salary_currency: 'salary_currency',
    notice_period: 'notice_period',
    visa_sponsorship: 'visa_sponsorship',
    work_authorization: 'work_authorization',
  };

  const resolvedKey = aliases[key] || key;
  const value = (data as unknown as Record<string, unknown>)[resolvedKey];
  if (value === undefined || value === null) return null;
  return String(value);
}

function resolveFromObject(obj: Record<string, unknown>, field: string): string | null {
  if (obj[field] !== undefined && obj[field] !== null) return String(obj[field]);

  const aliases: Record<string, string[]> = {
    company_name: ['company', 'company_name'],
    company: ['company', 'company_name'],
    title: ['title', 'role'],
    role: ['role', 'title'],
    school_name: ['school_name', 'institution'],
    institution: ['institution', 'school_name'],
    major: ['major', 'field'],
    field: ['field', 'major'],
  };

  const candidates = aliases[field] || [];
  for (const candidate of candidates) {
    if (obj[candidate] !== undefined && obj[candidate] !== null) {
      return String(obj[candidate]);
    }
  }

  return null;
}

// === 3-Tier Answer Resolution ===

/**
 * Resolve a custom question using:
 * 1. Answer cache (previously answered similar questions)
 * 2. LLM draft (Haiku generates answer from profile)
 * 3. CLI prompt (ask user, save for future)
 */
async function resolveCustomQuestion(
  question: string,
  jobData: JobData,
  actionType?: string,
  options?: string[],
): Promise<string> {
  const isChoiceField = actionType === 'radio' || actionType === 'select_option' || actionType === 'combobox';

  // Tier 1: Check answer cache — but ONLY if the field type matches
  // Don't use a text paragraph for a radio button field
  if (!isChoiceField) {
    const cached = await findCachedAnswer(question);
    if (cached) {
      console.log(`    ${chalk.dim('Q:')} ${chalk.dim(truncate(question, 70))}`);
      console.log(`    ${chalk.dim('A (cached):')} ${chalk.dim(truncate(cached, 70))}`);
      return cached;
    }
  }

  // For choice fields with options: pick the best option directly
  if (isChoiceField && options && options.length > 0) {
    const picked = await pickBestOption(question, options, jobData);
    if (picked) {
      console.log(`    ${chalk.dim('Q:')} ${chalk.dim(truncate(question, 70))}`);
      console.log(`    ${chalk.green('A (picked):')} ${picked}`);
      return picked;
    }
  }

  // Tier 2: Generate LLM draft
  const draft = await generateDraft(question, jobData);

  // Auto mode
  if (autoMode) {
    console.log(`    ${chalk.cyan('Q:')} ${truncate(question, 80)}`);

    if (isTelegramConfigured()) {
      // Telegram available — send ALL new answers for user confirmation
      if (draft) {
        console.log(`    ${chalk.yellow('Draft:')} ${truncate(draft, 80)}`);
        console.log(`    ${chalk.dim('Sending to Telegram for confirmation...')}`);
        const confirmed = await askViaTelegram(
          question,
          `AI draft: "${draft}"\n\nReply "ok" to accept, or type your own answer.`,
        );
        if (confirmed === null) {
          // Timeout — use draft as fallback
          console.log(`    ${chalk.yellow('A (draft, no reply):')} ${truncate(draft, 80)}`);
          await saveAnswer(question, draft);
          return draft;
        }
        const finalAnswer = (confirmed.toLowerCase().trim() === 'ok') ? draft : confirmed;
        console.log(`    ${chalk.green('A (confirmed):')} ${truncate(finalAnswer, 80)}`);
        await saveAnswer(question, finalAnswer);
        return finalAnswer;
      } else {
        // No draft — ask user directly via Telegram
        console.log(`    ${chalk.dim('AI unsure — asking via Telegram...')}`);
        const tgAnswer = await askViaTelegram(question);
        if (tgAnswer) {
          console.log(`    ${chalk.green('A (telegram):')} ${truncate(tgAnswer, 80)}`);
          await saveAnswer(question, tgAnswer);
          return tgAnswer;
        }
        console.log(`    ${chalk.yellow('A:')} no reply, skipping`);
        return '';
      }
    }

    // No Telegram — auto-fill with draft or skip
    if (draft) {
      console.log(`    ${chalk.green('A (auto):')} ${truncate(draft, 80)}`);
      await saveAnswer(question, draft);
      return draft;
    }
    console.log(`    ${chalk.yellow('A (auto):')} (skipped — low confidence)`);
    return '';
  }

  // Interactive mode: show to user in CLI
  console.log();
  console.log(`    ${chalk.cyan('Q:')} ${question}`);

  if (draft) {
    console.log(`    ${chalk.yellow('Draft:')} ${draft}`);
    console.log();

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Use this answer?',
      choices: [
        { name: 'Yes, use this', value: 'accept' },
        { name: 'Edit it', value: 'edit' },
        { name: 'Type my own', value: 'custom' },
        { name: 'Skip (leave blank)', value: 'skip' },
      ],
    }]);

    let finalAnswer: string;

    if (action === 'accept') {
      finalAnswer = draft;
    } else if (action === 'edit') {
      const { edited } = await inquirer.prompt([{
        type: 'editor',
        name: 'edited',
        message: 'Edit your answer:',
        default: draft,
      }]);
      finalAnswer = edited.trim();
    } else if (action === 'custom') {
      const { custom } = await inquirer.prompt([{
        type: 'input',
        name: 'custom',
        message: 'Your answer:',
      }]);
      finalAnswer = custom.trim();
    } else {
      return '';
    }

    if (finalAnswer) {
      await saveAnswer(question, finalAnswer);
      console.log(`    ${chalk.green('✓')} ${chalk.dim('Saved for future use')}`);
    }
    return finalAnswer;
  }

  // No draft — ask user directly
  const { answer } = await inquirer.prompt([{
    type: 'input',
    name: 'answer',
    message: `Your answer (or press Enter to skip):`,
  }]);

  const finalAnswer = answer.trim();
  if (finalAnswer) {
    await saveAnswer(question, finalAnswer);
    console.log(`    ${chalk.green('✓')} ${chalk.dim('Saved for future use')}`);
  }
  return finalAnswer;
}

/**
 * For radio/select/combobox fields: pick the best matching option from available choices.
 */
async function pickBestOption(question: string, options: string[], jobData: JobData): Promise<string | null> {
  const systemPrompt = `You are helping select the best option for a job application form field. You will be given a question, available options, and the applicant's profile. Pick the EXACT option text that best matches. Return ONLY the option text, nothing else.`;

  const workHistory = jobData.experiences.map(exp =>
    `${exp.title} at ${exp.company_name} (${exp.start_year}${exp.end_year ? '-' + exp.end_year : '-Present'})`
  ).join(', ');

  const prompt = `Question: "${question}"

Available options:
${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Applicant: ${jobData.full_name}
Role: ${workHistory}
Location: ${jobData.city || 'Unknown'}

Pick the best option. Respond as JSON: {"option": "exact option text from the list"}`;

  try {
    const result = await callHaikuJson<{ option: string }>(systemPrompt, prompt);
    // Verify the picked option actually exists in the list
    const match = options.find(o =>
      o.toLowerCase().trim() === result.option.toLowerCase().trim()
    );
    return match || options.find(o =>
      o.toLowerCase().includes(result.option.toLowerCase()) ||
      result.option.toLowerCase().includes(o.toLowerCase())
    ) || null;
  } catch {
    return null;
  }
}

/**
 * Generate a draft answer using Haiku with full profile context.
 */
async function generateDraft(question: string, jobData: JobData): Promise<string | null> {
  const systemPrompt = `You are helping a job applicant fill out an application form. Generate a concise, honest, professional answer to the question based on their profile.

Rules:
- For "how many years" questions: calculate from their work history and give a specific number + brief context
- For yes/no questions: answer "No" unless clearly indicated by profile
- For experience descriptions: reference specific roles, companies, and achievements from their history
- Keep answers concise (1-3 sentences for text areas, single value for short fields)
- Be specific and quantitative where possible
- Do NOT make up information not in the profile`;

  const workHistory = jobData.experiences.map(exp =>
    `${exp.title} at ${exp.company_name} (${exp.start_year}${exp.end_year ? '-' + exp.end_year : '-Present'})${exp.description ? ': ' + exp.description : ''}`
  ).join('\n');

  const education = jobData.educations.map(ed =>
    `${ed.degree} in ${ed.major} from ${ed.school_name} (${ed.end_year})`
  ).join('\n');

  const context = [
    `Name: ${jobData.full_name}`,
    `Email: ${jobData.email}`,
    jobData.city ? `Location: ${jobData.city}${jobData.state ? ', ' + jobData.state : ''}${jobData.country ? ', ' + jobData.country : ''}` : null,
    jobData.current_ctc ? `Current CTC: ${jobData.current_ctc} (${jobData.salary_currency || 'INR'})` : null,
    jobData.expected_ctc ? `Expected CTC: ${jobData.expected_ctc} (${jobData.salary_currency || 'INR'})` : null,
    jobData.notice_period ? `Notice Period: ${jobData.notice_period}` : null,
    jobData.visa_sponsorship ? `Visa Sponsorship Required: ${jobData.visa_sponsorship}` : null,
    jobData.work_authorization ? `Work Authorization: ${jobData.work_authorization}` : null,
    '',
    'Work History:',
    workHistory || '(none)',
    '',
    'Education:',
    education || '(none)',
  ].filter(v => v !== null).join('\n');

  const prompt = `Applicant profile:
${context}

Question on the job application form:
"${question}"

Generate the best answer. Respond as JSON: {"answer": "your answer", "confidence": "high" | "medium" | "low"}`;

  try {
    const result = await callHaikuJson<{ answer: string; confidence: string }>(
      systemPrompt,
      prompt,
      1024,
    );

    // Only return draft if LLM is reasonably confident
    if (result.confidence === 'low') return null;
    return result.answer;
  } catch {
    return null;
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
