import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('File List Extension が有効化されました');

    // 基本的なファイル詳細プロバイダー
    const fileDetailsProvider = new SimpleFileDetailsProvider();

    // ビューを登録
    const detailsView = vscode.window.createTreeView('fileListDetails', {
        treeDataProvider: fileDetailsProvider,
        showCollapseAll: true
    });

    // 基本コマンドを登録
    const selectFolderCommand = vscode.commands.registerCommand('fileList.selectFolder', async () => {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'フォルダを選択'
        });

        if (folderUri && folderUri.length > 0) {
            fileDetailsProvider.setRootPath(folderUri[0].fsPath);
        }
    });

    const refreshCommand = vscode.commands.registerCommand('fileList.refresh', () => {
        fileDetailsProvider.refresh();
    });

    context.subscriptions.push(selectFolderCommand, refreshCommand, detailsView);
}

// シンプルなファイル詳細プロバイダー
class SimpleFileDetailsProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private rootPath: string | undefined;

    setRootPath(path: string): void {
        this.rootPath = path;
        this.refresh();
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
                file.isDirectory
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
                files.push({
                    name: entry.name,
                    path: fullPath,
                    isDirectory: entry.isDirectory()
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

// ファイル情報の型定義
interface FileInfo {
    name: string;
    path: string;
    isDirectory: boolean;
}

// TreeItem実装
class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly filePath: string,
        public readonly isDirectory: boolean
    ) {
        super(label, collapsibleState);

        this.resourceUri = vscode.Uri.file(filePath);
        this.contextValue = isDirectory ? 'directory' : 'file';

        if (isDirectory) {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else {
            this.iconPath = new vscode.ThemeIcon('file');
        }

        this.tooltip = filePath;

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
