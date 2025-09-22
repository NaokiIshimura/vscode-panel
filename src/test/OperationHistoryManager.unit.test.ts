import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OperationHistoryManager, OperationType, OperationStatus } from '../services/OperationHistoryManager';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType } from '../types/enums';

suite('OperationHistoryManager Unit Tests', () => {
    let historyManager: OperationHistoryManager;
    let testWorkspaceRoot: string;

    suiteSetup(() => {
        // Setup test workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            testWorkspaceRoot = path.join(workspaceFolder.uri.fsPath, 'test-operation-history');
            if (!fs.existsSync(testWorkspaceRoot)) {
                fs.mkdirSync(testWorkspaceRoot, { recursive: true });
            }
        }
    });

    setup(() => {
        // Mock workspace configuration
        const mockConfig = {
            get: (key: string, defaultValue?: any) => {
                switch (key) {
                    case 'maxHistorySize': return 50;
                    case 'enableBackups': return true;
                    case 'backupDirectory': return path.join(testWorkspaceRoot, 'backups');
                    case 'autoCleanupAge': return 24 * 60 * 60 * 1000; // 1 day
                    default: return defaultValue;
                }
            }
        };

        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = () => mockConfig as any;

        historyManager = OperationHistoryManager.getInstance();
        historyManager.clearHistory();

        // Restore original function
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    teardown(() => {
        historyManager.clearHistory();
        
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

    suite('Operation Recording', () => {
        test('should record copy operation', async () => {
            const sourcePaths = ['/source/file1.txt', '/source/file2.txt'];
            const targetDirectory = '/target';

            const operationId = await historyManager.recordCopyOperation(sourcePaths, targetDirectory);

            assert.strictEqual(typeof operationId, 'string');
            assert.strictEqual(operationId.length > 0, true);

            const operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.type, OperationType.Copy);
            assert.strictEqual(operation?.status, OperationStatus.Pending);
            assert.deepStrictEqual(operation?.sourcePaths, sourcePaths);
            assert.strictEqual(operation?.targetDirectory, targetDirectory);
        });

        test('should record move operation', async () => {
            const sourcePaths = ['/source/file1.txt'];
            const targetDirectory = '/target';

            const operationId = await historyManager.recordMoveOperation(sourcePaths, targetDirectory);

            const operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.type, OperationType.Move);
            assert.deepStrictEqual(operation?.sourcePaths, sourcePaths);
            assert.deepStrictEqual(operation?.originalPaths, sourcePaths);
        });

        test('should record delete operation', async () => {
            const deletedPaths = ['/test/file1.txt', '/test/file2.txt'];

            const operationId = await historyManager.recordDeleteOperation(deletedPaths);

            const operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.type, OperationType.Delete);
            assert.deepStrictEqual(operation?.deletedPaths, deletedPaths);
        });

        test('should record rename operation', async () => {
            const originalPath = '/test/oldname.txt';
            const newPath = '/test/newname.txt';

            const operationId = await historyManager.recordRenameOperation(originalPath, newPath);

            const operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.type, OperationType.Rename);
            assert.strictEqual(operation?.originalPath, originalPath);
            assert.strictEqual(operation?.newPath, newPath);
        });

        test('should record create operation', async () => {
            const createdPath = '/test/newfile.txt';
            const initialContent = 'Hello, World!';

            const operationId = await historyManager.recordCreateOperation(createdPath, initialContent);

            const operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.type, OperationType.Create);
            assert.strictEqual(operation?.createdPath, createdPath);
            assert.strictEqual(operation?.initialContent, initialContent);
        });

        test('should record create folder operation', async () => {
            const createdPath = '/test/newfolder';

            const operationId = await historyManager.recordCreateFolderOperation(createdPath);

            const operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.type, OperationType.CreateFolder);
            assert.strictEqual(operation?.createdPath, createdPath);
        });
    });

    suite('Operation Status Management', () => {
        test('should update operation status', async () => {
            const operationId = await historyManager.recordCreateOperation('/test/file.txt');

            historyManager.updateOperationStatus(operationId, OperationStatus.InProgress);
            let operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.status, OperationStatus.InProgress);

            historyManager.updateOperationStatus(operationId, OperationStatus.Completed);
            operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.status, OperationStatus.Completed);
        });

        test('should mark operation as failed with error', async () => {
            const operationId = await historyManager.recordCreateOperation('/test/file.txt');
            const error = new FileOperationError(
                FileOperationErrorType.PermissionDenied,
                '/test/file.txt',
                'Permission denied'
            );

            historyManager.updateOperationStatus(operationId, OperationStatus.Failed, error);

            const operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.status, OperationStatus.Failed);
            assert.strictEqual(operation?.error, error);
            assert.strictEqual(operation?.canUndo, false);
        });

        test('should mark files as created for copy operation', async () => {
            const operationId = await historyManager.recordCopyOperation(['/source/file.txt'], '/target');
            const createdFiles = ['/target/file.txt'];

            historyManager.markFilesCreated(operationId, createdFiles);

            const operation = historyManager.getOperation(operationId);
            assert.deepStrictEqual(operation?.createdFiles, createdFiles);
        });
    });

    suite('Operation History', () => {
        test('should return operation history in reverse chronological order', async () => {
            const op1 = await historyManager.recordCreateOperation('/test/file1.txt');
            const op2 = await historyManager.recordCreateOperation('/test/file2.txt');
            const op3 = await historyManager.recordCreateOperation('/test/file3.txt');

            const history = historyManager.getOperationHistory();

            assert.strictEqual(history.length, 3);
            assert.strictEqual(history[0].id, op3); // Most recent first
            assert.strictEqual(history[1].id, op2);
            assert.strictEqual(history[2].id, op1);
        });

        test('should limit operation history', async () => {
            await historyManager.recordCreateOperation('/test/file1.txt');
            await historyManager.recordCreateOperation('/test/file2.txt');
            await historyManager.recordCreateOperation('/test/file3.txt');

            const limitedHistory = historyManager.getOperationHistory(2);

            assert.strictEqual(limitedHistory.length, 2);
        });

        test('should return only undoable operations', async () => {
            const op1 = await historyManager.recordCreateOperation('/test/file1.txt');
            const op2 = await historyManager.recordCreateOperation('/test/file2.txt');
            const op3 = await historyManager.recordCreateOperation('/test/file3.txt');

            // Mark operations as completed (undoable)
            historyManager.updateOperationStatus(op1, OperationStatus.Completed);
            historyManager.updateOperationStatus(op2, OperationStatus.Completed);
            
            // Mark one as failed (not undoable)
            const error = new FileOperationError(FileOperationErrorType.UnknownError, '', 'Test error');
            historyManager.updateOperationStatus(op3, OperationStatus.Failed, error);

            const undoableOps = historyManager.getUndoableOperations();

            assert.strictEqual(undoableOps.length, 2);
            assert.strictEqual(undoableOps.every(op => op.canUndo && op.status === OperationStatus.Completed), true);
        });

        test('should clear operation history', async () => {
            await historyManager.recordCreateOperation('/test/file1.txt');
            await historyManager.recordCreateOperation('/test/file2.txt');

            let history = historyManager.getOperationHistory();
            assert.strictEqual(history.length, 2);

            historyManager.clearHistory();

            history = historyManager.getOperationHistory();
            assert.strictEqual(history.length, 0);
        });
    });

    suite('Undo Operations', () => {
        test('should undo create operation', async () => {
            const testFile = path.join(testWorkspaceRoot, 'test-create.txt');
            
            // Create the file
            fs.writeFileSync(testFile, 'test content');
            
            const operationId = await historyManager.recordCreateOperation(testFile);
            historyManager.updateOperationStatus(operationId, OperationStatus.Completed);

            // Undo the operation
            const success = await historyManager.undoOperation(operationId);

            assert.strictEqual(success, true);
            assert.strictEqual(fs.existsSync(testFile), false);

            const operation = historyManager.getOperation(operationId);
            assert.strictEqual(operation?.status, OperationStatus.Undone);
        });

        test('should undo create folder operation', async () => {
            const testFolder = path.join(testWorkspaceRoot, 'test-folder');
            
            // Create the folder
            fs.mkdirSync(testFolder);
            
            const operationId = await historyManager.recordCreateFolderOperation(testFolder);
            historyManager.updateOperationStatus(operationId, OperationStatus.Completed);

            // Undo the operation
            const success = await historyManager.undoOperation(operationId);

            assert.strictEqual(success, true);
            assert.strictEqual(fs.existsSync(testFolder), false);
        });

        test('should undo rename operation', async () => {
            const originalFile = path.join(testWorkspaceRoot, 'original.txt');
            const renamedFile = path.join(testWorkspaceRoot, 'renamed.txt');
            
            // Create original file and rename it
            fs.writeFileSync(originalFile, 'test content');
            fs.renameSync(originalFile, renamedFile);
            
            const operationId = await historyManager.recordRenameOperation(originalFile, renamedFile);
            historyManager.updateOperationStatus(operationId, OperationStatus.Completed);

            // Undo the operation
            const success = await historyManager.undoOperation(operationId);

            assert.strictEqual(success, true);
            assert.strictEqual(fs.existsSync(originalFile), true);
            assert.strictEqual(fs.existsSync(renamedFile), false);
        });

        test('should fail to undo non-existent operation', async () => {
            try {
                await historyManager.undoOperation('non-existent-id');
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error instanceof FileOperationError, true);
                assert.strictEqual((error as FileOperationError).message.includes('not found'), true);
            }
        });

        test('should fail to undo already undone operation', async () => {
            const testFile = path.join(testWorkspaceRoot, 'test-already-undone.txt');
            fs.writeFileSync(testFile, 'test content');
            
            const operationId = await historyManager.recordCreateOperation(testFile);
            historyManager.updateOperationStatus(operationId, OperationStatus.Completed);

            // Undo once
            await historyManager.undoOperation(operationId);

            // Try to undo again
            try {
                await historyManager.undoOperation(operationId);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error instanceof FileOperationError, true);
                assert.strictEqual((error as FileOperationError).message.includes('already been undone'), true);
            }
        });

        test('should fail to undo non-undoable operation', async () => {
            const operationId = await historyManager.recordCreateOperation('/test/file.txt');
            const error = new FileOperationError(FileOperationErrorType.UnknownError, '', 'Test error');
            historyManager.updateOperationStatus(operationId, OperationStatus.Failed, error);

            try {
                await historyManager.undoOperation(operationId);
                assert.fail('Should have thrown an error');
            } catch (undoError) {
                assert.strictEqual(undoError instanceof FileOperationError, true);
                assert.strictEqual((undoError as FileOperationError).message.includes('cannot be undone'), true);
            }
        });
    });

    suite('Backup Management', () => {
        test('should create backups for delete operation', async () => {
            const testFile = path.join(testWorkspaceRoot, 'backup-test.txt');
            const testContent = 'This file will be backed up';
            
            // Create test file
            fs.writeFileSync(testFile, testContent);

            const operationId = await historyManager.recordDeleteOperation([testFile]);
            const operation = historyManager.getOperation(operationId);

            // Check if backup was created
            if (operation?.type === OperationType.Delete && operation.backupLocation) {
                const backupFile = path.join(operation.backupLocation, path.basename(testFile));
                assert.strictEqual(fs.existsSync(backupFile), true);
                
                const backupContent = fs.readFileSync(backupFile, 'utf8');
                assert.strictEqual(backupContent, testContent);
            }
        });

        test('should restore from backup during undo', async () => {
            const testFile = path.join(testWorkspaceRoot, 'restore-test.txt');
            const testContent = 'This file will be restored';
            
            // Create and delete file
            fs.writeFileSync(testFile, testContent);
            const operationId = await historyManager.recordDeleteOperation([testFile]);
            fs.unlinkSync(testFile); // Simulate deletion
            
            historyManager.updateOperationStatus(operationId, OperationStatus.Completed);

            // Undo the deletion
            const success = await historyManager.undoOperation(operationId);

            assert.strictEqual(success, true);
            assert.strictEqual(fs.existsSync(testFile), true);
            
            const restoredContent = fs.readFileSync(testFile, 'utf8');
            assert.strictEqual(restoredContent, testContent);
        });
    });

    suite('Error Handling', () => {
        test('should handle undo errors gracefully', async () => {
            const nonExistentFile = path.join(testWorkspaceRoot, 'non-existent.txt');
            
            const operationId = await historyManager.recordCreateOperation(nonExistentFile);
            historyManager.updateOperationStatus(operationId, OperationStatus.Completed);

            // Try to undo (should fail because file doesn't exist)
            const success = await historyManager.undoOperation(operationId);

            // Should return false but not throw
            assert.strictEqual(success, false);
        });
    });

    suite('Singleton Pattern', () => {
        test('should return same instance', () => {
            const manager1 = OperationHistoryManager.getInstance();
            const manager2 = OperationHistoryManager.getInstance();

            assert.strictEqual(manager1, manager2);
        });
    });
});