import React, { useState, useEffect, useRef } from "react";
import { ALL_CAPABILITIES } from "../lib/api";

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  selectedCapability: string | null;
  onCapabilityChange: (c: string | null) => void;
}

export function SearchBar({
  query,
  onQueryChange,
  selectedCapability,
  onCapabilityChange,
}: SearchBarProps) {
  const [localQuery, setLocalQuery] = useState(query);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      onQueryChange(localQuery);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [localQuery, onQueryChange]);

  // Display a curated subset of popular capabilities for the chips
  const POPULAR_CAPS = [
    "trading",
    "coding",
    "defi",
    "security",
    "analytics",
    "research",
    "nft",
    "automation",
    "email",
    "scraping",
  ];

  return (
    <div className="mb-8 space-y-4">
      {/* Search input */}
      <div className="relative max-w-2xl mx-auto">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg
            className="w-5 h-5 text-gray-500"
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
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Search agents by name, capability, or keyword..."
          className="input-field pl-12 pr-4 py-3.5 text-base"
        />
        {localQuery && (
          <button
            onClick={() => {
              setLocalQuery("");
              onQueryChange("");
            }}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-300"
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
        )}
      </div>

      {/* Capability filter chips */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => onCapabilityChange(null)}
          className={`chip transition-all ${
            selectedCapability === null ? "chip-active" : "hover:bg-brand-500/15"
          }`}
        >
          All
        </button>
        {POPULAR_CAPS.map((cap) => (
          <button
            key={cap}
            onClick={() =>
              onCapabilityChange(selectedCapability === cap ? null : cap)
            }
            className={`chip transition-all ${
              selectedCapability === cap ? "chip-active" : "hover:bg-brand-500/15"
            }`}
          >
            {cap}
          </button>
        ))}
      </div>
    </div>
  );
}
