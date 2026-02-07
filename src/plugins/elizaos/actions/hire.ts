import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  DEFAULT_CONFIG,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConfig(runtime: IAgentRuntime) {
  return {
    rpcUrl:
      runtime.getSetting("SOLANA_RPC_URL") ?? DEFAULT_CONFIG.rpcUrl,
    programId:
      runtime.getSetting("AGENT_REGISTRY_PROGRAM_ID") ??
      DEFAULT_CONFIG.programId,
  };
}

function getWalletKeypair(runtime: IAgentRuntime): Keypair | null {
  const secretKeyStr =
    runtime.character?.settings?.secrets?.["SOLANA_PRIVATE_KEY"] ??
    runtime.getSetting("SOLANA_PRIVATE_KEY");

  if (!secretKeyStr) return null;

  try {
    const secretKey = Uint8Array.from(JSON.parse(secretKeyStr));
    return Keypair.fromSecretKey(secretKey);
  } catch {
    return null;
  }
}

/**
 * Derive the TaskEscrow PDA.
 */
function getTaskEscrowPDA(
  client: PublicKey,
  taskId: string,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), client.toBuffer(), Buffer.from(taskId)],
    programId
  );
}

/**
 * Generate a unique task ID.
 */
function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `task-${timestamp}-${random}`;
}

/**
 * Build the Anchor-compatible instruction data for `create_task`.
 *
 * Layout:
 *   8 bytes - instruction discriminator (sha256("global:create_task")[0..8])
 *   4 + N  - task_id (borsh string)
 *   8      - amount_lamports (u64 LE)
 */
function buildCreateTaskIxData(
  taskId: string,
  amountLamports: bigint
): Buffer {
  const crypto = require("crypto");
  const hash = crypto
    .createHash("sha256")
    .update("global:create_task")
    .digest();
  const discriminator = hash.subarray(0, 8);

  // Encode task_id
  const taskIdBytes = Buffer.from(taskId, "utf8");
  const taskIdEncoded = Buffer.alloc(4 + taskIdBytes.length);
  taskIdEncoded.writeUInt32LE(taskIdBytes.length, 0);
  taskIdBytes.copy(taskIdEncoded, 4);

  // Encode amount_lamports
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amountLamports, 0);

  return Buffer.concat([discriminator, taskIdEncoded, amountBuf]);
}

/**
 * Parse the hire command to extract agent address and amount.
 * Handles: "hire agent <address> for <amount> SOL"
 *          "hire <address> <amount> SOL"
 *          "create task for <address> with <amount> SOL"
 */
function parseHireCommand(text: string): {
  agentAddress: string | null;
  amountSol: number | null;
  taskDescription: string | null;
} {
  let agentAddress: string | null = null;
  let amountSol: number | null = null;
  let taskDescription: string | null = null;

  // Extract Solana address (base58, typically 32-44 chars)
  const addressMatch = text.match(
    /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/
  );
  if (addressMatch) {
    agentAddress = addressMatch[1];
  }

  // Extract amount in SOL
  const amountPatterns = [
    /(?:for|with|at|pay|send|deposit)\s+(\d+(?:\.\d+)?)\s*sol/i,
    /(\d+(?:\.\d+)?)\s*sol/i,
  ];
  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match) {
      amountSol = parseFloat(match[1]);
      break;
    }
  }

  // Extract task description
  const descMatch = text.match(
    /(?:to|for\s+the\s+task|task\s*[:=])\s*"([^"]+)"/i
  );
  if (descMatch) {
    taskDescription = descMatch[1];
  }

  return { agentAddress, amountSol, taskDescription };
}

// ---------------------------------------------------------------------------
// Action definition
// ---------------------------------------------------------------------------

export const hireAction: Action = {
  name: "HIRE_AGENT",
  similes: [
    "CREATE_TASK",
    "HIRE",
    "ENGAGE_AGENT",
    "PAY_AGENT",
    "FUND_TASK",
    "ESCROW_AGENT",
    "BOOK_AGENT",
  ],
  description:
    "Hire an agent from the AgentRegistry by creating a task escrow on Solana. " +
    "Deposits SOL into an escrow PDA that is released to the agent upon task completion.",

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const wallet = getWalletKeypair(runtime);
    if (!wallet) return false;

    const config = getConfig(runtime);
    if (!config.programId) return false;

    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    if (!state) {
      state = await runtime.composeState(message);
    } else {
      state = await runtime.updateRecentMessageState(state);
    }

    const wallet = getWalletKeypair(runtime);
    if (!wallet) {
      await callback({
        text: "I cannot hire agents because no Solana wallet is configured. Please set SOLANA_PRIVATE_KEY in the agent's secrets.",
      });
      return;
    }

    const config = getConfig(runtime);
    const programId = new PublicKey(config.programId);
    const connection = new Connection(config.rpcUrl, "confirmed");

    const { agentAddress, amountSol, taskDescription } = parseHireCommand(
      message.content.text
    );

    // Validate inputs
    if (!agentAddress) {
      await callback({
        text:
          "I need the agent's profile address to create a task. " +
          'Please specify it like: "hire agent <address> for <amount> SOL"',
      });
      return;
    }

    if (!amountSol || amountSol <= 0) {
      await callback({
        text:
          "I need to know how much SOL to deposit in the escrow. " +
          'Please specify the amount like: "hire agent <address> for 0.5 SOL"',
      });
      return;
    }

    let agentProfilePubkey: PublicKey;
    try {
      agentProfilePubkey = new PublicKey(agentAddress);
    } catch {
      await callback({
        text: `"${agentAddress}" is not a valid Solana address. Please provide a valid agent profile address.`,
      });
      return;
    }

    // Verify the agent profile exists on-chain
    const agentAccountInfo = await connection.getAccountInfo(agentProfilePubkey);
    if (!agentAccountInfo) {
      await callback({
        text: `No agent profile found at address ${agentAddress}. Please verify the address is correct.`,
      });
      return;
    }

    const amountLamports = BigInt(Math.round(amountSol * LAMPORTS_PER_SOL));
    const taskId = generateTaskId();

    // Check client balance
    const balance = await connection.getBalance(wallet.publicKey);
    const requiredLamports = Number(amountLamports) + 10_000_000; // amount + rent + fees
    if (balance < requiredLamports) {
      const balanceSol = (balance / LAMPORTS_PER_SOL).toFixed(4);
      await callback({
        text:
          `Insufficient balance. Your wallet has ${balanceSol} SOL but this task requires ` +
          `approximately ${(requiredLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL ` +
          `(${amountSol} SOL escrow + rent + fees).`,
      });
      return;
    }

    const [taskEscrowPDA] = getTaskEscrowPDA(
      wallet.publicKey,
      taskId,
      programId
    );

    try {
      const ixData = buildCreateTaskIxData(taskId, amountLamports);

      const instruction = new TransactionInstruction({
        keys: [
          {
            pubkey: taskEscrowPDA,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: agentProfilePubkey,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        programId,
        data: ixData,
      });

      const tx = new Transaction().add(instruction);
      const signature = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet],
        { commitment: "confirmed" }
      );

      await callback({
        text:
          `Task escrow created successfully!\n\n` +
          `**Task ID:** ${taskId}\n` +
          `**Agent:** ${agentAddress}\n` +
          `**Amount:** ${amountSol} SOL\n` +
          `**Escrow PDA:** ${taskEscrowPDA.toBase58()}\n` +
          `**Transaction:** ${signature}\n` +
          (taskDescription ? `**Description:** ${taskDescription}\n` : "") +
          `\nThe SOL has been deposited into the escrow. Once the agent accepts and completes the task, the funds will be released to them.`,
        action: "HIRE_AGENT",
      });
    } catch (error: any) {
      const errorMsg = error?.message ?? String(error);
      await callback({
        text:
          `Failed to create the task escrow: ${errorMsg}\n\n` +
          "Please verify the agent address is correct and your wallet has sufficient SOL.",
      });
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Hire agent 7xKXq9PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH for 0.5 SOL",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Task escrow created successfully!\n\n**Task ID:** task-m1abc-x7y8z9\n**Agent:** 7xKXq9PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH\n**Amount:** 0.5 SOL\n**Escrow PDA:** 3dEFq...\n**Transaction:** 4nBpQ...\n\nThe SOL has been deposited into the escrow. Once the agent accepts and completes the task, the funds will be released to them.",
          action: "HIRE_AGENT",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: 'Create a task for agent 9aBCq2PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH with 1.0 SOL to "analyze my portfolio"',
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: 'Task escrow created successfully!\n\n**Task ID:** task-m1xyz-a2b3c4\n**Agent:** 9aBCq2PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH\n**Amount:** 1.0 SOL\n**Escrow PDA:** 5fGHi...\n**Transaction:** 6kLmN...\n**Description:** analyze my portfolio\n\nThe SOL has been deposited into the escrow. Once the agent accepts and completes the task, the funds will be released to them.',
          action: "HIRE_AGENT",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Pay 0.2 SOL to hire agent 4dEFq5PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Task escrow created successfully!\n\n**Task ID:** task-n2def-g5h6i7\n**Agent:** 4dEFq5PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH\n**Amount:** 0.2 SOL\n**Escrow PDA:** 8jKLm...\n**Transaction:** 9pQrS...\n\nThe SOL has been deposited into the escrow. Once the agent accepts and completes the task, the funds will be released to them.",
          action: "HIRE_AGENT",
        },
      },
    ],
  ],
};
