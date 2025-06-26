// USDRise Coin Definition
// This module defines the USDRise coin, its metadata, and the basic
// functions for minting and burning. It is initialized when the package
// is deployed, creating a TreasuryCap for the deployer.
module your_package::usdrise {
    use std::option;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// USDRise coin type definition
    public struct USDRISE has drop {}

    /// Initializes the coin metadata and treasury capability.
    /// This function is called automatically upon package deployment.
    fun init(witness: USDRISE, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<USDRISE>(
            witness,
            6,                              // decimals
            b"USDRISE",                     // symbol
            b"USD Rise",                    // name
            b"A stable coin pegged to USD", // description
            option::none(),                 // icon_url
            ctx
        );
        
        // Transfer the minting authority (TreasuryCap) to the deployer.
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        
        // Share the coin metadata to make it publicly accessible.
        transfer::public_share_object(metadata);
    }

    /// Mints new USDRise coins.
    /// Requires the TreasuryCap to authorize the minting operation.
    public fun mint(
        treasury_cap: &mut TreasuryCap<USDRISE>, 
        amount: u64, 
        recipient: address, 
        ctx: &mut TxContext
    ) {
        coin::mint_and_transfer(treasury_cap, amount, recipient, ctx);
    }

    /// Burns USDRise coins.
    /// Requires the TreasuryCap to authorize the burning operation.
    public fun burn(treasury_cap: &mut TreasuryCap<USDRISE>, coin: Coin<USDRISE>) {
        coin::burn(treasury_cap, coin);
    }
} 