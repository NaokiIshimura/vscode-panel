import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as sinon from 'sinon';
import { FileCreationService, FileTemplate, FileCreationOptions, FolderCreationOptions } from '../services/FileCreationService';
import { IFileOperationService, ValidationResult } from '../interfaces/core';
import { PathValidator } from '../utils/PathValidator';

// Mock file operation service
class MockFileOperationService implements IFileOperationService {
    public createdFiles: Array<{ path: string; content: string }> = [];
    public createdDirectories: string[] = [];

    async copyFiles(sources: string[], destination: string): Promise<void> {
        // Mock implementation
    }

    async moveFiles(sources: string[], destination: string): Promise<void> {
        // Mock implementation
    }

    async deleteFiles(paths: string[]): Promise<void> {
        // Mock implementation
    }

    async renameFile(oldPath: string, newPath: string): Promise<void> {
        // Mock implementation
    }

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
        // Mock implementation
        return {};
    }
}

suite('FileCreationService Unit Tests', () => {
    let fileCreationService: FileCreationService;
    let mockFileOperationService: MockFileOperationService;
    let pathExistsStub: sinon.SinonStub;
    let isDirectoryStub: sinon.SinonStub;
    let validateFileNameStub: sinon.SinonStub;
    let createInputBoxStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let showQuickPickStub: sinon.SinonStub;

    setup(() => {
        mockFileOperationService = new MockFileOperationService();
        fileCreationService = new FileCreationService(mockFileOperationService);
        
        // Stub PathValidator methods
        pathExistsStub = sinon.stub(PathValidator, 'pathExists');
        isDirectoryStub = sinon.stub(PathValidator, 'isDirectory');
        validateFileNameStub = sinon.stub(PathValidator, 'validateFileName');
        
        // Stub vscode.window methods
        createInputBoxStub = sinon.stub(vscode.window, 'createInputBox');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Template Management', () => {
        test('should initialize with default templates', () => {
            const templates = fileCreationService.getTemplates();
            assert.ok(templates.length > 0, 'Should have default templates');
            
            const tsTemplate = fileCreationService.getTemplate('.ts');
            assert.ok(tsTemplate, 'Should have TypeScript template');
            assert.strictEqual(tsTemplate.extension, '.ts');
            assert.ok(tsTemplate.content.includes('TypeScript'), 'Template should contain TypeScript comment');
        });

        test('should add custom template', () => {
            const customTemplate: FileTemplate = {
                name: 'Custom',
                extension: '.custom',
                content: 'Custom content',
                description: 'Custom template'
            };

            fileCreationService.addTemplate(customTemplate);
            
            const retrieved = fileCreationService.getTemplate('.custom');
            assert.deepStrictEqual(retrieved, customTemplate);
        });

        test('should remove template', () => {
            fileCreationService.removeTemplate('.ts');
            
            const tsTemplate = fileCreationService.getTemplate('.ts');
            assert.strictEqual(tsTemplate, undefined);
        });

        test('should get all templates', () => {
            const templates = fileCreationService.getTemplates();
            assert.ok(Array.isArray(templates));
            
            const extensions = templates.map(t => t.extension);
            assert.ok(extensions.includes('.ts'));
            assert.ok(extensions.includes('.js'));
            assert.ok(extensions.includes('.json'));
        });
    });

    suite('File Name Validation', () => {
        test('should validate valid file names', async () => {
            validateFileNameStub.returns({ isValid: true });

            // Test the validation logic directly through private method access
            const service = fileCreationService as any;
            
            const validResult = service.validateFileNameWithFeedback('test.txt');
            assert.strictEqual(validResult.isValid, true);
        });

        test('should reject empty file names', async () => {
            const service = fileCreationService as any;
            
            const emptyResult = service.validateFileNameWithFeedback('');
            assert.strictEqual(emptyResult.isValid, false);
            assert.ok(emptyResult.errorMessage?.includes('ファイル名を入力'));
            
            const spaceResult = service.validateFileNameWithFeedback('   ');
            assert.strictEqual(spaceResult.isValid, false);
        });

        test('should reject file names with invalid patterns', async () => {
            // Set up the stub to return valid for base validation, so we test our custom logic
            validateFileNameStub.returns({ isValid: true });
            
            const service = fileCreationService as any;
            
            const dotDotResult = service.validateFileNameWithFeedback('test..txt');
            assert.strictEqual(dotDotResult.isValid, false);
            assert.ok(dotDotResult.errorMessage?.includes('..'));
            
            const hyphenResult = service.validateFileNameWithFeedback('-test.txt');
            assert.strictEqual(hyphenResult.isValid, false);
            assert.ok(hyphenResult.errorMessage?.includes('ハイフン'));
        });
    });

    suite('Folder Name Validation', () => {
        test('should validate simple folder names', async () => {
            validateFileNameStub.returns({ isValid: true });
            
            const service = fileCreationService as any;
            const options: FolderCreationOptions = {};
            
            const validResult = service.validateFolderNameWithFeedback('test-folder', options);
            assert.strictEqual(validResult.isValid, true);
        });

        test('should reject empty folder names', async () => {
            const service = fileCreationService as any;
            const options: FolderCreationOptions = {};
            
            const emptyResult = service.validateFolderNameWithFeedback('', options);
            assert.strictEqual(emptyResult.isValid, false);
            assert.ok(emptyResult.errorMessage?.includes('フォルダ名を入力'));
        });

        test('should handle nested folder validation when allowed', async () => {
            validateFileNameStub.returns({ isValid: true });
            
            const service = fileCreationService as any;
            const options: FolderCreationOptions = { allowNested: true };
            
            const nestedResult = service.validateFolderNameWithFeedback('parent/child', options);
            assert.strictEqual(nestedResult.isValid, true);
        });

        test('should reject nested folders when not allowed', async () => {
            const service = fileCreationService as any;
            const options: FolderCreationOptions = { allowNested: false };
            
            const nestedResult = service.validateFolderNameWithFeedback('parent/child', options);
            assert.strictEqual(nestedResult.isValid, false);
            assert.ok(nestedResult.errorMessage?.includes('ネストした'));
        });

        test('should validate each part of nested folder path', async () => {
            validateFileNameStub
                .onFirstCall().returns({ isValid: true })
                .onSecondCall().returns({ isValid: false, errorMessage: 'Invalid part' });
            
            const service = fileCreationService as any;
            const options: FolderCreationOptions = { allowNested: true };
            
            const nestedResult = service.validateFolderNameWithFeedback('valid/invalid<>', options);
            assert.strictEqual(nestedResult.isValid, false);
            assert.ok(nestedResult.errorMessage?.includes('Invalid part'));
        });
    });

    suite('File Creation with Dialog', () => {
        test('should create file successfully', async () => {
            pathExistsStub.onFirstCall().resolves(true); // Parent exists
            pathExistsStub.onSecondCall().resolves(false); // File doesn't exist
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            
            showInformationMessageStub.resolves();
            
            // Mock the showFileNameInputDialog method to return a filename directly
            const service = fileCreationService as any;
            service.showFileNameInputDialog = sinon.stub().resolves('test.txt');

            const result = await fileCreationService.createFileWithDialog('/test/path');
            
            assert.strictEqual(result, path.join('/test/path', 'test.txt'));
            assert.strictEqual(mockFileOperationService.createdFiles.length, 1);
            assert.strictEqual(mockFileOperationService.createdFiles[0].path, path.join('/test/path', 'test.txt'));
        });

        test('should handle file already exists scenario', async () => {
            pathExistsStub
                .onFirstCall().resolves(true) // Parent directory exists
                .onSecondCall().resolves(true); // File already exists
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            
            showWarningMessageStub.resolves('いいえ'); // User chooses not to overwrite
            
            const inputBox = {
                title: '',
                prompt: '',
                placeholder: '',
                validationMessage: undefined,
                onDidChangeValue: sinon.stub(),
                onDidAccept: sinon.stub(),
                onDidHide: sinon.stub(),
                show: sinon.stub(),
                hide: sinon.stub()
            };
            
            createInputBoxStub.returns(inputBox);
            
            // Simulate user input and acceptance
            setTimeout(() => {
                const changeHandler = inputBox.onDidChangeValue.getCall(0).args[0];
                changeHandler('existing.txt');
                
                const acceptHandler = inputBox.onDidAccept.getCall(0).args[0];
                acceptHandler();
            }, 10);

            const result = await fileCreationService.createFileWithDialog('/test/path');
            
            assert.strictEqual(result, undefined);
            assert.strictEqual(mockFileOperationService.createdFiles.length, 0);
        });

        test('should handle invalid parent directory', async () => {
            pathExistsStub.resolves(false);
            showErrorMessageStub.resolves();
            
            const result = await fileCreationService.createFileWithDialog('/invalid/path');
            
            assert.strictEqual(result, undefined);
            assert.ok(showErrorMessageStub.calledWith('指定されたディレクトリが存在しません'));
        });
    });

    suite('Folder Creation with Dialog', () => {
        test('should create simple folder successfully', async () => {
            pathExistsStub.onFirstCall().resolves(true); // Parent exists
            pathExistsStub.onSecondCall().resolves(false); // Folder doesn't exist
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            
            showInformationMessageStub.resolves();
            
            // Mock the showFolderNameInputDialog method to return a folder name directly
            const service = fileCreationService as any;
            service.showFolderNameInputDialog = sinon.stub().resolves('new-folder');

            const result = await fileCreationService.createFolderWithDialog('/test/path');
            
            assert.strictEqual(result, path.join('/test/path', 'new-folder'));
            assert.strictEqual(mockFileOperationService.createdDirectories.length, 1);
            assert.strictEqual(mockFileOperationService.createdDirectories[0], path.join('/test/path', 'new-folder'));
        });

        test('should create nested folders when allowed', async () => {
            pathExistsStub.onFirstCall().resolves(true); // Parent exists
            pathExistsStub.onSecondCall().resolves(false); // Folder doesn't exist
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            
            showInformationMessageStub.resolves();
            
            const options: FolderCreationOptions = { 
                allowNested: true, 
                createParents: true 
            };
            
            // Mock the showFolderNameInputDialog method to return a nested folder name directly
            const service = fileCreationService as any;
            service.showFolderNameInputDialog = sinon.stub().resolves('parent/child');

            const result = await fileCreationService.createFolderWithDialog('/test/path', options);
            
            assert.strictEqual(result, path.join('/test/path', 'parent/child'));
            // Should create both parent and child directories
            assert.ok(mockFileOperationService.createdDirectories.length >= 1);
        });

        test('should handle folder already exists scenario', async () => {
            pathExistsStub
                .onFirstCall().resolves(true) // Parent directory exists
                .onSecondCall().resolves(true); // Folder already exists
            isDirectoryStub.resolves(true);
            validateFileNameStub.returns({ isValid: true });
            
            showErrorMessageStub.resolves();
            
            const inputBox = {
                title: '',
                prompt: '',
                placeholder: '',
                validationMessage: undefined,
                onDidChangeValue: sinon.stub(),
                onDidAccept: sinon.stub(),
                onDidHide: sinon.stub(),
                show: sinon.stub(),
                hide: sinon.stub()
            };
            
            createInputBoxStub.returns(inputBox);
            
            // Simulate user input and acceptance
            setTimeout(() => {
                const changeHandler = inputBox.onDidChangeValue.getCall(0).args[0];
                changeHandler('existing-folder');
                
                const acceptHandler = inputBox.onDidAccept.getCall(0).args[0];
                acceptHandler();
            }, 10);

            const result = await fileCreationService.createFolderWithDialog('/test/path');
            
            assert.strictEqual(result, undefined);
            assert.ok(showErrorMessageStub.calledWith('フォルダ "existing-folder" は既に存在します'));
        });
    });

    suite('Template Content Generation', () => {
        test('should return template content for known extensions', async () => {
            const service = fileCreationService as any;
            
            showQuickPickStub.resolves({ value: true }); // User chooses template
            
            const content = await service.getFileContent('test.ts', { showTemplateSelection: true });
            
            assert.ok(content.includes('TypeScript'));
        });

        test('should return empty content when template not selected', async () => {
            const service = fileCreationService as any;
            
            showQuickPickStub.resolves({ value: false }); // User chooses empty file
            
            const content = await service.getFileContent('test.ts', { showTemplateSelection: true });
            
            assert.strictEqual(content, '');
        });

        test('should return empty content for unknown extensions', async () => {
            const service = fileCreationService as any;
            
            const content = await service.getFileContent('test.unknown', {});
            
            assert.strictEqual(content, '');
        });

        test('should skip template selection when disabled', async () => {
            const service = fileCreationService as any;
            
            const content = await service.getFileContent('test.ts', { showTemplateSelection: false });
            
            assert.strictEqual(content, '');
            assert.ok(showQuickPickStub.notCalled);
        });
    });
});