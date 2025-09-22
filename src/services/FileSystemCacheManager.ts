import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface CacheEntry<T> {
    value: T;
    timestamp: number;
    ttl: number;
}

interface ICacheManager {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, ttl?: number): void;
    invalidate(key: string): void;
    clear(): void;
    size(): number;
}

interface FileSystemWatcherOptions {
    debounceDelay: number;
    watchPatterns: string[];
}

export class FileSystemCacheManager implements ICacheManager {
    private cache = new Map<string, CacheEntry<any>>();
    private readonly defaultTTL = 30000; // 30秒
    private watchers: vscode.FileSystemWatcher[] = [];
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private hitCount = 0;
    private accessCount = 0;
    private readonly debounceDelay: number;

    constructor(options?: Partial<FileSystemWatcherOptions>) {
        this.debounceDelay = options?.debounceDelay || 300;
        this.setupFileSystemWatchers(options?.watchPatterns || ['**/*']);
        this.startCleanupTimer();
    }

    /**
     * キャッシュから値を取得
     */
    get<T>(key: string): T | undefined {
        this.accessCount++;
        
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }

        // TTLチェック
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return undefined;
        }

        this.hitCount++;
        return entry.value as T;
    }

    /**
     * キャッシュに値を設定
     */
    set<T>(key: string, value: T, ttl?: number): void {
        const entry: CacheEntry<T> = {
            value,
            timestamp: Date.now(),
            ttl: ttl || this.defaultTTL
        };
        this.cache.set(key, entry);
    }

    /**
     * 特定のキーのキャッシュを無効化
     */
    invalidate(key: string): void {
        this.cache.delete(key);
    }

    /**
     * パターンに一致するキーのキャッシュを無効化
     */
    invalidatePattern(pattern: string): void {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * 全キャッシュをクリア
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * キャッシュサイズを取得
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * ファイルシステムウォッチャーを設定
     */
    private setupFileSystemWatchers(patterns: string[]): void {
        patterns.forEach(pattern => {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            
            // ファイル作成時
            watcher.onDidCreate(uri => {
                this.debouncedInvalidation(uri.fsPath, () => {
                    this.invalidatePathCache(uri.fsPath);
                });
            });

            // ファイル変更時
            watcher.onDidChange(uri => {
                this.debouncedInvalidation(uri.fsPath, () => {
                    this.invalidatePathCache(uri.fsPath);
                });
            });

            // ファイル削除時
            watcher.onDidDelete(uri => {
                this.debouncedInvalidation(uri.fsPath, () => {
                    this.invalidatePathCache(uri.fsPath);
                });
            });

            this.watchers.push(watcher);
        });
    }

    /**
     * デバウンス処理付きキャッシュ無効化
     */
    private debouncedInvalidation(filePath: string, callback: () => void): void {
        const key = `invalidation:${filePath}`;
        
        // 既存のタイマーをクリア
        const existingTimer = this.debounceTimers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // 新しいタイマーを設定
        const timer = setTimeout(() => {
            callback();
            this.debounceTimers.delete(key);
        }, this.debounceDelay);

        this.debounceTimers.set(key, timer);
    }

    /**
     * パスに関連するキャッシュを無効化
     */
    private invalidatePathCache(filePath: string): void {
        const normalizedPath = path.normalize(filePath);
        const parentDir = path.dirname(normalizedPath);

        // 直接のパスキャッシュを無効化
        this.invalidate(`file:${normalizedPath}`);
        this.invalidate(`dir:${normalizedPath}`);
        this.invalidate(`stats:${normalizedPath}`);

        // 親ディレクトリのキャッシュを無効化
        this.invalidate(`dir:${parentDir}`);
        this.invalidate(`children:${parentDir}`);

        // 検索結果のキャッシュを無効化
        this.invalidatePattern('search:.*');
    }

    /**
     * 期限切れキャッシュの定期クリーンアップ
     */
    private startCleanupTimer(): void {
        setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.cache.entries()) {
                if (now - entry.timestamp > entry.ttl) {
                    this.cache.delete(key);
                }
            }
        }, 60000); // 1分ごとにクリーンアップ
    }

    /**
     * Get cache statistics
     */
    public getStats(): { size: number; hitRate: number } {
        return {
            size: this.cache.size,
            hitRate: this.hitCount / Math.max(this.accessCount, 1)
        };
    }

    /**
     * Cleanup expired entries
     */
    public cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * リソースの破棄
     */
    dispose(): void {
        // ファイルシステムウォッチャーを破棄
        this.watchers.forEach(watcher => watcher.dispose());
        this.watchers = [];

        // デバウンスタイマーをクリア
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();

        // キャッシュをクリア
        this.clear();
    }
}

/**
 * デバウンス処理のユーティリティクラス
 */
export class DebounceManager {
    private timers = new Map<string, NodeJS.Timeout>();

    /**
     * デバウンス処理を実行
     */
    debounce(key: string, fn: () => void, delay: number): void {
        const existingTimer = this.timers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
            fn();
            this.timers.delete(key);
        }, delay);

        this.timers.set(key, timer);
    }

    /**
     * 特定のキーのタイマーをキャンセル
     */
    cancel(key: string): void {
        const timer = this.timers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(key);
        }
    }

    /**
     * 全タイマーをクリア
     */
    clear(): void {
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();
    }

    /**
     * リソースの破棄
     */
    dispose(): void {
        this.clear();
    }
}

/**
 * 仮想スクロール最適化のためのヘルパークラス
 */
export class VirtualScrollOptimizer {
    private visibleRange: { start: number; end: number } = { start: 0, end: 0 };
    private itemHeight: number;
    private containerHeight: number;
    private totalItems: number;

    constructor(itemHeight: number = 22, containerHeight: number = 400) {
        this.itemHeight = itemHeight;
        this.containerHeight = containerHeight;
        this.totalItems = 0;
    }

    /**
     * 表示範囲を計算
     */
    calculateVisibleRange(scrollTop: number, totalItems: number): { start: number; end: number } {
        this.totalItems = totalItems;
        
        const start = Math.floor(scrollTop / this.itemHeight);
        const visibleCount = Math.ceil(this.containerHeight / this.itemHeight);
        const end = Math.min(start + visibleCount + 5, totalItems); // バッファを追加

        this.visibleRange = { start: Math.max(0, start - 5), end }; // 上下にバッファを追加
        return this.visibleRange;
    }

    /**
     * 現在の表示範囲を取得
     */
    getVisibleRange(): { start: number; end: number } {
        return this.visibleRange;
    }

    /**
     * 仮想スクロールの高さを計算
     */
    getTotalHeight(): number {
        return this.totalItems * this.itemHeight;
    }

    /**
     * スクロール位置からアイテムインデックスを計算
     */
    getItemIndexFromScrollPosition(scrollTop: number): number {
        return Math.floor(scrollTop / this.itemHeight);
    }

    /**
     * アイテムインデックスからスクロール位置を計算
     */
    getScrollPositionFromItemIndex(index: number): number {
        return index * this.itemHeight;
    }

    /**
     * 設定を更新
     */
    updateSettings(itemHeight?: number, containerHeight?: number): void {
        if (itemHeight !== undefined) {
            this.itemHeight = itemHeight;
        }
        if (containerHeight !== undefined) {
            this.containerHeight = containerHeight;
        }
    }
}