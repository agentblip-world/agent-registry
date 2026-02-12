/**
 * Register a sample agent on devnet to showcase the AgentRegistry protocol.
 *
 * Usage: npx ts-node scripts/register-sample-agent.ts
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY");
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Load the IDL
const idlPath = path.join(__dirname, "../src/idl/agent_registry.json");
const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

// Load the devnet wallet
const walletPath =
  process.env.ANCHOR_WALLET ||
  path.join(process.env.HOME!, ".config/solana/id.json");
const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
);

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const program = new Program(idl, provider);

  const owner = walletKeypair.publicKey;
  console.log(`Owner wallet: ${owner.toBase58()}`);

  // Derive the AgentProfile PDA
  const [agentProfilePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    PROGRAM_ID
  );
  console.log(`Agent Profile PDA: ${agentProfilePDA.toBase58()}`);

  // Check if agent already exists
  const existing = await connection.getAccountInfo(agentProfilePDA);
  if (existing) {
    console.log("Agent profile already registered at this PDA. Fetching...");
    const profile = await (program.account as any).agentProfile.fetch(agentProfilePDA);
    console.log("Existing agent:", {
      name: profile.name,
      capabilities: profile.capabilities,
      pricingLamports: profile.pricingLamports.toString(),
      status: profile.status,
      reputationScore: profile.reputationScore.toString(),
      tasksCompleted: profile.tasksCompleted.toString(),
      metadataUri: profile.metadataUri,
    });
    return;
  }

  // Register a sample agent
  const name = "SolanaCodeReviewer";
  const capabilities = ["code-review", "security-audit", "smart-contracts", "rust"];
  const pricingLamports = new BN(100_000_000); // 0.1 SOL per task
  const metadataUri = "https://arweave.net/sample-solana-code-reviewer";

  console.log(`\nRegistering sample agent...`);
  console.log(`  Name: ${name}`);
  console.log(`  Capabilities: ${capabilities.join(", ")}`);
  console.log(`  Pricing: ${pricingLamports.toNumber() / 1e9} SOL per task`);
  console.log(`  Metadata URI: ${metadataUri}`);

  const tx = await (program.methods as any)
    .registerAgent(name, capabilities, pricingLamports, metadataUri)
    .accounts({
      agentProfile: agentProfilePDA,
      owner: owner,
      systemProgram: PublicKey.default,
    })
    .signers([walletKeypair])
    .rpc();

  console.log(`\nRegistered! TX: ${tx}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

  // Fetch and display the registered profile
  const profile = await (program.account as any).agentProfile.fetch(agentProfilePDA);
  console.log("\nOn-chain profile:", {
    name: profile.name,
    capabilities: profile.capabilities,
    pricingLamports: profile.pricingLamports.toString(),
    status: profile.status,
    reputationScore: profile.reputationScore.toString(),
    tasksCompleted: profile.tasksCompleted.toString(),
    metadataUri: profile.metadataUri,
  });
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
