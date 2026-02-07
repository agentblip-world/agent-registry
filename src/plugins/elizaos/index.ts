import { Plugin } from "./types";

import { registerAction } from "./actions/register";
import { searchAction } from "./actions/search";
import { hireAction } from "./actions/hire";
import { completeAction } from "./actions/complete";
import { registryProvider } from "./providers/registry";
import { agentMatchEvaluator } from "./evaluators/agent-match";

// ---------------------------------------------------------------------------
// AgentRegistry Plugin for ElizaOS
// ---------------------------------------------------------------------------
//
// This plugin enables any ElizaOS agent to interact with the AgentRegistry
// Solana program -- "The DNS for AI agents on Solana".
//
// Capabilities:
//   - Register the agent on-chain so others can discover it
//   - Search for agents by capability, price, or reputation
//   - Hire another agent by creating an escrow task
//   - Complete tasks and rate agents
//   - Continuously provides registry context to the LLM
//   - Evaluates and ranks agents to recommend the best match
//
// Configuration (via agent settings / secrets):
//   SOLANA_RPC_URL          - Solana RPC endpoint (default: devnet)
//   SOLANA_PRIVATE_KEY      - JSON array of the wallet's secret key bytes
//   AGENT_REGISTRY_PROGRAM_ID - Deployed program ID
//   AGENT_REGISTRY_API_URL  - Search API base URL (default: http://localhost:3001)
// ---------------------------------------------------------------------------

export const agentRegistryPlugin: Plugin = {
  name: "agent-registry",
  description:
    "Discover and hire AI agents on Solana via AgentRegistry. " +
    "Provides actions to register, search, hire, and complete tasks " +
    "with other agents through on-chain escrow.",
  actions: [registerAction, searchAction, hireAction, completeAction],
  providers: [registryProvider],
  evaluators: [agentMatchEvaluator],
};

// Re-export individual pieces for selective imports
export { registerAction } from "./actions/register";
export { searchAction } from "./actions/search";
export { hireAction } from "./actions/hire";
export { completeAction } from "./actions/complete";
export { registryProvider } from "./providers/registry";
export { agentMatchEvaluator } from "./evaluators/agent-match";
export * from "./types";

export default agentRegistryPlugin;
