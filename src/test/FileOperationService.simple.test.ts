import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PathValidator } from '../utils/PathValidator';
import { PermissionChecker } from '../utils/PermissionChecker';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';

suite('File Operation Core Logic Tests', () => {
    let testDir: string;
    let testFile: string;
    let testSubDir: string;

    setup(async () => {
        // Create temporary test directory
        testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'file-operation-test-'));
        testFile = path.join(testDir, 'test.txt');
        testSubDir = path.join(testDir, 'subdir');
        
        // Create test files and directories
        await fs.promises.writeFile(testFile, 'test content');
        await fs.promises.mkdir(testSubDir);
    });

    teardown(async () => {
        // Clean up test directory
        try {
            await fs.promises.rmdir(testDir, { recursive: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    suite('PathValidator', () => {
        test('should validate correct file names', () => {
            const result = PathValidator.validateFileName('valid-file.txt');
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.errorMessage, undefined);
        });

        test('should reject empty file names', () => {
            const result = PathValidator.validateFileName('');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage);
        });

        test('should reject file names with invalid characters', () => {
            const result = PathValidator.validateFileName('invalid<file>.txt');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage);
        });

        test('should reject file names that are too long', () => {
            const longName = 'a'.repeat(300) + '.txt';
            const result = PathValidator.validateFileName(longName);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage);
        });

        test('should sanitize file names correctly', () => {
            const sanitized = PathValidator.sanitizeFileName('invalid<file>name.txt');
            assert.strictEqual(sanitized, 'invalid_file_name.txt');
            
            const emptySanitized = PathValidator.sanitizeFileName('');
            assert.strictEqual(emptySanitized, 'untitled');
        });

        test('should validate paths correctly', () => {
            const workspaceRoot = '/workspace';
            
            assert.strictEqual(
                PathValidator.isValidPath('/workspace/subfolder', workspaceRoot), 
                true
            );
            
            assert.strictEqual(
                PathValidator.isValidPath('/outside/folder', workspaceRoot), 
                false
            );
        });

        test('should handle path utilities correctly', () => {
            const testPath = '/test/folder/file.txt';
            
            assert.strictEqual(PathValidator.getExtension(testPath), '.txt');
            assert.strictEqual(PathValidator.getNameWithoutExtension(testPath), 'file');
            assert.strictEqual(PathValidator.getBaseName(testPath), 'file.txt');
            assert.strictEqual(PathValidator.getDirectoryName(testPath), '/test/folder');
        });

        test('should check if path exists', async () => {
            const exists = await PathValidator.pathExists(testFile);
            assert.strictEqual(exists, true);
            
            const notExists = await PathValidator.pathExists(path.join(testDir, 'non-existent.txt'));
            assert.strictEqual(notExists, false);
        });

        test('should check if path is directory', async () => {
            const isDir = await PathValidator.isDirectory(testSubDir);
            assert.strictEqual(isDir, true);
            
            const isNotDir = await PathValidator.isDirectory(testFile);
            assert.strictEqual(isNotDir, false);
        });

        test('should generate unique file names', async () => {
            const uniqueName = await PathValidator.generateUniqueFileName(testFile, 'test.txt');
            assert.notStrictEqual(uniqueName, 'test.txt');
            assert.ok(uniqueName.includes('test'));
            assert.ok(uniqueName.includes('.txt'));
        });
    });

    suite('PermissionChecker', () => {
        test('should check if file can be read', async () => {
            const canRead = await PermissionChecker.canRead(testFile);
            assert.strictEqual(canRead, true);
        });

        test('should check if file exists', async () => {
            const exists = await PermissionChecker.exists(testFile);
            assert.strictEqual(exists, true);
            
            const notExists = await PermissionChecker.exists(path.join(testDir, 'non-existent.txt'));
            assert.strictEqual(notExists, false);
        });

        test('should get file permissions', async () => {
            const permissions = await PermissionChecker.getFilePermissions(testFile);
            assert.ok(typeof permissions.readonly === 'boolean');
            assert.ok(typeof permissions.executable === 'boolean');
            assert.ok(typeof permissions.hidden === 'boolean');
        });

        test('should check operation permissions', async () => {
            const readPermission = await PermissionChecker.checkOperationPermission(testFile, 'read');
            assert.strictEqual(readPermission.allowed, true);
            
            const nonExistentPermission = await PermissionChecker.checkOperationPermission(
                path.join(testDir, 'non-existent.txt'), 
                'read'
            );
            assert.strictEqual(nonExistentPermission.allowed, false);
            assert.ok(nonExistentPermission.reason);
        });

        test('should get permission description', async () => {
            const description = await PermissionChecker.getPermissionDescription(testFile);
            assert.ok(typeof description === 'string');
            assert.ok(description.length > 0);
        });

        test('should check if directory can be traversed', async () => {
            const canTraverse = await PermissionChecker.canTraverse(testSubDir);
            assert.strictEqual(canTraverse, true);
            
            const cannotTraverse = await PermissionChecker.canTraverse(testFile);
            assert.strictEqual(cannotTraverse, false);
        });
    });

    suite('FileOperationError', () => {
        test('should create error correctly', () => {
            const error = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/file.txt',
                'File not found'
            );
            
            assert.strictEqual(error.type, FileOperationErrorType.FileNotFound);
            assert.strictEqual(error.filePath, '/test/file.txt');
            assert.strictEqual(error.message, 'File not found');
            assert.ok(error.timestamp instanceof Date);
        });

        test('should provide user-friendly messages', () => {
            const error = new FileOperationError(
                FileOperationErrorType.PermissionDenied,
                '/test/file.txt',
                'Permission denied'
            );
            
            const friendlyMessage = error.getUserFriendlyMessage();
            assert.ok(friendlyMessage.includes('アクセス権限'));
        });

        test('should provide recovery suggestions', () => {
            const error = new FileOperationError(
                FileOperationErrorType.InvalidFileName,
                '/test/invalid<file>.txt',
                'Invalid file name'
            );
            
            const suggestions = error.getRecoverySuggestions();
            assert.ok(Array.isArray(suggestions));
            assert.ok(suggestions.length > 0);
        });

        test('should determine if error is recoverable', () => {
            const recoverableError = new FileOperationError(
                FileOperationErrorType.NetworkError,
                '/test/file.txt',
                'Network error'
            );
            assert.strictEqual(recoverableError.isRecoverable(), true);
            
            const nonRecoverableError = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/file.txt',
                'File not found'
            );
            assert.strictEqual(nonRecoverableError.isRecoverable(), false);
        });

        test('should create from generic error', () => {
            const genericError = new Error('ENOENT: no such file or directory');
            const fileOpError = FileOperationError.fromError(genericError, '/test/file.txt');
            
            assert.strictEqual(fileOpError.type, FileOperationErrorType.FileNotFound);
            assert.strictEqual(fileOpError.originalError, genericError);
        });

        test('should convert to JSON for logging', () => {
            const error = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/file.txt',
                'File not found'
            );
            
            const json = error.toJSON() as any;
            assert.ok(typeof json === 'object');
            assert.strictEqual(json.type, FileOperationErrorType.FileNotFound);
            assert.strictEqual(json.filePath, '/test/file.txt');
            assert.strictEqual(json.message, 'File not found');
        });
    });

    suite('Core File Operations', () => {
        test('should copy file using fs operations', async () => {
            const destFile = path.join(testDir, 'copied-file.txt');
            
            await fs.promises.copyFile(testFile, destFile);
            
            const exists = await fs.promises.access(destFile).then(() => true).catch(() => false);
            assert.strictEqual(exists, true);
            
            const originalContent = await fs.promises.readFile(testFile, 'utf8');
            const copiedContent = await fs.promises.readFile(destFile, 'utf8');
            assert.strictEqual(originalContent, copiedContent);
        });

        test('should move file using fs operations', async () => {
            const tempFile = path.join(testDir, 'temp-file.txt');
            await fs.promises.writeFile(tempFile, 'temp content');
            
            const movedFile = path.join(testDir, 'moved-file.txt');
            
            await fs.promises.rename(tempFile, movedFile);
            
            const originalExists = await fs.promises.access(tempFile).then(() => true).catch(() => false);
            const movedExists = await fs.promises.access(movedFile).then(() => true).catch(() => false);
            
            assert.strictEqual(originalExists, false);
            assert.strictEqual(movedExists, true);
        });

        test('should delete file using fs operations', async () => {
            const tempFile = path.join(testDir, 'temp-file.txt');
            await fs.promises.writeFile(tempFile, 'temp content');
            
            await fs.promises.unlink(tempFile);
            
            const exists = await fs.promises.access(tempFile).then(() => true).catch(() => false);
            assert.strictEqual(exists, false);
        });

        test('should create directory using fs operations', async () => {
            const newDir = path.join(testDir, 'new-directory');
            
            await fs.promises.mkdir(newDir);
            
            const stats = await fs.promises.stat(newDir);
            assert.strictEqual(stats.isDirectory(), true);
        });

        test('should delete directory using fs operations', async () => {
            const tempDir = path.join(testDir, 'temp-directory');
            await fs.promises.mkdir(tempDir);
            
            await fs.promises.rmdir(tempDir);
            
            const exists = await fs.promises.access(tempDir).then(() => true).catch(() => false);
            assert.strictEqual(exists, false);
        });

        test('should get file stats using fs operations', async () => {
            const stats = await fs.promises.stat(testFile);
            
            assert.ok(stats.size >= 0);
            assert.ok(stats.mtime instanceof Date);
            assert.ok(stats.birthtime instanceof Date);
            assert.strictEqual(stats.isDirectory(), false);
        });
    });
});