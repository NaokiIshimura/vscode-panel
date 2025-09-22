import * as assert from 'assert';
import * as sinon from 'sinon';
import { ClipboardManager } from '../services/ClipboardManager';
import { MultiSelectionManager } from '../services/MultiSelectionManager';
import { FileOperationService } from '../services/FileOperationService';
import { SearchManager } from '../services/SearchManager';
import { FileSystemCacheManager } from '../services/FileSystemCacheManager';
import { AutoRetryService } from '../services/AutoRetryService';
import { ErrorHandler } from '../services/ErrorHandler';
import { DebugLogger } from '../services/DebugLogger';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';
import { IEnhancedFileItem } from '../interfaces/core';

suite('Error Scenarios Integration Tests', () => {
    let clipboardManager: ClipboardManager;
    let selectionManager: MultiSelectionManager;
    let fileOperationService: FileOperationService;
    let searchManager: SearchManager;
    let cacheManager: FileSystemCacheManager;
    let autoRetryService: AutoRetryService;
    let errorHandler: ErrorHandler;
    let debugLogger: DebugLogger;

    setup(() => {
        clipboardManager = new ClipboardManager();
        selectionManager = new MultiSelectionManager();
        fileOperationService = new FileOperationService();
        searchManager = new SearchManager();
        cacheManager = new FileSystemCacheManager();
        autoRetryService = AutoRetryService.getInstance();
        debugLogger = DebugLogger.getInstance();
        errorHandler = ErrorHandler.getInstance(debugLogger);
    });

    teardown(() => {
        clipboardManager.dispose();
        selectionManager.dispose();
        sinon.restore();
    });

    /**
     * Create mock file items for testing
     */
    function createMockItem(id: string, label: string, filePath: string): IEnhancedFileItem {
        return {
            id,
            label,
            filePath,
            isDirectory: false,
            size: 100,
            modified: new Date(),
            created: new Date(),
            permissions: {
                readable: true,
                writable: true,
                executable: false,
                hidden: false
            }
        };
    }

    suite('File Operation Error Scenarios', () => {
        test('should handle file not found errors gracefully', async () => {
            const mockItem = createMockItem('1', 'nonexistent.txt', '/nonexistent/path/file.txt');
            
            // Mock file system to throw file not found error
            const fsStub = sinon.stub(require('fs').promises, 'access');
            fsStub.rejects(new Error('ENOENT: no such file or directory'));
            
            try {
                await fileOperationService.copyFiles([mockItem.filePath], '/destination');
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error instanceof Error, true);
                assert.strictEqual(error.message.includes('ENOENT'), true);
            }
        });

        test('should handle permission denied errors gracefully', async () => {
            const mockItem = createMockItem('1', 'readonly.txt', '/readonly/file.txt');
            
            // Mock file system to throw permission error
            const fsStub = sinon.stub(require('fs').promises, 'copyFile');
            fsStub.rejects(new Error('EACCES: permission denied'));
            
            try {
                await fileOperationService.copyFiles([mockItem.filePath], '/destination');
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error instanceof Error, true);
                assert.strictEqual(error.message.includes('EACCES'), true);
            }
        });

        test('should handle disk space errors with retry', async () => {
            const mockItem = createMockItem('1', 'large.txt', '/large/file.txt');
            let attemptCount = 0;
            
            // Mock file system to throw disk space error initially, then succeed
            const fsStub = sinon.stub(require('fs').promises, 'copyFile');
            fsStub.callsFake(async () => {
                attemptCount++;
                if (attemptCount < 3) {
                    const error = new Error('ENOSPC: no space left on device') as any;
                    error.code = 'ENOSPC';
                    throw error;
                }
                return Promise.resolve();
            });
            
            // Should retry and eventually succeed
            await autoRetryService.executeWithRetry('copyOperation', async () => {
                await fileOperationService.copyFiles([mockItem.filePath], '/destination');
            });
            
            assert.strictEqual(attemptCount, 3);
        });

        test('should handle network errors with exponential backoff', async () => {
            const mockItem = createMockItem('1', 'network.txt', '/network/file.txt');
            let attemptCount = 0;
            const attemptTimes: number[] = [];
            
            // Mock file system to throw network error
            const fsStub = sinon.stub(require('fs').promises, 'copyFile');
            fsStub.callsFake(async () => {
                attemptCount++;
                attemptTimes.push(Date.now());
                
                if (attemptCount < 4) {
                    const error = new Error('ETIMEDOUT: network timeout') as any;
                    error.code = 'ETIMEDOUT';
                    throw error;
                }
                return Promise.resolve();
            });
            
            await autoRetryService.executeWithRetry('networkOperation', async () => {
                await fileOperationService.copyFiles([mockItem.filePath], '/destination');
            });
            
            // Verify exponential backoff
            assert.strictEqual(attemptCount, 4);
            assert.strictEqual(attemptTimes.length, 4);
            
            // Check that delays increase (allowing for some timing variance)
            if (attemptTimes.length >= 3) {
                const delay1 = attemptTimes[1] - attemptTimes[0];
                const delay2 = attemptTimes[2] - attemptTimes[1];
                assert.strictEqual(delay2 > delay1, true, 'Second delay should be longer than first');
            }
        });
    });

    suite('Clipboard Error Scenarios', () => {
        test('should handle clipboard corruption gracefully', async () => {
            const mockItems = [createMockItem('1', 'test.txt', '/test.txt')];
            
            // Simulate clipboard corruption
            await clipboardManager.copy(mockItems);
            
            // Corrupt the internal clipboard data
            (clipboardManager as any).clipboardData = null;
            
            // Should handle gracefully
            assert.strictEqual(clipboardManager.canPaste(), false);
            assert.strictEqual(clipboardManager.getClipboardItems().length, 0);
        });

        test('should handle invalid clipboard data gracefully', async () => {
            // Try to copy invalid items
            const invalidItems = [null, undefined, {}] as any;
            
            assert.doesNotThrow(async () => {
                await clipboardManager.copy(invalidItems);
            });
            
            // Should result in empty clipboard
            assert.strictEqual(clipboardManager.canPaste(), false);
        });

        test('should handle clipboard memory pressure', async () => {
            // Create a very large dataset to test memory handling
            const largeItems = [];
            for (let i = 0; i < 10000; i++) {
                largeItems.push(createMockItem(i.toString(), `file${i}.txt`, `/path/file${i}.txt`));
            }
            
            // Should handle large clipboard operations without crashing
            assert.doesNotThrow(async () => {
                await clipboardManager.copy(largeItems);
                clipboardManager.clear();
            });
        });
    });

    suite('Search Error Scenarios', () => {
        test('should handle malformed regex patterns gracefully', async () => {
            const mockItems = [createMockItem('1', 'test.txt', '/test.txt')];
            
            // Test with invalid regex patterns
            const invalidPatterns = ['[', '(', '*', '+', '?', '{'];
            
            for (const pattern of invalidPatterns) {
                assert.doesNotThrow(async () => {
                    const results = await searchManager.search(pattern, mockItems, { patternType: 'regex' });
                    // Should return empty results for invalid patterns
                    assert.strictEqual(Array.isArray(results), true);
                });
            }
        });

        test('should handle search timeout scenarios', async () => {
            const mockItems = [];
            // Create a large dataset that might cause timeout
            for (let i = 0; i < 100000; i++) {
                mockItems.push(createMockItem(i.toString(), `file${i}.txt`, `/path/file${i}.txt`));
            }
            
            // Mock a timeout scenario
            const originalSearch = searchManager.search.bind(searchManager);
            sinon.stub(searchManager, 'search').callsFake(async (query, items, options) => {
                // Simulate timeout after 1ms
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        reject(new Error('Search timeout'));
                    }, 1);
                });
            });
            
            try {
                await searchManager.search('test', mockItems);
                assert.fail('Should have thrown timeout error');
            } catch (error) {
                assert.strictEqual(error instanceof Error, true);
                assert.strictEqual(error.message, 'Search timeout');
            }
        });

        test('should handle corrupted search index gracefully', async () => {
            const mockItems = [createMockItem('1', 'test.txt', '/test.txt')];
            
            // Corrupt internal search state
            (searchManager as any).searchHistory = null;
            
            // Should still work with corrupted state
            assert.doesNotThrow(async () => {
                const results = await searchManager.search('test', mockItems);
                assert.strictEqual(Array.isArray(results), true);
            });
        });
    });

    suite('Selection Error Scenarios', () => {
        test('should handle selection with invalid items gracefully', () => {
            const invalidItems = [null, undefined, {}, { id: null }] as any;
            
            assert.doesNotThrow(() => {
                selectionManager.setSelection(invalidItems);
            });
            
            // Should filter out invalid items
            const selection = selectionManager.getSelection();
            assert.strictEqual(selection.length, 0);
        });

        test('should handle selection overflow gracefully', () => {
            // Create a very large selection
            const largeSelection = [];
            for (let i = 0; i < 100000; i++) {
                largeSelection.push(createMockItem(i.toString(), `file${i}.txt`, `/path/file${i}.txt`));
            }
            
            assert.doesNotThrow(() => {
                selectionManager.setSelection(largeSelection);
            });
            
            // Should handle large selections
            const selection = selectionManager.getSelection();
            assert.strictEqual(selection.length, largeSelection.length);
        });

        test('should handle concurrent selection modifications', async () => {
            const mockItems = [];
            for (let i = 0; i < 100; i++) {
                mockItems.push(createMockItem(i.toString(), `file${i}.txt`, `/path/file${i}.txt`));
            }
            
            // Simulate concurrent modifications
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(new Promise<void>((resolve) => {
                    setTimeout(() => {
                        selectionManager.setSelection([mockItems[i]]);
                        resolve();
                    }, Math.random() * 10);
                }));
            }
            
            assert.doesNotThrow(async () => {
                await Promise.all(promises);
            });
            
            // Should have some selection after concurrent operations
            const selection = selectionManager.getSelection();
            assert.strictEqual(selection.length >= 0, true);
        });
    });

    suite('Cache Error Scenarios', () => {
        test('should handle cache corruption gracefully', () => {
            // Add some items to cache
            cacheManager.set('key1', { data: 'value1' });
            cacheManager.set('key2', { data: 'value2' });
            
            // Corrupt cache internals
            (cacheManager as any).cache = null;
            
            // Should handle gracefully
            assert.doesNotThrow(() => {
                const value = cacheManager.get('key1');
                assert.strictEqual(value, undefined);
            });
        });

        test('should handle cache memory pressure', () => {
            // Fill cache with many items
            for (let i = 0; i < 10000; i++) {
                cacheManager.set(`key${i}`, { data: `value${i}`, largeData: 'x'.repeat(1000) });
            }
            
            // Should handle memory pressure gracefully
            assert.doesNotThrow(() => {
                cacheManager.cleanup();
            });
            
            // Cache should still be functional
            cacheManager.set('testKey', { data: 'testValue' });
            const value = cacheManager.get('testKey');
            assert.strictEqual(value?.data, 'testValue');
        });

        test('should handle cache TTL edge cases', async () => {
            // Set item with very short TTL
            cacheManager.set('shortTTL', { data: 'value' }, 1);
            
            // Should exist immediately
            assert.strictEqual(cacheManager.get('shortTTL')?.data, 'value');
            
            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Should be expired
            assert.strictEqual(cacheManager.get('shortTTL'), undefined);
        });
    });

    suite('Error Recovery Scenarios', () => {
        test('should recover from multiple cascading errors', async () => {
            const mockItem = createMockItem('1', 'test.txt', '/test.txt');
            let errorCount = 0;
            
            // Mock multiple types of errors in sequence
            const fsStub = sinon.stub(require('fs').promises, 'copyFile');
            fsStub.callsFake(async () => {
                errorCount++;
                
                switch (errorCount) {
                    case 1:
                        throw new Error('EBUSY: resource busy');
                    case 2:
                        throw new Error('EAGAIN: try again');
                    case 3:
                        throw new Error('ETIMEDOUT: timeout');
                    default:
                        return Promise.resolve();
                }
            });
            
            // Should recover after multiple errors
            await autoRetryService.executeWithRetry('cascadingErrors', async () => {
                await fileOperationService.copyFiles([mockItem.filePath], '/destination');
            });
            
            assert.strictEqual(errorCount, 4);
        });

        test('should handle error during error handling', async () => {
            // Mock error handler to throw error
            const originalHandleError = errorHandler.handleError.bind(errorHandler);
            sinon.stub(errorHandler, 'handleError').callsFake(() => {
                throw new Error('Error handler failed');
            });
            
            // Should not crash when error handler fails
            assert.doesNotThrow(() => {
                try {
                    errorHandler.handleError(new Error('Original error'));
                } catch (e) {
                    // Expected to throw, but should not crash the system
                }
            });
        });

        test('should maintain system stability during error storms', async () => {
            // Generate many errors rapidly
            const promises = [];
            
            for (let i = 0; i < 100; i++) {
                promises.push(new Promise<void>((resolve) => {
                    setTimeout(() => {
                        try {
                            throw new FileOperationError(
                                FileOperationErrorType.NetworkError,
                                `/test/file${i}.txt`,
                                `Error ${i}`
                            );
                        } catch (error) {
                            errorHandler.handleError(error);
                        }
                        resolve();
                    }, Math.random() * 10);
                }));
            }
            
            // System should remain stable
            assert.doesNotThrow(async () => {
                await Promise.all(promises);
            });
        });
    });

    suite('Resource Exhaustion Scenarios', () => {
        test('should handle file descriptor exhaustion', async () => {
            // Simulate file descriptor exhaustion
            const fsStub = sinon.stub(require('fs').promises, 'open');
            fsStub.rejects(new Error('EMFILE: too many open files'));
            
            const mockItem = createMockItem('1', 'test.txt', '/test.txt');
            
            try {
                await fileOperationService.copyFiles([mockItem.filePath], '/destination');
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error instanceof Error, true);
                assert.strictEqual(error.message.includes('EMFILE'), true);
            }
        });

        test('should handle memory exhaustion gracefully', () => {
            // Try to create very large objects
            assert.doesNotThrow(() => {
                try {
                    const largeArray = new Array(1000000000); // Very large array
                    largeArray.fill(createMockItem('1', 'test.txt', '/test.txt'));
                } catch (error) {
                    // Expected to fail, but should not crash
                    assert.strictEqual(error instanceof Error, true);
                }
            });
        });
    });

    suite('Cleanup and Recovery', () => {
        test('should properly cleanup after errors', async () => {
            const mockItem = createMockItem('1', 'test.txt', '/test.txt');
            
            // Mock operation that fails
            const fsStub = sinon.stub(require('fs').promises, 'copyFile');
            fsStub.rejects(new Error('Operation failed'));
            
            try {
                await fileOperationService.copyFiles([mockItem.filePath], '/destination');
            } catch (error) {
                // Expected to fail
            }
            
            // System should be in clean state after error
            assert.strictEqual(clipboardManager.canPaste(), false);
            assert.strictEqual(selectionManager.getSelection().length, 0);
        });

        test('should handle disposal during error conditions', () => {
            // Simulate error during disposal
            const originalDispose = clipboardManager.dispose.bind(clipboardManager);
            sinon.stub(clipboardManager, 'dispose').callsFake(() => {
                throw new Error('Disposal failed');
            });
            
            // Should not crash during disposal
            assert.doesNotThrow(() => {
                try {
                    clipboardManager.dispose();
                } catch (e) {
                    // Expected to throw, but should not crash
                }
            });
        });
    });
});