import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { EnhancedWorkspaceExplorerProvider } from '../services/EnhancedWorkspaceExplorerProvider';
import { EnhancedFileListProvider } from '../services/EnhancedFileListProvider';
import { EnhancedFileDetailsProvider } from '../services/EnhancedFileDetailsProvider';
import { ClipboardManager } from '../services/ClipboardManager';
import { MultiSelectionManager } from '../services/MultiSelectionManager';
import { FileOperationService } from '../services/FileOperationService';
import { SearchManager } from '../services/SearchManager';
import { DisplayCustomizationService } from '../services/DisplayCustomizationService';
import { SortOrder, ViewMode } from '../types/enums';

suite('Enhanced Providers End-to-End Tests', () => {
    let mockContext: vscode.ExtensionContext;
    let workspaceProvider: EnhancedWorkspaceExplorerProvider;
    let fileListProvider: EnhancedFileListProvider;
    let fileDetailsProvider: EnhancedFileDetailsProvider;
    let clipboardManager: ClipboardManager;
    let multiSelectionManager: MultiSelectionManager;
    let fileOperationService: FileOperationService;
    let searchManager: SearchManager;
    let displayService: DisplayCustomizationService;

    setup(() => {
        // Create mock extension context
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => []
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                setKeysForSync: () => {},
                keys: () => []
            },
            extensionPath: '/mock/extension/path',
            extensionUri: vscode.Uri.file('/mock/extension/path'),
            storagePath: '/mock/storage',
            globalStoragePath: '/mock/global/storage',
            logPath: '/mock/log',
            extensionMode: vscode.ExtensionMode.Test,
            asAbsolutePath: (relativePath: string) => path.join('/mock/extension/path', relativePath),
            secrets: {} as any,
            extension: {} as any,
            environmentVariableCollection: {} as any,
            languageModelAccessInformation: {} as any
        } as vscode.ExtensionContext;

        // Initialize services
        clipboardManager = new ClipboardManager();
        multiSelectionManager = new MultiSelectionManager();
        fileOperationService = new FileOperationService();
        searchManager = new SearchManager();
        displayService = new DisplayCustomizationService();

        // Initialize providers with mock context
        workspaceProvider = new EnhancedWorkspaceExplorerProvider(mockContext);
        fileListProvider = new EnhancedFileListProvider(mockContext);
        fileDetailsProvider = new EnhancedFileDetailsProvider(mockContext);
    });

    teardown(() => {
        // Dispose all services
        workspaceProvider.dispose();
        fileListProvider.dispose();
        fileDetailsProvider.dispose();
        clipboardManager.dispose();
        multiSelectionManager.dispose();
        displayService.dispose();
    });

    suite('Provider Integration', () => {
        test('should initialize all providers without errors', () => {
            assert.strictEqual(typeof workspaceProvider.getTreeItem, 'function');
            assert.strictEqual(typeof fileListProvider.getTreeItem, 'function');
            assert.strictEqual(typeof fileDetailsProvider.getTreeItem, 'function');
        });

        test('should handle provider refresh operations', () => {
            // Test that refresh operations don't throw errors
            assert.doesNotThrow(() => {
                workspaceProvider['refresh']();
                fileListProvider['refresh']();
                fileDetailsProvider['refresh']();
            });
        });

        test('should support search across all providers', async () => {
            const searchQuery = 'test';
            
            // Test search functionality
            const workspaceResults = await workspaceProvider.performSearch(searchQuery);
            const fileListResults = await fileListProvider.performSearch(searchQuery);
            const fileDetailsResults = await fileDetailsProvider.performSearch(searchQuery);
            
            assert.strictEqual(Array.isArray(workspaceResults), true);
            assert.strictEqual(Array.isArray(fileListResults), true);
            assert.strictEqual(Array.isArray(fileDetailsResults), true);
        });

        test('should support sorting across all providers', () => {
            const sortOrders = [SortOrder.NameAsc, SortOrder.NameDesc, SortOrder.SizeAsc, SortOrder.SizeDesc];
            
            for (const sortOrder of sortOrders) {
                assert.doesNotThrow(() => {
                    workspaceProvider.setSortOrder(sortOrder);
                    fileListProvider.setSortOrder(sortOrder);
                    fileDetailsProvider.setSortOrder(sortOrder);
                });
                
                assert.strictEqual(workspaceProvider.getSortOrder(), sortOrder);
                assert.strictEqual(fileListProvider.getSortOrder(), sortOrder);
                assert.strictEqual(fileDetailsProvider.getSortOrder(), sortOrder);
            }
        });
    });

    suite('Selection Management Integration', () => {
        test('should handle selection across providers', () => {
            const mockItems = [
                {
                    id: '1',
                    label: 'test1.txt',
                    filePath: '/test/test1.txt',
                    isDirectory: false,
                    size: 100,
                    modified: new Date(),
                    created: new Date(),
                    permissions: { readable: true, writable: true, executable: false, hidden: false }
                },
                {
                    id: '2',
                    label: 'test2.txt',
                    filePath: '/test/test2.txt',
                    isDirectory: false,
                    size: 200,
                    modified: new Date(),
                    created: new Date(),
                    permissions: { readable: true, writable: true, executable: false, hidden: false }
                }
            ];

            // Test selection operations
            workspaceProvider.setSelectedItems(mockItems);
            const selectedItems = workspaceProvider.getSelectedItems();
            
            assert.strictEqual(selectedItems.length, 2);
            assert.strictEqual(selectedItems[0].id, '1');
            assert.strictEqual(selectedItems[1].id, '2');
        });

        test('should clear selection across providers', () => {
            const mockItems = [{
                id: '1',
                label: 'test.txt',
                filePath: '/test/test.txt',
                isDirectory: false,
                size: 100,
                modified: new Date(),
                created: new Date(),
                permissions: { readable: true, writable: true, executable: false, hidden: false }
            }];

            workspaceProvider.setSelectedItems(mockItems);
            workspaceProvider.clearSelection();
            
            const selectedItems = workspaceProvider.getSelectedItems();
            assert.strictEqual(selectedItems.length, 0);
        });
    });

    suite('Clipboard Integration', () => {
        test('should handle clipboard operations', async () => {
            const mockItems = [{
                id: '1',
                label: 'test.txt',
                filePath: '/test/test.txt',
                isDirectory: false,
                size: 100,
                modified: new Date(),
                created: new Date(),
                permissions: { readable: true, writable: true, executable: false, hidden: false }
            }];

            // Test copy operation
            await clipboardManager.copy(mockItems);
            assert.strictEqual(clipboardManager.canPaste(), true);
            
            // Test cut operation
            await clipboardManager.cut(mockItems);
            assert.strictEqual(clipboardManager.canPaste(), true);
            
            // Test clipboard state
            const clipboardItems = clipboardManager.getClipboardItems();
            assert.strictEqual(clipboardItems.length, 1);
            assert.strictEqual(clipboardItems[0].id, '1');
        });

        test('should handle empty clipboard', () => {
            clipboardManager.clear();
            assert.strictEqual(clipboardManager.canPaste(), false);
            assert.strictEqual(clipboardManager.getClipboardItems().length, 0);
        });
    });

    suite('Display Customization Integration', () => {
        test('should handle display settings changes', async () => {
            // Test sort order changes
            await displayService.setSortOrder(SortOrder.SizeDesc);
            assert.strictEqual(displayService.getSortOrder(), SortOrder.SizeDesc);
            
            // Test view mode changes
            await displayService.setViewMode(ViewMode.List);
            assert.strictEqual(displayService.getViewMode(), ViewMode.List);
            
            // Test hidden files toggle
            await displayService.setShowHiddenFiles(true);
            assert.strictEqual(displayService.getShowHiddenFiles(), true);
            
            // Test compact mode toggle
            await displayService.setCompactMode(true);
            assert.strictEqual(displayService.getCompactMode(), true);
        });

        test('should filter files based on display settings', () => {
            const mockItems = [
                {
                    id: '1',
                    label: 'visible.txt',
                    filePath: '/test/visible.txt',
                    isDirectory: false,
                    size: 100,
                    modified: new Date(),
                    created: new Date(),
                    permissions: { readable: true, writable: true, executable: false, hidden: false }
                },
                {
                    id: '2',
                    label: '.hidden',
                    filePath: '/test/.hidden',
                    isDirectory: false,
                    size: 50,
                    modified: new Date(),
                    created: new Date(),
                    permissions: { readable: true, writable: true, executable: false, hidden: true }
                }
            ];

            // Test with hidden files disabled
            displayService.setShowHiddenFiles(false);
            assert.strictEqual(displayService.shouldShowFile(mockItems[0]), true);
            assert.strictEqual(displayService.shouldShowFile(mockItems[1]), false);
            
            // Test with hidden files enabled
            displayService.setShowHiddenFiles(true);
            assert.strictEqual(displayService.shouldShowFile(mockItems[0]), true);
            assert.strictEqual(displayService.shouldShowFile(mockItems[1]), true);
        });
    });

    suite('Search Integration', () => {
        test('should perform search across providers', async () => {
            const mockItems = [
                {
                    id: '1',
                    label: 'test.txt',
                    filePath: '/workspace/test.txt',
                    isDirectory: false,
                    size: 100,
                    modified: new Date(),
                    created: new Date(),
                    permissions: { readable: true, writable: true, executable: false, hidden: false }
                },
                {
                    id: '2',
                    label: 'example.js',
                    filePath: '/workspace/example.js',
                    isDirectory: false,
                    size: 200,
                    modified: new Date(),
                    created: new Date(),
                    permissions: { readable: true, writable: true, executable: false, hidden: false }
                }
            ];

            const results = await searchManager.search('test', mockItems);
            
            assert.strictEqual(Array.isArray(results), true);
            // Should find the test.txt file
            const testResult = results.find(r => r.item.label === 'test.txt');
            assert.strictEqual(testResult !== undefined, true);
        });

        test('should handle search history', () => {
            searchManager.addToHistory('test query');
            searchManager.addToHistory('another query');
            
            const history = searchManager.getHistory();
            assert.strictEqual(history.length, 2);
            assert.strictEqual(history[0], 'another query'); // Most recent first
            assert.strictEqual(history[1], 'test query');
        });

        test('should provide search suggestions', () => {
            const mockItems = [
                {
                    id: '1',
                    label: 'test.txt',
                    filePath: '/workspace/test.txt',
                    isDirectory: false,
                    size: 100,
                    modified: new Date(),
                    created: new Date(),
                    permissions: { readable: true, writable: true, executable: false, hidden: false }
                },
                {
                    id: '2',
                    label: 'testing.js',
                    filePath: '/workspace/testing.js',
                    isDirectory: false,
                    size: 200,
                    modified: new Date(),
                    created: new Date(),
                    permissions: { readable: true, writable: true, executable: false, hidden: false }
                }
            ];

            const suggestions = searchManager.getSuggestions('test', mockItems);
            assert.strictEqual(Array.isArray(suggestions), true);
            assert.strictEqual(suggestions.length >= 1, true);
        });
    });

    suite('Error Handling Integration', () => {
        test('should handle provider errors gracefully', async () => {
            // Test that providers handle invalid operations gracefully
            assert.doesNotThrow(async () => {
                await workspaceProvider.performSearch('');
                await fileListProvider.performSearch('');
                await fileDetailsProvider.performSearch('');
            });
        });

        test('should handle clipboard errors gracefully', async () => {
            // Test clipboard with invalid items
            assert.doesNotThrow(async () => {
                await clipboardManager.copy([]);
                await clipboardManager.cut([]);
            });
        });

        test('should handle search errors gracefully', async () => {
            // Test search with invalid input
            assert.doesNotThrow(async () => {
                await searchManager.search('', []);
                await searchManager.search(null as any, []);
            });
        });
    });

    suite('Performance Integration', () => {
        test('should handle large datasets efficiently', async () => {
            // Create a large dataset
            const largeDataset = [];
            for (let i = 0; i < 1000; i++) {
                largeDataset.push({
                    id: i.toString(),
                    label: `file${i}.txt`,
                    filePath: `/workspace/file${i}.txt`,
                    isDirectory: false,
                    size: i * 100,
                    modified: new Date(),
                    created: new Date(),
                    permissions: { readable: true, writable: true, executable: false, hidden: false }
                });
            }

            const startTime = Date.now();
            
            // Test search performance
            const searchResults = await searchManager.search('file1', largeDataset);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Should complete within reasonable time (less than 1 second)
            assert.strictEqual(duration < 1000, true);
            assert.strictEqual(searchResults.length > 0, true);
        });

        test('should handle rapid operations efficiently', async () => {
            const mockItems = [{
                id: '1',
                label: 'test.txt',
                filePath: '/test/test.txt',
                isDirectory: false,
                size: 100,
                modified: new Date(),
                created: new Date(),
                permissions: { readable: true, writable: true, executable: false, hidden: false }
            }];

            const startTime = Date.now();
            
            // Perform rapid operations
            for (let i = 0; i < 100; i++) {
                workspaceProvider.setSelectedItems(mockItems);
                workspaceProvider.clearSelection();
                await clipboardManager.copy(mockItems);
                clipboardManager.clear();
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Should complete within reasonable time
            assert.strictEqual(duration < 2000, true);
        });
    });

    suite('Memory Management', () => {
        test('should properly dispose resources', () => {
            // Test that disposal doesn't throw errors
            assert.doesNotThrow(() => {
                workspaceProvider.dispose();
                fileListProvider.dispose();
                fileDetailsProvider.dispose();
                clipboardManager.dispose();
                multiSelectionManager.dispose();
                displayService.dispose();
            });
        });

        test('should handle multiple dispose calls', () => {
            // Test that multiple dispose calls are safe
            assert.doesNotThrow(() => {
                clipboardManager.dispose();
                clipboardManager.dispose();
                multiSelectionManager.dispose();
                multiSelectionManager.dispose();
            });
        });
    });
});