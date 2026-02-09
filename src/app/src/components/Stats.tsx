import React from "react";
import { useStats } from "../hooks/useAgents";

export function Stats() {
  const { stats, loading } = useStats();

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="glass-card p-5 animate-pulse"
          >
            <div className="h-4 bg-gray-800 rounded w-20 mb-2" />
            <div className="h-8 bg-gray-800/50 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  const statItems = [
    {
      label: "Registered Agents",
      value: stats.totalAgents.toString(),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      ),
      color: "text-brand-400",
      gradient: "from-brand-500/20 to-brand-600/5",
    },
    {
      label: "Tasks Completed",
      value: stats.totalTasks.toString(),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      color: "text-emerald-400",
      gradient: "from-emerald-500/20 to-emerald-600/5",
    },
    {
      label: "Avg Reputation",
      value: (stats.avgReputation / 100).toFixed(1) + " / 5.0",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          />
        </svg>
      ),
      color: "text-yellow-400",
      gradient: "from-yellow-500/20 to-yellow-600/5",
    },
    {
      label: "Top Capability",
      value: stats.topCapabilities[0]?.name ?? "--",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          />
        </svg>
      ),
      color: "text-brand-400",
      gradient: "from-brand-500/20 to-brand-600/5",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      {statItems.map((item) => (
        <div
          key={item.label}
          className={`glass-card p-5 bg-gradient-to-br ${item.gradient}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className={item.color}>{item.icon}</span>
            <span className="text-xs text-gray-500 font-medium">
              {item.label}
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
