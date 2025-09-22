import * as vscode from 'vscode';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';

/**
 * Interface for error handling service
 */
export interface IErrorHandler {
    handleFileOperationError(error: FileOperationError): Promise<void>;
    showUserFriendlyMessage(error: FileOperationError): void;
    logError(error: Error, context: string): void;
    canRecover(error: FileOperationError): boolean;
    attemptRecovery(error: FileOperationError): Promise<boolean>;
}

/**
 * Comprehensive error handling service for file operations
 */
export class ErrorHandler implements IErrorHandler {
    private static instance: ErrorHandler;
    private readonly outputChannel: vscode.OutputChannel;
    private readonly errorLog: ErrorLogEntry[] = [];
    private readonly maxLogEntries = 1000;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('File List Extension - Errors');
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    /**
     * Handle file operation errors with user-friendly messages and recovery options
     */
    async handleFileOperationError(error: FileOperationError): Promise<void> {
        // Log the error
        this.logError(error, error.context || 'File Operation');

        // Show user-friendly message with recovery options
        await this.showUserFriendlyMessage(error);

        // Attempt automatic recovery if possible
        if (this.canRecover(error)) {
            const recovered = await this.attemptRecovery(error);
            if (recovered) {
                vscode.window.showInformationMessage('操作が正常に完了しました。');
            }
        }
    }

    /**
     * Show user-friendly error message with recovery suggestions
     */
    showUserFriendlyMessage(error: FileOperationError): void {
        const message = error.getUserFriendlyMessage();
        const suggestions = error.getRecoverySuggestions();
        
        // Create action items for recovery suggestions
        const actions: string[] = [];
        
        if (error.isRecoverable()) {
            actions.push('再試行');
        }
        
        actions.push('詳細を表示', '無視');

        vscode.window.showErrorMessage(message, ...actions).then(async (selection) => {
            switch (selection) {
                case '再試行':
                    await this.attemptRecovery(error);
                    break;
                
                case '詳細を表示':
                    this.showErrorDetails(error, suggestions);
                    break;
                
                case '無視':
                    // Do nothing
                    break;
            }
        });
    }

    /**
     * Log error with context information
     */
    logError(error: Error, context: string): void {
        const timestamp = new Date();
        const logEntry: ErrorLogEntry = {
            timestamp,
            context,
            error: error instanceof FileOperationError ? error.toJSON() : {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            level: this.getErrorLevel(error)
        };

        // Add to in-memory log
        this.errorLog.push(logEntry);
        
        // Maintain log size limit
        if (this.errorLog.length > this.maxLogEntries) {
            this.errorLog.shift();
        }

        // Write to output channel
        this.outputChannel.appendLine(this.formatLogEntry(logEntry));

        // For critical errors, also log to console
        if (logEntry.level === 'critical') {
            console.error(`[File List Extension] ${context}:`, error);
        }
    }

    /**
     * Check if error can be recovered from
     */
    canRecover(error: FileOperationError): boolean {
        return error.isRecoverable();
    }

    /**
     * Attempt to recover from error
     */
    async attemptRecovery(error: FileOperationError): Promise<boolean> {
        try {
            switch (error.type) {
                case FileOperationErrorType.NetworkError:
                    return await this.retryWithDelay(error, 3, 1000);
                
                case FileOperationErrorType.DiskSpaceInsufficient:
                    // Show disk space information and suggest cleanup
                    await this.showDiskSpaceInfo();
                    return false;
                
                default:
                    return false;
            }
        } catch (recoveryError) {
            this.logError(recoveryError as Error, `Recovery attempt for ${error.type}`);
            return false;
        }
    }

    /**
     * Show detailed error information
     */
    private showErrorDetails(error: FileOperationError, suggestions: string[]): void {
        const panel = vscode.window.createWebviewPanel(
            'errorDetails',
            'エラー詳細',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getErrorDetailsHtml(error, suggestions);
    }

    /**
     * Retry operation with exponential backoff
     */
    private async retryWithDelay(error: FileOperationError, maxRetries: number, baseDelay: number): Promise<boolean> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Wait before retry (exponential backoff)
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));

                // Show progress
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `再試行中... (${attempt}/${maxRetries})`,
                    cancellable: false
                }, async () => {
                    // Here we would retry the original operation
                    // This is a placeholder - actual retry logic would depend on the operation
                    await new Promise(resolve => setTimeout(resolve, 500));
                });

                // If we get here without throwing, the retry succeeded
                return true;
            } catch (retryError) {
                if (attempt === maxRetries) {
                    this.logError(retryError as Error, `Final retry attempt failed for ${error.type}`);
                    return false;
                }
            }
        }
        
        return false;
    }

    /**
     * Show disk space information
     */
    private async showDiskSpaceInfo(): Promise<void> {
        const message = 'ディスク容量が不足しています。不要なファイルを削除してから再試行してください。';
        const action = 'ディスク使用量を確認';
        
        const selection = await vscode.window.showWarningMessage(message, action);
        if (selection === action) {
            // Open system disk usage tool or show workspace size
            await vscode.commands.executeCommand('workbench.action.openSettings', 'files.exclude');
        }
    }

    /**
     * Get error level for logging
     */
    private getErrorLevel(error: Error): 'info' | 'warning' | 'error' | 'critical' {
        if (error instanceof FileOperationError) {
            switch (error.type) {
                case FileOperationErrorType.FileNotFound:
                case FileOperationErrorType.FileAlreadyExists:
                    return 'warning';
                
                case FileOperationErrorType.PermissionDenied:
                case FileOperationErrorType.InvalidFileName:
                    return 'error';
                
                case FileOperationErrorType.DiskSpaceInsufficient:
                case FileOperationErrorType.NetworkError:
                    return 'critical';
                
                default:
                    return 'error';
            }
        }
        
        return 'error';
    }

    /**
     * Format log entry for output
     */
    private formatLogEntry(entry: ErrorLogEntry): string {
        const timestamp = entry.timestamp.toISOString();
        const level = entry.level.toUpperCase();
        const context = entry.context;
        const errorInfo = typeof entry.error === 'object' && entry.error.message 
            ? entry.error.message 
            : JSON.stringify(entry.error);
        
        return `[${timestamp}] ${level} [${context}] ${errorInfo}`;
    }

    /**
     * Generate HTML for error details webview
     */
    private getErrorDetailsHtml(error: FileOperationError, suggestions: string[]): string {
        return `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>エラー詳細</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                        line-height: 1.6;
                    }
                    .error-header {
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 10px;
                        margin-bottom: 20px;
                    }
                    .error-type {
                        color: var(--vscode-errorForeground);
                        font-weight: bold;
                        font-size: 1.2em;
                    }
                    .error-message {
                        margin: 10px 0;
                        padding: 10px;
                        background-color: var(--vscode-inputValidation-errorBackground);
                        border-left: 3px solid var(--vscode-inputValidation-errorBorder);
                    }
                    .suggestions {
                        margin-top: 20px;
                    }
                    .suggestions h3 {
                        color: var(--vscode-textLink-foreground);
                        margin-bottom: 10px;
                    }
                    .suggestions ul {
                        padding-left: 20px;
                    }
                    .suggestions li {
                        margin-bottom: 5px;
                    }
                    .technical-details {
                        margin-top: 30px;
                        padding: 15px;
                        background-color: var(--vscode-textCodeBlock-background);
                        border-radius: 3px;
                        font-family: var(--vscode-editor-font-family);
                        font-size: 0.9em;
                    }
                    .technical-details summary {
                        cursor: pointer;
                        font-weight: bold;
                        margin-bottom: 10px;
                    }
                    .stack-trace {
                        white-space: pre-wrap;
                        font-size: 0.8em;
                        color: var(--vscode-descriptionForeground);
                    }
                </style>
            </head>
            <body>
                <div class="error-header">
                    <div class="error-type">${error.type}</div>
                    <div class="error-message">${error.getUserFriendlyMessage()}</div>
                </div>

                <div class="suggestions">
                    <h3>解決方法の提案</h3>
                    <ul>
                        ${suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
                    </ul>
                </div>

                <details class="technical-details">
                    <summary>技術的な詳細</summary>
                    <p><strong>ファイルパス:</strong> ${error.filePath}</p>
                    <p><strong>発生時刻:</strong> ${error.timestamp.toLocaleString('ja-JP')}</p>
                    <p><strong>コンテキスト:</strong> ${error.context || 'N/A'}</p>
                    ${error.originalError ? `
                        <p><strong>元のエラー:</strong> ${error.originalError.message}</p>
                        <div class="stack-trace">${error.stack || 'スタックトレースなし'}</div>
                    ` : ''}
                </details>
            </body>
            </html>
        `;
    }

    /**
     * Get error statistics
     */
    getErrorStatistics(): ErrorStatistics {
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const recent = this.errorLog.filter(entry => entry.timestamp >= last24Hours);
        const byLevel = recent.reduce((acc, entry) => {
            acc[entry.level] = (acc[entry.level] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            total: this.errorLog.length,
            last24Hours: recent.length,
            byLevel
        };
    }

    /**
     * Clear error log
     */
    clearErrorLog(): void {
        this.errorLog.length = 0;
        this.outputChannel.clear();
    }

    /**
     * Export error log
     */
    exportErrorLog(): ErrorLogEntry[] {
        return [...this.errorLog];
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}

/**
 * Error log entry interface
 */
interface ErrorLogEntry {
    timestamp: Date;
    context: string;
    error: any;
    level: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Error statistics interface
 */
interface ErrorStatistics {
    total: number;
    last24Hours: number;
    byLevel: Record<string, number>;
}