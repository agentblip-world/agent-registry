#!/bin/bash
# Deploy AgentRegistry to Solana devnet
# Usage: ./scripts/deploy.sh [--rpc <url>]
# Example: ./scripts/deploy.sh --rpc "https://devnet.helius-rpc.com/?api-key=YOUR_KEY"

set -e

SOLANA_BIN="$HOME/.local/share/solana/install/active_release/bin"
ANCHOR_BIN="$HOME/.cargo/bin"
export PATH="$ANCHOR_BIN:$SOLANA_BIN:/usr/bin:$PATH"
export CC=/usr/bin/cc

PROGRAM_ID="4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY"
SO_PATH="target/deploy/agent_registry.so"
KEYPAIR_PATH="target/deploy/agent_registry-keypair.json"

# Parse args
RPC_URL="https://api.devnet.solana.com"
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --rpc) RPC_URL="$2"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

echo "=== AgentRegistry Devnet Deployment ==="
echo "Program ID: $PROGRAM_ID"
echo "RPC: $RPC_URL"
echo ""

# Set cluster
solana config set --url "$RPC_URL" >/dev/null 2>&1

# Check balance
BALANCE=$(solana balance --lamports 2>/dev/null | grep -oP '\d+')
BALANCE_SOL=$(echo "scale=4; $BALANCE / 1000000000" | bc)
echo "Wallet balance: $BALANCE_SOL SOL"

if [ "$BALANCE" -lt 3000000000 ]; then
  echo ""
  echo "Insufficient balance. Need ~3 SOL for deployment."
  echo "Requesting airdrop..."
  solana airdrop 2 || {
    echo ""
    echo "Airdrop failed. Get devnet SOL from:"
    echo "  1. https://faucet.solana.com (2 req / 8 hrs)"
    echo "  2. Helius faucet (1 SOL / day per API key)"
    echo ""
    echo "Wallet: $(solana address)"
    exit 1
  }
  # Wait for confirmation
  sleep 5
fi

# Build if .so doesn't exist
if [ ! -f "$SO_PATH" ]; then
  echo "Building program..."
  cargo-build-sbf --manifest-path programs/agent-registry/Cargo.toml
fi

echo ""
echo "Deploying $SO_PATH..."
solana program deploy \
  --program-id "$KEYPAIR_PATH" \
  "$SO_PATH"

echo ""
echo "Deployment complete!"
echo "Program ID: $PROGRAM_ID"
echo "Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
