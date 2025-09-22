import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ErrorHandler } from '../services/ErrorHandler';
import { OperationHistoryManager } from '../services/OperationHistoryManager';
import { AutoRetryService } from '../services/AutoRetryService';
import { FileOperationService } from '../services/FileOperationService';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';

suite('Error Recovery Integration Tests', () => {
    let errorHandler: ErrorHandler;
    let historyManager: OperationHistoryManager;
    let retryService: AutoRetryService;
    let fileOperationService: FileOperationService;
    let testWorkspaceRoot: string;

    suiteSetup(async () => {
        // Setup test workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            testWorkspaceRoot = path.join(workspaceFolder.uri.fsPath, 'test-error-recovery');
            if (!fs.existsSync(testWorkspaceRoot)) {
                fs.mkdirSync(testWorkspaceRoot, { recursive: true });
            }
        }
    });

    setup(() => {
        // Mock configurations
        const mockErrorConfig = {
            get: (key: string, defaultValue?: any) => defaultValue
        };

        const mockHistoryConfig = {
            get: (key: string, defaultValue?: any) => {
                switch (key) {
                    case 'maxHistorySize': return 50;
                    case 'enableBackups': return true;
                    case 'backupDirectory': return path.join(testWorkspaceRoot, 'backups');
                    case 'autoCleanupAge': return 24 * 60 * 60 * 1000;
                    default: return defaultValue;
                }
            }
        };

        const mockRetryConfig = {
            get: (key: string, defaultValue?: any) => {
                switch (key) {
                    case 'maxAttempts': return 3;
                    case 'baseDelay': return 100;
                    case 'maxDelay': return 1000;
                    case 'backoffMultiplier': return 2;
                    case 'jitterEnabled': return false;
                    default: return defaultValue;
                }
            }
        };

        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = (section?: string) => {
            switch (section) {
                case 'fileListExtension.operationHistory':
                    return mockHistoryConfig as any;
                case 'fileListExtension.autoRetry':
                    return mockRetryConfig as any;
                default:
                    return mockErrorConfig as any;
            }
        };

        errorHandler = ErrorHandler.getInstance();
        historyManager = OperationHistoryManager.getInstance();
        retryService = AutoRetryService.getInstance();
        fileOperationService = new FileOperationService();

        // Clear existing state
        errorHandler.clearErrorLog();
        historyManager.clearHistory();
        retryService.cancelAllRetries();

        // Restore original function
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    teardown(() => {
        // Cleanup
        errorHandler.clearErrorLog();
        historyManager.clearHistory();
        retryService.cancelAllRetries();

        // Cleanup test files
        if (testWorkspaceRoot && fs.existsSync(testWorkspaceRoot)) {
            try {
                fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
                fs.mkdirSync(testWorkspaceRoot, { recursive: true });
            } catch {
                // Ignore cleanup errors
            }
        }
    });

    suiteTeardown(() => {
        if (testWorkspaceRoot && fs.existsSync(testWorkspaceRoot)) {
            fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
        }
    });

    suite('Complete Error Recovery Workflow', () => {
        test('should handle file operation with retry and history tracking', async () => {
            const sourceFile = path.join(testWorkspaceRoot, 'source.txt');
            const targetDir = path.join(testWorkspaceRoot, 'target');
            
            // Create source file and target directory
            fs.writeFileSync(sourceFile, 'test content');
            fs.mkdirSync(targetDir, { recursive: true });

            // Record operation in history
            const operationId = await historyManager.recordCopyOperation([sourceFile], targetDir);

            try {
                // Simulate operation with potential retry
                const result = await retryService.executeWithRetry('CopyWithRecovery', async () => {
                    // Simulate temporary failure on first attempt
                    const attempts = historyManager.getOperation(operationId)?.attempts || [];
                    if (attempts.length === 0) {
                        throw new FileOperationError(
                            FileOperationErrorType.NetworkError,
                            sourceFile,
                            'Temporary network error'
                        );
                    }
                    
                    // Succeed on retry
                    await fileOperationService.copyFiles([sourceFile], targetDir);
                    return 'Copy completed';
                });

                // Mark operation as completed
                historyManager.updateOperationStatus(operationId, 'completed' as any);
                historyManager.markFilesCreated(operationId, [path.join(targetDir, 'source.txt')]);

                assert.strictEqual(result, 'Copy completed');
                assert.strictEqual(fs.existsSync(path.join(targetDir, 'source.txt')), true);

                // Verify operation can be undone
                const undoableOps = historyManager.getUndoableOperations();
                assert.strictEqual(undoableOps.length, 1);
                assert.strictEqual(undoableOps[0].id, operationId);

            } catch (error) {
                // Handle error through error handler
                if (error instanceof FileOperationError) {
                    await errorHandler.handleFileOperationError(error);
                    historyManager.updateOperationStatus(operationId, 'failed' as any, error);
                }
                throw error;
            }
        });

        test('should recover from failed operation using undo', async () => {
            const testFile = path.join(testWorkspaceRoot, 'recovery-test.txt');
            const testContent = 'This will be recovered';
            
            // Create file
            fs.writeFileSync(testFile, testContent);

            // Record create operation
            const operationId = await historyManager.recordCreateOperation(testFile, testContent);
            historyManager.updateOperationStatus(operationId, 'completed' as any);

            // Verify file exists
            assert.strictEqual(fs.existsSync(testFile), true);

            // Undo the operation (recovery)
            const undoSuccess = await historyManager.undoOperation(operationId);

            assert.strictEqual(undoSuccess, true);
            assert.strictEqual(fs.existsSync(testFile), false);

            // Verify operation is marked as undone
            const operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.status, 'undone' as any);
        });

        test('should handle cascading failures with comprehensive recovery', async () => {
            const files = [
                path.join(testWorkspaceRoot, 'cascade1.txt'),
                path.join(testWorkspaceRoot, 'cascade2.txt'),
                path.join(testWorkspaceRoot, 'cascade3.txt')
            ];

            // Create files
            files.forEach((file, index) => {
                fs.writeFileSync(file, `Content ${index + 1}`);
            });

            const operationIds: string[] = [];

            // Record multiple operations
            for (const file of files) {
                const opId = await historyManager.recordCreateOperation(file);
                historyManager.updateOperationStatus(opId, 'completed' as any);
                operationIds.push(opId);
            }

            // Simulate a failure that requires rolling back all operations
            try {
                await retryService.executeWithRetry('CascadingOperation', async () => {
                    throw new FileOperationError(
                        FileOperationErrorType.DiskSpaceInsufficient,
                        testWorkspaceRoot,
                        'Insufficient disk space for operation'
                    );
                });
            } catch (error) {
                // Handle the error
                if (error instanceof FileOperationError) {
                    await errorHandler.handleFileOperationError(error);

                    // Recovery: Undo all operations in reverse order
                    for (let i = operationIds.length - 1; i >= 0; i--) {
                        const undoSuccess = await historyManager.undoOperation(operationIds[i]);
                        assert.strictEqual(undoSuccess, true);
                    }

                    // Verify all files are removed
                    files.forEach(file => {
                        assert.strictEqual(fs.existsSync(file), false);
                    });
                }
            }
        });
    });

    suite('Retry with History Integration', () => {
        test('should track retry attempts in operation history', async () => {
            const testFile = path.join(testWorkspaceRoot, 'retry-history.txt');
            
            const operationId = await historyManager.recordCreateOperation(testFile);
            let attemptCount = 0;

            try {
                await retryService.executeWithRetry('RetryHistoryTest', async () => {
                    attemptCount++;
                    
                    if (attemptCount < 3) {
                        // Simulate temporary failure
                        throw new FileOperationError(
                            FileOperationErrorType.NetworkError,
                            testFile,
                            `Attempt ${attemptCount} failed`
                        );
                    }
                    
                    // Success on third attempt
                    fs.writeFileSync(testFile, 'Success after retries');
                    return 'Success';
                });

                historyManager.updateOperationStatus(operationId, 'completed' as any);
                
                assert.strictEqual(attemptCount, 3);
                assert.strictEqual(fs.existsSync(testFile), true);

            } catch (error) {
                historyManager.updateOperationStatus(operationId, 'failed' as any, error as FileOperationError);
                throw error;
            }
        });

        test('should handle retry exhaustion with proper error logging', async () => {
            const testFile = path.join(testWorkspaceRoot, 'retry-exhaustion.txt');
            
            const operationId = await historyManager.recordCreateOperation(testFile);

            try {
                await retryService.executeWithRetry('RetryExhaustionTest', async () => {
                    throw new FileOperationError(
                        FileOperationErrorType.NetworkError,
                        testFile,
                        'Persistent network error'
                    );
                }, { maxAttempts: 2 });

                assert.fail('Should have thrown an error');
            } catch (error) {
                // Verify error was handled properly
                assert.strictEqual(error instanceof FileOperationError, true);
                
                await errorHandler.handleFileOperationError(error as FileOperationError);
                historyManager.updateOperationStatus(operationId, 'failed' as any, error as FileOperationError);

                // Verify error statistics
                const errorStats = errorHandler.getErrorStatistics();
                assert.strictEqual(errorStats.total >= 1, true);

                // Verify operation cannot be undone
                const operation = historyManager.getOperation(operationId);
                assert.strictEqual(operation?.canUndo, false);
            }
        });
    });

    suite('Complex Recovery Scenarios', () => {
        test('should handle partial operation failure with selective recovery', async () => {
            const sourceFiles = [
                path.join(testWorkspaceRoot, 'partial1.txt'),
                path.join(testWorkspaceRoot, 'partial2.txt'),
                path.join(testWorkspaceRoot, 'partial3.txt')
            ];
            const targetDir = path.join(testWorkspaceRoot, 'partial-target');

            // Create source files
            sourceFiles.forEach((file, index) => {
                fs.writeFileSync(file, `Partial content ${index + 1}`);
            });
            fs.mkdirSync(targetDir, { recursive: true });

            const operationId = await historyManager.recordCopyOperation(sourceFiles, targetDir);
            const successfulCopies: string[] = [];

            try {
                // Simulate partial success
                for (let i = 0; i < sourceFiles.length; i++) {
                    const sourceFile = sourceFiles[i];
                    const targetFile = path.join(targetDir, path.basename(sourceFile));

                    if (i === 2) {
                        // Fail on third file
                        throw new FileOperationError(
                            FileOperationErrorType.DiskSpaceInsufficient,
                            sourceFile,
                            'Disk full during copy'
                        );
                    }

                    // Copy successful files
                    fs.copyFileSync(sourceFile, targetFile);
                    successfulCopies.push(targetFile);
                }

                historyManager.updateOperationStatus(operationId, 'completed' as any);
                historyManager.markFilesCreated(operationId, successfulCopies);

            } catch (error) {
                // Handle partial failure
                if (error instanceof FileOperationError) {
                    await errorHandler.handleFileOperationError(error);
                    historyManager.updateOperationStatus(operationId, 'failed' as any, error);

                    // Recovery: Clean up partially copied files
                    for (const copiedFile of successfulCopies) {
                        if (fs.existsSync(copiedFile)) {
                            fs.unlinkSync(copiedFile);
                        }
                    }

                    // Verify cleanup
                    successfulCopies.forEach(file => {
                        assert.strictEqual(fs.existsSync(file), false);
                    });
                }
            }
        });

        test('should handle concurrent operations with recovery coordination', async () => {
            const concurrentFiles = [
                path.join(testWorkspaceRoot, 'concurrent1.txt'),
                path.join(testWorkspaceRoot, 'concurrent2.txt')
            ];

            // Create files
            concurrentFiles.forEach((file, index) => {
                fs.writeFileSync(file, `Concurrent content ${index + 1}`);
            });

            const operationIds: string[] = [];

            // Start concurrent operations
            const operations = concurrentFiles.map(async (file, index) => {
                const opId = await historyManager.recordCreateOperation(file);
                operationIds.push(opId);

                return retryService.executeWithRetry(`ConcurrentOp${index}`, async () => {
                    if (index === 1) {
                        // Simulate failure in second operation
                        throw new FileOperationError(
                            FileOperationErrorType.PermissionDenied,
                            file,
                            'Permission denied'
                        );
                    }
                    
                    historyManager.updateOperationStatus(opId, 'completed' as any);
                    return `Operation ${index} completed`;
                });
            });

            // Handle concurrent execution
            const results = await Promise.allSettled(operations);

            // Verify mixed results
            assert.strictEqual(results[0].status, 'fulfilled');
            assert.strictEqual(results[1].status, 'rejected');

            // Recovery: Undo successful operations if any failed
            const hasFailures = results.some(result => result.status === 'rejected');
            if (hasFailures) {
                for (const opId of operationIds) {
                    const operation = historyManager.getOperation(opId);
                    if (operation?.status === 'completed') {
                        await historyManager.undoOperation(opId);
                    }
                }
            }
        });
    });

    suite('Error Recovery Performance', () => {
        test('should handle high-volume operations with efficient recovery', async () => {
            const fileCount = 20;
            const files: string[] = [];
            const operationIds: string[] = [];

            // Create many files
            for (let i = 0; i < fileCount; i++) {
                const file = path.join(testWorkspaceRoot, `volume-test-${i}.txt`);
                fs.writeFileSync(file, `Volume content ${i}`);
                files.push(file);

                const opId = await historyManager.recordCreateOperation(file);
                historyManager.updateOperationStatus(opId, 'completed' as any);
                operationIds.push(opId);
            }

            const startTime = Date.now();

            // Simulate bulk recovery operation
            for (const opId of operationIds) {
                await historyManager.undoOperation(opId);
            }

            const duration = Date.now() - startTime;

            // Verify performance (should complete within reasonable time)
            assert.strictEqual(duration < 5000, true); // Less than 5 seconds

            // Verify all files were removed
            files.forEach(file => {
                assert.strictEqual(fs.existsSync(file), false);
            });

            // Verify all operations are marked as undone
            operationIds.forEach(opId => {
                const operation = historyManager.getOperation(opId);
                assert.strictEqual(operation?.status, 'undone' as any);
            });
        });
    });

    suite('Recovery State Consistency', () => {
        test('should maintain consistent state across error recovery operations', async () => {
            const testFile = path.join(testWorkspaceRoot, 'consistency-test.txt');
            const originalContent = 'Original content';
            const modifiedContent = 'Modified content';

            // Initial state
            fs.writeFileSync(testFile, originalContent);
            
            // Record initial creation
            const createOpId = await historyManager.recordCreateOperation(testFile, originalContent);
            historyManager.updateOperationStatus(createOpId, 'completed' as any);

            // Modify file (simulate edit operation)
            fs.writeFileSync(testFile, modifiedContent);
            
            // Record modification (as delete + create for simplicity)
            const deleteOpId = await historyManager.recordDeleteOperation([testFile]);
            const newCreateOpId = await historyManager.recordCreateOperation(testFile, modifiedContent);
            
            historyManager.updateOperationStatus(deleteOpId, 'completed' as any);
            historyManager.updateOperationStatus(newCreateOpId, 'completed' as any);

            // Verify current state
            assert.strictEqual(fs.existsSync(testFile), true);
            assert.strictEqual(fs.readFileSync(testFile, 'utf8'), modifiedContent);

            // Recovery: Undo modifications in reverse order
            await historyManager.undoOperation(newCreateOpId);
            assert.strictEqual(fs.existsSync(testFile), false);

            await historyManager.undoOperation(deleteOpId);
            assert.strictEqual(fs.existsSync(testFile), true);
            
            // Should be back to original content
            const recoveredContent = fs.readFileSync(testFile, 'utf8');
            assert.strictEqual(recoveredContent, originalContent);

            // Verify operation history consistency
            const history = historyManager.getOperationHistory();
            const undoneOps = history.filter(op => op.status === 'undone' as any);
            assert.strictEqual(undoneOps.length, 2);
        });
    });
});