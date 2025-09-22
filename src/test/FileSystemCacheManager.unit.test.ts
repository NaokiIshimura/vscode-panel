import * as assert from 'assert';

// Simple cache manager implementation for testing without VSCode dependencies
interface CacheEntry<T> {
    value: T;
    timestamp: number;
    ttl: number;
}

class SimpleCacheManager {
    private cache = new Map<string, CacheEntry<any>>();
    private readonly defaultTTL = 30000;

    get<T>(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }

        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.value as T;
    }

    set<T>(key: string, value: T, ttl?: number): void {
        const entry: CacheEntry<T> = {
            value,
            timestamp: Date.now(),
            ttl: ttl || this.defaultTTL
        };
        this.cache.set(key, entry);
    }

    invalidate(key: string): void {
        this.cache.delete(key);
    }

    invalidatePattern(pattern: string): void {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }

    clear(): void {
        this.cache.clear();
    }

    size(): number {
        return this.cache.size;
    }
}

class SimpleDebounceManager {
    private timers = new Map<string, NodeJS.Timeout>();

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

    cancel(key: string): void {
        const timer = this.timers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(key);
        }
    }

    clear(): void {
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();
    }

    dispose(): void {
        this.clear();
    }
}

class SimpleVirtualScrollOptimizer {
    private visibleRange: { start: number; end: number } = { start: 0, end: 0 };
    private itemHeight: number;
    private containerHeight: number;
    private totalItems: number;

    constructor(itemHeight: number = 22, containerHeight: number = 400) {
        this.itemHeight = itemHeight;
        this.containerHeight = containerHeight;
        this.totalItems = 0;
    }

    calculateVisibleRange(scrollTop: number, totalItems: number): { start: number; end: number } {
        this.totalItems = totalItems;
        
        const start = Math.floor(scrollTop / this.itemHeight);
        const visibleCount = Math.ceil(this.containerHeight / this.itemHeight);
        const end = Math.min(start + visibleCount + 5, totalItems);

        this.visibleRange = { start: Math.max(0, start - 5), end };
        return this.visibleRange;
    }

    getVisibleRange(): { start: number; end: number } {
        return this.visibleRange;
    }

    getTotalHeight(): number {
        return this.totalItems * this.itemHeight;
    }

    getItemIndexFromScrollPosition(scrollTop: number): number {
        return Math.floor(scrollTop / this.itemHeight);
    }

    getScrollPositionFromItemIndex(index: number): number {
        return index * this.itemHeight;
    }

    updateSettings(itemHeight?: number, containerHeight?: number): void {
        if (itemHeight !== undefined) {
            this.itemHeight = itemHeight;
        }
        if (containerHeight !== undefined) {
            this.containerHeight = containerHeight;
        }
    }
}

describe('SimpleCacheManager', () => {
    let cacheManager: SimpleCacheManager;

    beforeEach(() => {
        cacheManager = new SimpleCacheManager();
    });

    describe('基本的なキャッシュ操作', () => {
        it('値を設定して取得できる', () => {
            const key = 'test-key';
            const value = { data: 'test-data' };

            cacheManager.set(key, value);
            const retrieved = cacheManager.get(key);

            assert.deepStrictEqual(retrieved, value);
        });

        it('存在しないキーに対してundefinedを返す', () => {
            const result = cacheManager.get('non-existent-key');
            assert.strictEqual(result, undefined);
        });

        it('TTLが過ぎた値は取得できない', async () => {
            const key = 'ttl-test';
            const value = 'test-value';
            const shortTTL = 50; // 50ms

            cacheManager.set(key, value, shortTTL);
            
            // 即座に取得できることを確認
            assert.strictEqual(cacheManager.get(key), value);

            // TTL経過後は取得できないことを確認
            await new Promise(resolve => setTimeout(resolve, 100));
            assert.strictEqual(cacheManager.get(key), undefined);
        });

        it('キャッシュを無効化できる', () => {
            const key = 'invalidate-test';
            const value = 'test-value';

            cacheManager.set(key, value);
            assert.strictEqual(cacheManager.get(key), value);

            cacheManager.invalidate(key);
            assert.strictEqual(cacheManager.get(key), undefined);
        });

        it('全キャッシュをクリアできる', () => {
            cacheManager.set('key1', 'value1');
            cacheManager.set('key2', 'value2');
            assert.strictEqual(cacheManager.size(), 2);

            cacheManager.clear();
            assert.strictEqual(cacheManager.size(), 0);
            assert.strictEqual(cacheManager.get('key1'), undefined);
            assert.strictEqual(cacheManager.get('key2'), undefined);
        });
    });

    describe('パターンマッチング無効化', () => {
        it('パターンに一致するキーを無効化できる', () => {
            cacheManager.set('file:/path/to/file1.txt', 'content1');
            cacheManager.set('file:/path/to/file2.txt', 'content2');
            cacheManager.set('dir:/path/to', 'directory');
            cacheManager.set('other:key', 'other');

            cacheManager.invalidatePattern('file:.*');

            assert.strictEqual(cacheManager.get('file:/path/to/file1.txt'), undefined);
            assert.strictEqual(cacheManager.get('file:/path/to/file2.txt'), undefined);
            assert.strictEqual(cacheManager.get('dir:/path/to'), 'directory');
            assert.strictEqual(cacheManager.get('other:key'), 'other');
        });
    });



    describe('キャッシュサイズ', () => {
        it('正しいサイズを返す', () => {
            assert.strictEqual(cacheManager.size(), 0);

            cacheManager.set('key1', 'value1');
            assert.strictEqual(cacheManager.size(), 1);

            cacheManager.set('key2', 'value2');
            assert.strictEqual(cacheManager.size(), 2);

            cacheManager.invalidate('key1');
            assert.strictEqual(cacheManager.size(), 1);
        });
    });
});

describe('SimpleDebounceManager', () => {
    let debounceManager: SimpleDebounceManager;

    beforeEach(() => {
        debounceManager = new SimpleDebounceManager();
    });

    afterEach(() => {
        debounceManager.dispose();
    });

    it('デバウンス処理が正しく動作する', (done) => {
        let callCount = 0;
        const mockFn = () => { callCount++; };
        const key = 'test-key';
        const delay = 50;

        // 複数回呼び出し
        debounceManager.debounce(key, mockFn, delay);
        debounceManager.debounce(key, mockFn, delay);
        debounceManager.debounce(key, mockFn, delay);

        // まだ実行されていない
        assert.strictEqual(callCount, 0);

        // 時間経過後に確認
        setTimeout(() => {
            // 1回だけ実行される
            assert.strictEqual(callCount, 1);
            done();
        }, delay + 10);
    });

    it('異なるキーは独立してデバウンスされる', (done) => {
        let callCount1 = 0;
        let callCount2 = 0;
        const mockFn1 = () => { callCount1++; };
        const mockFn2 = () => { callCount2++; };
        const delay = 50;

        debounceManager.debounce('key1', mockFn1, delay);
        debounceManager.debounce('key2', mockFn2, delay);

        setTimeout(() => {
            assert.strictEqual(callCount1, 1);
            assert.strictEqual(callCount2, 1);
            done();
        }, delay + 10);
    });

    it('タイマーをキャンセルできる', (done) => {
        let callCount = 0;
        const mockFn = () => { callCount++; };
        const key = 'test-key';
        const delay = 50;

        debounceManager.debounce(key, mockFn, delay);
        debounceManager.cancel(key);

        setTimeout(() => {
            assert.strictEqual(callCount, 0);
            done();
        }, delay + 10);
    });

    it('全タイマーをクリアできる', (done) => {
        let callCount1 = 0;
        let callCount2 = 0;
        const mockFn1 = () => { callCount1++; };
        const mockFn2 = () => { callCount2++; };
        const delay = 50;

        debounceManager.debounce('key1', mockFn1, delay);
        debounceManager.debounce('key2', mockFn2, delay);
        debounceManager.clear();

        setTimeout(() => {
            assert.strictEqual(callCount1, 0);
            assert.strictEqual(callCount2, 0);
            done();
        }, delay + 10);
    });
});

describe('SimpleVirtualScrollOptimizer', () => {
    let optimizer: SimpleVirtualScrollOptimizer;

    beforeEach(() => {
        optimizer = new SimpleVirtualScrollOptimizer(20, 400); // 20px高さ、400px容器
    });

    describe('表示範囲計算', () => {
        it('正しい表示範囲を計算する', () => {
            const scrollTop = 100;
            const totalItems = 1000;

            const range = optimizer.calculateVisibleRange(scrollTop, totalItems);

            // scrollTop 100 / itemHeight 20 = index 5から開始
            // containerHeight 400 / itemHeight 20 = 20個表示可能
            // バッファを含めて計算
            assert.strictEqual(range.start, 0); // max(0, 5-5)
            assert.strictEqual(range.end, 30); // min(5+20+5, 1000)
        });

        it('総アイテム数が少ない場合の表示範囲', () => {
            const scrollTop = 0;
            const totalItems = 10;

            const range = optimizer.calculateVisibleRange(scrollTop, totalItems);

            assert.strictEqual(range.start, 0);
            assert.strictEqual(range.end, 10);
        });
    });

    describe('高さ計算', () => {
        it('総高さを正しく計算する', () => {
            optimizer.calculateVisibleRange(0, 100);
            const totalHeight = optimizer.getTotalHeight();

            assert.strictEqual(totalHeight, 100 * 20); // 100アイテム × 20px
        });
    });

    describe('位置とインデックスの変換', () => {
        it('スクロール位置からアイテムインデックスを計算', () => {
            const scrollTop = 140;
            const index = optimizer.getItemIndexFromScrollPosition(scrollTop);

            assert.strictEqual(index, 7); // 140 / 20 = 7
        });

        it('アイテムインデックスからスクロール位置を計算', () => {
            const index = 10;
            const scrollTop = optimizer.getScrollPositionFromItemIndex(index);

            assert.strictEqual(scrollTop, 200); // 10 * 20 = 200
        });
    });

    describe('設定更新', () => {
        it('アイテム高さを更新できる', () => {
            optimizer.updateSettings(30);
            
            const scrollTop = optimizer.getScrollPositionFromItemIndex(5);
            assert.strictEqual(scrollTop, 150); // 5 * 30 = 150
        });

        it('容器高さを更新できる', () => {
            optimizer.updateSettings(undefined, 600);
            
            const range = optimizer.calculateVisibleRange(0, 100);
            // 600 / 20 = 30個表示可能 + バッファ
            assert.strictEqual(range.end, 35);
        });
    });
});

describe('パフォーマンステスト', () => {
    let cacheManager: SimpleCacheManager;

    beforeEach(() => {
        cacheManager = new SimpleCacheManager();
    });

    it('大量のキャッシュエントリを効率的に処理する', () => {
        const startTime = Date.now();
        const entryCount = 10000;

        // 大量のエントリを設定
        for (let i = 0; i < entryCount; i++) {
            cacheManager.set(`key-${i}`, `value-${i}`);
        }

        const setTime = Date.now() - startTime;

        // 大量のエントリを取得
        const getStartTime = Date.now();
        for (let i = 0; i < entryCount; i++) {
            const value = cacheManager.get(`key-${i}`);
            assert.strictEqual(value, `value-${i}`);
        }
        const getTime = Date.now() - getStartTime;

        // パフォーマンス要件（調整可能）
        assert.ok(setTime < 1000, `Set time ${setTime}ms should be less than 1000ms`); // 1秒以内
        assert.ok(getTime < 500, `Get time ${getTime}ms should be less than 500ms`);  // 0.5秒以内
        assert.strictEqual(cacheManager.size(), entryCount);
    });

    it('パターンマッチング無効化のパフォーマンス', () => {
        const entryCount = 1000;

        // 様々なパターンのキーを設定
        for (let i = 0; i < entryCount; i++) {
            cacheManager.set(`file:/path/file-${i}.txt`, `content-${i}`);
            cacheManager.set(`dir:/path/dir-${i}`, `directory-${i}`);
        }

        const startTime = Date.now();
        cacheManager.invalidatePattern('file:.*');
        const invalidateTime = Date.now() - startTime;

        // パフォーマンス要件
        assert.ok(invalidateTime < 100, `Invalidate time ${invalidateTime}ms should be less than 100ms`); // 100ms以内

        // 正しく無効化されていることを確認
        assert.strictEqual(cacheManager.get('file:/path/file-0.txt'), undefined);
        assert.strictEqual(cacheManager.get('dir:/path/dir-0'), 'directory-0');
    });
});