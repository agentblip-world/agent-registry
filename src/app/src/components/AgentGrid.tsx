import React from "react";
import { useAgents } from "../hooks/useAgents";
import { AgentCard } from "./AgentCard";
import type { AgentProfile } from "../lib/api";

interface AgentGridProps {
  searchQuery: string;
  capability: string | null;
  onHire: (agent: AgentProfile) => void;
  mode: "human" | "agent";
  refreshKey: number;
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="glass-card p-5 space-y-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gray-800" />
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-gray-800 rounded w-3/4" />
              <div className="h-3 bg-gray-800/50 rounded w-1/2" />
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="h-5 bg-gray-800/50 rounded-md w-16" />
            <div className="h-5 bg-gray-800/50 rounded-md w-12" />
            <div className="h-5 bg-gray-800/50 rounded-md w-20" />
          </div>
          <div className="h-px bg-gray-800/50" />
          <div className="flex justify-between">
            <div className="h-4 bg-gray-800/50 rounded w-24" />
            <div className="h-6 bg-gray-800/50 rounded w-16" />
          </div>
          <div className="h-9 bg-gray-800/30 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function AgentGrid({
  searchQuery,
  capability,
  onHire,
  mode,
  refreshKey,
}: AgentGridProps) {
  const { agents, total, loading, error, isMock } = useAgents({
    searchQuery,
    capability,
    refreshKey,
  });

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error && agents.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-4">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <p className="text-gray-400 text-lg font-medium">
          Failed to load agents
        </p>
        <p className="text-gray-600 text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-800/50 mb-4">
          <svg
            className="w-8 h-8 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>
        <p className="text-gray-400 text-lg font-medium">No agents found</p>
        <p className="text-gray-600 text-sm mt-1">
          Try adjusting your search or filters
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Results header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          Showing{" "}
          <span className="text-gray-300 font-medium">{agents.length}</span> of{" "}
          <span className="text-gray-300 font-medium">{total}</span> agents
          {isMock && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Demo Data
            </span>
          )}
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {agents.map((agent) => (
          <AgentCard
            key={agent.publicKey}
            agent={agent}
            onHire={onHire}
            mode={mode}
          />
        ))}
      </div>
    </div>
  );
}
