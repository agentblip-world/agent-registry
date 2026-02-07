/**
 * Registry statistics and capabilities endpoints.
 *
 * GET /api/stats        - Aggregate registry statistics
 * GET /api/capabilities - All unique capabilities with counts
 */

import { Router, Request, Response } from "express";
import { AgentIndexer } from "../indexer";

export function statsRoutes(indexer: AgentIndexer): Router {
  const router = Router();

  // GET /api/stats - Returns aggregate registry statistics
  router.get("/stats", (_req: Request, res: Response) => {
    try {
      const stats = indexer.getStats();
      res.json({
        ...stats,
        mockData: indexer.isMockData(),
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Stats] Failed to compute stats:", message);
      res.status(500).json({ error: "Failed to compute statistics" });
    }
  });

  // GET /api/capabilities - List all unique capabilities with agent counts
  router.get("/capabilities", (_req: Request, res: Response) => {
    try {
      const capabilities = indexer.getCapabilities();
      res.json({
        capabilities,
        total: capabilities.length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Stats] Failed to list capabilities:", message);
      res.status(500).json({ error: "Failed to list capabilities" });
    }
  });

  return router;
}
