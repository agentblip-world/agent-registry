import anchorPkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, BN, web3, setProvider } = anchorPkg;
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load IDL manually to avoid workspace auto-detection issues
const idlPath = resolve(__dirname, "../src/idl/agent_registry.json");
const idl = JSON.parse(readFileSync(idlPath, "utf8"));

describe("agent-registry", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);

  const program = new Program(idl, provider);
  const owner = provider.wallet;

  let agentProfilePDA: PublicKey;
  let agentProfileBump: number;

  before(async () => {
    [agentProfilePDA, agentProfileBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), owner.publicKey.toBuffer()],
      program.programId
    );
  });

  describe("register_agent", () => {
    it("registers a new agent profile", async () => {
      const tx = await program.methods
        .registerAgent(
          "TestAgent",
          ["trading", "email", "coding"],
          new BN(0.02 * LAMPORTS_PER_SOL), // 0.02 SOL per task
          "https://example.com/agent-metadata.json"
        )
        .accounts({
          agentProfile: agentProfilePDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Register tx:", tx);

      const profile = await program.account.agentProfile.fetch(agentProfilePDA);
      expect(profile.name).to.equal("TestAgent");
      expect(profile.capabilities).to.deep.equal(["trading", "email", "coding"]);
      expect(profile.pricingLamports.toNumber()).to.equal(0.02 * LAMPORTS_PER_SOL);
      expect(profile.status).to.deep.equal({ active: {} });
      expect(profile.reputationScore.toNumber()).to.equal(0);
      expect(profile.tasksCompleted.toNumber()).to.equal(0);
      expect(profile.metadataUri).to.equal(
        "https://example.com/agent-metadata.json"
      );
    });

    it("rejects names longer than 64 chars", async () => {
      const longName = "A".repeat(65);
      const newOwner = Keypair.generate();

      // Airdrop to new owner
      const sig = await provider.connection.requestAirdrop(
        newOwner.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("agent"), newOwner.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .registerAgent(longName, ["test"], new BN(1000), "https://x.com")
          .accounts({
            agentProfile: pda,
            owner: newOwner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([newOwner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("NameTooLong");
      }
    });
  });

  describe("update_agent", () => {
    it("updates agent name and pricing", async () => {
      await program.methods
        .updateAgent(
          "UpdatedAgent",
          null,
          new BN(0.05 * LAMPORTS_PER_SOL),
          null
        )
        .accounts({
          agentProfile: agentProfilePDA,
          owner: owner.publicKey,
        })
        .rpc();

      const profile = await program.account.agentProfile.fetch(agentProfilePDA);
      expect(profile.name).to.equal("UpdatedAgent");
      expect(profile.pricingLamports.toNumber()).to.equal(0.05 * LAMPORTS_PER_SOL);
      // Capabilities should remain unchanged
      expect(profile.capabilities).to.deep.equal(["trading", "email", "coding"]);
    });
  });

  describe("deactivate/activate", () => {
    it("deactivates an agent", async () => {
      await program.methods
        .deactivateAgent()
        .accounts({
          agentProfile: agentProfilePDA,
          owner: owner.publicKey,
        })
        .rpc();

      const profile = await program.account.agentProfile.fetch(agentProfilePDA);
      expect(profile.status).to.deep.equal({ inactive: {} });
    });

    it("reactivates an agent", async () => {
      await program.methods
        .activateAgent()
        .accounts({
          agentProfile: agentProfilePDA,
          owner: owner.publicKey,
        })
        .rpc();

      const profile = await program.account.agentProfile.fetch(agentProfilePDA);
      expect(profile.status).to.deep.equal({ active: {} });
    });
  });

  describe("escrow flow", () => {
    const client = Keypair.generate();
    const taskId = "task-001";
    let escrowPDA: PublicKey;

    before(async () => {
      // Airdrop to client
      const sig = await provider.connection.requestAirdrop(
        client.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      [escrowPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          client.publicKey.toBuffer(),
          Buffer.from(taskId),
        ],
        program.programId
      );
    });

    it("creates a task escrow", async () => {
      const amount = new BN(0.05 * LAMPORTS_PER_SOL);

      await program.methods
        .createTask(taskId, amount)
        .accounts({
          taskEscrow: escrowPDA,
          agentProfile: agentProfilePDA,
          client: client.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([client])
        .rpc();

      const escrow = await program.account.taskEscrow.fetch(escrowPDA);
      expect(escrow.client.toBase58()).to.equal(client.publicKey.toBase58());
      expect(escrow.agent.toBase58()).to.equal(agentProfilePDA.toBase58());
      expect(escrow.amount.toNumber()).to.equal(0.05 * LAMPORTS_PER_SOL);
      expect(escrow.status).to.deep.equal({ funded: {} });
      expect(escrow.taskId).to.equal(taskId);
    });

    it("agent accepts the task", async () => {
      await program.methods
        .acceptTask()
        .accounts({
          taskEscrow: escrowPDA,
          agentProfile: agentProfilePDA,
          agentOwner: owner.publicKey,
        })
        .rpc();

      const escrow = await program.account.taskEscrow.fetch(escrowPDA);
      expect(escrow.status).to.deep.equal({ inProgress: {} });
    });

    it("agent completes task and receives payment", async () => {
      const balanceBefore = await provider.connection.getBalance(
        owner.publicKey
      );

      await program.methods
        .completeTask()
        .accounts({
          taskEscrow: escrowPDA,
          agentProfile: agentProfilePDA,
          agentOwner: owner.publicKey,
        })
        .rpc();

      const escrow = await program.account.taskEscrow.fetch(escrowPDA);
      expect(escrow.status).to.deep.equal({ completed: {} });

      const profile = await program.account.agentProfile.fetch(agentProfilePDA);
      expect(profile.tasksCompleted.toNumber()).to.equal(1);

      const balanceAfter = await provider.connection.getBalance(
        owner.publicKey
      );
      // Agent should have received the escrowed amount (minus tx fees)
      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });

    it("client rates the agent", async () => {
      await program.methods
        .rateAgent(5) // 5 stars
        .accounts({
          taskEscrow: escrowPDA,
          agentProfile: agentProfilePDA,
          client: client.publicKey,
        })
        .signers([client])
        .rpc();

      const profile = await program.account.agentProfile.fetch(agentProfilePDA);
      expect(profile.totalRatings.toNumber()).to.equal(1);
      expect(profile.ratingSum.toNumber()).to.equal(5);
      expect(profile.reputationScore.toNumber()).to.equal(500); // 5.00 * 100
    });
  });
});
