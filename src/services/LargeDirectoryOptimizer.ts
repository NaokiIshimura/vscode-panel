import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface PaginationOptions {
    pageSize: number;
    maxItems: number;
    enableLazyLoading: boolean;
}

interface DirectoryPage {
    items: string[];
    hasMore: boolean;
    totalCount: number;
    pageIndex: number;
}

interface ProgressOptions {
    title: string;
    cancellable: boolean;
    location: vscode.ProgressLocation;
}

export class LargeDirectoryOptimizer {
    private readonly defaultPageSize = 100;
    private readonly defaultMaxItems = 1000;
    private paginationCache = new Map<string, DirectoryPage[]>();
    private loadingPromises = new Map<string, Promise<DirectoryPage>>();

    constructor(
        private options: Partial<PaginationOptions> = {}
    ) {}

    /**
     * ページネーション付きでディレクトリ内容を取得
     */
    async getDirectoryPage(
        dirPath: string, 
        pageIndex: number = 0,
        pageSize?: number
    ): Promise<DirectoryPage> {
        const actualPageSize = pageSize || this.options.pageSize || this.defaultPageSize;
        const cacheKey = `${dirPath}:${pageIndex}:${actualPageSize}`;

        // キャッシュから取得を試行
        const cachedPages = this.paginationCache.get(dirPath);
        if (cachedPages && cachedPages[pageIndex]) {
            return cachedPages[pageIndex];
        }

        // 既に読み込み中の場合は待機
        const existingPromise = this.loadingPromises.get(cacheKey);
        if (existingPromise) {
            return existingPromise;
        }

        // 新しい読み込みを開始
        const loadPromise = this.loadDirectoryPage(dirPath, pageIndex, actualPageSize);
        this.loadingPromises.set(cacheKey, loadPromise);

        try {
            const result = await loadPromise;
            
            // キャッシュに保存
            if (!this.paginationCache.has(dirPath)) {
                this.paginationCache.set(dirPath, []);
            }
            this.paginationCache.get(dirPath)![pageIndex] = result;
            
            return result;
        } finally {
            this.loadingPromises.delete(cacheKey);
        }
    }

    /**
     * 実際のディレクトリページ読み込み
     */
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
            console.error(`Failed to load directory page ${dirPath}:${pageIndex}:`, error);
            return {
                items: [],
                hasMore: false,
                totalCount: 0,
                pageIndex
            };
        }
    }

    /**
     * 遅延読み込み付きでディレクトリ内容を取得
     */
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

    /**
     * 進行状況インジケーター付きで長時間操作を実行
     */
    async withProgress<T>(
        operation: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>,
        options: Partial<ProgressOptions> = {}
    ): Promise<T> {
        const progressOptions: vscode.ProgressOptions = {
            location: options.location || vscode.ProgressLocation.Notification,
            title: options.title || '処理中...',
            cancellable: options.cancellable || false
        };

        return vscode.window.withProgress(progressOptions, operation);
    }

    /**
     * 大きなディレクトリのファイル数をカウント
     */
    async countDirectoryItems(
        dirPath: string,
        options: { 
            showProgress?: boolean;
            recursive?: boolean;
            maxDepth?: number;
        } = {}
    ): Promise<{ files: number; directories: number; total: number }> {
        const { showProgress = true, recursive = false, maxDepth = 3 } = options;

        const countOperation = async (
            progress?: vscode.Progress<{ message?: string; increment?: number }>
        ) => {
            let fileCount = 0;
            let dirCount = 0;
            let processedCount = 0;

            const countRecursive = async (currentPath: string, depth: number = 0): Promise<void> => {
                if (recursive && depth > maxDepth) {
                    return;
                }

                try {
                    const items = await fs.promises.readdir(currentPath, { withFileTypes: true });
                    
                    for (const item of items) {
                        processedCount++;
                        
                        if (progress && processedCount % 10 === 0) {
                            progress.report({
                                message: `処理済み: ${processedCount}個のアイテム`,
                                increment: 1
                            });
                        }

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
                    console.warn(`Failed to count items in ${currentPath}:`, error);
                }
            };

            await countRecursive(dirPath);
            
            return {
                files: fileCount,
                directories: dirCount,
                total: fileCount + dirCount
            };
        };

        if (showProgress) {
            return this.withProgress(countOperation, {
                title: 'ディレクトリ内容をカウント中...',
                cancellable: true
            });
        } else {
            return countOperation();
        }
    }

    /**
     * 大きなディレクトリの統計情報を取得
     */
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
            
            // 推定読み込み時間（アイテム数に基づく簡単な計算）
            const estimatedLoadTime = Math.max(100, itemCount * 2); // 最低100ms、アイテムあたり2ms

            return {
                itemCount,
                isLarge,
                recommendPagination,
                estimatedLoadTime
            };
        } catch (error) {
            console.error(`Failed to get directory stats for ${dirPath}:`, error);
            return {
                itemCount: 0,
                isLarge: false,
                recommendPagination: false,
                estimatedLoadTime: 0
            };
        }
    }

    /**
     * バッチ処理で大量のファイル操作を実行
     */
    async processBatch<T, R>(
        items: T[],
        processor: (item: T, index: number) => Promise<R>,
        options: {
            batchSize?: number;
            showProgress?: boolean;
            title?: string;
            delayBetweenBatches?: number;
        } = {}
    ): Promise<R[]> {
        const {
            batchSize = 50,
            showProgress = true,
            title = 'バッチ処理中...',
            delayBetweenBatches = 10
        } = options;

        const results: R[] = [];
        const totalBatches = Math.ceil(items.length / batchSize);

        const batchOperation = async (
            progress?: vscode.Progress<{ message?: string; increment?: number }>
        ) => {
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const startIndex = batchIndex * batchSize;
                const endIndex = Math.min(startIndex + batchSize, items.length);
                const batch = items.slice(startIndex, endIndex);

                // バッチ内の並列処理
                const batchPromises = batch.map((item, index) => 
                    processor(item, startIndex + index)
                );
                
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // 進行状況を報告
                if (progress) {
                    const completedItems = endIndex;
                    const progressPercent = (completedItems / items.length) * 100;
                    progress.report({
                        message: `${completedItems}/${items.length} 完了 (${progressPercent.toFixed(1)}%)`,
                        increment: (batchSize / items.length) * 100
                    });
                }

                // バッチ間の遅延（UIの応答性を保つため）
                if (batchIndex < totalBatches - 1 && delayBetweenBatches > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
                }
            }

            return results;
        };

        if (showProgress) {
            return this.withProgress(batchOperation, {
                title,
                cancellable: true
            });
        } else {
            return batchOperation();
        }
    }

    /**
     * ディレクトリの事前読み込み
     */
    async preloadDirectory(
        dirPath: string,
        options: {
            maxPages?: number;
            pageSize?: number;
            showProgress?: boolean;
        } = {}
    ): Promise<void> {
        const {
            maxPages = 5,
            pageSize = this.options.pageSize || this.defaultPageSize,
            showProgress = false
        } = options;

        const preloadOperation = async (
            progress?: vscode.Progress<{ message?: string; increment?: number }>
        ) => {
            const stats = await this.getDirectoryStats(dirPath);
            
            if (!stats.recommendPagination) {
                // 小さなディレクトリは全て読み込み
                await this.getDirectoryPage(dirPath, 0, stats.itemCount);
                return;
            }

            // 大きなディレクトリは指定されたページ数まで事前読み込み
            const totalPages = Math.ceil(stats.itemCount / pageSize);
            const pagesToLoad = Math.min(maxPages, totalPages);

            for (let pageIndex = 0; pageIndex < pagesToLoad; pageIndex++) {
                await this.getDirectoryPage(dirPath, pageIndex, pageSize);
                
                if (progress) {
                    progress.report({
                        message: `ページ ${pageIndex + 1}/${pagesToLoad} を読み込み中...`,
                        increment: (1 / pagesToLoad) * 100
                    });
                }
            }
        };

        if (showProgress) {
            await this.withProgress(preloadOperation, {
                title: 'ディレクトリを事前読み込み中...',
                cancellable: false
            });
        } else {
            await preloadOperation();
        }
    }

    /**
     * キャッシュをクリア
     */
    clearCache(dirPath?: string): void {
        if (dirPath) {
            this.paginationCache.delete(dirPath);
        } else {
            this.paginationCache.clear();
        }
    }

    /**
     * キャッシュ統計を取得
     */
    getCacheStats(): {
        cachedDirectories: number;
        totalPages: number;
        memoryUsage: number;
    } {
        let totalPages = 0;
        let memoryUsage = 0;

        for (const [dirPath, pages] of this.paginationCache.entries()) {
            totalPages += pages.length;
            
            // 概算メモリ使用量（文字列長 × 2バイト + オーバーヘッド）
            for (const page of pages) {
                memoryUsage += page.items.reduce((sum, item) => sum + item.length * 2, 0);
                memoryUsage += 100; // ページオブジェクトのオーバーヘッド
            }
        }

        return {
            cachedDirectories: this.paginationCache.size,
            totalPages,
            memoryUsage
        };
    }

    /**
     * 設定を更新
     */
    updateOptions(newOptions: Partial<PaginationOptions>): void {
        this.options = { ...this.options, ...newOptions };
    }

    /**
     * リソースの破棄
     */
    dispose(): void {
        this.paginationCache.clear();
        this.loadingPromises.clear();
    }
}