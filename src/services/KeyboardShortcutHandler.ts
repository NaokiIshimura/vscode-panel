import * as vscode from 'vscode';
import { IEnhancedFileItem } from '../interfaces/core';
import { ClipboardManager } from './ClipboardManager';
import { FileOperationService } from './FileOperationService';
import { MultiSelectionManager } from './MultiSelectionManager';

/**
 * Keyboard shortcut configuration interface
 */
export interface KeyboardShortcutConfig {
    copy: string;
    cut: string;
    paste: string;
    delete: string;
    rename: string;
    selectAll: string;
    newFile: string;
    newFolder: string;
    refresh: string;
}

/**
 * Default keyboard shortcuts matching VSCode standard explorer
 */
export const DEFAULT_SHORTCUTS: KeyboardShortcutConfig = {
    copy: 'ctrl+c',
    cut: 'ctrl+x',
    paste: 'ctrl+v',
    delete: 'delete',
    rename: 'f2',
    selectAll: 'ctrl+a',
    newFile: 'ctrl+alt+n',
    newFolder: 'ctrl+shift+n',
    refresh: 'f5'
};

/**
 * Context information for keyboard shortcuts
 */
export interface ShortcutContext {
    activeProvider?: string;
    selectedItems: IEnhancedFileItem[];
    currentPath?: string;
    canPaste: boolean;
}

/**
 * Keyboard shortcut handler for file operations
 */
export class KeyboardShortcutHandler {
    private static globalCommandsRegistered = false; // すべてのインスタンスで共有
    private readonly context: vscode.ExtensionContext;
    private readonly clipboardManager: ClipboardManager;
    private readonly fileOperationService: FileOperationService;
    private readonly multiSelectionManager: MultiSelectionManager;
    private readonly disposables: vscode.Disposable[] = [];
    private shortcuts: KeyboardShortcutConfig;
    private isEnabled: boolean = true;
    private currentContext: any = {};
    private commandsRegistered: boolean = false; // インスタンス内フラグ（後方互換）

    constructor(
        context: vscode.ExtensionContext,
        clipboardManager: ClipboardManager,
        fileOperationService: FileOperationService,
        multiSelectionManager: MultiSelectionManager
    ) {
        this.context = context;
        this.clipboardManager = clipboardManager;
        this.fileOperationService = fileOperationService;
        this.multiSelectionManager = multiSelectionManager;

        // Load shortcuts from configuration
        this.shortcuts = this.loadShortcutConfiguration();

        // Register keyboard shortcuts (初回のみ)
        if (!KeyboardShortcutHandler.globalCommandsRegistered) {
            this.registerKeyboardShortcuts();
            this.commandsRegistered = true;
            KeyboardShortcutHandler.globalCommandsRegistered = true;
        }

        // Listen for configuration changes
        this.setupConfigurationListener();
    }

    /**
     * Register shortcuts - public method for external use
     */
    public registerShortcuts(): void {
        // 既に登録済みの場合はスキップ
    if (this.commandsRegistered || KeyboardShortcutHandler.globalCommandsRegistered) {
            return;
        }
        this.registerKeyboardShortcuts();
        this.commandsRegistered = true;
    KeyboardShortcutHandler.globalCommandsRegistered = true;
    }

    /**
     * Initialize keyboard shortcuts
     */
    public initialize(): void {
        // 既に登録済みの場合はスキップ
    if (this.commandsRegistered || KeyboardShortcutHandler.globalCommandsRegistered) {
            return;
        }
        this.registerKeyboardShortcuts();
        this.commandsRegistered = true;
    KeyboardShortcutHandler.globalCommandsRegistered = true;
    }

    /**
     * Update context for keyboard shortcuts
     */
    public updateContext(context: any): void {
        // Update the current context for keyboard shortcuts
        this.currentContext = context;
    }

    /**
     * Register all keyboard shortcuts with VSCode
     */
    private registerKeyboardShortcuts(): void {
        // Copy shortcut (Ctrl+C / Cmd+C)
        const copyCommand = vscode.commands.registerCommand('fileListExtension.keyboard.copy', async () => {
            await this.handleCopyShortcut();
        });

        // Cut shortcut (Ctrl+X / Cmd+X)
        const cutCommand = vscode.commands.registerCommand('fileListExtension.keyboard.cut', async () => {
            await this.handleCutShortcut();
        });

        // Paste shortcut (Ctrl+V / Cmd+V)
        const pasteCommand = vscode.commands.registerCommand('fileListExtension.keyboard.paste', async () => {
            await this.handlePasteShortcut();
        });

        // Delete shortcut (Delete key)
        const deleteCommand = vscode.commands.registerCommand('fileListExtension.keyboard.delete', async () => {
            await this.handleDeleteShortcut();
        });

        // Rename shortcut (F2)
        const renameCommand = vscode.commands.registerCommand('fileListExtension.keyboard.rename', async () => {
            await this.handleRenameShortcut();
        });

        // Select All shortcut (Ctrl+A / Cmd+A)
        const selectAllCommand = vscode.commands.registerCommand('fileListExtension.keyboard.selectAll', async () => {
            await this.handleSelectAllShortcut();
        });

        // New File shortcut (Ctrl+Alt+N)
        const newFileCommand = vscode.commands.registerCommand('fileListExtension.keyboard.newFile', async () => {
            await this.handleNewFileShortcut();
        });

        // New Folder shortcut (Ctrl+Shift+N)
        const newFolderCommand = vscode.commands.registerCommand('fileListExtension.keyboard.newFolder', async () => {
            await this.handleNewFolderShortcut();
        });

        // Refresh shortcut (F5)
        const refreshCommand = vscode.commands.registerCommand('fileListExtension.keyboard.refresh', async () => {
            await this.handleRefreshShortcut();
        });

        // Add all commands to disposables
        this.disposables.push(
            copyCommand,
            cutCommand,
            pasteCommand,
            deleteCommand,
            renameCommand,
            selectAllCommand,
            newFileCommand,
            newFolderCommand,
            refreshCommand
        );

        // Register commands with context
        this.context.subscriptions.push(...this.disposables);
    }

    /**
     * Handle copy keyboard shortcut
     */
    private async handleCopyShortcut(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const context = this.getCurrentContext();

            if (context.selectedItems.length === 0) {
                vscode.window.showInformationMessage('コピーするアイテムが選択されていません');
                return;
            }

            await this.clipboardManager.copy(context.selectedItems);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`コピー操作に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle cut keyboard shortcut
     */
    private async handleCutShortcut(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const context = this.getCurrentContext();

            if (context.selectedItems.length === 0) {
                vscode.window.showInformationMessage('切り取るアイテムが選択されていません');
                return;
            }

            await this.clipboardManager.cut(context.selectedItems);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`切り取り操作に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle paste keyboard shortcut
     */
    private async handlePasteShortcut(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const context = this.getCurrentContext();

            if (!context.canPaste) {
                vscode.window.showInformationMessage('貼り付けるアイテムがクリップボードにありません');
                return;
            }

            if (!context.currentPath) {
                vscode.window.showErrorMessage('貼り付け先のフォルダが選択されていません');
                return;
            }

            await this.clipboardManager.paste(context.currentPath);

            // Refresh the current view
            await this.refreshCurrentView();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`貼り付け操作に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle delete keyboard shortcut
     */
    private async handleDeleteShortcut(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const context = this.getCurrentContext();

            if (context.selectedItems.length === 0) {
                vscode.window.showInformationMessage('削除するアイテムが選択されていません');
                return;
            }

            // Show confirmation dialog
            const itemCount = context.selectedItems.length;
            const itemText = itemCount === 1 ? 'アイテム' : 'アイテム';
            const itemNames = context.selectedItems.length <= 3
                ? context.selectedItems.map(item => `"${item.label}"`).join(', ')
                : `${context.selectedItems.length} 個のアイテム`;

            const confirmation = await vscode.window.showWarningMessage(
                `${itemNames} を削除してもよろしいですか？\nこの操作は元に戻せません。`,
                { modal: true },
                'はい',
                'いいえ'
            );

            if (confirmation !== 'はい') {
                return;
            }

            // Delete selected items
            const filePaths = context.selectedItems.map(item => item.filePath);
            await this.fileOperationService.deleteFiles(filePaths);

            // Clear selection and refresh view
            this.multiSelectionManager.clearSelection();
            await this.refreshCurrentView();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`削除操作に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle rename keyboard shortcut
     */
    private async handleRenameShortcut(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const context = this.getCurrentContext();

            if (context.selectedItems.length === 0) {
                vscode.window.showInformationMessage('名前を変更するアイテムが選択されていません');
                return;
            }

            if (context.selectedItems.length > 1) {
                vscode.window.showInformationMessage('名前の変更は一度に1つのアイテムのみ可能です');
                return;
            }

            const item = context.selectedItems[0];
            const oldName = item.label;
            const oldPath = item.filePath;
            const parentDir = require('path').dirname(oldPath);

            // Show input dialog for new name
            const newName = await vscode.window.showInputBox({
                prompt: '新しい名前を入力してください',
                value: oldName,
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return '名前を入力してください';
                    }

                    // Validate file name
                    const validation = this.fileOperationService.validateFileName(value);
                    if (!validation.isValid) {
                        return validation.errorMessage || '無効な名前です';
                    }

                    if (value === oldName) {
                        return '同じ名前です';
                    }

                    return null;
                }
            });

            if (!newName) {
                return;
            }

            const newPath = require('path').join(parentDir, newName);
            await this.fileOperationService.renameFile(oldPath, newPath);

            // Refresh view
            await this.refreshCurrentView();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`名前の変更に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle select all keyboard shortcut
     */
    private async handleSelectAllShortcut(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            // This would need to be implemented based on the active provider
            // For now, we'll trigger a command that the providers can handle
            await vscode.commands.executeCommand('fileListExtension.selectAll');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`全選択操作に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle new file keyboard shortcut
     */
    private async handleNewFileShortcut(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const context = this.getCurrentContext();

            if (!context.currentPath) {
                vscode.window.showErrorMessage('ファイルを作成するフォルダが選択されていません');
                return;
            }

            // Show input dialog for file name
            const fileName = await vscode.window.showInputBox({
                prompt: 'ファイル名を入力してください',
                placeHolder: 'example.txt',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'ファイル名を入力してください';
                    }

                    const validation = this.fileOperationService.validateFileName(value);
                    if (!validation.isValid) {
                        return validation.errorMessage || '無効なファイル名です';
                    }

                    return null;
                }
            });

            if (!fileName) {
                return;
            }

            const filePath = require('path').join(context.currentPath, fileName);
            await this.fileOperationService.createFile(filePath, '');

            // Open the created file
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);

            // Refresh view
            await this.refreshCurrentView();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`ファイル作成に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle new folder keyboard shortcut
     */
    private async handleNewFolderShortcut(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const context = this.getCurrentContext();

            if (!context.currentPath) {
                vscode.window.showErrorMessage('フォルダを作成するディレクトリが選択されていません');
                return;
            }

            // Show input dialog for folder name
            const folderName = await vscode.window.showInputBox({
                prompt: 'フォルダ名を入力してください',
                placeHolder: 'new-folder',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'フォルダ名を入力してください';
                    }

                    const validation = this.fileOperationService.validateFileName(value);
                    if (!validation.isValid) {
                        return validation.errorMessage || '無効なフォルダ名です';
                    }

                    return null;
                }
            });

            if (!folderName) {
                return;
            }

            const folderPath = require('path').join(context.currentPath, folderName);
            await this.fileOperationService.createDirectory(folderPath);

            // Refresh view
            await this.refreshCurrentView();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`フォルダ作成に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle refresh keyboard shortcut
     */
    private async handleRefreshShortcut(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            await this.refreshCurrentView();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`更新操作に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Get current context for keyboard shortcuts
     */
    private getCurrentContext(): ShortcutContext {
        return {
            activeProvider: this.getActiveProvider(),
            selectedItems: this.multiSelectionManager.getSelection(),
            currentPath: this.getCurrentPath(),
            canPaste: this.clipboardManager.canPaste()
        };
    }

    /**
     * Get currently active provider name
     */
    private getActiveProvider(): string {
        // This would need to be implemented based on which view is currently focused
        // For now, return a default value
        return 'fileListDetails';
    }

    /**
     * Get current path from active provider
     */
    private getCurrentPath(): string | undefined {
        // This would need to be implemented to get the current path from the active provider
        // For now, we'll try to get it from workspace
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        return undefined;
    }

    /**
     * Refresh the current view
     */
    private async refreshCurrentView(): Promise<void> {
        // Trigger refresh commands for all providers
        await vscode.commands.executeCommand('fileList.refresh');
    }

    /**
     * Load keyboard shortcut configuration from settings
     */
    private loadShortcutConfiguration(): KeyboardShortcutConfig {
        const config = vscode.workspace.getConfiguration('fileListExtension.keyboard');

        return {
            copy: config.get<string>('copy') || DEFAULT_SHORTCUTS.copy,
            cut: config.get<string>('cut') || DEFAULT_SHORTCUTS.cut,
            paste: config.get<string>('paste') || DEFAULT_SHORTCUTS.paste,
            delete: config.get<string>('delete') || DEFAULT_SHORTCUTS.delete,
            rename: config.get<string>('rename') || DEFAULT_SHORTCUTS.rename,
            selectAll: config.get<string>('selectAll') || DEFAULT_SHORTCUTS.selectAll,
            newFile: config.get<string>('newFile') || DEFAULT_SHORTCUTS.newFile,
            newFolder: config.get<string>('newFolder') || DEFAULT_SHORTCUTS.newFolder,
            refresh: config.get<string>('refresh') || DEFAULT_SHORTCUTS.refresh
        };
    }

    /**
     * Setup configuration change listener
     */
    private setupConfigurationListener(): void {
        const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('fileListExtension.keyboard')) {
                this.shortcuts = this.loadShortcutConfiguration();
                // Note: In a real implementation, we might need to re-register shortcuts
                // if the key bindings themselves change
            }
        });

        this.disposables.push(configListener);
    }

    /**
     * Enable keyboard shortcuts
     */
    public enable(): void {
        this.isEnabled = true;
    }

    /**
     * Disable keyboard shortcuts
     */
    public disable(): void {
        this.isEnabled = false;
    }

    /**
     * Check if keyboard shortcuts are enabled
     */
    public isShortcutsEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Get current shortcut configuration
     */
    getShortcutConfiguration(): KeyboardShortcutConfig {
        return { ...this.shortcuts };
    }

    /**
     * Update shortcut configuration
     */
    async updateShortcutConfiguration(newConfig: Partial<KeyboardShortcutConfig>): Promise<void> {
        const config = vscode.workspace.getConfiguration('fileListExtension.keyboard');

        for (const [key, value] of Object.entries(newConfig)) {
            if (value !== undefined) {
                await config.update(key, value, vscode.ConfigurationTarget.Workspace);
            }
        }

        // Reload configuration
        this.shortcuts = this.loadShortcutConfiguration();
    }

    /**
     * Reset shortcuts to default values
     */
    async resetToDefaults(): Promise<void> {
        await this.updateShortcutConfiguration(DEFAULT_SHORTCUTS);
    }



    /**
     * Dispose of resources
     */
    dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables.length = 0;
    this.commandsRegistered = false; // インスタンスフラグリセット
    KeyboardShortcutHandler.globalCommandsRegistered = false; // グローバルフラグリセット
    }
}