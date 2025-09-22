# File List Extension

VSCode標準のExplorerと同等の操作性を持つ、高機能なファイル管理拡張機能です。

## 主な機能

### 🎯 VSCode標準互換の操作性
- **キーボードショートカット**: F2（リネーム）、Delete（削除）、Ctrl+C/X/V（コピー/切り取り/貼り付け）など
- **右クリックコンテキストメニュー**: 標準的なファイル操作メニュー
- **ドラッグ&ドロップ**: 直感的なファイル移動・コピー操作
- **複数選択**: Ctrl+クリック、Shift+クリック、Ctrl+A（全選択）対応

### 📁 高度なファイル管理
- **エクスプローラービュー**: ワークスペース全体のファイルツリー表示
- **フォルダツリーペイン**: フォルダのみを表示し、階層構造をナビゲート
- **ファイル一覧ペイン**: 選択したフォルダ内のファイルとサブフォルダを詳細表示
- **Git変更ファイル**: Git変更ファイルの専用ビュー

### 🔍 検索とフィルタリング
- **リアルタイム検索**: ファイル名の即座フィルタリング
- **ワイルドカード検索**: `*`、`?`を使用したパターンマッチング
- **検索履歴**: 過去の検索クエリの保存と再利用
- **大文字小文字区別**: 設定可能な検索オプション

### ⚙️ カスタマイズ可能な表示
- **ソート機能**: 名前、サイズ、更新日時での並び替え
- **表示モード**: リスト表示・ツリー表示の切り替え
- **隠しファイル**: 表示/非表示の切り替え
- **コンパクトモード**: 省スペース表示オプション

### 📊 詳細なファイル情報
- **ファイル詳細**: サイズ、更新日時、作成日時、権限情報
- **権限表示**: 読み取り専用、実行可能ファイルの視覚的インジケーター
- **ツールチップ**: ホバー時の詳細情報表示
- **アイコン表示**: ファイルタイプに応じたアイコン

### 🚀 パフォーマンス最適化
- **キャッシュシステム**: ファイルシステム操作の高速化
- **仮想スクロール**: 大量ファイルの効率的表示
- **遅延読み込み**: 必要に応じたフォルダ内容の読み込み
- **デバウンス処理**: 検索・フィルタリングの最適化

## 使用方法

### 基本操作
1. アクティビティバーの「File List」アイコンをクリック
2. 4つのビューが表示されます：
   - **エクスプローラー**: ワークスペース全体のファイルツリー
   - **フォルダツリー**: フォルダのみの階層表示
   - **ファイル一覧**: 選択フォルダ内のファイル詳細
   - **Git変更ファイル**: Git変更ファイルの一覧

### キーボードショートカット
| 操作 | Windows/Linux | Mac | 説明 |
|------|---------------|-----|------|
| コピー | `Ctrl+C` | `Cmd+C` | 選択したファイル/フォルダをコピー |
| 切り取り | `Ctrl+X` | `Cmd+X` | 選択したファイル/フォルダを切り取り |
| 貼り付け | `Ctrl+V` | `Cmd+V` | クリップボードから貼り付け |
| 削除 | `Delete` | `Delete` | 選択したファイル/フォルダを削除 |
| 名前変更 | `F2` | `F2` | 選択したアイテムの名前を変更 |
| 全選択 | `Ctrl+A` | `Cmd+A` | フォルダ内の全アイテムを選択 |
| 新しいファイル | `Ctrl+Alt+N` | `Cmd+Alt+N` | 新しいファイルを作成 |
| 新しいフォルダ | `Ctrl+Shift+N` | `Cmd+Shift+N` | 新しいフォルダを作成 |
| 検索 | `Ctrl+F` | `Cmd+F` | ファイル検索を開始 |
| 更新 | `F5` | `F5` | ビューを更新 |

### 複数選択操作
- **Ctrl+クリック** (Mac: Cmd+クリック): 個別選択の追加/削除
- **Shift+クリック**: 範囲選択
- **Ctrl+A** (Mac: Cmd+A): 全選択
- 選択したファイルに対して一括操作（コピー、削除など）が可能

### ドラッグ&ドロップ
- **通常のドラッグ&ドロップ**: ファイル/フォルダを移動
- **Ctrl+ドラッグ** (Mac: Cmd+ドラッグ): ファイル/フォルダをコピー
- ドラッグ中にフォルダ上でホバーすると、ドロップ可能な場所が視覚的に表示されます

### 検索機能
1. 検索アイコン（🔍）をクリックまたは `Ctrl+F` / `Cmd+F`
2. 検索ボックスに文字を入力してリアルタイムフィルタリング
3. ワイルドカード使用可能：
   - `*.js` - すべてのJavaScriptファイル
   - `test*` - "test"で始まるファイル
   - `*config*` - "config"を含むファイル

### 表示設定のカスタマイズ
- **ソート順序**: 名前、サイズ、更新日時で並び替え
- **表示モード**: リスト表示とツリー表示の切り替え
- **隠しファイル**: 表示/非表示の切り替え
- **コンパクトモード**: 省スペース表示

### 相対パスの設定

#### 方法1: 拡張機能から設定
1. フォルダツリーペインの編集アイコン（✏️）をクリック
2. 相対パスを入力（例: `src`, `.claude`, `docs/api`）
3. 設定に保存するか選択

#### 方法2: 設定画面から
1. フォルダツリーペインの歯車アイコン（⚙️）をクリック
2. `fileListExtension.defaultRelativePath` を編集

#### 方法3: settings.jsonに手動記入
`.vscode/settings.json` に以下を追加:
```json
{
  "fileListExtension.defaultRelativePath": ".claude"
}
```

### 相対パスの例
- `src` → プロジェクト/src
- `docs/api` → プロジェクト/docs/api  
- `.claude` → プロジェクト/.claude
- 空文字 → プロジェクトルート

## 設定オプション

### 表示設定
```json
{
  "fileListExtension.explorer.showHiddenFiles": false,
  "fileListExtension.explorer.sortOrder": "name-asc",
  "fileListExtension.explorer.displayMode": "tree",
  "fileListExtension.explorer.compactMode": false,
  "fileListExtension.explorer.showFileIcons": true,
  "fileListExtension.explorer.showFileSize": true,
  "fileListExtension.explorer.showModifiedDate": true
}
```

### 動作設定
```json
{
  "fileListExtension.explorer.confirmDelete": true,
  "fileListExtension.explorer.confirmMove": false,
  "fileListExtension.explorer.autoRevealActiveFile": true,
  "fileListExtension.explorer.defaultFileExtension": ".txt",
  "fileListExtension.explorer.useTimestampInFileName": true
}
```

### パフォーマンス設定
```json
{
  "fileListExtension.explorer.maxFilesPerFolder": 1000,
  "fileListExtension.explorer.cacheTimeout": 30000,
  "fileListExtension.explorer.debounceDelay": 300
}
```

### 検索設定
```json
{
  "fileListExtension.explorer.searchCaseSensitive": false,
  "fileListExtension.explorer.searchIncludeHidden": false,
  "fileListExtension.explorer.searchMaxResults": 100
}
```

### キーボードショートカット設定
```json
{
  "fileListExtension.keyboard.integration.enabled": true,
  "fileListExtension.keyboard.integration.conflictResolution": "prefer-extension",
  "fileListExtension.keyboard.integration.contextSensitive": true
}
```

## 開発・ビルド

```bash
# 依存関係のインストール
npm install

# TypeScriptのコンパイル
npm run compile

# 開発時の自動コンパイル
npm run watch

# テストの実行
npm test

# ユニットテストのみ実行
npm run test:unit

# VSIXパッケージの作成
npm run package
```

## デバッグ方法

### 準備
1. 依存関係をインストール: `npm install`
2. TypeScriptをコンパイル: `npm run compile`

### デバッグの開始

#### コマンドパレットから起動（推奨）
1. `Ctrl+Shift+P` (Windows/Linux) または `Cmd+Shift+P` (Mac) でコマンドパレットを開く
2. 「Debug: Start Debugging」と入力して選択
3. Enterキーを押して実行

#### その他の起動方法
- **F5キー**: デバッグを即座に開始
- **デバッグパネル**: サイドバーの実行とデバッグアイコン → 「Run Extension」を選択 → 緑の▶️ボタンをクリック
- **メニューバー**: 「実行」→「デバッグの開始」を選択

### デバッグ中の操作
- 新しいVSCodeウィンドウ（Extension Development Host）が開く
- アクティビティバーに「File List」アイコンが表示される
- ブレークポイントの設定、変数の検査、ステップ実行が可能
- `Ctrl+R` / `Cmd+R` で拡張機能をリロード

## インストール

### 方法1: 開発モード（テスト用）
1. このプロジェクトをクローンまたはダウンロード
2. VSCodeで開く
3. `F5`キーを押して拡張機能開発ホストを起動
4. 新しいVSCodeウィンドウで拡張機能をテスト

### 方法2: VSIXパッケージからインストール

#### 最新のリリースを使用する場合:
```bash
# releasesディレクトリから直接インストール
code --install-extension releases/file-list-extension-0.0.1.vsix
```

#### 自分でパッケージを作成する場合:
1. VSCEツールをインストール:
   ```bash
   npm install -g @vscode/vsce
   ```
2. VSIXパッケージを作成:
   ```bash
   npm run package
   ```
3. 生成されたVSIXファイルをインストール:
   ```bash
   code --install-extension releases/file-list-extension-0.0.1.vsix
   ```
3. VS Codeを再起動

## トラブルシューティング

### よくある問題

#### キーボードショートカットが動作しない
1. 他の拡張機能との競合を確認
2. `fileListExtension.keyboard.integration.conflictResolution` 設定を調整
3. コマンドパレットから「File List Extension: キーボードショートカットの競合を解決」を実行

#### ファイルが表示されない
1. ワークスペースが正しく開かれているか確認
2. 隠しファイル設定を確認（`fileListExtension.explorer.showHiddenFiles`）
3. 検索フィルターがアクティブでないか確認

#### パフォーマンスが遅い
1. `fileListExtension.explorer.maxFilesPerFolder` を調整
2. `fileListExtension.explorer.cacheTimeout` を増加
3. 不要なファイル監視を無効化

#### ドラッグ&ドロップが動作しない
1. ファイル権限を確認
2. 読み取り専用フォルダでないか確認
3. VSCodeを管理者権限で実行（Windows）

### デバッグモード
デバッグ情報を有効にするには：
```json
{
  "fileListExtension.keyboard.integration.debugMode": true
}
```

### サポート
問題が解決しない場合は、以下の情報と共にIssueを作成してください：
- VSCodeのバージョン
- 拡張機能のバージョン
- エラーメッセージ
- 再現手順

## 要件

- VSCode 1.74.0 以上
- Node.js 18.x 以上（開発時のみ）
- TypeScript 4.9.4 以上（開発時のみ）

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 貢献

プルリクエストやIssueの報告を歓迎します。開発に参加する場合は、以下の手順に従ってください：

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 更新履歴

詳細な変更履歴は [CHANGELOG.md](CHANGELOG.md) をご覧ください。
