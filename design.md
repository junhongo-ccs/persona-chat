# DESIGN.md

## CONCEPT: What is DESIGN.md?（このファイルの位置づけ）
- `DESIGN.md` は、このプロジェクトにおける見た目の正本（Single Source of Truth）です。
- これは参考資料ではなく、AIエージェントと人間の間で共有する「厳格な境界条件（契約）」です。
- 目的は、毎回の自然言語プロンプトによる解釈ブレをなくし、UIの一貫性を固定資産として維持することです。

### このプロジェクトでの運用原則
1. **推測・憶測によるデザインを禁止する**
- このファイルに記載されていないスタイル（影、グラデーション、アニメーション、丸みなど）を、AIの判断で追加しない。

2. **`DESIGN.md` を境界条件として厳守する**
- 色、余白、タイポ、禁止事項は具体値を優先し、解釈の余地を最小化する。

3. **迷ったときはフラットにする**
- 装飾を足すのではなく、最もシンプルで装飾のない状態を選択する。

4. **Do's and Don'ts を最優先する**
- 「やってはいけないこと」を明示した項目を、実装時の最終チェック基準として扱う。

## 1. Design Intent
- 参考トンマナ: `getdesign.md/figma/design-md` のスクショにある「明るい背景 + 高彩度アクセント + クリーンなSaaS UI」。
- 目的: 見た目を派手にするだけでなく、情報の階層・操作導線・可読性を高める。
- 必須条件:
  - 日本語表示で崩れないこと（長文、全角記号、改行、狭い画面）。
  - 既存機能（テーマ具体化、会話生成、エラー通知）を壊さないこと。

## 2. Visual Language

### 2.1 Tone
- Playful but professional.
- Light mode first。
- 高コントラストの本文テキスト、柔らかい面色、強いCTAグラデーション。
- Flat first（立体表現より情報整理を優先）。

### 2.2 Color Tokens
- Source: ユーザー提供スクショ内のカラーカード記載値（推定禁止）。
- Base:
  - `--canvas: #ffffff`
  - `--inverse-canvas: #000000`
  - `--surface-soft: #f7f7f5`
  - `--hairline: #e6e6e6`
  - `--hairline-soft: #f1f1f1`
- Pastel blocks:
  - `--block-lime: #dceeb1`
  - `--block-lilac: #c5b0f4`
  - `--block-cream: #f4ecd6`
  - `--block-mint: #c8e6cd`
  - `--block-pink: #efd4d4`
  - `--block-coral: #f3c9b6`
  - `--block-navy: #1f1d3d`
- Text:
  - `--text-primary: #1f1d3d` (Block Navyベース)
  - `--text-secondary: #555555`
- Persona mapping (固定, パステル準拠):
  - facilitator = `--block-lilac`
  - optimist = `--block-mint`
  - realist = `--block-cream`
  - customer = `--block-pink`

### 2.3 Typography
- Font stack:
  - `Inter`, `Noto Sans JP`, `Hiragino Sans`, `Meiryo`, sans-serif
- **Typography tokens は必須**（任意ではない）。
- Type tokens:
  - `--type-headline`
    - `font-size: 26px`
    - `font-weight: 600`
    - `line-height: 1.35`
    - `letter-spacing: -0.26px`
  - `--type-subhead`
    - `font-size: 26px`
    - `font-weight: 340`
    - `line-height: 1.35`
    - `letter-spacing: -0.26px`
  - `--type-card-title`
    - `font-size: 24px`
    - `font-weight: 700`
    - `line-height: 1.45`
    - `letter-spacing: 0`
  - Heading hierarchy (H4/H5/H6相当):
    - `--type-h4`
      - `font-size: 22px`
      - `font-weight: 680`
      - `line-height: 1.45`
      - `letter-spacing: 0`
    - `--type-h5`
      - `font-size: 20px`
      - `font-weight: 640`
      - `line-height: 1.45`
      - `letter-spacing: 0`
    - `--type-h6`
      - `font-size: 18px`
      - `font-weight: 600`
      - `line-height: 1.45`
      - `letter-spacing: 0`
  - `--type-body-lg`
    - `font-size: 20px`
    - `font-weight: 330`
    - `line-height: 1.40`
    - `letter-spacing: -0.14px`
  - `--type-body`
    - `font-size: 18px`
    - `font-weight: 320`
    - `line-height: 1.45`
    - `letter-spacing: -0.26px`
  - `--type-body-sm`
    - `font-size: 16px`
    - `font-weight: 330`
    - `line-height: 1.45`
    - `letter-spacing: -0.14px`
- 日本語適用ルール:
  - 日本語本文は可読性を優先し、`letter-spacing` は `0` 〜 `-0.14px` の範囲で使う。
  - display系以外で強いマイナストラッキングは避ける。
- 日本語での禁止:
  - 過度な letter-spacing。
  - 長文を1行固定するレイアウト。

### 2.4 Radius / Shadow / Border
- Radius:
  - card: 16px
  - input/button: 12px
  - chips: 999px
- Shadow:
  - **使用しない（禁止）**
  - card / section / button は `box-shadow: none` を基本とする
- Border:
  - 1pxの薄い境界線を基本。色ブロックは左ボーダーで識別。

## 3. Layout Rules
- Max width: `960-1120px`
- セクション間隔: 16-24px
- カード内余白: 24-32px
- モバイル (`<= 600px`):
  - 左右余白を縮小（12-16px）
  - ボタン縦積み
  - タイムスタンプは折返し崩れしない位置に

### 3.1 8px Grid System
- すべての spacing / sizing は原則 `8px` の倍数で設計する。
- 基本スケール:
  - `4, 8, 12, 16, 24, 32, 40, 48, 64`
  - 原則は 8 の倍数。`4` と `12` は微調整でのみ使用可。
- 適用ルール:
  - セクション間: `16 / 24`
  - カード内 padding: `24`（モバイルは `16`）
  - 入力間隔: `8` または `16`
  - ボタン高さ: `40` 以上（推奨 `48`）
  - 角丸: `8 / 12 / 16` のみ
- 禁止:
  - `7px`, `10px`, `14px` などランダム値の新規追加
  - 同一コンポーネント内で根拠のない複数単位混在
- 実装メモ:
  - CSSカスタムプロパティで `--space-1: 8px` を基準化し、
    `--space-2: 16px`, `--space-3: 24px` のように展開する。

## 4. Components

### 4.0 Color-Block Sections (重要)
- 参考: スクショの Color-Block Sections（Lime/Lilac/Cream/Mint/Pink/Coral/Navy）。
- 目的: セクション単位で情報を柔らかく区切り、視線誘導を作る。
- 基本ルール:
  - 1セクション=1トーン（多色混在を避ける）
  - 背景はパステル、本文は濃色テキストで可読性優先
  - セクション内カードは同系色の濃淡で統一
- 推奨マッピング:
  - 導入・説明: `--block-lilac` / `--block-cream`
  - ポジティブ訴求: `--block-mint` / `--block-lime`
  - 注意喚起・比較: `--block-coral` / `--block-pink`
  - 強調帯・締め: `--block-navy`（文字は `--canvas`）
- レイアウト:
  - セクションpadding: 24-40px
  - セクション間gap: 16-24px
  - 内部カードradius: 12-16px
- 禁止:
  - 原色寄りの派手色を上書き追加すること
  - 背景色と文字色のコントラスト不足

### 4.1 Hero/Header
- シンプルな見出し + 補足テキスト。
- 背景は淡いグラデーション/グローを使用。

### 4.2 Persona Legend Cards
- 各話者カードは会話カードと同じ色体系を使う。
- ルール:
  - 凡例色とメッセージ色の対応は必ず1:1
  - アイコンは装飾、色が主識別子

### 4.3 Form Block
- 入力欄は十分な高さ（最低 96px）
- Focus ringは `--block-lilac` の半透明ハロー
- Primary CTA:
  - ダーク基調（`--block-navy`）または控えめグラデーション
  - 彩度を上げすぎない（スクショ相当のやわらかさを維持）
  - hoverで軽く浮く
- ボタン表現:
  - フラット（影なし）
  - 識別は「色」「境界線」「文字ウェイト」で作る

### 4.4 Conversation Cards
- 色面 + 左ボーダーで話者識別。
- 長文耐性:
  - `overflow-wrap: anywhere;`
  - `word-break: break-word;`
  - `line-break: strict;`

### 4.5 Toast
- 右上スタック、success/errorの色区別。
- `alert()` は使用しない。

## 5. Interaction
- Transitionは短く（150-250ms）。
- 不必要な派手アニメーションは禁止。
- ローディング中は操作不能状態を明示。

## 6. Accessibility
- 通常テキストはWCAG AA相当コントラストを維持。
- キーボードフォーカス可視化を必須化。
- トーストは `aria-live="polite"` を使用。

## 7. Content & Language (Japanese-first)
- UI文言は自然な日本語。
- 半角英数字と日本語の混在を想定し崩れないレイアウトにする。
- 箇条書きや補助文は短く、視線負荷を減らす。

## 8. Guardrails
- やってよい:
  - トークン化、余白調整、色統一、可読性改善
- やってはいけない:
  - 機能ロジック改変
  - 話者色マッピングの変更
  - ダークモード前提への変更（必要時は別テーマとして追加）
  - card / section / button に影を追加すること

## 9. Implementation Checklist
- [ ] 凡例と会話カードの話者色が一致
- [ ] 日本語長文でカードが崩れない
- [ ] スマホ幅でCTA/入力が操作しやすい
- [ ] エラー通知がトーストで読める
- [ ] 既存API連携が壊れていない
