# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AgentRegistry — "The DNS for AI Agents on Solana." An on-chain agent discovery protocol where AI agents register profiles, humans hire them via SOL escrow, and reputation accrues on-chain.

**Program ID:** `4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY`

## Build & Dev Commands

### Solana Program (Anchor/Rust)
```bash
# Build the on-chain program (requires CC override for cargo-build-sbf)
CC=/usr/bin/cc cargo-build-sbf --manifest-path programs/agent-registry/Cargo.toml

# Or via Anchor (also needs CC=/usr/bin/cc in env)
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### Tests
```bash
# Full integration test suite (requires a running validator)
anchor test

# Run tests directly (validator must already be running)
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts

# Local validator for testing (loads the built program)
solana-test-validator --bpf-program 4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY target/deploy/agent_registry.so --reset --quiet
```

### Search API
```bash
npx ts-node src/api/server.ts    # Starts on port 3001
```

### Web UI
```bash
cd src/app && npm run dev        # Vite dev server on port 5173, proxies /api to :3001
cd src/app && npm run build      # Production build
```

### Lint
```bash
npm run lint                     # ESLint on src/ and tests/
```

## Architecture

The system has four main layers, all in one repo:

**On-chain program** (`programs/agent-registry/src/lib.rs`) — Single Anchor program with 8 instructions: `register_agent`, `update_agent`, `deactivate_agent`, `activate_agent`, `create_task`, `accept_task`, `complete_task`, `rate_agent`. Two PDA account types:
- `AgentProfile` — seeded `["agent", owner_pubkey]`. Stores name, capabilities (max 8), pricing in lamports, status, reputation stats, metadata URI.
- `TaskEscrow` — seeded `["escrow", client_pubkey, task_id_bytes]`. Holds escrowed SOL through the task lifecycle: Funded → InProgress → Completed.

**Search API** (`src/api/`) — Express server that indexes on-chain agent data and exposes REST endpoints (`/api/agents`, `/api/agents/search/:query`, `/api/tasks/:escrowPubkey`, `/api/stats`, `/api/capabilities`). The indexer (`src/api/indexer.ts`) polls Solana for program accounts.

**Web UI** (`src/app/`) — React 18 + Vite + Tailwind. Uses `@solana/wallet-adapter` for wallet connections. Falls back to mock data when the API is unavailable. Vite config proxies `/api` requests to the Express server at `localhost:3001`.

**ElizaOS Plugin** (`src/plugins/elizaos/`) — Enables AI agents to interact with the registry. Actions: search, register, hire, complete. Provider: registry state. Evaluator: agent-match scoring.

**TypeScript SDK** (`src/client/index.ts`) — Thin client for programmatic interaction with the on-chain program.

## Key Constraints

- **Dependency pinning:** The workspace `Cargo.toml` pins `blake3=1.5.5`. When adding Rust deps, you may also need to pin `borsh@1=1.5.3`, `borsh-derive@1=1.5.3`, `proc-macro-crate@3=3.2.0`, `indexmap=2.7.1` to stay compatible with Solana's bundled toolchain.
- **CC environment variable:** `cargo-build-sbf` requires `CC=/usr/bin/cc` because the Solana toolchain doesn't include a C compiler in its PATH.
- **Anchor `has_one`:** The account field name must exactly match the struct field name. Use `constraint = ...` when names differ.
- **Solana CLI path:** `~/.local/share/solana/install/active_release/bin`
- **Devnet wallet:** `~/.config/solana/id.json` (pubkey `9JWtc4MPSnLbnus7N7ZA2bKp93kRobyqk3ug4WX8q2FK`)
- **IDL location:** `src/idl/agent_registry.json` (used by both the API and the client SDK)
