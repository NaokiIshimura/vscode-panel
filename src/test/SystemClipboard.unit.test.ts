import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { IEnhancedFileItem, ClipboardData } from '../interfaces/core';

// Test system clipboard functionality without VSCode dependencies
class SystemClipboardHelper {
    /**
     * Create system clipboard content with both text and metadata
     */
    static createSystemClipboardContent(clipboardData: ClipboardData): { text: string; metadata: any } {
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
     * Parse file paths from clipboard text
     */
    static parseFilePathsFromClipboard(clipboardText: string): string[] {
        const lines = clipboardText.split('\n').filter(line => line.trim());
        const filePaths: string[] = [];
        
        for (const line of lines) {
            const trimmedPath = line.trim();
            
            // Skip empty lines and obvious non-paths
            if (!trimmedPath || trimmedPath.length < 2) {
                continue;
            }
            
            // Basic path validation (could be enhanced)
            if (this.looksLikeFilePath(trimmedPath)) {
                filePaths.push(trimmedPath);
            }
        }
        
        return filePaths;
    }

    /**
     * Check if text looks like a file path
     */
    static looksLikeFilePath(text: string): boolean {
        // Basic heuristics for file path detection
        return (
            text.includes('/') || 
            text.includes('\\') || 
            (text.length > 3 && text.includes(':')) || // Windows drive
            text.startsWith('~') || // Home directory
            text.startsWith('.') // Relative path
        );
    }

    /**
     * Validate metadata structure
     */
    static isValidMetadata(metadata: any): boolean {
        return metadata &&
               metadata.source === 'vscode-file-list-extension' &&
               metadata.version === '1.0' &&
               Array.isArray(metadata.items) &&
               (metadata.operation === 'copy' || metadata.operation === 'cut') &&
               typeof metadata.timestamp === 'string';
    }

    /**
     * Check if clipboard text contains extension data
     */
    static hasExtensionData(clipboardText: string): boolean {
        return clipboardText.includes('VSCode File List Extension');
    }

    /**
     * Extract operation from clipboard text
     */
    static extractOperationFromText(clipboardText: string): 'copy' | 'cut' | null {
        if (clipboardText.includes('コピー')) {
            return 'copy';
        } else if (clipboardText.includes('切り取り')) {
            return 'cut';
        }
        return null;
    }

    /**
     * Create file item from metadata
     */
    static createFileItemFromMetadata(itemData: any): IEnhancedFileItem {
        return {
            label: itemData.label,
            filePath: itemData.filePath,
            isDirectory: itemData.isDirectory,
            size: itemData.size,
            modified: new Date(itemData.modified),
            id: itemData.id
        } as IEnhancedFileItem;
    }
}

describe('System Clipboard Functionality', () => {
    let testItems: IEnhancedFileItem[];
    let tempDir: string;

    beforeEach(() => {
        // Create temporary directory for testing
        tempDir = path.join(__dirname, 'temp-system-test');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Create test files
        const testFile1 = path.join(tempDir, 'system1.txt');
        const testFile2 = path.join(tempDir, 'system2.txt');
        const testDir = path.join(tempDir, 'systemdir');
        
        fs.writeFileSync(testFile1, 'System test content 1');
        fs.writeFileSync(testFile2, 'System test content 2');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir);
        }
        
        // Create test items
        testItems = [
            {
                label: 'system1.txt',
                filePath: testFile1,
                isDirectory: false,
                size: 21,
                modified: new Date('2023-01-01T10:00:00Z'),
                id: testFile1
            } as IEnhancedFileItem,
            {
                label: 'system2.txt',
                filePath: testFile2,
                isDirectory: false,
                size: 21,
                modified: new Date('2023-01-02T11:00:00Z'),
                id: testFile2
            } as IEnhancedFileItem,
            {
                label: 'systemdir',
                filePath: testDir,
                isDirectory: true,
                size: 0,
                modified: new Date('2023-01-03T12:00:00Z'),
                id: testDir
            } as IEnhancedFileItem
        ];
    });

    afterEach(() => {
        // Clean up temporary files
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('Clipboard Content Creation', () => {
        it('should create proper text format for copy operation', () => {
            const clipboardData: ClipboardData = {
                items: [testItems[0]],
                operation: 'copy',
                timestamp: new Date('2023-01-01T10:00:00Z'),
                sourceProvider: 'test'
            };

            const content = SystemClipboardHelper.createSystemClipboardContent(clipboardData);
            
            assert.ok(content.text.includes('VSCode File List Extension - コピー (1 アイテム)'));
            assert.ok(content.text.includes('タイムスタンプ:')); // Just check for timestamp label
            assert.ok(content.text.includes('[ファイル] ' + testItems[0].filePath));
            
            // Check that the content has the expected structure
            const lines = content.text.split('\n');
            assert.ok(lines.length >= 4); // Header, timestamp, empty line, file entry
        });

        it('should create proper text format for cut operation', () => {
            const clipboardData: ClipboardData = {
                items: testItems,
                operation: 'cut',
                timestamp: new Date('2023-01-01T10:00:00Z'),
                sourceProvider: 'test'
            };

            const content = SystemClipboardHelper.createSystemClipboardContent(clipboardData);
            
            assert.ok(content.text.includes('VSCode File List Extension - 切り取り (3 アイテム)'));
            assert.ok(content.text.includes('[ファイル] ' + testItems[0].filePath));
            assert.ok(content.text.includes('[ファイル] ' + testItems[1].filePath));
            assert.ok(content.text.includes('[フォルダ] ' + testItems[2].filePath));
        });

        it('should create proper metadata structure', () => {
            const clipboardData: ClipboardData = {
                items: [testItems[0]],
                operation: 'copy',
                timestamp: new Date('2023-01-01T10:00:00Z'),
                sourceProvider: 'test'
            };

            const content = SystemClipboardHelper.createSystemClipboardContent(clipboardData);
            
            assert.strictEqual(content.metadata.source, 'vscode-file-list-extension');
            assert.strictEqual(content.metadata.version, '1.0');
            assert.strictEqual(content.metadata.operation, 'copy');
            assert.strictEqual(content.metadata.timestamp, '2023-01-01T10:00:00.000Z');
            assert.strictEqual(content.metadata.items.length, 1);
            assert.strictEqual(content.metadata.items[0].label, testItems[0].label);
            assert.strictEqual(content.metadata.items[0].filePath, testItems[0].filePath);
        });

        it('should handle multiple items correctly', () => {
            const clipboardData: ClipboardData = {
                items: testItems,
                operation: 'copy',
                timestamp: new Date('2023-01-01T10:00:00Z'),
                sourceProvider: 'test'
            };

            const content = SystemClipboardHelper.createSystemClipboardContent(clipboardData);
            
            // Check text format
            assert.ok(content.text.includes('(3 アイテム)'));
            assert.ok(content.text.includes('1. [ファイル]'));
            assert.ok(content.text.includes('2. [ファイル]'));
            assert.ok(content.text.includes('3. [フォルダ]'));
            
            // Check metadata
            assert.strictEqual(content.metadata.items.length, 3);
        });
    });

    describe('File Path Parsing', () => {
        it('should parse simple file paths', () => {
            const clipboardText = [
                '/home/user/file1.txt',
                '/home/user/file2.txt',
                '/home/user/directory'
            ].join('\n');

            const paths = SystemClipboardHelper.parseFilePathsFromClipboard(clipboardText);
            
            assert.strictEqual(paths.length, 3);
            assert.strictEqual(paths[0], '/home/user/file1.txt');
            assert.strictEqual(paths[1], '/home/user/file2.txt');
            assert.strictEqual(paths[2], '/home/user/directory');
        });

        it('should handle Windows paths', () => {
            const clipboardText = [
                'C:\\Users\\User\\file1.txt',
                'D:\\Projects\\file2.txt'
            ].join('\n');

            const paths = SystemClipboardHelper.parseFilePathsFromClipboard(clipboardText);
            
            assert.strictEqual(paths.length, 2);
            assert.strictEqual(paths[0], 'C:\\Users\\User\\file1.txt');
            assert.strictEqual(paths[1], 'D:\\Projects\\file2.txt');
        });

        it('should handle relative paths', () => {
            const clipboardText = [
                './relative/file.txt',
                '../parent/file.txt',
                '~/home/file.txt'
            ].join('\n');

            const paths = SystemClipboardHelper.parseFilePathsFromClipboard(clipboardText);
            
            assert.strictEqual(paths.length, 3);
            assert.strictEqual(paths[0], './relative/file.txt');
            assert.strictEqual(paths[1], '../parent/file.txt');
            assert.strictEqual(paths[2], '~/home/file.txt');
        });

        it('should filter out non-path text', () => {
            const clipboardText = [
                '/valid/path/file.txt',
                'This is not a path',
                'Another random text',
                '/another/valid/path',
                'x', // Too short
                '' // Empty line
            ].join('\n');

            const paths = SystemClipboardHelper.parseFilePathsFromClipboard(clipboardText);
            
            assert.strictEqual(paths.length, 2);
            assert.strictEqual(paths[0], '/valid/path/file.txt');
            assert.strictEqual(paths[1], '/another/valid/path');
        });

        it('should handle paths with spaces and special characters', () => {
            const clipboardText = [
                '/path/with spaces/file.txt',
                '/path/with-dashes/file.txt',
                '/path/with_underscores/file.txt',
                '/path/with (parentheses)/file.txt'
            ].join('\n');

            const paths = SystemClipboardHelper.parseFilePathsFromClipboard(clipboardText);
            
            assert.strictEqual(paths.length, 4);
            assert.ok(paths.includes('/path/with spaces/file.txt'));
            assert.ok(paths.includes('/path/with-dashes/file.txt'));
            assert.ok(paths.includes('/path/with_underscores/file.txt'));
            assert.ok(paths.includes('/path/with (parentheses)/file.txt'));
        });
    });

    describe('Path Detection Heuristics', () => {
        it('should detect Unix-style paths', () => {
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('/home/user/file.txt'), true);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('/usr/local/bin'), true);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('./relative/path'), true);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('../parent/path'), true);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('~/home/path'), true);
        });

        it('should detect Windows-style paths', () => {
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('C:\\Users\\User\\file.txt'), true);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('D:\\Projects'), true);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('.\\relative\\path'), true);
        });

        it('should reject non-path text', () => {
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('This is just text'), false);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('hello world'), false);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('x'), false);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath(''), false);
            assert.strictEqual(SystemClipboardHelper.looksLikeFilePath('123'), false);
        });
    });

    describe('Extension Data Detection', () => {
        it('should detect extension clipboard data', () => {
            const extensionText = 'VSCode File List Extension - コピー (1 アイテム)\n...';
            assert.strictEqual(SystemClipboardHelper.hasExtensionData(extensionText), true);
            
            const regularText = 'Just some regular clipboard text';
            assert.strictEqual(SystemClipboardHelper.hasExtensionData(regularText), false);
        });

        it('should extract operation from text', () => {
            const copyText = 'VSCode File List Extension - コピー (1 アイテム)';
            assert.strictEqual(SystemClipboardHelper.extractOperationFromText(copyText), 'copy');
            
            const cutText = 'VSCode File List Extension - 切り取り (2 アイテム)';
            assert.strictEqual(SystemClipboardHelper.extractOperationFromText(cutText), 'cut');
            
            const unknownText = 'Some other text';
            assert.strictEqual(SystemClipboardHelper.extractOperationFromText(unknownText), null);
        });
    });

    describe('Metadata Validation', () => {
        it('should validate correct metadata', () => {
            const validMetadata = {
                source: 'vscode-file-list-extension',
                version: '1.0',
                operation: 'copy',
                timestamp: '2023-01-01T10:00:00.000Z',
                items: []
            };
            
            assert.strictEqual(SystemClipboardHelper.isValidMetadata(validMetadata), true);
        });

        it('should reject invalid metadata', () => {
            // Missing source
            assert.strictEqual(SystemClipboardHelper.isValidMetadata({
                version: '1.0',
                operation: 'copy',
                timestamp: '2023-01-01T10:00:00.000Z',
                items: []
            }), false);
            
            // Wrong source
            assert.strictEqual(SystemClipboardHelper.isValidMetadata({
                source: 'other-extension',
                version: '1.0',
                operation: 'copy',
                timestamp: '2023-01-01T10:00:00.000Z',
                items: []
            }), false);
            
            // Invalid operation
            assert.strictEqual(SystemClipboardHelper.isValidMetadata({
                source: 'vscode-file-list-extension',
                version: '1.0',
                operation: 'invalid',
                timestamp: '2023-01-01T10:00:00.000Z',
                items: []
            }), false);
            
            // Non-array items
            assert.strictEqual(SystemClipboardHelper.isValidMetadata({
                source: 'vscode-file-list-extension',
                version: '1.0',
                operation: 'copy',
                timestamp: '2023-01-01T10:00:00.000Z',
                items: 'not an array'
            }), false);
        });
    });

    describe('File Item Creation from Metadata', () => {
        it('should create file item from metadata', () => {
            const itemData = {
                label: 'test.txt',
                filePath: '/path/to/test.txt',
                isDirectory: false,
                size: 100,
                modified: '2023-01-01T10:00:00.000Z',
                id: 'test-id'
            };
            
            const fileItem = SystemClipboardHelper.createFileItemFromMetadata(itemData);
            
            assert.strictEqual(fileItem.label, 'test.txt');
            assert.strictEqual(fileItem.filePath, '/path/to/test.txt');
            assert.strictEqual(fileItem.isDirectory, false);
            assert.strictEqual(fileItem.size, 100);
            assert.ok(fileItem.modified instanceof Date);
            assert.strictEqual(fileItem.modified.toISOString(), '2023-01-01T10:00:00.000Z');
            assert.strictEqual(fileItem.id, 'test-id');
        });

        it('should handle directory items', () => {
            const itemData = {
                label: 'testdir',
                filePath: '/path/to/testdir',
                isDirectory: true,
                size: 0,
                modified: '2023-01-01T10:00:00.000Z',
                id: 'dir-id'
            };
            
            const fileItem = SystemClipboardHelper.createFileItemFromMetadata(itemData);
            
            assert.strictEqual(fileItem.isDirectory, true);
            assert.strictEqual(fileItem.size, 0);
        });
    });
});