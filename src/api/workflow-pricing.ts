/**
 * Complexity scoring and price computation for task workflows.
 *
 * Pricing rule: $5 per complexity point, converted to SOL at a configurable rate.
 * Complexity is derived from the scope's structure (deliverables, criteria, etc.).
 */

import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { TaskScope, TaskQuote } from "./workflow-types";

// ─── Configuration ───────────────────────────────────────────────────────────

/** Hardcoded SOL/USD rate. Update as needed. */
export const SOL_USD_RATE = 150;

/** USD per complexity point */
export const USD_PER_POINT = 5;

/** Estimated hours per complexity point */
const HOURS_PER_POINT = 2;

// ─── Complexity Scoring ──────────────────────────────────────────────────────

/**
 * Compute a complexity score (1-10) from the task scope.
 *
 * Formula:
 *   score  = min(deliverables.length, 5)              → 0-5 points
 *   score += min(acceptanceCriteria.length, 5) * 0.5  → 0-2.5 points
 *   score += min(assumptions.length, 5) * 0.3         → 0-1.5 points
 *   score += min(outOfScope.length, 5) * 0.2          → 0-1.0 points
 *   → clamp to 1-10
 */
export function computeComplexity(scope: TaskScope): number {
  let score = 0;
  score += Math.min(scope.deliverables.length, 5);
  score += Math.min(scope.acceptanceCriteria.length, 5) * 0.5;
  score += Math.min(scope.assumptions.length, 5) * 0.3;
  score += Math.min(scope.outOfScope.length, 5) * 0.2;
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

// ─── Quote Generation ────────────────────────────────────────────────────────

/**
 * Generate a full quote from a task scope.
 */
export function generateQuote(scope: TaskScope): TaskQuote {
  const complexity = computeComplexity(scope);

  const usdTotal = complexity * USD_PER_POINT;
  const solTotal = usdTotal / SOL_USD_RATE;
  const quotedLamports = Math.round(solTotal * LAMPORTS_PER_SOL);
  const quotedSol = Math.round(solTotal * 10000) / 10000;

  const pricePerPoint = Math.round((USD_PER_POINT / SOL_USD_RATE) * LAMPORTS_PER_SOL);
  const estimatedHours = Math.round(complexity * HOURS_PER_POINT * 10) / 10;

  const breakdown = [
    `Deliverables: ${scope.deliverables.length} item(s)`,
    `Acceptance criteria: ${scope.acceptanceCriteria.length}`,
    `Assumptions: ${scope.assumptions.length}`,
    `Out-of-scope: ${scope.outOfScope.length}`,
    `Complexity: ${complexity}/10`,
    `Rate: $${USD_PER_POINT}/point (SOL @ $${SOL_USD_RATE})`,
    `Total: ${quotedSol} SOL (~$${usdTotal.toFixed(2)})`,
  ].join("\n");

  return {
    complexity,
    pricePerPoint,
    quotedLamports,
    quotedSol,
    estimatedHours,
    breakdown,
  };
}
