import * as assert from 'assert';
import * as vscode from 'vscode';
import { describe, it, before, after } from 'mocha';

describe('Extension Activation Integration Tests', () => {
    let extension: vscode.Extension<any> | undefined;

    before(async () => {
        // Get the extension
        extension = vscode.extensions.getExtension('file-list-extension');
        
        if (extension) {
            // Activate the extension
            await extension.activate();
        }
    });

    after(async () => {
        // Clean up if needed
    });

    describe('Extension Loading', () => {
        it('should load the extension successfully', () => {
            assert.ok(extension, 'Extension should be loaded');
            assert.strictEqual(extension?.isActive, true, 'Extension should be active');
        });

        it('should register all required commands', async () => {
            const commands = await vscode.commands.getCommands();
            
            // Check for core commands
            const requiredCommands = [
                'fileList.selectFolder',
                'fileList.refresh',
                'fileList.showInPanel',
                'fileList.openFolder',
                'fileList.goToParent',
                'fileList.setRelativePath',
                'fileList.openSettings',
                'fileList.createMemo',
                'fileList.createFolder',
                'fileList.rename',
                'fileList.delete',
                
                // Enhanced keyboard commands
                'fileListExtension.keyboard.copy',
                'fileListExtension.keyboard.cut',
                'fileListExtension.keyboard.paste',
                'fileListExtension.keyboard.delete',
                'fileListExtension.keyboard.rename',
                'fileListExtension.keyboard.selectAll',
                'fileListExtension.keyboard.newFile',
                'fileListExtension.keyboard.newFolder',
                'fileListExtension.keyboard.refresh',
                
                // Context menu commands
                'fileListExtension.contextMenu.copy',
                'fileListExtension.contextMenu.cut',
                'fileListExtension.contextMenu.paste',
                'fileListExtension.contextMenu.delete',
                'fileListExtension.contextMenu.rename',
                'fileListExtension.contextMenu.newFile',
                'fileListExtension.contextMenu.newFolder',
                'fileListExtension.contextMenu.refresh',
                'fileListExtension.contextMenu.reveal',
                'fileListExtension.contextMenu.copyPath',
                
                // Search commands
                'fileListExtension.search',
                'fileListExtension.clearSearch',
                'fileListExtension.searchHistory',
                
                // Display customization commands
                'fileListExtension.display.quickSettings',
                'fileListExtension.display.cycleSortOrder',
                'fileListExtension.display.toggleViewMode',
                'fileListExtension.display.toggleHiddenFiles',
                'fileListExtension.display.toggleCompactMode',
                
                // Other commands
                'fileListExtension.selectAll',
                'fileListExtension.refresh'
            ];

            for (const command of requiredCommands) {
                assert.ok(
                    commands.includes(command),
                    `Command '${command}' should be registered`
                );
            }
        });

        it('should register all tree views', () => {
            // Check if tree views are registered by checking if they exist in the package.json contributes
            const packageJson = require('../../package.json');
            const views = packageJson.contributes.views.fileListView;
            
            assert.ok(views, 'Views should be defined');
            assert.strictEqual(views.length, 4, 'Should have 4 views');
            
            const viewIds = views.map((view: any) => view.id);
            assert.ok(viewIds.includes('workspaceExplorer'), 'Should include workspaceExplorer view');
            assert.ok(viewIds.includes('fileListExplorer'), 'Should include fileListExplorer view');
            assert.ok(viewIds.includes('fileListDetails'), 'Should include fileListDetails view');
            assert.ok(viewIds.includes('gitChanges'), 'Should include gitChanges view');
        });
    });

    describe('Configuration', () => {
        it('should have all required configuration properties', () => {
            const config = vscode.workspace.getConfiguration('fileListExtension.explorer');
            
            // Test that configuration section exists
            assert.ok(config, 'Configuration section should exist');
            
            // Test specific configuration properties
            const requiredProperties = [
                'showHiddenFiles',
                'sortOrder',
                'displayMode',
                'confirmDelete',
                'confirmMove',
                'autoRevealActiveFile',
                'maxFilesPerFolder',
                'cacheTimeout',
                'debounceDelay'
            ];

            for (const property of requiredProperties) {
                const value = config.get(property);
                assert.notStrictEqual(
                    value,
                    undefined,
                    `Configuration property '${property}' should be defined`
                );
            }
        });

        it('should have keyboard shortcut configuration', () => {
            const config = vscode.workspace.getConfiguration('fileListExtension.keyboard');
            
            const requiredShortcuts = [
                'copy',
                'cut',
                'paste',
                'delete',
                'rename',
                'selectAll',
                'newFile',
                'newFolder',
                'refresh'
            ];

            for (const shortcut of requiredShortcuts) {
                const value = config.get(shortcut);
                assert.notStrictEqual(
                    value,
                    undefined,
                    `Keyboard shortcut '${shortcut}' should be defined`
                );
            }
        });
    });

    describe('Error Handling', () => {
        it('should handle extension activation without errors', async () => {
            // This test passes if the extension activated successfully in the before hook
            assert.ok(extension?.isActive, 'Extension should be active without errors');
        });

        it('should handle command execution gracefully', async () => {
            // Test that commands can be executed without throwing errors
            try {
                await vscode.commands.executeCommand('fileListExtension.refresh');
                // If we get here, the command executed successfully
                assert.ok(true, 'Refresh command should execute without errors');
            } catch (error) {
                assert.fail(`Refresh command should not throw errors: ${error}`);
            }
        });
    });

    describe('Service Integration', () => {
        it('should initialize all services without errors', () => {
            // This is tested implicitly by successful extension activation
            assert.ok(extension?.isActive, 'All services should initialize successfully');
        });

        it('should handle configuration changes', async () => {
            const config = vscode.workspace.getConfiguration('fileListExtension.explorer');
            const originalValue = config.get('showHiddenFiles');
            
            try {
                // Change configuration
                await config.update('showHiddenFiles', !originalValue, vscode.ConfigurationTarget.Workspace);
                
                // Verify change was applied
                const newValue = config.get('showHiddenFiles');
                assert.strictEqual(newValue, !originalValue, 'Configuration should be updated');
                
                // Restore original value
                await config.update('showHiddenFiles', originalValue, vscode.ConfigurationTarget.Workspace);
            } catch (error) {
                assert.fail(`Configuration update should not throw errors: ${error}`);
            }
        });
    });
});