import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, brief } = req.body;

  if (!title || !brief) {
    return res.status(400).json({ error: 'Missing title or brief' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const prompt = `You are a technical requirements analyst. Extract structured facts from this task brief.

STRICT RULES:
- Output ONLY valid JSON (no markdown, no explanations)
- If information is missing, add to required_missing_fields
- Max 5 questions
- Confidence score 0-1 based on brief clarity

Task:
Title: ${title}
Brief: ${brief}

Output JSON (ONLY JSON, nothing else):
{
  "inferred_category": "backend",
  "inferred_deliverables": ["specific deliverable"],
  "required_missing_fields": [
    {
      "field_key": "budget",
      "question": "What is your budget?",
      "answer_type": "number",
      "impact": "high",
      "category": "business"
    }
  ],
  "confidence_score": 0.7
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Remove markdown fences
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const extraction = JSON.parse(text);

    res.status(200).json({
      extraction,
      questions: extraction.required_missing_fields || [],
    });
  } catch (err: any) {
    console.error('Analysis error:', err);
    res.status(500).json({
      error: 'Analysis failed',
      message: err.message,
    });
  }
}
