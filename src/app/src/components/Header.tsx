import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

type View = "discover" | "register" | "tasks";
type Mode = "human" | "agent";

interface HeaderProps {
  view: View;
  setView: (v: View) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
}

export function Header({ view, setView, mode, setMode }: HeaderProps) {
  const { connected } = useWallet();

  return (
    <header className="sticky top-0 z-50 glass-card border-b border-gray-800/50 rounded-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("discover")}
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/25">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.591.659H9.061a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V5a2 2 0 00-2-2H7a2 2 0 00-2 2v9.5"
                  />
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight hidden sm:block">
                <span className="text-white">Agent</span>
                <span className="text-brand-400">Registry</span>
              </span>
            </button>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 text-[10px] font-bold uppercase tracking-wider border border-yellow-500/20">
              Devnet
            </span>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {(
              [
                ["discover", "Discover"],
                ["register", "Register Agent"],
                ["tasks", "My Tasks"],
              ] as [View, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === key
                    ? "bg-brand-500/15 text-brand-300"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Right side: Mode toggle + Wallet */}
          <div className="flex items-center gap-3">
            {/* Human / Agent toggle */}
            <div className="flex items-center bg-gray-800/80 rounded-xl p-0.5 border border-gray-700/50">
              <button
                onClick={() => setMode("human")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  mode === "human"
                    ? "bg-brand-600 text-white shadow-md"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"
                  />
                </svg>
                Human
              </button>
              <button
                onClick={() => setMode("agent")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  mode === "agent"
                    ? "bg-purple-600 text-white shadow-md"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <svg
                  className="w-3.5 h-3.5"
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
                Agent
              </button>
            </div>

            <WalletMultiButton />
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex items-center gap-1 pb-3 -mt-1">
          {(
            [
              ["discover", "Discover"],
              ["register", "Register"],
              ["tasks", "Tasks"],
            ] as [View, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-center transition-all ${
                view === key
                  ? "bg-brand-500/15 text-brand-300"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
