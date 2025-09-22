import * as vscode from 'vscode';
import { SortOrder, ViewMode } from '../types/enums';
import { ExplorerSettings } from '../types/settings';
import { getConfigurationProvider } from './ConfigurationProvider';
import { IEnhancedFileItem } from '../interfaces/core';

/**
 * Interface for display customization capabilities
 */
export interface IDisplayCustomizationService {
    // Sort order management
    setSortOrder(order: SortOrder): Promise<void>;
    getSortOrder(): SortOrder;
    cycleSortOrder(): Promise<void>;
    
    // View mode management
    setViewMode(mode: ViewMode): Promise<void>;
    getViewMode(): ViewMode;
    toggleViewMode(): Promise<void>;
    
    // Hidden files management
    setShowHiddenFiles(show: boolean): Promise<void>;
    getShowHiddenFiles(): boolean;
    toggleHiddenFiles(): Promise<void>;
    
    // File filtering
    shouldShowFile(item: IEnhancedFileItem): boolean;
    
    // Visual settings
    setCompactMode(compact: boolean): Promise<void>;
    getCompactMode(): boolean;
    toggleCompactMode(): Promise<void>;
    
    // Icon and info display
    setShowFileIcons(show: boolean): Promise<void>;
    getShowFileIcons(): boolean;
    setShowFileSize(show: boolean): Promise<void>;
    getShowFileSize(): boolean;
    setShowModifiedDate(show: boolean): Promise<void>;
    getShowModifiedDate(): boolean;
    
    // Event handling
    onDisplaySettingsChanged(callback: (settings: Partial<ExplorerSettings>) => void): vscode.Disposable;
}

/**
 * Service for managing display customization features
 */
export class DisplayCustomizationService implements IDisplayCustomizationService {
    private readonly changeEmitter = new vscode.EventEmitter<Partial<ExplorerSettings>>();
    private disposables: vscode.Disposable[] = [];
    private currentSettings: ExplorerSettings;

    constructor() {
        const configProvider = getConfigurationProvider();
        this.currentSettings = configProvider.getAll();
        
        // Listen for configuration changes
        this.disposables.push(
            configProvider.onDidChange((key, value) => {
                (this.currentSettings as any)[key] = value;
                this.changeEmitter.fire({ [key]: value });
            })
        );
    }

    // ===== Sort Order Management =====

    /**
     * Set the sort order
     */
    async setSortOrder(order: SortOrder): Promise<void> {
        await getConfigurationProvider().set('sortOrder', order);
        this.currentSettings.sortOrder = order;
    }

    /**
     * Get the current sort order
     */
    getSortOrder(): SortOrder {
        return this.currentSettings.sortOrder;
    }

    /**
     * Cycle through sort orders
     */
    async cycleSortOrder(): Promise<void> {
        const orders = Object.values(SortOrder);
        const currentIndex = orders.indexOf(this.currentSettings.sortOrder);
        const nextIndex = (currentIndex + 1) % orders.length;
        await this.setSortOrder(orders[nextIndex]);
        
        // Show status message
        const orderNames = {
            [SortOrder.NameAsc]: '名前（昇順）',
            [SortOrder.NameDesc]: '名前（降順）',
            [SortOrder.SizeAsc]: 'サイズ（昇順）',
            [SortOrder.SizeDesc]: 'サイズ（降順）',
            [SortOrder.ModifiedAsc]: '更新日時（昇順）',
            [SortOrder.ModifiedDesc]: '更新日時（降順）'
        };
        
        vscode.window.showInformationMessage(
            `ソート順序を変更しました: ${orderNames[orders[nextIndex]]}`
        );
    }

    // ===== View Mode Management =====

    /**
     * Set the view mode
     */
    async setViewMode(mode: ViewMode): Promise<void> {
        await getConfigurationProvider().set('displayMode', mode);
        this.currentSettings.displayMode = mode;
    }

    /**
     * Get the current view mode
     */
    getViewMode(): ViewMode {
        return this.currentSettings.displayMode;
    }

    /**
     * Toggle between list and tree view modes
     */
    async toggleViewMode(): Promise<void> {
        const currentMode = this.currentSettings.displayMode;
        const newMode = currentMode === ViewMode.List ? ViewMode.Tree : ViewMode.List;
        await this.setViewMode(newMode);
        
        // Show status message
        const modeNames = {
            [ViewMode.List]: 'リスト表示',
            [ViewMode.Tree]: 'ツリー表示'
        };
        
        vscode.window.showInformationMessage(
            `表示モードを変更しました: ${modeNames[newMode]}`
        );
    }

    // ===== Hidden Files Management =====

    /**
     * Set whether to show hidden files
     */
    async setShowHiddenFiles(show: boolean): Promise<void> {
        await getConfigurationProvider().set('showHiddenFiles', show);
        this.currentSettings.showHiddenFiles = show;
    }

    /**
     * Get whether hidden files are shown
     */
    getShowHiddenFiles(): boolean {
        return this.currentSettings.showHiddenFiles;
    }

    /**
     * Toggle hidden files visibility
     */
    async toggleHiddenFiles(): Promise<void> {
        const newValue = !this.currentSettings.showHiddenFiles;
        await this.setShowHiddenFiles(newValue);
        
        vscode.window.showInformationMessage(
            `隠しファイルの表示を${newValue ? '有効' : '無効'}にしました`
        );
    }

    // ===== File Filtering =====

    /**
     * Determine if a file should be shown based on current settings
     */
    shouldShowFile(item: IEnhancedFileItem): boolean {
        // Check hidden files setting
        if (!this.currentSettings.showHiddenFiles && this.isHiddenFile(item)) {
            return false;
        }

        // Additional filtering logic can be added here
        return true;
    }

    /**
     * Check if a file is hidden
     */
    private isHiddenFile(item: IEnhancedFileItem): boolean {
        const fileName = item.label;
        
        // Files starting with dot are hidden on Unix-like systems
        if (fileName.startsWith('.')) {
            return true;
        }

        // Check file permissions if available
        if (item.permissions?.hidden) {
            return true;
        }

        return false;
    }

    // ===== Visual Settings =====

    /**
     * Set compact mode
     */
    async setCompactMode(compact: boolean): Promise<void> {
        await getConfigurationProvider().set('compactMode', compact);
        this.currentSettings.compactMode = compact;
    }

    /**
     * Get compact mode setting
     */
    getCompactMode(): boolean {
        return this.currentSettings.compactMode;
    }

    /**
     * Toggle compact mode
     */
    async toggleCompactMode(): Promise<void> {
        const newValue = !this.currentSettings.compactMode;
        await this.setCompactMode(newValue);
        
        vscode.window.showInformationMessage(
            `コンパクトモードを${newValue ? '有効' : '無効'}にしました`
        );
    }

    /**
     * Set file icons visibility
     */
    async setShowFileIcons(show: boolean): Promise<void> {
        await getConfigurationProvider().set('showFileIcons', show);
        this.currentSettings.showFileIcons = show;
    }

    /**
     * Get file icons visibility
     */
    getShowFileIcons(): boolean {
        return this.currentSettings.showFileIcons;
    }

    /**
     * Set file size visibility
     */
    async setShowFileSize(show: boolean): Promise<void> {
        await getConfigurationProvider().set('showFileSize', show);
        this.currentSettings.showFileSize = show;
    }

    /**
     * Get file size visibility
     */
    getShowFileSize(): boolean {
        return this.currentSettings.showFileSize;
    }

    /**
     * Set modified date visibility
     */
    async setShowModifiedDate(show: boolean): Promise<void> {
        await getConfigurationProvider().set('showModifiedDate', show);
        this.currentSettings.showModifiedDate = show;
    }

    /**
     * Get modified date visibility
     */
    getShowModifiedDate(): boolean {
        return this.currentSettings.showModifiedDate;
    }

    // ===== Quick Actions =====

    /**
     * Show quick settings menu
     */
    async showQuickSettings(): Promise<void> {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(sort-precedence) ソート順序を変更',
                description: `現在: ${this.getSortOrderDisplayName(this.currentSettings.sortOrder)}`,
                detail: 'ファイルの並び順を変更します'
            },
            {
                label: '$(list-tree) 表示モードを切り替え',
                description: `現在: ${this.getViewModeDisplayName(this.currentSettings.displayMode)}`,
                detail: 'リスト表示とツリー表示を切り替えます'
            },
            {
                label: '$(eye) 隠しファイルの表示を切り替え',
                description: `現在: ${this.currentSettings.showHiddenFiles ? '表示' : '非表示'}`,
                detail: 'ドットファイルなどの隠しファイルの表示を切り替えます'
            },
            {
                label: '$(layout) コンパクトモードを切り替え',
                description: `現在: ${this.currentSettings.compactMode ? '有効' : '無効'}`,
                detail: 'より密な表示にします'
            },
            {
                label: '$(symbol-file) ファイル情報の表示設定',
                description: 'アイコン、サイズ、更新日時の表示を設定',
                detail: 'ファイル詳細情報の表示項目を設定します'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'エクスプローラー表示設定',
            placeHolder: '変更したい設定を選択してください'
        });

        if (!selected) {
            return;
        }

        switch (selected.label) {
            case '$(sort-precedence) ソート順序を変更':
                await this.showSortOrderPicker();
                break;
            case '$(list-tree) 表示モードを切り替え':
                await this.toggleViewMode();
                break;
            case '$(eye) 隠しファイルの表示を切り替え':
                await this.toggleHiddenFiles();
                break;
            case '$(layout) コンパクトモードを切り替え':
                await this.toggleCompactMode();
                break;
            case '$(symbol-file) ファイル情報の表示設定':
                await this.showFileInfoSettings();
                break;
        }
    }

    /**
     * Show sort order picker
     */
    private async showSortOrderPicker(): Promise<void> {
        const items: vscode.QuickPickItem[] = Object.values(SortOrder).map(order => ({
            label: this.getSortOrderDisplayName(order),
            description: order === this.currentSettings.sortOrder ? '(現在の設定)' : '',
            detail: this.getSortOrderDescription(order)
        }));

        const selected = await vscode.window.showQuickPick(items, {
            title: 'ソート順序を選択',
            placeHolder: 'ファイルの並び順を選択してください'
        });

        if (selected) {
            const order = Object.values(SortOrder).find(o => 
                this.getSortOrderDisplayName(o) === selected.label
            );
            if (order) {
                await this.setSortOrder(order);
            }
        }
    }

    /**
     * Show file info settings
     */
    private async showFileInfoSettings(): Promise<void> {
        const items: vscode.QuickPickItem[] = [
            {
                label: `$(symbol-file) ファイルアイコン`,
                description: this.currentSettings.showFileIcons ? '✓ 表示' : '✗ 非表示',
                detail: 'ファイルタイプに応じたアイコンを表示'
            },
            {
                label: `$(info) ファイルサイズ`,
                description: this.currentSettings.showFileSize ? '✓ 表示' : '✗ 非表示',
                detail: 'ファイルサイズ情報を表示'
            },
            {
                label: `$(history) 更新日時`,
                description: this.currentSettings.showModifiedDate ? '✓ 表示' : '✗ 非表示',
                detail: 'ファイルの最終更新日時を表示'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'ファイル情報表示設定',
            placeHolder: '切り替えたい項目を選択してください',
            canPickMany: false
        });

        if (!selected) {
            return;
        }

        if (selected.label.includes('ファイルアイコン')) {
            await this.setShowFileIcons(!this.currentSettings.showFileIcons);
        } else if (selected.label.includes('ファイルサイズ')) {
            await this.setShowFileSize(!this.currentSettings.showFileSize);
        } else if (selected.label.includes('更新日時')) {
            await this.setShowModifiedDate(!this.currentSettings.showModifiedDate);
        }
    }

    // ===== Helper Methods =====

    /**
     * Get display name for sort order
     */
    private getSortOrderDisplayName(order: SortOrder): string {
        const names = {
            [SortOrder.NameAsc]: '名前（昇順）',
            [SortOrder.NameDesc]: '名前（降順）',
            [SortOrder.SizeAsc]: 'サイズ（昇順）',
            [SortOrder.SizeDesc]: 'サイズ（降順）',
            [SortOrder.ModifiedAsc]: '更新日時（昇順）',
            [SortOrder.ModifiedDesc]: '更新日時（降順）'
        };
        return names[order];
    }

    /**
     * Get description for sort order
     */
    private getSortOrderDescription(order: SortOrder): string {
        const descriptions = {
            [SortOrder.NameAsc]: 'ファイル名のアルファベット順（A→Z）',
            [SortOrder.NameDesc]: 'ファイル名の逆アルファベット順（Z→A）',
            [SortOrder.SizeAsc]: 'ファイルサイズの小さい順',
            [SortOrder.SizeDesc]: 'ファイルサイズの大きい順',
            [SortOrder.ModifiedAsc]: '更新日時の古い順',
            [SortOrder.ModifiedDesc]: '更新日時の新しい順'
        };
        return descriptions[order];
    }

    /**
     * Get display name for view mode
     */
    private getViewModeDisplayName(mode: ViewMode): string {
        const names = {
            [ViewMode.List]: 'リスト表示',
            [ViewMode.Tree]: 'ツリー表示'
        };
        return names[mode];
    }

    // ===== Event Handling =====

    /**
     * Register callback for display settings changes
     */
    onDisplaySettingsChanged(callback: (settings: Partial<ExplorerSettings>) => void): vscode.Disposable {
        return this.changeEmitter.event(callback);
    }

    // ===== Disposal =====

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.changeEmitter.dispose();
    }
}

/**
 * Singleton instance of the display customization service
 */
export const displayCustomizationService = new DisplayCustomizationService();