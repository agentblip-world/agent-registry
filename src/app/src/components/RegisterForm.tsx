import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useRegisterAgent } from "../hooks/useRegistry";
import { ALL_CAPABILITIES } from "../lib/api";

interface RegisterFormProps {
  onSuccess: () => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { connected } = useWallet();
  const { loading, error, signature, execute, reset } = useRegisterAgent();

  const [name, setName] = useState("");
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [customCap, setCustomCap] = useState("");
  const [priceSol, setPriceSol] = useState("");
  const [metadataUri, setMetadataUri] = useState("");

  const toggleCap = (cap: string) => {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const addCustomCap = () => {
    const trimmed = customCap.trim().toLowerCase();
    if (trimmed && !selectedCaps.includes(trimmed) && selectedCaps.length < 8) {
      setSelectedCaps((prev) => [...prev, trimmed]);
      setCustomCap("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const priceLamports = Math.round(parseFloat(priceSol) * LAMPORTS_PER_SOL);

    try {
      await execute({
        name: name.trim(),
        capabilities: selectedCaps,
        pricingLamports: priceLamports,
        metadataUri: metadataUri.trim() || "https://arweave.net/placeholder",
      });
      onSuccess();
    } catch {
      // error is already in state
    }
  };

  const isValid =
    name.trim().length > 0 &&
    name.trim().length <= 64 &&
    selectedCaps.length > 0 &&
    selectedCaps.length <= 8 &&
    parseFloat(priceSol) > 0;

  // Quick-select capability groups
  const POPULAR_GROUPS = [
    "trading",
    "coding",
    "defi",
    "analytics",
    "security",
    "research",
    "automation",
    "email",
    "nft",
    "writing",
  ];

  if (signature) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 mb-6">
          <svg
            className="w-10 h-10 text-emerald-400"
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
        <h2 className="text-2xl font-bold text-white mb-2">
          Agent Registered!
        </h2>
        <p className="text-gray-400 mb-4">
          Your agent profile has been created on Solana devnet.
        </p>
        <a
          href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-400 hover:text-brand-300 text-sm font-mono underline"
        >
          View transaction on Solana Explorer
        </a>
        <div className="mt-8">
          <button onClick={onSuccess} className="btn-primary">
            View in Registry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
            Register Your Agent
          </span>
        </h1>
        <p className="text-gray-400">
          List your AI agent on the Solana registry for discovery and hiring.
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
                d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
              />
            </svg>
          </div>
          <p className="text-gray-300 font-medium text-lg mb-2">
            Connect your wallet to register
          </p>
          <p className="text-gray-500 text-sm mb-6">
            You need a Solana wallet connected to devnet to create an agent profile.
          </p>
          <WalletMultiButton />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6">
          {/* Agent Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Agent Name
              <span className="text-gray-600 ml-1 font-normal">
                ({name.length}/64)
              </span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 64))}
              placeholder="e.g. TradeBot Alpha"
              className="input-field"
              required
            />
          </div>

          {/* Capabilities */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Capabilities
              <span className="text-gray-600 ml-1 font-normal">
                ({selectedCaps.length}/8 selected)
              </span>
            </label>

            {/* Selected caps */}
            {selectedCaps.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedCaps.map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => toggleCap(cap)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-brand-500/20 text-brand-300 border border-brand-500/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-all"
                  >
                    {cap}
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* Quick-select grid */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {POPULAR_GROUPS.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => toggleCap(cap)}
                  disabled={
                    !selectedCaps.includes(cap) && selectedCaps.length >= 8
                  }
                  className={`chip transition-all text-[11px] ${
                    selectedCaps.includes(cap)
                      ? "chip-active"
                      : "hover:bg-brand-500/15 disabled:opacity-30"
                  }`}
                >
                  {cap}
                </button>
              ))}
            </div>

            {/* Custom capability input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customCap}
                onChange={(e) => setCustomCap(e.target.value.slice(0, 32))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomCap();
                  }
                }}
                placeholder="Add custom capability..."
                className="input-field text-sm"
              />
              <button
                type="button"
                onClick={addCustomCap}
                disabled={
                  !customCap.trim() || selectedCaps.length >= 8
                }
                className="btn-secondary text-sm px-4 whitespace-nowrap"
              >
                Add
              </button>
            </div>
          </div>

          {/* Pricing */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Price per Task (SOL)
            </label>
            <div className="relative">
              <input
                type="number"
                value={priceSol}
                onChange={(e) => setPriceSol(e.target.value)}
                placeholder="0.05"
                step="0.001"
                min="0.000000001"
                className="input-field pr-14"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">
                SOL
              </span>
            </div>
          </div>

          {/* Metadata URI */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Metadata URI
              <span className="text-gray-600 ml-1 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={metadataUri}
              onChange={(e) => setMetadataUri(e.target.value.slice(0, 200))}
              placeholder="https://arweave.net/your-agent-metadata"
              className="input-field text-sm"
            />
            <p className="text-xs text-gray-600 mt-1.5">
              Link to JSON metadata following the Agent Manifest schema
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
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
              <div>
                <p className="text-red-300 text-sm font-medium">
                  Transaction Failed
                </p>
                <p className="text-red-400/70 text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!isValid || loading}
            className="btn-primary w-full py-3 text-base"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
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
                Registering on Solana...
              </span>
            ) : (
              "Register Agent on Devnet"
            )}
          </button>

          <p className="text-center text-xs text-gray-600">
            This will create an on-chain agent profile PDA.
            A small SOL fee is required for account rent.
          </p>
        </form>
      )}
    </div>
  );
}
