/**
 * AI orchestration with Gemini Flash.
 * Handles extraction, scope generation, with retry logic and caching.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtractionResult, ClarificationResponse, ScopeStructured } from "./schema-types";
import { validator } from "./schema-validators";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-2.0-flash-exp";

if (!GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY not set — AI orchestration will fail");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export class AIOrchestrator {
  private cache: Map<string, any> = new Map();
  private model = genAI.getGenerativeModel({ model: MODEL_NAME });

  /**
   * Extract structured facts from task brief.
   * Retries once on failure, falls back to safe defaults.
   */
  async extract(draftId: string, title: string, brief: string): Promise<ExtractionResult> {
    const cacheKey = `extract:${draftId}`;
    if (this.cache.has(cacheKey)) {
      console.log(`[AIOrchestrator] Cache hit: ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    const prompt = this.buildExtractionPrompt(title, brief);
    let result: ExtractionResult;

    try {
      console.log(`[AIOrchestrator] Extraction attempt 1 for draft ${draftId}`);
      const response = await this.callGemini(prompt);
      result = this.parseExtractionJSON(response);
      validator.validateExtraction(result);
    } catch (err: any) {
      console.warn(`[AIOrchestrator] Extraction attempt 1 failed: ${err.message}. Retrying...`);
      try {
        const response = await this.callGemini(prompt);
        result = this.parseExtractionJSON(response);
        validator.validateExtraction(result);
      } catch (retryErr: any) {
        console.error(`[AIOrchestrator] Extraction attempt 2 failed: ${retryErr.message}. Using fallback.`);
        result = this.fallbackExtraction(title, brief);
      }
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Generate structured scope from extraction + clarification.
   */
  async generateScope(
    draftId: string,
    extraction: ExtractionResult,
    clarification: ClarificationResponse
  ): Promise<ScopeStructured> {
    const answersHash = JSON.stringify(clarification.answers);
    const cacheKey = `scope:${draftId}:${this.hashString(answersHash)}`;
    
    if (this.cache.has(cacheKey)) {
      console.log(`[AIOrchestrator] Cache hit: ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    const prompt = this.buildScopePrompt(extraction, clarification);
    
    try {
      console.log(`[AIOrchestrator] Generating scope for draft ${draftId}`);
      const response = await this.callGemini(prompt);
      const scope = this.parseScopeJSON(response, extraction.confidence_score, clarification);
      validator.validateScope(scope);
      
      this.cache.set(cacheKey, scope);
      return scope;
    } catch (err: any) {
      console.error(`[AIOrchestrator] Scope generation failed: ${err.message}`);
      throw new Error(`Failed to generate scope: ${err.message}`);
    }
  }

  // ─── Prompt Builders ────────────────────────────────────────────────────────

  private buildExtractionPrompt(title: string, brief: string): string {
    return `You are a technical requirements analyst. Extract structured facts from this task brief.

STRICT RULES:
- Output ONLY valid JSON (no markdown, no explanations, no code fences)
- If information is missing, add to required_missing_fields or pricing_sensitive_fields
- Limit inferred_deliverables to MAX 10 concrete items
- Every missing field MUST have: field_key, question, answer_type, impact, category
- Confidence score 0-1 based on brief clarity (0.3 = very vague, 0.9 = very clear)
- Max 5 questions in required_missing_fields

Task:
Title: ${title}
Brief: ${brief}

Output JSON schema (output ONLY this JSON, nothing else):
{
  "inferred_category": "<smart-contract|frontend|backend|api|bot|analysis|audit|devops|integration|other>",
  "inferred_deliverables": ["<specific deliverable 1>", "<specific deliverable 2>"],
  "required_missing_fields": [
    {
      "field_key": "<unique_snake_case_key>",
      "question": "<clear user question>",
      "answer_type": "<radio|multiselect|number|file|text>",
      "options": ["<option1>", "<option2>"],
      "default_value": "<safe default>",
      "impact": "<critical|high|medium|low>",
      "category": "<technical|business|legal|asset>"
    }
  ],
  "optional_missing_fields": [],
  "pricing_sensitive_fields": [],
  "confidence_score": 0.75
}

EXAMPLES:
Brief: "NFT marketplace on Solana"
→ required_missing_fields: [{field_key: "token_standard", question: "Which token standard?", answer_type: "radio", options: ["SPL Token", "Token-2022"], impact: "critical", category: "technical"}]

Brief: "Build a website"
→ pricing_sensitive_fields: [{field_key: "page_count", question: "How many pages?", answer_type: "number", impact: "high", category: "business"}]

Brief: "Mobile app with logo"
→ optional_missing_fields: [{field_key: "logo_file", question: "Upload logo file", answer_type: "file", impact: "medium", category: "asset"}]

OUTPUT JSON NOW (no markdown, no explanation):`;
  }

  private buildScopePrompt(extraction: ExtractionResult, clarification: ClarificationResponse): string {
    const answersText = Object.entries(clarification.answers)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");

    return `Generate a structured scope from confirmed requirements.

EXTRACTION:
Category: ${extraction.inferred_category}
Deliverables: ${extraction.inferred_deliverables.join(", ")}

CLARIFICATIONS:
${answersText}

Applied Defaults:
${Object.entries(clarification.applied_defaults).map(([k, v]) => `${k}: ${v}`).join("\n")}

OUTPUT JSON schema (output ONLY this JSON, nothing else):
{
  "objective": "<single sentence, max 200 chars, what client wants to achieve>",
  "deliverables": [
    {
      "deliverable_id": "d1",
      "name": "<deliverable name>",
      "description": "<what gets built, be specific>",
      "category": "<code|design|documentation|infrastructure|audit>",
      "estimated_hours": 8,
      "dependencies": []
    }
  ],
  "milestones": [
    {
      "milestone_id": "m1",
      "name": "<milestone name>",
      "deliverable_ids": ["d1"],
      "deadline_offset_days": 7,
      "acceptance_criteria_ids": ["c1"]
    }
  ],
  "acceptance_criteria": [
    {
      "criterion_id": "c1",
      "description": "<measurable criterion with numbers/thresholds>",
      "verification_method": "<automated_test|manual_review|client_approval|metric_threshold>",
      "threshold": "<e.g., >95% test coverage, <100ms response time>",
      "blocking": true
    }
  ],
  "dependencies": ["<external dependency>"],
  "out_of_scope": ["<explicit exclusion>"],
  "assumptions": ["<assumption from defaults or clarifications>"],
  "estimated_hours_by_phase": [
    {
      "phase_name": "Setup & Architecture",
      "estimated_hours": 4,
      "deliverable_ids": ["d1"]
    }
  ],
  "timeline_estimate_days": 14
}

CRITICAL RULES:
1. Every deliverable MUST be concrete (no "high quality code" or "best practices")
2. Every acceptance criterion MUST include numbers/thresholds (e.g., "process 1000 items in <5s")
3. Timeline = sum(estimated_hours_by_phase) / 8 working hours per day
4. If verification_method is "metric_threshold", threshold field is REQUIRED
5. ALL acceptance criteria descriptions must be TESTABLE and MEASURABLE

BAD EXAMPLES (do NOT do this):
- "Build high-quality frontend" → too vague
- "Fast performance" → not measurable
- "Secure authentication" → not testable

GOOD EXAMPLES (do this):
- "React UI with 5 pages: Home, Browse, Detail, Cart, Checkout"
- "API response time <100ms for 95th percentile under 1000 concurrent users"
- "JWT-based authentication with refresh tokens, session timeout 24h"

OUTPUT JSON NOW (no markdown, no explanation):`;
  }

  // ─── JSON Parsing ───────────────────────────────────────────────────────────

  private async callGemini(prompt: string): Promise<string> {
    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Remove markdown code fences if present
    if (text.startsWith("```json")) {
      text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    } else if (text.startsWith("```")) {
      text = text.replace(/```\n?/g, "").trim();
    }

    return text;
  }

  private parseExtractionJSON(text: string): ExtractionResult {
    const parsed = JSON.parse(text);
    return {
      ...parsed,
      extraction_version: "v2",
      extracted_at: new Date().toISOString(),
      model_used: MODEL_NAME,
    };
  }

  private parseScopeJSON(
    text: string,
    baseConfidence: number,
    clarification: ClarificationResponse
  ): ScopeStructured {
    const parsed = JSON.parse(text);
    
    // Calculate adjusted confidence
    const adjustedConfidence = Math.max(
      0.3,
      Math.min(1.0, baseConfidence + clarification.confidence_adjustment)
    );
    
    return {
      ...parsed,
      confidence_score: adjustedConfidence,
      scope_version: "v1",
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Fallback ───────────────────────────────────────────────────────────────

  private fallbackExtraction(title: string, brief: string): ExtractionResult {
    console.warn(`[AIOrchestrator] Using fallback extraction for: ${title}`);
    
    return {
      inferred_category: "other",
      inferred_deliverables: [title],
      required_missing_fields: [
        {
          field_key: "project_scope",
          question: "Please describe the project scope in detail",
          answer_type: "text",
          default_value: "",
          impact: "critical",
          category: "technical",
        },
        {
          field_key: "deliverable_count",
          question: "How many main deliverables are expected?",
          answer_type: "number",
          default_value: 3,
          impact: "high",
          category: "business",
        },
        {
          field_key: "timeline_preference",
          question: "What is your preferred timeline?",
          answer_type: "radio",
          options: ["1-2 weeks", "2-4 weeks", "1-2 months", "2+ months"],
          default_value: "2-4 weeks",
          impact: "high",
          category: "business",
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

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Clear cache for a specific draft (useful for retries).
   */
  clearCache(draftId: string): void {
    const keys = Array.from(this.cache.keys()).filter(k => k.includes(draftId));
    keys.forEach(k => this.cache.delete(k));
    console.log(`[AIOrchestrator] Cleared ${keys.length} cache entries for draft ${draftId}`);
  }
}

export const aiOrchestrator = new AIOrchestrator();
