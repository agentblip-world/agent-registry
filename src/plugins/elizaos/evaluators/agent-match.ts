import {
  Evaluator,
  IAgentRuntime,
  Memory,
  State,
  AgentProfile,
  AgentListResponse,
  ScoredAgent,
  DEFAULT_CONFIG,
  EvaluatorExample,
} from "../types";

// ---------------------------------------------------------------------------
// Scoring logic
// ---------------------------------------------------------------------------

/**
 * Weights for the composite scoring function.
 * Total must equal 1.0.
 */
const WEIGHTS = {
  capabilityMatch: 0.40,
  reputation: 0.30,
  price: 0.15,
  completion: 0.15,
};

/**
 * Extract capability keywords from natural-language text.
 */
function extractCapabilities(text: string): string[] {
  const knownCapabilities = [
    "trading", "defi", "swaps", "lending", "coding", "review",
    "testing", "email", "analytics", "monitoring", "security",
    "audit", "nft", "gaming", "data", "research", "writing",
    "translation", "design", "scraping", "automation", "devops",
  ];

  const lowerText = text.toLowerCase();
  const found: string[] = [];

  for (const cap of knownCapabilities) {
    if (lowerText.includes(cap)) {
      found.push(cap);
    }
  }

  // Also look for explicit capability mentions
  const capPattern = /(?:capabilit(?:y|ies)|skill|expertise|specializ(?:e|ation))\s*(?:in|:)\s*([a-z, ]+)/i;
  const match = text.match(capPattern);
  if (match) {
    const extras = match[1].split(",").map((s) => s.trim().toLowerCase());
    for (const extra of extras) {
      if (extra && !found.includes(extra)) {
        found.push(extra);
      }
    }
  }

  return found;
}

/**
 * Score a single agent against the requested capabilities.
 */
function scoreAgent(
  agent: AgentProfile,
  requestedCaps: string[],
  maxPrice: number,
  maxTasks: number
): ScoredAgent {
  // Capability match: fraction of requested capabilities the agent supports
  let capMatch = 0;
  if (requestedCaps.length > 0) {
    const agentCapsLower = agent.capabilities.map((c) => c.toLowerCase());
    const matches = requestedCaps.filter((rc) =>
      agentCapsLower.some(
        (ac) => ac.includes(rc) || rc.includes(ac)
      )
    );
    capMatch = matches.length / requestedCaps.length;
  } else {
    // No specific capabilities requested; treat all agents equally
    capMatch = 0.5;
  }

  // Reputation: normalize to 0-1 (max reputation = 500 => 5.0 stars)
  const reputationNormalized = Math.min(agent.reputationScore / 500, 1);

  // Price: lower is better. Normalize against max observed price.
  const priceNormalized =
    maxPrice > 0 ? 1 - agent.pricingLamports / maxPrice : 0.5;

  // Completion count: more completed tasks => higher trust
  const completionNormalized =
    maxTasks > 0 ? Math.min(agent.tasksCompleted / maxTasks, 1) : 0;

  const score =
    WEIGHTS.capabilityMatch * capMatch +
    WEIGHTS.reputation * reputationNormalized +
    WEIGHTS.price * Math.max(0, priceNormalized) +
    WEIGHTS.completion * completionNormalized;

  return {
    agent,
    score: Math.round(score * 1000) / 1000,
    breakdown: {
      capabilityMatch: Math.round(capMatch * 100) / 100,
      reputationScore: Math.round(reputationNormalized * 100) / 100,
      priceScore: Math.round(Math.max(0, priceNormalized) * 100) / 100,
      completionScore: Math.round(completionNormalized * 100) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Evaluator definition
// ---------------------------------------------------------------------------

export const agentMatchEvaluator: Evaluator = {
  name: "AGENT_MATCH",
  similes: [
    "BEST_AGENT",
    "RECOMMEND_AGENT",
    "AGENT_RANKING",
    "MATCH_AGENT",
  ],
  description:
    "Evaluates and ranks agents from the AgentRegistry based on capability match, " +
    "reputation, price, and task completion history. Returns a scored and sorted " +
    "list of the best agents for a given request.",
  alwaysRun: false,

  validate: async (
    runtime: IAgentRuntime,
    message: Memory
  ): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    // Trigger when the user is looking for agent recommendations
    const triggerPatterns = [
      /(?:find|search|look\s+for|recommend|suggest|best|top|which)\s+(?:agent|bot)/i,
      /who\s+(?:can|should|could)\s+(?:help|do|handle|manage)/i,
      /need\s+(?:an?\s+)?agent/i,
      /hire\s+(?:an?\s+)?(?:agent|someone)/i,
    ];

    return triggerPatterns.some((p) => p.test(text));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>
  ): Promise<ScoredAgent[]> => {
    const apiUrl =
      runtime.getSetting("AGENT_REGISTRY_API_URL") ??
      DEFAULT_CONFIG.apiUrl;

    // Extract what the user is looking for
    const requestedCaps = extractCapabilities(message.content.text);

    // Fetch active agents
    let agents: AgentProfile[] = [];
    try {
      const params = new URLSearchParams({
        limit: "50",
        status: "active",
        sortBy: "reputation",
      });

      // If we identified capabilities, also filter server-side for the first one
      if (requestedCaps.length > 0) {
        params.set("capability", requestedCaps[0]);
      }

      const response = await fetch(
        `${apiUrl}/api/agents?${params.toString()}`
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as AgentListResponse;
      agents = data.agents;
    } catch {
      return [];
    }

    if (agents.length === 0) {
      return [];
    }

    // Compute normalisation anchors
    const maxPrice = Math.max(...agents.map((a) => a.pricingLamports));
    const maxTasks = Math.max(...agents.map((a) => a.tasksCompleted));

    // Score every agent
    const scored = agents.map((a) =>
      scoreAgent(a, requestedCaps, maxPrice, maxTasks)
    );

    // Sort by composite score descending
    scored.sort((a, b) => b.score - a.score);

    // Return top 5
    return scored.slice(0, 5);
  },

  examples: [
    {
      context: "User is looking for a trading agent on the registry.",
      messages: [
        {
          user: "{{user1}}",
          content: {
            text: "Find me the best trading agent",
          },
        },
      ],
      outcome:
        "Returns a ranked list of agents with trading capability, " +
        "scored by capability match (40%), reputation (30%), " +
        "price competitiveness (15%), and completion history (15%).",
    },
    {
      context: "User needs an agent for coding tasks.",
      messages: [
        {
          user: "{{user1}}",
          content: {
            text: "Which agent should I hire for a coding task?",
          },
        },
      ],
      outcome:
        "Returns agents with coding capability ranked by composite score. " +
        "Higher-reputation, more-experienced agents with competitive pricing rank first.",
    },
    {
      context: "User is asking for a general recommendation.",
      messages: [
        {
          user: "{{user1}}",
          content: {
            text: "Recommend an agent to help me",
          },
        },
      ],
      outcome:
        "Returns top agents across all capabilities since no specific skill was requested. " +
        "Capability match weight is neutral (0.5); ranking is driven by reputation and experience.",
    },
  ],
};
