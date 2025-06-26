# USDRise Transfer Project (SUI to Neutron)

This project provides a complete implementation for minting a custom coin, USDRise, on the SUI blockchain and transferring it to the Neutron blockchain using Axelar's General Message Passing (GMP).

This project is generated based on the [USDRise to Neutron Transfer Guide](./USDRISE_TO_NEUTRON_TRANSFER_GUIDE.md).

## Project Structure

- `sui-project/`: Contains the Sui Move package for the USDRise coin and ITS integration.
- `typescript/`: Contains TypeScript scripts to manage setup, transfers, and monitoring.
- `neutron-project/`: Contains the CosmWasm contract to receive the USDRise on Neutron.
- `axelar-cgp-sui/`: Local clone of the Axelar CGP for Sui dependencies.

## Setup and Execution Summary

### Step 1: SUI Setup

1.  Navigate to the `sui-project` directory.
2.  Build and publish the Move package:
    ```bash
    sui move build
    sui client publish --gas-budget 100000000
    ```
3.  Update the placeholder `YOUR_PUBLISHED_PACKAGE_ID` in the TypeScript scripts with the new package ID.

### Step 2: TypeScript Setup

1.  Navigate to the `typescript` directory.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Update placeholders in `src/setup.ts` and `src/transfer.ts` (private keys, object IDs, etc.).
4.  Run the setup script to register the coin with the Interchain Token Service (ITS):
    ```bash
    npm run setup
    ```

### Step 3: Neutron Setup

1.  Navigate to `neutron-project/contracts/usdrise-receiver`.
2.  Build the CosmWasm contract:
    ```bash
    cargo build --release --target wasm32-unknown-unknown
    ```
3.  Execute the deployment script (ensure you have `neutrond` configured):
    ```bash
    chmod +x ../../scripts/deploy-neutron.sh
    ../../scripts/deploy-neutron.sh
    ```

### Step 4: Execute Transfer

1.  From the `typescript` directory, run the transfer script:
    ```bash
    npm run transfer
    ```
2.  Monitor the transaction status using the monitor script and the transaction hash from the previous step:
    ```bash
    node dist/monitor.js <transaction_hash>
    ```

## Important Notes

- **Testnet First**: Always validate the full flow on a testnet before deploying to mainnet.
- **Gas Fees**: Ensure you have sufficient SUI and NTRN tokens in your wallets for gas.
- **Security**: Manage your private keys securely and never commit them to version control.
