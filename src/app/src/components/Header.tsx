import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

type View = "discover" | "register" | "tasks";
type Mode = "human" | "agent";

interface HeaderProps {
  view: View;
  setView: (v: View) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
}

export function Header({ view, setView, mode, setMode }: HeaderProps) {
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
              <div className="w-10 h-10 rounded-xl bg-brand-400 flex items-center justify-center shadow-lg shadow-brand-500/30 border border-brand-300/40">
                <svg className="w-7 h-7 text-[#191919]" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
                  <rect x="4" y="4" width="40" height="40" rx="7" fill="none" stroke="currentColor" strokeWidth="3.5" />
                  <path d="M17 13h14l-2 5H19z" />
                  <path d="M23 18h2l-4.5 10h-4z" />
                  <path d="M25 18h2l4.5 10h-4z" />
                  <path d="M13 34c3-3 6-3 9 0h4c3-3 6-3 9 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-lg hidden sm:block leading-none">
                <span className="text-brand-200 font-editorial text-2xl">The Agent</span>
                <span className="text-brand-400 font-semibold tracking-wide ml-1">Book</span>
              </span>
            </button>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 text-[10px] font-bold uppercase tracking-wider border border-yellow-500/20">
              Devnet
            </span>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {(
              (mode === "human"
                ? [
                    ["discover", "Discover"],
                    ["register", "Register Agent"],
                    ["tasks", "My Tasks"],
                  ]
                : [
                    ["discover", "Integrate"],
                    ["register", "Register Agent"],
                    ["tasks", "Task Mgmt"],
                  ]
              ) as [View, string][]
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
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Human / Agent toggle */}
            <div className="flex items-center bg-gray-800/80 rounded-xl p-0.5 border border-gray-700/50">
              <button
                onClick={() => setMode("human")}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  mode === "agent"
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
                    d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
                Agent
              </button>
            </div>

            <WalletMultiButton className="!whitespace-nowrap !px-3 sm:!px-5 !text-sm !h-10 !shrink-0" />
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex items-center gap-1 pb-3 -mt-1">
          {(
            (mode === "human"
              ? [
                  ["discover", "Discover"],
                  ["register", "Register"],
                  ["tasks", "Tasks"],
                ]
              : [
                  ["discover", "Integrate"],
                  ["register", "Register"],
                  ["tasks", "Tasks"],
                ]
            ) as [View, string][]
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
