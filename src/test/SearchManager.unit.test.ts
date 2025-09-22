import * as assert from 'assert';
import { SearchManager } from '../services/SearchManager';
import { IEnhancedFileItem, SearchOptions, SearchPatternType } from '../interfaces/core';

suite('SearchManager', () => {
    let searchManager: SearchManager;
    let testItems: IEnhancedFileItem[];

    setup(() => {
        searchManager = new SearchManager();
        
        // Create test file items
        testItems = [
            {
                id: '1',
                label: 'test.js',
                filePath: '/workspace/test.js',
                isDirectory: false,
                size: 1024,
                modified: new Date('2023-01-01'),
                permissions: { readonly: false, executable: false, hidden: false }
            },
            {
                id: '2',
                label: 'README.md',
                filePath: '/workspace/README.md',
                isDirectory: false,
                size: 2048,
                modified: new Date('2023-01-02'),
                permissions: { readonly: false, executable: false, hidden: false }
            },
            {
                id: '3',
                label: 'src',
                filePath: '/workspace/src',
                isDirectory: true,
                size: 0,
                modified: new Date('2023-01-03'),
                permissions: { readonly: false, executable: false, hidden: false }
            },
            {
                id: '4',
                label: 'package.json',
                filePath: '/workspace/package.json',
                isDirectory: false,
                size: 512,
                modified: new Date('2023-01-04'),
                permissions: { readonly: false, executable: false, hidden: false }
            },
            {
                id: '5',
                label: '.hidden',
                filePath: '/workspace/.hidden',
                isDirectory: false,
                size: 256,
                modified: new Date('2023-01-05'),
                permissions: { readonly: false, executable: false, hidden: true }
            }
        ];
    });

    suite('createPattern', () => {
        test('should create literal pattern correctly', () => {
            const pattern = searchManager.createPattern('test.js', 'literal', false);
            assert.notStrictEqual(pattern, null);
            assert.strictEqual(pattern!.test('test.js'), true);
            assert.strictEqual(pattern!.test('test-js'), false);
        });

        test('should create case-sensitive literal pattern', () => {
            const pattern = searchManager.createPattern('Test', 'literal', true);
            assert.notStrictEqual(pattern, null);
            assert.strictEqual(pattern!.test('Test'), true);
            assert.strictEqual(pattern!.test('test'), false);
        });

        test('should create wildcard pattern correctly', () => {
            const pattern = searchManager.createPattern('*.js', 'wildcard', false);
            assert.notStrictEqual(pattern, null);
            
            // Reset regex state before each test
            pattern!.lastIndex = 0;
            assert.strictEqual(pattern!.test('test.js'), true);
            
            pattern!.lastIndex = 0;
            assert.strictEqual(pattern!.test('app.js'), true);
            
            pattern!.lastIndex = 0;
            assert.strictEqual(pattern!.test('test.ts'), false);
        });

        test('should create regex pattern correctly', () => {
            const pattern = searchManager.createPattern('^test.*\\.js$', 'regex', false);
            assert.notStrictEqual(pattern, null);
            
            // Reset regex state before each test
            pattern!.lastIndex = 0;
            assert.strictEqual(pattern!.test('test.js'), true);
            
            pattern!.lastIndex = 0;
            assert.strictEqual(pattern!.test('test123.js'), true);
            
            pattern!.lastIndex = 0;
            assert.strictEqual(pattern!.test('app.js'), false);
        });

        test('should handle invalid regex gracefully', () => {
            const pattern = searchManager.createPattern('[invalid', 'regex', false);
            assert.strictEqual(pattern, null);
        });

        test('should escape special characters in literal mode', () => {
            const pattern = searchManager.createPattern('test.js', 'literal', false);
            assert.notStrictEqual(pattern, null);
            assert.strictEqual(pattern!.test('testXjs'), false); // . should not match any character
        });
    });

    suite('matchesPattern', () => {
        test('should find matches in text', () => {
            const pattern = /test/gi;
            const matches = searchManager.matchesPattern('test file test', pattern);
            
            assert.strictEqual(matches.length, 2);
            assert.strictEqual(matches[0].text, 'test');
            assert.strictEqual(matches[0].startIndex, 0);
            assert.strictEqual(matches[0].endIndex, 4);
            assert.strictEqual(matches[1].startIndex, 10);
        });

        test('should handle case-insensitive matches', () => {
            const pattern = /test/gi;
            const matches = searchManager.matchesPattern('Test TEST test', pattern);
            
            assert.strictEqual(matches.length, 3);
            assert.strictEqual(matches[0].text, 'Test');
            assert.strictEqual(matches[1].text, 'TEST');
            assert.strictEqual(matches[2].text, 'test');
        });

        test('should handle no matches', () => {
            const pattern = /xyz/g;
            const matches = searchManager.matchesPattern('test file', pattern);
            
            assert.strictEqual(matches.length, 0);
        });
    });

    suite('search', () => {
        test('should find items by filename', async () => {
            const results = await searchManager.search('test', testItems);
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].item.label, 'test.js');
            assert.strictEqual(results[0].matches.length, 1);
            assert.strictEqual(results[0].matches[0].type, 'filename');
        });

        test('should return empty results for empty query', async () => {
            const results = await searchManager.search('', testItems);
            assert.strictEqual(results.length, 0);
        });

        test('should return empty results for whitespace query', async () => {
            const results = await searchManager.search('   ', testItems);
            assert.strictEqual(results.length, 0);
        });

        test('should exclude hidden files by default', async () => {
            const results = await searchManager.search('hidden', testItems);
            assert.strictEqual(results.length, 0);
        });

        test('should include hidden files when option is set', async () => {
            const options: Partial<SearchOptions> = { includeHidden: true };
            const results = await searchManager.search('hidden', testItems, options);
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].item.label, '.hidden');
        });

        test('should handle case-sensitive search', async () => {
            const options: Partial<SearchOptions> = { caseSensitive: true };
            const results = await searchManager.search('README', testItems, options);
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].item.label, 'README.md');
        });

        test('should handle wildcard search', async () => {
            const options: Partial<SearchOptions> = { patternType: 'wildcard' };
            const results = await searchManager.search('*.js', testItems, options);
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].item.label, 'test.js');
        });

        test('should handle regex search', async () => {
            const options: Partial<SearchOptions> = { patternType: 'regex' };
            const results = await searchManager.search('.*\\.json$', testItems, options);
            
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].item.label, 'package.json');
        });

        test('should sort results by relevance score', async () => {
            // Add more items for better testing
            const moreItems = [
                ...testItems,
                {
                    id: '6',
                    label: 'test',
                    filePath: '/workspace/test',
                    isDirectory: false,
                    size: 100,
                    modified: new Date('2023-01-06'),
                    permissions: { readonly: false, executable: false, hidden: false }
                }
            ];

            const results = await searchManager.search('test', moreItems);
            
            assert.ok(results.length > 1);
            // Exact match should have higher score
            assert.strictEqual(results[0].item.label, 'test');
            assert.ok(results[0].score > results[1].score);
        });
    });

    suite('calculateRelevanceScore', () => {
        test('should give higher score for exact filename match', () => {
            const item = testItems[0]; // test.js
            const matches = [{ type: 'filename' as const, text: 'test.js', startIndex: 0, endIndex: 7 }];
            
            const exactScore = searchManager.calculateRelevanceScore(item, matches, 'test.js');
            const partialScore = searchManager.calculateRelevanceScore(item, matches, 'test');
            
            assert.ok(exactScore > partialScore);
        });

        test('should give higher score for matches at beginning', () => {
            const item = testItems[0]; // test.js
            const startMatches = [{ type: 'filename' as const, text: 'test', startIndex: 0, endIndex: 4 }];
            const middleMatches = [{ type: 'filename' as const, text: 'js', startIndex: 5, endIndex: 7 }];
            
            const startScore = searchManager.calculateRelevanceScore(item, startMatches, 'test');
            const middleScore = searchManager.calculateRelevanceScore(item, middleMatches, 'js');
            
            assert.ok(startScore > middleScore);
        });

        test('should prefer files over directories', () => {
            const fileItem = testItems[0]; // test.js (file)
            const dirItem = testItems[2]; // src (directory)
            const matches = [{ type: 'filename' as const, text: 'test', startIndex: 0, endIndex: 4 }];
            
            const fileScore = searchManager.calculateRelevanceScore(fileItem, matches, 'test');
            const dirScore = searchManager.calculateRelevanceScore(dirItem, matches, 'test');
            
            assert.ok(fileScore > dirScore);
        });

        test('should give bonus for recently modified files', () => {
            const oldItem = { ...testItems[0], modified: new Date('2020-01-01') };
            const newItem = { ...testItems[0], modified: new Date() };
            const matches = [{ type: 'filename' as const, text: 'test', startIndex: 0, endIndex: 4 }];
            
            const oldScore = searchManager.calculateRelevanceScore(oldItem, matches, 'test');
            const newScore = searchManager.calculateRelevanceScore(newItem, matches, 'test');
            
            assert.ok(newScore > oldScore);
        });
    });

    suite('search history', () => {
        test('should add queries to history', () => {
            searchManager.addToHistory('test');
            searchManager.addToHistory('package');
            
            const history = searchManager.getHistory();
            assert.ok(history.includes('test'));
            assert.ok(history.includes('package'));
        });

        test('should not add empty queries to history', () => {
            searchManager.addToHistory('');
            searchManager.addToHistory('   ');
            
            const history = searchManager.getHistory();
            assert.strictEqual(history.length, 0);
        });

        test('should move existing query to front', () => {
            searchManager.addToHistory('first');
            searchManager.addToHistory('second');
            searchManager.addToHistory('first'); // Should move to front
            
            const history = searchManager.getHistory();
            assert.strictEqual(history[0], 'first');
            assert.strictEqual(history[1], 'second');
            assert.strictEqual(history.length, 2);
        });

        test('should limit history size', () => {
            // Add more than max history size
            for (let i = 0; i < 60; i++) {
                searchManager.addToHistory(`query${i}`);
            }
            
            const history = searchManager.getHistory();
            assert.ok(history.length <= 50);
        });

        test('should clear history', () => {
            searchManager.addToHistory('test');
            searchManager.clearHistory();
            
            const history = searchManager.getHistory();
            assert.strictEqual(history.length, 0);
        });
    });

    suite('getSuggestions', () => {
        setup(() => {
            // Add some history
            searchManager.addToHistory('test.js');
            searchManager.addToHistory('package.json');
        });

        test('should return suggestions from history', () => {
            const suggestions = searchManager.getSuggestions('test', testItems);
            assert.ok(suggestions.includes('test.js'));
        });

        test('should return suggestions from filenames', () => {
            const suggestions = searchManager.getSuggestions('pack', testItems);
            assert.ok(suggestions.includes('package.json'));
        });

        test('should return extension suggestions', () => {
            const suggestions = searchManager.getSuggestions('.js', testItems);
            assert.ok(suggestions.includes('*.js'));
        });

        test('should limit suggestions count', () => {
            const suggestions = searchManager.getSuggestions('', testItems);
            assert.ok(suggestions.length <= 10);
        });

        test('should return empty array for no matches', () => {
            const suggestions = searchManager.getSuggestions('xyz', testItems);
            assert.strictEqual(suggestions.length, 0);
        });
    });

    suite('createDebouncedSearch', () => {
        test('should create a debounced search function', () => {
            const debouncedSearch = searchManager.createDebouncedSearch(100);
            assert.strictEqual(typeof debouncedSearch, 'function');
        });

        test('should return a promise', () => {
            const debouncedSearch = searchManager.createDebouncedSearch(10);
            const result = debouncedSearch('test', testItems);
            assert.ok(result instanceof Promise);
        });
    });
});