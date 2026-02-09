/**
 * Event-based indexer for the AgentRegistry program.
 *
 * Watches for on-chain account changes via connection.onProgramAccountChange()
 * and maintains an in-memory index with full-text search support.
 * Falls back to mock data when no program is deployed.
 */

import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import {
  AgentProfile,
  TaskEscrow,
  AgentStatus,
  TaskStatus,
  CapabilityCount,
  StatsResponse,
  IndexerEvent,
} from "./types";

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY"
);

// Account data sizes from the Rust program (must match AGENT_PROFILE_SIZE / TASK_ESCROW_SIZE)
// 8 + 32 + (4+64) + (4 + 8*(4+32)) + 8 + 1 + 8 + 8 + 8 + 8 + (4+200) + 1 = 646
const AGENT_PROFILE_DATA_SIZE = 646;
// 8 + 32 + 32 + 8 + 1 + (4+64) + 8 + 1 = 158
const TASK_ESCROW_DATA_SIZE = 158;

// ─── Mock Data for Demo ───────────────────────────────────────────────────────

function generateMockAgents(): AgentProfile[] {
  const now = Date.now();
  return [
    {
      publicKey: "AgntMock1111111111111111111111111111111111111",
      owner: "Owner111111111111111111111111111111111111111",
      name: "TradeBot Pro",
      capabilities: ["trading", "defi", "market-analysis"],
      pricingLamports: 500_000_000,
      status: AgentStatus.Active,
      reputationScore: 450,
      tasksCompleted: 127,
      totalRatings: 98,
      ratingSum: 441,
      metadataUri: "https://arweave.net/mock-tradebot",
      indexedAt: now - 86_400_000 * 30,
    },
    {
      publicKey: "AgntMock2222222222222222222222222222222222222",
      owner: "Owner222222222222222222222222222222222222222",
      name: "CodeAssist AI",
      capabilities: ["coding", "debugging", "code-review"],
      pricingLamports: 200_000_000,
      status: AgentStatus.Active,
      reputationScore: 480,
      tasksCompleted: 312,
      totalRatings: 256,
      ratingSum: 1229,
      metadataUri: "https://arweave.net/mock-codeassist",
      indexedAt: now - 86_400_000 * 25,
    },
    {
      publicKey: "AgntMock3333333333333333333333333333333333333",
      owner: "Owner333333333333333333333333333333333333333",
      name: "DataHarvester",
      capabilities: ["scraping", "data-analysis", "reporting"],
      pricingLamports: 100_000_000,
      status: AgentStatus.Active,
      reputationScore: 390,
      tasksCompleted: 89,
      totalRatings: 72,
      ratingSum: 281,
      metadataUri: "https://arweave.net/mock-dataharvester",
      indexedAt: now - 86_400_000 * 20,
    },
    {
      publicKey: "AgntMock4444444444444444444444444444444444444",
      owner: "Owner444444444444444444444444444444444444444",
      name: "EmailAgent",
      capabilities: ["email", "communication", "scheduling"],
      pricingLamports: 50_000_000,
      status: AgentStatus.Active,
      reputationScore: 420,
      tasksCompleted: 205,
      totalRatings: 180,
      ratingSum: 756,
      metadataUri: "https://arweave.net/mock-emailagent",
      indexedAt: now - 86_400_000 * 15,
    },
    {
      publicKey: "AgntMock5555555555555555555555555555555555555",
      owner: "Owner555555555555555555555555555555555555555",
      name: "SecurityAuditor",
      capabilities: ["security", "auditing", "smart-contracts"],
      pricingLamports: 2_000_000_000,
      status: AgentStatus.Active,
      reputationScore: 500,
      tasksCompleted: 45,
      totalRatings: 42,
      ratingSum: 210,
      metadataUri: "https://arweave.net/mock-securityauditor",
      indexedAt: now - 86_400_000 * 10,
    },
    {
      publicKey: "AgntMock6666666666666666666666666666666666666",
      owner: "Owner666666666666666666666666666666666666666",
      name: "NFT Minter Pro",
      capabilities: ["nft", "minting", "metadata"],
      pricingLamports: 300_000_000,
      status: AgentStatus.Active,
      reputationScore: 350,
      tasksCompleted: 67,
      totalRatings: 55,
      ratingSum: 193,
      metadataUri: "https://arweave.net/mock-nftminter",
      indexedAt: now - 86_400_000 * 7,
    },
    {
      publicKey: "AgntMock7777777777777777777777777777777777777",
      owner: "Owner777777777777777777777777777777777777777",
      name: "ResearchBot",
      capabilities: ["research", "summarization", "writing"],
      pricingLamports: 150_000_000,
      status: AgentStatus.Inactive,
      reputationScore: 310,
      tasksCompleted: 34,
      totalRatings: 28,
      ratingSum: 87,
      metadataUri: "https://arweave.net/mock-researchbot",
      indexedAt: now - 86_400_000 * 5,
    },
    {
      publicKey: "AgntMock8888888888888888888888888888888888888",
      owner: "Owner888888888888888888888888888888888888888",
      name: "SwapOptimizer",
      capabilities: ["trading", "defi", "arbitrage"],
      pricingLamports: 750_000_000,
      status: AgentStatus.Active,
      reputationScore: 460,
      tasksCompleted: 198,
      totalRatings: 165,
      ratingSum: 759,
      metadataUri: "https://arweave.net/mock-swapoptimizer",
      indexedAt: now - 86_400_000 * 3,
    },
    {
      publicKey: "AgntMock9999999999999999999999999999999999999",
      owner: "Owner999999999999999999999999999999999999999",
      name: "GovernanceHelper",
      capabilities: ["governance", "dao", "voting"],
      pricingLamports: 100_000_000,
      status: AgentStatus.Active,
      reputationScore: 280,
      tasksCompleted: 15,
      totalRatings: 12,
      ratingSum: 34,
      metadataUri: "https://arweave.net/mock-governance",
      indexedAt: now - 86_400_000 * 1,
    },
    {
      publicKey: "AgntMock0000000000000000000000000000000000000",
      owner: "Owner000000000000000000000000000000000000000",
      name: "ContentCreator AI",
      capabilities: ["writing", "content", "social-media"],
      pricingLamports: 80_000_000,
      status: AgentStatus.Active,
      reputationScore: 400,
      tasksCompleted: 156,
      totalRatings: 130,
      ratingSum: 520,
      metadataUri: "https://arweave.net/mock-contentcreator",
      indexedAt: now,
    },
  ];
}

function generateMockTasks(): TaskEscrow[] {
  return [
    {
      publicKey: "TaskMock1111111111111111111111111111111111111",
      client: "Client11111111111111111111111111111111111111",
      agent: "AgntMock1111111111111111111111111111111111111",
      amountLamports: 500_000_000,
      amountSol: 0.5,
      status: TaskStatus.Completed,
      taskId: "trade-btc-001",
      createdAt: new Date(Date.now() - 86_400_000 * 7).toISOString(),
    },
    {
      publicKey: "TaskMock2222222222222222222222222222222222222",
      client: "Client22222222222222222222222222222222222222",
      agent: "AgntMock2222222222222222222222222222222222222",
      amountLamports: 200_000_000,
      amountSol: 0.2,
      status: TaskStatus.InProgress,
      taskId: "code-review-042",
      createdAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    },
    {
      publicKey: "TaskMock3333333333333333333333333333333333333",
      client: "Client33333333333333333333333333333333333333",
      agent: "AgntMock5555555555555555555555555555555555555",
      amountLamports: 2_000_000_000,
      amountSol: 2.0,
      status: TaskStatus.Funded,
      taskId: "audit-contract-007",
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    },
  ];
}

// ─── Account Parser ───────────────────────────────────────────────────────────

function parseAgentProfile(publicKey: string, data: Buffer): AgentProfile | null {
  try {
    // Skip 8-byte discriminator
    let offset = 8;

    if (data.length < offset + 32) return null;

    // owner (32 bytes)
    const owner = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    // name (4-byte length prefix + string)
    if (data.length < offset + 4) return null;
    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    if (nameLen > 64 || data.length < offset + nameLen) return null;
    const name = data.subarray(offset, offset + nameLen).toString("utf8");
    offset += nameLen;

    // capabilities (4-byte vec length + items)
    if (data.length < offset + 4) return null;
    const capsLen = data.readUInt32LE(offset);
    offset += 4;
    if (capsLen > 8) return null;
    const capabilities: string[] = [];
    for (let i = 0; i < capsLen; i++) {
      if (data.length < offset + 4) return null;
      const capLen = data.readUInt32LE(offset);
      offset += 4;
      if (capLen > 32 || data.length < offset + capLen) return null;
      capabilities.push(data.subarray(offset, offset + capLen).toString("utf8"));
      offset += capLen;
    }

    // pricing_lamports (u64)
    if (data.length < offset + 8) return null;
    const pricingLamports = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // status (1 byte: 0=Active, 1=Inactive)
    if (data.length < offset + 1) return null;
    const statusByte = data.readUInt8(offset);
    offset += 1;
    const status = statusByte === 0 ? AgentStatus.Active : AgentStatus.Inactive;

    // reputation_score (u64)
    if (data.length < offset + 8) return null;
    const reputationScore = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // tasks_completed (u64)
    if (data.length < offset + 8) return null;
    const tasksCompleted = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // total_ratings (u64)
    if (data.length < offset + 8) return null;
    const totalRatings = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // rating_sum (u64)
    if (data.length < offset + 8) return null;
    const ratingSum = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // metadata_uri (4-byte length prefix + string)
    if (data.length < offset + 4) return null;
    const uriLen = data.readUInt32LE(offset);
    offset += 4;
    if (uriLen > 200 || data.length < offset + uriLen) return null;
    const metadataUri = data.subarray(offset, offset + uriLen).toString("utf8");

    return {
      publicKey,
      owner,
      name,
      capabilities,
      pricingLamports,
      status,
      reputationScore,
      tasksCompleted,
      totalRatings,
      ratingSum,
      metadataUri,
      indexedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

function parseTaskEscrow(publicKey: string, data: Buffer): TaskEscrow | null {
  try {
    let offset = 8; // skip discriminator

    if (data.length < offset + 32) return null;
    const client = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    if (data.length < offset + 32) return null;
    const agent = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    if (data.length < offset + 8) return null;
    const amount = Number(data.readBigUInt64LE(offset));
    offset += 8;

    if (data.length < offset + 1) return null;
    const statusByte = data.readUInt8(offset);
    offset += 1;
    const statusMap: Record<number, TaskStatus> = {
      0: TaskStatus.Funded,
      1: TaskStatus.InProgress,
      2: TaskStatus.Completed,
      3: TaskStatus.Disputed,
    };
    const status = statusMap[statusByte] ?? TaskStatus.Funded;

    if (data.length < offset + 4) return null;
    const taskIdLen = data.readUInt32LE(offset);
    offset += 4;
    if (taskIdLen > 64 || data.length < offset + taskIdLen) return null;
    const taskId = data.subarray(offset, offset + taskIdLen).toString("utf8");
    offset += taskIdLen;

    if (data.length < offset + 8) return null;
    const createdAt = Number(data.readBigInt64LE(offset));

    return {
      publicKey,
      client,
      agent,
      amountLamports: amount,
      amountSol: amount / 1e9,
      status,
      taskId,
      createdAt: new Date(createdAt * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

// ─── Indexer Class ────────────────────────────────────────────────────────────

export class AgentIndexer {
  private agents: Map<string, AgentProfile> = new Map();
  private tasks: Map<string, TaskEscrow> = new Map();
  private connection: Connection;
  private subscriptionId: number | null = null;
  private initialized = false;
  private usingMockData = false;
  private eventLog: IndexerEvent[] = [];
  private readonly maxEventLog = 1000;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Start the indexer: load initial state, then subscribe to changes.
   * Falls back to mock data if the program is not deployed.
   */
  async start(): Promise<void> {
    console.log("[Indexer] Starting AgentRegistry indexer...");
    console.log(`[Indexer] Program ID: ${PROGRAM_ID.toBase58()}`);

    await this.loadInitialState();
    this.subscribeToChanges();
    this.initialized = true;

    console.log(
      `[Indexer] Ready. ${this.agents.size} agents, ${this.tasks.size} tasks indexed.` +
        (this.usingMockData ? " (mock data)" : "")
    );
  }

  /**
   * Stop the indexer and clean up subscriptions.
   */
  stop(): void {
    if (this.subscriptionId !== null) {
      this.connection.removeProgramAccountChangeListener(this.subscriptionId);
      this.subscriptionId = null;
      console.log("[Indexer] Subscription removed.");
    }
  }

  // ─── Query Methods ────────────────────────────────────────────────────

  /** Get all indexed agents as an array, sorted by indexedAt descending. */
  getAllAgents(): AgentProfile[] {
    return Array.from(this.agents.values());
  }

  /** Get all indexed tasks as an array. */
  getAllTasks(): TaskEscrow[] {
    return Array.from(this.tasks.values());
  }

  /** Get a single agent by its public key. */
  getAgent(publicKey: string): AgentProfile | undefined {
    return this.agents.get(publicKey);
  }

  /** Full-text search across agent name and capabilities. */
  searchAgents(query: string): AgentProfile[] {
    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/).filter(Boolean);

    return this.getAllAgents().filter((agent) => {
      const searchable = [
        agent.name.toLowerCase(),
        ...agent.capabilities.map((c) => c.toLowerCase()),
      ].join(" ");

      return terms.every((term) => searchable.includes(term));
    });
  }

  /** Get top N agents by reputation score. */
  getTopAgents(limit = 10): AgentProfile[] {
    return this.getAllAgents()
      .sort((a, b) => b.reputationScore - a.reputationScore)
      .slice(0, limit);
  }

  /** Get the N most recently indexed agents. */
  getRecentAgents(limit = 10): AgentProfile[] {
    return this.getAllAgents()
      .sort((a, b) => b.indexedAt - a.indexedAt)
      .slice(0, limit);
  }

  /** Get aggregated statistics. */
  getStats(): StatsResponse {
    const agents = this.getAllAgents();
    const tasks = this.getAllTasks();

    const activeAgents = agents.filter((a) => a.status === AgentStatus.Active).length;

    const totalReputation = agents.reduce((sum, a) => sum + a.reputationScore, 0);
    const avgReputation = agents.length > 0 ? Math.round(totalReputation / agents.length) : 0;

    const totalVolumeSOL = tasks.reduce((sum, t) => sum + t.amountSol, 0);

    // Count capabilities
    const capCounts = new Map<string, number>();
    for (const agent of agents) {
      for (const cap of agent.capabilities) {
        const lower = cap.toLowerCase();
        capCounts.set(lower, (capCounts.get(lower) || 0) + 1);
      }
    }

    const topCapabilities: CapabilityCount[] = Array.from(capCounts.entries())
      .map(([capability, count]) => ({ capability, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalAgents: agents.length,
      totalTasks: tasks.length,
      activeAgents,
      avgReputation,
      topCapabilities,
      totalVolumeSOL: Math.round(totalVolumeSOL * 1000) / 1000,
    };
  }

  /** Get all unique capabilities with their counts. */
  getCapabilities(): CapabilityCount[] {
    const capCounts = new Map<string, number>();
    for (const agent of this.getAllAgents()) {
      for (const cap of agent.capabilities) {
        const lower = cap.toLowerCase();
        capCounts.set(lower, (capCounts.get(lower) || 0) + 1);
      }
    }

    return Array.from(capCounts.entries())
      .map(([capability, count]) => ({ capability, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Whether the indexer is using mock data. */
  isMockData(): boolean {
    return this.usingMockData;
  }

  /** Whether the indexer has been initialized. */
  isReady(): boolean {
    return this.initialized;
  }

  /** Get recent events from the log. */
  getRecentEvents(limit = 50): IndexerEvent[] {
    return this.eventLog.slice(-limit);
  }

  // ─── Internal Methods ─────────────────────────────────────────────────

  private logEvent(event: IndexerEvent): void {
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLog) {
      this.eventLog = this.eventLog.slice(-this.maxEventLog);
    }
    console.log(`[Indexer] Event: ${event.type} at ${new Date(event.timestamp).toISOString()}`);
  }

  /**
   * Load all existing accounts from the program via getProgramAccounts.
   * Falls back to mock data on any error (program not deployed, RPC issues).
   */
  private async loadInitialState(): Promise<void> {
    try {
      // Attempt to load agent profiles
      const agentAccounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: AGENT_PROFILE_DATA_SIZE }],
      });

      for (const acc of agentAccounts) {
        const profile = parseAgentProfile(acc.pubkey.toBase58(), acc.account.data);
        if (profile) {
          this.agents.set(profile.publicKey, profile);
        }
      }

      // Attempt to load task escrows
      const taskAccounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: TASK_ESCROW_DATA_SIZE }],
      });

      for (const acc of taskAccounts) {
        const task = parseTaskEscrow(acc.pubkey.toBase58(), acc.account.data);
        if (task) {
          this.tasks.set(task.publicKey, task);
        }
      }

      // If no accounts found, use mock data for demo
      if (this.agents.size === 0 && this.tasks.size === 0) {
        console.log("[Indexer] No on-chain accounts found. Loading mock data for demo.");
        this.loadMockData();
      }

      this.logEvent({
        type: "IndexRefreshed",
        agentCount: this.agents.size,
        taskCount: this.tasks.size,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn("[Indexer] Failed to load on-chain data, falling back to mock data:", err);
      this.loadMockData();
    }
  }

  private loadMockData(): void {
    this.usingMockData = true;

    for (const agent of generateMockAgents()) {
      this.agents.set(agent.publicKey, agent);
    }

    for (const task of generateMockTasks()) {
      this.tasks.set(task.publicKey, task);
    }
  }

  /**
   * Subscribe to on-chain account changes via WebSocket.
   * Each change triggers re-parsing and index update.
   */
  private subscribeToChanges(): void {
    try {
      this.subscriptionId = this.connection.onProgramAccountChange(
        PROGRAM_ID,
        (accountInfo, context) => {
          this.handleAccountChange(accountInfo);
        },
        "confirmed"
      );
      console.log(`[Indexer] Subscribed to program account changes (sub ID: ${this.subscriptionId})`);
    } catch (err) {
      console.warn("[Indexer] Failed to subscribe to account changes:", err);
      console.warn("[Indexer] Will rely on periodic refresh or mock data.");
    }
  }

  private handleAccountChange(accountInfo: {
    accountId: PublicKey;
    accountInfo: AccountInfo<Buffer>;
  }): void {
    const pubkey = accountInfo.accountId.toBase58();
    const data = accountInfo.accountInfo.data;

    // Try to parse as AgentProfile first (by data size)
    if (data.length === AGENT_PROFILE_DATA_SIZE) {
      const profile = parseAgentProfile(pubkey, data);
      if (profile) {
        const existing = this.agents.get(pubkey);
        this.agents.set(pubkey, profile);

        if (!existing) {
          this.logEvent({ type: "AgentRegistered", agent: profile, timestamp: Date.now() });
        } else if (existing.status !== profile.status) {
          if (profile.status === AgentStatus.Active) {
            this.logEvent({ type: "AgentActivated", publicKey: pubkey, timestamp: Date.now() });
          } else {
            this.logEvent({ type: "AgentDeactivated", publicKey: pubkey, timestamp: Date.now() });
          }
        } else {
          this.logEvent({ type: "AgentUpdated", publicKey: pubkey, timestamp: Date.now() });
        }

        // If we received live data, we are no longer purely mock
        this.usingMockData = false;
        return;
      }
    }

    // Try to parse as TaskEscrow
    if (data.length === TASK_ESCROW_DATA_SIZE) {
      const task = parseTaskEscrow(pubkey, data);
      if (task) {
        const existing = this.tasks.get(pubkey);
        this.tasks.set(pubkey, task);

        if (!existing) {
          this.logEvent({ type: "TaskCreated", task, timestamp: Date.now() });
        }

        this.usingMockData = false;
      }
    }
  }
}
