# USDRiseコインをSUIからNeutronに転送する実装ガイド

## 概要

このガイドでは、USDRiseという独自コインをSUIブロックチェーンでミントし、Axelar CGPを使用してNeutronブロックチェーンに転送する完全な実装手順を説明します。

## 前提条件

### 必要なツールとライブラリ
- **Sui CLI**: `sui --version` でインストール確認
- **Move言語**: Sui Move開発環境
- **Node.js**: TypeScript/JavaScript実行環境
- **Rust**: CosmWasm契約開発（Neutron側）
- **@mysten/sui**: Sui TypeScript SDK

### 事前確認事項
- Neutronが[Axelar公式チェーンリスト](https://docs.axelar.dev/dev/reference/mainnet-chain-names)でサポートされているか確認
- Neutronのチェーン名: `"neutron-1"`（メインネット）または`"pion-1"`（テストネット）

---

## Phase 1: SUI側の実装

### 1.1 USDRiseコインの定義

**ファイル**: `sources/usdrise.move`
**実行方法**: `sui move build` でコンパイル、`sui client publish` でデプロイ

```move
module your_package::usdrise {
    use std::option;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// USDRiseコインの定義
    public struct USDRISE has drop {}

    /// コインの初期化関数（パッケージデプロイ時に自動実行）
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
        
        // TreasuryCapを送信者に転送（ミント権限）
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        
        // メタデータを共有オブジェクトとして公開
        transfer::public_share_object(metadata);
    }

    /// USDRiseをミントする関数
    public fun mint(
        treasury_cap: &mut TreasuryCap<USDRISE>, 
        amount: u64, 
        recipient: address, 
        ctx: &mut TxContext
    ) {
        coin::mint_and_transfer(treasury_cap, amount, recipient, ctx);
    }

    /// USDRiseをバーンする関数
    public fun burn(treasury_cap: &mut TreasuryCap<USDRISE>, coin: Coin<USDRISE>) {
        coin::burn(treasury_cap, coin);
    }
}
```

### 1.2 ITS統合モジュール

**ファイル**: `sources/its_integration.move`
**実行方法**: USDRiseパッケージと一緒にデプロイ

```move
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

    /// USDRiseをITSに登録（Mint/Burn方式）
    /// 実行方法: sui client call --function register_usdrise_with_cap
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
        
        // Mint/Burn管理でTreasuryCapを提供
        let coin_management = coin_management::new_with_cap(treasury_cap);

        its.register_coin(coin_info, coin_management)
    }

    /// Neutronを信頼できるチェーンに追加
    /// 実行方法: sui client call --function add_neutron_chain
    public fun add_neutron_chain(
        its: &mut InterchainTokenService,
        owner_cap: &OwnerCap,
    ) {
        its.add_trusted_chains(
            owner_cap,
            vector[ascii::string(b"neutron-1")]  // またはpion-1（テストネット）
        );
    }

    /// USDRiseをNeutronに転送
    /// 実行方法: sui client call --function transfer_usdrise_to_neutron
    public fun transfer_usdrise_to_neutron(
        its: &mut InterchainTokenService,
        gateway: &Gateway,
        gas_service: &mut GasService,
        channel: &Channel,
        token_id: TokenId,
        usdrise_coin: Coin<USDRISE>,
        neutron_address: vector<u8>,      // neutron1... アドレス（bech32デコード済み）
        gas_coin: Coin<SUI>,
        ctx: &mut TxContext,
        clock: &Clock,
    ) {
        // インターチェーン転送チケットを準備
        let interchain_transfer_ticket = interchain_token_service::prepare_interchain_transfer<USDRISE>(
            token_id,
            usdrise_coin,
            ascii::string(b"neutron-1"),     // destination_chain
            neutron_address,                 // destination_address
            vector::empty(),                 // metadata（空）
            channel,
        );

        // 転送を実行
        let message_ticket = its.send_interchain_transfer<USDRISE>(
            interchain_transfer_ticket,
            clock,
        );

        // ガス料金を支払い、メッセージを送信
        gas_service.pay_gas(
            &message_ticket,
            gas_coin,
            tx_context::sender(ctx),
            vector::empty(), // gas_params
        );

        gateway.send_message(message_ticket);
    }
}
```

### 1.3 Move.toml設定

**ファイル**: `Move.toml`

```toml
[package]
name = "usdrise_package"
version = "1.0.0"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "mainnet-v1.38.3" }
AxelarGateway = { local = "../move/axelar_gateway" }
InterchainTokenService = { local = "../move/interchain_token_service" }
GasService = { local = "../move/gas_service" }

[addresses]
your_package = "0x0"
```

---

## Phase 2: TypeScript実装（SUI側制御）

### 2.1 環境設定

**ファイル**: `package.json`
**実行方法**: `npm install`

```json
{
  "name": "usdrise-neutron-transfer",
  "version": "1.0.0",
  "dependencies": {
    "@mysten/sui": "^1.3.0",
    "@axelar-network/axelar-cgp-sui": "^1.1.3",
    "bech32": "^2.0.0",
    "ethers": "^5.0.0"
  },
  "scripts": {
    "transfer": "node dist/transfer.js",
    "setup": "node dist/setup.js"
  }
}
```

### 2.2 セットアップスクリプト

**ファイル**: `src/setup.ts`
**実行方法**: `npm run setup`

```typescript
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { TransactionBlock } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// 設定値
const NETWORK = 'testnet'; // または 'mainnet'
const PACKAGE_ID = 'YOUR_PUBLISHED_PACKAGE_ID';
const ITS_ID = 'ITS_SHARED_OBJECT_ID';
const GATEWAY_ID = 'GATEWAY_SHARED_OBJECT_ID';
const GAS_SERVICE_ID = 'GAS_SERVICE_SHARED_OBJECT_ID';

async function setupUSDRise() {
    const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    const keypair = Ed25519Keypair.fromSecretKey('YOUR_PRIVATE_KEY');
    
    try {
        // 1. USDRiseパッケージをパブリッシュ（手動実行後、PACKAGE_IDを取得）
        console.log('1. Sui CLI でパッケージをパブリッシュしてください:');
        console.log('   sui client publish --gas-budget 100000000');
        
        // 2. Treasury CapとCoinMetadataのオブジェクトIDを取得
        const objects = await client.getOwnedObjects({
            owner: keypair.toSuiAddress(),
            filter: { Package: PACKAGE_ID }
        });
        
        const treasuryCap = objects.data.find(obj => 
            obj.data?.type?.includes('TreasuryCap<')
        );
        const coinMetadata = objects.data.find(obj => 
            obj.data?.type?.includes('CoinMetadata<')
        );
        
        if (!treasuryCap || !coinMetadata) {
            throw new Error('TreasuryCap または CoinMetadata が見つかりません');
        }
        
        console.log('Treasury Cap ID:', treasuryCap.data?.objectId);
        console.log('Coin Metadata ID:', coinMetadata.data?.objectId);
        
        // 3. ITSにUSDRiseを登録
        const registerTx = new TransactionBlock();
        registerTx.moveCall({
            target: `${PACKAGE_ID}::its_integration::register_usdrise_with_cap`,
            arguments: [
                registerTx.object(ITS_ID),
                registerTx.object(coinMetadata.data!.objectId!),
                registerTx.object(treasuryCap.data!.objectId!),
            ],
        });
        
        const registerResult = await client.signAndExecuteTransactionBlock({
            transactionBlock: registerTx,
            signer: keypair,
            options: { showEffects: true, showEvents: true }
        });
        
        console.log('USDRise 登録完了:', registerResult.digest);
        
        // 4. イベントからTokenIDを取得
        const events = registerResult.events || [];
        const tokenEvent = events.find(event => 
            event.type.includes('CoinRegistered')
        );
        
        if (tokenEvent) {
            console.log('Token ID取得成功:', tokenEvent.parsedJson);
        }
        
    } catch (error) {
        console.error('セットアップエラー:', error);
    }
}

setupUSDRise();
```

### 2.3 転送実行スクリプト

**ファイル**: `src/transfer.ts`
**実行方法**: `npm run transfer`

```typescript
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { TransactionBlock } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bech32 } from 'bech32';

// 設定値（setup.tsで取得した値を使用）
const PACKAGE_ID = 'YOUR_PUBLISHED_PACKAGE_ID';
const TOKEN_ID = 'YOUR_TOKEN_ID';
const TREASURY_CAP_ID = 'YOUR_TREASURY_CAP_ID';
const CHANNEL_ID = 'YOUR_CHANNEL_ID';

async function transferUSDRiseToNeutron(
    amount: string,
    neutronAddress: string // neutron1... 形式
) {
    const client = new SuiClient({ url: getFullnodeUrl('testnet') });
    const keypair = Ed25519Keypair.fromSecretKey('YOUR_PRIVATE_KEY');
    
    try {
        // 1. Neutronアドレスをバイト配列に変換
        const decoded = bech32.decode(neutronAddress);
        const addressBytes = bech32.fromWords(decoded.words);
        
        // 2. トランザクションブロックを作成
        const tx = new TransactionBlock();
        
        // 3. USDRiseをミント
        const [mintedCoin] = tx.moveCall({
            target: `${PACKAGE_ID}::usdrise::mint`,
            arguments: [
                tx.object(TREASURY_CAP_ID),
                tx.pure(amount),
                tx.pure(keypair.toSuiAddress()),
            ],
        });
        
        // 4. ガス用のSUIコインを分割
        const [gasCoin] = tx.splitCoins(tx.gas, [tx.pure(1000000000)]); // 1 SUI
        
        // 5. Neutronへの転送を実行
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
                tx.object('0x6'), // Clock
            ],
        });
        
        // 6. トランザクションを実行
        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            signer: keypair,
            options: { 
                showEffects: true, 
                showEvents: true,
                showObjectChanges: true 
            }
        });
        
        console.log('転送完了! Transaction:', result.digest);
        console.log('Axelar Scanで確認:', `https://testnet.axelarscan.io/transfer/${result.digest}`);
        
        return result;
        
    } catch (error) {
        console.error('転送エラー:', error);
        throw error;
    }
}

// 実行例
transferUSDRiseToNeutron(
    '1000000', // 1 USDRISE (6 decimals)
    'neutron1your_neutron_address_here'
);
```

---

## Phase 3: Neutron側の実装

### 3.1 CosmWasm契約

**ファイル**: `contracts/usdrise-receiver/src/contract.rs`
**実行方法**: `cargo build` でコンパイル、`neutrond tx wasm store` でデプロイ

```rust
use cosmwasm_std::{
    entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response, 
    StdResult, to_binary, Uint128, BankMsg, Coin as CosmosCoin
};
use cw2::set_contract_version;
use serde::{Deserialize, Serialize};

const CONTRACT_NAME: &str = "usdrise-receiver";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct InstantiateMsg {
    pub axelar_gateway: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    // Axelarからのメッセージ受信
    Execute {
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

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> StdResult<Response> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    
    // Axelar Gatewayアドレスを保存
    deps.api.addr_validate(&msg.axelar_gateway)?;
    
    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("axelar_gateway", msg.axelar_gateway))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> StdResult<Response> {
    match msg {
        ExecuteMsg::Execute { 
            source_chain, 
            source_address, 
            payload 
        } => execute_receive_usdrise(deps, env, info, source_chain, source_address, payload),
    }
}

fn execute_receive_usdrise(
    _deps: DepsMut,
    env: Env,
    info: MessageInfo,
    source_chain: String,
    source_address: String,
    payload: Binary,
) -> StdResult<Response> {
    // TODO: Axelar Gatewayからの呼び出しか検証
    
    // ペイロードをデコード（ITSメッセージ形式）
    let decoded = decode_its_payload(&payload)?;
    
    // Neutron上でUSDRiseトークンをミント/転送
    let mint_msg = BankMsg::Send {
        to_address: decoded.recipient,
        amount: vec![CosmosCoin {
            denom: "usdrise".to_string(), // Neutron上でのUSDRiseデノミ
            amount: Uint128::from(decoded.amount),
        }],
    };
    
    Ok(Response::new()
        .add_message(mint_msg)
        .add_attribute("action", "receive_usdrise")
        .add_attribute("source_chain", source_chain)
        .add_attribute("source_address", source_address)
        .add_attribute("amount", decoded.amount.to_string())
        .add_attribute("recipient", decoded.recipient))
}

#[derive(Debug)]
struct DecodedPayload {
    recipient: String,
    amount: u64,
}

fn decode_its_payload(payload: &Binary) -> StdResult<DecodedPayload> {
    // ITSペイロードのデコード実装
    // 実際の実装では、ABIデコーディングライブラリを使用
    
    // 簡略化した例
    let data = payload.as_slice();
    if data.len() < 32 {
        return Err(cosmwasm_std::StdError::generic_err("Invalid payload"));
    }
    
    // 実際のデコード処理をここに実装
    Ok(DecodedPayload {
        recipient: "neutron1example".to_string(), // 実際はペイロードから抽出
        amount: 1000000, // 実際はペイロードから抽出
    })
}

#[entry_point]
pub fn query(_deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetConfig {} => to_binary(&"config"),
    }
}
```

### 3.2 Neutronデプロイスクリプト

**ファイル**: `scripts/deploy-neutron.sh`
**実行方法**: `chmod +x scripts/deploy-neutron.sh && ./scripts/deploy-neutron.sh`

```bash
#!/bin/bash

# Neutronノードの設定
CHAIN_ID="pion-1"  # テストネット
NODE="https://rpc-palvus.pion-1.ntrn.tech:443"
KEYRING_BACKEND="test"
KEY_NAME="your-key"

# 契約のビルド
echo "Building CosmWasm contract..."
cd contracts/usdrise-receiver
cargo build --release --target wasm32-unknown-unknown
cargo run-script optimize

# 契約のアップロード
echo "Uploading contract to Neutron..."
CONTRACT_WASM="target/wasm32-unknown-unknown/release/usdrise_receiver.wasm"

UPLOAD_RESULT=$(neutrond tx wasm store $CONTRACT_WASM \
    --from $KEY_NAME \
    --chain-id $CHAIN_ID \
    --node $NODE \
    --keyring-backend $KEYRING_BACKEND \
    --gas auto \
    --gas-adjustment 1.3 \
    --fees 1000untrn \
    --output json -y)

echo "Upload result: $UPLOAD_RESULT"

# Code IDを抽出
CODE_ID=$(echo $UPLOAD_RESULT | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
echo "Contract Code ID: $CODE_ID"

# 契約のインスタンス化
INIT_MSG='{"axelar_gateway":"neutron1axelar_gateway_address"}'

INSTANTIATE_RESULT=$(neutrond tx wasm instantiate $CODE_ID "$INIT_MSG" \
    --from $KEY_NAME \
    --label "USDRise Receiver" \
    --chain-id $CHAIN_ID \
    --node $NODE \
    --keyring-backend $KEYRING_BACKEND \
    --gas auto \
    --gas-adjustment 1.3 \
    --fees 1000untrn \
    --output json -y)

echo "Instantiate result: $INSTANTIATE_RESULT"

# 契約アドレスを抽出
CONTRACT_ADDRESS=$(echo $INSTANTIATE_RESULT | jq -r '.logs[0].events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value')
echo "Contract Address: $CONTRACT_ADDRESS"

echo "デプロイ完了!"
echo "Contract Address: $CONTRACT_ADDRESS"
```

---

## Phase 4: 監視と確認

### 4.1 転送状態監視スクリプト

**ファイル**: `src/monitor.ts`
**実行方法**: `node dist/monitor.js <transaction_hash>`

```typescript
import axios from 'axios';

async function monitorTransfer(txHash: string) {
    const axelarApi = `https://testnet.axelarscan.io/api`;
    
    try {
        // 1. Axelar Scanで転送状態を確認
        const transferResponse = await axios.get(
            `${axelarApi}/cross-chain/transfers`,
            { params: { txHash } }
        );
        
        console.log('Transfer Status:', transferResponse.data);
        
        // 2. GMPトランザクションの詳細を取得
        const gmpResponse = await axios.get(
            `${axelarApi}/gmp/${txHash}`
        );
        
        console.log('GMP Details:', gmpResponse.data);
        
        // 3. Neutron側の実行状態を確認
        if (gmpResponse.data.status === 'executed') {
            console.log('✅ Neutron側での実行完了');
            console.log('Neutron TX:', gmpResponse.data.executed?.transactionHash);
        } else {
            console.log('⏳ まだ実行中またはペンディング');
        }
        
    } catch (error) {
        console.error('監視エラー:', error);
    }
}

// コマンドライン引数からトランザクションハッシュを取得
const txHash = process.argv[2];
if (!txHash) {
    console.error('使用方法: node monitor.js <transaction_hash>');
    process.exit(1);
}

monitorTransfer(txHash);
```

---

## 実行手順まとめ

### Step 1: SUI側のセットアップ
```bash
# 1. Moveパッケージのビルドとパブリッシュ
sui move build
sui client publish --gas-budget 100000000

# 2. TypeScriptの依存関係インストール
npm install

# 3. セットアップ実行
npm run setup
```

### Step 2: Neutron側のセットアップ
```bash
# 1. CosmWasm契約のビルド
cd contracts/usdrise-receiver
cargo build --release --target wasm32-unknown-unknown

# 2. Neutronへのデプロイ
./scripts/deploy-neutron.sh
```

### Step 3: 転送実行
```bash
# USDRiseをNeutronに転送
npm run transfer

# 転送状態の監視
node dist/monitor.js <transaction_hash>
```

## 重要な注意事項

1. **テストネット推奨**: 本番環境前に必ずテストネットで検証
2. **ガス料金**: 十分なSUIとNTRNを準備
3. **アドレス形式**: Neutronアドレスは`neutron1...`形式
4. **エラーハンドリング**: 各段階でのエラー処理を実装
5. **セキュリティ**: 秘密鍵の適切な管理

このガイドに従うことで、USDRiseコインをSUIからNeutronに安全に転送できます。