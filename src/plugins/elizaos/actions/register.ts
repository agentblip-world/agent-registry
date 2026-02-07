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
  MessageExample,
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
    apiUrl:
      runtime.getSetting("AGENT_REGISTRY_API_URL") ??
      DEFAULT_CONFIG.apiUrl,
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
 * Derive the AgentProfile PDA address.
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
 * Build the Anchor-compatible instruction data for `register_agent`.
 *
 * Layout:
 *   8 bytes - instruction discriminator (sha256("global:register_agent")[0..8])
 *   4 + N  - name (borsh string)
 *   4 + M  - capabilities (borsh Vec<String>)
 *   8      - pricing_lamports (u64 LE)
 *   4 + K  - metadata_uri (borsh string)
 */
function buildRegisterIxData(
  name: string,
  capabilities: string[],
  pricingLamports: bigint,
  metadataUri: string
): Buffer {
  // Anchor discriminator for "register_agent"
  // sha256("global:register_agent") first 8 bytes
  const crypto = require("crypto");
  const hash = crypto
    .createHash("sha256")
    .update("global:register_agent")
    .digest();
  const discriminator = hash.subarray(0, 8);

  // Encode name
  const nameBytes = Buffer.from(name, "utf8");
  const nameEncoded = Buffer.alloc(4 + nameBytes.length);
  nameEncoded.writeUInt32LE(nameBytes.length, 0);
  nameBytes.copy(nameEncoded, 4);

  // Encode capabilities vec
  const capBuffers = capabilities.map((c) => {
    const b = Buffer.from(c, "utf8");
    const encoded = Buffer.alloc(4 + b.length);
    encoded.writeUInt32LE(b.length, 0);
    b.copy(encoded, 4);
    return encoded;
  });
  const vecLenBuf = Buffer.alloc(4);
  vecLenBuf.writeUInt32LE(capabilities.length, 0);
  const capsEncoded = Buffer.concat([vecLenBuf, ...capBuffers]);

  // Encode pricing_lamports (u64 LE)
  const pricingBuf = Buffer.alloc(8);
  pricingBuf.writeBigUInt64LE(pricingLamports, 0);

  // Encode metadata_uri
  const uriBytes = Buffer.from(metadataUri, "utf8");
  const uriEncoded = Buffer.alloc(4 + uriBytes.length);
  uriEncoded.writeUInt32LE(uriBytes.length, 0);
  uriBytes.copy(uriEncoded, 4);

  return Buffer.concat([
    discriminator,
    nameEncoded,
    capsEncoded,
    pricingBuf,
    uriEncoded,
  ]);
}

// ---------------------------------------------------------------------------
// Action definition
// ---------------------------------------------------------------------------

export const registerAction: Action = {
  name: "REGISTER_AGENT",
  similes: [
    "REGISTER_ON_REGISTRY",
    "SIGN_UP_AGENT",
    "LIST_MYSELF",
    "ADD_TO_REGISTRY",
    "ONBOARD_AGENT",
  ],
  description:
    "Register this ElizaOS agent on the Solana AgentRegistry so other agents can discover and hire it. " +
    "Requires a Solana wallet with SOL for the transaction fee.",

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
        text: "I cannot register on the AgentRegistry because no Solana wallet is configured. Please set SOLANA_PRIVATE_KEY in the agent's secrets.",
      });
      return;
    }

    const config = getConfig(runtime);
    const programId = new PublicKey(config.programId);
    const connection = new Connection(config.rpcUrl, "confirmed");

    // Extract registration details from message or fall back to agent config
    const text = message.content.text;
    const agentName = extractField(text, "name") ?? runtime.character.name;
    const capabilitiesRaw =
      extractField(text, "capabilities") ??
      extractField(text, "skills") ??
      "";
    const capabilities = capabilitiesRaw
      ? capabilitiesRaw.split(",").map((s: string) => s.trim().toLowerCase())
      : ["general"];
    const pricingStr = extractField(text, "price") ?? extractField(text, "pricing") ?? "0.1";
    const pricingSol = parseFloat(pricingStr) || 0.1;
    const pricingLamports = BigInt(Math.round(pricingSol * LAMPORTS_PER_SOL));
    const metadataUri =
      extractField(text, "metadata") ?? extractField(text, "uri") ?? "";

    // Validate on-chain constraints
    if (agentName.length > 64) {
      await callback({
        text: `Agent name "${agentName}" exceeds the 64-character limit. Please use a shorter name.`,
      });
      return;
    }
    if (capabilities.length > 8) {
      await callback({
        text: "You can register at most 8 capabilities. Please reduce the list.",
      });
      return;
    }

    const [agentProfilePDA] = getAgentProfilePDA(wallet.publicKey, programId);

    // Check if already registered
    const existingAccount = await connection.getAccountInfo(agentProfilePDA);
    if (existingAccount) {
      await callback({
        text:
          `This wallet is already registered on the AgentRegistry at address ${agentProfilePDA.toBase58()}. ` +
          "Use the update command to change your profile.",
      });
      return;
    }

    try {
      const ixData = buildRegisterIxData(
        agentName,
        capabilities,
        pricingLamports,
        metadataUri
      );

      const instruction = new TransactionInstruction({
        keys: [
          {
            pubkey: agentProfilePDA,
            isSigner: false,
            isWritable: true,
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
          `Successfully registered on the AgentRegistry!\n\n` +
          `**Name:** ${agentName}\n` +
          `**Capabilities:** ${capabilities.join(", ")}\n` +
          `**Pricing:** ${pricingSol} SOL per task\n` +
          `**Profile PDA:** ${agentProfilePDA.toBase58()}\n` +
          `**Transaction:** ${signature}\n\n` +
          `Other agents can now discover and hire me through the registry.`,
        action: "REGISTER_AGENT",
      });
    } catch (error: any) {
      const errorMsg = error?.message ?? String(error);
      await callback({
        text:
          `Failed to register on the AgentRegistry: ${errorMsg}\n\n` +
          "Make sure the wallet has enough SOL for the transaction fee and account rent.",
      });
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Register yourself on the agent registry with capabilities: trading, analysis and price 0.5 SOL",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Successfully registered on the AgentRegistry!\n\n**Name:** AgentAlpha\n**Capabilities:** trading, analysis\n**Pricing:** 0.5 SOL per task\n**Profile PDA:** 7xKX...\n**Transaction:** 5nBp...\n\nOther agents can now discover and hire me through the registry.",
          action: "REGISTER_AGENT",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Sign up on the registry as a coding agent for 0.2 SOL per task",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Successfully registered on the AgentRegistry!\n\n**Name:** CodeBot\n**Capabilities:** coding\n**Pricing:** 0.2 SOL per task\n**Profile PDA:** 9aBC...\n**Transaction:** 3xYz...\n\nOther agents can now discover and hire me through the registry.",
          action: "REGISTER_AGENT",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Add me to the agent registry",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Successfully registered on the AgentRegistry!\n\n**Name:** MyAgent\n**Capabilities:** general\n**Pricing:** 0.1 SOL per task\n**Profile PDA:** 4dEF...\n**Transaction:** 2wXy...\n\nOther agents can now discover and hire me through the registry.",
          action: "REGISTER_AGENT",
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Naive extraction of "field: value" or "field value" from a natural
 * language string. Returns null when not found.
 */
function extractField(text: string, field: string): string | null {
  // Match patterns like "name: AgentFoo" or "capabilities: trading, coding"
  const colonPattern = new RegExp(
    `${field}\\s*[:=]\\s*([^\\n,;]+(?:,\\s*[^\\n;]+)*)`,
    "i"
  );
  const colonMatch = text.match(colonPattern);
  if (colonMatch) return colonMatch[1].trim();

  return null;
}
