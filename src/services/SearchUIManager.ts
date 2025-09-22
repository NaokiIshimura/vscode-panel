import * as vscode from 'vscode';
import { ISearchManager, SearchOptions, SearchResult, SearchPatternType } from '../interfaces/core';
import { SearchManager } from './SearchManager';

/**
 * Search UI manager for handling search input and display
 */
export class SearchUIManager {
    private searchManager: SearchManager;
    private searchBox: vscode.QuickPick<SearchQuickPickItem> | undefined;
    private onSearchResultsChanged: vscode.EventEmitter<SearchResult[]> = new vscode.EventEmitter<SearchResult[]>();
    private onSearchQueryChanged: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
    
    public readonly onDidChangeSearchResults: vscode.Event<SearchResult[]> = this.onSearchResultsChanged.event;
    public readonly onDidChangeSearchQuery: vscode.Event<string> = this.onSearchQueryChanged.event;

    constructor() {
        this.searchManager = new SearchManager();
    }

    /**
     * Show search input box
     */
    public async showSearchBox(items: any[], options?: Partial<SearchOptions>): Promise<SearchResult[]> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick<SearchQuickPickItem>();
            
            quickPick.title = 'ファイル検索';
            quickPick.placeholder = 'ファイル名を入力してください (*, ? でワイルドカード検索)';
            quickPick.matchOnDescription = false;
            quickPick.matchOnDetail = false;
            quickPick.canSelectMany = false;
            
            // Set initial items from history
            this.updateQuickPickItems(quickPick, '', items, options);

            // Handle value changes (search as you type)
            quickPick.onDidChangeValue(async (value) => {
                this.onSearchQueryChanged.fire(value);
                await this.updateQuickPickItems(quickPick, value, items, options);
            });

            // Handle selection
            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected && selected.searchResult) {
                    resolve([selected.searchResult]);
                } else {
                    // Perform search with current value
                    this.performSearch(quickPick.value, items, options).then(resolve);
                }
                quickPick.dispose();
            });

            // Handle hide
            quickPick.onDidHide(() => {
                resolve([]);
                quickPick.dispose();
            });

            quickPick.show();
        });
    }

    /**
     * Create search input box for tree view
     */
    public createSearchInput(): vscode.InputBox {
        const inputBox = vscode.window.createInputBox();
        
        inputBox.title = 'ファイル検索';
        inputBox.placeholder = 'ファイル名を入力 (*, ? でワイルドカード、/regex/ で正規表現)';
        inputBox.prompt = 'Enter: 検索実行, Escape: キャンセル';

        return inputBox;
    }

    /**
     * Perform search and fire events
     */
    public async performSearch(query: string, items: any[], options?: Partial<SearchOptions>): Promise<SearchResult[]> {
        try {
            const searchOptions = this.parseSearchQuery(query, options);
            const results = await this.searchManager.search(searchOptions.query, items, searchOptions.options);
            
            this.onSearchResultsChanged.fire(results);
            return results;
        } catch (error) {
            console.error('Search failed:', error);
            this.onSearchResultsChanged.fire([]);
            return [];
        }
    }

    /**
     * Parse search query to determine pattern type and options
     */
    private parseSearchQuery(query: string, baseOptions?: Partial<SearchOptions>): { query: string; options: Partial<SearchOptions> } {
        let parsedQuery = query;
        let patternType: SearchPatternType = 'literal';
        let caseSensitive = false;

        // Check for regex pattern (enclosed in forward slashes)
        const regexMatch = query.match(/^\/(.+)\/([gimuy]*)$/);
        if (regexMatch) {
            parsedQuery = regexMatch[1];
            patternType = 'regex';
            caseSensitive = regexMatch[2].includes('');
        }
        // Check for wildcard pattern (contains * or ?)
        else if (query.includes('*') || query.includes('?')) {
            patternType = 'wildcard';
        }
        // Check for case sensitivity (contains uppercase letters)
        else if (/[A-Z]/.test(query)) {
            caseSensitive = true;
        }

        const options: Partial<SearchOptions> = {
            ...baseOptions,
            patternType,
            caseSensitive
        };

        return { query: parsedQuery, options };
    }

    /**
     * Update quick pick items with search results and suggestions
     */
    private async updateQuickPickItems(
        quickPick: vscode.QuickPick<SearchQuickPickItem>, 
        value: string, 
        items: any[], 
        options?: Partial<SearchOptions>
    ): Promise<void> {
        const quickPickItems: SearchQuickPickItem[] = [];

        if (value.trim()) {
            // Add search results
            try {
                const searchOptions = this.parseSearchQuery(value, options);
                const results = await this.searchManager.search(searchOptions.query, items, searchOptions.options);
                
                for (const result of results.slice(0, 20)) { // Limit to 20 results
                    quickPickItems.push({
                        label: `$(file) ${result.item.label}`,
                        description: this.getRelativePath(result.item.filePath),
                        detail: `スコア: ${Math.round(result.score)} | マッチ: ${result.matches.length}`,
                        searchResult: result
                    });
                }

                // Add separator if there are results
                if (results.length > 0) {
                    quickPickItems.push({
                        label: '',
                        kind: vscode.QuickPickItemKind.Separator
                    });
                }
            } catch (error) {
                console.error('Search failed:', error);
            }

            // Add suggestions
            const suggestions = this.searchManager.getSuggestions(value, items);
            for (const suggestion of suggestions.slice(0, 5)) {
                quickPickItems.push({
                    label: `$(history) ${suggestion}`,
                    description: '検索履歴',
                    alwaysShow: true
                });
            }
        } else {
            // Show search history when no input
            const history = this.searchManager.getHistory();
            for (const historyItem of history.slice(0, 10)) {
                quickPickItems.push({
                    label: `$(history) ${historyItem}`,
                    description: '検索履歴',
                    alwaysShow: true
                });
            }
        }

        quickPick.items = quickPickItems;
    }

    /**
     * Get relative path for display
     */
    private getRelativePath(fullPath: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const relativePath = vscode.workspace.asRelativePath(fullPath);
            return relativePath !== fullPath ? relativePath : fullPath;
        }
        return fullPath;
    }

    /**
     * Clear search history
     */
    public clearSearchHistory(): void {
        this.searchManager.clearHistory();
    }

    /**
     * Get search manager instance
     */
    public getSearchManager(): ISearchManager {
        return this.searchManager;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.onSearchResultsChanged.dispose();
        this.onSearchQueryChanged.dispose();
        
        if (this.searchBox) {
            this.searchBox.dispose();
        }
    }
}

/**
 * Quick pick item for search results
 */
interface SearchQuickPickItem extends vscode.QuickPickItem {
    searchResult?: SearchResult;
}