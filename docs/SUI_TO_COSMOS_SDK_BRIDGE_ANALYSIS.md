# SUIからCosmos-SDKブロックチェーンへの任意のトークン転送調査レポート

## 調査概要

本調査では、Axelar CGP Suiリポジトリを分析し、SUIからCosmos-SDKベースのブロックチェーンに任意のトークンを転送する機能について調査を行いました。

## 調査結果

### ✅ **SUIからCosmos-SDKブロックチェーンへのトークン転送は可能です**

## 1. システム概要

### Axelar Cross-Chain Gateway Protocol (CGP)
- **このリポジトリの機能**: Sui用のAxelar CGPの実装
- **目的**: クロスチェーンメッセージングとトークン転送を可能にする
- **アーキテクチャ**: Axelarネットワークをハブとして利用し、異なるブロックチェーン間でのトークン転送を仲介

### 主要コンポーネント
1. **Axelar Gateway** (`move/axelar_gateway/`)
   - クロスチェーンメッセージの承認と実行
   - 署名者の管理とローテーション
   - イベントの発行と受信

2. **Interchain Token Service (ITS)** (`move/interchain_token_service/`)
   - トークンの登録と管理
   - クロスチェーントークン転送の実行
   - トークンのmint/burn機能

3. **Relayer Discovery** (`move/relayer_discovery/`)
   - リレイヤーがどの関数を呼び出すべきかを決定
   - トランザクションの動的構築

## 2. トークン転送機能の詳細

### 対応するトークンタイプ
- **任意のSUIネイティブトークン**: Sui Move言語で定義されたCoinタイプ
- **Mint/Burnトークン**: TreasuryCapを使用してミントとバーンが可能
- **Lock/Unlockトークン**: プールにロックして他チェーンで複製

### サポートされるメッセージタイプ
1. **INTERCHAIN_TRANSFER (0)**: 基本的なトークン転送
2. **DEPLOY_INTERCHAIN_TOKEN (1)**: 新しいトークンのリモートデプロイ
3. **LINK_TOKEN (5)**: 既存トークンの他チェーンでのリンク
4. **REGISTER_TOKEN_METADATA (6)**: トークンメタデータの登録

### 実装されている機能

#### 送信機能
```move
// interchain_token_service.move:158
public fun prepare_interchain_transfer<T>(
    token_id: TokenId,
    coin: Coin<T>,
    destination_chain: String,
    destination_address: vector<u8>,
    metadata: vector<u8>,
    source_channel: &Channel,
): InterchainTransferTicket<T>
```

#### 受信機能
```move
// interchain_token_service.move:191
public fun receive_interchain_transfer<T>(
    self: &mut InterchainTokenService,
    approved_message: ApprovedMessage,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

## 3. Cosmos SDK統合について

### 依存関係の確認
- `package.json`に`@cosmjs/cosmwasm-stargate: ^0.32.2`の依存関係を確認
- AxelarネットワークはCosmos SDKベースで構築されており、これがブリッジとして機能

### Axelarネットワークの役割
- **ハブとして機能**: SUIと他のチェーン（Cosmos SDK含む）を接続
- **検証ネットワーク**: 複数の検証者がクロスチェーンメッセージを検証
- **ITS Hub**: トークン転送の中央ハブとして動作（`const ITS_HUB_CHAIN_NAME: vector<u8> = b"axelar"`）

## 4. 技術的制限と要件

### SUI固有の制限
- **メッセージサイズ**: 16KB制限
- **署名者セット**: 最大313署名者サポート
- **ガス制限**: 50 SUI（通常のトランザクションより100倍大きい）
- **トランザクションサイズ**: 128KB制限

### 必要な設定
1. **信頼できるチェーンの設定**
   ```move
   public fun add_trusted_chains(
       self: &mut InterchainTokenService, 
       _owner_cap: &OwnerCap, 
       chain_names: vector<String>
   )
   ```

2. **トークン登録**
   ```move
   public fun register_coin<T>(
       self: &mut InterchainTokenService, 
       coin_info: CoinInfo<T>, 
       coin_management: CoinManagement<T>
   ): TokenId
   ```

## 5. 実装例

### 基本的なトークン転送の例
```move
// example/sources/its/its.move:185
public fun send_interchain_transfer_call<TOKEN>(
    singleton: &Singleton,
    its: &mut InterchainTokenService,
    gateway: &mut Gateway,
    gas_service: &mut GasService,
    token_id: TokenId,
    coin: Coin<TOKEN>,
    destination_chain: String,        // 例: "cosmoshub-4"
    destination_address: vector<u8>,  // Cosmos SDKアドレス
    metadata: vector<u8>,
    refund_address: address,
    gas: Coin<SUI>,
    gas_params: vector<u8>,
    clock: &Clock,
)
```

## 6. Cosmos-SDKブロックチェーンでの展開手順

### 必要なステップ
1. **ITSでトークンを登録**: `register_coin`または`register_custom_coin`を使用
2. **宛先チェーンを信頼済みチェーンに追加**: Cosmos-SDKチェーン名を指定
3. **ガス料金の支払い**: `GasService`を使用してクロスチェーン転送の料金を支払い
4. **転送の実行**: `send_interchain_transfer_call`を呼び出し

### サポートされているチェーンの例
テストコードから以下のチェーン名が確認されています：
- "Chain Name" (汎用テストチェーン)
- "Ethereum", "Avalanche", "Axelar" (テストで言及)

## 7. 制限事項と注意点

### 技術的制限
- **Sui固有の設計**: オブジェクトベースのストレージとインターフェース不足
- **アップグレード複雑性**: 依存パッケージのアップグレード管理が困難
- **リレイヤー依存**: 外部リレイヤーがトランザクションを実行する必要

### セキュリティ考慮事項
- **検証者の分散**: Axelarネットワークの検証者セットに依存
- **署名検証**: 重み付き署名者による多重署名検証
- **メッセージの一意性**: 重複実行を防ぐメカニズム

## 8. 結論と推奨事項

### ✅ **実現可能性**: 高い
SUIからCosmos-SDKブロックチェーンへの任意のトークン転送は技術的に可能であり、すでに実装されています。

### 推奨される実装アプローチ
1. **Axelar ITSの活用**: 既存のInterchain Token Serviceを使用
2. **段階的展開**: まず基本的なトークン転送を実装し、後に高度な機能を追加
3. **テストネット検証**: 本番環境での展開前に十分なテスト

### 次のステップ
1. 対象のCosmos-SDKチェーンがAxelarネットワークでサポートされているか確認
2. トークンの登録とメタデータの設定
3. リレイヤーインフラストラクチャの準備
4. ガス料金とトークノミクスの計画

---

**本調査は2024年6月26日時点でのAxelar CGP Sui v1.1.3に基づいています。**