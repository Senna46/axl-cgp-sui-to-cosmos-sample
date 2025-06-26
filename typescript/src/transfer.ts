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
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bech32 } from "bech32";
import { Buffer } from "buffer";

// --- Configuration ---
// Replace with your actual values.
const NETWORK = "testnet"; // or 'mainnet', 'devnet'
const PACKAGE_ID =
  "0x0b74ce4db0a011e589c011d3a9c36760f3ff6dcfb5c53f94e01a32fc95dd205d";
const GATEWAY_PACKAGE_ID =
  "0x9fa2a40731cec14167664883a4439d333f283d54d19d8b2d189154a101f654b0"; // https://testnet.interchain.axelar.dev/sui/0x9fa2a40731cec14167664883a4439d333f283d54d19d8b2d189154a101f654b0
const TOKEN_ADDRESS =
  "0x0b74ce4db0a011e589c011d3a9c36760f3ff6dcfb5c53f94e01a32fc95dd205d::usdrise::USDRISE";
const TOKEN_ID =
  "0x373ea45898bd68fcd76c738cb2cedb97277e89d57c23f7ef2ac8d55b98a78bac"; // https://testnet.interchain.axelar.dev/sui/0x0b74ce4db0a011e589c011d3a9c36760f3ff6dcfb5c53f94e01a32fc95dd205d::usdrise::USDRISE
const TREASURY_CAP_ID =
  "0xe2505a26a73cd51f2855ac9216d06298b9388f1a07f2d4504ef801dd47db118d"; // From the setup script
// https://github.com/axelarnetwork/axelar-contract-deployments/blob/main/axelar-chains-config/info/testnet.json
const ITS_ID =
  "0xe7818984af6b3e322a6d999ca291a125fc3f82e13e5e6d9affc3a712f96bc7ce";
const GATEWAY_ID =
  "0x6ddfcdd14a1019d13485a724db892fa0defe580f19c991eaabd690140abb21e4";
const GAS_SERVICE_ID =
  "0xddf711b99aec5c72594e5cf2da4014b2d30909850a759d2e8090add1088dbbc9";
const YOUR_PRIVATE_KEY_BASE64 =
  "suiprivkey1qzj2ldqyl49mudehyz99ppcae3deaw0l3l76dn0lcwgrfczc5t94qmde9ff";

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
    const addressBytes = Buffer.from(bech32.fromWords(decoded.words));

    // 2. Create the transaction block
    const tx = new Transaction();

    // Create a new channel for this transfer
    const [channel] = tx.moveCall({
      target: `${GATEWAY_PACKAGE_ID}::channel::new`,
      arguments: [],
    });

    // 3. Mint the required amount of USDRise
    const [mintedCoin] = tx.moveCall({
      target: `${PACKAGE_ID}::usdrise::mint`,
      arguments: [
        tx.object(TREASURY_CAP_ID),
        tx.pure(bcs.u64().serialize(amount)),
        tx.pure(bcs.Address.serialize(keypair.toSuiAddress())),
      ],
    });

    // 4. Split SUI coin for gas payment on Axelar
    const [gasCoin] = tx.splitCoins(tx.gas, [
      tx.pure(bcs.u64().serialize(20_000_000)),
    ]); // 0.02 SUI for gas

    // 5. Call the transfer functions

    const [interchainTransferTicket] = tx.moveCall({
      target: `${ITS_ID}::interchain_token_service::prepare_interchain_transfer`,
      typeArguments: [TOKEN_ADDRESS],
      arguments: [
        tx.object(TOKEN_ID),
        mintedCoin,
        tx.pure(bcs.string().serialize("neutron")),
        tx.pure(bcs.vector(bcs.u8()).serialize(addressBytes)),
        tx.pure(bcs.vector(bcs.u8()).serialize([])), // metadata
        channel,
      ],
    });

    const [messageTicket] = tx.moveCall({
      target: `${ITS_ID}::interchain_token_service::send_interchain_transfer`,
      typeArguments: [TOKEN_ADDRESS],
      arguments: [
        tx.object(ITS_ID),
        interchainTransferTicket,
        tx.object("0x6"), // Sui Clock object
      ],
    });

    tx.moveCall({
      target: `${GAS_SERVICE_ID}::gas_service::pay_gas`,
      arguments: [
        tx.object(GAS_SERVICE_ID),
        messageTicket,
        gasCoin,
        tx.pure(bcs.Address.serialize(keypair.toSuiAddress())),
        tx.pure(bcs.vector(bcs.u8()).serialize([])), // gas_params
      ],
    });

    tx.moveCall({
      target: `${GATEWAY_ID}::gateway::send_message`,
      arguments: [tx.object(GATEWAY_ID), messageTicket],
    });

    // 6. Sign and execute the transaction
    console.log("Executing transaction...");
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
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
const exampleNeutronAddress = "neutron155u042u8wk3al32h3vzxu989jj76k4zcwg0u68";

transferUSDRiseToNeutron(exampleAmount, exampleNeutronAddress).catch(
  (error) => {
    console.error("Transfer script failed to execute.");
  }
);
