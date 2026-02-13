import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { answers, skipped, title, brief, extraction, budget } = req.body;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const answersText = Object.entries(answers || {})
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    const budgetContext = budget 
      ? `Budget: ${budget.amount} SOL (~$${budget.usd}). Scope MUST fit within this budget.`
      : 'No budget specified. Provide full comprehensive quote.';

    const prompt = `Generate a project scope and quote based on these requirements.

TASK: ${title || 'Untitled'}
BRIEF: ${brief || 'No brief'}
${budgetContext}

CLARIFICATION ANSWERS:
${answersText || 'None provided'}

SKIPPED QUESTIONS: ${(skipped || []).join(', ') || 'None'}

Output ONLY valid JSON:
{
  "scope": {
    "objective": "One sentence summary",
    "deliverables": ["Deliverable 1", "Deliverable 2"],
    "timeline_days": 14,
    "phases": [
      {"name": "Phase 1", "description": "Setup", "hours": 8}
    ]
  },
  "quote": {
    "total_hours": 40,
    "complexity_score": 65,
    "price_sol": 0.5,
    "price_usd": 75,
    "breakdown": [
      {"item": "Development", "hours": 30, "cost_sol": 0.375},
      {"item": "Testing", "hours": 10, "cost_sol": 0.125}
    ],
    "confidence": 0.8
  }
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(text);

    res.status(200).json({
      draft: {
        current_state: 'QUOTE_READY',
        scope_structured: parsed.scope,
        pricing_result: parsed.quote,
      },
      scope: parsed.scope,
      quote: parsed.quote,
    });
  } catch (err: any) {
    console.error('Clarify/scope error:', err);
    res.status(500).json({
      error: 'Failed to generate scope',
      message: err.message,
    });
  }
}
