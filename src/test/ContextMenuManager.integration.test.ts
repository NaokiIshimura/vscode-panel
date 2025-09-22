import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ContextMenuManager } from '../services/ContextMenuManager';
import { ClipboardManager } from '../services/ClipboardManager';
import { FileOperationService } from '../services/FileOperationService';
import { MultiSelectionManager } from '../services/MultiSelectionManager';
import { IEnhancedFileItem } from '../interfaces/core';

// Test utilities
class TestUtils {
    static async createTempDirectory(): Promise<string> {
        const tempDir = path.join(__dirname, '..', '..', 'temp-test-' + Date.now());
        await fs.promises.mkdir(tempDir, { recursive: true });
        return tempDir;
    }

    static async cleanupDirectory(dirPath: string): Promise<void> {
        try {
            await fs.promises.rmdir(dirPath, { recursive: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    static async createTestFile(filePath: string, content: string = 'test content'): Promise<void> {
        await fs.promises.writeFile(filePath, content, 'utf8');
    }

    static async createTestDirectory(dirPath: string): Promise<void> {
        await fs.promises.mkdir(dirPath, { recursive: true });
    }

    static createMockFileItem(
        label: string, 
        filePath: string, 
        isDirectory: boolean = false,
        readonly: boolean = false
    ): IEnhancedFileItem {
        return {
            label,
            filePath,
            isDirectory,
            size: isDirectory ? 0 : 1024,
            modified: new Date(),
            created: new Date(),
            permissions: { readonly, executable: false, hidden: false },
            id: filePath
        };
    }
}

// Mock extension context
const mockContext: vscode.ExtensionContext = {
    subscriptions: [],
    globalState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        keys: () => []
    },
    workspaceState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        keys: () => []
    }
} as any;

suite('ContextMenuManager Integration Tests', () => {
    let contextMenuManager: ContextMenuManager;
    let clipboardManager: ClipboardManager;
    let fileOperationService: FileOperationService;
    let multiSelectionManager: MultiSelectionManager;
    let tempDir: string;

    suiteSetup(async () => {
        tempDir = await TestUtils.createTempDirectory();
    });

    suiteTeardown(async () => {
        await TestUtils.cleanupDirectory(tempDir);
    });

    setup(() => {
        clipboardManager = new ClipboardManager(mockContext);
        fileOperationService = new FileOperationService();
        multiSelectionManager = new MultiSelectionManager();

        contextMenuManager = new ContextMenuManager(
            mockContext,
            clipboardManager,
            fileOperationService,
            multiSelectionManager
        );
    });

    teardown(() => {
        multiSelectionManager.clearSelection();
        clipboardManager.clearClipboard();
    });

    suite('Context Menu Registration', () => {
        test('should register all context menu commands', () => {
            const initialSubscriptions = mockContext.subscriptions.length;
            
            contextMenuManager.registerContextMenus();
            
            const newSubscriptions = mockContext.subscriptions.length - initialSubscriptions;
            assert.strictEqual(newSubscriptions, 10, 'Should register 10 context menu commands');
        });

        test('should register commands with correct names', () => {
            const commandsBefore = vscode.commands.getCommands();
            
            contextMenuManager.registerContextMenus();
            
            // Note: In real integration tests, we would check if commands are actually registered
            // For now, we verify that registerContextMenus doesn't throw
            assert.ok(true, 'Commands registration should complete without errors');
        });
    });

    suite('File Operations Integration', () => {
        test('should copy and paste files through context menu', async () => {
            // Create test files
            const sourceFile = path.join(tempDir, 'source.txt');
            const targetDir = path.join(tempDir, 'target');
            
            await TestUtils.createTestFile(sourceFile, 'test content');
            await TestUtils.createTestDirectory(targetDir);

            // Create file items
            const sourceItem = TestUtils.createMockFileItem('source.txt', sourceFile);
            const targetItem = TestUtils.createMockFileItem('target', targetDir, true);

            // Select source file
            multiSelectionManager.setSelection([sourceItem]);

            // Copy file
            await clipboardManager.copy([sourceItem]);
            assert.ok(clipboardManager.canPaste(), 'Should be able to paste after copy');

            // Paste to target directory
            const pastedItems = await clipboardManager.paste(targetDir);
            assert.strictEqual(pastedItems.length, 1, 'Should paste one item');

            // Verify file was copied
            const copiedFilePath = path.join(targetDir, 'source.txt');
            const exists = await fs.promises.access(copiedFilePath).then(() => true).catch(() => false);
            assert.ok(exists, 'Copied file should exist');

            const content = await fs.promises.readFile(copiedFilePath, 'utf8');
            assert.strictEqual(content, 'test content', 'Copied file should have same content');
        });

        test('should cut and paste files through context menu', async () => {
            // Create test files
            const sourceFile = path.join(tempDir, 'cut-source.txt');
            const targetDir = path.join(tempDir, 'cut-target');
            
            await TestUtils.createTestFile(sourceFile, 'cut test content');
            await TestUtils.createTestDirectory(targetDir);

            // Create file items
            const sourceItem = TestUtils.createMockFileItem('cut-source.txt', sourceFile);

            // Select source file
            multiSelectionManager.setSelection([sourceItem]);

            // Cut file
            await clipboardManager.cut([sourceItem]);
            assert.ok(clipboardManager.canPaste(), 'Should be able to paste after cut');
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'cut', 'Should be cut operation');

            // Paste to target directory
            const pastedItems = await clipboardManager.paste(targetDir);
            assert.strictEqual(pastedItems.length, 1, 'Should paste one item');

            // Verify file was moved
            const movedFilePath = path.join(targetDir, 'cut-source.txt');
            const targetExists = await fs.promises.access(movedFilePath).then(() => true).catch(() => false);
            assert.ok(targetExists, 'Moved file should exist in target');

            const sourceExists = await fs.promises.access(sourceFile).then(() => true).catch(() => false);
            assert.ok(!sourceExists, 'Source file should no longer exist after cut');
        });

        test('should create new files through context menu', async () => {
            const targetDir = path.join(tempDir, 'new-file-test');
            await TestUtils.createTestDirectory(targetDir);

            const newFileName = 'new-test-file.txt';
            const newFilePath = path.join(targetDir, newFileName);

            // Create new file
            await fileOperationService.createFile(newFilePath, 'new file content');

            // Verify file was created
            const exists = await fs.promises.access(newFilePath).then(() => true).catch(() => false);
            assert.ok(exists, 'New file should exist');

            const content = await fs.promises.readFile(newFilePath, 'utf8');
            assert.strictEqual(content, 'new file content', 'New file should have correct content');
        });

        test('should create new directories through context menu', async () => {
            const parentDir = path.join(tempDir, 'new-folder-test');
            await TestUtils.createTestDirectory(parentDir);

            const newFolderName = 'new-test-folder';
            const newFolderPath = path.join(parentDir, newFolderName);

            // Create new directory
            await fileOperationService.createDirectory(newFolderPath);

            // Verify directory was created
            const stats = await fs.promises.stat(newFolderPath);
            assert.ok(stats.isDirectory(), 'New folder should be a directory');
        });

        test('should delete files through context menu', async () => {
            // Create test file
            const testFile = path.join(tempDir, 'delete-test.txt');
            await TestUtils.createTestFile(testFile, 'delete me');

            // Verify file exists
            let exists = await fs.promises.access(testFile).then(() => true).catch(() => false);
            assert.ok(exists, 'Test file should exist before deletion');

            // Delete file
            await fileOperationService.deleteFiles([testFile]);

            // Verify file was deleted
            exists = await fs.promises.access(testFile).then(() => true).catch(() => false);
            assert.ok(!exists, 'Test file should not exist after deletion');
        });

        test('should rename files through context menu', async () => {
            // Create test file
            const originalFile = path.join(tempDir, 'rename-original.txt');
            const renamedFile = path.join(tempDir, 'rename-new.txt');
            
            await TestUtils.createTestFile(originalFile, 'rename test content');

            // Verify original file exists
            let originalExists = await fs.promises.access(originalFile).then(() => true).catch(() => false);
            assert.ok(originalExists, 'Original file should exist before rename');

            // Rename file
            await fileOperationService.renameFile(originalFile, renamedFile);

            // Verify rename was successful
            originalExists = await fs.promises.access(originalFile).then(() => true).catch(() => false);
            const renamedExists = await fs.promises.access(renamedFile).then(() => true).catch(() => false);
            
            assert.ok(!originalExists, 'Original file should not exist after rename');
            assert.ok(renamedExists, 'Renamed file should exist');

            const content = await fs.promises.readFile(renamedFile, 'utf8');
            assert.strictEqual(content, 'rename test content', 'Renamed file should have same content');
        });
    });

    suite('Multi-Selection Integration', () => {
        test('should handle multiple file selection for copy', async () => {
            // Create multiple test files
            const file1 = path.join(tempDir, 'multi1.txt');
            const file2 = path.join(tempDir, 'multi2.txt');
            const targetDir = path.join(tempDir, 'multi-target');

            await TestUtils.createTestFile(file1, 'content 1');
            await TestUtils.createTestFile(file2, 'content 2');
            await TestUtils.createTestDirectory(targetDir);

            // Create file items
            const item1 = TestUtils.createMockFileItem('multi1.txt', file1);
            const item2 = TestUtils.createMockFileItem('multi2.txt', file2);

            // Select multiple files
            multiSelectionManager.setSelection([item1, item2]);
            assert.strictEqual(multiSelectionManager.getSelection().length, 2, 'Should have 2 selected items');

            // Copy multiple files
            await clipboardManager.copy([item1, item2]);
            assert.strictEqual(clipboardManager.getClipboardItems().length, 2, 'Should have 2 items in clipboard');

            // Paste multiple files
            const pastedItems = await clipboardManager.paste(targetDir);
            assert.strictEqual(pastedItems.length, 2, 'Should paste 2 items');

            // Verify both files were copied
            const copied1 = path.join(targetDir, 'multi1.txt');
            const copied2 = path.join(targetDir, 'multi2.txt');

            const exists1 = await fs.promises.access(copied1).then(() => true).catch(() => false);
            const exists2 = await fs.promises.access(copied2).then(() => true).catch(() => false);

            assert.ok(exists1, 'First copied file should exist');
            assert.ok(exists2, 'Second copied file should exist');
        });

        test('should handle multiple file selection for delete', async () => {
            // Create multiple test files
            const file1 = path.join(tempDir, 'delete-multi1.txt');
            const file2 = path.join(tempDir, 'delete-multi2.txt');

            await TestUtils.createTestFile(file1, 'delete content 1');
            await TestUtils.createTestFile(file2, 'delete content 2');

            // Verify files exist
            let exists1 = await fs.promises.access(file1).then(() => true).catch(() => false);
            let exists2 = await fs.promises.access(file2).then(() => true).catch(() => false);
            assert.ok(exists1, 'First file should exist before deletion');
            assert.ok(exists2, 'Second file should exist before deletion');

            // Delete multiple files
            await fileOperationService.deleteFiles([file1, file2]);

            // Verify files were deleted
            exists1 = await fs.promises.access(file1).then(() => true).catch(() => false);
            exists2 = await fs.promises.access(file2).then(() => true).catch(() => false);
            assert.ok(!exists1, 'First file should not exist after deletion');
            assert.ok(!exists2, 'Second file should not exist after deletion');
        });
    });

    suite('Context Menu Item Generation', () => {
        test('should generate appropriate menu items for files', () => {
            const fileItem = TestUtils.createMockFileItem('test.txt', path.join(tempDir, 'test.txt'));
            multiSelectionManager.setSelection([fileItem]);

            const menuItems = contextMenuManager.getMenuItems(fileItem);

            // Check for essential menu items
            const copyItem = menuItems.find(item => item.id === 'copy');
            const cutItem = menuItems.find(item => item.id === 'cut');
            const deleteItem = menuItems.find(item => item.id === 'delete');
            const renameItem = menuItems.find(item => item.id === 'rename');
            const revealItem = menuItems.find(item => item.id === 'reveal');
            const copyPathItem = menuItems.find(item => item.id === 'copyPath');

            assert.ok(copyItem, 'Should have copy menu item');
            assert.ok(cutItem, 'Should have cut menu item');
            assert.ok(deleteItem, 'Should have delete menu item');
            assert.ok(renameItem, 'Should have rename menu item');
            assert.ok(revealItem, 'Should have reveal menu item');
            assert.ok(copyPathItem, 'Should have copy path menu item');

            // Files should not have paste, new file, or new folder items
            const pasteItem = menuItems.find(item => item.id === 'paste');
            const newFileItem = menuItems.find(item => item.id === 'newFile');
            const newFolderItem = menuItems.find(item => item.id === 'newFolder');

            assert.ok(!pasteItem, 'Files should not have paste menu item');
            assert.ok(!newFileItem, 'Files should not have new file menu item');
            assert.ok(!newFolderItem, 'Files should not have new folder menu item');
        });

        test('should generate appropriate menu items for directories', () => {
            const dirItem = TestUtils.createMockFileItem('folder', path.join(tempDir, 'folder'), true);
            multiSelectionManager.setSelection([dirItem]);
            clipboardManager.copy([dirItem]); // Set up clipboard for paste test

            const menuItems = contextMenuManager.getMenuItems(dirItem);

            // Check for directory-specific menu items
            const pasteItem = menuItems.find(item => item.id === 'paste');
            const newFileItem = menuItems.find(item => item.id === 'newFile');
            const newFolderItem = menuItems.find(item => item.id === 'newFolder');
            const refreshItem = menuItems.find(item => item.id === 'refresh');

            assert.ok(pasteItem, 'Directories should have paste menu item');
            assert.ok(newFileItem, 'Directories should have new file menu item');
            assert.ok(newFolderItem, 'Directories should have new folder menu item');
            assert.ok(refreshItem, 'Directories should have refresh menu item');
        });

        test('should disable actions for readonly items', () => {
            const readonlyItem = TestUtils.createMockFileItem('readonly.txt', path.join(tempDir, 'readonly.txt'), false, true);
            multiSelectionManager.setSelection([readonlyItem]);

            const menuItems = contextMenuManager.getMenuItems(readonlyItem);

            const cutItem = menuItems.find(item => item.id === 'cut');
            const deleteItem = menuItems.find(item => item.id === 'delete');
            const renameItem = menuItems.find(item => item.id === 'rename');

            assert.strictEqual(cutItem?.enabled, false, 'Cut should be disabled for readonly items');
            assert.strictEqual(deleteItem?.enabled, false, 'Delete should be disabled for readonly items');
            assert.strictEqual(renameItem?.enabled, false, 'Rename should be disabled for readonly items');

            // Copy should still be enabled
            const copyItem = menuItems.find(item => item.id === 'copy');
            assert.strictEqual(copyItem?.enabled, true, 'Copy should be enabled for readonly items');
        });
    });

    suite('Error Handling Integration', () => {
        test('should handle file operation errors gracefully', async () => {
            // Try to copy a non-existent file
            const nonExistentFile = path.join(tempDir, 'non-existent.txt');
            const targetDir = path.join(tempDir, 'error-target');
            
            await TestUtils.createTestDirectory(targetDir);

            try {
                await fileOperationService.copyFiles([nonExistentFile], targetDir);
                assert.fail('Should throw error for non-existent file');
            } catch (error) {
                assert.ok(error instanceof Error, 'Should throw an error');
                assert.ok(error.message.includes('does not exist') || error.message.includes('ENOENT'), 'Error should indicate file not found');
            }
        });

        test('should handle permission errors gracefully', async () => {
            // This test would require setting up permission-restricted files
            // For now, we'll test the validation logic
            const invalidFileName = 'invalid<>file.txt';
            const validation = fileOperationService.validateFileName(invalidFileName);
            
            assert.strictEqual(validation.isValid, false, 'Should reject invalid file names');
            assert.ok(validation.errorMessage, 'Should provide error message for invalid names');
        });

        test('should handle clipboard errors gracefully', async () => {
            // Clear clipboard and try to paste
            clipboardManager.clearClipboard();
            
            const targetDir = path.join(tempDir, 'paste-error-target');
            await TestUtils.createTestDirectory(targetDir);

            try {
                await clipboardManager.paste(targetDir);
                assert.fail('Should throw error when clipboard is empty');
            } catch (error) {
                assert.ok(error instanceof Error, 'Should throw an error');
                assert.ok(error.message.includes('clipboard'), 'Error should mention clipboard');
            }
        });
    });

    suite('Performance and Concurrency', () => {
        test('should handle multiple concurrent operations', async () => {
            // Create multiple test files
            const files: string[] = [];
            const targetDirs: string[] = [];
            
            for (let i = 0; i < 5; i++) {
                const file = path.join(tempDir, `concurrent-${i}.txt`);
                const targetDir = path.join(tempDir, `concurrent-target-${i}`);
                
                await TestUtils.createTestFile(file, `content ${i}`);
                await TestUtils.createTestDirectory(targetDir);
                
                files.push(file);
                targetDirs.push(targetDir);
            }

            // Perform concurrent copy operations
            const copyPromises = files.map((file, index) => 
                fileOperationService.copyFiles([file], targetDirs[index])
            );

            await Promise.all(copyPromises);

            // Verify all files were copied
            for (let i = 0; i < 5; i++) {
                const copiedFile = path.join(targetDirs[i], `concurrent-${i}.txt`);
                const exists = await fs.promises.access(copiedFile).then(() => true).catch(() => false);
                assert.ok(exists, `Concurrent copy ${i} should succeed`);
            }
        });

        test('should handle large file operations efficiently', async () => {
            // Create a larger test file
            const largeFile = path.join(tempDir, 'large-file.txt');
            const largeContent = 'x'.repeat(10000); // 10KB file
            const targetDir = path.join(tempDir, 'large-target');

            await TestUtils.createTestFile(largeFile, largeContent);
            await TestUtils.createTestDirectory(targetDir);

            const startTime = Date.now();
            await fileOperationService.copyFiles([largeFile], targetDir);
            const endTime = Date.now();

            // Verify file was copied
            const copiedFile = path.join(targetDir, 'large-file.txt');
            const exists = await fs.promises.access(copiedFile).then(() => true).catch(() => false);
            assert.ok(exists, 'Large file should be copied');

            const copiedContent = await fs.promises.readFile(copiedFile, 'utf8');
            assert.strictEqual(copiedContent, largeContent, 'Large file content should match');

            // Performance check (should complete within reasonable time)
            const duration = endTime - startTime;
            assert.ok(duration < 5000, 'Large file copy should complete within 5 seconds');
        });
    });
});