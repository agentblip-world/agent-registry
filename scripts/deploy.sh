#!/bin/bash
# Deploy AgentRegistry to Solana devnet
# Usage: ./scripts/deploy.sh

set -e

SOLANA_BIN="$HOME/.local/share/solana/install/active_release/bin"
ANCHOR_BIN="$HOME/.cargo/bin"
export PATH="$ANCHOR_BIN:$SOLANA_BIN:/usr/bin:$PATH"
export CC=/usr/bin/cc

PROGRAM_ID="4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY"
SO_PATH="target/deploy/agent_registry.so"
KEYPAIR_PATH="target/deploy/agent_registry-keypair.json"

echo "=== AgentRegistry Devnet Deployment ==="
echo "Program ID: $PROGRAM_ID"
echo ""

# Check balance
BALANCE=$(solana balance --lamports 2>/dev/null | grep -oP '\d+')
echo "Wallet balance: $(echo "scale=4; $BALANCE / 1000000000" | bc) SOL"

if [ "$BALANCE" -lt 3000000000 ]; then
  echo "Insufficient balance. Need ~3 SOL for deployment."
  echo "Requesting airdrop..."
  solana airdrop 5 || {
    echo "Airdrop failed. Please visit https://faucet.solana.com to get devnet SOL."
    echo "Wallet: $(solana address)"
    exit 1
  }
fi

# Build if .so doesn't exist
if [ ! -f "$SO_PATH" ]; then
  echo "Building program..."
  cargo-build-sbf --manifest-path programs/agent-registry/Cargo.toml
fi

echo "Deploying $SO_PATH..."
solana program deploy \
  --program-id "$KEYPAIR_PATH" \
  "$SO_PATH" \
  --url https://api.devnet.solana.com

echo ""
echo "Deployment complete!"
echo "Program ID: $PROGRAM_ID"
echo "Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
