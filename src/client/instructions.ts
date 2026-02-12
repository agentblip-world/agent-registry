/**
 * Pure instruction builders for the AgentRegistry Solana program.
 * Each function returns a TransactionInstruction — no Connection or signing required.
 */
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY"
);

// ─── Borsh Encoding Helpers ──────────────────────────────────────────────────

/** Encode a Borsh string (u32 length prefix + utf8 bytes) */
export function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

/** Encode a Borsh Vec<String> */
export function encodeStringVec(items: string[]): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(items.length, 0);
  const parts = items.map(encodeString);
  return Buffer.concat([len, ...parts]);
}

/** Encode a u64 as little-endian 8 bytes */
export function encodeU64(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value), 0);
  return buf;
}

/** Encode a u8 */
export function encodeU8(value: number): Buffer {
  return Buffer.from([value]);
}

/** Encode Option<String>: 0x00 for None, 0x01 + borsh string for Some */
export function encodeOptionString(value: string | null | undefined): Buffer {
  if (value == null) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), encodeString(value)]);
}

/** Encode Option<Vec<String>>: 0x00 for None, 0x01 + borsh vec for Some */
export function encodeOptionStringVec(value: string[] | null | undefined): Buffer {
  if (value == null) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), encodeStringVec(value)]);
}

/** Encode Option<u64>: 0x00 for None, 0x01 + u64 for Some */
export function encodeOptionU64(value: number | bigint | null | undefined): Buffer {
  if (value == null) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), encodeU64(value)]);
}

// ─── Discriminators (from IDL: first 8 bytes of sha256("global:<snake_name>")) ─

const DISCRIMINATORS = {
  register_agent:  Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]),
  update_agent:    Buffer.from([85, 2, 178, 9, 119, 139, 102, 164]),
  deactivate_agent: Buffer.from([205, 171, 239, 225, 82, 126, 96, 166]),
  activate_agent:  Buffer.from([252, 139, 87, 21, 195, 152, 29, 217]),
  create_task:     Buffer.from([194, 80, 6, 180, 232, 127, 48, 171]),
  accept_task:     Buffer.from([222, 196, 79, 165, 120, 30, 38, 120]),
  complete_task:   Buffer.from([109, 167, 192, 41, 129, 108, 220, 196]),
  rate_agent:      Buffer.from([62, 30, 240, 125, 81, 120, 134, 78]),
} as const;

// ─── PDA Derivation ──────────────────────────────────────────────────────────

/** Derive AgentProfile PDA: seeds = ["agent", owner_pubkey] */
export function getAgentProfilePDA(
  owner: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    programId
  );
}

/** Derive TaskEscrow PDA: seeds = ["escrow", client_pubkey, task_id_bytes] */
export function getTaskEscrowPDA(
  client: PublicKey,
  taskId: string,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), client.toBuffer(), Buffer.from(taskId)],
    programId
  );
}

// ─── Instruction Builders ────────────────────────────────────────────────────

export interface RegisterAgentArgs {
  name: string;
  capabilities: string[];
  pricingLamports: number | bigint;
  metadataUri: string;
}

export function registerAgentIx(
  owner: PublicKey,
  args: RegisterAgentArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const [agentProfile] = getAgentProfilePDA(owner, programId);

  const data = Buffer.concat([
    DISCRIMINATORS.register_agent,
    encodeString(args.name),
    encodeStringVec(args.capabilities),
    encodeU64(args.pricingLamports),
    encodeString(args.metadataUri),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: agentProfile, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

export interface UpdateAgentArgs {
  name?: string | null;
  capabilities?: string[] | null;
  pricingLamports?: number | bigint | null;
  metadataUri?: string | null;
}

export function updateAgentIx(
  owner: PublicKey,
  args: UpdateAgentArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const [agentProfile] = getAgentProfilePDA(owner, programId);

  const data = Buffer.concat([
    DISCRIMINATORS.update_agent,
    encodeOptionString(args.name),
    encodeOptionStringVec(args.capabilities),
    encodeOptionU64(args.pricingLamports),
    encodeOptionString(args.metadataUri),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: agentProfile, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    programId,
    data,
  });
}

export function deactivateAgentIx(
  owner: PublicKey,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const [agentProfile] = getAgentProfilePDA(owner, programId);

  return new TransactionInstruction({
    keys: [
      { pubkey: agentProfile, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    programId,
    data: DISCRIMINATORS.deactivate_agent,
  });
}

export function activateAgentIx(
  owner: PublicKey,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const [agentProfile] = getAgentProfilePDA(owner, programId);

  return new TransactionInstruction({
    keys: [
      { pubkey: agentProfile, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    programId,
    data: DISCRIMINATORS.activate_agent,
  });
}

export interface CreateTaskArgs {
  taskId: string;
  amountLamports: number | bigint;
}

export function createTaskIx(
  client: PublicKey,
  agentProfile: PublicKey,
  args: CreateTaskArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const [taskEscrow] = getTaskEscrowPDA(client, args.taskId, programId);

  const data = Buffer.concat([
    DISCRIMINATORS.create_task,
    encodeString(args.taskId),
    encodeU64(args.amountLamports),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: taskEscrow, isSigner: false, isWritable: true },
      { pubkey: agentProfile, isSigner: false, isWritable: false },
      { pubkey: client, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

export function acceptTaskIx(
  escrow: PublicKey,
  agentProfile: PublicKey,
  agentOwner: PublicKey,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: agentProfile, isSigner: false, isWritable: false },
      { pubkey: agentOwner, isSigner: true, isWritable: false },
    ],
    programId,
    data: DISCRIMINATORS.accept_task,
  });
}

export function completeTaskIx(
  escrow: PublicKey,
  agentProfile: PublicKey,
  agentOwner: PublicKey,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: agentProfile, isSigner: false, isWritable: true },
      { pubkey: agentOwner, isSigner: true, isWritable: true },
    ],
    programId,
    data: DISCRIMINATORS.complete_task,
  });
}

export function rateAgentIx(
  escrow: PublicKey,
  agentProfile: PublicKey,
  client: PublicKey,
  rating: number,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const data = Buffer.concat([
    DISCRIMINATORS.rate_agent,
    encodeU8(rating),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: escrow, isSigner: false, isWritable: false },
      { pubkey: agentProfile, isSigner: false, isWritable: true },
      { pubkey: client, isSigner: true, isWritable: false },
    ],
    programId,
    data,
  });
}
