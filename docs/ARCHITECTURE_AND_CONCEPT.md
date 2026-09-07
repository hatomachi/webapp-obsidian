# Obsidian Web App (webapp-obsidian) 設計思想・コンセプト・アーキテクチャ仕様書

## 1. 開発動機と背景 (Motivation & Background)

### ① Obsidian 公式スマホアプリへの不満
- **起動の遅さ**: プラグインやVault肥大化に伴い、開くたびに数秒〜十数秒のローディング待ちが発生し、「今すぐ確認したい・メモしたい」という日常の機動力を損なっていた。
- **UI/UXの重さ**: スマホの小さな画面に対してデスクトップ版の移植感が強く、片手での情報閲覧・TODO消化には冗長。
- **複数Vault同期の高コスト**: Obsidian Sync ではVaultを増やすごとに追加課金が必要（または上位プラン縛り）になり、「個人用」「家族用」「プロジェクト用」など複数のVaultを用途別に運用する際のコスト障壁となっていた。

### ② 他者製セルフホスト（Docker等）のサプライチェーンリスク
- `linuxserver/obsidian` などの Docker Web版 Obsidian も存在するが、他者がビルド・配布した巨大なコンテナイメージを常時稼働させることには、重大なセキュリティリスク（コード精査の困難さ、サプライチェーン攻撃、不正通信リスク）が伴う。
- 自宅サーバーやVPSを常時起動し保守・監視し続ける手間とインフラ維持コストも発生する。

### ③ 先行成功体験（`obsidian-todo-calendar`）の確立
- 同一作者による `obsidian-todo-calendar` のモバイルWeb対応において、**「Cloudflare Pages (SPA/PWA) × GitHub Private Repository (GitHub API直接連携)」** というアーキテクチャが極めて優れていることが実証された。
- 外部サーバーを一切介さず、静的ホスティング（無料・保守不要）＋ 端末内ローカルストレージのFine-grained PAT ＋ GitHub API 直接暗号化通信により、**「完全無料・保守ゼロ・サプライチェーンリスク皆無・爆速起動」** を同時に達成できる。
- この成功思想を Obsidian 全体の Markdown ビューアー＆エディタへと昇華させたものが本プロジェクトである。

---

## 2. コア設計思想 (Core Principles)

| 原則 | 内容 |
| :--- | :--- |
| **1. 起動 0.1 秒の極限軽量** | サーバーサイドレンダリングや重量級フレームワークを排し、Vite + React 18 + Tailwind CSS による超軽量SPA (gzip 131KB) で構成。Service Worker/PWA キャッシュによりオフラインでも即時表示。 |
| **2. 完全サーバーレス＆保守コストゼロ** | バックエンド API サーバーやプロキシを自前運用しない。ホスティングは Cloudflare Pages、データ永続化は GitHub Private Repository に全権委託。インフラ障害対応や脆弱性パッチ当ての手間が永久にゼロ。 |
| **3. サプライチェーンリスク「ゼロ」** | ユーザーのプライベートなナレッジやGitHub PATが第三者のサーバーやプロキシを絶対に通過しない。通信は「ブラウザ ⇄ GitHub API」の直接HTTPSのみ。 |
| **4. 複数Vault（リポジトリ）の無制限切替** | 1つのWebアプリ内で、GitHub Private リポジトリをVault単位として何個でも登録・即時切替可能。Obsidian Sync の課金制限を根本解決する。 |
| **5. 閲覧特化＋旅行現場でのワンタップコミット** | モバイルでの主用途は「閲覧」と「TODO消化」。フル編集モードだけでなく、閲覧画面上の `- [ ]` をタップするだけで裏でGitHub APIが自動コミットされる楽観的UI更新を標準装備。 |

---

## 3. 全体アーキテクチャ＆データフロー

```mermaid
flowchart TD
    subgraph Client["📱 モバイル端末 (PWA / Safari / Chrome)"]
        UI["React 18 SPA<br>(Tailwind CSS)"]
        Cache["オフライン SWR キャッシュ<br>(localStorage / IndexedDB)"]
        Token["GitHub Fine-grained PAT<br>(localStorage 保持)"]
        UI <--> Cache
        UI <--> Token
    end

    subgraph Hosting["☁️ Cloudflare Pages (静的ホスティング)"]
        Pages["wrangler.json による SPA 配信<br>(HTML / JS / CSS)"]
    end

    subgraph GitHub["🐙 GitHub API (Private Repositories)"]
        RepoFamily["family-vault (夫婦共有Vault)"]
        RepoPersonal["personal-vault (個人専用Vault)"]
        RepoOther["...他のVault"]
    end

    Pages -->|1. 初回配信 (以降PWAキャッシュ)| UI
    UI -->|2. Git Trees API (ファイル階層一括取得)| GitHub
    UI -->|3. Raw Contents API (差分取得・SWR)| GitHub
    UI -.->|4. チェックボックストグル / 編集コミット| GitHub
```

### キャッシュ＆同期戦略（SWR: Stale-While-Revalidate）
1. **初回オープン時**:
   - `localStorage` にキャッシュされているMarkdown（直近のSHA）があれば、**0秒で画面に描画**。
2. **バックグラウンド検証**:
   - Git Trees API で現在のファイルの最新 `sha` を取得。キャッシュの `sha` と一致していれば通信終了。
   - 更新があれば新しいMarkdownをフェッチして画面とキャッシュを更新。
3. **オフライン耐性**:
   - 電波が圏外の地下鉄やジブリパーク園内でも、キャッシュから確実に旅程や持ち物リストを開ける。

---

## 4. Vault の権限境界と運用モデル

「テーマごとにリポジトリを分ける」のではなく、**「アクセス権限の境界（参照範囲）ごとにリポジトリ（Vault）を分ける」** 原則を徹底する。

```text
/Users/s-ikari/work/
├── webapp-obsidian/         # 【本アプリ】Cloudflare Pages 連携のPWA本体
│
├── family-vault/            # 【夫婦・家族共有 Vault】(GitHub: hatomachi/family-vault)
│   ├── 00_Dashboard.md      # 家族ポータル（ジブリパーク、鎌倉、大相撲等のリンク集約）
│   ├── 10_Events/           # 旅行・イベント（ジブリパーク、鎌倉旅行、大相撲初場所 など）
│   ├── 20_Life/             # 暮らし・住まい・家電・車
│   └── 30_Kids/             # 子ども・学校行事・習い事
│
└── personal-vault/          # 【個人専用 Vault】(GitHub: hatomachi/personal-vault)
    ├── 00_Dashboard.md      # 個人ダッシュボード
    ├── 00_Inbox/            # 日常の殴り書き・アイデア
    └── 10_Projects/         # 個人プロジェクト・AI壁打ち
```

- **妻のスマホ運用**:
  - 妻のスマホの `webapp-obsidian` には `family-vault` のみを登録。
  - 今後どれだけ旅行やイベントのフォルダが増えても、妻側での再設定や招待は一切不要。
- **ノート間リンク（WikiLink）の保護**:
  - `00_Dashboard.md` から `[[00_名古屋家族旅行_2026年9月_INDEX]]` などへ自由にジャンプ可能。

---

## 5. 今後の動線改善・拡張ロードマップ

今後Antigravityと pair programming していく際の改善テーマ：

1. **動線・ナビゲーションの洗練**:
   - スワイプジェスチャー（左エッジスワイプでファイルツリー、右エッジスワイプで目次TOC）。
   - 最近開いたノート（Recent Notes）の履歴タブ。
   - パンくずリスト（Breadcrumbs）や「戻る / 進む」履歴ボタン。
2. **編集・インプット体験の向上**:
   - 写真・画像の直接アップロード（GitHubの `assets/` フォルダへ自動Base64コミット）。
   - 音声入力メモの自動整形追記。
   - CodeMirror 6 によるシンタックスハイライト付き本格エディタモードの強化。
3. **検索・インデックス強化**:
   - Quick Switcher のさらなる高速化（キャッシュ済みノート本文のクライアント全文検索）。
   - タグ（`#tag`）一覧ドロワーとタグ絞り込み。
4. **ウィジェット・カレンダー連動**:
   - 日付付きノート（Daily Notes）のカレンダービュー連携。
