import {
  Provider,
  IAgentRuntime,
  Memory,
  State,
  AgentProfile,
  AgentListResponse,
  DEFAULT_CONFIG,
} from "../types";

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CachedRegistryData {
  agents: AgentProfile[];
  capabilities: string[];
  fetchedAt: number;
}

let cache: CachedRegistryData | null = null;
const CACHE_TTL_MS = 60_000; // Refresh every 60 seconds

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchRegistryData(
  apiUrl: string
): Promise<CachedRegistryData> {
  // Return cache if still fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const response = await fetch(
      `${apiUrl}/api/agents?limit=50&sortBy=reputation&status=active`
    );

    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`);
    }

    const data = (await response.json()) as AgentListResponse;
    const agents = data.agents;

    // Deduplicate capabilities across all agents
    const capSet = new Set<string>();
    for (const agent of agents) {
      for (const cap of agent.capabilities) {
        capSet.add(cap.toLowerCase());
      }
    }
    const capabilities = Array.from(capSet).sort();

    cache = {
      agents,
      capabilities,
      fetchedAt: Date.now(),
    };

    return cache;
  } catch (error) {
    // If fetch fails and we have stale cache, return it
    if (cache) return cache;

    // Otherwise return empty data
    return {
      agents: [],
      capabilities: [],
      fetchedAt: Date.now(),
    };
  }
}

// ---------------------------------------------------------------------------
// Provider definition
// ---------------------------------------------------------------------------

export const registryProvider: Provider = {
  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<string> => {
    const apiUrl =
      runtime.getSetting("AGENT_REGISTRY_API_URL") ??
      DEFAULT_CONFIG.apiUrl;

    const data = await fetchRegistryData(apiUrl);

    if (data.agents.length === 0) {
      return (
        "AgentRegistry Status: No agents currently indexed. " +
        "The registry API may be unavailable or no agents have registered yet."
      );
    }

    // Build a concise context string for the LLM
    const topAgents = data.agents.slice(0, 10);
    const agentSummaries = topAgents
      .map((a) => {
        const priceSol = (a.pricingLamports / 1e9).toFixed(3);
        const rep =
          a.reputationScore > 0
            ? (a.reputationScore / 100).toFixed(1)
            : "N/A";
        return (
          `  - ${a.name} (${a.publicKey.slice(0, 8)}...): ` +
          `capabilities=[${a.capabilities.join(",")}] ` +
          `price=${priceSol}SOL rep=${rep}/5 tasks=${a.tasksCompleted}`
        );
      })
      .join("\n");

    const capList = data.capabilities.join(", ");
    const totalAgents = data.agents.length;

    return (
      `AgentRegistry Status: ${totalAgents} active agent${totalAgents === 1 ? "" : "s"} indexed.\n` +
      `Available capabilities: ${capList}\n\n` +
      `Top agents by reputation:\n${agentSummaries}\n\n` +
      "The user can search for agents by capability, hire them by creating an escrow task, " +
      "and rate them after task completion. Use SEARCH_AGENTS, HIRE_AGENT, or COMPLETE_TASK actions."
    );
  },
};
