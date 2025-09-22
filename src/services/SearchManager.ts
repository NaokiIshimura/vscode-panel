import * as vscode from 'vscode';
import * as path from 'path';
import { 
    ISearchManager, 
    IEnhancedFileItem, 
    SearchOptions, 
    SearchResult, 
    SearchMatch, 
    SearchPatternType 
} from '../interfaces/core';

/**
 * Search manager implementation for file filtering and searching
 */
export class SearchManager implements ISearchManager {
    private searchHistory: string[] = [];
    private readonly maxHistorySize = 50;
    private readonly defaultOptions: SearchOptions = {
        caseSensitive: false,
        patternType: 'literal',
        includeHidden: false,
        searchInContent: false
    };

    /**
     * Search through file items based on query and options
     */
    async search(
        query: string, 
        items: IEnhancedFileItem[], 
        options?: Partial<SearchOptions>
    ): Promise<SearchResult[]> {
        if (!query.trim()) {
            return [];
        }

        const searchOptions = { ...this.defaultOptions, ...options };
        const pattern = this.createPattern(query, searchOptions.patternType, searchOptions.caseSensitive);
        
        if (!pattern) {
            return [];
        }

        const results: SearchResult[] = [];

        for (const item of items) {
            // Skip hidden files if not included
            if (!searchOptions.includeHidden && item.permissions?.hidden) {
                continue;
            }

            const matches = this.findMatches(item, pattern, searchOptions);
            
            if (matches.length > 0) {
                const score = this.calculateRelevanceScore(item, matches, query);
                results.push({
                    item,
                    matches,
                    score
                });
            }
        }

        // Sort by relevance score (higher is better)
        results.sort((a, b) => b.score - a.score);

        // Add to search history
        this.addToHistory(query);

        return results;
    }

    /**
     * Create a regex pattern based on query and pattern type
     */
    createPattern(query: string, patternType: SearchPatternType, caseSensitive: boolean): RegExp | null {
        try {
            let pattern: string;
            const flags = caseSensitive ? 'g' : 'gi';

            switch (patternType) {
                case 'literal':
                    // Escape special regex characters
                    pattern = this.escapeRegExp(query);
                    break;

                case 'wildcard':
                    // Convert wildcard to regex
                    pattern = '^' + this.escapeRegExp(query)
                        .replace(/\\\*/g, '.*') // Convert escaped * to .*
                        .replace(/\\\?/g, '.') + '$'; // Convert escaped ? to .
                    break;

                case 'regex':
                    // Use as-is (user provides regex)
                    pattern = query;
                    break;

                default:
                    return null;
            }

            return new RegExp(pattern, flags);
        } catch (error) {
            // Invalid regex pattern
            return null;
        }
    }

    /**
     * Escape special regex characters
     */
    private escapeRegExp(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Find matches in a file item
     */
    private findMatches(item: IEnhancedFileItem, pattern: RegExp, options: SearchOptions): SearchMatch[] {
        const matches: SearchMatch[] = [];

        // Search in filename
        const filename = path.basename(item.filePath);
        const filenameMatches = this.matchesPattern(filename, pattern);
        matches.push(...filenameMatches.map(match => ({ ...match, type: 'filename' as const })));

        // TODO: Search in content if enabled (for future implementation)
        if (options.searchInContent && !item.isDirectory) {
            // This would require reading file content - implement in future iteration
        }

        return matches;
    }

    /**
     * Find pattern matches in text
     */
    matchesPattern(text: string, pattern: RegExp): SearchMatch[] {
        const matches: SearchMatch[] = [];
        let match: RegExpExecArray | null;

        // Reset regex lastIndex to ensure consistent behavior
        pattern.lastIndex = 0;

        while ((match = pattern.exec(text)) !== null) {
            matches.push({
                type: 'filename',
                text: match[0],
                startIndex: match.index,
                endIndex: match.index + match[0].length
            });

            // Prevent infinite loop for zero-length matches
            if (match[0].length === 0) {
                pattern.lastIndex++;
            }
        }

        return matches;
    }

    /**
     * Calculate relevance score for search result
     */
    calculateRelevanceScore(item: IEnhancedFileItem, matches: SearchMatch[], query: string): number {
        let score = 0;
        const filename = path.basename(item.filePath);
        const queryLower = query.toLowerCase();
        const filenameLower = filename.toLowerCase();

        // Base score for having matches
        score += matches.length * 10;

        // Bonus for exact filename match
        if (filenameLower === queryLower) {
            score += 100;
        }

        // Bonus for filename starting with query
        if (filenameLower.startsWith(queryLower)) {
            score += 50;
        }

        // Bonus for matches at the beginning of filename
        for (const match of matches) {
            if (match.startIndex === 0) {
                score += 30;
            }
        }

        // Penalty for longer filenames (prefer shorter, more specific matches)
        score -= filename.length * 0.1;

        // Bonus for files over directories (usually more relevant)
        if (!item.isDirectory) {
            score += 5;
        }

        // Bonus for recently modified files
        const daysSinceModified = (Date.now() - item.modified.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceModified < 7) {
            score += 10 - daysSinceModified;
        }

        return Math.max(0, score);
    }

    /**
     * Add query to search history
     */
    addToHistory(query: string): void {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            return;
        }

        // Remove existing entry if present
        const existingIndex = this.searchHistory.indexOf(trimmedQuery);
        if (existingIndex !== -1) {
            this.searchHistory.splice(existingIndex, 1);
        }

        // Add to beginning
        this.searchHistory.unshift(trimmedQuery);

        // Limit history size
        if (this.searchHistory.length > this.maxHistorySize) {
            this.searchHistory = this.searchHistory.slice(0, this.maxHistorySize);
        }
    }

    /**
     * Get search history
     */
    getHistory(): string[] {
        return [...this.searchHistory];
    }

    /**
     * Clear search history
     */
    clearHistory(): void {
        this.searchHistory = [];
    }

    /**
     * Get search suggestions based on partial query
     */
    getSuggestions(partialQuery: string, items: IEnhancedFileItem[]): string[] {
        const suggestions = new Set<string>();
        const queryLower = partialQuery.toLowerCase();

        // Add from history
        for (const historyItem of this.searchHistory) {
            if (historyItem.toLowerCase().startsWith(queryLower)) {
                suggestions.add(historyItem);
            }
        }

        // Add from file names
        for (const item of items) {
            const filename = path.basename(item.filePath);
            if (filename.toLowerCase().startsWith(queryLower)) {
                suggestions.add(filename);
            }

            // Add file extensions as suggestions
            const ext = path.extname(filename);
            if (ext && ext.toLowerCase().startsWith(queryLower)) {
                suggestions.add(`*${ext}`);
            }
        }

        return Array.from(suggestions).slice(0, 10); // Limit to 10 suggestions
    }

    /**
     * Create a debounced search function
     */
    createDebouncedSearch(delay: number = 300): (
        query: string, 
        items: IEnhancedFileItem[], 
        options?: Partial<SearchOptions>
    ) => Promise<SearchResult[]> {
        let timeoutId: NodeJS.Timeout | undefined;
        let latestPromise: Promise<SearchResult[]> | undefined;

        return (query: string, items: IEnhancedFileItem[], options?: Partial<SearchOptions>) => {
            return new Promise<SearchResult[]>((resolve, reject) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                timeoutId = setTimeout(async () => {
                    try {
                        const results = await this.search(query, items, options);
                        latestPromise = Promise.resolve(results);
                        resolve(results);
                    } catch (error) {
                        reject(error);
                    }
                }, delay);
            });
        };
    }
}