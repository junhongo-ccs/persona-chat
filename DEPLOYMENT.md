# デプロイガイド

## GitHub Codespaces から Railway へデプロイする手順

### ステップ1: GitHub にコードをプッシュ

1. ターミナルで以下のコマンドを実行：

```bash
cd /home/claude/persona-chat

# Gitリポジトリを初期化
git init

# すべてのファイルをステージング
git add .

# コミット
git commit -m "Initial commit: Multi-persona conversation generator"

# メインブランチ名を設定
git branch -M main

# GitHubでリポジトリを作成後、リモートを追加（URLは自分のものに変更）
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# プッシュ
git push -u origin main
```

### ステップ2: Railway でプロジェクトを作成

1. https://railway.app/ にアクセス
2. GitHubアカウントでログイン
3. 「New Project」ボタンをクリック
4. 「Deploy from GitHub repo」を選択
5. 先ほど作成したリポジトリを選択

### ステップ3: 環境変数を設定

Railway のプロジェクト画面で：

1. 「Variables」タブをクリック
2. 以下の環境変数を追加：

```
GOOGLE_API_KEY=your_google_api_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_TEMPERATURE=0.2
GEMINI_MAX_TOKENS=512
```

（Gemini API キーは https://aistudio.google.com/app/apikey から取得）

### ステップ4: デプロイを確認

- Railway が自動的にデプロイを開始します
- 数分後、「Settings」→「Domains」で公開URLが表示されます
- URLをクリックしてアプリにアクセス

## トラブルシューティング

### デプロイが失敗する場合

1. ログを確認：Railway の「Deployments」タブでログを確認
2. 環境変数を確認：`GOOGLE_API_KEY` が正しく設定されているか確認
3. package.json を確認：依存関係が正しいか確認

### アプリが起動しない場合

- Railway のログで「GOOGLE_API_KEY is not set」エラーが出ている場合
  → 環境変数を設定してください

- ポートエラーが出る場合
  → `server.js` は自動的に `process.env.PORT` を使用するため、通常は問題ありません

## ローカルテスト

デプロイ前にローカルでテストする場合：

```bash
# .envファイルを作成
cp .env.example .env

# .envを編集してAPIキーを設定
nano .env  # または任意のエディタ

# サーバーを起動
npm start

# ブラウザで開く
# http://localhost:3000
```

## 費用について

- **Railway**: 無料枠あり（月500時間まで）、超過後は従量課金
- **Gemini API**: 使用量に応じた課金（トークン数ベース）

複数ユーザーでの使用を想定する場合は、両方の料金体系を確認してください。
