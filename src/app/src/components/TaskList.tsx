import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getMockTasks, getMockAgents, type TaskEscrow } from "../lib/api";
import { truncatePubkey } from "../lib/program";

interface TaskListProps {
  mode: "human" | "agent";
}

type TaskFilter = "all" | "funded" | "in_progress" | "completed";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  funded: {
    label: "Funded",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  in_progress: {
    label: "In Progress",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  completed: {
    label: "Completed",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  disputed: {
    label: "Disputed",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    color: "text-gray-400",
    bg: "bg-gray-800/50",
    border: "border-gray-700/50",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${config.bg} ${config.color} border ${config.border}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "in_progress"
            ? "bg-amber-400 animate-pulse"
            : status === "funded"
            ? "bg-blue-400"
            : status === "completed"
            ? "bg-emerald-400"
            : "bg-red-400"
        }`}
      />
      {config.label}
    </span>
  );
}

function TaskRow({ task }: { task: TaskEscrow }) {
  const agents = getMockAgents();
  const agent = agents.find((a) => a.publicKey === task.agent);
  const timeAgo = getTimeAgo(new Date(task.createdAt));

  return (
    <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      {/* Task info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-100 truncate">
            {task.taskId}
          </h3>
          <StatusBadge status={task.status} />
        </div>
        <p className="text-xs text-gray-500">
          Agent:{" "}
          <span className="text-gray-400">
            {agent?.name ?? truncatePubkey(task.agent, 6)}
          </span>
        </p>
        <p className="text-xs text-gray-600">{timeAgo}</p>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <div className="text-lg font-bold text-white">
          {task.amountSol}{" "}
          <span className="text-xs font-normal text-gray-400">SOL</span>
        </div>
        <p className="text-[10px] text-gray-600">
          {task.amountLamports.toLocaleString()} lamports
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        {task.status === "completed" && (
          <button className="btn-secondary text-xs px-3 py-1.5">
            Rate Agent
          </button>
        )}
        {task.status === "funded" && (
          <span className="text-xs text-gray-500 py-1.5">
            Waiting for agent...
          </span>
        )}
        {task.status === "in_progress" && (
          <span className="text-xs text-amber-400/70 py-1.5">
            Agent working...
          </span>
        )}
        <a
          href={`https://explorer.solana.com/address/${task.publicKey}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-800 transition-colors text-gray-500 hover:text-gray-300"
          title="View on Explorer"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TaskList({ mode }: TaskListProps) {
  const { connected } = useWallet();
  const [filter, setFilter] = useState<TaskFilter>("all");

  // In a real app, we'd fetch tasks for the connected wallet.
  // For the demo, we use mock data.
  const allTasks = getMockTasks();
  const tasks =
    filter === "all"
      ? allTasks
      : allTasks.filter((t) => t.status === filter);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
            {mode === "human" ? "My Tasks" : "Agent Tasks"}
          </span>
        </h1>
        <p className="text-gray-400">
          {mode === "human"
            ? "Track your task escrows and agent interactions."
            : "View tasks assigned to your agent."}
        </p>
      </div>

      {!connected ? (
        <div className="glass-card p-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/10 mb-4">
            <svg
              className="w-8 h-8 text-brand-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
              />
            </svg>
          </div>
          <p className="text-gray-300 font-medium text-lg mb-2">
            Connect wallet to view tasks
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Your tasks and escrow statuses will appear here.
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
                ["funded", "Funded"],
                ["in_progress", "In Progress"],
                ["completed", "Completed"],
              ] as [TaskFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === key
                    ? "bg-gray-800 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Demo data notice */}
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <svg
              className="w-4 h-4 text-amber-500/60 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            <p className="text-xs text-amber-400/60">
              Showing demo task data. Connect to devnet with tasks to see real data.
            </p>
          </div>

          {/* Task list */}
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No tasks match this filter.</p>
              </div>
            ) : (
              tasks.map((task) => <TaskRow key={task.publicKey} task={task} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
