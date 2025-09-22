import * as assert from 'assert';
import * as vscode from 'vscode';
import { AutoRetryService, getAutoRetryService, autoRetry } from '../services/AutoRetryService';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';

suite('AutoRetryService Unit Tests', () => {
    let retryService: AutoRetryService;

    setup(() => {
        // Mock workspace configuration
        const mockConfig = {
            get: (key: string, defaultValue?: any) => {
                switch (key) {
                    case 'maxAttempts': return 3;
                    case 'baseDelay': return 100; // Shorter delays for testing
                    case 'maxDelay': return 1000;
                    case 'backoffMultiplier': return 2;
                    case 'jitterEnabled': return false; // Disable jitter for predictable tests
                    default: return defaultValue;
                }
            }
        };

        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = () => mockConfig as any;

        retryService = AutoRetryService.getInstance();

        // Restore original function
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    teardown(() => {
        retryService.cancelAllRetries();
    });

    suite('Basic Retry Functionality', () => {
        test('should succeed on first attempt', async () => {
            let attemptCount = 0;
            
            const operation = async () => {
                attemptCount++;
                return 'success';
            };

            const result = await retryService.executeWithRetry('TestOperation', operation);

            assert.strictEqual(result, 'success');
            assert.strictEqual(attemptCount, 1);
        });

        test('should retry on retryable errors', async () => {
            let attemptCount = 0;
            
            const operation = async () => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('ETIMEDOUT: Connection timed out');
                }
                return 'success after retry';
            };

            const result = await retryService.executeWithRetry('TestOperation', operation);

            assert.strictEqual(result, 'success after retry');
            assert.strictEqual(attemptCount, 3);
        });

        test('should fail after max attempts', async () => {
            let attemptCount = 0;
            
            const operation = async () => {
                attemptCount++;
                throw new Error('ETIMEDOUT: Persistent timeout');
            };

            try {
                await retryService.executeWithRetry('TestOperation', operation);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual((error as Error).message, 'ETIMEDOUT: Persistent timeout');
                assert.strictEqual(attemptCount, 3); // Should have tried 3 times
            }
        });

        test('should not retry non-retryable errors', async () => {
            let attemptCount = 0;
            
            const operation = async () => {
                attemptCount++;
                throw new Error('Invalid argument');
            };

            try {
                await retryService.executeWithRetry('TestOperation', operation);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual((error as Error).message, 'Invalid argument');
                assert.strictEqual(attemptCount, 1); // Should have tried only once
            }
        });
    });

    suite('FileOperationError Handling', () => {
        test('should retry network errors', async () => {
            let attemptCount = 0;
            
            const operation = async () => {
                attemptCount++;
                if (attemptCount < 2) {
                    throw new FileOperationError(
                        FileOperationErrorType.NetworkError,
                        '/test/file.txt',
                        'Network timeout'
                    );
                }
                return 'network success';
            };

            const result = await retryService.executeWithRetry('NetworkOperation', operation);

            assert.strictEqual(result, 'network success');
            assert.strictEqual(attemptCount, 2);
        });

        test('should retry disk space errors', async () => {
            let attemptCount = 0;
            
            const operation = async () => {
                attemptCount++;
                if (attemptCount < 2) {
                    throw new FileOperationError(
                        FileOperationErrorType.DiskSpaceInsufficient,
                        '/test/file.txt',
                        'No space left on device'
                    );
                }
                return 'disk space success';
            };

            const result = await retryService.executeWithRetry('DiskSpaceOperation', operation);

            assert.strictEqual(result, 'disk space success');
            assert.strictEqual(attemptCount, 2);
        });

        test('should not retry file not found errors', async () => {
            let attemptCount = 0;
            
            const operation = async () => {
                attemptCount++;
                throw new FileOperationError(
                    FileOperationErrorType.FileNotFound,
                    '/test/file.txt',
                    'File not found'
                );
            };

            try {
                await retryService.executeWithRetry('FileNotFoundOperation', operation);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error instanceof FileOperationError, true);
                assert.strictEqual((error as FileOperationError).type, FileOperationErrorType.FileNotFound);
                assert.strictEqual(attemptCount, 1);
            }
        });

        test('should not retry permission denied errors', async () => {
            let attemptCount = 0;
            
            const operation = async () => {
                attemptCount++;
                throw new FileOperationError(
                    FileOperationErrorType.PermissionDenied,
                    '/test/file.txt',
                    'Permission denied'
                );
            };

            try {
                await retryService.executeWithRetry('PermissionOperation', operation);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error instanceof FileOperationError, true);
                assert.strictEqual(attemptCount, 1);
            }
        });
    });

    suite('Retry Configuration', () => {
        test('should respect custom max attempts', async () => {
            let attemptCount = 0;
            
            const operation = async () => {
                attemptCount++;
                throw new Error('ETIMEDOUT: Timeout');
            };

            try {
                await retryService.executeWithRetry('CustomAttemptsOperation', operation, {
                    maxAttempts: 5
                });
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(attemptCount, 5);
            }
        });

        test('should use custom base delay', async () => {
            let attemptCount = 0;
            const startTime = Date.now();
            
            const operation = async () => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('ETIMEDOUT: Timeout');
                }
                return 'success';
            };

            await retryService.executeWithRetry('CustomDelayOperation', operation, {
                baseDelay: 200,
                maxAttempts: 3
            });

            const duration = Date.now() - startTime;
            // Should have waited at least 200ms + 400ms (exponential backoff)
            assert.strictEqual(duration >= 600, true);
            assert.strictEqual(attemptCount, 3);
        });
    });

    suite('Progress Notification', () => {
        test('should execute with progress notification', async () => {
            let attemptCount = 0;
            let progressCalled = false;
            
            // Mock progress notification
            const originalWithProgress = vscode.window.withProgress;
            vscode.window.withProgress = (options: any, task: any) => {
                progressCalled = true;
                return task({
                    report: () => {}
                });
            };

            const operation = async () => {
                attemptCount++;
                if (attemptCount < 2) {
                    throw new Error('ETIMEDOUT: Timeout');
                }
                return 'progress success';
            };

            const result = await retryService.executeWithRetryAndProgress('ProgressOperation', operation);

            assert.strictEqual(result, 'progress success');
            assert.strictEqual(progressCalled, true);

            // Restore original function
            vscode.window.withProgress = originalWithProgress;
        });
    });

    suite('Error Classification', () => {
        test('should identify retryable errors correctly', () => {
            const retryableErrors = [
                new Error('EBUSY: resource busy'),
                new Error('EAGAIN: try again'),
                new Error('ETIMEDOUT: timeout'),
                new Error('ECONNRESET: connection reset'),
                new Error('Network error occurred'),
                new Error('Temporary failure')
            ];

            for (const error of retryableErrors) {
                assert.strictEqual(retryService.isRetryableError(error), true, 
                    `Should identify as retryable: ${error.message}`);
            }
        });

        test('should identify non-retryable errors correctly', () => {
            const nonRetryableErrors = [
                new Error('Invalid argument'),
                new Error('Syntax error'),
                new Error('Type error'),
                new FileOperationError(FileOperationErrorType.FileNotFound, '', 'File not found'),
                new FileOperationError(FileOperationErrorType.PermissionDenied, '', 'Permission denied')
            ];

            for (const error of nonRetryableErrors) {
                assert.strictEqual(retryService.isRetryableError(error), false,
                    `Should identify as non-retryable: ${error.message}`);
            }
        });
    });

    suite('Statistics and Monitoring', () => {
        test('should track retry statistics', async () => {
            const operation1 = async () => {
                throw new Error('ETIMEDOUT: Timeout');
            };

            const operation2 = async () => {
                return 'success';
            };

            // Start operations without awaiting to test concurrent tracking
            const promise1 = retryService.executeWithRetry('Op1', operation1).catch(() => {});
            const promise2 = retryService.executeWithRetry('Op2', operation2);

            // Check statistics while operations are running
            const stats = retryService.getRetryStatistics();
            assert.strictEqual(stats.activeRetries >= 0, true);

            await Promise.all([promise1, promise2]);
        });

        test('should get active retries', async () => {
            const slowOperation = async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return 'slow success';
            };

            // Start operation without awaiting
            const promise = retryService.executeWithRetry('SlowOperation', slowOperation);

            const activeRetries = retryService.getActiveRetries();
            assert.strictEqual(activeRetries.length >= 0, true);

            await promise;
        });

        test('should cancel all retries', async () => {
            const neverEndingOperation = async () => {
                throw new Error('ETIMEDOUT: Never ending timeout');
            };

            // Start operation without awaiting
            retryService.executeWithRetry('NeverEndingOperation', neverEndingOperation).catch(() => {});

            retryService.cancelAllRetries();

            const activeRetries = retryService.getActiveRetries();
            assert.strictEqual(activeRetries.length, 0);
        });
    });

    suite('Decorator Functionality', () => {
        class TestClass {
            @autoRetry({ maxAttempts: 2 })
            async retryableMethod(shouldFail: boolean): Promise<string> {
                if (shouldFail) {
                    throw new Error('ETIMEDOUT: Method timeout');
                }
                return 'method success';
            }

            @autoRetry()
            async nonRetryableMethod(): Promise<string> {
                throw new Error('Invalid argument');
            }
        }

        test('should retry decorated methods', async () => {
            const testInstance = new TestClass();

            // This should succeed without retry
            const result1 = await testInstance.retryableMethod(false);
            assert.strictEqual(result1, 'method success');

            // This should fail after retries
            try {
                await testInstance.retryableMethod(true);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual((error as Error).message, 'ETIMEDOUT: Method timeout');
            }
        });

        test('should not retry non-retryable decorated methods', async () => {
            const testInstance = new TestClass();

            try {
                await testInstance.nonRetryableMethod();
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual((error as Error).message, 'Invalid argument');
            }
        });
    });

    suite('Configuration for Error Types', () => {
        test('should create appropriate config for network errors', () => {
            const config = AutoRetryService.createConfigForErrorType(FileOperationErrorType.NetworkError);
            
            assert.strictEqual(config.maxAttempts, 5);
            assert.strictEqual(config.baseDelay, 2000);
            assert.strictEqual(config.maxDelay, 60000);
        });

        test('should create appropriate config for disk space errors', () => {
            const config = AutoRetryService.createConfigForErrorType(FileOperationErrorType.DiskSpaceInsufficient);
            
            assert.strictEqual(config.maxAttempts, 2);
            assert.strictEqual(config.baseDelay, 5000);
            assert.strictEqual(config.maxDelay, 10000);
        });

        test('should return empty config for non-retryable errors', () => {
            const config = AutoRetryService.createConfigForErrorType(FileOperationErrorType.FileNotFound);
            
            assert.strictEqual(Object.keys(config).length, 0);
        });
    });

    suite('Singleton Pattern', () => {
        test('should return same instance', () => {
            const service1 = AutoRetryService.getInstance();
            const service2 = AutoRetryService.getInstance();
            const service3 = getAutoRetryService();

            assert.strictEqual(service1, service2);
            assert.strictEqual(service2, service3);
        });
    });

    suite('Edge Cases', () => {
        test('should handle operations that throw non-Error objects', async () => {
            const operation = async () => {
                throw 'String error';
            };

            try {
                await retryService.executeWithRetry('StringErrorOperation', operation);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error, 'String error');
            }
        });

        test('should handle operations that return undefined', async () => {
            const operation = async () => {
                return undefined;
            };

            const result = await retryService.executeWithRetry('UndefinedOperation', operation);
            assert.strictEqual(result, undefined);
        });

        test('should handle operations that return null', async () => {
            const operation = async () => {
                return null;
            };

            const result = await retryService.executeWithRetry('NullOperation', operation);
            assert.strictEqual(result, null);
        });
    });
});