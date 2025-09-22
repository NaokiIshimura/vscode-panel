import * as assert from 'assert';
import { MultiSelectionManager } from '../services/MultiSelectionManager';
import { IEnhancedFileItem } from '../interfaces/core';

describe('MultiSelectionManager', () => {
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
            } as IEnhancedFileItem
        ];
        
        manager.updateAllItems(testItems);
    });

    describe('Basic Selection Operations', () => {
        it('should start with no selection', () => {
            assert.deepStrictEqual(manager.getSelection(), []);
            assert.strictEqual(manager.hasSelection(), false);
            assert.strictEqual(manager.getSelectionCount(), 0);
        });

        it('should add item to selection', () => {
            manager.addToSelection(testItems[0]);
            
            assert.deepStrictEqual(manager.getSelection(), [testItems[0]]);
            assert.strictEqual(manager.isSelected(testItems[0]), true);
            assert.strictEqual(manager.hasSelection(), true);
            assert.strictEqual(manager.getSelectionCount(), 1);
            assert.strictEqual(manager.getLastSelectedItem(), testItems[0]);
        });

        it('should remove item from selection', () => {
            manager.addToSelection(testItems[0]);
            manager.addToSelection(testItems[1]);
            manager.removeFromSelection(testItems[0]);
            
            assert.deepStrictEqual(manager.getSelection(), [testItems[1]]);
            assert.strictEqual(manager.isSelected(testItems[0]), false);
            assert.strictEqual(manager.isSelected(testItems[1]), true);
            assert.strictEqual(manager.getSelectionCount(), 1);
        });

        it('should set entire selection', () => {
            const selectedItems = [testItems[0], testItems[2]];
            manager.setSelection(selectedItems);
            
            assert.deepStrictEqual(manager.getSelection(), selectedItems);
            assert.strictEqual(manager.isSelected(testItems[0]), true);
            assert.strictEqual(manager.isSelected(testItems[1]), false);
            assert.strictEqual(manager.isSelected(testItems[2]), true);
            assert.strictEqual(manager.getSelectionCount(), 2);
        });

        it('should clear all selections', () => {
            manager.setSelection([testItems[0], testItems[1]]);
            manager.clearSelection();
            
            assert.deepStrictEqual(manager.getSelection(), []);
            assert.strictEqual(manager.hasSelection(), false);
            assert.strictEqual(manager.getSelectionCount(), 0);
            assert.strictEqual(manager.getLastSelectedItem(), null);
        });
    });

    describe('Range Selection', () => {
        it('should select range from start to end', () => {
            manager.selectRange(testItems[0], testItems[2]);
            
            const selection = manager.getSelection();
            assert.ok(selection.some(item => item.filePath === testItems[0].filePath));
            assert.ok(selection.some(item => item.filePath === testItems[1].filePath));
            assert.ok(selection.some(item => item.filePath === testItems[2].filePath));
            assert.ok(!selection.some(item => item.filePath === testItems[3].filePath));
            assert.strictEqual(manager.getSelectionCount(), 3);
        });

        it('should select range in reverse order', () => {
            manager.selectRange(testItems[2], testItems[0]);
            
            const selection = manager.getSelection();
            assert.ok(selection.some(item => item.filePath === testItems[0].filePath));
            assert.ok(selection.some(item => item.filePath === testItems[1].filePath));
            assert.ok(selection.some(item => item.filePath === testItems[2].filePath));
            assert.ok(!selection.some(item => item.filePath === testItems[3].filePath));
            assert.strictEqual(manager.getSelectionCount(), 3);
        });

        it('should handle range selection with items not in list', () => {
            const externalItem = {
                label: 'external.txt',
                filePath: '/external/external.txt',
                isDirectory: false,
                size: 50,
                modified: new Date('2023-01-05'),
                id: '/external/external.txt'
            } as IEnhancedFileItem;
            
            manager.selectRange(testItems[0], externalItem);
            
            assert.strictEqual(manager.isSelected(testItems[0]), true);
            assert.strictEqual(manager.isSelected(externalItem), true);
            assert.strictEqual(manager.getSelectionCount(), 2);
        });
    });

    describe('Click Handlers', () => {
        it('should handle regular click (single selection)', () => {
            manager.setSelection([testItems[0], testItems[1]]);
            manager.handleClick(testItems[2]);
            
            assert.deepStrictEqual(manager.getSelection(), [testItems[2]]);
            assert.strictEqual(manager.getSelectionCount(), 1);
        });

        it('should handle Ctrl+Click (toggle selection)', () => {
            manager.addToSelection(testItems[0]);
            
            // Ctrl+Click on unselected item should add it
            manager.handleCtrlClick(testItems[1]);
            assert.strictEqual(manager.isSelected(testItems[1]), true);
            assert.strictEqual(manager.getSelectionCount(), 2);
            
            // Ctrl+Click on selected item should remove it
            manager.handleCtrlClick(testItems[0]);
            assert.strictEqual(manager.isSelected(testItems[0]), false);
            assert.strictEqual(manager.getSelectionCount(), 1);
        });

        it('should handle Shift+Click (range selection)', () => {
            manager.addToSelection(testItems[0]);
            manager.handleShiftClick(testItems[2]);
            
            const selection = manager.getSelection();
            assert.ok(selection.some(item => item.filePath === testItems[0].filePath));
            assert.ok(selection.some(item => item.filePath === testItems[1].filePath));
            assert.ok(selection.some(item => item.filePath === testItems[2].filePath));
            assert.strictEqual(manager.getSelectionCount(), 3);
        });

        it('should handle Shift+Click without previous selection', () => {
            manager.handleShiftClick(testItems[1]);
            
            assert.deepStrictEqual(manager.getSelection(), [testItems[1]]);
            assert.strictEqual(manager.getSelectionCount(), 1);
        });
    });

    describe('Select All', () => {
        it('should select all available items', () => {
            manager.selectAll();
            
            assert.deepStrictEqual(manager.getSelection(), testItems);
            assert.strictEqual(manager.getSelectionCount(), testItems.length);
            
            for (const item of testItems) {
                assert.strictEqual(manager.isSelected(item), true);
            }
        });

        it('should replace existing selection when selecting all', () => {
            manager.addToSelection(testItems[0]);
            manager.selectAll();
            
            assert.deepStrictEqual(manager.getSelection(), testItems);
            assert.strictEqual(manager.getSelectionCount(), testItems.length);
        });
    });

    describe('Toggle Selection', () => {
        it('should toggle item selection', () => {
            // Toggle unselected item should select it
            manager.toggleSelection(testItems[0]);
            assert.strictEqual(manager.isSelected(testItems[0]), true);
            
            // Toggle selected item should deselect it
            manager.toggleSelection(testItems[0]);
            assert.strictEqual(manager.isSelected(testItems[0]), false);
        });
    });

    describe('Update All Items', () => {
        it('should update available items and maintain valid selections', () => {
            manager.setSelection([testItems[0], testItems[1]]);
            
            // Update with subset of items
            const newItems = [testItems[0], testItems[2]];
            manager.updateAllItems(newItems);
            
            // Should keep testItems[0] but remove testItems[1]
            assert.strictEqual(manager.isSelected(testItems[0]), true);
            assert.strictEqual(manager.isSelected(testItems[1]), false);
            assert.strictEqual(manager.getSelectionCount(), 1);
        });

        it('should update last selected item when it becomes unavailable', () => {
            manager.addToSelection(testItems[0]);
            manager.addToSelection(testItems[1]);
            
            // Update without testItems[1] (last selected)
            const newItems = [testItems[0], testItems[2]];
            manager.updateAllItems(newItems);
            
            assert.strictEqual(manager.getLastSelectedItem(), testItems[0]);
        });

        it('should clear last selected item when no items remain selected', () => {
            manager.addToSelection(testItems[0]);
            
            // Update with completely different items
            const newItems = [testItems[2], testItems[3]];
            manager.updateAllItems(newItems);
            
            assert.strictEqual(manager.getLastSelectedItem(), null);
            assert.strictEqual(manager.getSelectionCount(), 0);
        });
    });

    describe('Selection Events', () => {
        it('should fire selection changed event when selection changes', () => {
            let eventFired = false;
            let eventData: any = null;
            
            manager.onSelectionChanged((selection) => {
                eventFired = true;
                eventData = selection;
            });
            
            manager.addToSelection(testItems[0]);
            
            assert.strictEqual(eventFired, true);
            assert.deepStrictEqual(eventData, [testItems[0]]);
        });

        it('should fire selection changed event when clearing selection', () => {
            let eventFired = false;
            let eventData: any = null;
            
            manager.addToSelection(testItems[0]);
            
            manager.onSelectionChanged((selection) => {
                eventFired = true;
                eventData = selection;
            });
            
            manager.clearSelection();
            
            assert.strictEqual(eventFired, true);
            assert.deepStrictEqual(eventData, []);
        });
    });

    describe('Edge Cases', () => {
        it('should handle duplicate additions gracefully', () => {
            manager.addToSelection(testItems[0]);
            manager.addToSelection(testItems[0]); // Duplicate
            
            assert.strictEqual(manager.getSelectionCount(), 1);
            assert.deepStrictEqual(manager.getSelection(), [testItems[0]]);
        });

        it('should handle removal of non-selected items gracefully', () => {
            manager.addToSelection(testItems[0]);
            manager.removeFromSelection(testItems[1]); // Not selected
            
            assert.strictEqual(manager.getSelectionCount(), 1);
            assert.deepStrictEqual(manager.getSelection(), [testItems[0]]);
        });

        it('should handle empty item arrays', () => {
            manager.updateAllItems([]);
            manager.selectAll();
            
            assert.strictEqual(manager.getSelectionCount(), 0);
            assert.deepStrictEqual(manager.getSelection(), []);
        });
    });

    describe('Disposal', () => {
        it('should dispose resources properly', () => {
            manager.addToSelection(testItems[0]);
            manager.dispose();
            
            assert.strictEqual(manager.getSelectionCount(), 0);
            assert.deepStrictEqual(manager.getSelection(), []);
        });
    });
});