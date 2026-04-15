// Recipe system types — JSON-compatible with job-auto Python project

export type ActionType = 'fill' | 'click' | 'upload_file' | 'combobox' | 'checkbox' | 'radio' | 'select_option';

export interface FieldAction {
  id: string;
  description: string;
  selector: string;
  action_type: ActionType;
  value_expression: string | null;
}

export interface RecipeStep {
  id: string;
  description?: string | null;
  detection_selector: string;
  actions: FieldAction[];
  next_button_selector?: string | null;
  is_submit_step: boolean;
}

export interface RecipeMetadata {
  version: string;
  created_at?: string;
  last_validated_at?: string;
  domain: string;
  success_count: number;
  failure_count: number;
}

export interface LoginConfig {
  detection_selector: string;
  action_selector?: string;
  auth_type: string;
}

export interface Recipe {
  metadata: RecipeMetadata;
  login: LoginConfig | null;
  steps: RecipeStep[];
  delay_factor?: number;
  user_agent_pattern?: string | null;
}

export interface AutoApplyResult {
  success: boolean;
  url: string;
  domain: string;
  login_required: boolean;
  steps_executed: number;
  steps_total: number;
  errors: string[];
  recipe_learned: boolean;
}

// Data bag passed to the form filler for value resolution
export interface JobData {
  resume_path: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone_number?: string;
  phone_country_code?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  current_ctc?: string;
  current_ctc_monthly?: string;
  expected_ctc?: string;
  salary_currency?: string;
  notice_period?: string;
  visa_sponsorship?: string;
  work_authorization?: string;
  experiences: ExperienceEntry[];
  educations: EducationEntry[];
}

export interface ExperienceEntry {
  company_name: string;
  title: string;
  is_current: boolean;
  start_year: string;
  start_month?: string;
  end_year?: string;
  end_month?: string;
  description?: string;
}

export interface EducationEntry {
  school_name: string;
  degree: string;
  major: string;
  is_current: boolean;
  end_year: string;
}
