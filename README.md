# 🎭 マルチキャラクター会議シミュレーター

AIキャラクターが異なる視点からビジネステーマについて議論するツールです。

## 特徴

- **4つのキャラクター**による多角的な議論
  - 🎯 ファシリテーター：議論を整理・進行
  - 📈 楽観的マーケター：機会と可能性を探る
  - ⚙️ 慎重なエンジニア：リスクと実現性を分析
  - 👤 ユーザー代表：使い手の視点で評価

- **完全に自由なテーマ設定**
- **AIによるテーマ具体化機能**（オプション）
- **議論ターン数の調整**（1-5回）

## 技術スタック

- **バックエンド**: Node.js + Express
- **API**: Claude API (Anthropic)
- **フロントエンド**: バニラHTML/CSS/JavaScript

## セットアップ

### 前提条件

- Node.js 18以上
- Anthropic API キー ([こちらから取得](https://console.anthropic.com/))

### ローカル開発

1. リポジトリをクローン

```bash
git clone https://github.com/junhongo-ccs/persona-chat
cd persona-chat
```

2. 依存関係をインストール

```bash
npm install
```

3. 環境変数を設定

```bash
cp .env.example .env
```

`.env`ファイルを編集して、Anthropic API キーを設定：

```
ANTHROPIC_API_KEY=your_actual_api_key_here
PORT=3000
```

4. サーバーを起動

```bash
npm start
```

5. ブラウザで開く

```
http://localhost:3000
```

## GitHub Codespaces から Railway へのデプロイ

### 1. GitHub にプッシュ

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Railway でデプロイ

1. [Railway](https://railway.app/) にアクセスしてログイン
2. 「New Project」をクリック
3. 「Deploy from GitHub repo」を選択
4. リポジトリを選択
5. 環境変数を設定：
   - `ANTHROPIC_API_KEY`: あなたのAnthropic APIキー
6. 「Deploy」をクリック

Railway が自動的に：
- Node.js を検出
- `npm install` を実行
- `npm start` でアプリを起動
- HTTPSドメインを割り当て

### 3. デプロイ完了

数分後、Railway が提供するURLでアプリにアクセスできます。

## 使い方

1. **テーマを入力**
   - 何について議論してほしいか、自由に入力してください
   - 例：「AI活用による業務効率化」「新サービスの価格戦略」など

2. **（オプション）テーマを具体化**
   - 「テーマを具体化する」ボタンで、AIが議論しやすい形に整形します
   - 気に入らなければ手動で編集できます

3. **ターン数を設定**
   - 各キャラクターが何回発言するか（1-5）

4. **会議を開始**
   - AIキャラクターが議論を展開します
   - 最後にファシリテーターが総括します

## API レート制限について

Claude APIの利用には制限があります：
- 無料tier: 月間一定のトークン数まで
- 詳細は [Anthropic の料金ページ](https://www.anthropic.com/pricing) を確認してください

複数ユーザーでの利用を想定する場合は、適切なプランを選択してください。

## カスタマイズ

### キャラクターの追加・変更

`server.js` の `PERSONAS` オブジェクトを編集：

```javascript
const PERSONAS = {
  your_persona: {
    name: "あなたのキャラクター名",
    role: "役割の説明",
    systemPrompt: "AIへの詳細な指示..."
  }
};
```

### UI のカスタマイズ

`public/index.html` のCSSセクションを編集してください。

## ライセンス

MIT

## 貢献

プルリクエストを歓迎します！

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
