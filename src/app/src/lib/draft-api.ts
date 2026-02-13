/**
 * V2 Draft API Client
 * State machine-driven task creation flow.
 */

const API_BASE = "/api/drafts";

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkflowState =
  | "INIT"
  | "ANALYZING"
  | "CLARIFY_PENDING"
  | "CLARIFY_COMPLETE"
  | "SCOPE_DRAFT"
  | "SCOPE_READY"
  | "COMPLEXITY_CALC"
  | "QUOTE_READY"
  | "QUOTE_EDITING"
  | "CONFIRMED"
  | "FUNDED"
  | "CANCELLED";

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
  inferred_category: string;
  inferred_deliverables: string[];
  required_missing_fields: MissingField[];
  optional_missing_fields: MissingField[];
  pricing_sensitive_fields: MissingField[];
  confidence_score: number;
}

export interface ScopeStructured {
  objective: string;
  deliverables: any[];
  milestones: any[];
  acceptance_criteria: any[];
  dependencies: string[];
  out_of_scope: string[];
  assumptions: string[];
  estimated_hours_by_phase: any[];
  timeline_estimate_days: number;
  confidence_score: number;
}

export interface ComplexityResult {
  complexity_score: number;
  complexity_breakdown: any;
  model_version: string;
  explanation: string;
}

export interface PricingResult {
  labour_cost_lamports: number;
  contingency_lamports: number;
  fixed_fees_lamports: number;
  discount_lamports: number;
  total_lamports: number;
  total_sol: number;
  total_usd: number;
  breakdown: any;
  valid_until: string;
}

export interface RiskAssessment {
  requires_human_review: boolean;
  risk_flags: string[];
  risk_explanations: string[];
}

export interface DraftState {
  draft_id: string;
  current_state: WorkflowState;
  state_history: any[];
  title: string;
  brief: string;
  client_wallet: string;
  agent_pubkey: string;
  agent_name: string;
  extraction_result: ExtractionResult | null;
  clarification_response: any | null;
  scope_structured: ScopeStructured | null;
  complexity_result: ComplexityResult | null;
  pricing_result: PricingResult | null;
  scope_drivers: any | null;
  requires_human_review: boolean;
  risk_flags: string[];
  created_at: string;
  updated_at: string;
  expires_at: string;
}

// ─── API Functions ──────────────────────────────────────────────────────────

/**
 * Create new draft (INIT state)
 */
export async function createDraft(params: {
  clientWallet: string;
  agentPubkey: string;
  agentName: string;
  title: string;
  brief: string;
}): Promise<{ draft: DraftState; next_actions: string[] }> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create draft");
  }

  return res.json();
}

/**
 * Analyze draft (INIT → ANALYZING → CLARIFY_PENDING | SCOPE_DRAFT)
 */
export async function analyzeDraft(draftId: string): Promise<{
  draft: DraftState;
  extraction?: ExtractionResult;
  questions?: MissingField[];
  next_actions: string[];
}> {
  const res = await fetch(`${API_BASE}/${draftId}/analyze`, {
    method: "POST",
  });

  if (!res.ok) {
    // Check if response is HTML (API server not running / not deployed)
    const contentType = res.headers.get("content-type");
    if (contentType?.includes("text/html")) {
      throw new Error("API server is not available. The AI-powered analysis feature requires the backend API to be running. Please contact support or try again later.");
    }
    
    try {
      const err = await res.json();
      throw new Error(err.error || "Analysis failed");
    } catch (jsonErr) {
      throw new Error("Analysis failed - unable to parse server response");
    }
  }

  return res.json();
}

/**
 * Submit clarifications (CLARIFY_PENDING → CLARIFY_COMPLETE)
 */
export async function submitClarifications(
  draftId: string,
  answers: Record<string, any>,
  skipped: string[]
): Promise<{
  draft: DraftState;
  clarification: any;
  next_actions: string[];
}> {
  const res = await fetch(`${API_BASE}/${draftId}/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, skipped }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to submit clarifications");
  }

  return res.json();
}

/**
 * Generate scope (CLARIFY_COMPLETE | SCOPE_DRAFT → SCOPE_READY)
 */
export async function generateScope(draftId: string): Promise<{
  draft: DraftState;
  scope: ScopeStructured;
  risk_assessment: RiskAssessment;
  next_actions: string[];
}> {
  const res = await fetch(`${API_BASE}/${draftId}/generate-scope`, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Scope generation failed");
  }

  return res.json();
}

/**
 * Approve scope (SCOPE_READY → COMPLEXITY_CALC → QUOTE_READY)
 */
export async function approveScope(
  draftId: string,
  agentBaseRateLamports: number
): Promise<{
  draft: DraftState;
  complexity: ComplexityResult;
  pricing: PricingResult;
  pricing_breakdown: string;
  next_actions: string[];
}> {
  const res = await fetch(`${API_BASE}/${draftId}/approve-scope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentBaseRateLamports }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to approve scope");
  }

  return res.json();
}

/**
 * Edit scope drivers (QUOTE_READY → QUOTE_EDITING)
 */
export async function editScope(draftId: string): Promise<{
  draft: DraftState;
  scope_drivers: any;
  next_actions: string[];
}> {
  const res = await fetch(`${API_BASE}/${draftId}/edit-scope`, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to enter edit mode");
  }

  return res.json();
}

/**
 * Requote with updated drivers (QUOTE_EDITING → COMPLEXITY_CALC → QUOTE_READY)
 */
export async function requote(
  draftId: string,
  scopeDrivers: any,
  agentBaseRateLamports: number
): Promise<{
  draft: DraftState;
  complexity: ComplexityResult;
  pricing: PricingResult;
  pricing_breakdown: string;
  next_actions: string[];
}> {
  const res = await fetch(`${API_BASE}/${draftId}/requote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope_drivers: scopeDrivers, agentBaseRateLamports }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Requote failed");
  }

  return res.json();
}

/**
 * Confirm quote (QUOTE_READY → CONFIRMED)
 */
export async function confirmQuote(draftId: string): Promise<{
  draft: DraftState;
  next_actions: string[];
}> {
  const res = await fetch(`${API_BASE}/${draftId}/confirm`, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to confirm quote");
  }

  return res.json();
}

/**
 * Cancel draft (ANY → CANCELLED)
 */
export async function cancelDraft(draftId: string, reason?: string): Promise<{
  draft: DraftState;
}> {
  const res = await fetch(`${API_BASE}/${draftId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to cancel draft");
  }

  return res.json();
}

/**
 * Get draft state
 */
export async function getDraftState(draftId: string): Promise<{
  draft: DraftState;
  state_description: string;
  next_actions: string[];
  is_waiting: boolean;
}> {
  const res = await fetch(`${API_BASE}/${draftId}`);

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch draft");
  }

  return res.json();
}

/**
 * List drafts
 */
export async function listDrafts(filters?: {
  state?: WorkflowState;
  client_wallet?: string;
}): Promise<{ drafts: DraftState[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.state) params.set("state", filters.state);
  if (filters?.client_wallet) params.set("client_wallet", filters.client_wallet);

  const qs = params.toString();
  const url = `${API_BASE}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Failed to fetch drafts");
  }

  return res.json();
}
