# Agent Development Guide

このファイルは、AI開発エージェントがVSCode拡張機能の開発・リリースプロセスを適切に実行するためのガイドです。

## 🚀 プルリクエスト作成前のチェックリスト

### 必須手順（順番を守ること）

#### 1. ⚡ コンパイル確認
```bash
npm run compile
```
- TypeScriptエラーがないことを確認
- すべてのファイルが正常にコンパイルされることを確認

#### 2. 📦 VSIXパッケージ作成
```bash
npm run package
```
- **重要**: PR作成前に必ずVSIXパッケージを作成する
- パッケージサイズとファイル構成を確認
- エラーなく完了することを確認
- `releases/file-list-extension-*.vsix` が生成されることを確認

#### 3. 🔄 変更のコミット・プッシュ
```bash
git add .
git commit -m "descriptive commit message"
git push origin develop
```

#### 4. 📋 プルリクエスト作成
```bash
gh pr create --base master --head develop --title "..." --body "..."
```

### 📝 VSIX作成が重要な理由

1. **パッケージ整合性**: ローカルでの動作確認
2. **サイズ確認**: .vscodeignoreが正しく動作することを確認
3. **依存関係確認**: --no-dependencies フラグが正常に動作することを確認
4. **事前検証**: GitHub Actionsでエラーが発生する前に問題を検出

## 🛠️ 開発ワークフロー

### 新機能開発時
1. developブランチで開発
2. 機能実装完了後、上記チェックリスト実行
3. VSIXパッケージ作成が成功したらPR作成
4. マージ後はGitHub Actionsが自動実行

### バグ修正時
1. 問題を特定・修正
2. コンパイル確認
3. **必ずVSIXパッケージ作成で動作確認**
4. PR作成

### GitHub Actions修正時
1. ワークフローファイル修正
2. ローカルでVSIXパッケージ作成テスト
3. エラーがないことを確認してからPR作成
4. 特に重要：CHANGELOG生成、特殊文字処理の確認

## 🔍 トラブルシューティング

### VSIXパッケージ作成エラー
- `.vscodeignore` の内容を確認
- `releases/` ディレクトリが循環参照していないか確認
- `--no-dependencies` フラグが正しく動作しているか確認

### GitHub Actionsエラー
- ローカルでのVSIXパッケージ作成が成功することを先に確認
- Node.js バージョンの整合性を確認
- 特殊文字を含むコミットメッセージの処理を確認

## 📊 パフォーマンス指標

### パッケージサイズ目標
- 現在: ~462KB
- 目標: 500KB未満を維持
- 4.92MB→462KB（90%削減）を達成済み

### ビルド時間
- ローカルビルド: ~30秒以内
- GitHub Actions: ~2分以内

## 🎯 品質保証

### PR作成前の最終確認
- [ ] `npm run compile` が成功
- [ ] `npm run package` が成功
- [ ] VSIXファイルサイズが適切（~462KB）
- [ ] 新機能の動作確認（Extension Development Host）
- [ ] 既存機能に影響がないことを確認

### マージ後の確認
- [ ] GitHub Actionsが成功
- [ ] GitHub Releasesに新しいリリースが作成
- [ ] VSIXファイルがダウンロード可能
- [ ] リリースノートが正しく生成

## 🚨 注意事項

### 絶対にやってはいけないこと
- ❌ VSIXパッケージ作成をスキップしてPR作成
- ❌ コンパイルエラーがある状態でのコミット
- ❌ GitHub Actionsの修正を直接masterブランチで実行
- ❌ 循環参照を含む.vscodeignoreの設定

### 推奨事項
- ✅ 小さな変更でも必ずVSIXパッケージ作成で確認
- ✅ descriptive commit messagesを使用
- ✅ PR作成時は詳細な説明を記載
- ✅ GitHub Actionsログを必ず確認

## 🔄 継続的改善

### 定期的にチェックすること
- VSCEの最新バージョン確認
- Node.jsバージョンの更新検討
- 依存関係の脆弱性チェック
- パッケージサイズの最適化

このガイドに従うことで、安定した開発・リリースプロセスを維持できます。