import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { EnhancedWorkspaceExplorerProvider } from '../services/EnhancedWorkspaceExplorerProvider';
import { EnhancedFileDetailsProvider } from '../services/EnhancedFileDetailsProvider';
import { SearchUIManager } from '../services/SearchUIManager';
import { SearchManager } from '../services/SearchManager';
import { IEnhancedFileItem, SearchOptions } from '../interfaces/core';

suite('Search Integration Tests', () => {
    let tempDir: string;
    let workspaceProvider: EnhancedWorkspaceExplorerProvider;
    let fileDetailsProvider: EnhancedFileDetailsProvider;
    let searchUIManager: SearchUIManager;
    let testFiles: string[];

    setup(async () => {
        // Create temporary test directory
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'search-integration-test-'));
        
        // Create test file structure
        const testStructure = [
            'README.md',
            'package.json',
            'src/index.ts',
            'src/utils/helper.ts',
            'src/components/Button.tsx',
            'tests/unit/helper.test.ts',
            'tests/integration/app.test.ts',
            'docs/api.md',
            'docs/guide.md',
            '.gitignore',
            '.hidden-file'
        ];

        testFiles = [];
        for (const filePath of testStructure) {
            const fullPath = path.join(tempDir, filePath);
            const dirPath = path.dirname(fullPath);
            
            // Create directory if it doesn't exist
            if (!fs.existsSync(dirPath)) {
                await fs.promises.mkdir(dirPath, { recursive: true });
            }
            
            // Create file with some content
            const content = `// Test file: ${filePath}\n// Created for search integration testing\n`;
            await fs.promises.writeFile(fullPath, content);
            testFiles.push(fullPath);
        }

        // Initialize providers
        workspaceProvider = new EnhancedWorkspaceExplorerProvider();
        workspaceProvider.setWorkspaceRoot(tempDir);

        fileDetailsProvider = new EnhancedFileDetailsProvider();
        fileDetailsProvider.setRootPath(tempDir);

        searchUIManager = new SearchUIManager();
    });

    teardown(async () => {
        // Clean up
        workspaceProvider.dispose();
        fileDetailsProvider.dispose();
        searchUIManager.dispose();

        // Remove temporary directory
        if (fs.existsSync(tempDir)) {
            await fs.promises.rmdir(tempDir, { recursive: true });
        }
    });

    suite('WorkspaceExplorerProvider Search Integration', () => {
        test('should perform basic search', async () => {
            const results = await workspaceProvider.performSearch('README');
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].item.label, 'README.md');
            assert.ok(results[0].score > 0);
        });

        test('should perform wildcard search', async () => {
            const results = await workspaceProvider.performSearch('*.ts');
            
            assert.ok(results.length >= 2); // Should find .ts files
            assert.ok(results.some(r => r.item.label.endsWith('.ts')));
        });

        test('should perform regex search', async () => {
            const options: Partial<SearchOptions> = { patternType: 'regex' };
            const results = await workspaceProvider.performSearch('.*\\.test\\.ts$', options);
            
            assert.ok(results.length >= 1); // Should find test files
            assert.ok(results.every(r => r.item.label.endsWith('.test.ts')));
        });

        test('should exclude hidden files by default', async () => {
            const results = await workspaceProvider.performSearch('hidden');
            
            assert.strictEqual(results.length, 0);
        });

        test('should include hidden files when option is set', async () => {
            const options: Partial<SearchOptions> = { includeHidden: true };
            const results = await workspaceProvider.performSearch('hidden', options);
            
            assert.ok(results.length > 0);
            assert.ok(results.some(r => r.item.label.startsWith('.')));
        });

        test('should handle case-sensitive search', async () => {
            const options: Partial<SearchOptions> = { caseSensitive: true };
            const results = await workspaceProvider.performSearch('README', options);
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].item.label, 'README.md');
        });

        test('should sort results by relevance', async () => {
            const results = await workspaceProvider.performSearch('test');
            
            if (results.length > 1) {
                // Results should be sorted by score (descending)
                for (let i = 1; i < results.length; i++) {
                    assert.ok(results[i - 1].score >= results[i].score);
                }
            }
        });

        test('should highlight search results', async () => {
            const results = await workspaceProvider.performSearch('package');
            workspaceProvider.highlightSearchResults(results);
            
            // Check that highlighting is applied
            assert.ok(workspaceProvider.isSearching());
            
            // Clear highlighting
            workspaceProvider.clearSearchHighlight();
        });

        test('should maintain search history', () => {
            const searchManager = workspaceProvider.getSearchManager();
            
            // Perform searches to build history
            searchManager.addToHistory('test');
            searchManager.addToHistory('package');
            searchManager.addToHistory('src');
            
            const history = searchManager.getHistory();
            assert.ok(history.includes('test'));
            assert.ok(history.includes('package'));
            assert.ok(history.includes('src'));
            
            // Most recent should be first
            assert.strictEqual(history[0], 'src');
        });

        test('should provide search suggestions', () => {
            const suggestions = workspaceProvider.getSearchSuggestions('pack');
            
            assert.ok(suggestions.length > 0);
            assert.ok(suggestions.some(s => s.includes('package')));
        });
    });

    suite('FileDetailsProvider Search Integration', () => {
        test('should perform search in file details view', async () => {
            const results = await fileDetailsProvider.performSearch('index');
            
            assert.ok(results.length > 0);
            assert.ok(results.some(r => r.item.label.includes('index')));
        });

        test('should filter items based on search', async () => {
            await fileDetailsProvider.filter('src');
            
            const searchResults = fileDetailsProvider.getSearchResults();
            assert.ok(searchResults.length > 0);
            assert.ok(searchResults.every(r => 
                r.item.filePath.includes('src') || r.item.label.includes('src')
            ));
        });

        test('should clear search filter', async () => {
            // First apply a filter
            await fileDetailsProvider.filter('test');
            assert.ok(fileDetailsProvider.isSearching());
            
            // Then clear it
            fileDetailsProvider.clearFilter();
            assert.strictEqual(fileDetailsProvider.isSearching(), false);
            assert.strictEqual(fileDetailsProvider.getSearchResults().length, 0);
        });

        test('should handle empty search query', async () => {
            const results = await fileDetailsProvider.performSearch('');
            assert.strictEqual(results.length, 0);
        });

        test('should handle search with no results', async () => {
            const results = await fileDetailsProvider.performSearch('nonexistent-file-xyz');
            assert.strictEqual(results.length, 0);
        });
    });

    suite('SearchUIManager Integration', () => {
        test('should create search manager', () => {
            const searchManager = searchUIManager.getSearchManager();
            assert.ok(searchManager);
            assert.strictEqual(typeof searchManager.search, 'function');
        });

        test('should handle search events', (done) => {
            let eventFired = false;
            
            searchUIManager.onDidChangeSearchResults((results) => {
                eventFired = true;
                assert.ok(Array.isArray(results));
                done();
            });

            // Trigger search
            const mockItems: IEnhancedFileItem[] = [
                {
                    id: 'test1',
                    label: 'test.js',
                    filePath: '/test/test.js',
                    isDirectory: false,
                    size: 100,
                    modified: new Date(),
                    permissions: { readonly: false, executable: false, hidden: false }
                }
            ];

            searchUIManager.performSearch('test', mockItems);
        });

        test('should parse search queries correctly', async () => {
            const mockItems: IEnhancedFileItem[] = [
                {
                    id: 'test1',
                    label: 'test.js',
                    filePath: '/test/test.js',
                    isDirectory: false,
                    size: 100,
                    modified: new Date(),
                    permissions: { readonly: false, executable: false, hidden: false }
                }
            ];

            // Test wildcard query
            const wildcardResults = await searchUIManager.performSearch('*.js', mockItems);
            assert.ok(wildcardResults.length > 0);

            // Test regex query
            const regexResults = await searchUIManager.performSearch('/.*\\.js$/', mockItems);
            assert.ok(regexResults.length > 0);
        });

        test('should clear search history', () => {
            const searchManager = searchUIManager.getSearchManager();
            
            // Add some history
            searchManager.addToHistory('test1');
            searchManager.addToHistory('test2');
            assert.ok(searchManager.getHistory().length > 0);
            
            // Clear history
            searchUIManager.clearSearchHistory();
            assert.strictEqual(searchManager.getHistory().length, 0);
        });
    });

    suite('Cross-Provider Search Consistency', () => {
        test('should return consistent results across providers', async () => {
            const query = 'package';
            
            const workspaceResults = await workspaceProvider.performSearch(query);
            const fileDetailsResults = await fileDetailsProvider.performSearch(query);
            
            // Both should find the same files (though order might differ)
            const workspaceFiles = workspaceResults.map(r => r.item.label).sort();
            const fileDetailsFiles = fileDetailsResults.map(r => r.item.label).sort();
            
            assert.deepStrictEqual(workspaceFiles, fileDetailsFiles);
        });

        test('should maintain consistent search history', () => {
            const workspaceSearchManager = workspaceProvider.getSearchManager();
            const fileDetailsSearchManager = fileDetailsProvider.getSearchManager();
            
            // Add history to one provider
            workspaceSearchManager.addToHistory('shared-query');
            
            // Both should have independent histories
            const workspaceHistory = workspaceSearchManager.getHistory();
            const fileDetailsHistory = fileDetailsSearchManager.getHistory();
            
            assert.ok(workspaceHistory.includes('shared-query'));
            assert.strictEqual(fileDetailsHistory.includes('shared-query'), false);
        });

        test('should handle search options consistently', async () => {
            const query = 'test';
            const options: Partial<SearchOptions> = {
                caseSensitive: true,
                patternType: 'literal'
            };
            
            const workspaceResults = await workspaceProvider.performSearch(query, options);
            const fileDetailsResults = await fileDetailsProvider.performSearch(query, options);
            
            // Both should respect the same options
            assert.ok(workspaceResults.length >= 0);
            assert.ok(fileDetailsResults.length >= 0);
            
            // If both have results, they should be for the same files
            if (workspaceResults.length > 0 && fileDetailsResults.length > 0) {
                const workspaceLabels = new Set(workspaceResults.map(r => r.item.label));
                const fileDetailsLabels = new Set(fileDetailsResults.map(r => r.item.label));
                
                // Check for overlap
                const intersection = new Set([...workspaceLabels].filter(x => fileDetailsLabels.has(x)));
                assert.ok(intersection.size > 0);
            }
        });
    });

    suite('Performance Tests', () => {
        test('should handle large number of files efficiently', async () => {
            // Create additional files for performance testing
            const additionalFiles = [];
            for (let i = 0; i < 100; i++) {
                const filePath = path.join(tempDir, `perf-test-${i}.txt`);
                await fs.promises.writeFile(filePath, `Performance test file ${i}`);
                additionalFiles.push(filePath);
            }

            try {
                const startTime = Date.now();
                const results = await workspaceProvider.performSearch('perf');
                const endTime = Date.now();
                
                // Should complete within reasonable time (less than 1 second)
                const duration = endTime - startTime;
                assert.ok(duration < 1000, `Search took too long: ${duration}ms`);
                
                // Should find the performance test files
                assert.ok(results.length > 0);
                assert.ok(results.some(r => r.item.label.includes('perf-test')));
            } finally {
                // Clean up additional files
                for (const filePath of additionalFiles) {
                    if (fs.existsSync(filePath)) {
                        await fs.promises.unlink(filePath);
                    }
                }
            }
        });

        test('should handle debounced search correctly', async () => {
            let searchCount = 0;
            const originalSearch = workspaceProvider.performSearch.bind(workspaceProvider);
            
            // Mock the search method to count calls
            workspaceProvider.performSearch = async (query, options) => {
                searchCount++;
                return originalSearch(query, options);
            };

            // Simulate rapid typing
            const queries = ['t', 'te', 'tes', 'test'];
            for (const query of queries) {
                await workspaceProvider.filter(query);
                // Small delay to simulate typing
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Wait for debounce to complete
            await new Promise(resolve => setTimeout(resolve, 500));

            // Should have made fewer search calls due to debouncing
            assert.ok(searchCount < queries.length, `Expected fewer searches, got ${searchCount}`);
            
            // Restore original method
            workspaceProvider.performSearch = originalSearch;
        });
    });
});