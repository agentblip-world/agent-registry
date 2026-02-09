import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { AgentProfile } from "../lib/api";
import { useCreateTask } from "../hooks/useRegistry";
import { lamportsToSol, reputationToStars, truncatePubkey } from "../lib/program";

interface HireModalProps {
  agent: AgentProfile;
  onClose: () => void;
  onSuccess: () => void;
}

export function HireModal({ agent, onClose, onSuccess }: HireModalProps) {
  const { connected } = useWallet();
  const { loading, error, signature, execute, reset } = useCreateTask();
  const [taskId, setTaskId] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  const suggestedSol = lamportsToSol(agent.pricingLamports);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const amountSol = customAmount
    ? parseFloat(customAmount)
    : agent.pricingLamports / LAMPORTS_PER_SOL;
  const amountLamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  const isValid = taskId.trim().length > 0 && taskId.trim().length <= 64 && amountSol > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await execute({
        taskId: taskId.trim(),
        amountLamports,
        agentProfilePubkey: new PublicKey(agent.publicKey),
      });
    } catch {
      // error is in state
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="glass-card max-w-lg w-full p-0 overflow-hidden animate-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800/50">
          <h2 className="text-lg font-bold text-gray-50">Hire Agent</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-200"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {signature ? (
          /* Success view */
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mb-4">
              <svg
                className="w-8 h-8 text-emerald-400"
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
            </div>
            <h3 className="text-xl font-bold text-gray-50 mb-2">
              Task Created & Funded!
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              {amountSol} SOL escrowed for task "{taskId}"
            </p>
            <a
              href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-400 hover:text-brand-300 text-xs font-mono underline"
            >
              View on Solana Explorer
            </a>
            <div className="mt-6">
              <button onClick={onSuccess} className="btn-primary">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Agent summary */}
            <div className="p-5 bg-gray-800/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">
                    {agent.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-50 truncate">
                    {agent.name}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">
                    {truncatePubkey(agent.publicKey, 8)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-gray-50">
                    {suggestedSol} SOL
                  </div>
                  <p className="text-[10px] text-gray-500">suggested price</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {agent.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-brand-500/10 text-brand-400 border border-brand-500/15"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            {/* Form */}
            {!connected ? (
              <div className="p-8 text-center">
                <p className="text-gray-400 mb-4">
                  Connect your wallet to create and fund a task escrow.
                </p>
                <WalletMultiButton />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-5">
                {/* Task ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Task ID
                    <span className="text-gray-600 ml-1 font-normal">
                      (unique identifier)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={taskId}
                    onChange={(e) => setTaskId(e.target.value.slice(0, 64))}
                    placeholder="e.g. review-contract-001"
                    className="input-field text-sm"
                    required
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Amount (SOL)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder={suggestedSol}
                      step="0.001"
                      min="0.000000001"
                      className="input-field text-sm pr-14"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                      SOL
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Leave blank to use the agent's suggested price ({suggestedSol}{" "}
                    SOL)
                  </p>
                </div>

                {/* Escrow info box */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                  <svg
                    className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                    />
                  </svg>
                  <div className="text-xs text-gray-400">
                    <p className="font-medium text-gray-300">Escrow Protected</p>
                    <p className="mt-0.5">
                      Your SOL is held in a secure on-chain escrow PDA. It will be
                      released to the agent only upon task completion.
                    </p>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <svg
                      className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"
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
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isValid || loading}
                    className="btn-primary flex-1"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Confirming...
                      </span>
                    ) : (
                      `Fund Escrow (${customAmount || suggestedSol} SOL)`
                    )}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
