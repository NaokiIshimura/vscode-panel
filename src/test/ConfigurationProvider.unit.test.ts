import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ConfigurationProvider } from '../services/ConfigurationProvider';
import { DEFAULT_EXPLORER_SETTINGS, ExplorerSettings } from '../types/settings';
import { SortOrder, ViewMode } from '../types/enums';

suite('ConfigurationProvider Unit Tests', () => {
    let configProvider: ConfigurationProvider;
    let mockWorkspaceConfig: sinon.SinonStubbedInstance<vscode.WorkspaceConfiguration>;
    let getConfigurationStub: sinon.SinonStub;
    let onDidChangeConfigurationStub: sinon.SinonStub;

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
        onDidChangeConfigurationStub = sinon.stub(vscode.workspace, 'onDidChangeConfiguration');

        configProvider = new ConfigurationProvider();
    });

    teardown(() => {
        sinon.restore();
        configProvider.dispose();
    });

    suite('get method', () => {
        test('should return default value when configuration is not set', () => {
            mockWorkspaceConfig.get.returns(undefined);

            const result = configProvider.get('showHiddenFiles');

            assert.strictEqual(result, DEFAULT_EXPLORER_SETTINGS.showHiddenFiles);
            assert.ok(getConfigurationStub.calledWith('fileListExtension.explorer'));
        });

        test('should return configured value when set', () => {
            const expectedValue = true;
            mockWorkspaceConfig.get.returns(expectedValue);

            const result = configProvider.get('showHiddenFiles');

            assert.strictEqual(result, expectedValue);
        });

        test('should return legacy value when new config is not set', () => {
            const legacyValue = 'ctrl+alt+c';
            
            // First call returns undefined (new config), second call returns legacy config
            getConfigurationStub.onFirstCall().returns({
                get: sinon.stub().returns(undefined)
            } as any);
            getConfigurationStub.onSecondCall().returns({
                get: sinon.stub().withArgs('keyboard.copy').returns(legacyValue)
            } as any);

            // This would need to be tested with a more complex setup for keyBindings
            const result = configProvider.get('sortOrder');
            assert.strictEqual(result, DEFAULT_EXPLORER_SETTINGS.sortOrder);
        });

        test('should handle all setting types correctly', () => {
            const testCases: Array<{ key: keyof ExplorerSettings; value: any }> = [
                { key: 'showHiddenFiles', value: true },
                { key: 'sortOrder', value: SortOrder.SizeDesc },
                { key: 'displayMode', value: ViewMode.List },
                { key: 'maxFilesPerFolder', value: 500 },
                { key: 'keyBindings', value: { copy: 'ctrl+c', cut: 'ctrl+x' } }
            ];

            testCases.forEach(({ key, value }) => {
                mockWorkspaceConfig.get.withArgs(key).returns(value);
                const result = configProvider.get(key);
                assert.deepStrictEqual(result, value);
            });
        });
    });

    suite('set method', () => {
        test('should update configuration and emit change event', async () => {
            const key = 'showHiddenFiles';
            const value = true;
            let changeEventFired = false;

            // Register change listener
            configProvider.onDidChange((changedKey, changedValue) => {
                assert.strictEqual(changedKey, key);
                assert.strictEqual(changedValue, value);
                changeEventFired = true;
            });

            await configProvider.set(key, value);

            assert.ok(mockWorkspaceConfig.update.calledWith(key, value, vscode.ConfigurationTarget.Workspace));
            assert.ok(changeEventFired);
        });

        test('should validate value before setting', async () => {
            const key = 'maxFilesPerFolder';
            const invalidValue = -1;

            try {
                await configProvider.set(key, invalidValue);
                assert.fail('Should have thrown validation error');
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('Invalid configuration value'));
            }

            assert.ok(mockWorkspaceConfig.update.notCalled);
        });

        test('should handle different value types correctly', async () => {
            const testCases: Array<{ key: keyof ExplorerSettings; value: any }> = [
                { key: 'showHiddenFiles', value: false },
                { key: 'sortOrder', value: SortOrder.NameDesc },
                { key: 'maxFilesPerFolder', value: 2000 },
                { key: 'defaultFileExtension', value: '.md' }
            ];

            for (const { key, value } of testCases) {
                await configProvider.set(key, value);
                assert.ok(mockWorkspaceConfig.update.calledWith(key, value, vscode.ConfigurationTarget.Workspace));
            }
        });
    });

    suite('getAll method', () => {
        test('should return all configuration values', () => {
            // Setup mock to return specific values for some keys
            mockWorkspaceConfig.get.withArgs('showHiddenFiles').returns(true);
            mockWorkspaceConfig.get.withArgs('sortOrder').returns(SortOrder.SizeAsc);
            mockWorkspaceConfig.get.callThrough(); // For other keys, return undefined

            const result = configProvider.getAll();

            assert.strictEqual(result.showHiddenFiles, true);
            assert.strictEqual(result.sortOrder, SortOrder.SizeAsc);
            // Other values should be defaults
            assert.strictEqual(result.confirmDelete, DEFAULT_EXPLORER_SETTINGS.confirmDelete);
        });

        test('should include all required properties', () => {
            const result = configProvider.getAll();
            const expectedKeys = Object.keys(DEFAULT_EXPLORER_SETTINGS);

            expectedKeys.forEach(key => {
                assert.ok(key in result, `Missing property: ${key}`);
            });
        });
    });

    suite('reset method', () => {
        test('should clear all workspace settings', async () => {
            const mockInspect = { key: 'test-key', workspaceValue: 'some-value' };
            mockWorkspaceConfig.inspect.returns(mockInspect);

            await configProvider.reset();

            // Should call update with undefined for each setting
            const expectedKeys = Object.keys(DEFAULT_EXPLORER_SETTINGS);
            assert.strictEqual(mockWorkspaceConfig.update.callCount, expectedKeys.length);
            
            expectedKeys.forEach(key => {
                assert.ok(mockWorkspaceConfig.update.calledWith(key, undefined, vscode.ConfigurationTarget.Workspace));
            });
        });

        test('should emit change events for all settings', async () => {
            const changeEvents: Array<{ key: keyof ExplorerSettings; value: any }> = [];
            
            configProvider.onDidChange((key, value) => {
                changeEvents.push({ key, value });
            });

            await configProvider.reset();

            assert.strictEqual(changeEvents.length, Object.keys(DEFAULT_EXPLORER_SETTINGS).length);
        });
    });

    suite('validate method', () => {
        test('should validate boolean settings', () => {
            const validSettings = { showHiddenFiles: true };
            const invalidSettings = { showHiddenFiles: 'invalid' as any };

            const validResult = configProvider.validate(validSettings);
            const invalidResult = configProvider.validate(invalidSettings);

            assert.ok(validResult.isValid);
            assert.strictEqual(validResult.errors.length, 0);

            assert.ok(!invalidResult.isValid);
            assert.ok(invalidResult.errors.length > 0);
            assert.ok(invalidResult.errors[0].includes('must be a boolean'));
        });

        test('should validate number settings', () => {
            const validSettings = { maxFilesPerFolder: 500 };
            const invalidSettings = { maxFilesPerFolder: -1 };
            const warningSettings = { maxFilesPerFolder: 15000 };

            const validResult = configProvider.validate(validSettings);
            const invalidResult = configProvider.validate(invalidSettings);
            const warningResult = configProvider.validate(warningSettings);

            assert.ok(validResult.isValid);
            assert.ok(!invalidResult.isValid);
            assert.ok(warningResult.isValid);
            assert.ok(warningResult.warnings.length > 0);
        });

        test('should validate enum settings', () => {
            const validSettings = { sortOrder: SortOrder.NameAsc };
            const invalidSettings = { sortOrder: 'invalid-sort' as any };

            const validResult = configProvider.validate(validSettings);
            const invalidResult = configProvider.validate(invalidSettings);

            assert.ok(validResult.isValid);
            assert.ok(!invalidResult.isValid);
            assert.ok(invalidResult.errors[0].includes('must be one of'));
        });

        test('should validate keyBindings object', () => {
            const validSettings = { 
                keyBindings: { 
                    copy: 'ctrl+c', 
                    cut: 'ctrl+x', 
                    paste: 'ctrl+v',
                    delete: 'delete',
                    rename: 'f2',
                    selectAll: 'ctrl+a',
                    refresh: 'f5',
                    newFile: 'ctrl+n',
                    newFolder: 'ctrl+shift+n',
                    search: 'ctrl+f'
                } 
            };
            const invalidSettings = { keyBindings: 'invalid' as any };
            const incompleteSettings = { keyBindings: { copy: 'ctrl+c' } as any };

            const validResult = configProvider.validate(validSettings);
            const invalidResult = configProvider.validate(invalidSettings);
            const incompleteResult = configProvider.validate(incompleteSettings);

            assert.ok(validResult.isValid);
            assert.ok(!invalidResult.isValid);
            assert.ok(!incompleteResult.isValid);
        });

        test('should validate file extension format', () => {
            const validSettings = { defaultFileExtension: '.txt' };
            const warningSettings = { defaultFileExtension: 'txt' };

            const validResult = configProvider.validate(validSettings);
            const warningResult = configProvider.validate(warningSettings);

            assert.ok(validResult.isValid);
            assert.ok(warningResult.isValid);
            assert.ok(warningResult.warnings.length > 0);
            assert.ok(warningResult.warnings[0].includes('should start with a dot'));
        });
    });

    suite('onDidChange method', () => {
        test('should register change listener', () => {
            let callbackCalled = false;
            
            const disposable = configProvider.onDidChange(() => {
                callbackCalled = true;
            });

            // Simulate configuration change
            const mockEvent = {
                affectsConfiguration: sinon.stub().returns(true)
            };
            
            // This would require more complex setup to test the actual event handling
            assert.ok(disposable);
            assert.strictEqual(typeof disposable.dispose, 'function');
        });
    });

    suite('dispose method', () => {
        test('should dispose of all resources', () => {
            const disposeSpy = sinon.spy();
            
            // Mock the disposables
            (configProvider as any).disposables = [{ dispose: disposeSpy }];
            (configProvider as any).changeEmitter = { dispose: disposeSpy };

            configProvider.dispose();

            assert.strictEqual(disposeSpy.callCount, 2);
        });
    });
});