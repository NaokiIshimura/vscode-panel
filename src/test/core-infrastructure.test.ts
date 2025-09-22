import * as assert from 'assert';
import * as path from 'path';
import { EnhancedFileItem } from '../models/EnhancedFileItem';
import { PathValidator } from '../utils/PathValidator';
import { PermissionChecker } from '../utils/PermissionChecker';
import { FileOperationError } from '../errors/FileOperationError';
import { FileOperationErrorType, SortOrder } from '../types/enums';
import * as vscode from 'vscode';

suite('Core Infrastructure Tests', () => {
    
    suite('EnhancedFileItem', () => {
        test('should create file item correctly', () => {
            const testPath = '/test/file.txt';
            const testDate = new Date();
            
            const fileItem = new EnhancedFileItem(
                'file.txt',
                vscode.TreeItemCollapsibleState.None,
                testPath,
                false,
                1024,
                testDate
            );
            
            assert.strictEqual(fileItem.label, 'file.txt');
            assert.strictEqual(fileItem.filePath, testPath);
            assert.strictEqual(fileItem.isDirectory, false);
            assert.strictEqual(fileItem.size, 1024);
            assert.strictEqual(fileItem.modified, testDate);
            assert.strictEqual(fileItem.id, testPath);
        });
        
        test('should create directory item correctly', () => {
            const testPath = '/test/folder';
            const testDate = new Date();
            
            const dirItem = new EnhancedFileItem(
                'folder',
                vscode.TreeItemCollapsibleState.Collapsed,
                testPath,
                true,
                0,
                testDate
            );
            
            assert.strictEqual(dirItem.label, 'folder');
            assert.strictEqual(dirItem.isDirectory, true);
            assert.strictEqual(dirItem.contextValue, 'directory');
        });
        
        test('should match search query correctly', () => {
            const fileItem = new EnhancedFileItem(
                'TestFile.txt',
                vscode.TreeItemCollapsibleState.None,
                '/test/TestFile.txt',
                false,
                1024,
                new Date()
            );
            
            assert.strictEqual(fileItem.matchesSearch('test'), true);
            assert.strictEqual(fileItem.matchesSearch('Test', true), true);
            assert.strictEqual(fileItem.matchesSearch('test', true), false);
            assert.strictEqual(fileItem.matchesSearch('xyz'), false);
        });
        
        test('should get sort key correctly', () => {
            const fileItem = new EnhancedFileItem(
                'TestFile.txt',
                vscode.TreeItemCollapsibleState.None,
                '/test/TestFile.txt',
                false,
                1024,
                new Date(2023, 0, 1)
            );
            
            assert.strictEqual(fileItem.getSortKey('name-asc'), 'testfile.txt');
            assert.strictEqual(fileItem.getSortKey('size-asc'), 1024);
            assert.strictEqual(typeof fileItem.getSortKey('modified-asc'), 'number');
        });
    });
    
    suite('PathValidator', () => {
        test('should validate file names correctly', () => {
            const validResult = PathValidator.validateFileName('valid-file.txt');
            assert.strictEqual(validResult.isValid, true);
            
            const invalidResult = PathValidator.validateFileName('invalid<file>.txt');
            assert.strictEqual(invalidResult.isValid, false);
            assert.ok(invalidResult.errorMessage);
            
            const emptyResult = PathValidator.validateFileName('');
            assert.strictEqual(emptyResult.isValid, false);
        });
        
        test('should sanitize file names correctly', () => {
            const sanitized = PathValidator.sanitizeFileName('invalid<file>name.txt');
            assert.strictEqual(sanitized, 'invalid_file_name.txt');
            
            const emptySanitized = PathValidator.sanitizeFileName('');
            assert.strictEqual(emptySanitized, 'untitled');
        });
        
        test('should validate paths correctly', () => {
            const workspaceRoot = '/workspace';
            
            assert.strictEqual(
                PathValidator.isValidPath('/workspace/subfolder', workspaceRoot), 
                true
            );
            
            assert.strictEqual(
                PathValidator.isValidPath('/outside/folder', workspaceRoot), 
                false
            );
        });
        
        test('should handle path utilities correctly', () => {
            const testPath = '/test/folder/file.txt';
            
            assert.strictEqual(PathValidator.getExtension(testPath), '.txt');
            assert.strictEqual(PathValidator.getNameWithoutExtension(testPath), 'file');
            assert.strictEqual(PathValidator.getBaseName(testPath), 'file.txt');
            assert.strictEqual(PathValidator.getDirectoryName(testPath), '/test/folder');
        });
    });
    
    suite('FileOperationError', () => {
        test('should create error correctly', () => {
            const error = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/file.txt',
                'File not found'
            );
            
            assert.strictEqual(error.type, FileOperationErrorType.FileNotFound);
            assert.strictEqual(error.filePath, '/test/file.txt');
            assert.strictEqual(error.message, 'File not found');
            assert.ok(error.timestamp instanceof Date);
        });
        
        test('should provide user-friendly messages', () => {
            const error = new FileOperationError(
                FileOperationErrorType.PermissionDenied,
                '/test/file.txt',
                'Permission denied'
            );
            
            const friendlyMessage = error.getUserFriendlyMessage();
            assert.ok(friendlyMessage.includes('アクセス権限'));
        });
        
        test('should provide recovery suggestions', () => {
            const error = new FileOperationError(
                FileOperationErrorType.InvalidFileName,
                '/test/invalid<file>.txt',
                'Invalid file name'
            );
            
            const suggestions = error.getRecoverySuggestions();
            assert.ok(Array.isArray(suggestions));
            assert.ok(suggestions.length > 0);
        });
        
        test('should determine if error is recoverable', () => {
            const recoverableError = new FileOperationError(
                FileOperationErrorType.NetworkError,
                '/test/file.txt',
                'Network error'
            );
            assert.strictEqual(recoverableError.isRecoverable(), true);
            
            const nonRecoverableError = new FileOperationError(
                FileOperationErrorType.FileNotFound,
                '/test/file.txt',
                'File not found'
            );
            assert.strictEqual(nonRecoverableError.isRecoverable(), false);
        });
        
        test('should create from generic error', () => {
            const genericError = new Error('ENOENT: no such file or directory');
            const fileOpError = FileOperationError.fromError(genericError, '/test/file.txt');
            
            assert.strictEqual(fileOpError.type, FileOperationErrorType.FileNotFound);
            assert.strictEqual(fileOpError.originalError, genericError);
        });
    });
    
    suite('Enums', () => {
        test('should have correct sort order values', () => {
            assert.strictEqual(SortOrder.NameAsc, 'name-asc');
            assert.strictEqual(SortOrder.SizeDesc, 'size-desc');
            assert.strictEqual(SortOrder.ModifiedAsc, 'modified-asc');
        });
        
        test('should have correct error type values', () => {
            assert.strictEqual(FileOperationErrorType.FileNotFound, 'FILE_NOT_FOUND');
            assert.strictEqual(FileOperationErrorType.PermissionDenied, 'PERMISSION_DENIED');
            assert.strictEqual(FileOperationErrorType.InvalidFileName, 'INVALID_FILE_NAME');
        });
    });
});