import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { DisplayCustomizationService } from '../services/DisplayCustomizationService';
import { ConfigurationProvider } from '../services/ConfigurationProvider';
import { SortOrder, ViewMode } from '../types/enums';
import { IEnhancedFileItem } from '../interfaces/core';

suite('DisplayCustomization Integration Tests', () => {
    let displayService: DisplayCustomizationService;
    let configProvider: ConfigurationProvider;
    let mockWorkspaceConfig: sinon.SinonStubbedInstance<vscode.WorkspaceConfiguration>;
    let getConfigurationStub: sinon.SinonStub;

    setup(() => {
        // Create mock workspace configuration
        mockWorkspaceConfig = {
            get: sinon.stub(),
            update: sinon.stub().resolves(),
            inspect: sinon.stub(),
            has: sinon.stub()
        } as any;

        // Stub vscode.workspace methods
        getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration').returns(mockWorkspaceConfig);
        sinon.stub(vscode.workspace, 'onDidChangeConfiguration').returns({
            dispose: sinon.stub()
        } as any);

        // Set up default configuration values
        mockWorkspaceConfig.get.withArgs('showHiddenFiles').returns(false);
        mockWorkspaceConfig.get.withArgs('sortOrder').returns(SortOrder.NameAsc);
        mockWorkspaceConfig.get.withArgs('displayMode').returns(ViewMode.Tree);
        mockWorkspaceConfig.get.withArgs('compactMode').returns(false);
        mockWorkspaceConfig.get.withArgs('showFileIcons').returns(true);
        mockWorkspaceConfig.get.withArgs('showFileSize').returns(true);
        mockWorkspaceConfig.get.withArgs('showModifiedDate').returns(true);

        configProvider = new ConfigurationProvider();
        displayService = new DisplayCustomizationService();
    });

    teardown(() => {
        sinon.restore();
        displayService.dispose();
        configProvider.dispose();
    });

    suite('Sort Order Management', () => {
        test('should set and get sort order correctly', async () => {
            await displayService.setSortOrder(SortOrder.SizeDesc);

            assert.ok(mockWorkspaceConfig.update.calledWith('sortOrder', SortOrder.SizeDesc));
            assert.strictEqual(displayService.getSortOrder(), SortOrder.SizeDesc);
        });

        test('should cycle through sort orders', async () => {
            // Mock showInformationMessage to avoid UI interaction
            const showMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

            // Start with NameAsc, should cycle to NameDesc
            mockWorkspaceConfig.get.withArgs('sortOrder').returns(SortOrder.NameAsc);
            
            await displayService.cycleSortOrder();

            assert.ok(mockWorkspaceConfig.update.calledWith('sortOrder', SortOrder.NameDesc));
            assert.ok(showMessageStub.calledOnce);
            assert.ok(showMessageStub.firstCall.args[0].includes('名前（降順）'));

            showMessageStub.restore();
        });

        test('should cycle from last to first sort order', async () => {
            const showMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

            // Start with ModifiedDesc (last), should cycle to NameAsc (first)
            mockWorkspaceConfig.get.withArgs('sortOrder').returns(SortOrder.ModifiedDesc);
            
            await displayService.cycleSortOrder();

            assert.ok(mockWorkspaceConfig.update.calledWith('sortOrder', SortOrder.NameAsc));

            showMessageStub.restore();
        });
    });

    suite('View Mode Management', () => {
        test('should set and get view mode correctly', async () => {
            await displayService.setViewMode(ViewMode.List);

            assert.ok(mockWorkspaceConfig.update.calledWith('displayMode', ViewMode.List));
            assert.strictEqual(displayService.getViewMode(), ViewMode.List);
        });

        test('should toggle view mode from tree to list', async () => {
            const showMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

            mockWorkspaceConfig.get.withArgs('displayMode').returns(ViewMode.Tree);
            
            await displayService.toggleViewMode();

            assert.ok(mockWorkspaceConfig.update.calledWith('displayMode', ViewMode.List));
            assert.ok(showMessageStub.calledOnce);
            assert.ok(showMessageStub.firstCall.args[0].includes('リスト表示'));

            showMessageStub.restore();
        });

        test('should toggle view mode from list to tree', async () => {
            const showMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

            mockWorkspaceConfig.get.withArgs('displayMode').returns(ViewMode.List);
            
            await displayService.toggleViewMode();

            assert.ok(mockWorkspaceConfig.update.calledWith('displayMode', ViewMode.Tree));
            assert.ok(showMessageStub.calledOnce);
            assert.ok(showMessageStub.firstCall.args[0].includes('ツリー表示'));

            showMessageStub.restore();
        });
    });

    suite('Hidden Files Management', () => {
        test('should set and get hidden files setting correctly', async () => {
            await displayService.setShowHiddenFiles(true);

            assert.ok(mockWorkspaceConfig.update.calledWith('showHiddenFiles', true));
            assert.strictEqual(displayService.getShowHiddenFiles(), true);
        });

        test('should toggle hidden files visibility', async () => {
            const showMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

            mockWorkspaceConfig.get.withArgs('showHiddenFiles').returns(false);
            
            await displayService.toggleHiddenFiles();

            assert.ok(mockWorkspaceConfig.update.calledWith('showHiddenFiles', true));
            assert.ok(showMessageStub.calledOnce);
            assert.ok(showMessageStub.firstCall.args[0].includes('有効'));

            showMessageStub.restore();
        });

        test('should filter hidden files correctly', () => {
            // Test with hidden files disabled
            mockWorkspaceConfig.get.withArgs('showHiddenFiles').returns(false);
            
            const hiddenFile: IEnhancedFileItem = {
                id: 'hidden',
                label: '.hidden',
                filePath: '/path/.hidden',
                isDirectory: false,
                size: 100,
                modified: new Date(),
                permissions: { readonly: false, executable: false, hidden: false }
            };

            const normalFile: IEnhancedFileItem = {
                id: 'normal',
                label: 'normal.txt',
                filePath: '/path/normal.txt',
                isDirectory: false,
                size: 100,
                modified: new Date(),
                permissions: { readonly: false, executable: false, hidden: false }
            };

            assert.strictEqual(displayService.shouldShowFile(hiddenFile), false);
            assert.strictEqual(displayService.shouldShowFile(normalFile), true);

            // Test with hidden files enabled
            mockWorkspaceConfig.get.withArgs('showHiddenFiles').returns(true);
            
            assert.strictEqual(displayService.shouldShowFile(hiddenFile), true);
            assert.strictEqual(displayService.shouldShowFile(normalFile), true);
        });

        test('should detect hidden files by permissions', () => {
            mockWorkspaceConfig.get.withArgs('showHiddenFiles').returns(false);
            
            const hiddenByPermission: IEnhancedFileItem = {
                id: 'hidden-perm',
                label: 'file.txt',
                filePath: '/path/file.txt',
                isDirectory: false,
                size: 100,
                modified: new Date(),
                permissions: { readonly: false, executable: false, hidden: true }
            };

            assert.strictEqual(displayService.shouldShowFile(hiddenByPermission), false);
        });
    });

    suite('Visual Settings Management', () => {
        test('should manage compact mode correctly', async () => {
            const showMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

            await displayService.setCompactMode(true);
            assert.ok(mockWorkspaceConfig.update.calledWith('compactMode', true));
            assert.strictEqual(displayService.getCompactMode(), true);

            mockWorkspaceConfig.get.withArgs('compactMode').returns(false);
            await displayService.toggleCompactMode();
            assert.ok(mockWorkspaceConfig.update.calledWith('compactMode', true));

            showMessageStub.restore();
        });

        test('should manage file icons setting correctly', async () => {
            await displayService.setShowFileIcons(false);
            assert.ok(mockWorkspaceConfig.update.calledWith('showFileIcons', false));
            assert.strictEqual(displayService.getShowFileIcons(), false);
        });

        test('should manage file size setting correctly', async () => {
            await displayService.setShowFileSize(false);
            assert.ok(mockWorkspaceConfig.update.calledWith('showFileSize', false));
            assert.strictEqual(displayService.getShowFileSize(), false);
        });

        test('should manage modified date setting correctly', async () => {
            await displayService.setShowModifiedDate(false);
            assert.ok(mockWorkspaceConfig.update.calledWith('showModifiedDate', false));
            assert.strictEqual(displayService.getShowModifiedDate(), false);
        });
    });

    suite('Quick Settings Integration', () => {
        test('should show quick settings menu', async () => {
            const showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);

            await displayService.showQuickSettings();

            assert.ok(showQuickPickStub.calledOnce);
            const items = showQuickPickStub.firstCall.args[0] as vscode.QuickPickItem[];
            assert.ok(items.length >= 5);
            assert.ok(items.some(item => item.label.includes('ソート順序')));
            assert.ok(items.some(item => item.label.includes('表示モード')));
            assert.ok(items.some(item => item.label.includes('隠しファイル')));

            showQuickPickStub.restore();
        });

        test('should handle sort order selection in quick settings', async () => {
            const showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
            
            // First call returns sort order option
            showQuickPickStub.onFirstCall().resolves({
                label: '$(sort-precedence) ソート順序を変更'
            } as vscode.QuickPickItem);
            
            // Second call returns specific sort order
            showQuickPickStub.onSecondCall().resolves({
                label: 'サイズ（降順）'
            } as vscode.QuickPickItem);

            await displayService.showQuickSettings();

            assert.strictEqual(showQuickPickStub.callCount, 2);
            assert.ok(mockWorkspaceConfig.update.calledWith('sortOrder', SortOrder.SizeDesc));

            showQuickPickStub.restore();
        });

        test('should handle view mode toggle in quick settings', async () => {
            const showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick').resolves({
                label: '$(list-tree) 表示モードを切り替え'
            } as vscode.QuickPickItem);
            
            const showMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

            mockWorkspaceConfig.get.withArgs('displayMode').returns(ViewMode.Tree);

            await displayService.showQuickSettings();

            assert.ok(mockWorkspaceConfig.update.calledWith('displayMode', ViewMode.List));

            showQuickPickStub.restore();
            showMessageStub.restore();
        });
    });

    suite('Event Handling', () => {
        test('should emit events when settings change', async () => {
            let eventFired = false;
            let eventData: any = null;

            displayService.onDisplaySettingsChanged((settings) => {
                eventFired = true;
                eventData = settings;
            });

            await displayService.setSortOrder(SortOrder.SizeAsc);

            // The event should be fired through the configuration provider
            assert.ok(eventFired);
            assert.strictEqual(eventData.sortOrder, SortOrder.SizeAsc);
        });

        test('should handle multiple event listeners', async () => {
            let event1Fired = false;
            let event2Fired = false;

            const disposable1 = displayService.onDisplaySettingsChanged(() => {
                event1Fired = true;
            });

            const disposable2 = displayService.onDisplaySettingsChanged(() => {
                event2Fired = true;
            });

            await displayService.setShowHiddenFiles(true);

            assert.ok(event1Fired);
            assert.ok(event2Fired);

            disposable1.dispose();
            disposable2.dispose();
        });
    });

    suite('Error Handling', () => {
        test('should handle configuration update errors gracefully', async () => {
            mockWorkspaceConfig.update.rejects(new Error('Configuration update failed'));

            try {
                await displayService.setSortOrder(SortOrder.SizeDesc);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.strictEqual(error.message, 'Configuration update failed');
            }
        });

        test('should handle invalid configuration values', async () => {
            // This would be handled by the ConfigurationProvider validation
            mockWorkspaceConfig.get.withArgs('sortOrder').returns('invalid-sort-order' as any);

            // The service should fall back to default values
            const sortOrder = displayService.getSortOrder();
            assert.ok(Object.values(SortOrder).includes(sortOrder));
        });
    });

    suite('Integration with Enhanced Providers', () => {
        test('should provide correct file filtering for providers', () => {
            const testFiles: IEnhancedFileItem[] = [
                {
                    id: '1',
                    label: '.gitignore',
                    filePath: '/project/.gitignore',
                    isDirectory: false,
                    size: 100,
                    modified: new Date(),
                    permissions: { readonly: false, executable: false, hidden: false }
                },
                {
                    id: '2',
                    label: 'README.md',
                    filePath: '/project/README.md',
                    isDirectory: false,
                    size: 200,
                    modified: new Date(),
                    permissions: { readonly: false, executable: false, hidden: false }
                },
                {
                    id: '3',
                    label: '.vscode',
                    filePath: '/project/.vscode',
                    isDirectory: true,
                    size: 0,
                    modified: new Date(),
                    permissions: { readonly: false, executable: false, hidden: false }
                }
            ];

            // With hidden files disabled
            mockWorkspaceConfig.get.withArgs('showHiddenFiles').returns(false);
            
            const visibleFiles = testFiles.filter(file => displayService.shouldShowFile(file));
            assert.strictEqual(visibleFiles.length, 1);
            assert.strictEqual(visibleFiles[0].label, 'README.md');

            // With hidden files enabled
            mockWorkspaceConfig.get.withArgs('showHiddenFiles').returns(true);
            
            const allFiles = testFiles.filter(file => displayService.shouldShowFile(file));
            assert.strictEqual(allFiles.length, 3);
        });
    });
});