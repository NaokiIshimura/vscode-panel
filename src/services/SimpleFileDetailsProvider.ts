import * as vscode from 'vscode';
import * as path from 'path';
import { EnhancedTreeDataProvider } from './EnhancedTreeDataProvider';
import { EnhancedFileItem } from '../models/EnhancedFileItem';
import { FileSystemCacheManager } from './FileSystemCacheManager';

/**
 * 簡素化されたファイル詳細プロバイダー
 * VSCode標準操作は含まず、基本的なファイル表示機能のみ提供
 */
export class SimpleFileDetailsProvider extends EnhancedTreeDataProvider<EnhancedFileItem> {
    
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

    public getCurrentPath(): string | undefined {
        return this.rootPath;
    }

    public goToParentFolder(): void {
        if (!this.rootPath) {
            return;
        }

        const parentPath = path.dirname(this.rootPath);
        if (parentPath !== this.rootPath) {
            this.setRootPath(parentPath);
        }
    }

    private updateTitle(): void {
        if (this.treeView && this.rootPath) {
            const folderName = path.basename(this.rootPath);
            this.treeView.title = `ファイル一覧 - ${folderName}`;
        }
    }

    public async getChildren(element?: EnhancedFileItem): Promise<EnhancedFileItem[]> {
        if (!this.rootPath) {
            return [];
        }

        if (!element) {
            // Root level: show files and directories
            try {
                const items = await this.getItemsInDirectory(this.rootPath);
                return items;
            } catch (error) {
                vscode.window.showErrorMessage(`ディレクトリの読み取りに失敗しました: ${error}`);
                return [];
            }
        }

        // Subdirectory expansion
        const targetPath = element.filePath;

        try {
            const items = await this.getItemsInDirectory(targetPath);
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
        await this.collectAllItems(this.rootPath, allItems);
        return allItems;
    }

    private async getItemsInDirectory(dirPath: string): Promise<EnhancedFileItem[]> {
        const cacheKey = `items:${dirPath}`;
        const cached = this.cacheManager.get<EnhancedFileItem[]>(cacheKey);
        if (cached) {
            return cached;
        }

        const items = await this.loadItemsFromPath(dirPath);
        this.cacheManager.set(cacheKey, items);
        return items;
    }

    private async collectAllItems(dirPath: string, allItems: EnhancedFileItem[]): Promise<void> {
        try {
            const items = await this.getItemsInDirectory(dirPath);
            allItems.push(...items);

            for (const item of items) {
                if (item.isDirectory) {
                    await this.collectAllItems(item.filePath, allItems);
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
            vscode.commands.registerCommand('fileDetails.refresh', () => {
                this.refresh();
            })
        ];

        commands.forEach(command => context.subscriptions.push(command));
    }

    private async loadItemsFromPath(dirPath: string): Promise<EnhancedFileItem[]> {
        const fs = await import('fs');
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const items: EnhancedFileItem[] = [];

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            try {
                const stats = await fs.promises.stat(fullPath);
                const collapsibleState = entry.isDirectory() 
                    ? vscode.TreeItemCollapsibleState.Collapsed 
                    : vscode.TreeItemCollapsibleState.None;
                
                const item = new EnhancedFileItem(
                    entry.name,
                    collapsibleState,
                    fullPath,
                    entry.isDirectory(),
                    entry.isFile() ? stats.size : 0,
                    stats.mtime
                );
                // VSCode標準エクスプローラーのようにファイル名のみ表示
                item.description = undefined;
                items.push(item);
            } catch (error) {
                // Skip items that can't be accessed
            }
        }

        // Sort: directories first, then files, both alphabetically
        return items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.label.localeCompare(b.label);
        });
    }

    public dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.cacheManager.dispose();
        super.dispose();
    }
}