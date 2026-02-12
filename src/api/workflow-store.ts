/**
 * In-memory workflow store with JSON-file persistence.
 *
 * Stores TaskWorkflow records keyed by UUID. Loads from data/workflows.json
 * on startup and does a debounced flush (1s) on every write.
 * Generates mock workflows in demo mode when no data file exists.
 */

import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  WorkflowStatus,
  type TaskWorkflow,
  type ActivityEntry,
} from "./workflow-types";

const DATA_DIR = path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "workflows.json");

// ─── Store ───────────────────────────────────────────────────────────────────

export class WorkflowStore {
  private workflows: Map<string, TaskWorkflow> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  /** Load data from disk (or generate mocks). */
  async init(): Promise<void> {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, "utf8");
        const arr: TaskWorkflow[] = JSON.parse(raw);
        for (const wf of arr) {
          this.workflows.set(wf.id, wf);
        }
        console.log(`[WorkflowStore] Loaded ${this.workflows.size} workflows from disk.`);
      } else {
        console.log("[WorkflowStore] No data file found. Loading mock workflows.");
        this.loadMocks();
        this.scheduleDiskFlush();
      }
    } catch (err) {
      console.warn("[WorkflowStore] Failed to load data file, using mocks:", err);
      this.loadMocks();
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────

  get(id: string): TaskWorkflow | undefined {
    return this.workflows.get(id);
  }

  getByEscrowPubkey(pubkey: string): TaskWorkflow | undefined {
    for (const wf of this.workflows.values()) {
      if (wf.escrowPubkey === pubkey) return wf;
    }
    return undefined;
  }

  list(filters?: {
    wallet?: string;
    role?: "client" | "agent";
    status?: WorkflowStatus;
  }): TaskWorkflow[] {
    let results = Array.from(this.workflows.values());

    if (filters?.wallet) {
      const w = filters.wallet;
      const role = filters.role;
      if (role === "client") {
        results = results.filter((wf) => wf.clientWallet === w);
      } else if (role === "agent") {
        results = results.filter((wf) => wf.agentPubkey === w);
      } else {
        results = results.filter(
          (wf) => wf.clientWallet === w || wf.agentPubkey === w
        );
      }
    }

    if (filters?.status) {
      results = results.filter((wf) => wf.status === filters.status);
    }

    // Most recent first
    results.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return results;
  }

  create(wf: TaskWorkflow): TaskWorkflow {
    this.workflows.set(wf.id, wf);
    this.markDirty();
    return wf;
  }

  update(
    id: string,
    patch: Partial<TaskWorkflow>
  ): TaskWorkflow | undefined {
    const existing = this.workflows.get(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.workflows.set(id, updated);
    this.markDirty();
    return updated;
  }

  // ─── Persistence ─────────────────────────────────────────────────────

  private markDirty(): void {
    this.dirty = true;
    this.scheduleDiskFlush();
  }

  private scheduleDiskFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.dirty) {
        this.flushToDisk();
        this.dirty = false;
      }
    }, 1000);
  }

  private flushToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = JSON.stringify(
        Array.from(this.workflows.values()),
        null,
        2
      );
      fs.writeFileSync(DATA_FILE, data, "utf8");
    } catch (err) {
      console.warn("[WorkflowStore] Failed to flush to disk:", err);
    }
  }

  // ─── Mock Data ───────────────────────────────────────────────────────

  private loadMocks(): void {
    const now = new Date();
    const mocks = generateMockWorkflows(now);
    for (const wf of mocks) {
      this.workflows.set(wf.id, wf);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateTaskId(title: string, workflowId: string): string {
  return slugify(title).slice(0, 50) + "-" + workflowId.slice(0, 8);
}

export function makeActivity(
  type: ActivityEntry["type"],
  message: string,
  actor: ActivityEntry["actor"]
): ActivityEntry {
  return {
    id: uuidv4(),
    type,
    message,
    timestamp: new Date().toISOString(),
    actor,
  };
}

export function createBlankWorkflow(params: {
  clientWallet: string;
  agentPubkey: string;
  agentName: string;
  title: string;
  brief: string;
}): TaskWorkflow {
  const id = uuidv4();
  const now = new Date().toISOString();
  return {
    id,
    taskId: generateTaskId(params.title, id),
    clientWallet: params.clientWallet,
    agentPubkey: params.agentPubkey,
    agentName: params.agentName,
    title: params.title,
    brief: params.brief,
    scope: null,
    quote: null,
    status: WorkflowStatus.Draft,
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
      makeActivity("created", `Workflow created: "${params.title}"`, "client"),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Mock Generation ─────────────────────────────────────────────────────────

function generateMockWorkflows(now: Date): TaskWorkflow[] {
  const ts = (offsetMs: number) =>
    new Date(now.getTime() - offsetMs).toISOString();

  const wf1Id = "mock-wf-0001-aaaa-bbbb-ccccddddeeee";
  const wf2Id = "mock-wf-0002-aaaa-bbbb-ccccddddeeee";
  const wf3Id = "mock-wf-0003-aaaa-bbbb-ccccddddeeee";
  const wf4Id = "mock-wf-0004-aaaa-bbbb-ccccddddeeee";

  return [
    // 1. In Progress — agent is working
    {
      id: wf1Id,
      taskId: "smart-contract-audit-mock-wf-0",
      clientWallet: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
      agentPubkey: "AgntMock5555555555555555555555555555555555555",
      agentName: "SecurityAuditor",
      title: "Smart Contract Security Audit",
      brief: "Comprehensive audit of our token swap program for vulnerabilities.",
      scope: {
        objective: "Identify security vulnerabilities in the token swap program",
        deliverables: [
          "Full security audit report",
          "List of vulnerabilities with severity ratings",
          "Recommended fixes for each issue",
        ],
        implementationPhases: [],
        outOfScope: ["Frontend UI security", "Off-chain infrastructure"],
        assumptions: ["Source code will be provided via GitHub", "Solana mainnet deployment"],
        acceptanceCriteria: [
          "All critical/high vulnerabilities identified",
          "Each finding includes PoC or reproduction steps",
          "Report delivered in PDF format",
        ],
      },
      quote: {
        complexity: 5.5,
        pricePerPoint: 333333,
        quotedLamports: 183_333_333,
        quotedSol: 0.1833,
        estimatedHours: 11,
        breakdown: "Deliverables: 3 item(s)\nAcceptance criteria: 3\nAssumptions: 2\nOut-of-scope: 2\nComplexity: 5.5/10\nRate: $5/point (SOL @ $150)\nTotal: 0.1833 SOL (~$27.50)",
      },
      status: WorkflowStatus.InProgress,
      escrowPubkey: "TaskMock3333333333333333333333333333333333333",
      fundTxSig: "5abc...mock1",
      completeTxSig: null,
      rateTxSig: null,
      submissions: [],
      revisions: [],
      maxRevisions: 2,
      rating: null,
      slaHours: 6,
      slaStartedAt: ts(3 * 3600_000), // started 3h ago
      slaExtendedCount: 0,
      activity: [
        { id: "a1", type: "created", message: "Workflow created", timestamp: ts(48 * 3600_000), actor: "client" },
        { id: "a2", type: "scope_submitted", message: "Scope submitted for review", timestamp: ts(47 * 3600_000), actor: "client" },
        { id: "a3", type: "scope_approved", message: "Scope approved", timestamp: ts(46 * 3600_000), actor: "client" },
        { id: "a4", type: "quote_generated", message: "Quote generated: 0.1833 SOL", timestamp: ts(46 * 3600_000), actor: "system" },
        { id: "a5", type: "quote_accepted", message: "Quote accepted", timestamp: ts(24 * 3600_000), actor: "client" },
        { id: "a6", type: "funded", message: "Escrow funded with 0.1833 SOL", timestamp: ts(4 * 3600_000), actor: "client" },
        { id: "a7", type: "agent_accepted", message: "Agent accepted the task", timestamp: ts(3 * 3600_000), actor: "agent" },
      ],
      createdAt: ts(48 * 3600_000),
      updatedAt: ts(3 * 3600_000),
    },

    // 2. Under Review — agent submitted deliverables
    {
      id: wf2Id,
      taskId: "code-review-api-mock-wf-0",
      clientWallet: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
      agentPubkey: "AgntMock2222222222222222222222222222222222222",
      agentName: "CodeAssist AI",
      title: "API Code Review",
      brief: "Review the Express REST API for best practices and potential bugs.",
      scope: {
        objective: "Thorough code review of the Express API layer",
        deliverables: ["Code review document with line-by-line annotations"],
        implementationPhases: [],
        outOfScope: ["Frontend code"],
        assumptions: ["Access to the repository"],
        acceptanceCriteria: [
          "All routes reviewed",
          "Performance suggestions included",
        ],
      },
      quote: {
        complexity: 2.5,
        pricePerPoint: 333333,
        quotedLamports: 83_333_333,
        quotedSol: 0.0833,
        estimatedHours: 5,
        breakdown: "Complexity: 2.5/10\nTotal: 0.0833 SOL (~$12.50)",
      },
      status: WorkflowStatus.UnderReview,
      escrowPubkey: "TaskMock2222222222222222222222222222222222222",
      fundTxSig: "5abc...mock2",
      completeTxSig: null,
      rateTxSig: null,
      submissions: [
        {
          summary: "Code review complete — found 3 medium issues, 7 suggestions",
          items: [
            "SQL injection risk in search endpoint",
            "Missing rate limiting on public routes",
            "Suggested async error handling improvements",
          ],
          notes: "Overall the codebase is well-structured. See full report attached.",
          submittedAt: ts(1 * 3600_000),
        },
      ],
      revisions: [],
      maxRevisions: 2,
      rating: null,
      slaHours: 6,
      slaStartedAt: ts(8 * 3600_000),
      slaExtendedCount: 0,
      activity: [
        { id: "b1", type: "created", message: "Workflow created", timestamp: ts(72 * 3600_000), actor: "client" },
        { id: "b2", type: "scope_submitted", message: "Scope submitted", timestamp: ts(71 * 3600_000), actor: "client" },
        { id: "b3", type: "scope_approved", message: "Scope approved", timestamp: ts(70 * 3600_000), actor: "client" },
        { id: "b4", type: "quote_generated", message: "Quote generated: 0.0833 SOL", timestamp: ts(70 * 3600_000), actor: "system" },
        { id: "b5", type: "quote_accepted", message: "Quote accepted", timestamp: ts(48 * 3600_000), actor: "client" },
        { id: "b6", type: "funded", message: "Escrow funded", timestamp: ts(10 * 3600_000), actor: "client" },
        { id: "b7", type: "agent_accepted", message: "Agent accepted", timestamp: ts(8 * 3600_000), actor: "agent" },
        { id: "b8", type: "deliverable_submitted", message: "Deliverables submitted for review", timestamp: ts(1 * 3600_000), actor: "agent" },
      ],
      createdAt: ts(72 * 3600_000),
      updatedAt: ts(1 * 3600_000),
    },

    // 3. Completed — ready to rate
    {
      id: wf3Id,
      taskId: "trading-bot-setup-mock-wf-0",
      clientWallet: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
      agentPubkey: "AgntMock1111111111111111111111111111111111111",
      agentName: "TradeBot Pro",
      title: "Trading Bot Configuration",
      brief: "Set up an automated DCA trading strategy on Jupiter.",
      scope: {
        objective: "Configure a DCA bot for SOL/USDC pair",
        deliverables: ["Configured and tested DCA bot", "Documentation"],
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
      status: WorkflowStatus.Completed,
      escrowPubkey: "TaskMock1111111111111111111111111111111111111",
      fundTxSig: "5abc...mock3",
      completeTxSig: "5def...mock3",
      rateTxSig: null,
      submissions: [
        {
          summary: "DCA bot configured and running on devnet",
          items: ["Bot config file", "Test trade proof", "Setup guide"],
          notes: "All acceptance criteria met.",
          submittedAt: ts(24 * 3600_000),
        },
      ],
      revisions: [],
      maxRevisions: 2,
      rating: null,
      slaHours: 6,
      slaStartedAt: ts(96 * 3600_000),
      slaExtendedCount: 0,
      activity: [
        { id: "c1", type: "created", message: "Workflow created", timestamp: ts(120 * 3600_000), actor: "client" },
        { id: "c2", type: "funded", message: "Escrow funded", timestamp: ts(100 * 3600_000), actor: "client" },
        { id: "c3", type: "agent_accepted", message: "Agent accepted", timestamp: ts(96 * 3600_000), actor: "agent" },
        { id: "c4", type: "deliverable_submitted", message: "Deliverables submitted", timestamp: ts(24 * 3600_000), actor: "agent" },
        { id: "c5", type: "accepted", message: "Deliverables accepted", timestamp: ts(12 * 3600_000), actor: "client" },
        { id: "c6", type: "completed", message: "Task completed — escrow released", timestamp: ts(12 * 3600_000), actor: "system" },
      ],
      createdAt: ts(120 * 3600_000),
      updatedAt: ts(12 * 3600_000),
    },

    // 4. Draft — just created
    {
      id: wf4Id,
      taskId: "data-scraping-job-mock-wf-0",
      clientWallet: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
      agentPubkey: "AgntMock3333333333333333333333333333333333333",
      agentName: "DataHarvester",
      title: "Web Data Scraping Job",
      brief: "Scrape pricing data from 5 DEX aggregators daily.",
      scope: null,
      quote: null,
      status: WorkflowStatus.Draft,
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

/** Singleton instance */
export const workflowStore = new WorkflowStore();
