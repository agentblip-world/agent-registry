/**
 * Type definitions for the deterministic task creation flow.
 * All schemas validated server-side.
 */

import type { WorkflowState } from "./state-machine";

// ─── Extraction Stage ───────────────────────────────────────────────────────

export interface MissingField {
  field_key: string;
  question: string;
  answer_type: "radio" | "multiselect" | "number" | "file" | "text";
  options?: string[];
  default_value?: any;
  impact: "critical" | "high" | "medium" | "low";
  category: "technical" | "business" | "legal" | "asset";
}

export interface ExtractionResult {
  inferred_category:
    | "smart-contract"
    | "frontend"
    | "backend"
    | "api"
    | "bot"
    | "analysis"
    | "audit"
    | "devops"
    | "integration"
    | "other";
  inferred_deliverables: string[];
  required_missing_fields: MissingField[];
  optional_missing_fields: MissingField[];
  pricing_sensitive_fields: MissingField[];
  confidence_score: number; // 0-1
  extraction_version: string;
  extracted_at: string;
  model_used: string;
}

// ─── Clarification Stage ────────────────────────────────────────────────────

export interface UploadedAsset {
  asset_id: string;
  asset_type: "logo" | "reference" | "palette" | "contract" | "wireframe" | "other";
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_url: string;
  sanitized: boolean;
}

export interface ClarificationResponse {
  answers: Record<string, any>;
  skipped_fields: string[];
  applied_defaults: Record<string, any>;
  uploaded_assets: UploadedAsset[];
  confidence_adjustment: number; // -0.3 to 0
}

// ─── Scope Stage ────────────────────────────────────────────────────────────

export interface Deliverable {
  deliverable_id: string;
  name: string;
  description: string;
  category: "code" | "design" | "documentation" | "infrastructure" | "audit";
  estimated_hours: number;
  dependencies: string[];
}

export interface Milestone {
  milestone_id: string;
  name: string;
  deliverable_ids: string[];
  deadline_offset_days: number;
  acceptance_criteria_ids: string[];
}

export interface AcceptanceCriterion {
  criterion_id: string;
  description: string;
  verification_method: "automated_test" | "manual_review" | "client_approval" | "metric_threshold";
  threshold?: string;
  blocking: boolean;
}

export interface PhaseEstimate {
  phase_name: string;
  estimated_hours: number;
  deliverable_ids: string[];
}

export interface ScopeStructured {
  objective: string;
  deliverables: Deliverable[];
  milestones: Milestone[];
  acceptance_criteria: AcceptanceCriterion[];
  dependencies: string[];
  out_of_scope: string[];
  assumptions: string[];
  estimated_hours_by_phase: PhaseEstimate[];
  timeline_estimate_days: number;
  confidence_score: number;
  scope_version: string;
  generated_at: string;
}

// ─── Complexity Stage ───────────────────────────────────────────────────────

export interface ComplexityInputs {
  feature_count: number;
  integration_count: number;
  user_roles: number;
  security_level: "none" | "basic" | "advanced" | "critical";
  compliance_flags: string[];
  custom_logic_flags: string[];
  asset_missing_count: number;
  deadline_pressure: "low" | "medium" | "high";
  total_deliverables: number;
  total_estimated_hours: number;
  confidence_score: number;
  complexity_model_version: string;
}

export interface ComplexityResult {
  complexity_score: number; // 0-100
  complexity_breakdown: {
    feature_score: number;
    integration_score: number;
    security_score: number;
    compliance_score: number;
    custom_logic_score: number;
    timeline_pressure_score: number;
    uncertainty_penalty: number;
  };
  model_version: string;
  explanation: string;
  computed_at: string;
}

// ─── Pricing Stage ──────────────────────────────────────────────────────────

export interface PricingResult {
  labour_cost_lamports: number;
  contingency_lamports: number;
  fixed_fees_lamports: number;
  discount_lamports: number;
  total_lamports: number;
  total_sol: number;
  total_usd: number;
  breakdown: {
    base_rate_sol_per_hour: number;
    estimated_hours: number;
    complexity_multiplier: number;
    contingency_percent: number;
    fixed_fee_sol: number;
    discount_reason?: string;
  };
  valid_until: string;
  pricing_config_version: string;
  computed_at: string;
}

// ─── Scope Drivers (User-editable) ─────────────────────────────────────────

export interface ScopeDrivers {
  page_count?: number;
  integration_count?: number;
  urgency_level?: "standard" | "priority" | "urgent";
  quality_tier?: "standard" | "premium";
  revision_rounds?: number;
  estimated_hours?: number;
}

// ─── State History ──────────────────────────────────────────────────────────

export interface StateHistoryEntry {
  state: WorkflowState;
  entered_at: string;
  trigger: "auto" | "user" | "system" | "ai" | "error";
  metadata?: Record<string, any>;
}

// ─── Draft State (Main workflow state) ─────────────────────────────────────

export interface DraftState {
  draft_id: string;
  current_state: WorkflowState;
  state_history: StateHistoryEntry[];
  
  // Task metadata
  title: string;
  brief: string;
  client_wallet: string;
  agent_pubkey: string;
  agent_name: string;
  
  // Cached AI results
  extraction_result: ExtractionResult | null;
  clarification_response: ClarificationResponse | null;
  scope_structured: ScopeStructured | null;
  complexity_result: ComplexityResult | null;
  pricing_result: PricingResult | null;
  
  // Scope drivers (editable)
  scope_drivers: ScopeDrivers | null;
  
  // Flags
  requires_human_review: boolean;
  risk_flags: string[];
  
  // Metadata
  created_at: string;
  updated_at: string;
  expires_at: string;
}
