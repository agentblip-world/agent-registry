/**
 * Account data deserialization for the AgentRegistry Solana program.
 * Parses raw Buffer data from on-chain accounts into typed objects.
 */
import { PublicKey } from "@solana/web3.js";

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum AgentStatus {
  Active = 0,
  Inactive = 1,
}

export enum TaskStatus {
  Funded = 0,
  InProgress = 1,
  Completed = 2,
  Disputed = 3,
}

// ─── Account Interfaces ──────────────────────────────────────────────────────

export interface AgentProfileAccount {
  owner: PublicKey;
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

export interface TaskEscrowAccount {
  client: PublicKey;
  agent: PublicKey;
  amount: number;
  status: TaskStatus;
  taskId: string;
  createdAt: number;
  bump: number;
}

// ─── Account Discriminators (from IDL) ───────────────────────────────────────

const AGENT_PROFILE_DISCRIMINATOR = [60, 227, 42, 24, 0, 87, 86, 205];
const TASK_ESCROW_DISCRIMINATOR = [209, 72, 197, 54, 17, 55, 3, 187];

function matchesDiscriminator(data: Buffer, expected: number[]): boolean {
  if (data.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== expected[i]) return false;
  }
  return true;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Parse an AgentProfile account from raw buffer data.
 * Validates the 8-byte discriminator and decodes all Borsh-encoded fields.
 * Returns null if the data is invalid.
 */
export function parseAgentProfile(data: Buffer): AgentProfileAccount | null {
  try {
    if (!matchesDiscriminator(data, AGENT_PROFILE_DISCRIMINATOR)) return null;

    let offset = 8; // skip discriminator

    // owner (32 bytes)
    if (data.length < offset + 32) return null;
    const owner = new PublicKey(data.subarray(offset, offset + 32));
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
    const status: AgentStatus = statusByte === 0 ? AgentStatus.Active : AgentStatus.Inactive;

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
    offset += uriLen;

    // bump (u8)
    if (data.length < offset + 1) return null;
    const bump = data.readUInt8(offset);

    return {
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
      bump,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a TaskEscrow account from raw buffer data.
 * Validates the 8-byte discriminator and decodes all Borsh-encoded fields.
 * Returns null if the data is invalid.
 */
export function parseTaskEscrow(data: Buffer): TaskEscrowAccount | null {
  try {
    if (!matchesDiscriminator(data, TASK_ESCROW_DISCRIMINATOR)) return null;

    let offset = 8; // skip discriminator

    // client (32 bytes)
    if (data.length < offset + 32) return null;
    const client = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // agent (32 bytes)
    if (data.length < offset + 32) return null;
    const agent = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // amount (u64)
    if (data.length < offset + 8) return null;
    const amount = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // status (1 byte)
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

    // taskId (4-byte length prefix + string)
    if (data.length < offset + 4) return null;
    const taskIdLen = data.readUInt32LE(offset);
    offset += 4;
    if (taskIdLen > 64 || data.length < offset + taskIdLen) return null;
    const taskId = data.subarray(offset, offset + taskIdLen).toString("utf8");
    offset += taskIdLen;

    // createdAt (i64)
    if (data.length < offset + 8) return null;
    const createdAt = Number(data.readBigInt64LE(offset));
    offset += 8;

    // bump (u8)
    if (data.length < offset + 1) return null;
    const bump = data.readUInt8(offset);

    return {
      client,
      agent,
      amount,
      status,
      taskId,
      createdAt,
      bump,
    };
  } catch {
    return null;
  }
}
