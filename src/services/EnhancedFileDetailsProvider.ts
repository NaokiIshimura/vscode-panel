import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EnhancedTreeDataProvider } from './EnhancedTreeDataProvider';
import { EnhancedFileItem } from '../models/EnhancedFileItem';
import { FileInfoFormatter } from '../utils/FileInfoFormatter';
import { PermissionDetector } from '../utils/PermissionDetector';
import { FileSystemCacheManager } from './FileSystemCacheManager';
import { ClipboardManager } from './ClipboardManager';
import { FileOperationService } from './FileOperationService';
import { KeyboardShortcutHandler } from './KeyboardShortcutHandler';
import { ContextMenuManager } from './ContextMenuManager';
import { displayCustomizationService } from './DisplayCustomizationService';
import { IEnhancedFileItem, IExplorerManager } from '../interfaces/core';
import { MultiSelectionManager } from './MultiSelectionManager';


/**
 * Enhanced file details provider with full feature integration (files and directories)
 */
export class EnhancedFileDetailsProvider extends EnhancedTreeDataProvider<EnhancedFileItem> implements IExplorerManager {
    private rootPath: string | undefined;
    private projectRootPath: string | undefined;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private cacheManager: FileSystemCacheManager;
    private clipboardManager: ClipboardManager;
    private fileOperationService: FileOperationService;
    private keyboardShortcutHandler: KeyboardShortcutHandler;
    private contextMenuManager: ContextMenuManager;
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
        
        this.initializeProjectRoot();
        this.setupDisplayCustomization();
        this.setupServiceIntegration();
    }

    /**
     * Initialize project root path
     */
    private initializeProjectRoot(): void {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.projectRootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
    }

    /**
     * Set root path for file details
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
                
                if ('showHiddenFiles' in settings || 
                    'compactMode' in settings || 
                    'showFileIcons' in settings ||
                    'showFileSize' in settings ||
                    'showModifiedDate' in settings) {
                    this.debouncedRefresh();
                }
            })
        );

        this.setSortOrder(displayCustomizationService.getSortOrder());
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
                    activeProvider: 'file-details',
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
    public getCurrentPath(): string | undefined {
        return this.rootPath;
    }

    /**
     * Update tree view title
     */
    private updateTitle(): void {
        if (this.treeView && this.rootPath) {
            const folderName = path.basename(this.rootPath);
            this.treeView.title = `ファイル一覧 - ${folderName}`;
        }
    }

    /**
     * Set up file system watcher
     */
    private setupFileWatcher(): void {
        // Dispose existing watcher
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }

        // Set up new watcher for current path
        if (this.rootPath) {
            const watchPattern = new vscode.RelativePattern(this.rootPath, '**/*');
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

            // Watch for file system changes with debouncing
            this.fileWatcher.onDidChange(() => this.handleFileSystemChange());
            this.fileWatcher.onDidCreate(() => this.handleFileSystemChange());
            this.fileWatcher.onDidDelete(() => this.handleFileSystemChange());
        }
    }

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
                : `${items.length} 個のアイテムを削除しました`;
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
                vscode.TreeItemCollapsibleState.Expanded : 
                vscode.TreeItemCollapsibleState.None
        );

        treeItem.resourceUri = vscode.Uri.file(element.filePath);
        treeItem.contextValue = this.getEnhancedContextValue(element);
        treeItem.iconPath = this.getEnhancedIconPath(element);
        
        // Set enhanced tooltip with detailed information
        treeItem.tooltip = FileInfoFormatter.createDetailedTooltip(element, true);

        // Set enhanced description with size and time info
        treeItem.description = FileInfoFormatter.createCompactDescription(element, true, true);

        // Set command for files
        if (!element.isDirectory) {
            treeItem.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [treeItem.resourceUri]
            };
        }

        // Update with selection state
        return this.updateTreeItemWithSelection(treeItem, element);
    }

    public async getChildren(element?: EnhancedFileItem): Promise<EnhancedFileItem[]> {
        if (!this.rootPath) {
            return [];
        }

        if (!element) {
            // Root level: show files and directories directly
            try {
                const items = await this.getItemsInDirectory(this.rootPath);
                const processedItems = this.processItems(items);
                
                // Update all items for root level
                await this.updateAllItems();
                
                return processedItems;
            } catch (error) {
                vscode.window.showErrorMessage(`ディレクトリの読み取りに失敗しました: ${error}`);
                return [];
            }
        }

        // Subdirectory expansion
        const targetPath = element.filePath;

        try {
            const items = await this.getItemsInDirectory(targetPath);
            return this.processItems(items);
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
        await this.collectAllItems(this.rootPath, allItems);
        return allItems;
    }

    // ===== Private Methods =====

    /**
     * Get all items (files and directories) in a specific directory with caching
     */
    private async getItemsInDirectory(dirPath: string): Promise<EnhancedFileItem[]> {
        // Check cache first
        const cacheKey = `items:${dirPath}`;
        const cachedItems = this.cacheManager.get<EnhancedFileItem[]>(cacheKey);
        
        if (cachedItems) {
            return cachedItems;
        }

        const items: EnhancedFileItem[] = [];

        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

            // Process entries in batches for better performance
            const batchSize = 50;
            for (let i = 0; i < entries.length; i += batchSize) {
                const batch = entries.slice(i, i + batchSize);
                
                const batchPromises = batch.map(async (entry) => {
                    const fullPath = path.join(dirPath, entry.name);
                    
                    try {
                        // Check individual item cache
                        const itemCacheKey = `item:${fullPath}`;
                        const cachedItem = this.cacheManager.get<EnhancedFileItem>(itemCacheKey);
                        
                        if (cachedItem) {
                            return cachedItem;
                        }

                        const stat = await fs.promises.stat(fullPath);
                        
                        // Detect permissions using the enhanced utility
                        const permissions = await PermissionDetector.detectPermissions(fullPath);

                        const item = new EnhancedFileItem(
                            entry.name,
                            entry.isDirectory() ? 
                                vscode.TreeItemCollapsibleState.Expanded : 
                                vscode.TreeItemCollapsibleState.None,
                            fullPath,
                            entry.isDirectory(),
                            entry.isFile() ? stat.size : 0,
                            stat.mtime,
                            stat.birthtime,
                            permissions
                        );

                        // Cache individual item
                        this.cacheManager.set(itemCacheKey, item, 15000); // 15 seconds
                        
                        return item;
                    } catch (statError) {
                        // Skip items that can't be accessed
                        console.warn(`Failed to stat ${fullPath}:`, statError);
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                items.push(...batchResults.filter(item => item !== null) as EnhancedFileItem[]);
            }

            // Filter based on display settings
            const filteredItems = items.filter(item => 
                displayCustomizationService.shouldShowFile(item)
            );

            // Cache the directory listing
            this.cacheManager.set(cacheKey, filteredItems, 10000); // 10 seconds
            
            return filteredItems;
        } catch (error) {
            throw new Error(`ディレクトリの読み取りに失敗しました: ${error}`);
        }
    }

    /**
     * Recursively collect all items
     */
    private async collectAllItems(dirPath: string, items: EnhancedFileItem[]): Promise<void> {
        try {
            const dirItems = await this.getItemsInDirectory(dirPath);
            items.push(...dirItems);

            // Recursively collect items from subdirectories
            for (const item of dirItems) {
                if (item.isDirectory) {
                    await this.collectAllItems(item.filePath, items);
                }
            }
        } catch (error) {
            // Skip directories that can't be accessed
            console.warn(`Failed to collect items from ${dirPath}:`, error);
        }
    }

    /**
     * Get enhanced context value with permission information
     */
    private getEnhancedContextValue(element: EnhancedFileItem): string {
        const base = element.isDirectory ? 'directory' : 'file';
        const modifiers: string[] = [];
        
        if (element.permissions?.readonly) {
            modifiers.push('readonly');
        }
        
        if (element.permissions?.executable) {
            modifiers.push('executable');
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
        if (element.isDirectory) {
            // Use different folder icons based on permissions
            if (element.permissions?.readonly) {
                return new vscode.ThemeIcon('folder-locked');
            }
            return new vscode.ThemeIcon('folder');
        }

        // Get base icon from the element
        let iconName = 'file';
        
        // Determine icon based on file type
        const ext = path.extname(element.filePath).toLowerCase();
        
        // Code files
        const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.html', '.css', '.scss', '.vue', '.json'];
        if (codeExtensions.includes(ext)) {
            iconName = 'file-code';
        }
        // Image files
        else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico'].includes(ext)) {
            iconName = 'file-media';
        }
        // Document files
        else if (['.txt', '.md', '.pdf', '.doc', '.docx', '.rtf'].includes(ext)) {
            iconName = 'file-text';
        }
        // Archive files
        else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
            iconName = 'file-zip';
        }
        // Executable files
        else if (element.permissions?.executable) {
            iconName = 'gear';
        }

        return new vscode.ThemeIcon(iconName);
    }

    /**
     * Get relative path from project root
     */
    private getRelativePath(fullPath: string): string {
        if (!this.projectRootPath) {
            return fullPath;
        }

        const relativePath = path.relative(this.projectRootPath, fullPath);
        return relativePath || '.';
    }

    // ===== Public API Methods =====

    /**
     * Go to parent folder
     */
    public goToParentFolder(): void {
        if (!this.rootPath) {
            return;
        }

        const parentPath = path.dirname(this.rootPath);
        
        // Don't go above project root
        if (this.projectRootPath && !parentPath.startsWith(this.projectRootPath)) {
            vscode.window.showInformationMessage('プロジェクトルートより上には移動できません');
            return;
        }

        // Don't go above root directory
        if (parentPath === this.rootPath) {
            vscode.window.showInformationMessage('これ以上上のフォルダはありません');
            return;
        }

        this.setRootPath(parentPath);
    }

    /**
     * Navigate to a specific path
     */
    public navigateToPath(targetPath: string): void {
        if (fs.existsSync(targetPath)) {
            this.setRootPath(targetPath);
        } else {
            vscode.window.showErrorMessage(`パスが見つかりません: ${targetPath}`);
        }
    }

    /**
     * Refresh the tree
     */
    public refreshTree(): void {
        this.updateAllItems();
        this.refresh();
    }

    /**
     * Get selected files
     */
    public getSelectedFiles(): EnhancedFileItem[] {
        return this.getSelectedItems().filter(item => !item.isDirectory);
    }

    /**
     * Get selected directories
     */
    public getSelectedDirectories(): EnhancedFileItem[] {
        return this.getSelectedItems().filter(item => item.isDirectory);
    }

    /**
     * Get file count in current directory
     */
    public async getFileCount(): Promise<{ files: number; directories: number }> {
        if (!this.rootPath) {
            return { files: 0, directories: 0 };
        }

        try {
            const items = await this.getItemsInDirectory(this.rootPath);
            const files = items.filter(item => !item.isDirectory).length;
            const directories = items.filter(item => item.isDirectory).length;
            
            return { files, directories };
        } catch (error) {
            return { files: 0, directories: 0 };
        }
    }

    /**
     * Check if current path is within project root
     */
    public isWithinProjectRoot(): boolean {
        if (!this.rootPath || !this.projectRootPath) {
            return false;
        }

        const resolvedCurrent = path.resolve(this.rootPath);
        const resolvedProject = path.resolve(this.projectRootPath);
        
        return resolvedCurrent.startsWith(resolvedProject);
    }

    // ===== Search Integration Methods =====

    /**
     * Get search manager instance
     */
    public getSearchManager() {
        return this.searchManager;
    }

    /**
     * Show search input dialog
     */
    public async showSearch(): Promise<void> {
        await this.showSearchInput();
    }

    /**
     * Clear current search
     */
    public clearSearch(): void {
        this.clearFilter();
        this.clearSearchHighlight();
    }

    // ===== Disposal =====

    // ===== Performance Optimization Methods =====

    /**
     * Preload directory contents
     */
    public async preloadDirectory(dirPath: string): Promise<void> {
        try {
            await this.getItemsInDirectory(dirPath);
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
        vscode.window.showInformationMessage('ファイル詳細のキャッシュをクリアしました');
    }

    // ===== Service Integration Methods =====

    /**
     * Get provider context
     */
    public getProviderContext(): any {
        return {
            type: 'file-details',
            rootPath: this.rootPath,
            projectRootPath: this.projectRootPath,
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
            vscode.commands.registerCommand('fileDetails.refresh', () => {
                this.clearCache();
                this.refreshTree();
            }),
            vscode.commands.registerCommand('fileDetails.clearCache', () => {
                this.clearCache();
            }),
            vscode.commands.registerCommand('fileDetails.goToParent', () => {
                this.goToParentFolder();
            }),
            vscode.commands.registerCommand('fileDetails.preloadAll', async () => {
                if (this.rootPath) {
                    await this.preloadDirectory(this.rootPath);
                    vscode.window.showInformationMessage('ファイル詳細の事前読み込みが完了しました');
                }
            }),
            vscode.commands.registerCommand('fileDetails.showStats', () => {
                const fileCount = this.getFileCount();
                fileCount.then(stats => {
                    vscode.window.showInformationMessage(
                        `ファイル: ${stats.files}個, フォルダ: ${stats.directories}個`
                    );
                });
            })
        ];

        commands.forEach(command => context.subscriptions.push(command));
    }

    /**
     * Handle external changes
     */
    public handleExternalChange(changeType: 'file-created' | 'file-deleted' | 'file-modified', filePath: string): void {
        const dirPath = path.dirname(filePath);
        this.cacheManager.invalidate(`items:${dirPath}`);
        this.cacheManager.invalidate(`item:${filePath}`);
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
            this.cacheManager.invalidate(`items:${dir}`);
        }
        
        this.debouncedRefresh();
    }

    // ===== Disposal =====

    public dispose(): void {
        this.displayDisposables.forEach(d => d.dispose());
        this.displayDisposables = [];
        
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
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