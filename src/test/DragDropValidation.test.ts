import * as assert from 'assert';
import * as path from 'path';
import { IEnhancedFileItem } from '../interfaces/core';

// Drag and drop validation logic extracted for testing
class DragDropValidator {
    private currentOperation: 'move' | 'copy' = 'move';

    /**
     * Check if items can be dropped on target
     */
    canDrop(target: IEnhancedFileItem, items: IEnhancedFileItem[]): boolean {
        // Target must be a directory
        if (!target.isDirectory) {
            return false;
        }

        // Cannot drop items onto themselves or their children
        for (const item of items) {
            // Cannot drop item onto itself
            if (item.filePath === target.filePath) {
                return false;
            }

            // Cannot drop parent directory onto its child
            const normalizedTarget = target.filePath.replace(/\\/g, '/');
            const normalizedItem = item.filePath.replace(/\\/g, '/');
            
            // Special case for root directory
            if (normalizedItem === '/' && normalizedTarget.startsWith('/') && normalizedTarget !== '/') {
                return false;
            }
            
            if (normalizedTarget.startsWith(normalizedItem + '/')) {
                return false;
            }

            // Cannot drop item into its current parent (for move operations)
            const itemParent = path.dirname(item.filePath).replace(/\\/g, '/');
            const normalizedTargetPath = target.filePath.replace(/\\/g, '/');
            if (itemParent === normalizedTargetPath && this.currentOperation === 'move') {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate tree item context values for drag and drop
     */
    validateTreeItemContext(item: IEnhancedFileItem, contextValue: string): boolean {
        // All items should be draggable
        if (!contextValue.includes('draggable')) {
            return false;
        }

        // Only directories should be droppable
        if (item.isDirectory && !contextValue.includes('droppable')) {
            return false;
        }

        // Files should not be droppable
        if (!item.isDirectory && contextValue.includes('droppable')) {
            return false;
        }

        return true;
    }

    /**
     * Get expected context value for an item
     */
    getExpectedContextValue(item: IEnhancedFileItem, isSelected: boolean = false): string {
        let context = item.isDirectory ? 'directory' : 'file';
        
        // Add draggable context
        context += ':draggable';
        
        // Add droppable context for directories
        if (item.isDirectory) {
            context += ':droppable';
        }
        
        // Add selected context if selected
        if (isSelected) {
            context += ':selected';
        }
        
        return context;
    }

    /**
     * Validate drag feedback message
     */
    validateDragFeedback(items: IEnhancedFileItem[], operation: 'move' | 'copy', feedback: string): boolean {
        const itemCount = items.length;
        const operationText = operation === 'copy' ? 'コピー' : '移動';
        
        let expectedFeedback: string;
        if (itemCount === 1) {
            expectedFeedback = `${items[0].label} を${operationText}`;
        } else {
            expectedFeedback = `${itemCount}個のアイテムを${operationText}`;
        }
        
        return feedback === expectedFeedback;
    }

    /**
     * Set current operation for testing
     */
    setCurrentOperation(operation: 'move' | 'copy'): void {
        this.currentOperation = operation;
    }
}

// Helper function to create test file items
function createTestFileItem(
    label: string, 
    filePath: string, 
    isDirectory: boolean = false,
    size: number = 1024
): IEnhancedFileItem {
    return {
        label,
        filePath,
        isDirectory,
        size,
        modified: new Date(),
        created: new Date(),
        id: filePath
    } as IEnhancedFileItem;
}

describe('Drag & Drop Validation Tests', () => {
    let validator: DragDropValidator;

    beforeEach(() => {
        validator = new DragDropValidator();
    });

    describe('Drop Validation', () => {
        it('should allow dropping files into directories', () => {
            const targetDir = createTestFileItem('target', '/path/to/target', true);
            const sourceFile = createTestFileItem('source.txt', '/path/to/source.txt');

            const canDrop = validator.canDrop(targetDir, [sourceFile]);
            assert.strictEqual(canDrop, true);
        });

        it('should not allow dropping files into files', () => {
            const targetFile = createTestFileItem('target.txt', '/path/to/target.txt');
            const sourceFile = createTestFileItem('source.txt', '/path/to/source.txt');

            const canDrop = validator.canDrop(targetFile, [sourceFile]);
            assert.strictEqual(canDrop, false);
        });

        it('should not allow dropping item onto itself', () => {
            const item = createTestFileItem('test', '/path/to/test', true);

            const canDrop = validator.canDrop(item, [item]);
            assert.strictEqual(canDrop, false);
        });

        it('should not allow dropping parent onto child', () => {
            const parentDir = createTestFileItem('parent', '/path/to/parent', true);
            const childDir = createTestFileItem('child', '/path/to/parent/child', true);

            const canDrop = validator.canDrop(childDir, [parentDir]);
            assert.strictEqual(canDrop, false);
        });

        it('should handle move vs copy operations correctly', () => {
            const parentDir = createTestFileItem('parent', '/path/to/parent', true);
            const childFile = createTestFileItem('child.txt', '/path/to/parent/child.txt');

            // Move operation: should not allow dropping into current parent
            validator.setCurrentOperation('move');
            let canDrop = validator.canDrop(parentDir, [childFile]);
            assert.strictEqual(canDrop, false);

            // Copy operation: should allow dropping into current parent
            validator.setCurrentOperation('copy');
            canDrop = validator.canDrop(parentDir, [childFile]);
            assert.strictEqual(canDrop, true);
        });

        it('should handle root directory correctly', () => {
            const rootDir = createTestFileItem('root', '/', true);
            const subDir = createTestFileItem('sub', '/sub', true);

            const canDrop = validator.canDrop(subDir, [rootDir]);
            assert.strictEqual(canDrop, false);
        });

        it('should handle Windows paths correctly', () => {
            const parentDir = createTestFileItem('parent', 'C:\\path\\to\\parent', true);
            const childDir = createTestFileItem('child', 'C:\\path\\to\\parent\\child', true);

            const canDrop = validator.canDrop(childDir, [parentDir]);
            assert.strictEqual(canDrop, false);
        });
    });

    describe('Context Value Validation', () => {
        it('should validate file context values', () => {
            const file = createTestFileItem('test.txt', '/path/to/test.txt');
            const contextValue = 'file:draggable';

            const isValid = validator.validateTreeItemContext(file, contextValue);
            assert.strictEqual(isValid, true);
        });

        it('should validate directory context values', () => {
            const directory = createTestFileItem('test', '/path/to/test', true);
            const contextValue = 'directory:draggable:droppable';

            const isValid = validator.validateTreeItemContext(directory, contextValue);
            assert.strictEqual(isValid, true);
        });

        it('should reject files with droppable context', () => {
            const file = createTestFileItem('test.txt', '/path/to/test.txt');
            const contextValue = 'file:draggable:droppable'; // Invalid for files

            const isValid = validator.validateTreeItemContext(file, contextValue);
            assert.strictEqual(isValid, false);
        });

        it('should reject items without draggable context', () => {
            const file = createTestFileItem('test.txt', '/path/to/test.txt');
            const contextValue = 'file'; // Missing draggable

            const isValid = validator.validateTreeItemContext(file, contextValue);
            assert.strictEqual(isValid, false);
        });

        it('should reject directories without droppable context', () => {
            const directory = createTestFileItem('test', '/path/to/test', true);
            const contextValue = 'directory:draggable'; // Missing droppable

            const isValid = validator.validateTreeItemContext(directory, contextValue);
            assert.strictEqual(isValid, false);
        });
    });

    describe('Expected Context Values', () => {
        it('should generate correct context for files', () => {
            const file = createTestFileItem('test.txt', '/path/to/test.txt');
            const expected = validator.getExpectedContextValue(file);
            assert.strictEqual(expected, 'file:draggable');
        });

        it('should generate correct context for directories', () => {
            const directory = createTestFileItem('test', '/path/to/test', true);
            const expected = validator.getExpectedContextValue(directory);
            assert.strictEqual(expected, 'directory:draggable:droppable');
        });

        it('should include selected context when selected', () => {
            const file = createTestFileItem('test.txt', '/path/to/test.txt');
            const expected = validator.getExpectedContextValue(file, true);
            assert.strictEqual(expected, 'file:draggable:selected');
        });

        it('should include selected context for directories when selected', () => {
            const directory = createTestFileItem('test', '/path/to/test', true);
            const expected = validator.getExpectedContextValue(directory, true);
            assert.strictEqual(expected, 'directory:draggable:droppable:selected');
        });
    });

    describe('Drag Feedback Validation', () => {
        it('should validate single item move feedback', () => {
            const item = createTestFileItem('test.txt', '/path/to/test.txt');
            const feedback = 'test.txt を移動';

            const isValid = validator.validateDragFeedback([item], 'move', feedback);
            assert.strictEqual(isValid, true);
        });

        it('should validate single item copy feedback', () => {
            const item = createTestFileItem('test.txt', '/path/to/test.txt');
            const feedback = 'test.txt をコピー';

            const isValid = validator.validateDragFeedback([item], 'copy', feedback);
            assert.strictEqual(isValid, true);
        });

        it('should validate multiple items move feedback', () => {
            const items = [
                createTestFileItem('test1.txt', '/path/to/test1.txt'),
                createTestFileItem('test2.txt', '/path/to/test2.txt'),
                createTestFileItem('test3.txt', '/path/to/test3.txt')
            ];
            const feedback = '3個のアイテムを移動';

            const isValid = validator.validateDragFeedback(items, 'move', feedback);
            assert.strictEqual(isValid, true);
        });

        it('should validate multiple items copy feedback', () => {
            const items = [
                createTestFileItem('test1.txt', '/path/to/test1.txt'),
                createTestFileItem('test2.txt', '/path/to/test2.txt')
            ];
            const feedback = '2個のアイテムをコピー';

            const isValid = validator.validateDragFeedback(items, 'copy', feedback);
            assert.strictEqual(isValid, true);
        });

        it('should reject incorrect feedback messages', () => {
            const item = createTestFileItem('test.txt', '/path/to/test.txt');
            const incorrectFeedback = 'wrong message';

            const isValid = validator.validateDragFeedback([item], 'move', incorrectFeedback);
            assert.strictEqual(isValid, false);
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle multiple items with mixed types', () => {
            const targetDir = createTestFileItem('target', '/path/to/target', true);
            const items = [
                createTestFileItem('file1.txt', '/path/to/file1.txt'),
                createTestFileItem('subdir', '/path/to/subdir', true),
                createTestFileItem('file2.txt', '/path/to/file2.txt')
            ];

            const canDrop = validator.canDrop(targetDir, items);
            assert.strictEqual(canDrop, true);
        });

        it('should reject if any item in the list is invalid', () => {
            const targetDir = createTestFileItem('target', '/path/to/target', true);
            const items = [
                createTestFileItem('file1.txt', '/path/to/file1.txt'), // Valid
                targetDir, // Invalid - dropping onto itself
                createTestFileItem('file2.txt', '/path/to/file2.txt')  // Valid
            ];

            const canDrop = validator.canDrop(targetDir, items);
            assert.strictEqual(canDrop, false);
        });

        it('should handle nested directory structures', () => {
            const grandparent = createTestFileItem('grandparent', '/path/to/grandparent', true);
            const parent = createTestFileItem('parent', '/path/to/grandparent/parent', true);
            const child = createTestFileItem('child', '/path/to/grandparent/parent/child', true);

            // Cannot drop grandparent into child
            let canDrop = validator.canDrop(child, [grandparent]);
            assert.strictEqual(canDrop, false);

            // Cannot drop parent into child
            canDrop = validator.canDrop(child, [parent]);
            assert.strictEqual(canDrop, false);

            // Can drop child into grandparent
            canDrop = validator.canDrop(grandparent, [child]);
            assert.strictEqual(canDrop, true);
        });

        it('should handle empty items array', () => {
            const targetDir = createTestFileItem('target', '/path/to/target', true);
            
            const canDrop = validator.canDrop(targetDir, []);
            assert.strictEqual(canDrop, true); // Empty array should be allowed
        });
    });
});