/**
 * Risk detection for compliance and legal issues.
 * Flags tasks that require human review.
 */

import type { ScopeStructured, ClarificationResponse } from "./schema-types";

export interface RiskAssessment {
  requires_human_review: boolean;
  risk_flags: string[];
  risk_explanations: string[];
}

export class RiskDetector {
  /**
   * Detect compliance and legal risks from scope + clarifications.
   */
  detectRisks(scope: ScopeStructured, clarification: ClarificationResponse): RiskAssessment {
    const risks: string[] = [];
    const explanations: string[] = [];

    const scopeText = (
      scope.objective +
      " " +
      scope.deliverables.map(d => d.name + " " + d.description).join(" ") +
      " " +
      scope.assumptions.join(" ")
    ).toLowerCase();

    const clarificationText = JSON.stringify(clarification.answers).toLowerCase();
    const combinedText = scopeText + " " + clarificationText;

    // ─── Crypto/Financial Promotion in Regulated Regions ────────────────────

    const hasCrypto =
      combinedText.includes("crypto") ||
      combinedText.includes("token") ||
      combinedText.includes("nft") ||
      combinedText.includes("defi") ||
      combinedText.includes("blockchain");

    const hasRegulatedRegion =
      combinedText.includes("uk") ||
      combinedText.includes("united kingdom") ||
      combinedText.includes("eu") ||
      combinedText.includes("europe") ||
      combinedText.includes("european");

    if (hasCrypto && hasRegulatedRegion) {
      risks.push("crypto_promotion_regulated_region");
      explanations.push(
        "Crypto-related content in UK/EU may require FCA approval and compliance warnings"
      );
    }

    // ─── Health Data (HIPAA) ─────────────────────────────────────────────────

    const hasHealthData =
      combinedText.includes("health") ||
      combinedText.includes("medical") ||
      combinedText.includes("patient") ||
      combinedText.includes("hipaa") ||
      combinedText.includes("healthcare");

    if (hasHealthData) {
      risks.push("health_data_hipaa");
      explanations.push(
        "Health data processing may require HIPAA compliance, BAA, and security controls"
      );
    }

    // ─── Financial Data (PCI) ────────────────────────────────────────────────

    const hasFinancialData =
      combinedText.includes("payment") ||
      combinedText.includes("credit card") ||
      combinedText.includes("banking") ||
      combinedText.includes("pci");

    if (hasFinancialData) {
      risks.push("financial_data_pci");
      explanations.push(
        "Payment card data requires PCI-DSS compliance and secure processing"
      );
    }

    // ─── Adult Content ───────────────────────────────────────────────────────

    const hasAdultContent =
      combinedText.includes("adult") ||
      combinedText.includes("nsfw") ||
      combinedText.includes("18+") ||
      combinedText.includes("mature content");

    if (hasAdultContent) {
      risks.push("adult_content");
      explanations.push("Adult content requires age verification and content warnings");
    }

    // ─── Gambling ─────────────────────────────────────────────────────────────

    const hasGambling =
      combinedText.includes("gambling") ||
      combinedText.includes("betting") ||
      combinedText.includes("casino") ||
      combinedText.includes("wagering");

    if (hasGambling) {
      risks.push("gambling_content");
      explanations.push("Gambling services require gaming licenses and regulatory compliance");
    }

    // ─── Personal Data (GDPR) ────────────────────────────────────────────────

    const hasPersonalData =
      combinedText.includes("personal data") ||
      combinedText.includes("user data") ||
      combinedText.includes("gdpr");

    if (hasPersonalData && hasRegulatedRegion) {
      risks.push("gdpr_personal_data");
      explanations.push("EU personal data processing requires GDPR compliance and DPA");
    }

    // ─── AI/ML Regulations ───────────────────────────────────────────────────

    const hasAI =
      combinedText.includes("machine learning") ||
      combinedText.includes("artificial intelligence") ||
      combinedText.includes("ai model");

    if (hasAI && hasRegulatedRegion) {
      risks.push("ai_regulation_eu");
      explanations.push("AI systems in EU may be subject to the EU AI Act classification");
    }

    // ─── Determine if human review required ─────────────────────────────────

    const criticalRisks = [
      "crypto_promotion_regulated_region",
      "health_data_hipaa",
      "financial_data_pci",
      "gambling_content",
    ];

    const requiresReview = risks.some(r => criticalRisks.includes(r));

    return {
      requires_human_review: requiresReview,
      risk_flags: risks,
      risk_explanations: explanations,
    };
  }

  /**
   * Get human-readable risk summary.
   */
  getRiskSummary(assessment: RiskAssessment): string {
    if (assessment.risk_flags.length === 0) {
      return "No significant compliance risks detected.";
    }

    let summary = `${assessment.risk_flags.length} risk(s) detected:\n`;
    summary += assessment.risk_explanations.map((exp, i) => `${i + 1}. ${exp}`).join("\n");

    if (assessment.requires_human_review) {
      summary += "\n\n⚠️ This task requires manual review before proceeding.";
    }

    return summary;
  }
}

export const riskDetector = new RiskDetector();
