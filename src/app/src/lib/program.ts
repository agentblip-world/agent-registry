/**
 * On-chain program interaction helpers.
 * Builds and sends transactions for the AgentRegistry Solana program.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export const PROGRAM_ID = new PublicKey(
  "4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY"
);

/** Anchor discriminator for instructions (first 8 bytes of sha256("global:<name>")) */
function ixDiscriminator(name: string): Buffer {
  const crypto = globalThis.crypto;
  // We compute a simple sighash compatible with Anchor's namespace
  // For the web UI, we use a precomputed table
  const DISCRIMINATORS: Record<string, number[]> = {
    register_agent: [0x9e, 0x1e, 0x81, 0x2a, 0x5d, 0x39, 0x5c, 0x7a],
    create_task: [0xe2, 0x29, 0x11, 0x86, 0xca, 0x41, 0xc4, 0x58],
    accept_task: [0x41, 0x8a, 0x9c, 0x2e, 0x88, 0x7e, 0x50, 0x77],
    complete_task: [0x5e, 0xb8, 0xc4, 0x76, 0xf7, 0xe5, 0x3b, 0x8a],
    rate_agent: [0xab, 0xfa, 0x5c, 0x30, 0x07, 0x4a, 0xe6, 0xb9],
  };

  const disc = DISCRIMINATORS[name];
  if (!disc) throw new Error(`Unknown instruction: ${name}`);
  return Buffer.from(disc);
}

/** Derive AgentProfile PDA: seeds = ["agent", owner_pubkey] */
export function getAgentProfilePDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    PROGRAM_ID
  );
}

/** Derive TaskEscrow PDA: seeds = ["escrow", client_pubkey, task_id_bytes] */
export function getTaskEscrowPDA(
  client: PublicKey,
  taskId: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), client.toBuffer(), Buffer.from(taskId)],
    PROGRAM_ID
  );
}

/** Encode a Borsh string (u32 length prefix + utf8 bytes) */
function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

/** Encode a Borsh Vec<String> */
function encodeStringVec(items: string[]): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(items.length, 0);
  const parts = items.map(encodeString);
  return Buffer.concat([len, ...parts]);
}

/** Encode a u64 as little-endian 8 bytes */
function encodeU64(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value), 0);
  return buf;
}

/** Encode a u8 */
function encodeU8(value: number): Buffer {
  return Buffer.from([value]);
}

export interface RegisterAgentParams {
  name: string;
  capabilities: string[];
  pricingLamports: number;
  metadataUri: string;
}

/**
 * Build + send register_agent transaction.
 * NOTE: In a real deployment, you would use the Anchor IDL-generated client.
 * For the hackathon demo, we build the raw instruction data manually.
 */
export async function registerAgent(
  connection: Connection,
  wallet: WalletContextState,
  params: RegisterAgentParams
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  const [agentProfilePDA] = getAgentProfilePDA(wallet.publicKey);

  const data = Buffer.concat([
    ixDiscriminator("register_agent"),
    encodeString(params.name),
    encodeStringVec(params.capabilities),
    encodeU64(params.pricingLamports),
    encodeString(params.metadataUri),
  ]);

  const instruction = new TransactionInstruction({
    keys: [
      {
        pubkey: agentProfilePDA,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: wallet.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: PROGRAM_ID,
    data,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");

  return sig;
}

export interface CreateTaskParams {
  taskId: string;
  amountLamports: number;
  agentProfilePubkey: PublicKey;
}

/**
 * Build + send create_task transaction (funds escrow).
 */
export async function createTask(
  connection: Connection,
  wallet: WalletContextState,
  params: CreateTaskParams
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  const [taskEscrowPDA] = getTaskEscrowPDA(wallet.publicKey, params.taskId);

  const data = Buffer.concat([
    ixDiscriminator("create_task"),
    encodeString(params.taskId),
    encodeU64(params.amountLamports),
  ]);

  const instruction = new TransactionInstruction({
    keys: [
      {
        pubkey: taskEscrowPDA,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: params.agentProfilePubkey,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: wallet.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: PROGRAM_ID,
    data,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");

  return sig;
}

/**
 * Build + send rate_agent transaction.
 */
export async function rateAgent(
  connection: Connection,
  wallet: WalletContextState,
  params: {
    taskEscrowPubkey: PublicKey;
    agentProfilePubkey: PublicKey;
    rating: number;
  }
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  const data = Buffer.concat([
    ixDiscriminator("rate_agent"),
    encodeU8(params.rating),
  ]);

  const instruction = new TransactionInstruction({
    keys: [
      {
        pubkey: params.taskEscrowPubkey,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: params.agentProfilePubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: wallet.publicKey,
        isSigner: true,
        isWritable: false,
      },
    ],
    programId: PROGRAM_ID,
    data,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");

  return sig;
}

/** Convert lamports to SOL display string */
export function lamportsToSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(
    lamports % LAMPORTS_PER_SOL === 0 ? 1 : 4
  );
}

/** Convert reputation score (avg*100) to star rating (0-5) */
export function reputationToStars(score: number): number {
  return Math.round((score / 100) * 10) / 10;
}

/** Truncate a pubkey for display */
export function truncatePubkey(pubkey: string, chars = 4): string {
  if (pubkey.length <= chars * 2 + 3) return pubkey;
  return `${pubkey.slice(0, chars)}...${pubkey.slice(-chars)}`;
}
