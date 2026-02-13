/**
 * API client for the AgentRegistry search/listing API.
 * Falls back to mock data when the API is not available.
 */

const API_BASE = "/api";

export interface AgentProfile {
  publicKey: string;
  owner: string;
  name: string;
  capabilities: string[];
  pricingLamports: number;
  status: string;
  reputationScore: number;
  tasksCompleted: number;
  metadataUri: string;
}

export interface AgentListResponse {
  agents: AgentProfile[];
  total: number;
  page: number;
  limit: number;
}

export interface TaskEscrow {
  publicKey: string;
  client: string;
  agent: string;
  amountLamports: number;
  amountSol: number;
  status: string;
  taskId: string;
  createdAt: string;
}

// -- Mock data for demo / when API is offline --

const MOCK_AGENTS: AgentProfile[] = [
  {
    publicKey: "AgNt1111111111111111111111111111111111111111",
    owner: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
    name: "TradeBot Alpha",
    capabilities: ["trading", "defi", "analytics"],
    pricingLamports: 100_000_000,
    status: "active",
    reputationScore: 420,
    tasksCompleted: 37,
    metadataUri: "https://arweave.net/tradebot-alpha",
  },
  {
    publicKey: "AgNt2222222222222222222222222222222222222222",
    owner: "HN7cABqLq46Es1jh92dQQisAi5YqpTMEXohV4su2jUwA",
    name: "CodeAgent Pro",
    capabilities: ["coding", "debugging", "review"],
    pricingLamports: 50_000_000,
    status: "active",
    reputationScore: 485,
    tasksCompleted: 124,
    metadataUri: "https://arweave.net/codeagent-pro",
  },
  {
    publicKey: "AgNt3333333333333333333333333333333333333333",
    owner: "3xK3dG4EcW1BgLYhUq3nbSzGTRBFjH7RvLz3FvTqC9pN",
    name: "DataScraper X",
    capabilities: ["scraping", "data-extraction", "analytics"],
    pricingLamports: 25_000_000,
    status: "active",
    reputationScore: 350,
    tasksCompleted: 89,
    metadataUri: "https://arweave.net/datascraper-x",
  },
  {
    publicKey: "AgNt4444444444444444444444444444444444444444",
    owner: "7kY2F4bZwN8sPqRm1dJzT5VxGfHi9AeCp3LuQa6Wo7Xn",
    name: "Email Automator",
    capabilities: ["email", "automation", "scheduling"],
    pricingLamports: 75_000_000,
    status: "active",
    reputationScore: 390,
    tasksCompleted: 56,
    metadataUri: "https://arweave.net/email-automator",
  },
  {
    publicKey: "AgNt5555555555555555555555555555555555555555",
    owner: "BxQ8tPv2rNz3KaLm4YcHd5JfWg6Ui7Eo9Sp1Tr2Aq8Rn",
    name: "SecurityAudit AI",
    capabilities: ["security", "auditing", "smart-contracts"],
    pricingLamports: 500_000_000,
    status: "active",
    reputationScore: 498,
    tasksCompleted: 12,
    metadataUri: "https://arweave.net/security-audit-ai",
  },
  {
    publicKey: "AgNt6666666666666666666666666666666666666666",
    owner: "CpDe8Fw3Gh7Jk2Lm4No5Pq6Rs7Tu8Vw9Xy0Za1Bc3Df",
    name: "NFT Generator",
    capabilities: ["nft", "image-gen", "metadata"],
    pricingLamports: 150_000_000,
    status: "active",
    reputationScore: 410,
    tasksCompleted: 203,
    metadataUri: "https://arweave.net/nft-generator",
  },
  {
    publicKey: "AgNt7777777777777777777777777777777777777777",
    owner: "Ef8Gh2Ij4Kl6Mn8Op0Qr2St4Uv6Wx8Yz0Ab2Cd4Ef6Gh",
    name: "Research Agent",
    capabilities: ["research", "summarization", "writing"],
    pricingLamports: 30_000_000,
    status: "active",
    reputationScore: 460,
    tasksCompleted: 312,
    metadataUri: "https://arweave.net/research-agent",
  },
  {
    publicKey: "AgNt8888888888888888888888888888888888888888",
    owner: "Ij0Kl2Mn4Op6Qr8St0Uv2Wx4Yz6Ab8Cd0Ef2Gh4Ij6Kl",
    name: "Solana DeFi Advisor",
    capabilities: ["defi", "yield", "trading", "analytics"],
    pricingLamports: 200_000_000,
    status: "active",
    reputationScore: 475,
    tasksCompleted: 67,
    metadataUri: "https://arweave.net/defi-advisor",
  },
];

const MOCK_TASKS: TaskEscrow[] = [
  {
    publicKey: "TsK1111111111111111111111111111111111111111",
    client: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
    agent: "AgNt2222222222222222222222222222222222222222",
    amountLamports: 50_000_000,
    amountSol: 0.05,
    status: "in_progress",
    taskId: "review-contract-001",
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    publicKey: "TsK2222222222222222222222222222222222222222",
    client: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
    agent: "AgNt1111111111111111111111111111111111111111",
    amountLamports: 100_000_000,
    amountSol: 0.1,
    status: "completed",
    taskId: "swap-strategy-042",
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    publicKey: "TsK3333333333333333333333333333333333333333",
    client: "9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK",
    agent: "AgNt5555555555555555555555555555555555555555",
    amountLamports: 500_000_000,
    amountSol: 0.5,
    status: "funded",
    taskId: "audit-program-007",
    createdAt: new Date(Date.now() - 600_000).toISOString(),
  },
];

let useMockData = false;

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    useMockData = true;
    return fallback;
  }
}

export function isUsingMockData(): boolean {
  return useMockData;
}

export async function fetchAgents(params?: {
  capability?: string;
  sortBy?: string;
  page?: number;
  limit?: number;
}): Promise<AgentListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.capability) searchParams.set("capability", params.capability);
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const qs = searchParams.toString();
  const url = `${API_BASE}/agents${qs ? `?${qs}` : ""}`;

  let filtered = [...MOCK_AGENTS];
  if (params?.capability) {
    filtered = filtered.filter((a) =>
      a.capabilities.some(
        (c) => c.toLowerCase() === params.capability!.toLowerCase()
      )
    );
  }

  return safeFetch<AgentListResponse>(url, {
    agents: filtered,
    total: filtered.length,
    page: params?.page ?? 1,
    limit: params?.limit ?? 20,
  });
}

export async function searchAgents(query: string): Promise<AgentListResponse> {
  const url = `${API_BASE}/agents/search/${encodeURIComponent(query)}`;
  const q = query.toLowerCase();
  const filtered = MOCK_AGENTS.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.capabilities.some((c) => c.toLowerCase().includes(q))
  );

  return safeFetch<AgentListResponse>(url, {
    agents: filtered,
    total: filtered.length,
    page: 1,
    limit: 20,
  });
}

export async function fetchAgent(pubkey: string): Promise<AgentProfile | null> {
  const url = `${API_BASE}/agents/${pubkey}`;
  const mock = MOCK_AGENTS.find((a) => a.publicKey === pubkey) ?? null;
  return safeFetch<AgentProfile | null>(url, mock);
}

export async function fetchTask(escrowPubkey: string): Promise<TaskEscrow | null> {
  const url = `${API_BASE}/tasks/${escrowPubkey}`;
  const mock = MOCK_TASKS.find((t) => t.publicKey === escrowPubkey) ?? null;
  return safeFetch<TaskEscrow | null>(url, mock);
}

export function getMockTasks(): TaskEscrow[] {
  return MOCK_TASKS;
}

export function getMockAgents(): AgentProfile[] {
  return MOCK_AGENTS;
}

/** Aggregate stats from available data */
export function computeStats(agents: AgentProfile[]): {
  totalAgents: number;
  totalTasks: number;
  topCapabilities: { name: string; count: number }[];
  avgReputation: number;
} {
  const totalAgents = agents.length;
  const totalTasks = agents.reduce((sum, a) => sum + a.tasksCompleted, 0);
  const avgReputation =
    agents.length > 0
      ? Math.round(
          agents.reduce((sum, a) => sum + a.reputationScore, 0) / agents.length
        )
      : 0;

  const capCounts = new Map<string, number>();
  for (const agent of agents) {
    for (const cap of agent.capabilities) {
      capCounts.set(cap, (capCounts.get(cap) ?? 0) + 1);
    }
  }

  const topCapabilities = Array.from(capCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { totalAgents, totalTasks, topCapabilities, avgReputation };
}

/** All known capability tags from mock data + commonly expected */
export const ALL_CAPABILITIES = [
  "trading",
  "defi",
  "analytics",
  "coding",
  "debugging",
  "review",
  "scraping",
  "data-extraction",
  "email",
  "automation",
  "scheduling",
  "security",
  "auditing",
  "smart-contracts",
  "nft",
  "image-gen",
  "metadata",
  "research",
  "summarization",
  "writing",
  "yield",
];
