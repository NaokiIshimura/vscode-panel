import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    console.log('File List Extension が有効化されました');

    // TreeDataProviderを作成
    const fileListProvider = new FileListProvider();
    const fileDetailsProvider = new FileDetailsProvider();
    const gitChangesProvider = new GitChangesProvider();

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
    const treeView = vscode.window.createTreeView('fileListExplorer', {
        treeDataProvider: fileListProvider,
        showCollapseAll: true
    });

    const detailsView = vscode.window.createTreeView('fileListDetails', {
        treeDataProvider: fileDetailsProvider,
        showCollapseAll: true
    });

    const gitChangesView = vscode.window.createTreeView('gitChanges', {
        treeDataProvider: gitChangesProvider,
        showCollapseAll: false
    });

    // FileDetailsProviderにdetailsViewの参照を渡す
    fileDetailsProvider.setTreeView(detailsView);



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

    // メモファイルを作成するコマンドを登録
    const createMemoCommand = vscode.commands.registerCommand('fileList.createMemo', async () => {
        const currentPath = fileDetailsProvider.getCurrentPath();
        if (!currentPath) {
            vscode.window.showErrorMessage('フォルダが選択されていません');
            return;
        }

        // 現在の日時を YYYYMMDDHHMM 形式で取得
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        
        const timestamp = `${year}${month}${day}${hour}${minute}`;
        const fileName = `${timestamp}_memo.md`;
        const filePath = path.join(currentPath, fileName);

        try {
            // ファイルが既に存在するかチェック
            if (fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`ファイル ${fileName} は既に存在します`);
                return;
            }

            // 空のメモファイルを作成
            const defaultContent = `# メモ (${timestamp})\n\n作成日時: ${now.toLocaleString('ja-JP')}\n\n---\n\n`;
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

    context.subscriptions.push(selectFolderCommand, refreshCommand, showInPanelCommand, openFolderCommand, goToParentCommand, setRelativePathCommand, openSettingsCommand, openGitFileCommand, showGitDiffCommand, refreshGitChangesCommand, createMemoCommand);

    // FileDetailsProviderのリソースクリーンアップを登録
    context.subscriptions.push({
        dispose: () => fileDetailsProvider.dispose()
    });
}

// 初期フォルダを選択する関数
async function selectInitialFolder(treeView: vscode.TreeView<FileItem>, rootPath: string): Promise<void> {
    try {
        // プロジェクトルートのFileItemを作成
        const rootItem = new FileItem(
            path.basename(rootPath),
            vscode.TreeItemCollapsibleState.Expanded,
            rootPath,
            true,
            0,
            new Date()
        );
        
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

    constructor() { }

    setRootPath(path: string): void {
        this.rootPath = path;
        this.refresh();
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

// GitのHEADバージョンのコンテンツプロバイダー
class GitHeadContentProvider implements vscode.TextDocumentContentProvider {
    constructor(private content: string) {}

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.content;
    }
}

export function deactivate() { }