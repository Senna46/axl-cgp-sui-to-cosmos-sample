// USDRise Transfer Script using example::its::send_interchain_transfer_call
// This script executes the transfer of USDRise tokens from SUI to a specified Neutron address.
// It simplifies the transaction by using the `send_interchain_transfer_call` function from the `example::its` module.
// This wrapper function bundles several steps (prepare, send, pay gas) into a single on-chain call.
//
// Pre-requisites:
// 1. The `example::its` module must be deployed on the network.
// 2. The ID of the `Singleton` object created by the `example::its` module must be known.
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
const NETWORK: "mainnet" | "testnet" | "devnet" = "testnet"; // or 'mainnet', 'devnet'
const DESTINATION_CHAIN = "ethereum-sepolia"; // "neutron";

// --- Main Package IDs ---
// This is the package containing your token (e.g., USDRise)
const TOKEN_PACKAGE_ID =
    "0x0b74ce4db0a011e589c011d3a9c36760f3ff6dcfb5c53f94e01a32fc95dd205d";
// This is the Axelar ITS package
const ITS_PACKAGE_ID =
    "0xe7818984af6b3e322a6d999ca291a125fc3f82e13e5e6d9affc3a712f96bc7ce";
// This is the Axelar Gas Service package
const GAS_SERVICE_PACKAGE_ID =
    "0xddf711b99aec5c72594e5cf2da4014b2d30909850a759d2e8090add1088dbbc9";

// --- Example ITS Integration Package ID ---
// !!! IMPORTANT: Replace with the actual deployed package ID for the `example::its` module.
const EXAMPLE_PACKAGE_ID =
    "0xe2ab24d80d9ec892dd09d3011ba183fcdfee3da67709a822c9ace64e8cc38d64"; // e.g., "0x..."

// --- Object IDs ---
// This is the main ITS object
const ITS_ID =
    "0x55fcd94e5293ff04c512a23c835d79b75e52611f66496e2d02cca439b84fa73c";
// This is the Axelar Gateway object
const GATEWAY_ID =
    "0x6fc18d39a9d7bf46c438bdb66ac9e90e902abffca15b846b32570538982fb3db";
// This is the Axelar Gas Service object
const GAS_SERVICE_ID =
    "0xac1a4ad12d781c2f31edc2aa398154d53dbda0d50cb39a4319093e3b357bc27d";

// --- Singleton Object ID from `example::its` module ---
// !!! IMPORTANT: Replace with the ID of the shared `Singleton` object.
const SINGLETON_ID =
    "0xb05ef95bcc7f51f32af0647de0736f4d0e267b95ea464617cbd4e7ce39519023"; // e.g., "0x..."

// --- Token Information ---
const TOKEN_ADDRESS = `${TOKEN_PACKAGE_ID}::usdrise::USDRISE`;
const TOKEN_ID =
    "0x373ea45898bd68fcd76c738cb2cedb97277e89d57c23f7ef2ac8d55b98a78bac";

// --- Private Key ---
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
        let decoded;
        if (privateKeyBase64.startsWith("suiprivkey1")) {
            decoded = bech32.decode(privateKeyBase64);
        } else {
            // For raw base64, we need to add the prefix to decode
            const tempKeyWithPrefix = bech32.encode(
                "suiprivkey",
                bech32.toWords(Buffer.from(privateKeyBase64, "base64"))
            );
            decoded = bech32.decode(tempKeyWithPrefix);
        }
        const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
        // The first byte is the signature scheme flag (0 for Ed25519), followed by 32 bytes of the secret key.
        return Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(1));
    } catch (error) {
        throw new Error(
            `Failed to decode private key: ${error instanceof Error ? error.message : String(error)
            }`
        );
    }
}

/**
 * Executes the transfer of USDRise to a Neutron address using the example wrapper function.
 * @param amount - The amount of USDRise to transfer, in its smallest denomination.
 * @param address - The destination address on Neutron in bech32 format.
 * @throws If any step of the transfer process fails.
 */
async function transferUSDRiseToNeutronWithExample(
    amount: string,
    address: string
) {
    // Validate inputs
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0) {
        throw new Error("Invalid amount. Must be a positive integer string.");
    }
    // if (!neutronAddress.startsWith("neutron1")) {
    //     throw new Error("Invalid Neutron address. Must start with 'neutron1'.");
    // }

    const client = getSuiClient();
    const keypair = getKeypair(YOUR_PRIVATE_KEY_BASE64);
    const senderAddress = keypair.toSuiAddress();
    const amountBigInt = BigInt(amount);

    console.log(
        `Initiating transfer of ${amount} USDRise to ${address} via example::its...`
    );

    try {
        // Find a USDRISE coin object owned by the sender
        console.log(`Searching for USDRISE coins for address: ${senderAddress}...`);
        const { data: userCoins } = await client.getCoins({
            owner: senderAddress,
            coinType: TOKEN_ADDRESS,
        });

        if (userCoins.length === 0) {
            throw new Error(
                `No USDRISE coins found for address ${senderAddress}. Please mint some first.`
            );
        }

        const tx = new Transaction();

        // Prepare the coin for transfer, merging if necessary.
        const coinToSend = prepareTransferCoin(tx, userCoins, amountBigInt);

        // // For cosmos addresses,Decode Neutron address to byte array
        // const decoded = bech32.decode(address);
        // const addressBytes = Buffer.from(bech32.fromWords(decoded.words));
        // For Ethereum addresses, convert the hex string to a byte array.
        // The "0x" prefix must be removed.
        const addressBytes = Buffer.from(address.slice(2), "hex");

        // 1. Create the TokenId struct from the raw ID bytes.
        const [tokenIdArg] = tx.moveCall({
            target: `${ITS_PACKAGE_ID}::token_id::from_u256`,
            arguments: [tx.pure(bcs.u256().serialize(TOKEN_ID))],
        });

        // 2. Split SUI coin for gas payment on Axelar
        const [gasCoin] = tx.splitCoins(tx.gas, [
            tx.pure(bcs.u64().serialize(100_000_000)), // 0.1 SUI for gas (increased from 0.02 SUI)
        ]);

        // 3. Call the `send_interchain_transfer_call` wrapper function
        tx.moveCall({
            target: `${EXAMPLE_PACKAGE_ID}::its::send_interchain_transfer_call`,
            typeArguments: [TOKEN_ADDRESS],
            arguments: [
                tx.object(SINGLETON_ID),
                tx.object(ITS_ID),
                tx.object(GATEWAY_ID),
                tx.object(GAS_SERVICE_ID),
                tokenIdArg,
                coinToSend,
                tx.pure(bcs.string().serialize(DESTINATION_CHAIN)),
                tx.pure(bcs.vector(bcs.u8()).serialize(addressBytes)),
                tx.pure(bcs.vector(bcs.u8()).serialize([])), // metadata
                tx.pure(bcs.Address.serialize(keypair.toSuiAddress())), // refund_address
                gasCoin,
                tx.pure(bcs.vector(bcs.u8()).serialize([])), // gas_params
                tx.object("0x6"), // Sui Clock object
            ],
        });

        // 5. Sign and execute the transaction
        console.log("Executing transaction...");
        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: {
                showEffects: true,
                showEvents: true,
            },
        });

        console.log("✅ Transfer transaction successful!");
        console.log("   Transaction Digest:", result.digest);

        // Note: The GMP transaction hash might be in the events, but it depends on the wrapper's implementation.
        // For now, we link to the Sui transaction.
        console.log(
            `   Track on SuiScan: https://suiscan.xyz/${NETWORK}/tx/${result.digest}`
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

/**
 * Prepares a coin of a specific amount for transfer.
 * If a single coin with sufficient balance is not available, it merges multiple coins.
 * @param tx - The transaction block.
 * @param coins - The list of available coins for the token.
 * @param amount - The amount required for the transfer.
 * @returns A transaction argument representing the coin to be sent.
 */
function prepareTransferCoin(
    tx: Transaction,
    coins: { coinObjectId: string; balance: string }[],
    amount: bigint
): ReturnType<typeof tx.splitCoins>[0] {
    const totalBalance = coins.reduce(
        (acc, coin) => acc + BigInt(coin.balance),
        BigInt(0)
    );

    if (totalBalance < amount) {
        throw new Error(
            `Insufficient USDRISE balance. Required: ${amount}, Total available: ${totalBalance}.`
        );
    }

    // Attempt to find a single coin that can cover the amount
    const primaryCoin = coins.find((coin) => BigInt(coin.balance) >= amount);

    if (primaryCoin) {
        console.log(
            `Found a single coin with sufficient balance: ${primaryCoin.coinObjectId}`
        );
        // If a single large enough coin is found, just split it
        return tx.splitCoins(tx.object(primaryCoin.coinObjectId), [
            tx.pure(bcs.u64().serialize(amount)),
        ])[0];
    } else {
        // If no single coin is large enough, merge them
        console.log("No single coin is large enough. Merging coins...");
        const [firstCoin, ...otherCoins] = coins;
        const primaryCoinObject = tx.object(firstCoin.coinObjectId);
        const otherCoinObjects = otherCoins.map((coin) =>
            tx.object(coin.coinObjectId)
        );

        tx.mergeCoins(primaryCoinObject, otherCoinObjects);
        console.log(`Merged ${coins.length} coins into ${firstCoin.coinObjectId}`);

        // After merging, the primary coin will have the total balance, so we can split from it
        return tx.splitCoins(primaryCoinObject, [
            tx.pure(bcs.u64().serialize(amount)),
        ])[0];
    }
}

// --- Execution Example ---
// Replace with the actual amount and destination address before running.
const exampleAmount = "1000000"; // 1 USDRise (assuming 6 decimals)
const exampleNeutronAddress = "0x4793755541Ae9f950a68Fc7fc2B3BD2CC9397b9A"; // "neutron155u042u8wk3al32h3vzxu989jj76k4zcwg0u68";

transferUSDRiseToNeutronWithExample(exampleAmount, exampleNeutronAddress).catch(
    (error) => {
        console.error("Transfer script failed to execute.");
        if (error instanceof Error) {
            console.error(error.message);
        }
    }
);
