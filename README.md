# File List Extension

ワークスペース内のファイルとフォルダを効率的に閲覧できるVSCode拡張機能です。

## 機能

- **フォルダツリーペイン**: フォルダのみを表示し、階層構造をナビゲート
- **ファイル一覧ペイン**: 選択したフォルダ内のファイルとサブフォルダを表示
- **相対パス設定**: ワークスペースルートからの相対パスでデフォルトフォルダを指定
- **親フォルダへ移動**: ファイル一覧ペインから上位フォルダへ簡単移動

## 使用方法

### 基本操作
1. アクティビティバーの「File List」アイコンをクリック
2. フォルダツリーペインでフォルダを選択
3. ファイル一覧ペインでファイルとフォルダを確認

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

## 開発・ビルド

```bash
# 依存関係のインストール
npm install

# TypeScriptのコンパイル
npm run compile

# 開発時の自動コンパイル
npm run watch
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

## 要件

- VSCode 1.74.0 以上
- Node.js (開発時のみ)
