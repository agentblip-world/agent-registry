/**
 * Structured task extraction from brief using Gemini.
 * Stage 2 of the optimized pricing pipeline.
 * 
 * Extracts concrete facts + complexity signals for deterministic pricing.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-2.0-flash-exp";

if (!GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY not set — extraction will fail");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Structured extraction with complexity signals for deterministic pricing.
 */
export interface StructuredExtraction {
  // Core facts
  task_type: "smart-contract" | "frontend" | "backend" | "api" | "bot" | "analysis" | "audit" | "devops" | "integration" | "other";
  objective: string;
  chain_or_platform: string;
  
  // Inputs/outputs
  inputs: string[];
  outputs: string[];
  deliverables: string[];
  
  // Success & constraints
  success_criteria: string[];
  constraints: string[];
  risks: string[];
  
  // Complexity signals (for deterministic scoring)
  technical_components: string[]; // e.g., ["Anchor program", "React UI", "PostgreSQL"]
  integration_points: string[]; // e.g., ["Metaplex API", "AWS S3", "Stripe"]
  data_complexity: "simple" | "moderate" | "complex"; // simple=CRUD, moderate=aggregations, complex=ML/indexing
  ui_complexity: "none" | "basic" | "advanced"; // none=API only, basic=forms, advanced=interactive
  custom_logic_required: boolean; // true if requires novel algorithms/business logic
  
  // Time estimate
  estimated_runtime_class: "minutes" | "hours" | "days" | "weeks";
  
  // Clarification
  missing_information: string[];
  clarifying_questions: Array<{
    question: string;
    type: "multiple_choice" | "short_text";
    options?: string[];
    critical: boolean; // Must be answered for pricing
  }>;
}

interface ExtractInput {
  title: string;
  brief: string;
  agentName: string;
}

/**
 * Extract structured facts + complexity signals from task brief.
 * Returns extraction with deterministic complexity indicators.
 */
export async function extractStructuredFacts(input: ExtractInput): Promise<StructuredExtraction> {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are a technical task analyst. EXTRACT CONCRETE FACTS ONLY from this task brief.

DO NOT generate scope. DO NOT add generic filler. ONLY extract specific, measurable information.

Task:
**Title:** ${input.title}
**Brief:** ${input.brief}
**Agent:** ${input.agentName}

Extract these fields as strict JSON. Be SPECIFIC. No generic phrases like "high quality" or "best practices".

REQUIRED OUTPUT FORMAT (valid JSON only, no markdown):
{
  "task_type": "<smart-contract|frontend|backend|api|bot|analysis|audit|devops|integration|other>",
  "objective": "<1 factual sentence, no fluff>",
  "chain_or_platform": "<Solana|Ethereum|Bitcoin|web|mobile|desktop|other|unknown>",
  
  "inputs": ["<what data/access client provides>"],
  "outputs": ["<concrete artifacts to be delivered>"],
  "deliverables": ["<specific files/systems - be precise, e.g. 'Anchor smart contract' not 'code'>"],
  
  "success_criteria": ["<measurable test - must be verifiable, e.g. 'mint 1000 NFTs in <30s'>"],
  "constraints": ["<technical/time/resource limits>"],
  "risks": ["<potential blockers or unknowns>"],
  
  "technical_components": ["<list ALL technologies mentioned or implied, e.g. 'Anchor', 'React', 'PostgreSQL', 'Redis'>"],
  "integration_points": ["<external APIs/services to integrate, e.g. 'Metaplex', 'AWS S3', 'Stripe'>"],
  "data_complexity": "<simple|moderate|complex>",
  "ui_complexity": "<none|basic|advanced>",
  "custom_logic_required": <true|false>,
  
  "estimated_runtime_class": "<minutes|hours|days|weeks>",
  
  "missing_information": ["<what critical info is not specified>"],
  "clarifying_questions": [
    {
      "question": "<specific yes/no or choice question>",
      "type": "multiple_choice",
      "options": ["option1", "option2"],
      "critical": true
    }
  ]
}

COMPLEXITY SIGNAL RULES:
- data_complexity:
  * simple: Basic CRUD, single table, no joins
  * moderate: Multi-table, aggregations, caching
  * complex: ML, real-time indexing, graph queries, large-scale processing
  
- ui_complexity:
  * none: API-only, no UI
  * basic: Simple forms, tables, static pages
  * advanced: Interactive dashboards, real-time updates, complex state, animations
  
- custom_logic_required:
  * true: Novel algorithms, complex business rules, custom protocols
  * false: Standard patterns, off-the-shelf solutions
  
- technical_components: List EVERY technology stack item (frameworks, databases, services)
- integration_points: List EVERY external API/service to integrate

SPECIFICITY EXAMPLES:
❌ BAD: "Build NFT marketplace"
✅ GOOD:
  - deliverables: ["Anchor smart contract with mint/list/buy instructions", "React UI with wallet adapter", "Arweave metadata uploader"]
  - technical_components: ["Anchor 0.29", "React 18", "Solana web3.js", "Arweave SDK"]
  - success_criteria: ["Mint 1000 NFTs in <30 seconds", "List items with <100ms latency", "Upload metadata <5MB to Arweave"]

Generate 2-4 critical clarifying questions ONLY if essential info is missing for pricing (e.g., scale, integrations, custom logic).

OUTPUT ONLY THE JSON. NO EXPLANATIONS.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Remove markdown code fences if present
    if (text.startsWith("```json")) {
      text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    } else if (text.startsWith("```")) {
      text = text.replace(/```\n?/g, "").trim();
    }

    const extraction = JSON.parse(text) as StructuredExtraction;

    // Validate structure
    if (
      !extraction.task_type ||
      !extraction.objective ||
      !Array.isArray(extraction.deliverables) ||
      !Array.isArray(extraction.technical_components) ||
      !extraction.data_complexity ||
      !extraction.ui_complexity ||
      typeof extraction.custom_logic_required !== 'boolean'
    ) {
      throw new Error("Invalid extraction structure from Gemini - missing required complexity signals");
    }

    // Validate data_complexity
    if (!["simple", "moderate", "complex"].includes(extraction.data_complexity)) {
      throw new Error(`Invalid data_complexity: ${extraction.data_complexity}`);
    }

    // Validate ui_complexity
    if (!["none", "basic", "advanced"].includes(extraction.ui_complexity)) {
      throw new Error(`Invalid ui_complexity: ${extraction.ui_complexity}`);
    }

    return extraction;
  } catch (err: any) {
    console.error("Gemini extraction failed:", err.message);
    throw new Error(`Failed to extract structured facts: ${err.message}`);
  }
}
