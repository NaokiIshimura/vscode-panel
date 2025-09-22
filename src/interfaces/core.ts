import * as vscode from 'vscode';
import { SortOrder } from '../types/enums';

// Forward declaration - will be imported from errors module
declare class FileOperationError extends Error {
    public readonly type: any;
    public readonly filePath: string;
    public readonly originalError?: Error;
}

// ===== Core File System Interfaces =====

/**
 * Enhanced file item interface with additional metadata
 */
export interface IEnhancedFileItem {
    readonly label: string;
    readonly filePath: string;
    readonly isDirectory: boolean;
    readonly size: number;
    readonly modified: Date;
    readonly created?: Date;
    readonly permissions?: FilePermissions;
    readonly id: string; // Unique identifier
}

/**
 * File permissions interface
 */
export interface FilePermissions {
    readonly: boolean;
    executable: boolean;
    hidden: boolean;
}

/**
 * File statistics interface
 */
export interface FileStats {
    size: number;
    modified: Date;
    created: Date;
    isDirectory: boolean;
    permissions: FilePermissions;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
    isValid: boolean;
    errorMessage?: string;
}

// ===== Explorer Manager Interface =====

/**
 * Central explorer manager interface
 */
export interface IExplorerManager {
    // Clipboard operations
    copyToClipboard(items: IEnhancedFileItem[]): Promise<void>;
    cutToClipboard(items: IEnhancedFileItem[]): Promise<void>;
    pasteFromClipboard(targetPath: string): Promise<void>;
    
    // File operations
    deleteItems(items: IEnhancedFileItem[]): Promise<void>;
    renameItem(item: IEnhancedFileItem, newName: string): Promise<void>;
    createFile(parentPath: string, fileName: string): Promise<void>;
    createFolder(parentPath: string, folderName: string): Promise<void>;
    
    // Selection management
    getSelectedItems(): IEnhancedFileItem[];
    setSelectedItems(items: IEnhancedFileItem[]): void;
    selectAll(): void;
}

// ===== File Operation Service Interface =====

/**
 * File operation service interface
 */
export interface IFileOperationService {
    copyFiles(sources: string[], destination: string): Promise<void>;
    moveFiles(sources: string[], destination: string): Promise<void>;
    deleteFiles(paths: string[]): Promise<void>;
    renameFile(oldPath: string, newPath: string): Promise<void>;
    createFile(path: string, content?: string): Promise<void>;
    createDirectory(path: string): Promise<void>;
    validateFileName(name: string): ValidationResult;
    getFileStats(path: string): Promise<FileStats>;
}

// ===== Clipboard Manager Interface =====

/**
 * Clipboard manager interface
 */
export interface IClipboardManager {
    copy(items: IEnhancedFileItem[]): Promise<void>;
    cut(items: IEnhancedFileItem[]): Promise<void>;
    paste(targetPath: string): Promise<IEnhancedFileItem[]>;
    canPaste(): boolean;
    getClipboardItems(): IEnhancedFileItem[];
    getClipboardOperation(): 'copy' | 'cut' | null;
    
    // System clipboard integration
    hasSystemClipboardData(): Promise<boolean>;
    importFromSystemClipboard(): Promise<boolean>;
    exportToSystemClipboard(): Promise<void>;
    clearSystemClipboard(): Promise<void>;
}

/**
 * Clipboard data model
 */
export interface ClipboardData {
    items: IEnhancedFileItem[];
    operation: 'copy' | 'cut';
    timestamp: Date;
    sourceProvider: string; // Which provider the operation came from
}

// ===== Multi-Selection Manager Interface =====

/**
 * Multi-selection manager interface
 */
export interface IMultiSelectionManager {
    addToSelection(item: IEnhancedFileItem): void;
    removeFromSelection(item: IEnhancedFileItem): void;
    setSelection(items: IEnhancedFileItem[]): void;
    getSelection(): IEnhancedFileItem[];
    clearSelection(): void;
    selectRange(startItem: IEnhancedFileItem, endItem: IEnhancedFileItem): void;
    isSelected(item: IEnhancedFileItem): boolean;
}

// ===== Enhanced TreeDataProvider Interface =====

/**
 * Enhanced tree data provider interface
 */
export interface IEnhancedTreeDataProvider<T> extends vscode.TreeDataProvider<T> {
    // Selection management
    getSelectedItems(): T[];
    setSelectedItems(items: T[]): void;
    
    // Drag & Drop support
    handleDragStart?(items: T[]): vscode.DataTransfer | Thenable<vscode.DataTransfer>;
    handleDrop?(target: T, dataTransfer: vscode.DataTransfer): Thenable<void>;
    
    // Search & Filtering
    filter(query: string): Promise<void>;
    clearFilter(): void;
    
    // Sorting
    setSortOrder(order: SortOrder): void;
    getSortOrder(): SortOrder;
}

// ===== Keyboard Shortcut Handler Interface =====

/**
 * Keyboard shortcut handler interface
 */
export interface IKeyboardShortcutHandler {
    registerShortcuts(): void;
    handleCopy(): Promise<void>;
    handleCut(): Promise<void>;
    handlePaste(): Promise<void>;
    handleDelete(): Promise<void>;
    handleRename(): Promise<void>;
    handleSelectAll(): Promise<void>;
}

// ===== Context Menu Manager Interface =====

/**
 * Context menu manager interface
 */
export interface IContextMenuManager {
    registerContextMenus(): void;
    showContextMenu(item: IEnhancedFileItem, position: vscode.Position): Promise<void>;
    getMenuItems(item: IEnhancedFileItem): ContextMenuItem[];
}

/**
 * Context menu item interface
 */
export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: string;
    enabled: boolean;
    action: () => Promise<void>;
}

// ===== Drag & Drop Handler Interface =====

/**
 * Drag & Drop handler interface
 */
export interface IDragDropHandler {
    handleDragStart(items: IEnhancedFileItem[]): vscode.DataTransfer;
    handleDropInternal(target: IEnhancedFileItem, dataTransfer: vscode.DataTransfer, operation: 'move' | 'copy'): Promise<void>;
    canDrop(target: IEnhancedFileItem, items: IEnhancedFileItem[]): boolean;
    getDropOperation(modifierKeys: { ctrl: boolean; shift: boolean; alt: boolean }): 'move' | 'copy';
}

// ===== Cache Manager Interface =====

/**
 * Cache manager interface
 */
export interface ICacheManager {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, ttl?: number): void;
    invalidate(key: string): void;
    clear(): void;
}

/**
 * Cache entry interface
 */
export interface CacheEntry {
    value: any;
    timestamp: number;
    ttl: number;
}

// ===== Search Manager Interface =====

/**
 * Search pattern types
 */
export type SearchPatternType = 'literal' | 'wildcard' | 'regex';

/**
 * Search options interface
 */
export interface SearchOptions {
    caseSensitive: boolean;
    patternType: SearchPatternType;
    includeHidden: boolean;
    searchInContent: boolean;
}

/**
 * Search result interface
 */
export interface SearchResult {
    item: IEnhancedFileItem;
    matches: SearchMatch[];
    score: number; // Relevance score for sorting
}

/**
 * Search match interface
 */
export interface SearchMatch {
    type: 'filename' | 'content';
    text: string;
    startIndex: number;
    endIndex: number;
}

/**
 * Search manager interface
 */
export interface ISearchManager {
    search(query: string, items: IEnhancedFileItem[], options?: Partial<SearchOptions>): Promise<SearchResult[]>;
    createPattern(query: string, patternType: SearchPatternType, caseSensitive: boolean): RegExp | null;
    matchesPattern(text: string, pattern: RegExp): SearchMatch[];
    calculateRelevanceScore(item: IEnhancedFileItem, matches: SearchMatch[], query: string): number;
    
    // Search history
    addToHistory(query: string): void;
    getHistory(): string[];
    clearHistory(): void;
    
    // Search suggestions
    getSuggestions(partialQuery: string, items: IEnhancedFileItem[]): string[];
}

// ===== Error Handler Interface =====

/**
 * Error handler interface
 */
export interface IErrorHandler {
    handleFileOperationError(error: FileOperationError): Promise<void>;
    showUserFriendlyMessage(error: FileOperationError): void;
    logError(error: Error, context: string): void;
    canRecover(error: FileOperationError): boolean;
    attemptRecovery(error: FileOperationError): Promise<boolean>;
}