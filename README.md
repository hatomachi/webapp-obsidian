# Obsidian Web App (PWA)

Obsidian用の**超軽量・セキュア・複数Vault対応**なモバイルWeb（PWA）ビューアー＆エディタ。  
Cloudflare Pages × GitHub Private Repository（GitHub API直接通信）の完全サーバーレス・無料構成で動作します。

---

## 📱 特徴とメリット

1. **⚡ 爆速起動（0.1〜0.2秒）＆ PWA対応**:
   - 公式アプリのような起動待機時間がゼロ。Safari / Chrome の「ホーム画面に追加」でネイティブアプリ感覚で起動。
   - オフラインキャッシュ（IndexedDB / LocalStorage）により、地下鉄や電波の悪い旅行先でも即座に閲覧可能。
2. **💎 複数Vault（リポジトリ）の完全無料・即時切替**:
   - 「ジブリパーク旅行計画」「個人タスク」「アイデア帳」など、Vaultごとにリポジトリを分けていても、ヘッダーのドロップダウンから1タップで即時切り替え可能（Obsidian Syncの複数Vault追加課金を完全回避）。
3. **🛡️ サプライチェーンリスク「ゼロ」＆高セキュリティ**:
   - `linuxserver/obsidian` のような他者製Dockerイメージやプロキシサーバーを一切挟みません。
   - GitHub Token（Fine-grained PAT）はユーザー端末の `localStorage` にのみ暗号化保存され、スマホ ⇄ GitHub 間で直接暗号化通信。
4. **🔗 Obsidian 特有記法の完全サポート**:
   - **WikiLink (`[[ノート名]]` / `[[ノート名|表示名]]`)**: タップで該当ノートへスムーズに画面遷移。
   - **Obsidian Callouts (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]` 等)**: Obsidian標準の上質なカラーとアイコンで描画。
   - **インタラクティブ・チェックボックス**: 閲覧モードのまま `- [ ]` をタップするだけで、裏でGitHub APIが自動コミット（旅行中のTODO消化に最適）。
   - **目次（TOC）ドロワー**: 長いノートでもワンタップで目的の見出しへスクロール。
   - **Quick Switcher (ファイル検索)**: 全ファイルを対象にあいまい・インクリメンタル検索。
   - **クイック追記バー**: ノート末尾にワンタップでメモを追記。
   - **フルテキスト編集**: 編集モーダルからノート全体を直接編集・コミット可能。

---

## 🚀 ローカル起動方法

```bash
cd /Users/s-ikari/work/webapp-obsidian
npm run dev
```

ブラウザで `http://localhost:3333` を開きます。

---

## ☁️ Cloudflare Pages へのデプロイ手順（完全無料）

📖 **スクショ不要で迷わず完了する詳細手順書**:
👉 [Cloudflare Pages デプロイ＆初期セットアップ完全ガイド](docs/DEPLOY_TO_CLOUDFLARE_PAGES.md)

1. **GitHub に本リポジトリ（`webapp-obsidian`）を push**:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit of webapp-obsidian"
   # GitHubで空リポジトリを作成後
   git remote add origin https://github.com/<your-username>/webapp-obsidian.git
   git push -u origin main
   ```
2. **Cloudflare ダッシュボードで Pages プロジェクトを作成**:
   - 「Workers & Pages」 ➡ 「作成」 ➡ 「Pages」 ➡ 「Git に接続」
   - リポジトリ: `webapp-obsidian`
   - ビルド設定:
     - **フレームワークプリセット**: `None` または `Vite`
     - **ビルドコマンド**: `npm run build`
     - **ビルド出力ディレクトリ**: `dist`
3. **デプロイ完了**:
   - 生成された URL（例: `https://webapp-obsidian.pages.dev`）にスマホからアクセス。
   - Safari の共有メニュー ➡ **「ホーム画面に追加」** をタップすると、アプリアイコンからフルスクリーンPWAとして起動できます。

---

## ⚙️ Vault（GitHub Private リポジトリ）の設定方法

1. 右上の **⚙️ 設定ボタン** をタップ。
2. **「Vaultを追加」** で以下を入力：
   - **Vault 表示名**: 例 `ジブリパーク旅行計画`
   - **GitHub Owner**: 例 `hatomachi`
   - **Repo 名**: 例 `202609_ghibli-park`（または該当Vaultのリポジトリ名）
   - **Branch**: `main`
   - **GitHub Personal Access Token (PAT)**:
     - GitHub Settings ➡ Developer Settings ➡ Personal Access Tokens (Fine-grained tokens)
     - 対象リポジトリを選択し、**Permissions** で `Contents: Read and write` を付与したトークン。
3. **「🔌 接続テスト」** を押し、成功したら **「Vaultを追加」** をタップ。
4. ノート一覧が自動で読み込まれます。
