/**
 * Gemini-powered scope generation from task brief.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TaskScope } from "./workflow-types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-3-flash-preview";

if (!GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY not set — scope generation will fail");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

interface GenerateScopeInput {
  title: string;
  brief: string;
  agentName: string;
}

export async function generateScope(input: GenerateScopeInput): Promise<TaskScope> {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are an AI assistant helping to create a detailed task scope for an AI agent marketplace.

Given the following task:
**Title:** ${input.title}
**Brief:** ${input.brief}
**Agent:** ${input.agentName}

Generate a structured scope in JSON format with these fields:
- objective: A clear, single-sentence objective (what the client wants to achieve)
- deliverables: Array of 3-5 concrete deliverables (what the agent will produce)
- outOfScope: Array of 2-4 items that are explicitly NOT included (to set expectations)
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
      !Array.isArray(scope.acceptanceCriteria)
    ) {
      throw new Error("Invalid scope structure from Gemini");
    }

    return scope;
  } catch (err: any) {
    console.error("Gemini scope generation failed:", err.message);
    throw new Error(`Failed to generate scope: ${err.message}`);
  }
}
