import * as path from 'path';

/**
 * Mock filesystem for testing
 */
export class MockFileSystem {
    private files: Map<string, MockFileEntry> = new Map();
    private watchers: Map<string, MockFileWatcher[]> = new Map();

    constructor() {
        this.reset();
    }

    /**
     * Reset filesystem to initial state
     */
    reset(): void {
        this.files.clear();
        this.watchers.clear();
        
        // Create default workspace structure
        this.createDirectory('/workspace');
        this.createDirectory('/workspace/src');
        this.createDirectory('/workspace/test');
        this.createFile('/workspace/package.json', '{"name": "test-project"}');
        this.createFile('/workspace/README.md', '# Test Project');
        this.createFile('/workspace/src/index.ts', 'console.log("Hello World");');
        this.createFile('/workspace/src/utils.ts', 'export function helper() {}');
        this.createFile('/workspace/test/index.test.ts', 'describe("test", () => {});');
        this.createFile('/workspace/.gitignore', 'node_modules/\n*.log');
        this.createFile('/workspace/.hidden', 'hidden file content');
    }

    /**
     * Create a file in the mock filesystem
     */
    createFile(filePath: string, content: string = '', options?: Partial<MockFileEntry>): void {
        const normalizedPath = this.normalizePath(filePath);
        const parentDir = path.dirname(normalizedPath);
        
        // Ensure parent directory exists
        if (!this.files.has(parentDir)) {
            this.createDirectory(parentDir);
        }

        const entry: MockFileEntry = {
            type: 'file',
            path: normalizedPath,
            name: path.basename(normalizedPath),
            content,
            size: content.length,
            created: new Date(),
            modified: new Date(),
            permissions: {
                readable: true,
                writable: true,
                executable: false,
                hidden: path.basename(normalizedPath).startsWith('.'),
                ...options?.permissions
            },
            ...options
        };

        this.files.set(normalizedPath, entry);
        this.notifyWatchers(normalizedPath, 'create');
    }

    /**
     * Create a directory in the mock filesystem
     */
    createDirectory(dirPath: string, options?: Partial<MockFileEntry>): void {
        const normalizedPath = this.normalizePath(dirPath);
        const parentDir = path.dirname(normalizedPath);
        
        // Ensure parent directory exists (except for root)
        if (parentDir !== normalizedPath && !this.files.has(parentDir)) {
            this.createDirectory(parentDir);
        }

        const entry: MockFileEntry = {
            type: 'directory',
            path: normalizedPath,
            name: path.basename(normalizedPath),
            content: '',
            size: 0,
            created: new Date(),
            modified: new Date(),
            permissions: {
                readable: true,
                writable: true,
                executable: true,
                hidden: path.basename(normalizedPath).startsWith('.'),
                ...options?.permissions
            },
            ...options
        };

        this.files.set(normalizedPath, entry);
        this.notifyWatchers(normalizedPath, 'create');
    }

    /**
     * Delete a file or directory
     */
    delete(filePath: string): boolean {
        const normalizedPath = this.normalizePath(filePath);
        const entry = this.files.get(normalizedPath);
        
        if (!entry) {
            return false;
        }

        // If it's a directory, delete all children first
        if (entry.type === 'directory') {
            const children = this.getChildren(normalizedPath);
            for (const child of children) {
                this.delete(child.path);
            }
        }

        this.files.delete(normalizedPath);
        this.notifyWatchers(normalizedPath, 'delete');
        return true;
    }

    /**
     * Move/rename a file or directory
     */
    move(oldPath: string, newPath: string): boolean {
        const normalizedOldPath = this.normalizePath(oldPath);
        const normalizedNewPath = this.normalizePath(newPath);
        
        const entry = this.files.get(normalizedOldPath);
        if (!entry) {
            return false;
        }

        // Check if destination already exists
        if (this.files.has(normalizedNewPath)) {
            return false;
        }

        // Update entry path and name
        const newEntry = {
            ...entry,
            path: normalizedNewPath,
            name: path.basename(normalizedNewPath),
            modified: new Date()
        };

        this.files.delete(normalizedOldPath);
        this.files.set(normalizedNewPath, newEntry);

        // If it's a directory, update all children paths
        if (entry.type === 'directory') {
            const children: MockFileEntry[] = [];
            this.files.forEach((f) => {
                if (f.path.startsWith(normalizedOldPath + '/')) {
                    children.push(f);
                }
            });
            
            for (const child of children) {
                const newChildPath = child.path.replace(normalizedOldPath, normalizedNewPath);
                const updatedChild = { ...child, path: newChildPath };
                this.files.delete(child.path);
                this.files.set(newChildPath, updatedChild);
            }
        }

        this.notifyWatchers(normalizedOldPath, 'delete');
        this.notifyWatchers(normalizedNewPath, 'create');
        return true;
    }

    /**
     * Copy a file or directory
     */
    copy(sourcePath: string, destPath: string): boolean {
        const normalizedSourcePath = this.normalizePath(sourcePath);
        const normalizedDestPath = this.normalizePath(destPath);
        
        const sourceEntry = this.files.get(normalizedSourcePath);
        if (!sourceEntry) {
            return false;
        }

        // Check if destination already exists
        if (this.files.has(normalizedDestPath)) {
            return false;
        }

        if (sourceEntry.type === 'file') {
            this.createFile(normalizedDestPath, sourceEntry.content, {
                permissions: { ...sourceEntry.permissions }
            });
        } else {
            this.createDirectory(normalizedDestPath, {
                permissions: { ...sourceEntry.permissions }
            });

            // Copy all children
            const children = this.getChildren(normalizedSourcePath);
            for (const child of children) {
                const relativePath = path.relative(normalizedSourcePath, child.path);
                const newChildPath = path.join(normalizedDestPath, relativePath);
                this.copy(child.path, newChildPath);
            }
        }

        return true;
    }

    /**
     * Get file or directory entry
     */
    getEntry(filePath: string): MockFileEntry | undefined {
        const normalizedPath = this.normalizePath(filePath);
        return this.files.get(normalizedPath);
    }

    /**
     * Check if file or directory exists
     */
    exists(filePath: string): boolean {
        const normalizedPath = this.normalizePath(filePath);
        return this.files.has(normalizedPath);
    }

    /**
     * Get children of a directory
     */
    getChildren(dirPath: string): MockFileEntry[] {
        const normalizedPath = this.normalizePath(dirPath);
        const children: MockFileEntry[] = [];

        this.files.forEach((entry) => {
            const entryParent = path.dirname(entry.path);
            if (entryParent === normalizedPath) {
                children.push(entry);
            }
        });

        return children.sort((a, b) => {
            // Directories first, then files
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
    }

    /**
     * Read file content
     */
    readFile(filePath: string): string | undefined {
        const entry = this.getEntry(filePath);
        return entry?.type === 'file' ? entry.content : undefined;
    }

    /**
     * Write file content
     */
    writeFile(filePath: string, content: string): boolean {
        const normalizedPath = this.normalizePath(filePath);
        const entry = this.files.get(normalizedPath);
        
        if (entry && entry.type === 'file') {
            entry.content = content;
            entry.size = content.length;
            entry.modified = new Date();
            this.notifyWatchers(normalizedPath, 'change');
            return true;
        }
        
        return false;
    }

    /**
     * Create a file watcher
     */
    createWatcher(pattern: string): MockFileWatcher {
        const watcher = new MockFileWatcher(pattern);
        
        if (!this.watchers.has(pattern)) {
            this.watchers.set(pattern, []);
        }
        this.watchers.get(pattern)!.push(watcher);
        
        return watcher;
    }

    /**
     * Notify watchers of file system changes
     */
    private notifyWatchers(filePath: string, event: 'create' | 'change' | 'delete'): void {
        this.watchers.forEach((watchers, pattern) => {
            if (this.matchesPattern(filePath, pattern)) {
                for (const watcher of watchers) {
                    watcher.emit(event, filePath);
                }
            }
        });
    }

    /**
     * Check if path matches pattern
     */
    private matchesPattern(filePath: string, pattern: string): boolean {
        // Simple pattern matching - can be enhanced
        if (pattern === '**/*') {
            return true;
        }
        
        return filePath.includes(pattern.replace('*', ''));
    }

    /**
     * Normalize file path
     */
    private normalizePath(filePath: string): string {
        return path.posix.normalize(filePath.replace(/\\/g, '/'));
    }

    /**
     * Get all files (for debugging)
     */
    getAllFiles(): MockFileEntry[] {
        const allFiles: MockFileEntry[] = [];
        this.files.forEach((entry) => {
            allFiles.push(entry);
        });
        return allFiles;
    }
}

/**
 * Mock file entry
 */
export interface MockFileEntry {
    type: 'file' | 'directory';
    path: string;
    name: string;
    content: string;
    size: number;
    created: Date;
    modified: Date;
    permissions: {
        readable: boolean;
        writable: boolean;
        executable: boolean;
        hidden: boolean;
    };
}

/**
 * Mock file watcher
 */
export class MockFileWatcher {
    private listeners: Map<string, Array<(path: string) => void>> = new Map();
    private disposed = false;

    constructor(public readonly pattern: string) {}

    /**
     * Add event listener
     */
    on(event: 'create' | 'change' | 'delete', listener: (path: string) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(listener);
    }

    /**
     * Emit event
     */
    emit(event: 'create' | 'change' | 'delete', path: string): void {
        if (this.disposed) {
            return;
        }
        
        const listeners = this.listeners.get(event);
        if (listeners) {
            for (const listener of listeners) {
                listener(path);
            }
        }
    }

    /**
     * Dispose watcher
     */
    dispose(): void {
        this.disposed = true;
        this.listeners.clear();
    }
}

/**
 * Global mock filesystem instance
 */
export const mockFileSystem = new MockFileSystem();

/**
 * Create mock fs functions that work with the mock filesystem
 */
export function createMockFs() {
    return {
        promises: {
            access: async (path: string, mode?: number) => {
                const entry = mockFileSystem.getEntry(path);
                if (!entry) {
                    throw new Error(`ENOENT: no such file or directory, access '${path}'`);
                }
                
                // Check permissions based on mode
                if (mode !== undefined) {
                    if (mode & 4 && !entry.permissions.readable) {
                        throw new Error(`EACCES: permission denied, access '${path}'`);
                    }
                    if (mode & 2 && !entry.permissions.writable) {
                        throw new Error(`EACCES: permission denied, access '${path}'`);
                    }
                    if (mode & 1 && !entry.permissions.executable) {
                        throw new Error(`EACCES: permission denied, access '${path}'`);
                    }
                }
            },
            
            stat: async (path: string) => {
                const entry = mockFileSystem.getEntry(path);
                if (!entry) {
                    throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
                }
                
                return {
                    isFile: () => entry.type === 'file',
                    isDirectory: () => entry.type === 'directory',
                    size: entry.size,
                    mtime: entry.modified,
                    ctime: entry.created,
                    birthtime: entry.created
                };
            },
            
            readdir: async (path: string) => {
                const entry = mockFileSystem.getEntry(path);
                if (!entry) {
                    throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
                }
                if (entry.type !== 'directory') {
                    throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
                }
                
                const children = mockFileSystem.getChildren(path);
                return children.map(child => child.name);
            },
            
            readFile: async (path: string) => {
                const content = mockFileSystem.readFile(path);
                if (content === undefined) {
                    throw new Error(`ENOENT: no such file or directory, open '${path}'`);
                }
                return content;
            },
            
            writeFile: async (path: string, content: string) => {
                if (!mockFileSystem.writeFile(path, content)) {
                    // If file doesn't exist, create it
                    mockFileSystem.createFile(path, content);
                }
            },
            
            mkdir: async (path: string) => {
                if (mockFileSystem.exists(path)) {
                    throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
                }
                mockFileSystem.createDirectory(path);
            },
            
            unlink: async (path: string) => {
                if (!mockFileSystem.delete(path)) {
                    throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
                }
            },
            
            rmdir: async (path: string) => {
                const entry = mockFileSystem.getEntry(path);
                if (!entry) {
                    throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
                }
                if (entry.type !== 'directory') {
                    throw new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
                }
                
                const children = mockFileSystem.getChildren(path);
                if (children.length > 0) {
                    throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
                }
                
                mockFileSystem.delete(path);
            },
            
            rename: async (oldPath: string, newPath: string) => {
                if (!mockFileSystem.move(oldPath, newPath)) {
                    throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
                }
            },
            
            copyFile: async (src: string, dest: string) => {
                if (!mockFileSystem.copy(src, dest)) {
                    throw new Error(`ENOENT: no such file or directory, copyfile '${src}' -> '${dest}'`);
                }
            }
        },
        
        constants: {
            F_OK: 0,
            R_OK: 4,
            W_OK: 2,
            X_OK: 1
        }
    };
}