import * as assert from 'assert';
import { MultiSelectionManager } from '../services/MultiSelectionManager';
import { IEnhancedFileItem } from '../interfaces/core';

describe('MultiSelectionManager Integration', () => {
    let manager: MultiSelectionManager;
    let testItems: IEnhancedFileItem[];

    beforeEach(() => {
        manager = new MultiSelectionManager();
        
        // Create test file items
        testItems = [
            {
                label: 'file1.txt',
                filePath: '/test/file1.txt',
                isDirectory: false,
                size: 100,
                modified: new Date('2023-01-01'),
                id: '/test/file1.txt'
            } as IEnhancedFileItem,
            {
                label: 'file2.txt',
                filePath: '/test/file2.txt',
                isDirectory: false,
                size: 200,
                modified: new Date('2023-01-02'),
                id: '/test/file2.txt'
            } as IEnhancedFileItem,
            {
                label: 'folder1',
                filePath: '/test/folder1',
                isDirectory: true,
                size: 0,
                modified: new Date('2023-01-03'),
                id: '/test/folder1'
            } as IEnhancedFileItem,
            {
                label: 'file3.txt',
                filePath: '/test/file3.txt',
                isDirectory: false,
                size: 300,
                modified: new Date('2023-01-04'),
                id: '/test/file3.txt'
            } as IEnhancedFileItem,
            {
                label: 'folder2',
                filePath: '/test/folder2',
                isDirectory: true,
                size: 0,
                modified: new Date('2023-01-05'),
                id: '/test/folder2'
            } as IEnhancedFileItem
        ];
        
        manager.updateAllItems(testItems);
    });

    afterEach(() => {
        manager.dispose();
    });

    describe('Tree Provider Integration Scenarios', () => {
        it('should handle tree refresh with selection preservation', () => {
            // Select some items
            manager.setSelection([testItems[0], testItems[2]]);
            assert.strictEqual(manager.getSelectionCount(), 2);
            
            // Simulate tree refresh with same items
            manager.updateAllItems(testItems);
            
            // Selection should be preserved
            assert.strictEqual(manager.getSelectionCount(), 2);
            assert.strictEqual(manager.isSelected(testItems[0]), true);
            assert.strictEqual(manager.isSelected(testItems[2]), true);
        });

        it('should handle tree refresh with some items removed', () => {
            // Select items
            manager.setSelection([testItems[0], testItems[1], testItems[2]]);
            assert.strictEqual(manager.getSelectionCount(), 3);
            
            // Simulate tree refresh with some items removed
            const updatedItems = [testItems[0], testItems[2], testItems[4]]; // Remove testItems[1] and testItems[3]
            manager.updateAllItems(updatedItems);
            
            // Only items that still exist should remain selected
            assert.strictEqual(manager.getSelectionCount(), 2);
            assert.strictEqual(manager.isSelected(testItems[0]), true);
            assert.strictEqual(manager.isSelected(testItems[1]), false); // Removed
            assert.strictEqual(manager.isSelected(testItems[2]), true);
        });

        it('should handle tree refresh with all items changed', () => {
            // Select items
            manager.setSelection([testItems[0], testItems[1]]);
            assert.strictEqual(manager.getSelectionCount(), 2);
            
            // Simulate tree refresh with completely different items
            const newItems: IEnhancedFileItem[] = [
                {
                    label: 'newfile1.txt',
                    filePath: '/test/newfile1.txt',
                    isDirectory: false,
                    size: 150,
                    modified: new Date('2023-02-01'),
                    id: '/test/newfile1.txt'
                } as IEnhancedFileItem,
                {
                    label: 'newfolder1',
                    filePath: '/test/newfolder1',
                    isDirectory: true,
                    size: 0,
                    modified: new Date('2023-02-02'),
                    id: '/test/newfolder1'
                } as IEnhancedFileItem
            ];
            
            manager.updateAllItems(newItems);
            
            // All previous selections should be cleared
            assert.strictEqual(manager.getSelectionCount(), 0);
            assert.strictEqual(manager.getLastSelectedItem(), null);
        });
    });

    describe('Multi-Provider Scenarios', () => {
        it('should handle selection transfer between providers', () => {
            // Simulate first provider selecting items
            const provider1Selection = [testItems[0], testItems[1]];
            manager.setSelection(provider1Selection);
            
            // Get selection data for transfer
            const selectionData = manager.getSelection();
            assert.deepStrictEqual(selectionData, provider1Selection);
            
            // Simulate second provider receiving selection
            const manager2 = new MultiSelectionManager();
            manager2.updateAllItems(testItems);
            manager2.setSelection(selectionData);
            
            // Second manager should have same selection
            assert.strictEqual(manager2.getSelectionCount(), 2);
            assert.strictEqual(manager2.isSelected(testItems[0]), true);
            assert.strictEqual(manager2.isSelected(testItems[1]), true);
            
            manager2.dispose();
        });

        it('should handle cross-provider selection events', () => {
            let eventCount = 0;
            let lastEventData: IEnhancedFileItem[] = [];
            
            // Listen to selection changes
            manager.onSelectionChanged((selection) => {
                eventCount++;
                lastEventData = selection;
            });
            
            // Make selection changes
            manager.addToSelection(testItems[0]);
            assert.strictEqual(eventCount, 1);
            assert.deepStrictEqual(lastEventData, [testItems[0]]);
            
            manager.addToSelection(testItems[1]);
            assert.strictEqual(eventCount, 2);
            assert.strictEqual(lastEventData.length, 2);
            
            manager.clearSelection();
            assert.strictEqual(eventCount, 3);
            assert.deepStrictEqual(lastEventData, []);
        });
    });

    describe('Complex Selection Workflows', () => {
        it('should handle mixed file and directory selection', () => {
            // Select mix of files and directories
            const mixedSelection = [testItems[0], testItems[2], testItems[4]]; // file, folder, folder
            manager.setSelection(mixedSelection);
            
            const selection = manager.getSelection();
            const files = selection.filter(item => !item.isDirectory);
            const directories = selection.filter(item => item.isDirectory);
            
            assert.strictEqual(files.length, 1);
            assert.strictEqual(directories.length, 2);
            assert.strictEqual(files[0].filePath, testItems[0].filePath);
        });

        it('should handle large selection sets efficiently', () => {
            // Create large item set
            const largeItemSet: IEnhancedFileItem[] = [];
            for (let i = 0; i < 1000; i++) {
                largeItemSet.push({
                    label: `item${i}.txt`,
                    filePath: `/test/item${i}.txt`,
                    isDirectory: i % 10 === 0, // Every 10th item is a directory
                    size: i * 100,
                    modified: new Date(2023, 0, 1 + i),
                    id: `/test/item${i}.txt`
                } as IEnhancedFileItem);
            }
            
            manager.updateAllItems(largeItemSet);
            
            // Select all items
            const startTime = Date.now();
            manager.selectAll();
            const endTime = Date.now();
            
            // Should complete quickly (less than 100ms for 1000 items)
            assert.ok(endTime - startTime < 100);
            assert.strictEqual(manager.getSelectionCount(), 1000);
        });

        it('should handle rapid selection changes', () => {
            let eventCount = 0;
            
            manager.onSelectionChanged(() => {
                eventCount++;
            });
            
            // Perform rapid selection changes
            for (let i = 0; i < testItems.length; i++) {
                manager.handleCtrlClick(testItems[i]);
            }
            
            // Should fire event for each change
            assert.strictEqual(eventCount, testItems.length);
            assert.strictEqual(manager.getSelectionCount(), testItems.length);
            
            // Deselect all rapidly
            for (let i = 0; i < testItems.length; i++) {
                manager.handleCtrlClick(testItems[i]);
            }
            
            assert.strictEqual(eventCount, testItems.length * 2);
            assert.strictEqual(manager.getSelectionCount(), 0);
        });
    });

    describe('Selection State Validation', () => {
        it('should maintain consistent selection state', () => {
            // Perform various operations
            manager.addToSelection(testItems[0]);
            manager.addToSelection(testItems[1]);
            manager.removeFromSelection(testItems[0]);
            manager.addToSelection(testItems[2]);
            
            // Validate state consistency
            const selection = manager.getSelection();
            assert.strictEqual(selection.length, manager.getSelectionCount());
            
            for (const item of selection) {
                assert.strictEqual(manager.isSelected(item), true);
            }
            
            for (const item of testItems) {
                const isInSelection = selection.some(selected => selected.filePath === item.filePath);
                assert.strictEqual(manager.isSelected(item), isInSelection);
            }
        });

        it('should handle duplicate item paths correctly', () => {
            // Create items with duplicate paths (should not happen in real scenarios, but test robustness)
            const duplicateItem: IEnhancedFileItem = {
                label: 'duplicate.txt',
                filePath: testItems[0].filePath, // Same path as testItems[0]
                isDirectory: false,
                size: 500,
                modified: new Date('2023-01-10'),
                id: testItems[0].filePath
            } as IEnhancedFileItem;
            
            manager.addToSelection(testItems[0]);
            manager.addToSelection(duplicateItem);
            
            // Should only count as one selection (same path)
            assert.strictEqual(manager.getSelectionCount(), 1);
        });
    });

    describe('Memory Management', () => {
        it('should clean up properly on disposal', () => {
            // Set up selection and events
            manager.setSelection(testItems);
            
            let eventFired = false;
            const disposable = manager.onSelectionChanged(() => {
                eventFired = true;
            });
            
            // Dispose manager
            manager.dispose();
            
            // Should clear selection
            assert.strictEqual(manager.getSelectionCount(), 0);
            assert.deepStrictEqual(manager.getSelection(), []);
            
            // Events should not fire after disposal
            eventFired = false;
            try {
                manager.addToSelection(testItems[0]);
            } catch (error) {
                // May throw error after disposal, which is acceptable
            }
            
            // Clean up disposable
            disposable.dispose();
        });

        it('should handle memory efficiently with frequent updates', () => {
            // Simulate frequent item updates (like file system watching)
            for (let i = 0; i < 100; i++) {
                const updatedItems = testItems.map(item => ({
                    ...item,
                    modified: new Date(2023, 0, 1 + i) // Update modification time
                }));
                
                manager.updateAllItems(updatedItems);
                
                if (i % 10 === 0) {
                    manager.setSelection([updatedItems[0]]);
                }
            }
            
            // Should still work correctly
            assert.strictEqual(manager.getSelectionCount(), 1);
            assert.strictEqual(manager.hasSelection(), true);
        });
    });
});