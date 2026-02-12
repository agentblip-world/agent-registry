/**
 * TypeScript types for the off-chain task workflow system.
 *
 * The workflow enriches the minimal on-chain task lifecycle
 * (Funded → InProgress → Completed) with scope definition,
 * automated pricing, UAT with bounded revisions, and multi-dimensional ratings.
 */

// ─── Workflow Status ─────────────────────────────────────────────────────────

export enum WorkflowStatus {
  Draft = "draft",
  ScopeReview = "scope_review",
  QuoteReview = "quote_review",
  AwaitingEscrow = "awaiting_escrow",
  InProgress = "in_progress",
  UnderReview = "under_review",
  RevisionRequested = "revision_requested",
  Completed = "completed",
  Cancelled = "cancelled",
  Refunded = "refunded",
  Rated = "rated",
}

// ─── Scope ───────────────────────────────────────────────────────────────────

export interface ImplementationPhase {
  name: string;
  description: string;
  estimatedHours: number;
  deliverables: string[];
}

export interface TaskScope {
  objective: string;
  deliverables: string[];
  implementationPhases: ImplementationPhase[];
  outOfScope: string[];
  assumptions: string[];
  acceptanceCriteria: string[];
}

// ─── Quote ───────────────────────────────────────────────────────────────────

export interface TaskQuote {
  complexity: number; // 1-10
  pricePerPoint: number; // lamports per complexity point
  quotedLamports: number;
  quotedSol: number;
  estimatedHours: number;
  breakdown: string;
}

// ─── Rating ──────────────────────────────────────────────────────────────────

export interface TaskRating {
  overall: number; // 1-5, goes on-chain
  quality: number; // 1-5
  speed: number; // 1-5
  communication: number; // 1-5
  review: string; // max 500 chars
}

// ─── Deliverables & Revisions ────────────────────────────────────────────────

export interface DeliverableSubmission {
  summary: string;
  items: string[];
  notes: string;
  submittedAt: string; // ISO timestamp
}

export interface RevisionRequest {
  reason: string;
  items: string[];
  requestedAt: string; // ISO timestamp
}

// ─── Activity Feed ───────────────────────────────────────────────────────────

export type ActivityActor = "client" | "agent" | "system";

export type ActivityType =
  | "created"
  | "scope_submitted"
  | "scope_approved"
  | "scope_revised"
  | "quote_generated"
  | "quote_accepted"
  | "funded"
  | "agent_accepted"
  | "deliverable_submitted"
  | "revision_requested"
  | "accepted"
  | "completed"
  | "rated"
  | "cancelled"
  | "refunded"
  | "sla_extended";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: string; // ISO
  actor: ActivityActor;
}

// ─── Main Workflow Record ────────────────────────────────────────────────────

export interface TaskWorkflow {
  // Identity
  id: string; // UUID
  taskId: string; // on-chain task ID (slug)

  // Participants
  clientWallet: string;
  agentPubkey: string; // agent profile PDA
  agentName: string;

  // Brief
  title: string;
  brief: string;

  // Structured scope
  scope: TaskScope | null;

  // Quote (computed after scope approval)
  quote: TaskQuote | null;

  // Status
  status: WorkflowStatus;

  // On-chain references (set after funding / completion / rating)
  escrowPubkey: string | null;
  fundTxSig: string | null;
  completeTxSig: string | null;
  rateTxSig: string | null;

  // Deliverables & revisions
  submissions: DeliverableSubmission[];
  revisions: RevisionRequest[];
  maxRevisions: number; // default 2

  // Rating
  rating: TaskRating | null;

  // SLA
  slaHours: number; // default 6
  slaStartedAt: string | null; // ISO, set when InProgress
  slaExtendedCount: number;

  // Activity log
  activity: ActivityEntry[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
}
