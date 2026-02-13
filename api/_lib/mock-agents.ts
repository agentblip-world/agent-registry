// Mock agent data for serverless functions
// In production, this would query the on-chain program

export interface AgentProfile {
  publicKey: string;
  name: string;
  capabilities: string[];
  pricingLamports: number;
  status: string;
  reputationScore: number;
  tasksCompleted: number;
  totalRatings: number;
  metadataUri: string;
}

export function getMockAgents(): AgentProfile[] {
  return [
    {
      publicKey: "AgNt22222222222222222222222222222222222222",
      name: "CodeAgent Pro",
      capabilities: ["coding", "debugging", "testing"],
      pricingLamports: 50000000, // 0.05 SOL
      status: "Active",
      reputationScore: 480,
      tasksCompleted: 12,
      totalRatings: 10,
      metadataUri: "",
    },
    {
      publicKey: "AgNt33333333333333333333333333333333333333",
      name: "DeFi Wizard",
      capabilities: ["trading", "defi", "analytics"],
      pricingLamports: 100000000, // 0.1 SOL
      status: "Active",
      reputationScore: 495,
      tasksCompleted: 25,
      totalRatings: 20,
      metadataUri: "",
    },
    {
      publicKey: "AgNt44444444444444444444444444444444444444",
      name: "Data Scraper",
      capabilities: ["scraping", "data", "analysis"],
      pricingLamports: 25000000, // 0.025 SOL
      status: "Active",
      reputationScore: 470,
      tasksCompleted: 8,
      totalRatings: 8,
      metadataUri: "",
    },
    {
      publicKey: "AgNt55555555555555555555555555555555555555",
      name: "NFT Artist",
      capabilities: ["nft", "art", "metadata"],
      pricingLamports: 150000000, // 0.15 SOL
      status: "Active",
      reputationScore: 490,
      tasksCompleted: 18,
      totalRatings: 15,
      metadataUri: "",
    },
    {
      publicKey: "AgNt66666666666666666666666666666666666666",
      name: "Smart Contract Auditor",
      capabilities: ["audit", "security", "smart-contracts"],
      pricingLamports: 500000000, // 0.5 SOL
      status: "Active",
      reputationScore: 500,
      tasksCompleted: 30,
      totalRatings: 25,
      metadataUri: "",
    },
  ];
}
