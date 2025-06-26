// USDRise Setup Script
// This script handles the initial setup for the USDRise coin on the SUI blockchain.
// It performs the following steps:
// 1. Prompts the user to publish the Sui package manually.
// 2. Fetches the deployed TreasuryCap and CoinMetadata objects for USDRise.
// 3. Builds and executes a transaction to register the USDRise coin with the
//    Axelar Interchain Token Service (ITS) using the 'register_usdrise_with_cap' function.
// 4. Parses the transaction events to find and log the newly generated TokenId.
//
// All configuration values are placeholders and must be replaced with actual values.
import {
  SuiClient,
  getFullnodeUrl,
  SuiObjectResponse,
  SuiEvent,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Buffer } from "buffer";

// --- Configuration ---
// Replace with your actual values.
const NETWORK = "testnet"; // or 'mainnet', 'devnet'
const PACKAGE_ID = "YOUR_PUBLISHED_PACKAGE_ID";
const ITS_ID = "YOUR_ITS_SHARED_OBJECT_ID"; // e.g., from https://docs.axelar.dev/resources/testnet-contracts
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
    const privateKeyBytes = Buffer.from(
      privateKeyBase64.startsWith("suiprivkey1")
        ? privateKeyBase64.slice(10)
        : privateKeyBase64,
      "base64"
    );
    // Sui expects a 32-byte private key for Ed25519, and the first byte is a flag.
    return Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(1));
  } catch (error) {
    throw new Error(
      `Failed to decode private key for 'getKeypair': ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Main function to set up the USDRise coin.
 */
async function setupUSDRise() {
  if (PACKAGE_ID === "YOUR_PUBLISHED_PACKAGE_ID") {
    console.error(
      "Error: Please replace 'YOUR_PUBLISHED_PACKAGE_ID' with your actual package ID."
    );
    console.log(
      "You can get the package ID after running: sui client publish --gas-budget 100000000"
    );
    return;
  }

  const client = getSuiClient();
  const keypair = getKeypair(YOUR_PRIVATE_KEY_BASE64);
  const senderAddress = keypair.toSuiAddress();

  console.log(`Using sender address: ${senderAddress}`);

  try {
    // 1. Fetch TreasuryCap and CoinMetadata object IDs
    console.log(`Fetching objects for package: ${PACKAGE_ID}...`);
    const objects = await client.getOwnedObjects({
      owner: senderAddress,
      filter: { StructType: `${PACKAGE_ID}::usdrise::USDRISE` },
      options: { showType: true, showContent: true },
    });

    const treasuryCap = objects.data.find((obj: SuiObjectResponse) =>
      obj.data?.type?.includes("TreasuryCap<")
    );
    const coinMetadata = objects.data.find((obj: SuiObjectResponse) =>
      obj.data?.type?.includes("CoinMetadata<")
    );

    if (!treasuryCap || !treasuryCap.data?.objectId) {
      throw new Error(
        `Could not find TreasuryCap for package ${PACKAGE_ID} owned by ${senderAddress}. Ensure the package is published correctly.`
      );
    }
    if (!coinMetadata || !coinMetadata.data?.objectId) {
      throw new Error(
        `Could not find CoinMetadata for package ${PACKAGE_ID} owned by ${senderAddress}.`
      );
    }

    console.log("Found Treasury Cap ID:", treasuryCap.data.objectId);
    console.log("Found Coin Metadata ID:", coinMetadata.data.objectId);

    // 2. Build the transaction to register USDRise with ITS
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::its_integration::register_usdrise_with_cap`,
      arguments: [
        tx.object(ITS_ID),
        tx.object(coinMetadata.data.objectId),
        tx.object(treasuryCap.data.objectId),
      ],
    });

    console.log("Executing transaction to register USDRise with ITS...");
    const registerResult = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: { showEffects: true, showEvents: true },
    });

    console.log(
      "USDRise registration transaction successful. Digest:",
      registerResult.digest
    );

    // 3. Find the TokenID from the events
    const events = registerResult.events || [];
    const tokenRegisteredEvent = events.find((event: SuiEvent) =>
      event.type.includes("interchain_token_service::CoinRegistered")
    );

    if (tokenRegisteredEvent && tokenRegisteredEvent.parsedJson) {
      const tokenId = (tokenRegisteredEvent.parsedJson as { token_id?: string })
        .token_id;
      if (tokenId) {
        console.log("✅ Successfully registered coin!");
        console.log("   Token ID:", tokenId);
      } else {
        console.warn(
          "Warning: CoinRegistered event found, but could not parse token_id.",
          tokenRegisteredEvent.parsedJson
        );
      }
    } else {
      console.warn(
        "Warning: Could not find CoinRegistered event. Please check the transaction events manually."
      );
      console.log("Full events:", JSON.stringify(events, null, 2));
    }
  } catch (error) {
    console.error("An error occurred during the setup process.");
    if (error instanceof Error) {
      console.error(`Error details: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error("Unknown error:", error);
    }
  }
}

// Execute the setup function
setupUSDRise().catch((error) => {
  console.error("Setup script failed:", error.message);
});
