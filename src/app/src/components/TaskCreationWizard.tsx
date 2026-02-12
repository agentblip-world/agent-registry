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
  submitScope,
  approveScope,
  acceptQuote,
  recordFunding,
  cancelWorkflow,
} from "../lib/workflow-api";
import type { TaskWorkflow, TaskScope } from "../lib/workflow-types";

const WIZARD_STEPS = [
  { label: "Name Task", key: "name" },
  { label: "Define Scope", key: "scope" },
  { label: "Review Scope", key: "review" },
  { label: "Quote", key: "quote" },
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

  // Step 1: Name
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");

  // Step 2: Scope
  const [objective, setObjective] = useState("");
  const [deliverables, setDeliverables] = useState<string[]>([""]);
  const [outOfScope, setOutOfScope] = useState<string[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([""]);

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

  // ─── Dynamic List Helpers ───────────────────────────────────────────

  function updateList(setter: React.Dispatch<React.SetStateAction<string[]>>, index: number, value: string) {
    setter((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  function addToList(setter: React.Dispatch<React.SetStateAction<string[]>>, max: number) {
    setter((prev) => (prev.length < max ? [...prev, ""] : prev));
  }

  function removeFromList(setter: React.Dispatch<React.SetStateAction<string[]>>, index: number) {
    setter((prev) => prev.filter((_, i) => i !== index));
  }

  function DynamicList({
    label,
    items,
    setter,
    min,
    max,
    placeholder,
  }: {
    label: string;
    items: string[];
    setter: React.Dispatch<React.SetStateAction<string[]>>;
    min: number;
    max: number;
    placeholder: string;
  }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => updateList(setter, i, e.target.value)}
                placeholder={placeholder}
                className="input-field text-sm flex-1"
              />
              {items.length > min && (
                <button
                  type="button"
                  onClick={() => removeFromList(setter, i)}
                  className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {items.length < max && (
          <button
            type="button"
            onClick={() => addToList(setter, max)}
            className="mt-2 text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add item
          </button>
        )}
      </div>
    );
  }

  // ─── Step Handlers ──────────────────────────────────────────────────

  async function handleCreateDraft() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const wf = await createWorkflow({
        clientWallet: publicKey.toBase58(),
        agentPubkey: agent.publicKey,
        agentName: agent.name,
        title: title.trim(),
        brief: brief.trim(),
      });
      setWorkflow(wf);
      setStep(1);
    } catch (err: any) {
      setError(err.message || "Failed to create workflow");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitScope() {
    if (!workflow) return;
    setBusy(true);
    setError(null);
    try {
      const scope: TaskScope = {
        objective: objective.trim(),
        deliverables: deliverables.map((d) => d.trim()).filter(Boolean),
        outOfScope: outOfScope.map((d) => d.trim()).filter(Boolean),
        assumptions: assumptions.map((d) => d.trim()).filter(Boolean),
        acceptanceCriteria: acceptanceCriteria.map((d) => d.trim()).filter(Boolean),
      };
      const wf = await submitScope(workflow.id, scope);
      setWorkflow(wf);
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to submit scope");
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveScope() {
    if (!workflow) return;
    setBusy(true);
    setError(null);
    try {
      const wf = await approveScope(workflow.id);
      setWorkflow(wf);
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Failed to approve scope");
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
      setStep(4);
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
        setStep(5);
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

        {/* Agent Card (steps 0-4) */}
        {step < 5 && <AgentSummary />}

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
                    placeholder="e.g. Smart Contract Security Audit"
                    className="input-field text-sm"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">{title.length}/100</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Brief Description</label>
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value.slice(0, 500))}
                    placeholder="What do you need this agent to do?"
                    rows={3}
                    className="input-field text-sm resize-none"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">{brief.length}/500</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                  <button
                    type="button"
                    onClick={handleCreateDraft}
                    disabled={!title.trim() || !brief.trim() || busy}
                    className="btn-primary flex-1"
                  >
                    {busy ? "Creating..." : "Analyze Scope →"}
                  </button>
                </div>
              </div>
            )
          )}

          {/* Step 1: Define Scope */}
          {step === 1 && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Objective</label>
                <textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="What is the main goal of this task?"
                  rows={2}
                  className="input-field text-sm resize-none"
                />
              </div>
              <DynamicList
                label="Deliverables"
                items={deliverables}
                setter={setDeliverables}
                min={1}
                max={5}
                placeholder="e.g. Security audit report"
              />
              <DynamicList
                label="Out of Scope"
                items={outOfScope}
                setter={setOutOfScope}
                min={0}
                max={5}
                placeholder="e.g. Frontend UI testing"
              />
              <DynamicList
                label="Assumptions"
                items={assumptions}
                setter={setAssumptions}
                min={0}
                max={5}
                placeholder="e.g. Source code will be provided"
              />
              <DynamicList
                label="Acceptance Criteria"
                items={acceptanceCriteria}
                setter={setAcceptanceCriteria}
                min={1}
                max={5}
                placeholder="e.g. All critical vulnerabilities identified"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(0)} className="btn-secondary flex-1">← Back</button>
                <button
                  type="button"
                  onClick={handleSubmitScope}
                  disabled={!objective.trim() || deliverables.filter((d) => d.trim()).length === 0 || acceptanceCriteria.filter((c) => c.trim()).length === 0 || busy}
                  className="btn-primary flex-1"
                >
                  {busy ? "Submitting..." : "Submit Scope"}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Review Scope */}
          {step === 2 && workflow?.scope && (
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Objective</h3>
                <p className="text-sm text-gray-200">{workflow.scope.objective}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Deliverables</h3>
                <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                  {workflow.scope.deliverables.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
              {workflow.scope.outOfScope.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Out of Scope</h3>
                  <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                    {workflow.scope.outOfScope.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              {workflow.scope.assumptions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Assumptions</h3>
                  <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                    {workflow.scope.assumptions.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Acceptance Criteria</h3>
                <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                  {workflow.scope.acceptanceCriteria.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">Edit Scope</button>
                <button
                  type="button"
                  onClick={handleApproveScope}
                  disabled={busy}
                  className="btn-primary flex-1"
                >
                  {busy ? "Approving..." : "Approve Scope →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Quote */}
          {step === 3 && workflow?.quote && (
            <div className="p-5 space-y-4">
              {/* Complexity bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Complexity</span>
                  <span className="text-sm font-bold text-gray-100">{workflow.quote.complexity}/10</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${(workflow.quote.complexity / 10) * 100}%`,
                      background: `linear-gradient(to right, #22c55e, ${
                        workflow.quote.complexity > 7 ? "#ef4444" : workflow.quote.complexity > 4 ? "#f59e0b" : "#22c55e"
                      })`,
                    }}
                  />
                </div>
              </div>

              {/* Price */}
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">Quoted Price</p>
                <div className="text-3xl font-bold text-gray-50">
                  {workflow.quote.quotedSol} <span className="text-base font-normal text-gray-400">SOL</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  ~${(workflow.quote.quotedSol * 150).toFixed(2)} USD
                </p>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-gray-500">Estimated Time</p>
                  <p className="text-lg font-bold text-gray-100">{workflow.quote.estimatedHours}h</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-gray-500">Agent Base Rate</p>
                  <p className="text-lg font-bold text-gray-100">{lamportsToSol(agent.pricingLamports)} SOL</p>
                </div>
              </div>

              {/* Breakdown */}
              <div className="text-xs text-gray-500 bg-gray-900/50 p-3 rounded-xl">
                <p className="font-semibold text-gray-400 mb-1">Breakdown</p>
                <pre className="whitespace-pre-wrap font-mono leading-relaxed">{workflow.quote.breakdown}</pre>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">Revise Scope</button>
                <button
                  type="button"
                  onClick={handleAcceptQuote}
                  disabled={busy}
                  className="btn-primary flex-1"
                >
                  {busy ? "Accepting..." : "Accept & Pay →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Payment */}
          {step === 4 && workflow?.quote && (
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

          {/* Step 5: Done */}
          {step === 5 && (
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
