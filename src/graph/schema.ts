// === Skill Graph (persisted to ~/.hiregraph/skill-graph.json) ===

export interface SkillGraph {
  builder_identity: BuilderIdentity;
  tech_stack: Record<string, TechSkill>;
  architecture: Record<string, { confidence: number }>;
  quality: QualityMetrics;
  projects: ProjectEntry[];
  builder_profile: BuilderProfile;
  last_updated: string;
}

export interface BuilderIdentity {
  name: string;
  email: string;
  phone?: string;
  primary_role: string;
  target_roles: string[];
  remote_preference?: string;
  min_compensation?: string;
  years_in_role?: number;
  previous_companies: WorkHistory[];
  education: Education[];
  links: Record<string, string>;
  resume_skills?: string[];
  source: 'resume-upload' | 'manual';
}

export interface WorkHistory {
  company: string;
  role: string;
  start_year: number;
  end_year?: number;
  bullets?: string[];
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  year: number;
}

export interface TechSkill {
  proficiency: number;
  source: 'code-verified' | 'self-reported';
  loc: number;
  projects: number;
  advanced_features: string[];
  last_seen: string;
}

export interface QualityMetrics {
  test_ratio: number;
  complexity_avg: number;
  type_safety: boolean;
  secrets_clean: boolean;
}

export interface BuilderProfile {
  is_end_to_end: boolean;
  role_signals: string[];
}

export interface ProjectEntry {
  name: string;
  path: string;
  domain: string;
  stack: string[];
  languages: Record<string, { files: number; loc: number }>;
  commits: number;
  active_days: number;
  contributors: number;
  test_ratio: number;
  complexity_avg: number;
  patterns: Record<string, number>;
  description: string;
  scanned_at: string;
}

// === Per-Layer Result Types ===

export interface FileDiscoveryResult {
  total_files: number;
  total_loc: number;
  languages: Record<string, { files: number; loc: number }>;
  config_files: string[];
  primary_language: string;
}

export interface DependencyResult {
  ecosystem: string;
  dependencies: string[];
  dev_dependencies: string[];
  frameworks: string[];
  has_lockfile: boolean;
}

export interface AstAnalysisResult {
  functions: number;
  classes: number;
  interfaces: number;
  components: number;
  hooks: number;
  services: number;
  max_nesting_depth: number;
  avg_params_per_function: number;
  imports_used: string[];
  advanced_features: string[];
}

export interface GitForensicsResult {
  is_git_repo: boolean;
  commits: number;
  active_days: number;
  contributors: number;
  commits_per_active_day: number;
  active_days_per_week: number;
  first_commit: string;
  last_commit: string;
  conventional_commit_ratio: number;
  branches: number;
  primary_author: string;
}

export interface QualitySignalsResult {
  test_ratio: number;
  complexity_avg: number;
  type_safety: boolean;
  type_safety_details: string;
  secrets_clean: boolean;
  secrets_found: number;
  lint_tools: string[];
}

export interface ArchitecturePatternsResult {
  patterns: Record<string, number>;
  primary_pattern: string | null;
}

export interface LlmClassificationResult {
  domain: string;
  builder_profile: string;
  role_signals: string[];
  is_end_to_end: boolean;
  description: string;
}

// === Aggregated Scan Result ===

export interface ScanResult {
  project_name: string;
  project_path: string;
  file_discovery: FileDiscoveryResult;
  dependencies: DependencyResult;
  ast_analysis: AstAnalysisResult;
  git_forensics: GitForensicsResult;
  quality_signals: QualitySignalsResult;
  architecture_patterns: ArchitecturePatternsResult;
  llm_classification: LlmClassificationResult | null;
}

// === Identity (persisted to ~/.hiregraph/identity.json) ===

export interface IdentityConfig {
  name: string;
  email: string;
  phone?: string;
  phone_country_code?: string;
  city?: string;
  state?: string;
  country?: string;
  primary_role: string;
  target_roles: string[];
  remote_preference: string;
  min_compensation: string;
  previous_companies: WorkHistory[];
  education: Education[];
  links: Record<string, string>;
  skills: string[];
  resume_skills?: string[];
  source: 'resume-upload' | 'manual';
}

// === Phase 1B: Job Fetching + Matching ===

export interface CompanyRegistryEntry {
  name: string;
  slug: string;
  ats: 'greenhouse' | 'lever' | 'ashby';
  board_token: string;
  domain?: string;
  size?: 'startup' | 'growth' | 'enterprise';
  hq_location?: string;
  tags?: string[];
}

export interface JobListing {
  id: string;
  source: 'greenhouse' | 'lever' | 'ashby';
  company: string;
  company_slug: string;
  title: string;
  url: string;
  location: string;
  department?: string;
  description_raw: string;
  posted_at?: string;
  updated_at?: string;
  fetched_at: string;
}

export interface ParsedJobRequirements {
  job_id: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  seniority_level: string;
  tech_stack: string[];
  domain: string;
  remote_policy: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  role_category: 'engineering' | 'product' | 'design' | 'data' | 'marketing' | 'operations' | 'other';
  compensation_range?: { min?: number; max?: number; currency?: string };
  parsed_at: string;
}

export interface MatchResult {
  job_id: string;
  job_title: string;
  company: string;
  company_slug: string;
  url: string;
  score: number;
  confidence: number;
  tier: 'strong' | 'suggested' | 'filtered';
  reasoning: string;
  strengths: string[];
  gaps: string[];
  matched_at: string;
}

export interface MatchRun {
  date: string;
  total_jobs_fetched: number;
  total_jobs_parsed: number;
  total_candidates_evaluated: number;
  strong_matches: MatchResult[];
  suggested_matches: MatchResult[];
  run_at: string;
  cost_estimate: { jobs_parsed: number; pairs_evaluated: number; estimated_usd: number };
}

export interface JobsCache {
  source: 'greenhouse' | 'lever' | 'ashby';
  fetched_at: string;
  companies_fetched: number;
  total_jobs: number;
  jobs: JobListing[];
}

export interface ParsedJobsCache {
  parsed_at: string;
  requirements: Record<string, ParsedJobRequirements>;
}

// === Phase 1C: Resume Generation + Application Tracking ===

export interface ResumeTailoring {
  job_id: string;
  professional_summary: string;
  project_order: string[];
  bullet_emphasis: Record<string, string[]>;
  skills_order: string[];
  generated_at: string;
}

export type ApplicationStatus =
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'no-response'
  | 'login-blocked';

export interface ApplicationRecord {
  id: string;
  job_id: string;
  job_title: string;
  company: string;
  company_slug: string;
  url: string;
  ats_source: 'greenhouse' | 'lever' | 'ashby' | 'browser';
  match_score: number;
  resume_path: string;
  status: ApplicationStatus;
  applied_at: string;
  updated_at: string;
  notes?: string;
}

export interface ApplicationHistory {
  applications: ApplicationRecord[];
  last_updated: string;
}

export function createEmptySkillGraph(identity: BuilderIdentity): SkillGraph {
  return {
    builder_identity: identity,
    tech_stack: {},
    architecture: {},
    quality: {
      test_ratio: 0,
      complexity_avg: 0,
      type_safety: false,
      secrets_clean: true,
    },
    projects: [],
    builder_profile: {
      is_end_to_end: false,
      role_signals: [],
    },
    last_updated: new Date().toISOString(),
  };
}
