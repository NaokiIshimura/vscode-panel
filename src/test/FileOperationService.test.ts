import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileOperationService } from '../services/FileOperationService';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';

suite('FileOperationService', () => {
    let service: FileOperationService;
    let testDir: string;
    let testFile: string;
    let testSubDir: string;

    setup(async () => {
        service = new FileOperationService();

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

        service.dispose();
    });

    suite('validateFileName', () => {
        test('should validate correct file names', () => {
            const result = service.validateFileName('valid-file.txt');
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.errorMessage, undefined);
        });

        test('should reject empty file names', () => {
            const result = service.validateFileName('');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage);
        });

        test('should reject file names with invalid characters', () => {
            const result = service.validateFileName('invalid<file>.txt');
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage);
        });

        test('should reject file names that are too long', () => {
            const longName = 'a'.repeat(300) + '.txt';
            const result = service.validateFileName(longName);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage);
        });

        test('should reject reserved names on Windows', () => {
            // Mock Windows platform
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'win32' });

            try {
                const result = service.validateFileName('CON.txt');
                assert.strictEqual(result.isValid, false);
                assert.ok(result.errorMessage);
            } finally {
                Object.defineProperty(process, 'platform', { value: originalPlatform });
            }
        });
    });

    suite('getFileStats', () => {
        test('should return file statistics for existing file', async () => {
            const stats = await service.getFileStats(testFile);

            assert.ok(stats.size >= 0);
            assert.ok(stats.modified instanceof Date);
            assert.ok(stats.created instanceof Date);
            assert.strictEqual(stats.isDirectory, false);
            assert.ok(stats.permissions);
        });

        test('should return directory statistics for existing directory', async () => {
            const stats = await service.getFileStats(testSubDir);

            assert.strictEqual(stats.isDirectory, true);
            assert.ok(stats.permissions);
        });

        test('should throw error for non-existent file', async () => {
            const nonExistentFile = path.join(testDir, 'non-existent.txt');

            try {
                await service.getFileStats(nonExistentFile);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
            }
        });
    });

    suite('createFile', () => {
        test('should create a new file with content', async () => {
            const newFile = path.join(testDir, 'new-file.txt');
            const content = 'new file content';

            await service.createFile(newFile, content);

            const exists = await fs.promises.access(newFile).then(() => true).catch(() => false);
            assert.strictEqual(exists, true);

            const fileContent = await fs.promises.readFile(newFile, 'utf8');
            assert.strictEqual(fileContent, content);
        });

        test('should create a new file without content', async () => {
            const newFile = path.join(testDir, 'empty-file.txt');

            await service.createFile(newFile);

            const exists = await fs.promises.access(newFile).then(() => true).catch(() => false);
            assert.strictEqual(exists, true);

            const fileContent = await fs.promises.readFile(newFile, 'utf8');
            assert.strictEqual(fileContent, '');
        });

        test('should throw error when file already exists', async () => {
            try {
                await service.createFile(testFile, 'content');
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileAlreadyExists);
            }
        });

        test('should throw error for invalid file name', async () => {
            const invalidFile = path.join(testDir, 'invalid<name>.txt');

            try {
                await service.createFile(invalidFile, 'content');
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.InvalidFileName);
            }
        });

        test('should throw error when parent directory does not exist', async () => {
            const fileInNonExistentDir = path.join(testDir, 'non-existent', 'file.txt');

            try {
                await service.createFile(fileInNonExistentDir, 'content');
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
            }
        });
    });

    suite('createDirectory', () => {
        test('should create a new directory', async () => {
            const newDir = path.join(testDir, 'new-directory');

            await service.createDirectory(newDir);

            const stats = await fs.promises.stat(newDir);
            assert.strictEqual(stats.isDirectory(), true);
        });

        test('should throw error when directory already exists', async () => {
            try {
                await service.createDirectory(testSubDir);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileAlreadyExists);
            }
        });

        test('should throw error for invalid directory name', async () => {
            const invalidDir = path.join(testDir, 'invalid<name>');

            try {
                await service.createDirectory(invalidDir);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.InvalidFileName);
            }
        });

        test('should throw error when parent directory does not exist', async () => {
            const dirInNonExistentParent = path.join(testDir, 'non-existent', 'new-dir');

            try {
                await service.createDirectory(dirInNonExistentParent);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
            }
        });
    });

    suite('renameFile', () => {
        test('should rename a file successfully', async () => {
            const newPath = path.join(testDir, 'renamed-file.txt');

            await service.renameFile(testFile, newPath);

            const oldExists = await fs.promises.access(testFile).then(() => true).catch(() => false);
            const newExists = await fs.promises.access(newPath).then(() => true).catch(() => false);

            assert.strictEqual(oldExists, false);
            assert.strictEqual(newExists, true);
        });

        test('should rename a directory successfully', async () => {
            const newPath = path.join(testDir, 'renamed-subdir');

            await service.renameFile(testSubDir, newPath);

            const oldExists = await fs.promises.access(testSubDir).then(() => true).catch(() => false);
            const newExists = await fs.promises.access(newPath).then(() => true).catch(() => false);

            assert.strictEqual(oldExists, false);
            assert.strictEqual(newExists, true);
        });

        test('should throw error when source does not exist', async () => {
            const nonExistentFile = path.join(testDir, 'non-existent.txt');
            const newPath = path.join(testDir, 'new-name.txt');

            try {
                await service.renameFile(nonExistentFile, newPath);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
            }
        });

        test('should throw error when target already exists', async () => {
            const anotherFile = path.join(testDir, 'another-file.txt');
            await fs.promises.writeFile(anotherFile, 'content');

            try {
                await service.renameFile(testFile, anotherFile);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileAlreadyExists);
            }
        });

        test('should throw error for invalid new file name', async () => {
            const invalidNewPath = path.join(testDir, 'invalid<name>.txt');

            try {
                await service.renameFile(testFile, invalidNewPath);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.InvalidFileName);
            }
        });
    });

    suite('deleteFiles', () => {
        test('should delete a single file', async () => {
            await service.deleteFiles([testFile]);

            const exists = await fs.promises.access(testFile).then(() => true).catch(() => false);
            assert.strictEqual(exists, false);
        });

        test('should delete multiple files', async () => {
            const file2 = path.join(testDir, 'file2.txt');
            await fs.promises.writeFile(file2, 'content2');

            await service.deleteFiles([testFile, file2]);

            const file1Exists = await fs.promises.access(testFile).then(() => true).catch(() => false);
            const file2Exists = await fs.promises.access(file2).then(() => true).catch(() => false);

            assert.strictEqual(file1Exists, false);
            assert.strictEqual(file2Exists, false);
        });

        test('should delete a directory', async () => {
            await service.deleteFiles([testSubDir]);

            const exists = await fs.promises.access(testSubDir).then(() => true).catch(() => false);
            assert.strictEqual(exists, false);
        });

        test('should throw error when file does not exist', async () => {
            const nonExistentFile = path.join(testDir, 'non-existent.txt');

            try {
                await service.deleteFiles([nonExistentFile]);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
            }
        });
    });

    suite('copyFiles', () => {
        test('should copy a single file', async () => {
            const destDir = path.join(testDir, 'dest');
            await fs.promises.mkdir(destDir);

            await service.copyFiles([testFile], destDir);

            const copiedFile = path.join(destDir, 'test.txt');
            const exists = await fs.promises.access(copiedFile).then(() => true).catch(() => false);
            assert.strictEqual(exists, true);

            const originalContent = await fs.promises.readFile(testFile, 'utf8');
            const copiedContent = await fs.promises.readFile(copiedFile, 'utf8');
            assert.strictEqual(originalContent, copiedContent);
        });

        test('should copy multiple files', async () => {
            const file2 = path.join(testDir, 'file2.txt');
            await fs.promises.writeFile(file2, 'content2');

            const destDir = path.join(testDir, 'dest');
            await fs.promises.mkdir(destDir);

            await service.copyFiles([testFile, file2], destDir);

            const copiedFile1 = path.join(destDir, 'test.txt');
            const copiedFile2 = path.join(destDir, 'file2.txt');

            const file1Exists = await fs.promises.access(copiedFile1).then(() => true).catch(() => false);
            const file2Exists = await fs.promises.access(copiedFile2).then(() => true).catch(() => false);

            assert.strictEqual(file1Exists, true);
            assert.strictEqual(file2Exists, true);
        });

        test('should copy a directory recursively', async () => {
            const fileInSubDir = path.join(testSubDir, 'nested-file.txt');
            await fs.promises.writeFile(fileInSubDir, 'nested content');

            const destDir = path.join(testDir, 'dest');
            await fs.promises.mkdir(destDir);

            await service.copyFiles([testSubDir], destDir);

            const copiedDir = path.join(destDir, 'subdir');
            const copiedNestedFile = path.join(copiedDir, 'nested-file.txt');

            const dirExists = await fs.promises.access(copiedDir).then(() => true).catch(() => false);
            const fileExists = await fs.promises.access(copiedNestedFile).then(() => true).catch(() => false);

            assert.strictEqual(dirExists, true);
            assert.strictEqual(fileExists, true);

            const originalContent = await fs.promises.readFile(fileInSubDir, 'utf8');
            const copiedContent = await fs.promises.readFile(copiedNestedFile, 'utf8');
            assert.strictEqual(originalContent, copiedContent);
        });

        test('should throw error when destination does not exist', async () => {
            const nonExistentDest = path.join(testDir, 'non-existent-dest');

            try {
                await service.copyFiles([testFile], nonExistentDest);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
            }
        });

        test('should throw error when destination is not a directory', async () => {
            try {
                await service.copyFiles([testSubDir], testFile);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.InvalidFileName);
            }
        });

        test('should throw error when source does not exist', async () => {
            const nonExistentFile = path.join(testDir, 'non-existent.txt');
            const destDir = path.join(testDir, 'dest');
            await fs.promises.mkdir(destDir);

            try {
                await service.copyFiles([nonExistentFile], destDir);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
            }
        });
    });

    suite('moveFiles', () => {
        test('should move a single file', async () => {
            const destDir = path.join(testDir, 'dest');
            await fs.promises.mkdir(destDir);

            await service.moveFiles([testFile], destDir);

            const movedFile = path.join(destDir, 'test.txt');
            const originalExists = await fs.promises.access(testFile).then(() => true).catch(() => false);
            const movedExists = await fs.promises.access(movedFile).then(() => true).catch(() => false);

            assert.strictEqual(originalExists, false);
            assert.strictEqual(movedExists, true);
        });

        test('should move multiple files', async () => {
            const file2 = path.join(testDir, 'file2.txt');
            await fs.promises.writeFile(file2, 'content2');

            const destDir = path.join(testDir, 'dest');
            await fs.promises.mkdir(destDir);

            await service.moveFiles([testFile, file2], destDir);

            const movedFile1 = path.join(destDir, 'test.txt');
            const movedFile2 = path.join(destDir, 'file2.txt');

            const original1Exists = await fs.promises.access(testFile).then(() => true).catch(() => false);
            const original2Exists = await fs.promises.access(file2).then(() => true).catch(() => false);
            const moved1Exists = await fs.promises.access(movedFile1).then(() => true).catch(() => false);
            const moved2Exists = await fs.promises.access(movedFile2).then(() => true).catch(() => false);

            assert.strictEqual(original1Exists, false);
            assert.strictEqual(original2Exists, false);
            assert.strictEqual(moved1Exists, true);
            assert.strictEqual(moved2Exists, true);
        });

        test('should move a directory', async () => {
            const destDir = path.join(testDir, 'dest');
            await fs.promises.mkdir(destDir);

            await service.moveFiles([testSubDir], destDir);

            const movedDir = path.join(destDir, 'subdir');
            const originalExists = await fs.promises.access(testSubDir).then(() => true).catch(() => false);
            const movedExists = await fs.promises.access(movedDir).then(() => true).catch(() => false);

            assert.strictEqual(originalExists, false);
            assert.strictEqual(movedExists, true);
        });

        test('should throw error when destination does not exist', async () => {
            const nonExistentDest = path.join(testDir, 'non-existent-dest');

            try {
                await service.moveFiles([testFile], nonExistentDest);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
            }
        });

        test('should throw error when source does not exist', async () => {
            const nonExistentFile = path.join(testDir, 'non-existent.txt');
            const destDir = path.join(testDir, 'dest');
            await fs.promises.mkdir(destDir);

            try {
                await service.moveFiles([nonExistentFile], destDir);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
            }
        });
    });
});