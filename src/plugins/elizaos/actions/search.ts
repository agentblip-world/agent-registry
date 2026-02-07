import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  AgentProfile,
  AgentListResponse,
  AgentSearchResponse,
  DEFAULT_CONFIG,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiUrl(runtime: IAgentRuntime): string {
  return (
    runtime.getSetting("AGENT_REGISTRY_API_URL") ?? DEFAULT_CONFIG.apiUrl
  );
}

/**
 * Parse a natural-language search query into structured filters.
 * Handles phrases like "find a trading agent under 0.5 SOL" or
 * "search for coding agents sorted by reputation".
 */
function parseSearchQuery(text: string): {
  query: string;
  capability: string | null;
  maxPrice: number | null;
  sortBy: string | null;
} {
  const lowerText = text.toLowerCase();

  // Extract capability - look for common patterns
  const capabilityPatterns = [
    /(?:find|search|look for|get|show)\s+(?:me\s+)?(?:a\s+)?(?:an?\s+)?(\w+)\s+agents?/i,
    /agents?\s+(?:for|with|that\s+(?:can|do))\s+(\w+)/i,
    /capability[:\s]+(\w+)/i,
    /(?:find|search)\s+(\w+)/i,
  ];

  let capability: string | null = null;
  for (const pattern of capabilityPatterns) {
    const match = text.match(pattern);
    if (match) {
      const candidate = match[1].toLowerCase();
      // Exclude noise words
      const noiseWords = new Set([
        "me", "the", "all", "some", "any", "best", "top",
        "available", "registered", "good", "cheap", "cheapest",
      ]);
      if (!noiseWords.has(candidate)) {
        capability = candidate;
        break;
      }
    }
  }

  // Extract max price
  let maxPrice: number | null = null;
  const priceMatch = text.match(
    /(?:under|below|less\s+than|max(?:imum)?\s*(?:price)?|cheaper\s+than)\s*(\d+(?:\.\d+)?)\s*sol/i
  );
  if (priceMatch) {
    maxPrice = parseFloat(priceMatch[1]);
  }

  // Extract sort preference
  let sortBy: string | null = null;
  if (/(?:sort|order|rank)\s*(?:by)?\s*(?:price|cheap)/i.test(lowerText)) {
    sortBy = "price";
  } else if (/(?:sort|order|rank)\s*(?:by)?\s*(?:reputation|rating|best)/i.test(lowerText)) {
    sortBy = "reputation";
  } else if (/(?:sort|order|rank)\s*(?:by)?\s*(?:tasks?|experience|completed)/i.test(lowerText)) {
    sortBy = "tasks";
  }

  // Build a free-text query from whatever is left
  const query = capability ?? lowerText.replace(/[^a-z0-9\s]/g, "").trim();

  return { query, capability, maxPrice, sortBy };
}

/**
 * Format an agent profile into a human-readable block.
 */
function formatAgent(agent: AgentProfile, index: number): string {
  const priceSol = agent.pricingLamports / 1e9;
  const reputation =
    agent.reputationScore > 0
      ? `${(agent.reputationScore / 100).toFixed(2)}/5`
      : "No ratings yet";

  return (
    `**${index + 1}. ${agent.name}**\n` +
    `   Address: ${agent.publicKey}\n` +
    `   Capabilities: ${agent.capabilities.join(", ")}\n` +
    `   Price: ${priceSol} SOL/task\n` +
    `   Reputation: ${reputation} (${agent.tasksCompleted} tasks completed)\n` +
    `   Status: ${agent.status}`
  );
}

// ---------------------------------------------------------------------------
// Action definition
// ---------------------------------------------------------------------------

export const searchAction: Action = {
  name: "SEARCH_AGENTS",
  similes: [
    "FIND_AGENTS",
    "LOOKUP_AGENTS",
    "DISCOVER_AGENTS",
    "LIST_AGENTS",
    "BROWSE_AGENTS",
    "QUERY_AGENTS",
  ],
  description:
    "Search the AgentRegistry for AI agents by capability, price, or reputation. " +
    "Connects to the registry API to find agents that match the requested criteria.",

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    // Search only needs API access, no wallet required
    const apiUrl = getApiUrl(runtime);
    return !!apiUrl;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    if (!state) {
      state = await runtime.composeState(message);
    } else {
      state = await runtime.updateRecentMessageState(state);
    }

    const apiUrl = getApiUrl(runtime);
    const { query, capability, maxPrice, sortBy } = parseSearchQuery(
      message.content.text
    );

    try {
      let agents: AgentProfile[] = [];
      let total = 0;

      if (capability) {
        // Use the filter endpoint for structured queries
        const params = new URLSearchParams();
        params.set("capability", capability);
        if (maxPrice !== null) params.set("maxPrice", maxPrice.toString());
        if (sortBy) params.set("sortBy", sortBy);
        params.set("limit", "10");
        params.set("status", "active");

        const response = await fetch(
          `${apiUrl}/api/agents?${params.toString()}`
        );
        if (!response.ok) {
          throw new Error(
            `API returned ${response.status}: ${response.statusText}`
          );
        }
        const data = (await response.json()) as AgentListResponse;
        agents = data.agents;
        total = data.total;
      } else {
        // Use the free-text search endpoint
        const response = await fetch(
          `${apiUrl}/api/agents/search/${encodeURIComponent(query)}`
        );
        if (!response.ok) {
          throw new Error(
            `API returned ${response.status}: ${response.statusText}`
          );
        }
        const data = (await response.json()) as AgentSearchResponse;
        agents = data.agents;
        total = data.total;
      }

      if (agents.length === 0) {
        await callback({
          text:
            `No agents found matching "${query}". ` +
            "Try broadening your search or checking available capabilities.",
          action: "SEARCH_AGENTS",
        });
        return;
      }

      const formatted = agents.map(formatAgent).join("\n\n");
      const summary =
        total > agents.length
          ? `Showing ${agents.length} of ${total} matching agents.`
          : `Found ${total} matching agent${total === 1 ? "" : "s"}.`;

      await callback({
        text:
          `${summary}\n\n${formatted}\n\n` +
          'To hire an agent, say "hire agent <address> for <amount> SOL".',
        action: "SEARCH_AGENTS",
      });
    } catch (error: any) {
      const errorMsg = error?.message ?? String(error);
      await callback({
        text:
          `Failed to search the AgentRegistry: ${errorMsg}\n\n` +
          "The registry API may be temporarily unavailable. Please try again later.",
      });
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Find me a trading agent",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: 'Found 3 matching agents.\n\n**1. AlphaTrader**\n   Address: 7xKX...\n   Capabilities: trading, defi\n   Price: 0.5 SOL/task\n   Reputation: 4.80/5 (42 tasks completed)\n   Status: active\n\n**2. SwapBot**\n   Address: 9aBC...\n   Capabilities: trading, swaps\n   Price: 0.3 SOL/task\n   Reputation: 4.20/5 (18 tasks completed)\n   Status: active\n\n**3. DeFiHelper**\n   Address: 3dEF...\n   Capabilities: trading, lending\n   Price: 0.8 SOL/task\n   Reputation: 4.90/5 (67 tasks completed)\n   Status: active\n\nTo hire an agent, say "hire agent <address> for <amount> SOL".',
          action: "SEARCH_AGENTS",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Search for coding agents under 0.5 SOL sorted by reputation",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: 'Found 2 matching agents.\n\n**1. CodeMaster**\n   Address: 4dEF...\n   Capabilities: coding, review\n   Price: 0.2 SOL/task\n   Reputation: 4.95/5 (120 tasks completed)\n   Status: active\n\n**2. BugHunter**\n   Address: 8gHI...\n   Capabilities: coding, testing\n   Price: 0.4 SOL/task\n   Reputation: 4.50/5 (35 tasks completed)\n   Status: active\n\nTo hire an agent, say "hire agent <address> for <amount> SOL".',
          action: "SEARCH_AGENTS",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Show me all available agents",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: 'Found 5 matching agents.\n\n**1. AlphaTrader**\n   Address: 7xKX...\n   Capabilities: trading, defi\n   Price: 0.5 SOL/task\n   Reputation: 4.80/5 (42 tasks completed)\n   Status: active\n\n...\n\nTo hire an agent, say "hire agent <address> for <amount> SOL".',
          action: "SEARCH_AGENTS",
        },
      },
    ],
  ],
};
