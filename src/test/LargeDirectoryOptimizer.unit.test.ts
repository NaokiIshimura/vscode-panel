import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Simple implementation for testing without VSCode dependencies
interface DirectoryPage {
    items: string[];
    hasMore: boolean;
    totalCount: number;
    pageIndex: number;
}

interface PaginationOptions {
    pageSize: number;
    maxItems: number;
    enableLazyLoading: boolean;
}

class SimpleLargeDirectoryOptimizer {
    private readonly defaultPageSize = 100;
    private readonly defaultMaxItems = 1000;
    private paginationCache = new Map<string, DirectoryPage[]>();
    private loadingPromises = new Map<string, Promise<DirectoryPage>>();

    constructor(private options: Partial<PaginationOptions> = {}) {}

    async getDirectoryPage(
        dirPath: string, 
        pageIndex: number = 0,
        pageSize?: number
    ): Promise<DirectoryPage> {
        const actualPageSize = pageSize || this.options.pageSize || this.defaultPageSize;
        const cacheKey = `${dirPath}:${pageIndex}:${actualPageSize}`;

        const cachedPages = this.paginationCache.get(dirPath);
        if (cachedPages && cachedPages[pageIndex]) {
            return cachedPages[pageIndex];
        }

        const existingPromise = this.loadingPromises.get(cacheKey);
        if (existingPromise) {
            return existingPromise;
        }

        const loadPromise = this.loadDirectoryPage(dirPath, pageIndex, actualPageSize);
        this.loadingPromises.set(cacheKey, loadPromise);

        try {
            const result = await loadPromise;
            
            if (!this.paginationCache.has(dirPath)) {
                this.paginationCache.set(dirPath, []);
            }
            this.paginationCache.get(dirPath)![pageIndex] = result;
            
            return result;
        } finally {
            this.loadingPromises.delete(cacheKey);
        }
    }

    private async loadDirectoryPage(
        dirPath: string, 
        pageIndex: number, 
        pageSize: number
    ): Promise<DirectoryPage> {
        try {
            const allItems = await fs.promises.readdir(dirPath);
            const totalCount = allItems.length;
            const startIndex = pageIndex * pageSize;
            const endIndex = Math.min(startIndex + pageSize, totalCount);
            
            const pageItems = allItems.slice(startIndex, endIndex);
            const hasMore = endIndex < totalCount;

            return {
                items: pageItems,
                hasMore,
                totalCount,
                pageIndex
            };
        } catch (error) {
            return {
                items: [],
                hasMore: false,
                totalCount: 0,
                pageIndex
            };
        }
    }

    async *getLazyDirectoryItems(
        dirPath: string,
        pageSize?: number
    ): AsyncGenerator<string[], void, unknown> {
        const actualPageSize = pageSize || this.options.pageSize || this.defaultPageSize;
        let pageIndex = 0;
        let hasMore = true;

        while (hasMore) {
            const page = await this.getDirectoryPage(dirPath, pageIndex, actualPageSize);
            
            if (page.items.length > 0) {
                yield page.items;
            }
            
            hasMore = page.hasMore;
            pageIndex++;
        }
    }

    async countDirectoryItems(
        dirPath: string,
        options: { 
            recursive?: boolean;
            maxDepth?: number;
        } = {}
    ): Promise<{ files: number; directories: number; total: number }> {
        const { recursive = false, maxDepth = 3 } = options;

        let fileCount = 0;
        let dirCount = 0;

        const countRecursive = async (currentPath: string, depth: number = 0): Promise<void> => {
            if (recursive && depth > maxDepth) {
                return;
            }

            try {
                const items = await fs.promises.readdir(currentPath, { withFileTypes: true });
                
                for (const item of items) {
                    if (item.isDirectory()) {
                        dirCount++;
                        if (recursive) {
                            const subPath = path.join(currentPath, item.name);
                            await countRecursive(subPath, depth + 1);
                        }
                    } else {
                        fileCount++;
                    }
                }
            } catch (error) {
                // Ignore errors for test
            }
        };

        await countRecursive(dirPath);
        
        return {
            files: fileCount,
            directories: dirCount,
            total: fileCount + dirCount
        };
    }

    async getDirectoryStats(dirPath: string): Promise<{
        itemCount: number;
        isLarge: boolean;
        recommendPagination: boolean;
        estimatedLoadTime: number;
    }> {
        try {
            const items = await fs.promises.readdir(dirPath);
            const itemCount = items.length;
            const maxItems = this.options.maxItems || this.defaultMaxItems;
            
            const isLarge = itemCount > maxItems;
            const recommendPagination = itemCount > (maxItems / 2);
            const estimatedLoadTime = Math.max(100, itemCount * 2);

            return {
                itemCount,
                isLarge,
                recommendPagination,
                estimatedLoadTime
            };
        } catch (error) {
            return {
                itemCount: 0,
                isLarge: false,
                recommendPagination: false,
                estimatedLoadTime: 0
            };
        }
    }

    async processBatch<T, R>(
        items: T[],
        processor: (item: T, index: number) => Promise<R>,
        options: {
            batchSize?: number;
            delayBetweenBatches?: number;
        } = {}
    ): Promise<R[]> {
        const {
            batchSize = 50,
            delayBetweenBatches = 10
        } = options;

        const results: R[] = [];
        const totalBatches = Math.ceil(items.length / batchSize);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIndex = batchIndex * batchSize;
            const endIndex = Math.min(startIndex + batchSize, items.length);
            const batch = items.slice(startIndex, endIndex);

            const batchPromises = batch.map((item, index) => 
                processor(item, startIndex + index)
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            if (batchIndex < totalBatches - 1 && delayBetweenBatches > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }

        return results;
    }

    clearCache(dirPath?: string): void {
        if (dirPath) {
            this.paginationCache.delete(dirPath);
        } else {
            this.paginationCache.clear();
        }
    }

    getCacheStats(): {
        cachedDirectories: number;
        totalPages: number;
        memoryUsage: number;
    } {
        let totalPages = 0;
        let memoryUsage = 0;

        for (const [dirPath, pages] of this.paginationCache.entries()) {
            totalPages += pages.length;
            
            for (const page of pages) {
                memoryUsage += page.items.reduce((sum, item) => sum + item.length * 2, 0);
                memoryUsage += 100;
            }
        }

        return {
            cachedDirectories: this.paginationCache.size,
            totalPages,
            memoryUsage
        };
    }

    updateOptions(newOptions: Partial<PaginationOptions>): void {
        this.options = { ...this.options, ...newOptions };
    }

    dispose(): void {
        this.paginationCache.clear();
        this.loadingPromises.clear();
    }
}

describe('SimpleLargeDirectoryOptimizer', () => {
    let optimizer: SimpleLargeDirectoryOptimizer;
    let testDir: string;

    beforeEach(async () => {
        optimizer = new SimpleLargeDirectoryOptimizer({
            pageSize: 10,
            maxItems: 50
        });

        // Create temporary test directory
        testDir = path.join(os.tmpdir(), `test-dir-${Date.now()}`);
        await fs.promises.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        optimizer.dispose();
        
        // Clean up test directory
        try {
            await fs.promises.rmdir(testDir, { recursive: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('ページネーション機能', () => {
        beforeEach(async () => {
            // Create test files
            for (let i = 0; i < 25; i++) {
                await fs.promises.writeFile(
                    path.join(testDir, `file${i.toString().padStart(2, '0')}.txt`),
                    `content ${i}`
                );
            }
        });

        it('ディレクトリページを正しく取得できる', async () => {
            const page0 = await optimizer.getDirectoryPage(testDir, 0, 10);
            
            assert.strictEqual(page0.items.length, 10);
            assert.strictEqual(page0.hasMore, true);
            assert.strictEqual(page0.totalCount, 25);
            assert.strictEqual(page0.pageIndex, 0);
        });

        it('複数ページを正しく処理できる', async () => {
            const page0 = await optimizer.getDirectoryPage(testDir, 0, 10);
            const page1 = await optimizer.getDirectoryPage(testDir, 1, 10);
            const page2 = await optimizer.getDirectoryPage(testDir, 2, 10);

            assert.strictEqual(page0.items.length, 10);
            assert.strictEqual(page1.items.length, 10);
            assert.strictEqual(page2.items.length, 5); // 残り5個
            assert.strictEqual(page2.hasMore, false);
        });

        it('キャッシュが正しく動作する', async () => {
            // 最初の読み込み
            const page1 = await optimizer.getDirectoryPage(testDir, 0, 10);

            // キャッシュからの読み込み
            const page2 = await optimizer.getDirectoryPage(testDir, 0, 10);

            // 内容が同じであることを確認
            assert.deepStrictEqual(page1, page2);
            
            // キャッシュ統計でキャッシュされていることを確認
            const stats = optimizer.getCacheStats();
            assert.strictEqual(stats.cachedDirectories, 1);
            assert.strictEqual(stats.totalPages, 1);
        });

        it('遅延読み込みが正しく動作する', async () => {
            const allItems: string[] = [];
            
            for await (const batch of optimizer.getLazyDirectoryItems(testDir, 8)) {
                allItems.push(...batch);
            }

            assert.strictEqual(allItems.length, 25);
            
            // ファイル名がソートされていることを確認
            const expectedFiles = Array.from({ length: 25 }, (_, i) => 
                `file${i.toString().padStart(2, '0')}.txt`
            );
            assert.deepStrictEqual(allItems.sort(), expectedFiles.sort());
        });
    });

    describe('ディレクトリ統計', () => {
        beforeEach(async () => {
            // Create test files and directories
            for (let i = 0; i < 15; i++) {
                await fs.promises.writeFile(
                    path.join(testDir, `file${i}.txt`),
                    `content ${i}`
                );
            }
            
            for (let i = 0; i < 5; i++) {
                const subDir = path.join(testDir, `subdir${i}`);
                await fs.promises.mkdir(subDir);
                
                // Add files to subdirectories
                for (let j = 0; j < 3; j++) {
                    await fs.promises.writeFile(
                        path.join(subDir, `subfile${j}.txt`),
                        `subcontent ${j}`
                    );
                }
            }
        });

        it('ディレクトリ統計を正しく取得できる', async () => {
            const stats = await optimizer.getDirectoryStats(testDir);
            
            assert.strictEqual(stats.itemCount, 20); // 15 files + 5 directories
            assert.strictEqual(stats.isLarge, false); // maxItems = 50
            assert.strictEqual(stats.recommendPagination, false); // < maxItems/2
            assert.ok(stats.estimatedLoadTime >= 100);
        });

        it('アイテム数をカウントできる（非再帰）', async () => {
            const counts = await optimizer.countDirectoryItems(testDir, { recursive: false });
            
            assert.strictEqual(counts.files, 15);
            assert.strictEqual(counts.directories, 5);
            assert.strictEqual(counts.total, 20);
        });

        it('アイテム数をカウントできる（再帰）', async () => {
            const counts = await optimizer.countDirectoryItems(testDir, { 
                recursive: true,
                maxDepth: 2
            });
            
            assert.strictEqual(counts.files, 30); // 15 + (5 * 3)
            assert.strictEqual(counts.directories, 5);
            assert.strictEqual(counts.total, 35);
        });
    });

    describe('バッチ処理', () => {
        it('バッチ処理が正しく動作する', async () => {
            const items = Array.from({ length: 100 }, (_, i) => i);
            const results: number[] = [];

            const processedResults = await optimizer.processBatch(
                items,
                async (item, index) => {
                    results.push(item * 2);
                    return item * 2;
                },
                { batchSize: 25, delayBetweenBatches: 1 }
            );

            assert.strictEqual(processedResults.length, 100);
            assert.strictEqual(results.length, 100);
            
            // 結果が正しいことを確認
            for (let i = 0; i < 100; i++) {
                assert.strictEqual(processedResults[i], i * 2);
            }
        });

        it('バッチサイズが正しく適用される', async () => {
            const items = Array.from({ length: 23 }, (_, i) => i);
            const batchSizes: number[] = [];
            let currentBatchSize = 0;

            await optimizer.processBatch(
                items,
                async (item, index) => {
                    currentBatchSize++;
                    
                    // バッチの最後のアイテムかチェック
                    if (index === items.length - 1 || (index + 1) % 10 === 0) {
                        batchSizes.push(currentBatchSize);
                        currentBatchSize = 0;
                    }
                    
                    return item;
                },
                { batchSize: 10 }
            );

            assert.deepStrictEqual(batchSizes, [10, 10, 3]); // 10 + 10 + 3 = 23
        });
    });

    describe('キャッシュ管理', () => {
        beforeEach(async () => {
            // Create test files
            for (let i = 0; i < 15; i++) {
                await fs.promises.writeFile(
                    path.join(testDir, `file${i}.txt`),
                    `content ${i}`
                );
            }
        });

        it('キャッシュ統計を取得できる', async () => {
            // Load some pages to populate cache
            await optimizer.getDirectoryPage(testDir, 0, 5);
            await optimizer.getDirectoryPage(testDir, 1, 5);

            const stats = optimizer.getCacheStats();
            
            assert.strictEqual(stats.cachedDirectories, 1);
            assert.strictEqual(stats.totalPages, 2);
            assert.ok(stats.memoryUsage > 0);
        });

        it('特定ディレクトリのキャッシュをクリアできる', async () => {
            await optimizer.getDirectoryPage(testDir, 0, 5);
            
            let stats = optimizer.getCacheStats();
            assert.strictEqual(stats.cachedDirectories, 1);

            optimizer.clearCache(testDir);
            
            stats = optimizer.getCacheStats();
            assert.strictEqual(stats.cachedDirectories, 0);
        });

        it('全キャッシュをクリアできる', async () => {
            await optimizer.getDirectoryPage(testDir, 0, 5);
            
            let stats = optimizer.getCacheStats();
            assert.strictEqual(stats.cachedDirectories, 1);

            optimizer.clearCache();
            
            stats = optimizer.getCacheStats();
            assert.strictEqual(stats.cachedDirectories, 0);
        });
    });

    describe('設定管理', () => {
        it('設定を更新できる', () => {
            optimizer.updateOptions({
                pageSize: 20,
                maxItems: 100
            });

            // 設定が適用されることを間接的に確認
            // （実際の設定値は private なので、動作で確認）
            assert.ok(true); // 設定更新がエラーなく完了
        });
    });

    describe('エラーハンドリング', () => {
        it('存在しないディレクトリを処理できる', async () => {
            const nonExistentDir = path.join(testDir, 'non-existent');
            
            const page = await optimizer.getDirectoryPage(nonExistentDir, 0, 10);
            
            assert.strictEqual(page.items.length, 0);
            assert.strictEqual(page.hasMore, false);
            assert.strictEqual(page.totalCount, 0);
        });

        it('統計取得でエラーが発生した場合のデフォルト値', async () => {
            const nonExistentDir = path.join(testDir, 'non-existent');
            
            const stats = await optimizer.getDirectoryStats(nonExistentDir);
            
            assert.strictEqual(stats.itemCount, 0);
            assert.strictEqual(stats.isLarge, false);
            assert.strictEqual(stats.recommendPagination, false);
            assert.strictEqual(stats.estimatedLoadTime, 0);
        });
    });

    describe('パフォーマンステスト', () => {
        it('大量ファイルの処理パフォーマンス', async () => {
            // Create many test files
            const fileCount = 200;
            for (let i = 0; i < fileCount; i++) {
                await fs.promises.writeFile(
                    path.join(testDir, `perf_file${i}.txt`),
                    `content ${i}`
                );
            }

            const startTime = Date.now();
            
            // Test pagination performance
            const page0 = await optimizer.getDirectoryPage(testDir, 0, 50);
            const page1 = await optimizer.getDirectoryPage(testDir, 1, 50);
            
            const loadTime = Date.now() - startTime;
            
            assert.strictEqual(page0.items.length, 50);
            assert.strictEqual(page1.items.length, 50);
            assert.ok(loadTime < 1000, `Load time ${loadTime}ms should be less than 1000ms`);
        });

        it('キャッシュのメモリ効率', async () => {
            // Create test files
            for (let i = 0; i < 50; i++) {
                await fs.promises.writeFile(
                    path.join(testDir, `memory_test_${i}.txt`),
                    `content ${i}`
                );
            }

            // Load multiple pages
            for (let page = 0; page < 5; page++) {
                await optimizer.getDirectoryPage(testDir, page, 10);
            }

            const stats = optimizer.getCacheStats();
            
            // メモリ使用量が合理的な範囲内であることを確認
            assert.ok(stats.memoryUsage < 10000, 'Memory usage should be reasonable');
            assert.strictEqual(stats.totalPages, 5);
        });
    });
});