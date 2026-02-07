import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY"
);

export interface AgentManifest {
  name: string;
  description?: string;
  capabilities: string[];
  pricing: { perTaskSOL: number };
  contact?: string;
  verifications?: string[];
}

export class AgentRegistryClient {
  private connection: Connection;
  private programId: PublicKey;

  constructor(rpcUrl: string = "https://api.devnet.solana.com") {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.programId = PROGRAM_ID;
  }

  /** Derive the AgentProfile PDA for a given owner. */
  getAgentProfilePDA(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), owner.toBuffer()],
      this.programId
    );
  }

  /** Derive the TaskEscrow PDA for a given client + taskId. */
  getTaskEscrowPDA(
    client: PublicKey,
    taskId: string
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), client.toBuffer(), Buffer.from(taskId)],
      this.programId
    );
  }

  /** Fetch an agent profile from on-chain data. */
  async getAgentProfile(owner: PublicKey): Promise<any | null> {
    const [pda] = this.getAgentProfilePDA(owner);
    const accountInfo = await this.connection.getAccountInfo(pda);
    if (!accountInfo) return null;
    return { publicKey: pda.toBase58(), data: accountInfo.data };
  }

  /** Search agents via the API server. */
  async searchAgents(
    query: string,
    apiUrl: string = "http://localhost:3001"
  ): Promise<any[]> {
    const res = await fetch(`${apiUrl}/api/agents/search/${encodeURIComponent(query)}`);
    const data = await res.json();
    return data.agents;
  }

  /** List agents with filters via the API server. */
  async listAgents(
    filters: {
      capability?: string;
      maxPrice?: number;
      minReputation?: number;
      status?: string;
      sortBy?: "reputation" | "price" | "tasks";
      page?: number;
      limit?: number;
    } = {},
    apiUrl: string = "http://localhost:3001"
  ): Promise<any> {
    const params = new URLSearchParams();
    if (filters.capability) params.set("capability", filters.capability);
    if (filters.maxPrice !== undefined)
      params.set("maxPrice", filters.maxPrice.toString());
    if (filters.minReputation !== undefined)
      params.set("minReputation", filters.minReputation.toString());
    if (filters.status) params.set("status", filters.status);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.page) params.set("page", filters.page.toString());
    if (filters.limit) params.set("limit", filters.limit.toString());

    const res = await fetch(`${apiUrl}/api/agents?${params.toString()}`);
    return res.json();
  }
}

export { PROGRAM_ID };
