/**
 * Pricing calculation engine.
 * Transparent, traceable pricing from complexity score.
 */

import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { ComplexityResult, ScopeStructured, PricingResult } from "./schema-types";
import { validator } from "./schema-validators";

export class PricingEngine {
  private SOL_USD_RATE = 150; // Update periodically
  private PLATFORM_FEE_PERCENT = 0.05; // 5%

  /**
   * Calculate price from complexity + scope + agent base rate.
   */
  calculatePrice(
    complexity: ComplexityResult,
    scope: ScopeStructured,
    agentBaseRateLamports: number
  ): PricingResult {
    const estimatedHours = scope.estimated_hours_by_phase.reduce(
      (sum, p) => sum + p.estimated_hours,
      0
    );

    const baseRateSolPerHour = agentBaseRateLamports / LAMPORTS_PER_SOL;

    // Complexity multiplier: 0.8 - 2.0
    // Formula: 0.8 + (complexity_score / 100) * 1.2
    const complexityMultiplier = 0.8 + (complexity.complexity_score / 100) * 1.2;

    // Labour cost
    const labourCostSol = estimatedHours * baseRateSolPerHour * complexityMultiplier;
    const labourCostLamports = Math.round(labourCostSol * LAMPORTS_PER_SOL);

    // Contingency (based on confidence: low confidence = higher contingency)
    // Formula: max(5%, (1 - confidence) * 30%)
    const contingencyPercent = Math.max(0.05, (1 - scope.confidence_score) * 0.3);
    const contingencyLamports = Math.round(labourCostLamports * contingencyPercent);

    // Fixed fees (platform fee)
    const fixedFeesLamports = Math.round(
      (labourCostLamports + contingencyLamports) * this.PLATFORM_FEE_PERCENT
    );

    // Discount (TODO: promo codes, bulk discounts)
    const discountLamports = 0;

    // Total
    const totalLamports = labourCostLamports + contingencyLamports + fixedFeesLamports - discountLamports;
    const totalSol = totalLamports / LAMPORTS_PER_SOL;
    const totalUsd = totalSol * this.SOL_USD_RATE;

    const result: PricingResult = {
      labour_cost_lamports: labourCostLamports,
      contingency_lamports: contingencyLamports,
      fixed_fees_lamports: fixedFeesLamports,
      discount_lamports: discountLamports,
      total_lamports: totalLamports,
      total_sol: Math.round(totalSol * 10000) / 10000,
      total_usd: Math.round(totalUsd * 100) / 100,
      breakdown: {
        base_rate_sol_per_hour: Math.round(baseRateSolPerHour * 100000) / 100000,
        estimated_hours: estimatedHours,
        complexity_multiplier: Math.round(complexityMultiplier * 100) / 100,
        contingency_percent: Math.round(contingencyPercent * 100),
        fixed_fee_sol: Math.round((fixedFeesLamports / LAMPORTS_PER_SOL) * 10000) / 10000,
      },
      valid_until: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(), // 7 days
      pricing_config_version: "v2.0",
      computed_at: new Date().toISOString(),
    };

    validator.validatePricingResult(result);
    return result;
  }

  /**
   * Generate human-readable pricing breakdown text.
   */
  generateBreakdownText(pricing: PricingResult): string {
    const lines = [
      `Base Rate: ${pricing.breakdown.base_rate_sol_per_hour} SOL/hour`,
      `Estimated Hours: ${pricing.breakdown.estimated_hours}h`,
      `Complexity Multiplier: ${pricing.breakdown.complexity_multiplier}x`,
      `Labour Cost: ${(pricing.labour_cost_lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
      `Contingency (${pricing.breakdown.contingency_percent}%): ${(pricing.contingency_lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
      `Platform Fee (${Math.round(this.PLATFORM_FEE_PERCENT * 100)}%): ${pricing.breakdown.fixed_fee_sol} SOL`,
    ];

    if (pricing.discount_lamports > 0) {
      lines.push(`Discount: -${(pricing.discount_lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    }

    lines.push(`Total: ${pricing.total_sol} SOL (~$${pricing.total_usd})`);

    return lines.join("\n");
  }

  /**
   * Recalculate pricing after scope driver changes (requote).
   */
  requote(
    currentPricing: PricingResult,
    currentScope: ScopeStructured,
    currentComplexity: ComplexityResult,
    newDrivers: any, // ScopeDrivers
    agentBaseRateLamports: number
  ): { pricing: PricingResult; complexity: ComplexityResult } {
    // Adjust scope based on drivers
    const adjustedScope = { ...currentScope };

    if (newDrivers.estimated_hours) {
      // Recalculate phases proportionally
      const ratio = newDrivers.estimated_hours / currentScope.estimated_hours_by_phase.reduce((sum, p) => sum + p.estimated_hours, 0);
      adjustedScope.estimated_hours_by_phase = currentScope.estimated_hours_by_phase.map(p => ({
        ...p,
        estimated_hours: Math.round(p.estimated_hours * ratio),
      }));
      adjustedScope.timeline_estimate_days = Math.ceil((newDrivers.estimated_hours / 8) * 10) / 10;
    }

    // Adjust complexity based on urgency
    let adjustedComplexityScore = currentComplexity.complexity_score;
    if (newDrivers.urgency_level === "urgent") {
      adjustedComplexityScore = Math.min(100, adjustedComplexityScore + 10);
    } else if (newDrivers.urgency_level === "priority") {
      adjustedComplexityScore = Math.min(100, adjustedComplexityScore + 5);
    }

    const adjustedComplexity: ComplexityResult = {
      ...currentComplexity,
      complexity_score: adjustedComplexityScore,
      explanation: `${currentComplexity.explanation} (adjusted for ${newDrivers.urgency_level || "standard"} urgency)`,
      computed_at: new Date().toISOString(),
    };

    // Recalculate pricing
    const newPricing = this.calculatePrice(adjustedComplexity, adjustedScope, agentBaseRateLamports);

    return { pricing: newPricing, complexity: adjustedComplexity };
  }
}

export const pricingEngine = new PricingEngine();
