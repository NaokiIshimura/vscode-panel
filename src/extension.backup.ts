import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { ContextMenuManager } from './services/ContextMenuManager';
import { ClipboardManager } from './services/ClipboardManager';
import { FileOperationService } from './services/FileOperationService';
import { MultiSelectionManager } from './services/MultiSelectionManager';
import { KeyboardShortcutHandler } from './services/KeyboardShortcutHandler';
import { KeyboardShortcutIntegration } from './services/KeyboardShortcutIntegration';
import { DragDropHandler } from './services/DragDropHandler';
import { SearchManager } from './services/SearchManager';
import { SearchUIManager } from './services/SearchUIManager';
import { DisplayCustomizationService } from './services/DisplayCustomizationService';
import { FileCreationService } from './services/FileCreationService';
import { EnhancedWorkspaceExplorerProvider } from './services/EnhancedWorkspaceExplorerProvider';
import { EnhancedFileListProvider } from './services/EnhancedFileListProvider';
import { EnhancedFileDetailsProvider } from './services/EnhancedFileDetailsProvider';
import { FileSystemCacheManager } from './services/FileSystemCacheManager';
import { LargeDirectoryOptimizer } from './services/LargeDirectoryOptimizer';
import { EnhancedFileItem } from './models/EnhancedFileItem';
import { ErrorHandler } from './services/ErrorHandler';
import { DebugLogger } from './services/DebugLogger';
import { AutoRetryService } from './services/AutoRetryService';
import { OperationHistoryManager } from './services/OperationHistoryManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('File List Extension が有効化されました');

    // Initialize core services first
    const logger = DebugLogger.getInstance();
    const errorHandler = ErrorHandler.getInstance();
    const cacheManager = new FileSystemCacheManager();
    const autoRetryService = AutoRetryService.getInstance();
    const operationHistoryManager = OperationHistoryManager.getInstance();

    // Enhanced services を作成
    const clipboardManager = new ClipboardManager(context);
    const fileOperationService = new FileOperationService();
    const multiSelectionManager = new MultiSelectionManager();
    const dragDropHandler = new DragDropHandler(fileOperationService);
    const searchManager = new SearchManager();
    const searchUIManager = new SearchUIManager();
    const displayCustomizationService = new DisplayCustomizationService();
    const fileCreationService = new FileCreationService();
    const largeDirectoryOptimizer = new LargeDirectoryOptimizer();

    // Enhanced TreeDataProviders を作成
    const workspaceExplorerProvider = new EnhancedWorkspaceExplorerProvider(context);
    const fileListProvider = new EnhancedFileListProvider(context);
    const fileDetailsProvider = new EnhancedFileDetailsProvider(context);
    const gitChangesProvider = new GitChangesProvider();

    // Keyboard shortcut services - 一時的にコメントアウト
    // const keyboardShortcutHandler = new KeyboardShortcutHandler(
    //     context,
    //     clipboardManager,
    //     fileOperationService,
    //     multiSelectionManager
    // );
    // const keyboardShortcutIntegration = new KeyboardShortcutIntegration(
    //     context,
    //     keyboardShortcutHandler,
    //     clipboardManager,
    //     fileOperationService,
    //     multiSelectionManager
    // );

    // Context menu manager
    const contextMenuManager = new ContextMenuManager(
        context,
        clipboardManager,
        fileOperationService,
        multiSelectionManager
    );

    // プロジェクトルートを設定
    const initializeWithWorkspaceRoot = async () => {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

        // 設定から相対パスを取得
        const config = vscode.workspace.getConfiguration('fileListExtension');
        const defaultRelativePath = config.get<string>('defaultRelativePath');

        let targetPath: string;

        if (defaultRelativePath && defaultRelativePath.trim()) {
            // 相対パスを絶対パスに変換
            const relativePath = defaultRelativePath.trim();
            targetPath = path.resolve(workspaceRoot, relativePath);

            // パスの存在確認
            try {
                const stat = fs.statSync(targetPath);
                if (!stat.isDirectory()) {
                    throw new Error('Not a directory');
                }
            } catch (error) {
                vscode.window.showWarningMessage(`設定された相対パスが無効です: ${relativePath}`);
                // フォールバックとしてワークスペースルートを使用
                targetPath = workspaceRoot;
            }
        } else {
            // ワークスペースルートを使用
            targetPath = workspaceRoot;
        }

        fileListProvider.setRootPath(targetPath);

        // ファイル一覧ペインにも同じパスを設定（パスが存在する場合のみ）
        try {
            const stat = fs.statSync(targetPath);
            if (stat.isDirectory()) {
                fileDetailsProvider.setRootPath(targetPath);
            }
        } catch (error) {
            // パスが存在しない場合はファイル一覧ペインは空のまま
        }
    };

    // ビューを登録
    const workspaceView = vscode.window.createTreeView('workspaceExplorer', {
        treeDataProvider: workspaceExplorerProvider,
        showCollapseAll: true,
        canSelectMany: true,
        dragAndDropController: dragDropHandler
    });

    // TreeViewをProviderに設定
    workspaceExplorerProvider.setTreeView(workspaceView);

    // Register commands for workspace explorer
    workspaceExplorerProvider.registerCommands(context);

    // アクティブエディタの変更を監視
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        workspaceExplorerProvider.updateTitle(editor);

        // ビューが表示されている場合のみ自動選択を実行
        // visible=trueはビューが表示されていることを意味する
        if (workspaceView.visible) {
            await workspaceExplorerProvider.revealActiveFile(editor);
        }
    });

    // ビューが表示されたときに現在のファイルを選択
    workspaceView.onDidChangeVisibility(async () => {
        if (workspaceView.visible && vscode.window.activeTextEditor) {
            await workspaceExplorerProvider.revealActiveFile(vscode.window.activeTextEditor);
        }
    });

    // 初期タイトルを設定
    workspaceExplorerProvider.updateTitle(vscode.window.activeTextEditor);

    // 初期ファイルの選択
    if (vscode.window.activeTextEditor) {
        setTimeout(async () => {
            await workspaceExplorerProvider.revealActiveFile(vscode.window.activeTextEditor);
        }, 500);
    }

    const treeView = vscode.window.createTreeView('fileListExplorer', {
        treeDataProvider: fileListProvider,
        showCollapseAll: true,
        canSelectMany: true,
        dragAndDropController: dragDropHandler
    });

    // TreeViewをProviderに設定
    fileListProvider.setTreeView(treeView);

    // Register commands for file list provider
    fileListProvider.registerCommands(context);

    const detailsView = vscode.window.createTreeView('fileListDetails', {
        treeDataProvider: fileDetailsProvider,
        showCollapseAll: true,
        canSelectMany: true,
        dragAndDropController: dragDropHandler
    });

    const gitChangesView = vscode.window.createTreeView('gitChanges', {
        treeDataProvider: gitChangesProvider,
        showCollapseAll: false
    });

    // FileDetailsProviderにdetailsViewの参照を渡す
    fileDetailsProvider.setTreeView(detailsView);

    // Register commands for file details provider
    fileDetailsProvider.registerCommands(context);



    // 初期化を実行
    initializeWithWorkspaceRoot();


    // 初期化後にルートフォルダを選択状態にする
    setTimeout(async () => {
        const currentRootPath = fileListProvider.getRootPath();
        if (currentRootPath) {
            await selectInitialFolder(treeView, currentRootPath);
        }
    }, 500);

    // フォルダ選択時に下ペインにファイル一覧を表示
    treeView.onDidChangeSelection(async (e) => {
        if (e.selection.length > 0) {
            const selectedItem = e.selection[0];
            if (selectedItem.isDirectory) {
                fileDetailsProvider.setRootPath(selectedItem.filePath);
            }
        }
    });

    // ビューを有効化
    vscode.commands.executeCommand('setContext', 'fileListView:enabled', true);

    // フォルダ選択コマンドを登録
    const selectFolderCommand = vscode.commands.registerCommand('fileList.selectFolder', async () => {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'フォルダを選択'
        });

        if (folderUri && folderUri.length > 0) {
            fileListProvider.setRootPath(folderUri[0].fsPath);
        }
    });

    // 更新コマンドを登録
    const refreshCommand = vscode.commands.registerCommand('fileList.refresh', () => {
        fileListProvider.refresh();
    });

    // 下ペイン表示コマンドを登録
    const showInPanelCommand = vscode.commands.registerCommand('fileList.showInPanel', async (item: FileItem) => {
        if (item && item.isDirectory) {
            fileDetailsProvider.setRootPath(item.filePath);
        }
    });

    // フォルダを開くコマンドを登録
    const openFolderCommand = vscode.commands.registerCommand('fileList.openFolder', async (folderPath: string) => {
        fileDetailsProvider.setRootPath(folderPath);
    });

    // 親フォルダへ移動するコマンドを登録
    const goToParentCommand = vscode.commands.registerCommand('fileList.goToParent', async () => {
        fileDetailsProvider.goToParentFolder();
    });

    // 相対パス設定コマンドを登録
    const setRelativePathCommand = vscode.commands.registerCommand('fileList.setRelativePath', async () => {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('ワークスペースが開かれていません');
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const currentPath = fileListProvider.getRootPath() || workspaceRoot;

        // 現在のパスから相対パスを計算
        const currentRelativePath = path.relative(workspaceRoot, currentPath);
        const displayPath = currentRelativePath === '' ? '.' : currentRelativePath;

        const inputPath = await vscode.window.showInputBox({
            prompt: `ワークスペースルート (${path.basename(workspaceRoot)}) からの相対パスを入力してください`,
            value: displayPath,
            placeHolder: 'src, docs/api, .claude, . (ルート)'
        });

        if (inputPath !== undefined) {
            const trimmedPath = inputPath.trim();
            let targetPath: string;

            if (trimmedPath === '' || trimmedPath === '.') {
                // 空文字または'.'の場合はワークスペースルート
                targetPath = workspaceRoot;
            } else {
                // 相対パスを絶対パスに変換
                targetPath = path.resolve(workspaceRoot, trimmedPath);
            }

            // パスの存在確認（エラーでも続行）
            let pathExists = false;
            let isDirectory = false;

            try {
                const stat = fs.statSync(targetPath);
                pathExists = true;
                isDirectory = stat.isDirectory();
            } catch (error) {
                // パスが存在しない場合でも続行
                pathExists = false;
            }

            if (pathExists && !isDirectory) {
                vscode.window.showErrorMessage(`指定されたパスはディレクトリではありません: ${targetPath}`);
                return;
            }

            if (!pathExists) {
                const continueChoice = await vscode.window.showWarningMessage(
                    `指定されたパスが見つかりません:\n相対パス: ${trimmedPath}\n絶対パス: ${targetPath}\n\n続行しますか？`,
                    'はい',
                    'いいえ'
                );

                if (continueChoice !== 'はい') {
                    return;
                }
            }

            // パスを設定（存在しなくても設定）
            fileListProvider.setRootPath(targetPath);

            // ファイル一覧ペインにも同じパスを設定（存在する場合のみ）
            if (pathExists) {
                fileDetailsProvider.setRootPath(targetPath);
            }

            // 設定に保存するかユーザーに確認
            const relativePathToSave = trimmedPath === '' || trimmedPath === '.' ? '' : trimmedPath;
            const saveChoice = await vscode.window.showInformationMessage(
                `相対パス "${relativePathToSave || '.'}" を設定に保存しますか？`,
                'はい',
                'いいえ'
            );

            if (saveChoice === 'はい') {
                const config = vscode.workspace.getConfiguration('fileListExtension');
                await config.update('defaultRelativePath', relativePathToSave, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage('設定に保存しました');
            }

            // 設定したフォルダを選択状態にする（存在する場合のみ）
            if (pathExists) {
                setTimeout(async () => {
                    await selectInitialFolder(treeView, targetPath);
                }, 300);
            }
        }
    });

    // 設定を開くコマンドを登録
    const openSettingsCommand = vscode.commands.registerCommand('fileList.openSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'fileListExtension');
    });

    // Gitファイルを開くコマンドを登録
    const openGitFileCommand = vscode.commands.registerCommand('fileList.openGitFile', async (item: GitFileItem) => {
        if (item && item.filePath) {
            const document = await vscode.workspace.openTextDocument(item.filePath);
            await vscode.window.showTextDocument(document);
        }
    });

    // Git差分を表示するコマンドを登録
    const showGitDiffCommand = vscode.commands.registerCommand('fileList.showGitDiff', async (item: GitFileItem) => {
        if (item && item.filePath) {
            await gitChangesProvider.showDiff(item);
        }
    });

    // Git変更を更新するコマンドを登録
    const refreshGitChangesCommand = vscode.commands.registerCommand('fileList.refreshGitChanges', () => {
        gitChangesProvider.refresh();
    });

    // ファイルを作成するコマンドを登録
    const createMemoCommand = vscode.commands.registerCommand('fileList.createMemo', async (item?: FileItem) => {
        // TreeViewで選択されたアイテムがある場合、その情報を使用
        let targetPath: string;

        if (item) {
            // 選択されたアイテムがディレクトリの場合はそのパス、ファイルの場合は親ディレクトリ
            if (item.isDirectory) {
                targetPath = item.filePath;
            } else {
                targetPath = path.dirname(item.filePath);
            }
        } else {
            // アイテムが渡されない場合は現在のパスを使用
            const currentPath = fileDetailsProvider.getCurrentPath();
            if (!currentPath) {
                vscode.window.showErrorMessage('フォルダが選択されていません');
                return;
            }
            targetPath = currentPath;
        }

        // 現在の日時を YYYYMMDDHHMM 形式で取得
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');

        const timestamp = `${year}${month}${day}${hour}${minute}${second}`;
        const fileName = `${timestamp}.md`;
        const filePath = path.join(targetPath, fileName);

        try {
            // ファイルが既に存在するかチェック
            if (fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`ファイル ${fileName} は既に存在します`);
                return;
            }

            // 空のメモファイルを作成
            const defaultContent = `作成日時: ${now.toLocaleString('ja-JP')}\n\n---\n\n\n`;
            fs.writeFileSync(filePath, defaultContent, 'utf8');

            // ファイル一覧を更新
            fileDetailsProvider.refresh();

            // 作成したファイルを開く
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);

            vscode.window.showInformationMessage(`メモファイル ${fileName} を作成しました`);
        } catch (error) {
            vscode.window.showErrorMessage(`メモファイルの作成に失敗しました: ${error}`);
        }
    });

    // フォルダを作成するコマンドを登録
    const createFolderCommand = vscode.commands.registerCommand('fileList.createFolder', async () => {
        const currentPath = fileDetailsProvider.getCurrentPath();
        if (!currentPath) {
            vscode.window.showErrorMessage('フォルダが選択されていません');
            return;
        }

        // 現在の日時を YYYYMMDDhhmmss 形式で取得
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');

        const folderName = `${year}${month}${day}${hour}${minute}${second}`;
        const folderPath = path.join(currentPath, folderName);

        try {
            // フォルダが既に存在するかチェック
            if (fs.existsSync(folderPath)) {
                vscode.window.showErrorMessage(`フォルダ ${folderName} は既に存在します`);
                return;
            }

            // フォルダを作成
            fs.mkdirSync(folderPath, { recursive: true });

            // ファイル一覧を更新
            fileDetailsProvider.refresh();

            vscode.window.showInformationMessage(`フォルダ ${folderName} を作成しました`);
        } catch (error) {
            vscode.window.showErrorMessage(`フォルダの作成に失敗しました: ${error}`);
        }
    });

    // リネームコマンドを登録
    const renameCommand = vscode.commands.registerCommand('fileList.rename', async (item: FileItem) => {
        if (!item) {
            vscode.window.showErrorMessage('項目が選択されていません');
            return;
        }

        const oldName = path.basename(item.filePath);
        const dirPath = path.dirname(item.filePath);

        // 新しい名前の入力を求める
        const newName = await vscode.window.showInputBox({
            prompt: '新しい名前を入力してください',
            value: oldName,
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return '名前を入力してください';
                }
                // 不正な文字をチェック
                if (value.match(/[<>:"|?*\/\\]/)) {
                    return '使用できない文字が含まれています: < > : " | ? * / \\';
                }
                // 同じ名前の場合
                if (value === oldName) {
                    return '同じ名前です';
                }
                return null;
            }
        });

        if (!newName) {
            return;
        }

        const newPath = path.join(dirPath, newName);

        try {
            // 既に存在するかチェック
            if (fs.existsSync(newPath)) {
                vscode.window.showErrorMessage(`${newName} は既に存在します`);
                return;
            }

            // リネーム実行
            fs.renameSync(item.filePath, newPath);

            // ビューを更新
            fileDetailsProvider.refresh();

            vscode.window.showInformationMessage(`${oldName} を ${newName} に変更しました`);
        } catch (error) {
            vscode.window.showErrorMessage(`名前の変更に失敗しました: ${error}`);
        }
    });

    // 削除コマンドを登録
    const deleteCommand = vscode.commands.registerCommand('fileList.delete', async (item: FileItem) => {
        if (!item) {
            vscode.window.showErrorMessage('項目が選択されていません');
            return;
        }

        const itemName = path.basename(item.filePath);
        const itemType = item.isDirectory ? 'フォルダ' : 'ファイル';

        // 確認ダイアログを表示
        const answer = await vscode.window.showWarningMessage(
            `${itemType} "${itemName}" を削除してもよろしいですか？\nこの操作は元に戻せません。`,
            'はい',
            'いいえ'
        );

        if (answer !== 'はい') {
            return;
        }

        try {
            // 削除実行
            if (item.isDirectory) {
                // フォルダの場合は再帰的に削除
                fs.rmSync(item.filePath, { recursive: true, force: true });
            } else {
                // ファイルの場合
                fs.unlinkSync(item.filePath);
            }

            // ビューを更新
            fileDetailsProvider.refresh();

            vscode.window.showInformationMessage(`${itemType} "${itemName}" を削除しました`);
        } catch (error) {
            vscode.window.showErrorMessage(`削除に失敗しました: ${error}`);
        }
    });


    // Register all enhanced services
    contextMenuManager.registerContextMenus();
    // keyboardShortcutIntegration.initialize();

    // Register search commands
    const searchCommand = vscode.commands.registerCommand('fileListExtension.search', async () => {
        const activeProvider = getActiveProvider();
        if (activeProvider) {
            await activeProvider.showSearchInput();
        }
    });

    const clearSearchCommand = vscode.commands.registerCommand('fileListExtension.clearSearch', () => {
        // 各プロバイダーで利用可能な検索クリアメソッドを呼び出し
        if (workspaceExplorerProvider && typeof workspaceExplorerProvider.clearSearch === 'function') {
            workspaceExplorerProvider.clearSearch();
        }
        if (fileListProvider && typeof fileListProvider.clearCache === 'function') {
            fileListProvider.clearCache();
        }
        if (fileDetailsProvider && typeof fileDetailsProvider.clearSearch === 'function') {
            fileDetailsProvider.clearSearch();
        }
    });

    const searchHistoryCommand = vscode.commands.registerCommand('fileListExtension.searchHistory', async () => {
        // Implementation for search history
        vscode.window.showInformationMessage('検索履歴機能は今後実装予定です');
    });

    // Register display customization commands
    const quickSettingsCommand = vscode.commands.registerCommand('fileListExtension.display.quickSettings', async () => {
        await displayCustomizationService.showQuickSettings();
    });

    const cycleSortOrderCommand = vscode.commands.registerCommand('fileListExtension.display.cycleSortOrder', async () => {
        await displayCustomizationService.cycleSortOrder();
    });

    const toggleViewModeCommand = vscode.commands.registerCommand('fileListExtension.display.toggleViewMode', async () => {
        await displayCustomizationService.toggleViewMode();
    });

    const toggleHiddenFilesCommand = vscode.commands.registerCommand('fileListExtension.display.toggleHiddenFiles', async () => {
        await displayCustomizationService.toggleHiddenFiles();
    });

    const toggleCompactModeCommand = vscode.commands.registerCommand('fileListExtension.display.toggleCompactMode', async () => {
        await displayCustomizationService.toggleCompactMode();
    });

    // Register select all command
    const selectAllCommand = vscode.commands.registerCommand('fileListExtension.selectAll', () => {
        const activeProvider = getActiveProvider();
        if (activeProvider) {
            activeProvider.selectAll();
        }
    });

    // Refresh command for context menu integration
    const refreshViewCommand = vscode.commands.registerCommand('fileListExtension.refresh', () => {
        workspaceExplorerProvider.refresh();
        fileListProvider.refresh();
        fileDetailsProvider.refresh();
        gitChangesProvider.refresh();
    });

    // Helper function to get active provider
    function getActiveProvider(): any {
        const activeView = vscode.window.activeTextEditor;
        // This is a simplified implementation - in practice, you'd determine
        // which view is currently focused
        return workspaceExplorerProvider;
    }

    // Register all commands with context
    context.subscriptions.push(
        selectFolderCommand,
        refreshCommand,
        showInPanelCommand,
        openFolderCommand,
        goToParentCommand,
        setRelativePathCommand,
        openSettingsCommand,
        openGitFileCommand,
        showGitDiffCommand,
        refreshGitChangesCommand,
        createMemoCommand,
        createFolderCommand,
        renameCommand,
        deleteCommand,
        refreshViewCommand,
        searchCommand,
        clearSearchCommand,
        searchHistoryCommand,
        quickSettingsCommand,
        cycleSortOrderCommand,
        toggleViewModeCommand,
        toggleHiddenFilesCommand,
        toggleCompactModeCommand,
        selectAllCommand
    );

    // Register tree views
    context.subscriptions.push(workspaceView, treeView, detailsView, gitChangesView);

    // FileDetailsProviderのリソースクリーンアップを登録
    context.subscriptions.push({
        dispose: () => {
            fileDetailsProvider.dispose();
            workspaceExplorerProvider.dispose();
            fileListProvider.dispose();
        }
    });

    // Enhanced services のリソースクリーンアップを登録
    context.subscriptions.push({
        dispose: () => {
            clipboardManager.dispose();
            contextMenuManager.dispose();
            // keyboardShortcutHandler.dispose();
            // keyboardShortcutIntegration.dispose();
            dragDropHandler.dispose();
            displayCustomizationService.dispose();
            cacheManager.dispose();
            logger.dispose();
            // Note: fileCreationService doesn't have dispose method
            // autoRetryService and operationHistoryManager are singletons with their own lifecycle
        }
    });
}

// 初期フォルダを選択する関数
async function selectInitialFolder(treeView: vscode.TreeView<EnhancedFileItem>, rootPath: string): Promise<void> {
    try {
        // プロジェクトルートのEnhancedFileItemを作成
        const rootItem = await EnhancedFileItem.fromPath(rootPath);

        // ルートフォルダを選択状態にする
        await treeView.reveal(rootItem, { select: true, focus: false, expand: true });
    } catch (error) {
        console.log('初期フォルダの選択に失敗しました:', error);
    }
}

// ファイル一覧を取得する関数
async function getFileList(dirPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const stat = fs.statSync(fullPath);

            files.push({
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                size: entry.isFile() ? stat.size : 0,
                modified: stat.mtime
            });
        }

        // ディレクトリを先に、その後ファイルを名前順でソート
        files.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

    } catch (error) {
        throw new Error(`ディレクトリの読み取りに失敗しました: ${error}`);
    }

    return files;
}





// ファイルサイズをフォーマットする関数
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ファイル情報の型定義
interface FileInfo {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modified: Date;
}

// TreeDataProvider実装（フォルダのみ表示）
class FileListProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private rootPath: string | undefined;
    private treeView: vscode.TreeView<FileItem> | undefined;

    constructor() { }

    setTreeView(treeView: vscode.TreeView<FileItem>): void {
        this.treeView = treeView;
    }

    setRootPath(path: string): void {
        this.rootPath = path;
        this.updateTitle();
        this.refresh();
    }

    private updateTitle(): void {
        if (this.treeView && this.rootPath) {
            const folderName = path.basename(this.rootPath);
            this.treeView.title = `フォルダツリー - ${folderName}`;
        }
    }

    getRootPath(): string | undefined {
        return this.rootPath;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FileItem): Thenable<FileItem[]> {
        if (!this.rootPath) {
            return Promise.resolve([]);
        }

        const targetPath = element ? element.resourceUri!.fsPath : this.rootPath;

        try {
            const files = this.getFilesInDirectory(targetPath);
            return Promise.resolve(files.map(file => new FileItem(
                file.name,
                file.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                file.path,
                file.isDirectory,
                file.size,
                file.modified
            )));
        } catch (error) {
            vscode.window.showErrorMessage(`ディレクトリの読み取りに失敗しました: ${error}`);
            return Promise.resolve([]);
        }
    }

    private getFilesInDirectory(dirPath: string): FileInfo[] {
        const files: FileInfo[] = [];

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                // フォルダツリーペインではディレクトリのみを表示
                if (entry.isDirectory()) {
                    const fullPath = path.join(dirPath, entry.name);
                    const stat = fs.statSync(fullPath);

                    files.push({
                        name: entry.name,
                        path: fullPath,
                        isDirectory: true,
                        size: 0,
                        modified: stat.mtime
                    });
                }
            }

            // ディレクトリを名前順でソート
            files.sort((a, b) => a.name.localeCompare(b.name));

        } catch (error) {
            throw new Error(`ディレクトリの読み取りに失敗しました: ${error}`);
        }

        return files;
    }


}

// ファイル詳細用TreeDataProvider実装（フォルダツリーと同じ機能）
class FileDetailsProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private rootPath: string | undefined;
    private projectRootPath: string | undefined;
    private treeView: vscode.TreeView<FileItem> | undefined;
    private fileWatcher: vscode.FileSystemWatcher | undefined;

    constructor() {
        // プロジェクトルートパスを取得
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.projectRootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
    }

    setTreeView(treeView: vscode.TreeView<FileItem>): void {
        this.treeView = treeView;
    }

    setFiles(dirPath: string, files: FileInfo[]): void {
        this.rootPath = dirPath;
        this.updateTitle();
        this.refresh();
    }

    setRootPath(path: string): void {
        this.rootPath = path;
        this.updateTitle();
        this.setupFileWatcher();
        this.refresh();
    }

    private updateTitle(): void {
        if (this.treeView && this.rootPath) {
            const folderName = path.basename(this.rootPath);
            this.treeView.title = `ファイル一覧 - ${folderName}`;
        }
    }

    goToParentFolder(): void {
        if (!this.rootPath) {
            return;
        }

        const parentPath = path.dirname(this.rootPath);

        // プロジェクトルートより上には移動しない
        if (this.projectRootPath && !parentPath.startsWith(this.projectRootPath)) {
            vscode.window.showInformationMessage('プロジェクトルートより上には移動できません');
            return;
        }

        // ルートディレクトリより上には移動しない
        if (parentPath === this.rootPath) {
            vscode.window.showInformationMessage('これ以上上のフォルダはありません');
            return;
        }

        this.setRootPath(parentPath);
    }

    getCurrentPath(): string | undefined {
        return this.rootPath;
    }

    private setupFileWatcher(): void {
        // 既存のウォッチャーを破棄
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }

        // 新しいウォッチャーを設定（現在のパス配下を監視）
        if (this.rootPath) {
            const watchPattern = new vscode.RelativePattern(this.rootPath, '**/*');
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

            // ファイル・フォルダの変更を監視して自動更新
            this.fileWatcher.onDidChange(() => {
                this.refresh();
            });

            this.fileWatcher.onDidCreate(() => {
                this.refresh();
            });

            this.fileWatcher.onDidDelete(() => {
                this.refresh();
            });
        }
    }

    dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private getRelativePath(fullPath: string): string {
        if (!this.projectRootPath) {
            return fullPath;
        }

        const relativePath = path.relative(this.projectRootPath, fullPath);
        return relativePath || '.'; // ルートの場合は '.' を返す
    }





    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FileItem): Thenable<FileItem[]> {
        if (!this.rootPath) {
            // フォルダが選択されるまで何も表示しない
            return Promise.resolve([]);
        }

        if (!element) {
            // ルートレベル: ファイル一覧を直接表示（ヘッダーなし）
            try {
                const files = this.getFilesInDirectory(this.rootPath);
                const fileItems = files.map(file => new FileItem(
                    file.name,
                    file.isDirectory ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
                    file.path,
                    file.isDirectory,
                    file.size,
                    file.modified
                ));
                return Promise.resolve(fileItems);
            } catch (error) {
                vscode.window.showErrorMessage(`ディレクトリの読み取りに失敗しました: ${error}`);
                return Promise.resolve([]);
            }
        }

        // 通常のフォルダ展開
        const targetPath = element.resourceUri!.fsPath;

        try {
            const files = this.getFilesInDirectory(targetPath);
            return Promise.resolve(files.map(file => new FileItem(
                file.name,
                file.isDirectory ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
                file.path,
                file.isDirectory,
                file.size,
                file.modified
            )));
        } catch (error) {
            vscode.window.showErrorMessage(`ディレクトリの読み取りに失敗しました: ${error}`);
            return Promise.resolve([]);
        }
    }

    private getFilesInDirectory(dirPath: string): FileInfo[] {
        const files: FileInfo[] = [];

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const stat = fs.statSync(fullPath);

                files.push({
                    name: entry.name,
                    path: fullPath,
                    isDirectory: entry.isDirectory(),
                    size: entry.isFile() ? stat.size : 0,
                    modified: stat.mtime
                });
            }

            // ディレクトリを先に、その後ファイルを名前順でソート
            files.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });

        } catch (error) {
            throw new Error(`ディレクトリの読み取りに失敗しました: ${error}`);
        }

        return files;
    }
}



// TreeItem実装
class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly filePath: string,
        public readonly isDirectory: boolean,
        public readonly size: number,
        public readonly modified: Date
    ) {
        super(label, collapsibleState);

        this.resourceUri = vscode.Uri.file(filePath);
        this.contextValue = isDirectory ? 'directory' : 'file';

        // アイコンを設定（ヘッダー項目の場合は設定しない）
        if (this.contextValue !== 'header') {
            if (isDirectory) {
                this.iconPath = new vscode.ThemeIcon('folder');
            } else {
                this.iconPath = new vscode.ThemeIcon('file');
            }
        }

        // ツールチップを設定
        const sizeText = isDirectory ? 'ディレクトリ' : formatFileSize(size);
        this.tooltip = `${label}\n種類: ${sizeText}\n更新日時: ${modified.toLocaleString('ja-JP')}`;

        // ファイルの場合はクリックで開く
        if (!isDirectory) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }
    }
}

// Git変更ファイル用TreeDataProvider実装
class GitChangesProvider implements vscode.TreeDataProvider<GitFileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<GitFileItem | undefined | null | void> = new vscode.EventEmitter<GitFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<GitFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {
        // ファイルシステムの変更を監視
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        watcher.onDidChange(() => this.refresh());
        watcher.onDidCreate(() => this.refresh());
        watcher.onDidDelete(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async showDiff(item: GitFileItem): Promise<void> {
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

        try {
            if (item.status === 'Untracked') {
                // 新規ファイルの場合は空ファイルとの差分を表示
                await this.showUntrackedFileDiff(item.relativePath, item.filePath);
                return;
            }

            if (item.status === 'Deleted') {
                // 削除されたファイルの場合はHEADバージョンと空ファイルの差分を表示
                await this.showDeletedFileDiff(workspaceRoot, item.relativePath);
                return;
            }

            // 通常の変更ファイルの差分を表示
            await this.showFileDiff(workspaceRoot, item.relativePath, item.filePath);

        } catch (error) {
            vscode.window.showErrorMessage(`差分の表示に失敗しました: ${error}`);
        }
    }

    private async showFileDiff(workspaceRoot: string, relativePath: string, filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // HEADバージョンの内容を取得
            exec(`git show HEAD:"${relativePath}"`, { cwd: workspaceRoot }, async (error, stdout, stderr) => {
                if (error) {
                    // HEADにファイルが存在しない場合（新規追加）は空ファイルとの差分を表示
                    await this.showUntrackedFileDiff(relativePath, filePath);
                    resolve();
                    return;
                }

                try {
                    // 一時的なHEADバージョンのURIを作成
                    const headUri = vscode.Uri.parse(`git-head:${relativePath}?${Date.now()}`);
                    const currentUri = vscode.Uri.file(filePath);

                    // カスタムテキストドキュメントプロバイダーを登録
                    const provider = new GitHeadContentProvider(stdout);
                    const registration = vscode.workspace.registerTextDocumentContentProvider('git-head', provider);

                    // 差分を表示
                    await vscode.commands.executeCommand('vscode.diff',
                        headUri,
                        currentUri,
                        `${path.basename(relativePath)} (HEAD ↔ Working Tree)`
                    );

                    // 一定時間後にプロバイダーを削除
                    setTimeout(() => registration.dispose(), 30000);

                    resolve();
                } catch (diffError) {
                    reject(diffError);
                }
            });
        });
    }

    private async showDeletedFileDiff(workspaceRoot: string, relativePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            exec(`git show HEAD:"${relativePath}"`, { cwd: workspaceRoot }, async (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }

                try {
                    // 削除されたファイルのHEADバージョンを表示
                    const headUri = vscode.Uri.parse(`git-head-deleted:${relativePath}?${Date.now()}`);
                    const emptyUri = vscode.Uri.parse(`git-empty:${relativePath}?${Date.now()}`);

                    const headProvider = new GitHeadContentProvider(stdout);
                    const emptyProvider = new GitHeadContentProvider('');

                    const headRegistration = vscode.workspace.registerTextDocumentContentProvider('git-head-deleted', headProvider);
                    const emptyRegistration = vscode.workspace.registerTextDocumentContentProvider('git-empty', emptyProvider);

                    await vscode.commands.executeCommand('vscode.diff',
                        headUri,
                        emptyUri,
                        `${path.basename(relativePath)} (HEAD ↔ Deleted)`
                    );

                    setTimeout(() => {
                        headRegistration.dispose();
                        emptyRegistration.dispose();
                    }, 30000);

                    resolve();
                } catch (diffError) {
                    reject(diffError);
                }
            });
        });
    }

    private async showUntrackedFileDiff(relativePath: string, filePath: string): Promise<void> {
        try {
            // 新規ファイルの場合は空ファイルと現在のファイルの差分を表示
            const emptyUri = vscode.Uri.parse(`git-empty-untracked:${relativePath}?${Date.now()}`);
            const currentUri = vscode.Uri.file(filePath);

            const emptyProvider = new GitHeadContentProvider('');
            const emptyRegistration = vscode.workspace.registerTextDocumentContentProvider('git-empty-untracked', emptyProvider);

            await vscode.commands.executeCommand('vscode.diff',
                emptyUri,
                currentUri,
                `${path.basename(relativePath)} (Empty ↔ Working Tree)`
            );

            setTimeout(() => {
                emptyRegistration.dispose();
            }, 30000);

        } catch (error) {
            // 差分表示に失敗した場合は通常のファイルを開く
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        }
    }

    getTreeItem(element: GitFileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: GitFileItem): Promise<GitFileItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        try {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const gitChanges = await this.getGitChanges(workspaceRoot);

            return gitChanges.map(change => new GitFileItem(
                path.basename(change.path),
                change.path,
                change.status,
                change.relativePath
            ));
        } catch (error) {
            console.log('Git変更の取得に失敗しました:', error);
            return [];
        }
    }

    private async getGitChanges(workspaceRoot: string): Promise<GitChange[]> {
        return new Promise((resolve, reject) => {

            // git statusコマンドでポーセリン形式で変更ファイルを取得
            exec('git status --porcelain=v1', { cwd: workspaceRoot }, (error: any, stdout: string, stderr: string) => {
                if (error) {
                    resolve([]); // Gitリポジトリでない場合は空配列を返す
                    return;
                }

                console.log('Git status output:', JSON.stringify(stdout));

                const changes: GitChange[] = [];
                const lines = stdout.trim().split('\n').filter(line => line.length > 0);

                for (const line of lines) {
                    console.log('Processing git status line:', JSON.stringify(line));

                    // git status --porcelain の形式: XY filename
                    // X: インデックスの状態, Y: ワーキングツリーの状態
                    const match = line.match(/^(..)(.*)$/);
                    if (match) {
                        const status = match[1];
                        let relativePath = match[2];

                        console.log('Regex match - Status:', JSON.stringify(status), 'Path part:', JSON.stringify(relativePath));

                        // 先頭のスペースを除去
                        relativePath = relativePath.replace(/^\s+/, '');

                        console.log('After space removal:', JSON.stringify(relativePath));

                        // 引用符で囲まれている場合は除去
                        if (relativePath.startsWith('"') && relativePath.endsWith('"')) {
                            relativePath = relativePath.slice(1, -1);
                            // エスケープされた文字を処理
                            relativePath = relativePath.replace(/\\(.)/g, '$1');
                            console.log('After quote removal:', JSON.stringify(relativePath));
                        }

                        // 改行文字やその他の制御文字を除去
                        relativePath = relativePath.trim();

                        if (relativePath) {
                            const fullPath = path.join(workspaceRoot, relativePath);

                            console.log('Final - Status:', JSON.stringify(status), 'RelativePath:', JSON.stringify(relativePath));
                            console.log('FullPath:', JSON.stringify(fullPath));
                            console.log('Basename:', JSON.stringify(path.basename(fullPath)));

                            changes.push({
                                path: fullPath,
                                relativePath: relativePath,
                                status: this.parseGitStatus(status)
                            });
                        }
                    }
                }

                resolve(changes);
            });
        });
    }

    private parseGitStatus(status: string): string {
        const indexStatus = status[0];
        const workingStatus = status[1];

        if (indexStatus === 'A') return 'Added';
        if (indexStatus === 'M') return 'Modified';
        if (indexStatus === 'D') return 'Deleted';
        if (indexStatus === 'R') return 'Renamed';
        if (indexStatus === 'C') return 'Copied';
        if (workingStatus === 'M') return 'Modified';
        if (workingStatus === 'D') return 'Deleted';
        if (status === '??') return 'Untracked';

        return 'Changed';
    }
}

// Git変更ファイル用TreeItem実装
class GitFileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly status: string,
        public readonly relativePath: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);

        this.resourceUri = vscode.Uri.file(filePath);
        this.contextValue = 'gitFile';

        // ステータスに応じたアイコンを設定
        this.iconPath = this.getStatusIcon(status);

        // 説明にステータスと相対パスを表示
        this.description = `${status} • ${relativePath}`;

        // ツールチップを設定
        this.tooltip = `${relativePath}\nStatus: ${status}`;

        // クリックで差分を表示
        this.command = {
            command: 'fileList.showGitDiff',
            title: 'Show Git Diff',
            arguments: [this]
        };
    }

    private getStatusIcon(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'Added':
                return new vscode.ThemeIcon('diff-added');
            case 'Modified':
                return new vscode.ThemeIcon('diff-modified');
            case 'Deleted':
                return new vscode.ThemeIcon('diff-removed');
            case 'Untracked':
                return new vscode.ThemeIcon('question');
            case 'Renamed':
                return new vscode.ThemeIcon('diff-renamed');
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}

// Git変更情報の型定義
interface GitChange {
    path: string;
    relativePath: string;
    status: string;
}

// ワークスペースエクスプローラープロバイダー
class WorkspaceExplorerProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private treeView: vscode.TreeView<FileItem> | undefined;
    private itemCache: Map<string, FileItem> = new Map();  // パスをキーとしたFileItemのキャッシュ

    constructor() { }

    setTreeView(treeView: vscode.TreeView<FileItem>): void {
        this.treeView = treeView;
    }

    updateTitle(editor: vscode.TextEditor | undefined): void {
        if (this.treeView) {
            if (editor) {
                const fileName = path.basename(editor.document.fileName);
                this.treeView.title = `エクスプローラー - ${fileName}`;
            } else {
                this.treeView.title = `エクスプローラー`;
            }
        }
    }

    async revealActiveFile(editor: vscode.TextEditor | undefined): Promise<void> {
        if (!this.treeView || !editor) {
            return;
        }

        const filePath = editor.document.fileName;

        // ワークスペース内のファイルかチェック
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

        // ファイルがワークスペース内にあることを確認
        if (!filePath.startsWith(workspaceRoot)) {
            return;
        }

        try {
            // ファイルに対応するFileItemを取得または作成
            const fileItem = await this.findOrCreateFileItem(filePath);

            if (fileItem) {
                try {
                    // ファイルを表示して選択（親フォルダも自動展開される）
                    // focus: falseでTreeViewにフォーカスを移さない
                    await this.treeView.reveal(fileItem, {
                        select: true,      // アイテムを選択状態にする
                        focus: false,      // TreeViewにフォーカスを移さない（エディタのフォーカスを保持）
                        expand: 1          // 最小限の展開のみ行う
                    });
                } catch (revealError) {
                    // reveal中のエラーは無視（フォーカスを奪わないための保護）
                    console.log('Reveal failed gracefully:', revealError);
                }
            }
        } catch (error) {
            console.log('ファイルの選択に失敗しました:', error);
        }
    }

    private async findOrCreateFileItem(filePath: string): Promise<FileItem | undefined> {
        // キャッシュから検索
        if (this.itemCache.has(filePath)) {
            return this.itemCache.get(filePath);
        }

        // パスの各階層を構築
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const relativePath = path.relative(workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);

        let currentPath = workspaceRoot;
        let parentItem: FileItem | undefined;

        // ルートから順番に各階層のアイテムを取得または作成
        for (let i = 0; i <= pathParts.length; i++) {
            if (i === 0) {
                // ルートアイテムを取得
                const children = await this.getChildren();
                if (children.length > 0) {
                    parentItem = children[0];
                    this.itemCache.set(currentPath, parentItem);
                }
            } else {
                const part = pathParts[i - 1];
                currentPath = path.join(currentPath, part);

                // 既にキャッシュにある場合はそれを使用
                if (this.itemCache.has(currentPath)) {
                    parentItem = this.itemCache.get(currentPath);
                } else if (parentItem) {
                    // 親要素の子要素を取得
                    const children = await this.getChildren(parentItem);
                    const childItem = children.find(child => child.filePath === currentPath);
                    if (childItem) {
                        this.itemCache.set(currentPath, childItem);
                        parentItem = childItem;
                    }
                }
            }
        }

        return this.itemCache.get(filePath);
    }

    refresh(): void {
        this.itemCache.clear();  // キャッシュをクリア
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    // 親要素を取得するメソッド（TreeViewのreveal機能に必要）
    getParent(element: FileItem): vscode.ProviderResult<FileItem> {
        const elementPath = element.filePath;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;

        if (!workspaceRoot || elementPath === workspaceRoot) {
            // ルート要素の場合は親なし
            return undefined;
        }

        const parentPath = path.dirname(elementPath);

        // 親がワークスペースルートの場合
        if (parentPath === workspaceRoot) {
            // ルートアイテムを返す（キャッシュから取得）
            return this.itemCache.get(workspaceRoot) || undefined;
        }

        // キャッシュから親要素を取得
        return this.itemCache.get(parentPath) || undefined;
    }

    getChildren(element?: FileItem): Thenable<FileItem[]> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return Promise.resolve([]);
        }

        // ルート要素の場合、ワークスペースフォルダのルートを返す
        if (!element) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const rootName = path.basename(workspaceRoot);
            const rootItem = new FileItem(
                rootName,
                vscode.TreeItemCollapsibleState.Expanded,
                workspaceRoot,
                true,
                0,
                new Date()
            );
            // ルートアイテムをキャッシュに保存
            this.itemCache.set(workspaceRoot, rootItem);
            return Promise.resolve([rootItem]);
        }

        // 選択された要素のサブアイテムを返す
        const targetPath = element.resourceUri!.fsPath;
        return this.getFileItems(targetPath);
    }

    private async getFileItems(dirPath: string): Promise<FileItem[]> {
        try {
            const files = await fs.promises.readdir(dirPath);
            const items: FileItem[] = [];

            for (const file of files) {
                const filePath = path.join(dirPath, file);
                try {
                    const stat = await fs.promises.stat(filePath);
                    const isDirectory = stat.isDirectory();
                    const collapsibleState = isDirectory
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None;

                    const item = new FileItem(
                        file,
                        collapsibleState,
                        filePath,
                        isDirectory,
                        stat.size || 0,
                        stat.mtime || new Date()
                    );
                    // アイテムをキャッシュに保存
                    this.itemCache.set(filePath, item);
                    items.push(item);
                } catch (error) {
                    console.error(`ファイル情報の取得に失敗: ${filePath}`, error);
                }
            }

            // ディレクトリを先に、その後ファイルをアルファベット順にソート
            return items.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                return a.label!.toString().localeCompare(b.label!.toString());
            });
        } catch (error) {
            console.error(`ディレクトリ読み取りエラー: ${dirPath}`, error);
            return [];
        }
    }
}

// GitのHEADバージョンのコンテンツプロバイダー
class GitHeadContentProvider implements vscode.TextDocumentContentProvider {
    constructor(private content: string) { }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.content;
    }
}

export function deactivate() { }