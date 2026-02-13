/**
 * Draft state persistence layer.
 * Stores task drafts with full state machine context.
 */

import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import type { DraftState, StateHistoryEntry } from "./schema-types";
import type { WorkflowState } from "./state-machine";
import { stateMachine } from "./state-machine";

const DATA_DIR = path.resolve(__dirname, "../../data");
const DRAFT_FILE = path.join(DATA_DIR, "drafts.json");

export class DraftStore {
  private drafts: Map<string, DraftState> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  /**
   * Load drafts from disk.
   */
  async init(): Promise<void> {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DRAFT_FILE)) {
        const raw = fs.readFileSync(DRAFT_FILE, "utf8");
        const arr: DraftState[] = JSON.parse(raw);
        for (const draft of arr) {
          this.drafts.set(draft.draft_id, draft);
        }
        console.log(`[DraftStore] Loaded ${this.drafts.size} drafts from disk.`);
      } else {
        console.log("[DraftStore] No draft file found, starting fresh.");
      }
    } catch (err) {
      console.warn("[DraftStore] Failed to load draft file:", err);
    }
  }

  /**
   * Get draft by ID.
   */
  get(id: string): DraftState | undefined {
    return this.drafts.get(id);
  }

  /**
   * Create new draft.
   */
  create(params: {
    title: string;
    brief: string;
    client_wallet: string;
    agent_pubkey: string;
    agent_name: string;
  }): DraftState {
    const id = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString(); // 7 days

    const draft: DraftState = {
      draft_id: id,
      current_state: "INIT",
      state_history: [
        {
          state: "INIT",
          entered_at: now,
          trigger: "user",
          metadata: { action: "create_draft" },
        },
      ],
      title: params.title,
      brief: params.brief,
      client_wallet: params.client_wallet,
      agent_pubkey: params.agent_pubkey,
      agent_name: params.agent_name,
      extraction_result: null,
      clarification_response: null,
      scope_structured: null,
      complexity_result: null,
      pricing_result: null,
      scope_drivers: null,
      requires_human_review: false,
      risk_flags: [],
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
    };

    this.drafts.set(id, draft);
    this.markDirty();
    return draft;
  }

  /**
   * Update draft with partial changes.
   */
  update(id: string, changes: Partial<DraftState>): DraftState {
    const draft = this.drafts.get(id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }

    const updated: DraftState = {
      ...draft,
      ...changes,
      updated_at: new Date().toISOString(),
    };

    this.drafts.set(id, updated);
    this.markDirty();
    return updated;
  }

  /**
   * Transition to a new state with validation.
   */
  transition(
    id: string,
    toState: WorkflowState,
    trigger: "auto" | "user" | "system" | "ai" | "error",
    metadata?: Record<string, any>
  ): DraftState {
    const draft = this.drafts.get(id);
    if (!draft) {
      throw new Error(`Draft not found: ${id}`);
    }

    // Validate transition
    stateMachine.validateTransition(draft.current_state, toState);

    // Add to history
    const historyEntry: StateHistoryEntry = {
      state: toState,
      entered_at: new Date().toISOString(),
      trigger,
      metadata,
    };

    const updated: DraftState = {
      ...draft,
      current_state: toState,
      state_history: [...draft.state_history, historyEntry],
      updated_at: new Date().toISOString(),
    };

    this.drafts.set(id, updated);
    this.markDirty();

    console.log(`[DraftStore] State transition: ${draft.current_state} → ${toState} (trigger: ${trigger})`);
    return updated;
  }

  /**
   * List all drafts (optionally filter by state).
   */
  list(filters?: { state?: WorkflowState; client_wallet?: string }): DraftState[] {
    let results = Array.from(this.drafts.values());

    if (filters?.state) {
      results = results.filter(d => d.current_state === filters.state);
    }

    if (filters?.client_wallet) {
      results = results.filter(d => d.client_wallet === filters.client_wallet);
    }

    // Most recent first
    results.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return results;
  }

  /**
   * Delete draft.
   */
  delete(id: string): void {
    this.drafts.delete(id);
    this.markDirty();
  }

  /**
   * Clean up expired drafts (>7 days old).
   */
  cleanupExpired(): number {
    const now = new Date();
    let deleted = 0;

    for (const [id, draft] of this.drafts.entries()) {
      if (new Date(draft.expires_at) < now) {
        this.drafts.delete(id);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[DraftStore] Cleaned up ${deleted} expired drafts`);
      this.markDirty();
    }

    return deleted;
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  private markDirty(): void {
    this.dirty = true;
    this.scheduleDiskFlush();
  }

  private scheduleDiskFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      this.flushToDisk();
    }, 1000); // 1 second debounce
  }

  private flushToDisk(): void {
    if (!this.dirty) return;

    try {
      const arr = Array.from(this.drafts.values());
      const json = JSON.stringify(arr, null, 2);
      fs.writeFileSync(DRAFT_FILE, json, "utf8");
      this.dirty = false;
      console.log(`[DraftStore] Flushed ${arr.length} drafts to disk`);
    } catch (err) {
      console.error("[DraftStore] Failed to flush to disk:", err);
    }
  }
}

export const draftStore = new DraftStore();
