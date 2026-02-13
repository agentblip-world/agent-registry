/**
 * REST endpoints for the off-chain task workflow system.
 *
 * Each endpoint validates: workflow exists, current status allows transition,
 * and (where applicable) the calling wallet matches the expected role.
 */

import { Router, Request, Response } from "express";
import {
  WorkflowStatus,
  type TaskScope,
  type DeliverableSubmission,
  type RevisionRequest,
  type TaskRating,
} from "../workflow-types";
import {
  WorkflowStore,
  createBlankWorkflow,
  makeActivity,
} from "../workflow-store";
import { generateQuote, generateQuoteFromExtraction } from "../workflow-pricing";
import { generateScope, generateDeterministicScope } from "../gemini-scope";
import { extractStructuredFacts } from "../gemini-extract";

export function workflowRoutes(store: WorkflowStore): Router {
  const router = Router();

  // ─── Create ────────────────────────────────────────────────────────

  /** POST /api/workflows — create a draft workflow */
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

    const wf = createBlankWorkflow({ clientWallet, agentPubkey, agentName, title, brief });
    store.create(wf);

    res.status(201).json(wf);
  });

  // ─── List & Read ───────────────────────────────────────────────────

  /** GET /api/workflows — list workflows with optional filters */
  router.get("/", (req: Request, res: Response) => {
    const { wallet, role, status } = req.query;
    const workflows = store.list({
      wallet: wallet as string | undefined,
      role: role as "client" | "agent" | undefined,
      status: status as WorkflowStatus | undefined,
    });
    res.json({ workflows, total: workflows.length });
  });

  /** GET /api/workflows/:id — get a single workflow with computed SLA fields */
  router.get("/:id", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    // Compute SLA fields
    let slaExpiresAt: string | null = null;
    let slaBreached = false;
    if (wf.slaStartedAt && wf.status === WorkflowStatus.InProgress) {
      const totalHours = wf.slaHours + wf.slaExtendedCount * wf.slaHours;
      const expiresMs = new Date(wf.slaStartedAt).getTime() + totalHours * 3600_000;
      slaExpiresAt = new Date(expiresMs).toISOString();
      slaBreached = Date.now() > expiresMs;
    }

    res.json({ ...wf, slaExpiresAt, slaBreached });
  });

  // ─── Structured Extraction (Stage 2) ────────────────────────────────

  /** POST /api/workflows/:id/extract — extract structured facts from brief (Stage 2) */
  router.post("/:id/extract", async (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.Draft) {
      return res.status(409).json({
        error: `Can only extract from Draft status (current: "${wf.status}")`,
      });
    }

    try {
      const extraction = await extractStructuredFacts({
        title: wf.title,
        brief: wf.brief,
        agentName: wf.agentName,
      });

      // Store extraction in workflow
      const updated = store.update(wf.id, {
        extraction,
        activity: [
          ...wf.activity,
          makeActivity("system", "Structured extraction completed", "system"),
        ],
      });

      res.json({ extraction, workflow: updated });
    } catch (err: any) {
      console.error("Extraction error:", err);
      res.status(500).json({
        error: "Extraction failed",
        message: err.message,
      });
    }
  });

  /** POST /api/workflows/:id/fast-quote — Fast pipeline: extraction + clarifications → instant quote (Stage 5) */
  router.post("/:id/fast-quote", async (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.Draft) {
      return res.status(409).json({
        error: `Can only generate fast quote from Draft status (current: "${wf.status}")`,
      });
    }

    const { extraction, clarifiedAnswers } = req.body;
    if (!extraction) {
      return res.status(400).json({ error: "extraction field required" });
    }

    try {
      // Generate deterministic scope + quote from extraction
      const scope = await generateDeterministicScope(extraction, clarifiedAnswers);
      const quote = generateQuoteFromExtraction(extraction);

      // Update workflow with extraction, answers, scope, and quote
      const updated = store.update(wf.id, {
        extraction,
        clarifiedAnswers: clarifiedAnswers || null,
        scope,
        quote,
        status: WorkflowStatus.QuoteReview,
        activity: [
          ...wf.activity,
          makeActivity("scope_approved", "AI-generated scope approved (fast pipeline)", "system"),
          makeActivity(
            "quote_generated",
            `Quote generated: ${quote.quotedSol} SOL (complexity ${quote.complexity}/10)`,
            "system"
          ),
        ],
      });

      res.json({ scope, quote, workflow: updated });
    } catch (err: any) {
      console.error("Fast quote generation error:", err);
      res.status(500).json({
        error: "Fast quote generation failed",
        message: err.message,
      });
    }
  });

  // ─── Scope ─────────────────────────────────────────────────────────

  /** PATCH /api/workflows/:id/scope — submit or update scope (Draft → ScopeReview) */
  router.patch("/:id/scope", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.Draft && wf.status !== WorkflowStatus.ScopeReview) {
      return res.status(409).json({
        error: `Cannot update scope in status "${wf.status}"`,
      });
    }

    const scope = req.body as TaskScope;
    if (
      !scope.objective ||
      !scope.deliverables?.length ||
      !scope.acceptanceCriteria?.length
    ) {
      return res.status(400).json({
        error: "Scope requires objective, at least 1 deliverable, and at least 1 acceptance criterion",
      });
    }

    // Ensure implementationPhases is at least an empty array if not provided
    if (!scope.implementationPhases) {
      scope.implementationPhases = [];
    }

    const updated = store.update(wf.id, {
      scope,
      status: WorkflowStatus.ScopeReview,
      activity: [
        ...wf.activity,
        makeActivity("scope_submitted", "Scope submitted for review", "client"),
      ],
    });

    res.json(updated);
  });

  /** POST /api/workflows/:id/generate-scope — AI-generate scope from title/brief */
  router.post("/:id/generate-scope", async (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.Draft) {
      return res.status(409).json({
        error: `Cannot generate scope in status "${wf.status}" (must be Draft)`,
      });
    }

    try {
      const scope = await generateScope({
        title: wf.title,
        brief: wf.brief,
        agentName: wf.agentName,
      });

      res.json({ scope });
    } catch (err: any) {
      console.error("Scope generation error:", err);
      res.status(500).json({
        error: "Scope generation failed",
        message: err.message,
      });
    }
  });

  /** POST /api/workflows/:id/generate-scope-from-extraction — Generate scope from confirmed extraction (Stage 4) */
  router.post("/:id/generate-scope-from-extraction", async (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.Draft) {
      return res.status(409).json({
        error: `Can only generate from Draft status (current: "${wf.status}")`,
      });
    }

    const { extraction, clarifiedAnswers } = req.body;
    if (!extraction) {
      return res.status(400).json({ error: "extraction field required" });
    }

    try {
      const scope = await generateDeterministicScope(extraction, clarifiedAnswers);
      res.json({ scope });
    } catch (err: any) {
      console.error("Deterministic scope generation error:", err);
      res.status(500).json({
        error: "Scope generation failed",
        message: err.message,
      });
    }
  });

  /** POST /api/workflows/:id/approve-scope — approve scope, generates quote (ScopeReview → QuoteReview) */
  router.post("/:id/approve-scope", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.ScopeReview) {
      return res.status(409).json({
        error: `Cannot approve scope in status "${wf.status}"`,
      });
    }

    if (!wf.scope) {
      return res.status(400).json({ error: "No scope to approve" });
    }

    // Use extraction-based quote if extraction exists (v2 pipeline), otherwise legacy scope-based quote
    const quote = wf.extraction
      ? generateQuoteFromExtraction(wf.extraction)
      : generateQuote(wf.scope);

    const updated = store.update(wf.id, {
      quote,
      status: WorkflowStatus.QuoteReview,
      activity: [
        ...wf.activity,
        makeActivity("scope_approved", "Scope approved", "client"),
        makeActivity(
          "quote_generated",
          `Quote generated: ${quote.quotedSol} SOL (complexity ${quote.complexity}/10)`,
          "system"
        ),
      ],
    });

    res.json(updated);
  });

  /** POST /api/workflows/:id/revise-scope — send scope back to draft (ScopeReview → Draft) */
  router.post("/:id/revise-scope", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.ScopeReview) {
      return res.status(409).json({
        error: `Cannot revise scope in status "${wf.status}"`,
      });
    }

    const updated = store.update(wf.id, {
      status: WorkflowStatus.Draft,
      activity: [
        ...wf.activity,
        makeActivity("scope_revised", "Scope sent back for revision", "client"),
      ],
    });

    res.json(updated);
  });

  // ─── Quote ─────────────────────────────────────────────────────────

  /** POST /api/workflows/:id/accept-quote — accept the quote (QuoteReview → AwaitingEscrow) */
  router.post("/:id/accept-quote", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.QuoteReview) {
      return res.status(409).json({
        error: `Cannot accept quote in status "${wf.status}"`,
      });
    }

    const updated = store.update(wf.id, {
      status: WorkflowStatus.AwaitingEscrow,
      activity: [
        ...wf.activity,
        makeActivity("quote_accepted", "Quote accepted — awaiting escrow funding", "client"),
      ],
    });

    res.json(updated);
  });

  // ─── Funding ───────────────────────────────────────────────────────

  /** POST /api/workflows/:id/fund — record on-chain funding (AwaitingEscrow → InProgress) */
  router.post("/:id/fund", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.AwaitingEscrow) {
      return res.status(409).json({
        error: `Cannot fund in status "${wf.status}"`,
      });
    }

    const { txSig, escrowPubkey } = req.body;
    if (!txSig || !escrowPubkey) {
      return res.status(400).json({ error: "Missing txSig or escrowPubkey" });
    }

    const updated = store.update(wf.id, {
      escrowPubkey,
      fundTxSig: txSig,
      status: WorkflowStatus.InProgress,
      slaStartedAt: new Date().toISOString(),
      activity: [
        ...wf.activity,
        makeActivity(
          "funded",
          `Escrow funded with ${wf.quote?.quotedSol ?? "?"} SOL (tx: ${txSig.slice(0, 12)}...)`,
          "client"
        ),
        makeActivity("agent_accepted", "Agent accepted the task", "agent"),
      ],
    });

    res.json(updated);
  });

  // ─── Cancel ────────────────────────────────────────────────────────

  /** POST /api/workflows/:id/cancel — cancel (Draft/ScopeReview/AwaitingEscrow → Cancelled) */
  router.post("/:id/cancel", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    const cancellable: WorkflowStatus[] = [
      WorkflowStatus.Draft,
      WorkflowStatus.ScopeReview,
      WorkflowStatus.QuoteReview,
      WorkflowStatus.AwaitingEscrow,
    ];
    if (!cancellable.includes(wf.status)) {
      return res.status(409).json({
        error: `Cannot cancel in status "${wf.status}"`,
      });
    }

    const updated = store.update(wf.id, {
      status: WorkflowStatus.Cancelled,
      activity: [
        ...wf.activity,
        makeActivity("cancelled", "Workflow cancelled by client", "client"),
      ],
    });

    res.json(updated);
  });

  // ─── Deliverables ──────────────────────────────────────────────────

  /** POST /api/workflows/:id/submit — agent submits deliverables (InProgress/RevisionRequested → UnderReview) */
  router.post("/:id/submit", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (
      wf.status !== WorkflowStatus.InProgress &&
      wf.status !== WorkflowStatus.RevisionRequested
    ) {
      return res.status(409).json({
        error: `Cannot submit deliverables in status "${wf.status}"`,
      });
    }

    const { summary, items, notes } = req.body;
    if (!summary || !items?.length) {
      return res.status(400).json({ error: "Missing summary or items" });
    }

    const submission: DeliverableSubmission = {
      summary,
      items,
      notes: notes || "",
      submittedAt: new Date().toISOString(),
    };

    const updated = store.update(wf.id, {
      status: WorkflowStatus.UnderReview,
      submissions: [...wf.submissions, submission],
      activity: [
        ...wf.activity,
        makeActivity("deliverable_submitted", "Deliverables submitted for review", "agent"),
      ],
    });

    res.json(updated);
  });

  /** POST /api/workflows/:id/request-revision — client requests revision (UnderReview → RevisionRequested) */
  router.post("/:id/request-revision", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.UnderReview) {
      return res.status(409).json({
        error: `Cannot request revision in status "${wf.status}"`,
      });
    }

    if (wf.revisions.length >= wf.maxRevisions) {
      return res.status(409).json({
        error: `Maximum revisions (${wf.maxRevisions}) reached`,
      });
    }

    const { reason, items } = req.body;
    if (!reason) {
      return res.status(400).json({ error: "Missing reason" });
    }

    const revision: RevisionRequest = {
      reason,
      items: items || [],
      requestedAt: new Date().toISOString(),
    };

    const updated = store.update(wf.id, {
      status: WorkflowStatus.RevisionRequested,
      revisions: [...wf.revisions, revision],
      activity: [
        ...wf.activity,
        makeActivity(
          "revision_requested",
          `Revision requested (${wf.revisions.length + 1}/${wf.maxRevisions}): ${reason}`,
          "client"
        ),
      ],
    });

    res.json(updated);
  });

  /** POST /api/workflows/:id/accept — client accepts deliverables (UnderReview → Completed) */
  router.post("/:id/accept", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.UnderReview) {
      return res.status(409).json({
        error: `Cannot accept deliverables in status "${wf.status}"`,
      });
    }

    const { txSig } = req.body;

    const updated = store.update(wf.id, {
      status: WorkflowStatus.Completed,
      completeTxSig: txSig || null,
      activity: [
        ...wf.activity,
        makeActivity("accepted", "Deliverables accepted by client", "client"),
        makeActivity("completed", "Task completed — escrow released to agent", "system"),
      ],
    });

    res.json(updated);
  });

  // ─── SLA ───────────────────────────────────────────────────────────

  /** POST /api/workflows/:id/refund — refund on SLA breach (InProgress → Refunded) */
  router.post("/:id/refund", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.InProgress) {
      return res.status(409).json({
        error: `Cannot refund in status "${wf.status}"`,
      });
    }

    // Check SLA breach
    if (wf.slaStartedAt) {
      const totalHours = wf.slaHours + wf.slaExtendedCount * wf.slaHours;
      const expiresMs = new Date(wf.slaStartedAt).getTime() + totalHours * 3600_000;
      if (Date.now() <= expiresMs) {
        return res.status(409).json({
          error: "SLA has not been breached yet. Cannot refund.",
        });
      }
    }

    const { txSig } = req.body;

    const updated = store.update(wf.id, {
      status: WorkflowStatus.Refunded,
      activity: [
        ...wf.activity,
        makeActivity(
          "refunded",
          `Task refunded due to SLA breach${txSig ? ` (tx: ${txSig.slice(0, 12)}...)` : ""}`,
          "client"
        ),
      ],
    });

    res.json(updated);
  });

  /** POST /api/workflows/:id/extend-sla — extend SLA by another period */
  router.post("/:id/extend-sla", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.InProgress) {
      return res.status(409).json({
        error: `Cannot extend SLA in status "${wf.status}"`,
      });
    }

    const updated = store.update(wf.id, {
      slaExtendedCount: wf.slaExtendedCount + 1,
      activity: [
        ...wf.activity,
        makeActivity(
          "sla_extended",
          `SLA extended by ${wf.slaHours}h (extension #${wf.slaExtendedCount + 1})`,
          "client"
        ),
      ],
    });

    res.json(updated);
  });

  // ─── Rating ────────────────────────────────────────────────────────

  /** POST /api/workflows/:id/rate — rate the agent (Completed → Rated) */
  router.post("/:id/rate", (req: Request, res: Response) => {
    const wf = store.get(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });

    if (wf.status !== WorkflowStatus.Completed) {
      return res.status(409).json({
        error: `Cannot rate in status "${wf.status}"`,
      });
    }

    const { overall, quality, speed, communication, review, txSig } = req.body;

    if (!overall || overall < 1 || overall > 5) {
      return res.status(400).json({ error: "overall rating must be 1-5" });
    }

    const rating: TaskRating = {
      overall,
      quality: quality || overall,
      speed: speed || overall,
      communication: communication || overall,
      review: (review || "").slice(0, 500),
    };

    const updated = store.update(wf.id, {
      status: WorkflowStatus.Rated,
      rating,
      rateTxSig: txSig || null,
      activity: [
        ...wf.activity,
        makeActivity(
          "rated",
          `Agent rated ${overall}/5${review ? `: "${review.slice(0, 60)}${review.length > 60 ? "..." : ""}"` : ""}`,
          "client"
        ),
      ],
    });

    res.json(updated);
  });

  return router;
}
