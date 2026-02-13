import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { clientWallet, agentPubkey, agentName, title, brief } = req.body;

  if (!clientWallet || !agentPubkey || !agentName || !title || !brief) {
    return res.status(400).json({
      error: 'Missing required fields: clientWallet, agentPubkey, agentName, title, brief',
    });
  }

  if (title.length > 100) {
    return res.status(400).json({ error: 'Title must be 100 characters or less' });
  }

  if (brief.length > 500) {
    return res.status(400).json({ error: 'Brief must be 500 characters or less' });
  }

  const draft = {
    draft_id: uuidv4(),
    current_state: 'INIT' as const,
    title: title.trim(),
    brief: brief.trim(),
    client_wallet: clientWallet,
    agent_pubkey: agentPubkey,
    agent_name: agentName,
    extraction_result: null,
    clarification_response: null,
    scope_structured: null,
    complexity_result: null,
    pricing_result: null,
    scope_drivers: null,
    requires_human_review: false,
    risk_flags: [],
    state_history: [{
      from_state: null,
      to_state: 'INIT',
      triggered_by: 'user',
      timestamp: new Date().toISOString(),
    }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  res.status(201).json({
    draft,
    next_actions: ['analyze'],
  });
}
