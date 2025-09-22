import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IFileOperationService, FileStats, ValidationResult, FilePermissions } from '../interfaces/core';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';
import { PathValidator } from '../utils/PathValidator';
import { PermissionChecker } from '../utils/PermissionChecker';

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (completed: number, total: number, currentItem?: string) => void;

/**
 * Batch operation result
 */
export interface BatchOperationResult {
    successful: string[];
    failed: Array<{ path: string; error: FileOperationError }>;
    totalProcessed: number;
}

/**
 * Rollback operation interface
 */
export interface RollbackOperation {
    type: 'create' | 'delete' | 'move' | 'copy';
    originalPath: string;
    targetPath?: string;
    backupPath?: string;
    content?: Buffer;
}

/**
 * Batch operation options
 */
export interface BatchOperationOptions {
    continueOnError?: boolean;
    enableRollback?: boolean;
    progressCallback?: ProgressCallback;
    maxConcurrency?: number;
}

/**
 * Core file operation service implementation
 */
export class FileOperationService implements IFileOperationService {
    private readonly outputChannel: vscode.OutputChannel;
    private rollbackOperations: RollbackOperation[] = [];

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('File List Extension - File Operations');
    }

    /**
     * Copy files from sources to destination
     */
    async copyFiles(sources: string[], destination: string): Promise<void> {
        this.logOperation('copyFiles', { sources, destination });

        try {
            // Validate destination
            if (!await PathValidator.pathExists(destination)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileNotFound,
                    destination,
                    'Destination directory does not exist'
                );
            }

            if (!await PathValidator.isDirectory(destination)) {
                throw new FileOperationError(
                    FileOperationErrorType.InvalidFileName,
                    destination,
                    'Destination must be a directory'
                );
            }

            // Check write permission on destination
            const writePermission = await PermissionChecker.checkOperationPermission(destination, 'write');
            if (!writePermission.allowed) {
                throw new FileOperationError(
                    FileOperationErrorType.PermissionDenied,
                    destination,
                    writePermission.reason || 'Cannot write to destination directory'
                );
            }

            // Copy each source file/directory
            for (const source of sources) {
                await this.copySingleItem(source, destination);
            }

            this.logOperation('copyFiles completed successfully');
        } catch (error) {
            this.logError('copyFiles failed', error);
            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, sources[0]);
        }
    }

    /**
     * Move files from sources to destination
     */
    async moveFiles(sources: string[], destination: string): Promise<void> {
        this.logOperation('moveFiles', { sources, destination });

        try {
            // Validate destination
            if (!await PathValidator.pathExists(destination)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileNotFound,
                    destination,
                    'Destination directory does not exist'
                );
            }

            if (!await PathValidator.isDirectory(destination)) {
                throw new FileOperationError(
                    FileOperationErrorType.InvalidFileName,
                    destination,
                    'Destination must be a directory'
                );
            }

            // Check permissions
            const writePermission = await PermissionChecker.checkOperationPermission(destination, 'write');
            if (!writePermission.allowed) {
                throw new FileOperationError(
                    FileOperationErrorType.PermissionDenied,
                    destination,
                    writePermission.reason || 'Cannot write to destination directory'
                );
            }

            // Move each source file/directory
            for (const source of sources) {
                await this.moveSingleItem(source, destination);
            }

            this.logOperation('moveFiles completed successfully');
        } catch (error) {
            this.logError('moveFiles failed', error);
            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, sources[0]);
        }
    }

    /**
     * Delete files at specified paths
     */
    async deleteFiles(paths: string[]): Promise<void> {
        this.logOperation('deleteFiles', { paths });

        try {
            for (const filePath of paths) {
                await this.deleteSingleItem(filePath);
            }

            this.logOperation('deleteFiles completed successfully');
        } catch (error) {
            this.logError('deleteFiles failed', error);
            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, paths[0]);
        }
    }

    /**
     * Rename a file from old path to new path
     */
    async renameFile(oldPath: string, newPath: string): Promise<void> {
        this.logOperation('renameFile', { oldPath, newPath });

        try {
            // Validate old path exists
            if (!await PathValidator.pathExists(oldPath)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileNotFound,
                    oldPath,
                    'Source file does not exist'
                );
            }

            // Validate new path doesn't exist
            if (await PathValidator.pathExists(newPath)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileAlreadyExists,
                    newPath,
                    'Target file already exists'
                );
            }

            // Validate new file name
            const newFileName = path.basename(newPath);
            const nameValidation = this.validateFileName(newFileName);
            if (!nameValidation.isValid) {
                throw new FileOperationError(
                    FileOperationErrorType.InvalidFileName,
                    newPath,
                    nameValidation.errorMessage || 'Invalid file name'
                );
            }

            // Check permissions
            const deletePermission = await PermissionChecker.checkOperationPermission(oldPath, 'delete');
            if (!deletePermission.allowed) {
                throw new FileOperationError(
                    FileOperationErrorType.PermissionDenied,
                    oldPath,
                    deletePermission.reason || 'Cannot rename file'
                );
            }

            const parentDir = path.dirname(newPath);
            const writePermission = await PermissionChecker.checkOperationPermission(parentDir, 'write');
            if (!writePermission.allowed) {
                throw new FileOperationError(
                    FileOperationErrorType.PermissionDenied,
                    newPath,
                    writePermission.reason || 'Cannot create file in target directory'
                );
            }

            // Perform rename
            await fs.promises.rename(oldPath, newPath);

            this.logOperation('renameFile completed successfully');
        } catch (error) {
            this.logError('renameFile failed', error);
            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, oldPath);
        }
    }

    /**
     * Create a new file at specified path
     */
    async createFile(filePath: string, content: string = ''): Promise<void> {
        this.logOperation('createFile', { filePath, contentLength: content.length });

        try {
            // Validate file name
            const fileName = path.basename(filePath);
            const nameValidation = this.validateFileName(fileName);
            if (!nameValidation.isValid) {
                throw new FileOperationError(
                    FileOperationErrorType.InvalidFileName,
                    filePath,
                    nameValidation.errorMessage || 'Invalid file name'
                );
            }

            // Check if file already exists
            if (await PathValidator.pathExists(filePath)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileAlreadyExists,
                    filePath,
                    'File already exists'
                );
            }

            // Check parent directory permissions
            const parentDir = path.dirname(filePath);
            if (!await PathValidator.pathExists(parentDir)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileNotFound,
                    parentDir,
                    'Parent directory does not exist'
                );
            }

            const writePermission = await PermissionChecker.checkOperationPermission(parentDir, 'write');
            if (!writePermission.allowed) {
                throw new FileOperationError(
                    FileOperationErrorType.PermissionDenied,
                    filePath,
                    writePermission.reason || 'Cannot create file in directory'
                );
            }

            // Create file
            await fs.promises.writeFile(filePath, content, 'utf8');

            this.logOperation('createFile completed successfully');
        } catch (error) {
            this.logError('createFile failed', error);
            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, filePath);
        }
    }

    /**
     * Create a new directory at specified path
     */
    async createDirectory(dirPath: string): Promise<void> {
        this.logOperation('createDirectory', { dirPath });

        try {
            // Validate directory name
            const dirName = path.basename(dirPath);
            const nameValidation = this.validateFileName(dirName);
            if (!nameValidation.isValid) {
                throw new FileOperationError(
                    FileOperationErrorType.InvalidFileName,
                    dirPath,
                    nameValidation.errorMessage || 'Invalid directory name'
                );
            }

            // Check if directory already exists
            if (await PathValidator.pathExists(dirPath)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileAlreadyExists,
                    dirPath,
                    'Directory already exists'
                );
            }

            // Check parent directory permissions
            const parentDir = path.dirname(dirPath);
            if (!await PathValidator.pathExists(parentDir)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileNotFound,
                    parentDir,
                    'Parent directory does not exist'
                );
            }

            const writePermission = await PermissionChecker.checkOperationPermission(parentDir, 'write');
            if (!writePermission.allowed) {
                throw new FileOperationError(
                    FileOperationErrorType.PermissionDenied,
                    dirPath,
                    writePermission.reason || 'Cannot create directory'
                );
            }

            // Create directory
            await fs.promises.mkdir(dirPath, { recursive: false });

            this.logOperation('createDirectory completed successfully');
        } catch (error) {
            this.logError('createDirectory failed', error);
            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, dirPath);
        }
    }

    /**
     * Validate file name
     */
    validateFileName(name: string): ValidationResult {
        return PathValidator.validateFileName(name);
    }

    /**
     * Get file statistics
     */
    async getFileStats(filePath: string): Promise<FileStats> {
        this.logOperation('getFileStats', { filePath });

        try {
            if (!await PathValidator.pathExists(filePath)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileNotFound,
                    filePath,
                    'File does not exist'
                );
            }

            const stats = await fs.promises.stat(filePath);
            const permissions = await PermissionChecker.getFilePermissions(filePath);

            const fileStats: FileStats = {
                size: stats.size,
                modified: stats.mtime,
                created: stats.birthtime,
                isDirectory: stats.isDirectory(),
                permissions
            };

            this.logOperation('getFileStats completed successfully');
            return fileStats;
        } catch (error) {
            this.logError('getFileStats failed', error);
            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, filePath);
        }
    }

    /**
     * Copy a single item (file or directory)
     */
    private async copySingleItem(source: string, destinationDir: string): Promise<void> {
        const sourceName = path.basename(source);
        const destinationPath = path.join(destinationDir, sourceName);

        // Check if source exists
        if (!await PathValidator.pathExists(source)) {
            throw new FileOperationError(
                FileOperationErrorType.FileNotFound,
                source,
                'Source file does not exist'
            );
        }

        // Check read permission on source
        const readPermission = await PermissionChecker.checkOperationPermission(source, 'read');
        if (!readPermission.allowed) {
            throw new FileOperationError(
                FileOperationErrorType.PermissionDenied,
                source,
                readPermission.reason || 'Cannot read source file'
            );
        }

        // Generate unique name if destination exists
        let finalDestination = destinationPath;
        if (await PathValidator.pathExists(destinationPath)) {
            finalDestination = await PathValidator.generateUniqueFileName(destinationDir, sourceName);
            finalDestination = path.join(destinationDir, finalDestination);
        }

        const isDirectory = await PathValidator.isDirectory(source);

        if (isDirectory) {
            await this.copyDirectory(source, finalDestination);
        } else {
            await this.copyFile(source, finalDestination);
        }
    }

    /**
     * Copy a single file
     */
    private async copyFile(source: string, destination: string): Promise<void> {
        await fs.promises.copyFile(source, destination);
    }

    /**
     * Copy a directory recursively
     */
    private async copyDirectory(source: string, destination: string): Promise<void> {
        // Create destination directory
        await fs.promises.mkdir(destination, { recursive: true });

        // Read source directory contents
        const entries = await fs.promises.readdir(source, { withFileTypes: true });

        // Copy each entry
        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const destPath = path.join(destination, entry.name);

            if (entry.isDirectory()) {
                await this.copyDirectory(sourcePath, destPath);
            } else {
                await this.copyFile(sourcePath, destPath);
            }
        }
    }

    /**
     * Move a single item (file or directory)
     */
    private async moveSingleItem(source: string, destinationDir: string): Promise<void> {
        const sourceName = path.basename(source);
        const destinationPath = path.join(destinationDir, sourceName);

        // Check if source exists
        if (!await PathValidator.pathExists(source)) {
            throw new FileOperationError(
                FileOperationErrorType.FileNotFound,
                source,
                'Source file does not exist'
            );
        }

        // Check permissions
        const deletePermission = await PermissionChecker.checkOperationPermission(source, 'delete');
        if (!deletePermission.allowed) {
            throw new FileOperationError(
                FileOperationErrorType.PermissionDenied,
                source,
                deletePermission.reason || 'Cannot move source file'
            );
        }

        // Generate unique name if destination exists
        let finalDestination = destinationPath;
        if (await PathValidator.pathExists(destinationPath)) {
            finalDestination = await PathValidator.generateUniqueFileName(destinationDir, sourceName);
            finalDestination = path.join(destinationDir, finalDestination);
        }

        // Perform move
        await fs.promises.rename(source, finalDestination);
    }

    /**
     * Delete a single item (file or directory)
     */
    private async deleteSingleItem(filePath: string): Promise<void> {
        // Check if file exists
        if (!await PathValidator.pathExists(filePath)) {
            throw new FileOperationError(
                FileOperationErrorType.FileNotFound,
                filePath,
                'File does not exist'
            );
        }

        // Check delete permission
        const deletePermission = await PermissionChecker.checkOperationPermission(filePath, 'delete');
        if (!deletePermission.allowed) {
            throw new FileOperationError(
                FileOperationErrorType.PermissionDenied,
                filePath,
                deletePermission.reason || 'Cannot delete file'
            );
        }

        const isDirectory = await PathValidator.isDirectory(filePath);

        if (isDirectory) {
            await fs.promises.rmdir(filePath, { recursive: true });
        } else {
            await fs.promises.unlink(filePath);
        }
    }

    /**
     * Log operation for debugging
     */
    private logOperation(operation: string, details?: any): void {
        const timestamp = new Date().toISOString();
        const message = details 
            ? `[${timestamp}] ${operation}: ${JSON.stringify(details)}`
            : `[${timestamp}] ${operation}`;
        
        this.outputChannel.appendLine(message);
    }

    /**
     * Log error for debugging
     */
    private logError(operation: string, error: any): void {
        const timestamp = new Date().toISOString();
        const message = `[${timestamp}] ERROR in ${operation}: ${error.message || error}`;
        
        this.outputChannel.appendLine(message);
        
        if (error.stack) {
            this.outputChannel.appendLine(`Stack trace: ${error.stack}`);
        }
    }

    // ===== Advanced Batch Operations =====

    /**
     * Copy multiple files with progress reporting and error handling
     */
    async copyFilesBatch(
        sources: string[], 
        destination: string, 
        options: BatchOperationOptions = {}
    ): Promise<BatchOperationResult> {
        this.logOperation('copyFilesBatch', { sources: sources.length, destination, options });

        const {
            continueOnError = true,
            enableRollback = false,
            progressCallback,
            maxConcurrency = 5
        } = options;

        const result: BatchOperationResult = {
            successful: [],
            failed: [],
            totalProcessed: 0
        };

        if (enableRollback) {
            this.rollbackOperations = [];
        }

        try {
            // Validate destination
            if (!await PathValidator.pathExists(destination)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileNotFound,
                    destination,
                    'Destination directory does not exist'
                );
            }

            // Process files in batches to control concurrency
            const batches = this.createBatches(sources, maxConcurrency);
            
            for (const batch of batches) {
                const promises = batch.map(async (source, index) => {
                    try {
                        const sourceName = path.basename(source);
                        let targetPath = path.join(destination, sourceName);
                        
                        // Generate unique name if target exists
                        if (await PathValidator.pathExists(targetPath)) {
                            const uniqueName = await PathValidator.generateUniqueFileName(destination, sourceName);
                            targetPath = path.join(destination, uniqueName);
                        }

                        await this.copySingleItem(source, destination);
                        
                        if (enableRollback) {
                            this.rollbackOperations.push({
                                type: 'delete',
                                originalPath: targetPath
                            });
                        }

                        result.successful.push(source);
                        result.totalProcessed++;

                        if (progressCallback) {
                            progressCallback(result.totalProcessed, sources.length, source);
                        }

                        return { success: true, path: source };
                    } catch (error) {
                        const fileOpError = error instanceof FileOperationError 
                            ? error 
                            : FileOperationError.fromError(error as Error, source);
                        
                        result.failed.push({ path: source, error: fileOpError });
                        result.totalProcessed++;

                        if (progressCallback) {
                            progressCallback(result.totalProcessed, sources.length, source);
                        }

                        if (!continueOnError) {
                            throw fileOpError;
                        }

                        return { success: false, path: source, error: fileOpError };
                    }
                });

                await Promise.all(promises);
            }

            this.logOperation('copyFilesBatch completed', result);
            return result;

        } catch (error) {
            this.logError('copyFilesBatch failed', error);
            
            if (enableRollback && this.rollbackOperations.length > 0) {
                await this.performRollback();
            }

            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, destination);
        }
    }

    /**
     * Move multiple files with progress reporting and error handling
     */
    async moveFilesBatch(
        sources: string[], 
        destination: string, 
        options: BatchOperationOptions = {}
    ): Promise<BatchOperationResult> {
        this.logOperation('moveFilesBatch', { sources: sources.length, destination, options });

        const {
            continueOnError = true,
            enableRollback = false,
            progressCallback,
            maxConcurrency = 5
        } = options;

        const result: BatchOperationResult = {
            successful: [],
            failed: [],
            totalProcessed: 0
        };

        if (enableRollback) {
            this.rollbackOperations = [];
        }

        try {
            // Validate destination
            if (!await PathValidator.pathExists(destination)) {
                throw new FileOperationError(
                    FileOperationErrorType.FileNotFound,
                    destination,
                    'Destination directory does not exist'
                );
            }

            // Process files in batches to control concurrency
            const batches = this.createBatches(sources, maxConcurrency);
            
            for (const batch of batches) {
                const promises = batch.map(async (source) => {
                    try {
                        const sourceName = path.basename(source);
                        let targetPath = path.join(destination, sourceName);
                        
                        // Generate unique name if target exists
                        if (await PathValidator.pathExists(targetPath)) {
                            const uniqueName = await PathValidator.generateUniqueFileName(destination, sourceName);
                            targetPath = path.join(destination, uniqueName);
                        }

                        if (enableRollback) {
                            // Create backup for rollback
                            this.rollbackOperations.push({
                                type: 'move',
                                originalPath: source,
                                targetPath: targetPath
                            });
                        }

                        await this.moveSingleItem(source, destination);
                        
                        result.successful.push(source);
                        result.totalProcessed++;

                        if (progressCallback) {
                            progressCallback(result.totalProcessed, sources.length, source);
                        }

                        return { success: true, path: source };
                    } catch (error) {
                        const fileOpError = error instanceof FileOperationError 
                            ? error 
                            : FileOperationError.fromError(error as Error, source);
                        
                        result.failed.push({ path: source, error: fileOpError });
                        result.totalProcessed++;

                        if (progressCallback) {
                            progressCallback(result.totalProcessed, sources.length, source);
                        }

                        if (!continueOnError) {
                            throw fileOpError;
                        }

                        return { success: false, path: source, error: fileOpError };
                    }
                });

                await Promise.all(promises);
            }

            this.logOperation('moveFilesBatch completed', result);
            return result;

        } catch (error) {
            this.logError('moveFilesBatch failed', error);
            
            if (enableRollback && this.rollbackOperations.length > 0) {
                await this.performRollback();
            }

            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, destination);
        }
    }

    /**
     * Delete multiple files with progress reporting and error handling
     */
    async deleteFilesBatch(
        paths: string[], 
        options: BatchOperationOptions = {}
    ): Promise<BatchOperationResult> {
        this.logOperation('deleteFilesBatch', { paths: paths.length, options });

        const {
            continueOnError = true,
            enableRollback = false,
            progressCallback,
            maxConcurrency = 5
        } = options;

        const result: BatchOperationResult = {
            successful: [],
            failed: [],
            totalProcessed: 0
        };

        if (enableRollback) {
            this.rollbackOperations = [];
        }

        try {
            // Process files in batches to control concurrency
            const batches = this.createBatches(paths, maxConcurrency);
            
            for (const batch of batches) {
                const promises = batch.map(async (filePath) => {
                    try {
                        if (enableRollback) {
                            // Create backup for rollback
                            const isDirectory = await PathValidator.isDirectory(filePath);
                            if (!isDirectory) {
                                const content = await fs.promises.readFile(filePath);
                                this.rollbackOperations.push({
                                    type: 'create',
                                    originalPath: filePath,
                                    content: content
                                });
                            } else {
                                // For directories, we'd need more complex backup logic
                                // For now, just record the operation
                                this.rollbackOperations.push({
                                    type: 'create',
                                    originalPath: filePath
                                });
                            }
                        }

                        await this.deleteSingleItem(filePath);
                        
                        result.successful.push(filePath);
                        result.totalProcessed++;

                        if (progressCallback) {
                            progressCallback(result.totalProcessed, paths.length, filePath);
                        }

                        return { success: true, path: filePath };
                    } catch (error) {
                        const fileOpError = error instanceof FileOperationError 
                            ? error 
                            : FileOperationError.fromError(error as Error, filePath);
                        
                        result.failed.push({ path: filePath, error: fileOpError });
                        result.totalProcessed++;

                        if (progressCallback) {
                            progressCallback(result.totalProcessed, paths.length, filePath);
                        }

                        if (!continueOnError) {
                            throw fileOpError;
                        }

                        return { success: false, path: filePath, error: fileOpError };
                    }
                });

                await Promise.all(promises);
            }

            this.logOperation('deleteFilesBatch completed', result);
            return result;

        } catch (error) {
            this.logError('deleteFilesBatch failed', error);
            
            if (enableRollback && this.rollbackOperations.length > 0) {
                await this.performRollback();
            }

            throw error instanceof FileOperationError ? error : FileOperationError.fromError(error as Error, paths[0]);
        }
    }

    /**
     * Create batches for concurrent processing
     */
    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Perform rollback operations
     */
    private async performRollback(): Promise<void> {
        this.logOperation('performRollback', { operations: this.rollbackOperations.length });

        // Reverse the operations to undo them in reverse order
        const reversedOperations = [...this.rollbackOperations].reverse();

        for (const operation of reversedOperations) {
            try {
                switch (operation.type) {
                    case 'create':
                        // Undo create by deleting
                        if (await PathValidator.pathExists(operation.originalPath)) {
                            await this.deleteSingleItem(operation.originalPath);
                        }
                        break;

                    case 'delete':
                        // Undo delete by recreating
                        if (operation.content) {
                            await fs.promises.writeFile(operation.originalPath, operation.content);
                        }
                        break;

                    case 'move':
                        // Undo move by moving back
                        if (operation.targetPath && await PathValidator.pathExists(operation.targetPath)) {
                            await fs.promises.rename(operation.targetPath, operation.originalPath);
                        }
                        break;

                    case 'copy':
                        // Undo copy by deleting the copy
                        if (operation.targetPath && await PathValidator.pathExists(operation.targetPath)) {
                            await this.deleteSingleItem(operation.targetPath);
                        }
                        break;
                }
            } catch (error) {
                this.logError(`Rollback failed for operation ${operation.type}`, error);
                // Continue with other rollback operations even if one fails
            }
        }

        this.rollbackOperations = [];
        this.logOperation('performRollback completed');
    }

    /**
     * Get rollback operations (for testing/debugging)
     */
    getRollbackOperations(): RollbackOperation[] {
        return [...this.rollbackOperations];
    }

    /**
     * Clear rollback operations
     */
    clearRollbackOperations(): void {
        this.rollbackOperations = [];
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}