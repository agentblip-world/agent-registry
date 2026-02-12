/**
 * Minimal account parsing stubs for indexer compatibility.
 * TODO: Implement full Borsh deserialization if needed.
 */

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

import { PublicKey } from "@solana/web3.js";

export interface ParsedAgentProfile {
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

export interface ParsedTaskEscrow {
  client: PublicKey;
  agent: PublicKey;
  amount: number;
  status: TaskStatus;
  taskId: string;
  createdAt: number;
  bump: number;
}

export function parseAgentProfile(data: Buffer): ParsedAgentProfile | null {
  // Stub implementation - returns null to trigger mock data fallback
  return null;
}

export function parseTaskEscrow(data: Buffer): ParsedTaskEscrow | null {
  // Stub implementation - returns null to trigger mock data fallback
  return null;
}
