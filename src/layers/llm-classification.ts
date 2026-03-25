import { callHaiku, isApiKeyConfigured } from '../llm/client.js';
import type {
  FileDiscoveryResult,
  DependencyResult,
  AstAnalysisResult,
  GitForensicsResult,
  QualitySignalsResult,
  ArchitecturePatternsResult,
  LlmClassificationResult,
} from '../graph/schema.js';

const SYSTEM_PROMPT = `You classify software projects based on analysis data.
Return JSON only, no markdown fences. Schema:
{
  "domain": "string (e.g., travel-tech, fintech, e-commerce, dev-tools)",
  "builder_profile": "string (e.g., engineer, PM-who-codes, builder, designer-who-ships)",
  "role_signals": ["string array of matching roles"],
  "is_end_to_end": boolean,
  "description": "1-2 sentence project description"
}`;

export async function classifyWithLlm(
  fileDiscovery: FileDiscoveryResult,
  dependencies: DependencyResult,
  astAnalysis: AstAnalysisResult,
  gitForensics: GitForensicsResult,
  qualitySignals: QualitySignalsResult,
  architecturePatterns: ArchitecturePatternsResult,
): Promise<LlmClassificationResult | null> {
  if (!isApiKeyConfigured()) return null;

  const topLanguages = Object.entries(fileDiscovery.languages)
    .sort((a, b) => b[1].loc - a[1].loc)
    .slice(0, 5)
    .map(([lang, stats]) => `${lang} (${stats.loc.toLocaleString()} LOC)`)
    .join(', ');

  const patternStr = Object.entries(architecturePatterns.patterns)
    .map(([name, conf]) => `${name} (${conf})`)
    .join(', ') || 'none detected';

  const prompt = `Given this project analysis summary:
  Languages: ${topLanguages}
  Frameworks: ${dependencies.frameworks.join(', ') || 'none'}
  Structure: ${astAnalysis.functions} functions, ${astAnalysis.classes} classes, ${astAnalysis.components} components, ${astAnalysis.hooks} custom hooks
  Git: ${gitForensics.commits} commits, ${gitForensics.active_days} active days, ${gitForensics.contributors} contributors
  Quality: test ratio ${qualitySignals.test_ratio}, complexity ${qualitySignals.complexity_avg}, type safety: ${qualitySignals.type_safety}
  Patterns: ${patternStr}
  Imports: ${astAnalysis.imports_used.slice(0, 20).join(', ')}

Classify this project:
  1. Project domain
  2. Builder profile
  3. Role signals (what roles does this work suggest?)
  4. End-to-end ownership? (single person across frontend+backend+infra?)
  5. Brief project description (1-2 sentences)`;

  try {
    const response = await callHaiku(SYSTEM_PROMPT, prompt);
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      domain: parsed.domain || 'general',
      builder_profile: parsed.builder_profile || 'engineer',
      role_signals: parsed.role_signals || [],
      is_end_to_end: parsed.is_end_to_end || false,
      description: parsed.description || '',
    };
  } catch {
    return null;
  }
}
