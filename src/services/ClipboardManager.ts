import * as vscode from 'vscode';
import { IClipboardManager, IEnhancedFileItem, ClipboardData } from '../interfaces/core';
import { EnhancedFileItem } from '../models/EnhancedFileItem';

/**
 * Clipboard manager implementation for file operations
 */
export class ClipboardManager implements IClipboardManager {
    private clipboardData: ClipboardData | null = null;
    private readonly storageKey = 'fileListExtension.clipboard';
    private readonly context: vscode.ExtensionContext;
    private readonly _onClipboardChanged = new vscode.EventEmitter<void>();
    public readonly onClipboardChanged = this._onClipboardChanged.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadClipboardState();
    }

    /**
     * Copy items to clipboard
     */
    async copy(items: IEnhancedFileItem[]): Promise<void> {
        if (!items || items.length === 0) {
            throw new Error('No items provided for copy operation');
        }

        this.validateItems(items);

        this.clipboardData = {
            items: [...items], // Create a copy to avoid reference issues
            operation: 'copy',
            timestamp: new Date(),
            sourceProvider: this.getActiveProvider()
        };

        await this.persistClipboardState();
        await this.updateSystemClipboard();
        this._onClipboardChanged.fire();

        // Show user feedback
        const itemCount = items.length;
        const message = itemCount === 1 
            ? `"${items[0].label}" をクリップボードにコピーしました`
            : `${itemCount} 個のアイテムをクリップボードにコピーしました`;
        
        vscode.window.showInformationMessage(message);
    }

    /**
     * Cut items to clipboard
     */
    async cut(items: IEnhancedFileItem[]): Promise<void> {
        if (!items || items.length === 0) {
            throw new Error('No items provided for cut operation');
        }

        this.validateItems(items);

        this.clipboardData = {
            items: [...items], // Create a copy to avoid reference issues
            operation: 'cut',
            timestamp: new Date(),
            sourceProvider: this.getActiveProvider()
        };

        await this.persistClipboardState();
        await this.updateSystemClipboard();
        this._onClipboardChanged.fire();

        // Show user feedback
        const itemCount = items.length;
        const message = itemCount === 1 
            ? `"${items[0].label}" を切り取りました`
            : `${itemCount} 個のアイテムを切り取りました`;
        
        vscode.window.showInformationMessage(message);
    }

    /**
     * Paste items from clipboard to target path
     */
    async paste(targetPath: string): Promise<IEnhancedFileItem[]> {
        if (!this.canPaste()) {
            throw new Error('No items in clipboard to paste');
        }

        if (!targetPath) {
            throw new Error('Target path is required for paste operation');
        }

        const clipboardData = this.clipboardData!;
        const pastedItems: IEnhancedFileItem[] = [];

        try {
            // Validate target path exists and is a directory
            await this.validateTargetPath(targetPath);

            // Process each item in clipboard
            for (const item of clipboardData.items) {
                const pastedItem = await this.pasteItem(item, targetPath, clipboardData.operation);
                if (pastedItem) {
                    pastedItems.push(pastedItem);
                }
            }

            // Clear clipboard if it was a cut operation
            if (clipboardData.operation === 'cut') {
                this.clearClipboard();
            }

            // Show user feedback
            const itemCount = pastedItems.length;
            const operationText = clipboardData.operation === 'copy' ? 'コピー' : '移動';
            const message = itemCount === 1 
                ? `"${pastedItems[0].label}" を${operationText}しました`
                : `${itemCount} 個のアイテムを${operationText}しました`;
            
            vscode.window.showInformationMessage(message);

            return pastedItems;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`貼り付け操作に失敗しました: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Check if clipboard has items that can be pasted
     */
    canPaste(): boolean {
        return this.clipboardData !== null && 
               this.clipboardData.items.length > 0 &&
               this.isClipboardDataValid();
    }

    /**
     * Get items currently in clipboard
     */
    getClipboardItems(): IEnhancedFileItem[] {
        return this.clipboardData ? [...this.clipboardData.items] : [];
    }

    /**
     * Get current clipboard operation type
     */
    getClipboardOperation(): 'copy' | 'cut' | null {
        return this.clipboardData ? this.clipboardData.operation : null;
    }

    /**
     * Clear clipboard data
     */
    clearClipboard(): void {
        this.clipboardData = null;
        this.persistClipboardState();
        vscode.env.clipboard.writeText(''); // Clear system clipboard
        this._onClipboardChanged.fire();
    }

    /**
     * Clear clipboard contents (alias for clearClipboard)
     */
    clear(): void {
        this.clearClipboard();
    }

    /**
     * Get clipboard data for debugging/testing
     */
    getClipboardData(): ClipboardData | null {
        return this.clipboardData ? { ...this.clipboardData } : null;
    }

    /**
     * Validate items before clipboard operations
     */
    private validateItems(items: IEnhancedFileItem[]): void {
        for (const item of items) {
            if (!item.filePath) {
                throw new Error(`Invalid item: missing file path for "${item.label}"`);
            }
            
            if (!item.label) {
                throw new Error(`Invalid item: missing label for "${item.filePath}"`);
            }
        }
    }

    /**
     * Validate target path for paste operation
     */
    private async validateTargetPath(targetPath: string): Promise<void> {
        const fs = require('fs').promises;
        
        try {
            const stats = await fs.stat(targetPath);
            if (!stats.isDirectory()) {
                throw new Error('Target path must be a directory');
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                throw new Error('Target directory does not exist');
            }
            throw error;
        }
    }

    /**
     * Paste a single item to target path
     */
    private async pasteItem(item: IEnhancedFileItem, targetPath: string, operation: 'copy' | 'cut'): Promise<IEnhancedFileItem | null> {
        const path = require('path');
        const fs = require('fs').promises;
        
        const sourcePath = item.filePath;
        const fileName = path.basename(sourcePath);
        const destinationPath = path.join(targetPath, fileName);

        try {
            // Check if source still exists (important for cut operations)
            await fs.access(sourcePath);

            // Check if destination already exists
            try {
                await fs.access(destinationPath);
                
                // Ask user what to do with existing file
                const action = await this.handleExistingFile(fileName);
                if (action === 'skip') {
                    return null;
                } else if (action === 'rename') {
                    // Generate unique name
                    const uniquePath = await this.generateUniquePath(destinationPath);
                    return await this.performFileOperation(sourcePath, uniquePath, operation);
                }
                // If action is 'overwrite', continue with original destination
            } catch {
                // Destination doesn't exist, proceed normally
            }

            return await this.performFileOperation(sourcePath, destinationPath, operation);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`"${fileName}" の${operation === 'copy' ? 'コピー' : '移動'}に失敗しました: ${errorMessage}`);
            return null;
        }
    }

    /**
     * Perform the actual file operation (copy or move)
     */
    private async performFileOperation(sourcePath: string, destinationPath: string, operation: 'copy' | 'cut'): Promise<IEnhancedFileItem> {
        const fs = require('fs').promises;
        const pathModule = require('path');
        
        if (operation === 'copy') {
            await this.copyFileOrDirectory(sourcePath, destinationPath);
        } else {
            await fs.rename(sourcePath, destinationPath);
        }

        // Create and return new EnhancedFileItem for the destination
        const stats = await fs.stat(destinationPath);
        const fileName = pathModule.basename(destinationPath);
        
        return {
            label: fileName,
            filePath: destinationPath,
            isDirectory: stats.isDirectory(),
            size: stats.isFile() ? stats.size : 0,
            modified: stats.mtime,
            created: stats.birthtime,
            id: destinationPath
        } as IEnhancedFileItem;
    }

    /**
     * Copy file or directory recursively
     */
    private async copyFileOrDirectory(sourcePath: string, destinationPath: string): Promise<void> {
        const fs = require('fs').promises;
        const path = require('path');
        
        const stats = await fs.stat(sourcePath);
        
        if (stats.isDirectory()) {
            // Create destination directory
            await fs.mkdir(destinationPath, { recursive: true });
            
            // Copy all contents
            const entries = await fs.readdir(sourcePath);
            for (const entry of entries) {
                const srcPath = path.join(sourcePath, entry);
                const destPath = path.join(destinationPath, entry);
                await this.copyFileOrDirectory(srcPath, destPath);
            }
        } else {
            // Copy file
            await fs.copyFile(sourcePath, destinationPath);
        }
    }

    /**
     * Handle existing file conflict
     */
    private async handleExistingFile(fileName: string): Promise<'overwrite' | 'rename' | 'skip'> {
        const options = [
            { title: '上書き', action: 'overwrite' },
            { title: '名前を変更', action: 'rename' },
            { title: 'スキップ', action: 'skip' }
        ];

        const result = await vscode.window.showWarningMessage(
            `"${fileName}" は既に存在します。どうしますか？`,
            ...options
        );

        return result ? result.action as 'overwrite' | 'rename' | 'skip' : 'skip';
    }

    /**
     * Generate unique file path by adding number suffix
     */
    private async generateUniquePath(originalPath: string): Promise<string> {
        const path = require('path');
        const fs = require('fs').promises;
        
        const dir = path.dirname(originalPath);
        const ext = path.extname(originalPath);
        const baseName = path.basename(originalPath, ext);
        
        let counter = 1;
        let uniquePath = originalPath;
        
        while (true) {
            try {
                await fs.access(uniquePath);
                // File exists, try next number
                uniquePath = path.join(dir, `${baseName} (${counter})${ext}`);
                counter++;
            } catch {
                // File doesn't exist, we found a unique path
                break;
            }
        }
        
        return uniquePath;
    }

    /**
     * Update system clipboard with file paths and metadata
     */
    private async updateSystemClipboard(): Promise<void> {
        if (!this.clipboardData) {
            return;
        }

        // Create structured data for system clipboard
        const clipboardContent = this.createSystemClipboardContent(this.clipboardData);
        
        // Write both text and structured data to system clipboard
        await vscode.env.clipboard.writeText(clipboardContent.text);
        
        // Store structured data in a way that can be retrieved later
        // This allows cross-session clipboard functionality
        await this.storeSystemClipboardMetadata(clipboardContent.metadata);
    }

    /**
     * Create system clipboard content with both text and metadata
     */
    private createSystemClipboardContent(clipboardData: ClipboardData): { text: string; metadata: any } {
        // Create human-readable text representation
        const operation = clipboardData.operation === 'copy' ? 'コピー' : '切り取り';
        const itemCount = clipboardData.items.length;
        const itemText = itemCount === 1 ? 'アイテム' : 'アイテム';
        
        let text = `VSCode File List Extension - ${operation} (${itemCount} ${itemText})\n`;
        text += `タイムスタンプ: ${clipboardData.timestamp.toLocaleString('ja-JP')}\n\n`;
        
        // Add file paths
        clipboardData.items.forEach((item, index) => {
            const type = item.isDirectory ? '[フォルダ]' : '[ファイル]';
            text += `${index + 1}. ${type} ${item.filePath}\n`;
        });
        
        // Create metadata for structured access
        const metadata = {
            source: 'vscode-file-list-extension',
            version: '1.0',
            operation: clipboardData.operation,
            timestamp: clipboardData.timestamp.toISOString(),
            items: clipboardData.items.map(item => ({
                label: item.label,
                filePath: item.filePath,
                isDirectory: item.isDirectory,
                size: item.size,
                modified: item.modified.toISOString(),
                id: item.id
            }))
        };
        
        return { text, metadata };
    }

    /**
     * Store system clipboard metadata for cross-session access
     */
    private async storeSystemClipboardMetadata(metadata: any): Promise<void> {
        try {
            const metadataKey = 'fileListExtension.systemClipboard';
            await this.context.globalState.update(metadataKey, metadata);
        } catch (error) {
            // Log error but don't throw - system clipboard should still work with text
            console.error('Failed to store system clipboard metadata:', error);
        }
    }

    /**
     * Check if system clipboard contains file list extension data
     */
    async hasSystemClipboardData(): Promise<boolean> {
        try {
            const clipboardText = await vscode.env.clipboard.readText();
            return clipboardText.includes('VSCode File List Extension');
        } catch {
            return false;
        }
    }

    /**
     * Import data from system clipboard
     */
    async importFromSystemClipboard(): Promise<boolean> {
        try {
            const clipboardText = await vscode.env.clipboard.readText();
            
            // Check if it's our format
            if (!clipboardText.includes('VSCode File List Extension')) {
                // Try to parse as file paths
                return await this.importFilePathsFromClipboard(clipboardText);
            }
            
            // Try to restore from metadata
            const metadataKey = 'fileListExtension.systemClipboard';
            const metadata = this.context.globalState.get<any>(metadataKey);
            
            if (metadata && this.isValidMetadata(metadata)) {
                return await this.restoreFromMetadata(metadata);
            }
            
            return false;
        } catch (error) {
            console.error('Failed to import from system clipboard:', error);
            return false;
        }
    }

    /**
     * Import file paths from clipboard text
     */
    private async importFilePathsFromClipboard(clipboardText: string): Promise<boolean> {
        const lines = clipboardText.split('\n').filter(line => line.trim());
        const validPaths: string[] = [];
        
        // Validate each line as a potential file path
        for (const line of lines) {
            const trimmedPath = line.trim();
            if (await this.isValidFilePath(trimmedPath)) {
                validPaths.push(trimmedPath);
            }
        }
        
        if (validPaths.length === 0) {
            return false;
        }
        
        // Create file items from valid paths
        const items: IEnhancedFileItem[] = [];
        for (const filePath of validPaths) {
            try {
                const item = await this.createFileItemFromPath(filePath);
                items.push(item);
            } catch {
                // Skip invalid paths
            }
        }
        
        if (items.length > 0) {
            // Import as copy operation by default
            this.clipboardData = {
                items,
                operation: 'copy',
                timestamp: new Date(),
                sourceProvider: 'system-clipboard'
            };
            
            await this.persistClipboardState();
            return true;
        }
        
        return false;
    }

    /**
     * Restore clipboard data from metadata
     */
    private async restoreFromMetadata(metadata: any): Promise<boolean> {
        try {
            const items: IEnhancedFileItem[] = [];
            
            for (const itemData of metadata.items) {
                // Verify file still exists
                if (await this.isValidFilePath(itemData.filePath)) {
                    const item: IEnhancedFileItem = {
                        label: itemData.label,
                        filePath: itemData.filePath,
                        isDirectory: itemData.isDirectory,
                        size: itemData.size,
                        modified: new Date(itemData.modified),
                        id: itemData.id
                    };
                    items.push(item);
                }
            }
            
            if (items.length > 0) {
                this.clipboardData = {
                    items,
                    operation: metadata.operation,
                    timestamp: new Date(metadata.timestamp),
                    sourceProvider: 'system-clipboard-restore'
                };
                
                await this.persistClipboardState();
                return true;
            }
        } catch (error) {
            console.error('Failed to restore from metadata:', error);
        }
        
        return false;
    }

    /**
     * Check if a file path is valid and accessible
     */
    private async isValidFilePath(filePath: string): Promise<boolean> {
        try {
            const fs = require('fs').promises;
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create file item from file path
     */
    private async createFileItemFromPath(filePath: string): Promise<IEnhancedFileItem> {
        const fs = require('fs').promises;
        const pathModule = require('path');
        
        const stats = await fs.stat(filePath);
        const fileName = pathModule.basename(filePath);
        
        return {
            label: fileName,
            filePath: filePath,
            isDirectory: stats.isDirectory(),
            size: stats.isFile() ? stats.size : 0,
            modified: stats.mtime,
            created: stats.birthtime,
            id: filePath
        } as IEnhancedFileItem;
    }

    /**
     * Validate metadata structure
     */
    private isValidMetadata(metadata: any): boolean {
        return metadata &&
               metadata.source === 'vscode-file-list-extension' &&
               metadata.version === '1.0' &&
               Array.isArray(metadata.items) &&
               (metadata.operation === 'copy' || metadata.operation === 'cut') &&
               typeof metadata.timestamp === 'string';
    }

    /**
     * Export current clipboard data to system clipboard
     */
    async exportToSystemClipboard(): Promise<void> {
        if (!this.clipboardData) {
            throw new Error('No clipboard data to export');
        }
        
        await this.updateSystemClipboard();
        
        vscode.window.showInformationMessage(
            `クリップボードデータをシステムクリップボードにエクスポートしました (${this.clipboardData.items.length} アイテム)`
        );
    }

    /**
     * Clear system clipboard data
     */
    async clearSystemClipboard(): Promise<void> {
        try {
            await vscode.env.clipboard.writeText('');
            
            // Clear metadata
            const metadataKey = 'fileListExtension.systemClipboard';
            await this.context.globalState.update(metadataKey, undefined);
            
        } catch (error) {
            console.error('Failed to clear system clipboard:', error);
        }
    }

    /**
     * Get currently active provider name
     */
    private getActiveProvider(): string {
        // This would need to be implemented based on how providers are managed
        // For now, return a default value
        return 'unknown';
    }

    /**
     * Check if clipboard data is still valid
     */
    private isClipboardDataValid(): boolean {
        if (!this.clipboardData) {
            return false;
        }

        // Check if clipboard data is not too old (e.g., 1 hour)
        const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds
        const age = Date.now() - this.clipboardData.timestamp.getTime();
        
        if (age > maxAge) {
            return false;
        }

        // Additional validation could be added here
        // e.g., check if source files still exist for cut operations
        
        return true;
    }

    /**
     * Load clipboard state from extension storage
     */
    private loadClipboardState(): void {
        try {
            const stored = this.context.globalState.get<ClipboardData>(this.storageKey);
            if (stored && this.isStoredDataValid(stored)) {
                this.clipboardData = stored;
            }
        } catch (error) {
            // If loading fails, start with empty clipboard
            this.clipboardData = null;
        }
    }

    /**
     * Persist clipboard state to extension storage
     */
    private async persistClipboardState(): Promise<void> {
        try {
            await this.context.globalState.update(this.storageKey, this.clipboardData);
        } catch (error) {
            // Log error but don't throw - clipboard should still work in memory
            console.error('Failed to persist clipboard state:', error);
        }
    }

    /**
     * Validate stored clipboard data
     */
    private isStoredDataValid(data: any): data is ClipboardData {
        return data &&
               typeof data === 'object' &&
               Array.isArray(data.items) &&
               (data.operation === 'copy' || data.operation === 'cut') &&
               data.timestamp instanceof Date &&
               typeof data.sourceProvider === 'string';
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Clean up any resources if needed
        this.clipboardData = null;
    }
}