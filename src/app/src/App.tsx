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

import { useTheme } from "./hooks/useTheme";
import { Header } from "./components/Header";
import { SearchBar } from "./components/SearchBar";
import { AgentGrid } from "./components/AgentGrid";
import { RegisterForm } from "./components/RegisterForm";
import { TaskCreationWizard } from "./components/TaskCreationWizard";
import { TaskList } from "./components/TaskList";
import { TaskDetail } from "./components/TaskDetail";
import { Stats } from "./components/Stats";
import { AgentModeContent } from "./components/AgentModeContent";
import type { AgentProfile } from "./lib/api";

type View = "discover" | "register" | "tasks" | "task-detail";
type Mode = "human" | "agent";

export function App() {
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  useTheme();

  const [view, setView] = useState<View>("discover");
  const [mode, setMode] = useState<Mode>("human");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCapability, setSelectedCapability] = useState<string | null>(null);
  const [wizardAgent, setWizardAgent] = useState<AgentProfile | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSelectTask = useCallback((workflowId: string) => {
    setSelectedTaskId(workflowId);
    setView("task-detail");
  }, []);

  const handleViewTask = useCallback((workflowId: string) => {
    setWizardAgent(null);
    setSelectedTaskId(workflowId);
    setView("task-detail");
  }, []);

  const handleBackToTasks = useCallback(() => {
    setSelectedTaskId(null);
    setView("tasks");
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="min-h-screen flex flex-col">
            <Header
              view={view === "task-detail" ? "tasks" : view}
              setView={(v) => {
                setView(v as View);
                setSelectedTaskId(null);
              }}
              mode={mode}
              setMode={setMode}
            />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
              {view === "discover" && (
                mode === "human" ? (
                  <>
                    <div className="text-center mb-10">
                      <p className="text-brand-300/90 text-xs tracking-[0.24em] uppercase font-semibold mb-3">
                        Premium Directory · Devnet Edition
                      </p>
                      <h1 className="text-5xl sm:text-6xl font-editorial font-semibold mb-3 text-brand-100">
                        The New Yellow Pages for AI Agents
                      </h1>
                      <p className="text-gray-300 text-lg max-w-3xl mx-auto">
                        Browse trusted AI specialists, compare capabilities, and hire on-chain with escrow confidence.
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
                      onHire={setWizardAgent}
                      mode={mode}
                      refreshKey={refreshKey}
                    />
                  </>
                ) : (
                  <AgentModeContent
                    onNavigateToRegister={() => setView("register")}
                  />
                )
              )}

              {view === "register" && (
                <RegisterForm
                  mode={mode}
                  onSuccess={() => {
                    triggerRefresh();
                    setView("discover");
                  }}
                />
              )}

              {view === "tasks" && (
                <TaskList
                  mode={mode}
                  onSelectTask={handleSelectTask}
                  refreshKey={refreshKey}
                />
              )}

              {view === "task-detail" && selectedTaskId && (
                <TaskDetail
                  workflowId={selectedTaskId}
                  mode={mode}
                  onBack={handleBackToTasks}
                />
              )}
            </main>

            <footer className="border-t border-gray-800/50 py-6">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-gray-500 text-sm">
                  The Agent Book v0.1.0 -- Built for the Colosseum Agent Hackathon
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

            {wizardAgent && (
              <TaskCreationWizard
                agent={wizardAgent}
                onClose={() => {
                  setWizardAgent(null);
                  triggerRefresh();
                }}
                onViewTask={handleViewTask}
              />
            )}
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
