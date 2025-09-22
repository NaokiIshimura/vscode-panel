import * as vscode from 'vscode';
import * as path from 'path';
import { IDragDropHandler, IEnhancedFileItem } from '../interfaces/core';
import { EnhancedFileItem } from '../models/EnhancedFileItem';
import { FileOperationService } from './FileOperationService';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';

/**
 * Drag and drop operation type
 */
export type DragDropOperation = 'move' | 'copy';

/**
 * Modifier keys state
 */
export interface ModifierKeys {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
}

/**
 * Drag and drop data transfer format
 */
export interface DragDropData {
    items: IEnhancedFileItem[];
    operation: DragDropOperation;
    sourceProvider: string;
}

/**
 * Visual feedback options for drag operations
 */
export interface DragFeedbackOptions {
    showItemCount: boolean;
    showOperation: boolean;
    customIcon?: vscode.ThemeIcon;
}

/**
 * Drag and drop handler implementation
 */
export class DragDropHandler implements IDragDropHandler, vscode.TreeDragAndDropController<EnhancedFileItem> {
    private static readonly DRAG_DATA_MIME_TYPE = 'application/vnd.code.tree.fileListExtension';
    public readonly dropMimeTypes = ['application/vnd.code.tree.fileListExtension'];
    public readonly dragMimeTypes = ['application/vnd.code.tree.fileListExtension'];
    private readonly fileOperationService: FileOperationService;
    private readonly outputChannel: vscode.OutputChannel;
    private currentDragItems: IEnhancedFileItem[] = [];
    private currentOperation: DragDropOperation = 'move';

    constructor(fileOperationService?: FileOperationService) {
        this.fileOperationService = fileOperationService || new FileOperationService();
        this.outputChannel = vscode.window.createOutputChannel('File List Extension - Drag & Drop');
    }

    /**
     * Handle drag start operation (VSCode TreeDragAndDropController interface)
     */
    handleDrag(source: readonly EnhancedFileItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        const items = source.map(item => item as IEnhancedFileItem);
        const dragDataTransfer = this.handleDragStart(items);
        
        // Copy data from our internal data transfer to the provided one
        for (const [mimeType, item] of dragDataTransfer) {
            dataTransfer.set(mimeType, item);
        }
    }

    /**
     * Handle drag start operation (internal method)
     */
    handleDragStart(items: IEnhancedFileItem[]): vscode.DataTransfer {
        this.logOperation('handleDragStart', { itemCount: items.length });

        if (!items || items.length === 0) {
            throw new Error('No items provided for drag operation');
        }

        // Store current drag items for reference
        this.currentDragItems = [...items];
        this.currentOperation = 'move'; // Default operation

        // Create data transfer object
        const dataTransfer = new vscode.DataTransfer();

        // Prepare drag data
        const dragData: DragDropData = {
            items: items,
            operation: this.currentOperation,
            sourceProvider: 'fileListExtension'
        };

        // Set custom data for internal drag & drop
        dataTransfer.set(
            DragDropHandler.DRAG_DATA_MIME_TYPE,
            new vscode.DataTransferItem(JSON.stringify(dragData))
        );

        // Set file URIs for external applications
        const fileUris = items.map(item => vscode.Uri.file(item.filePath));
        dataTransfer.set(
            'text/uri-list',
            new vscode.DataTransferItem(fileUris.map(uri => uri.toString()).join('\n'))
        );

        // Set plain text representation
        const textContent = items.map(item => item.filePath).join('\n');
        dataTransfer.set(
            'text/plain',
            new vscode.DataTransferItem(textContent)
        );

        this.logOperation('handleDragStart completed', { 
            mimeTypes: Array.from(dataTransfer).map(([mime]) => mime)
        });

        return dataTransfer;
    }

    /**
     * Handle drop operation (VSCode TreeDragAndDropController interface)
     */
    async handleDrop(target: EnhancedFileItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        if (!target) {
            throw new Error('Drop target is required');
        }
        
        const targetItem = target as IEnhancedFileItem;
        await this.handleDropInternal(targetItem, dataTransfer, 'move');
    }

    /**
     * Handle drop operation (internal method)
     */
    async handleDropInternal(
        target: IEnhancedFileItem, 
        dataTransfer: vscode.DataTransfer, 
        operation: DragDropOperation
    ): Promise<void> {
        this.logOperation('handleDropInternal', { 
            targetPath: target.filePath, 
            operation,
            availableMimeTypes: Array.from(dataTransfer).map(([mime]) => mime)
        });

        try {
            // Validate target is a directory
            if (!target.isDirectory) {
                throw new FileOperationError(
                    FileOperationErrorType.InvalidFileName,
                    target.filePath,
                    'Drop target must be a directory'
                );
            }

            // Get drag data
            const draggedItems = await this.extractDraggedItems(dataTransfer);
            if (!draggedItems || draggedItems.length === 0) {
                throw new Error('No valid items found in drop data');
            }

            // Validate drop operation
            if (!this.canDrop(target, draggedItems)) {
                throw new Error('Drop operation not allowed');
            }

            // Update operation based on modifier keys if needed
            this.currentOperation = operation;

            // Perform the drop operation
            await this.performDropOperation(draggedItems, target, operation);

            this.logOperation('handleDropInternal completed successfully');

        } catch (error) {
            this.logError('handleDropInternal failed', error);
            
            // Show user-friendly error message
            const errorMessage = error instanceof FileOperationError 
                ? error.message 
                : `ドラッグ&ドロップ操作が失敗しました: ${error}`;
            
            vscode.window.showErrorMessage(errorMessage);
            throw error;
        }
    }

    /**
     * Check if items can be dropped on target
     */
    canDrop(target: IEnhancedFileItem, items: IEnhancedFileItem[]): boolean {
        this.logOperation('canDrop', { 
            targetPath: target.filePath, 
            itemCount: items.length 
        });

        // Target must be a directory
        if (!target.isDirectory) {
            return false;
        }

        // Cannot drop items onto themselves or their children
        for (const item of items) {
            // Cannot drop item onto itself
            if (item.filePath === target.filePath) {
                return false;
            }

            // Cannot drop parent directory onto its child
            const normalizedTarget = target.filePath.replace(/\\/g, '/');
            const normalizedItem = item.filePath.replace(/\\/g, '/');
            
            // Special case for root directory
            if (normalizedItem === '/' && normalizedTarget.startsWith('/') && normalizedTarget !== '/') {
                return false;
            }
            
            if (normalizedTarget.startsWith(normalizedItem + '/')) {
                return false;
            }

            // Cannot drop item into its current parent (for move operations)
            const itemParent = path.dirname(item.filePath).replace(/\\/g, '/');
            const normalizedTargetPath = target.filePath.replace(/\\/g, '/');
            if (itemParent === normalizedTargetPath && this.currentOperation === 'move') {
                return false;
            }
        }

        return true;
    }

    /**
     * Get drop operation based on modifier keys
     */
    getDropOperation(modifierKeys: ModifierKeys): DragDropOperation {
        // Ctrl/Cmd key forces copy operation
        if (modifierKeys.ctrl) {
            return 'copy';
        }

        // Default to move operation
        return 'move';
    }

    /**
     * Update drag operation based on modifier keys
     */
    updateDragOperation(modifierKeys: ModifierKeys): void {
        const newOperation = this.getDropOperation(modifierKeys);
        
        if (newOperation !== this.currentOperation) {
            this.currentOperation = newOperation;
            this.logOperation('updateDragOperation', { operation: newOperation });
        }
    }

    /**
     * Get visual feedback for drag operation
     */
    getDragFeedback(items: IEnhancedFileItem[], operation: DragDropOperation): string {
        const itemCount = items.length;
        const operationText = operation === 'copy' ? 'コピー' : '移動';
        
        if (itemCount === 1) {
            return `${items[0].label} を${operationText}`;
        } else {
            return `${itemCount}個のアイテムを${operationText}`;
        }
    }

    /**
     * Extract dragged items from data transfer
     */
    private async extractDraggedItems(dataTransfer: vscode.DataTransfer): Promise<IEnhancedFileItem[]> {
        // Try to get internal drag data first
        const internalData = dataTransfer.get(DragDropHandler.DRAG_DATA_MIME_TYPE);
        if (internalData) {
            try {
                const dragData: DragDropData = JSON.parse(internalData.value as string);
                return dragData.items;
            } catch (error) {
                this.logError('Failed to parse internal drag data', error);
            }
        }

        // Try to get file URIs
        const uriListData = dataTransfer.get('text/uri-list');
        if (uriListData) {
            try {
                const uriStrings = (uriListData.value as string).split('\n').filter(uri => uri.trim());
                const items: IEnhancedFileItem[] = [];

                for (const uriString of uriStrings) {
                    try {
                        const uri = vscode.Uri.parse(uriString.trim());
                        if (uri.scheme === 'file') {
                            const item = await EnhancedFileItem.fromPath(uri.fsPath);
                            items.push(item);
                        }
                    } catch (error) {
                        this.logError(`Failed to create item from URI: ${uriString}`, error);
                    }
                }

                return items;
            } catch (error) {
                this.logError('Failed to parse URI list data', error);
            }
        }

        // Try to get plain text paths
        const textData = dataTransfer.get('text/plain');
        if (textData) {
            try {
                const paths = (textData.value as string).split('\n').filter(p => p.trim());
                const items: IEnhancedFileItem[] = [];

                for (const filePath of paths) {
                    try {
                        const item = await EnhancedFileItem.fromPath(filePath.trim());
                        items.push(item);
                    } catch (error) {
                        this.logError(`Failed to create item from path: ${filePath}`, error);
                    }
                }

                return items;
            } catch (error) {
                this.logError('Failed to parse text data', error);
            }
        }

        return [];
    }

    /**
     * Perform the actual drop operation
     */
    private async performDropOperation(
        items: IEnhancedFileItem[], 
        target: IEnhancedFileItem, 
        operation: DragDropOperation
    ): Promise<void> {
        const sourcePaths = items.map(item => item.filePath);
        const targetPath = target.filePath;

        // Show progress for multiple items
        if (items.length > 1) {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `${operation === 'copy' ? 'コピー' : '移動'}中...`,
                cancellable: false
            }, async (progress) => {
                const increment = 100 / items.length;
                
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    progress.report({ 
                        message: `${item.label} (${i + 1}/${items.length})`,
                        increment: i === 0 ? increment : increment
                    });

                    if (operation === 'copy') {
                        await this.fileOperationService.copyFiles([item.filePath], targetPath);
                    } else {
                        await this.fileOperationService.moveFiles([item.filePath], targetPath);
                    }
                }
            });
        } else {
            // Single item operation
            if (operation === 'copy') {
                await this.fileOperationService.copyFiles(sourcePaths, targetPath);
            } else {
                await this.fileOperationService.moveFiles(sourcePaths, targetPath);
            }
        }

        // Show success message
        const operationText = operation === 'copy' ? 'コピー' : '移動';
        const itemText = items.length === 1 ? items[0].label : `${items.length}個のアイテム`;
        vscode.window.showInformationMessage(`${itemText}を${operationText}しました`);
    }

    /**
     * Log operation for debugging
     */
    private logOperation(operation: string, details?: any): void {
        const timestamp = new Date().toISOString();
        const message = details 
            ? `[${timestamp}] ${operation}: ${JSON.stringify(details)}`
            : `[${timestamp}] ${operation}`;
        
        this.outputChannel.appendLine(message);
    }

    /**
     * Log error for debugging
     */
    private logError(operation: string, error: any): void {
        const timestamp = new Date().toISOString();
        const message = `[${timestamp}] ERROR in ${operation}: ${error.message || error}`;
        
        this.outputChannel.appendLine(message);
        
        if (error.stack) {
            this.outputChannel.appendLine(`Stack trace: ${error.stack}`);
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}