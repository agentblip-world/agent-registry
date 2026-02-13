/**
 * Complexity calculation engine V2.
 * Maps scope to complexity score (0-100) based on weighted factors.
 */

import type {
  ComplexityInputs,
  ComplexityResult,
  ScopeStructured,
  ClarificationResponse,
} from "./schema-types";
import { validator } from "./schema-validators";

export class ComplexityCalculator {
  /**
   * Calculate complexity score from inputs.
   */
  calculateComplexity(inputs: ComplexityInputs): ComplexityResult {
    // Validate inputs
    validator.validateComplexityInputs(inputs);

    const scores = {
      feature_score: this.scoreFeatures(inputs.feature_count),
      integration_score: this.scoreIntegrations(inputs.integration_count),
      security_score: this.scoreSecurity(inputs.security_level),
      compliance_score: this.scoreCompliance(inputs.compliance_flags),
      custom_logic_score: this.scoreCustomLogic(inputs.custom_logic_flags),
      timeline_pressure_score: this.scoreDeadlinePressure(inputs.deadline_pressure),
      uncertainty_penalty: this.scoreUncertainty(
        inputs.asset_missing_count,
        inputs.confidence_score
      ),
    };

    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const complexity_score = Math.max(0, Math.min(100, Math.round(total * 10) / 10));

    const result: ComplexityResult = {
      complexity_score,
      complexity_breakdown: scores,
      model_version: "v2.0",
      explanation: this.generateExplanation(scores, complexity_score),
      computed_at: new Date().toISOString(),
    };

    validator.validateComplexityResult(result);
    return result;
  }

  /**
   * Map scope + clarification to complexity inputs.
   */
  scopeToComplexityInputs(
    scope: ScopeStructured,
    clarification: ClarificationResponse
  ): ComplexityInputs {
    return {
      feature_count: scope.deliverables.filter(d => d.category === "code").length,
      integration_count: this.countIntegrations(scope, clarification),
      user_roles: this.inferUserRoles(scope, clarification),
      security_level: this.inferSecurityLevel(scope, clarification),
      compliance_flags: this.extractComplianceFlags(scope, clarification),
      custom_logic_flags: this.extractCustomLogicFlags(scope),
      asset_missing_count: clarification.skipped_fields.length,
      deadline_pressure: this.inferDeadlinePressure(scope),
      total_deliverables: scope.deliverables.length,
      total_estimated_hours: scope.estimated_hours_by_phase.reduce(
        (sum, p) => sum + p.estimated_hours,
        0
      ),
      confidence_score: scope.confidence_score,
      complexity_model_version: "v2.0",
    };
  }

  // ─── Scoring Functions ──────────────────────────────────────────────────────

  private scoreFeatures(count: number): number {
    // 0-25 points: 0-5 features = linear, 6+ = logarithmic
    if (count === 0) return 0;
    if (count <= 5) return count * 5;
    return 25 + Math.log10(count - 4) * 10;
  }

  private scoreIntegrations(count: number): number {
    // 0-20 points: each integration adds complexity
    return Math.min(20, count * 4);
  }

  private scoreSecurity(level: string): number {
    // 0-15 points
    const map: Record<string, number> = {
      none: 0,
      basic: 5,
      advanced: 10,
      critical: 15,
    };
    return map[level] || 0;
  }

  private scoreCompliance(flags: string[]): number {
    // 0-15 points: GDPR=5, HIPAA=8, SOC2=7, PCI=8
    const weights: Record<string, number> = {
      GDPR: 5,
      HIPAA: 8,
      SOC2: 7,
      PCI: 8,
    };
    const total = flags.reduce((sum, flag) => sum + (weights[flag] || 3), 0);
    return Math.min(15, total);
  }

  private scoreCustomLogic(flags: string[]): number {
    // 0-15 points: ML=10, blockchain=8, realtime=5, crypto=8
    const weights: Record<string, number> = {
      ML: 10,
      blockchain: 8,
      realtime: 5,
      crypto: 8,
      "custom-algorithm": 7,
    };
    const total = flags.reduce((sum, flag) => sum + (weights[flag] || 3), 0);
    return Math.min(15, total);
  }

  private scoreDeadlinePressure(pressure: string): number {
    // 0-10 points
    const map: Record<string, number> = {
      low: 0,
      medium: 5,
      high: 10,
    };
    return map[pressure] || 0;
  }

  private scoreUncertainty(assetMissing: number, confidence: number): number {
    // 0-10 points (penalty)
    const assetPenalty = Math.min(5, assetMissing * 1.5);
    const confidencePenalty = (1 - confidence) * 5;
    return Math.round((assetPenalty + confidencePenalty) * 10) / 10;
  }

  // ─── Inference Functions ────────────────────────────────────────────────────

  private countIntegrations(scope: ScopeStructured, clarification: ClarificationResponse): number {
    // Count from dependencies + clarification answers
    let count = scope.dependencies.filter(
      d => d.toLowerCase().includes("api") || d.toLowerCase().includes("integration")
    ).length;

    const integrationAnswer = clarification.answers["integration_count"];
    if (typeof integrationAnswer === "number") {
      count = Math.max(count, integrationAnswer);
    }

    return count;
  }

  private inferUserRoles(scope: ScopeStructured, clarification: ClarificationResponse): number {
    // Parse from clarification or scope
    const answer = clarification.answers["user_roles"];
    if (typeof answer === "number") return answer;
    if (Array.isArray(answer)) return answer.length;

    // Infer from scope text
    const text = scope.objective.toLowerCase() + " " + scope.deliverables.map(d => d.description).join(" ").toLowerCase();
    if (text.includes("admin") && text.includes("user")) return 2;
    if (text.includes("multi-role") || text.includes("permissions")) return 3;
    return 1; // Default
  }

  private inferSecurityLevel(scope: ScopeStructured, clarification: ClarificationResponse): "none" | "basic" | "advanced" | "critical" {
    const text = (
      scope.objective +
      " " +
      scope.deliverables.map(d => d.description).join(" ")
    ).toLowerCase();

    if (
      text.includes("critical") ||
      text.includes("finance") ||
      text.includes("health") ||
      text.includes("banking")
    ) {
      return "critical";
    }

    if (
      text.includes("authentication") ||
      text.includes("encryption") ||
      text.includes("security audit")
    ) {
      return "advanced";
    }

    if (
      text.includes("login") ||
      text.includes("password") ||
      text.includes("user auth")
    ) {
      return "basic";
    }

    return "none";
  }

  private extractComplianceFlags(scope: ScopeStructured, clarification: ClarificationResponse): string[] {
    const flags: string[] = [];
    const text = (
      scope.objective +
      " " +
      scope.assumptions.join(" ") +
      " " +
      JSON.stringify(clarification.answers)
    ).toLowerCase();

    if (text.includes("gdpr") || text.includes("eu data") || text.includes("european")) {
      flags.push("GDPR");
    }

    if (text.includes("hipaa") || text.includes("health data") || text.includes("medical")) {
      flags.push("HIPAA");
    }

    if (text.includes("soc2") || text.includes("enterprise security")) {
      flags.push("SOC2");
    }

    if (text.includes("pci") || text.includes("payment card") || text.includes("credit card")) {
      flags.push("PCI");
    }

    return flags;
  }

  private extractCustomLogicFlags(scope: ScopeStructured): string[] {
    const flags: string[] = [];
    const text = scope.deliverables.map(d => d.description).join(" ").toLowerCase();

    if (text.includes("machine learning") || text.includes("ml model") || text.includes("ai")) {
      flags.push("ML");
    }

    if (text.includes("blockchain") || text.includes("smart contract") || text.includes("web3")) {
      flags.push("blockchain");
    }

    if (text.includes("realtime") || text.includes("websocket") || text.includes("streaming") || text.includes("live")) {
      flags.push("realtime");
    }

    if (text.includes("crypto") || text.includes("encryption algorithm") || text.includes("cryptography")) {
      flags.push("crypto");
    }

    if (text.includes("custom algorithm") || text.includes("proprietary logic")) {
      flags.push("custom-algorithm");
    }

    return flags;
  }

  private inferDeadlinePressure(scope: ScopeStructured): "low" | "medium" | "high" {
    const hoursPerDay = 8;
    const totalHours = scope.estimated_hours_by_phase.reduce(
      (sum, p) => sum + p.estimated_hours,
      0
    );
    const requiredDays = totalHours / hoursPerDay;
    const timelineDays = scope.timeline_estimate_days;

    if (timelineDays < requiredDays * 0.7) return "high";
    if (timelineDays < requiredDays * 1.2) return "medium";
    return "low";
  }

  // ─── Explanation ────────────────────────────────────────────────────────────

  private generateExplanation(scores: any, total: number): string {
    const lines: string[] = [];

    if (scores.feature_score > 15) {
      lines.push(`High feature count (+${scores.feature_score} pts)`);
    }

    if (scores.integration_score > 10) {
      lines.push(`Multiple integrations (+${scores.integration_score} pts)`);
    }

    if (scores.security_score > 5) {
      lines.push(`Advanced security required (+${scores.security_score} pts)`);
    }

    if (scores.compliance_score > 0) {
      lines.push(`Compliance requirements (+${scores.compliance_score} pts)`);
    }

    if (scores.custom_logic_score > 0) {
      lines.push(`Custom logic needed (+${scores.custom_logic_score} pts)`);
    }

    if (scores.timeline_pressure_score > 5) {
      lines.push(`Tight deadline (+${scores.timeline_pressure_score} pts)`);
    }

    if (scores.uncertainty_penalty > 3) {
      lines.push(`Uncertainty penalty (+${scores.uncertainty_penalty} pts)`);
    }

    if (lines.length === 0) {
      return `Low complexity project (${total}/100)`;
    }

    return lines.join("; ") + ` → Total: ${total}/100`;
  }
}

export const complexityCalculator = new ComplexityCalculator();
