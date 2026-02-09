/**
 * AgentRegistry API Server
 *
 * Express server that provides REST endpoints for discovering and interacting
 * with AI agents registered on Solana. Initializes the event-based indexer
 * on startup for fast in-memory queries.
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { Connection } from "@solana/web3.js";
import { AgentIndexer } from "./indexer";
import { agentRoutes } from "./routes/agents";
import { taskRoutes } from "./routes/tasks";
import { statsRoutes } from "./routes/stats";

const app = express();
const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// ─── CORS Configuration ──────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "https://agentregistry.io",
  "https://www.agentregistry.io",
  "https://search-api.web3factory.tools",
  "https://app-one-flax-45.vercel.app",
  "https://app-ftchr7f9x-tawandas-projects-0ee6fc38.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      // In development, allow all origins
      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// ─── Request Logging ─────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  const originalEnd = _res.end.bind(_res);
  _res.end = function (this: Response, ...args: unknown[]) {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${_res.statusCode} ${duration}ms`
    );
    return (originalEnd as Function).apply(this, args);
  } as typeof _res.end;
  next();
});

// ─── Solana Connection & Indexer ─────────────────────────────────────────────

const connection = new Connection(RPC_URL, "confirmed");
const indexer = new AgentIndexer(connection);

// ─── Health Check ────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    cluster: "devnet",
    indexerReady: indexer.isReady(),
    mockData: indexer.isMockData(),
    timestamp: Date.now(),
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────

app.use("/api/agents", agentRoutes(indexer));
app.use("/api/tasks", taskRoutes(connection));
app.use("/api", statsRoutes(indexer));

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    message: `No route matches ${_req.method} ${_req.originalUrl}`,
    availableEndpoints: [
      "GET /health",
      "GET /api/agents",
      "GET /api/agents/top",
      "GET /api/agents/recent",
      "GET /api/agents/search/:query",
      "GET /api/agents/:pubkey",
      "GET /api/tasks/:escrowPubkey",
      "GET /api/stats",
      "GET /api/capabilities",
    ],
  });
});

// ─── Error Handling Middleware ────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[Error] ${err.message}`);
  if (process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }

  // CORS errors
  if (err.message.startsWith("CORS:")) {
    return res.status(403).json({ error: err.message });
  }

  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV !== "production" ? err.message : undefined,
  });
});

// ─── Startup ─────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await indexer.start();

    app.listen(PORT, () => {
      console.log(`AgentRegistry API running on port ${PORT}`);
      console.log(`Cluster: devnet | RPC: ${RPC_URL}`);
      console.log("Endpoints:");
      console.log("  GET /health");
      console.log("  GET /api/agents");
      console.log("  GET /api/agents/top");
      console.log("  GET /api/agents/recent");
      console.log("  GET /api/agents/search/:query");
      console.log("  GET /api/agents/:pubkey");
      console.log("  GET /api/tasks/:escrowPubkey");
      console.log("  GET /api/stats");
      console.log("  GET /api/capabilities");
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();

export { app, indexer };
