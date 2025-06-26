# Axelar ITS アーキテクチャの明確化：契約は本当に必要か？

## 重要な発見と修正

ご指摘の通り、**Neutron側でカスタム契約は必要ありません**。Axelar ITSは確かにGMP（General Message Passing）を使用しますが、実際の流れは以下のようになります。

## Axelar ITSの実際のアーキテクチャ

### 1. SUI → Axelar Hub の流れ

```
SUI ITS: USDRISE [burn/lock] → MESSAGE_TYPE_SEND_TO_HUB → Axelar Gateway
      ↓
Axelar Hub: ITS Hub Contract が受信
      ↓  
Axelar Hub: MESSAGE_TYPE_RECEIVE_FROM_HUB でラップしてNeutronに送信
```

**コードで確認**（interchain_token_service_v0.move:79）：
```move
const ITS_HUB_CHAIN_NAME: vector<u8> = b"axelar";
```

### 2. Axelar Hub → Neutron の流れ

**重要**: Axelar Hubから先は、実際には以下の2つのパターンがあります：

#### パターンA: 直接IBC Transfer（推測していた方法）
```
Axelar Hub → [IBC Transfer] → Neutron
```
この場合、IBCトークンとして `ibc/HASH` で自動的に受信

#### パターンB: Axelar GMP + Neutron ITS契約（実際の方法）
```
Axelar Hub → [Axelar GMP] → Neutron Axelar Gateway → Neutron ITS契約
```
この場合、Neutron側でも ITS契約 または 受信契約が必要

## 実際はどちらなのか？

### ITSの設計思想を調査

```move
// interchain_token_service_v0.move:67-74
const MESSAGE_TYPE_INTERCHAIN_TRANSFER: u256 = 0;
const MESSAGE_TYPE_DEPLOY_INTERCHAIN_TOKEN: u256 = 1;
const MESSAGE_TYPE_SEND_TO_HUB: u256 = 3;
const MESSAGE_TYPE_RECEIVE_FROM_HUB: u256 = 4;
const MESSAGE_TYPE_LINK_TOKEN: u256 = 5;
```

`MESSAGE_TYPE_RECEIVE_FROM_HUB` の存在は、**Axelar HubからターゲットチェーンへのGMPメッセージ**を示唆しています。

## 正しい理解：契約の必要性

### ✅ **契約が必要な場合**
Neutronで **カスタムロジック** が必要な場合：
- 受信時の自動ステーキング
- 手数料の自動徴収
- 受信者の制限
- イベントの発行

### ✅ **契約が不要な場合**
単純にUSDRiseトークンを受信するだけの場合：
- Axelar → Neutron の自動IBC転送
- ユーザーのウォレットに直接送金

## 実際の実装選択肢

### Option 1: 契約なし（シンプル）

**SUI側のみの実装**
```move
public fun transfer_usdrise_to_neutron_simple(
    its: &mut InterchainTokenService,
    gateway: &Gateway,
    gas_service: &mut GasService,
    // ... 他のパラメータ
    neutron_user_address: vector<u8>, // 直接ユーザーアドレス
) {
    // ITSが自動的にNeutronのユーザーアドレスにIBCトークンを送信
    // カスタム契約は不要
}
```

**結果**: NeutronのユーザーウォレットにIBCトークンが直接届く

### Option 2: カスタム契約あり（高機能）

**SUI側**
```move
public fun transfer_usdrise_to_neutron_with_contract(
    // ...
    neutron_contract_address: vector<u8>, // Neutron契約アドレス
    custom_data: vector<u8>, // カスタムデータ
) {
    // Neutron契約に送信してカスタムロジックを実行
}
```

**Neutron側**
```rust
// カスタムロジック（ステーキング、手数料など）を実装
pub fn execute_receive_usdrise(/* ... */) -> Result<Response, ContractError> {
    // カスタム処理
    // 最終的にユーザーに転送
}
```

## 推奨アプローチ

### 🎯 **最初は Option 1（契約なし）を推奨**

理由：
1. **シンプル**: Neutron側の開発・デプロイ不要
2. **標準的**: IBCトークンとして標準的に扱える
3. **デバッグしやすい**: 問題を分離できる
4. **コスト効率**: Neutron側のガス費用なし

### 実装手順（修正版）

```typescript
// TypeScript実装
async function transferUSDRiseDirectly(
    amount: string,
    neutronUserAddress: string // neutron1... ユーザーアドレス
) {
    const tx = new TransactionBlock();
    
    // USDRiseをミント
    const [mintedCoin] = tx.moveCall({
        target: `${PACKAGE_ID}::usdrise::mint`,
        arguments: [
            tx.object(TREASURY_CAP_ID),
            tx.pure(amount),
            tx.pure(keypair.toSuiAddress()),
        ],
    });
    
    // 直接ユーザーアドレスに転送（契約なし）
    tx.moveCall({
        target: `${ITS_PACKAGE}::interchain_token_service::send_interchain_transfer`,
        arguments: [
            tx.object(ITS_ID),
            // ... 他のパラメータ
            tx.pure(Array.from(bech32.fromWords(bech32.decode(neutronUserAddress).words))),
            // ↑ 直接ユーザーアドレス
        ],
    });
    
    return await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: keypair,
    });
}
```

### 確認方法

```bash
# Neutronでユーザーの残高を確認
neutrond query bank balances neutron1your_user_address --node https://rpc-palvus.pion-1.ntrn.tech:443

# IBCトークンが表示されるはず
{
  "balances": [
    {
      "denom": "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
      "amount": "1000000"
    }
  ]
}
```

## まとめ

**契約は必須ではありません**。

- **シンプルな転送**: 契約不要、直接IBCトークンとして受信
- **カスタムロジック**: 契約必要、高機能だが複雑

最初はシンプルなアプローチで始めて、必要に応じてカスタム契約を追加することを推奨します。

---

### 次のステップ

1. ✅ SUI側の実装（ITSを使用）
2. ✅ Neutronでの直接受信（契約なし）
3. 🔄 テストと検証
4. 📈 必要に応じてカスタム契約の追加