import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EnhancedWorkspaceExplorerProvider } from '../services/EnhancedWorkspaceExplorerProvider';
import { EnhancedFileListProvider } from '../services/EnhancedFileListProvider';
import { EnhancedFileDetailsProvider } from '../services/EnhancedFileDetailsProvider';
import { SortOrder } from '../types/enums';

describe('Enhanced Providers Integration', () => {
    let testDir: string;
    let workspaceProvider: EnhancedWorkspaceExplorerProvider;
    let fileListProvider: EnhancedFileListProvider;
    let fileDetailsProvider: EnhancedFileDetailsProvider;

    beforeEach(async () => {
        // Create temporary test directory
        testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'enhanced-providers-test-'));
        
        // Create test structure
        await createTestStructure(testDir);
        
        // Initialize providers
        workspaceProvider = new EnhancedWorkspaceExplorerProvider();
        fileListProvider = new EnhancedFileListProvider();
        fileDetailsProvider = new EnhancedFileDetailsProvider();
    });

    afterEach(async () => {
        // Clean up
        workspaceProvider.dispose();
        fileListProvider.dispose();
        fileDetailsProvider.dispose();
        
        // Remove test directory
        try {
            await fs.promises.rmdir(testDir, { recursive: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('EnhancedWorkspaceExplorerProvider', () => {
        it('should load workspace items correctly', async () => {
            workspaceProvider.setWorkspaceRoot(testDir);
            
            const children = await workspaceProvider.getChildren();
            assert.ok(children.length > 0);
            
            // Should contain both files and directories
            const hasFiles = children.some(item => !item.isDirectory);
            const hasDirectories = children.some(item => item.isDirectory);
            
            assert.strictEqual(hasFiles, true);
            assert.strictEqual(hasDirectories, true);
        });

        it('should support multi-selection', async () => {
            workspaceProvider.setWorkspaceRoot(testDir);
            const children = await workspaceProvider.getChildren();
            
            // Select multiple items
            const itemsToSelect = children.slice(0, 2);
            workspaceProvider.setSelectedItems(itemsToSelect);
            
            const selectedItems = workspaceProvider.getSelectedItems();
            assert.strictEqual(selectedItems.length, 2);
            assert.deepStrictEqual(selectedItems, itemsToSelect);
        });

        it('should handle Ctrl+Click selection', async () => {
            workspaceProvider.setWorkspaceRoot(testDir);
            const children = await workspaceProvider.getChildren();
            
            // Simulate Ctrl+Click on first item
            workspaceProvider.handleItemClick(children[0], { ctrl: true, shift: false });
            assert.strictEqual(workspaceProvider.getSelectedItems().length, 1);
            
            // Simulate Ctrl+Click on second item
            workspaceProvider.handleItemClick(children[1], { ctrl: true, shift: false });
            assert.strictEqual(workspaceProvider.getSelectedItems().length, 2);
            
            // Simulate Ctrl+Click on first item again (should deselect)
            workspaceProvider.handleItemClick(children[0], { ctrl: true, shift: false });
            assert.strictEqual(workspaceProvider.getSelectedItems().length, 1);
        });

        it('should handle Shift+Click range selection', async () => {
            workspaceProvider.setWorkspaceRoot(testDir);
            const children = await workspaceProvider.getChildren();
            
            if (children.length >= 3) {
                // Select first item
                workspaceProvider.handleItemClick(children[0], { ctrl: false, shift: false });
                
                // Shift+Click on third item
                workspaceProvider.handleItemClick(children[2], { ctrl: false, shift: true });
                
                const selectedItems = workspaceProvider.getSelectedItems();
                assert.ok(selectedItems.length >= 3);
            }
        });

        it('should support select all', async () => {
            workspaceProvider.setWorkspaceRoot(testDir);
            await workspaceProvider.getChildren(); // Load items
            
            workspaceProvider.selectAll();
            
            const selectedItems = workspaceProvider.getSelectedItems();
            assert.ok(selectedItems.length > 0);
        });

        it('should support filtering', async () => {
            workspaceProvider.setWorkspaceRoot(testDir);
            const allChildren = await workspaceProvider.getChildren();
            
            // Filter for .txt files
            workspaceProvider.filter('txt');
            const filteredChildren = await workspaceProvider.getChildren();
            
            assert.ok(filteredChildren.length <= allChildren.length);
            
            // All filtered items should contain 'txt'
            for (const item of filteredChildren) {
                assert.ok(item.label.toLowerCase().includes('txt') || 
                         item.filePath.toLowerCase().includes('txt'));
            }
        });

        it('should support sorting', async () => {
            workspaceProvider.setWorkspaceRoot(testDir);
            
            // Sort by name ascending
            workspaceProvider.setSortOrder(SortOrder.NameAsc);
            const nameAscChildren = await workspaceProvider.getChildren();
            
            // Sort by name descending
            workspaceProvider.setSortOrder(SortOrder.NameDesc);
            const nameDescChildren = await workspaceProvider.getChildren();
            
            // Results should be different (unless there's only one item)
            if (nameAscChildren.length > 1) {
                assert.notDeepStrictEqual(nameAscChildren, nameDescChildren);
            }
        });
    });

    describe('EnhancedFileListProvider', () => {
        it('should show only directories', async () => {
            fileListProvider.setRootPath(testDir);
            
            const children = await fileListProvider.getChildren();
            
            // All items should be directories
            for (const item of children) {
                assert.strictEqual(item.isDirectory, true);
            }
        });

        it('should support directory selection', async () => {
            fileListProvider.setRootPath(testDir);
            const children = await fileListProvider.getChildren();
            
            if (children.length > 0) {
                fileListProvider.setSelectedItems([children[0]]);
                
                const selectedDirectories = fileListProvider.getSelectedDirectories();
                assert.strictEqual(selectedDirectories.length, 1);
                assert.strictEqual(selectedDirectories[0].isDirectory, true);
            }
        });

        it('should navigate to subdirectories', async () => {
            fileListProvider.setRootPath(testDir);
            const children = await fileListProvider.getChildren();
            
            if (children.length > 0) {
                const subDir = children[0];
                const subChildren = await fileListProvider.getChildren(subDir);
                
                // Should be able to get children of subdirectory
                assert.ok(Array.isArray(subChildren));
            }
        });
    });

    describe('EnhancedFileDetailsProvider', () => {
        it('should show both files and directories', async () => {
            fileDetailsProvider.setRootPath(testDir);
            
            const children = await fileDetailsProvider.getChildren();
            
            // Should contain both files and directories
            const hasFiles = children.some(item => !item.isDirectory);
            const hasDirectories = children.some(item => item.isDirectory);
            
            assert.strictEqual(hasFiles, true);
            assert.strictEqual(hasDirectories, true);
        });

        it('should separate selected files and directories', async () => {
            fileDetailsProvider.setRootPath(testDir);
            const children = await fileDetailsProvider.getChildren();
            
            // Select all items
            fileDetailsProvider.setSelectedItems(children);
            
            const selectedFiles = fileDetailsProvider.getSelectedFiles();
            const selectedDirectories = fileDetailsProvider.getSelectedDirectories();
            
            // All selected files should be files
            for (const file of selectedFiles) {
                assert.strictEqual(file.isDirectory, false);
            }
            
            // All selected directories should be directories
            for (const dir of selectedDirectories) {
                assert.strictEqual(dir.isDirectory, true);
            }
            
            // Total should match
            assert.strictEqual(
                selectedFiles.length + selectedDirectories.length,
                children.length
            );
        });

        it('should provide file count information', async () => {
            fileDetailsProvider.setRootPath(testDir);
            
            const fileCount = await fileDetailsProvider.getFileCount();
            
            assert.ok(typeof fileCount.files === 'number');
            assert.ok(typeof fileCount.directories === 'number');
            assert.ok(fileCount.files >= 0);
            assert.ok(fileCount.directories >= 0);
        });

        it('should handle parent navigation', async () => {
            // Create subdirectory and navigate to it
            const subDir = path.join(testDir, 'subdir');
            await fs.promises.mkdir(subDir);
            
            fileDetailsProvider.setRootPath(subDir);
            assert.strictEqual(fileDetailsProvider.getCurrentPath(), subDir);
            
            // Navigate to parent
            fileDetailsProvider.goToParentFolder();
            assert.strictEqual(fileDetailsProvider.getCurrentPath(), testDir);
        });
    });

    describe('Selection Persistence', () => {
        it('should maintain selection when refreshing', async () => {
            workspaceProvider.setWorkspaceRoot(testDir);
            const children = await workspaceProvider.getChildren();
            
            if (children.length > 0) {
                // Select an item
                workspaceProvider.setSelectedItems([children[0]]);
                assert.strictEqual(workspaceProvider.getSelectedItems().length, 1);
                
                // Refresh tree
                workspaceProvider.refreshTree();
                
                // Selection should be maintained (though the actual item objects might be different)
                const selectedAfterRefresh = workspaceProvider.getSelectedItems();
                assert.strictEqual(selectedAfterRefresh.length, 1);
                assert.strictEqual(selectedAfterRefresh[0].filePath, children[0].filePath);
            }
        });

        it('should clear invalid selections after directory change', async () => {
            fileDetailsProvider.setRootPath(testDir);
            const children = await fileDetailsProvider.getChildren();
            
            if (children.length > 0) {
                // Select items
                fileDetailsProvider.setSelectedItems(children);
                assert.ok(fileDetailsProvider.getSelectedItems().length > 0);
                
                // Navigate to different directory
                const subDir = path.join(testDir, 'subdir');
                if (fs.existsSync(subDir)) {
                    fileDetailsProvider.setRootPath(subDir);
                    
                    // Previous selections should be cleared
                    const selectedAfterNavigation = fileDetailsProvider.getSelectedItems();
                    assert.strictEqual(selectedAfterNavigation.length, 0);
                }
            }
        });
    });

    describe('Error Handling', () => {
        it('should handle non-existent directories gracefully', async () => {
            const nonExistentPath = path.join(testDir, 'non-existent');
            
            // Should not throw error
            workspaceProvider.setWorkspaceRoot(nonExistentPath);
            const children = await workspaceProvider.getChildren();
            
            assert.strictEqual(children.length, 0);
        });

        it('should handle permission errors gracefully', async () => {
            // This test might not work on all systems due to permission handling
            workspaceProvider.setWorkspaceRoot(testDir);
            
            // Should not throw error even if some files can't be accessed
            const children = await workspaceProvider.getChildren();
            assert.ok(Array.isArray(children));
        });
    });
});

// Helper function to create test directory structure
async function createTestStructure(baseDir: string): Promise<void> {
    // Create files
    await fs.promises.writeFile(path.join(baseDir, 'file1.txt'), 'Content 1');
    await fs.promises.writeFile(path.join(baseDir, 'file2.js'), 'console.log("test");');
    await fs.promises.writeFile(path.join(baseDir, 'README.md'), '# Test Project');
    
    // Create directories
    const subDir1 = path.join(baseDir, 'subdir1');
    const subDir2 = path.join(baseDir, 'subdir2');
    
    await fs.promises.mkdir(subDir1);
    await fs.promises.mkdir(subDir2);
    
    // Create files in subdirectories
    await fs.promises.writeFile(path.join(subDir1, 'nested1.txt'), 'Nested content 1');
    await fs.promises.writeFile(path.join(subDir2, 'nested2.txt'), 'Nested content 2');
    
    // Create nested subdirectory
    const nestedDir = path.join(subDir1, 'nested');
    await fs.promises.mkdir(nestedDir);
    await fs.promises.writeFile(path.join(nestedDir, 'deep.txt'), 'Deep content');
}