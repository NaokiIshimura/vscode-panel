# Changelog

All notable changes to the File List Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- VSCode標準Explorer互換の操作性
- 包括的なキーボードショートカットサポート
- 右クリックコンテキストメニュー機能
- ドラッグ&ドロップによるファイル操作
- 複数選択とバッチ操作機能
- 高度な検索とフィルタリング機能
- ファイル詳細情報の表示
- カスタマイズ可能な表示設定
- パフォーマンス最適化機能
- 包括的なエラーハンドリング

### Enhanced
- ワークスペースエクスプローラーの機能強化
- ファイルリストプロバイダーの改善
- ファイル詳細プロバイダーの拡張

## [0.0.1] - 2024-01-01

### Added
- 基本的なファイルリスト表示機能
- フォルダツリーナビゲーション
- 相対パス設定機能
- 基本的なファイル作成・削除機能
- Git変更ファイルの表示

### Features

#### 🎯 VSCode標準互換操作
- **キーボードショートカット完全対応**
  - `F2`: ファイル/フォルダの名前変更
  - `Delete`: ファイル/フォルダの削除
  - `Ctrl+C` / `Cmd+C`: コピー操作
  - `Ctrl+X` / `Cmd+X`: 切り取り操作
  - `Ctrl+V` / `Cmd+V`: 貼り付け操作
  - `Ctrl+A` / `Cmd+A`: 全選択
  - `Ctrl+F` / `Cmd+F`: ファイル検索
  - `F5`: ビュー更新
  - `Ctrl+Alt+N` / `Cmd+Alt+N`: 新しいファイル作成
  - `Ctrl+Shift+N` / `Cmd+Shift+N`: 新しいフォルダ作成

- **コンテキストメニュー機能**
  - コピー、切り取り、貼り付け
  - 削除、名前変更
  - 新しいファイル/フォルダ作成
  - エクスプローラーで表示
  - パスをコピー
  - ビューの更新

- **ドラッグ&ドロップ操作**
  - ファイル/フォルダの移動
  - `Ctrl`キー + ドラッグでコピー
  - 視覚的フィードバック表示
  - ドロップ可能領域のハイライト
  - 無効操作の防止

#### 📁 高度なファイル管理
- **複数選択機能**
  - `Ctrl+クリック`での個別選択
  - `Shift+クリック`での範囲選択
  - `Ctrl+A`での全選択
  - 選択状態の視覚的表示
  - バッチ操作対応

- **エクスプローラービュー**
  - ワークスペース全体のファイルツリー表示
  - 階層構造の展開/折りたたみ
  - ファイルタイプ別アイコン表示
  - 権限状態の表示

- **ファイル操作サービス**
  - 安全なファイル操作
  - 操作の進行状況表示
  - エラー時の自動復旧
  - 操作履歴の管理

#### 🔍 検索とフィルタリング
- **リアルタイム検索**
  - 入力と同時のファイルフィルタリング
  - 大文字小文字の区別設定
  - 隠しファイルの検索対象設定
  - 検索結果数の制限

- **高度な検索パターン**
  - ワイルドカード検索（`*`, `?`）
  - 正規表現サポート
  - ファイル拡張子フィルタリング
  - パス指定検索

- **検索履歴機能**
  - 過去の検索クエリ保存
  - 検索候補の自動表示
  - 履歴のクリア機能

#### ⚙️ 表示カスタマイズ
- **ソート機能**
  - 名前順（昇順/降順）
  - ファイルサイズ順（昇順/降順）
  - 更新日時順（昇順/降順）
  - ワンクリックでのソート切り替え

- **表示モード**
  - ツリー表示モード
  - リスト表示モード
  - コンパクト表示モード
  - アイコン表示の切り替え

- **表示オプション**
  - 隠しファイルの表示/非表示
  - ファイルサイズの表示/非表示
  - 更新日時の表示/非表示
  - 権限情報の表示/非表示

#### 📊 ファイル詳細情報
- **詳細情報表示**
  - ファイルサイズ（適切な単位で表示）
  - 作成日時・更新日時
  - ファイル権限情報
  - ファイルタイプ情報

- **ツールチップ表示**
  - ホバー時の詳細情報
  - フルパス表示
  - Git状態情報
  - 権限詳細

- **権限インジケーター**
  - 読み取り専用ファイルの表示
  - 実行可能ファイルの表示
  - 隠しファイルの表示
  - アクセス権限の視覚化

#### 🚀 パフォーマンス最適化
- **キャッシュシステム**
  - ファイルシステム情報のキャッシュ
  - 設定可能なキャッシュタイムアウト
  - 自動キャッシュ無効化
  - メモリ使用量の最適化

- **大量ファイル対応**
  - 仮想スクロール実装
  - 遅延読み込み機能
  - ファイル数制限設定
  - 進行状況表示

- **デバウンス処理**
  - 検索入力のデバウンス
  - ファイル監視のデバウンス
  - UI更新の最適化
  - CPU使用率の削減

#### 🛠️ 開発者機能
- **拡張ポイント**
  - カスタムTreeDataProvider作成
  - カスタムファイル操作の追加
  - カスタムコンテキストメニュー
  - カスタム検索プロバイダー

- **API提供**
  - ファイル操作API
  - クリップボード管理API
  - 複数選択管理API
  - イベントシステム

- **デバッグサポート**
  - 詳細ログ出力
  - パフォーマンス監視
  - エラー報告機能
  - デバッグモード

### Technical Improvements

#### アーキテクチャ
- モジュラー設計の採用
- 依存性注入パターンの実装
- インターフェース駆動開発
- 拡張可能なプラグインアーキテクチャ

#### テスト
- 包括的なユニットテスト
- 統合テストの実装
- E2Eテストの追加
- パフォーマンステスト

#### エラーハンドリング
- 包括的なエラーハンドリング
- ユーザーフレンドリーなエラーメッセージ
- 自動復旧機能
- エラー報告システム

### Configuration Options

#### 表示設定
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

#### 動作設定
```json
{
  "fileListExtension.explorer.confirmDelete": true,
  "fileListExtension.explorer.confirmMove": false,
  "fileListExtension.explorer.autoRevealActiveFile": true,
  "fileListExtension.explorer.defaultFileExtension": ".txt",
  "fileListExtension.explorer.useTimestampInFileName": true
}
```

#### パフォーマンス設定
```json
{
  "fileListExtension.explorer.maxFilesPerFolder": 1000,
  "fileListExtension.explorer.cacheTimeout": 30000,
  "fileListExtension.explorer.debounceDelay": 300
}
```

#### 検索設定
```json
{
  "fileListExtension.explorer.searchCaseSensitive": false,
  "fileListExtension.explorer.searchIncludeHidden": false,
  "fileListExtension.explorer.searchMaxResults": 100
}
```

#### キーボードショートカット設定
```json
{
  "fileListExtension.keyboard.integration.enabled": true,
  "fileListExtension.keyboard.integration.conflictResolution": "prefer-extension",
  "fileListExtension.keyboard.integration.contextSensitive": true,
  "fileListExtension.keyboard.integration.debugMode": false
}
```

### Breaking Changes
- なし（初回リリース）

### Deprecated
- なし（初回リリース）

### Removed
- なし（初回リリース）

### Fixed
- なし（初回リリース）

### Security
- パス検証によるディレクトリトラバーサル攻撃の防止
- ファイル権限の適切なチェック
- 安全なファイル名のサニタイゼーション

---

## 今後の予定

### v0.1.0 (予定)
- [ ] 追加のファイル操作機能
- [ ] カスタムテーマサポート
- [ ] プラグインシステムの拡張
- [ ] 国際化対応

### v0.2.0 (予定)
- [ ] クラウドストレージ統合
- [ ] 高度なGit統合
- [ ] ファイル比較機能
- [ ] バックアップ・復元機能

### v1.0.0 (予定)
- [ ] 安定版リリース
- [ ] 完全なドキュメント
- [ ] パフォーマンス最適化
- [ ] 長期サポート開始

---

## サポート

- **ドキュメント**: [README.md](README.md)
- **ユーザーガイド**: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- **開発者ガイド**: [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
- **Issue報告**: GitHub Issues
- **機能要望**: GitHub Discussions

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照してください。