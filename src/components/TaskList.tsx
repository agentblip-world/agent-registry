import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWorkflows } from "../hooks/useWorkflows";
import { WorkflowStatus, type TaskWorkflow } from "../lib/workflow-types";
import { truncatePubkey } from "../lib/program";

interface TaskListProps {
  mode: "human" | "agent";
  onSelectTask?: (workflowId: string) => void;
  refreshKey?: number;
}

type TaskFilter = "all" | "active" | "completed" | "cancelled";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot?: string }> = {
  draft: { label: "Draft", color: "text-gray-400", bg: "bg-gray-800/50", border: "border-gray-700/50", dot: "bg-gray-400" },
  scope_review: { label: "Scope Review", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", dot: "bg-purple-400" },
  quote_review: { label: "Quote Review", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", dot: "bg-blue-400" },
  awaiting_escrow: { label: "Awaiting Escrow", color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20", dot: "bg-indigo-400" },
  in_progress: { label: "In Progress", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", dot: "bg-amber-400" },
  under_review: { label: "Under Review", color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20", dot: "bg-cyan-400" },
  revision_requested: { label: "Revision", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", dot: "bg-orange-400" },
  completed: { label: "Completed", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  cancelled: { label: "Cancelled", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", dot: "bg-red-400" },
  refunded: { label: "Refunded", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", dot: "bg-rose-400" },
  rated: { label: "Rated", color: "text-brand-400", bg: "bg-brand-500/10", border: "border-brand-500/20", dot: "bg-brand-400" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    color: "text-gray-400",
    bg: "bg-gray-800/50",
    border: "border-gray-700/50",
    dot: "bg-gray-400",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${config.bg} ${config.color} border ${config.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${status === "in_progress" ? "animate-pulse" : ""}`} />
      {config.label}
    </span>
  );
}

function getTimeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getSlaDisplay(wf: TaskWorkflow): string | null {
  if (wf.status !== WorkflowStatus.InProgress || !wf.slaStartedAt) return null;
  const totalHours = wf.slaHours + wf.slaExtendedCount * wf.slaHours;
  const expiresMs = new Date(wf.slaStartedAt).getTime() + totalHours * 3600_000;
  const remaining = expiresMs - Date.now();
  if (remaining <= 0) return "SLA breached";
  const h = Math.floor(remaining / 3600_000);
  const m = Math.floor((remaining % 3600_000) / 60_000);
  return `${h}h ${m}m left`;
}

const ACTIVE_STATUSES = new Set([
  WorkflowStatus.Draft,
  WorkflowStatus.ScopeReview,
  WorkflowStatus.QuoteReview,
  WorkflowStatus.AwaitingEscrow,
  WorkflowStatus.InProgress,
  WorkflowStatus.UnderReview,
  WorkflowStatus.RevisionRequested,
]);

const COMPLETED_STATUSES = new Set([WorkflowStatus.Completed, WorkflowStatus.Rated]);
const CANCELLED_STATUSES = new Set([WorkflowStatus.Cancelled, WorkflowStatus.Refunded]);

function TaskRow({ workflow: wf, onClick }: { workflow: TaskWorkflow; onClick?: () => void }) {
  const sla = getSlaDisplay(wf);

  return (
    <div
      onClick={onClick}
      className={`glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${onClick ? "cursor-pointer hover:bg-gray-800/40 transition-colors" : ""}`}
    >
      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-100 truncate">{wf.title}</h3>
          <StatusBadge status={wf.status} />
        </div>
        <p className="text-xs text-gray-500">
          Agent: <span className="text-gray-400">{wf.agentName}</span>
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span>{getTimeAgo(wf.updatedAt)}</span>
          {sla && (
            <span className={sla.includes("breached") ? "text-red-400" : "text-amber-400"}>
              {sla}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      {wf.quote && (
        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold text-gray-50">
            {wf.quote.quotedSol} <span className="text-xs font-normal text-gray-400">SOL</span>
          </div>
          <p className="text-[10px] text-gray-600">
            {wf.quote.quotedLamports.toLocaleString()} lamports
          </p>
        </div>
      )}

      {/* Arrow */}
      {onClick && (
        <svg className="w-5 h-5 text-gray-600 flex-shrink-0 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      )}
    </div>
  );
}

export function TaskList({ mode, onSelectTask, refreshKey }: TaskListProps) {
  const { connected, publicKey } = useWallet();
  const [filter, setFilter] = useState<TaskFilter>("all");

  const wallet = publicKey?.toBase58();
  const { workflows, loading } = useWorkflows({
    wallet,
    role: mode === "human" ? "client" : "agent",
    refreshKey,
  });

  const filtered = workflows.filter((wf) => {
    if (filter === "active") return ACTIVE_STATUSES.has(wf.status as WorkflowStatus);
    if (filter === "completed") return COMPLETED_STATUSES.has(wf.status as WorkflowStatus);
    if (filter === "cancelled") return CANCELLED_STATUSES.has(wf.status as WorkflowStatus);
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">
            {mode === "human" ? "My Tasks" : "Agent Tasks"}
          </span>
        </h1>
        <p className="text-gray-400">
          {mode === "human"
            ? "Track your task workflows and agent interactions."
            : "Manage tasks programmatically or view assigned tasks below."}
        </p>
      </div>

      {mode === "agent" && (
        <div className="glass-card p-5 mb-6">
          <h3 className="text-sm font-semibold text-brand-300 mb-3">Task Management API</h3>
          <pre className="text-xs font-mono text-gray-300 bg-gray-950/50 p-4 rounded-xl overflow-x-auto leading-relaxed whitespace-pre">{`// Accept a funded task
const ix1 = await program.methods.acceptTask()
  .accounts({
    taskEscrow: escrowPDA,
    agentProfile: agentPDA,
    agentOwner: wallet.publicKey,
  })
  .instruction();

// Complete task — SOL released from escrow to your wallet
const ix2 = await program.methods.completeTask()
  .accounts({
    taskEscrow: escrowPDA,
    agentProfile: agentPDA,
    agentOwner: wallet.publicKey,
  })
  .instruction();`}</pre>
          <p className="text-[10px] text-gray-600 mt-2">
            PDA: ["escrow", client_pubkey, task_id_bytes]
          </p>
        </div>
      )}

      {!connected ? (
        <div className="glass-card p-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/10 mb-4">
            <svg className="w-8 h-8 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <p className="text-gray-300 font-medium text-lg mb-2">
            Connect wallet to view tasks
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Your task workflows and escrow statuses will appear here.
          </p>
          <WalletMultiButton />
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex items-center gap-1 mb-6 bg-gray-900/50 p-1 rounded-xl w-fit">
            {(
              [
                ["all", "All"],
                ["active", "Active"],
                ["completed", "Completed"],
                ["cancelled", "Cancelled"],
              ] as [TaskFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === key
                    ? "bg-gray-800 text-gray-50 shadow-sm"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {label}
                {key === "all" && workflows.length > 0 && (
                  <span className="ml-1.5 text-[10px] text-gray-600">{workflows.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Task list */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading tasks...</div>
          ) : (
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No tasks match this filter.</p>
                </div>
              ) : (
                filtered.map((wf) => (
                  <TaskRow
                    key={wf.id}
                    workflow={wf}
                    onClick={onSelectTask ? () => onSelectTask(wf.id) : undefined}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
