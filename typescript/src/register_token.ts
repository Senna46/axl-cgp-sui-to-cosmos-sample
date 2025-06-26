// Token Registration Script for Interchain Token Service
// This script registers a coin with the Axelar Interchain Token Service (ITS)
// using the `register_coin` helper function from the `example::its` module.
//
// This registration only needs to be performed once for each token type.
// After successful execution, you can proceed with the transfer scripts.
//
// Pre-requisites:
// 1. The token (e.g., USDRISE) must be published, and its CoinMetadata object must be a shared object.
// 2. The `example::its` module must be deployed, and its package ID known.
// 3. The main ITS object ID must be known.

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bech32 } from "bech32";
import { Buffer } from "buffer";

// --- Configuration ---
// Replace with your actual values.
const NETWORK = "testnet"; // or 'mainnet', 'devnet'

// --- Package IDs ---
// This is the package for the `example::its` wrapper module.
const EXAMPLE_PACKAGE_ID =
    "0xe2ab24d80d9ec892dd09d3011ba183fcdfee3da67709a822c9ace64e8cc38d64";

// --- Object IDs ---
// This is the main ITS object ID.
const ITS_ID =
    "0x55fcd94e5293ff04c512a23c835d79b75e52611f66496e2d02cca439b84fa73c";
// This is the CoinMetadata object for the token you want to register (e.g., USDRISE).
// It's usually created and shared when the token is published.
// You MUST find and replace this with the correct CoinMetadata object ID for your token.
const TOKEN_METADATA_ID = "0xd4b19f5c7ea0a8b771278a1ecc55b032a3b9f868317befd3718d26b99a920ac1"; // e.g., "0x..."

// --- Token Information ---
// The full type of the token, used for the type argument.
const TOKEN_ADDRESS =
    "0x0b74ce4db0a011e589c011d3a9c36760f3ff6dcfb5c53f94e01a32fc95dd205d::usdrise::USDRISE";

// --- Private Key ---
const YOUR_PRIVATE_KEY_BASE64 =
    "suiprivkey1qzj2ldqyl49mudehyz99ppcae3deaw0l3l76dn0lcwgrfczc5t94qmde9ff";

// --- Helper Functions ---

function getSuiClient() {
    return new SuiClient({ url: getFullnodeUrl(NETWORK) });
}

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
        let decoded;
        if (privateKeyBase64.startsWith("suiprivkey1")) {
            decoded = bech32.decode(privateKeyBase64);
        } else {
            const tempKeyWithPrefix = bech32.encode(
                "suiprivkey",
                bech32.toWords(Buffer.from(privateKeyBase64, "base64"))
            );
            decoded = bech32.decode(tempKeyWithPrefix);
        }
        const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
        return Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(1));
    } catch (error) {
        throw new Error(
            `Failed to decode private key: ${error instanceof Error ? error.message : String(error)
            }`
        );
    }
}

/**
 * Registers a coin with the Interchain Token Service.
 */
async function registerToken() {
    const client = getSuiClient();
    const keypair = getKeypair(YOUR_PRIVATE_KEY_BASE64);
    const senderAddress = keypair.toSuiAddress();

    console.log(`Registering token ${TOKEN_ADDRESS} with ITS...`);
    console.log(`Signer Address: ${senderAddress}`);

    try {
        const tx = new Transaction();

        tx.moveCall({
            target: `${EXAMPLE_PACKAGE_ID}::its::register_coin`,
            typeArguments: [TOKEN_ADDRESS],
            arguments: [
                tx.object(ITS_ID),
                tx.object(TOKEN_METADATA_ID), // The CoinMetadata object for the token
            ],
        });

        console.log("Executing registration transaction...");
        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: {
                showEffects: true,
                showEvents: true,
            },
        });

        // Check for the registration event to get the tokenId
        const registrationEvent = result.events?.find((e) =>
            e.type.endsWith("::events::CoinRegistered")
        );

        if (registrationEvent) {
            const tokenId = (registrationEvent.parsedJson as any)?.token_id;
            console.log("✅ Token registration successful!");
            console.log(`   Transaction Digest: ${result.digest}`);
            console.log(`   Registered Token ID: ${tokenId}`);
            console.log("\nYou can now use this Token ID in your transfer scripts.");
        } else {
            console.warn(
                "⚠️ Registration transaction executed, but the CoinRegistered event was not found. Please verify the registration on-chain."
            );
            console.log(`   Transaction Digest: ${result.digest}`);
        }

        return result;
    } catch (error) {
        console.error("An error occurred during the token registration process.");
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

// --- Execution ---
registerToken().catch((error) => {
    console.error("Token registration script failed to execute.");
    if (error instanceof Error) {
        console.error(error.message);
    }
});
