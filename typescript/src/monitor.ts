// Axelar Transfer Monitoring Script
// This script monitors the status of a cross-chain transfer using the Axelar Scan API.
// It takes a Sui transaction hash as a command-line argument and provides details
// about the General Message Passing (GMP) status, including whether the transfer
// has been executed on the destination chain (Neutron).
//
// Usage:
// node dist/monitor.js <SUI_TRANSACTION_HASH>
import axios from "axios";

// --- Configuration ---
const AXELAR_API_BASE_URL = "https://testnet.axelarscan.io/api"; // Use 'https://axelarscan.io/api' for mainnet

/**
 * Validates the command-line arguments.
 * @returns The transaction hash if valid.
 * @throws If the transaction hash is not provided.
 */
function getTxHashFromArgs(): string {
  const txHash = process.argv[2];
  if (!txHash) {
    throw new Error(
      "Transaction hash not provided. Usage: node dist/monitor.js <SUI_TRANSACTION_HASH>"
    );
  }
  return txHash;
}

/**
 * Monitors the status of a GMP transfer on Axelar.
 * @param txHash - The source transaction hash from the Sui network.
 */
async function monitorTransfer(txHash: string) {
  console.log(`Monitoring transfer for transaction: ${txHash}`);
  const gmpUrl = `${AXELAR_API_BASE_URL}/gmp/${txHash}`;

  try {
    console.log(`Querying Axelar GMP API: ${gmpUrl}`);
    const response = await axios.get(gmpUrl);
    const gmpData = response.data;

    if (!gmpData) {
      console.log(
        "⏳ No data found yet. The transaction may still be propagating. Try again in a moment."
      );
      return;
    }

    console.log("\n--- GMP Transfer Status ---");
    console.log(`Status: ${gmpData.status}`);

    // Log source chain details
    if (gmpData.call) {
      const call = gmpData.call;
      console.log(`Source Chain: ${call.chain} (SUI)`);
      console.log(`   - Transaction Hash: ${call.transactionHash}`);
      console.log(
        `   - Gas Paid: ${gmpData.gas_paid?.amount || "N/A"} ${
          gmpData.gas_paid?.denom || ""
        }`
      );
    }

    // Log destination chain details
    if (gmpData.executed) {
      const executed = gmpData.executed;
      console.log(
        `\n✅ Executed on Destination Chain: ${executed.chain} (Neutron)`
      );
      console.log(`   - Transaction Hash: ${executed.transactionHash}`);
      console.log(
        `   - Gas Used: ${gmpData.gas_used?.amount || "N/A"} ${
          gmpData.gas_used?.denom || ""
        }`
      );
    } else if (gmpData.error) {
      console.log(`\n❌ Error during execution:`);
      console.log(JSON.stringify(gmpData.error, null, 2));
    } else {
      console.log(
        "\n⏳ Transfer is still pending execution on the destination chain."
      );
      console.log(
        "You can track the live status here:",
        `https://testnet.axelarscan.io/gmp/${txHash}`
      );
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.error(
        `Error: Transaction hash not found on Axelar. It might not have been indexed yet.`
      );
      console.error(`Please verify the hash and try again in a few moments.`);
    } else if (error instanceof Error) {
      console.error(
        `An error occurred while monitoring the transfer: ${error.message}`
      );
    } else {
      console.error("An unknown error occurred.", error);
    }
    throw error;
  }
}

// --- Main Execution ---
try {
  const txHash = getTxHashFromArgs();
  monitorTransfer(txHash).catch(() => {
    process.exit(1);
  });
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
}
