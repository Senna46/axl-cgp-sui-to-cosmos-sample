// USDRise Receiver CosmWasm Contract
// This contract is deployed on Neutron to receive USDRise tokens sent from Sui via Axelar.
//
// Main functionalities:
// - Instantiate: Initializes the contract and stores the Axelar Gateway address for security verification.
// - Execute: Handles incoming messages from the Axelar Gateway. It's designed to process a payload
//   containing token transfer details.
// - Payload Decoding: Includes a placeholder function to decode the Interchain Token Service (ITS)
//   payload, which would contain the final recipient address and the amount of tokens.
// - Token Distribution: After verifying the message source and decoding the payload, it would
//   initiate a bank transfer to send the corresponding tokens to the recipient on Neutron.
//
// Note: The payload decoding and sender verification logic are critical for security and are
// currently implemented as placeholders. A production implementation would require a robust
// ABI decoding library and strict validation that the sender is the legitimate Axelar Gateway.
use cosmwasm_std::{
    entry_point, to_binary, Addr, BankMsg, Binary, Coin as CosmosCoin, Deps, DepsMut, Env,
    MessageInfo, Response, StdError, StdResult, Uint128,
};
use cw2::set_contract_version;
use serde::{Deserialize, Serialize};

// --- Contract Info ---
const CONTRACT_NAME: &str = "crates.io:usdrise-receiver";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

// --- State ---
// This is a simplified state. A real contract might store more configuration.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct State {
    pub axelar_gateway: Addr,
}

// --- Messages ---

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct InstantiateMsg {
    pub axelar_gateway: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    /// This is the entry point for messages from the Axelar Gateway.
    ReceiveMessage {
        source_chain: String,
        source_address: String,
        payload: Binary,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    GetConfig {},
}

// --- ITS Payload Decoding ---
// This represents the decoded data from the ITS payload.
#[derive(Debug)]
struct DecodedPayload {
    recipient: Addr,
    amount: u128,
    token_denom: String, // The denomination of the token on Neutron (e.g., "uusdrise")
}

/// Decodes the raw payload from ITS.
///
/// **Placeholder Implementation:** This function needs to be replaced with a proper
/// ABI decoding implementation that matches the ITS payload structure.
/// For example, using an ABI library to decode the `bytes` payload.
fn decode_its_payload(payload: &Binary, deps: &DepsMut) -> StdResult<DecodedPayload> {
    // THIS IS A MOCK IMPLEMENTATION. DO NOT USE IN PRODUCTION.
    // A real implementation would parse the `payload` bytes.
    // The payload might contain:
    // - A message type identifier
    // - The recipient address bytes
    // - The amount as a u256 or similar
    // - Potentially other metadata

    if payload.as_slice().len() < 1 {
        return Err(StdError::generic_err(
            "Invalid payload: too short. This is a mock error.",
        ));
    }

    // Mocked data for demonstration purposes.
    let recipient = deps.api.addr_validate("neutron1...recipient_address")?; // Should be decoded from payload
    let amount = 1_000_000u128; // Should be decoded from payload (e.g., 1 USDRISE)
    let token_denom = "uusdrise".to_string(); // This should be a configured or discovered value

    Ok(DecodedPayload {
        recipient,
        amount,
        token_denom,
    })
}

// --- Contract Logic ---

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> StdResult<Response> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let gateway_addr = deps.api.addr_validate(&msg.axelar_gateway)?;

    // In a real scenario, you might want to restrict who can instantiate.
    // For now, we just store the provided gateway address.

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("instantiator", info.sender)
        .add_attribute("axelar_gateway", gateway_addr))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, StdError> {
    match msg {
        ExecuteMsg::ReceiveMessage {
            source_chain,
            source_address,
            payload,
        } => execute_receive_message(deps, info, source_chain, source_address, payload),
    }
}

fn execute_receive_message(
    mut deps: DepsMut,
    info: MessageInfo,
    source_chain: String,
    source_address: String,
    payload: Binary,
) -> Result<Response, StdError> {
    // **SECURITY CRITICAL:** Verify that the sender is the registered Axelar Gateway.
    // This is a simplified check. A production contract should load the address from storage.
    let gateway_addr = deps
        .api
        .addr_validate("neutron1...axelar_gateway_address")?; // This should be loaded from state
    if info.sender != gateway_addr {
        return Err(StdError::generic_err(
            "Unauthorized: sender is not the Axelar Gateway",
        ));
    }

    // Decode the payload from ITS.
    let decoded = decode_its_payload(&payload, &mut deps)?;

    // Create a bank message to send the tokens to the final recipient.
    let bank_msg = BankMsg::Send {
        to_address: decoded.recipient.to_string(),
        amount: vec![CosmosCoin {
            denom: decoded.token_denom,
            amount: Uint128::from(decoded.amount),
        }],
    };

    Ok(Response::new()
        .add_message(bank_msg)
        .add_attribute("action", "receive_and_forward_usdrise")
        .add_attribute("source_chain", source_chain)
        .add_attribute("source_address", source_address)
        .add_attribute("recipient", decoded.recipient.to_string())
        .add_attribute("amount", decoded.amount.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(_deps: Deps, _env: Env, _msg: QueryMsg) -> StdResult<Binary> {
    // For this example, we have a simple query response.
    // A real implementation would query the stored state.
    to_binary("config_placeholder")
}
