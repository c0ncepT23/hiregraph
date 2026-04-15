import { loadJson, saveJson } from '../storage/store.js';

interface AnswerEntry {
  question: string;
  keywords: string[];
  answer: string;
  saved_at: string;
}

interface AnswerCache {
  answers: AnswerEntry[];
}

const ANSWERS_FILE = 'answers.json';

export async function loadAnswerCache(): Promise<AnswerCache> {
  const cache = await loadJson<AnswerCache>(ANSWERS_FILE);
  return cache || { answers: [] };
}

/**
 * Find a cached answer by fuzzy keyword matching against the question.
 * Returns the answer if a good match is found, null otherwise.
 */
export async function findCachedAnswer(question: string): Promise<string | null> {
  const cache = await loadAnswerCache();
  if (cache.answers.length === 0) return null;

  const qLower = question.toLowerCase();

  // Strategy 1: High keyword overlap — at least 60% of stored keywords appear in the question
  let bestMatch: AnswerEntry | null = null;
  let bestScore = 0;

  for (const entry of cache.answers) {
    const matchedKeywords = entry.keywords.filter(kw => qLower.includes(kw));
    const score = matchedKeywords.length / entry.keywords.length;
    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch) return bestMatch.answer;

  // Strategy 2: Substring similarity — the stored question is very similar
  for (const entry of cache.answers) {
    const storedLower = entry.question.toLowerCase();
    // Check if the core of the question matches (strip "how many years" etc.)
    const storedCore = extractCore(storedLower);
    const questionCore = extractCore(qLower);
    if (storedCore.length > 10 && questionCore.includes(storedCore)) {
      return entry.answer;
    }
    if (questionCore.length > 10 && storedCore.includes(questionCore)) {
      return entry.answer;
    }
  }

  return null;
}

/**
 * Save a new answer to the cache for future reuse.
 */
export async function saveAnswer(question: string, answer: string): Promise<void> {
  const cache = await loadAnswerCache();

  const keywords = extractKeywords(question);

  // Check if a similar question already exists — update instead of duplicate
  const existingIdx = cache.answers.findIndex(entry => {
    const overlap = entry.keywords.filter(kw => keywords.includes(kw));
    return overlap.length / Math.max(entry.keywords.length, keywords.length) > 0.6;
  });

  const entry: AnswerEntry = {
    question,
    keywords,
    answer,
    saved_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    cache.answers[existingIdx] = entry;
  } else {
    cache.answers.push(entry);
  }

  await saveJson(ANSWERS_FILE, cache);
}

/**
 * Extract meaningful keywords from a question for fuzzy matching.
 */
function extractKeywords(question: string): string[] {
  const stopWords = new Set([
    'how', 'many', 'years', 'of', 'experience', 'do', 'you', 'have',
    'working', 'with', 'as', 'a', 'an', 'the', 'in', 'on', 'at', 'to',
    'for', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been',
    'what', 'your', 'please', 'describe', 'tell', 'us', 'about',
    'particularly', 'specifically', 'based', 'level', 'work',
  ]);

  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 10);
}

/**
 * Extract the semantic core of a question (remove boilerplate phrasing).
 */
function extractCore(question: string): string {
  return question
    .replace(/how many years of experience do you have/gi, '')
    .replace(/how many years of experience/gi, '')
    .replace(/do you have experience/gi, '')
    .replace(/describe your experience/gi, '')
    .replace(/please describe/gi, '')
    .replace(/tell us about/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
