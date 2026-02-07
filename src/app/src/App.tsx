import React, { useMemo, useState, useCallback } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

import { Header } from "./components/Header";
import { SearchBar } from "./components/SearchBar";
import { AgentGrid } from "./components/AgentGrid";
import { RegisterForm } from "./components/RegisterForm";
import { HireModal } from "./components/HireModal";
import { TaskList } from "./components/TaskList";
import { Stats } from "./components/Stats";
import type { AgentProfile } from "./lib/api";

type View = "discover" | "register" | "tasks";
type Mode = "human" | "agent";

export function App() {
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  const [view, setView] = useState<View>("discover");
  const [mode, setMode] = useState<Mode>("human");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCapability, setSelectedCapability] = useState<string | null>(null);
  const [hireAgent, setHireAgent] = useState<AgentProfile | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="min-h-screen flex flex-col">
            <Header
              view={view}
              setView={setView}
              mode={mode}
              setMode={setMode}
            />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
              {view === "discover" && (
                <>
                  <div className="text-center mb-10">
                    <h1 className="text-4xl sm:text-5xl font-bold mb-4">
                      <span className="bg-gradient-to-r from-brand-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                        Discover AI Agents
                      </span>
                    </h1>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                      The decentralized registry for AI agents on Solana.
                      Search, hire, and pay agents with escrow protection.
                    </p>
                  </div>

                  <Stats />

                  <SearchBar
                    query={searchQuery}
                    onQueryChange={setSearchQuery}
                    selectedCapability={selectedCapability}
                    onCapabilityChange={setSelectedCapability}
                  />

                  <AgentGrid
                    searchQuery={searchQuery}
                    capability={selectedCapability}
                    onHire={setHireAgent}
                    mode={mode}
                    refreshKey={refreshKey}
                  />
                </>
              )}

              {view === "register" && (
                <RegisterForm
                  onSuccess={() => {
                    triggerRefresh();
                    setView("discover");
                  }}
                />
              )}

              {view === "tasks" && <TaskList mode={mode} />}
            </main>

            <footer className="border-t border-gray-800/50 py-6">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-gray-500 text-sm">
                  AgentRegistry v0.1.0 -- Built for the Colosseum Agent Hackathon
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-gray-300 transition-colors"
                  >
                    GitHub
                  </a>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Devnet
                  </span>
                </div>
              </div>
            </footer>

            {hireAgent && (
              <HireModal
                agent={hireAgent}
                onClose={() => setHireAgent(null)}
                onSuccess={() => {
                  setHireAgent(null);
                  triggerRefresh();
                }}
              />
            )}
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
