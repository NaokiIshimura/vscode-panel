import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EnhancedTreeDataProvider } from './EnhancedTreeDataProvider';
import { EnhancedFileItem } from '../models/EnhancedFileItem';
import { FileSystemCacheManager } from './FileSystemCacheManager';
import { ClipboardManager } from './ClipboardManager';
import { FileOperationService } from './FileOperationService';
import { KeyboardShortcutHandler } from './KeyboardShortcutHandler';
import { ContextMenuManager } from './ContextMenuManager';
import { PermissionDetector } from '../utils/PermissionDetector';
import { displayCustomizationService } from './DisplayCustomizationService';
import { IEnhancedFileItem, IExplorerManager } from '../interfaces/core';
import { MultiSelectionManager } from './MultiSelectionManager';

/**
 * Enhanced file list provider with full feature integration (directories only)
 */
export class EnhancedFileListProvider extends EnhancedTreeDataProvider<EnhancedFileItem> implements IExplorerManager {
    private rootPath: string | undefined;
    private cacheManager: FileSystemCacheManager;
    private clipboardManager: ClipboardManager;
    private fileOperationService: FileOperationService;
    private keyboardShortcutHandler: KeyboardShortcutHandler;
    private contextMenuManager: ContextMenuManager;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private debounceTimeout: NodeJS.Timeout | undefined;
    private displayDisposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        super();
        
        // Initialize services
        this.cacheManager = new FileSystemCacheManager();
        this.clipboardManager = new ClipboardManager(context);
        this.fileOperationService = new FileOperationService();
        this.selectionManager = new MultiSelectionManager();
        this.keyboardShortcutHandler = new KeyboardShortcutHandler(
            context,
            this.clipboardManager,
            this.fileOperationService,
            this.selectionManager
        );
        this.contextMenuManager = new ContextMenuManager(
            context,
            this.clipboardManager,
            this.fileOperationService,
            this.selectionManager
        );
        
        this.setupDisplayCustomization();
        this.setupServiceIntegration();
    }

    /**
     * Set root path for the file list
     */
    public setRootPath(path: string): void {
        this.rootPath = path;
        this.updateTitle();
        this.setupFileWatcher();
        this.cacheManager.clear(); // Clear cache when changing root
        this.updateAllItems();
        this.refresh();
    }

    /**
     * Setup display customization integration
     */
    private setupDisplayCustomization(): void {
        this.displayDisposables.push(
            displayCustomizationService.onDisplaySettingsChanged((settings) => {
                this.cacheManager.clear();
                
                if ('sortOrder' in settings) {
                    this.setSortOrder(settings.sortOrder!);
                }
                
                if ('showHiddenFiles' in settings) {
                    this.debouncedRefresh();
                }
            })
        );

        this.setSortOrder(displayCustomizationService.getSortOrder());
    }

    /**
     * Setup file system watcher
     */
    private setupFileWatcher(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }

        if (this.rootPath) {
            const watchPattern = new vscode.RelativePattern(this.rootPath, '**/*');
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

            this.fileWatcher.onDidChange(() => this.handleFileSystemChange());
            this.fileWatcher.onDidCreate(() => this.handleFileSystemChange());
            this.fileWatcher.onDidDelete(() => this.handleFileSystemChange());
        }
    }

    /**
     * Setup service integration
     */
    private setupServiceIntegration(): void {
        // Note: Keyboard shortcuts are registered globally by KeyboardShortcutIntegration
        this.contextMenuManager.registerContextMenus();
        
        this.displayDisposables.push(
            this.clipboardManager.onClipboardChanged(() => {
                this.refresh();
            })
        );
        
        this.displayDisposables.push(
            this.selectionManager.onSelectionChanged((selection) => {
                this.keyboardShortcutHandler.updateContext({
                    activeProvider: 'file-list',
                    selectedItems: selection,
                    currentPath: this.rootPath,
                    canPaste: this.clipboardManager.canPaste()
                });
            })
        );
    }

    /**
     * Handle file system changes with debouncing
     */
    private handleFileSystemChange(): void {
        this.cacheManager.clear();
        this.debouncedRefresh();
    }

    /**
     * Debounced refresh
     */
    private debouncedRefresh(): void {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        
        this.debounceTimeout = setTimeout(() => {
            this.updateAllItems();
            this.refresh();
        }, 300);
    }

    /**
     * Get current root path
     */
    public getRootPath(): string | undefined {
        return this.rootPath;
    }

    /**
     * Update tree view title
     */
    private updateTitle(): void {
        if (this.treeView && this.rootPath) {
            const folderName = path.basename(this.rootPath);
            this.treeView.title = `フォルダツリー - ${folderName}`;
        }
    }

    // ===== TreeDataProvider Implementation =====

    // ===== IExplorerManager Implementation =====

    public async copyToClipboard(items: IEnhancedFileItem[]): Promise<void> {
        await this.clipboardManager.copy(items);
    }

    public async cutToClipboard(items: IEnhancedFileItem[]): Promise<void> {
        await this.clipboardManager.cut(items);
    }

    public async pasteFromClipboard(targetPath: string): Promise<void> {
        if (!this.clipboardManager.canPaste()) {
            vscode.window.showWarningMessage('クリップボードにアイテムがありません');
            return;
        }

        try {
            await this.clipboardManager.paste(targetPath);
            this.handleFileSystemChange();
            vscode.window.showInformationMessage('貼り付けが完了しました');
        } catch (error) {
            vscode.window.showErrorMessage(`貼り付けに失敗しました: ${error}`);
        }
    }

    public async deleteItems(items: IEnhancedFileItem[]): Promise<void> {
        if (items.length === 0) return;

        const itemPaths = items.map(item => item.filePath);
        
        try {
            await this.fileOperationService.deleteFiles(itemPaths);
            this.handleFileSystemChange();
            
            const message = items.length === 1 
                ? `"${items[0].label}" を削除しました`
                : `${items.length} 個のフォルダを削除しました`;
            vscode.window.showInformationMessage(message);
        } catch (error) {
            vscode.window.showErrorMessage(`削除に失敗しました: ${error}`);
        }
    }

    public async renameItem(item: IEnhancedFileItem, newName: string): Promise<void> {
        const newPath = path.join(path.dirname(item.filePath), newName);
        
        try {
            await this.fileOperationService.renameFile(item.filePath, newPath);
            this.handleFileSystemChange();
            vscode.window.showInformationMessage(`"${item.label}" を "${newName}" にリネームしました`);
        } catch (error) {
            vscode.window.showErrorMessage(`リネームに失敗しました: ${error}`);
        }
    }

    public async createFile(parentPath: string, fileName: string): Promise<void> {
        const filePath = path.join(parentPath, fileName);
        
        try {
            await this.fileOperationService.createFile(filePath);
            this.handleFileSystemChange();
            vscode.window.showInformationMessage(`ファイル "${fileName}" を作成しました`);
        } catch (error) {
            vscode.window.showErrorMessage(`ファイル作成に失敗しました: ${error}`);
        }
    }

    public async createFolder(parentPath: string, folderName: string): Promise<void> {
        const folderPath = path.join(parentPath, folderName);
        
        try {
            await this.fileOperationService.createDirectory(folderPath);
            this.handleFileSystemChange();
            vscode.window.showInformationMessage(`フォルダ "${folderName}" を作成しました`);
        } catch (error) {
            vscode.window.showErrorMessage(`フォルダ作成に失敗しました: ${error}`);
        }
    }

    public selectAll(): void {
        this.selectionManager.selectAll();
    }

    // ===== TreeDataProvider Implementation =====

    public getTreeItem(element: EnhancedFileItem): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            element.label,
            element.isDirectory ? 
                vscode.TreeItemCollapsibleState.Collapsed : 
                vscode.TreeItemCollapsibleState.None
        );

        treeItem.resourceUri = vscode.Uri.file(element.filePath);
        treeItem.contextValue = this.getEnhancedContextValue(element);
        treeItem.iconPath = this.getEnhancedIconPath(element);
        
        // Enhanced tooltip with permission information
        treeItem.tooltip = this.createEnhancedTooltip(element);

        // Enhanced description with metadata
        treeItem.description = this.getEnhancedDescription(element);

        // Update with selection state
        return this.updateTreeItemWithSelection(treeItem, element);
    }

    public async getChildren(element?: EnhancedFileItem): Promise<EnhancedFileItem[]> {
        if (!this.rootPath) {
            return [];
        }

        const targetPath = element ? element.filePath : this.rootPath;

        try {
            const items = await this.getDirectoriesInPath(targetPath);
            const processedItems = this.processItems(items);
            
            // Update all items if this is root level
            if (!element) {
                await this.updateAllItems();
            }
            
            return processedItems;
        } catch (error) {
            vscode.window.showErrorMessage(`ディレクトリの読み取りに失敗しました: ${error}`);
            return [];
        }
    }

    // ===== Protected Methods Implementation =====

    protected async loadAllItems(): Promise<EnhancedFileItem[]> {
        if (!this.rootPath) {
            return [];
        }

        const allItems: EnhancedFileItem[] = [];
        await this.collectAllDirectories(this.rootPath, allItems);
        return allItems;
    }

    // ===== Private Methods =====

    /**
     * Get directories in a specific path with caching
     */
    private async getDirectoriesInPath(dirPath: string): Promise<EnhancedFileItem[]> {
        // Check cache first
        const cacheKey = `dirs:${dirPath}`;
        const cachedDirs = this.cacheManager.get<EnhancedFileItem[]>(cacheKey);
        
        if (cachedDirs) {
            return cachedDirs;
        }

        const directories: EnhancedFileItem[] = [];

        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

            // Process directories in batches for better performance
            const batchSize = 30;
            for (let i = 0; i < entries.length; i += batchSize) {
                const batch = entries.slice(i, i + batchSize);
                
                const batchPromises = batch.map(async (entry) => {
                    // Only include directories
                    if (!entry.isDirectory()) {
                        return null;
                    }

                    const fullPath = path.join(dirPath, entry.name);
                    
                    try {
                        // Check individual directory cache
                        const itemCacheKey = `dir-item:${fullPath}`;
                        const cachedItem = this.cacheManager.get<EnhancedFileItem>(itemCacheKey);
                        
                        if (cachedItem) {
                            return cachedItem;
                        }

                        const stat = await fs.promises.stat(fullPath);
                        
                        // Detect permissions using enhanced detector
                        const permissions = await PermissionDetector.detectPermissions(fullPath);

                        const item = new EnhancedFileItem(
                            entry.name,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            fullPath,
                            true, // Always directory
                            0, // Directories have 0 size
                            stat.mtime,
                            stat.birthtime,
                            permissions
                        );

                        // Cache individual directory item
                        this.cacheManager.set(itemCacheKey, item, 20000); // 20 seconds
                        
                        return item;
                    } catch (statError) {
                        // Skip directories that can't be accessed
                        console.warn(`Failed to stat directory ${fullPath}:`, statError);
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                directories.push(...batchResults.filter(item => item !== null) as EnhancedFileItem[]);
            }

            // Filter based on display settings
            const filteredDirectories = directories.filter(dir => 
                displayCustomizationService.shouldShowFile(dir)
            );

            // Cache the directory listing
            this.cacheManager.set(cacheKey, filteredDirectories, 15000); // 15 seconds
            
            return filteredDirectories;
        } catch (error) {
            throw new Error(`ディレクトリの読み取りに失敗しました: ${error}`);
        }
    }

    /**
     * Get enhanced context value with permission information
     */
    private getEnhancedContextValue(element: EnhancedFileItem): string {
        const base = 'directory';
        const modifiers: string[] = [];
        
        if (element.permissions?.readonly) {
            modifiers.push('readonly');
        }
        
        if (element.permissions?.hidden) {
            modifiers.push('hidden');
        }
        
        return modifiers.length > 0 ? `${base}:${modifiers.join(':')}` : base;
    }

    /**
     * Get enhanced icon path with permission indicators
     */
    private getEnhancedIconPath(element: EnhancedFileItem): vscode.ThemeIcon {
        if (element.permissions?.readonly) {
            return new vscode.ThemeIcon('folder-locked');
        }
        
        if (element.permissions?.hidden) {
            return new vscode.ThemeIcon('folder-outline');
        }
        
        return new vscode.ThemeIcon('folder');
    }

    /**
     * Create enhanced tooltip
     */
    private createEnhancedTooltip(element: EnhancedFileItem): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${element.label}**\n\n`);
        tooltip.appendMarkdown(`種類: ディレクトリ\n`);
        tooltip.appendMarkdown(`パス: \`${element.filePath}\`\n`);
        tooltip.appendMarkdown(`更新日時: ${element.modified.toLocaleString('ja-JP')}\n`);
        
        if (element.permissions) {
            const permissionSummary = PermissionDetector.getPermissionSummary(element.permissions);
            if (permissionSummary) {
                tooltip.appendMarkdown(`権限: ${permissionSummary}\n`);
            }
        }
        
        return tooltip;
    }

    /**
     * Get enhanced description
     */
    private getEnhancedDescription(element: EnhancedFileItem): string {
        const parts: string[] = [];
        
        // Add modified date if enabled
        if (displayCustomizationService.getShowModifiedDate()) {
            const relativeTime = this.getRelativeTime(element.modified);
            parts.push(relativeTime);
        }
        
        // Add permission indicators
        if (element.permissions) {
            const permissionSummary = PermissionDetector.getPermissionSummary(element.permissions);
            if (permissionSummary) {
                parts.push(`[${permissionSummary}]`);
            }
        }
        
        return parts.join(' ');
    }

    /**
     * Get relative time string
     */
    private getRelativeTime(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return '今日';
        } else if (diffDays === 1) {
            return '昨日';
        } else if (diffDays < 7) {
            return `${diffDays}日前`;
        } else {
            return date.toLocaleDateString('ja-JP');
        }
    }

    /**
     * Recursively collect all directories
     */
    private async collectAllDirectories(dirPath: string, directories: EnhancedFileItem[]): Promise<void> {
        try {
            const dirItems = await this.getDirectoriesInPath(dirPath);
            directories.push(...dirItems);

            // Recursively collect directories from subdirectories
            for (const item of dirItems) {
                await this.collectAllDirectories(item.filePath, directories);
            }
        } catch (error) {
            // Skip directories that can't be accessed
            console.warn(`Failed to collect directories from ${dirPath}:`, error);
        }
    }

    // ===== Public API Methods =====

    /**
     * Refresh the tree
     */
    public refreshTree(): void {
        this.updateAllItems();
        this.refresh();
    }

    /**
     * Navigate to parent directory
     */
    public navigateToParent(): void {
        if (!this.rootPath) {
            return;
        }

        const parentPath = path.dirname(this.rootPath);
        
        // Don't go above root directory
        if (parentPath === this.rootPath) {
            vscode.window.showInformationMessage('これ以上上のフォルダはありません');
            return;
        }

        this.setRootPath(parentPath);
    }

    /**
     * Navigate to a specific directory
     */
    public navigateToDirectory(targetPath: string): void {
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
            this.setRootPath(targetPath);
        } else {
            vscode.window.showErrorMessage(`ディレクトリが見つかりません: ${targetPath}`);
        }
    }

    /**
     * Get selected directories
     */
    public getSelectedDirectories(): EnhancedFileItem[] {
        return this.getSelectedItems().filter(item => item.isDirectory);
    }

    /**
     * Check if a directory has subdirectories
     */
    public async hasSubdirectories(dirPath: string): Promise<boolean> {
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            return entries.some(entry => entry.isDirectory());
        } catch (error) {
            return false;
        }
    }

    /**
     * Get directory count in current path
     */
    public async getDirectoryCount(dirPath?: string): Promise<number> {
        const targetPath = dirPath || this.rootPath;
        if (!targetPath) {
            return 0;
        }

        try {
            const directories = await this.getDirectoriesInPath(targetPath);
            return directories.length;
        } catch (error) {
            return 0;
        }
    }

    // ===== Performance Optimization Methods =====

    /**
     * Preload directory contents
     */
    public async preloadDirectory(dirPath: string): Promise<void> {
        try {
            await this.getDirectoriesInPath(dirPath);
        } catch (error) {
            console.warn(`Failed to preload directory ${dirPath}:`, error);
        }
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): { size: number; hitRate: number } {
        return this.cacheManager.getStats();
    }

    /**
     * Clear cache manually
     */
    public clearCache(): void {
        this.cacheManager.clear();
        vscode.window.showInformationMessage('フォルダリストのキャッシュをクリアしました');
    }

    // ===== Service Integration Methods =====

    /**
     * Get provider context
     */
    public getProviderContext(): any {
        return {
            type: 'file-list',
            rootPath: this.rootPath,
            selectedItems: this.getSelectedItems(),
            canPaste: this.clipboardManager.canPaste(),
            cacheStats: this.getCacheStats()
        };
    }

    /**
     * Get service instances
     */
    public getClipboardManager(): ClipboardManager {
        return this.clipboardManager;
    }

    public getFileOperationService(): FileOperationService {
        return this.fileOperationService;
    }

    public getKeyboardShortcutHandler(): KeyboardShortcutHandler {
        return this.keyboardShortcutHandler;
    }

    public getContextMenuManager(): ContextMenuManager {
        return this.contextMenuManager;
    }

    /**
     * Register additional commands
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        const commands = [
            vscode.commands.registerCommand('fileList.refresh', () => {
                this.clearCache();
                this.refreshTree();
            }),
            vscode.commands.registerCommand('fileList.clearCache', () => {
                this.clearCache();
            }),
            vscode.commands.registerCommand('fileList.goToParent', () => {
                this.navigateToParent();
            }),
            vscode.commands.registerCommand('fileList.preloadAll', async () => {
                if (this.rootPath) {
                    await this.preloadDirectory(this.rootPath);
                    vscode.window.showInformationMessage('フォルダの事前読み込みが完了しました');
                }
            })
        ];

        commands.forEach(command => context.subscriptions.push(command));
    }

    /**
     * Handle external changes
     */
    public handleExternalChange(changeType: 'file-created' | 'file-deleted' | 'file-modified', filePath: string): void {
        const dirPath = path.dirname(filePath);
        this.cacheManager.invalidate(`dirs:${dirPath}`);
        this.cacheManager.invalidate(`dir-item:${filePath}`);
        this.debouncedRefresh();
    }

    /**
     * Batch update operations
     */
    public async batchUpdate(operations: Array<{ type: 'create' | 'delete' | 'rename'; path: string; newPath?: string }>): Promise<void> {
        const affectedDirs = new Set<string>();
        
        for (const operation of operations) {
            affectedDirs.add(path.dirname(operation.path));
            if (operation.newPath) {
                affectedDirs.add(path.dirname(operation.newPath));
            }
        }
        
        for (const dir of affectedDirs) {
            this.cacheManager.invalidate(`dirs:${dir}`);
        }
        
        this.debouncedRefresh();
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.displayDisposables.forEach(d => d.dispose());
        this.displayDisposables = [];
        
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        
        this.cacheManager.dispose();
        this.clipboardManager.dispose();
        this.fileOperationService.dispose();
        this.keyboardShortcutHandler.dispose();
        this.contextMenuManager.dispose();
        
        super.dispose();
    }
}