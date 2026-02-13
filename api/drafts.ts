import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { clientWallet, agentPubkey, agentName, title, brief } = req.body;

  if (!clientWallet || !agentPubkey || !agentName || !title || !brief) {
    return res.status(400).json({
      error: 'Missing required fields',
    });
  }

  const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const draft = {
    draft_id: draftId,
    current_state: 'INIT',
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
