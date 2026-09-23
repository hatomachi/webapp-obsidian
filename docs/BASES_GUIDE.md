# 📊 Obsidian Bases 機能・フォーマット完全仕様ガイド（AI・開発者向け）

本ドキュメントは、AIエージェント（ChatGPT, Claude, Gemini, Cursor等）およびユーザーが、**Web App Obsidian (webapp-obsidian) の Bases 機能（表形式データベースビューア）** で表示・直接編集するための `.base` 定義ファイルやデータファイルを正しく作成・生成するための完全ガイドです。

---

## 1. 🎯 Bases 機能の概要

Obsidian Bases は、Obsidian Vault 内のデータを **リッチな表形式（テーブル）** で可視化し、**表上で直接プロパティの値をインライン編集してGit（GitHub / GitLab）へ自動コミット** できる機能です。

### 主な特徴
1. **0秒起動・完全サーバーレス**: Cloudflare Pages 上で直接動作し、ブラウザから Git リポジトリへ直接通信・保存。
2. **表上での直接インライン編集**: セルをタップして直接値を変更・保存（Booleanワンタップ反転、Status候補選択、タグ追加/削除、テキスト入力）。
3. **編集可能列の縛り（権限制御）**: `.base` ファイル内で編集を許可する列を制限・全ロック可能。
4. **安全なAST更新**: コメント（`# ...`）やインデント構造、Markdown本文を100%保持しながら安全にプロパティを更新。

---

## 2. 🗂️ 2つのデータソースモード

Bases には、用途に応じて **「単一YAML配列モード」** と **「フォルダ内Markdownモード」** の2種類があります。

```
                    ┌─ ① 単一YAML配列モード (target: data.yaml)
                    │  └─ 1つのYAMLファイル内の配列要素を行としてテーブル化
Obsidian Bases ─────┤
                    └─ ② フォルダ内Markdownモード (target: フォルダ名)
                       └─ フォルダ内の複数.mdファイルのFrontmatterや見出しを行としてテーブル化
```

---

### モード①：単一YAML配列モード（`target: xxx.yaml`）

1つのYAMLファイル内に定義された配列（リスト）を行（Row）として展開します。  
**タスク管理、商品リスト、イベント一覧、ログなど、1ファイルで大量の軽量データを管理したい場合に最適です。**

#### 1. データファイル例（`00_Inbox/sample_tasks.yaml`）
```yaml
# プロジェクトタスク一覧
tasks:
  - id: 1
    name: ログイン画面の実装
    status: 完了
    priority: 高
    done: true
    tags: [frontend, auth]
    memo: OAuth2連携テスト済み
  - id: 2
    name: パフォーマンスチューニング
    status: 進行中
    priority: 緊急
    done: false
    tags: [infra, speed]
    memo: SWRキャッシュの最適化
  - id: 3
    name: 利用規約の作成
    status: 未着手
    priority: 低
    done: false
    tags: [legal]
    memo: 法務レビュー待ち
```

#### 2. 定義ファイル例（`00_Inbox/sample_yaml.base`）
```yaml
target: 00_Inbox/sample_tasks.yaml
property: tasks
columns:
  - id
  - name
  - status
  - priority
  - done
  - tags
  - memo

# 編集可能列の制限（status, priority, done, memo のみ表上で直接編集可能）
editable:
  - status
  - priority
  - done
  - memo

sort: id
order: asc
```

---

### モード②：フォルダ内Markdownモード（`target: フォルダ名`）

指定フォルダ内のすべてのMarkdownファイル（`.md`）を読み込み、各ノートの **フロントマター（YAML Frontmatter）** および **`## 見出し` 直下のテキスト** を行（Row）として展開します。  
**プロジェクト管理、議事録、人物名鑑、旅行計画など、ノートごとに長文本文が存在する場合に最適です。**

#### 1. データファイル例（`10_Projects/Project_A.md`）
```markdown
---
title: 新規プロダクト開発
status: 進行中
priority: 高
completed: false
tags:
  - product
  - ai
assignee: 碇
---

# 新規プロダクト開発

プロダクトの概要説明がここに入ります。

## 📍 現在地
プロトタイプの社内検証が完了し、本番環境へのデプロイを準備中。

## 🎯 目標
- [x] 要件定義
- [x] UIモックアップ
- [ ] 本番リリース
```

#### 2. 定義ファイル例（`10_Projects/projects.base`）
```yaml
target: 10_Projects
columns:
  - file
  - title
  - status
  - priority
  - completed
  - tags
  - assignee
  - "## 📍 現在地"

# 編集可能列の制限（status, completed, tags のみ表上で直接編集可能）
editable:
  - status
  - completed
  - tags

sort: file
order: asc
```

---

## 3. ⚙️ `.base` 設定ファイルのリファレンス

| プロパティ名 | 型 | 必須 | 説明 | 記述例 |
| :--- | :---: | :---: | :--- | :--- |
| `target` | string | ◯ | 対象のYAMLファイルパス、または対象フォルダパス | `data/tasks.yaml`<br>`10_Projects` |
| `property` | string | - | YAMLモード時、展開する配列のプロパティ名（ドット繋ぎ対応）。省略時は配列を自動検出 | `tasks`<br>`project.items` |
| `columns` | array | - | 表示する列のリスト。省略時は全プロパティを自動検出 | `[id, name, status, tags]` |
| `editable` | array / bool / string | - | **表上で直接編集を許可する列の縛り設定**（下記詳細参照） | `[status, priority]`<br>`all` / `none` |
| `sort` | string | - | 初期のソート対象列IDまたはラベル名 | `id`, `file`, `status` |
| `order` | string | - | ソート順（昇順: `asc`、降順: `desc`。デフォルト: `asc`） | `asc` または `desc` |
| `title` | string | - | ビューア上部に表示するカスタムタイトル（省略時はファイル名） | `タスク進行ボード` |

### 🔒 `editable`（編集可能列の縛り）の書き方

- **特定列のみ編集許可（推奨）**:
  ```yaml
  editable:
    - status
    - priority
    - done
  # またはインライン配列
  editable: [status, priority, done]
  ```
  指定された列のみセルをクリックして直接編集できるようになり、指定されていない列は **読み取り専用（ロック）** となります。
- **全列編集可能（未指定時のデフォルト動作）**:
  ```yaml
  editable: all   # または editable: true
  ```
- **全列読み取り専用（閲覧ロック）**:
  ```yaml
  editable: none  # または editable: false, editable: []
  ```
- ※ `file`（ファイルリンク）および `heading`（見出し本文プレビュー）列は、プロパティではないため常に読み取り専用です。

---

## 4. 🎨 フィールド命名と自動UI演出ルール

Bases は、プロパティのキー名や値の型に応じて、自動的に洗練されたUI演出を行います：

| データ型・プロパティ名 | 推奨キー名・値の例 | テーブル表示時の演出 | インライン編集時の挙動 |
| :--- | :--- | :--- | :--- |
| **ステータス** | キー名: `status`, `state`<br>値: `未着手`, `進行中`, `完了`, `保留`, `中止`, `Done`, `WIP` | ステータスに応じた色付きバッジ（緑・黄・灰） | タップで **よく使う候補バッジ一覧** からワンタップ選択 ＋ 自由入力 |
| **優先度** | キー名: `priority`<br>値: `低`, `中`, `高`, `緊急`, `High`, `Low` | 優先度に応じた色付きバッジ（赤・黄・灰） | タップで **優先度候補バッジ一覧** からワンタップ選択 ＋ 自由入力 |
| **真偽値 (Boolean)** | キー名: `done`, `completed`, `is_active`<br>値: `true` または `false` | `TRUE`（緑）/ `FALSE`（灰）バッジ | セルを **ワンタップするだけで即座に反転** ＆ 自動コミット |
| **タグ・配列** | キー名: `tags`, `skills`, `categories`<br>値: `[tag1, tag2]` | パープル系のハッシュ付きタグバッジ一覧 | タグの削除（×ボタン）や「＋タグ追加」インプット |
| **識別番号 (ID)** | キー名: `id`, `no`, `index`<br>値: `1`, `TASK-101` | スタイリッシュな等幅（Monospace）アクセント | インライン数値/テキスト入力 |
| **WikiLink** | 値: `[[ノート名]]` または `[[ノート名\|表示名]]` | 下線付きパープルリンク | タップで該当ノートへアプリ内即時遷移 |
| **見出し本文プレビュー** | 列名: `"## 見出し名"`（フォルダモード専用） | 本文直下の1〜2行プレビュー。<br>チェックリスト `[1/3]` があれば進捗バッジ化 | 読み取り専用 |

---

## 5. 🤖 AI（LLM）への指示プロンプト例

AIにBasesのデータや設定ファイルを作成させたい場合は、以下のプロンプトテンプレートをコピペして使用してください。

### プロンプト例①：YAMLタスクボードの作成依頼
```markdown
以下の要件で、webapp-obsidian の Bases 機能で表示できる「タスク管理用YAML」と、それを表示・編集する「.baseファイル」を作成してください。

【要件】
1. データファイル: `00_Inbox/project_tasks.yaml`
   - tasks 配列配下に、プロジェクト開発タスクを5件作成。
   - フィールド: id, name, status (未着手/進行中/完了), priority (低/中/高/緊急), done (true/false), tags (配列), memo
2. Bases定義ファイル: `00_Inbox/project_tasks.base`
   - target に上記YAMLファイルを指定
   - status, priority, done, memo のみ編集可能（editable）に縛る
   - 初期ソートは priority または id 昇順
```

### プロンプト例②：フォルダ内Markdownノート群と一覧Basesの作成依頼
```markdown
以下の要件で、webapp-obsidian の Bases 機能で俯瞰できる「プロジェクト一覧ノート群」と、一覧ビューア用の「.baseファイル」を作成してください。

【要件】
1. 保存先フォルダ: `10_Projects/`
2. 各ノート（例: `10_Projects/Project_A.md`, `Project_B.md`）:
   - Frontmatter に title, status, priority, completed, tags, assignee を定義
   - 本文に「## 📍 現在地」「## 🎯 目標（チェックリスト）」の見出しを含める
3. Bases定義ファイル: `10_Projects/all_projects.base`
   - target に `10_Projects` フォルダを指定
   - 列に file, title, status, priority, completed, tags, "## 📍 現在地" を指定
   - status, completed, tags のみ編集可能（editable）に設定
```
