import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { IEnhancedFileItem } from '../interfaces/core';

// Mock VSCode API for integration testing
const mockClipboardContent = { text: '' };

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

const mockWindow = {
    showInformationMessage: async (message: string) => message,
    showErrorMessage: async (message: string) => message,
    showWarningMessage: async (message: string, ...items: any[]) => items[0]
};

const mockEnv = {
    clipboard: {
        writeText: async (text: string) => {
            mockClipboardContent.text = text;
        },
        readText: async () => {
            return mockClipboardContent.text;
        }
    }
};

const mockUri = {
    file: (path: string) => ({ fsPath: path, path })
};

const mockTreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2
};

// Mock the vscode module
const mockVscode = {
    window: mockWindow,
    env: mockEnv,
    Uri: mockUri,
    TreeItemCollapsibleState: mockTreeItemCollapsibleState
};

require.cache[require.resolve('vscode')] = {
    exports: mockVscode
} as any;

// Now import ClipboardManager after mocking
import { ClipboardManager } from '../services/ClipboardManager';

describe('ClipboardManager System Integration', () => {
    let clipboardManager: ClipboardManager;
    let testItems: IEnhancedFileItem[];
    let tempDir: string;

    beforeEach(() => {
        // Reset mocks
        mockGlobalState.data.clear();
        mockClipboardContent.text = '';
        
        clipboardManager = new ClipboardManager(mockContext);
        
        // Create temporary directory for testing
        tempDir = path.join(__dirname, 'temp-integration-test');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Create test files
        const testFile1 = path.join(tempDir, 'integration1.txt');
        const testFile2 = path.join(tempDir, 'integration2.txt');
        const testDir = path.join(tempDir, 'testdir');
        
        fs.writeFileSync(testFile1, 'Integration test content 1');
        fs.writeFileSync(testFile2, 'Integration test content 2');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir);
        }
        
        // Create test items
        const stats1 = fs.statSync(testFile1);
        const stats2 = fs.statSync(testFile2);
        const statsDir = fs.statSync(testDir);
        
        testItems = [
            {
                label: 'integration1.txt',
                filePath: testFile1,
                isDirectory: false,
                size: stats1.size,
                modified: stats1.mtime,
                created: stats1.birthtime,
                id: testFile1
            } as IEnhancedFileItem,
            {
                label: 'integration2.txt',
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

    describe('System Clipboard Integration', () => {
        it('should update system clipboard when copying items', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            // Check that system clipboard was updated
            const clipboardText = await mockEnv.clipboard.readText();
            assert.ok(clipboardText.includes('VSCode File List Extension'));
            assert.ok(clipboardText.includes('コピー'));
            assert.ok(clipboardText.includes(testItems[0].filePath));
        });

        it('should update system clipboard when cutting items', async () => {
            await clipboardManager.cut([testItems[0]]);
            
            // Check that system clipboard was updated
            const clipboardText = await mockEnv.clipboard.readText();
            assert.ok(clipboardText.includes('VSCode File List Extension'));
            assert.ok(clipboardText.includes('切り取り'));
            assert.ok(clipboardText.includes(testItems[0].filePath));
        });

        it('should create structured clipboard content with metadata', async () => {
            await clipboardManager.copy(testItems);
            
            const clipboardText = await mockEnv.clipboard.readText();
            
            // Check text format
            assert.ok(clipboardText.includes('VSCode File List Extension - コピー (3 アイテム)'));
            assert.ok(clipboardText.includes('タイムスタンプ:'));
            assert.ok(clipboardText.includes('[ファイル] ' + testItems[0].filePath));
            assert.ok(clipboardText.includes('[ファイル] ' + testItems[1].filePath));
            assert.ok(clipboardText.includes('[フォルダ] ' + testItems[2].filePath));
            
            // Check that metadata was stored
            const metadata = mockGlobalState.data.get('fileListExtension.systemClipboard');
            assert.ok(metadata);
            assert.strictEqual(metadata.source, 'vscode-file-list-extension');
            assert.strictEqual(metadata.version, '1.0');
            assert.strictEqual(metadata.operation, 'copy');
            assert.strictEqual(metadata.items.length, 3);
        });

        it('should detect system clipboard data', async () => {
            // Initially no data
            assert.strictEqual(await clipboardManager.hasSystemClipboardData(), false);
            
            // After copying
            await clipboardManager.copy([testItems[0]]);
            assert.strictEqual(await clipboardManager.hasSystemClipboardData(), true);
        });

        it('should export clipboard data to system clipboard', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            // Clear system clipboard
            mockClipboardContent.text = '';
            
            // Export should restore system clipboard
            await clipboardManager.exportToSystemClipboard();
            
            const clipboardText = await mockEnv.clipboard.readText();
            assert.ok(clipboardText.includes('VSCode File List Extension'));
            assert.ok(clipboardText.includes(testItems[0].filePath));
        });

        it('should clear system clipboard', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            // Verify clipboard has content
            assert.ok(mockClipboardContent.text.length > 0);
            assert.ok(mockGlobalState.data.has('fileListExtension.systemClipboard'));
            
            // Clear system clipboard
            await clipboardManager.clearSystemClipboard();
            
            // Verify clipboard is cleared
            assert.strictEqual(mockClipboardContent.text, '');
            assert.strictEqual(mockGlobalState.data.get('fileListExtension.systemClipboard'), undefined);
        });
    });

    describe('Import from System Clipboard', () => {
        it('should import from extension format clipboard', async () => {
            // First copy to establish format
            await clipboardManager.copy([testItems[0]]);
            
            // Clear internal clipboard
            clipboardManager.clearClipboard();
            assert.strictEqual(clipboardManager.canPaste(), false);
            
            // Import from system clipboard
            const imported = await clipboardManager.importFromSystemClipboard();
            assert.strictEqual(imported, true);
            
            // Verify data was imported
            assert.strictEqual(clipboardManager.canPaste(), true);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'copy');
            
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].filePath, testItems[0].filePath);
        });

        it('should import from plain file paths', async () => {
            // Set clipboard to plain file paths
            const filePaths = testItems.map(item => item.filePath).join('\n');
            mockClipboardContent.text = filePaths;
            
            // Import from system clipboard
            const imported = await clipboardManager.importFromSystemClipboard();
            assert.strictEqual(imported, true);
            
            // Verify data was imported as copy operation
            assert.strictEqual(clipboardManager.canPaste(), true);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'copy');
            
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(items.length, testItems.length);
        });

        it('should handle invalid clipboard content gracefully', async () => {
            // Set clipboard to invalid content
            mockClipboardContent.text = 'This is not file data\nJust some random text\n';
            
            // Import should fail gracefully
            const imported = await clipboardManager.importFromSystemClipboard();
            assert.strictEqual(imported, false);
            
            // Clipboard should remain empty
            assert.strictEqual(clipboardManager.canPaste(), false);
        });

        it('should validate file paths when importing', async () => {
            // Mix of valid and invalid paths
            const mixedPaths = [
                testItems[0].filePath,  // Valid
                '/nonexistent/path/file.txt',  // Invalid
                testItems[1].filePath,  // Valid
                '/another/invalid/path'  // Invalid
            ].join('\n');
            
            mockClipboardContent.text = mixedPaths;
            
            // Import should succeed with valid paths only
            const imported = await clipboardManager.importFromSystemClipboard();
            assert.strictEqual(imported, true);
            
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(items.length, 2); // Only valid paths
            assert.strictEqual(items[0].filePath, testItems[0].filePath);
            assert.strictEqual(items[1].filePath, testItems[1].filePath);
        });

        it('should handle metadata restoration with missing files', async () => {
            // Copy items to establish metadata
            await clipboardManager.copy(testItems);
            
            // Delete one of the test files
            fs.unlinkSync(testItems[1].filePath);
            
            // Clear internal clipboard
            clipboardManager.clearClipboard();
            
            // Import should succeed with remaining valid files
            const imported = await clipboardManager.importFromSystemClipboard();
            assert.strictEqual(imported, true);
            
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(items.length, 2); // File + Directory (missing file excluded)
            
            // Should not include the deleted file
            const filePaths = items.map(item => item.filePath);
            assert.ok(!filePaths.includes(testItems[1].filePath));
            assert.ok(filePaths.includes(testItems[0].filePath));
            assert.ok(filePaths.includes(testItems[2].filePath));
        });
    });

    describe('Cross-session Persistence', () => {
        it('should persist clipboard data across sessions', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            // Create new clipboard manager (simulating new session)
            const newClipboardManager = new ClipboardManager(mockContext);
            
            // Should restore from system clipboard
            const imported = await newClipboardManager.importFromSystemClipboard();
            assert.strictEqual(imported, true);
            
            assert.strictEqual(newClipboardManager.canPaste(), true);
            assert.strictEqual(newClipboardManager.getClipboardOperation(), 'copy');
            
            const items = newClipboardManager.getClipboardItems();
            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].filePath, testItems[0].filePath);
            
            newClipboardManager.dispose();
        });

        it('should handle corrupted metadata gracefully', async () => {
            // Set corrupted metadata
            mockGlobalState.data.set('fileListExtension.systemClipboard', 'corrupted data');
            
            // Set valid clipboard text
            mockClipboardContent.text = 'VSCode File List Extension - コピー (1 アイテム)';
            
            // Import should fail gracefully
            const imported = await clipboardManager.importFromSystemClipboard();
            assert.strictEqual(imported, false);
        });
    });

    describe('Data Format Conversion', () => {
        it('should convert between internal and system clipboard formats', async () => {
            const originalItem = testItems[0];
            
            // Copy to internal clipboard
            await clipboardManager.copy([originalItem]);
            
            // Check system clipboard format
            const clipboardText = await mockEnv.clipboard.readText();
            assert.ok(clipboardText.includes(originalItem.filePath));
            assert.ok(clipboardText.includes('[ファイル]'));
            
            // Clear and import back
            clipboardManager.clearClipboard();
            const imported = await clipboardManager.importFromSystemClipboard();
            assert.strictEqual(imported, true);
            
            // Verify data integrity
            const restoredItems = clipboardManager.getClipboardItems();
            assert.strictEqual(restoredItems.length, 1);
            assert.strictEqual(restoredItems[0].filePath, originalItem.filePath);
            assert.strictEqual(restoredItems[0].label, originalItem.label);
            assert.strictEqual(restoredItems[0].isDirectory, originalItem.isDirectory);
        });

        it('should handle special characters in file paths', async () => {
            // Create file with special characters
            const specialFile = path.join(tempDir, 'file with spaces & symbols!.txt');
            fs.writeFileSync(specialFile, 'Special content');
            
            const specialItem = {
                label: 'file with spaces & symbols!.txt',
                filePath: specialFile,
                isDirectory: false,
                size: 15,
                modified: new Date(),
                id: specialFile
            } as IEnhancedFileItem;
            
            // Copy and verify system clipboard
            await clipboardManager.copy([specialItem]);
            
            const clipboardText = await mockEnv.clipboard.readText();
            assert.ok(clipboardText.includes(specialFile));
            
            // Import back and verify
            clipboardManager.clearClipboard();
            const imported = await clipboardManager.importFromSystemClipboard();
            assert.strictEqual(imported, true);
            
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(items[0].filePath, specialFile);
            assert.strictEqual(items[0].label, 'file with spaces & symbols!.txt');
        });
    });

    describe('Error Handling', () => {
        it('should handle system clipboard read errors gracefully', async () => {
            // Mock clipboard read error
            const originalReadText = mockEnv.clipboard.readText;
            mockEnv.clipboard.readText = async () => {
                throw new Error('Clipboard read error');
            };
            
            try {
                const hasData = await clipboardManager.hasSystemClipboardData();
                assert.strictEqual(hasData, false);
                
                const imported = await clipboardManager.importFromSystemClipboard();
                assert.strictEqual(imported, false);
            } finally {
                // Restore original function
                mockEnv.clipboard.readText = originalReadText;
            }
        });

        it('should handle system clipboard write errors gracefully', async () => {
            // Mock clipboard write error
            const originalWriteText = mockEnv.clipboard.writeText;
            mockEnv.clipboard.writeText = async () => {
                throw new Error('Clipboard write error');
            };
            
            try {
                // Should not throw, but handle error gracefully
                await clipboardManager.copy([testItems[0]]);
                
                // Internal clipboard should still work
                assert.strictEqual(clipboardManager.canPaste(), true);
            } finally {
                // Restore original function
                mockEnv.clipboard.writeText = originalWriteText;
            }
        });

        it('should handle metadata storage errors gracefully', async () => {
            // Mock storage error
            const originalUpdate = mockGlobalState.update;
            mockGlobalState.update = async () => {
                throw new Error('Storage error');
            };
            
            try {
                // Should not throw, but handle error gracefully
                await clipboardManager.copy([testItems[0]]);
                
                // Internal clipboard should still work
                assert.strictEqual(clipboardManager.canPaste(), true);
            } finally {
                // Restore original function
                mockGlobalState.update = originalUpdate;
            }
        });
    });
});