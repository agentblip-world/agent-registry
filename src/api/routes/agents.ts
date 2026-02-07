/**
 * Agent listing, search, and discovery endpoints.
 * Uses the AgentIndexer for fast in-memory queries instead of raw getProgramAccounts.
 *
 * GET /api/agents          - List all agents with optional filters and pagination
 * GET /api/agents/top      - Top 10 agents by reputation
 * GET /api/agents/recent   - 10 most recently registered agents
 * GET /api/agents/search/:query - Full-text search on name/capabilities
 * GET /api/agents/:pubkey  - Get single agent by pubkey
 */

import { Router, Request, Response } from "express";
import { AgentIndexer } from "../indexer";
import { AgentProfile } from "../types";

export function agentRoutes(indexer: AgentIndexer): Router {
  const router = Router();

  // GET /api/agents - List all agents with optional filters
  router.get("/", (req: Request, res: Response) => {
    try {
      let results = indexer.getAllAgents();

      // Filter by capability
      const capability = req.query.capability as string | undefined;
      if (capability) {
        results = results.filter((a) =>
          a.capabilities.some(
            (c) => c.toLowerCase() === capability.toLowerCase()
          )
        );
      }

      // Filter by status
      const status = req.query.status as string | undefined;
      if (status) {
        results = results.filter((a) => a.status === status);
      }

      // Filter by max price (in SOL)
      const maxPrice = req.query.maxPrice
        ? parseFloat(req.query.maxPrice as string)
        : undefined;
      if (maxPrice !== undefined && !isNaN(maxPrice)) {
        results = results.filter(
          (a) => a.pricingLamports / 1e9 <= maxPrice
        );
      }

      // Filter by min reputation
      const minReputation = req.query.minReputation
        ? parseInt(req.query.minReputation as string, 10)
        : undefined;
      if (minReputation !== undefined && !isNaN(minReputation)) {
        results = results.filter((a) => a.reputationScore >= minReputation);
      }

      // Sort
      const sortBy = (req.query.sortBy as string) || "reputation";
      results = sortAgents(results, sortBy);

      // Pagination
      const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
      const limit = Math.min(
        Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
        100
      );
      const start = (page - 1) * limit;
      const paged = results.slice(start, start + limit);

      res.json({
        agents: paged,
        total: results.length,
        page,
        limit,
        mockData: indexer.isMockData(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Agents] List error:", message);
      res.status(500).json({ error: "Failed to list agents" });
    }
  });

  // GET /api/agents/top - Top 10 agents by reputation
  router.get("/top", (_req: Request, res: Response) => {
    try {
      const top = indexer.getTopAgents(10);
      res.json({
        agents: top,
        total: top.length,
        mockData: indexer.isMockData(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Agents] Top agents error:", message);
      res.status(500).json({ error: "Failed to get top agents" });
    }
  });

  // GET /api/agents/recent - 10 most recently registered agents
  router.get("/recent", (_req: Request, res: Response) => {
    try {
      const recent = indexer.getRecentAgents(10);
      res.json({
        agents: recent,
        total: recent.length,
        mockData: indexer.isMockData(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Agents] Recent agents error:", message);
      res.status(500).json({ error: "Failed to get recent agents" });
    }
  });

  // GET /api/agents/search/:query - Full-text search on name/capabilities
  router.get("/search/:query", (req: Request, res: Response) => {
    try {
      const query = req.params.query;
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const results = indexer.searchAgents(query);

      res.json({
        agents: results,
        total: results.length,
        query,
        mockData: indexer.isMockData(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Agents] Search error:", message);
      res.status(500).json({ error: "Failed to search agents" });
    }
  });

  // GET /api/agents/:pubkey - Get single agent by pubkey
  // This must come AFTER the named routes (/top, /recent, /search) to avoid conflicts
  router.get("/:pubkey", (req: Request, res: Response) => {
    try {
      const agent = indexer.getAgent(req.params.pubkey);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      res.json(agent);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Agents] Get agent error:", message);
      res.status(500).json({ error: "Failed to get agent" });
    }
  });

  return router;
}

/** Sort agents by the given field. */
function sortAgents(agents: AgentProfile[], sortBy: string): AgentProfile[] {
  const sorted = [...agents];
  switch (sortBy) {
    case "reputation":
      sorted.sort((a, b) => b.reputationScore - a.reputationScore);
      break;
    case "price":
      sorted.sort((a, b) => a.pricingLamports - b.pricingLamports);
      break;
    case "tasks":
      sorted.sort((a, b) => b.tasksCompleted - a.tasksCompleted);
      break;
    case "recent":
      sorted.sort((a, b) => b.indexedAt - a.indexedAt);
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      sorted.sort((a, b) => b.reputationScore - a.reputationScore);
  }
  return sorted;
}
