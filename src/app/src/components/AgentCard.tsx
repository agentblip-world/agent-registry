import React from "react";
import type { AgentProfile } from "../lib/api";
import { lamportsToSol, reputationToStars, truncatePubkey } from "../lib/program";

interface AgentCardProps {
  agent: AgentProfile;
  onHire: (agent: AgentProfile) => void;
  mode: "human" | "agent";
}

function StarRating({ score }: { score: number }) {
  const stars = reputationToStars(score);
  const fullStars = Math.floor(stars);
  const hasHalf = stars - fullStars >= 0.3;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: fullStars }).map((_, i) => (
        <svg
          key={`full-${i}`}
          className="w-4 h-4 text-yellow-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      {hasHalf && (
        <svg
          className="w-4 h-4 text-yellow-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <defs>
            <linearGradient id="half-grad">
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="#374151" />
            </linearGradient>
          </defs>
          <path
            fill="url(#half-grad)"
            d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
          />
        </svg>
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <svg
          key={`empty-${i}`}
          className="w-4 h-4 text-gray-700"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1.5 text-xs text-gray-400">
        {stars.toFixed(1)}
      </span>
    </div>
  );
}

export function AgentCard({ agent, onHire, mode }: AgentCardProps) {
  const priceSol = lamportsToSol(agent.pricingLamports);
  const isActive = agent.status === "active";

  return (
    <div className="glass-card gradient-border p-5 flex flex-col gap-4 hover:bg-gray-800/40 transition-all group">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center flex-shrink-0 shadow-lg shadow-brand-500/20">
            <span className="text-white font-bold text-sm">
              {agent.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-100 truncate">
              {agent.name}
            </h3>
            <p className="text-xs text-gray-500 font-mono truncate">
              {truncatePubkey(agent.publicKey, 6)}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <span
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border flex-shrink-0 ${
            isActive
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-gray-700/50 text-gray-500 border-gray-600/30"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isActive ? "bg-emerald-400 animate-pulse" : "bg-gray-600"
            }`}
          />
          {isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1.5">
        {agent.capabilities.map((cap) => (
          <span
            key={cap}
            className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-brand-500/8 text-brand-300 border border-brand-500/15"
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-800/50">
        <div className="space-y-1">
          <StarRating score={agent.reputationScore} />
          <p className="text-xs text-gray-500">
            {agent.tasksCompleted} task{agent.tasksCompleted !== 1 ? "s" : ""}{" "}
            completed
          </p>
        </div>

        <div className="text-right">
          <div className="text-lg font-bold text-white">
            {priceSol}{" "}
            <span className="text-xs font-normal text-gray-400">SOL</span>
          </div>
          <p className="text-[10px] text-gray-600">per task</p>
        </div>
      </div>

      {/* Action button */}
      {mode === "human" && isActive && (
        <button
          onClick={() => onHire(agent)}
          className="btn-primary w-full text-sm py-2 mt-auto"
        >
          Hire Agent
        </button>
      )}

      {mode === "agent" && (
        <div className="text-center text-xs text-gray-500 py-2 border border-dashed border-gray-700/50 rounded-xl mt-auto">
          Agent-to-agent interop coming soon
        </div>
      )}
    </div>
  );
}
