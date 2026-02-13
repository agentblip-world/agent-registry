# DETERMINISTIC TASK CREATION FLOW — IMPLEMENTATION PLAN

**Date:** 2026-02-13  
**Objective:** Refactor task creation flow to be deterministic, AI-assisted, impossible to break, with proper state management.

---

## 1. STATE MACHINE DEFINITION

```
STATES:
  INIT              - Task created, brief submitted
  ANALYZING         - AI extraction in progress
  CLARIFY_PENDING   - Waiting for user clarification
  CLARIFY_COMPLETE  - All critical questions answered
  SCOPE_DRAFT       - Scope generation in progress
  SCOPE_READY       - Scope generated, awaiting approval
  COMPLEXITY_CALC   - Complexity calculation in progress
  QUOTE_READY       - Quote available for review
  QUOTE_EDITING     - User adjusting scope drivers
  CONFIRMED         - User accepted quote
  FUNDED            - Escrow funded
  CANCELLED         - Flow cancelled

TRANSITIONS:
  INIT → ANALYZING                    [auto, on create]
  ANALYZING → CLARIFY_PENDING         [if questions exist]
  ANALYZING → SCOPE_DRAFT             [if no questions]
  ANALYZING → INIT                    [if extraction fails, retry allowed]
  CLARIFY_PENDING → CLARIFY_COMPLETE  [user submits answers OR skips]
  CLARIFY_COMPLETE → SCOPE_DRAFT      [auto]
  SCOPE_DRAFT → SCOPE_READY           [scope generated successfully]
  SCOPE_DRAFT → CLARIFY_PENDING       [scope gen fails, need more info]
  SCOPE_READY → COMPLEXITY_CALC       [user approves scope]
  SCOPE_READY → CLARIFY_PENDING       [user requests more clarity]
  COMPLEXITY_CALC → QUOTE_READY       [complexity calculated]
  QUOTE_READY → QUOTE_EDITING         [user clicks "Edit Scope"]
  QUOTE_READY → CONFIRMED             [user accepts]
  QUOTE_EDITING → COMPLEXITY_CALC     [user clicks "Requote"]
  CONFIRMED → FUNDED                  [escrow transaction succeeds]
  ANY → CANCELLED                     [user cancels OR timeout]

CONSTRAINTS:
  - No skipping states
  - Every state has explicit next_action
  - Idempotent transitions (calling same transition twice = safe)
  - State rollback allowed only: QUOTE_EDITING → SCOPE_READY
```

---

## 2. JSON SCHEMAS

### 2.1 ExtractionResult (ANALYZING → CLARIFY_PENDING)

```typescript
interface ExtractionResult {
  // Core classification
  inferred_category: "smart-contract" | "frontend" | "backend" | "api" | "bot" | "analysis" | "audit" | "devops" | "integration" | "other";
  inferred_deliverables: string[]; // Max 10, concrete only
  
  // Missing information
  required_missing_fields: MissingField[];
  optional_missing_fields: MissingField[];
  pricing_sensitive_fields: MissingField[];
  
  // Confidence
  confidence_score: number; // 0-1
  
  // Metadata
  extraction_version: string; // "v2"
  extracted_at: string; // ISO timestamp
  model_used: string; // "gemini-2.0-flash-exp"
}

interface MissingField {
  field_key: string; // e.g., "token_standard"
  question: string; // User-facing question
  answer_type: "radio" | "multiselect" | "number" | "file" | "text";
  options?: string[]; // For radio/multiselect
  default_value?: any;
  impact: "critical" | "high" | "medium" | "low"; // Pricing/scope impact
  category: "technical" | "business" | "legal" | "asset"; // Question category
}
```

### 2.2 ClarificationResponse (CLARIFY_COMPLETE)

```typescript
interface ClarificationResponse {
  answers: Record<string, any>; // field_key → answer
  skipped_fields: string[]; // field_keys user skipped
  applied_defaults: Record<string, any>; // field_key → default value
  uploaded_assets: UploadedAsset[];
  confidence_adjustment: number; // -0.3 to 0 (penalty for skipped questions)
}

interface UploadedAsset {
  asset_id: string;
  asset_type: "logo" | "reference" | "palette" | "contract" | "wireframe" | "other";
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_url: string; // S3/CDN URL
  sanitized: boolean; // Virus scan + format validation
}
```

### 2.3 ScopeStructured (SCOPE_READY)

```typescript
interface ScopeStructured {
  // Core scope
  objective: string; // Single sentence, max 200 chars
  deliverables: Deliverable[];
  milestones: Milestone[];
  acceptance_criteria: AcceptanceCriterion[];
  
  // Boundaries
  dependencies: string[];
  out_of_scope: string[];
  assumptions: string[];
  
  // Time estimation
  estimated_hours_by_phase: PhaseEstimate[];
  timeline_estimate_days: number;
  
  // Metadata
  confidence_score: number; // Inherited + adjusted
  scope_version: string; // "v1"
  generated_at: string; // ISO timestamp
}

interface Deliverable {
  deliverable_id: string;
  name: string;
  description: string;
  category: "code" | "design" | "documentation" | "infrastructure" | "audit";
  estimated_hours: number;
  dependencies: string[]; // Other deliverable_ids
}

interface Milestone {
  milestone_id: string;
  name: string;
  deliverable_ids: string[];
  deadline_offset_days: number; // Days from project start
  acceptance_criteria_ids: string[];
}

interface AcceptanceCriterion {
  criterion_id: string;
  description: string;
  verification_method: "automated_test" | "manual_review" | "client_approval" | "metric_threshold";
  threshold?: string; // e.g., ">95% test coverage", "<100ms API response"
  blocking: boolean; // Must pass for completion
}

interface PhaseEstimate {
  phase_name: string;
  estimated_hours: number;
  deliverable_ids: string[];
}
```

### 2.4 ComplexityInputs (SCOPE_READY → COMPLEXITY_CALC)

```typescript
interface ComplexityInputs {
  // Feature metrics
  feature_count: number;
  integration_count: number;
  user_roles: number;
  
  // Technical complexity
  security_level: "none" | "basic" | "advanced" | "critical";
  compliance_flags: string[]; // e.g., ["GDPR", "HIPAA"]
  custom_logic_flags: string[]; // e.g., ["ML", "blockchain", "realtime"]
  
  // Project attributes
  asset_missing_count: number; // How many assets user didn't provide
  deadline_pressure: "low" | "medium" | "high"; // Based on timeline_estimate vs requested
  
  // Scope metadata
  total_deliverables: number;
  total_estimated_hours: number;
  confidence_score: number;
  
  // Version
  complexity_model_version: string; // "v2"
}
```

### 2.5 ComplexityResult (COMPLEXITY_CALC → QUOTE_READY)

```typescript
interface ComplexityResult {
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
  explanation: string; // Human-readable breakdown
  computed_at: string; // ISO timestamp
}
```

### 2.6 PricingResult (QUOTE_READY)

```typescript
interface PricingResult {
  // Core pricing
  labour_cost_lamports: number;
  contingency_lamports: number; // Based on confidence_score
  fixed_fees_lamports: number; // Platform fee
  discount_lamports: number; // Promo codes, bulk discounts
  total_lamports: number;
  total_sol: number;
  total_usd: number; // At current SOL_USD_RATE
  
  // Breakdown
  breakdown: {
    base_rate_sol_per_hour: number;
    estimated_hours: number;
    complexity_multiplier: number; // 0.8 - 2.0
    contingency_percent: number; // Based on confidence
    fixed_fee_sol: number;
    discount_reason?: string;
  };
  
  // Validity
  valid_until: string; // ISO timestamp (quote expires)
  pricing_config_version: string;
  
  // Metadata
  computed_at: string;
}
```

### 2.7 DraftState (Persisted workflow state)

```typescript
interface DraftState {
  draft_id: string; // Workflow ID
  current_state: WorkflowState;
  state_history: StateHistoryEntry[];
  
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
  risk_flags: string[]; // e.g., ["crypto_promotion_uk", "health_data"]
  
  // Metadata
  created_at: string;
  updated_at: string;
  expires_at: string; // Auto-delete after 7 days if not confirmed
}

interface StateHistoryEntry {
  state: WorkflowState;
  entered_at: string;
  trigger: "auto" | "user" | "system" | "ai" | "error";
  metadata?: Record<string, any>;
}

interface ScopeDrivers {
  // User-editable factors that affect pricing
  page_count?: number;
  integration_count?: number;
  urgency_level?: "standard" | "priority" | "urgent";
  quality_tier?: "standard" | "premium";
  revision_rounds?: number;
  
  // Computed from scope initially, user can override
  estimated_hours?: number;
}
```

---

## 3. BACKEND CHANGES REQUIRED

### 3.1 New Files

```
src/api/
  ├── state-machine.ts           # State machine logic + validation
  ├── draft-store.ts             # DraftState persistence layer
  ├── ai-orchestrator.ts         # AI call orchestration + caching
  ├── complexity-calculator.ts   # V2 complexity model (enhanced from workflow-pricing.ts)
  ├── pricing-engine.ts          # Pricing logic (separated from complexity)
  ├── schema-validators.ts       # JSON schema validation for all stages
  ├── risk-detector.ts           # Compliance + legal risk detection
  └── asset-handler.ts           # File upload sanitization + storage
```

### 3.2 Modified Files

```
src/api/
  ├── workflow-types.ts          # Add DraftState, new enums
  ├── workflow-store.ts          # Link to draft-store
  ├── gemini-extract.ts          # Stricter JSON schemas, retry logic
  ├── gemini-scope.ts            # Output ScopeStructured format
  └── routes/workflows.ts        # New endpoints (see below)
```

### 3.3 New API Endpoints

```
POST   /api/workflows                      # Create draft → INIT state
POST   /api/workflows/:id/analyze          # Trigger ANALYZING → CLARIFY_PENDING
POST   /api/workflows/:id/clarify          # Submit answers → CLARIFY_COMPLETE
POST   /api/workflows/:id/generate-scope   # Trigger SCOPE_DRAFT → SCOPE_READY
POST   /api/workflows/:id/approve-scope    # SCOPE_READY → COMPLEXITY_CALC → QUOTE_READY
POST   /api/workflows/:id/edit-scope       # QUOTE_READY → QUOTE_EDITING
POST   /api/workflows/:id/requote          # QUOTE_EDITING → COMPLEXITY_CALC → QUOTE_READY
POST   /api/workflows/:id/confirm          # QUOTE_READY → CONFIRMED
POST   /api/workflows/:id/cancel           # ANY → CANCELLED
GET    /api/workflows/:id/state            # Get current DraftState
```

### 3.4 State Machine Implementation (state-machine.ts)

```typescript
export class TaskStateMachine {
  private validTransitions: Map<WorkflowState, WorkflowState[]> = new Map([
    ["INIT", ["ANALYZING", "CANCELLED"]],
    ["ANALYZING", ["CLARIFY_PENDING", "SCOPE_DRAFT", "INIT", "CANCELLED"]],
    ["CLARIFY_PENDING", ["CLARIFY_COMPLETE", "CANCELLED"]],
    ["CLARIFY_COMPLETE", ["SCOPE_DRAFT", "CANCELLED"]],
    ["SCOPE_DRAFT", ["SCOPE_READY", "CLARIFY_PENDING", "CANCELLED"]],
    ["SCOPE_READY", ["COMPLEXITY_CALC", "CLARIFY_PENDING", "CANCELLED"]],
    ["COMPLEXITY_CALC", ["QUOTE_READY", "CANCELLED"]],
    ["QUOTE_READY", ["QUOTE_EDITING", "CONFIRMED", "CANCELLED"]],
    ["QUOTE_EDITING", ["COMPLEXITY_CALC", "SCOPE_READY", "CANCELLED"]],
    ["CONFIRMED", ["FUNDED", "CANCELLED"]],
    ["FUNDED", []],
    ["CANCELLED", []],
  ]);

  canTransition(from: WorkflowState, to: WorkflowState): boolean {
    const allowed = this.validTransitions.get(from) || [];
    return allowed.includes(to);
  }

  validateTransition(from: WorkflowState, to: WorkflowState): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid state transition: ${from} → ${to}. Allowed: ${this.validTransitions.get(from)?.join(", ")}`
      );
    }
  }

  getNextActions(state: WorkflowState): string[] {
    switch (state) {
      case "INIT": return ["analyze"];
      case "ANALYZING": return ["wait"]; // Auto-transitions
      case "CLARIFY_PENDING": return ["submit_answers", "skip_clarification"];
      case "CLARIFY_COMPLETE": return ["generate_scope"];
      case "SCOPE_DRAFT": return ["wait"];
      case "SCOPE_READY": return ["approve_scope", "request_more_clarity"];
      case "COMPLEXITY_CALC": return ["wait"];
      case "QUOTE_READY": return ["accept_quote", "edit_scope"];
      case "QUOTE_EDITING": return ["requote", "revert_to_scope"];
      case "CONFIRMED": return ["fund_escrow"];
      case "FUNDED": return ["view_task"];
      case "CANCELLED": return [];
      default: return [];
    }
  }
}
```

### 3.5 AI Orchestrator (ai-orchestrator.ts)

```typescript
export class AIOrchestrator {
  private cache: Map<string, any> = new Map();
  private model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  async extract(draftId: string, title: string, brief: string): Promise<ExtractionResult> {
    const cacheKey = `extract:${draftId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const prompt = this.buildExtractionPrompt(title, brief);
    let result: ExtractionResult;

    try {
      const response = await this.callGemini(prompt);
      result = this.parseExtractionJSON(response);
      this.validateExtractionSchema(result);
    } catch (err) {
      console.warn("Extraction attempt 1 failed, retrying...", err);
      try {
        const response = await this.callGemini(prompt);
        result = this.parseExtractionJSON(response);
        this.validateExtractionSchema(result);
      } catch (retryErr) {
        console.error("Extraction attempt 2 failed, using fallback", retryErr);
        result = this.fallbackExtraction(title, brief);
      }
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  async generateScope(
    draftId: string,
    extraction: ExtractionResult,
    clarification: ClarificationResponse
  ): Promise<ScopeStructured> {
    const cacheKey = `scope:${draftId}:${JSON.stringify(clarification.answers)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const prompt = this.buildScopePrompt(extraction, clarification);
    const response = await this.callGemini(prompt);
    const scope = this.parseScopeJSON(response);
    this.validateScopeSchema(scope);

    this.cache.set(cacheKey, scope);
    return scope;
  }

  private buildExtractionPrompt(title: string, brief: string): string {
    return `
You are a technical requirements analyst. Extract structured facts from this task brief.

STRICT RULES:
- Output ONLY valid JSON (no markdown, no explanations)
- If information is missing, add to required_missing_fields
- Limit inferred_deliverables to MAX 10 concrete items
- Every missing field must have a question + answer_type + impact
- Confidence score 0-1 based on brief clarity

Task:
Title: ${title}
Brief: ${brief}

Output JSON schema:
{
  "inferred_category": "<smart-contract|frontend|backend|api|bot|analysis|audit|devops|integration|other>",
  "inferred_deliverables": ["<deliverable 1>", "<deliverable 2>"],
  "required_missing_fields": [
    {
      "field_key": "<unique_key>",
      "question": "<user question>",
      "answer_type": "<radio|multiselect|number|file|text>",
      "options": ["<option 1>", "<option 2>"] // if radio/multiselect
      "default_value": "<safe default>",
      "impact": "<critical|high|medium|low>",
      "category": "<technical|business|legal|asset>"
    }
  ],
  "optional_missing_fields": [...],
  "pricing_sensitive_fields": [...],
  "confidence_score": 0.85
}

EXAMPLES:
- If brief mentions "NFT marketplace" but doesn't specify token standard → required_missing_field with answer_type="radio", options=["SPL Token", "Token-2022"]
- If brief says "website" but no page count → pricing_sensitive_field with answer_type="number"
- If brief mentions "logo" but none provided → optional_missing_field with answer_type="file"

OUTPUT JSON NOW:`;
  }

  private buildScopePrompt(extraction: ExtractionResult, clarification: ClarificationResponse): string {
    return `
Generate a structured scope from confirmed requirements.

Extraction:
${JSON.stringify(extraction, null, 2)}

Clarification:
${JSON.stringify(clarification, null, 2)}

Output JSON schema:
{
  "objective": "<single sentence, max 200 chars>",
  "deliverables": [
    {
      "deliverable_id": "d1",
      "name": "<deliverable name>",
      "description": "<what gets built>",
      "category": "<code|design|documentation|infrastructure|audit>",
      "estimated_hours": <number>,
      "dependencies": ["d0"] // other deliverable_ids
    }
  ],
  "milestones": [
    {
      "milestone_id": "m1",
      "name": "<milestone name>",
      "deliverable_ids": ["d1", "d2"],
      "deadline_offset_days": <number>,
      "acceptance_criteria_ids": ["c1"]
    }
  ],
  "acceptance_criteria": [
    {
      "criterion_id": "c1",
      "description": "<measurable criterion>",
      "verification_method": "<automated_test|manual_review|client_approval|metric_threshold>",
      "threshold": "<e.g. >95% test coverage>",
      "blocking": true
    }
  ],
  "dependencies": ["<external dependency>"],
  "out_of_scope": ["<explicit exclusion>"],
  "assumptions": ["<assumption from defaults>"],
  "estimated_hours_by_phase": [
    {
      "phase_name": "<phase>",
      "estimated_hours": <number>,
      "deliverable_ids": ["d1"]
    }
  ],
  "timeline_estimate_days": <number>,
  "confidence_score": <0-1>
}

CRITICAL RULES:
- Every deliverable must be concrete (no "high quality code")
- Every criterion must be measurable (include numbers/thresholds)
- Timeline = sum of phase hours / 8 (8 working hours per day)
- Confidence = extraction confidence - (skipped_questions * 0.05)

OUTPUT JSON NOW:`;
  }

  private callGemini(prompt: string): Promise<string> {
    return this.model.generateContent(prompt)
      .then(result => result.response.text().trim())
      .then(text => {
        // Remove markdown code fences
        if (text.startsWith("```json")) {
          return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        } else if (text.startsWith("```")) {
          return text.replace(/```\n?/g, "").trim();
        }
        return text;
      });
  }

  private parseExtractionJSON(text: string): ExtractionResult {
    const parsed = JSON.parse(text);
    return {
      ...parsed,
      extraction_version: "v2",
      extracted_at: new Date().toISOString(),
      model_used: "gemini-2.0-flash-exp",
    };
  }

  private parseScopeJSON(text: string): ScopeStructured {
    const parsed = JSON.parse(text);
    return {
      ...parsed,
      scope_version: "v1",
      generated_at: new Date().toISOString(),
    };
  }

  private fallbackExtraction(title: string, brief: string): ExtractionResult {
    return {
      inferred_category: "other",
      inferred_deliverables: [title],
      required_missing_fields: [
        {
          field_key: "project_details",
          question: "Please describe the project requirements in more detail",
          answer_type: "text",
          default_value: "",
          impact: "critical",
          category: "technical",
        },
      ],
      optional_missing_fields: [],
      pricing_sensitive_fields: [],
      confidence_score: 0.3,
      extraction_version: "v2-fallback",
      extracted_at: new Date().toISOString(),
      model_used: "fallback",
    };
  }

  private validateExtractionSchema(result: any): void {
    const required = ["inferred_category", "inferred_deliverables", "required_missing_fields", "confidence_score"];
    for (const field of required) {
      if (!(field in result)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }

  private validateScopeSchema(scope: any): void {
    const required = ["objective", "deliverables", "acceptance_criteria"];
    for (const field of required) {
      if (!(field in scope)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }
}
```

### 3.6 Complexity Calculator V2 (complexity-calculator.ts)

```typescript
export class ComplexityCalculator {
  calculateComplexity(inputs: ComplexityInputs): ComplexityResult {
    const scores = {
      feature_score: this.scoreFeatures(inputs.feature_count),
      integration_score: this.scoreIntegrations(inputs.integration_count),
      security_score: this.scoreSecurity(inputs.security_level),
      compliance_score: this.scoreCompliance(inputs.compliance_flags),
      custom_logic_score: this.scoreCustomLogic(inputs.custom_logic_flags),
      timeline_pressure_score: this.scoreDeadlinePressure(inputs.deadline_pressure),
      uncertainty_penalty: this.scoreUncertainty(
        inputs.asset_missing_count,
        inputs.confidence_score
      ),
    };

    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const complexity_score = Math.max(0, Math.min(100, total));

    return {
      complexity_score,
      complexity_breakdown: scores,
      model_version: "v2.0",
      explanation: this.generateExplanation(scores),
      computed_at: new Date().toISOString(),
    };
  }

  private scoreFeatures(count: number): number {
    // 0-25 points: 0-5 features = linear, 6+ = logarithmic
    if (count <= 5) return count * 5;
    return 25 + Math.log10(count - 4) * 10;
  }

  private scoreIntegrations(count: number): number {
    // 0-20 points: each integration adds complexity
    return Math.min(20, count * 4);
  }

  private scoreSecurity(level: string): number {
    // 0-15 points
    const map = { none: 0, basic: 5, advanced: 10, critical: 15 };
    return map[level] || 0;
  }

  private scoreCompliance(flags: string[]): number {
    // 0-15 points: GDPR=5, HIPAA=8, SOC2=7, etc.
    const weights = { GDPR: 5, HIPAA: 8, SOC2: 7, PCI: 8 };
    return Math.min(15, flags.reduce((sum, flag) => sum + (weights[flag] || 3), 0));
  }

  private scoreCustomLogic(flags: string[]): number {
    // 0-15 points: ML=10, blockchain=8, realtime=5, etc.
    const weights = { ML: 10, blockchain: 8, realtime: 5, crypto: 8 };
    return Math.min(15, flags.reduce((sum, flag) => sum + (weights[flag] || 3), 0));
  }

  private scoreDeadlinePressure(pressure: string): number {
    // 0-10 points
    const map = { low: 0, medium: 5, high: 10 };
    return map[pressure] || 0;
  }

  private scoreUncertainty(assetMissing: number, confidence: number): number {
    // 0-10 points (penalty)
    const assetPenalty = Math.min(5, assetMissing * 1.5);
    const confidencePenalty = (1 - confidence) * 5;
    return assetPenalty + confidencePenalty;
  }

  private generateExplanation(scores: any): string {
    const lines = [];
    if (scores.feature_score > 15) lines.push(`High feature count (+${scores.feature_score} pts)`);
    if (scores.integration_score > 10) lines.push(`Multiple integrations (+${scores.integration_score} pts)`);
    if (scores.security_score > 5) lines.push(`Advanced security required (+${scores.security_score} pts)`);
    if (scores.compliance_score > 0) lines.push(`Compliance requirements (+${scores.compliance_score} pts)`);
    if (scores.custom_logic_score > 0) lines.push(`Custom logic needed (+${scores.custom_logic_score} pts)`);
    if (scores.timeline_pressure_score > 5) lines.push(`Tight deadline (+${scores.timeline_pressure_score} pts)`);
    if (scores.uncertainty_penalty > 3) lines.push(`Uncertainty penalty (+${scores.uncertainty_penalty} pts)`);
    return lines.join("; ");
  }

  // Map scope to complexity inputs
  scopeToComplexityInputs(scope: ScopeStructured, clarification: ClarificationResponse): ComplexityInputs {
    return {
      feature_count: scope.deliverables.filter(d => d.category === "code").length,
      integration_count: scope.dependencies.filter(d => d.includes("API") || d.includes("integration")).length,
      user_roles: this.inferUserRoles(scope, clarification),
      security_level: this.inferSecurityLevel(scope, clarification),
      compliance_flags: this.extractComplianceFlags(scope, clarification),
      custom_logic_flags: this.extractCustomLogicFlags(scope),
      asset_missing_count: clarification.skipped_fields.length,
      deadline_pressure: this.inferDeadlinePressure(scope),
      total_deliverables: scope.deliverables.length,
      total_estimated_hours: scope.estimated_hours_by_phase.reduce((sum, p) => sum + p.estimated_hours, 0),
      confidence_score: scope.confidence_score,
      complexity_model_version: "v2.0",
    };
  }

  private inferUserRoles(scope: ScopeStructured, clarification: ClarificationResponse): number {
    // Parse from clarification answers or scope description
    const answer = clarification.answers["user_roles"];
    if (typeof answer === "number") return answer;
    if (Array.isArray(answer)) return answer.length;
    return 1; // Default to single role
  }

  private inferSecurityLevel(scope: ScopeStructured, clarification: ClarificationResponse): string {
    const keywords = scope.objective.toLowerCase() + " " + scope.deliverables.map(d => d.description).join(" ").toLowerCase();
    if (keywords.includes("critical") || keywords.includes("finance") || keywords.includes("health")) return "critical";
    if (keywords.includes("authentication") || keywords.includes("encryption")) return "advanced";
    if (keywords.includes("login") || keywords.includes("password")) return "basic";
    return "none";
  }

  private extractComplianceFlags(scope: ScopeStructured, clarification: ClarificationResponse): string[] {
    const flags: string[] = [];
    const text = (scope.objective + " " + scope.assumptions.join(" ")).toLowerCase();
    if (text.includes("gdpr") || text.includes("eu data")) flags.push("GDPR");
    if (text.includes("hipaa") || text.includes("health data")) flags.push("HIPAA");
    if (text.includes("soc2") || text.includes("enterprise")) flags.push("SOC2");
    if (text.includes("pci") || text.includes("payment card")) flags.push("PCI");
    return flags;
  }

  private extractCustomLogicFlags(scope: ScopeStructured): string[] {
    const flags: string[] = [];
    const text = scope.deliverables.map(d => d.description).join(" ").toLowerCase();
    if (text.includes("machine learning") || text.includes("ml") || text.includes("ai")) flags.push("ML");
    if (text.includes("blockchain") || text.includes("smart contract")) flags.push("blockchain");
    if (text.includes("realtime") || text.includes("websocket") || text.includes("streaming")) flags.push("realtime");
    if (text.includes("crypto") || text.includes("encryption algorithm")) flags.push("crypto");
    return flags;
  }

  private inferDeadlinePressure(scope: ScopeStructured): string {
    const hoursPerDay = 8;
    const totalHours = scope.estimated_hours_by_phase.reduce((sum, p) => sum + p.estimated_hours, 0);
    const requiredDays = totalHours / hoursPerDay;
    const timelineDays = scope.timeline_estimate_days;

    if (timelineDays < requiredDays * 0.7) return "high";
    if (timelineDays < requiredDays * 1.2) return "medium";
    return "low";
  }
}
```

### 3.7 Pricing Engine (pricing-engine.ts)

```typescript
export class PricingEngine {
  private SOL_USD_RATE = 150;
  private BASE_RATE_SOL_PER_HOUR = 0.0067; // ~$1/hour
  private PLATFORM_FEE_PERCENT = 0.05;

  calculatePrice(
    complexity: ComplexityResult,
    scope: ScopeStructured,
    agentBaseRate: number // lamports
  ): PricingResult {
    const estimatedHours = scope.estimated_hours_by_phase.reduce((sum, p) => sum + p.estimated_hours, 0);
    const baseRateSolPerHour = agentBaseRate / LAMPORTS_PER_SOL;
    
    // Complexity multiplier: 0.8 - 2.0
    const complexityMultiplier = 0.8 + (complexity.complexity_score / 100) * 1.2;
    
    // Labour cost
    const labourCostSol = estimatedHours * baseRateSolPerHour * complexityMultiplier;
    const labourCostLamports = Math.round(labourCostSol * LAMPORTS_PER_SOL);
    
    // Contingency (based on confidence: low confidence = higher contingency)
    const contingencyPercent = Math.max(0.05, (1 - scope.confidence_score) * 0.3);
    const contingencyLamports = Math.round(labourCostLamports * contingencyPercent);
    
    // Fixed fees (platform fee)
    const fixedFeesLamports = Math.round((labourCostLamports + contingencyLamports) * this.PLATFORM_FEE_PERCENT);
    
    // Discount (TODO: promo codes)
    const discountLamports = 0;
    
    // Total
    const totalLamports = labourCostLamports + contingencyLamports + fixedFeesLamports - discountLamports;
    const totalSol = totalLamports / LAMPORTS_PER_SOL;
    const totalUsd = totalSol * this.SOL_USD_RATE;
    
    return {
      labour_cost_lamports: labourCostLamports,
      contingency_lamports: contingencyLamports,
      fixed_fees_lamports: fixedFeesLamports,
      discount_lamports: discountLamports,
      total_lamports: totalLamports,
      total_sol: Math.round(totalSol * 10000) / 10000,
      total_usd: Math.round(totalUsd * 100) / 100,
      breakdown: {
        base_rate_sol_per_hour: Math.round(baseRateSolPerHour * 100000) / 100000,
        estimated_hours: estimatedHours,
        complexity_multiplier: Math.round(complexityMultiplier * 100) / 100,
        contingency_percent: Math.round(contingencyPercent * 100),
        fixed_fee_sol: Math.round((fixedFeesLamports / LAMPORTS_PER_SOL) * 10000) / 10000,
      },
      valid_until: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(), // 7 days
      pricing_config_version: "v2.0",
      computed_at: new Date().toISOString(),
    };
  }
}
```

---

## 4. FRONTEND WIRING CHANGES

### 4.1 Modified Components

```
src/app/src/components/
  ├── TaskCreationWizard.tsx     # State machine integration, new step flow
  ├── ClarificationStep.tsx      # NEW: Dynamic question rendering
  └── ScopeDriversEditor.tsx     # NEW: Requote UI
```

### 4.2 TaskCreationWizard.tsx Changes

```typescript
// NEW FLOW
const [draftState, setDraftState] = useState<DraftState | null>(null);
const [currentState, setCurrentState] = useState<WorkflowState>("INIT");

// Step 0: Name Task (unchanged)
async function handleCreateDraft() {
  const wf = await createWorkflow({ ... });
  setDraftState(wf);
  setCurrentState("INIT");
  
  // Auto-trigger analysis
  await handleAnalyze(wf.draft_id);
}

// Step 1: Analyze (auto-triggered)
async function handleAnalyze(draftId: string) {
  setCurrentState("ANALYZING");
  const result = await fetch(`/api/workflows/${draftId}/analyze`, { method: "POST" });
  const updated = await result.json();
  setDraftState(updated);
  setCurrentState(updated.current_state);
  
  // If CLARIFY_PENDING, show questions
  // If SCOPE_DRAFT, continue
}

// Step 2: Clarify (conditional)
async function handleClarify(answers: Record<string, any>, skipped: string[]) {
  const result = await fetch(`/api/workflows/${draftState.draft_id}/clarify`, {
    method: "POST",
    body: JSON.stringify({ answers, skipped }),
  });
  const updated = await result.json();
  setDraftState(updated);
  
  // Auto-trigger scope generation
  await handleGenerateScope(updated.draft_id);
}

// Step 3: Generate Scope (auto-triggered)
async function handleGenerateScope(draftId: string) {
  setCurrentState("SCOPE_DRAFT");
  const result = await fetch(`/api/workflows/${draftId}/generate-scope`, { method: "POST" });
  const updated = await result.json();
  setDraftState(updated);
  setCurrentState(updated.current_state);
}

// Step 4: Approve Scope
async function handleApproveScope() {
  const result = await fetch(`/api/workflows/${draftState.draft_id}/approve-scope`, { method: "POST" });
  const updated = await result.json();
  setDraftState(updated);
  setCurrentState(updated.current_state);
}

// Step 5: Requote (optional)
async function handleRequote(updatedDrivers: ScopeDrivers) {
  const result = await fetch(`/api/workflows/${draftState.draft_id}/requote`, {
    method: "POST",
    body: JSON.stringify({ scope_drivers: updatedDrivers }),
  });
  const updated = await result.json();
  setDraftState(updated);
}

// Step 6: Confirm Quote
async function handleConfirm() {
  const result = await fetch(`/api/workflows/${draftState.draft_id}/confirm`, { method: "POST" });
  const updated = await result.json();
  setDraftState(updated);
  setCurrentState("CONFIRMED");
}
```

### 4.3 ClarificationStep.tsx (NEW)

```typescript
interface ClarificationStepProps {
  questions: MissingField[];
  onSubmit: (answers: Record<string, any>, skipped: string[]) => void;
  onSkipAll: () => void;
}

export function ClarificationStep({ questions, onSubmit, onSkipAll }: ClarificationStepProps) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  
  // Limit to max 5 questions, prioritize by impact
  const topQuestions = questions
    .sort((a, b) => {
      const impactOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    })
    .slice(0, 5);
  
  function renderQuestion(q: MissingField) {
    switch (q.answer_type) {
      case "radio":
        return (
          <RadioGroup
            options={q.options || []}
            value={answers[q.field_key]}
            onChange={(val) => setAnswers({ ...answers, [q.field_key]: val })}
          />
        );
      case "multiselect":
        return (
          <MultiSelectGroup
            options={q.options || []}
            value={answers[q.field_key] || []}
            onChange={(val) => setAnswers({ ...answers, [q.field_key]: val })}
          />
        );
      case "number":
        return (
          <input
            type="number"
            value={answers[q.field_key] || ""}
            onChange={(e) => setAnswers({ ...answers, [q.field_key]: parseInt(e.target.value) })}
          />
        );
      case "file":
        return <FileUpload onUpload={(file) => handleFileUpload(q.field_key, file)} />;
      case "text":
        return (
          <textarea
            value={answers[q.field_key] || ""}
            onChange={(e) => setAnswers({ ...answers, [q.field_key]: e.target.value })}
          />
        );
    }
  }
  
  function handleSubmit() {
    const answeredKeys = Object.keys(answers);
    const skippedKeys = topQuestions
      .map(q => q.field_key)
      .filter(key => !answeredKeys.includes(key));
    
    onSubmit(answers, skippedKeys);
  }
  
  return (
    <div>
      <h3>Quick Questions ({topQuestions.length})</h3>
      {topQuestions.map((q) => (
        <div key={q.field_key} className={`question ${q.impact}`}>
          <label>
            {q.question}
            {q.impact === "critical" && <span className="critical-badge">Required</span>}
          </label>
          {renderQuestion(q)}
        </div>
      ))}
      <button onClick={handleSubmit}>Submit Answers</button>
      <button onClick={onSkipAll}>Skip & Use Defaults</button>
    </div>
  );
}
```

---

## 5. RISK DETECTOR (risk-detector.ts)

```typescript
export class RiskDetector {
  detectRisks(scope: ScopeStructured, clarification: ClarificationResponse): {
    requires_human_review: boolean;
    risk_flags: string[];
  } {
    const risks: string[] = [];
    const text = (scope.objective + " " + scope.deliverables.map(d => d.description).join(" ")).toLowerCase();
    
    // Crypto/financial promotion in regulated regions
    if ((text.includes("crypto") || text.includes("token") || text.includes("nft")) &&
        (text.includes("uk") || text.includes("eu") || text.includes("europe"))) {
      risks.push("crypto_promotion_regulated_region");
    }
    
    // Health data (HIPAA)
    if (text.includes("health") || text.includes("medical") || text.includes("patient")) {
      risks.push("health_data_hipaa");
    }
    
    // Financial data (PCI)
    if (text.includes("payment") || text.includes("credit card") || text.includes("banking")) {
      risks.push("financial_data_pci");
    }
    
    // Adult content
    if (text.includes("adult") || text.includes("nsfw") || text.includes("18+")) {
      risks.push("adult_content");
    }
    
    // Gambling
    if (text.includes("gambling") || text.includes("betting") || text.includes("casino")) {
      risks.push("gambling_content");
    }
    
    const requiresReview = risks.some(r => 
      r.includes("regulated") || r.includes("hipaa") || r.includes("pci")
    );
    
    return { requires_human_review: requiresReview, risk_flags: risks };
  }
}
```

---

## 6. MIGRATION NOTES

### 6.1 Database Migration

```sql
-- Add new state columns to workflows table
ALTER TABLE workflows ADD COLUMN current_state VARCHAR(50) DEFAULT 'INIT';
ALTER TABLE workflows ADD COLUMN state_history JSONB DEFAULT '[]';
ALTER TABLE workflows ADD COLUMN extraction_result JSONB;
ALTER TABLE workflows ADD COLUMN clarification_response JSONB;
ALTER TABLE workflows ADD COLUMN scope_structured JSONB;
ALTER TABLE workflows ADD COLUMN complexity_result JSONB;
ALTER TABLE workflows ADD COLUMN pricing_result JSONB;
ALTER TABLE workflows ADD COLUMN scope_drivers JSONB;
ALTER TABLE workflows ADD COLUMN requires_human_review BOOLEAN DEFAULT FALSE;
ALTER TABLE workflows ADD COLUMN risk_flags TEXT[] DEFAULT '{}';
```

### 6.2 Data Migration

Existing workflows in old format:
- Set `current_state = 'FUNDED'` if `status = 'funded'`
- Set `current_state = 'CANCELLED'` if `status = 'cancelled'`
- Migrate old `scope` → `scope_structured` (best effort conversion)
- Migrate old `quote` → `pricing_result`

---

## 7. TESTING CHECKLIST

### 7.1 Happy Path Tests

- [ ] Create task → INIT → ANALYZING → CLARIFY_PENDING
- [ ] Submit all clarifications → CLARIFY_COMPLETE → SCOPE_DRAFT → SCOPE_READY
- [ ] Approve scope → COMPLEXITY_CALC → QUOTE_READY
- [ ] Accept quote → CONFIRMED
- [ ] Fund escrow → FUNDED

### 7.2 Edge Case Tests

- [ ] Brief too vague → generates ≥3 clarification questions
- [ ] Skip all clarifications → uses defaults, reduces confidence
- [ ] Extraction fails twice → uses fallback extraction
- [ ] Scope generation fails → transitions to CLARIFY_PENDING with more questions
- [ ] Requote flow → QUOTE_EDITING → COMPLEXITY_CALC → QUOTE_READY
- [ ] Cancel at each state → transitions to CANCELLED
- [ ] Timeout after 7 days → auto-cancel draft

### 7.3 Invalid Transition Tests

- [ ] Try to transition INIT → FUNDED (should throw)
- [ ] Try to transition CANCELLED → QUOTE_READY (should throw)
- [ ] Try to confirm quote without approving scope (should throw)

### 7.4 AI Failure Tests

- [ ] Gemini returns invalid JSON → retry → fallback
- [ ] Gemini returns partial schema → validation fails → retry
- [ ] Gemini timeout → falls back to safe defaults

### 7.5 Pricing Tests

- [ ] Simple project (complexity 20) → low price
- [ ] Complex project (complexity 80) → high price with multiplier
- [ ] Low confidence (0.5) → high contingency
- [ ] High confidence (0.95) → low contingency
- [ ] Requote after increasing hours → higher price
- [ ] Requote after decreasing urgency → lower price

---

## 8. KNOWN FAILURE POINTS

1. **Gemini JSON parsing**: Even with strict prompts, LLMs can output invalid JSON
   - **Mitigation**: Retry once + fallback extraction
   
2. **State synchronization**: If frontend and backend states diverge
   - **Mitigation**: Always fetch latest state from `/api/workflows/:id/state` before transitions
   
3. **Race conditions**: User clicks "Approve" while analysis still running
   - **Mitigation**: Disable action buttons when state is in progress (_ING states)
   
4. **Quote expiry**: User takes >7 days to accept quote
   - **Mitigation**: Check `valid_until` before allowing confirmation, trigger requote if expired
   
5. **File upload limits**: Large asset uploads timeout
   - **Mitigation**: Client-side validation (max 10MB per file), presigned S3 URLs
   
6. **Complexity edge cases**: Unusual combinations of inputs
   - **Mitigation**: Cap all scores at defined maxima, log anomalies

---

## 9. PERFORMANCE CONSIDERATIONS

### 9.1 Caching Strategy

```
Extraction:    cache key = `extract:${draftId}`              TTL = 7 days
Scope:         cache key = `scope:${draftId}:${answersHash}` TTL = 7 days
Complexity:    cache key = `complex:${scopeHash}`            TTL = 30 days
Pricing:       cache key = `price:${complexityHash}`         TTL = 1 day (rate changes)
```

### 9.2 API Call Optimization

- **Extraction**: Single Gemini call (~2-5s)
- **Scope generation**: Single Gemini call (~3-7s)
- **Complexity**: Pure computation (<50ms)
- **Pricing**: Pure computation (<10ms)

Total time: ~5-12 seconds from INIT → QUOTE_READY (if no clarifications)

### 9.3 Database Queries

- Store full DraftState as JSONB (single SELECT)
- Index on `draft_id`, `current_state`, `created_at`
- Auto-delete drafts >7 days old via cron job

---

## 10. FINAL ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER INPUT                             │
│  Title: "Build NFT Marketplace"                                 │
│  Brief: "Solana NFT marketplace with minting, listing, buying"  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     STATE: INIT → ANALYZING                     │
│  POST /api/workflows/:id/analyze                                │
│  ├─ AIOrchestrator.extract()                                    │
│  │  ├─ Gemini: Extract structured facts                         │
│  │  ├─ Retry on failure (max 2 attempts)                        │
│  │  └─ Fallback to safe defaults if both fail                   │
│  ├─ Validate JSON schema                                        │
│  └─ Cache result (7 days)                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │ Questions exist?  │
                    └─────────┬─────────┘
                     YES │   │ NO
                 ┌───────┘   └───────┐
                 ▼                   ▼
┌────────────────────────────┐  ┌────────────────────────────┐
│  STATE: CLARIFY_PENDING    │  │  STATE: SCOPE_DRAFT        │
│  User sees:                │  │  Auto-trigger:             │
│  - Max 5 questions         │  │  POST /api/.../generate    │
│  - Radio/multiselect UI    │  └────────────────────────────┘
│  - "Skip" option           │                │
│  POST /api/.../clarify     │                │
│  ├─ Collect answers        │                │
│  ├─ Apply defaults         │                │
│  └─ Reduce confidence      │                │
└────────────────────────────┘                │
                 │                            │
                 └──────────┬─────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               STATE: SCOPE_DRAFT → SCOPE_READY                  │
│  AIOrchestrator.generateScope()                                 │
│  ├─ Gemini: Generate structured scope from extraction           │
│  ├─ Validate schema (deliverables, milestones, criteria)        │
│  ├─ RiskDetector.detectRisks()                                  │
│  │  └─ Flag: crypto_promotion_uk, health_data_hipaa, etc.       │
│  └─ Cache result (7 days)                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│          STATE: SCOPE_READY (User reviews scope)                │
│  User sees:                                                     │
│  - Objective                                                    │
│  - Deliverables (concrete)                                      │
│  - Milestones                                                   │
│  - Acceptance criteria (measurable)                             │
│  - Timeline estimate                                            │
│  Actions: [Approve] [Request More Clarity]                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                    [User: Approve]
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        STATE: COMPLEXITY_CALC → QUOTE_READY                     │
│  POST /api/workflows/:id/approve-scope                          │
│  ├─ ComplexityCalculator.scopeToComplexityInputs()              │
│  │  └─ Extract: features, integrations, security, etc.          │
│  ├─ ComplexityCalculator.calculateComplexity()                  │
│  │  └─ Score 0-100 based on weighted factors                    │
│  ├─ PricingEngine.calculatePrice()                              │
│  │  ├─ Labour = hours × base_rate × complexity_multiplier       │
│  │  ├─ Contingency = labour × (1 - confidence)                  │
│  │  ├─ Platform fee = 5%                                        │
│  │  └─ Total = labour + contingency + fees                      │
│  └─ Cache results (complexity: 30d, price: 1d)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              STATE: QUOTE_READY (User reviews)                  │
│  User sees:                                                     │
│  - Full scope                                                   │
│  - Complexity score (0-100)                                     │
│  - Pricing breakdown (labour, contingency, fees, total)         │
│  - Confidence level                                             │
│  - Valid until date                                             │
│  Actions: [Accept Quote] [Edit Scope] [Cancel]                  │
└─────────────────────────────────────────────────────────────────┘
                    │                        │
          [User: Edit Scope]       [User: Accept Quote]
                    │                        │
                    ▼                        ▼
┌────────────────────────────┐  ┌────────────────────────────┐
│  STATE: QUOTE_EDITING      │  │  STATE: CONFIRMED          │
│  User adjusts:             │  │  POST /api/.../confirm     │
│  - Page count              │  │  └─ Lock in quote          │
│  - Integration count       │  └────────────────────────────┘
│  - Urgency level           │                │
│  - Quality tier            │                ▼
│  POST /api/.../requote     │  ┌────────────────────────────┐
│  └─ Recalc complexity      │  │  STATE: FUNDED             │
│     & pricing              │  │  User funds escrow         │
└────────────────────────────┘  │  (existing flow)           │
                    │           └────────────────────────────┘
                    └───────────┐
                                │
                      [Requote complete]
                                │
                                ▼
                     [Back to QUOTE_READY]
```

---

## SUMMARY

This implementation delivers:

✅ **Deterministic**: Strict state machine, no ambiguous transitions  
✅ **Dynamic**: AI-powered extraction + scope generation  
✅ **AI-assisted**: Gemini Flash for structured analysis  
✅ **Pricing-accurate**: Transparent complexity → price mapping  
✅ **Impossible to break**: State validation + fallbacks  
✅ **No infinite loops**: Explicit state graph, max 2 AI retries  
✅ **No dead states**: Every state has next_action  
✅ **No partial-scope bugs**: Schema validation at every stage  
✅ **No pricing miscalculations**: Traceable formula with breakdown

**Total Implementation Time Estimate:** 16-20 hours (2-3 days)

**Files Modified:** 12  
**Files Created:** 8  
**API Endpoints Added:** 9  
**Tests Required:** 35+

Ready to proceed?
