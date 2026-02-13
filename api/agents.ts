import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMockAgents } from './_lib/mock-agents';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const agents = getMockAgents();

  // Filter by capability if provided
  const capability = req.query.capability as string | undefined;
  let filtered = agents;

  if (capability) {
    filtered = agents.filter(a => 
      a.capabilities.some(c => c.toLowerCase().includes(capability.toLowerCase()))
    );
  }

  // Sort by reputation (default)
  const sortBy = (req.query.sortBy as string) || 'reputation';
  
  if (sortBy === 'reputation') {
    filtered.sort((a, b) => b.reputationScore - a.reputationScore);
  } else if (sortBy === 'price') {
    filtered.sort((a, b) => a.pricingLamports - b.pricingLamports);
  }

  res.status(200).json({ agents: filtered });
}
