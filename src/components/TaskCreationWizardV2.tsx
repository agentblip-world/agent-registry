/**
 * V2 Task Creation Wizard - State Machine Flow
 * Uses deterministic pricing pipeline with AI-assisted scope generation.
 */

import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import type { AgentProfile } from "../lib/api";
import { useCreateTask } from "../hooks/useRegistry";
import { lamportsToSol, truncatePubkey, getTaskEscrowPDA } from "../lib/program";
import { WizardStepRail } from "./WizardStepRail";
import {
  createDraft,
  analyzeDraft,
  submitClarifications,
  generateScope,
  approveScope,
  confirmQuote,
  cancelDraft,
  type DraftState,
  type WorkflowState,
  type MissingField,
} from "../lib/draft-api";

const WIZARD_STEPS = [
  { label: "Describe Task", key: "describe" },
  { label: "Clarify", key: "clarify" },
  { label: "Review Scope", key: "scope" },
  { label: "Quote", key: "quote" },
  { label: "Payment", key: "payment" },
  { label: "Done", key: "done" },
];

interface TaskCreationWizardV2Props {
  agent: AgentProfile;
  onClose: () => void;
  onViewTask: (draftId: string) => void;
}

export function TaskCreationWizardV2({ agent, onClose, onViewTask }: TaskCreationWizardV2Props) {
  const { connected, publicKey } = useWallet();
  const overlayRef = useRef<HTMLDivElement>(null);
  const { loading: txLoading, error: txError, execute: executeCreateTask, reset: resetTx } = useCreateTask();

  const [currentStep, setCurrentStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft state
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [currentState, setCurrentState] = useState<WorkflowState>("INIT");

  // Step 0: Describe Task
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");

  // Step 1: Clarify (conditional)
  const [questions, setQuestions] = useState<MissingField[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // ─── Step Handlers ──────────────────────────────────────────────────────────

  async function handleCreateDraft() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);

    try {
      // 1. Create draft (INIT)
      const { draft: newDraft } = await createDraft({
        clientWallet: publicKey.toBase58(),
        agentPubkey: agent.publicKey,
        agentName: agent.name,
        title: title.trim(),
        brief: brief.trim(),
      });

      setDraft(newDraft);
      setCurrentState(newDraft.current_state);

      // 2. Auto-analyze (INIT → ANALYZING → ...)
      try {
        const analysisResult = await analyzeDraft(newDraft.draft_id, title.trim(), brief.trim());
        setDraft(analysisResult.draft);
        setCurrentState(analysisResult.draft.current_state);

        if (analysisResult.questions && analysisResult.questions.length > 0) {
          // Has questions → show clarification step
          setQuestions(analysisResult.questions);
          setCurrentStep(1);
        } else {
          // No questions → auto-generate scope
          await handleGenerateScope(analysisResult.draft.draft_id);
        }
      } catch (apiError: any) {
        // API not available - skip to simple quote
        console.warn('AI analysis not available, using simple flow:', apiError);
        // Skip directly to payment with basic quote
        setCurrentStep(4);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create task");
    } finally {
      setBusy(false);
    }
  }

  async function handleClarify(skipAll: boolean = false) {
    if (!draft) return;
    setBusy(true);
    setError(null);

    try {
      const skippedKeys = skipAll
        ? questions.map(q => q.field_key)
        : questions.filter(q => !answers[q.field_key]).map(q => q.field_key);

      // Filter out internal budget keys from answers
      const cleanAnswers: Record<string, any> = {};
      for (const [key, val] of Object.entries(answers)) {
        if (!key.startsWith('_budget')) cleanAnswers[key] = val;
      }

      const budgetSol = parseFloat(answers["_budget_sol"]) || 0;
      const budgetUsd = parseFloat(answers["_budget_usd"]) || 0;
      const budget = budgetSol > 0 ? { amount: budgetSol, usd: budgetUsd } : null;

      // Call clarify endpoint which generates scope + quote
      const res = await fetch('/api/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: cleanAnswers,
          skipped: skippedKeys,
          title: draft.title,
          brief: draft.brief,
          extraction: draft.extraction_result,
          budget,
        }),
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType?.includes("text/html")) throw new Error("API not available");
        const err = await res.json();
        throw new Error(err.error || "Failed to generate scope");
      }

      const result = await res.json();
      setDraft((prev: any) => ({
        ...prev,
        current_state: 'QUOTE_READY',
        scope_structured: result.scope,
        pricing_result: result.quote,
      }));
      setCurrentState('QUOTE_READY');
      setCurrentStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to submit clarifications");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateScope(draftId: string) {
    setBusy(true);
    setError(null);

    try {
      const result = await generateScope(draftId);
      setDraft(result.draft);
      setCurrentState(result.draft.current_state);

      // Show risk warnings if needed
      if (result.risk_assessment.requires_human_review) {
        console.warn("Task requires human review:", result.risk_assessment.risk_flags);
      }

      setCurrentStep(2); // Review scope
    } catch (err: any) {
      setError(err.message || "Scope generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveScope() {
    if (!draft) return;
    setBusy(true);
    setError(null);

    try {
      const result = await approveScope(draft.draft_id, agent.pricingLamports);
      setDraft(result.draft);
      setCurrentState(result.draft.current_state);
      setCurrentStep(3); // Quote step
    } catch (err: any) {
      setError(err.message || "Failed to approve scope");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmQuote() {
    if (!draft) return;
    setBusy(true);
    setError(null);

    try {
      const result = await confirmQuote(draft.draft_id);
      setDraft(result.draft);
      setCurrentState(result.draft.current_state);
      setCurrentStep(4); // Payment step
    } catch (err: any) {
      setError(err.message || "Failed to confirm quote");
    } finally {
      setBusy(false);
    }
  }

  async function handleFund() {
    if (!draft?.pricing_result || !publicKey) return;
    setError(null);
    resetTx();

    try {
      const agentProfilePubkey = new PublicKey(agent.publicKey);
      const sig = await executeCreateTask({
        taskId: draft.draft_id, // Using draft_id as taskId
        amountLamports: draft.pricing_result.total_lamports,
        agentProfilePubkey,
      });

      if (sig) {
        setCurrentStep(5); // Done
      }
    } catch (err: any) {
      setError(err.message || "Funding failed");
    }
  }

  async function handleCancel() {
    if (!draft) {
      onClose();
      return;
    }

    setBusy(true);
    try {
      await cancelDraft(draft.draft_id);
      onClose();
    } catch {
      // Ignore cancellation errors
      onClose();
    } finally {
      setBusy(false);
    }
  }

  // ─── Render Helpers ─────────────────────────────────────────────────────────

  function AgentSummary() {
    return (
      <div className="p-4 bg-gray-800/30 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">
              {agent.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-50 truncate">{agent.name}</h3>
            <p className="text-[10px] text-gray-500 font-mono">{truncatePubkey(agent.publicKey, 6)}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold text-gray-50">{lamportsToSol(agent.pricingLamports)} SOL</div>
            <p className="text-[10px] text-gray-500">base rate</p>
          </div>
        </div>
      </div>
    );
  }

  function ErrorBar({ msg }: { msg: string }) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mx-5 mb-3">
        <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p className="text-red-400 text-xs">{msg}</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="glass-card max-w-xl w-full p-0 overflow-hidden animate-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800/50 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-50">Create Task (V2)</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step Rail */}
        <div className="flex-shrink-0 border-b border-gray-800/50">
          <WizardStepRail steps={WIZARD_STEPS} currentStep={currentStep} />
        </div>

        {/* Agent Card */}
        {currentStep < 5 && <AgentSummary />}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Error */}
          {(error || txError) && <ErrorBar msg={(error || txError)!} />}

          {/* Step 0: Describe Task */}
          {currentStep === 0 && (
            !connected ? (
              <div className="p-8 text-center">
                <p className="text-gray-400 mb-4">Connect your wallet to create a task.</p>
                <WalletMultiButton />
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Task Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                    placeholder="e.g. Build NFT Marketplace on Solana"
                    className="input-field text-sm"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">{title.length}/100</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Brief Description
                    <span className="text-gray-500 font-normal ml-1">(be specific!)</span>
                  </label>
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value.slice(0, 500))}
                    placeholder="Describe what you need... Include tech stack, features, and success criteria."
                    rows={5}
                    className="input-field text-sm resize-none"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">{brief.length}/500</p>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                  <svg className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                  <div className="text-xs text-gray-400 flex-1">
                    <p className="text-brand-300 font-medium mb-0.5">AI-Powered Analysis</p>
                    <p>We'll analyze your brief, ask clarifying questions, then generate a detailed scope with instant pricing.</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                  <button
                    type="button"
                    onClick={handleCreateDraft}
                    disabled={!title.trim() || !brief.trim() || busy}
                    className="btn-primary flex-1"
                  >
                    {busy ? "Analyzing..." : "Analyze Task →"}
                  </button>
                </div>
              </div>
            )
          )}

          {/* Step 1: Clarify (Conditional) */}
          {currentStep === 1 && questions.length > 0 && (
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                <svg className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
                <div className="text-xs text-gray-400 flex-1">
                  <p className="text-brand-300 font-medium mb-0.5">Quick Questions ({questions.length})</p>
                  <p>Help us get accurate pricing by answering these. You can skip if unsure.</p>
                </div>
              </div>

              {questions.map((q, idx) => (
                <div key={q.field_key} className="glass-card p-4">
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    {q.question}
                    {q.impact === "critical" && <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Required</span>}
                  </label>

                  {q.answer_type === "radio" && q.options ? (
                    <div className="space-y-2">
                      {q.options.map((option) => (
                        <label key={option} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`q-${idx}`}
                            value={option}
                            checked={answers[q.field_key] === option}
                            onChange={(e) => setAnswers({ ...answers, [q.field_key]: e.target.value })}
                            className="w-4 h-4 text-brand-500 bg-gray-800 border-gray-700 focus:ring-brand-500"
                          />
                          <span className="text-sm text-gray-300">{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : q.answer_type === "number" ? (
                    <input
                      type="number"
                      value={answers[q.field_key] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.field_key]: parseInt(e.target.value) || 0 })}
                      placeholder="Enter number..."
                      className="input-field text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={answers[q.field_key] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.field_key]: e.target.value })}
                      placeholder="Your answer..."
                      className="input-field text-sm"
                    />
                  )}
                </div>
              ))}

              {/* Budget Field */}
              <div className="glass-card p-4">
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  💰 Budget (optional)
                  <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300">Helps us tailor the scope</span>
                </label>
                <div className="flex gap-3 items-center">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={answers["_budget_sol"] || ""}
                      onChange={(e) => {
                        const sol = parseFloat(e.target.value) || 0;
                        setAnswers({ ...answers, _budget_sol: e.target.value, _budget_usd: (sol * 150).toFixed(2) });
                      }}
                      placeholder="0.00"
                      className="input-field text-sm pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">SOL</span>
                  </div>
                  <span className="text-gray-500">≈</span>
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={answers["_budget_usd"] || ""}
                      onChange={(e) => {
                        const usd = parseFloat(e.target.value) || 0;
                        setAnswers({ ...answers, _budget_usd: e.target.value, _budget_sol: (usd / 150).toFixed(4) });
                      }}
                      placeholder="0.00"
                      className="input-field text-sm pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave blank for no budget constraint (full quote)</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setCurrentStep(0); setError(null); }}
                  disabled={busy}
                  className="btn-secondary flex-1"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => handleClarify(false)}
                  disabled={busy}
                  className="btn-primary flex-1"
                >
                  {busy ? "Generating Scope..." : "Submit Answers →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Review Scope */}
          {currentStep === 2 && draft?.scope_structured && (
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Objective</h3>
                <p className="text-sm text-gray-200">{draft.scope_structured.objective}</p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Deliverables</h3>
                <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                  {draft.scope_structured.deliverables.slice(0, 5).map((d: any, i) => (
                    <li key={i}>{d.name || d.description || d}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Timeline</h3>
                <p className="text-sm text-gray-300">{draft.scope_structured.timeline_estimate_days} days</p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Confidence</h3>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-brand-500"
                      style={{ width: `${draft.scope_structured.confidence_score * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-400">
                    {Math.round(draft.scope_structured.confidence_score * 100)}%
                  </span>
                </div>
              </div>

              {draft.risk_flags.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div className="text-xs text-gray-400 flex-1">
                    <p className="text-yellow-300 font-medium mb-0.5">Compliance Notice</p>
                    <p>This task has been flagged for: {draft.risk_flags.join(", ")}</p>
                    {draft.requires_human_review && <p className="mt-1 text-yellow-400">Manual review may be required.</p>}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setCurrentStep(1)} className="btn-secondary flex-1">← Back</button>
                <button
                  type="button"
                  onClick={handleApproveScope}
                  disabled={busy}
                  className="btn-primary flex-1"
                >
                  {busy ? "Calculating..." : "Get Quote →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Quote */}
          {currentStep === 3 && draft?.pricing_result && draft?.complexity_result && (
            <div className="p-5 space-y-4">
              {/* Price */}
              <div className="glass-card p-4 text-center bg-gradient-to-br from-brand-500/10 to-brand-400/5">
                <p className="text-xs text-gray-500 mb-1">Total Price</p>
                <div className="text-3xl font-bold text-gray-50">
                  {draft.pricing_result.total_sol} <span className="text-base font-normal text-gray-400">SOL</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  ~${draft.pricing_result.total_usd} USD
                </p>
              </div>

              {/* Complexity */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Complexity</span>
                  <span className="text-sm font-bold text-gray-100">{draft.complexity_result.complexity_score}/100</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${draft.complexity_result.complexity_score}%`,
                      background: `linear-gradient(to right, #22c55e, ${
                        draft.complexity_result.complexity_score > 70 ? "#ef4444" : draft.complexity_result.complexity_score > 40 ? "#f59e0b" : "#22c55e"
                      })`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{draft.complexity_result.explanation}</p>
              </div>

              {/* Breakdown */}
              <details className="text-xs text-gray-500 bg-gray-900/50 p-3 rounded-xl">
                <summary className="font-semibold text-gray-400 cursor-pointer">Pricing Breakdown</summary>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Labour ({draft.pricing_result.breakdown.estimated_hours}h × {draft.pricing_result.breakdown.base_rate_sol_per_hour} SOL/h × {draft.pricing_result.breakdown.complexity_multiplier}x)</span>
                    <span>{(draft.pricing_result.labour_cost_lamports / 1e9).toFixed(4)} SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Contingency ({draft.pricing_result.breakdown.contingency_percent}%)</span>
                    <span>{(draft.pricing_result.contingency_lamports / 1e9).toFixed(4)} SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform Fee (5%)</span>
                    <span>{draft.pricing_result.breakdown.fixed_fee_sol} SOL</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-300 border-t border-gray-700 pt-1 mt-1">
                    <span>Total</span>
                    <span>{draft.pricing_result.total_sol} SOL</span>
                  </div>
                </div>
              </details>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setCurrentStep(2)} className="btn-secondary flex-1">← Revise Scope</button>
                <button
                  type="button"
                  onClick={handleConfirmQuote}
                  disabled={busy}
                  className="btn-primary flex-1"
                >
                  {busy ? "Confirming..." : `Accept (${draft.pricing_result.total_sol} SOL)`}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Payment */}
          {currentStep === 4 && draft?.pricing_result && (
            <div className="p-5 space-y-4">
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">Amount to Escrow</p>
                <div className="text-3xl font-bold text-gray-50">
                  {draft.pricing_result.total_sol} <span className="text-base font-normal text-gray-400">SOL</span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                <svg className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <div className="text-xs text-gray-400">
                  <p className="font-medium text-gray-300">Escrow Protected</p>
                  <p className="mt-0.5">
                    Your SOL is held in a secure on-chain escrow. Released only upon task completion and your approval.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleCancel} disabled={busy} className="btn-secondary flex-1">Cancel</button>
                <button
                  type="button"
                  onClick={handleFund}
                  disabled={txLoading}
                  className="btn-primary flex-1"
                >
                  {txLoading ? "Confirming..." : `Fund Escrow (${draft.pricing_result.total_sol} SOL)`}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Done */}
          {currentStep === 5 && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mb-4">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-50 mb-2">Task Created & Funded!</h3>
              <p className="text-gray-400 text-sm mb-3">
                {draft?.pricing_result?.total_sol} SOL escrowed for "{draft?.title}"
              </p>
              <div className="mt-6 flex gap-3 justify-center">
                <button onClick={onClose} className="btn-secondary">Close</button>
                {draft && (
                  <button
                    onClick={() => onViewTask(draft.draft_id)}
                    className="btn-primary"
                  >
                    View Task
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
