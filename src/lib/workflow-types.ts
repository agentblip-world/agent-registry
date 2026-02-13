/**
 * Workflow types for the frontend.
 * Mirrors src/api/workflow-types.ts but standalone for the app bundle.
 */

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

export interface TaskQuote {
  complexity: number;
  pricePerPoint: number;
  quotedLamports: number;
  quotedSol: number;
  estimatedHours: number;
  breakdown: string;
}

export interface TaskRating {
  overall: number;
  quality: number;
  speed: number;
  communication: number;
  review: string;
}

export interface DeliverableSubmission {
  summary: string;
  items: string[];
  notes: string;
  submittedAt: string;
}

export interface RevisionRequest {
  reason: string;
  items: string[];
  requestedAt: string;
}

export type ActivityActor = "client" | "agent" | "system";

export type ActivityType =
  | "created" | "scope_submitted" | "scope_approved" | "scope_revised"
  | "quote_generated" | "quote_accepted" | "funded" | "agent_accepted"
  | "deliverable_submitted" | "revision_requested" | "accepted"
  | "completed" | "rated" | "cancelled" | "refunded" | "sla_extended";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: string;
  actor: ActivityActor;
}

export interface TaskWorkflow {
  id: string;
  taskId: string;
  clientWallet: string;
  agentPubkey: string;
  agentName: string;
  title: string;
  brief: string;
  extraction: any | null; // StructuredExtraction from API
  clarifiedAnswers: Record<string, string> | null;
  scope: TaskScope | null;
  quote: TaskQuote | null;
  status: WorkflowStatus;
  escrowPubkey: string | null;
  fundTxSig: string | null;
  completeTxSig: string | null;
  rateTxSig: string | null;
  submissions: DeliverableSubmission[];
  revisions: RevisionRequest[];
  maxRevisions: number;
  rating: TaskRating | null;
  slaHours: number;
  slaStartedAt: string | null;
  slaExtendedCount: number;
  activity: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
  // Computed by API
  slaExpiresAt?: string;
  slaBreached?: boolean;
}
