// ITS Integration for USDRise
// This module handles the integration of the USDRise coin with the
// Axelar Interchain Token Service (ITS). It provides functions to:
// 1. Register the USDRise coin with ITS using the Mint/Burn token manager type.
// 2. Add a trusted chain address for cross-chain transfers.
// 3. Prepare and execute an interchain transfer to a destination chain (e.g., Neutron).
module your_package::its_integration {
    use sui::coin::{CoinMetadata, TreasuryCap, Coin};
    use sui::tx_context::{Self, TxContext};
    use sui::clock::Clock;
    use std::ascii;
    use axelar_gateway::{
        gateway::Gateway,
        channel::Channel
    };
    use gas_service::gas_service::GasService;
    use interchain_token_service::{
        interchain_token_service::InterchainTokenService,
        coin_info,
        coin_management,
        token_id::TokenId,
        owner_cap::OwnerCap
    };
    use your_package::usdrise::USDRISE;

    /// Registers USDRise with the ITS using the Mint/Burn method.
    /// This requires the TreasuryCap to grant minting and burning authority to ITS.
    public fun register_usdrise_with_cap(
        its: &mut InterchainTokenService,
        coin_metadata: &CoinMetadata<USDRISE>,
        treasury_cap: TreasuryCap<USDRISE>,
    ): TokenId {
        let coin_info = coin_info::from_info<USDRISE>(
            coin_metadata.get_name(),
            coin_metadata.get_symbol(),
            coin_metadata.get_decimals(),
        );
        
        // Provide the TreasuryCap for Mint/Burn token management.
        let coin_management = coin_management::new_with_cap(treasury_cap);

        its.register_coin(coin_info, coin_management)
    }

    /// Adds Neutron as a trusted chain for cross-chain transfers.
    /// Requires the OwnerCap to authorize this change.
    public fun add_neutron_chain(
        its: &mut InterchainTokenService,
        owner_cap: &OwnerCap,
    ) {
        its.add_trusted_chains(
            owner_cap,
            vector[ascii::string(b"neutron-1")]  // or pion-1 for testnet
        );
    }

    /// Transfers USDRise to a specified Neutron address.
    /// This function prepares an interchain transfer ticket, sends it via ITS,
    /// pays for gas, and dispatches the message through the Axelar Gateway.
    public fun transfer_usdrise_to_neutron(
        its: &mut InterchainTokenService,
        gateway: &Gateway,
        gas_service: &mut GasService,
        channel: &Channel,
        token_id: TokenId,
        usdrise_coin: Coin<USDRISE>,
        neutron_address: vector<u8>,      // bech32-decoded neutron1... address
        gas_coin: Coin<SUI>,
        ctx: &mut TxContext,
        clock: &Clock,
    ) {
        // Prepare the interchain transfer ticket.
        let interchain_transfer_ticket = interchain_token_service::prepare_interchain_transfer<USDRISE>(
            token_id,
            usdrise_coin,
            ascii::string(b"neutron-1"),     // destination_chain
            neutron_address,                 // destination_address
            vector::empty(),                 // metadata (empty)
            channel,
        );

        // Execute the transfer.
        let message_ticket = its.send_interchain_transfer<USDRISE>(
            interchain_transfer_ticket,
            clock,
        );

        // Pay for the gas and send the message.
        gas_service.pay_gas(
            &message_ticket,
            gas_coin,
            tx_context::sender(ctx),
            vector::empty(), // gas_params
        );

        gateway.send_message(message_ticket);
    }
} 