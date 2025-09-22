import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { ClipboardManager } from '../services/ClipboardManager';
import { IEnhancedFileItem, ClipboardData } from '../interfaces/core';

// Mock VSCode API
const mockGlobalState = {
    data: new Map<string, any>(),
    get: function<T>(key: string): T | undefined {
        return this.data.get(key);
    },
    update: async function(key: string, value: any): Promise<void> {
        this.data.set(key, value);
    },
    setKeysForSync: function(keys: readonly string[]): void {}
};

const mockContext = {
    globalState: mockGlobalState
} as any;

// Mock vscode.window
const mockWindow = {
    showInformationMessage: async (message: string) => message,
    showErrorMessage: async (message: string) => message,
    showWarningMessage: async (message: string, ...items: any[]) => items[0]
};

// Mock vscode.env
const mockEnv = {
    clipboard: {
        writeText: async (text: string) => {}
    }
};

// Mock vscode.Uri
const mockUri = {
    file: (path: string) => ({ fsPath: path, path })
};

// Mock TreeItemCollapsibleState
const mockTreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2
};

// Replace vscode imports with mocks
const mockVscode = {
    window: mockWindow,
    env: mockEnv,
    Uri: mockUri,
    TreeItemCollapsibleState: mockTreeItemCollapsibleState
};

// Mock the vscode module
require.cache[require.resolve('vscode')] = {
    exports: mockVscode
} as any;

describe('ClipboardManager', () => {
    let clipboardManager: ClipboardManager;
    let testItems: IEnhancedFileItem[];
    let tempDir: string;

    beforeEach(async () => {
        // Reset mock context
        mockGlobalState.data.clear();
        
        // Create clipboard manager
        clipboardManager = new ClipboardManager(mockContext);
        
        // Create temporary directory for testing
        tempDir = path.join(__dirname, 'temp-clipboard-test');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Create test files
        const testFile1 = path.join(tempDir, 'test1.txt');
        const testFile2 = path.join(tempDir, 'test2.txt');
        const testDir = path.join(tempDir, 'testdir');
        
        fs.writeFileSync(testFile1, 'Test content 1');
        fs.writeFileSync(testFile2, 'Test content 2');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir);
        }
        
        // Create test items manually (without EnhancedFileItem.fromPath to avoid vscode dependencies)
        const stats1 = fs.statSync(testFile1);
        const stats2 = fs.statSync(testFile2);
        const statsDir = fs.statSync(testDir);
        
        testItems = [
            {
                label: 'test1.txt',
                filePath: testFile1,
                isDirectory: false,
                size: stats1.size,
                modified: stats1.mtime,
                created: stats1.birthtime,
                id: testFile1
            } as IEnhancedFileItem,
            {
                label: 'test2.txt',
                filePath: testFile2,
                isDirectory: false,
                size: stats2.size,
                modified: stats2.mtime,
                created: stats2.birthtime,
                id: testFile2
            } as IEnhancedFileItem,
            {
                label: 'testdir',
                filePath: testDir,
                isDirectory: true,
                size: 0,
                modified: statsDir.mtime,
                created: statsDir.birthtime,
                id: testDir
            } as IEnhancedFileItem
        ];
    });

    afterEach(() => {
        // Clean up temporary files
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        
        clipboardManager.dispose();
    });

    describe('copy', () => {
        it('should copy items to clipboard', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            assert.strictEqual(clipboardManager.canPaste(), true);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'copy');
            
            const clipboardItems = clipboardManager.getClipboardItems();
            assert.strictEqual(clipboardItems.length, 1);
            assert.strictEqual(clipboardItems[0].filePath, testItems[0].filePath);
        });

        it('should copy multiple items to clipboard', async () => {
            await clipboardManager.copy(testItems);
            
            assert.strictEqual(clipboardManager.canPaste(), true);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'copy');
            
            const clipboardItems = clipboardManager.getClipboardItems();
            assert.strictEqual(clipboardItems.length, testItems.length);
        });

        it('should throw error for empty items array', async () => {
            await assert.rejects(
                () => clipboardManager.copy([]),
                /No items provided for copy operation/
            );
        });

        it('should throw error for null items', async () => {
            await assert.rejects(
                () => clipboardManager.copy(null as any),
                /No items provided for copy operation/
            );
        });

        it('should validate items before copying', async () => {
            const invalidItem = {
                label: 'test',
                filePath: '', // Invalid: empty path
                isDirectory: false,
                size: 0,
                modified: new Date(),
                id: 'test'
            } as IEnhancedFileItem;

            await assert.rejects(
                () => clipboardManager.copy([invalidItem]),
                /Invalid item: missing file path/
            );
        });
    });

    describe('cut', () => {
        it('should cut items to clipboard', async () => {
            await clipboardManager.cut([testItems[0]]);
            
            assert.strictEqual(clipboardManager.canPaste(), true);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'cut');
            
            const clipboardItems = clipboardManager.getClipboardItems();
            assert.strictEqual(clipboardItems.length, 1);
            assert.strictEqual(clipboardItems[0].filePath, testItems[0].filePath);
        });

        it('should cut multiple items to clipboard', async () => {
            await clipboardManager.cut(testItems);
            
            assert.strictEqual(clipboardManager.canPaste(), true);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'cut');
            
            const clipboardItems = clipboardManager.getClipboardItems();
            assert.strictEqual(clipboardItems.length, testItems.length);
        });

        it('should throw error for empty items array', async () => {
            await assert.rejects(
                () => clipboardManager.cut([]),
                /No items provided for cut operation/
            );
        });
    });

    describe('paste', () => {
        it('should paste copied items', async () => {
            // Create destination directory
            const destDir = path.join(tempDir, 'destination');
            fs.mkdirSync(destDir);
            
            // Copy item to clipboard
            await clipboardManager.copy([testItems[0]]);
            
            // Paste to destination
            const pastedItems = await clipboardManager.paste(destDir);
            
            assert.strictEqual(pastedItems.length, 1);
            assert.strictEqual(pastedItems[0].label, testItems[0].label);
            
            // Verify file was copied
            const destFile = path.join(destDir, testItems[0].label);
            assert.strictEqual(fs.existsSync(destFile), true);
            
            // Original file should still exist for copy operation
            assert.strictEqual(fs.existsSync(testItems[0].filePath), true);
            
            // Clipboard should still have items after copy operation
            assert.strictEqual(clipboardManager.canPaste(), true);
        });

        it('should paste cut items and clear clipboard', async () => {
            // Create destination directory
            const destDir = path.join(tempDir, 'destination');
            fs.mkdirSync(destDir);
            
            const originalPath = testItems[0].filePath;
            
            // Cut item to clipboard
            await clipboardManager.cut([testItems[0]]);
            
            // Paste to destination
            const pastedItems = await clipboardManager.paste(destDir);
            
            assert.strictEqual(pastedItems.length, 1);
            assert.strictEqual(pastedItems[0].label, testItems[0].label);
            
            // Verify file was moved
            const destFile = path.join(destDir, testItems[0].label);
            assert.strictEqual(fs.existsSync(destFile), true);
            
            // Original file should not exist for cut operation
            assert.strictEqual(fs.existsSync(originalPath), false);
            
            // Clipboard should be cleared after cut operation
            assert.strictEqual(clipboardManager.canPaste(), false);
        });

        it('should handle directory copying', async () => {
            // Create destination directory
            const destDir = path.join(tempDir, 'destination');
            fs.mkdirSync(destDir);
            
            // Create a file inside the test directory
            const testDirPath = testItems[2].filePath; // This is the directory
            const fileInDir = path.join(testDirPath, 'file-in-dir.txt');
            fs.writeFileSync(fileInDir, 'Content in directory');
            
            // Copy directory to clipboard
            await clipboardManager.copy([testItems[2]]);
            
            // Paste to destination
            const pastedItems = await clipboardManager.paste(destDir);
            
            assert.strictEqual(pastedItems.length, 1);
            assert.strictEqual(pastedItems[0].isDirectory, true);
            
            // Verify directory and its contents were copied
            const destDirPath = path.join(destDir, testItems[2].label);
            const destFile = path.join(destDirPath, 'file-in-dir.txt');
            
            assert.strictEqual(fs.existsSync(destDirPath), true);
            assert.strictEqual(fs.existsSync(destFile), true);
            assert.strictEqual(fs.readFileSync(destFile, 'utf8'), 'Content in directory');
        });

        it('should throw error when no items in clipboard', async () => {
            const destDir = path.join(tempDir, 'destination');
            fs.mkdirSync(destDir);
            
            await assert.rejects(
                () => clipboardManager.paste(destDir),
                /No items in clipboard to paste/
            );
        });

        it('should throw error for invalid target path', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            await assert.rejects(
                () => clipboardManager.paste('/nonexistent/path'),
                /Target directory does not exist/
            );
        });

        it('should throw error when target is not a directory', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            // Try to paste to a file instead of directory
            await assert.rejects(
                () => clipboardManager.paste(testItems[0].filePath),
                /Target path must be a directory/
            );
        });
    });

    describe('canPaste', () => {
        it('should return false when clipboard is empty', () => {
            assert.strictEqual(clipboardManager.canPaste(), false);
        });

        it('should return true when clipboard has items', async () => {
            await clipboardManager.copy([testItems[0]]);
            assert.strictEqual(clipboardManager.canPaste(), true);
        });
    });

    describe('getClipboardItems', () => {
        it('should return empty array when clipboard is empty', () => {
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(Array.isArray(items), true);
            assert.strictEqual(items.length, 0);
        });

        it('should return copied items', async () => {
            await clipboardManager.copy(testItems);
            
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(items.length, testItems.length);
            
            // Should return copies, not references
            assert.notStrictEqual(items, testItems);
        });
    });

    describe('getClipboardOperation', () => {
        it('should return null when clipboard is empty', () => {
            assert.strictEqual(clipboardManager.getClipboardOperation(), null);
        });

        it('should return copy operation', async () => {
            await clipboardManager.copy([testItems[0]]);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'copy');
        });

        it('should return cut operation', async () => {
            await clipboardManager.cut([testItems[0]]);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'cut');
        });
    });

    describe('clearClipboard', () => {
        it('should clear clipboard data', async () => {
            await clipboardManager.copy([testItems[0]]);
            assert.strictEqual(clipboardManager.canPaste(), true);
            
            clipboardManager.clearClipboard();
            assert.strictEqual(clipboardManager.canPaste(), false);
            assert.strictEqual(clipboardManager.getClipboardOperation(), null);
        });
    });

    describe('persistence', () => {
        it('should persist clipboard state', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            // Create new clipboard manager with same context
            const newClipboardManager = new ClipboardManager(mockContext);
            
            // Should load persisted state
            assert.strictEqual(newClipboardManager.canPaste(), true);
            assert.strictEqual(newClipboardManager.getClipboardOperation(), 'copy');
            
            const items = newClipboardManager.getClipboardItems();
            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].filePath, testItems[0].filePath);
            
            newClipboardManager.dispose();
        });

        it('should handle invalid persisted data gracefully', () => {
            // Set invalid data in storage
            mockGlobalState.data.set('fileListExtension.clipboard', 'invalid data');
            
            // Should not throw and start with empty clipboard
            const newClipboardManager = new ClipboardManager(mockContext);
            assert.strictEqual(newClipboardManager.canPaste(), false);
            
            newClipboardManager.dispose();
        });
    });

    describe('error handling', () => {
        it('should handle file operation errors gracefully', async () => {
            // Create item with non-existent file
            const nonExistentItem = {
                label: 'nonexistent.txt',
                filePath: path.join(tempDir, 'nonexistent.txt'),
                isDirectory: false,
                size: 0,
                modified: new Date(),
                id: 'nonexistent'
            } as IEnhancedFileItem;
            
            await clipboardManager.copy([nonExistentItem]);
            
            const destDir = path.join(tempDir, 'destination');
            fs.mkdirSync(destDir);
            
            // Should handle missing source file gracefully
            const pastedItems = await clipboardManager.paste(destDir);
            assert.strictEqual(pastedItems.length, 0); // No items pasted due to error
        });
    });
});