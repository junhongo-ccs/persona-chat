# 🎭 マルチペルソナ会議シミュレーター

AIペルソナが異なる視点からビジネステーマについて議論するツールです。

## 特徴

- **4つのペルソナ**による多角的な議論
  - 🎯 ファシリテーター：議論を整理・進行
  - 📈 楽観的マーケター：機会と可能性を探る
  - ⚙️ 慎重なエンジニア：リスクと実現性を分析
  - 👤 ユーザー代表：使い手の視点で評価

- **完全に自由なテーマ設定**
- **AIによるテーマ具体化機能**（オプション）
- **議論ターン数の調整**（1-5回）

## 技術スタック

- **バックエンド**: Node.js + Express
- **API**: Google Gemini / Vertex AI Generative Models
- **フロントエンド**: バニラHTML/CSS/JavaScript

## セットアップ

### 前提条件

- Node.js 18以上
- Google Cloud の API キー（Vertex AI Generative Models のアクセス用）またはサービスアカウント

### ローカル開発

1. リポジトリをクローン

```bash
git clone <your-repo-url>
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

`.env`ファイルを編集して、Google の API キー（もしくはサービスアカウント経由の設定）を設定：

```
GOOGLE_API_KEY=your_google_api_key_here
GEMINI_MODEL=models/text-bison-001 # 任意: 使用するモデル名
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
   - `GOOGLE_API_KEY`: Google Cloud の API キー（Vertex AI へのアクセス）
   - `GEMINI_MODEL` (任意): 使用するモデル名（例: `models/text-bison-001`）
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
   - 各ペルソナが何回発言するか（1-5）

4. **会議を開始**
   - AIペルソナが議論を展開します
   - 最後にファシリテーターが総括します

## API レート制限について

Gemini API の利用には制限と課金が適用されます：
- 無料枠や上限は変更される可能性があります
- 最新情報は Google Cloud の料金ページとクォータ情報を参照してください

複数ユーザーでの利用を想定する場合は、適切なクォータと予算を設定してください。

## カスタマイズ

### ペルソナの追加・変更

`server.js` の `PERSONAS` オブジェクトを編集：

```javascript
const PERSONAS = {
  your_persona: {
    name: "あなたのペルソナ名",
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
