#!/bin/bash

# deploy-neutron.sh
# This script builds, optimizes, and deploys the USDRise receiver CosmWasm contract to a Neutron network.
# It performs the following steps:
# 1. Sets configuration variables for the chain, node, and key.
# 2. Builds the contract in release mode for the wasm32 target.
# 3. Optimizes the compiled Wasm binary.
# 4. Stores the contract on the Neutron blockchain and captures the Code ID.
# 5. Instantiates the contract with an initial message and captures the Contract Address.
#
# IMPORTANT:
# - Update the KEY_NAME and other variables as needed for your environment.
# - Ensure `neutrond` is installed and configured with the specified key.
# - Ensure `cosmwasm-check` is installed for optimization.

set -e # Exit immediately if a command exits with a non-zero status.

# --- Configuration ---
CHAIN_ID="pion-1"  # Or "neutron-1" for mainnet
NODE="https://rpc-palvus.pion-1.ntrn.tech:443"
KEYRING_BACKEND="test"
KEY_NAME="your-key" # Replace with your key name in the keyring
AXELAR_GATEWAY_ADDRESS="neutron1...axelar_gateway_address" # Replace with the actual Axelar Gateway address on Neutron
CONTRACT_DIR="../contracts/usdrise-receiver"

# --- Build and Optimize ---
echo "Building CosmWasm contract..."
cd "$CONTRACT_DIR"
cargo build --release --target wasm32-unknown-unknown

# Check if cosmwasm-check is installed for optimization
if ! command -v cosmwasm-check &> /dev/null
then
    echo "Warning: cosmwasm-check could not be found. Skipping optimization."
    CONTRACT_WASM="target/wasm32-unknown-unknown/release/usdrise_receiver.wasm"
else
    echo "Optimizing contract..."
    cosmwasm-check target/wasm32-unknown-unknown/release/usdrise_receiver.wasm
    CONTRACT_WASM="target/wasm32-unknown-unknown/release/usdrise_receiver_check.wasm"
fi
cd ../../scripts # Return to the scripts directory

# --- Deploy ---
echo "Uploading contract to Neutron..."
UPLOAD_RESULT=$(neutrond tx wasm store "$CONTRACT_WASM" \
    --from "$KEY_NAME" \
    --chain-id "$CHAIN_ID" \
    --node "$NODE" \
    --keyring-backend "$KEYRING_BACKEND" \
    --gas auto \
    --gas-adjustment 1.3 \
    --fees 1000untrn \
    --output json -y)

echo "Upload result: $UPLOAD_RESULT"

# Extract Code ID from the JSON response
CODE_ID=$(echo "$UPLOAD_RESULT" | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')

if [ -z "$CODE_ID" ]; then
    echo "Error: Could not extract Code ID from the upload result."
    exit 1
fi
echo "✅ Contract uploaded successfully. Code ID: $CODE_ID"

# --- Instantiate ---
echo "Instantiating contract..."
INIT_MSG=$(printf '{"axelar_gateway":"%s"}' "$AXELAR_GATEWAY_ADDRESS")

INSTANTIATE_RESULT=$(neutrond tx wasm instantiate "$CODE_ID" "$INIT_MSG" \
    --from "$KEY_NAME" \
    --label "USDRise Receiver" \
    --admin "$(neutrond keys show "$KEY_NAME" -a --keyring-backend "$KEYRING_BACKEND")" \
    --chain-id "$CHAIN_ID" \
    --node "$NODE" \
    --keyring-backend "$KEYRING_BACKEND" \
    --gas auto \
    --gas-adjustment 1.3 \
    --fees 1000untrn \
    --output json -y)

echo "Instantiate result: $INSTANTIATE_RESULT"

# Extract Contract Address from the JSON response
CONTRACT_ADDRESS=$(echo "$INSTANTIATE_RESULT" | jq -r '.logs[0].events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value')

if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Error: Could not extract Contract Address from the instantiation result."
    exit 1
fi

echo "✅ Deployment successful!"
echo "   - Code ID: $CODE_ID"
echo "   - Contract Address: $CONTRACT_ADDRESS" 