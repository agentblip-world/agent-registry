/**
 * State machine for task creation flow.
 * Enforces valid state transitions and provides next_action metadata.
 */

export type WorkflowState =
  | "INIT"
  | "ANALYZING"
  | "CLARIFY_PENDING"
  | "CLARIFY_COMPLETE"
  | "SCOPE_DRAFT"
  | "SCOPE_READY"
  | "COMPLEXITY_CALC"
  | "QUOTE_READY"
  | "QUOTE_EDITING"
  | "CONFIRMED"
  | "FUNDED"
  | "CANCELLED";

export interface StateTransition {
  from: WorkflowState;
  to: WorkflowState;
  trigger: "auto" | "user" | "system" | "ai" | "error";
  metadata?: Record<string, any>;
}

export class TaskStateMachine {
  private validTransitions: Map<WorkflowState, WorkflowState[]> = new Map([
    ["INIT", ["ANALYZING", "CANCELLED"]],
    ["ANALYZING", ["CLARIFY_PENDING", "SCOPE_DRAFT", "INIT", "CANCELLED"]],
    ["CLARIFY_PENDING", ["CLARIFY_COMPLETE", "CANCELLED"]],
    ["CLARIFY_COMPLETE", ["SCOPE_DRAFT", "CANCELLED"]],
    ["SCOPE_DRAFT", ["SCOPE_READY", "CLARIFY_PENDING", "CANCELLED"]],
    ["SCOPE_READY", ["COMPLEXITY_CALC", "CLARIFY_PENDING", "CANCELLED"]],
    ["COMPLEXITY_CALC", ["QUOTE_READY", "CANCELLED"]],
    ["QUOTE_READY", ["QUOTE_EDITING", "CONFIRMED", "CANCELLED"]],
    ["QUOTE_EDITING", ["COMPLEXITY_CALC", "SCOPE_READY", "CANCELLED"]],
    ["CONFIRMED", ["FUNDED", "CANCELLED"]],
    ["FUNDED", []],
    ["CANCELLED", []],
  ]);

  /**
   * Check if transition is valid.
   */
  canTransition(from: WorkflowState, to: WorkflowState): boolean {
    const allowed = this.validTransitions.get(from) || [];
    return allowed.includes(to);
  }

  /**
   * Validate transition or throw error.
   */
  validateTransition(from: WorkflowState, to: WorkflowState): void {
    if (!this.canTransition(from, to)) {
      const allowed = this.validTransitions.get(from) || [];
      throw new Error(
        `Invalid state transition: ${from} → ${to}. Allowed transitions from ${from}: ${allowed.join(", ")}`
      );
    }
  }

  /**
   * Get available actions for a given state.
   */
  getNextActions(state: WorkflowState): string[] {
    switch (state) {
      case "INIT":
        return ["analyze"];
      case "ANALYZING":
        return ["wait"]; // Auto-transitions
      case "CLARIFY_PENDING":
        return ["submit_answers", "skip_clarification"];
      case "CLARIFY_COMPLETE":
        return ["generate_scope"];
      case "SCOPE_DRAFT":
        return ["wait"]; // Auto-transitions
      case "SCOPE_READY":
        return ["approve_scope", "request_more_clarity"];
      case "COMPLEXITY_CALC":
        return ["wait"]; // Auto-transitions
      case "QUOTE_READY":
        return ["accept_quote", "edit_scope"];
      case "QUOTE_EDITING":
        return ["requote", "revert_to_scope"];
      case "CONFIRMED":
        return ["fund_escrow"];
      case "FUNDED":
        return ["view_task"];
      case "CANCELLED":
        return [];
      default:
        return [];
    }
  }

  /**
   * Get human-readable state description.
   */
  getStateDescription(state: WorkflowState): string {
    const descriptions: Record<WorkflowState, string> = {
      INIT: "Task created, ready for analysis",
      ANALYZING: "AI analyzing task requirements",
      CLARIFY_PENDING: "Waiting for user clarification",
      CLARIFY_COMPLETE: "Clarifications submitted",
      SCOPE_DRAFT: "Generating detailed scope",
      SCOPE_READY: "Scope ready for review",
      COMPLEXITY_CALC: "Calculating complexity and pricing",
      QUOTE_READY: "Quote ready for acceptance",
      QUOTE_EDITING: "User editing scope parameters",
      CONFIRMED: "Quote accepted, awaiting payment",
      FUNDED: "Task funded and active",
      CANCELLED: "Task cancelled",
    };
    return descriptions[state] || "Unknown state";
  }

  /**
   * Check if state is a terminal state (no further transitions).
   */
  isTerminal(state: WorkflowState): boolean {
    return state === "FUNDED" || state === "CANCELLED";
  }

  /**
   * Check if state is a waiting state (user cannot take action).
   */
  isWaiting(state: WorkflowState): boolean {
    return state === "ANALYZING" || state === "SCOPE_DRAFT" || state === "COMPLEXITY_CALC";
  }
}

export const stateMachine = new TaskStateMachine();
