import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL_NAME = 'gemini-2.0-flash-exp';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // For serverless, we need title and brief in the request body
  // since we don't have persistent draft storage
  const { title, brief } = req.body;

  if (!title || !brief) {
    return res.status(400).json({
      error: 'Missing required fields: title, brief'
    });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY not configured',
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = buildExtractionPrompt(title, brief);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Remove markdown code fences if present
    if (text.startsWith('```json')) {
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    } else if (text.startsWith('```')) {
      text = text.replace(/```\n?/g, '').trim();
    }

    const extraction = JSON.parse(text);

    // Prepare questions
    const allQuestions = [
      ...(extraction.required_missing_fields || []),
      ...(extraction.pricing_sensitive_fields || []),
    ].slice(0, 5); // Max 5 questions

    const draft = {
      draft_id: req.query.id,
      current_state: allQuestions.length > 0 ? 'CLARIFY_PENDING' : 'SCOPE_DRAFT',
      extraction_result: extraction,
    };

    res.status(200).json({
      draft,
      extraction,
      questions: allQuestions,
      next_actions: allQuestions.length > 0 ? ['clarify'] : ['generate_scope'],
    });
  } catch (err: any) {
    console.error('Analysis error:', err);
    res.status(500).json({
      error: 'Analysis failed',
      message: err.message,
      can_retry: true,
    });
  }
}

function buildExtractionPrompt(title: string, brief: string): string {
  return `You are a technical requirements analyst. Extract structured facts from this task brief.

STRICT RULES:
- Output ONLY valid JSON (no markdown, no explanations, no code fences)
- If information is missing, add to required_missing_fields or pricing_sensitive_fields
- Limit inferred_deliverables to MAX 10 concrete items
- Every missing field MUST have: field_key, question, answer_type, impact, category
- Confidence score 0-1 based on brief clarity (0.3 = very vague, 0.9 = very clear)
- Max 5 questions in required_missing_fields

Task:
Title: ${title}
Brief: ${brief}

Output JSON schema (output ONLY this JSON, nothing else):
{
  "inferred_category": "<smart-contract|frontend|backend|api|bot|analysis|audit|devops|integration|other>",
  "inferred_deliverables": ["<specific deliverable 1>", "<specific deliverable 2>"],
  "required_missing_fields": [
    {
      "field_key": "<unique_snake_case_key>",
      "question": "<clear user question>",
      "answer_type": "<radio|multiselect|number|file|text>",
      "options": ["<option1>", "<option2>"],
      "default_value": "<safe default>",
      "impact": "<critical|high|medium|low>",
      "category": "<technical|business|legal|asset>"
    }
  ],
  "optional_missing_fields": [],
  "pricing_sensitive_fields": [],
  "confidence_score": 0.75
}

OUTPUT JSON NOW (no markdown, no explanation):`;
}
