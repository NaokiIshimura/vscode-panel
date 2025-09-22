import { IMultiSelectionManager, IEnhancedFileItem } from '../interfaces/core';

// Simple event emitter for selection changes
class EventEmitter<T> {
    private listeners: Array<(data: T) => void> = [];

    public event = (listener: (data: T) => void) => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const index = this.listeners.indexOf(listener);
                if (index >= 0) {
                    this.listeners.splice(index, 1);
                }
            }
        };
    };

    public fire(data: T): void {
        for (const listener of this.listeners) {
            listener(data);
        }
    }

    public dispose(): void {
        this.listeners = [];
    }
}

/**
 * Multi-selection manager for handling file selection operations
 */
export class MultiSelectionManager implements IMultiSelectionManager {
    private selectedItems: Set<string> = new Set(); // Using file paths as keys
    private itemsMap: Map<string, IEnhancedFileItem> = new Map(); // Path to item mapping
    private lastSelectedItem: IEnhancedFileItem | null = null;
    private allItems: IEnhancedFileItem[] = []; // All available items for range selection

    private readonly onSelectionChangedEmitter = new EventEmitter<IEnhancedFileItem[]>();
    public readonly onSelectionChanged = this.onSelectionChangedEmitter.event;

    /**
     * Add an item to the selection
     */
    public addToSelection(item: IEnhancedFileItem): void {
        const key = this.getItemKey(item);
        this.selectedItems.add(key);
        this.itemsMap.set(key, item);
        this.lastSelectedItem = item;
        this.fireSelectionChanged();
    }

    /**
     * Remove an item from the selection
     */
    public removeFromSelection(item: IEnhancedFileItem): void {
        const key = this.getItemKey(item);
        this.selectedItems.delete(key);
        this.itemsMap.delete(key);
        
        // Update last selected item if it was removed
        if (this.lastSelectedItem && this.getItemKey(this.lastSelectedItem) === key) {
            const remaining = this.getSelection();
            this.lastSelectedItem = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
        
        this.fireSelectionChanged();
    }

    /**
     * Set the entire selection to the provided items
     */
    public setSelection(items: IEnhancedFileItem[]): void {
        this.selectedItems.clear();
        this.itemsMap.clear();
        
        for (const item of items) {
            const key = this.getItemKey(item);
            this.selectedItems.add(key);
            this.itemsMap.set(key, item);
        }
        
        this.lastSelectedItem = items.length > 0 ? items[items.length - 1] : null;
        this.fireSelectionChanged();
    }

    /**
     * Get all currently selected items
     */
    public getSelection(): IEnhancedFileItem[] {
        return Array.from(this.selectedItems).map(key => this.itemsMap.get(key)!).filter(Boolean);
    }

    /**
     * Clear all selections
     */
    public clearSelection(): void {
        this.selectedItems.clear();
        this.itemsMap.clear();
        this.lastSelectedItem = null;
        this.fireSelectionChanged();
    }

    /**
     * Select a range of items from startItem to endItem
     */
    public selectRange(startItem: IEnhancedFileItem, endItem: IEnhancedFileItem): void {
        const startIndex = this.allItems.findIndex(item => this.getItemKey(item) === this.getItemKey(startItem));
        const endIndex = this.allItems.findIndex(item => this.getItemKey(item) === this.getItemKey(endItem));
        
        if (startIndex === -1 || endIndex === -1) {
            // If items not found in current list, just select both items
            this.addToSelection(startItem);
            this.addToSelection(endItem);
            return;
        }

        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);
        
        // Select all items in the range
        for (let i = minIndex; i <= maxIndex; i++) {
            const item = this.allItems[i];
            if (item) {
                const key = this.getItemKey(item);
                this.selectedItems.add(key);
                this.itemsMap.set(key, item);
            }
        }
        
        this.lastSelectedItem = endItem;
        this.fireSelectionChanged();
    }

    /**
     * Check if an item is currently selected
     */
    public isSelected(item: IEnhancedFileItem): boolean {
        return this.selectedItems.has(this.getItemKey(item));
    }

    /**
     * Handle Ctrl+Click selection (toggle selection)
     */
    public handleCtrlClick(item: IEnhancedFileItem): void {
        if (this.isSelected(item)) {
            this.removeFromSelection(item);
        } else {
            this.addToSelection(item);
        }
    }

    /**
     * Handle Shift+Click selection (range selection)
     */
    public handleShiftClick(item: IEnhancedFileItem): void {
        if (this.lastSelectedItem) {
            this.selectRange(this.lastSelectedItem, item);
        } else {
            this.addToSelection(item);
        }
    }

    /**
     * Handle regular click (single selection)
     */
    public handleClick(item: IEnhancedFileItem): void {
        this.setSelection([item]);
    }

    /**
     * Select all items in the current context
     */
    public selectAll(): void {
        this.setSelection([...this.allItems]);
    }

    /**
     * Update the list of all available items (for range selection)
     */
    public updateAllItems(items: IEnhancedFileItem[]): void {
        this.allItems = [...items];
        
        // Remove selected items that are no longer available
        const availableKeys = new Set(items.map(item => this.getItemKey(item)));
        const selectedKeys = Array.from(this.selectedItems);
        
        for (const key of selectedKeys) {
            if (!availableKeys.has(key)) {
                this.selectedItems.delete(key);
                this.itemsMap.delete(key);
            }
        }
        
        // Update last selected item if it's no longer available
        if (this.lastSelectedItem && !availableKeys.has(this.getItemKey(this.lastSelectedItem))) {
            const remaining = this.getSelection();
            this.lastSelectedItem = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
        
        this.fireSelectionChanged();
    }

    /**
     * Get the number of selected items
     */
    public getSelectionCount(): number {
        return this.selectedItems.size;
    }

    /**
     * Check if there are any selected items
     */
    public hasSelection(): boolean {
        return this.selectedItems.size > 0;
    }

    /**
     * Get the last selected item
     */
    public getLastSelectedItem(): IEnhancedFileItem | null {
        return this.lastSelectedItem;
    }

    /**
     * Toggle selection of an item
     */
    public toggleSelection(item: IEnhancedFileItem): void {
        if (this.isSelected(item)) {
            this.removeFromSelection(item);
        } else {
            this.addToSelection(item);
        }
    }

    /**
     * Get unique key for an item (using file path)
     */
    private getItemKey(item: IEnhancedFileItem): string {
        return item.filePath;
    }

    /**
     * Fire selection changed event
     */
    private fireSelectionChanged(): void {
        this.onSelectionChangedEmitter.fire(this.getSelection());
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.onSelectionChangedEmitter.dispose();
        this.clearSelection();
    }
}