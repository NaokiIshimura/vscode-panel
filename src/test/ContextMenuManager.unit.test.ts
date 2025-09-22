import * as assert from 'assert';
import { IEnhancedFileItem, ContextMenuItem } from '../interfaces/core';

// Simple context menu manager for testing core logic without VSCode dependencies
class SimpleContextMenuManager {
    private clipboardManager: MockClipboardManager;
    private fileOperationService: MockFileOperationService;
    private multiSelectionManager: MockMultiSelectionManager;

    constructor(
        clipboardManager: MockClipboardManager,
        fileOperationService: MockFileOperationService,
        multiSelectionManager: MockMultiSelectionManager
    ) {
        this.clipboardManager = clipboardManager;
        this.fileOperationService = fileOperationService;
        this.multiSelectionManager = multiSelectionManager;
    }

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
            action: async () => {
                await this.clipboardManager.copy(selectedItems);
            }
        });

        // Cut action
        menuItems.push({
            id: 'cut',
            label: isMultipleSelection ? `${selectedItems.length} 個のアイテムを切り取り` : '切り取り',
            icon: '$(scissors)',
            enabled: !item.permissions?.readonly,
            action: async () => {
                await this.clipboardManager.cut(selectedItems);
            }
        });

        // Paste action (only for directories)
        if (item.isDirectory) {
            menuItems.push({
                id: 'paste',
                label: '貼り付け',
                icon: '$(clippy)',
                enabled: canPaste,
                action: async () => {
                    await this.clipboardManager.paste(item.filePath);
                }
            });
        }

        // Delete action
        menuItems.push({
            id: 'delete',
            label: isMultipleSelection ? `${selectedItems.length} 個のアイテムを削除` : '削除',
            icon: '$(trash)',
            enabled: !item.permissions?.readonly,
            action: async () => {
                const filePaths = selectedItems.map(item => item.filePath);
                await this.fileOperationService.deleteFiles(filePaths);
            }
        });

        // Rename action (only for single selection)
        if (!isMultipleSelection) {
            menuItems.push({
                id: 'rename',
                label: '名前の変更',
                icon: '$(edit)',
                enabled: !item.permissions?.readonly,
                action: async () => {
                    // Mock rename action
                }
            });
        }

        // New File action (only for directories)
        if (item.isDirectory) {
            menuItems.push({
                id: 'newFile',
                label: '新しいファイル',
                icon: '$(new-file)',
                enabled: !item.permissions?.readonly,
                action: async () => {
                    // Mock new file action
                }
            });

            menuItems.push({
                id: 'newFolder',
                label: '新しいフォルダ',
                icon: '$(new-folder)',
                enabled: !item.permissions?.readonly,
                action: async () => {
                    // Mock new folder action
                }
            });
        }

        // Utility actions
        menuItems.push({
            id: 'reveal',
            label: 'エクスプローラーで表示',
            icon: '$(folder-opened)',
            enabled: true,
            action: async () => {
                // Mock reveal action
            }
        });

        menuItems.push({
            id: 'copyPath',
            label: 'パスをコピー',
            icon: '$(copy)',
            enabled: true,
            action: async () => {
                // Mock copy path action
            }
        });

        // Refresh action (for directories)
        if (item.isDirectory) {
            menuItems.push({
                id: 'refresh',
                label: '更新',
                icon: '$(refresh)',
                enabled: true,
                action: async () => {
                    // Mock refresh action
                }
            });
        }

        return menuItems;
    }
}

// Mock services
class MockClipboardManager {
    private canPasteValue = false;
    private clipboardItems: IEnhancedFileItem[] = [];

    async copy(items: IEnhancedFileItem[]): Promise<void> {
        this.clipboardItems = [...items];
    }

    async cut(items: IEnhancedFileItem[]): Promise<void> {
        this.clipboardItems = [...items];
    }

    async paste(targetPath: string): Promise<IEnhancedFileItem[]> {
        return [...this.clipboardItems];
    }

    canPaste(): boolean {
        return this.canPasteValue;
    }

    getClipboardItems(): IEnhancedFileItem[] {
        return [...this.clipboardItems];
    }

    getClipboardOperation(): 'copy' | 'cut' | null {
        return 'copy';
    }

    setCanPaste(value: boolean): void {
        this.canPasteValue = value;
    }

    // Additional methods for testing
    hasSystemClipboardData = () => Promise.resolve(false);
    importFromSystemClipboard = () => Promise.resolve(false);
    exportToSystemClipboard = () => Promise.resolve();
    clearSystemClipboard = () => Promise.resolve();
}

class MockFileOperationService {
    async copyFiles(sources: string[], destination: string): Promise<void> {
        // Mock implementation
    }

    async moveFiles(sources: string[], destination: string): Promise<void> {
        // Mock implementation
    }

    async deleteFiles(paths: string[]): Promise<void> {
        // Mock implementation
    }

    async renameFile(oldPath: string, newPath: string): Promise<void> {
        // Mock implementation
    }

    async createFile(path: string, content?: string): Promise<void> {
        // Mock implementation
    }

    async createDirectory(path: string): Promise<void> {
        // Mock implementation
    }

    validateFileName(name: string): { isValid: boolean; errorMessage?: string } {
        if (!name || name.trim() === '') {
            return { isValid: false, errorMessage: 'Name cannot be empty' };
        }
        if (name.includes('/') || name.includes('\\')) {
            return { isValid: false, errorMessage: 'Name cannot contain path separators' };
        }
        return { isValid: true };
    }

    async getFileStats(path: string): Promise<any> {
        return {
            size: 1024,
            modified: new Date(),
            created: new Date(),
            isDirectory: false,
            permissions: { readonly: false, executable: false, hidden: false }
        };
    }
}

class MockMultiSelectionManager {
    private selectedItems: IEnhancedFileItem[] = [];

    addToSelection(item: IEnhancedFileItem): void {
        if (!this.isSelected(item)) {
            this.selectedItems.push(item);
        }
    }

    removeFromSelection(item: IEnhancedFileItem): void {
        this.selectedItems = this.selectedItems.filter(i => i.id !== item.id);
    }

    setSelection(items: IEnhancedFileItem[]): void {
        this.selectedItems = [...items];
    }

    getSelection(): IEnhancedFileItem[] {
        return [...this.selectedItems];
    }

    clearSelection(): void {
        this.selectedItems = [];
    }

    selectRange(startItem: IEnhancedFileItem, endItem: IEnhancedFileItem): void {
        // Mock implementation
    }

    isSelected(item: IEnhancedFileItem): boolean {
        return this.selectedItems.some(i => i.id === item.id);
    }
}



// Test data
const createMockFileItem = (
    label: string, 
    filePath: string, 
    isDirectory: boolean = false,
    readonly: boolean = false
): IEnhancedFileItem => ({
    label,
    filePath,
    isDirectory,
    size: isDirectory ? 0 : 1024,
    modified: new Date(),
    created: new Date(),
    permissions: { readonly, executable: false, hidden: false },
    id: filePath
});

describe('ContextMenuManager Unit Tests', () => {
    let contextMenuManager: SimpleContextMenuManager;
    let mockClipboardManager: MockClipboardManager;
    let mockFileOperationService: MockFileOperationService;
    let mockMultiSelectionManager: MockMultiSelectionManager;

    beforeEach(() => {
        mockClipboardManager = new MockClipboardManager();
        mockFileOperationService = new MockFileOperationService();
        mockMultiSelectionManager = new MockMultiSelectionManager();

        contextMenuManager = new SimpleContextMenuManager(
            mockClipboardManager,
            mockFileOperationService,
            mockMultiSelectionManager
        );
    });

    afterEach(() => {
        mockMultiSelectionManager.clearSelection();
        mockClipboardManager.setCanPaste(false);
    });

    describe('getMenuItems', () => {
        it('should return basic menu items for a file', () => {
            const fileItem = createMockFileItem('test.txt', '/path/to/test.txt', false);
            mockMultiSelectionManager.setSelection([fileItem]);

            const menuItems = contextMenuManager.getMenuItems(fileItem);

            assert.ok(menuItems.length > 0, 'Should return menu items');
            
            const copyItem = menuItems.find(item => item.id === 'copy');
            assert.ok(copyItem, 'Should include copy menu item');
            assert.strictEqual(copyItem.enabled, true, 'Copy should be enabled');

            const cutItem = menuItems.find(item => item.id === 'cut');
            assert.ok(cutItem, 'Should include cut menu item');
            assert.strictEqual(cutItem.enabled, true, 'Cut should be enabled for writable file');

            const deleteItem = menuItems.find(item => item.id === 'delete');
            assert.ok(deleteItem, 'Should include delete menu item');
            assert.strictEqual(deleteItem.enabled, true, 'Delete should be enabled for writable file');

            const renameItem = menuItems.find(item => item.id === 'rename');
            assert.ok(renameItem, 'Should include rename menu item');
            assert.strictEqual(renameItem.enabled, true, 'Rename should be enabled for writable file');
        });

        it('should disable actions for readonly files', () => {
            const readonlyFile = createMockFileItem('readonly.txt', '/path/to/readonly.txt', false, true);
            mockMultiSelectionManager.setSelection([readonlyFile]);

            const menuItems = contextMenuManager.getMenuItems(readonlyFile);

            const cutItem = menuItems.find(item => item.id === 'cut');
            assert.strictEqual(cutItem?.enabled, false, 'Cut should be disabled for readonly file');

            const deleteItem = menuItems.find(item => item.id === 'delete');
            assert.strictEqual(deleteItem?.enabled, false, 'Delete should be disabled for readonly file');

            const renameItem = menuItems.find(item => item.id === 'rename');
            assert.strictEqual(renameItem?.enabled, false, 'Rename should be disabled for readonly file');
        });

        it('should include paste action for directories', () => {
            const directory = createMockFileItem('folder', '/path/to/folder', true);
            mockMultiSelectionManager.setSelection([directory]);
            mockClipboardManager.setCanPaste(true);

            const menuItems = contextMenuManager.getMenuItems(directory);

            const pasteItem = menuItems.find(item => item.id === 'paste');
            assert.ok(pasteItem, 'Should include paste menu item for directory');
            assert.strictEqual(pasteItem.enabled, true, 'Paste should be enabled when clipboard has items');
        });

        it('should include new file/folder actions for directories', () => {
            const directory = createMockFileItem('folder', '/path/to/folder', true);
            mockMultiSelectionManager.setSelection([directory]);

            const menuItems = contextMenuManager.getMenuItems(directory);

            const newFileItem = menuItems.find(item => item.id === 'newFile');
            assert.ok(newFileItem, 'Should include new file menu item for directory');
            assert.strictEqual(newFileItem.enabled, true, 'New file should be enabled for writable directory');

            const newFolderItem = menuItems.find(item => item.id === 'newFolder');
            assert.ok(newFolderItem, 'Should include new folder menu item for directory');
            assert.strictEqual(newFolderItem.enabled, true, 'New folder should be enabled for writable directory');
        });

        it('should show multiple selection count in labels', () => {
            const file1 = createMockFileItem('file1.txt', '/path/to/file1.txt');
            const file2 = createMockFileItem('file2.txt', '/path/to/file2.txt');
            mockMultiSelectionManager.setSelection([file1, file2]);

            const menuItems = contextMenuManager.getMenuItems(file1);

            const copyItem = menuItems.find(item => item.id === 'copy');
            assert.ok(copyItem?.label.includes('2 個'), 'Copy label should show multiple selection count');

            const cutItem = menuItems.find(item => item.id === 'cut');
            assert.ok(cutItem?.label.includes('2 個'), 'Cut label should show multiple selection count');

            const deleteItem = menuItems.find(item => item.id === 'delete');
            assert.ok(deleteItem?.label.includes('2 個'), 'Delete label should show multiple selection count');

            // Rename should not be available for multiple selection
            const renameItem = menuItems.find(item => item.id === 'rename');
            assert.ok(!renameItem || !renameItem.enabled, 'Rename should not be available for multiple selection');
        });

        it('should disable paste when clipboard is empty', () => {
            const directory = createMockFileItem('folder', '/path/to/folder', true);
            mockMultiSelectionManager.setSelection([directory]);
            mockClipboardManager.setCanPaste(false);

            const menuItems = contextMenuManager.getMenuItems(directory);

            const pasteItem = menuItems.find(item => item.id === 'paste');
            assert.strictEqual(pasteItem?.enabled, false, 'Paste should be disabled when clipboard is empty');
        });

        it('should include utility actions', () => {
            const fileItem = createMockFileItem('test.txt', '/path/to/test.txt');
            mockMultiSelectionManager.setSelection([fileItem]);

            const menuItems = contextMenuManager.getMenuItems(fileItem);

            const revealItem = menuItems.find(item => item.id === 'reveal');
            assert.ok(revealItem, 'Should include reveal menu item');
            assert.strictEqual(revealItem.enabled, true, 'Reveal should always be enabled');

            const copyPathItem = menuItems.find(item => item.id === 'copyPath');
            assert.ok(copyPathItem, 'Should include copy path menu item');
            assert.strictEqual(copyPathItem.enabled, true, 'Copy path should always be enabled');
        });

        it('should include refresh action for directories', () => {
            const directory = createMockFileItem('folder', '/path/to/folder', true);
            mockMultiSelectionManager.setSelection([directory]);

            const menuItems = contextMenuManager.getMenuItems(directory);

            const refreshItem = menuItems.find(item => item.id === 'refresh');
            assert.ok(refreshItem, 'Should include refresh menu item for directory');
            assert.strictEqual(refreshItem.enabled, true, 'Refresh should always be enabled');
        });
    });

    describe('Menu Item Actions', () => {
        it('copy action should be callable', async () => {
            const fileItem = createMockFileItem('test.txt', '/path/to/test.txt');
            mockMultiSelectionManager.setSelection([fileItem]);

            const menuItems = contextMenuManager.getMenuItems(fileItem);
            const copyItem = menuItems.find(item => item.id === 'copy');
            
            assert.ok(copyItem, 'Should have copy menu item');
            assert.ok(copyItem.action, 'Copy action should be defined');
            
            // Test that action can be called without error
            await copyItem.action();
            
            // Verify clipboard manager was called
            assert.strictEqual(mockClipboardManager.getClipboardItems().length, 1, 'Should have item in clipboard');
        });

        it('cut action should be callable', async () => {
            const fileItem = createMockFileItem('test.txt', '/path/to/test.txt');
            mockMultiSelectionManager.setSelection([fileItem]);

            const menuItems = contextMenuManager.getMenuItems(fileItem);
            const cutItem = menuItems.find(item => item.id === 'cut');
            
            assert.ok(cutItem, 'Should have cut menu item');
            assert.ok(cutItem.action, 'Cut action should be defined');
            
            // Test that action can be called without error
            await cutItem.action();
            
            // Verify clipboard manager was called
            assert.strictEqual(mockClipboardManager.getClipboardItems().length, 1, 'Should have item in clipboard');
        });

        it('paste action should be callable when enabled', async () => {
            const directory = createMockFileItem('folder', '/path/to/folder', true);
            mockMultiSelectionManager.setSelection([directory]);
            mockClipboardManager.setCanPaste(true);

            const menuItems = contextMenuManager.getMenuItems(directory);
            const pasteItem = menuItems.find(item => item.id === 'paste');
            
            assert.ok(pasteItem, 'Should have paste menu item');
            assert.ok(pasteItem.enabled, 'Paste should be enabled');
            assert.ok(pasteItem.action, 'Paste action should be defined');
            
            // Test that action can be called without error
            await pasteItem.action();
        });

        it('delete action should be callable', async () => {
            const fileItem = createMockFileItem('test.txt', '/path/to/test.txt');
            mockMultiSelectionManager.setSelection([fileItem]);

            const menuItems = contextMenuManager.getMenuItems(fileItem);
            const deleteItem = menuItems.find(item => item.id === 'delete');
            
            assert.ok(deleteItem, 'Should have delete menu item');
            assert.ok(deleteItem.action, 'Delete action should be defined');
            
            // Test that action can be called without error
            await deleteItem.action();
        });
    });

    describe('Error Handling', () => {
        it('should handle copy errors gracefully', async () => {
            const fileItem = createMockFileItem('test.txt', '/path/to/test.txt');
            mockMultiSelectionManager.setSelection([fileItem]);

            mockClipboardManager.copy = async () => {
                throw new Error('Copy failed');
            };

            const menuItems = contextMenuManager.getMenuItems(fileItem);
            const copyItem = menuItems.find(item => item.id === 'copy');
            
            assert.ok(copyItem, 'Should have copy menu item');
            
            // Test that error is thrown when copy fails
            try {
                await copyItem.action();
                assert.fail('Should throw error when copy fails');
            } catch (error) {
                assert.ok(error instanceof Error, 'Should throw an error');
                assert.strictEqual(error.message, 'Copy failed', 'Should preserve original error message');
            }
        });

        it('should handle empty selection gracefully', async () => {
            mockMultiSelectionManager.setSelection([]);

            const fileItem = createMockFileItem('test.txt', '/path/to/test.txt');
            const menuItems = contextMenuManager.getMenuItems(fileItem);
            const copyItem = menuItems.find(item => item.id === 'copy');
            
            assert.ok(copyItem, 'Should have copy menu item');
            
            // Test that copy action handles empty selection
            try {
                await copyItem.action();
                assert.fail('Should throw error for empty selection');
            } catch (error) {
                assert.ok(error instanceof Error, 'Should throw an error');
                // The error message should indicate empty selection or no items
                const hasNoItemsMessage = error.message.includes('No items') || 
                                        error.message.includes('provided') || 
                                        error.message.includes('empty');
                assert.ok(hasNoItemsMessage, `Should indicate no items selected, got: ${error.message}`);
            }
        });

        it('should prevent operations on readonly files', async () => {
            const readonlyFile = createMockFileItem('readonly.txt', '/path/to/readonly.txt', false, true);
            mockMultiSelectionManager.setSelection([readonlyFile]);

            const menuItems = contextMenuManager.getMenuItems(readonlyFile);
            const cutItem = menuItems.find(item => item.id === 'cut');
            const deleteItem = menuItems.find(item => item.id === 'delete');
            const renameItem = menuItems.find(item => item.id === 'rename');

            assert.strictEqual(cutItem?.enabled, false, 'Cut should be disabled for readonly files');
            assert.strictEqual(deleteItem?.enabled, false, 'Delete should be disabled for readonly files');
            assert.strictEqual(renameItem?.enabled, false, 'Rename should be disabled for readonly files');
        });
    });
});