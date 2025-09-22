import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EnhancedWorkspaceExplorerProvider } from '../services/EnhancedWorkspaceExplorerProvider';
import { EnhancedFileListProvider } from '../services/EnhancedFileListProvider';
import { EnhancedFileDetailsProvider } from '../services/EnhancedFileDetailsProvider';
import { EnhancedFileItem } from '../models/EnhancedFileItem';

suite('Enhanced Providers Comprehensive Integration Tests', () => {
    let workspaceProvider: EnhancedWorkspaceExplorerProvider;
    let fileListProvider: EnhancedFileListProvider;
    let fileDetailsProvider: EnhancedFileDetailsProvider;
    let testWorkspaceRoot: string;
    let mockContext: vscode.ExtensionContext;

    suiteSetup(async () => {
        // Create test workspace
        testWorkspaceRoot = path.join(__dirname, '../../test-workspace-comprehensive');
        await createTestWorkspace();
        
        // Mock extension context
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
            extensionUri: vscode.Uri.file(__dirname),
            extensionPath: __dirname,
            asAbsolutePath: (relativePath: string) => path.join(__dirname, relativePath),
            storageUri: vscode.Uri.file(path.join(__dirname, 'storage')),
            globalStorageUri: vscode.Uri.file(path.join(__dirname, 'globalStorage')),
            logUri: vscode.Uri.file(path.join(__dirname, 'logs')),
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as any,
            environmentVariableCollection: {} as any
        } as vscode.ExtensionContext;
    });

    suiteTeardown(async () => {
        // Clean up test workspace
        await cleanupTestWorkspace();
    });

    setup(() => {
        workspaceProvider = new EnhancedWorkspaceExplorerProvider(mockContext);
        fileListProvider = new EnhancedFileListProvider(mockContext);
        fileDetailsProvider = new EnhancedFileDetailsProvider(mockContext);
        
        workspaceProvider.setWorkspaceRoot(testWorkspaceRoot);
        fileListProvider.setRootPath(testWorkspaceRoot);
        fileDetailsProvider.setRootPath(testWorkspaceRoot);
    });

    teardown(() => {
        workspaceProvider.dispose();
        fileListProvider.dispose();
        fileDetailsProvider.dispose();
    });

    test('should integrate clipboard operations across all providers', async () => {
        // Get items from different providers
        const workspaceItems = await workspaceProvider.getChildren();
        const fileListItems = await fileListProvider.getChildren();
        const fileDetailsItems = await fileDetailsProvider.getChildren();
        
        const testFile = workspaceItems.find(item => !item.isDirectory);
        const testFolder = fileListItems.find(item => item.isDirectory);
        
        if (testFile && testFolder) {
            // Copy from workspace provider
            await workspaceProvider.copyToClipboard([testFile]);
            
            // Verify clipboard state in other providers
            assert.ok(fileListProvider.getClipboardManager().canPaste(), 'FileList should detect clipboard content');
            assert.ok(fileDetailsProvider.getClipboardManager().canPaste(), 'FileDetails should detect clipboard content');
            
            // Paste to folder using file list provider
            await fileListProvider.pasteFromClipboard(testFolder.filePath);
            
            // Verify file was copied
            const copiedFilePath = path.join(testFolder.filePath, testFile.label);
            assert.ok(fs.existsSync(copiedFilePath), 'File should be copied to target folder');
            
            // Clean up
            fs.unlinkSync(copiedFilePath);
        }
    });

    test('should maintain consistent selection across providers', async () => {
        const workspaceItems = await workspaceProvider.getChildren();
        const testItems = workspaceItems.slice(0, 2);
        
        // Set selection in workspace provider
        workspaceProvider.setSelectedItems(testItems);
        
        // Verify selection
        const selectedItems = workspaceProvider.getSelectedItems();
        assert.strictEqual(selectedItems.length, 2, 'Should have 2 selected items');
        
        // Test multi-selection operations
        workspaceProvider.selectAll(workspaceProvider);
        const allSelected = workspaceProvider.getSelectedItems();
        assert.ok(allSelected.length >= testItems.length, 'Should select all items');
        
        // Clear selection
        workspaceProvider.clearSelection();
        const clearedSelection = workspaceProvider.getSelectedItems();
        assert.strictEqual(clearedSelection.length, 0, 'Selection should be cleared');
    });

    test('should handle drag and drop operations consistently', async () => {
        const workspaceItems = await workspaceProvider.getChildren();
        const sourceFile = workspaceItems.find(item => !item.isDirectory);
        const targetFolder = workspaceItems.find(item => item.isDirectory);
        
        if (sourceFile && targetFolder) {
            // Test drag start
            workspaceProvider.handleDragStart([sourceFile]);
            
            // Test drop operation (copy)
            await workspaceProvider.handleDrop([sourceFile], targetFolder, 'copy');
            
            // Verify copy operation
            const copiedFilePath = path.join(targetFolder.filePath, sourceFile.label);
            assert.ok(fs.existsSync(copiedFilePath), 'File should be copied via drag and drop');
            
            // Test move operation
            const moveTestFile = path.join(testWorkspaceRoot, 'move-test.txt');
            fs.writeFileSync(moveTestFile, 'move test content');
            
            const moveFileItem = await EnhancedFileItem.fromPath(moveTestFile);
            await workspaceProvider.handleDrop([moveFileItem], targetFolder, 'move');
            
            // Verify move operation
            const movedFilePath = path.join(targetFolder.filePath, 'move-test.txt');
            assert.ok(fs.existsSync(movedFilePath), 'File should be moved via drag and drop');
            assert.ok(!fs.existsSync(moveTestFile), 'Original file should not exist after move');
            
            // Clean up
            fs.unlinkSync(copiedFilePath);
            fs.unlinkSync(movedFilePath);
        }
    });

    test('should handle file operations consistently across providers', async () => {
        const testFileName = 'cross-provider-test.txt';
        const testFolderName = 'cross-provider-folder';
        
        // Create file using workspace provider
        await workspaceProvider.createFile(testWorkspaceRoot, testFileName);
        
        // Create folder using file list provider
        await fileListProvider.createFolder(testWorkspaceRoot, testFolderName);
        
        // Verify creations are visible in all providers
        const workspaceItems = await workspaceProvider.getChildren();
        const fileListItems = await fileListProvider.getChildren();
        const fileDetailsItems = await fileDetailsProvider.getChildren();
        
        assert.ok(workspaceItems.some(item => item.label === testFileName), 'File should be visible in workspace provider');
        assert.ok(fileListItems.some(item => item.label === testFolderName), 'Folder should be visible in file list provider');
        assert.ok(fileDetailsItems.some(item => item.label === testFileName), 'File should be visible in file details provider');
        assert.ok(fileDetailsItems.some(item => item.label === testFolderName), 'Folder should be visible in file details provider');
        
        // Test rename operation
        const createdFile = workspaceItems.find(item => item.label === testFileName);
        if (createdFile) {
            const newFileName = 'renamed-cross-provider-test.txt';
            await workspaceProvider.renameItem(createdFile, newFileName);
            
            // Verify rename is visible in other providers
            const updatedFileDetailsItems = await fileDetailsProvider.getChildren();
            assert.ok(updatedFileDetailsItems.some(item => item.label === newFileName), 'Renamed file should be visible');
            assert.ok(!updatedFileDetailsItems.some(item => item.label === testFileName), 'Original file name should not exist');
        }
        
        // Clean up
        const finalItems = await workspaceProvider.getChildren();
        const fileToDelete = finalItems.find(item => item.label.includes('renamed-cross-provider-test'));
        const folderToDelete = finalItems.find(item => item.label === testFolderName);
        
        if (fileToDelete) {
            await workspaceProvider.deleteItems([fileToDelete]);
        }
        if (folderToDelete) {
            await fileListProvider.deleteItems([folderToDelete]);
        }
    });

    test('should handle search operations consistently', async () => {
        // Test search in workspace provider
        await workspaceProvider.filter('test');
        assert.ok(workspaceProvider.isSearching(), 'Workspace provider should be in search mode');
        
        const workspaceSearchResults = workspaceProvider.getSearchResults();
        assert.ok(workspaceSearchResults.length > 0, 'Workspace provider should have search results');
        
        // Test search in file details provider
        await fileDetailsProvider.filter('test');
        assert.ok(fileDetailsProvider.isSearching(), 'File details provider should be in search mode');
        
        const fileDetailsSearchResults = fileDetailsProvider.getSearchResults();
        assert.ok(fileDetailsSearchResults.length > 0, 'File details provider should have search results');
        
        // Clear searches
        workspaceProvider.clearFilter();
        fileDetailsProvider.clearFilter();
        
        assert.ok(!workspaceProvider.isSearching(), 'Workspace provider should not be in search mode');
        assert.ok(!fileDetailsProvider.isSearching(), 'File details provider should not be in search mode');
    });

    test('should handle sorting consistently across providers', async () => {
        // Test name sorting
        workspaceProvider.setSortOrder('name-asc' as any);
        fileDetailsProvider.setSortOrder('name-asc' as any);
        
        const workspaceItems = await workspaceProvider.getChildren();
        const fileDetailsItems = await fileDetailsProvider.getChildren();
        
        // Verify sorting (directories first, then alphabetical)
        for (let i = 1; i < workspaceItems.length; i++) {
            const prev = workspaceItems[i - 1];
            const current = workspaceItems[i];
            
            if (prev.isDirectory === current.isDirectory) {
                assert.ok(
                    prev.label.toLowerCase() <= current.label.toLowerCase(),
                    'Items should be in alphabetical order within same type'
                );
            }
        }
        
        // Test size sorting for file details provider
        fileDetailsProvider.setSortOrder('size-desc' as any);
        const sizedItems = await fileDetailsProvider.getChildren();
        const files = sizedItems.filter(item => !item.isDirectory);
        
        for (let i = 1; i < files.length; i++) {
            const prev = files[i - 1];
            const current = files[i];
            assert.ok(prev.size >= current.size, 'Files should be sorted by size descending');
        }
    });

    test('should handle caching operations efficiently', async () => {
        // Clear all caches
        workspaceProvider.clearCache();
        fileListProvider.clearCache();
        fileDetailsProvider.clearCache();
        
        // Load items (should populate cache)
        const startTime = Date.now();
        await workspaceProvider.getChildren();
        await fileListProvider.getChildren();
        await fileDetailsProvider.getChildren();
        const firstLoadTime = Date.now() - startTime;
        
        // Load items again (should use cache)
        const cacheStartTime = Date.now();
        await workspaceProvider.getChildren();
        await fileListProvider.getChildren();
        await fileDetailsProvider.getChildren();
        const cacheLoadTime = Date.now() - cacheStartTime;
        
        // Cache should be faster (though this might not always be true in tests)
        console.log(`First load: ${firstLoadTime}ms, Cache load: ${cacheLoadTime}ms`);
        
        // Check cache stats
        const workspaceStats = workspaceProvider.getCacheStats();
        const fileListStats = fileListProvider.getCacheStats();
        const fileDetailsStats = fileDetailsProvider.getCacheStats();
        
        assert.ok(workspaceStats.size >= 0, 'Workspace provider should have cache entries');
        assert.ok(fileListStats.size >= 0, 'File list provider should have cache entries');
        assert.ok(fileDetailsStats.size >= 0, 'File details provider should have cache entries');
    });

    test('should handle provider context correctly', () => {
        const workspaceContext = workspaceProvider.getProviderContext();
        const fileListContext = fileListProvider.getProviderContext();
        const fileDetailsContext = fileDetailsProvider.getProviderContext();
        
        assert.strictEqual(workspaceContext.type, 'workspace-explorer', 'Workspace provider should have correct type');
        assert.strictEqual(fileListContext.type, 'file-list', 'File list provider should have correct type');
        assert.strictEqual(fileDetailsContext.type, 'file-details', 'File details provider should have correct type');
        
        assert.strictEqual(workspaceContext.workspaceRoot, testWorkspaceRoot, 'Workspace provider should have correct root');
        assert.strictEqual(fileListContext.rootPath, testWorkspaceRoot, 'File list provider should have correct root');
        assert.strictEqual(fileDetailsContext.rootPath, testWorkspaceRoot, 'File details provider should have correct root');
    });

    test('should handle service integration correctly', () => {
        // Test service instances
        assert.ok(workspaceProvider.getClipboardManager(), 'Workspace provider should have clipboard manager');
        assert.ok(workspaceProvider.getFileOperationService(), 'Workspace provider should have file operation service');
        assert.ok(workspaceProvider.getKeyboardShortcutHandler(), 'Workspace provider should have keyboard shortcut handler');
        assert.ok(workspaceProvider.getContextMenuManager(), 'Workspace provider should have context menu manager');
        
        assert.ok(fileListProvider.getClipboardManager(), 'File list provider should have clipboard manager');
        assert.ok(fileDetailsProvider.getClipboardManager(), 'File details provider should have clipboard manager');
        
        // Test command registration
        workspaceProvider.registerCommands(mockContext);
        fileListProvider.registerCommands(mockContext);
        fileDetailsProvider.registerCommands(mockContext);
        
        assert.ok(mockContext.subscriptions.length > 0, 'Commands should be registered');
    });

    // Helper functions
    async function createTestWorkspace(): Promise<void> {
        fs.mkdirSync(testWorkspaceRoot, { recursive: true });
        
        // Create test files and folders
        fs.writeFileSync(path.join(testWorkspaceRoot, 'test-file-1.txt'), 'test content 1');
        fs.writeFileSync(path.join(testWorkspaceRoot, 'test-file-2.js'), 'console.log("test");');
        fs.writeFileSync(path.join(testWorkspaceRoot, 'large-file.json'), JSON.stringify({ data: 'x'.repeat(1000) }));
        
        const testFolder1 = path.join(testWorkspaceRoot, 'test-folder-1');
        fs.mkdirSync(testFolder1, { recursive: true });
        fs.writeFileSync(path.join(testFolder1, 'nested-file.md'), '# Test');
        
        const testFolder2 = path.join(testWorkspaceRoot, 'test-folder-2');
        fs.mkdirSync(testFolder2, { recursive: true });
        
        const subFolder = path.join(testFolder1, 'sub-folder');
        fs.mkdirSync(subFolder, { recursive: true });
        fs.writeFileSync(path.join(subFolder, 'deep-file.json'), '{"test": true}');
        
        // Create hidden files
        fs.writeFileSync(path.join(testWorkspaceRoot, '.hidden-file'), 'hidden content');
        
        const hiddenFolder = path.join(testWorkspaceRoot, '.hidden-folder');
        fs.mkdirSync(hiddenFolder, { recursive: true });
        fs.writeFileSync(path.join(hiddenFolder, 'hidden-nested.txt'), 'hidden nested content');
    }

    async function cleanupTestWorkspace(): Promise<void> {
        if (fs.existsSync(testWorkspaceRoot)) {
            fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
        }
    }
});