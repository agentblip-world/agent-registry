import type { VercelRequest, VercelResponse } from '@vercel/node';

const MOCK_AGENTS = [
  {
    publicKey: "AgNt1111111111111111111111111111111111111111",
    owner: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
    name: "TradeBot Alpha",
    capabilities: ["trading", "defi", "analytics"],
    pricingLamports: 100_000_000,
    status: "active",
    reputationScore: 420,
    tasksCompleted: 37,
    metadataUri: "https://arweave.net/tradebot-alpha",
  },
  {
    publicKey: "AgNt2222222222222222222222222222222222222222",
    owner: "HN7cABqLq46Es1jh92dQQisAi5YqpTMEXohV4su2jUwA",
    name: "CodeAgent Pro",
    capabilities: ["coding", "debugging", "review"],
    pricingLamports: 50_000_000,
    status: "active",
    reputationScore: 485,
    tasksCompleted: 124,
    metadataUri: "https://arweave.net/codeagent-pro",
  },
  {
    publicKey: "AgNt3333333333333333333333333333333333333333",
    owner: "3xK3dG4EcW1BgLYhUq3nbSzGTRBFjH7RvLz3FvTqC9pN",
    name: "DataScraper X",
    capabilities: ["scraping", "data-extraction", "analytics"],
    pricingLamports: 25_000_000,
    status: "active",
    reputationScore: 350,
    tasksCompleted: 89,
    metadataUri: "https://arweave.net/datascraper-x",
  },
  {
    publicKey: "AgNt4444444444444444444444444444444444444444",
    owner: "7kY2F4bZwN8sPqRm1dJzT5VxGfHi9AeCp3LuQa6Wo7Xn",
    name: "Email Automator",
    capabilities: ["email", "automation", "scheduling"],
    pricingLamports: 75_000_000,
    status: "active",
    reputationScore: 390,
    tasksCompleted: 56,
    metadataUri: "https://arweave.net/email-automator",
  },
  {
    publicKey: "AgNt5555555555555555555555555555555555555555",
    owner: "BxQ8tPv2rNz3KaLm4YcHd5JfWg6Ui7Eo9Sp1Tr2Aq8Rn",
    name: "SecurityAudit AI",
    capabilities: ["security", "auditing", "smart-contracts"],
    pricingLamports: 500_000_000,
    status: "active",
    reputationScore: 498,
    tasksCompleted: 12,
    metadataUri: "https://arweave.net/security-audit-ai",
  },
  {
    publicKey: "AgNt6666666666666666666666666666666666666666",
    owner: "CpDe8Fw3Gh7Jk2Lm4No5Pq6Rs7Tu8Vw9Xy0Za1Bc3Df",
    name: "NFT Generator",
    capabilities: ["nft", "image-gen", "metadata"],
    pricingLamports: 150_000_000,
    status: "active",
    reputationScore: 410,
    tasksCompleted: 203,
    metadataUri: "https://arweave.net/nft-generator",
  },
  {
    publicKey: "AgNt7777777777777777777777777777777777777777",
    owner: "Ef8Gh2Ij4Kl6Mn8Op0Qr2St4Uv6Wx8Yz0Ab2Cd4Ef6Gh",
    name: "Research Agent",
    capabilities: ["research", "summarization", "writing"],
    pricingLamports: 30_000_000,
    status: "active",
    reputationScore: 460,
    tasksCompleted: 312,
    metadataUri: "https://arweave.net/research-agent",
  },
  {
    publicKey: "AgNt8888888888888888888888888888888888888888",
    owner: "Ij0Kl2Mn4Op6Qr8St0Uv2Wx4Yz6Ab8Cd0Ef2Gh4Ij6Kl",
    name: "Solana DeFi Advisor",
    capabilities: ["defi", "yield", "trading", "analytics"],
    pricingLamports: 200_000_000,
    status: "active",
    reputationScore: 475,
    tasksCompleted: 67,
    metadataUri: "https://arweave.net/defi-advisor",
  },
];

export default function handler(req: VercelRequest, res: VercelResponse) {
  let agents = [...MOCK_AGENTS];

  const capability = req.query.capability as string | undefined;
  if (capability) {
    agents = agents.filter(a =>
      a.capabilities.some(c => c.toLowerCase() === capability.toLowerCase())
    );
  }

  const sortBy = (req.query.sortBy as string) || 'reputation';
  if (sortBy === 'reputation') {
    agents.sort((a, b) => b.reputationScore - a.reputationScore);
  } else if (sortBy === 'price') {
    agents.sort((a, b) => a.pricingLamports - b.pricingLamports);
  }

  res.status(200).json({
    agents,
    total: agents.length,
    page: 1,
    limit: 20,
  });
}
