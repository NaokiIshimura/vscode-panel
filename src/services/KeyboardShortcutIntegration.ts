import * as vscode from 'vscode';
import { KeyboardShortcutHandler } from './KeyboardShortcutHandler';
import { ClipboardManager } from './ClipboardManager';
import { FileOperationService } from './FileOperationService';
import { MultiSelectionManager } from './MultiSelectionManager';
import { IEnhancedFileItem } from '../interfaces/core';

/**
 * Context provider interface for getting current state
 */
export interface IContextProvider {
    getSelectedItems(): IEnhancedFileItem[];
    getCurrentPath(): string | undefined;
    getActiveProvider(): string;
    refreshView(): Promise<void>;
}

/**
 * Keyboard shortcut conflict resolution strategy
 */
export enum ConflictResolution {
    PreferExtension = 'prefer-extension',
    PreferVSCode = 'prefer-vscode',
    Disable = 'disable'
}

/**
 * Keyboard shortcut integration configuration
 */
export interface KeyboardShortcutIntegrationConfig {
    enabled: boolean;
    conflictResolution: ConflictResolution;
    contextSensitive: boolean;
    debugMode: boolean;
}

/**
 * Integration service that connects keyboard shortcuts with file operations
 */
export class KeyboardShortcutIntegration {
    private readonly context: vscode.ExtensionContext;
    private readonly keyboardHandler: KeyboardShortcutHandler;
    private readonly clipboardManager: ClipboardManager;
    private readonly fileOperationService: FileOperationService;
    private readonly multiSelectionManager: MultiSelectionManager;
    private readonly disposables: vscode.Disposable[] = [];
    
    private contextProvider: IContextProvider | null = null;
    private config: KeyboardShortcutIntegrationConfig;
    private conflictDetector: Map<string, string[]> = new Map();

    constructor(
        context: vscode.ExtensionContext,
        keyboardHandler: KeyboardShortcutHandler,
        clipboardManager: ClipboardManager,
        fileOperationService: FileOperationService,
        multiSelectionManager: MultiSelectionManager
    ) {
        this.context = context;
        this.keyboardHandler = keyboardHandler;
        this.clipboardManager = clipboardManager;
        this.fileOperationService = fileOperationService;
        this.multiSelectionManager = multiSelectionManager;
        
        // Load configuration
        this.config = this.loadConfiguration();
        
        // Initialize integration
        this.initialize();
    }

    /**
     * Initialize the keyboard shortcut integration
     */
    public initialize(): void {
        if (!this.config.enabled) {
            return;
        }

        // Initialize the keyboard shortcut handler first
        this.keyboardHandler.initialize();

        // Setup context-sensitive behavior
        if (this.config.contextSensitive) {
            this.setupContextSensitiveShortcuts();
        }

        // Setup conflict detection and resolution
        this.setupConflictResolution();

        // Setup configuration change listener
        this.setupConfigurationListener();

        // Register integration commands
        this.registerIntegrationCommands();
    }

    /**
     * Set the context provider for getting current state
     */
    setContextProvider(provider: IContextProvider): void {
        this.contextProvider = provider;
    }

    /**
     * Setup context-sensitive keyboard shortcuts
     */
    private setupContextSensitiveShortcuts(): void {
        // Listen for active editor changes to update context
        const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
            this.updateShortcutContext(editor);
        });

        // Listen for view focus changes
        const viewFocusListener = vscode.window.onDidChangeWindowState((state) => {
            if (state.focused) {
                this.updateShortcutContext();
            }
        });

        this.disposables.push(activeEditorListener, viewFocusListener);
    }

    /**
     * Update shortcut context based on current state
     */
    private updateShortcutContext(editor?: vscode.TextEditor): void {
        if (!this.contextProvider) {
            return;
        }

        const activeProvider = this.contextProvider.getActiveProvider();
        const isFileListView = this.isFileListView(activeProvider);

        // Enable/disable shortcuts based on context
        if (isFileListView) {
            this.keyboardHandler.enable();
            this.logDebug(`Enabled shortcuts for provider: ${activeProvider}`);
        } else {
            // Check if we should disable shortcuts when not in file list views
            const shouldDisable = this.shouldDisableInContext(activeProvider);
            if (shouldDisable) {
                this.keyboardHandler.disable();
                this.logDebug(`Disabled shortcuts for provider: ${activeProvider}`);
            }
        }
    }

    /**
     * Check if the given provider is a file list view
     */
    private isFileListView(provider: string): boolean {
        const fileListProviders = [
            'fileListDetails',
            'fileListExplorer', 
            'workspaceExplorer'
        ];
        return fileListProviders.includes(provider);
    }

    /**
     * Check if shortcuts should be disabled in the current context
     */
    private shouldDisableInContext(provider: string): boolean {
        // Don't disable shortcuts in text editors or other contexts
        // Only disable if explicitly configured to do so
        return false;
    }

    /**
     * Setup conflict detection and resolution
     */
    private setupConflictResolution(): void {
        // Detect potential conflicts with VSCode built-in shortcuts
        this.detectShortcutConflicts();

        // Apply conflict resolution strategy
        this.applyConflictResolution();
    }

    /**
     * Detect potential conflicts with VSCode shortcuts
     */
    private detectShortcutConflicts(): void {
        const shortcuts = this.keyboardHandler.getShortcutConfiguration();
        const vscodeShortcuts = this.getVSCodeShortcuts();

        this.conflictDetector.clear();

        for (const [action, shortcut] of Object.entries(shortcuts)) {
            const conflicts = vscodeShortcuts.filter(vscShortcut => 
                this.shortcutsConflict(shortcut, vscShortcut.key)
            );

            if (conflicts.length > 0) {
                this.conflictDetector.set(action, conflicts.map(c => c.command));
                this.logDebug(`Detected conflict for ${action} (${shortcut}): ${conflicts.map(c => c.command).join(', ')}`);
            }
        }
    }

    /**
     * Get VSCode built-in shortcuts that might conflict
     */
    private getVSCodeShortcuts(): Array<{ command: string; key: string }> {
        // This is a simplified list of common VSCode shortcuts
        // In a real implementation, this could be dynamically retrieved
        return [
            { command: 'editor.action.clipboardCopyAction', key: 'ctrl+c' },
            { command: 'editor.action.clipboardCutAction', key: 'ctrl+x' },
            { command: 'editor.action.clipboardPasteAction', key: 'ctrl+v' },
            { command: 'deleteFile', key: 'delete' },
            { command: 'renameFile', key: 'f2' },
            { command: 'editor.action.selectAll', key: 'ctrl+a' },
            { command: 'workbench.action.files.newUntitledFile', key: 'ctrl+n' },
            { command: 'workbench.action.files.newFolder', key: 'ctrl+shift+n' },
            { command: 'workbench.action.reloadWindow', key: 'f5' }
        ];
    }

    /**
     * Check if two shortcuts conflict
     */
    private shortcutsConflict(shortcut1: string, shortcut2: string): boolean {
        // Normalize shortcuts for comparison
        const normalize = (shortcut: string) => shortcut.toLowerCase().replace(/\s+/g, '');
        return normalize(shortcut1) === normalize(shortcut2);
    }

    /**
     * Apply conflict resolution strategy
     */
    private applyConflictResolution(): void {
        if (this.conflictDetector.size === 0) {
            return;
        }

        switch (this.config.conflictResolution) {
            case ConflictResolution.PreferExtension:
                this.resolveConflictsPreferExtension();
                break;
            case ConflictResolution.PreferVSCode:
                this.resolveConflictsPreferVSCode();
                break;
            case ConflictResolution.Disable:
                this.resolveConflictsDisable();
                break;
        }
    }

    /**
     * Resolve conflicts by preferring extension shortcuts
     */
    private resolveConflictsPreferExtension(): void {
        // Extension shortcuts take precedence
        // VSCode shortcuts will be overridden in file list contexts
        this.logDebug('Resolving conflicts: Preferring extension shortcuts');
        
        for (const [action, conflicts] of this.conflictDetector.entries()) {
            vscode.window.showInformationMessage(
                `キーボードショートカット "${action}" がVSCodeの標準ショートカットと競合しています。拡張機能のショートカットが優先されます。`
            );
        }
    }

    /**
     * Resolve conflicts by preferring VSCode shortcuts
     */
    private resolveConflictsPreferVSCode(): void {
        // Disable conflicting extension shortcuts
        this.logDebug('Resolving conflicts: Preferring VSCode shortcuts');
        
        const shortcuts = this.keyboardHandler.getShortcutConfiguration();
        const updatedShortcuts: Partial<typeof shortcuts> = {};

        for (const [action] of this.conflictDetector.entries()) {
            // Generate alternative shortcut
            const originalShortcut = shortcuts[action as keyof typeof shortcuts];
            const alternativeShortcut = this.generateAlternativeShortcut(originalShortcut);
            updatedShortcuts[action as keyof typeof shortcuts] = alternativeShortcut;
            
            vscode.window.showInformationMessage(
                `キーボードショートカット "${action}" を "${alternativeShortcut}" に変更しました（競合回避のため）。`
            );
        }

        this.keyboardHandler.updateShortcutConfiguration(updatedShortcuts);
    }

    /**
     * Resolve conflicts by disabling conflicting shortcuts
     */
    private resolveConflictsDisable(): void {
        this.logDebug('Resolving conflicts: Disabling conflicting shortcuts');
        
        for (const [action] of this.conflictDetector.entries()) {
            vscode.window.showWarningMessage(
                `キーボードショートカット "${action}" は競合のため無効化されました。設定で変更できます。`
            );
        }

        // Disable the keyboard handler for conflicting shortcuts
        // This would require extending the handler to support selective disabling
    }

    /**
     * Generate an alternative shortcut to avoid conflicts
     */
    private generateAlternativeShortcut(originalShortcut: string): string {
        // Simple strategy: add Alt modifier
        if (originalShortcut.includes('ctrl+')) {
            return originalShortcut.replace('ctrl+', 'ctrl+alt+');
        } else if (originalShortcut.includes('cmd+')) {
            return originalShortcut.replace('cmd+', 'cmd+alt+');
        } else {
            return `alt+${originalShortcut}`;
        }
    }

    /**
     * Register integration-specific commands
     */
    private registerIntegrationCommands(): void {
        // Command to toggle keyboard shortcuts
        const toggleCommand = vscode.commands.registerCommand(
            'fileListExtension.keyboard.toggle',
            () => this.toggleKeyboardShortcuts()
        );

        // Command to resolve conflicts manually
        const resolveConflictsCommand = vscode.commands.registerCommand(
            'fileListExtension.keyboard.resolveConflicts',
            () => this.showConflictResolutionDialog()
        );

        // Command to reset shortcuts to defaults
        const resetCommand = vscode.commands.registerCommand(
            'fileListExtension.keyboard.reset',
            () => this.resetShortcutsToDefaults()
        );

        // Command to show shortcut help
        const helpCommand = vscode.commands.registerCommand(
            'fileListExtension.keyboard.help',
            () => this.showShortcutHelp()
        );

        this.disposables.push(toggleCommand, resolveConflictsCommand, resetCommand, helpCommand);
        this.context.subscriptions.push(...this.disposables);
    }

    /**
     * Toggle keyboard shortcuts on/off
     */
    private async toggleKeyboardShortcuts(): Promise<void> {
        const isEnabled = this.keyboardHandler.isShortcutsEnabled();
        
        if (isEnabled) {
            this.keyboardHandler.disable();
            vscode.window.showInformationMessage('キーボードショートカットを無効にしました');
        } else {
            this.keyboardHandler.enable();
            vscode.window.showInformationMessage('キーボードショートカットを有効にしました');
        }
    }

    /**
     * Show conflict resolution dialog
     */
    private async showConflictResolutionDialog(): Promise<void> {
        if (this.conflictDetector.size === 0) {
            vscode.window.showInformationMessage('キーボードショートカットの競合は検出されませんでした');
            return;
        }

        const options = [
            '拡張機能を優先',
            'VSCodeを優先', 
            '競合するショートカットを無効化',
            'キャンセル'
        ];

        const choice = await vscode.window.showQuickPick(options, {
            placeHolder: 'キーボードショートカットの競合をどのように解決しますか？'
        });

        switch (choice) {
            case '拡張機能を優先':
                this.config.conflictResolution = ConflictResolution.PreferExtension;
                break;
            case 'VSCodeを優先':
                this.config.conflictResolution = ConflictResolution.PreferVSCode;
                break;
            case '競合するショートカットを無効化':
                this.config.conflictResolution = ConflictResolution.Disable;
                break;
            default:
                return;
        }

        await this.saveConfiguration();
        this.applyConflictResolution();
    }

    /**
     * Reset shortcuts to defaults
     */
    private async resetShortcutsToDefaults(): Promise<void> {
        const confirmation = await vscode.window.showWarningMessage(
            'キーボードショートカットをデフォルトに戻しますか？',
            { modal: true },
            'はい',
            'いいえ'
        );

        if (confirmation === 'はい') {
            await this.keyboardHandler.resetToDefaults();
            vscode.window.showInformationMessage('キーボードショートカットをデフォルトに戻しました');
        }
    }

    /**
     * Show keyboard shortcut help
     */
    private async showShortcutHelp(): Promise<void> {
        const shortcuts = this.keyboardHandler.getShortcutConfiguration();
        
        let helpText = '# File List Extension キーボードショートカット\n\n';
        
        const shortcutDescriptions = {
            copy: 'コピー',
            cut: '切り取り',
            paste: '貼り付け',
            delete: '削除',
            rename: '名前の変更',
            selectAll: 'すべて選択',
            newFile: '新しいファイル',
            newFolder: '新しいフォルダ',
            refresh: '更新'
        };

        for (const [action, shortcut] of Object.entries(shortcuts)) {
            const description = shortcutDescriptions[action as keyof typeof shortcutDescriptions] || action;
            helpText += `- **${description}**: \`${shortcut}\`\n`;
        }

        if (this.conflictDetector.size > 0) {
            helpText += '\n## 競合の検出\n\n';
            for (const [action, conflicts] of this.conflictDetector.entries()) {
                helpText += `- **${action}**: ${conflicts.join(', ')} と競合\n`;
            }
        }

        // Create and show help document
        const doc = await vscode.workspace.openTextDocument({
            content: helpText,
            language: 'markdown'
        });
        
        await vscode.window.showTextDocument(doc);
    }

    /**
     * Setup configuration change listener
     */
    private setupConfigurationListener(): void {
        const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('fileListExtension.keyboard.integration')) {
                this.config = this.loadConfiguration();
                this.initialize();
            }
        });

        this.disposables.push(configListener);
    }

    /**
     * Load integration configuration from settings
     */
    private loadConfiguration(): KeyboardShortcutIntegrationConfig {
        const config = vscode.workspace.getConfiguration('fileListExtension.keyboard.integration');
        
        return {
            enabled: config.get<boolean>('enabled') ?? true,
            conflictResolution: config.get<ConflictResolution>('conflictResolution') ?? ConflictResolution.PreferExtension,
            contextSensitive: config.get<boolean>('contextSensitive') ?? true,
            debugMode: config.get<boolean>('debugMode') ?? false
        };
    }

    /**
     * Save configuration to settings
     */
    private async saveConfiguration(): Promise<void> {
        const config = vscode.workspace.getConfiguration('fileListExtension.keyboard.integration');
        
        await config.update('conflictResolution', this.config.conflictResolution, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * Log debug message if debug mode is enabled
     */
    private logDebug(message: string): void {
        if (this.config.debugMode) {
            console.log(`[KeyboardShortcutIntegration] ${message}`);
        }
    }

    /**
     * Get integration status for debugging
     */
    getIntegrationStatus(): {
        enabled: boolean;
        conflicts: number;
        contextProvider: boolean;
        shortcutsEnabled: boolean;
    } {
        return {
            enabled: this.config.enabled,
            conflicts: this.conflictDetector.size,
            contextProvider: this.contextProvider !== null,
            shortcutsEnabled: this.keyboardHandler.isShortcutsEnabled()
        };
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables.length = 0;
        this.contextProvider = null;
        this.conflictDetector.clear();
    }
}