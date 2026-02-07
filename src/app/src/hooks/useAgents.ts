import { useState, useEffect, useCallback } from "react";
import {
  fetchAgents,
  searchAgents,
  isUsingMockData,
  computeStats,
  getMockAgents,
  type AgentProfile,
  type AgentListResponse,
} from "../lib/api";

interface UseAgentsOptions {
  searchQuery?: string;
  capability?: string | null;
  sortBy?: string;
  page?: number;
  limit?: number;
  refreshKey?: number;
}

interface UseAgentsResult {
  agents: AgentProfile[];
  total: number;
  loading: boolean;
  error: string | null;
  isMock: boolean;
  refetch: () => void;
}

export function useAgents(options: UseAgentsOptions = {}): UseAgentsResult {
  const { searchQuery, capability, sortBy, page, limit, refreshKey } = options;
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => setFetchCount((c) => c + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        let result: AgentListResponse;

        if (searchQuery && searchQuery.trim().length > 0) {
          result = await searchAgents(searchQuery.trim());
        } else {
          result = await fetchAgents({
            capability: capability ?? undefined,
            sortBy,
            page,
            limit,
          });
        }

        if (!cancelled) {
          setAgents(result.agents);
          setTotal(result.total);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load agents");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, capability, sortBy, page, limit, fetchCount, refreshKey]);

  return {
    agents,
    total,
    loading,
    error,
    isMock: isUsingMockData(),
    refetch,
  };
}

export function useStats() {
  const [stats, setStats] = useState({
    totalAgents: 0,
    totalTasks: 0,
    topCapabilities: [] as { name: string; count: number }[],
    avgReputation: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchAgents({ limit: 100 });
        const data =
          result.agents.length > 0
            ? result.agents
            : getMockAgents();
        setStats(computeStats(data));
      } catch {
        setStats(computeStats(getMockAgents()));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { stats, loading };
}
