/**
 * V2 Task Creation Flow API Routes.
 * State machine-driven workflow with deterministic pricing.
 */

import { Router, Request, Response } from "express";
import { draftStore } from "../draft-store";
import { stateMachine } from "../state-machine";
import { aiOrchestrator } from "../ai-orchestrator";
import { complexityCalculator } from "../complexity-calculator";
import { pricingEngine } from "../pricing-engine";
import { riskDetector } from "../risk-detector";
import type { ClarificationResponse, ScopeDrivers } from "../schema-types";

export function draftRoutes(): Router {
  const router = Router();

  // ─── Create Draft (INIT) ────────────────────────────────────────────────────

  /**
   * POST /api/drafts
   * Create new task draft → INIT state
   */
  router.post("/", (req: Request, res: Response) => {
    const { clientWallet, agentPubkey, agentName, title, brief } = req.body;

    if (!clientWallet || !agentPubkey || !agentName || !title || !brief) {
      return res.status(400).json({
        error: "Missing required fields: clientWallet, agentPubkey, agentName, title, brief",
      });
    }

    if (title.length > 100) {
      return res.status(400).json({ error: "Title must be 100 characters or less" });
    }

    if (brief.length > 500) {
      return res.status(400).json({ error: "Brief must be 500 characters or less" });
    }

    try {
      const draft = draftStore.create({
        title: title.trim(),
        brief: brief.trim(),
        client_wallet: clientWallet,
        agent_pubkey: agentPubkey,
        agent_name: agentName,
      });

      res.status(201).json({
        draft,
        next_actions: stateMachine.getNextActions("INIT"),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create draft", message: err.message });
    }
  });

  // ─── Analyze (INIT → ANALYZING → CLARIFY_PENDING | SCOPE_DRAFT) ────────────

  /**
   * POST /api/drafts/:id/analyze
   * Extract structured facts from brief
   */
  router.post("/:id/analyze", async (req: Request, res: Response) => {
    const draft = draftStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    if (draft.current_state !== "INIT") {
      return res.status(409).json({
        error: `Cannot analyze from state "${draft.current_state}" (must be INIT)`,
      });
    }

    try {
      // Transition to ANALYZING
      draftStore.transition(draft.draft_id, "ANALYZING", "auto");

      // Extract facts
      const extraction = await aiOrchestrator.extract(draft.draft_id, draft.title, draft.brief);

      // Store extraction
      const updated = draftStore.update(draft.draft_id, { extraction_result: extraction });

      // Determine next state
      const allQuestions = [
        ...extraction.required_missing_fields,
        ...extraction.pricing_sensitive_fields,
      ];

      if (allQuestions.length > 0) {
        // Has questions → CLARIFY_PENDING
        const withState = draftStore.transition(
          draft.draft_id,
          "CLARIFY_PENDING",
          "ai",
          { question_count: allQuestions.length }
        );

        res.json({
          draft: withState,
          extraction,
          questions: allQuestions.slice(0, 5), // Max 5 questions
          next_actions: stateMachine.getNextActions("CLARIFY_PENDING"),
        });
      } else {
        // No questions → SCOPE_DRAFT (auto-proceed)
        const withState = draftStore.transition(draft.draft_id, "SCOPE_DRAFT", "auto");

        res.json({
          draft: withState,
          extraction,
          next_actions: ["generate_scope"], // Frontend should auto-call /generate-scope
        });
      }
    } catch (err: any) {
      console.error("Analysis error:", err);

      // Transition back to INIT on failure
      draftStore.transition(draft.draft_id, "INIT", "error", { error: err.message });

      res.status(500).json({
        error: "Analysis failed",
        message: err.message,
        can_retry: true,
      });
    }
  });

  // ─── Clarify (CLARIFY_PENDING → CLARIFY_COMPLETE) ──────────────────────────

  /**
   * POST /api/drafts/:id/clarify
   * Submit clarification answers
   */
  router.post("/:id/clarify", async (req: Request, res: Response) => {
    const draft = draftStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    if (draft.current_state !== "CLARIFY_PENDING") {
      return res.status(409).json({
        error: `Cannot clarify from state "${draft.current_state}" (must be CLARIFY_PENDING)`,
      });
    }

    const { answers, skipped } = req.body;

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "answers object required" });
    }

    try {
      // Build clarification response
      const clarification: ClarificationResponse = {
        answers,
        skipped_fields: skipped || [],
        applied_defaults: {},
        uploaded_assets: [], // TODO: file upload handling
        confidence_adjustment: -0.05 * (skipped?.length || 0),
      };

      // Apply defaults for skipped fields
      if (draft.extraction_result) {
        const allFields = [
          ...draft.extraction_result.required_missing_fields,
          ...draft.extraction_result.pricing_sensitive_fields,
        ];

        for (const field of allFields) {
          if (skipped?.includes(field.field_key) && field.default_value !== undefined) {
            clarification.applied_defaults[field.field_key] = field.default_value;
          }
        }
      }

      // Store clarification
      const updated = draftStore.update(draft.draft_id, { clarification_response: clarification });

      // Transition to CLARIFY_COMPLETE
      const withState = draftStore.transition(
        draft.draft_id,
        "CLARIFY_COMPLETE",
        "user",
        { answered: Object.keys(answers).length, skipped: skipped?.length || 0 }
      );

      res.json({
        draft: withState,
        clarification,
        next_actions: ["generate_scope"], // Frontend should auto-call /generate-scope
      });
    } catch (err: any) {
      res.status(500).json({ error: "Clarification failed", message: err.message });
    }
  });

  // ─── Generate Scope (CLARIFY_COMPLETE | SCOPE_DRAFT → SCOPE_READY) ─────────

  /**
   * POST /api/drafts/:id/generate-scope
   * Generate structured scope from extraction + clarifications
   */
  router.post("/:id/generate-scope", async (req: Request, res: Response) => {
    const draft = draftStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    const validStates = ["CLARIFY_COMPLETE", "SCOPE_DRAFT"];
    if (!validStates.includes(draft.current_state)) {
      return res.status(409).json({
        error: `Cannot generate scope from state "${draft.current_state}"`,
      });
    }

    if (!draft.extraction_result) {
      return res.status(400).json({ error: "No extraction result found" });
    }

    try {
      // Transition to SCOPE_DRAFT if not already
      if (draft.current_state !== "SCOPE_DRAFT") {
        draftStore.transition(draft.draft_id, "SCOPE_DRAFT", "auto");
      }

      // Default clarification if skipped
      const clarification = draft.clarification_response || {
        answers: {},
        skipped_fields: [],
        applied_defaults: {},
        uploaded_assets: [],
        confidence_adjustment: 0,
      };

      // Generate scope
      const scope = await aiOrchestrator.generateScope(
        draft.draft_id,
        draft.extraction_result,
        clarification
      );

      // Detect risks
      const riskAssessment = riskDetector.detectRisks(scope, clarification);

      // Store scope + risks
      const updated = draftStore.update(draft.draft_id, {
        scope_structured: scope,
        requires_human_review: riskAssessment.requires_human_review,
        risk_flags: riskAssessment.risk_flags,
      });

      // Transition to SCOPE_READY
      const withState = draftStore.transition(
        draft.draft_id,
        "SCOPE_READY",
        "ai",
        { risk_count: riskAssessment.risk_flags.length }
      );

      res.json({
        draft: withState,
        scope,
        risk_assessment: riskAssessment,
        next_actions: stateMachine.getNextActions("SCOPE_READY"),
      });
    } catch (err: any) {
      console.error("Scope generation error:", err);

      // If scope gen fails due to missing info, go back to CLARIFY_PENDING
      draftStore.transition(draft.draft_id, "CLARIFY_PENDING", "error", { error: err.message });

      res.status(500).json({
        error: "Scope generation failed",
        message: err.message,
        suggestion: "More clarification may be needed",
      });
    }
  });

  // ─── Approve Scope (SCOPE_READY → COMPLEXITY_CALC → QUOTE_READY) ───────────

  /**
   * POST /api/drafts/:id/approve-scope
   * Approve scope, calculate complexity & pricing
   */
  router.post("/:id/approve-scope", async (req: Request, res: Response) => {
    const draft = draftStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    if (draft.current_state !== "SCOPE_READY") {
      return res.status(409).json({
        error: `Cannot approve scope from state "${draft.current_state}"`,
      });
    }

    if (!draft.scope_structured || !draft.extraction_result) {
      return res.status(400).json({ error: "No scope found to approve" });
    }

    try {
      // Transition to COMPLEXITY_CALC
      draftStore.transition(draft.draft_id, "COMPLEXITY_CALC", "user");

      // Calculate complexity
      const clarification = draft.clarification_response || {
        answers: {},
        skipped_fields: [],
        applied_defaults: {},
        uploaded_assets: [],
        confidence_adjustment: 0,
      };

      const complexityInputs = complexityCalculator.scopeToComplexityInputs(
        draft.scope_structured,
        clarification
      );

      const complexity = complexityCalculator.calculateComplexity(complexityInputs);

      // Calculate pricing
      const agentBaseRate = req.body.agentBaseRateLamports || 66666666; // Default ~0.067 SOL/hr (~$10/hr @ $150/SOL)
      const pricing = pricingEngine.calculatePrice(
        complexity,
        draft.scope_structured,
        agentBaseRate
      );

      // Store results
      const updated = draftStore.update(draft.draft_id, {
        complexity_result: complexity,
        pricing_result: pricing,
      });

      // Transition to QUOTE_READY
      const withState = draftStore.transition(
        draft.draft_id,
        "QUOTE_READY",
        "system",
        { complexity_score: complexity.complexity_score, price_sol: pricing.total_sol }
      );

      res.json({
        draft: withState,
        complexity,
        pricing,
        pricing_breakdown: pricingEngine.generateBreakdownText(pricing),
        next_actions: stateMachine.getNextActions("QUOTE_READY"),
      });
    } catch (err: any) {
      console.error("Approval error:", err);

      // Transition back to SCOPE_READY on failure
      draftStore.transition(draft.draft_id, "SCOPE_READY", "error", { error: err.message });

      res.status(500).json({ error: "Failed to approve scope", message: err.message });
    }
  });

  // ─── Edit Scope (QUOTE_READY → QUOTE_EDITING) ──────────────────────────────

  /**
   * POST /api/drafts/:id/edit-scope
   * Enter scope editing mode
   */
  router.post("/:id/edit-scope", (req: Request, res: Response) => {
    const draft = draftStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    if (draft.current_state !== "QUOTE_READY") {
      return res.status(409).json({
        error: `Cannot edit scope from state "${draft.current_state}"`,
      });
    }

    try {
      // Initialize scope drivers from current scope
      const currentScope = draft.scope_structured!;
      const scopeDrivers: ScopeDrivers = {
        estimated_hours: currentScope.estimated_hours_by_phase.reduce(
          (sum, p) => sum + p.estimated_hours,
          0
        ),
        urgency_level: "standard",
        quality_tier: "standard",
      };

      const updated = draftStore.update(draft.draft_id, { scope_drivers: scopeDrivers });

      // Transition to QUOTE_EDITING
      const withState = draftStore.transition(draft.draft_id, "QUOTE_EDITING", "user");

      res.json({
        draft: withState,
        scope_drivers: scopeDrivers,
        next_actions: stateMachine.getNextActions("QUOTE_EDITING"),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to enter edit mode", message: err.message });
    }
  });

  // ─── Requote (QUOTE_EDITING → COMPLEXITY_CALC → QUOTE_READY) ───────────────

  /**
   * POST /api/drafts/:id/requote
   * Recalculate quote with updated scope drivers
   */
  router.post("/:id/requote", async (req: Request, res: Response) => {
    const draft = draftStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    if (draft.current_state !== "QUOTE_EDITING") {
      return res.status(409).json({
        error: `Cannot requote from state "${draft.current_state}"`,
      });
    }

    const { scope_drivers } = req.body;

    if (!scope_drivers) {
      return res.status(400).json({ error: "scope_drivers required" });
    }

    try {
      // Transition to COMPLEXITY_CALC
      draftStore.transition(draft.draft_id, "COMPLEXITY_CALC", "user");

      // Requote
      const agentBaseRate = req.body.agentBaseRateLamports || 66666666;
      const { pricing, complexity } = pricingEngine.requote(
        draft.pricing_result!,
        draft.scope_structured!,
        draft.complexity_result!,
        scope_drivers,
        agentBaseRate
      );

      // Store updated results
      const updated = draftStore.update(draft.draft_id, {
        complexity_result: complexity,
        pricing_result: pricing,
        scope_drivers,
      });

      // Transition to QUOTE_READY
      const withState = draftStore.transition(
        draft.draft_id,
        "QUOTE_READY",
        "system",
        { requote: true, price_sol: pricing.total_sol }
      );

      res.json({
        draft: withState,
        complexity,
        pricing,
        pricing_breakdown: pricingEngine.generateBreakdownText(pricing),
        next_actions: stateMachine.getNextActions("QUOTE_READY"),
      });
    } catch (err: any) {
      console.error("Requote error:", err);

      // Transition back to QUOTE_EDITING on failure
      draftStore.transition(draft.draft_id, "QUOTE_EDITING", "error", { error: err.message });

      res.status(500).json({ error: "Requote failed", message: err.message });
    }
  });

  // ─── Confirm Quote (QUOTE_READY → CONFIRMED) ───────────────────────────────

  /**
   * POST /api/drafts/:id/confirm
   * Accept quote and lock in price
   */
  router.post("/:id/confirm", (req: Request, res: Response) => {
    const draft = draftStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    if (draft.current_state !== "QUOTE_READY") {
      return res.status(409).json({
        error: `Cannot confirm from state "${draft.current_state}"`,
      });
    }

    if (!draft.pricing_result) {
      return res.status(400).json({ error: "No pricing found to confirm" });
    }

    // Check if quote expired
    if (new Date(draft.pricing_result.valid_until) < new Date()) {
      return res.status(409).json({
        error: "Quote expired",
        message: "Please requote to get updated pricing",
      });
    }

    try {
      // Transition to CONFIRMED
      const withState = draftStore.transition(
        draft.draft_id,
        "CONFIRMED",
        "user",
        { price_sol: draft.pricing_result.total_sol }
      );

      res.json({
        draft: withState,
        next_actions: stateMachine.getNextActions("CONFIRMED"),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Confirmation failed", message: err.message });
    }
  });

  // ─── Cancel (ANY → CANCELLED) ───────────────────────────────────────────────

  /**
   * POST /api/drafts/:id/cancel
   * Cancel draft from any state
   */
  router.post("/:id/cancel", (req: Request, res: Response) => {
    const draft = draftStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    if (stateMachine.isTerminal(draft.current_state)) {
      return res.status(409).json({
        error: `Cannot cancel from terminal state "${draft.current_state}"`,
      });
    }

    try {
      const withState = draftStore.transition(
        draft.draft_id,
        "CANCELLED",
        "user",
        { reason: req.body.reason || "User cancelled" }
      );

      res.json({ draft: withState });
    } catch (err: any) {
      res.status(500).json({ error: "Cancellation failed", message: err.message });
    }
  });

  // ─── Get State ──────────────────────────────────────────────────────────────

  /**
   * GET /api/drafts/:id
   * Get current draft state
   */
  router.get("/:id", (req: Request, res: Response) => {
    const draft = draftStore.get(req.params.id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    res.json({
      draft,
      state_description: stateMachine.getStateDescription(draft.current_state),
      next_actions: stateMachine.getNextActions(draft.current_state),
      is_waiting: stateMachine.isWaiting(draft.current_state),
    });
  });

  /**
   * GET /api/drafts
   * List all drafts (with filters)
   */
  router.get("/", (req: Request, res: Response) => {
    const { state, client_wallet } = req.query;

    const drafts = draftStore.list({
      state: state as any,
      client_wallet: client_wallet as string,
    });

    res.json({ drafts, total: drafts.length });
  });

  return router;
}
