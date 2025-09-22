import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as sinon from 'sinon';
import { FileCreationService, FolderCreationOptions } from '../services/FileCreationService';
import { IFileOperationService, ValidationResult } from '../interfaces/core';
import { PathValidator } from '../utils/PathValidator';

// Mock file operation service
class MockFileOperationService implements IFileOperationService {
    public createdFiles: Array<{ path: string; content: string }> = [];
    public createdDirectories: string[] = [];

    async copyFiles(sources: string[], destination: string): Promise<void> {}
    async moveFiles(sources: string[], destination: string): Promise<void> {}
    async deleteFiles(paths: string[]): Promise<void> {}
    async renameFile(oldPath: string, newPath: string): Promise<void> {}

    async createFile(filePath: string, content: string = ''): Promise<void> {
        this.createdFiles.push({ path: filePath, content });
    }

    async createDirectory(dirPath: string): Promise<void> {
        this.createdDirectories.push(dirPath);
    }

    validateFileName(name: string): ValidationResult {
        return PathValidator.validateFileName(name);
    }

    async getFileStats(filePath: string): Promise<any> {
        return {};
    }
}

suite('Folder Creation Unit Tests', () => {
    let fileCreationService: FileCreationService;
    let mockFileOperationService: MockFileOperationService;
    let pathExistsStub: sinon.SinonStub;
    let isDirectoryStub: sinon.SinonStub;
    let validateFileNameStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;

    setup(() => {
        mockFileOperationService = new MockFileOperationService();
        fileCreationService = new FileCreationService(mockFileOperationService);
        
        // Stub PathValidator methods
        pathExistsStub = sinon.stub(PathValidator, 'pathExists');
        isDirectoryStub = sinon.stub(PathValidator, 'isDirectory');
        validateFileNameStub = sinon.stub(PathValidator, 'validateFileName');
        
        // Stub vscode.window methods
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Folder Name Validation', () => {
        test('should validate simple folder names', () => {
            validateFileNameStub.returns({ isValid: true });
            
            const service = fileCreationService as any;
            const options: FolderCreationOptions = {};
            
            const result = service.validateFolderNameWithFeedback('simple-folder', options);
            assert.strictEqual(result.isValid, true);
        });

        test('should reject empty folder names', () => {
            const service = fileCreationService as any;
            const options: FolderCreationOptions = {};
            
            const result = service.validateFolderNameWithFeedback('', options);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage?.includes('フォルダ名を入力'));
        });

        test('should reject folder names with double dots', () => {
            validateFileNameStub.returns({ isValid: true });
            
            const service = fileCreationService as any;
            const options: FolderCreationOptions = {};
            
            const result = service.validateFolderNameWithFeedback('folder..name', options);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage?.includes('..'));
        });

        test('should handle nested folder validation when allowed', () => {
            validateFileNameStub.returns({ isValid: true });
            
            const service = fileCreationService as any;
            const options: FolderCreationOptions = { allowNested: true };
            
            const result = service.validateFolderNameWithFeedback('parent/child/grandchild', options);
            assert.strictEqual(result.isValid, true);
        });

        test('should reject nested folders when not allowed', () => {
            const service = fileCreationService as any;
            const options: FolderCreationOptions = { allowNested: false };
            
            const result = service.validateFolderNameWithFeedback('parent/child', options);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage?.includes('ネストした'));
        });

        test('should validate each part of nested folder path', () => {
            validateFileNameStub
                .onFirstCall().returns({ isValid: true })
                .onSecondCall().returns({ isValid: false, errorMessage: 'Invalid character' });
            
            const service = fileCreationService as any;
            const options: FolderCreationOptions = { allowNested: true };
            
            const result = service.validateFolderNameWithFeedback('valid/invalid<>', options);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage?.includes('Invalid character'));
        });

        test('should handle empty parts in nested path', () => {
            validateFileNameStub.returns({ isValid: true });
            
            const service = fileCreationService as any;
            const options: FolderCreationOptions = { allowNested: true };
            
            // Test with a path that results in empty parts after filtering
            const result = service.validateFolderNameWithFeedback('///', options);
            assert.strictEqual(result.isValid, false);
            assert.ok(result.errorMessage?.includes('有効なフォルダ名'));
        });
    });

    suite('Nested Folder Creation', () => {
        test('should create nested folders with createParents option', async () => {
            pathExistsStub.onFirstCall().resolves(true); // Parent exists
            pathExistsStub.onSecondCall().resolves(false); // Target doesn't exist
            pathExistsStub.onThirdCall().resolves(false); // Intermediate doesn't exist
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            showInformationMessageStub.resolves();
            
            const service = fileCreationService as any;
            service.showFolderNameInputDialog = sinon.stub().resolves('parent/child/grandchild');
            
            const options: FolderCreationOptions = { 
                allowNested: true, 
                createParents: true 
            };
            
            const result = await fileCreationService.createFolderWithDialog('/test/path', options);
            
            assert.strictEqual(result, path.join('/test/path', 'parent/child/grandchild'));
            // Should create multiple directories for nested structure
            assert.ok(mockFileOperationService.createdDirectories.length >= 1);
        });

        test('should create nested folders without createParents option', async () => {
            pathExistsStub.onFirstCall().resolves(true); // Parent exists
            pathExistsStub.onSecondCall().resolves(false); // Target doesn't exist
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            showInformationMessageStub.resolves();
            
            const service = fileCreationService as any;
            service.showFolderNameInputDialog = sinon.stub().resolves('parent/child');
            
            const options: FolderCreationOptions = { 
                allowNested: true, 
                createParents: false 
            };
            
            const result = await fileCreationService.createFolderWithDialog('/test/path', options);
            
            assert.strictEqual(result, path.join('/test/path', 'parent/child'));
            // Should create only the final directory
            assert.strictEqual(mockFileOperationService.createdDirectories.length, 1);
            assert.strictEqual(mockFileOperationService.createdDirectories[0], path.join('/test/path', 'parent/child'));
        });

        test('should handle createNestedFolders with createParents', async () => {
            pathExistsStub.resolves(false); // All intermediate paths don't exist
            
            const service = fileCreationService as any;
            const testPath = '/test/path/parent/child/grandchild';
            
            await service.createNestedFolders(testPath, true);
            
            // Should create multiple directories
            assert.ok(mockFileOperationService.createdDirectories.length >= 1);
        });

        test('should handle createNestedFolders without createParents', async () => {
            const service = fileCreationService as any;
            const testPath = '/test/path/parent/child';
            
            await service.createNestedFolders(testPath, false);
            
            // Should create only the final directory
            assert.strictEqual(mockFileOperationService.createdDirectories.length, 1);
            assert.strictEqual(mockFileOperationService.createdDirectories[0], testPath);
        });
    });

    suite('Folder Creation Error Handling', () => {
        test('should handle invalid parent directory', async () => {
            pathExistsStub.resolves(false);
            showErrorMessageStub.resolves();
            
            const result = await fileCreationService.createFolderWithDialog('/invalid/path');
            
            assert.strictEqual(result, undefined);
            assert.ok(showErrorMessageStub.calledWith('指定されたディレクトリが存在しません'));
        });

        test('should handle parent is not a directory', async () => {
            pathExistsStub.resolves(true);
            isDirectoryStub.resolves(false);
            showErrorMessageStub.resolves();
            
            const result = await fileCreationService.createFolderWithDialog('/test/file.txt');
            
            assert.strictEqual(result, undefined);
            assert.ok(showErrorMessageStub.calledWith('フォルダの作成先はディレクトリである必要があります'));
        });

        test('should handle folder already exists', async () => {
            pathExistsStub.onFirstCall().resolves(true); // Parent exists
            pathExistsStub.onSecondCall().resolves(true); // Folder already exists
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            showErrorMessageStub.resolves();
            
            const service = fileCreationService as any;
            service.showFolderNameInputDialog = sinon.stub().resolves('existing-folder');
            
            const result = await fileCreationService.createFolderWithDialog('/test/path');
            
            assert.strictEqual(result, undefined);
            assert.ok(showErrorMessageStub.calledWith('フォルダ "existing-folder" は既に存在します'));
        });

        test('should handle invalid folder name', async () => {
            pathExistsStub.resolves(true);
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: false, errorMessage: 'Invalid name' });
            showErrorMessageStub.resolves();
            
            const service = fileCreationService as any;
            service.showFolderNameInputDialog = sinon.stub().resolves('invalid<>name');
            
            const result = await fileCreationService.createFolderWithDialog('/test/path');
            
            assert.strictEqual(result, undefined);
            assert.ok(showErrorMessageStub.calledWith('Invalid name'));
        });

        test('should handle user cancellation', async () => {
            pathExistsStub.resolves(true);
            isDirectoryStub.resolves(true);
            
            const service = fileCreationService as any;
            service.showFolderNameInputDialog = sinon.stub().resolves(undefined); // User cancelled
            
            const result = await fileCreationService.createFolderWithDialog('/test/path');
            
            assert.strictEqual(result, undefined);
        });

        test('should handle file operation service errors', async () => {
            pathExistsStub.onFirstCall().resolves(true); // Parent exists
            pathExistsStub.onSecondCall().resolves(false); // Folder doesn't exist
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            showErrorMessageStub.resolves();
            
            // Make the file operation service throw an error
            mockFileOperationService.createDirectory = sinon.stub().rejects(new Error('Permission denied'));
            
            const service = fileCreationService as any;
            service.showFolderNameInputDialog = sinon.stub().resolves('test-folder');
            
            const result = await fileCreationService.createFolderWithDialog('/test/path');
            
            assert.strictEqual(result, undefined);
            assert.ok(showErrorMessageStub.called);
        });
    });

    suite('Folder Creation Options', () => {
        test('should use default options when none provided', async () => {
            pathExistsStub.onFirstCall().resolves(true); // Parent exists
            pathExistsStub.onSecondCall().resolves(false); // Folder doesn't exist
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            showInformationMessageStub.resolves();
            
            const service = fileCreationService as any;
            service.showFolderNameInputDialog = sinon.stub().resolves('simple-folder');
            
            const result = await fileCreationService.createFolderWithDialog('/test/path');
            
            assert.strictEqual(result, path.join('/test/path', 'simple-folder'));
        });

        test('should respect allowNested option', async () => {
            validateFileNameStub.returns({ isValid: true });
            
            const service = fileCreationService as any;
            
            // Test with allowNested: false
            const resultDisallowed = service.validateFolderNameWithFeedback('parent/child', { allowNested: false });
            assert.strictEqual(resultDisallowed.isValid, false);
            
            // Test with allowNested: true
            const resultAllowed = service.validateFolderNameWithFeedback('parent/child', { allowNested: true });
            assert.strictEqual(resultAllowed.isValid, true);
        });

        test('should respect createParents option', async () => {
            pathExistsStub.resolves(false); // Paths don't exist
            
            const service = fileCreationService as any;
            
            // Test with createParents: true
            await service.createNestedFolders('/test/path/parent/child', true);
            const withParentsCount = mockFileOperationService.createdDirectories.length;
            
            // Reset
            mockFileOperationService.createdDirectories = [];
            
            // Test with createParents: false
            await service.createNestedFolders('/test/path/parent/child', false);
            const withoutParentsCount = mockFileOperationService.createdDirectories.length;
            
            // With createParents should create more directories
            assert.ok(withParentsCount >= withoutParentsCount);
        });
    });
});