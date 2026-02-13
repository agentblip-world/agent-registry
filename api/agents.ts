import type { VercelRequest, VercelResponse } from '@vercel/node';

const MOCK_AGENTS = [
  {
    publicKey: "AgNt22222222222222222222222222222222222222",
    name: "CodeAgent Pro",
    capabilities: ["coding", "debugging", "testing"],
    pricingLamports: 50000000,
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
    pricingLamports: 100000000,
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
    pricingLamports: 25000000,
    status: "Active",
    reputationScore: 470,
    tasksCompleted: 8,
    totalRatings: 8,
    metadataUri: "",
  },
];

export default function handler(req: VercelRequest, res: VercelResponse) {
  const capability = req.query.capability as string | undefined;
  let agents = MOCK_AGENTS;

  if (capability) {
    agents = MOCK_AGENTS.filter(a => 
      a.capabilities.some(c => c.toLowerCase().includes(capability.toLowerCase()))
    );
  }

  res.status(200).json({ agents });
}
