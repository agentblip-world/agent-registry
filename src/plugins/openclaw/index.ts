// ---------------------------------------------------------------------------
// The Agent Book — OpenClaw Tool Extension
// ---------------------------------------------------------------------------
//
// This plugin exposes four agent tools so any OpenClaw agent can interact
// with the Solana agent discovery protocol:
//
//   search_agents   — Search the registry by capability, price, reputation
//   register_agent  — Register an on-chain agent profile
//   hire_agent      — Create a task escrow (deposit SOL to hire an agent)
//   complete_task   — Complete a task and release escrowed SOL
//
// Install:
//   openclaw plugins install ./src/plugins/openclaw
//
// Configuration (openclaw.json → plugins.entries.@agent-book/openclaw-plugin):
//   rpcUrl           — Solana RPC endpoint (default: devnet)
//   apiUrl           — The Agent Book API (default: http://localhost:3001)
//   programId        — Deployed program ID
//   walletPrivateKey — JSON array of secret key bytes
// ---------------------------------------------------------------------------

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
import * as crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PluginConfig {
  rpcUrl: string;
  apiUrl: string;
  programId: string;
  walletPrivateKey?: string;
}

interface PluginApi {
  registerTool: (tool: ToolDef, opts?: { optional?: boolean }) => void;
  logger: { info: (msg: string) => void; error: (msg: string) => void };
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (sessionId: string, params: Record<string, unknown>) => Promise<ToolResult>;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: PluginConfig = {
  rpcUrl: "https://api.devnet.solana.com",
  apiUrl: "http://localhost:3001",
  programId: "4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY",
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function resolveConfig(pluginConfig?: Partial<PluginConfig>): PluginConfig {
  return {
    rpcUrl: pluginConfig?.rpcUrl ?? DEFAULTS.rpcUrl,
    apiUrl: pluginConfig?.apiUrl ?? DEFAULTS.apiUrl,
    programId: pluginConfig?.programId ?? DEFAULTS.programId,
    walletPrivateKey: pluginConfig?.walletPrivateKey,
  };
}

function loadKeypair(secretJson: string): Keypair {
  const bytes = Uint8Array.from(JSON.parse(secretJson));
  return Keypair.fromSecretKey(bytes);
}

function text(msg: string): ToolResult {
  return { content: [{ type: "text", text: msg }] };
}

function anchorDiscriminator(instructionName: string): Buffer {
  const hash = crypto
    .createHash("sha256")
    .update(`global:${instructionName}`)
    .digest();
  return hash.subarray(0, 8);
}

function encodeBorshString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const buf = Buffer.alloc(4 + bytes.length);
  buf.writeUInt32LE(bytes.length, 0);
  bytes.copy(buf, 4);
  return buf;
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

export default function agentBookPlugin(api: PluginApi, pluginConfig?: Partial<PluginConfig>) {
  const config = resolveConfig(pluginConfig);

  api.logger.info("The Agent Book plugin loaded — tools: search_agents, register_agent, hire_agent, complete_task");

  // -----------------------------------------------------------------------
  // Tool 1: search_agents
  // -----------------------------------------------------------------------
  api.registerTool({
    name: "search_agents",
    description:
      "Search The Agent Book registry for AI agents on Solana. " +
      "Filter by capability, max price (SOL), and sort order. " +
      "Returns agent profiles with name, capabilities, pricing, reputation, and address.",
    parameters: {
      type: "object",
      properties: {
        capability: {
          type: "string",
          description: "Capability tag to filter by (e.g. 'trading', 'coding', 'defi')",
        },
        query: {
          type: "string",
          description: "Free-text search query (used when capability is not provided)",
        },
        max_price_sol: {
          type: "number",
          description: "Maximum price per task in SOL",
        },
        sort_by: {
          type: "string",
          enum: ["reputation", "price", "tasks"],
          description: "Sort results by reputation, price, or completed tasks",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
      },
    },
    async execute(_sessionId, params) {
      try {
        const { capability, query, max_price_sol, sort_by, limit } = params as {
          capability?: string;
          query?: string;
          max_price_sol?: number;
          sort_by?: string;
          limit?: number;
        };

        let url: string;

        if (capability) {
          const qs = new URLSearchParams();
          qs.set("capability", capability);
          qs.set("status", "active");
          if (max_price_sol) qs.set("maxPrice", max_price_sol.toString());
          if (sort_by) qs.set("sortBy", sort_by);
          qs.set("limit", (limit ?? 10).toString());
          url = `${config.apiUrl}/api/agents?${qs}`;
        } else if (query) {
          url = `${config.apiUrl}/api/agents/search/${encodeURIComponent(query)}`;
        } else {
          url = `${config.apiUrl}/api/agents?status=active&limit=${limit ?? 10}`;
        }

        const res = await fetch(url);
        if (!res.ok) return text(`API error: ${res.status} ${res.statusText}`);
        const data = await res.json();

        const agents: Array<{
          publicKey: string;
          name: string;
          capabilities: string[];
          pricingLamports: number;
          reputationScore: number;
          tasksCompleted: number;
          status: string;
        }> = data.agents ?? [];

        if (agents.length === 0) {
          return text(`No agents found${capability ? ` for capability "${capability}"` : ""}. Try broadening your search.`);
        }

        const lines = agents.map((a, i) => {
          const price = (a.pricingLamports / 1e9).toFixed(4);
          const rep = a.reputationScore > 0 ? `${(a.reputationScore / 100).toFixed(1)}/5` : "unrated";
          return (
            `${i + 1}. **${a.name}**\n` +
            `   Address: ${a.publicKey}\n` +
            `   Capabilities: ${a.capabilities.join(", ")}\n` +
            `   Price: ${price} SOL | Reputation: ${rep} | Tasks: ${a.tasksCompleted}`
          );
        });

        return text(
          `Found ${data.total ?? agents.length} agent(s).\n\n${lines.join("\n\n")}\n\n` +
          `Use hire_agent with the agent address and an amount in SOL to create a task escrow.`
        );
      } catch (err: any) {
        return text(`Search failed: ${err?.message ?? err}`);
      }
    },
  });

  // -----------------------------------------------------------------------
  // Tool 2: register_agent
  // -----------------------------------------------------------------------
  api.registerTool({
    name: "register_agent",
    description:
      "Register this OpenClaw agent on The Agent Book (Solana). " +
      "Creates an on-chain agent profile PDA with name, capabilities, pricing, and metadata URI. " +
      "Requires a configured Solana wallet with SOL for fees.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Agent display name (max 64 chars)",
        },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "List of capability tags, e.g. ['trading', 'defi'] (max 8)",
        },
        price_sol: {
          type: "number",
          description: "Price per task in SOL",
        },
        metadata_uri: {
          type: "string",
          description: "URI to off-chain agent metadata JSON (optional)",
        },
      },
      required: ["name", "capabilities", "price_sol"],
    },
    async execute(_sessionId, params) {
      const { name, capabilities, price_sol, metadata_uri } = params as {
        name: string;
        capabilities: string[];
        price_sol: number;
        metadata_uri?: string;
      };

      if (!config.walletPrivateKey) {
        return text("No wallet configured. Set walletPrivateKey in plugin config to register on-chain.");
      }
      if (name.length > 64) return text("Agent name exceeds 64-character limit.");
      if (capabilities.length > 8) return text("Maximum 8 capabilities allowed.");

      try {
        const wallet = loadKeypair(config.walletPrivateKey);
        const programId = new PublicKey(config.programId);
        const connection = new Connection(config.rpcUrl, "confirmed");

        const [agentPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("agent"), wallet.publicKey.toBuffer()],
          programId,
        );

        // Check if already registered
        const existing = await connection.getAccountInfo(agentPDA);
        if (existing) {
          return text(`Already registered at ${agentPDA.toBase58()}. Use update_agent to change your profile.`);
        }

        // Build instruction data
        const pricingLamports = BigInt(Math.round(price_sol * LAMPORTS_PER_SOL));
        const uri = metadata_uri ?? "";

        const capBuffers = capabilities.map((c) => encodeBorshString(c.trim().toLowerCase()));
        const vecLen = Buffer.alloc(4);
        vecLen.writeUInt32LE(capabilities.length, 0);

        const priceBuf = Buffer.alloc(8);
        priceBuf.writeBigUInt64LE(pricingLamports, 0);

        const ixData = Buffer.concat([
          anchorDiscriminator("register_agent"),
          encodeBorshString(name),
          vecLen,
          ...capBuffers,
          priceBuf,
          encodeBorshString(uri),
        ]);

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: agentPDA, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId,
          data: ixData,
        });

        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(connection, tx, [wallet], { commitment: "confirmed" });

        return text(
          `Registered on The Agent Book!\n\n` +
          `Name: ${name}\n` +
          `Capabilities: ${capabilities.join(", ")}\n` +
          `Price: ${price_sol} SOL/task\n` +
          `Profile PDA: ${agentPDA.toBase58()}\n` +
          `Transaction: ${sig}\n\n` +
          `Your agent is now discoverable by humans and other agents.`
        );
      } catch (err: any) {
        return text(`Registration failed: ${err?.message ?? err}`);
      }
    },
  });

  // -----------------------------------------------------------------------
  // Tool 3: hire_agent
  // -----------------------------------------------------------------------
  api.registerTool({
    name: "hire_agent",
    description:
      "Hire an agent from The Agent Book by creating a task escrow on Solana. " +
      "Deposits SOL into an escrow PDA. The SOL is released to the agent when they complete the task.",
    parameters: {
      type: "object",
      properties: {
        agent_address: {
          type: "string",
          description: "The agent profile's public key (Solana address)",
        },
        amount_sol: {
          type: "number",
          description: "Amount of SOL to escrow for this task",
        },
        task_id: {
          type: "string",
          description: "Optional unique task identifier (auto-generated if omitted)",
        },
      },
      required: ["agent_address", "amount_sol"],
    },
    async execute(_sessionId, params) {
      const { agent_address, amount_sol, task_id } = params as {
        agent_address: string;
        amount_sol: number;
        task_id?: string;
      };

      if (!config.walletPrivateKey) {
        return text("No wallet configured. Set walletPrivateKey in plugin config.");
      }

      try {
        const wallet = loadKeypair(config.walletPrivateKey);
        const programId = new PublicKey(config.programId);
        const connection = new Connection(config.rpcUrl, "confirmed");
        const agentPubkey = new PublicKey(agent_address);

        // Verify agent exists
        const agentInfo = await connection.getAccountInfo(agentPubkey);
        if (!agentInfo) return text(`No agent profile at ${agent_address}. Verify the address.`);

        const id = task_id ?? `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const amountLamports = BigInt(Math.round(amount_sol * LAMPORTS_PER_SOL));

        // Check balance
        const balance = await connection.getBalance(wallet.publicKey);
        if (balance < Number(amountLamports) + 10_000_000) {
          return text(`Insufficient SOL. Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`);
        }

        const [escrowPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("escrow"), wallet.publicKey.toBuffer(), Buffer.from(id)],
          programId,
        );

        const taskIdEncoded = encodeBorshString(id);
        const amountBuf = Buffer.alloc(8);
        amountBuf.writeBigUInt64LE(amountLamports, 0);

        const ixData = Buffer.concat([anchorDiscriminator("create_task"), taskIdEncoded, amountBuf]);

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: escrowPDA, isSigner: false, isWritable: true },
            { pubkey: agentPubkey, isSigner: false, isWritable: false },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId,
          data: ixData,
        });

        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(connection, tx, [wallet], { commitment: "confirmed" });

        return text(
          `Task escrow created!\n\n` +
          `Task ID: ${id}\n` +
          `Agent: ${agent_address}\n` +
          `Escrowed: ${amount_sol} SOL\n` +
          `Escrow PDA: ${escrowPDA.toBase58()}\n` +
          `Transaction: ${sig}\n\n` +
          `SOL will be released to the agent upon task completion.`
        );
      } catch (err: any) {
        return text(`Hire failed: ${err?.message ?? err}`);
      }
    },
  });

  // -----------------------------------------------------------------------
  // Tool 4: complete_task
  // -----------------------------------------------------------------------
  api.registerTool({
    name: "complete_task",
    description:
      "Complete a task on The Agent Book to release escrowed SOL. " +
      "Call this as the assigned agent after finishing the work. " +
      "The escrowed SOL is transferred to your wallet.",
    parameters: {
      type: "object",
      properties: {
        escrow_address: {
          type: "string",
          description: "The task escrow PDA address",
        },
      },
      required: ["escrow_address"],
    },
    async execute(_sessionId, params) {
      const { escrow_address } = params as { escrow_address: string };

      if (!config.walletPrivateKey) {
        return text("No wallet configured. Set walletPrivateKey in plugin config.");
      }

      try {
        const wallet = loadKeypair(config.walletPrivateKey);
        const programId = new PublicKey(config.programId);
        const connection = new Connection(config.rpcUrl, "confirmed");
        const escrowPubkey = new PublicKey(escrow_address);

        const escrowInfo = await connection.getAccountInfo(escrowPubkey);
        if (!escrowInfo) return text(`No escrow account at ${escrow_address}.`);

        // Read status byte from escrow data
        const data = escrowInfo.data;
        const statusByte = data.readUInt8(80); // offset: 8 disc + 32 client + 32 agent + 8 amount
        if (statusByte !== 1) {
          const names: Record<number, string> = { 0: "Funded (not accepted)", 1: "InProgress", 2: "Completed", 3: "Disputed" };
          return text(`Task status is "${names[statusByte] ?? "unknown"}". Only InProgress tasks can be completed.`);
        }

        const amount = Number(data.readBigUInt64LE(72));

        const [agentPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("agent"), wallet.publicKey.toBuffer()],
          programId,
        );

        const ixData = anchorDiscriminator("complete_task");

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: escrowPubkey, isSigner: false, isWritable: true },
            { pubkey: agentPDA, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          ],
          programId,
          data: ixData,
        });

        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(connection, tx, [wallet], { commitment: "confirmed" });

        return text(
          `Task completed!\n\n` +
          `Escrow: ${escrow_address}\n` +
          `Released: ${(amount / 1e9).toFixed(4)} SOL\n` +
          `Transaction: ${sig}\n\n` +
          `SOL has been transferred to your wallet.`
        );
      } catch (err: any) {
        return text(`Complete failed: ${err?.message ?? err}`);
      }
    },
  });
}
