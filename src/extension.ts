import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('File List Extension が有効化されました');

    // TreeDataProviderを作成
    const fileListProvider = new FileListProvider();
    const fileDetailsProvider = new FileDetailsProvider();

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

    context.subscriptions.push(selectFolderCommand, refreshCommand, showInPanelCommand, openFolderCommand, goToParentCommand, setRelativePathCommand, openSettingsCommand);
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

export function deactivate() { }