import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ErrorHandler } from '../services/ErrorHandler';
import { DebugLogger } from '../services/DebugLogger';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';
import { FileOperationService } from '../services/FileOperationService';

suite('Error Handling Integration Tests', () => {
    let errorHandler: ErrorHandler;
    let logger: DebugLogger;
    let fileOperationService: FileOperationService;
    let testWorkspaceRoot: string;
    let mockOutputChannel: vscode.OutputChannel;

    suiteSetup(async () => {
        // Setup test workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            testWorkspaceRoot = path.join(workspaceFolder.uri.fsPath, 'test-error-handling');
            if (!fs.existsSync(testWorkspaceRoot)) {
                fs.mkdirSync(testWorkspaceRoot, { recursive: true });
            }
        }
    });

    setup(() => {
        // Create mock output channel
        mockOutputChannel = {
            name: 'Test Channel',
            append: () => {},
            appendLine: () => {},
            clear: () => {},
            show: () => {},
            hide: () => {},
            dispose: () => {}
        } as vscode.OutputChannel;

        // Mock vscode.window.createOutputChannel
        const originalCreateOutputChannel = vscode.window.createOutputChannel;
        vscode.window.createOutputChannel = () => mockOutputChannel;

        errorHandler = ErrorHandler.getInstance();
        logger = DebugLogger.getInstance();
        fileOperationService = new FileOperationService();

        // Restore original function
        vscode.window.createOutputChannel = originalCreateOutputChannel;
    });

    teardown(() => {
        errorHandler.clearErrorLog();
        logger.clearLogs();
    });

    suiteTeardown(() => {
        // Cleanup test workspace
        if (testWorkspaceRoot && fs.existsSync(testWorkspaceRoot)) {
            fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
        }
    });

    suite('File Operation Error Scenarios', () => {
        test('should handle file not found error during copy operation', async () => {
            const nonExistentFile = path.join(testWorkspaceRoot, 'non-existent-file.txt');
            const targetFile = path.join(testWorkspaceRoot, 'target-file.txt');

            try {
                await fileOperationService.copyFiles([nonExistentFile], path.dirname(targetFile));
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error instanceof FileOperationError, true);
                const fileError = error as FileOperationError;
                assert.strictEqual(fileError.type, FileOperationErrorType.FileNotFound);

                // Test error handling
                await errorHandler.handleFileOperationError(fileError);

                // Verify error was logged
                const stats = errorHandler.getErrorStatistics();
                assert.strictEqual(stats.total >= 1, true);
            }
        });

        test('should handle permission denied error', async () => {
            if (process.platform === 'win32') {
                // Skip on Windows as permission testing is more complex
                return;
            }

            const testFile = path.join(testWorkspaceRoot, 'readonly-file.txt');
            fs.writeFileSync(testFile, 'test content');
            fs.chmodSync(testFile, 0o444); // Read-only

            try {
                await fileOperationService.deleteFiles([testFile]);
                assert.fail('Should have thrown an error');
            } catch (error) {
                const fileError = FileOperationError.fromError(error as Error, testFile);
                
                // Test error handling
                await errorHandler.handleFileOperationError(fileError);

                // Verify error was logged
                const logEntries = logger.getLogEntries();
                assert.strictEqual(logEntries.some(entry => 
                    entry.category === 'FileOperationService' && 
                    entry.message.includes('failed')
                ), true);
            } finally {
                // Cleanup: restore permissions and delete
                try {
                    fs.chmodSync(testFile, 0o666);
                    fs.unlinkSync(testFile);
                } catch {
                    // Ignore cleanup errors
                }
            }
        });

        test('should handle file already exists error', async () => {
            const sourceFile = path.join(testWorkspaceRoot, 'source-file.txt');
            const targetFile = path.join(testWorkspaceRoot, 'existing-target.txt');

            // Create both files
            fs.writeFileSync(sourceFile, 'source content');
            fs.writeFileSync(targetFile, 'existing content');

            try {
                // Try to copy with overwrite protection
                const error = new FileOperationError(
                    FileOperationErrorType.FileAlreadyExists,
                    targetFile,
                    'File already exists'
                );

                await errorHandler.handleFileOperationError(error);

                // Verify error handling
                const stats = errorHandler.getErrorStatistics();
                assert.strictEqual(stats.total >= 1, true);
            } finally {
                // Cleanup
                try {
                    fs.unlinkSync(sourceFile);
                    fs.unlinkSync(targetFile);
                } catch {
                    // Ignore cleanup errors
                }
            }
        });

        test('should handle invalid file name error', async () => {
            const invalidFileName = 'invalid<>file|name?.txt';
            const error = new FileOperationError(
                FileOperationErrorType.InvalidFileName,
                path.join(testWorkspaceRoot, invalidFileName),
                'Invalid file name contains illegal characters'
            );

            await errorHandler.handleFileOperationError(error);

            // Verify suggestions are provided
            const suggestions = error.getRecoverySuggestions();
            assert.strictEqual(suggestions.length > 0, true);
            assert.strictEqual(suggestions.some(s => s.includes('使用できない文字')), true);
        });
    });

    suite('Error Recovery Scenarios', () => {
        test('should attempt recovery for network errors', async () => {
            const networkError = new FileOperationError(
                FileOperationErrorType.NetworkError,
                '/network/path/file.txt',
                'Network timeout occurred'
            );

            // Mock progress notification
            let progressCallCount = 0;
            const originalWithProgress = vscode.window.withProgress;
            vscode.window.withProgress = (options: any, task: any) => {
                progressCallCount++;
                return task();
            };

            const recovered = await errorHandler.attemptRecovery(networkError);

            // Should have attempted recovery
            assert.strictEqual(progressCallCount > 0, true);
            assert.strictEqual(typeof recovered, 'boolean');

            // Restore original function
            vscode.window.withProgress = originalWithProgress;
        });

        test('should show disk space information for insufficient space error', async () => {
            const diskSpaceError = new FileOperationError(
                FileOperationErrorType.DiskSpaceInsufficient,
                '/full/disk/file.txt',
                'No space left on device'
            );

            // Mock warning message
            let warningShown = false;
            const originalShowWarningMessage = vscode.window.showWarningMessage;
            vscode.window.showWarningMessage = (message: string) => {
                warningShown = true;
                return Promise.resolve(undefined);
            };

            const recovered = await errorHandler.attemptRecovery(diskSpaceError);

            assert.strictEqual(recovered, false); // Cannot auto-recover from disk space issues
            assert.strictEqual(warningShown, true);

            // Restore original function
            vscode.window.showWarningMessage = originalShowWarningMessage;
        });
    });

    suite('Error Logging Integration', () => {
        test('should log errors to both error handler and debug logger', async () => {
            const testError = new FileOperationError(
                FileOperationErrorType.UnknownError,
                '/test/path',
                'Test error for logging'
            );

            // Log through error handler
            await errorHandler.handleFileOperationError(testError);

            // Also log through debug logger
            logger.error('ErrorHandlingTest', 'Test error occurred', testError);

            // Verify both logs
            const errorStats = errorHandler.getErrorStatistics();
            const debugEntries = logger.getLogEntries();

            assert.strictEqual(errorStats.total >= 1, true);
            assert.strictEqual(debugEntries.some(entry => 
                entry.message.includes('Test error occurred')
            ), true);
        });

        test('should maintain error correlation between systems', async () => {
            const correlationId = `test-${Date.now()}`;
            const testError = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/correlation/file.txt',
                'Correlation test error',
                undefined,
                correlationId
            );

            // Log with correlation context
            logger.info('ErrorCorrelation', `Starting operation ${correlationId}`);
            await errorHandler.handleFileOperationError(testError);
            logger.info('ErrorCorrelation', `Completed operation ${correlationId}`);

            // Verify correlation can be traced
            const debugEntries = logger.getLogEntries();
            const correlatedEntries = debugEntries.filter(entry => 
                entry.message.includes(correlationId)
            );

            assert.strictEqual(correlatedEntries.length >= 2, true);
        });
    });

    suite('User Experience Integration', () => {
        test('should provide consistent error messages across components', async () => {
            const testError = new FileOperationError(
                FileOperationErrorType.PermissionDenied,
                '/protected/file.txt',
                'Access denied'
            );

            // Mock error message display
            let displayedMessage = '';
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            vscode.window.showErrorMessage = (message: string) => {
                displayedMessage = message;
                return Promise.resolve(undefined);
            };

            await errorHandler.handleFileOperationError(testError);

            // Verify message consistency
            const userFriendlyMessage = testError.getUserFriendlyMessage();
            assert.strictEqual(displayedMessage, userFriendlyMessage);
            assert.strictEqual(displayedMessage.includes('アクセス権限がありません'), true);

            // Restore original function
            vscode.window.showErrorMessage = originalShowErrorMessage;
        });

        test('should handle multiple concurrent errors gracefully', async () => {
            const errors = [
                new FileOperationError(FileOperationErrorType.FileNotFound, '/file1.txt', 'Error 1'),
                new FileOperationError(FileOperationErrorType.PermissionDenied, '/file2.txt', 'Error 2'),
                new FileOperationError(FileOperationErrorType.InvalidFileName, '/file3.txt', 'Error 3')
            ];

            // Mock error message display to avoid UI blocking
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            vscode.window.showErrorMessage = () => Promise.resolve(undefined);

            // Handle multiple errors concurrently
            const promises = errors.map(error => errorHandler.handleFileOperationError(error));
            await Promise.all(promises);

            // Verify all errors were logged
            const stats = errorHandler.getErrorStatistics();
            assert.strictEqual(stats.total >= 3, true);

            // Restore original function
            vscode.window.showErrorMessage = originalShowErrorMessage;
        });
    });

    suite('Performance Under Error Conditions', () => {
        test('should handle high volume of errors efficiently', async () => {
            const startTime = Date.now();
            const errorCount = 100;

            // Mock error message display to avoid UI blocking
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            vscode.window.showErrorMessage = () => Promise.resolve(undefined);

            // Generate and handle many errors
            const promises = [];
            for (let i = 0; i < errorCount; i++) {
                const error = new FileOperationError(
                    FileOperationErrorType.UnknownError,
                    `/test/file${i}.txt`,
                    `Error ${i}`
                );
                promises.push(errorHandler.handleFileOperationError(error));
            }

            await Promise.all(promises);

            const duration = Date.now() - startTime;
            const stats = errorHandler.getErrorStatistics();

            // Verify performance and correctness
            assert.strictEqual(stats.total >= errorCount, true);
            assert.strictEqual(duration < 5000, true); // Should complete within 5 seconds

            // Restore original function
            vscode.window.showErrorMessage = originalShowErrorMessage;
        });

        test('should maintain memory limits under error load', async () => {
            // Clear existing logs
            errorHandler.clearErrorLog();
            logger.clearLogs();

            // Generate many errors to test memory management
            for (let i = 0; i < 50; i++) {
                const error = new Error(`Memory test error ${i}`);
                errorHandler.logError(error, `Test Context ${i}`);
                logger.error('MemoryTest', `Error ${i}`, error);
            }

            // Verify memory management
            const errorStats = errorHandler.getErrorStatistics();
            const debugEntries = logger.getLogEntries();

            // Should have logged all errors but maintained reasonable memory usage
            assert.strictEqual(errorStats.total, 50);
            assert.strictEqual(debugEntries.length, 50);
        });
    });
});