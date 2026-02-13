import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import type { AgentProfile } from "../lib/api";
import { useCreateTask } from "../hooks/useRegistry";
import { lamportsToSol, truncatePubkey, getTaskEscrowPDA } from "../lib/program";
import { WizardStepRail } from "./WizardStepRail";
import {
  createWorkflow,
  extractStructuredFacts,
  fastQuote,
  acceptQuote,
  recordFunding,
  cancelWorkflow,
} from "../lib/workflow-api";
import type { TaskWorkflow, TaskScope } from "../lib/workflow-types";

const WIZARD_STEPS = [
  { label: "Name Task", key: "name" },
  { label: "Clarify Details", key: "clarify" },
  { label: "Review & Quote", key: "review" },
  { label: "Payment", key: "payment" },
  { label: "Done", key: "done" },
];

interface TaskCreationWizardProps {
  agent: AgentProfile;
  onClose: () => void;
  onViewTask: (workflowId: string) => void;
}

export function TaskCreationWizard({ agent, onClose, onViewTask }: TaskCreationWizardProps) {
  const { connected, publicKey } = useWallet();
  const overlayRef = useRef<HTMLDivElement>(null);
  const { loading: txLoading, error: txError, execute: executeCreateTask, reset: resetTx } = useCreateTask();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Workflow state
  const [workflow, setWorkflow] = useState<TaskWorkflow | null>(null);

  // Step 0: Name
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");

  // Step 1: Extraction + Clarification
  const [extraction, setExtraction] = useState<any | null>(null);
  const [clarifyingQuestions, setClarifyingQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Step 2: Scope + Quote (from fast-quote)
  const [scope, setScope] = useState<TaskScope | null>(null);
  const [quote, setQuote] = useState<any | null>(null);

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

  // ─── Step Handlers ──────────────────────────────────────────────────

  async function handleCreateDraft() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      // Create workflow
      const wf = await createWorkflow({
        clientWallet: publicKey.toBase58(),
        agentPubkey: agent.publicKey,
        agentName: agent.name,
        title: title.trim(),
        brief: brief.trim(),
      });
      setWorkflow(wf);

      // Extract structured facts
      const { extraction: ext, workflow: updatedWf } = await extractStructuredFacts(wf.id);
      setExtraction(ext);
      setWorkflow(updatedWf);

      // Check if clarifying questions exist
      const questions = ext.clarifying_questions || [];
      if (questions.length > 0) {
        setClarifyingQuestions(questions);
        setStep(1); // Show clarification step
      } else {
        // No questions → go straight to fast-quote
        await handleFastQuote(ext, {});
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze task");
    } finally {
      setBusy(false);
    }
  }

  async function handleSkipClarifications() {
    if (!extraction) return;
    await handleFastQuote(extraction, answers);
  }

  async function handleSubmitClarifications() {
    if (!extraction) return;
    // Check if all critical questions are answered
    const criticalQuestions = clarifyingQuestions.filter((q) => q.critical);
    const unanswered = criticalQuestions.filter((q) => !answers[q.question]);
    if (unanswered.length > 0) {
      setError(`Please answer all critical questions (${unanswered.length} remaining)`);
      return;
    }
    await handleFastQuote(extraction, answers);
  }

  async function handleFastQuote(ext: any, clarifiedAnswers: Record<string, string>) {
    if (!workflow) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fastQuote(workflow.id, ext, clarifiedAnswers);
      setScope(result.scope);
      setQuote(result.quote);
      setWorkflow(result.workflow);
      setStep(2); // Jump to Review & Quote
    } catch (err: any) {
      setError(err.message || "Failed to generate quote");
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptQuote() {
    if (!workflow) return;
    setBusy(true);
    setError(null);
    try {
      const wf = await acceptQuote(workflow.id);
      setWorkflow(wf);
      setStep(3); // Payment step
    } catch (err: any) {
      setError(err.message || "Failed to accept quote");
    } finally {
      setBusy(false);
    }
  }

  async function handleFund() {
    if (!workflow?.quote || !publicKey) return;
    setError(null);
    resetTx();
    try {
      const agentProfilePubkey = new PublicKey(agent.publicKey);
      const sig = await executeCreateTask({
        taskId: workflow.taskId,
        amountLamports: workflow.quote.quotedLamports,
        agentProfilePubkey,
      });
      if (sig) {
        const [escrowPDA] = getTaskEscrowPDA(publicKey, workflow.taskId);
        const wf = await recordFunding(workflow.id, sig, escrowPDA.toBase58());
        setWorkflow(wf);
        setStep(4); // Done
      }
    } catch {
      // txError is managed by the hook
    }
  }

  async function handleCancel() {
    if (!workflow) return;
    setBusy(true);
    try {
      await cancelWorkflow(workflow.id);
      onClose();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  // ─── Agent Summary Card ─────────────────────────────────────────────

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
        <div className="flex flex-wrap gap-1 mt-2">
          {agent.capabilities.map((cap) => (
            <span key={cap} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-brand-500/10 text-brand-400 border border-brand-500/15">
              {cap}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ─── Error Bar ──────────────────────────────────────────────────────

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

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="glass-card max-w-xl w-full p-0 overflow-hidden animate-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800/50 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-50">Create Task</h2>
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
          <WizardStepRail steps={WIZARD_STEPS} currentStep={step} />
        </div>

        {/* Agent Card (steps 0-3) */}
        {step < 4 && <AgentSummary />}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Error */}
          {(error || txError) && <ErrorBar msg={(error || txError)!} />}

          {/* Step 0: Name Task */}
          {step === 0 && (
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
                    <span className="text-gray-500 font-normal ml-1">(be specific for better pricing)</span>
                  </label>
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value.slice(0, 500))}
                    placeholder="What do you need? Include tech stack, integrations, and success criteria..."
                    rows={4}
                    className="input-field text-sm resize-none"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">{brief.length}/500</p>
                </div>

                {/* AI hint */}
                <div className="flex items-start gap-2 p-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                  <svg className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                  <div className="text-xs text-gray-400 flex-1">
                    <p className="text-brand-300 font-medium mb-0.5">AI-Powered Analysis</p>
                    <p>We'll analyze your brief, ask clarifying questions, then generate a detailed scope + instant quote (~30s total).</p>
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

          {/* Step 1: Clarify Details */}
          {step === 1 && (
            <div className="p-5 space-y-4">
              {/* Progress indicator */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                <svg className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
                <div className="text-xs text-gray-400 flex-1">
                  <p className="text-brand-300 font-medium mb-0.5">Quick Questions</p>
                  <p>Answer these to get an accurate quote. Skip if you're not sure.</p>
                </div>
              </div>

              {/* Questions */}
              <div className="space-y-4">
                {clarifyingQuestions.map((q, idx) => (
                  <div key={idx} className="glass-card p-4">
                    <label className="block text-sm font-medium text-gray-200 mb-2">
                      {q.question}
                      {q.critical && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    {q.type === "multiple_choice" && q.options ? (
                      <div className="space-y-2">
                        {q.options.map((option: string) => (
                          <label key={option} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`question-${idx}`}
                              value={option}
                              checked={answers[q.question] === option}
                              onChange={(e) => setAnswers({ ...answers, [q.question]: e.target.value })}
                              className="w-4 h-4 text-brand-500 bg-gray-800 border-gray-700 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-gray-300">{option}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={answers[q.question] || ""}
                        onChange={(e) => setAnswers({ ...answers, [q.question]: e.target.value })}
                        placeholder="Your answer..."
                        className="input-field text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSkipClarifications}
                  disabled={busy}
                  className="btn-secondary flex-1"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={handleSubmitClarifications}
                  disabled={busy}
                  className="btn-primary flex-1"
                >
                  {busy ? "Generating Quote..." : "Submit & Get Quote →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Review & Quote */}
          {step === 2 && scope && quote && (
            <div className="p-5 space-y-4">
              {/* Quote highlight */}
              <div className="glass-card p-4 text-center bg-gradient-to-br from-brand-500/10 to-brand-400/5">
                <p className="text-xs text-gray-500 mb-1">Instant Quote</p>
                <div className="text-3xl font-bold text-gray-50">
                  {quote.quotedSol} <span className="text-base font-normal text-gray-400">SOL</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  ~${(quote.quotedSol * 150).toFixed(2)} USD · {quote.estimatedHours}h estimated
                </p>
              </div>

              {/* Complexity */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Complexity</span>
                  <span className="text-sm font-bold text-gray-100">{quote.complexity}/10</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${(quote.complexity / 10) * 100}%`,
                      background: `linear-gradient(to right, #22c55e, ${
                        quote.complexity > 7 ? "#ef4444" : quote.complexity > 4 ? "#f59e0b" : "#22c55e"
                      })`,
                    }}
                  />
                </div>
              </div>

              {/* Breakdown */}
              <details className="text-xs text-gray-500 bg-gray-900/50 p-3 rounded-xl">
                <summary className="font-semibold text-gray-400 cursor-pointer">Pricing Breakdown</summary>
                <pre className="whitespace-pre-wrap font-mono leading-relaxed mt-2">{quote.breakdown}</pre>
              </details>

              {/* Scope Summary */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Scope Overview</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Objective</p>
                    <p className="text-sm text-gray-200">{scope.objective}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Deliverables</p>
                    <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                      {scope.deliverables.slice(0, 3).map((d, i) => <li key={i}>{d}</li>)}
                      {scope.deliverables.length > 3 && (
                        <li className="text-gray-500">+{scope.deliverables.length - 3} more...</li>
                      )}
                    </ul>
                  </div>

                  {scope.implementationPhases && scope.implementationPhases.length > 0 && (
                    <details>
                      <summary className="text-xs text-gray-500 cursor-pointer mb-1">
                        Implementation Plan ({scope.implementationPhases.length} phases)
                      </summary>
                      <div className="space-y-2 mt-2">
                        {scope.implementationPhases.map((phase, idx) => (
                          <div key={idx} className="pl-3 border-l-2 border-brand-500/30">
                            <p className="text-xs font-medium text-brand-400">
                              Phase {idx + 1}: {phase.name} <span className="text-gray-600">({phase.estimatedHours}h)</span>
                            </p>
                            <p className="text-xs text-gray-500">{phase.description}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>

              {/* Escrow info */}
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
                <button type="button" onClick={() => setStep(0)} className="btn-secondary flex-1">Start Over</button>
                <button
                  type="button"
                  onClick={handleAcceptQuote}
                  disabled={busy}
                  className="btn-primary flex-1"
                >
                  {busy ? "Accepting..." : `Accept & Pay (${quote.quotedSol} SOL)`}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 3 && workflow?.quote && (
            <div className="p-5 space-y-4">
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">Amount to Escrow</p>
                <div className="text-3xl font-bold text-gray-50">
                  {workflow.quote.quotedSol} <span className="text-base font-normal text-gray-400">SOL</span>
                </div>
              </div>

              {/* Escrow info box */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                <svg className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <div className="text-xs text-gray-400">
                  <p className="font-medium text-gray-300">Escrow Protected</p>
                  <p className="mt-0.5">
                    Your SOL is held in a secure on-chain escrow PDA. It will be released
                    to the agent only upon task completion and your approval.
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
                  {txLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Confirming...
                    </span>
                  ) : (
                    `Fund Escrow (${workflow.quote.quotedSol} SOL)`
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mb-4">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-50 mb-2">Task Created & Funded!</h3>
              <p className="text-gray-400 text-sm mb-3">
                {workflow?.quote?.quotedSol} SOL escrowed for "{workflow?.title}"
              </p>
              {workflow?.fundTxSig && (
                <a
                  href={`https://explorer.solana.com/tx/${workflow.fundTxSig}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 hover:text-brand-300 text-xs font-mono underline"
                >
                  View on Solana Explorer
                </a>
              )}
              <div className="mt-6 flex gap-3 justify-center">
                <button onClick={onClose} className="btn-secondary">Close</button>
                {workflow && (
                  <button
                    onClick={() => onViewTask(workflow.id)}
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
