/**
 * Gemini-powered scope generation from task brief.
 * 
 * V2 Pipeline:
 * - generateDeterministicScope: Generate from confirmed extraction (recommended)
 * - generateScope: Legacy one-shot generation from brief (fallback)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TaskScope } from "./workflow-types";
import type { StructuredExtraction } from "./gemini-extract";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-2.0-flash-exp";

if (!GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY not set — scope generation will fail");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

interface GenerateScopeInput {
  title: string;
  brief: string;
  agentName: string;
}

/**
 * LEGACY: Generate scope directly from brief (one-shot).
 * Use generateDeterministicScope for new workflows.
 */
export async function generateScope(input: GenerateScopeInput): Promise<TaskScope> {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are an AI assistant helping to create a detailed technical specification (PRD) for an AI agent marketplace.

Given the following task:
**Title:** ${input.title}
**Brief:** ${input.brief}
**Agent:** ${input.agentName}

Generate a structured scope in JSON format with these fields:
- objective: A clear, single-sentence objective (what the client wants to achieve)
- deliverables: Array of 3-5 high-level deliverables (final outputs)
- implementationPhases: Array of 3-5 implementation phases with:
  * name: Phase name (e.g., "Setup & Architecture", "Core Features", "Testing & Polish")
  * description: What will be done in this phase (2-3 sentences)
  * estimatedHours: Realistic time estimate for this phase
  * deliverables: Specific outputs from this phase (array of strings)
- outOfScope: Array of 2-4 items that are explicitly NOT included
- assumptions: Array of 2-3 assumptions (e.g., "Client will provide API access")
- acceptanceCriteria: Array of 3-5 measurable criteria for task completion

Output ONLY valid JSON with no markdown formatting, no backticks, no explanations.

Example format:
{
  "objective": "Build a smart contract auditing tool that identifies common vulnerabilities",
  "deliverables": [
    "Static analysis engine with 10+ vulnerability checks",
    "Report generator in PDF format",
    "Integration with GitHub Actions"
  ],
  "implementationPhases": [
    {
      "name": "Setup & Architecture",
      "description": "Set up development environment, define project structure, and design the core architecture for the analysis engine. Establish testing framework and CI pipeline.",
      "estimatedHours": 4,
      "deliverables": ["Project scaffolding", "Architecture documentation", "CI/CD pipeline"]
    },
    {
      "name": "Core Analysis Engine",
      "description": "Implement static analysis algorithms for detecting common vulnerabilities. Build AST parser and pattern matching system for Solidity code.",
      "estimatedHours": 12,
      "deliverables": ["AST parser", "Vulnerability detection rules", "Test suite"]
    },
    {
      "name": "Report Generation & Integration",
      "description": "Develop PDF report generator with detailed findings. Create GitHub Actions integration for automated scanning on commits.",
      "estimatedHours": 6,
      "deliverables": ["PDF report module", "GitHub Actions workflow", "Documentation"]
    }
  ],
  "outOfScope": [
    "Manual code review",
    "Deployment automation"
  ],
  "assumptions": [
    "Client provides GitHub repository access",
    "Target language is Solidity"
  ],
  "acceptanceCriteria": [
    "Tool detects all OWASP Top 10 vulnerabilities",
    "Reports generated in under 30 seconds",
    "Zero false positives on test suite"
  ]
}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Remove markdown code fences if present
    let cleanedText = text;
    if (text.startsWith("```json")) {
      cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    } else if (text.startsWith("```")) {
      cleanedText = text.replace(/```\n?/g, "").trim();
    }

    const scope = JSON.parse(cleanedText) as TaskScope;

    // Validate structure
    if (
      !scope.objective ||
      !Array.isArray(scope.deliverables) ||
      !Array.isArray(scope.implementationPhases) ||
      !Array.isArray(scope.acceptanceCriteria)
    ) {
      throw new Error("Invalid scope structure from Gemini");
    }

    // Validate phases
    for (const phase of scope.implementationPhases) {
      if (!phase.name || !phase.description || typeof phase.estimatedHours !== 'number' || !Array.isArray(phase.deliverables)) {
        throw new Error("Invalid implementation phase structure from Gemini");
      }
    }

    return scope;
  } catch (err: any) {
    console.error("Gemini scope generation failed:", err.message);
    throw new Error(`Failed to generate scope: ${err.message}`);
  }
}

/**
 * V2 PIPELINE: Generate deterministic scope from confirmed structured extraction.
 * 
 * Stage 4 of the optimized pricing pipeline.
 * Produces specific, measurable deliverables based on extraction facts.
 * 
 * @param extraction - Confirmed structured extraction from Stage 2
 * @param clarifiedAnswers - Optional answers to clarifying questions from Stage 3
 */
export async function generateDeterministicScope(
  extraction: StructuredExtraction,
  clarifiedAnswers?: Record<string, string>
): Promise<TaskScope> {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const answersText = clarifiedAnswers
    ? "\n\n**Clarified Information:**\n" +
      Object.entries(clarifiedAnswers)
        .map(([q, a]) => `Q: ${q}\nA: ${a}`)
        .join("\n")
    : "";

  const prompt = `You are generating a PRECISE technical scope from confirmed structured data.

**EXTRACTED FACTS** (already confirmed by client):
- Task Type: ${extraction.task_type}
- Objective: ${extraction.objective}
- Platform: ${extraction.chain_or_platform}
- Inputs: ${extraction.inputs.join(", ")}
- Outputs: ${extraction.outputs.join(", ")}
- Deliverables: ${extraction.deliverables.join(", ")}
- Success Criteria: ${extraction.success_criteria.join(", ")}
- Constraints: ${extraction.constraints.join(", ")}
- Risks: ${extraction.risks.join(", ")}

**TECHNICAL SIGNALS:**
- Components: ${extraction.technical_components.join(", ")}
- Integrations: ${extraction.integration_points.join(", ")}
- Data Complexity: ${extraction.data_complexity}
- UI Complexity: ${extraction.ui_complexity}
- Custom Logic: ${extraction.custom_logic_required ? "Yes" : "No"}
- Runtime: ${extraction.estimated_runtime_class}${answersText}

**TASK: Generate a precise, measurable scope in JSON format.**

**CRITICAL RULES:**
1. **NO GENERIC WORDING** - Every deliverable must reference extracted facts
2. **MEASURABLE CRITERIA** - Acceptance criteria must be testable (e.g., "process 1000 transactions in <5s", not "fast performance")
3. **SPECIFIC PHASES** - Implementation phases must map to concrete technical components
4. **CLEAR EXCLUSIONS** - Out-of-scope items must be explicit based on constraints

**OUTPUT FORMAT (valid JSON only, no markdown):**
{
  "objective": "<1 factual sentence using extraction.objective>",
  "deliverables": [
    "<specific artifact from extraction.deliverables[0]>",
    "<specific artifact from extraction.deliverables[1]>"
  ],
  "implementationPhases": [
    {
      "name": "<phase name matching technical_components>",
      "description": "<what gets built - reference specific components>",
      "estimatedHours": <number based on runtime_class: minutes=2-4, hours=4-8, days=8-16, weeks=16+>,
      "deliverables": ["<concrete output 1>", "<concrete output 2>"]
    }
  ],
  "outOfScope": ["<explicit exclusion based on constraints>"],
  "assumptions": ["<assumption from inputs/constraints>"],
  "acceptanceCriteria": [
    "<measurable criterion from success_criteria - must include numbers/thresholds>",
    "<testable criterion - e.g. 'all unit tests pass', 'deploys to mainnet successfully'>"
  ]
}

**EXAMPLES OF GOOD vs BAD:**

❌ BAD (generic):
{
  "objective": "Build a high-quality NFT marketplace",
  "deliverables": ["Smart contract", "Frontend", "Backend"],
  "acceptanceCriteria": ["Works well", "Fast performance", "Secure"]
}

✅ GOOD (specific, from extraction):
{
  "objective": "Build an NFT marketplace on Solana with minting, listing, and purchase functionality",
  "deliverables": [
    "Anchor smart contract with mint_nft, list_item, buy_item instructions",
    "React UI with Phantom wallet integration and NFT gallery",
    "Arweave metadata upload service with <5MB per file limit"
  ],
  "acceptanceCriteria": [
    "Mint 1000 NFTs in <30 seconds on devnet",
    "List items with <100ms latency on UI",
    "Upload metadata to Arweave with <5MB limit enforced",
    "All smart contract unit tests pass (>90% coverage)"
  ]
}

Generate the scope now. OUTPUT ONLY THE JSON.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    if (text.startsWith("```json")) {
      text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    } else if (text.startsWith("```")) {
      text = text.replace(/```\n?/g, "").trim();
    }

    const scope = JSON.parse(text) as TaskScope;

    // Validate structure
    if (
      !scope.objective ||
      !Array.isArray(scope.deliverables) ||
      !Array.isArray(scope.implementationPhases) ||
      !Array.isArray(scope.acceptanceCriteria)
    ) {
      throw new Error("Invalid scope structure from Gemini");
    }

    // Validate phases
    for (const phase of scope.implementationPhases) {
      if (
        !phase.name ||
        !phase.description ||
        typeof phase.estimatedHours !== 'number' ||
        !Array.isArray(phase.deliverables)
      ) {
        throw new Error("Invalid implementation phase structure");
      }
    }

    // Validate specificity: deliverables should not be too generic
    for (const deliverable of scope.deliverables) {
      if (deliverable.length < 20) {
        console.warn(`⚠️  Short deliverable detected: "${deliverable}" - may be too generic`);
      }
    }

    // Validate acceptance criteria have numbers/measurements
    for (const criterion of scope.acceptanceCriteria) {
      const hasNumber = /\d+/.test(criterion);
      const hasMeasurement = /<|>|%|ms|seconds|MB|GB|tests|coverage|pass|fail/i.test(criterion);
      if (!hasNumber && !hasMeasurement) {
        console.warn(`⚠️  Acceptance criterion may not be measurable: "${criterion}"`);
      }
    }

    return scope;
  } catch (err: any) {
    console.error("Deterministic scope generation failed:", err.message);
    throw new Error(`Failed to generate deterministic scope: ${err.message}`);
  }
}
