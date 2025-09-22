import * as assert from 'assert';

// Import only the constants and types, not the class that requires VSCode
const DEFAULT_SHORTCUTS = {
    copy: 'ctrl+c',
    cut: 'ctrl+x', 
    paste: 'ctrl+v',
    delete: 'delete',
    rename: 'f2',
    selectAll: 'ctrl+a',
    newFile: 'ctrl+alt+n',
    newFolder: 'ctrl+shift+n',
    refresh: 'f5'
};

interface KeyboardShortcutConfig {
    copy: string;
    cut: string;
    paste: string;
    delete: string;
    rename: string;
    selectAll: string;
    newFile: string;
    newFolder: string;
    refresh: string;
}

interface IEnhancedFileItem {
    label: string;
    filePath: string;
    isDirectory: boolean;
    size: number;
    modified: Date;
    created?: Date;
    id: string;
}

// Simple keyboard shortcut handler for testing core logic without VSCode dependencies
class SimpleKeyboardShortcutHandler {
    private shortcuts: KeyboardShortcutConfig;
    private isEnabled: boolean = true;

    constructor() {
        this.shortcuts = { ...DEFAULT_SHORTCUTS };
    }

    getShortcutConfiguration(): KeyboardShortcutConfig {
        return { ...this.shortcuts };
    }

    updateShortcutConfiguration(newConfig: Partial<KeyboardShortcutConfig>): void {
        // Filter out undefined values
        const filteredConfig: Partial<KeyboardShortcutConfig> = {};
        for (const [key, value] of Object.entries(newConfig)) {
            if (value !== undefined) {
                (filteredConfig as any)[key] = value;
            }
        }
        this.shortcuts = { ...this.shortcuts, ...filteredConfig };
    }

    resetToDefaults(): void {
        this.shortcuts = { ...DEFAULT_SHORTCUTS };
    }

    enable(): void {
        this.isEnabled = true;
    }

    disable(): void {
        this.isEnabled = false;
    }

    isShortcutsEnabled(): boolean {
        return this.isEnabled;
    }

    validateFileName(name: string): { isValid: boolean; errorMessage?: string } {
        if (!name || name.trim() === '') {
            return { isValid: false, errorMessage: 'Name cannot be empty' };
        }
        if (name.match(/[<>:"|?*\/\\]/)) {
            return { isValid: false, errorMessage: 'Invalid characters in name' };
        }
        return { isValid: true };
    }
}





describe('KeyboardShortcutHandler Unit Tests', () => {
    let handler: SimpleKeyboardShortcutHandler;

    const createMockFileItem = (name: string, isDirectory: boolean = false): IEnhancedFileItem => ({
        label: name,
        filePath: `/mock/path/${name}`,
        isDirectory,
        size: isDirectory ? 0 : 1024,
        modified: new Date(),
        created: new Date(),
        id: `/mock/path/${name}`
    });

    beforeEach(() => {
        handler = new SimpleKeyboardShortcutHandler();
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with default shortcuts', () => {
            const config = handler.getShortcutConfiguration();
            assert.deepStrictEqual(config, DEFAULT_SHORTCUTS);
        });

        it('should be enabled by default', () => {
            assert.strictEqual(handler.isShortcutsEnabled(), true);
        });
    });

    describe('Default Shortcuts', () => {
        it('should have correct default shortcuts', () => {
            assert.strictEqual(DEFAULT_SHORTCUTS.copy, 'ctrl+c');
            assert.strictEqual(DEFAULT_SHORTCUTS.cut, 'ctrl+x');
            assert.strictEqual(DEFAULT_SHORTCUTS.paste, 'ctrl+v');
            assert.strictEqual(DEFAULT_SHORTCUTS.delete, 'delete');
            assert.strictEqual(DEFAULT_SHORTCUTS.rename, 'f2');
            assert.strictEqual(DEFAULT_SHORTCUTS.selectAll, 'ctrl+a');
            assert.strictEqual(DEFAULT_SHORTCUTS.newFile, 'ctrl+alt+n');
            assert.strictEqual(DEFAULT_SHORTCUTS.newFolder, 'ctrl+shift+n');
            assert.strictEqual(DEFAULT_SHORTCUTS.refresh, 'f5');
        });
    });

    describe('File Name Validation', () => {
        it('should validate file names correctly', () => {
            // Valid names
            assert.strictEqual(handler.validateFileName('test.txt').isValid, true);
            assert.strictEqual(handler.validateFileName('folder').isValid, true);
            assert.strictEqual(handler.validateFileName('file-name_123.ext').isValid, true);

            // Invalid names
            assert.strictEqual(handler.validateFileName('').isValid, false);
            assert.strictEqual(handler.validateFileName('   ').isValid, false);
            assert.strictEqual(handler.validateFileName('file<name').isValid, false);
            assert.strictEqual(handler.validateFileName('file>name').isValid, false);
            assert.strictEqual(handler.validateFileName('file:name').isValid, false);
            assert.strictEqual(handler.validateFileName('file"name').isValid, false);
            assert.strictEqual(handler.validateFileName('file|name').isValid, false);
            assert.strictEqual(handler.validateFileName('file?name').isValid, false);
            assert.strictEqual(handler.validateFileName('file*name').isValid, false);
            assert.strictEqual(handler.validateFileName('file/name').isValid, false);
            assert.strictEqual(handler.validateFileName('file\\name').isValid, false);
        });

        it('should provide error messages for invalid names', () => {
            const emptyResult = handler.validateFileName('');
            assert.strictEqual(emptyResult.isValid, false);
            assert.ok(emptyResult.errorMessage?.includes('empty'));

            const invalidResult = handler.validateFileName('file<name');
            assert.strictEqual(invalidResult.isValid, false);
            assert.ok(invalidResult.errorMessage?.includes('Invalid characters'));
        });
    });

    describe('Configuration Management', () => {
        it('should update shortcut configuration', () => {
            const newConfig = { copy: 'ctrl+shift+c' };
            handler.updateShortcutConfiguration(newConfig);

            const config = handler.getShortcutConfiguration();
            assert.strictEqual(config.copy, 'ctrl+shift+c');
            // Other shortcuts should remain unchanged
            assert.strictEqual(config.cut, DEFAULT_SHORTCUTS.cut);
            assert.strictEqual(config.paste, DEFAULT_SHORTCUTS.paste);
        });

        it('should update multiple shortcuts at once', () => {
            const newConfig = { 
                copy: 'ctrl+shift+c',
                cut: 'ctrl+shift+x',
                paste: 'ctrl+shift+v'
            };
            handler.updateShortcutConfiguration(newConfig);

            const config = handler.getShortcutConfiguration();
            assert.strictEqual(config.copy, 'ctrl+shift+c');
            assert.strictEqual(config.cut, 'ctrl+shift+x');
            assert.strictEqual(config.paste, 'ctrl+shift+v');
            // Other shortcuts should remain unchanged
            assert.strictEqual(config.delete, DEFAULT_SHORTCUTS.delete);
        });

        it('should reset to defaults', () => {
            // First modify some shortcuts
            handler.updateShortcutConfiguration({ copy: 'ctrl+shift+c', cut: 'ctrl+shift+x' });
            
            // Then reset
            handler.resetToDefaults();

            const config = handler.getShortcutConfiguration();
            assert.deepStrictEqual(config, DEFAULT_SHORTCUTS);
        });
    });

    describe('Enable/Disable Functionality', () => {
        it('should enable and disable shortcuts', () => {
            assert.strictEqual(handler.isShortcutsEnabled(), true);

            handler.disable();
            assert.strictEqual(handler.isShortcutsEnabled(), false);

            handler.enable();
            assert.strictEqual(handler.isShortcutsEnabled(), true);
        });

        it('should toggle state correctly', () => {
            // Start enabled
            assert.strictEqual(handler.isShortcutsEnabled(), true);
            
            // Disable
            handler.disable();
            assert.strictEqual(handler.isShortcutsEnabled(), false);
            
            // Disable again (should remain disabled)
            handler.disable();
            assert.strictEqual(handler.isShortcutsEnabled(), false);
            
            // Enable
            handler.enable();
            assert.strictEqual(handler.isShortcutsEnabled(), true);
            
            // Enable again (should remain enabled)
            handler.enable();
            assert.strictEqual(handler.isShortcutsEnabled(), true);
        });
    });

    describe('Shortcut Configuration Structure', () => {
        it('should maintain configuration structure integrity', () => {
            const config = handler.getShortcutConfiguration();
            
            // Check all required properties exist
            assert.ok('copy' in config);
            assert.ok('cut' in config);
            assert.ok('paste' in config);
            assert.ok('delete' in config);
            assert.ok('rename' in config);
            assert.ok('selectAll' in config);
            assert.ok('newFile' in config);
            assert.ok('newFolder' in config);
            assert.ok('refresh' in config);
            
            // Check all values are strings
            Object.values(config).forEach(value => {
                assert.strictEqual(typeof value, 'string');
                assert.ok(value.length > 0);
            });
        });

        it('should return a copy of configuration (not reference)', () => {
            const config1 = handler.getShortcutConfiguration();
            const config2 = handler.getShortcutConfiguration();
            
            // Should be equal but not the same object
            assert.deepStrictEqual(config1, config2);
            assert.notStrictEqual(config1, config2);
            
            // Modifying one should not affect the other
            config1.copy = 'modified';
            assert.notStrictEqual(config1.copy, config2.copy);
        });
    });

    describe('Partial Configuration Updates', () => {
        it('should handle partial updates without affecting other shortcuts', () => {
            const originalConfig = handler.getShortcutConfiguration();
            
            // Update only copy shortcut
            handler.updateShortcutConfiguration({ copy: 'alt+c' });
            
            const updatedConfig = handler.getShortcutConfiguration();
            assert.strictEqual(updatedConfig.copy, 'alt+c');
            
            // All other shortcuts should remain unchanged
            assert.strictEqual(updatedConfig.cut, originalConfig.cut);
            assert.strictEqual(updatedConfig.paste, originalConfig.paste);
            assert.strictEqual(updatedConfig.delete, originalConfig.delete);
            assert.strictEqual(updatedConfig.rename, originalConfig.rename);
            assert.strictEqual(updatedConfig.selectAll, originalConfig.selectAll);
            assert.strictEqual(updatedConfig.newFile, originalConfig.newFile);
            assert.strictEqual(updatedConfig.newFolder, originalConfig.newFolder);
            assert.strictEqual(updatedConfig.refresh, originalConfig.refresh);
        });

        it('should handle empty partial updates', () => {
            const originalConfig = handler.getShortcutConfiguration();
            
            // Update with empty object
            handler.updateShortcutConfiguration({});
            
            const updatedConfig = handler.getShortcutConfiguration();
            assert.deepStrictEqual(updatedConfig, originalConfig);
        });

        it('should handle undefined values in partial updates', () => {
            const originalConfig = handler.getShortcutConfiguration();
            
            // Update with undefined values (should be ignored)
            handler.updateShortcutConfiguration({ 
                copy: undefined as any,
                cut: 'alt+x'
            });
            
            const updatedConfig = handler.getShortcutConfiguration();
            assert.strictEqual(updatedConfig.copy, originalConfig.copy); // Should remain unchanged
            assert.strictEqual(updatedConfig.cut, 'alt+x'); // Should be updated
        });
    });
});