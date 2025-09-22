import { FileOperationErrorType } from '../types/enums';

/**
 * Custom error class for file operations
 */
export class FileOperationError extends Error {
    public readonly type: FileOperationErrorType;
    public readonly filePath: string;
    public readonly originalError?: Error;
    public readonly timestamp: Date;
    public readonly context?: string;

    constructor(
        type: FileOperationErrorType,
        filePath: string,
        message: string,
        originalError?: Error,
        context?: string
    ) {
        super(message);
        this.name = 'FileOperationError';
        this.type = type;
        this.filePath = filePath;
        this.originalError = originalError;
        this.timestamp = new Date();
        this.context = context;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, FileOperationError);
        }
    }

    /**
     * Get a user-friendly error message
     */
    getUserFriendlyMessage(): string {
        switch (this.type) {
            case FileOperationErrorType.FileNotFound:
                return `ファイルまたはフォルダが見つかりません: ${this.getFileName()}`;
            
            case FileOperationErrorType.PermissionDenied:
                return `アクセス権限がありません: ${this.getFileName()}`;
            
            case FileOperationErrorType.FileAlreadyExists:
                return `ファイルまたはフォルダが既に存在します: ${this.getFileName()}`;
            
            case FileOperationErrorType.InvalidFileName:
                return `無効なファイル名です: ${this.getFileName()}`;
            
            case FileOperationErrorType.DiskSpaceInsufficient:
                return `ディスク容量が不足しています`;
            
            case FileOperationErrorType.NetworkError:
                return `ネットワークエラーが発生しました`;
            
            case FileOperationErrorType.UnknownError:
            default:
                return `予期しないエラーが発生しました: ${this.message}`;
        }
    }

    /**
     * Get recovery suggestions for the error
     */
    getRecoverySuggestions(): string[] {
        switch (this.type) {
            case FileOperationErrorType.FileNotFound:
                return [
                    'ファイルパスが正しいか確認してください',
                    'ファイルが移動または削除されていないか確認してください'
                ];
            
            case FileOperationErrorType.PermissionDenied:
                return [
                    'ファイルの権限を確認してください',
                    '管理者権限で実行してください',
                    'ファイルが他のプログラムで使用されていないか確認してください'
                ];
            
            case FileOperationErrorType.FileAlreadyExists:
                return [
                    '別の名前を使用してください',
                    '既存のファイルを削除または移動してください'
                ];
            
            case FileOperationErrorType.InvalidFileName:
                return [
                    '使用できない文字を削除してください (< > : " | ? * / \\)',
                    'ファイル名の長さを確認してください'
                ];
            
            case FileOperationErrorType.DiskSpaceInsufficient:
                return [
                    'ディスク容量を確保してください',
                    '不要なファイルを削除してください'
                ];
            
            case FileOperationErrorType.NetworkError:
                return [
                    'ネットワーク接続を確認してください',
                    'しばらく時間をおいて再試行してください'
                ];
            
            default:
                return [
                    'しばらく時間をおいて再試行してください',
                    '問題が続く場合は管理者に連絡してください'
                ];
        }
    }

    /**
     * Check if the error is recoverable
     */
    isRecoverable(): boolean {
        switch (this.type) {
            case FileOperationErrorType.NetworkError:
            case FileOperationErrorType.DiskSpaceInsufficient:
                return true;
            
            case FileOperationErrorType.FileNotFound:
            case FileOperationErrorType.PermissionDenied:
            case FileOperationErrorType.FileAlreadyExists:
            case FileOperationErrorType.InvalidFileName:
                return false;
            
            case FileOperationErrorType.UnknownError:
            default:
                return false;
        }
    }

    /**
     * Get the file name from the file path
     */
    private getFileName(): string {
        const path = require('path');
        return path.basename(this.filePath);
    }

    /**
     * Convert error to JSON for logging
     */
    toJSON(): object {
        return {
            name: this.name,
            type: this.type,
            message: this.message,
            filePath: this.filePath,
            timestamp: this.timestamp.toISOString(),
            context: this.context,
            stack: this.stack,
            originalError: this.originalError ? {
                name: this.originalError.name,
                message: this.originalError.message,
                stack: this.originalError.stack
            } : undefined
        };
    }

    /**
     * Create FileOperationError from a generic Error
     */
    static fromError(error: Error, filePath: string, context?: string): FileOperationError {
        // Try to determine error type from error message or code
        let errorType = FileOperationErrorType.UnknownError;
        
        if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
            errorType = FileOperationErrorType.FileNotFound;
        } else if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
            errorType = FileOperationErrorType.PermissionDenied;
        } else if (error.message.includes('EEXIST') || error.message.includes('already exists')) {
            errorType = FileOperationErrorType.FileAlreadyExists;
        } else if (error.message.includes('ENOSPC') || error.message.includes('no space left')) {
            errorType = FileOperationErrorType.DiskSpaceInsufficient;
        }

        return new FileOperationError(
            errorType,
            filePath,
            error.message,
            error,
            context
        );
    }
}