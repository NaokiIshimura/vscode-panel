import * as vscode from 'vscode';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';
import { DebugLogger } from './DebugLogger';

/**
 * Retry strategy configuration
 */
export interface RetryConfig {
    maxAttempts: number;
    baseDelay: number; // in milliseconds
    maxDelay: number; // in milliseconds
    backoffMultiplier: number;
    jitterEnabled: boolean;
}

/**
 * Retry attempt information
 */
export interface RetryAttempt {
    attemptNumber: number;
    timestamp: Date;
    error?: Error;
    delay: number;
}

/**
 * Retry operation context
 */
export interface RetryContext {
    operationId: string;
    operationName: string;
    startTime: Date;
    attempts: RetryAttempt[];
    config: RetryConfig;
    onProgress?: (attempt: RetryAttempt) => void;
    onSuccess?: () => void;
    onFailure?: (error: Error) => void;
}

/**
 * Auto-retry service for handling temporary failures
 */
export class AutoRetryService {
    private static instance: AutoRetryService;
    private readonly logger: DebugLogger;
    private readonly activeRetries: Map<string, RetryContext> = new Map();
    private readonly defaultConfig: RetryConfig;

    private constructor() {
        this.logger = DebugLogger.getInstance();
        this.defaultConfig = this.loadDefaultConfig();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): AutoRetryService {
        if (!AutoRetryService.instance) {
            AutoRetryService.instance = new AutoRetryService();
        }
        return AutoRetryService.instance;
    }

    /**
     * Execute operation with automatic retry on temporary failures
     */
    async executeWithRetry<T>(
        operationName: string,
        operation: () => Promise<T>,
        config?: Partial<RetryConfig>
    ): Promise<T> {
        const operationId = this.generateOperationId();
        const retryConfig = { ...this.defaultConfig, ...config };
        
        const context: RetryContext = {
            operationId,
            operationName,
            startTime: new Date(),
            attempts: [],
            config: retryConfig
        };

        this.activeRetries.set(operationId, context);

        try {
            const result = await this.performRetryLoop(operation, context);
            context.onSuccess?.();
            return result;
        } catch (error) {
            context.onFailure?.(error as Error);
            throw error;
        } finally {
            this.activeRetries.delete(operationId);
        }
    }

    /**
     * Execute operation with retry and progress notification
     */
    async executeWithRetryAndProgress<T>(
        operationName: string,
        operation: () => Promise<T>,
        config?: Partial<RetryConfig>
    ): Promise<T> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: operationName,
            cancellable: false
        }, async (progress) => {
            return await this.executeWithRetry(
                operationName,
                operation,
                {
                    ...config
                }
            );
        });
    }

    /**
     * Check if an error is retryable
     */
    isRetryableError(error: Error): boolean {
        if (error instanceof FileOperationError) {
            return this.isRetryableFileOperationError(error);
        }

        // Check for common temporary error patterns
        const retryablePatterns = [
            /EBUSY/i,           // Resource busy
            /EAGAIN/i,          // Try again
            /ETIMEDOUT/i,       // Timeout
            /ECONNRESET/i,      // Connection reset
            /ENOTFOUND/i,       // DNS resolution failed
            /ECONNREFUSED/i,    // Connection refused
            /EMFILE/i,          // Too many open files
            /ENFILE/i,          // File table overflow
            /temporary/i,       // Generic temporary error
            /timeout/i,         // Timeout error
            /network/i          // Network error
        ];

        return retryablePatterns.some(pattern => pattern.test(error.message));
    }

    /**
     * Get retry statistics for active operations
     */
    getRetryStatistics(): RetryStatistics {
        const activeCount = this.activeRetries.size;
        const contexts = Array.from(this.activeRetries.values());
        
        const totalAttempts = contexts.reduce((sum, ctx) => sum + ctx.attempts.length, 0);
        const averageAttempts = activeCount > 0 ? totalAttempts / activeCount : 0;
        
        const successfulRetries = contexts.filter(ctx => 
            ctx.attempts.length > 1 && !ctx.attempts[ctx.attempts.length - 1].error
        ).length;

        return {
            activeRetries: activeCount,
            totalAttempts,
            averageAttempts,
            successfulRetries
        };
    }

    /**
     * Cancel all active retries
     */
    cancelAllRetries(): void {
        this.activeRetries.clear();
        this.logger.info('AutoRetryService', 'Cancelled all active retries');
    }

    /**
     * Get active retry operations
     */
    getActiveRetries(): RetryContext[] {
        return Array.from(this.activeRetries.values());
    }

    /**
     * Perform the retry loop
     */
    private async performRetryLoop<T>(
        operation: () => Promise<T>,
        context: RetryContext
    ): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= context.config.maxAttempts; attempt++) {
            const attemptInfo: RetryAttempt = {
                attemptNumber: attempt,
                timestamp: new Date(),
                delay: 0
            };

            try {
                this.logger.debug('AutoRetryService', 
                    `Attempting ${context.operationName} (attempt ${attempt}/${context.config.maxAttempts})`
                );

                const result = await operation();
                
                attemptInfo.delay = 0; // No delay needed, operation succeeded
                context.attempts.push(attemptInfo);
                
                if (attempt > 1) {
                    this.logger.info('AutoRetryService', 
                        `${context.operationName} succeeded after ${attempt} attempts`
                    );
                }

                return result;
            } catch (error) {
                lastError = error as Error;
                attemptInfo.error = lastError;
                
                this.logger.warning('AutoRetryService', 
                    `${context.operationName} failed on attempt ${attempt}: ${lastError.message}`
                );

                // Check if error is retryable
                if (!this.isRetryableError(lastError)) {
                    this.logger.info('AutoRetryService', 
                        `${context.operationName} failed with non-retryable error`
                    );
                    throw lastError;
                }

                // Don't delay after the last attempt
                if (attempt < context.config.maxAttempts) {
                    const delay = this.calculateDelay(attempt, context.config);
                    attemptInfo.delay = delay;
                    
                    this.logger.debug('AutoRetryService', 
                        `Waiting ${delay}ms before retry attempt ${attempt + 1}`
                    );

                    context.onProgress?.(attemptInfo);
                    await this.sleep(delay);
                }

                context.attempts.push(attemptInfo);
            }
        }

        // All attempts failed
        this.logger.error('AutoRetryService', 
            `${context.operationName} failed after ${context.config.maxAttempts} attempts`,
            lastError
        );

        throw lastError || new Error(`Operation failed after ${context.config.maxAttempts} attempts`);
    }

    /**
     * Check if FileOperationError is retryable
     */
    private isRetryableFileOperationError(error: FileOperationError): boolean {
        switch (error.type) {
            case FileOperationErrorType.NetworkError:
            case FileOperationErrorType.DiskSpaceInsufficient:
                return true;
            
            case FileOperationErrorType.FileNotFound:
            case FileOperationErrorType.PermissionDenied:
            case FileOperationErrorType.FileAlreadyExists:
            case FileOperationErrorType.InvalidFileName:
                return false;
            
            case FileOperationErrorType.UnknownError:
                // For unknown errors, check the underlying error message
                return this.isRetryableError(error.originalError || error);
            
            default:
                return false;
        }
    }

    /**
     * Calculate delay for next retry attempt
     */
    private calculateDelay(attempt: number, config: RetryConfig): number {
        // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
        let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
        
        // Cap at maximum delay
        delay = Math.min(delay, config.maxDelay);
        
        // Add jitter to prevent thundering herd
        if (config.jitterEnabled) {
            const jitter = delay * 0.1 * Math.random(); // Up to 10% jitter
            delay += jitter;
        }
        
        return Math.floor(delay);
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique operation ID
     */
    private generateOperationId(): string {
        return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Load default configuration
     */
    private loadDefaultConfig(): RetryConfig {
        const config = vscode.workspace.getConfiguration('fileListExtension.autoRetry');
        
        return {
            maxAttempts: config.get('maxAttempts', 3),
            baseDelay: config.get('baseDelay', 1000), // 1 second
            maxDelay: config.get('maxDelay', 30000), // 30 seconds
            backoffMultiplier: config.get('backoffMultiplier', 2),
            jitterEnabled: config.get('jitterEnabled', true)
        };
    }

    /**
     * Create retry configuration for specific error types
     */
    static createConfigForErrorType(errorType: FileOperationErrorType): Partial<RetryConfig> {
        switch (errorType) {
            case FileOperationErrorType.NetworkError:
                return {
                    maxAttempts: 5,
                    baseDelay: 2000,
                    maxDelay: 60000,
                    backoffMultiplier: 2
                };
            
            case FileOperationErrorType.DiskSpaceInsufficient:
                return {
                    maxAttempts: 2,
                    baseDelay: 5000,
                    maxDelay: 10000,
                    backoffMultiplier: 1.5
                };
            
            default:
                return {};
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.cancelAllRetries();
    }
}

/**
 * Retry statistics interface
 */
export interface RetryStatistics {
    activeRetries: number;
    totalAttempts: number;
    averageAttempts: number;
    successfulRetries: number;
}

/**
 * Convenience function to get auto-retry service instance
 */
export function getAutoRetryService(): AutoRetryService {
    return AutoRetryService.getInstance();
}

/**
 * Decorator for automatic retry on method calls
 */
export function autoRetry(config?: Partial<RetryConfig>) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;
        
        descriptor.value = async function (...args: any[]) {
            const retryService = getAutoRetryService();
            const className = target.constructor.name;
            const methodName = `${className}.${propertyName}`;
            
            return await retryService.executeWithRetry(
                methodName,
                () => method.apply(this, args),
                config
            );
        };
    };
}