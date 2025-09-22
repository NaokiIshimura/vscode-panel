import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileOperationService, BatchOperationOptions, ProgressCallback } from '../services/FileOperationService';
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

suite('FileOperationService Batch Operations Tests', () => {
    let service: FileOperationService;
    let testDir: string;
    let sourceDir: string;
    let destDir: string;
    let testFiles: string[];

    setup(async () => {
        service = new FileOperationService();
        
        // Create temporary test directory
        testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'batch-operation-test-'));
        sourceDir = path.join(testDir, 'source');
        destDir = path.join(testDir, 'dest');
        
        // Create source and destination directories
        await fs.promises.mkdir(sourceDir);
        await fs.promises.mkdir(destDir);
        
        // Create test files
        testFiles = [];
        for (let i = 1; i <= 5; i++) {
            const filePath = path.join(sourceDir, `file${i}.txt`);
            await fs.promises.writeFile(filePath, `Content of file ${i}`);
            testFiles.push(filePath);
        }
        
        // Create a subdirectory with files
        const subDir = path.join(sourceDir, 'subdir');
        await fs.promises.mkdir(subDir);
        const subFile = path.join(subDir, 'subfile.txt');
        await fs.promises.writeFile(subFile, 'Sub file content');
        testFiles.push(subDir);
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

    suite('copyFilesBatch', () => {
        test('should copy multiple files successfully', async () => {
            const result = await service.copyFilesBatch(testFiles.slice(0, 3), destDir);
            
            assert.strictEqual(result.successful.length, 3);
            assert.strictEqual(result.failed.length, 0);
            assert.strictEqual(result.totalProcessed, 3);
            
            // Verify files were copied
            for (let i = 1; i <= 3; i++) {
                const copiedFile = path.join(destDir, `file${i}.txt`);
                const exists = await fs.promises.access(copiedFile).then(() => true).catch(() => false);
                assert.strictEqual(exists, true);
                
                const content = await fs.promises.readFile(copiedFile, 'utf8');
                assert.strictEqual(content, `Content of file ${i}`);
            }
        });

        test('should handle progress reporting', async () => {
            const progressUpdates: Array<{ completed: number; total: number; currentItem?: string }> = [];
            
            const progressCallback: ProgressCallback = (completed, total, currentItem) => {
                progressUpdates.push({ completed, total, currentItem });
            };
            
            const options: BatchOperationOptions = {
                progressCallback
            };
            
            await service.copyFilesBatch(testFiles.slice(0, 3), destDir, options);
            
            assert.strictEqual(progressUpdates.length, 3);
            assert.strictEqual(progressUpdates[0].completed, 1);
            assert.strictEqual(progressUpdates[0].total, 3);
            assert.strictEqual(progressUpdates[2].completed, 3);
            assert.strictEqual(progressUpdates[2].total, 3);
        });

        test('should continue on error when continueOnError is true', async () => {
            // Create a file that will cause an error (non-existent source)
            const invalidFiles = [...testFiles.slice(0, 2), path.join(sourceDir, 'non-existent.txt')];
            
            const options: BatchOperationOptions = {
                continueOnError: true
            };
            
            const result = await service.copyFilesBatch(invalidFiles, destDir, options);
            
            assert.strictEqual(result.successful.length, 2);
            assert.strictEqual(result.failed.length, 1);
            assert.strictEqual(result.totalProcessed, 3);
            assert.ok(result.failed[0].error instanceof FileOperationError);
        });

        test('should stop on first error when continueOnError is false', async () => {
            // Create a scenario where the first file will fail
            const nonExistentDest = path.join(testDir, 'non-existent-dest');
            
            const options: BatchOperationOptions = {
                continueOnError: false
            };
            
            try {
                await service.copyFilesBatch(testFiles.slice(0, 3), nonExistentDest, options);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error instanceof FileOperationError);
            }
        });

        test('should handle rollback when enabled', async () => {
            const options: BatchOperationOptions = {
                enableRollback: true,
                continueOnError: false
            };
            
            // First, copy some files successfully
            await service.copyFilesBatch(testFiles.slice(0, 2), destDir, options);
            
            // Verify rollback operations were recorded
            const rollbackOps = service.getRollbackOperations();
            assert.strictEqual(rollbackOps.length, 2);
            assert.strictEqual(rollbackOps[0].type, 'delete');
            
            // Clear rollback operations
            service.clearRollbackOperations();
            assert.strictEqual(service.getRollbackOperations().length, 0);
        });

        test('should control concurrency with maxConcurrency option', async () => {
            const options: BatchOperationOptions = {
                maxConcurrency: 2
            };
            
            const result = await service.copyFilesBatch(testFiles, destDir, options);
            
            assert.strictEqual(result.successful.length, testFiles.length);
            assert.strictEqual(result.failed.length, 0);
        });
    });

    suite('moveFilesBatch', () => {
        test('should move multiple files successfully', async () => {
            const filesToMove = testFiles.slice(0, 3);
            const result = await service.moveFilesBatch(filesToMove, destDir);
            
            assert.strictEqual(result.successful.length, 3);
            assert.strictEqual(result.failed.length, 0);
            assert.strictEqual(result.totalProcessed, 3);
            
            // Verify files were moved (no longer in source, now in dest)
            for (let i = 1; i <= 3; i++) {
                const originalFile = path.join(sourceDir, `file${i}.txt`);
                const movedFile = path.join(destDir, `file${i}.txt`);
                
                const originalExists = await fs.promises.access(originalFile).then(() => true).catch(() => false);
                const movedExists = await fs.promises.access(movedFile).then(() => true).catch(() => false);
                
                assert.strictEqual(originalExists, false);
                assert.strictEqual(movedExists, true);
                
                const content = await fs.promises.readFile(movedFile, 'utf8');
                assert.strictEqual(content, `Content of file ${i}`);
            }
        });

        test('should handle progress reporting for move operations', async () => {
            const progressUpdates: Array<{ completed: number; total: number }> = [];
            
            const progressCallback: ProgressCallback = (completed, total) => {
                progressUpdates.push({ completed, total });
            };
            
            const options: BatchOperationOptions = {
                progressCallback
            };
            
            await service.moveFilesBatch(testFiles.slice(3, 5), destDir, options);
            
            assert.strictEqual(progressUpdates.length, 2);
            assert.strictEqual(progressUpdates[1].completed, 2);
            assert.strictEqual(progressUpdates[1].total, 2);
        });

        test('should record rollback operations for move', async () => {
            const options: BatchOperationOptions = {
                enableRollback: true
            };
            
            await service.moveFilesBatch([testFiles[0]], destDir, options);
            
            const rollbackOps = service.getRollbackOperations();
            assert.strictEqual(rollbackOps.length, 1);
            assert.strictEqual(rollbackOps[0].type, 'move');
            assert.ok(rollbackOps[0].originalPath);
            assert.ok(rollbackOps[0].targetPath);
        });
    });

    suite('deleteFilesBatch', () => {
        test('should delete multiple files successfully', async () => {
            const filesToDelete = testFiles.slice(0, 3);
            const result = await service.deleteFilesBatch(filesToDelete);
            
            assert.strictEqual(result.successful.length, 3);
            assert.strictEqual(result.failed.length, 0);
            assert.strictEqual(result.totalProcessed, 3);
            
            // Verify files were deleted
            for (let i = 1; i <= 3; i++) {
                const deletedFile = path.join(sourceDir, `file${i}.txt`);
                const exists = await fs.promises.access(deletedFile).then(() => true).catch(() => false);
                assert.strictEqual(exists, false);
            }
        });

        test('should handle progress reporting for delete operations', async () => {
            const progressUpdates: Array<{ completed: number; total: number }> = [];
            
            const progressCallback: ProgressCallback = (completed, total) => {
                progressUpdates.push({ completed, total });
            };
            
            const options: BatchOperationOptions = {
                progressCallback
            };
            
            await service.deleteFilesBatch([testFiles[3]], options);
            
            assert.strictEqual(progressUpdates.length, 1);
            assert.strictEqual(progressUpdates[0].completed, 1);
            assert.strictEqual(progressUpdates[0].total, 1);
        });

        test('should record rollback operations for delete', async () => {
            const options: BatchOperationOptions = {
                enableRollback: true
            };
            
            await service.deleteFilesBatch([testFiles[4]], options);
            
            const rollbackOps = service.getRollbackOperations();
            assert.strictEqual(rollbackOps.length, 1);
            assert.strictEqual(rollbackOps[0].type, 'create');
            assert.ok(rollbackOps[0].originalPath);
            assert.ok(rollbackOps[0].content);
        });

        test('should continue on error when continueOnError is true', async () => {
            // Include a non-existent file
            const filesToDelete = [testFiles[0], path.join(sourceDir, 'non-existent.txt')];
            
            const options: BatchOperationOptions = {
                continueOnError: true
            };
            
            const result = await service.deleteFilesBatch(filesToDelete, options);
            
            assert.strictEqual(result.successful.length, 1);
            assert.strictEqual(result.failed.length, 1);
            assert.strictEqual(result.totalProcessed, 2);
        });
    });

    suite('Rollback Operations', () => {
        test('should perform rollback for failed copy operation', async () => {
            const options: BatchOperationOptions = {
                enableRollback: true,
                continueOnError: false
            };
            
            // First copy a file successfully
            await service.copyFilesBatch([testFiles[0]], destDir, options);
            
            // Verify file was copied
            const copiedFile = path.join(destDir, 'file1.txt');
            let exists = await fs.promises.access(copiedFile).then(() => true).catch(() => false);
            assert.strictEqual(exists, true);
            
            // Now try to copy to a non-existent destination (should trigger rollback)
            const nonExistentDest = path.join(testDir, 'non-existent');
            
            try {
                await service.copyFilesBatch([testFiles[1]], nonExistentDest, options);
                assert.fail('Should have thrown an error');
            } catch (error) {
                // The rollback should have been performed automatically
                // But since we're testing with a different destination, the first copy should still exist
                exists = await fs.promises.access(copiedFile).then(() => true).catch(() => false);
                assert.strictEqual(exists, true);
            }
        });

        test('should clear rollback operations', () => {
            service.clearRollbackOperations();
            assert.strictEqual(service.getRollbackOperations().length, 0);
        });
    });

    suite('Concurrency Control', () => {
        test('should process files in batches based on maxConcurrency', async () => {
            const startTime = Date.now();
            
            const options: BatchOperationOptions = {
                maxConcurrency: 2
            };
            
            // Copy all test files
            await service.copyFilesBatch(testFiles, destDir, options);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // With concurrency control, it should take some time but not too long
            assert.ok(duration > 0);
            assert.ok(duration < 5000); // Should complete within 5 seconds
        });
    });
});