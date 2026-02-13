/**
 * JSON schema validation for all workflow stages.
 * Server-side validation to ensure data integrity.
 */

import type {
  ExtractionResult,
  ClarificationResponse,
  ScopeStructured,
  ComplexityInputs,
  ComplexityResult,
  PricingResult,
  MissingField,
} from "./schema-types";

export class SchemaValidator {
  /**
   * Validate ExtractionResult schema.
   */
  validateExtraction(data: any): ExtractionResult {
    const required = [
      "inferred_category",
      "inferred_deliverables",
      "required_missing_fields",
      "confidence_score",
    ];

    for (const field of required) {
      if (!(field in data)) {
        throw new Error(`ExtractionResult missing required field: ${field}`);
      }
    }

    if (!Array.isArray(data.inferred_deliverables)) {
      throw new Error("inferred_deliverables must be an array");
    }

    if (data.inferred_deliverables.length > 10) {
      throw new Error("inferred_deliverables limited to 10 items");
    }

    if (typeof data.confidence_score !== "number" || data.confidence_score < 0 || data.confidence_score > 1) {
      throw new Error("confidence_score must be a number between 0 and 1");
    }

    if (!Array.isArray(data.required_missing_fields)) {
      throw new Error("required_missing_fields must be an array");
    }

    // Validate each missing field
    for (const field of data.required_missing_fields) {
      this.validateMissingField(field);
    }

    return data as ExtractionResult;
  }

  /**
   * Validate MissingField schema.
   */
  private validateMissingField(field: any): void {
    const required = ["field_key", "question", "answer_type", "impact", "category"];
    for (const prop of required) {
      if (!(prop in field)) {
        throw new Error(`MissingField missing required property: ${prop}`);
      }
    }

    const validAnswerTypes = ["radio", "multiselect", "number", "file", "text"];
    if (!validAnswerTypes.includes(field.answer_type)) {
      throw new Error(`Invalid answer_type: ${field.answer_type}`);
    }

    const validImpacts = ["critical", "high", "medium", "low"];
    if (!validImpacts.includes(field.impact)) {
      throw new Error(`Invalid impact: ${field.impact}`);
    }

    const validCategories = ["technical", "business", "legal", "asset"];
    if (!validCategories.includes(field.category)) {
      throw new Error(`Invalid category: ${field.category}`);
    }

    if ((field.answer_type === "radio" || field.answer_type === "multiselect") && !Array.isArray(field.options)) {
      throw new Error(`${field.answer_type} answer_type requires options array`);
    }
  }

  /**
   * Validate ClarificationResponse schema.
   */
  validateClarification(data: any): ClarificationResponse {
    if (!data.answers || typeof data.answers !== "object") {
      throw new Error("ClarificationResponse requires answers object");
    }

    if (!Array.isArray(data.skipped_fields)) {
      data.skipped_fields = [];
    }

    if (!data.applied_defaults || typeof data.applied_defaults !== "object") {
      data.applied_defaults = {};
    }

    if (!Array.isArray(data.uploaded_assets)) {
      data.uploaded_assets = [];
    }

    if (typeof data.confidence_adjustment !== "number") {
      data.confidence_adjustment = -0.05 * data.skipped_fields.length;
    }

    return data as ClarificationResponse;
  }

  /**
   * Validate ScopeStructured schema.
   */
  validateScope(data: any): ScopeStructured {
    const required = ["objective", "deliverables", "acceptance_criteria"];

    for (const field of required) {
      if (!(field in data)) {
        throw new Error(`ScopeStructured missing required field: ${field}`);
      }
    }

    if (typeof data.objective !== "string" || data.objective.length === 0) {
      throw new Error("objective must be a non-empty string");
    }

    if (data.objective.length > 200) {
      throw new Error("objective must be 200 characters or less");
    }

    if (!Array.isArray(data.deliverables) || data.deliverables.length === 0) {
      throw new Error("deliverables must be a non-empty array");
    }

    if (!Array.isArray(data.acceptance_criteria) || data.acceptance_criteria.length === 0) {
      throw new Error("acceptance_criteria must be a non-empty array");
    }

    // Validate deliverables
    for (const deliverable of data.deliverables) {
      if (!deliverable.deliverable_id || !deliverable.name || !deliverable.category) {
        throw new Error("Deliverable missing required fields");
      }

      const validCategories = ["code", "design", "documentation", "infrastructure", "audit"];
      if (!validCategories.includes(deliverable.category)) {
        throw new Error(`Invalid deliverable category: ${deliverable.category}`);
      }

      if (typeof deliverable.estimated_hours !== "number" || deliverable.estimated_hours <= 0) {
        throw new Error("Deliverable estimated_hours must be a positive number");
      }
    }

    // Validate acceptance criteria
    for (const criterion of data.acceptance_criteria) {
      if (!criterion.criterion_id || !criterion.description || !criterion.verification_method) {
        throw new Error("AcceptanceCriterion missing required fields");
      }

      const validMethods = ["automated_test", "manual_review", "client_approval", "metric_threshold"];
      if (!validMethods.includes(criterion.verification_method)) {
        throw new Error(`Invalid verification_method: ${criterion.verification_method}`);
      }

      if (typeof criterion.blocking !== "boolean") {
        criterion.blocking = true; // Default to blocking
      }
    }

    return data as ScopeStructured;
  }

  /**
   * Validate ComplexityInputs schema.
   */
  validateComplexityInputs(data: any): ComplexityInputs {
    const requiredNumbers = [
      "feature_count",
      "integration_count",
      "user_roles",
      "asset_missing_count",
      "total_deliverables",
      "total_estimated_hours",
      "confidence_score",
    ];

    for (const field of requiredNumbers) {
      if (typeof data[field] !== "number" || data[field] < 0) {
        throw new Error(`${field} must be a non-negative number`);
      }
    }

    const validSecurityLevels = ["none", "basic", "advanced", "critical"];
    if (!validSecurityLevels.includes(data.security_level)) {
      throw new Error(`Invalid security_level: ${data.security_level}`);
    }

    const validDeadlinePressure = ["low", "medium", "high"];
    if (!validDeadlinePressure.includes(data.deadline_pressure)) {
      throw new Error(`Invalid deadline_pressure: ${data.deadline_pressure}`);
    }

    if (!Array.isArray(data.compliance_flags)) {
      data.compliance_flags = [];
    }

    if (!Array.isArray(data.custom_logic_flags)) {
      data.custom_logic_flags = [];
    }

    return data as ComplexityInputs;
  }

  /**
   * Validate ComplexityResult schema.
   */
  validateComplexityResult(data: any): ComplexityResult {
    if (typeof data.complexity_score !== "number" || data.complexity_score < 0 || data.complexity_score > 100) {
      throw new Error("complexity_score must be a number between 0 and 100");
    }

    if (!data.complexity_breakdown || typeof data.complexity_breakdown !== "object") {
      throw new Error("complexity_breakdown is required");
    }

    const requiredBreakdown = [
      "feature_score",
      "integration_score",
      "security_score",
      "compliance_score",
      "custom_logic_score",
      "timeline_pressure_score",
      "uncertainty_penalty",
    ];

    for (const field of requiredBreakdown) {
      if (typeof data.complexity_breakdown[field] !== "number") {
        throw new Error(`complexity_breakdown.${field} must be a number`);
      }
    }

    if (!data.model_version || !data.explanation) {
      throw new Error("model_version and explanation are required");
    }

    return data as ComplexityResult;
  }

  /**
   * Validate PricingResult schema.
   */
  validatePricingResult(data: any): PricingResult {
    const requiredNumbers = [
      "labour_cost_lamports",
      "contingency_lamports",
      "fixed_fees_lamports",
      "discount_lamports",
      "total_lamports",
      "total_sol",
      "total_usd",
    ];

    for (const field of requiredNumbers) {
      if (typeof data[field] !== "number" || data[field] < 0) {
        throw new Error(`${field} must be a non-negative number`);
      }
    }

    if (!data.breakdown || typeof data.breakdown !== "object") {
      throw new Error("breakdown is required");
    }

    const requiredBreakdown = [
      "base_rate_sol_per_hour",
      "estimated_hours",
      "complexity_multiplier",
      "contingency_percent",
      "fixed_fee_sol",
    ];

    for (const field of requiredBreakdown) {
      if (typeof data.breakdown[field] !== "number") {
        throw new Error(`breakdown.${field} must be a number`);
      }
    }

    if (!data.valid_until || !data.pricing_config_version || !data.computed_at) {
      throw new Error("valid_until, pricing_config_version, and computed_at are required");
    }

    return data as PricingResult;
  }
}

export const validator = new SchemaValidator();
