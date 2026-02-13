/**
 * Deterministic complexity scoring and price computation for task workflows.
 *
 * V2 Pricing Model:
 * - Complexity score (1-10) based on concrete technical signals from extraction
 * - Fixed rate: $5 per complexity point
 * - Converted to SOL at configurable rate
 * - NO agent discretion — fully deterministic
 */

import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { TaskScope, TaskQuote } from "./workflow-types";
import type { StructuredExtraction } from "./gemini-extract";

// ─── Configuration ───────────────────────────────────────────────────────────

/** Hardcoded SOL/USD rate. Update as needed. */
export const SOL_USD_RATE = 150;

/** USD per complexity point */
export const USD_PER_POINT = 5;

/** Estimated hours per complexity point */
const HOURS_PER_POINT = 2;

// ─── Complexity Weights ──────────────────────────────────────────────────────

const WEIGHTS = {
  // Technical components (0-3 pts)
  component_base: 0.5, // per component, max 6 components counted
  
  // Integrations (0-2 pts)
  integration_base: 0.4, // per integration, max 5 counted
  
  // Data complexity (0-2 pts)
  data_simple: 0,
  data_moderate: 1,
  data_complex: 2,
  
  // UI complexity (0-2 pts)
  ui_none: 0,
  ui_basic: 1,
  ui_advanced: 2,
  
  // Custom logic (0-2 pts)
  custom_logic: 2,
  
  // Runtime multiplier (0.5x - 2x)
  runtime_minutes: 0.5,
  runtime_hours: 1.0,
  runtime_days: 1.5,
  runtime_weeks: 2.0,
};

// ─── Deterministic Complexity Scoring v2 ─────────────────────────────────────

/**
 * Compute complexity score (1-10) from structured extraction.
 * 
 * Formula:
 *   base_score = 
 *     + min(technical_components.length, 6) × 0.5     → 0-3 pts
 *     + min(integration_points.length, 5) × 0.4       → 0-2 pts
 *     + data_complexity_weight                        → 0-2 pts
 *     + ui_complexity_weight                          → 0-2 pts
 *     + (custom_logic ? 2 : 0)                        → 0-2 pts
 *   
 *   score = base_score × runtime_multiplier
 *   → clamp to 1-10
 * 
 * Examples:
 *   Simple CRUD API: 2 components + 0 integrations + simple data + no UI + no custom → 1 pt × 1.0 = 1
 *   NFT marketplace: 5 components + 2 integrations + moderate data + advanced UI + no custom → 6.8 pts × 1.0 = 7
 *   ML indexer: 4 components + 3 integrations + complex data + basic UI + custom logic → 9.2 pts × 1.5 = 10
 */
export function computeComplexityFromExtraction(extraction: StructuredExtraction): number {
  let score = 0;
  
  // Technical components (0-3)
  const componentCount = Math.min(extraction.technical_components.length, 6);
  score += componentCount * WEIGHTS.component_base;
  
  // Integration points (0-2)
  const integrationCount = Math.min(extraction.integration_points.length, 5);
  score += integrationCount * WEIGHTS.integration_base;
  
  // Data complexity (0-2)
  if (extraction.data_complexity === "simple") score += WEIGHTS.data_simple;
  else if (extraction.data_complexity === "moderate") score += WEIGHTS.data_moderate;
  else if (extraction.data_complexity === "complex") score += WEIGHTS.data_complex;
  
  // UI complexity (0-2)
  if (extraction.ui_complexity === "none") score += WEIGHTS.ui_none;
  else if (extraction.ui_complexity === "basic") score += WEIGHTS.ui_basic;
  else if (extraction.ui_complexity === "advanced") score += WEIGHTS.ui_advanced;
  
  // Custom logic (0-2)
  if (extraction.custom_logic_required) {
    score += WEIGHTS.custom_logic;
  }
  
  // Runtime multiplier
  let multiplier = 1.0;
  if (extraction.estimated_runtime_class === "minutes") multiplier = WEIGHTS.runtime_minutes;
  else if (extraction.estimated_runtime_class === "hours") multiplier = WEIGHTS.runtime_hours;
  else if (extraction.estimated_runtime_class === "days") multiplier = WEIGHTS.runtime_days;
  else if (extraction.estimated_runtime_class === "weeks") multiplier = WEIGHTS.runtime_weeks;
  
  score *= multiplier;
  
  // Clamp to 1-10, round to 1 decimal
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * LEGACY: Compute complexity from scope (fallback for old workflows).
 * Prefer computeComplexityFromExtraction for new workflows.
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
 * Generate quote from complexity score.
 * 
 * @param complexity - Complexity score (1-10)
 * @param breakdown - Human-readable breakdown of how complexity was computed
 */
export function generateQuoteFromComplexity(
  complexity: number,
  breakdown: string[]
): TaskQuote {
  const usdTotal = complexity * USD_PER_POINT;
  const solTotal = usdTotal / SOL_USD_RATE;
  const quotedLamports = Math.round(solTotal * LAMPORTS_PER_SOL);
  const quotedSol = Math.round(solTotal * 10000) / 10000;

  const pricePerPoint = Math.round((USD_PER_POINT / SOL_USD_RATE) * LAMPORTS_PER_SOL);
  const estimatedHours = Math.round(complexity * HOURS_PER_POINT * 10) / 10;

  const fullBreakdown = [
    ...breakdown,
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
    breakdown: fullBreakdown,
  };
}

/**
 * Generate quote from structured extraction (NEW PIPELINE).
 * Deterministic: extraction → complexity → price.
 */
export function generateQuoteFromExtraction(extraction: StructuredExtraction): TaskQuote {
  const complexity = computeComplexityFromExtraction(extraction);
  
  const breakdown = [
    `Technical components: ${extraction.technical_components.length} (${extraction.technical_components.slice(0, 3).join(", ")}${extraction.technical_components.length > 3 ? "..." : ""})`,
    `Integrations: ${extraction.integration_points.length}${extraction.integration_points.length > 0 ? ` (${extraction.integration_points.slice(0, 2).join(", ")})` : ""}`,
    `Data complexity: ${extraction.data_complexity}`,
    `UI complexity: ${extraction.ui_complexity}`,
    `Custom logic: ${extraction.custom_logic_required ? "yes" : "no"}`,
    `Estimated runtime: ${extraction.estimated_runtime_class}`,
  ];
  
  return generateQuoteFromComplexity(complexity, breakdown);
}

/**
 * LEGACY: Generate quote from task scope (fallback).
 * Prefer generateQuoteFromExtraction for new workflows.
 */
export function generateQuote(scope: TaskScope): TaskQuote {
  const complexity = computeComplexity(scope);

  const breakdown = [
    `Deliverables: ${scope.deliverables.length} item(s)`,
    `Acceptance criteria: ${scope.acceptanceCriteria.length}`,
    `Assumptions: ${scope.assumptions.length}`,
    `Out-of-scope: ${scope.outOfScope.length}`,
  ];

  return generateQuoteFromComplexity(complexity, breakdown);
}
