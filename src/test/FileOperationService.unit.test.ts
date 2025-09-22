import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileOperationService } from '../services/FileOperationService';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';

// Mock VSCode module for testing
const mockVSCode = {
    window: {
        createOutputChannel: () => ({
            appendLine: () => {},
            dispose: () => {}
        })
    }
};

// Replace vscode import in the module
(global as any).vscode = mockVSCode;

suite('FileOperationService Unit Tests', () => {
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
    });
});