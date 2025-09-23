import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EnhancedTreeDataProvider } from './EnhancedTreeDataProvider';
import { EnhancedFileItem } from '../models/EnhancedFileItem';
import { PermissionDetector } from '../utils/PermissionDetector';
import { FileInfoFormatter } from '../utils/FileInfoFormatter';
import { displayCustomizationService } from './DisplayCustomizationService';
import { FileSystemCacheManager } from './FileSystemCacheManager';
import { ClipboardManager } from './ClipboardManager';
import { FileOperationService } from './FileOperationService';
import { KeyboardShortcutHandler } from './KeyboardShortcutHandler';
import { ContextMenuManager } from './ContextMenuManager';
import { IEnhancedFileItem, IExplorerManager } from '../interfaces/core';
import { MultiSelectionManager } from './MultiSelectionManager';

/**
 * Enhanced workspace explorer provider with full feature integration
 */
export class EnhancedWorkspaceExplorerProvider extends EnhancedTreeDataProvider<EnhancedFileItem> implements IExplorerManager {
    private workspaceRoot: string | undefined;
    private displayDisposables: vscode.Disposable[] = [];
    private cacheManager: FileSystemCacheManager;
    private clipboardManager: ClipboardManager;
    private fileOperationService: FileOperationService;
    private keyboardShortcutHandler: KeyboardShortcutHandler;
    private contextMenuManager: ContextMenuManager;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private debounceTimeout: NodeJS.Timeout | undefined;
    private expandedFolders: Set<string> = new Set(); // 展開されたフォルダを追跡

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
        
        this.initializeWorkspaceRoot();
        this.setupDisplayCustomization();
        this.setupFileWatcher();
        this.setupServiceIntegration();
    }

    /**
     * Initialize workspace root path
     */
    private initializeWorkspaceRoot(): void {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            // Skip initial updateAllItems for better performance
            // this.updateAllItems();
        }
    }

    /**
     * Setup display customization integration
     */
    private setupDisplayCustomization(): void {
        // Listen for display settings changes
        this.displayDisposables.push(
            displayCustomizationService.onDisplaySettingsChanged((settings) => {
                // Invalidate cache when display settings change
                this.cacheManager.clear();
                
                // Update sort order if changed
                if ('sortOrder' in settings) {
                    this.setSortOrder(settings.sortOrder!);
                }
                
                // Refresh view for other display changes
                if ('showHiddenFiles' in settings || 
                    'compactMode' in settings || 
                    'showFileIcons' in settings ||
                    'showFileSize' in settings ||
                    'showModifiedDate' in settings) {
                    this.debouncedRefresh();
                }
            })
        );

        // Initialize with current settings
        this.setSortOrder(displayCustomizationService.getSortOrder());
    }

    /**
     * Setup file system watcher for automatic updates
     */
    private setupFileWatcher(): void {
        if (this.workspaceRoot) {
            const watchPattern = new vscode.RelativePattern(this.workspaceRoot, '**/*');
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

            // Debounced refresh on file system changes
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
        // Note: Context menus are registered globally in extension.ts
        
        // Set up clipboard integration
        this.displayDisposables.push(
            this.clipboardManager.onClipboardChanged(() => {
                // Update context menus when clipboard state changes
                this.refresh();
            })
        );
        
        // Set up selection integration
        this.displayDisposables.push(
            this.selectionManager.onSelectionChanged((selection) => {
                // Update keyboard shortcut context
                this.keyboardShortcutHandler.updateContext({
                    activeProvider: 'workspace-explorer',
                    selectedItems: selection,
                    currentPath: this.workspaceRoot,
                    canPaste: this.clipboardManager.canPaste()
                });
            })
        );
    }

    /**
     * Handle file system changes with debouncing
     */
    private handleFileSystemChange(): void {
        // Invalidate cache
        this.cacheManager.clear();
        
        // Debounced refresh to avoid excessive updates
        this.debouncedRefresh();
    }

    /**
     * Debounced refresh to improve performance
     */
    private debouncedRefresh(): void {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        
        this.debounceTimeout = setTimeout(() => {
            // Skip updateAllItems for better performance
            // this.updateAllItems();
            this.refresh();
        }, 300);
    }

    /**
     * Set workspace root path
     */
    public setWorkspaceRoot(rootPath: string): void {
        this.workspaceRoot = rootPath;
        // Skip updateAllItems for better performance
        // this.updateAllItems();
        this.refresh();
    }

    /**
     * Get workspace root path
     */
    public getWorkspaceRoot(): string | undefined {
        return this.workspaceRoot;
    }

    // ===== TreeDataProvider Implementation =====

    public getTreeItem(element: EnhancedFileItem): vscode.TreeItem {
        // Determine collapsible state based on whether folder is expanded
        let collapsibleState = vscode.TreeItemCollapsibleState.None;
        if (element.isDirectory) {
            collapsibleState = this.isFolderExpanded(element.filePath) ? 
                vscode.TreeItemCollapsibleState.Expanded : 
                vscode.TreeItemCollapsibleState.Collapsed;
        }
        
        const treeItem = new vscode.TreeItem(element.label, collapsibleState);

        // Override all properties to ensure simple display
        treeItem.id = element.id;
        treeItem.resourceUri = vscode.Uri.file(element.filePath);
        
        // Set context value with permission information
        treeItem.contextValue = this.getContextValueWithPermissions(element);
        
        // Set icon with permission indicators (if enabled)
        if (displayCustomizationService.getShowFileIcons()) {
            treeItem.iconPath = this.getIconWithPermissionIndicators(element);
        }
        
        // Simple tooltip with just the file name
        treeItem.tooltip = element.label;

        // No description - only show file/folder names
        treeItem.description = undefined;

        // Set command for files
        if (!element.isDirectory) {
            treeItem.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [treeItem.resourceUri]
            };
        }

        // Return the tree item without selection indicators
        return treeItem;
    }

    /**
     * Override to prevent adding ● marks to selected items
     */
    protected updateTreeItemWithSelection(treeItem: vscode.TreeItem, item: EnhancedFileItem): vscode.TreeItem {
        // Don't add ● marks for selection - just return the item as-is
        // Still update context value for functionality
        const isSelected = this.selectionManager.isSelected(item);
        
        if (isSelected) {
            // Update context value to indicate selection (for functionality)
            const originalContext = treeItem.contextValue || '';
            treeItem.contextValue = originalContext.includes(':selected') ? 
                originalContext : `${originalContext}:selected`;
        }

        // Add search highlighting if active (without ● marks)
        this.updateTreeItemWithSearchHighlight(treeItem, item);

        // Add drag and drop context values
        this.updateTreeItemWithDragDrop(treeItem, item);

        return treeItem;
    }



    public async getChildren(element?: EnhancedFileItem): Promise<EnhancedFileItem[]> {
        if (!this.workspaceRoot) {
            return [];
        }

        const targetPath = element ? element.filePath : this.workspaceRoot;

        try {
            const items = await this.getItemsInDirectory(targetPath);
            
            // Filter items based on display settings
            const filteredItems = items.filter(item => displayCustomizationService.shouldShowFile(item));
            
            const processedItems = this.processItems(filteredItems);
            
            // Skip updateAllItems for better performance
            // if (!element) {
            //     await this.updateAllItems();
            // }
            
            return processedItems;
        } catch (error) {
            vscode.window.showErrorMessage(`ディレクトリの読み取りに失敗しました: ${error}`);
            return [];
        }
    }

    public getParent(element: EnhancedFileItem): EnhancedFileItem | undefined {
        if (!this.workspaceRoot || !element) {
            return undefined;
        }

        const parentPath = path.dirname(element.filePath);
        
        // If parent is the workspace root or above, return undefined
        if (parentPath === element.filePath || !parentPath.startsWith(this.workspaceRoot)) {
            return undefined;
        }

        try {
            // Create parent item synchronously for performance
            const parentItem = new EnhancedFileItem(
                path.basename(parentPath),
                vscode.TreeItemCollapsibleState.Collapsed,
                parentPath,
                true, // isDirectory
                0, // size (directories don't have meaningful size)
                new Date() // modified (use current date as fallback)
            );
            return parentItem;
        } catch (error) {
            return undefined;
        }
    }

    // ===== Protected Methods Implementation =====

    protected async loadAllItems(): Promise<EnhancedFileItem[]> {
        if (!this.workspaceRoot) {
            return [];
        }

        const allItems: EnhancedFileItem[] = [];
        await this.collectAllItems(this.workspaceRoot, allItems);
        return allItems;
    }

    // ===== Private Methods =====

    // ===== IExplorerManager Implementation =====

    /**
     * Copy items to clipboard
     */
    public async copyToClipboard(items: IEnhancedFileItem[]): Promise<void> {
        await this.clipboardManager.copy(items);
    }

    /**
     * Cut items to clipboard
     */
    public async cutToClipboard(items: IEnhancedFileItem[]): Promise<void> {
        await this.clipboardManager.cut(items);
    }

    /**
     * Paste from clipboard
     */
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

    /**
     * Delete items
     */
    public async deleteItems(items: IEnhancedFileItem[]): Promise<void> {
        if (items.length === 0) {
            return;
        }

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

    /**
     * Rename item
     */
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

    /**
     * Create file
     */
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

    /**
     * Create folder
     */
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

    /**
     * Handle drag start
     */
    /**
     * Select all items in current provider
     */
    public selectAll(): void {
        this.selectionManager.selectAll();
    }

    /**
     * Get selection manager instance
     */
    public getSelectionManager(): MultiSelectionManager {
        return this.selectionManager;
    }

    /**
     * Mark folder as expanded
     */
    public markFolderExpanded(folderPath: string): void {
        this.expandedFolders.add(folderPath);
        console.log('Marked folder as expanded:', folderPath);
    }

    /**
     * Check if folder is expanded
     */
    public isFolderExpanded(folderPath: string): boolean {
        return this.expandedFolders.has(folderPath);
    }

    /**
     * Force expand folder in TreeView
     */
    public async forceExpandFolder(folderPath: string): Promise<void> {
        try {
            const folderItem = await this.findItemByPath(folderPath);
            if (folderItem && folderItem.isDirectory && this.treeView) {
                console.log('Force expanding folder:', folderItem.label, 'at path:', folderPath);
                
                // First, ensure the folder item has the correct collapsible state
                folderItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                
                // Try multiple approaches to ensure expansion
                for (let i = 0; i < 3; i++) {
                    try {
                        // Method 1: Use reveal with expand
                        await this.treeView.reveal(folderItem, {
                            select: false,
                            focus: false,
                            expand: 3  // Expand up to 3 levels
                        });
                        
                        // Method 2: Force refresh the tree to reflect changes
                        this.refresh();
                        
                        // Mark as expanded
                        this.markFolderExpanded(folderPath);
                        
                        // Wait for expansion to complete
                        await new Promise(resolve => setTimeout(resolve, 300));
                        
                        console.log(`Force expand attempt ${i + 1} completed for:`, folderItem.label);
                        
                        // Verify expansion by checking if children are loaded
                        try {
                            const children = await this.getChildren(folderItem);
                            if (children.length > 0) {
                                console.log(`Folder expansion verified: ${children.length} children found`);
                                break; // Success, exit the loop
                            }
                        } catch (childError) {
                            console.warn('Failed to verify folder expansion:', childError);
                        }
                        
                    } catch (revealError) {
                        console.warn(`Reveal attempt ${i + 1} failed:`, revealError);
                    }
                }
            } else {
                console.warn('Cannot expand folder - item not found or not a directory:', folderPath);
            }
        } catch (error) {
            console.warn('Failed to force expand folder:', folderPath, error);
        }
    }

    /**
     * Reveal file in explorer with parent folder expansion
     */
    public async revealFile(filePath: string): Promise<void> {
        try {
            console.log('=== Revealing file in Enhanced Workspace Explorer ===');
            console.log('Target file path:', filePath);
            
            if (!this.treeView) {
                console.warn('TreeView not available');
                return;
            }

            // ワークスペース内のファイルかチェック
            if (!this.workspaceRoot || !filePath.startsWith(this.workspaceRoot)) {
                console.warn('File is not within workspace:', filePath);
                return;
            }

            // シンプルなアプローチ: TreeView.revealの標準機能を最大限活用
            await this.simpleRevealFile(filePath);

            console.log('File revealed successfully in Enhanced Workspace Explorer');
        } catch (error) {
            console.error('Failed to reveal file in Enhanced Workspace Explorer:', error);
        }
    }

    /**
     * Simple file reveal using TreeView's built-in capabilities with proper parent loading
     */
    private async simpleRevealFile(filePath: string): Promise<void> {
        if (!this.treeView || !this.workspaceRoot) {
            return;
        }

        console.log('--- Simple file reveal with proper tree integration ---');
        console.log('Target:', filePath);

        try {
            // Step 1: Ensure all parent directories are loaded and expanded
            await this.ensureParentDirectoriesLoadedAndExpanded(filePath);
            
            // Step 2: Force a complete tree refresh to ensure all items are registered
            this.refresh();
            await new Promise(resolve => setTimeout(resolve, 400));
            
            // Step 3: Try to find the file item in the properly loaded tree
            let fileItem = await this.findItemByPath(filePath);
            
            if (!fileItem) {
                console.warn('File item still not found after proper tree loading');
                // As a last resort, try to load the parent directory explicitly
                const parentPath = path.dirname(filePath);
                const parentItem = await this.findItemByPath(parentPath);
                
                if (parentItem && parentItem.isDirectory) {
                    console.log('Loading parent directory children explicitly');
                    const children = await this.getChildren(parentItem);
                    fileItem = children.find(child => child.filePath === filePath);
                    
                    if (fileItem) {
                        console.log('Found file item in parent directory children');
                    }
                }
            }
            
            if (fileItem) {
                console.log('Found file item in tree:', fileItem.label);
                
                // Now try to reveal and select the properly registered item
                try {
                    await this.treeView.reveal(fileItem, {
                        select: true,
                        focus: false,
                        expand: 1
                    });
                    console.log('TreeView.reveal completed for registered item');
                    
                    // Update internal selection state
                    this.selectionManager.setSelection([fileItem]);
                    this.setSelectedItems([fileItem]);
                    
                    // Verify selection
                    await new Promise(resolve => setTimeout(resolve, 200));
                    const currentSelection = this.treeView.selection;
                    console.log('Final TreeView selection count:', currentSelection.length);
                    
                    if (currentSelection.length > 0) {
                        console.log('SUCCESS: File is now selected in TreeView');
                    } else {
                        console.warn('FAILED: File is still not selected in TreeView');
                    }
                    
                } catch (revealError) {
                    console.error('Error during reveal of registered item:', revealError);
                }
                
            } else {
                console.error('CRITICAL: Could not find file item even after proper tree loading');
                console.log('This indicates a fundamental issue with the TreeDataProvider structure');
            }
            
        } catch (error) {
            console.error('Error in simpleRevealFile:', error);
        }
    }

    /**
     * Ensure all parent directories are loaded and expanded in the TreeView
     */
    private async ensureParentDirectoriesLoadedAndExpanded(filePath: string): Promise<void> {
        if (!this.workspaceRoot) {
            return;
        }

        console.log('--- Ensuring parent directories are loaded and expanded ---');
        
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);
        
        // Remove the file name, keep only folder parts
        pathParts.pop();
        
        console.log('Parent directories to load and expand:', pathParts);
        
        let currentPath = this.workspaceRoot;
        let currentItem: EnhancedFileItem | undefined;
        
        // Start with root children
        let currentChildren = await this.getChildren();
        
        // Load each parent directory sequentially
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            currentPath = path.join(currentPath, part);
            
            console.log(`Loading and expanding directory ${i + 1}/${pathParts.length}:`, currentPath);
            
            // Find the directory in current children
            currentItem = currentChildren.find(child => child.filePath === currentPath && child.isDirectory);
            
            if (currentItem) {
                console.log(`Found directory item: ${currentItem.label}`);
                
                // Mark as expanded
                this.markFolderExpanded(currentPath);
                
                // Load its children for the next iteration
                currentChildren = await this.getChildren(currentItem);
                console.log(`Loaded ${currentChildren.length} children from ${currentItem.label}`);
                
                // Wait for the loading to complete
                await new Promise(resolve => setTimeout(resolve, 100));
            } else {
                console.warn(`Directory not found in tree: ${currentPath}`);
                break;
            }
        }
        
        console.log('--- Parent directories loading and expansion completed ---');
    }

    /**
     * Ensure all parent directories are loaded in the TreeView (legacy method)
     */
    private async ensureParentDirectoriesLoaded(filePath: string): Promise<void> {
        if (!this.workspaceRoot) {
            return;
        }

        console.log('--- Ensuring parent directories are loaded ---');
        
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);
        
        // Remove the file name, keep only folder parts
        pathParts.pop();
        
        console.log('Parent directories to load:', pathParts);
        
        let currentPath = this.workspaceRoot;
        
        // Load each parent directory by calling getChildren
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            currentPath = path.join(currentPath, part);
            
            console.log(`Loading directory ${i + 1}/${pathParts.length}:`, currentPath);
            
            try {
                // Find the parent directory item
                let parentItem: EnhancedFileItem | undefined;
                
                if (i === 0) {
                    // For the first level, get children of root
                    const rootChildren = await this.getChildren();
                    parentItem = rootChildren.find(child => child.filePath === currentPath);
                } else {
                    // For deeper levels, find the parent item first
                    const parentPath = path.dirname(currentPath);
                    const parentOfParent = await this.findItemByPath(parentPath);
                    if (parentOfParent) {
                        const children = await this.getChildren(parentOfParent);
                        parentItem = children.find(child => child.filePath === currentPath);
                    }
                }
                
                if (parentItem && parentItem.isDirectory) {
                    console.log(`Loading children of: ${parentItem.label}`);
                    // Load the children of this directory to make them available in the tree
                    await this.getChildren(parentItem);
                    
                    // Mark as expanded
                    this.markFolderExpanded(currentPath);
                    
                    // Update the tree
                    this.refresh();
                    
                    // Wait for the update to complete
                    await new Promise(resolve => setTimeout(resolve, 100));
                } else {
                    console.warn(`Parent directory not found: ${currentPath}`);
                }
                
            } catch (error) {
                console.warn(`Failed to load directory: ${currentPath}`, error);
            }
        }
        
        console.log('--- Parent directories loading completed ---');
    }

    /**
     * Generate a unique ID for a file item based on its path
     */
    private generateItemId(filePath: string): string {
        // Use a hash of the file path to ensure uniqueness
        const crypto = require('crypto');
        return crypto.createHash('md5').update(filePath).digest('hex');
    }

    /**
     * Debug method to check TreeView state
     */
    private debugTreeViewState(): void {
        if (this.treeView) {
            console.log('=== TreeView Debug Info ===');
            console.log('TreeView visible:', this.treeView.visible);
            console.log('TreeView selection count:', this.treeView.selection.length);
            if (this.treeView.selection.length > 0) {
                this.treeView.selection.forEach((item, index) => {
                    console.log(`Selection ${index}:`, item);
                });
            }
            console.log('Selection manager has selection:', this.selectionManager.hasSelection());
            console.log('=== End TreeView Debug Info ===');
        }
    }

    /**
     * Reveal file with automatic parent folder expansion using TreeView.reveal
     */
    private async revealFileWithParentExpansion(filePath: string): Promise<void> {
        if (!this.workspaceRoot || !this.treeView) {
            return;
        }

        console.log('--- Revealing file with automatic parent expansion ---');
        console.log('Target file:', filePath);
        
        try {
            // First, ensure the file item exists
            let fileItem = await this.findItemByPath(filePath);
            
            if (!fileItem) {
                console.log('File item not found, creating directly from filesystem');
                // Create the file item directly
                const fs = await import('fs');
                if (fs.existsSync(filePath)) {
                    const stat = await fs.promises.stat(filePath);
                    const fileName = path.basename(filePath);
                    
                    fileItem = new EnhancedFileItem(
                        fileName,
                        stat.isDirectory() ? 
                            vscode.TreeItemCollapsibleState.Collapsed : 
                            vscode.TreeItemCollapsibleState.None,
                        filePath,
                        stat.isDirectory(),
                        stat.isFile() ? stat.size : 0,
                        stat.mtime,
                        stat.birthtime
                    );
                    
                    console.log('Created file item:', fileName);
                } else {
                    console.warn('File does not exist:', filePath);
                    return;
                }
            }
            
            if (fileItem) {
                console.log('Revealing file item:', fileItem.label);
                
                // Use TreeView.reveal with maximum expansion
                // This should automatically expand all parent folders
                await this.treeView.reveal(fileItem, {
                    select: true,
                    focus: false,
                    expand: 10  // Expand many levels to ensure all parents are expanded
                });
                
                console.log('TreeView.reveal completed');
                
                // Update selection state
                this.selectionManager.setSelection([fileItem]);
                this.setSelectedItems([fileItem]);
                
                // Force a refresh to ensure the tree is updated
                this.refresh();
                
                console.log('File selection and tree refresh completed');
            }
            
        } catch (error) {
            console.error('Error in revealFileWithParentExpansion:', error);
        }
        
        console.log('--- Automatic parent expansion completed ---');
    }

    /**
     * Expand all parent folders for a given file path with TreeView refresh
     */
    private async expandParentFoldersWithRefresh(filePath: string): Promise<void> {
        if (!this.workspaceRoot) {
            return;
        }

        console.log('--- Expanding parent folders with refresh ---');
        console.log('Workspace root:', this.workspaceRoot);
        console.log('Target file:', filePath);

        const relativePath = path.relative(this.workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);
        
        // Remove the file name, keep only folder parts
        pathParts.pop();
        
        console.log('Folder parts to expand:', pathParts);
        
        let currentPath = this.workspaceRoot;
        
        // Expand each parent folder sequentially with refresh
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            currentPath = path.join(currentPath, part);
            
            console.log(`Expanding folder ${i + 1}/${pathParts.length}:`, currentPath);
            
            try {
                // Mark folder as expanded first
                this.markFolderExpanded(currentPath);
                
                // Force a refresh to update the TreeView
                this.refresh();
                
                // Wait for refresh to complete
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Then try to expand the folder
                await this.forceExpandFolder(currentPath);
                
                // Another refresh to ensure the expansion is visible
                this.refresh();
                
                // Wait between expansions
                await new Promise(resolve => setTimeout(resolve, 250));
                
                console.log(`Successfully expanded folder: ${currentPath}`);
            } catch (error) {
                console.warn(`Failed to expand folder: ${currentPath}`, error);
            }
        }
        
        console.log('--- Parent folder expansion with refresh completed ---');
    }

    /**
     * Expand all parent folders for a given file path (legacy method)
     */
    private async expandParentFolders(filePath: string): Promise<void> {
        // Use the new method with refresh
        await this.expandParentFoldersWithRefresh(filePath);
    }

    // ===== Private Methods =====

    /**
     * Get items in a specific directory with caching
     */
    private async getItemsInDirectory(dirPath: string): Promise<EnhancedFileItem[]> {
        // Check cache first
        const cacheKey = `dir:${dirPath}`;
        const cachedItems = this.cacheManager.get<EnhancedFileItem[]>(cacheKey);
        
        if (cachedItems) {
            return cachedItems;
        }

        const items: EnhancedFileItem[] = [];

        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

            // Process entries in smaller batches for better responsiveness
            const batchSize = 20;
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
                        
                        // Skip permission detection for better performance
                        const permissions = undefined;

                        const item = new EnhancedFileItem(
                            entry.name,
                            entry.isDirectory() ? 
                                vscode.TreeItemCollapsibleState.Collapsed : 
                                vscode.TreeItemCollapsibleState.None,
                            fullPath,
                            entry.isDirectory(),
                            entry.isFile() ? stat.size : 0,
                            stat.mtime,
                            stat.birthtime,
                            permissions
                        );

                        // Cache individual item
                        this.cacheManager.set(itemCacheKey, item, 15000); // 15 seconds for individual items
                        
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

            // Cache the directory listing
            this.cacheManager.set(cacheKey, items, 10000); // 10 seconds for directory listings
            
        } catch (error) {
            throw new Error(`ディレクトリの読み取りに失敗しました: ${error}`);
        }

        return items;
    }

    /**
     * Recursively collect all items in the workspace
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
     * Format file size in human readable format
     */
    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Get context value with permission information
     */
    private getContextValueWithPermissions(element: EnhancedFileItem): string {
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
     * Get icon with permission indicators
     */
    private getIconWithPermissionIndicators(element: EnhancedFileItem): vscode.ThemeIcon {
        let iconName: string;
        
        if (element.isDirectory) {
            iconName = 'folder';
        } else {
            // Use file type specific icons
            const ext = path.extname(element.filePath).toLowerCase();
            
            // Code files
            const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte', '.json', '.xml', '.yaml', '.yml'];
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
            else if (element.permissions?.executable || ['.exe', '.msi', '.app', '.deb', '.rpm', '.dmg'].includes(ext)) {
                iconName = 'gear';
            }
            else {
                iconName = 'file';
            }
        }

        // Add permission-based icon modifications
        if (element.permissions?.readonly) {
            // For readonly files, we could use a different icon or add an overlay
            // VSCode doesn't support icon overlays directly, so we use different icons
            if (!element.isDirectory && iconName === 'file') {
                iconName = 'lock';
            }
        }

        return new vscode.ThemeIcon(iconName);
    }



    // ===== Public API Methods =====

    /**
     * Refresh the entire tree
     */
    public refreshTree(): void {
        this.updateAllItems();
        this.refresh();
    }

    /**
     * Navigate to a specific path
     */
    public navigateToPath(targetPath: string): void {
        if (fs.existsSync(targetPath)) {
            this.setWorkspaceRoot(targetPath);
        } else {
            vscode.window.showErrorMessage(`パスが見つかりません: ${targetPath}`);
        }
    }

    /**
     * Get relative path from workspace root
     */
    public getRelativePath(fullPath: string): string {
        if (!this.workspaceRoot) {
            return fullPath;
        }

        const relativePath = path.relative(this.workspaceRoot, fullPath);
        return relativePath || '.';
    }

    /**
     * Check if a path is within the workspace
     */
    public isWithinWorkspace(targetPath: string): boolean {
        if (!this.workspaceRoot) {
            return false;
        }

        const resolvedTarget = path.resolve(targetPath);
        const resolvedRoot = path.resolve(this.workspaceRoot);
        
        return resolvedTarget.startsWith(resolvedRoot);
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

    // ===== Performance Optimization Methods =====

    /**
     * Preload directory contents for better performance
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
        vscode.window.showInformationMessage('キャッシュをクリアしました');
    }

    /**
     * Optimize for large directories
     */
    private async optimizeForLargeDirectory(dirPath: string): Promise<boolean> {
        try {
            const entries = await fs.promises.readdir(dirPath);
            const isLarge = entries.length > 1000;
            
            if (isLarge) {
                vscode.window.showInformationMessage(
                    `大きなディレクトリ (${entries.length} 項目) を読み込んでいます...`,
                    { modal: false }
                );
            }
            
            return isLarge;
        } catch (error) {
            return false;
        }
    }

    // ===== Integration Helper Methods =====

    /**
     * Get current provider context for other services
     */
    public getProviderContext(): any {
        return {
            type: 'workspace-explorer',
            workspaceRoot: this.workspaceRoot,
            selectedItems: this.getSelectedItems(),
            canPaste: this.clipboardManager.canPaste(),
            cacheStats: this.getCacheStats()
        };
    }

    /**
     * Update provider with external changes
     */
    public handleExternalChange(changeType: 'file-created' | 'file-deleted' | 'file-modified', filePath: string): void {
        // Invalidate specific cache entries
        const dirPath = path.dirname(filePath);
        this.cacheManager.invalidate(`dir:${dirPath}`);
        this.cacheManager.invalidate(`item:${filePath}`);
        
        // Debounced refresh
        this.debouncedRefresh();
    }

    /**
     * Batch update multiple items
     */
    public async batchUpdate(operations: Array<{ type: 'create' | 'delete' | 'rename'; path: string; newPath?: string }>): Promise<void> {
        const affectedDirs = new Set<string>();
        
        for (const operation of operations) {
            affectedDirs.add(path.dirname(operation.path));
            if (operation.newPath) {
                affectedDirs.add(path.dirname(operation.newPath));
            }
        }
        
        // Invalidate cache for affected directories
        for (const dir of affectedDirs) {
            this.cacheManager.invalidate(`dir:${dir}`);
        }
        
        // Single refresh after all operations
        this.debouncedRefresh();
    }

    // ===== Service Integration Methods =====

    /**
     * Get clipboard manager instance
     */
    public getClipboardManager(): ClipboardManager {
        return this.clipboardManager;
    }

    /**
     * Get file operation service instance
     */
    public getFileOperationService(): FileOperationService {
        return this.fileOperationService;
    }

    /**
     * Get keyboard shortcut handler instance
     */
    public getKeyboardShortcutHandler(): KeyboardShortcutHandler {
        return this.keyboardShortcutHandler;
    }

    /**
     * Get context menu manager instance
     */
    public getContextMenuManager(): ContextMenuManager {
        return this.contextMenuManager;
    }

    /**
     * Register additional commands for this provider
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        const commands = [
            vscode.commands.registerCommand('workspaceExplorer.refresh', () => {
                this.clearCache();
                this.refreshTree();
            }),
            vscode.commands.registerCommand('workspaceExplorer.clearCache', () => {
                this.clearCache();
            }),
            vscode.commands.registerCommand('workspaceExplorer.showCacheStats', () => {
                const stats = this.getCacheStats();
                vscode.window.showInformationMessage(
                    `キャッシュ統計: サイズ ${stats.size}, ヒット率 ${stats.hitRate}%`
                );
            }),
            vscode.commands.registerCommand('workspaceExplorer.preloadAll', async () => {
                if (this.workspaceRoot) {
                    await this.preloadDirectory(this.workspaceRoot);
                    vscode.window.showInformationMessage('ディレクトリの事前読み込みが完了しました');
                }
            })
        ];

        commands.forEach(command => context.subscriptions.push(command));
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        // Dispose display customization listeners
        this.displayDisposables.forEach(d => d.dispose());
        this.displayDisposables = [];
        
        // Dispose file watcher
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        
        // Clear debounce timeout
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        
        // Dispose services
        this.cacheManager.dispose();
        this.clipboardManager.dispose();
        this.fileOperationService.dispose();
        this.keyboardShortcutHandler.dispose();
        this.contextMenuManager.dispose();
        
        // Call parent dispose
        super.dispose();
    }

    /**
     * Update title based on active editor
     */
    public updateTitle(editor?: vscode.TextEditor): void {
        // This method is called from extension.ts but doesn't need implementation
        // as the title is managed by VSCode's tree view
    }

    /**
     * Reveal active file in the explorer
     */
    public async revealActiveFile(editor?: vscode.TextEditor): Promise<void> {
        if (!editor || editor.document.uri.scheme !== 'file') {
            console.log('RevealActiveFile: No valid editor or not a file scheme');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        console.log('RevealActiveFile: Attempting to reveal file:', filePath);
        
        try {
            // Check if file is within workspace
            if (!this.workspaceRoot || !filePath.startsWith(this.workspaceRoot)) {
                console.log('RevealActiveFile: File is not within workspace root');
                return;
            }

            // Load parent directories hierarchically to ensure the file can be found
            await this.loadParentDirectoriesHierarchically(filePath);
            
            // Expand parent folders step by step
            await this.expandParentFoldersStepByStep(filePath);
            
            // Find the item in the tree
            const item = await this.findItemByPath(filePath);
            if (item) {
                console.log('RevealActiveFile: Found item, revealing in tree view:', item.label);
                
                // Use the TreeView to reveal and select the item
                if (this.treeView) {
                    await this.treeView.reveal(item, {
                        select: true,
                        focus: false,
                        expand: true
                    });
                    
                    // Update selection manager
                    this.selectionManager.setSelection([item]);
                    console.log('RevealActiveFile: Successfully revealed and selected file');
                } else {
                    console.warn('RevealActiveFile: TreeView not available');
                }
            } else {
                console.warn('RevealActiveFile: Item not found in tree:', filePath);
            }
        } catch (error) {
            console.error('RevealActiveFile: Error revealing active file:', error);
        }
    }

    /**
     * Find item by file path in the loaded tree
     */
    public async findItemByPath(filePath: string): Promise<EnhancedFileItem | undefined> {
        try {
            console.log('--- Finding item by path ---');
            console.log('Target path:', filePath);
            
            // First, try to find in already loaded items
            const existingItem = this.findInLoadedItems(filePath);
            if (existingItem) {
                console.log('Found existing item:', existingItem.label);
                return existingItem;
            }

            // If not found, load all parent directories hierarchically
            console.log('Item not found in loaded items, loading parent directories...');
            await this.loadParentDirectoriesHierarchically(filePath);
            
            // Try to find again after loading parents
            const foundItem = this.findInLoadedItems(filePath);
            if (foundItem) {
                console.log('Found item after loading parents:', foundItem.label);
                return foundItem;
            }

            // If still not found, try to create the item directly from file system
            console.log('Item still not found, creating directly from file system...');
            try {
                // Check if file exists first
                const fs = await import('fs');
                if (!fs.existsSync(filePath)) {
                    console.warn('File does not exist:', filePath);
                    return undefined;
                }

                const stat = await fs.promises.stat(filePath);
                const fileName = path.basename(filePath);
                
                const item = new EnhancedFileItem(
                    fileName,
                    stat.isDirectory() ? 
                        vscode.TreeItemCollapsibleState.Collapsed : 
                        vscode.TreeItemCollapsibleState.None,
                    filePath,
                    stat.isDirectory(),
                    stat.isFile() ? stat.size : 0,
                    stat.mtime,
                    stat.birthtime
                );
                
                console.log('Created item directly:', item.label);
                return item;
            } catch (createError) {
                console.warn('Failed to create item from path:', createError);
                return undefined;
            }
        } catch (error) {
            console.warn('Error finding item by path:', error);
            return undefined;
        }
    }

    /**
     * Load parent directories hierarchically
     */
    private async loadParentDirectoriesHierarchically(filePath: string): Promise<void> {
        if (!this.workspaceRoot) return;

        try {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            const pathParts = relativePath.split(path.sep);
            
            // Build parent directory paths from root to target
            let currentPath = this.workspaceRoot;
            
            for (let i = 0; i < pathParts.length - 1; i++) {
                currentPath = path.join(currentPath, pathParts[i]);
                await this.loadDirectoryIfNeeded(currentPath);
            }
        } catch (error) {
            console.warn('Failed to load parent directories hierarchically:', error);
        }
    }

    /**
     * Expand parent folders step by step in the TreeView
     */
    private async expandParentFoldersStepByStep(filePath: string): Promise<void> {
        if (!this.workspaceRoot || !this.treeView) return;

        try {
            console.log('Expanding parent folders step by step for:', filePath);
            
            const relativePath = path.relative(this.workspaceRoot, filePath);
            const pathParts = relativePath.split(path.sep);
            
            // Build parent directory paths from root to target
            let currentPath = this.workspaceRoot;
            
            for (let i = 0; i < pathParts.length - 1; i++) {
                currentPath = path.join(currentPath, pathParts[i]);
                
                try {
                    // Use the force expand method for more reliable expansion
                    await this.forceExpandFolder(currentPath);
                } catch (expandError) {
                    console.warn('Failed to expand parent folder:', currentPath, expandError);
                }
            }
            
            console.log('Parent folder expansion completed');
        } catch (error) {
            console.warn('Failed to expand parent folders step by step:', error);
        }
    }

    /**
     * Find item in already loaded items
     */
    private findInLoadedItems(filePath: string): EnhancedFileItem | undefined {
        // Search in all loaded items
        return this.allItems.find(item => item.filePath === filePath);
    }

    /**
     * Load directory if not already loaded
     */
    private async loadDirectoryIfNeeded(dirPath: string): Promise<void> {
        try {
            // Check if directory items are already cached
            const cacheKey = `dir:${dirPath}`;
            const cachedItems = this.cacheManager.get<EnhancedFileItem[]>(cacheKey);
            
            if (!cachedItems) {
                // Load the directory
                await this.getItemsInDirectory(dirPath);
            }
        } catch (error) {
            console.warn('Error loading directory:', error);
        }
    }
}