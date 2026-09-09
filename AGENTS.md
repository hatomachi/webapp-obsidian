# AI Agent Instruction Guide for Obsidian Web App (webapp-obsidian)

このドキュメントは、AIエージェント（Antigravity / Pair Programmer）が新しいセッションで本プロジェクトに参加した際に、**設計思想・開発動機・アーキテクチャ・セキュリティ方針・今後の動線改善ロードマップ** を正確に理解し、ブレずに高品質な開発を継続するための総合ガイドです。

作業を開始する際は、必ず本ドキュメントおよび [`docs/ARCHITECTURE_AND_CONCEPT.md`](docs/ARCHITECTURE_AND_CONCEPT.md) を前提として行動してください。

> [!IMPORTANT]
> **🎯 プロダクト作戦ノート & Next Actions (personal-vault)**:  
> 本プロダクトの全体ビジョン、現在地、ユーザーからの日常フィードバック、直近の Next Actions は [webapp-obsidian.md](file:///Users/s-ikari/work/personal-vault/10_%E8%81%B7%E4%BA%BA%E3%83%BB%E7%99%BA%E6%98%8E%E5%AE%B6/webapp-obsidian.md) に一元管理されています。実装着手・機能完了時は必ず確認・更新してください。



---

## 1. 🎯 プロジェクトの存在理由と開発動機

ユーザーは Obsidian を愛用しているが、以下の課題を抱えていた：

1. **Obsidian 公式スマホアプリへの不満**:
   - 起動が遅い（開くたびに数秒のローディング待ちが発生し、現場でサッと見られない）。
   - モバイル画面で見づらい・操作が重い。
   - Obsidian Sync で複数Vaultを同期すると追加課金が発生しコストがかさむ。
2. **他者製Docker（`linuxserver/obsidian`等）のサプライチェーンリスク**:
   - 他者がビルドした巨大なコンテナイメージを常時稼働させることによるセキュリティリスク（コード精査の困難さ、不正通信・情報漏洩リスク）を敬遠。
3. **実証された成功体験**:
   - 姉妹リポジトリ `obsidian-todo-calendar` で確立された **「Cloudflare Pages (SPA/PWA) × GitHub Private Repository (GitHub API直接暗号化通信)」** というアーキテクチャの圧倒的な安全性と軽快さを、Obsidian 全体のビューアー＆エディタに適用した。

---

## 2. 🛡️ 遵守すべきコアアーキテクチャ原則（破ってはならないルール）

1. **バックエンドサーバー・中継プロキシを作らない（完全サーバーレス）**:
   - ホスティングは **Cloudflare Pages / Workers Assets** による静的ファイル配信のみ。
   - バックエンド API サーバーの構築や、中継プロキシの導入は禁止（保守コスト発生とサプライチェーンリスクを避けるため）。
2. **トークンと機密データは端末内に閉じる**:
   - GitHub Fine-grained PAT はブラウザの `localStorage` にのみ保存。
   - 通信は「端末（ブラウザ） ⇄ GitHub API」の直接暗号化通信のみ。
3. **爆速起動（0.1秒）とオフライン耐性（SWRキャッシュ）**:
   - 端末ローカルのキャッシュ（Markdown content + sha）から0秒で描画し、裏で最新shaを確認する SWR (Stale-While-Revalidate) を維持すること。
4. **複数Vaultのワンタップ切替**:
   - ユーザーは `family-vault`（夫婦・家族共有）と `personal-vault`（個人用）を主軸として運用している。リポジトリ切り替えの動線を損なわないこと。
5. **閲覧ファースト＋楽観的TODOトグルコミット**:
   - モバイルでの主要操作は「旅程・計画の閲覧」と「TODO消化」。閲覧モードのまま `- [ ]` を押したら即座に画面上でチェックが入り、裏でGitHub APIへコミットされる体験を維持・拡張すること。

---

## 3. 📂 コードベース構成と各ファイルの責務

```text
webapp-obsidian/
├── AGENTS.md                                   # 【必読】本ドキュメント
├── README.md                                   # アプリ概要・セットアップ
├── wrangler.json                               # Cloudflare Pages / Workers Assets SPA設定
├── vite.config.ts                              # Vite 設定 (ポート 3333, パスエイリアス @/*)
├── docs/
│   ├── ARCHITECTURE_AND_CONCEPT.md            # 詳細設計思想・セキュリティ仕様書
│   └── DEPLOY_TO_CLOUDFLARE_PAGES.md          # Cloudflare Pages デプロイ手順書
├── public/
│   ├── manifest.webmanifest                    # PWA マニフェスト設定
│   └── obsidian.svg                            # アプリアイコン
└── src/
    ├── types/index.ts                          # VaultConfig, FileNode, TOCItem, SearchResult
    ├── services/
    │   ├── GitHubService.ts                    # Octokit による Git Trees, Contents API, キャッシュ, コミット
    │   └── VaultManager.ts                     # 複数Vaultの追加・切替・永続化
    ├── utils/
    │   ├── encoding.ts                         # マルチバイト安全な UTF-8 ⇄ Base64, タイトル抽出
    │   └── markdownUtils.ts                    # WikiLink置換, Calloutパース, TOC抽出
    ├── components/
    │   ├── Layout/Header.tsx                   # ヘッダー (Vault切替, 検索, TOC, 編集, 設定)
    │   ├── Drawers/
    │   │   ├── FileTreeDrawer.tsx              # 左スライドイン階層ファイルツリー
    │   │   └── TOCDrawer.tsx                   # 右スライドイン目次（見出しスクロール）
    │   ├── Modals/
    │   │   ├── QuickSwitcherModal.tsx          # インクリメンタルファイル検索
    │   │   ├── EditModal.tsx                   # フルテキスト編集＆コミット
    │   │   └── SettingsModal.tsx               # 複数Vault管理・PAT設定・接続テスト
    │   └── MarkdownViewer/
    │       ├── MarkdownViewer.tsx              # react-markdown + GFM + インタラクティブチェックボックス
    │       └── Callout.tsx                     # Obsidian Callout (NOTE, TIP, WARNING 等) スタイリング
    ├── App.tsx                                 # メインコンポーネント (状態管理, 下部クイック追記, トースト)
    ├── main.tsx                                # React エントリーポイント
    └── index.css                               # Tailwind CSS + ダークテーマ + safe-area
```

---

## 4. 🔗 関連Vaultリポジトリのコンテキスト

ユーザーは以下のリポジトリ構成でデータを管理している。開発やテストの際は常にこの構造を念頭に置くこと。

| リポジトリ名 | GitHub URL | 役割・参照範囲 | 主な中身 |
| :--- | :--- | :--- | :--- |
| **`family-vault`** | `hatomachi/family-vault` | 夫婦・家族共有 | `00_Dashboard.md`, `10_Events/` (202609_ジブリパーク, 202607_鎌倉旅行, 202701_大相撲初見物), `20_Life/`, `30_Kids/` |
| **`personal-vault`** | `hatomachi/personal-vault` | 個人専用 | `00_Dashboard.md`, `00_Inbox/`, `10_Projects/` |
| **`task-management`** | `hatomachi/task-management` | 個人タスク管理 (Jira風) | `tickets/TASK-XXX.md`, `README.md` (チケット管理ルール厳守) |

---

## 5. 🚀 今後の機能拡張・動線改善テーマ（ロードマップ）

ユーザーとの今後の対話で「動線改善」「機能追加」を行う際は、以下のテーマを優先的に検討・実装すること：

1. **📱 モバイル動線・ジェスチャー操作の強化**:
   - 画面左端からのエッジスワイプでファイルツリーを開く。
   - 画面右端からのエッジスワイプで目次（TOC）を開く。
   - ノート履歴（「戻る」「進む」ナビゲーション）の導入。
   - 最近閲覧したノート（Recent Notes）のクイックアクセス。
2. **📝 入力・編集UXの洗練**:
   - 下部クイック追記バーの機能拡張（日付スタンプ挿入、TODO以外のプレーンテキスト追記）。
   - 写真・画像の添付機能（スマホカメラで撮影した画像を `assets/` フォルダへ自動コミットし `![[img.jpg]]` 挿入）。
3. **🔍 検索・発見の高速化**:
   - Quick Switcher の本文全文検索対応（キャッシュ済みMarkdownのローカルインデックス検索）。
   - タグ（`#旅行`, `#TODO` 等）の一覧表示とタグフィルター。
4. **🎨 Obsidian 互換性の拡充**:
   - `![[画像]]` や `![[別ノート]]`（Embed）の埋め込みプレビュー。
   - Mermaid ダイアグラムのインライン描画。

---

## 6. 🛠️ 開発・ビルドコマンド

```bash
# 開発サーバー起動 (ポート 3333)
npm run dev

# 型チェック＆本番ビルド (dist/ 出力)
npm run build

# ビルドプレビュー
npm run preview
```

新しいコードを追加・変更した際は、必ず `npm run build` を通し、型エラーや未定義インポートがないことを確認した上でコミットすること。
