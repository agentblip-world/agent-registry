import React, { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useWorkflow } from "../hooks/useWorkflows";
import { useCompleteTask } from "../hooks/useRegistry";
import { truncatePubkey } from "../lib/program";
import {
  submitDeliverables,
  requestRevision,
  acceptDeliverables,
  cancelWorkflow,
  refundWorkflow,
  extendSla,
} from "../lib/workflow-api";
import { WorkflowStatus } from "../lib/workflow-types";
import type { TaskWorkflow } from "../lib/workflow-types";
import { TaskProgressRail } from "./TaskProgressRail";
import { RatingForm } from "./RatingForm";

interface TaskDetailProps {
  workflowId: string;
  mode: "human" | "agent";
  onBack: () => void;
}

// ─── Status Badges ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft: { label: "Draft", color: "text-gray-400", bg: "bg-gray-800/50", border: "border-gray-700/50" },
  scope_review: { label: "Scope Review", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  quote_review: { label: "Quote Review", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  awaiting_escrow: { label: "Awaiting Escrow", color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
  in_progress: { label: "In Progress", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  under_review: { label: "Under Review", color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
  revision_requested: { label: "Revision Requested", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  completed: { label: "Completed", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  cancelled: { label: "Cancelled", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  refunded: { label: "Refunded", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
  rated: { label: "Rated", color: "text-brand-400", bg: "bg-brand-500/10", border: "border-brand-500/20" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, color: "text-gray-400", bg: "bg-gray-800/50", border: "border-gray-700/50" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${config.bg} ${config.color} border ${config.border}`}>
      {status === "in_progress" && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
      {config.label}
    </span>
  );
}

// ─── SLA Timer ───────────────────────────────────────────────────────────────

function SlaTimer({ workflow, onExtend, onRefund }: {
  workflow: TaskWorkflow & { slaExpiresAt?: string; slaBreached?: boolean };
  onExtend: () => void;
  onRefund: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!workflow.slaExpiresAt) return;

    function update() {
      const remaining = new Date(workflow.slaExpiresAt!).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeLeft("BREACHED");
      } else {
        const h = Math.floor(remaining / 3600_000);
        const m = Math.floor((remaining % 3600_000) / 60_000);
        setTimeLeft(`${h}h ${m}m`);
      }
    }
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [workflow.slaExpiresAt]);

  if (workflow.status !== WorkflowStatus.InProgress || !workflow.slaStartedAt) return null;

  const breached = workflow.slaBreached || timeLeft === "BREACHED";

  return (
    <div className={`rounded-xl p-3 mb-4 ${
      breached ? "bg-red-500/10 border border-red-500/20" : "bg-gray-800/30 border border-gray-800/50"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 ${breached ? "text-red-400" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className={`text-sm font-medium ${breached ? "text-red-400" : "text-gray-300"}`}>
            SLA: {timeLeft}
          </span>
          {workflow.slaExtendedCount > 0 && (
            <span className="text-[10px] text-gray-500">(+{workflow.slaExtendedCount} extensions)</span>
          )}
        </div>
        {breached && (
          <div className="flex gap-2">
            <button onClick={onExtend} className="text-xs px-3 py-1 rounded-lg bg-gray-800 text-gray-300 hover:text-white transition-colors">
              Extend +{workflow.slaHours}h
            </button>
            <button onClick={onRefund} className="text-xs px-3 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
              Cancel & Refund
            </button>
          </div>
        )}
      </div>
      {breached && (
        <p className="text-[10px] text-red-400/70 mt-1">
          SLA has been breached. You can extend the deadline or cancel for a refund.
        </p>
      )}
    </div>
  );
}

// ─── Activity Feed ───────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, string> = {
  created: "M12 4.5v15m7.5-7.5h-15",
  scope_submitted: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
  scope_approved: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  scope_revised: "M16.023 9.348h.015m-.015 0a9.002 9.002 0 01-4.043 7.546l-3.085 1.862a.6.6 0 01-.835-.176l-1.8-3A9 9 0 0116.023 9.348z",
  quote_generated: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  quote_accepted: "M4.5 12.75l6 6 9-13.5",
  funded: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  agent_accepted: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  deliverable_submitted: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
  revision_requested: "M16.023 9.348h.015m-16.015 0h.015M9 12a3 3 0 11-6 0 3 3 0 016 0zm12 0a3 3 0 11-6 0 3 3 0 016 0z",
  accepted: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  completed: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  rated: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  cancelled: "M6 18L18 6M6 6l12 12",
  refunded: "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3",
  sla_extended: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
};

const ACTOR_COLORS: Record<string, string> = {
  client: "text-blue-400",
  agent: "text-purple-400",
  system: "text-gray-500",
};

function timeAgo(ts: string): string {
  const seconds = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TaskDetail({ workflowId, mode, onBack }: TaskDetailProps) {
  const { workflow, loading, refetch } = useWorkflow(workflowId);
  const { publicKey } = useWallet();
  const { execute: executeComplete, loading: completeLoading } = useCompleteTask();
  const [activeTab, setActiveTab] = useState<"overview" | "deliverables" | "activity">("overview");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Deliverable submit form state
  const [submitSummary, setSubmitSummary] = useState("");
  const [submitItems, setSubmitItems] = useState<string[]>([""]);
  const [submitNotes, setSubmitNotes] = useState("");

  // Revision form state
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionItems, setRevisionItems] = useState<string[]>([""]);

  // Refund confirm
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);

  const isClient = mode === "human";
  const isAgent = mode === "agent";

  if (loading || !workflow) {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-200 mb-4 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Tasks
        </button>
        <div className="glass-card p-10 text-center text-gray-500">Loading workflow...</div>
      </div>
    );
  }

  const wf = workflow;

  // ─── Action Handlers ────────────────────────────────────────────────

  async function handleSubmitDeliverables() {
    setBusy(true);
    setActionError(null);
    try {
      await submitDeliverables(wf.id, {
        summary: submitSummary.trim(),
        items: submitItems.map((i) => i.trim()).filter(Boolean),
        notes: submitNotes.trim(),
      });
      setSubmitSummary("");
      setSubmitItems([""]);
      setSubmitNotes("");
      refetch();
    } catch (err: any) {
      setActionError(err.message || "Failed to submit");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestRevision() {
    setBusy(true);
    setActionError(null);
    try {
      await requestRevision(wf.id, {
        reason: revisionReason.trim(),
        items: revisionItems.map((i) => i.trim()).filter(Boolean),
      });
      setRevisionReason("");
      setRevisionItems([""]);
      refetch();
    } catch (err: any) {
      setActionError(err.message || "Failed to request revision");
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptDeliverables() {
    setBusy(true);
    setActionError(null);
    try {
      // On-chain complete_task (releases escrow)
      let txSig: string | undefined;
      if (wf.escrowPubkey) {
        try {
          txSig = await executeComplete({
            taskEscrowPubkey: new PublicKey(wf.escrowPubkey),
            agentProfilePubkey: new PublicKey(wf.agentPubkey),
          });
        } catch {
          // continue without on-chain if it fails
        }
      }
      await acceptDeliverables(wf.id, txSig);
      refetch();
    } catch (err: any) {
      setActionError(err.message || "Failed to accept");
    } finally {
      setBusy(false);
    }
  }

  async function handleExtendSla() {
    setBusy(true);
    try {
      await extendSla(wf.id);
      refetch();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function handleRefund() {
    setBusy(true);
    try {
      await refundWorkflow(wf.id);
      setShowRefundConfirm(false);
      refetch();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    try {
      await cancelWorkflow(wf.id);
      refetch();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────

  const canCancel = [WorkflowStatus.Draft, WorkflowStatus.ScopeReview, WorkflowStatus.QuoteReview, WorkflowStatus.AwaitingEscrow].includes(wf.status as WorkflowStatus);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back + Title + Status */}
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-200 mb-4 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to Tasks
      </button>

      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-50 flex-1 truncate">{wf.title}</h1>
        <StatusBadge status={wf.status} />
      </div>

      {/* Progress Rail */}
      <div className="glass-card p-3 mb-4">
        <TaskProgressRail
          status={wf.status as WorkflowStatus}
          revisionCount={wf.revisions.length}
          maxRevisions={wf.maxRevisions}
        />
      </div>

      {/* SLA Timer */}
      <SlaTimer
        workflow={wf as any}
        onExtend={handleExtendSla}
        onRefund={() => setShowRefundConfirm(true)}
      />

      {/* Refund Confirmation */}
      {showRefundConfirm && (
        <div className="glass-card p-4 mb-4 border border-red-500/20">
          <h3 className="text-sm font-semibold text-red-400 mb-2">Confirm Refund</h3>
          <p className="text-xs text-gray-400 mb-3">
            Platform fees still apply. The agent's completion stats will be impacted.
            Are you sure you want to cancel and request a refund?
          </p>
          <div className="flex gap-2">
            <button onClick={() => setShowRefundConfirm(false)} className="btn-secondary text-xs flex-1">No, Keep Task</button>
            <button onClick={handleRefund} disabled={busy} className="text-xs px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex-1">
              {busy ? "Processing..." : "Yes, Refund"}
            </button>
          </div>
        </div>
      )}

      {/* Tab Pills */}
      <div className="flex items-center gap-1 mb-4 bg-gray-900/50 p-1 rounded-xl w-fit">
        {(["overview", "deliverables", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              activeTab === tab
                ? "bg-gray-800 text-gray-50 shadow-sm"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
          <p className="text-red-400 text-xs">{actionError}</p>
        </div>
      )}

      {/* ─── Overview Tab ────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Brief */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Brief</h3>
            <p className="text-sm text-gray-200">{wf.brief}</p>
          </div>

          {/* Scope */}
          {wf.scope && (
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Scope</h3>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Objective</p>
                <p className="text-sm text-gray-200">{wf.scope.objective}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Deliverables</p>
                <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                  {wf.scope.deliverables.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
              {wf.scope.acceptanceCriteria.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase mb-0.5">Acceptance Criteria</p>
                  <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                    {wf.scope.acceptanceCriteria.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Quote */}
          {wf.quote && (
            <div className="glass-card p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Quote</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-gray-50">{wf.quote.complexity}/10</p>
                  <p className="text-[10px] text-gray-500">Complexity</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-50">{wf.quote.quotedSol} SOL</p>
                  <p className="text-[10px] text-gray-500">Price</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-50">{wf.quote.estimatedHours}h</p>
                  <p className="text-[10px] text-gray-500">Est. Time</p>
                </div>
              </div>
            </div>
          )}

          {/* Agent Info */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Agent</h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">
                  {wf.agentName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-100">{wf.agentName}</p>
                <p className="text-[10px] text-gray-500 font-mono">{truncatePubkey(wf.agentPubkey, 6)}</p>
              </div>
            </div>
          </div>

          {/* On-chain Refs */}
          {(wf.escrowPubkey || wf.fundTxSig || wf.completeTxSig) && (
            <div className="glass-card p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">On-Chain</h3>
              <div className="space-y-1 text-xs font-mono">
                {wf.escrowPubkey && (
                  <p>
                    <span className="text-gray-500">Escrow: </span>
                    <a href={`https://explorer.solana.com/address/${wf.escrowPubkey}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">
                      {truncatePubkey(wf.escrowPubkey, 8)}
                    </a>
                  </p>
                )}
                {wf.fundTxSig && (
                  <p>
                    <span className="text-gray-500">Fund tx: </span>
                    <a href={`https://explorer.solana.com/tx/${wf.fundTxSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">
                      {truncatePubkey(wf.fundTxSig, 8)}
                    </a>
                  </p>
                )}
                {wf.completeTxSig && (
                  <p>
                    <span className="text-gray-500">Complete tx: </span>
                    <a href={`https://explorer.solana.com/tx/${wf.completeTxSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">
                      {truncatePubkey(wf.completeTxSig, 8)}
                    </a>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cancel Button */}
          {canCancel && isClient && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="w-full text-xs py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Cancel Workflow
            </button>
          )}
        </div>
      )}

      {/* ─── Deliverables Tab ────────────────────────────────────────── */}
      {activeTab === "deliverables" && (
        <div className="space-y-4">
          {/* Agent: Submit Form (in_progress or revision_requested) */}
          {isAgent && (wf.status === WorkflowStatus.InProgress || wf.status === WorkflowStatus.RevisionRequested) && (
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-200">
                {wf.status === WorkflowStatus.RevisionRequested ? "Resubmit Deliverables" : "Submit Deliverables"}
              </h3>

              {/* Show revision notes if revision_requested */}
              {wf.status === WorkflowStatus.RevisionRequested && wf.revisions.length > 0 && (
                <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs">
                  <p className="font-medium text-orange-400 mb-1">Revision Requested:</p>
                  <p className="text-orange-300/80">{wf.revisions[wf.revisions.length - 1].reason}</p>
                  {wf.revisions[wf.revisions.length - 1].items.length > 0 && (
                    <ul className="list-disc list-inside mt-1 text-orange-300/60">
                      {wf.revisions[wf.revisions.length - 1].items.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1">Summary</label>
                <input
                  type="text"
                  value={submitSummary}
                  onChange={(e) => setSubmitSummary(e.target.value)}
                  placeholder="Brief summary of what was delivered"
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Items</label>
                {submitItems.map((item, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const next = [...submitItems];
                        next[i] = e.target.value;
                        setSubmitItems(next);
                      }}
                      placeholder="Deliverable item"
                      className="input-field text-sm flex-1"
                    />
                    {submitItems.length > 1 && (
                      <button onClick={() => setSubmitItems((prev) => prev.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
                {submitItems.length < 10 && (
                  <button onClick={() => setSubmitItems((prev) => [...prev, ""])} className="text-xs text-brand-400 hover:text-brand-300 mt-1">+ Add item</button>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes</label>
                <textarea value={submitNotes} onChange={(e) => setSubmitNotes(e.target.value)} rows={2} placeholder="Additional notes..." className="input-field text-sm resize-none" />
              </div>
              <button
                onClick={handleSubmitDeliverables}
                disabled={busy || !submitSummary.trim() || submitItems.filter((i) => i.trim()).length === 0}
                className="btn-primary w-full"
              >
                {busy ? "Submitting..." : "Submit Deliverables"}
              </button>
            </div>
          )}

          {/* Client: Review deliverables (under_review) */}
          {isClient && wf.status === WorkflowStatus.UnderReview && wf.submissions.length > 0 && (
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-200">Review Submission</h3>
              <div className="p-3 bg-gray-800/30 rounded-xl">
                <p className="text-sm text-gray-200 font-medium">{wf.submissions[wf.submissions.length - 1].summary}</p>
                <ul className="list-disc list-inside text-sm text-gray-400 mt-1">
                  {wf.submissions[wf.submissions.length - 1].items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
                {wf.submissions[wf.submissions.length - 1].notes && (
                  <p className="text-xs text-gray-500 mt-2 italic">{wf.submissions[wf.submissions.length - 1].notes}</p>
                )}
              </div>

              <div className="flex gap-3">
                {wf.revisions.length < wf.maxRevisions ? (
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={revisionReason}
                      onChange={(e) => setRevisionReason(e.target.value)}
                      placeholder="Reason for revision..."
                      className="input-field text-sm"
                    />
                    <button
                      onClick={handleRequestRevision}
                      disabled={busy || !revisionReason.trim()}
                      className="btn-secondary w-full text-xs"
                    >
                      Request Revision ({wf.maxRevisions - wf.revisions.length} remaining)
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 text-center py-3">
                    <p className="text-xs text-gray-500">Max revisions reached ({wf.maxRevisions}/{wf.maxRevisions})</p>
                  </div>
                )}
                <button
                  onClick={handleAcceptDeliverables}
                  disabled={busy || completeLoading}
                  className="btn-primary flex-1"
                >
                  {busy || completeLoading ? "Processing..." : "Accept & Release Escrow"}
                </button>
              </div>
            </div>
          )}

          {/* Submission History */}
          {wf.submissions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Submission History</h3>
              {wf.submissions.map((sub, i) => (
                <div key={i} className="glass-card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-300">Submission #{i + 1}</span>
                    <span className="text-[10px] text-gray-500">{timeAgo(sub.submittedAt)}</span>
                  </div>
                  <p className="text-sm text-gray-200">{sub.summary}</p>
                  <ul className="list-disc list-inside text-xs text-gray-400 mt-1">
                    {sub.items.map((item, j) => <li key={j}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Revision History */}
          {wf.revisions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Revision Requests</h3>
              {wf.revisions.map((rev, i) => (
                <div key={i} className="glass-card p-3 border border-orange-500/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-orange-400">Revision #{i + 1}</span>
                    <span className="text-[10px] text-gray-500">{timeAgo(rev.requestedAt)}</span>
                  </div>
                  <p className="text-sm text-gray-300">{rev.reason}</p>
                </div>
              ))}
            </div>
          )}

          {/* Rating Form (after completion) */}
          {isClient && wf.status === WorkflowStatus.Completed && wf.escrowPubkey && (
            <div className="glass-card p-4">
              <RatingForm
                workflowId={wf.id}
                agentPubkey={wf.agentPubkey}
                escrowPubkey={wf.escrowPubkey}
                onRated={refetch}
              />
            </div>
          )}

          {/* Rating Display */}
          {wf.rating && (
            <div className="glass-card p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Your Rating</h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: "Overall", value: wf.rating.overall },
                  { label: "Quality", value: wf.rating.quality },
                  { label: "Speed", value: wf.rating.speed },
                  { label: "Communication", value: wf.rating.communication },
                ].map((r) => (
                  <div key={r.label}>
                    <p className="text-lg font-bold text-brand-400">{r.value}/5</p>
                    <p className="text-[10px] text-gray-500">{r.label}</p>
                  </div>
                ))}
              </div>
              {wf.rating.review && (
                <p className="text-xs text-gray-400 mt-3 italic">"{wf.rating.review}"</p>
              )}
            </div>
          )}

          {/* Empty state */}
          {wf.submissions.length === 0 && !(isAgent && (wf.status === WorkflowStatus.InProgress || wf.status === WorkflowStatus.RevisionRequested)) && (
            <div className="text-center py-8 text-gray-500 text-sm">
              No deliverables submitted yet.
            </div>
          )}
        </div>
      )}

      {/* ─── Activity Tab ────────────────────────────────────────────── */}
      {activeTab === "activity" && (
        <div className="space-y-2">
          {wf.activity.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No activity yet.</div>
          ) : (
            [...wf.activity].reverse().map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 py-2">
                <div className="w-7 h-7 rounded-full bg-gray-800/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className={`w-3.5 h-3.5 ${ACTOR_COLORS[entry.actor] || "text-gray-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={ACTIVITY_ICONS[entry.type] || ACTIVITY_ICONS.created} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300">{entry.message}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium capitalize ${ACTOR_COLORS[entry.actor]}`}>{entry.actor}</span>
                    <span className="text-[10px] text-gray-600">{timeAgo(entry.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
