import { PublicKey } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// On-chain account mirrors
// ---------------------------------------------------------------------------

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

/** Mirrors the on-chain AgentProfile account. */
export interface AgentProfile {
  publicKey: string;
  owner: string;
  name: string;
  capabilities: string[];
  pricingLamports: number;
  status: AgentStatus;
  reputationScore: number;
  tasksCompleted: number;
  totalRatings: number;
  ratingSum: number;
  metadataUri: string;
  bump: number;
}

/** Mirrors the on-chain TaskEscrow account. */
export interface TaskEscrow {
  publicKey: string;
  client: string;
  agent: string;
  amountLamports: number;
  amountSol: number;
  status: TaskStatus;
  taskId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Plugin configuration
// ---------------------------------------------------------------------------

export interface RegistryPluginConfig {
  /** Solana RPC endpoint (defaults to devnet). */
  rpcUrl: string;
  /** Search API base URL (defaults to http://localhost:3001). */
  apiUrl: string;
  /** The deployed program ID. */
  programId: string;
}

export const DEFAULT_CONFIG: RegistryPluginConfig = {
  rpcUrl: "https://api.devnet.solana.com",
  apiUrl: "http://localhost:3001",
  programId: "AgntReg1stryXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
};

// ---------------------------------------------------------------------------
// ElizaOS core types (minimal subset needed by the plugin)
// ---------------------------------------------------------------------------

/**
 * ElizaOS runtime interface. The actual ElizaOS SDK provides this; we
 * declare the minimal surface the plugin consumes so the code compiles
 * without the full SDK installed.
 */
export interface IAgentRuntime {
  /** Get a setting value from the agent's configuration. */
  getSetting(key: string): string | undefined;
  /** Access the agent's character / identity config. */
  character: {
    name: string;
    settings?: {
      secrets?: Record<string, string>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  /** Compose state from a message. */
  composeState(message: Memory): Promise<State>;
  /** Update recent message state. */
  updateRecentMessageState(state: State): Promise<State>;
  /** Message manager for persisting messages. */
  messageManager: {
    createMemory(memory: Memory): Promise<void>;
  };
}

export interface Memory {
  id?: string;
  userId: string;
  agentId?: string;
  roomId: string;
  content: {
    text: string;
    action?: string;
    [key: string]: unknown;
  };
  createdAt?: number;
  [key: string]: unknown;
}

export interface State {
  [key: string]: unknown;
}

export interface HandlerCallback {
  (response: { text: string; action?: string; [key: string]: unknown }): Promise<Memory[]>;
}

/** ElizaOS Action interface. */
export interface Action {
  name: string;
  similes: string[];
  description: string;
  validate: (runtime: IAgentRuntime, message: Memory) => Promise<boolean>;
  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback,
  ) => Promise<void>;
  examples: MessageExample[][];
}

/** ElizaOS Provider interface. */
export interface Provider {
  get: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
  ) => Promise<string>;
}

/** ElizaOS Evaluator interface. */
export interface Evaluator {
  name: string;
  similes: string[];
  description: string;
  validate: (runtime: IAgentRuntime, message: Memory) => Promise<boolean>;
  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  examples: EvaluatorExample[];
  alwaysRun?: boolean;
}

/** Message example for action examples array. */
export interface MessageExample {
  user: string;
  content: {
    text: string;
    action?: string;
    [key: string]: unknown;
  };
}

/** Evaluator example. */
export interface EvaluatorExample {
  context: string;
  messages: MessageExample[];
  outcome: string;
}

/** ElizaOS Plugin interface. */
export interface Plugin {
  name: string;
  description: string;
  actions: Action[];
  providers: Provider[];
  evaluators: Evaluator[];
}

// ---------------------------------------------------------------------------
// Scored agent result used by the evaluator
// ---------------------------------------------------------------------------

export interface ScoredAgent {
  agent: AgentProfile;
  score: number;
  breakdown: {
    capabilityMatch: number;
    reputationScore: number;
    priceScore: number;
    completionScore: number;
  };
}
