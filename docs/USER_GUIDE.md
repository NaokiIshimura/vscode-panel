# File List Extension - ユーザーガイド

## 目次
1. [はじめに](#はじめに)
2. [基本操作](#基本操作)
3. [高度な機能](#高度な機能)
4. [カスタマイズ](#カスタマイズ)
5. [トラブルシューティング](#トラブルシューティング)

## はじめに

File List Extensionは、VSCode標準のExplorerと同等の操作性を提供する高機能なファイル管理拡張機能です。このガイドでは、基本的な使用方法から高度な機能まで詳しく説明します。

## 基本操作

### ビューの概要

拡張機能をアクティベートすると、4つの主要なビューが利用できます：

1. **エクスプローラー**: ワークスペース全体のファイルツリー
2. **フォルダツリー**: フォルダのみの階層表示
3. **ファイル一覧**: 選択フォルダ内のファイル詳細
4. **Git変更ファイル**: Git変更ファイルの一覧

### ファイル操作

#### 基本的なファイル操作
- **ファイルを開く**: ファイルをクリック
- **フォルダを展開/折りたたみ**: フォルダの矢印をクリック
- **新しいファイル作成**: `Ctrl+Alt+N` または右クリック → 「新しいファイル」
- **新しいフォルダ作成**: `Ctrl+Shift+N` または右クリック → 「新しいフォルダ」

#### クリップボード操作
- **コピー**: `Ctrl+C` または右クリック → 「コピー」
- **切り取り**: `Ctrl+X` または右クリック → 「切り取り」
- **貼り付け**: `Ctrl+V` または右クリック → 「貼り付け」

#### ファイル管理
- **名前変更**: `F2` または右クリック → 「名前の変更」
- **削除**: `Delete` または右クリック → 「削除」
- **更新**: `F5` または更新ボタン

## 高度な機能

### 複数選択とバッチ操作

#### 複数選択の方法
1. **個別選択**: `Ctrl+クリック` で複数のファイルを個別に選択
2. **範囲選択**: `Shift+クリック` で範囲内のファイルを選択
3. **全選択**: `Ctrl+A` でフォルダ内の全ファイルを選択

#### バッチ操作
複数のファイルを選択した状態で以下の操作が可能：
- 一括コピー/切り取り/削除
- 一括ドラッグ&ドロップ
- 一括コンテキストメニュー操作

### ドラッグ&ドロップ

#### 基本的なドラッグ&ドロップ
1. ファイル/フォルダをクリックしてドラッグ開始
2. 目標のフォルダまでドラッグ
3. ドロップして移動完了

#### 修飾キーを使った操作
- **通常のドラッグ**: ファイルを移動
- **Ctrl+ドラッグ**: ファイルをコピー
- **Alt+ドラッグ**: ショートカットを作成（Windows）

#### 視覚的フィードバック
- ドラッグ中にフォルダ上でホバーすると、ドロップ可能な場所がハイライト表示
- 無効な場所では禁止アイコンが表示

### 検索とフィルタリング

#### 基本検索
1. 検索ボックスをクリックまたは `Ctrl+F`
2. 検索クエリを入力
3. リアルタイムでファイルがフィルタリング

#### 高度な検索パターン
- **ワイルドカード**: `*.js`, `test*`, `*config*`
- **正規表現**: 設定で有効化可能
- **大文字小文字区別**: 設定で切り替え可能

#### 検索履歴
- 過去の検索クエリが自動保存
- 検索ボックスのドロップダウンから選択可能
- 履歴のクリアも可能

### ファイル詳細情報

#### 表示される情報
- **ファイルサイズ**: 適切な単位（B、KB、MB、GB）で表示
- **更新日時**: 相対時間または絶対時間
- **作成日時**: ファイル作成時刻
- **権限情報**: 読み取り専用、実行可能などの状態

#### ツールチップ
ファイルにホバーすると詳細情報がツールチップで表示：
- フルパス
- 詳細なファイル情報
- 権限状態
- Git状態（該当する場合）

## カスタマイズ

### 表示設定

#### ソート順序
```json
{
  "fileListExtension.explorer.sortOrder": "name-asc"
}
```
利用可能な値：
- `name-asc` / `name-desc`: 名前順
- `size-asc` / `size-desc`: サイズ順
- `modified-asc` / `modified-desc`: 更新日時順

#### 表示モード
```json
{
  "fileListExtension.explorer.displayMode": "tree"
}
```
- `tree`: ツリー表示
- `list`: リスト表示

#### 隠しファイル
```json
{
  "fileListExtension.explorer.showHiddenFiles": false
}
```

### パフォーマンス調整

#### 大きなディレクトリの処理
```json
{
  "fileListExtension.explorer.maxFilesPerFolder": 1000,
  "fileListExtension.explorer.cacheTimeout": 30000,
  "fileListExtension.explorer.debounceDelay": 300
}
```

#### キャッシュ設定
- `cacheTimeout`: キャッシュの有効期限（ミリ秒）
- `debounceDelay`: 検索・フィルタリングの遅延時間

### キーボードショートカット

#### カスタムキーバインド
```json
{
  "fileListExtension.keyboard.copy": "ctrl+c",
  "fileListExtension.keyboard.cut": "ctrl+x",
  "fileListExtension.keyboard.paste": "ctrl+v"
}
```

#### 競合解決
```json
{
  "fileListExtension.keyboard.integration.conflictResolution": "prefer-extension"
}
```
- `prefer-extension`: 拡張機能を優先
- `prefer-vscode`: VSCode標準を優先
- `disable`: 競合するショートカットを無効化

### ファイル作成設定

#### デフォルト設定
```json
{
  "fileListExtension.explorer.defaultFileExtension": ".txt",
  "fileListExtension.explorer.useTimestampInFileName": true
}
```

#### ファイル名テンプレート
新しいファイル作成時のデフォルト名前付け規則をカスタマイズ可能。

## トラブルシューティング

### パフォーマンス問題

#### 大量ファイルの処理
大きなディレクトリでパフォーマンスが低下する場合：

1. **ファイル数制限の調整**:
   ```json
   {
     "fileListExtension.explorer.maxFilesPerFolder": 500
   }
   ```

2. **キャッシュタイムアウトの増加**:
   ```json
   {
     "fileListExtension.explorer.cacheTimeout": 60000
   }
   ```

3. **デバウンス遅延の調整**:
   ```json
   {
     "fileListExtension.explorer.debounceDelay": 500
   }
   ```

### キーボードショートカット問題

#### 競合の解決
1. コマンドパレットから「File List Extension: キーボードショートカットの競合を解決」を実行
2. 競合解決方法を設定で調整
3. 必要に応じてカスタムキーバインドを設定

#### デバッグモード
```json
{
  "fileListExtension.keyboard.integration.debugMode": true
}
```
デバッグモードを有効にすると、キーボードショートカットの動作がコンソールに出力されます。

### ファイル操作問題

#### 権限エラー
- ファイル/フォルダの権限を確認
- VSCodeを管理者権限で実行（Windows）
- 読み取り専用属性を解除

#### ドラッグ&ドロップ問題
- ターゲットフォルダの書き込み権限を確認
- ファイルが他のアプリケーションで使用中でないか確認
- VSCodeの再起動を試行

### 検索問題

#### 検索結果が表示されない
1. 検索フィルターをクリア（Escapeキー）
2. 隠しファイル設定を確認
3. 検索パターンの構文を確認

#### 検索が遅い
1. 検索結果の最大数を制限:
   ```json
   {
     "fileListExtension.explorer.searchMaxResults": 50
   }
   ```
2. デバウンス遅延を増加
3. 不要なファイル監視を無効化

## 高度な使用例

### プロジェクト固有の設定

#### ワークスペース設定
`.vscode/settings.json` でプロジェクト固有の設定：

```json
{
  "fileListExtension.defaultRelativePath": "src",
  "fileListExtension.explorer.showHiddenFiles": true,
  "fileListExtension.explorer.sortOrder": "modified-desc",
  "fileListExtension.explorer.defaultFileExtension": ".ts"
}
```

#### チーム共有設定
チーム全体で同じ設定を使用する場合、ワークスペース設定ファイルをバージョン管理に含める。

### 開発ワークフロー統合

#### Git統合
- Git変更ファイルビューで変更されたファイルを素早く確認
- 差分表示機能で変更内容を確認
- ファイル操作とGit操作の連携

#### 検索活用
- `test*` でテストファイルを素早く検索
- `*.config.*` で設定ファイルを一括表示
- 正規表現で複雑なパターンマッチング

### 効率的なファイル管理

#### バッチ操作の活用
1. 複数のテストファイルを選択
2. 一括でテスト用フォルダに移動
3. 設定ファイルを一括でバックアップフォルダにコピー

#### ドラッグ&ドロップの活用
- ファイルの整理・分類
- プロジェクト構造の再編成
- 素早いファイル移動

## まとめ

File List Extensionは、VSCodeでのファイル管理を大幅に改善する強力なツールです。このガイドで紹介した機能を活用して、より効率的な開発環境を構築してください。

さらに詳しい情報や最新のアップデートについては、拡張機能のドキュメントやリリースノートをご確認ください。