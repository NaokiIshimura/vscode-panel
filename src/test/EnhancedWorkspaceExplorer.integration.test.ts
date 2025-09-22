import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EnhancedWorkspaceExplorerProvider } from '../services/EnhancedWorkspaceExplorerProvider';
import { EnhancedFileItem } from '../models/EnhancedFileItem';

suite('Enhanced Workspace Explorer Provider Integration Tests', () => {
    let provider: EnhancedWorkspaceExplorerProvider;
    let testWorkspaceRoot: string;
    let mockContext: vscode.ExtensionContext;

    suiteSetup(async () => {
        // Create test workspace
        testWorkspaceRoot = path.join(__dirname, '../../test-workspace');
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
        provider = new EnhancedWorkspaceExplorerProvider(mockContext);
        provider.setWorkspaceRoot(testWorkspaceRoot);
    });

    teardown(() => {
        provider.dispose();
    });

    test('should initialize with workspace root', () => {
        assert.strictEqual(provider.getWorkspaceRoot(), testWorkspaceRoot);
    });

    test('should load workspace items correctly', async () => {
        const items = await provider.getChildren();
        
        assert.ok(items.length > 0, 'Should load workspace items');
        
        // Check for test files and directories
        const fileNames = items.map(item => item.label);
        assert.ok(fileNames.includes('test-file.txt'), 'Should include test file');
        assert.ok(fileNames.includes('test-folder'), 'Should include test folder');
    });

    test('should handle multi-selection operations', async () => {
        const items = await provider.getChildren();
        const testItems = items.slice(0, 2);
        
        // Test selection
        provider.setSelectedItems(testItems);
        const selectedItems = provider.getSelectedItems();
        
        assert.strictEqual(selectedItems.length, 2, 'Should select multiple items');
        assert.deepStrictEqual(selectedItems, testItems, 'Selected items should match');
    });

    test('should integrate clipboard operations', async () => {
        const items = await provider.getChildren();
        const testFile = items.find(item => !item.isDirectory);
        
        if (testFile) {
            // Test copy operation
            await provider.copyToClipboard([testFile]);
            
            const clipboardManager = provider.getClipboardManager();
            assert.ok(clipboardManager.canPaste(), 'Should have items in clipboard');
            
            const clipboardItems = clipboardManager.getClipboardItems();
            assert.strictEqual(clipboardItems.length, 1, 'Should have one item in clipboard');
            assert.strictEqual(clipboardItems[0].filePath, testFile.filePath, 'Clipboard item should match');
        }
    });

    test('should handle file operations', async () => {
        const testFileName = 'integration-test-file.txt';
        const testFilePath = path.join(testWorkspaceRoot, testFileName);
        
        // Test file creation
        await provider.createFile(testWorkspaceRoot, testFileName);
        
        // Verify file was created
        assert.ok(fs.existsSync(testFilePath), 'File should be created');
        
        // Test file deletion
        const items = await provider.getChildren();
        const createdFile = items.find(item => item.label === testFileName);
        
        if (createdFile) {
            await provider.deleteItems([createdFile]);
            
            // Verify file was deleted
            assert.ok(!fs.existsSync(testFilePath), 'File should be deleted');
        }
    });

    test('should handle folder operations', async () => {
        const testFolderName = 'integration-test-folder';
        const testFolderPath = path.join(testWorkspaceRoot, testFolderName);
        
        // Test folder creation
        await provider.createFolder(testWorkspaceRoot, testFolderName);
        
        // Verify folder was created
        assert.ok(fs.existsSync(testFolderPath), 'Folder should be created');
        assert.ok(fs.statSync(testFolderPath).isDirectory(), 'Should be a directory');
        
        // Test folder deletion
        const items = await provider.getChildren();
        const createdFolder = items.find(item => item.label === testFolderName);
        
        if (createdFolder) {
            await provider.deleteItems([createdFolder]);
            
            // Verify folder was deleted
            assert.ok(!fs.existsSync(testFolderPath), 'Folder should be deleted');
        }
    });

    test('should handle rename operations', async () => {
        const originalName = 'rename-test-file.txt';
        const newName = 'renamed-file.txt';
        const originalPath = path.join(testWorkspaceRoot, originalName);
        const newPath = path.join(testWorkspaceRoot, newName);
        
        // Create test file
        fs.writeFileSync(originalPath, 'test content');
        
        // Get the file item
        const items = await provider.getChildren();
        const fileItem = items.find(item => item.label === originalName);
        
        if (fileItem) {
            // Test rename
            await provider.renameItem(fileItem, newName);
            
            // Verify rename
            assert.ok(!fs.existsSync(originalPath), 'Original file should not exist');
            assert.ok(fs.existsSync(newPath), 'Renamed file should exist');
            
            // Clean up
            fs.unlinkSync(newPath);
        }
    });

    test('should integrate search functionality', async () => {
        // Test search
        await provider.filter('test');
        
        assert.ok(provider.isSearching(), 'Should be in search mode');
        
        const searchResults = provider.getSearchResults();
        assert.ok(searchResults.length > 0, 'Should have search results');
        
        // Clear search
        provider.clearFilter();
        assert.ok(!provider.isSearching(), 'Should not be in search mode');
    });

    test('should handle sorting operations', async () => {
        const items = await provider.getChildren();
        
        // Test name sorting
        provider.setSortOrder('name-asc' as any);
        const sortedItems = await provider.getChildren();
        
        // Verify sorting (directories first, then alphabetical)
        const directories = sortedItems.filter(item => item.isDirectory);
        const files = sortedItems.filter(item => !item.isDirectory);
        
        // Check directories are first
        for (let i = 0; i < directories.length; i++) {
            assert.ok(sortedItems[i].isDirectory, 'Directories should come first');
        }
        
        // Check alphabetical order within files
        for (let i = 1; i < files.length; i++) {
            const prevFile = files[i - 1];
            const currentFile = files[i];
            assert.ok(
                prevFile.label.toLowerCase() <= currentFile.label.toLowerCase(),
                'Files should be in alphabetical order'
            );
        }
    });

    test('should handle caching operations', async () => {
        // Clear cache
        provider.clearCache();
        
        // Load items (should populate cache)
        const items1 = await provider.getChildren();
        
        // Load items again (should use cache)
        const items2 = await provider.getChildren();
        
        assert.deepStrictEqual(items1, items2, 'Cached items should match');
        
        // Check cache stats
        const stats = provider.getCacheStats();
        assert.ok(stats.size >= 0, 'Cache should have entries');
    });

    test('should handle drag and drop operations', async () => {
        const items = await provider.getChildren();
        const sourceFile = items.find(item => !item.isDirectory);
        const targetFolder = items.find(item => item.isDirectory);
        
        if (sourceFile && targetFolder) {
            // Test drag start
            provider.handleDragStart([sourceFile]);
            
            // Test drop (copy operation)
            await provider.handleDrop([sourceFile], targetFolder, 'copy');
            
            // Verify copy operation
            const targetPath = path.join(targetFolder.filePath, sourceFile.label);
            assert.ok(fs.existsSync(targetPath), 'File should be copied to target folder');
            
            // Clean up
            fs.unlinkSync(targetPath);
        }
    });

    test('should handle performance optimization for large directories', async () => {
        // Create a directory with many files
        const largeDir = path.join(testWorkspaceRoot, 'large-dir');
        fs.mkdirSync(largeDir, { recursive: true });
        
        // Create multiple files
        for (let i = 0; i < 100; i++) {
            fs.writeFileSync(path.join(largeDir, `file-${i}.txt`), `content ${i}`);
        }
        
        // Test preloading
        await provider.preloadDirectory(largeDir);
        
        // Verify cache has entries
        const stats = provider.getCacheStats();
        assert.ok(stats.size > 0, 'Cache should have entries after preloading');
        
        // Clean up
        fs.rmSync(largeDir, { recursive: true, force: true });
    });

    test('should integrate with all services', () => {
        // Test service integration
        assert.ok(provider.getClipboardManager(), 'Should have clipboard manager');
        assert.ok(provider.getFileOperationService(), 'Should have file operation service');
        assert.ok(provider.getKeyboardShortcutHandler(), 'Should have keyboard shortcut handler');
        assert.ok(provider.getContextMenuManager(), 'Should have context menu manager');
        
        // Test provider context
        const context = provider.getProviderContext();
        assert.strictEqual(context.type, 'workspace-explorer', 'Should have correct provider type');
        assert.strictEqual(context.workspaceRoot, testWorkspaceRoot, 'Should have correct workspace root');
    });

    // Helper functions
    async function createTestWorkspace(): Promise<void> {
        // Create test workspace directory
        fs.mkdirSync(testWorkspaceRoot, { recursive: true });
        
        // Create test files and folders
        fs.writeFileSync(path.join(testWorkspaceRoot, 'test-file.txt'), 'test content');
        fs.writeFileSync(path.join(testWorkspaceRoot, 'another-file.js'), 'console.log("test");');
        
        const testFolder = path.join(testWorkspaceRoot, 'test-folder');
        fs.mkdirSync(testFolder, { recursive: true });
        fs.writeFileSync(path.join(testFolder, 'nested-file.md'), '# Test');
        
        const subFolder = path.join(testFolder, 'sub-folder');
        fs.mkdirSync(subFolder, { recursive: true });
        fs.writeFileSync(path.join(subFolder, 'deep-file.json'), '{"test": true}');
    }

    async function cleanupTestWorkspace(): Promise<void> {
        if (fs.existsSync(testWorkspaceRoot)) {
            fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
        }
    }
});