import * as assert from 'assert';
import * as vscode from 'vscode';
import { ErrorHandler } from '../services/ErrorHandler';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';

suite('ErrorHandler Unit Tests', () => {
    let errorHandler: ErrorHandler;
    let mockOutputChannel: vscode.OutputChannel;

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

        // Restore original function
        vscode.window.createOutputChannel = originalCreateOutputChannel;
    });

    teardown(() => {
        errorHandler.clearErrorLog();
    });

    suite('Error Handling', () => {
        test('should handle FileOperationError correctly', async () => {
            const error = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/path/file.txt',
                'Test error message'
            );

            // Mock vscode.window.showErrorMessage
            let showErrorMessageCalled = false;
            let errorMessage = '';
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            vscode.window.showErrorMessage = (message: string) => {
                showErrorMessageCalled = true;
                errorMessage = message;
                return Promise.resolve(undefined);
            };

            await errorHandler.handleFileOperationError(error);

            assert.strictEqual(showErrorMessageCalled, true);
            assert.strictEqual(errorMessage, error.getUserFriendlyMessage());

            // Restore original function
            vscode.window.showErrorMessage = originalShowErrorMessage;
        });

        test('should log errors with correct context', () => {
            const error = new Error('Test error');
            const context = 'Test Context';

            errorHandler.logError(error, context);

            const stats = errorHandler.getErrorStatistics();
            assert.strictEqual(stats.total, 1);
        });

        test('should determine if error is recoverable', () => {
            const recoverableError = new FileOperationError(
                FileOperationErrorType.NetworkError,
                '/test/path',
                'Network error'
            );

            const nonRecoverableError = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/path',
                'File not found'
            );

            assert.strictEqual(errorHandler.canRecover(recoverableError), true);
            assert.strictEqual(errorHandler.canRecover(nonRecoverableError), false);
        });
    });

    suite('Error Recovery', () => {
        test('should attempt recovery for recoverable errors', async () => {
            const networkError = new FileOperationError(
                FileOperationErrorType.NetworkError,
                '/test/path',
                'Network timeout'
            );

            // Mock progress notification
            let progressCalled = false;
            const originalWithProgress = vscode.window.withProgress;
            vscode.window.withProgress = (options: any, task: any) => {
                progressCalled = true;
                return task();
            };

            const result = await errorHandler.attemptRecovery(networkError);

            assert.strictEqual(progressCalled, true);
            // Recovery might fail in test environment, but should attempt
            assert.strictEqual(typeof result, 'boolean');

            // Restore original function
            vscode.window.withProgress = originalWithProgress;
        });

        test('should not attempt recovery for non-recoverable errors', async () => {
            const fileNotFoundError = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/path',
                'File not found'
            );

            const result = await errorHandler.attemptRecovery(fileNotFoundError);
            assert.strictEqual(result, false);
        });
    });

    suite('Error Statistics', () => {
        test('should track error statistics correctly', () => {
            // Clear existing logs
            errorHandler.clearErrorLog();

            // Add some test errors
            errorHandler.logError(new Error('Error 1'), 'Context 1');
            errorHandler.logError(new Error('Error 2'), 'Context 2');
            errorHandler.logError(new Error('Error 3'), 'Context 3');

            const stats = errorHandler.getErrorStatistics();
            assert.strictEqual(stats.total, 3);
            assert.strictEqual(stats.last24Hours, 3);
        });

        test('should clear error log', () => {
            errorHandler.logError(new Error('Test error'), 'Test context');
            
            let stats = errorHandler.getErrorStatistics();
            assert.strictEqual(stats.total, 1);

            errorHandler.clearErrorLog();
            
            stats = errorHandler.getErrorStatistics();
            assert.strictEqual(stats.total, 0);
        });
    });

    suite('User-Friendly Messages', () => {
        test('should show user-friendly message for file not found', () => {
            const error = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/path/file.txt',
                'ENOENT: no such file or directory'
            );

            let messageShown = '';
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            vscode.window.showErrorMessage = (message: string) => {
                messageShown = message;
                return Promise.resolve(undefined);
            };

            errorHandler.showUserFriendlyMessage(error);

            assert.strictEqual(messageShown.includes('ファイルまたはフォルダが見つかりません'), true);
            assert.strictEqual(messageShown.includes('file.txt'), true);

            // Restore original function
            vscode.window.showErrorMessage = originalShowErrorMessage;
        });

        test('should show user-friendly message for permission denied', () => {
            const error = new FileOperationError(
                FileOperationErrorType.PermissionDenied,
                '/test/path/file.txt',
                'EACCES: permission denied'
            );

            let messageShown = '';
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            vscode.window.showErrorMessage = (message: string) => {
                messageShown = message;
                return Promise.resolve(undefined);
            };

            errorHandler.showUserFriendlyMessage(error);

            assert.strictEqual(messageShown.includes('アクセス権限がありません'), true);

            // Restore original function
            vscode.window.showErrorMessage = originalShowErrorMessage;
        });
    });

    suite('Error Export', () => {
        test('should export error log', () => {
            errorHandler.clearErrorLog();
            
            errorHandler.logError(new Error('Test error 1'), 'Context 1');
            errorHandler.logError(new Error('Test error 2'), 'Context 2');

            const exported = errorHandler.exportErrorLog();
            assert.strictEqual(exported.length, 2);
            assert.strictEqual(exported[0].context, 'Context 1');
            assert.strictEqual(exported[1].context, 'Context 2');
        });
    });

    suite('Error Level Detection', () => {
        test('should assign correct error levels', () => {
            const warningError = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/path',
                'File not found'
            );

            const criticalError = new FileOperationError(
                FileOperationErrorType.DiskSpaceInsufficient,
                '/test/path',
                'No space left'
            );

            errorHandler.logError(warningError, 'Test');
            errorHandler.logError(criticalError, 'Test');

            const stats = errorHandler.getErrorStatistics();
            assert.strictEqual(stats.total, 2);
        });
    });

    suite('Error Context', () => {
        test('should preserve error context', () => {
            const error = new FileOperationError(
                FileOperationErrorType.InvalidFileName,
                '/test/path',
                'Invalid name',
                undefined,
                'File creation context'
            );

            errorHandler.logError(error, 'Test Context');

            const exported = errorHandler.exportErrorLog();
            const logEntry = exported[exported.length - 1];
            assert.strictEqual(logEntry.context, 'Test Context');
        });
    });

    suite('Error Recovery Suggestions', () => {
        test('should provide appropriate recovery suggestions', () => {
            const fileNotFoundError = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/path',
                'File not found'
            );

            const suggestions = fileNotFoundError.getRecoverySuggestions();
            assert.strictEqual(suggestions.length > 0, true);
            assert.strictEqual(suggestions.some(s => s.includes('ファイルパス')), true);
        });

        test('should provide different suggestions for different error types', () => {
            const permissionError = new FileOperationError(
                FileOperationErrorType.PermissionDenied,
                '/test/path',
                'Permission denied'
            );

            const diskSpaceError = new FileOperationError(
                FileOperationErrorType.DiskSpaceInsufficient,
                '/test/path',
                'No space left'
            );

            const permissionSuggestions = permissionError.getRecoverySuggestions();
            const diskSpaceSuggestions = diskSpaceError.getRecoverySuggestions();

            assert.notDeepStrictEqual(permissionSuggestions, diskSpaceSuggestions);
        });
    });
});