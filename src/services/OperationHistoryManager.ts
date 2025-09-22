import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';
import { DebugLogger } from './DebugLogger';

/**
 * Operation types that can be tracked and undone
 */
export enum OperationType {
    Copy = 'copy',
    Move = 'move',
    Delete = 'delete',
    Rename = 'rename',
    Create = 'create',
    CreateFolder = 'createFolder'
}

/**
 * Operation status
 */
export enum OperationStatus {
    Pending = 'pending',
    InProgress = 'inProgress',
    Completed = 'completed',
    Failed = 'failed',
    Undone = 'undone'
}

/**
 * Base interface for all operations
 */
export interface BaseOperation {
    id: string;
    type: OperationType;
    timestamp: Date;
    status: OperationStatus;
    description: string;
    canUndo: boolean;
    error?: FileOperationError;
}

/**
 * Copy operation details
 */
export interface CopyOperation extends BaseOperation {
    type: OperationType.Copy;
    sourcePaths: string[];
    targetDirectory: string;
    createdFiles: string[];
}

/**
 * Move operation details
 */
export interface MoveOperation extends BaseOperation {
    type: OperationType.Move;
    sourcePaths: string[];
    targetDirectory: string;
    originalPaths: string[];
    movedFiles: string[];
}

/**
 * Delete operation details
 */
export interface DeleteOperation extends BaseOperation {
    type: OperationType.Delete;
    deletedPaths: string[];
    backupLocation?: string;
    fileContents: Map<string, Buffer>;
}

/**
 * Rename operation details
 */
export interface RenameOperation extends BaseOperation {
    type: OperationType.Rename;
    originalPath: string;
    newPath: string;
}

/**
 * Create operation details
 */
export interface CreateOperation extends BaseOperation {
    type: OperationType.Create;
    createdPath: string;
    initialContent?: string;
}

/**
 * Create folder operation details
 */
export interface CreateFolderOperation extends BaseOperation {
    type: OperationType.CreateFolder;
    createdPath: string;
}

/**
 * Union type for all operations
 */
export type Operation = CopyOperation | MoveOperation | DeleteOperation | 
                       RenameOperation | CreateOperation | CreateFolderOperation;

/**
 * Operation history configuration
 */
export interface OperationHistoryConfig {
    maxHistorySize: number;
    enableBackups: boolean;
    backupDirectory: string;
    autoCleanupAge: number; // in milliseconds
}

/**
 * Operation history manager for tracking and undoing file operations
 */
export class OperationHistoryManager {
    private static instance: OperationHistoryManager;
    private readonly operations: Map<string, Operation> = new Map();
    private readonly operationOrder: string[] = [];
    private readonly config: OperationHistoryConfig;
    private readonly logger: DebugLogger;

    private constructor() {
        this.config = this.loadConfiguration();
        this.logger = DebugLogger.getInstance();
        this.initializeBackupDirectory();
        this.startCleanupTimer();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): OperationHistoryManager {
        if (!OperationHistoryManager.instance) {
            OperationHistoryManager.instance = new OperationHistoryManager();
        }
        return OperationHistoryManager.instance;
    }

    /**
     * Record a copy operation
     */
    async recordCopyOperation(
        sourcePaths: string[], 
        targetDirectory: string
    ): Promise<string> {
        const operation: CopyOperation = {
            id: this.generateOperationId(),
            type: OperationType.Copy,
            timestamp: new Date(),
            status: OperationStatus.Pending,
            description: `Copy ${sourcePaths.length} item(s) to ${path.basename(targetDirectory)}`,
            canUndo: true,
            sourcePaths,
            targetDirectory,
            createdFiles: []
        };

        this.addOperation(operation);
        this.logger.info('OperationHistory', `Recorded copy operation: ${operation.id}`);
        
        return operation.id;
    }

    /**
     * Record a move operation
     */
    async recordMoveOperation(
        sourcePaths: string[], 
        targetDirectory: string
    ): Promise<string> {
        const operation: MoveOperation = {
            id: this.generateOperationId(),
            type: OperationType.Move,
            timestamp: new Date(),
            status: OperationStatus.Pending,
            description: `Move ${sourcePaths.length} item(s) to ${path.basename(targetDirectory)}`,
            canUndo: true,
            sourcePaths,
            targetDirectory,
            originalPaths: [...sourcePaths],
            movedFiles: []
        };

        this.addOperation(operation);
        this.logger.info('OperationHistory', `Recorded move operation: ${operation.id}`);
        
        return operation.id;
    }

    /**
     * Record a delete operation
     */
    async recordDeleteOperation(deletedPaths: string[]): Promise<string> {
        const operation: DeleteOperation = {
            id: this.generateOperationId(),
            type: OperationType.Delete,
            timestamp: new Date(),
            status: OperationStatus.Pending,
            description: `Delete ${deletedPaths.length} item(s)`,
            canUndo: true,
            deletedPaths,
            fileContents: new Map()
        };

        // Create backups if enabled
        if (this.config.enableBackups) {
            await this.createBackups(operation, deletedPaths);
        }

        this.addOperation(operation);
        this.logger.info('OperationHistory', `Recorded delete operation: ${operation.id}`);
        
        return operation.id;
    }

    /**
     * Record a rename operation
     */
    async recordRenameOperation(originalPath: string, newPath: string): Promise<string> {
        const operation: RenameOperation = {
            id: this.generateOperationId(),
            type: OperationType.Rename,
            timestamp: new Date(),
            status: OperationStatus.Pending,
            description: `Rename ${path.basename(originalPath)} to ${path.basename(newPath)}`,
            canUndo: true,
            originalPath,
            newPath
        };

        this.addOperation(operation);
        this.logger.info('OperationHistory', `Recorded rename operation: ${operation.id}`);
        
        return operation.id;
    }

    /**
     * Record a create operation
     */
    async recordCreateOperation(createdPath: string, initialContent?: string): Promise<string> {
        const operation: CreateOperation = {
            id: this.generateOperationId(),
            type: OperationType.Create,
            timestamp: new Date(),
            status: OperationStatus.Pending,
            description: `Create ${path.basename(createdPath)}`,
            canUndo: true,
            createdPath,
            initialContent
        };

        this.addOperation(operation);
        this.logger.info('OperationHistory', `Recorded create operation: ${operation.id}`);
        
        return operation.id;
    }

    /**
     * Record a create folder operation
     */
    async recordCreateFolderOperation(createdPath: string): Promise<string> {
        const operation: CreateFolderOperation = {
            id: this.generateOperationId(),
            type: OperationType.CreateFolder,
            timestamp: new Date(),
            status: OperationStatus.Pending,
            description: `Create folder ${path.basename(createdPath)}`,
            canUndo: true,
            createdPath
        };

        this.addOperation(operation);
        this.logger.info('OperationHistory', `Recorded create folder operation: ${operation.id}`);
        
        return operation.id;
    }

    /**
     * Update operation status
     */
    updateOperationStatus(operationId: string, status: OperationStatus, error?: FileOperationError): void {
        const operation = this.operations.get(operationId);
        if (operation) {
            operation.status = status;
            if (error) {
                operation.error = error;
                operation.canUndo = false; // Failed operations typically can't be undone
            }
            
            this.logger.info('OperationHistory', `Updated operation ${operationId} status to ${status}`);
        }
    }

    /**
     * Mark files as created for copy/move operations
     */
    markFilesCreated(operationId: string, createdFiles: string[]): void {
        const operation = this.operations.get(operationId);
        if (operation && (operation.type === OperationType.Copy || operation.type === OperationType.Move)) {
            if (operation.type === OperationType.Copy) {
                operation.createdFiles.push(...createdFiles);
            } else {
                operation.movedFiles.push(...createdFiles);
            }
        }
    }

    /**
     * Undo an operation
     */
    async undoOperation(operationId: string): Promise<boolean> {
        const operation = this.operations.get(operationId);
        if (!operation) {
            throw new FileOperationError(
                FileOperationErrorType.UnknownError,
                '',
                `Operation ${operationId} not found`
            );
        }

        if (!operation.canUndo) {
            throw new FileOperationError(
                FileOperationErrorType.UnknownError,
                '',
                `Operation ${operationId} cannot be undone`
            );
        }

        if (operation.status === OperationStatus.Undone) {
            throw new FileOperationError(
                FileOperationErrorType.UnknownError,
                '',
                `Operation ${operationId} has already been undone`
            );
        }

        try {
            const success = await this.performUndo(operation);
            if (success) {
                operation.status = OperationStatus.Undone;
                this.logger.info('OperationHistory', `Successfully undid operation: ${operationId}`);
            }
            return success;
        } catch (error) {
            this.logger.error('OperationHistory', `Failed to undo operation ${operationId}`, error as Error);
            throw error;
        }
    }

    /**
     * Get operation history
     */
    getOperationHistory(limit?: number): Operation[] {
        const operations = this.operationOrder
            .slice(limit ? -limit : undefined)
            .map(id => this.operations.get(id))
            .filter((op): op is Operation => op !== undefined)
            .reverse(); // Most recent first

        return operations;
    }

    /**
     * Get undoable operations
     */
    getUndoableOperations(limit?: number): Operation[] {
        return this.getOperationHistory(limit)
            .filter(op => op.canUndo && op.status === OperationStatus.Completed);
    }

    /**
     * Clear operation history
     */
    clearHistory(): void {
        this.operations.clear();
        this.operationOrder.length = 0;
        this.logger.info('OperationHistory', 'Cleared operation history');
    }

    /**
     * Get operation by ID
     */
    getOperation(operationId: string): Operation | undefined {
        return this.operations.get(operationId);
    }

    /**
     * Perform the actual undo operation
     */
    private async performUndo(operation: Operation): Promise<boolean> {
        switch (operation.type) {
            case OperationType.Copy:
                return await this.undoCopyOperation(operation);
            
            case OperationType.Move:
                return await this.undoMoveOperation(operation);
            
            case OperationType.Delete:
                return await this.undoDeleteOperation(operation);
            
            case OperationType.Rename:
                return await this.undoRenameOperation(operation);
            
            case OperationType.Create:
                return await this.undoCreateOperation(operation);
            
            case OperationType.CreateFolder:
                return await this.undoCreateFolderOperation(operation);
            
            default:
                return false;
        }
    }

    /**
     * Undo copy operation by deleting copied files
     */
    private async undoCopyOperation(operation: CopyOperation): Promise<boolean> {
        try {
            for (const createdFile of operation.createdFiles) {
                if (fs.existsSync(createdFile)) {
                    const stat = fs.statSync(createdFile);
                    if (stat.isDirectory()) {
                        fs.rmSync(createdFile, { recursive: true });
                    } else {
                        fs.unlinkSync(createdFile);
                    }
                }
            }
            return true;
        } catch (error) {
            this.logger.error('OperationHistory', 'Failed to undo copy operation', error as Error);
            return false;
        }
    }

    /**
     * Undo move operation by moving files back
     */
    private async undoMoveOperation(operation: MoveOperation): Promise<boolean> {
        try {
            for (let i = 0; i < operation.movedFiles.length; i++) {
                const movedFile = operation.movedFiles[i];
                const originalPath = operation.originalPaths[i];
                
                if (fs.existsSync(movedFile)) {
                    // Ensure target directory exists
                    const targetDir = path.dirname(originalPath);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }
                    
                    fs.renameSync(movedFile, originalPath);
                }
            }
            return true;
        } catch (error) {
            this.logger.error('OperationHistory', 'Failed to undo move operation', error as Error);
            return false;
        }
    }

    /**
     * Undo delete operation by restoring from backup
     */
    private async undoDeleteOperation(operation: DeleteOperation): Promise<boolean> {
        try {
            if (operation.backupLocation) {
                // Restore from backup directory
                for (const deletedPath of operation.deletedPaths) {
                    const backupPath = path.join(operation.backupLocation, path.basename(deletedPath));
                    if (fs.existsSync(backupPath)) {
                        // Ensure target directory exists
                        const targetDir = path.dirname(deletedPath);
                        if (!fs.existsSync(targetDir)) {
                            fs.mkdirSync(targetDir, { recursive: true });
                        }
                        
                        const stat = fs.statSync(backupPath);
                        if (stat.isDirectory()) {
                            this.copyDirectory(backupPath, deletedPath);
                        } else {
                            fs.copyFileSync(backupPath, deletedPath);
                        }
                    }
                }
            } else {
                // Restore from in-memory content
                for (const [filePath, content] of operation.fileContents) {
                    const targetDir = path.dirname(filePath);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }
                    fs.writeFileSync(filePath, content);
                }
            }
            return true;
        } catch (error) {
            this.logger.error('OperationHistory', 'Failed to undo delete operation', error as Error);
            return false;
        }
    }

    /**
     * Undo rename operation
     */
    private async undoRenameOperation(operation: RenameOperation): Promise<boolean> {
        try {
            if (fs.existsSync(operation.newPath)) {
                fs.renameSync(operation.newPath, operation.originalPath);
            }
            return true;
        } catch (error) {
            this.logger.error('OperationHistory', 'Failed to undo rename operation', error as Error);
            return false;
        }
    }

    /**
     * Undo create operation by deleting created file
     */
    private async undoCreateOperation(operation: CreateOperation): Promise<boolean> {
        try {
            if (fs.existsSync(operation.createdPath)) {
                fs.unlinkSync(operation.createdPath);
            }
            return true;
        } catch (error) {
            this.logger.error('OperationHistory', 'Failed to undo create operation', error as Error);
            return false;
        }
    }

    /**
     * Undo create folder operation by deleting created folder
     */
    private async undoCreateFolderOperation(operation: CreateFolderOperation): Promise<boolean> {
        try {
            if (fs.existsSync(operation.createdPath)) {
                fs.rmSync(operation.createdPath, { recursive: true });
            }
            return true;
        } catch (error) {
            this.logger.error('OperationHistory', 'Failed to undo create folder operation', error as Error);
            return false;
        }
    }

    /**
     * Create backups for delete operation
     */
    private async createBackups(operation: DeleteOperation, deletedPaths: string[]): Promise<void> {
        try {
            const backupDir = path.join(this.config.backupDirectory, operation.id);
            fs.mkdirSync(backupDir, { recursive: true });
            operation.backupLocation = backupDir;

            for (const deletedPath of deletedPaths) {
                if (fs.existsSync(deletedPath)) {
                    const backupPath = path.join(backupDir, path.basename(deletedPath));
                    const stat = fs.statSync(deletedPath);
                    
                    if (stat.isDirectory()) {
                        this.copyDirectory(deletedPath, backupPath);
                    } else {
                        // For small files, also store in memory
                        if (stat.size < 1024 * 1024) { // 1MB limit
                            const content = fs.readFileSync(deletedPath);
                            operation.fileContents.set(deletedPath, content);
                        }
                        fs.copyFileSync(deletedPath, backupPath);
                    }
                }
            }
        } catch (error) {
            this.logger.error('OperationHistory', 'Failed to create backups', error as Error);
            // Continue without backups
        }
    }

    /**
     * Copy directory recursively
     */
    private copyDirectory(source: string, target: string): void {
        if (!fs.existsSync(target)) {
            fs.mkdirSync(target, { recursive: true });
        }

        const items = fs.readdirSync(source);
        for (const item of items) {
            const sourcePath = path.join(source, item);
            const targetPath = path.join(target, item);
            const stat = fs.statSync(sourcePath);

            if (stat.isDirectory()) {
                this.copyDirectory(sourcePath, targetPath);
            } else {
                fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }

    /**
     * Add operation to history
     */
    private addOperation(operation: Operation): void {
        this.operations.set(operation.id, operation);
        this.operationOrder.push(operation.id);

        // Maintain history size limit
        while (this.operationOrder.length > this.config.maxHistorySize) {
            const oldestId = this.operationOrder.shift();
            if (oldestId) {
                const oldOperation = this.operations.get(oldestId);
                this.operations.delete(oldestId);
                
                // Cleanup backup if exists
                if (oldOperation?.type === OperationType.Delete && oldOperation.backupLocation) {
                    try {
                        fs.rmSync(oldOperation.backupLocation, { recursive: true, force: true });
                    } catch {
                        // Ignore cleanup errors
                    }
                }
            }
        }
    }

    /**
     * Generate unique operation ID
     */
    private generateOperationId(): string {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Load configuration
     */
    private loadConfiguration(): OperationHistoryConfig {
        const config = vscode.workspace.getConfiguration('fileListExtension.operationHistory');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const defaultBackupDir = workspaceFolder 
            ? path.join(workspaceFolder.uri.fsPath, '.vscode', 'file-operation-backups')
            : path.join(require('os').tmpdir(), 'vscode-file-operation-backups');

        return {
            maxHistorySize: config.get('maxHistorySize', 100),
            enableBackups: config.get('enableBackups', true),
            backupDirectory: config.get('backupDirectory', defaultBackupDir),
            autoCleanupAge: config.get('autoCleanupAge', 7 * 24 * 60 * 60 * 1000) // 7 days
        };
    }

    /**
     * Initialize backup directory
     */
    private initializeBackupDirectory(): void {
        if (this.config.enableBackups && !fs.existsSync(this.config.backupDirectory)) {
            try {
                fs.mkdirSync(this.config.backupDirectory, { recursive: true });
            } catch (error) {
                this.logger.error('OperationHistory', 'Failed to create backup directory', error as Error);
            }
        }
    }

    /**
     * Start cleanup timer for old operations
     */
    private startCleanupTimer(): void {
        setInterval(() => {
            this.cleanupOldOperations();
        }, 60 * 60 * 1000); // Run every hour
    }

    /**
     * Cleanup old operations and backups
     */
    private cleanupOldOperations(): void {
        const cutoffTime = new Date(Date.now() - this.config.autoCleanupAge);
        const operationsToRemove: string[] = [];

        for (const [id, operation] of this.operations) {
            if (operation.timestamp < cutoffTime) {
                operationsToRemove.push(id);
                
                // Cleanup backup if exists
                if (operation.type === OperationType.Delete && operation.backupLocation) {
                    try {
                        fs.rmSync(operation.backupLocation, { recursive: true, force: true });
                    } catch {
                        // Ignore cleanup errors
                    }
                }
            }
        }

        // Remove old operations
        for (const id of operationsToRemove) {
            this.operations.delete(id);
            const index = this.operationOrder.indexOf(id);
            if (index > -1) {
                this.operationOrder.splice(index, 1);
            }
        }

        if (operationsToRemove.length > 0) {
            this.logger.info('OperationHistory', `Cleaned up ${operationsToRemove.length} old operations`);
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        // Cleanup any remaining resources
        this.cleanupOldOperations();
    }
}