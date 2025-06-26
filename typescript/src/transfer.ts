// USDRise Transfer Script
// This script executes the transfer of USDRise tokens from SUI to a specified Neutron address.
// It performs the following steps:
// 1. Decodes the destination Neutron address from bech32 format to a byte array.
// 2. Constructs a transaction block to:
//    a. Mint the specified amount of USDRise tokens.
//    b. Split a small amount of SUI from the gas coin to pay for Axelar network fees.
//    c. Call the 'transfer_usdrise_to_neutron' function from the 'its_integration' module.
// 3. Signs and executes the transaction.
// 4. Logs the transaction digest and a link to the Axelar Scan explorer for monitoring.
//
// All configuration values are placeholders and must be replaced with actual values.
import {
  SuiClient,
  getFullnodeUrl,
  TransactionBlock,
  Ed25519Keypair,
} from "@mysten/sui";
import { bech32 } from "bech32";
import { Buffer } from "buffer";

// --- Configuration ---
// Replace with your actual values.
const NETWORK = "testnet"; // or 'mainnet', 'devnet'
const PACKAGE_ID = "YOUR_PUBLISHED_PACKAGE_ID";
const TOKEN_ID = "YOUR_TOKEN_ID"; // From the setup script
const TREASURY_CAP_ID = "YOUR_TREASURY_CAP_ID"; // From the setup script
const ITS_ID = "YOUR_ITS_SHARED_OBJECT_ID";
const GATEWAY_ID = "YOUR_GATEWAY_SHARED_OBJECT_ID";
const GAS_SERVICE_ID = "YOUR_GAS_SERVICE_SHARED_OBJECT_ID";
const CHANNEL_ID = "YOUR_CHANNEL_ID"; // May not be required for all versions, check contract
const YOUR_PRIVATE_KEY_BASE64 = "YOUR_SUI_PRIVATE_KEY_IN_BASE64";

// --- Helper Functions ---

/**
 * Creates a SuiClient instance for the specified network.
 * @returns A SuiClient instance.
 */
function getSuiClient() {
  return new SuiClient({ url: getFullnodeUrl(NETWORK) });
}

/**
 * Creates a keypair from a Base64 encoded private key.
 * @param privateKeyBase64 - The Base64 encoded private key.
 * @returns An Ed25519Keypair instance.
 * @throws If the private key is invalid.
 */
function getKeypair(privateKeyBase64: string): Ed25519Keypair {
  if (
    privateKeyBase64 === "YOUR_SUI_PRIVATE_KEY_IN_BASE64" ||
    !privateKeyBase64
  ) {
    throw new Error(
      "Invalid private key. Please replace 'YOUR_SUI_PRIVATE_KEY_IN_BASE64' in the script."
    );
  }
  try {
    const privateKeyBytes = Buffer.from(privateKeyBase64, "base64");
    return Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(1));
  } catch (error) {
    throw new Error(
      `Failed to decode private key: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Executes the transfer of USDRise to a Neutron address.
 * @param amount - The amount of USDRise to transfer, in its smallest denomination (e.g., 1000000 for 1 USDRISE with 6 decimals).
 * @param neutronAddress - The destination address on Neutron in bech32 format (e.g., "neutron1...").
 * @throws If any step of the transfer process fails.
 */
async function transferUSDRiseToNeutron(
  amount: string,
  neutronAddress: string
) {
  // Validate inputs
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0) {
    throw new Error("Invalid amount. Must be a positive integer string.");
  }
  if (!neutronAddress.startsWith("neutron1")) {
    throw new Error("Invalid Neutron address. Must start with 'neutron1'.");
  }

  const client = getSuiClient();
  const keypair = getKeypair(YOUR_PRIVATE_KEY_BASE64);

  console.log(
    `Initiating transfer of ${amount} USDRise to ${neutronAddress}...`
  );

  try {
    // 1. Decode Neutron address to byte array
    const decoded = bech32.decode(neutronAddress);
    const addressBytes = bech32.fromWords(decoded.words);

    // 2. Create the transaction block
    const tx = new TransactionBlock();

    // 3. Mint the required amount of USDRise
    const [mintedCoin] = tx.moveCall({
      target: `${PACKAGE_ID}::usdrise::mint`,
      arguments: [
        tx.object(TREASURY_CAP_ID),
        tx.pure(amount),
        tx.pure(keypair.toSuiAddress()),
      ],
    });

    // 4. Split SUI coin for gas payment on Axelar
    const [gasCoin] = tx.splitCoins(tx.gas, [tx.pure(1_000_000_000)]); // 1 SUI for gas

    // 5. Call the transfer function
    tx.moveCall({
      target: `${PACKAGE_ID}::its_integration::transfer_usdrise_to_neutron`,
      arguments: [
        tx.object(ITS_ID),
        tx.object(GATEWAY_ID),
        tx.object(GAS_SERVICE_ID),
        tx.object(CHANNEL_ID),
        tx.pure(TOKEN_ID),
        mintedCoin,
        tx.pure(Array.from(addressBytes)),
        gasCoin,
        tx.object("0x6"), // Sui Clock object
      ],
    });

    // 6. Sign and execute the transaction
    console.log("Executing transaction...");
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });

    console.log("✅ Transfer transaction successful!");
    console.log("   Transaction Digest:", result.digest);
    console.log(
      `   Track on Axelar Scan: https://${NETWORK}.axelarscan.io/gmp/${result.digest}`
    );

    return result;
  } catch (error) {
    console.error("An error occurred during the transfer process.");
    if (error instanceof Error) {
      console.error(`Error details: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error("Unknown error:", error);
    }
    throw error;
  }
}

// --- Execution Example ---
// Replace with the actual amount and destination address before running.
const exampleAmount = "1000000"; // 1 USDRise (assuming 6 decimals)
const exampleNeutronAddress = "neutron1your_neutron_address_here";

transferUSDRiseToNeutron(exampleAmount, exampleNeutronAddress).catch(
  (error) => {
    console.error("Transfer script failed to execute.");
  }
);
