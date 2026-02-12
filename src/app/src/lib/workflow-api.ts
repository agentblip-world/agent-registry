/**
 * API client for the task workflow system.
 * Falls back to mock data when the API is unavailable (same pattern as api.ts).
 */

import type {
  TaskWorkflow,
  TaskScope,
  DeliverableSubmission,
  RevisionRequest,
  TaskRating,
  WorkflowStatus,
} from "./workflow-types";

export type {
  TaskWorkflow,
  TaskScope,
  DeliverableSubmission,
  RevisionRequest,
  TaskRating,
};

export { WorkflowStatus } from "./workflow-types";

const API_BASE = "/api/workflows";

let useMockData = false;

// ─── Fetch Helpers ───────────────────────────────────────────────────────────

async function safeFetch<T>(
  url: string,
  fallback: T,
  init?: RequestInit
): Promise<T> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    useMockData = true;
    return fallback;
  }
}

async function safePost<T>(url: string, body: unknown, fallback: T): Promise<T> {
  return safeFetch<T>(url, fallback, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function safePatch<T>(url: string, body: unknown, fallback: T): Promise<T> {
  return safeFetch<T>(url, fallback, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function isWorkflowMockData(): boolean {
  return useMockData;
}

// ─── API Functions ───────────────────────────────────────────────────────────

export async function createWorkflow(params: {
  clientWallet: string;
  agentPubkey: string;
  agentName: string;
  title: string;
  brief: string;
}): Promise<TaskWorkflow> {
  return safePost<TaskWorkflow>(`${API_BASE}`, params, createMockDraft(params));
}

export async function fetchWorkflows(filters?: {
  wallet?: string;
  role?: string;
  status?: string;
}): Promise<{ workflows: TaskWorkflow[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.wallet) params.set("wallet", filters.wallet);
  if (filters?.role) params.set("role", filters.role);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  const url = `${API_BASE}${qs ? `?${qs}` : ""}`;
  return safeFetch(url, { workflows: getMockWorkflows(), total: getMockWorkflows().length });
}

export async function fetchWorkflow(id: string): Promise<TaskWorkflow & { slaExpiresAt?: string; slaBreached?: boolean }> {
  const mock = getMockWorkflows().find((w) => w.id === id) || getMockWorkflows()[0];
  return safeFetch(`${API_BASE}/${id}`, mock);
}

export async function generateScopeFromAI(id: string): Promise<{ scope: TaskScope }> {
  return safePost(`${API_BASE}/${id}/generate-scope`, {}, { scope: createMockScope() });
}

export async function submitScope(id: string, scope: TaskScope): Promise<TaskWorkflow> {
  return safePatch(`${API_BASE}/${id}/scope`, scope, getMockWorkflows()[0]);
}

export async function approveScope(id: string): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/approve-scope`, {}, getMockWorkflows()[0]);
}

export async function reviseScope(id: string): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/revise-scope`, {}, getMockWorkflows()[0]);
}

export async function acceptQuote(id: string): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/accept-quote`, {}, getMockWorkflows()[0]);
}

export async function recordFunding(
  id: string,
  txSig: string,
  escrowPubkey: string
): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/fund`, { txSig, escrowPubkey }, getMockWorkflows()[0]);
}

export async function cancelWorkflow(id: string): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/cancel`, {}, getMockWorkflows()[0]);
}

export async function refundWorkflow(id: string, txSig?: string): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/refund`, { txSig }, getMockWorkflows()[0]);
}

export async function extendSla(id: string): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/extend-sla`, {}, getMockWorkflows()[0]);
}

export async function submitDeliverables(
  id: string,
  submission: { summary: string; items: string[]; notes?: string }
): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/submit`, submission, getMockWorkflows()[0]);
}

export async function requestRevision(
  id: string,
  revision: { reason: string; items?: string[] }
): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/request-revision`, revision, getMockWorkflows()[0]);
}

export async function acceptDeliverables(id: string, txSig?: string): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/accept`, { txSig }, getMockWorkflows()[0]);
}

export async function rateWorkflow(
  id: string,
  rating: TaskRating,
  txSig?: string
): Promise<TaskWorkflow> {
  return safePost(`${API_BASE}/${id}/rate`, { ...rating, txSig }, getMockWorkflows()[0]);
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

function createMockDraft(params: {
  clientWallet: string;
  agentPubkey: string;
  agentName: string;
  title: string;
  brief: string;
}): TaskWorkflow {
  const id = "mock-" + Math.random().toString(36).slice(2, 10);
  const now = new Date().toISOString();
  return {
    id,
    taskId: params.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) + "-" + id.slice(0, 8),
    clientWallet: params.clientWallet,
    agentPubkey: params.agentPubkey,
    agentName: params.agentName,
    title: params.title,
    brief: params.brief,
    scope: null,
    quote: null,
    status: "draft" as WorkflowStatus,
    escrowPubkey: null,
    fundTxSig: null,
    completeTxSig: null,
    rateTxSig: null,
    submissions: [],
    revisions: [],
    maxRevisions: 2,
    rating: null,
    slaHours: 6,
    slaStartedAt: null,
    slaExtendedCount: 0,
    activity: [{ id: "1", type: "created", message: `Workflow created: "${params.title}"`, timestamp: now, actor: "client" }],
    createdAt: now,
    updatedAt: now,
  };
}

function getMockWorkflows(): TaskWorkflow[] {
  const now = new Date();
  const ts = (offsetMs: number) => new Date(now.getTime() - offsetMs).toISOString();

  return [
    {
      id: "mock-wf-0001-aaaa-bbbb-ccccddddeeee",
      taskId: "smart-contract-audit-mock-wf-0",
      clientWallet: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
      agentPubkey: "AgNt5555555555555555555555555555555555555555",
      agentName: "SecurityAudit AI",
      title: "Smart Contract Security Audit",
      brief: "Comprehensive audit of our token swap program.",
      scope: {
        objective: "Identify security vulnerabilities in the token swap program",
        deliverables: ["Full security audit report", "Vulnerability list with severity ratings", "Recommended fixes"],
        implementationPhases: [],
        outOfScope: ["Frontend UI security"],
        assumptions: ["Source code via GitHub"],
        acceptanceCriteria: ["All critical/high vulnerabilities identified", "Each finding includes PoC"],
      },
      quote: {
        complexity: 5.5,
        pricePerPoint: 333333,
        quotedLamports: 183_333_333,
        quotedSol: 0.1833,
        estimatedHours: 11,
        breakdown: "Complexity: 5.5/10\nTotal: 0.1833 SOL (~$27.50)",
      },
      status: "in_progress" as WorkflowStatus,
      escrowPubkey: "TsK3333333333333333333333333333333333333333",
      fundTxSig: "5abc...mock1",
      completeTxSig: null,
      rateTxSig: null,
      submissions: [],
      revisions: [],
      maxRevisions: 2,
      rating: null,
      slaHours: 6,
      slaStartedAt: ts(3 * 3600_000),
      slaExtendedCount: 0,
      activity: [
        { id: "a1", type: "created", message: "Workflow created", timestamp: ts(48 * 3600_000), actor: "client" },
        { id: "a6", type: "funded", message: "Escrow funded with 0.1833 SOL", timestamp: ts(4 * 3600_000), actor: "client" },
        { id: "a7", type: "agent_accepted", message: "Agent accepted the task", timestamp: ts(3 * 3600_000), actor: "agent" },
      ],
      createdAt: ts(48 * 3600_000),
      updatedAt: ts(3 * 3600_000),
    },
    {
      id: "mock-wf-0002-aaaa-bbbb-ccccddddeeee",
      taskId: "code-review-api-mock-wf-0",
      clientWallet: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
      agentPubkey: "AgNt2222222222222222222222222222222222222222",
      agentName: "CodeAgent Pro",
      title: "API Code Review",
      brief: "Review the Express REST API for best practices.",
      scope: {
        objective: "Thorough code review of the Express API layer",
        deliverables: ["Code review document"],
        implementationPhases: [],
        outOfScope: ["Frontend code"],
        assumptions: ["Repository access"],
        acceptanceCriteria: ["All routes reviewed"],
      },
      quote: {
        complexity: 2.5,
        pricePerPoint: 333333,
        quotedLamports: 83_333_333,
        quotedSol: 0.0833,
        estimatedHours: 5,
        breakdown: "Complexity: 2.5/10\nTotal: 0.0833 SOL (~$12.50)",
      },
      status: "under_review" as WorkflowStatus,
      escrowPubkey: "TsK2222222222222222222222222222222222222222",
      fundTxSig: "5abc...mock2",
      completeTxSig: null,
      rateTxSig: null,
      submissions: [{
        summary: "Code review complete — 3 issues, 7 suggestions",
        items: ["SQL injection risk", "Missing rate limiting", "Async error handling improvements"],
        notes: "Overall well-structured codebase.",
        submittedAt: ts(1 * 3600_000),
      }],
      revisions: [],
      maxRevisions: 2,
      rating: null,
      slaHours: 6,
      slaStartedAt: ts(8 * 3600_000),
      slaExtendedCount: 0,
      activity: [
        { id: "b1", type: "created", message: "Workflow created", timestamp: ts(72 * 3600_000), actor: "client" },
        { id: "b8", type: "deliverable_submitted", message: "Deliverables submitted for review", timestamp: ts(1 * 3600_000), actor: "agent" },
      ],
      createdAt: ts(72 * 3600_000),
      updatedAt: ts(1 * 3600_000),
    },
    {
      id: "mock-wf-0003-aaaa-bbbb-ccccddddeeee",
      taskId: "trading-bot-setup-mock-wf-0",
      clientWallet: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
      agentPubkey: "AgNt1111111111111111111111111111111111111111",
      agentName: "TradeBot Alpha",
      title: "Trading Bot Configuration",
      brief: "Set up an automated DCA trading strategy.",
      scope: {
        objective: "Configure a DCA bot for SOL/USDC",
        deliverables: ["Configured DCA bot", "Documentation"],
        implementationPhases: [],
        outOfScope: ["Custom strategy development"],
        assumptions: ["Jupiter API access"],
        acceptanceCriteria: ["Bot executes test trade successfully"],
      },
      quote: {
        complexity: 3,
        pricePerPoint: 333333,
        quotedLamports: 100_000_000,
        quotedSol: 0.1,
        estimatedHours: 6,
        breakdown: "Complexity: 3/10\nTotal: 0.1 SOL (~$15.00)",
      },
      status: "completed" as WorkflowStatus,
      escrowPubkey: "TsK1111111111111111111111111111111111111111",
      fundTxSig: "5abc...mock3",
      completeTxSig: "5def...mock3",
      rateTxSig: null,
      submissions: [{
        summary: "DCA bot configured and running on devnet",
        items: ["Bot config file", "Test trade proof", "Setup guide"],
        notes: "All acceptance criteria met.",
        submittedAt: ts(24 * 3600_000),
      }],
      revisions: [],
      maxRevisions: 2,
      rating: null,
      slaHours: 6,
      slaStartedAt: ts(96 * 3600_000),
      slaExtendedCount: 0,
      activity: [
        { id: "c1", type: "created", message: "Workflow created", timestamp: ts(120 * 3600_000), actor: "client" },
        { id: "c6", type: "completed", message: "Task completed — escrow released", timestamp: ts(12 * 3600_000), actor: "system" },
      ],
      createdAt: ts(120 * 3600_000),
      updatedAt: ts(12 * 3600_000),
    },
    {
      id: "mock-wf-0004-aaaa-bbbb-ccccddddeeee",
      taskId: "data-scraping-job-mock-wf-0",
      clientWallet: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
      agentPubkey: "AgNt3333333333333333333333333333333333333333",
      agentName: "DataScraper X",
      title: "Web Data Scraping Job",
      brief: "Scrape pricing data from 5 DEX aggregators daily.",
      scope: null,
      quote: null,
      status: "draft" as WorkflowStatus,
      escrowPubkey: null,
      fundTxSig: null,
      completeTxSig: null,
      rateTxSig: null,
      submissions: [],
      revisions: [],
      maxRevisions: 2,
      rating: null,
      slaHours: 6,
      slaStartedAt: null,
      slaExtendedCount: 0,
      activity: [
        { id: "d1", type: "created", message: "Workflow created", timestamp: ts(30 * 60_000), actor: "client" },
      ],
      createdAt: ts(30 * 60_000),
      updatedAt: ts(30 * 60_000),
    },
  ];
}

function createMockScope(): TaskScope {
  return {
    objective: "Complete the requested task with high quality deliverables",
    deliverables: ["Primary deliverable", "Documentation", "Test results"],
    implementationPhases: [
      {
        name: "Planning & Setup",
        description: "Define requirements and set up development environment",
        estimatedHours: 2,
        deliverables: ["Project structure", "Environment configuration"]
      },
      {
        name: "Core Implementation",
        description: "Build main functionality and features",
        estimatedHours: 6,
        deliverables: ["Working prototype", "Unit tests"]
      },
      {
        name: "Testing & Delivery",
        description: "Final testing, bug fixes, and documentation",
        estimatedHours: 3,
        deliverables: ["Final deliverable", "Documentation"]
      }
    ],
    outOfScope: ["Items not in original brief"],
    assumptions: ["Client provides necessary access", "Standard business hours"],
    acceptanceCriteria: ["All deliverables meet quality standards", "Tests pass", "Documentation complete"],
  };
}
