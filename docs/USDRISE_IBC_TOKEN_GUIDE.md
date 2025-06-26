# USDRiseのIBCトークン転送実装ガイド（正しいアプローチ）

## 概要

この修正版ガイドでは、USDRiseをSUIからNeutronに転送する際に、**Neutron側で新しいトークンをmintするのではなく、AxelarのIBCトークンをそのまま使用する**正しいアプローチを説明します。

## Axelar ITS（Interchain Token Service）の仕組み

### 基本概念
- **SUI側**: USDRiseをバーン（または一時的にロック）
- **Axelar Hub**: IBCトークンとして`ibc/HASH`形式で表現
- **Neutron側**: IBCトークンとして受信・転送

---

## Phase 1: SUI側の実装（変更なし）

SUI側の実装は前回のガイドと同じです。ITSがUSDRiseをバーンし、Axelarネットワークにメッセージを送信します。

---

## Phase 2: IBCトークンの理解

### 2.1 IBCトークンの仕組み

```
SUI: USDRISE → [burn/lock] → Axelar Gateway
      ↓
Axelar Hub: ibc/ABC123...DEF (IBCトークンとして管理)
      ↓
Neutron: ibc/ABC123...DEF として受信
```

### 2.2 IBCトークンのDenom形式

```
ibc/{hash_of_transfer_path}
例: ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2
```

このハッシュは以下から生成されます：
```
hash("transfer/channel-0/usdrise")
```

---

## Phase 3: Neutron側の正しい実装

### 3.1 CosmWasm契約（IBCトークン対応版）

**ファイル**: `contracts/usdrise-ibc-receiver/src/contract.rs`
**実行方法**: `cargo build` でコンパイル、`neutrond tx wasm store` でデプロイ

```rust
use cosmwasm_std::{
    entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response, 
    StdResult, to_binary, Uint128, BankMsg, Coin as CosmosCoin, Addr
};
use cw2::set_contract_version;
use cw_storage_plus::Item;
use serde::{Deserialize, Serialize};

const CONTRACT_NAME: &str = "usdrise-ibc-receiver";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

// IBCトークンのdenomを保存
const IBC_DENOM: Item<String> = Item::new("ibc_denom");
const AXELAR_GATEWAY: Item<Addr> = Item::new("axelar_gateway");

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct InstantiateMsg {
    pub axelar_gateway: String,
    pub usdrise_ibc_denom: String, // 例: "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2"
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    // Axelar Gatewayからのメッセージ受信
    ExecuteWithToken {
        source_chain: String,
        source_address: String,
        payload: Binary,
    },
    // 管理者による設定更新
    UpdateConfig {
        usdrise_ibc_denom: Option<String>,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    GetConfig {},
    GetIbcDenom {},
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ConfigResponse {
    pub axelar_gateway: String,
    pub usdrise_ibc_denom: String,
}

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> StdResult<Response> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    
    let gateway = deps.api.addr_validate(&msg.axelar_gateway)?;
    AXELAR_GATEWAY.save(deps.storage, &gateway)?;
    IBC_DENOM.save(deps.storage, &msg.usdrise_ibc_denom)?;
    
    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("axelar_gateway", msg.axelar_gateway)
        .add_attribute("usdrise_ibc_denom", msg.usdrise_ibc_denom))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> StdResult<Response> {
    match msg {
        ExecuteMsg::ExecuteWithToken { 
            source_chain, 
            source_address, 
            payload 
        } => execute_receive_ibc_token(deps, env, info, source_chain, source_address, payload),
        ExecuteMsg::UpdateConfig { usdrise_ibc_denom } => {
            execute_update_config(deps, info, usdrise_ibc_denom)
        }
    }
}

fn execute_receive_ibc_token(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    source_chain: String,
    source_address: String,
    payload: Binary,
) -> StdResult<Response> {
    // Axelar Gatewayからの呼び出しか検証
    let gateway = AXELAR_GATEWAY.load(deps.storage)?;
    if info.sender != gateway {
        return Err(cosmwasm_std::StdError::generic_err("Unauthorized"));
    }
    
    // ペイロードをデコード（ITSメッセージ形式）
    let decoded = decode_its_payload(&payload)?;
    
    // IBCトークンのdenomを取得
    let ibc_denom = IBC_DENOM.load(deps.storage)?;
    
    // 受信したIBCトークンを検証
    let received_token = info.funds.iter()
        .find(|coin| coin.denom == ibc_denom)
        .ok_or_else(|| cosmwasm_std::StdError::generic_err("USDRise IBC token not received"))?;
    
    // 金額が一致するか確認
    if received_token.amount != Uint128::from(decoded.amount) {
        return Err(cosmwasm_std::StdError::generic_err("Amount mismatch"));
    }
    
    // IBCトークンをそのまま受信者に転送
    let transfer_msg = BankMsg::Send {
        to_address: decoded.recipient,
        amount: vec![CosmosCoin {
            denom: ibc_denom.clone(),
            amount: received_token.amount,
        }],
    };
    
    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "receive_ibc_usdrise")
        .add_attribute("source_chain", source_chain)
        .add_attribute("source_address", source_address)
        .add_attribute("amount", received_token.amount.to_string())
        .add_attribute("recipient", decoded.recipient)
        .add_attribute("ibc_denom", ibc_denom))
}

fn execute_update_config(
    deps: DepsMut,
    info: MessageInfo,
    usdrise_ibc_denom: Option<String>,
) -> StdResult<Response> {
    // TODO: 管理者権限の確認を実装
    
    if let Some(denom) = usdrise_ibc_denom {
        IBC_DENOM.save(deps.storage, &denom)?;
    }
    
    Ok(Response::new().add_attribute("action", "update_config"))
}

#[derive(Debug)]
struct DecodedPayload {
    recipient: String,
    amount: u64,
}

fn decode_its_payload(payload: &Binary) -> StdResult<DecodedPayload> {
    // ITSペイロードのABIデコード実装
    // 実際の実装では、ethabi crateなどを使用
    
    let data = payload.as_slice();
    if data.len() < 32 {
        return Err(cosmwasm_std::StdError::generic_err("Invalid payload"));
    }
    
    // 簡略化した例 - 実際にはABIデコードライブラリを使用
    // ITSメッセージフォーマット:
    // - messageType (uint256)
    // - tokenId (bytes32) 
    // - sourceAddress (bytes)
    // - destinationAddress (bytes) ← これを抽出
    // - amount (uint256) ← これを抽出
    // - data (bytes)
    
    Ok(DecodedPayload {
        recipient: "neutron1example".to_string(), // 実際はペイロードから抽出
        amount: 1000000, // 実際はペイロードから抽出
    })
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetConfig {} => {
            let gateway = AXELAR_GATEWAY.load(deps.storage)?;
            let ibc_denom = IBC_DENOM.load(deps.storage)?;
            let config = ConfigResponse {
                axelar_gateway: gateway.to_string(),
                usdrise_ibc_denom: ibc_denom,
            };
            to_binary(&config)
        }
        QueryMsg::GetIbcDenom {} => {
            let denom = IBC_DENOM.load(deps.storage)?;
            to_binary(&denom)
        }
    }
}
```

### 3.2 IBCトークンDenom取得スクリプト

**ファイル**: `scripts/get-ibc-denom.sh`
**実行方法**: `chmod +x scripts/get-ibc-denom.sh && ./scripts/get-ibc-denom.sh`

```bash
#!/bin/bash

# Neutronテストネット設定
CHAIN_ID="pion-1"
NODE="https://rpc-palvus.pion-1.ntrn.tech:443"

echo "USDRiseのIBCトークンdenomを取得中..."

# 1. IBCチャネル情報を取得
echo "1. IBCチャネル情報を取得"
CHANNELS=$(neutrond query ibc channel channels --node $NODE --output json)
echo "Available channels:"
echo $CHANNELS | jq '.channels[] | select(.state=="STATE_OPEN") | {channel_id: .channel_id, port_id: .port_id, counterparty: .counterparty}'

# 2. Axelar関連のチャネルを探す
AXELAR_CHANNEL=$(echo $CHANNELS | jq -r '.channels[] | select(.counterparty.channel_id | contains("axelar")) | .channel_id' | head -1)

if [ -z "$AXELAR_CHANNEL" ]; then
    echo "Axelarチャネルが見つかりません。手動で確認してください。"
    exit 1
fi

echo "Axelarチャネル: $AXELAR_CHANNEL"

# 3. USDRiseのIBCトークンdenomを計算
# フォーマット: transfer/{channel_id}/{original_denom}
TRANSFER_PATH="transfer/${AXELAR_CHANNEL}/usdrise"
echo "Transfer Path: $TRANSFER_PATH"

# 4. SHA256ハッシュを計算してIBC denomを生成
IBC_HASH=$(echo -n "$TRANSFER_PATH" | sha256sum | cut -d' ' -f1)
IBC_DENOM="ibc/${IBC_HASH^^}"  # 大文字に変換

echo "USDRise IBC Denom: $IBC_DENOM"

# 5. 実際にトークンが存在するか確認
echo "5. IBCトークンの存在確認"
TOKEN_INFO=$(neutrond query bank denom-metadata $IBC_DENOM --node $NODE --output json 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "✅ IBCトークンが見つかりました："
    echo $TOKEN_INFO | jq '.'
else
    echo "⚠️  IBCトークンはまだ存在しません（初回転送後に作成されます）"
fi

# 6. 設定ファイルに保存
cat > ibc-config.json << EOF
{
  "axelar_channel": "$AXELAR_CHANNEL",
  "transfer_path": "$TRANSFER_PATH",
  "ibc_denom": "$IBC_DENOM"
}
EOF

echo "設定が ibc-config.json に保存されました"
```

### 3.3 デプロイスクリプト（修正版）

**ファイル**: `scripts/deploy-neutron-ibc.sh`
**実行方法**: `./scripts/deploy-neutron-ibc.sh`

```bash
#!/bin/bash

# IBCトークン設定を読み込み
if [ ! -f "ibc-config.json" ]; then
    echo "エラー: ibc-config.json が見つかりません"
    echo "先に get-ibc-denom.sh を実行してください"
    exit 1
fi

IBC_DENOM=$(jq -r '.ibc_denom' ibc-config.json)
AXELAR_GATEWAY="neutron1axelar_gateway_address_here" # 実際のAxelar Gateway契約アドレス

echo "IBCトークンでのデプロイを開始..."
echo "IBC Denom: $IBC_DENOM"

# Neutronノードの設定
CHAIN_ID="pion-1"
NODE="https://rpc-palvus.pion-1.ntrn.tech:443"
KEYRING_BACKEND="test"
KEY_NAME="your-key"

# 契約のビルド
echo "Building CosmWasm contract..."
cd contracts/usdrise-ibc-receiver
cargo build --release --target wasm32-unknown-unknown

# 契約のアップロード
echo "Uploading contract to Neutron..."
CONTRACT_WASM="target/wasm32-unknown-unknown/release/usdrise_ibc_receiver.wasm"

UPLOAD_RESULT=$(neutrond tx wasm store $CONTRACT_WASM \
    --from $KEY_NAME \
    --chain-id $CHAIN_ID \
    --node $NODE \
    --keyring-backend $KEYRING_BACKEND \
    --gas auto \
    --gas-adjustment 1.3 \
    --fees 1000untrn \
    --output json -y)

CODE_ID=$(echo $UPLOAD_RESULT | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
echo "Contract Code ID: $CODE_ID"

# 契約のインスタンス化（IBCトークン対応）
INIT_MSG=$(jq -n \
  --arg gateway "$AXELAR_GATEWAY" \
  --arg denom "$IBC_DENOM" \
  '{axelar_gateway: $gateway, usdrise_ibc_denom: $denom}')

echo "Instantiate message: $INIT_MSG"

INSTANTIATE_RESULT=$(neutrond tx wasm instantiate $CODE_ID "$INIT_MSG" \
    --from $KEY_NAME \
    --label "USDRise IBC Receiver" \
    --chain-id $CHAIN_ID \
    --node $NODE \
    --keyring-backend $KEYRING_BACKEND \
    --gas auto \
    --gas-adjustment 1.3 \
    --fees 1000untrn \
    --output json -y)

CONTRACT_ADDRESS=$(echo $INSTANTIATE_RESULT | jq -r '.logs[0].events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value')

echo "✅ デプロイ完了!"
echo "Contract Address: $CONTRACT_ADDRESS"
echo "IBC Denom: $IBC_DENOM"

# 最終設定を保存
jq --arg addr "$CONTRACT_ADDRESS" '. + {contract_address: $addr}' ibc-config.json > ibc-config-final.json
mv ibc-config-final.json ibc-config.json

echo "最終設定が ibc-config.json に保存されました"
```

---

## Phase 4: IBCトークンの検証と監視

### 4.1 IBCトークン残高確認スクリプト

**ファイル**: `scripts/check-ibc-balance.sh`
**実行方法**: `./scripts/check-ibc-balance.sh <neutron_address>`

```bash
#!/bin/bash

if [ $# -eq 0 ]; then
    echo "使用方法: $0 <neutron_address>"
    exit 1
fi

NEUTRON_ADDRESS=$1
NODE="https://rpc-palvus.pion-1.ntrn.tech:443"

# IBCトークン設定を読み込み
IBC_DENOM=$(jq -r '.ibc_denom' ibc-config.json)

echo "IBCトークン残高を確認中..."
echo "Address: $NEUTRON_ADDRESS"
echo "IBC Denom: $IBC_DENOM"

# 残高を確認
BALANCE=$(neutrond query bank balance $NEUTRON_ADDRESS $IBC_DENOM --node $NODE --output json)

if [ $? -eq 0 ]; then
    AMOUNT=$(echo $BALANCE | jq -r '.amount')
    echo "✅ USDRise IBC トークン残高: $AMOUNT"
else
    echo "❌ 残高取得エラーまたは残高が0"
fi

# すべてのIBCトークンを表示
echo ""
echo "全IBCトークン残高:"
neutrond query bank balances $NEUTRON_ADDRESS --node $NODE --output json | jq '.balances[] | select(.denom | startswith("ibc/"))'
```

### 4.2 転送監視スクリプト（修正版）

**ファイル**: `src/monitor-ibc.ts`
**実行方法**: `node dist/monitor-ibc.js <transaction_hash>`

```typescript
import axios from 'axios';

interface IBCTransferStatus {
    sui_tx: string;
    axelar_tx?: string;
    neutron_tx?: string;
    status: 'pending' | 'confirmed' | 'delivered' | 'failed';
    ibc_denom: string;
    amount: string;
}

async function monitorIBCTransfer(txHash: string): Promise<IBCTransferStatus> {
    const axelarApi = `https://testnet.axelarscan.io/api`;
    
    try {
        // 1. Axelar Scanで転送状態を確認
        const transferResponse = await axios.get(
            `${axelarApi}/cross-chain/transfers`,
            { params: { txHash } }
        );
        
        console.log('📋 Transfer Status:', transferResponse.data);
        
        // 2. GMPトランザクションの詳細を取得
        const gmpResponse = await axios.get(
            `${axelarApi}/gmp/${txHash}`
        );
        
        console.log('🔗 GMP Details:', gmpResponse.data);
        
        // 3. IBCトークン情報を取得
        const ibcConfig = require('../ibc-config.json');
        
        const status: IBCTransferStatus = {
            sui_tx: txHash,
            axelar_tx: gmpResponse.data.call?.transactionHash,
            neutron_tx: gmpResponse.data.executed?.transactionHash,
            status: mapAxelarStatus(gmpResponse.data.status),
            ibc_denom: ibcConfig.ibc_denom,
            amount: gmpResponse.data.call?.returnValues?.amount || '0'
        };
        
        // 4. Neutron側でのIBCトークン確認
        if (status.status === 'delivered' && status.neutron_tx) {
            console.log('✅ Neutron側での実行完了');
            console.log(`🔍 Neutron TX: ${status.neutron_tx}`);
            console.log(`💰 IBC Token: ${status.ibc_denom}`);
            console.log(`💎 Amount: ${status.amount}`);
            
            // Neutron APIで実際の残高変更を確認
            await checkNeutronBalance(status);
        } else {
            console.log('⏳ まだ実行中またはペンディング');
            console.log(`Status: ${status.status}`);
        }
        
        return status;
        
    } catch (error) {
        console.error('❌ 監視エラー:', error);
        throw error;
    }
}

function mapAxelarStatus(axelarStatus: string): 'pending' | 'confirmed' | 'delivered' | 'failed' {
    switch (axelarStatus?.toLowerCase()) {
        case 'executed':
            return 'delivered';
        case 'confirmed':
            return 'confirmed';
        case 'failed':
        case 'error':
            return 'failed';
        default:
            return 'pending';
    }
}

async function checkNeutronBalance(status: IBCTransferStatus) {
    try {
        // Neutron APIを使って実際の残高を確認
        const neutronApi = 'https://rest-palvus.pion-1.ntrn.tech';
        // TODO: 受信者アドレスを取得してバランスを確認
        console.log('💡 Neutron残高確認はcheck-ibc-balance.shスクリプトを使用してください');
    } catch (error) {
        console.log('⚠️ Neutron残高確認エラー:', error);
    }
}

// コマンドライン実行
const txHash = process.argv[2];
if (!txHash) {
    console.error('使用方法: node monitor-ibc.js <transaction_hash>');
    process.exit(1);
}

monitorIBCTransfer(txHash)
    .then(status => {
        console.log('\n📊 最終ステータス:');
        console.log(JSON.stringify(status, null, 2));
    })
    .catch(console.error);
```

---

## 重要な違いとメリット

### ❌ 間違ったアプローチ（前回のガイド）
- Neutron側で新しいUSDRiseトークンをmint
- トークンの重複と混乱
- セキュリティリスク

### ✅ 正しいアプローチ（このガイド）
- AxelarのIBCトークンをそのまま使用
- 標準的なIBC Protocol準拠
- より安全で効率的

### メリット
1. **標準準拠**: IBCプロトコルの標準的な使用方法
2. **セキュリティ**: トークンの重複mint防止
3. **互換性**: 他のIBC対応ウォレット・DEXで使用可能
4. **透明性**: IBCトークンは起源が明確

---

## 実行手順（修正版）

### Step 1: IBCトークン情報取得
```bash
./scripts/get-ibc-denom.sh
```

### Step 2: Neutron契約デプロイ
```bash
./scripts/deploy-neutron-ibc.sh
```

### Step 3: SUI側からの転送
```bash
npm run transfer  # 前回と同じ
```

### Step 4: IBCトークン確認
```bash
./scripts/check-ibc-balance.sh neutron1your_address
node dist/monitor-ibc.js <transaction_hash>
```

このアプローチにより、USDRiseはNeutron上で適切なIBCトークンとして管理され、標準的なCosmos生態系との互換性を保てます。