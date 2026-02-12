/**
 * AgentRegistry TypeScript SDK.
 *
 * High-level client combining instruction builders, account parsers, and
 * transaction signing. Works with both Keypair (backend) and wallet-adapter (browser).
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import {
  PROGRAM_ID,
  getAgentProfilePDA,
  getTaskEscrowPDA,
  registerAgentIx,
  updateAgentIx,
  deactivateAgentIx,
  activateAgentIx,
  createTaskIx,
  acceptTaskIx,
  completeTaskIx,
  rateAgentIx,
  RegisterAgentArgs,
  UpdateAgentArgs,
  CreateTaskArgs,
} from "./instructions";

import {
  parseAgentProfile,
  parseTaskEscrow,
} from "./accounts";

import type {
  AgentProfileAccount,
  TaskEscrowAccount,
} from "./accounts";

// ─── Re-exports ──────────────────────────────────────────────────────────────

export {
  // instructions.ts
  PROGRAM_ID,
  getAgentProfilePDA,
  getTaskEscrowPDA,
  registerAgentIx,
  updateAgentIx,
  deactivateAgentIx,
  activateAgentIx,
  createTaskIx,
  acceptTaskIx,
  completeTaskIx,
  rateAgentIx,
  encodeString,
  encodeStringVec,
  encodeU64,
  encodeU8,
  encodeOptionString,
  encodeOptionStringVec,
  encodeOptionU64,
} from "./instructions";

export type { RegisterAgentArgs, UpdateAgentArgs, CreateTaskArgs } from "./instructions";

export {
  // accounts.ts
  AgentStatus,
  TaskStatus,
  parseAgentProfile,
  parseTaskEscrow,
} from "./accounts";

export type { AgentProfileAccount, TaskEscrowAccount } from "./accounts";

// ─── Signer Abstraction ──────────────────────────────────────────────────────

/** Generic signer — works with Keypair (backend) and wallet-adapter (browser). */
export interface TransactionSigner {
  publicKey: PublicKey;
  signTransaction(tx: Transaction): Promise<Transaction>;
}

/** Wrap a Keypair into a TransactionSigner for backend usage. */
export function keypairToSigner(keypair: Keypair): TransactionSigner {
  return {
    publicKey: keypair.publicKey,
    async signTransaction(tx: Transaction): Promise<Transaction> {
      tx.partialSign(keypair);
      return tx;
    },
  };
}

// ─── Client Class ────────────────────────────────────────────────────────────

export class AgentRegistryClient {
  readonly connection: Connection;
  readonly programId: PublicKey;

  constructor(
    rpcUrl: string = "https://api.devnet.solana.com",
    programId: PublicKey = PROGRAM_ID
  ) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.programId = programId;
  }

  // ── PDA Helpers ──────────────────────────────────────────────────────

  getAgentProfilePDA(owner: PublicKey): [PublicKey, number] {
    return getAgentProfilePDA(owner, this.programId);
  }

  getTaskEscrowPDA(client: PublicKey, taskId: string): [PublicKey, number] {
    return getTaskEscrowPDA(client, taskId, this.programId);
  }

  // ── Account Fetchers ────────────────────────────────────────────────

  async fetchAgentProfile(owner: PublicKey): Promise<AgentProfileAccount | null> {
    const [pda] = this.getAgentProfilePDA(owner);
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;
    return parseAgentProfile(info.data);
  }

  async fetchTaskEscrow(client: PublicKey, taskId: string): Promise<TaskEscrowAccount | null> {
    const [pda] = this.getTaskEscrowPDA(client, taskId);
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;
    return parseTaskEscrow(info.data);
  }

  async fetchTaskEscrowByPDA(escrowPubkey: PublicKey): Promise<TaskEscrowAccount | null> {
    const info = await this.connection.getAccountInfo(escrowPubkey);
    if (!info) return null;
    return parseTaskEscrow(info.data);
  }

  // ── Transaction Methods ─────────────────────────────────────────────

  async registerAgent(signer: TransactionSigner, args: RegisterAgentArgs): Promise<string> {
    const ix = registerAgentIx(signer.publicKey, args, this.programId);
    return this._sendTx(signer, ix);
  }

  async updateAgent(signer: TransactionSigner, args: UpdateAgentArgs): Promise<string> {
    const ix = updateAgentIx(signer.publicKey, args, this.programId);
    return this._sendTx(signer, ix);
  }

  async deactivateAgent(signer: TransactionSigner): Promise<string> {
    const ix = deactivateAgentIx(signer.publicKey, this.programId);
    return this._sendTx(signer, ix);
  }

  async activateAgent(signer: TransactionSigner): Promise<string> {
    const ix = activateAgentIx(signer.publicKey, this.programId);
    return this._sendTx(signer, ix);
  }

  async createTask(
    signer: TransactionSigner,
    agentProfile: PublicKey,
    args: CreateTaskArgs
  ): Promise<string> {
    const ix = createTaskIx(signer.publicKey, agentProfile, args, this.programId);
    return this._sendTx(signer, ix);
  }

  async acceptTask(
    signer: TransactionSigner,
    escrow: PublicKey,
    agentProfile: PublicKey
  ): Promise<string> {
    const ix = acceptTaskIx(escrow, agentProfile, signer.publicKey, this.programId);
    return this._sendTx(signer, ix);
  }

  async completeTask(
    signer: TransactionSigner,
    escrow: PublicKey,
    agentProfile: PublicKey
  ): Promise<string> {
    const ix = completeTaskIx(escrow, agentProfile, signer.publicKey, this.programId);
    return this._sendTx(signer, ix);
  }

  async rateAgent(
    signer: TransactionSigner,
    escrow: PublicKey,
    agentProfile: PublicKey,
    rating: number
  ): Promise<string> {
    const ix = rateAgentIx(escrow, agentProfile, signer.publicKey, rating, this.programId);
    return this._sendTx(signer, ix);
  }

  // ── API Methods (preserved) ─────────────────────────────────────────

  async searchAgents(
    query: string,
    apiUrl: string = "http://localhost:3001"
  ): Promise<any[]> {
    const res = await fetch(`${apiUrl}/api/agents/search/${encodeURIComponent(query)}`);
    const data = await res.json() as { agents: any[] };
    return data.agents;
  }

  async listAgents(
    filters: {
      capability?: string;
      maxPrice?: number;
      minReputation?: number;
      status?: string;
      sortBy?: "reputation" | "price" | "tasks";
      page?: number;
      limit?: number;
    } = {},
    apiUrl: string = "http://localhost:3001"
  ): Promise<any> {
    const params = new URLSearchParams();
    if (filters.capability) params.set("capability", filters.capability);
    if (filters.maxPrice !== undefined)
      params.set("maxPrice", filters.maxPrice.toString());
    if (filters.minReputation !== undefined)
      params.set("minReputation", filters.minReputation.toString());
    if (filters.status) params.set("status", filters.status);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.page) params.set("page", filters.page.toString());
    if (filters.limit) params.set("limit", filters.limit.toString());

    const res = await fetch(`${apiUrl}/api/agents?${params.toString()}`);
    return res.json();
  }

  // ── Internal ────────────────────────────────────────────────────────

  private async _sendTx(
    signer: TransactionSigner,
    ...instructions: TransactionInstruction[]
  ): Promise<string> {
    const tx = new Transaction().add(...instructions);
    tx.feePayer = signer.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    const signed = await signer.signTransaction(tx);
    const sig = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}
