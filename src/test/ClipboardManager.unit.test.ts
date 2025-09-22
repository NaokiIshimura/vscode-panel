import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { IEnhancedFileItem, ClipboardData } from '../interfaces/core';

// Simple clipboard manager for testing core logic without VSCode dependencies
class SimpleClipboardManager {
    private clipboardData: ClipboardData | null = null;

    async copy(items: IEnhancedFileItem[]): Promise<void> {
        if (!items || items.length === 0) {
            throw new Error('No items provided for copy operation');
        }

        this.validateItems(items);

        this.clipboardData = {
            items: [...items],
            operation: 'copy',
            timestamp: new Date(),
            sourceProvider: 'test'
        };
    }

    async cut(items: IEnhancedFileItem[]): Promise<void> {
        if (!items || items.length === 0) {
            throw new Error('No items provided for cut operation');
        }

        this.validateItems(items);

        this.clipboardData = {
            items: [...items],
            operation: 'cut',
            timestamp: new Date(),
            sourceProvider: 'test'
        };
    }

    canPaste(): boolean {
        return this.clipboardData !== null && 
               this.clipboardData.items.length > 0;
    }

    getClipboardItems(): IEnhancedFileItem[] {
        return this.clipboardData ? [...this.clipboardData.items] : [];
    }

    getClipboardOperation(): 'copy' | 'cut' | null {
        return this.clipboardData ? this.clipboardData.operation : null;
    }

    clearClipboard(): void {
        this.clipboardData = null;
    }

    getClipboardData(): ClipboardData | null {
        return this.clipboardData ? { ...this.clipboardData } : null;
    }

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
}

describe('ClipboardManager Core Logic', () => {
    let clipboardManager: SimpleClipboardManager;
    let testItems: IEnhancedFileItem[];
    let tempDir: string;

    beforeEach(() => {
        clipboardManager = new SimpleClipboardManager();
        
        // Create temporary directory for testing
        tempDir = path.join(__dirname, 'temp-clipboard-test');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Create test files
        const testFile1 = path.join(tempDir, 'test1.txt');
        const testFile2 = path.join(tempDir, 'test2.txt');
        
        fs.writeFileSync(testFile1, 'Test content 1');
        fs.writeFileSync(testFile2, 'Test content 2');
        
        // Create test items
        testItems = [
            {
                label: 'test1.txt',
                filePath: testFile1,
                isDirectory: false,
                size: 14,
                modified: new Date(),
                id: testFile1
            } as IEnhancedFileItem,
            {
                label: 'test2.txt',
                filePath: testFile2,
                isDirectory: false,
                size: 14,
                modified: new Date(),
                id: testFile2
            } as IEnhancedFileItem
        ];
    });

    afterEach(() => {
        // Clean up temporary files
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
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

        it('should create independent copies of items', async () => {
            await clipboardManager.copy(testItems);
            
            const clipboardItems = clipboardManager.getClipboardItems();
            
            // Should return copies, not references
            assert.notStrictEqual(clipboardItems, testItems);
            
            // Content should be the same (shallow copy is acceptable for this use case)
            assert.strictEqual(clipboardItems[0].filePath, testItems[0].filePath);
            assert.strictEqual(clipboardItems[0].label, testItems[0].label);
            assert.strictEqual(clipboardItems.length, testItems.length);
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

        it('should validate items before cutting', async () => {
            const invalidItem = {
                label: '', // Invalid: empty label
                filePath: '/test/path',
                isDirectory: false,
                size: 0,
                modified: new Date(),
                id: 'test'
            } as IEnhancedFileItem;

            await assert.rejects(
                () => clipboardManager.cut([invalidItem]),
                /Invalid item: missing label/
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

        it('should return false after clearing clipboard', async () => {
            await clipboardManager.copy([testItems[0]]);
            assert.strictEqual(clipboardManager.canPaste(), true);
            
            clipboardManager.clearClipboard();
            assert.strictEqual(clipboardManager.canPaste(), false);
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

        it('should return independent copies each time', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            const items1 = clipboardManager.getClipboardItems();
            const items2 = clipboardManager.getClipboardItems();
            
            // Should be different array instances
            assert.notStrictEqual(items1, items2);
            
            // But with same content
            assert.strictEqual(items1.length, items2.length);
            assert.strictEqual(items1[0].filePath, items2[0].filePath);
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

        it('should return null after clearing clipboard', async () => {
            await clipboardManager.cut([testItems[0]]);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'cut');
            
            clipboardManager.clearClipboard();
            assert.strictEqual(clipboardManager.getClipboardOperation(), null);
        });
    });

    describe('clearClipboard', () => {
        it('should clear clipboard data', async () => {
            await clipboardManager.copy([testItems[0]]);
            assert.strictEqual(clipboardManager.canPaste(), true);
            
            clipboardManager.clearClipboard();
            assert.strictEqual(clipboardManager.canPaste(), false);
            assert.strictEqual(clipboardManager.getClipboardOperation(), null);
            assert.strictEqual(clipboardManager.getClipboardItems().length, 0);
        });

        it('should be safe to call multiple times', () => {
            clipboardManager.clearClipboard();
            clipboardManager.clearClipboard();
            
            assert.strictEqual(clipboardManager.canPaste(), false);
        });
    });

    describe('getClipboardData', () => {
        it('should return null when clipboard is empty', () => {
            assert.strictEqual(clipboardManager.getClipboardData(), null);
        });

        it('should return clipboard data with correct structure', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            const data = clipboardManager.getClipboardData();
            assert.notStrictEqual(data, null);
            assert.strictEqual(data!.operation, 'copy');
            assert.strictEqual(data!.items.length, 1);
            assert.strictEqual(data!.sourceProvider, 'test');
            assert.ok(data!.timestamp instanceof Date);
        });

        it('should return independent copy of clipboard data', async () => {
            await clipboardManager.copy([testItems[0]]);
            
            const data1 = clipboardManager.getClipboardData();
            const data2 = clipboardManager.getClipboardData();
            
            // Should be different objects
            assert.notStrictEqual(data1, data2);
            
            // But with same content
            assert.strictEqual(data1!.operation, data2!.operation);
            assert.strictEqual(data1!.items.length, data2!.items.length);
        });
    });

    describe('operation transitions', () => {
        it('should replace previous operation when new operation is performed', async () => {
            // First copy
            await clipboardManager.copy([testItems[0]]);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'copy');
            assert.strictEqual(clipboardManager.getClipboardItems().length, 1);
            
            // Then cut different items
            await clipboardManager.cut(testItems);
            assert.strictEqual(clipboardManager.getClipboardOperation(), 'cut');
            assert.strictEqual(clipboardManager.getClipboardItems().length, 2);
        });

        it('should maintain timestamp for each operation', async () => {
            const startTime = Date.now();
            
            await clipboardManager.copy([testItems[0]]);
            const data = clipboardManager.getClipboardData();
            
            assert.ok(data!.timestamp.getTime() >= startTime);
            assert.ok(data!.timestamp.getTime() <= Date.now());
        });
    });

    describe('edge cases', () => {
        it('should handle items with special characters in paths', async () => {
            const specialItem = {
                label: 'file with spaces & symbols!.txt',
                filePath: '/path/with spaces/file with spaces & symbols!.txt',
                isDirectory: false,
                size: 100,
                modified: new Date(),
                id: 'special'
            } as IEnhancedFileItem;

            await clipboardManager.copy([specialItem]);
            
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(items[0].label, 'file with spaces & symbols!.txt');
            assert.strictEqual(items[0].filePath, '/path/with spaces/file with spaces & symbols!.txt');
        });

        it('should handle very long file paths', async () => {
            const longPath = '/very/long/path/' + 'a'.repeat(200) + '/file.txt';
            const longItem = {
                label: 'file.txt',
                filePath: longPath,
                isDirectory: false,
                size: 50,
                modified: new Date(),
                id: 'long'
            } as IEnhancedFileItem;

            await clipboardManager.copy([longItem]);
            
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(items[0].filePath, longPath);
        });

        it('should handle directories and files mixed together', async () => {
            const mixedItems = [
                {
                    label: 'file.txt',
                    filePath: '/path/file.txt',
                    isDirectory: false,
                    size: 100,
                    modified: new Date(),
                    id: 'file'
                } as IEnhancedFileItem,
                {
                    label: 'directory',
                    filePath: '/path/directory',
                    isDirectory: true,
                    size: 0,
                    modified: new Date(),
                    id: 'dir'
                } as IEnhancedFileItem
            ];

            await clipboardManager.copy(mixedItems);
            
            const items = clipboardManager.getClipboardItems();
            assert.strictEqual(items.length, 2);
            assert.strictEqual(items[0].isDirectory, false);
            assert.strictEqual(items[1].isDirectory, true);
        });
    });
});