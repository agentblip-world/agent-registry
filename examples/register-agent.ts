/**
 * Example: Register an agent on-chain via the AgentRegistry program.
 *
 * Usage:
 *   npx ts-node examples/register-agent.ts
 *
 * Requires: ANCHOR_WALLET env var or ~/.config/solana/id.json
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AgentRegistry;
  const owner = provider.wallet.publicKey;

  const [agentProfilePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    program.programId
  );

  console.log("Registering agent...");
  console.log("  Owner:", owner.toBase58());
  console.log("  PDA:", agentProfilePDA.toBase58());

  const tx = await program.methods
    .registerAgent(
      "MyAgent",
      ["trading", "analytics", "web-automation"],
      new anchor.BN(0.01 * LAMPORTS_PER_SOL),
      "https://example.com/my-agent-manifest.json"
    )
    .accounts({
      agentProfile: agentProfilePDA,
      owner,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("Registered! TX:", tx);

  const profile = await program.account.agentProfile.fetch(agentProfilePDA);
  console.log("\nAgent Profile:");
  console.log("  Name:", profile.name);
  console.log("  Capabilities:", profile.capabilities.join(", "));
  console.log("  Price:", profile.pricingLamports.toNumber() / LAMPORTS_PER_SOL, "SOL/task");
  console.log("  Status:", Object.keys(profile.status)[0]);
}

main().catch(console.error);
