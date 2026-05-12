# Render 実装計画（persona-chat）

## 目的

- `Express (server.js)` 構成を大きく変えずに本番公開する
- 秘密情報（`GOOGLE_API_KEY`）を安全に管理する
- 継続運用しやすい最小構成を先に実現する

## 方針

- ホスティング先は `Render Web Service` を採用
- リポジトリ連携で `main` への push を自動デプロイ
- API キーは Render の Environment Variables で注入

## スコープ

- 対象: バックエンド + 静的フロントを同一 Node サービスで公開
- 非対象: DB 導入、認証、アクセス制御、利用量制限の実装

## 実装ステップ

1. リポジトリ準備
- `main` ブランチをデプロイブランチとして固定
- `.env` はローカル専用のまま保持し、Git には含めない（現状 `.gitignore` で管理）

2. Render サービス作成
- Render ダッシュボードで `New +` → `Web Service`
- GitHub の `junhongo-ccs/persona-chat` を接続
- Runtime は `Node`

3. Build / Start 設定
- Build Command: `npm install`
- Start Command: `npm start`

4. 環境変数設定（Render）
- 必須:
  - `GOOGLE_API_KEY=...`
- 任意:
  - `GEMINI_MODEL=gemini-2.0-flash`
  - `GEMINI_TEMPERATURE=0.2`
  - `GEMINI_MAX_TOKENS=512`
- `PORT` は Render が自動付与するため、Render 側で固定設定しない

5. デプロイ確認
- Deploy ログで `Server running on port ...` を確認
- 公開 URL で画面表示を確認
- `GET /api/health` が `{"status":"ok", ...}` を返すことを確認

6. 動作確認（業務シナリオ）
- 「テーマを具体化する」で API エラーが出ないこと
- 「会議を開始」で複数ペルソナの会話が生成されること
- 連続実行で 429/timeout が許容範囲であること

7. 運用準備
- 障害時確認手順を README/運用メモに追記
- API キーのローテーション手順を記録

## 受け入れ条件

- 公開 URL でトップ画面が表示される
- `/api/health` が 200 を返す
- テーマ具体化・会話生成が成功する
- `GOOGLE_API_KEY` がリポジトリ内に平文保存されていない

## リスクと対策

- API キー未設定で 500 エラー
  - 対策: デプロイ直後に環境変数を最優先で確認
- 無料枠/レート制限による失敗（429）
  - 対策: リトライ設定の現行値を維持し、利用量を監視
- コールドスタートで初回応答が遅い
  - 対策: ヘルスチェックで起動確認後に受け入れテストを実施

## 将来拡張（任意）

1. フロントと API を分離（静的配信 + API サービス）
2. 利用量制限（IP 単位レート制限）を追加
3. 監視連携（外形監視 + エラーログ通知）

## 作業メモ（今回）

- ローカル起動確認済み: `http://localhost:3000`
- 既知注意点: `GOOGLE_API_KEY` 未設定時はテーマ具体化/会話生成が失敗する
