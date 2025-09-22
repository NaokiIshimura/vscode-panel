import * as vscode from 'vscode';
import { ExplorerSettings, DEFAULT_EXPLORER_SETTINGS, IConfigurationProvider, SettingsValidation, KeyBindings } from '../types/settings';
import { SortOrder, ViewMode } from '../types/enums';

/**
 * Configuration provider for managing explorer settings
 */
export class ConfigurationProvider implements IConfigurationProvider {
    private static readonly SECTION = 'fileListExtension.explorer';
    private static readonly LEGACY_SECTION = 'fileListExtension';
    private readonly changeEmitter = new vscode.EventEmitter<{ key: keyof ExplorerSettings; value: any }>();
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(this.handleConfigurationChange.bind(this))
        );
    }

    /**
     * Get a specific configuration value
     */
    get<T extends keyof ExplorerSettings>(key: T): ExplorerSettings[T] {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.SECTION);
        const legacyConfig = vscode.workspace.getConfiguration(ConfigurationProvider.LEGACY_SECTION);
        
        // Try to get from new configuration section first
        let value = config.get<ExplorerSettings[T]>(key);
        
        // If not found, try legacy configuration for backward compatibility
        if (value === undefined) {
            value = this.getLegacyValue(key, legacyConfig);
        }
        
        // If still not found, use default value
        if (value === undefined) {
            value = DEFAULT_EXPLORER_SETTINGS[key];
        }
        
        return value;
    }

    /**
     * Set a configuration value
     */
    async set<T extends keyof ExplorerSettings>(key: T, value: ExplorerSettings[T]): Promise<void> {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.SECTION);
        
        // Validate the value before setting
        const validation = this.validateSingleSetting(key, value);
        if (!validation.isValid) {
            throw new Error(`Invalid configuration value for ${key}: ${validation.errors.join(', ')}`);
        }
        
        await config.update(key, value, vscode.ConfigurationTarget.Workspace);
        
        // Emit change event
        this.changeEmitter.fire({ key, value });
    }

    /**
     * Get all configuration values
     */
    getAll(): ExplorerSettings {
        const settings: ExplorerSettings = { ...DEFAULT_EXPLORER_SETTINGS };
        
        // Override with actual configuration values
        for (const key of Object.keys(DEFAULT_EXPLORER_SETTINGS) as Array<keyof ExplorerSettings>) {
            (settings as any)[key] = this.get(key);
        }
        
        return settings;
    }

    /**
     * Reset all settings to default values
     */
    async reset(): Promise<void> {
        const config = vscode.workspace.getConfiguration(ConfigurationProvider.SECTION);
        const inspect = config.inspect('');
        
        if (inspect) {
            // Clear workspace settings
            for (const key of Object.keys(DEFAULT_EXPLORER_SETTINGS)) {
                await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
            }
        }
        
        // Emit change events for all settings
        for (const [key, value] of Object.entries(DEFAULT_EXPLORER_SETTINGS)) {
            this.changeEmitter.fire({ key: key as keyof ExplorerSettings, value });
        }
    }

    /**
     * Validate settings
     */
    validate(settings: Partial<ExplorerSettings>): SettingsValidation {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        for (const [key, value] of Object.entries(settings)) {
            const validation = this.validateSingleSetting(key as keyof ExplorerSettings, value);
            errors.push(...validation.errors);
            warnings.push(...validation.warnings);
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Register a callback for configuration changes
     */
    onDidChange(callback: (key: keyof ExplorerSettings, value: any) => void): vscode.Disposable {
        return this.changeEmitter.event(({ key, value }) => callback(key, value));
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.changeEmitter.dispose();
    }

    /**
     * Handle configuration changes from VSCode
     */
    private handleConfigurationChange(e: vscode.ConfigurationChangeEvent): void {
        if (e.affectsConfiguration(ConfigurationProvider.SECTION) || 
            e.affectsConfiguration(ConfigurationProvider.LEGACY_SECTION)) {
            
            // Check which specific settings changed
            for (const key of Object.keys(DEFAULT_EXPLORER_SETTINGS) as Array<keyof ExplorerSettings>) {
                if (e.affectsConfiguration(`${ConfigurationProvider.SECTION}.${key}`) ||
                    e.affectsConfiguration(`${ConfigurationProvider.LEGACY_SECTION}.${key}`)) {
                    const value = this.get(key);
                    this.changeEmitter.fire({ key, value });
                }
            }
        }
    }

    /**
     * Get legacy configuration value for backward compatibility
     */
    private getLegacyValue<T extends keyof ExplorerSettings>(key: T, legacyConfig: vscode.WorkspaceConfiguration): ExplorerSettings[T] | undefined {
        // Map new keys to legacy keys
        const legacyKeyMap: Partial<Record<keyof ExplorerSettings, string>> = {
            'keyBindings': 'keyboard',
            'defaultFileExtension': 'defaultRelativePath' // This is a stretch, but for compatibility
        };
        
        const legacyKey = legacyKeyMap[key];
        if (legacyKey) {
            return legacyConfig.get<ExplorerSettings[T]>(legacyKey);
        }
        
        // For keyboard shortcuts, try to get individual values
        if (key === 'keyBindings') {
            const keyBindings: Partial<KeyBindings> = {};
            const shortcuts = ['copy', 'cut', 'paste', 'delete', 'rename', 'selectAll', 'newFile', 'newFolder', 'refresh'];
            
            for (const shortcut of shortcuts) {
                const value = legacyConfig.get<string>(`keyboard.${shortcut}`);
                if (value) {
                    (keyBindings as any)[shortcut] = value;
                }
            }
            
            if (Object.keys(keyBindings).length > 0) {
                return { ...DEFAULT_EXPLORER_SETTINGS.keyBindings, ...keyBindings } as ExplorerSettings[T];
            }
        }
        
        return undefined;
    }

    /**
     * Validate a single setting
     */
    private validateSingleSetting(key: keyof ExplorerSettings, value: any): SettingsValidation {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        switch (key) {
            case 'showHiddenFiles':
            case 'confirmDelete':
            case 'confirmMove':
            case 'autoRevealActiveFile':
            case 'searchCaseSensitive':
            case 'searchIncludeHidden':
            case 'useTimestampInFileName':
            case 'showFileIcons':
            case 'showFileSize':
            case 'showModifiedDate':
            case 'compactMode':
                if (typeof value !== 'boolean') {
                    errors.push(`${key} must be a boolean`);
                }
                break;
                
            case 'maxFilesPerFolder':
            case 'cacheTimeout':
            case 'debounceDelay':
            case 'searchMaxResults':
                if (typeof value !== 'number' || value < 0) {
                    errors.push(`${key} must be a positive number`);
                }
                if (key === 'maxFilesPerFolder' && value > 10000) {
                    warnings.push(`${key} is very high (${value}), this may impact performance`);
                }
                break;
                
            case 'sortOrder':
                if (!Object.values(SortOrder).includes(value)) {
                    errors.push(`${key} must be one of: ${Object.values(SortOrder).join(', ')}`);
                }
                break;
                
            case 'displayMode':
                if (!Object.values(ViewMode).includes(value)) {
                    errors.push(`${key} must be one of: ${Object.values(ViewMode).join(', ')}`);
                }
                break;
                
            case 'defaultFileExtension':
                if (typeof value !== 'string') {
                    errors.push(`${key} must be a string`);
                } else if (value && !value.startsWith('.')) {
                    warnings.push(`${key} should start with a dot (e.g., '.txt')`);
                }
                break;
                
            case 'keyBindings':
                if (typeof value !== 'object' || value === null) {
                    errors.push(`${key} must be an object`);
                } else {
                    const requiredKeys = Object.keys(DEFAULT_EXPLORER_SETTINGS.keyBindings);
                    for (const requiredKey of requiredKeys) {
                        if (!(requiredKey in value) || typeof value[requiredKey] !== 'string') {
                            errors.push(`${key}.${requiredKey} must be a string`);
                        }
                    }
                }
                break;
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
}

/**
 * Singleton instance of the configuration provider
 * Created lazily to avoid issues during testing
 */
let _configurationProvider: ConfigurationProvider | undefined;

export function getConfigurationProvider(): ConfigurationProvider {
    if (!_configurationProvider) {
        _configurationProvider = new ConfigurationProvider();
    }
    return _configurationProvider;
}

export const configurationProvider = getConfigurationProvider();