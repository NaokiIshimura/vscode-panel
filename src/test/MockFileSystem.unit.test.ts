import * as assert from 'assert';
import { MockFileSystem, MockFileEntry } from './mocks/filesystem';

suite('MockFileSystem Unit Tests', () => {
    let mockFs: MockFileSystem;

    setup(() => {
        mockFs = new MockFileSystem();
    });

    teardown(() => {
        mockFs.reset();
    });

    suite('File Creation and Management', () => {
        test('should create files with content', () => {
            mockFs.createFile('/test/file.txt', 'Hello World');
            
            const entry = mockFs.getEntry('/test/file.txt');
            assert.strictEqual(entry?.type, 'file');
            assert.strictEqual(entry?.content, 'Hello World');
            assert.strictEqual(entry?.size, 11);
        });

        test('should create directories', () => {
            mockFs.createDirectory('/test/newdir');
            
            const entry = mockFs.getEntry('/test/newdir');
            assert.strictEqual(entry?.type, 'directory');
            assert.strictEqual(entry?.size, 0);
        });

        test('should create parent directories automatically', () => {
            mockFs.createFile('/deep/nested/path/file.txt', 'content');
            
            assert.strictEqual(mockFs.exists('/deep'), true);
            assert.strictEqual(mockFs.exists('/deep/nested'), true);
            assert.strictEqual(mockFs.exists('/deep/nested/path'), true);
            assert.strictEqual(mockFs.exists('/deep/nested/path/file.txt'), true);
        });

        test('should check file existence', () => {
            mockFs.createFile('/test/exists.txt', 'content');
            
            assert.strictEqual(mockFs.exists('/test/exists.txt'), true);
            assert.strictEqual(mockFs.exists('/test/nonexistent.txt'), false);
        });
    });

    suite('File Operations', () => {
        test('should read file content', () => {
            mockFs.createFile('/test/read.txt', 'File content');
            
            const content = mockFs.readFile('/test/read.txt');
            assert.strictEqual(content, 'File content');
        });

        test('should return undefined for non-existent file', () => {
            const content = mockFs.readFile('/nonexistent.txt');
            assert.strictEqual(content, undefined);
        });

        test('should write file content', () => {
            mockFs.createFile('/test/write.txt', 'original');
            
            const success = mockFs.writeFile('/test/write.txt', 'updated');
            assert.strictEqual(success, true);
            
            const content = mockFs.readFile('/test/write.txt');
            assert.strictEqual(content, 'updated');
        });

        test('should update file size when writing', () => {
            mockFs.createFile('/test/size.txt', 'short');
            
            mockFs.writeFile('/test/size.txt', 'much longer content');
            
            const entry = mockFs.getEntry('/test/size.txt');
            assert.strictEqual(entry?.size, 19);
        });
    });

    suite('Directory Operations', () => {
        test('should get directory children', () => {
            mockFs.createDirectory('/parent');
            mockFs.createFile('/parent/file1.txt', 'content1');
            mockFs.createFile('/parent/file2.txt', 'content2');
            mockFs.createDirectory('/parent/subdir');
            
            const children = mockFs.getChildren('/parent');
            assert.strictEqual(children.length, 3);
            
            const names = children.map(c => c.name).sort();
            assert.deepStrictEqual(names, ['file1.txt', 'file2.txt', 'subdir']);
        });

        test('should sort children with directories first', () => {
            mockFs.createDirectory('/parent');
            mockFs.createFile('/parent/zebra.txt', 'content');
            mockFs.createDirectory('/parent/alpha');
            mockFs.createFile('/parent/beta.txt', 'content');
            
            const children = mockFs.getChildren('/parent');
            assert.strictEqual(children[0].type, 'directory');
            assert.strictEqual(children[0].name, 'alpha');
        });
    });

    suite('File System Modifications', () => {
        test('should delete files', () => {
            mockFs.createFile('/test/delete.txt', 'content');
            
            const success = mockFs.delete('/test/delete.txt');
            assert.strictEqual(success, true);
            assert.strictEqual(mockFs.exists('/test/delete.txt'), false);
        });

        test('should delete directories and their contents', () => {
            mockFs.createDirectory('/test/deletedir');
            mockFs.createFile('/test/deletedir/file.txt', 'content');
            mockFs.createDirectory('/test/deletedir/subdir');
            
            const success = mockFs.delete('/test/deletedir');
            assert.strictEqual(success, true);
            assert.strictEqual(mockFs.exists('/test/deletedir'), false);
            assert.strictEqual(mockFs.exists('/test/deletedir/file.txt'), false);
        });

        test('should return false when deleting non-existent file', () => {
            const success = mockFs.delete('/nonexistent.txt');
            assert.strictEqual(success, false);
        });

        test('should move files', () => {
            mockFs.createFile('/test/source.txt', 'content');
            
            const success = mockFs.move('/test/source.txt', '/test/destination.txt');
            assert.strictEqual(success, true);
            assert.strictEqual(mockFs.exists('/test/source.txt'), false);
            assert.strictEqual(mockFs.exists('/test/destination.txt'), true);
            
            const content = mockFs.readFile('/test/destination.txt');
            assert.strictEqual(content, 'content');
        });

        test('should move directories and update child paths', () => {
            mockFs.createDirectory('/test/sourcedir');
            mockFs.createFile('/test/sourcedir/file.txt', 'content');
            
            const success = mockFs.move('/test/sourcedir', '/test/destdir');
            assert.strictEqual(success, true);
            assert.strictEqual(mockFs.exists('/test/sourcedir'), false);
            assert.strictEqual(mockFs.exists('/test/destdir'), true);
            assert.strictEqual(mockFs.exists('/test/destdir/file.txt'), true);
        });

        test('should copy files', () => {
            mockFs.createFile('/test/source.txt', 'content');
            
            const success = mockFs.copy('/test/source.txt', '/test/copy.txt');
            assert.strictEqual(success, true);
            assert.strictEqual(mockFs.exists('/test/source.txt'), true);
            assert.strictEqual(mockFs.exists('/test/copy.txt'), true);
            
            const originalContent = mockFs.readFile('/test/source.txt');
            const copiedContent = mockFs.readFile('/test/copy.txt');
            assert.strictEqual(originalContent, copiedContent);
        });

        test('should copy directories recursively', () => {
            mockFs.createDirectory('/test/sourcedir');
            mockFs.createFile('/test/sourcedir/file.txt', 'content');
            mockFs.createDirectory('/test/sourcedir/subdir');
            mockFs.createFile('/test/sourcedir/subdir/nested.txt', 'nested');
            
            const success = mockFs.copy('/test/sourcedir', '/test/copydir');
            assert.strictEqual(success, true);
            assert.strictEqual(mockFs.exists('/test/sourcedir'), true);
            assert.strictEqual(mockFs.exists('/test/copydir'), true);
            assert.strictEqual(mockFs.exists('/test/copydir/file.txt'), true);
            assert.strictEqual(mockFs.exists('/test/copydir/subdir/nested.txt'), true);
        });
    });

    suite('File Permissions', () => {
        test('should create files with default permissions', () => {
            mockFs.createFile('/test/perms.txt', 'content');
            
            const entry = mockFs.getEntry('/test/perms.txt');
            assert.strictEqual(entry?.permissions.readable, true);
            assert.strictEqual(entry?.permissions.writable, true);
            assert.strictEqual(entry?.permissions.executable, false);
        });

        test('should create directories with executable permission', () => {
            mockFs.createDirectory('/test/dir');
            
            const entry = mockFs.getEntry('/test/dir');
            assert.strictEqual(entry?.permissions.executable, true);
        });

        test('should detect hidden files', () => {
            mockFs.createFile('/test/.hidden', 'content');
            
            const entry = mockFs.getEntry('/test/.hidden');
            assert.strictEqual(entry?.permissions.hidden, true);
        });

        test('should allow custom permissions', () => {
            mockFs.createFile('/test/readonly.txt', 'content', {
                permissions: {
                    readable: true,
                    writable: false,
                    executable: false,
                    hidden: false
                }
            });
            
            const entry = mockFs.getEntry('/test/readonly.txt');
            assert.strictEqual(entry?.permissions.writable, false);
        });
    });

    suite('File Watchers', () => {
        test('should create file watchers', () => {
            const watcher = mockFs.createWatcher('**/*');
            
            assert.strictEqual(typeof watcher.on, 'function');
            assert.strictEqual(typeof watcher.dispose, 'function');
        });

        test('should notify watchers on file creation', () => {
            let notified = false;
            let notifiedPath = '';
            
            const watcher = mockFs.createWatcher('**/*');
            watcher.on('create', (path) => {
                notified = true;
                notifiedPath = path;
            });
            
            mockFs.createFile('/test/watched.txt', 'content');
            
            assert.strictEqual(notified, true);
            assert.strictEqual(notifiedPath, '/test/watched.txt');
        });

        test('should notify watchers on file changes', () => {
            mockFs.createFile('/test/change.txt', 'original');
            
            let notified = false;
            const watcher = mockFs.createWatcher('**/*');
            watcher.on('change', () => {
                notified = true;
            });
            
            mockFs.writeFile('/test/change.txt', 'updated');
            
            assert.strictEqual(notified, true);
        });

        test('should notify watchers on file deletion', () => {
            mockFs.createFile('/test/delete.txt', 'content');
            
            let notified = false;
            const watcher = mockFs.createWatcher('**/*');
            watcher.on('delete', () => {
                notified = true;
            });
            
            mockFs.delete('/test/delete.txt');
            
            assert.strictEqual(notified, true);
        });
    });

    suite('Path Normalization', () => {
        test('should normalize Windows-style paths', () => {
            mockFs.createFile('\\test\\windows\\path.txt', 'content');
            
            assert.strictEqual(mockFs.exists('/test/windows/path.txt'), true);
        });

        test('should handle relative path segments', () => {
            mockFs.createFile('/test/../normalized/./file.txt', 'content');
            
            assert.strictEqual(mockFs.exists('/normalized/file.txt'), true);
        });
    });

    suite('Default Workspace Structure', () => {
        test('should have default workspace files', () => {
            assert.strictEqual(mockFs.exists('/workspace'), true);
            assert.strictEqual(mockFs.exists('/workspace/src'), true);
            assert.strictEqual(mockFs.exists('/workspace/package.json'), true);
            assert.strictEqual(mockFs.exists('/workspace/README.md'), true);
        });

        test('should have hidden files in default structure', () => {
            assert.strictEqual(mockFs.exists('/workspace/.gitignore'), true);
            assert.strictEqual(mockFs.exists('/workspace/.hidden'), true);
            
            const gitignoreEntry = mockFs.getEntry('/workspace/.gitignore');
            const hiddenEntry = mockFs.getEntry('/workspace/.hidden');
            
            assert.strictEqual(gitignoreEntry?.permissions.hidden, true);
            assert.strictEqual(hiddenEntry?.permissions.hidden, true);
        });
    });

    suite('Error Conditions', () => {
        test('should handle operations on non-existent paths', () => {
            const success = mockFs.move('/nonexistent.txt', '/destination.txt');
            assert.strictEqual(success, false);
        });

        test('should prevent overwriting existing files in move/copy', () => {
            mockFs.createFile('/test/source.txt', 'source');
            mockFs.createFile('/test/dest.txt', 'dest');
            
            const moveSuccess = mockFs.move('/test/source.txt', '/test/dest.txt');
            const copySuccess = mockFs.copy('/test/source.txt', '/test/dest.txt');
            
            assert.strictEqual(moveSuccess, false);
            assert.strictEqual(copySuccess, false);
        });
    });

    suite('Utility Methods', () => {
        test('should get all files for debugging', () => {
            const allFiles = mockFs.getAllFiles();
            
            assert.strictEqual(Array.isArray(allFiles), true);
            assert.strictEqual(allFiles.length > 0, true);
            
            // Should include default workspace files
            const packageJson = allFiles.find(f => f.name === 'package.json');
            assert.strictEqual(packageJson !== undefined, true);
        });
    });
});