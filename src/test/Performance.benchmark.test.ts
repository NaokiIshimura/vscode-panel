import * as assert from 'assert';
import { SearchManager } from '../services/SearchManager';
import { ClipboardManager } from '../services/ClipboardManager';
import { MultiSelectionManager } from '../services/MultiSelectionManager';
import { FileSystemCacheManager } from '../services/FileSystemCacheManager';
import { DisplayCustomizationService } from '../services/DisplayCustomizationService';
import { SortOrder } from '../types/enums';
import { IEnhancedFileItem } from '../interfaces/core';

suite('Performance Benchmark Tests', () => {
    let searchManager: SearchManager;
    let clipboardManager: ClipboardManager;
    let selectionManager: MultiSelectionManager;
    let cacheManager: FileSystemCacheManager;
    let displayService: DisplayCustomizationService;

    setup(() => {
        searchManager = new SearchManager();
        clipboardManager = new ClipboardManager();
        selectionManager = new MultiSelectionManager();
        cacheManager = new FileSystemCacheManager();
        displayService = new DisplayCustomizationService();
    });

    teardown(() => {
        clipboardManager.dispose();
        selectionManager.dispose();
        displayService.dispose();
    });

    /**
     * Create mock file items for testing
     */
    function createMockItems(count: number): IEnhancedFileItem[] {
        const items: IEnhancedFileItem[] = [];
        
        for (let i = 0; i < count; i++) {
            items.push({
                id: i.toString(),
                label: `file${i.toString().padStart(6, '0')}.txt`,
                filePath: `/workspace/folder${Math.floor(i / 100)}/file${i}.txt`,
                isDirectory: i % 10 === 0, // Every 10th item is a directory
                size: Math.floor(Math.random() * 1000000), // Random size up to 1MB
                modified: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Random date within last year
                created: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
                permissions: {
                    readable: true,
                    writable: Math.random() > 0.1, // 90% writable
                    executable: i % 10 === 0, // Directories are executable
                    hidden: Math.random() < 0.05 // 5% hidden
                }
            });
        }
        
        return items;
    }

    /**
     * Measure execution time of a function
     */
    async function measureTime<T>(fn: () => Promise<T> | T): Promise<{ result: T; duration: number }> {
        const startTime = process.hrtime.bigint();
        const result = await fn();
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        return { result, duration };
    }

    suite('Search Performance', () => {
        test('should search 1,000 items efficiently', async () => {
            const items = createMockItems(1000);
            
            const { duration } = await measureTime(async () => {
                return await searchManager.search('file', items);
            });
            
            // Should complete within 100ms for 1,000 items
            assert.strictEqual(duration < 100, true, `Search took ${duration}ms, expected < 100ms`);
        });

        test('should search 10,000 items efficiently', async () => {
            const items = createMockItems(10000);
            
            const { duration } = await measureTime(async () => {
                return await searchManager.search('file', items);
            });
            
            // Should complete within 500ms for 10,000 items
            assert.strictEqual(duration < 500, true, `Search took ${duration}ms, expected < 500ms`);
        });

        test('should handle complex regex search efficiently', async () => {
            const items = createMockItems(5000);
            
            const { duration } = await measureTime(async () => {
                return await searchManager.search('file\\d{3}', items, { patternType: 'regex' });
            });
            
            // Regex search should complete within 200ms for 5,000 items
            assert.strictEqual(duration < 200, true, `Regex search took ${duration}ms, expected < 200ms`);
        });

        test('should handle wildcard search efficiently', async () => {
            const items = createMockItems(5000);
            
            const { duration } = await measureTime(async () => {
                return await searchManager.search('file*.txt', items, { patternType: 'wildcard' });
            });
            
            // Wildcard search should complete within 150ms for 5,000 items
            assert.strictEqual(duration < 150, true, `Wildcard search took ${duration}ms, expected < 150ms`);
        });
    });

    suite('Selection Performance', () => {
        test('should handle large selection sets efficiently', async () => {
            const items = createMockItems(10000);
            
            const { duration } = await measureTime(() => {
                selectionManager.setSelection(items);
                return selectionManager.getSelection();
            });
            
            // Should complete within 50ms for 10,000 items
            assert.strictEqual(duration < 50, true, `Selection took ${duration}ms, expected < 50ms`);
        });

        test('should handle rapid selection changes efficiently', async () => {
            const items = createMockItems(1000);
            
            const { duration } = await measureTime(() => {
                for (let i = 0; i < 100; i++) {
                    selectionManager.setSelection([items[i % items.length]]);
                }
                return selectionManager.getSelection();
            });
            
            // Should complete within 100ms for 100 rapid changes
            assert.strictEqual(duration < 100, true, `Rapid selection took ${duration}ms, expected < 100ms`);
        });

        test('should handle selection toggle efficiently', async () => {
            const items = createMockItems(1000);
            selectionManager.updateAllItems(items);
            
            const { duration } = await measureTime(() => {
                for (let i = 0; i < 100; i++) {
                    selectionManager.toggleSelection(items[i]);
                }
                return selectionManager.getSelection();
            });
            
            // Should complete within 50ms for 100 toggles
            assert.strictEqual(duration < 50, true, `Selection toggle took ${duration}ms, expected < 50ms`);
        });
    });

    suite('Clipboard Performance', () => {
        test('should handle large clipboard operations efficiently', async () => {
            const items = createMockItems(1000);
            
            const { duration } = await measureTime(async () => {
                await clipboardManager.copy(items);
                return clipboardManager.getClipboardItems();
            });
            
            // Should complete within 50ms for 1,000 items
            assert.strictEqual(duration < 50, true, `Clipboard copy took ${duration}ms, expected < 50ms`);
        });

        test('should handle rapid clipboard operations efficiently', async () => {
            const items = createMockItems(100);
            
            const { duration } = await measureTime(async () => {
                for (let i = 0; i < 50; i++) {
                    await clipboardManager.copy([items[i % items.length]]);
                    await clipboardManager.cut([items[(i + 1) % items.length]]);
                }
                return clipboardManager.getClipboardItems();
            });
            
            // Should complete within 100ms for 100 operations
            assert.strictEqual(duration < 100, true, `Rapid clipboard ops took ${duration}ms, expected < 100ms`);
        });
    });

    suite('Sorting Performance', () => {
        test('should sort large datasets efficiently', async () => {
            const items = createMockItems(10000);
            
            const sortOrders = [SortOrder.NameAsc, SortOrder.NameDesc, SortOrder.SizeAsc, SortOrder.SizeDesc];
            
            for (const sortOrder of sortOrders) {
                const { duration } = await measureTime(() => {
                    return items.sort((a, b) => {
                        switch (sortOrder) {
                            case SortOrder.NameAsc:
                                return a.label.localeCompare(b.label);
                            case SortOrder.NameDesc:
                                return b.label.localeCompare(a.label);
                            case SortOrder.SizeAsc:
                                return a.size - b.size;
                            case SortOrder.SizeDesc:
                                return b.size - a.size;
                            default:
                                return 0;
                        }
                    });
                });
                
                // Should complete within 100ms for 10,000 items
                assert.strictEqual(duration < 100, true, 
                    `Sorting ${sortOrder} took ${duration}ms, expected < 100ms`);
            }
        });
    });

    suite('Cache Performance', () => {
        test('should handle cache operations efficiently', async () => {
            const { duration } = await measureTime(() => {
                // Simulate cache operations
                for (let i = 0; i < 1000; i++) {
                    const key = `test-key-${i}`;
                    const value = { data: `test-data-${i}`, timestamp: Date.now() };
                    
                    cacheManager.set(key, value);
                    cacheManager.get(key);
                }
                
                return cacheManager.size();
            });
            
            // Should complete within 50ms for 1,000 cache operations
            assert.strictEqual(duration < 50, true, `Cache operations took ${duration}ms, expected < 50ms`);
        });

        test('should handle cache cleanup efficiently', async () => {
            // Fill cache with items
            for (let i = 0; i < 1000; i++) {
                cacheManager.set(`key-${i}`, { data: `value-${i}` }, 1); // 1ms TTL
            }
            
            // Wait for items to expire
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const { duration } = await measureTime(() => {
                cacheManager.cleanup();
                return cacheManager.size();
            });
            
            // Should complete within 20ms for cleanup
            assert.strictEqual(duration < 20, true, `Cache cleanup took ${duration}ms, expected < 20ms`);
        });
    });

    suite('Memory Usage', () => {
        test('should not leak memory during operations', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Perform memory-intensive operations
            for (let i = 0; i < 10; i++) {
                const items = createMockItems(1000);
                await searchManager.search('test', items);
                selectionManager.setSelection(items);
                await clipboardManager.copy(items);
                clipboardManager.clear();
                selectionManager.clearSelection();
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // Memory increase should be reasonable (less than 50MB)
            const maxMemoryIncrease = 50 * 1024 * 1024; // 50MB
            assert.strictEqual(memoryIncrease < maxMemoryIncrease, true, 
                `Memory increased by ${Math.round(memoryIncrease / 1024 / 1024)}MB, expected < 50MB`);
        });
    });

    suite('Concurrent Operations', () => {
        test('should handle concurrent search operations efficiently', async () => {
            const items = createMockItems(5000);
            
            const { duration } = await measureTime(async () => {
                const promises = [];
                
                // Start 10 concurrent searches
                for (let i = 0; i < 10; i++) {
                    promises.push(searchManager.search(`file${i}`, items));
                }
                
                return await Promise.all(promises);
            });
            
            // Should complete within 300ms for 10 concurrent searches
            assert.strictEqual(duration < 300, true, 
                `Concurrent searches took ${duration}ms, expected < 300ms`);
        });

        test('should handle concurrent clipboard operations efficiently', async () => {
            const items = createMockItems(100);
            
            const { duration } = await measureTime(async () => {
                const promises = [];
                
                // Start 5 concurrent clipboard operations
                for (let i = 0; i < 5; i++) {
                    promises.push(clipboardManager.copy([items[i]]));
                }
                
                return await Promise.all(promises);
            });
            
            // Should complete within 100ms for 5 concurrent operations
            assert.strictEqual(duration < 100, true, 
                `Concurrent clipboard ops took ${duration}ms, expected < 100ms`);
        });
    });

    suite('Stress Tests', () => {
        test('should handle extreme dataset sizes', async () => {
            // Test with very large dataset
            const items = createMockItems(50000);
            
            const { duration } = await measureTime(async () => {
                return await searchManager.search('file', items);
            });
            
            // Should complete within 2 seconds for 50,000 items
            assert.strictEqual(duration < 2000, true, 
                `Large dataset search took ${duration}ms, expected < 2000ms`);
        });

        test('should handle rapid repeated operations', async () => {
            const items = createMockItems(100);
            
            const { duration } = await measureTime(async () => {
                for (let i = 0; i < 1000; i++) {
                    await searchManager.search('test', items);
                    selectionManager.setSelection([items[i % items.length]]);
                    await clipboardManager.copy([items[i % items.length]]);
                }
            });
            
            // Should complete within 1 second for 1000 rapid operations
            assert.strictEqual(duration < 1000, true, 
                `Rapid operations took ${duration}ms, expected < 1000ms`);
        });
    });
});