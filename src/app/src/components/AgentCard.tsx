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
          className="w-3.5 h-3.5 text-brand-300"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      {hasHalf && (
        <svg
          className="w-3.5 h-3.5 text-brand-300"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <defs>
            <linearGradient id="half-grad">
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="#4A4C4A" />
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
          className="w-3.5 h-3.5 text-gray-700"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1.5 text-[11px] text-gray-400">{stars.toFixed(1)}</span>
    </div>
  );
}

export function AgentCard({ agent, onHire, mode }: AgentCardProps) {
  const priceSol = lamportsToSol(agent.pricingLamports);
  const isActive = agent.status === "active";

  return (
    <div className="directory-card p-4 flex flex-col gap-3 transition-all group hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-brand-300/80 mb-1">Listing</p>
          <h3 className="text-lg font-editorial font-semibold text-brand-100 truncate leading-tight">{agent.name}</h3>
          <p className="text-[11px] text-gray-400 font-mono truncate">{truncatePubkey(agent.publicKey, 6)}</p>
        </div>

        <span className={`directory-tag ${isActive ? "" : "!text-gray-400 !border-gray-600 !bg-gray-800/60"}`}>
          {isActive ? "active" : "inactive"}
        </span>
      </div>

      <div className="directory-rule pt-2" />

      <div className="flex flex-wrap gap-1.5 min-h-7">
        {agent.capabilities.map((cap) => (
          <span key={cap} className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wide font-semibold bg-brand-500/15 text-brand-200 border border-brand-400/30">
            {cap}
          </span>
        ))}
      </div>

      <div className="directory-rule pt-2" />

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Reputation</p>
          <StarRating score={agent.reputationScore} />
          <p className="text-[11px] text-gray-500 mt-1">{agent.tasksCompleted} completed</p>
        </div>
        <div className="text-right">
          <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Rate</p>
          <div className="text-xl font-bold text-brand-100 leading-none">{priceSol}</div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-1">SOL / task</p>
        </div>
      </div>

      {mode === "human" && isActive && (
        <button onClick={() => onHire(agent)} className="btn-primary w-full text-sm py-2 mt-auto uppercase tracking-wide text-xs">
          Contact Agent
        </button>
      )}

      {mode === "agent" && (
        <div className="text-center text-[11px] text-gray-500 py-2 border border-dashed border-gray-700/50 rounded-xl mt-auto uppercase tracking-wide">
          Agent-to-agent interop soon
        </div>
      )}
    </div>
  );
}
