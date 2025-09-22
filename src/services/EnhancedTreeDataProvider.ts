import * as vscode from 'vscode';
import { IEnhancedTreeDataProvider, IEnhancedFileItem, IDragDropHandler, ISearchManager, SearchResult, SearchOptions, SearchMatch } from '../interfaces/core';
import { SortOrder } from '../types/enums';
import { MultiSelectionManager } from './MultiSelectionManager';
import { DragDropHandler } from './DragDropHandler';
import { SearchManager } from './SearchManager';

/**
 * Base class for enhanced tree data providers with multi-selection support
 */
export abstract class EnhancedTreeDataProvider<T extends IEnhancedFileItem> implements IEnhancedTreeDataProvider<T> {
    protected _onDidChangeTreeData: vscode.EventEmitter<T | undefined | null | void> = new vscode.EventEmitter<T | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<T | undefined | null | void> = this._onDidChangeTreeData.event;

    protected selectionManager: MultiSelectionManager;
    protected dragDropHandler: DragDropHandler;
    protected searchManager: SearchManager;
    protected treeView: vscode.TreeView<T> | undefined;
    protected currentFilter: string = '';
    protected currentSortOrder: SortOrder = SortOrder.NameAsc;
    protected allItems: T[] = [];
    protected searchResults: SearchResult[] = [];
    protected isSearchActive: boolean = false;
    protected highlightedItems: Set<string> = new Set();

    constructor() {
        this.selectionManager = new MultiSelectionManager();
        this.dragDropHandler = new DragDropHandler();
        this.searchManager = new SearchManager();
        
        // Listen to selection changes to update tree view
        this.selectionManager.onSelectionChanged((selection) => {
            this.onSelectionChanged(selection);
        });
    }

    /**
     * Set the tree view instance for this provider
     */
    public setTreeView(treeView: vscode.TreeView<T>): void {
        this.treeView = treeView;
        
        // Set up selection handling
        treeView.onDidChangeSelection((e) => {
            if (e.selection.length > 0) {
                // Handle tree view selection changes
                this.handleTreeViewSelection(e.selection);
            }
        });
    }

    // ===== IEnhancedTreeDataProvider Implementation =====

    /**
     * Get currently selected items
     */
    public getSelectedItems(): T[] {
        return this.selectionManager.getSelection() as T[];
    }

    /**
     * Set selected items
     */
    public setSelectedItems(items: T[]): void {
        this.selectionManager.setSelection(items);
    }

    /**
     * Filter items based on query using search functionality
     */
    public async filter(query: string): Promise<void> {
        this.currentFilter = query;
        
        if (query.trim()) {
            this.isSearchActive = true;
            await this.performSearch(query);
        } else {
            this.isSearchActive = false;
            this.searchResults = [];
        }
        
        this.refresh();
    }

    /**
     * Clear current filter
     */
    public clearFilter(): void {
        this.currentFilter = '';
        this.isSearchActive = false;
        this.searchResults = [];
        this.refresh();
    }

    /**
     * Perform search with advanced options
     */
    public async performSearch(query: string, options?: Partial<SearchOptions>): Promise<SearchResult[]> {
        if (!query.trim()) {
            this.searchResults = [];
            return [];
        }

        try {
            this.searchResults = await this.searchManager.search(query, this.allItems, options);
            return this.searchResults;
        } catch (error) {
            console.error('Search failed:', error);
            this.searchResults = [];
            return [];
        }
    }

    /**
     * Get search suggestions
     */
    public getSearchSuggestions(partialQuery: string): string[] {
        return this.searchManager.getSuggestions(partialQuery, this.allItems);
    }

    /**
     * Get search history
     */
    public getSearchHistory(): string[] {
        return this.searchManager.getHistory();
    }

    /**
     * Clear search history
     */
    public clearSearchHistory(): void {
        this.searchManager.clearHistory();
    }

    /**
     * Check if search is currently active
     */
    public isSearching(): boolean {
        return this.isSearchActive;
    }

    /**
     * Get current search results
     */
    public getSearchResults(): SearchResult[] {
        return [...this.searchResults];
    }

    /**
     * Highlight search results in the tree
     */
    public highlightSearchResults(results: SearchResult[]): void {
        this.highlightedItems.clear();
        
        for (const result of results) {
            this.highlightedItems.add(result.item.id);
        }
        
        this.refresh();
    }

    /**
     * Clear search highlighting
     */
    public clearSearchHighlight(): void {
        this.highlightedItems.clear();
        this.refresh();
    }

    /**
     * Show search input and perform search
     */
    public async showSearchInput(): Promise<void> {
        const inputBox = vscode.window.createInputBox();
        
        inputBox.title = 'ファイル検索';
        inputBox.placeholder = 'ファイル名を入力 (*, ? でワイルドカード、/regex/ で正規表現)';
        inputBox.prompt = 'Enter: 検索実行, Escape: キャンセル';

        // Show search history as value suggestions
        const history = this.searchManager.getHistory();
        if (history.length > 0) {
            inputBox.value = history[0];
        }

        inputBox.onDidChangeValue(async (value) => {
            if (value.trim()) {
                // Debounced search as user types
                await this.performDebouncedSearch(value);
            } else {
                this.clearFilter();
            }
        });

        inputBox.onDidAccept(async () => {
            const query = inputBox.value.trim();
            if (query) {
                await this.filter(query);
                this.highlightSearchResults(this.searchResults);
            }
            inputBox.dispose();
        });

        inputBox.onDidHide(() => {
            inputBox.dispose();
        });

        inputBox.show();
    }

    /**
     * Perform debounced search
     */
    private debouncedSearchTimeout: NodeJS.Timeout | undefined;
    private async performDebouncedSearch(query: string): Promise<void> {
        if (this.debouncedSearchTimeout) {
            clearTimeout(this.debouncedSearchTimeout);
        }

        this.debouncedSearchTimeout = setTimeout(async () => {
            await this.performSearch(query);
        }, 300);
    }

    /**
     * Get search suggestions for autocomplete
     */
    public getSearchSuggestionsForInput(partialQuery: string): string[] {
        const suggestions = this.getSearchSuggestions(partialQuery);
        const history = this.getSearchHistory();
        
        // Combine suggestions and history, removing duplicates
        const combined = [...new Set([...suggestions, ...history])];
        
        // Filter by partial query and limit results
        return combined
            .filter(item => item.toLowerCase().includes(partialQuery.toLowerCase()))
            .slice(0, 10);
    }

    /**
     * Set sort order
     */
    public setSortOrder(order: SortOrder): void {
        this.currentSortOrder = order;
        this.refresh();
    }

    /**
     * Get current sort order
     */
    public getSortOrder(): SortOrder {
        return this.currentSortOrder;
    }

    /**
     * Handle drag start operation
     */
    public handleDragStart?(items: T[]): vscode.DataTransfer | Thenable<vscode.DataTransfer> {
        // Use selected items if no specific items provided
        const dragItems = items.length > 0 ? items : this.getSelectedItems();
        
        if (dragItems.length === 0) {
            throw new Error('No items to drag');
        }

        return this.dragDropHandler.handleDragStart(dragItems);
    }

    /**
     * Handle drop operation
     */
    public async handleDrop?(target: T, dataTransfer: vscode.DataTransfer): Promise<void> {
        // Determine operation based on current modifier keys
        // Note: In a real implementation, we'd need to get modifier keys from the event
        // For now, we'll default to move operation
        const operation = 'move'; // This should be determined by modifier keys

        await this.dragDropHandler.handleDropInternal(target as IEnhancedFileItem, dataTransfer, operation);
        
        // Refresh the tree after successful drop
        this.refresh();
    }

    // ===== Selection Management =====

    /**
     * Handle click on an item
     */
    public handleItemClick(item: T, modifierKeys: { ctrl: boolean; shift: boolean }): void {
        if (modifierKeys.ctrl) {
            this.selectionManager.handleCtrlClick(item);
        } else if (modifierKeys.shift) {
            this.selectionManager.handleShiftClick(item);
        } else {
            this.selectionManager.handleClick(item);
        }
    }

    /**
     * Select all items
     */
    public selectAll(): void {
        this.selectionManager.selectAll();
    }

    /**
     * Clear selection
     */
    public clearSelection(): void {
        this.selectionManager.clearSelection();
    }

    /**
     * Toggle selection of an item
     */
    public toggleSelection(item: T): void {
        this.selectionManager.toggleSelection(item);
    }

    // ===== Drag & Drop Support =====

    /**
     * Check if items can be dropped on target
     */
    public canDropOnTarget(target: T, items: T[]): boolean {
        return this.dragDropHandler.canDrop(target, items);
    }

    /**
     * Get visual feedback for drag operation
     */
    public getDragFeedback(items: T[], operation: 'move' | 'copy'): string {
        return this.dragDropHandler.getDragFeedback(items, operation);
    }

    /**
     * Update drag operation based on modifier keys
     */
    public updateDragOperation(modifierKeys: { ctrl: boolean; shift: boolean; alt: boolean }): void {
        this.dragDropHandler.updateDragOperation(modifierKeys);
    }

    // ===== Abstract Methods =====

    /**
     * Get tree item representation
     */
    public abstract getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem>;

    /**
     * Get children of an element
     */
    public abstract getChildren(element?: T): Thenable<T[]>;

    /**
     * Load all items for the current context
     */
    protected abstract loadAllItems(): Promise<T[]>;

    // ===== Protected Methods =====

    /**
     * Refresh the tree view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Update all items and refresh selection manager
     */
    protected async updateAllItems(): Promise<void> {
        try {
            this.allItems = await this.loadAllItems();
            this.selectionManager.updateAllItems(this.allItems);
        } catch (error) {
            console.error('Failed to update all items:', error);
            this.allItems = [];
            this.selectionManager.updateAllItems([]);
        }
    }

    /**
     * Filter items based on current filter or search results
     */
    protected filterItems(items: T[]): T[] {
        if (!this.currentFilter) {
            return items;
        }

        if (this.isSearchActive && this.searchResults.length > 0) {
            // Return items from search results
            const resultItems = this.searchResults.map(result => result.item as T);
            return items.filter(item => resultItems.some(resultItem => resultItem.id === item.id));
        }

        // Fallback to simple filtering if search is not active
        const query = this.currentFilter.toLowerCase();
        return items.filter(item => {
            return item.label.toLowerCase().includes(query) ||
                   item.filePath.toLowerCase().includes(query);
        });
    }

    /**
     * Sort items based on current sort order
     */
    protected sortItems(items: T[]): T[] {
        return items.sort((a, b) => {
            let comparison = 0;

            switch (this.currentSortOrder) {
                case SortOrder.NameAsc:
                    comparison = a.label.localeCompare(b.label);
                    break;
                case SortOrder.NameDesc:
                    comparison = b.label.localeCompare(a.label);
                    break;
                case SortOrder.SizeAsc:
                    comparison = a.size - b.size;
                    break;
                case SortOrder.SizeDesc:
                    comparison = b.size - a.size;
                    break;
                case SortOrder.ModifiedAsc:
                    comparison = a.modified.getTime() - b.modified.getTime();
                    break;
                case SortOrder.ModifiedDesc:
                    comparison = b.modified.getTime() - a.modified.getTime();
                    break;
                default:
                    comparison = a.label.localeCompare(b.label);
            }

            // Always put directories first, regardless of sort order
            if (a.isDirectory && !b.isDirectory) {
                return -1;
            }
            if (!a.isDirectory && b.isDirectory) {
                return 1;
            }

            return comparison;
        });
    }

    /**
     * Process items with filtering and sorting
     */
    protected processItems(items: T[]): T[] {
        let processedItems = [...items];
        processedItems = this.filterItems(processedItems);
        processedItems = this.sortItems(processedItems);
        return processedItems;
    }

    /**
     * Handle tree view selection changes
     */
    protected handleTreeViewSelection(selection: readonly T[]): void {
        // Update selection manager when tree view selection changes
        if (selection.length > 0) {
            this.selectionManager.setSelection([...selection]);
        }
    }

    /**
     * Called when selection changes
     */
    protected onSelectionChanged(selection: IEnhancedFileItem[]): void {
        // Update tree view selection if needed
        if (this.treeView && selection.length > 0) {
            // Note: VSCode TreeView doesn't support programmatic multi-selection
            // This is a limitation of the VSCode API
            // We can only update our internal selection state
        }
    }

    /**
     * Get visual indicator for selected items
     */
    protected getSelectionIndicator(item: T): string {
        return this.selectionManager.isSelected(item) ? '● ' : '';
    }

    /**
     * Update tree item with selection state and drag/drop capabilities
     */
    protected updateTreeItemWithSelection(treeItem: vscode.TreeItem, item: T): vscode.TreeItem {
        const isSelected = this.selectionManager.isSelected(item);
        
        if (isSelected) {
            // Add visual indicator for selected items
            const originalLabel = typeof treeItem.label === 'string' ? treeItem.label : item.label;
            treeItem.label = `● ${originalLabel}`;
            
            // Update context value to indicate selection
            const originalContext = treeItem.contextValue || '';
            treeItem.contextValue = originalContext.includes(':selected') ? 
                originalContext : `${originalContext}:selected`;
        }

        // Add search highlighting if active
        this.updateTreeItemWithSearchHighlight(treeItem, item);

        // Add drag and drop context values
        this.updateTreeItemWithDragDrop(treeItem, item);

        return treeItem;
    }

    /**
     * Update tree item with search highlighting
     */
    protected updateTreeItemWithSearchHighlight(treeItem: vscode.TreeItem, item: T): vscode.TreeItem {
        const isHighlighted = this.highlightedItems.has(item.id);
        
        if (isHighlighted) {
            // Add search highlight indicator
            const originalLabel = typeof treeItem.label === 'string' ? treeItem.label : item.label;
            
            // Find search result for this item
            const searchResult = this.searchResults.find(result => result.item.id === item.id);
            if (searchResult) {
                // Add search match highlighting
                const highlightedLabel = this.highlightMatches(originalLabel, searchResult.matches);
                treeItem.label = `🔍 ${highlightedLabel}`;
                
                // Add search score as tooltip
                const score = Math.round(searchResult.score);
                const matchInfo = `マッチ数: ${searchResult.matches.length}, スコア: ${score}`;
                treeItem.tooltip = `${treeItem.tooltip || originalLabel}\n${matchInfo}`;
            } else {
                treeItem.label = `🔍 ${originalLabel}`;
            }

            // Add search context
            const originalContext = treeItem.contextValue || '';
            if (!originalContext.includes(':searchResult')) {
                treeItem.contextValue = `${originalContext}:searchResult`;
            }
        }

        return treeItem;
    }

    /**
     * Highlight matches in text (simple implementation)
     */
    private highlightMatches(text: string, matches: SearchMatch[]): string {
        if (matches.length === 0) {
            return text;
        }

        // For now, just add emphasis markers around the first match
        const firstMatch = matches[0];
        if (firstMatch.startIndex >= 0 && firstMatch.endIndex <= text.length) {
            const before = text.substring(0, firstMatch.startIndex);
            const match = text.substring(firstMatch.startIndex, firstMatch.endIndex);
            const after = text.substring(firstMatch.endIndex);
            return `${before}【${match}】${after}`;
        }

        return text;
    }

    /**
     * Update tree item with drag and drop capabilities
     */
    protected updateTreeItemWithDragDrop(treeItem: vscode.TreeItem, item: T): vscode.TreeItem {
        // All items are draggable
        const originalContext = treeItem.contextValue || '';
        
        // Add draggable context
        if (!originalContext.includes(':draggable')) {
            treeItem.contextValue = `${originalContext}:draggable`;
        }

        // Directories are drop targets
        if (item.isDirectory && !originalContext.includes(':droppable')) {
            treeItem.contextValue = `${treeItem.contextValue}:droppable`;
        }

        return treeItem;
    }

    /**
     * Get drop zone visual indicator
     */
    protected getDropZoneIndicator(item: T, isDragOver: boolean): string {
        if (!item.isDirectory || !isDragOver) {
            return '';
        }
        return '📁 '; // Visual indicator for drop zone
    }

    // ===== Disposal =====

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.selectionManager.dispose();
        this.dragDropHandler.dispose();
        this._onDidChangeTreeData.dispose();
    }
}