import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import { PermissionChecker } from '../utils/PermissionChecker';

suite('PermissionChecker Unit Tests', () => {
    let fsAccessStub: sinon.SinonStub;
    let fsStatStub: sinon.SinonStub;
    let fsReaddirStub: sinon.SinonStub;
    let fsOpenStub: sinon.SinonStub;

    const mockPath = '/test/file.txt';

    setup(() => {
        fsAccessStub = sinon.stub(fs.promises, 'access');
        fsStatStub = sinon.stub(fs.promises, 'stat');
        fsReaddirStub = sinon.stub(fs.promises, 'readdir');
        fsOpenStub = sinon.stub(fs.promises, 'open');
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Basic Permission Checks', () => {
        test('should return true when file is readable', async () => {
            fsAccessStub.resolves();
            
            const result = await PermissionChecker.canRead(mockPath);
            
            assert.strictEqual(result, true);
            assert.strictEqual(fsAccessStub.calledWith(mockPath, fs.constants.R_OK), true);
        });

        test('should return false when file is not readable', async () => {
            fsAccessStub.rejects(new Error('Permission denied'));
            
            const result = await PermissionChecker.canRead(mockPath);
            
            assert.strictEqual(result, false);
        });

        test('should return true when file is writable', async () => {
            fsAccessStub.resolves();
            
            const result = await PermissionChecker.canWrite(mockPath);
            
            assert.strictEqual(result, true);
            assert.strictEqual(fsAccessStub.calledWith(mockPath, fs.constants.W_OK), true);
        });

        test('should return false when file is not writable', async () => {
            fsAccessStub.rejects(new Error('Permission denied'));
            
            const result = await PermissionChecker.canWrite(mockPath);
            
            assert.strictEqual(result, false);
        });

        test('should return true when file is executable', async () => {
            fsAccessStub.resolves();
            
            const result = await PermissionChecker.canExecute(mockPath);
            
            assert.strictEqual(result, true);
            assert.strictEqual(fsAccessStub.calledWith(mockPath, fs.constants.X_OK), true);
        });

        test('should return false when file is not executable', async () => {
            fsAccessStub.rejects(new Error('Permission denied'));
            
            const result = await PermissionChecker.canExecute(mockPath);
            
            assert.strictEqual(result, false);
        });

        test('should return true when file exists', async () => {
            fsAccessStub.resolves();
            
            const result = await PermissionChecker.exists(mockPath);
            
            assert.strictEqual(result, true);
            assert.strictEqual(fsAccessStub.calledWith(mockPath, fs.constants.F_OK), true);
        });

        test('should return false when file does not exist', async () => {
            fsAccessStub.rejects(new Error('File not found'));
            
            const result = await PermissionChecker.exists(mockPath);
            
            assert.strictEqual(result, false);
        });
    });

    suite('File Permissions Object', () => {
        test('should return correct permissions for readable and writable file', async () => {
            const mockStats = {
                isDirectory: () => false,
                isFile: () => true
            } as fs.Stats;
            
            fsStatStub.resolves(mockStats);
            fsAccessStub.withArgs(mockPath, fs.constants.R_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.W_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.X_OK).rejects(new Error('Not executable'));
            
            const permissions = await PermissionChecker.getFilePermissions(mockPath);
            
            assert.strictEqual(permissions.readonly, false);
            assert.strictEqual(permissions.executable, false);
            assert.strictEqual(permissions.hidden, false);
        });

        test('should return correct permissions for read-only file', async () => {
            const mockStats = {
                isDirectory: () => false,
                isFile: () => true
            } as fs.Stats;
            
            fsStatStub.resolves(mockStats);
            fsAccessStub.withArgs(mockPath, fs.constants.R_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.W_OK).rejects(new Error('Not writable'));
            fsAccessStub.withArgs(mockPath, fs.constants.X_OK).rejects(new Error('Not executable'));
            
            const permissions = await PermissionChecker.getFilePermissions(mockPath);
            
            assert.strictEqual(permissions.readonly, true);
            assert.strictEqual(permissions.executable, false);
        });

        test('should detect hidden files (dot files)', async () => {
            const hiddenPath = '/test/.hidden';
            const mockStats = {
                isDirectory: () => false,
                isFile: () => true
            } as fs.Stats;
            
            fsStatStub.resolves(mockStats);
            fsAccessStub.resolves();
            
            const permissions = await PermissionChecker.getFilePermissions(hiddenPath);
            
            assert.strictEqual(permissions.hidden, true);
        });

        test('should return default permissions on error', async () => {
            fsStatStub.rejects(new Error('File not found'));
            
            const permissions = await PermissionChecker.getFilePermissions(mockPath);
            
            assert.strictEqual(permissions.readonly, false);
            assert.strictEqual(permissions.executable, false);
            assert.strictEqual(permissions.hidden, false);
        });
    });

    suite('Operation Permission Checks', () => {
        test('should allow read operation for readable file', async () => {
            fsAccessStub.withArgs(mockPath, fs.constants.F_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.R_OK).resolves();
            
            const result = await PermissionChecker.checkOperationPermission(mockPath, 'read');
            
            assert.strictEqual(result.allowed, true);
            assert.strictEqual(result.reason, undefined);
        });

        test('should deny read operation for non-existent file', async () => {
            fsAccessStub.withArgs(mockPath, fs.constants.F_OK).rejects(new Error('Not found'));
            
            const result = await PermissionChecker.checkOperationPermission(mockPath, 'read');
            
            assert.strictEqual(result.allowed, false);
            assert.strictEqual(typeof result.reason, 'string');
        });

        test('should allow write operation for writable file', async () => {
            fsAccessStub.withArgs(mockPath, fs.constants.F_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.W_OK).resolves();
            
            const result = await PermissionChecker.checkOperationPermission(mockPath, 'write');
            
            assert.strictEqual(result.allowed, true);
        });

        test('should check parent directory for new file write', async () => {
            const newFilePath = '/test/newfile.txt';
            const parentDir = '/test';
            
            fsAccessStub.withArgs(newFilePath, fs.constants.F_OK).rejects(new Error('Not found'));
            fsAccessStub.withArgs(parentDir, fs.constants.W_OK).resolves();
            
            const result = await PermissionChecker.checkOperationPermission(newFilePath, 'write');
            
            assert.strictEqual(result.allowed, true);
        });

        test('should allow execute operation for executable file', async () => {
            fsAccessStub.withArgs(mockPath, fs.constants.F_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.X_OK).resolves();
            
            const result = await PermissionChecker.checkOperationPermission(mockPath, 'execute');
            
            assert.strictEqual(result.allowed, true);
        });

        test('should check parent directory for delete operation', async () => {
            const parentDir = '/test';
            
            fsAccessStub.withArgs(mockPath, fs.constants.F_OK).resolves();
            fsAccessStub.withArgs(parentDir, fs.constants.W_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.W_OK).resolves();
            
            const result = await PermissionChecker.checkOperationPermission(mockPath, 'delete');
            
            assert.strictEqual(result.allowed, true);
        });
    });

    suite('Directory Operations', () => {
        test('should return true for traversable directory', async () => {
            const dirPath = '/test/dir';
            const mockStats = {
                isDirectory: () => true
            } as fs.Stats;
            
            fsStatStub.resolves(mockStats);
            fsReaddirStub.resolves(['file1.txt', 'file2.txt']);
            
            const result = await PermissionChecker.canTraverse(dirPath);
            
            assert.strictEqual(result, true);
        });

        test('should return false for non-directory', async () => {
            const mockStats = {
                isDirectory: () => false
            } as fs.Stats;
            
            fsStatStub.resolves(mockStats);
            
            const result = await PermissionChecker.canTraverse(mockPath);
            
            assert.strictEqual(result, false);
        });

        test('should return false for non-traversable directory', async () => {
            const dirPath = '/test/dir';
            const mockStats = {
                isDirectory: () => true
            } as fs.Stats;
            
            fsStatStub.resolves(mockStats);
            fsReaddirStub.rejects(new Error('Permission denied'));
            
            const result = await PermissionChecker.canTraverse(dirPath);
            
            assert.strictEqual(result, false);
        });
    });

    suite('File Locking', () => {
        test('should return false for unlocked file', async () => {
            const mockFd = { close: sinon.stub().resolves() };
            fsOpenStub.resolves(mockFd);
            
            const result = await PermissionChecker.isFileLocked(mockPath);
            
            assert.strictEqual(result, false);
            assert.strictEqual(mockFd.close.called, true);
        });

        test('should return true for locked file (EBUSY)', async () => {
            const error = new Error('Resource busy') as any;
            error.code = 'EBUSY';
            fsOpenStub.rejects(error);
            
            const result = await PermissionChecker.isFileLocked(mockPath);
            
            assert.strictEqual(result, true);
        });

        test('should return true for locked file (EACCES)', async () => {
            const error = new Error('Access denied') as any;
            error.code = 'EACCES';
            fsOpenStub.rejects(error);
            
            const result = await PermissionChecker.isFileLocked(mockPath);
            
            assert.strictEqual(result, true);
        });

        test('should return false for other errors', async () => {
            const error = new Error('File not found') as any;
            error.code = 'ENOENT';
            fsOpenStub.rejects(error);
            
            const result = await PermissionChecker.isFileLocked(mockPath);
            
            assert.strictEqual(result, false);
        });
    });

    suite('Permission Description', () => {
        test('should return readable description for normal file', async () => {
            const mockStats = {
                isDirectory: () => false,
                isFile: () => true
            } as fs.Stats;
            
            fsStatStub.resolves(mockStats);
            fsAccessStub.withArgs(mockPath, fs.constants.R_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.W_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.X_OK).rejects(new Error('Not executable'));
            
            const description = await PermissionChecker.getPermissionDescription(mockPath);
            
            assert.strictEqual(typeof description, 'string');
            assert.strictEqual(description.includes('読み書き可能'), true);
        });

        test('should return readable description for read-only file', async () => {
            const mockStats = {
                isDirectory: () => false,
                isFile: () => true
            } as fs.Stats;
            
            fsStatStub.resolves(mockStats);
            fsAccessStub.withArgs(mockPath, fs.constants.R_OK).resolves();
            fsAccessStub.withArgs(mockPath, fs.constants.W_OK).rejects(new Error('Not writable'));
            fsAccessStub.withArgs(mockPath, fs.constants.X_OK).rejects(new Error('Not executable'));
            
            const description = await PermissionChecker.getPermissionDescription(mockPath);
            
            assert.strictEqual(description.includes('読み取り専用'), true);
        });

        test('should return error message on failure', async () => {
            fsStatStub.rejects(new Error('Access denied'));
            
            const description = await PermissionChecker.getPermissionDescription(mockPath);
            
            assert.strictEqual(description, '権限不明');
        });
    });

    suite('File System Info', () => {
        test('should return file system information', async () => {
            const mockStats = {
                isDirectory: () => false,
                isFile: () => true
            } as fs.Stats;
            
            fsStatStub.resolves(mockStats);
            
            const info = await PermissionChecker.getFileSystemInfo(mockPath);
            
            assert.strictEqual(typeof info.type, 'string');
            assert.strictEqual(info.type !== 'unknown', true);
        });

        test('should return unknown type on error', async () => {
            fsStatStub.rejects(new Error('Access denied'));
            
            const info = await PermissionChecker.getFileSystemInfo(mockPath);
            
            assert.strictEqual(info.type, 'unknown');
        });
    });
});