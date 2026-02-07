/**
 * Shared TypeScript interfaces for the AgentRegistry API.
 * These mirror the on-chain data model defined in programs/agent-registry/src/lib.rs
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AgentStatus {
  Active = "active",
  Inactive = "inactive",
}

export enum TaskStatus {
  Funded = "funded",
  InProgress = "in_progress",
  Completed = "completed",
  Disputed = "disputed",
}

// ─── On-Chain Account Types ───────────────────────────────────────────────────

export interface AgentProfile {
  /** The PDA public key of this agent profile account */
  publicKey: string;
  /** Wallet that owns/controls this agent profile */
  owner: string;
  /** Display name of the agent */
  name: string;
  /** List of capability tags (e.g. "trading", "email", "coding") */
  capabilities: string[];
  /** Price per task in lamports */
  pricingLamports: number;
  /** Whether the agent is currently accepting tasks */
  status: AgentStatus;
  /** Reputation score (average rating * 100) */
  reputationScore: number;
  /** Number of tasks completed */
  tasksCompleted: number;
  /** Total number of ratings received */
  totalRatings: number;
  /** Sum of all ratings (for computing average) */
  ratingSum: number;
  /** URI pointing to extended metadata JSON */
  metadataUri: string;
  /** Timestamp when the agent was indexed (API-side, not on-chain) */
  indexedAt: number;
}

export interface TaskEscrow {
  /** The PDA public key of this escrow account */
  publicKey: string;
  /** The client who posted and funded the task */
  client: string;
  /** The agent profile PDA assigned to this task */
  agent: string;
  /** Amount of SOL (in lamports) escrowed */
  amountLamports: number;
  /** Amount in SOL for display */
  amountSol: number;
  /** Current status of the task */
  status: TaskStatus;
  /** Unique task identifier */
  taskId: string;
  /** Unix timestamp when the task was created */
  createdAt: string;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface StatsResponse {
  /** Total number of registered agents */
  totalAgents: number;
  /** Total number of task escrows */
  totalTasks: number;
  /** Number of agents with Active status */
  activeAgents: number;
  /** Average reputation score across all agents (0-500) */
  avgReputation: number;
  /** Top capabilities by agent count */
  topCapabilities: CapabilityCount[];
  /** Total volume of SOL that has gone through escrow */
  totalVolumeSOL: number;
}

export interface CapabilityCount {
  capability: string;
  count: number;
}

export interface AgentListResponse {
  agents: AgentProfile[];
  total: number;
  page: number;
  limit: number;
}

export interface AgentSearchResponse {
  agents: AgentProfile[];
  total: number;
  query: string;
}

// ─── Indexer Event Types ──────────────────────────────────────────────────────

export type IndexerEvent =
  | { type: "AgentRegistered"; agent: AgentProfile; timestamp: number }
  | { type: "AgentUpdated"; publicKey: string; timestamp: number }
  | { type: "AgentDeactivated"; publicKey: string; timestamp: number }
  | { type: "AgentActivated"; publicKey: string; timestamp: number }
  | { type: "TaskCreated"; task: TaskEscrow; timestamp: number }
  | { type: "IndexRefreshed"; agentCount: number; taskCount: number; timestamp: number };
