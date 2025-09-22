import * as vscode from 'vscode';
import { IContextMenuManager, IEnhancedFileItem, ContextMenuItem } from '../interfaces/core';
import { ClipboardManager } from './ClipboardManager';
import { FileOperationService } from './FileOperationService';
import { MultiSelectionManager } from './MultiSelectionManager';
import { PermissionDetector } from '../utils/PermissionDetector';

/**
 * Context menu manager for enhanced file operations
 */
export class ContextMenuManager implements IContextMenuManager {
    private readonly clipboardManager: ClipboardManager;
    private readonly fileOperationService: FileOperationService;
    private readonly multiSelectionManager: MultiSelectionManager;
    private readonly context: vscode.ExtensionContext;

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
    }

    /**
     * Register context menu commands and contributions
     */
    registerContextMenus(): void {
        // Register context menu commands
        const commands = [
            vscode.commands.registerCommand('fileListExtension.contextMenu.copy', this.handleCopy.bind(this)),
            vscode.commands.registerCommand('fileListExtension.contextMenu.cut', this.handleCut.bind(this)),
            vscode.commands.registerCommand('fileListExtension.contextMenu.paste', this.handlePaste.bind(this)),
            vscode.commands.registerCommand('fileListExtension.contextMenu.delete', this.handleDelete.bind(this)),
            vscode.commands.registerCommand('fileListExtension.contextMenu.rename', this.handleRename.bind(this)),
            vscode.commands.registerCommand('fileListExtension.contextMenu.newFile', this.handleNewFile.bind(this)),
            vscode.commands.registerCommand('fileListExtension.contextMenu.newFolder', this.handleNewFolder.bind(this)),
            vscode.commands.registerCommand('fileListExtension.contextMenu.refresh', this.handleRefresh.bind(this)),
            vscode.commands.registerCommand('fileListExtension.contextMenu.reveal', this.handleReveal.bind(this)),
            vscode.commands.registerCommand('fileListExtension.contextMenu.copyPath', this.handleCopyPath.bind(this))
        ];

        // Add commands to context subscriptions for proper disposal
        commands.forEach(command => this.context.subscriptions.push(command));
    }

    /**
     * Show context menu for the given item
     */
    async showContextMenu(item: IEnhancedFileItem, position: vscode.Position): Promise<void> {
        const menuItems = this.getMenuItems(item);
        
        if (menuItems.length === 0) {
            return;
        }

        // Create quick pick items from menu items
        const quickPickItems: vscode.QuickPickItem[] = menuItems
            .filter(menuItem => menuItem.enabled)
            .map(menuItem => ({
                label: menuItem.label,
                description: menuItem.id,
                detail: this.getMenuItemDetail(menuItem)
            }));

        if (quickPickItems.length === 0) {
            vscode.window.showInformationMessage('利用可能なアクションがありません');
            return;
        }

        // Show quick pick menu
        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: `"${item.label}" のアクションを選択してください`,
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selected) {
            // Find and execute the corresponding menu item action
            const menuItem = menuItems.find(m => m.id === selected.description);
            if (menuItem) {
                try {
                    await menuItem.action();
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                    vscode.window.showErrorMessage(`アクションの実行に失敗しました: ${errorMessage}`);
                }
            }
        }
    }

    /**
     * Get context menu items for the given file item
     */
    getMenuItems(item: IEnhancedFileItem): ContextMenuItem[] {
        const selectedItems = this.multiSelectionManager.getSelection();
        const isMultipleSelection = selectedItems.length > 1;
        const canPaste = this.clipboardManager.canPaste();
        
        const menuItems: ContextMenuItem[] = [];

        // Copy action
        menuItems.push({
            id: 'copy',
            label: isMultipleSelection ? `${selectedItems.length} 個のアイテムをコピー` : 'コピー',
            icon: '$(copy)',
            enabled: true,
            action: () => this.handleCopy()
        });

        // Cut action
        const canCut = this.canPerformOperationOnSelection('cut', selectedItems);
        menuItems.push({
            id: 'cut',
            label: isMultipleSelection ? `${selectedItems.length} 個のアイテムを切り取り` : '切り取り',
            icon: '$(scissors)',
            enabled: canCut,
            action: () => this.handleCut()
        });

        // Paste action (only for directories or when no specific item is selected)
        if (item.isDirectory || !item.filePath) {
            menuItems.push({
                id: 'paste',
                label: '貼り付け',
                icon: '$(clippy)',
                enabled: canPaste,
                action: () => this.handlePaste()
            });
        }

        // Separator
        menuItems.push({
            id: 'separator1',
            label: '---',
            icon: '',
            enabled: false,
            action: async () => {}
        });

        // Delete action
        const canDelete = this.canPerformOperationOnSelection('delete', selectedItems);
        menuItems.push({
            id: 'delete',
            label: isMultipleSelection ? `${selectedItems.length} 個のアイテムを削除` : '削除',
            icon: '$(trash)',
            enabled: canDelete,
            action: () => this.handleDelete()
        });

        // Rename action (only for single selection)
        if (!isMultipleSelection) {
            const canRename = item.permissions ? PermissionDetector.isOperationAllowed(item.permissions, 'rename') : true;
            menuItems.push({
                id: 'rename',
                label: '名前の変更',
                icon: '$(edit)',
                enabled: canRename,
                action: () => this.handleRename()
            });
        }

        // Separator
        menuItems.push({
            id: 'separator2',
            label: '---',
            icon: '',
            enabled: false,
            action: async () => {}
        });

        // New File action (only for directories)
        if (item.isDirectory) {
            const canCreate = item.permissions ? PermissionDetector.isOperationAllowed(item.permissions, 'create') : true;
            menuItems.push({
                id: 'newFile',
                label: '新しいファイル',
                icon: '$(new-file)',
                enabled: canCreate,
                action: () => this.handleNewFile()
            });

            menuItems.push({
                id: 'newFolder',
                label: '新しいフォルダ',
                icon: '$(new-folder)',
                enabled: canCreate,
                action: () => this.handleNewFolder()
            });
        }

        // Separator
        menuItems.push({
            id: 'separator3',
            label: '---',
            icon: '',
            enabled: false,
            action: async () => {}
        });

        // Reveal in Explorer action
        menuItems.push({
            id: 'reveal',
            label: 'エクスプローラーで表示',
            icon: '$(folder-opened)',
            enabled: true,
            action: () => this.handleReveal()
        });

        // Copy Path action
        menuItems.push({
            id: 'copyPath',
            label: 'パスをコピー',
            icon: '$(copy)',
            enabled: true,
            action: () => this.handleCopyPath()
        });

        // Refresh action (for directories)
        if (item.isDirectory) {
            menuItems.push({
                id: 'refresh',
                label: '更新',
                icon: '$(refresh)',
                enabled: true,
                action: () => this.handleRefresh()
            });
        }

        return menuItems.filter(item => item.label !== '---' || item.enabled !== false);
    }

    /**
     * Get detail text for menu item
     */
    private getMenuItemDetail(menuItem: ContextMenuItem): string {
        switch (menuItem.id) {
            case 'copy':
                return 'Ctrl+C';
            case 'cut':
                return 'Ctrl+X';
            case 'paste':
                return 'Ctrl+V';
            case 'delete':
                return 'Delete';
            case 'rename':
                return 'F2';
            case 'refresh':
                return 'F5';
            default:
                return '';
        }
    }

    /**
     * Check if operation can be performed on selected items
     */
    private canPerformOperationOnSelection(operation: 'copy' | 'cut' | 'delete' | 'rename', selectedItems: IEnhancedFileItem[]): boolean {
        if (selectedItems.length === 0) {
            return false;
        }

        // Check if all selected items allow the operation
        return selectedItems.every(item => {
            if (!item.permissions) {
                return true; // If no permission info, assume allowed
            }
            return PermissionDetector.isOperationAllowed(item.permissions, operation);
        });
    }

    /**
     * Handle copy action
     */
    private async handleCopy(): Promise<void> {
        try {
            const selectedItems = this.multiSelectionManager.getSelection();
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage('コピーするアイテムが選択されていません');
                return;
            }

            await this.clipboardManager.copy(selectedItems);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`コピーに失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle cut action
     */
    private async handleCut(): Promise<void> {
        try {
            const selectedItems = this.multiSelectionManager.getSelection();
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage('切り取るアイテムが選択されていません');
                return;
            }

            // Check if any selected items cannot be cut
            const nonCuttableItems = selectedItems.filter(item => 
                item.permissions && !PermissionDetector.isOperationAllowed(item.permissions, 'cut')
            );
            if (nonCuttableItems.length > 0) {
                const itemNames = nonCuttableItems.map(item => item.label).join(', ');
                const permissionDetails = nonCuttableItems.map(item => 
                    item.permissions ? PermissionDetector.getLocalizedPermissionDescription(item.permissions) : ''
                ).join(', ');
                vscode.window.showErrorMessage(`以下のアイテムは切り取れません: ${itemNames} (${permissionDetails})`);
                return;
            }

            await this.clipboardManager.cut(selectedItems);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`切り取りに失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle paste action
     */
    private async handlePaste(): Promise<void> {
        try {
            if (!this.clipboardManager.canPaste()) {
                vscode.window.showWarningMessage('クリップボードに貼り付け可能なアイテムがありません');
                return;
            }

            // Get target directory
            const selectedItems = this.multiSelectionManager.getSelection();
            let targetPath: string;

            if (selectedItems.length === 1 && selectedItems[0].isDirectory) {
                targetPath = selectedItems[0].filePath;
            } else {
                // Use workspace root or ask user to select directory
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    targetPath = workspaceFolders[0].uri.fsPath;
                } else {
                    vscode.window.showErrorMessage('貼り付け先のディレクトリを特定できません');
                    return;
                }
            }

            await this.clipboardManager.paste(targetPath);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`貼り付けに失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle delete action
     */
    private async handleDelete(): Promise<void> {
        try {
            const selectedItems = this.multiSelectionManager.getSelection();
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage('削除するアイテムが選択されていません');
                return;
            }

            // Check if any selected items cannot be deleted
            const nonDeletableItems = selectedItems.filter(item => 
                item.permissions && !PermissionDetector.isOperationAllowed(item.permissions, 'delete')
            );
            if (nonDeletableItems.length > 0) {
                const itemNames = nonDeletableItems.map(item => item.label).join(', ');
                const permissionDetails = nonDeletableItems.map(item => 
                    item.permissions ? PermissionDetector.getLocalizedPermissionDescription(item.permissions) : ''
                ).join(', ');
                vscode.window.showErrorMessage(`以下のアイテムは削除できません: ${itemNames} (${permissionDetails})`);
                return;
            }

            // Confirm deletion
            const itemCount = selectedItems.length;
            const message = itemCount === 1 
                ? `"${selectedItems[0].label}" を削除しますか？`
                : `${itemCount} 個のアイテムを削除しますか？`;

            const confirmation = await vscode.window.showWarningMessage(
                message,
                { modal: true },
                '削除',
                'キャンセル'
            );

            if (confirmation !== '削除') {
                return;
            }

            // Perform deletion
            const filePaths = selectedItems.map(item => item.filePath);
            await this.fileOperationService.deleteFiles(filePaths);

            // Clear selection after deletion
            this.multiSelectionManager.clearSelection();

            // Refresh the view
            vscode.commands.executeCommand('fileListExtension.refresh');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`削除に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle rename action
     */
    private async handleRename(): Promise<void> {
        try {
            const selectedItems = this.multiSelectionManager.getSelection();
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage('名前を変更するアイテムが選択されていません');
                return;
            }

            if (selectedItems.length > 1) {
                vscode.window.showWarningMessage('名前の変更は一度に1つのアイテムのみ可能です');
                return;
            }

            const item = selectedItems[0];
            if (item.permissions && !PermissionDetector.isOperationAllowed(item.permissions, 'rename')) {
                const permissionDetails = PermissionDetector.getLocalizedPermissionDescription(item.permissions);
                vscode.window.showErrorMessage(`このアイテムは名前を変更できません: ${permissionDetails}`);
                return;
            }

            // Get new name from user
            const currentName = item.label;
            const newName = await vscode.window.showInputBox({
                prompt: '新しい名前を入力してください',
                value: currentName,
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return '名前を入力してください';
                    }
                    if (value === currentName) {
                        return '現在の名前と同じです';
                    }
                    const validation = this.fileOperationService.validateFileName(value);
                    if (!validation.isValid) {
                        return validation.errorMessage;
                    }
                    return null;
                }
            });

            if (!newName) {
                return;
            }

            // Perform rename
            const path = require('path');
            const oldPath = item.filePath;
            const newPath = path.join(path.dirname(oldPath), newName);

            await this.fileOperationService.renameFile(oldPath, newPath);

            // Refresh the view
            vscode.commands.executeCommand('fileListExtension.refresh');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`名前の変更に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle new file action
     */
    private async handleNewFile(): Promise<void> {
        try {
            const selectedItems = this.multiSelectionManager.getSelection();
            let parentPath: string;

            if (selectedItems.length === 1 && selectedItems[0].isDirectory) {
                parentPath = selectedItems[0].filePath;
            } else {
                // Use workspace root
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    parentPath = workspaceFolders[0].uri.fsPath;
                } else {
                    vscode.window.showErrorMessage('ファイルを作成するディレクトリを特定できません');
                    return;
                }
            }

            // Get file name from user
            const fileName = await vscode.window.showInputBox({
                prompt: 'ファイル名を入力してください',
                placeHolder: 'example.txt',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'ファイル名を入力してください';
                    }
                    const validation = this.fileOperationService.validateFileName(value);
                    if (!validation.isValid) {
                        return validation.errorMessage;
                    }
                    return null;
                }
            });

            if (!fileName) {
                return;
            }

            // Create file
            const path = require('path');
            const filePath = path.join(parentPath, fileName);
            await this.fileOperationService.createFile(filePath);

            // Refresh the view
            vscode.commands.executeCommand('fileListExtension.refresh');

            // Open the new file
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`ファイルの作成に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle new folder action
     */
    private async handleNewFolder(): Promise<void> {
        try {
            const selectedItems = this.multiSelectionManager.getSelection();
            let parentPath: string;

            if (selectedItems.length === 1 && selectedItems[0].isDirectory) {
                parentPath = selectedItems[0].filePath;
            } else {
                // Use workspace root
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    parentPath = workspaceFolders[0].uri.fsPath;
                } else {
                    vscode.window.showErrorMessage('フォルダを作成するディレクトリを特定できません');
                    return;
                }
            }

            // Get folder name from user
            const folderName = await vscode.window.showInputBox({
                prompt: 'フォルダ名を入力してください',
                placeHolder: 'new-folder',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'フォルダ名を入力してください';
                    }
                    const validation = this.fileOperationService.validateFileName(value);
                    if (!validation.isValid) {
                        return validation.errorMessage;
                    }
                    return null;
                }
            });

            if (!folderName) {
                return;
            }

            // Create folder
            const path = require('path');
            const folderPath = path.join(parentPath, folderName);
            await this.fileOperationService.createDirectory(folderPath);

            // Refresh the view
            vscode.commands.executeCommand('fileListExtension.refresh');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`フォルダの作成に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle refresh action
     */
    private async handleRefresh(): Promise<void> {
        try {
            vscode.commands.executeCommand('fileListExtension.refresh');
            vscode.window.showInformationMessage('ビューを更新しました');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`更新に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle reveal in explorer action
     */
    private async handleReveal(): Promise<void> {
        try {
            const selectedItems = this.multiSelectionManager.getSelection();
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage('表示するアイテムが選択されていません');
                return;
            }

            const item = selectedItems[0];
            const uri = vscode.Uri.file(item.filePath);
            await vscode.commands.executeCommand('revealFileInOS', uri);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`エクスプローラーでの表示に失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Handle copy path action
     */
    private async handleCopyPath(): Promise<void> {
        try {
            const selectedItems = this.multiSelectionManager.getSelection();
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage('パスをコピーするアイテムが選択されていません');
                return;
            }

            const paths = selectedItems.map(item => item.filePath);
            const pathText = paths.join('\n');
            
            await vscode.env.clipboard.writeText(pathText);
            
            const message = paths.length === 1 
                ? 'パスをクリップボードにコピーしました'
                : `${paths.length} 個のパスをクリップボードにコピーしました`;
            
            vscode.window.showInformationMessage(message);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`パスのコピーに失敗しました: ${errorMessage}`);
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Clean up any resources if needed
    }
}