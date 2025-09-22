import { SortOrder, ViewMode } from './enums';

// ===== Explorer Settings Interface =====

/**
 * Explorer settings configuration interface
 */
export interface ExplorerSettings {
    // Display settings
    showHiddenFiles: boolean;
    sortOrder: SortOrder;
    displayMode: ViewMode;
    
    // Behavior settings
    confirmDelete: boolean;
    confirmMove: boolean;
    autoRevealActiveFile: boolean;
    
    // Performance settings
    maxFilesPerFolder: number;
    cacheTimeout: number;
    debounceDelay: number;
    
    // Keyboard shortcuts
    keyBindings: KeyBindings;
    
    // Search settings
    searchCaseSensitive: boolean;
    searchIncludeHidden: boolean;
    searchMaxResults: number;
    
    // File creation settings
    defaultFileExtension: string;
    useTimestampInFileName: boolean;
    
    // Visual settings
    showFileIcons: boolean;
    showFileSize: boolean;
    showModifiedDate: boolean;
    compactMode: boolean;
}

/**
 * Key bindings configuration interface
 */
export interface KeyBindings {
    copy: string;
    cut: string;
    paste: string;
    delete: string;
    rename: string;
    selectAll: string;
    refresh: string;
    newFile: string;
    newFolder: string;
    search: string;
}

/**
 * Default explorer settings
 */
export const DEFAULT_EXPLORER_SETTINGS: ExplorerSettings = {
    // Display settings
    showHiddenFiles: false,
    sortOrder: SortOrder.NameAsc,
    displayMode: ViewMode.Tree,
    
    // Behavior settings
    confirmDelete: true,
    confirmMove: false,
    autoRevealActiveFile: true,
    
    // Performance settings
    maxFilesPerFolder: 1000,
    cacheTimeout: 30000, // 30 seconds
    debounceDelay: 300, // 300ms
    
    // Keyboard shortcuts
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
    },
    
    // Search settings
    searchCaseSensitive: false,
    searchIncludeHidden: false,
    searchMaxResults: 100,
    
    // File creation settings
    defaultFileExtension: '.txt',
    useTimestampInFileName: true,
    
    // Visual settings
    showFileIcons: true,
    showFileSize: true,
    showModifiedDate: true,
    compactMode: false
};

/**
 * Settings validation interface
 */
export interface SettingsValidation {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Configuration provider interface
 */
export interface IConfigurationProvider {
    get<T extends keyof ExplorerSettings>(key: T): ExplorerSettings[T];
    set<T extends keyof ExplorerSettings>(key: T, value: ExplorerSettings[T]): Promise<void>;
    getAll(): ExplorerSettings;
    reset(): Promise<void>;
    validate(settings: Partial<ExplorerSettings>): SettingsValidation;
    onDidChange(callback: (key: keyof ExplorerSettings, value: any) => void): void;
}