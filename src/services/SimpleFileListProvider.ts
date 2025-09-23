import * as vscode from 'vscode';
import * as path from 'path';
import { EnhancedTreeDataProvider } from './EnhancedTreeDataProvider';
import { EnhancedFileItem } from '../models/EnhancedFileItem';
import { FileSystemCacheManager } from './FileSystemCacheManager';

/**
 * 簡素化されたフォルダツリープロバイダー
 * VSCode標準操作は含まず、基本的なフォルダ選択機能のみ提供
 */
export class SimpleFileListProvider extends EnhancedTreeDataProvider<EnhancedFileItem> {
    
    public getTreeItem(element: EnhancedFileItem): vscode.TreeItem {
        return element;
    }
    private rootPath: string | undefined;
    private cacheManager: FileSystemCacheManager;
    private fileWatcher: vscode.FileSystemWatcher | undefined;

    constructor(context: vscode.ExtensionContext) {
        super();
        this.cacheManager = new FileSystemCacheManager();
    }

    public setRootPath(path: string): void {
        this.rootPath = path;
        this.updateTitle();
        this.refresh();
    }

    public getRootPath(): string | undefined {
        return this.rootPath;
    }

    private updateTitle(): void {
        if (this.treeView && this.rootPath) {
            const folderName = path.basename(this.rootPath);
            this.treeView.title = `フォルダツリー - ${folderName}`;
        }
    }

    public async getChildren(element?: EnhancedFileItem): Promise<EnhancedFileItem[]> {
        if (!this.rootPath) {
            return [];
        }

        const targetPath = element ? element.filePath : this.rootPath;

        try {
            const items = await this.getDirectoriesInPath(targetPath);
            return items;
        } catch (error) {
            vscode.window.showErrorMessage(`ディレクトリの読み取りに失敗しました: ${error}`);
            return [];
        }
    }

    public getParent(element: EnhancedFileItem): EnhancedFileItem | undefined {
        if (!this.rootPath || !element) {
            return undefined;
        }

        const parentPath = path.dirname(element.filePath);
        
        if (parentPath === element.filePath || !parentPath.startsWith(this.rootPath)) {
            return undefined;
        }

        try {
            const parentItem = new EnhancedFileItem(
                path.basename(parentPath),
                vscode.TreeItemCollapsibleState.Collapsed,
                parentPath,
                true, // isDirectory
                0, // size
                new Date() // modified
            );
            // VSCode標準エクスプローラーのようにフォルダ名のみ表示
            parentItem.description = undefined;
            return parentItem;
        } catch (error) {
            return undefined;
        }
    }

    protected async loadAllItems(): Promise<EnhancedFileItem[]> {
        if (!this.rootPath) {
            return [];
        }

        const allItems: EnhancedFileItem[] = [];
        await this.collectAllDirectories(this.rootPath, allItems);
        return allItems;
    }

    private async getDirectoriesInPath(dirPath: string): Promise<EnhancedFileItem[]> {
        const cacheKey = `dirs:${dirPath}`;
        const cached = this.cacheManager.get<EnhancedFileItem[]>(cacheKey);
        if (cached) {
            return cached;
        }

        const items = await this.loadDirectoriesFromPath(dirPath);
        this.cacheManager.set(cacheKey, items);
        return items;
    }

    private async collectAllDirectories(dirPath: string, allItems: EnhancedFileItem[]): Promise<void> {
        try {
            const items = await this.getDirectoriesInPath(dirPath);
            allItems.push(...items);

            for (const item of items) {
                if (item.isDirectory) {
                    await this.collectAllDirectories(item.filePath, allItems);
                }
            }
        } catch (error) {
            // Skip directories that can't be read
        }
    }

    /**
     * 基本的なコマンド登録（更新のみ）
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        const commands = [
            vscode.commands.registerCommand('fileList.refresh', () => {
                this.refresh();
            })
        ];

        commands.forEach(command => context.subscriptions.push(command));
    }

    private async loadDirectoriesFromPath(dirPath: string): Promise<EnhancedFileItem[]> {
        const fs = await import('fs');
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const items: EnhancedFileItem[] = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(dirPath, entry.name);
                try {
                    const stats = await fs.promises.stat(fullPath);
                    const item = new EnhancedFileItem(
                        entry.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        fullPath,
                        true, // isDirectory
                        0, // size
                        stats.mtime
                    );
                    // VSCode標準エクスプローラーのようにフォルダ名のみ表示
                    item.description = undefined;
                    items.push(item);
                } catch (error) {
                    // Skip items that can't be accessed
                }
            }
        }

        return items.sort((a, b) => a.label.localeCompare(b.label));
    }

    public dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.cacheManager.dispose();
        super.dispose();
    }
}