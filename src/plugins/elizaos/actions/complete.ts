import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Keypair,
  sendAndConfirmTransaction,
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
 * Derive the AgentProfile PDA for a given owner.
 */
function getAgentProfilePDA(
  owner: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    programId
  );
}

/**
 * Build the Anchor-compatible instruction data for `complete_task`.
 *
 * Layout:
 *   8 bytes - instruction discriminator (sha256("global:complete_task")[0..8])
 *   (no additional args)
 */
function buildCompleteTaskIxData(): Buffer {
  const crypto = require("crypto");
  const hash = crypto
    .createHash("sha256")
    .update("global:complete_task")
    .digest();
  return hash.subarray(0, 8);
}

/**
 * Build the Anchor-compatible instruction data for `rate_agent`.
 *
 * Layout:
 *   8 bytes - instruction discriminator (sha256("global:rate_agent")[0..8])
 *   1 byte  - rating (u8)
 */
function buildRateAgentIxData(rating: number): Buffer {
  const crypto = require("crypto");
  const hash = crypto
    .createHash("sha256")
    .update("global:rate_agent")
    .digest();
  const discriminator = hash.subarray(0, 8);

  const ratingBuf = Buffer.alloc(1);
  ratingBuf.writeUInt8(rating, 0);

  return Buffer.concat([discriminator, ratingBuf]);
}

/**
 * Parse the complete/rate command.
 * Handles:
 *   "complete task <escrow_address>"
 *   "mark task <escrow_address> as complete"
 *   "rate agent <agent_address> 5 stars for task <escrow_address>"
 */
function parseCompleteCommand(text: string): {
  escrowAddress: string | null;
  rating: number | null;
  mode: "complete" | "rate";
} {
  const lowerText = text.toLowerCase();

  // Determine mode
  const isRate =
    /\b(rate|rating|stars?|review)\b/i.test(lowerText);
  const mode: "complete" | "rate" = isRate ? "rate" : "complete";

  // Extract Solana address
  let escrowAddress: string | null = null;
  const addressMatch = text.match(
    /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/
  );
  if (addressMatch) {
    escrowAddress = addressMatch[1];
  }

  // Extract rating (1-5)
  let rating: number | null = null;
  if (isRate) {
    const ratingMatch = text.match(/\b([1-5])\s*(?:stars?|\/5)?/i);
    if (ratingMatch) {
      rating = parseInt(ratingMatch[1], 10);
    }
  }

  return { escrowAddress, rating, mode };
}

// ---------------------------------------------------------------------------
// Action definition
// ---------------------------------------------------------------------------

export const completeAction: Action = {
  name: "COMPLETE_TASK",
  similes: [
    "FINISH_TASK",
    "MARK_COMPLETE",
    "TASK_DONE",
    "RATE_AGENT",
    "REVIEW_AGENT",
    "RATE_TASK",
  ],
  description:
    "Complete a task on the AgentRegistry (agent-side) to release escrowed SOL, " +
    "or rate an agent (client-side) after task completion. " +
    "Supports both completing tasks and providing 1-5 star ratings.",

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
        text: "I cannot complete tasks because no Solana wallet is configured. Please set SOLANA_PRIVATE_KEY in the agent's secrets.",
      });
      return;
    }

    const config = getConfig(runtime);
    const programId = new PublicKey(config.programId);
    const connection = new Connection(config.rpcUrl, "confirmed");

    const { escrowAddress, rating, mode } = parseCompleteCommand(
      message.content.text
    );

    if (!escrowAddress) {
      await callback({
        text:
          "I need the escrow address to proceed. " +
          'Please provide it like: "complete task <escrow_address>" or ' +
          '"rate agent 5 stars for task <escrow_address>"',
      });
      return;
    }

    let escrowPubkey: PublicKey;
    try {
      escrowPubkey = new PublicKey(escrowAddress);
    } catch {
      await callback({
        text: `"${escrowAddress}" is not a valid Solana address. Please provide a valid escrow address.`,
      });
      return;
    }

    // Verify the escrow account exists
    const escrowAccountInfo = await connection.getAccountInfo(escrowPubkey);
    if (!escrowAccountInfo) {
      await callback({
        text: `No task escrow found at address ${escrowAddress}. Please verify the address is correct.`,
      });
      return;
    }

    // Parse the escrow data to get agent profile address
    const escrowData = escrowAccountInfo.data;
    let offset = 8; // skip discriminator
    // client (32 bytes)
    offset += 32;
    // agent profile pubkey (32 bytes)
    const agentProfileBytes = escrowData.subarray(offset, offset + 32);
    const agentProfilePubkey = new PublicKey(agentProfileBytes);
    offset += 32;
    // amount (8 bytes)
    const escrowAmount = Number(escrowData.readBigUInt64LE(offset));
    offset += 8;
    // status (1 byte)
    const statusByte = escrowData.readUInt8(offset);

    if (mode === "complete") {
      // Agent completing the task
      if (statusByte !== 1) {
        // 1 = InProgress
        const statusNames: Record<number, string> = {
          0: "funded (not yet accepted)",
          1: "in progress",
          2: "already completed",
          3: "disputed",
        };
        await callback({
          text:
            `Cannot complete this task. Current status is "${statusNames[statusByte] ?? "unknown"}". ` +
            "Tasks can only be completed when they are in progress.",
        });
        return;
      }

      // We need the agent's owner to derive the agent profile PDA
      // and match it. The signer (wallet) must be the agent owner.
      const [expectedProfilePDA] = getAgentProfilePDA(
        wallet.publicKey,
        programId
      );

      try {
        const ixData = buildCompleteTaskIxData();

        const instruction = new TransactionInstruction({
          keys: [
            {
              pubkey: escrowPubkey,
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: expectedProfilePDA,
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: wallet.publicKey,
              isSigner: true,
              isWritable: true,
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

        const releasedSol = (escrowAmount / 1e9).toFixed(4);

        await callback({
          text:
            `Task completed successfully!\n\n` +
            `**Escrow:** ${escrowAddress}\n` +
            `**Released:** ${releasedSol} SOL\n` +
            `**Transaction:** ${signature}\n\n` +
            `The escrowed SOL has been released to your wallet.`,
          action: "COMPLETE_TASK",
        });
      } catch (error: any) {
        const errorMsg = error?.message ?? String(error);
        await callback({
          text:
            `Failed to complete the task: ${errorMsg}\n\n` +
            "Make sure you are the agent assigned to this task.",
        });
      }
    } else {
      // Client rating the agent
      if (statusByte !== 2) {
        // 2 = Completed
        await callback({
          text: "You can only rate an agent after the task has been completed.",
        });
        return;
      }

      if (!rating || rating < 1 || rating > 5) {
        await callback({
          text:
            "Please provide a rating between 1 and 5 stars. " +
            'Example: "rate agent 5 stars for task <escrow_address>"',
        });
        return;
      }

      try {
        const ixData = buildRateAgentIxData(rating);

        const instruction = new TransactionInstruction({
          keys: [
            {
              pubkey: escrowPubkey,
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: agentProfilePubkey,
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: wallet.publicKey,
              isSigner: true,
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

        const starDisplay = "\u2605".repeat(rating) + "\u2606".repeat(5 - rating);

        await callback({
          text:
            `Agent rated successfully!\n\n` +
            `**Rating:** ${starDisplay} (${rating}/5)\n` +
            `**Escrow:** ${escrowAddress}\n` +
            `**Transaction:** ${signature}\n\n` +
            `Thank you for your feedback. This helps other agents make better hiring decisions.`,
          action: "COMPLETE_TASK",
        });
      } catch (error: any) {
        const errorMsg = error?.message ?? String(error);
        await callback({
          text:
            `Failed to rate the agent: ${errorMsg}\n\n` +
            "Make sure you are the client who created this task.",
        });
      }
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Complete task 3dEFq5PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Task completed successfully!\n\n**Escrow:** 3dEFq5PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH\n**Released:** 0.5000 SOL\n**Transaction:** 5nBpQ...\n\nThe escrowed SOL has been released to your wallet.",
          action: "COMPLETE_TASK",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Rate agent 5 stars for task 8jKLmNoPqRsTuVwXyZ1234567890AbCdEfGhIjKlMnOp",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Agent rated successfully!\n\n**Rating:** \u2605\u2605\u2605\u2605\u2605 (5/5)\n**Escrow:** 8jKLmNoPqRsTuVwXyZ1234567890AbCdEfGhIjKlMnOp\n**Transaction:** 7rStU...\n\nThank you for your feedback. This helps other agents make better hiring decisions.",
          action: "COMPLETE_TASK",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Mark task 4dEFq5PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH as done",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Task completed successfully!\n\n**Escrow:** 4dEFq5PjvZ8rFhGnEpYkNhx6DzRm3a7Bh9cWd4eF5gH\n**Released:** 0.2000 SOL\n**Transaction:** 3xYzA...\n\nThe escrowed SOL has been released to your wallet.",
          action: "COMPLETE_TASK",
        },
      },
    ],
  ],
};
