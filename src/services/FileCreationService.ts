import * as vscode from 'vscode';
import * as path from 'path';
import { IFileOperationService, ValidationResult } from '../interfaces/core';
import { FileOperationService } from './FileOperationService';
import { PathValidator } from '../utils/PathValidator';

/**
 * File template interface
 */
export interface FileTemplate {
    name: string;
    extension: string;
    content: string;
    description?: string;
}

/**
 * File creation options
 */
export interface FileCreationOptions {
    showTemplateSelection?: boolean;
    defaultExtension?: string;
    validateExtension?: boolean;
    allowEmptyName?: boolean;
}

/**
 * Folder creation options
 */
export interface FolderCreationOptions {
    allowNested?: boolean;
    createParents?: boolean;
}

/**
 * Enhanced file creation service with dialog support and templates
 */
export class FileCreationService {
    private fileOperationService: IFileOperationService;
    private templates: Map<string, FileTemplate> = new Map();

    constructor(fileOperationService?: IFileOperationService) {
        this.fileOperationService = fileOperationService || new FileOperationService();
        this.initializeDefaultTemplates();
    }

    /**
     * Create a new file with user input dialog
     */
    async createFileWithDialog(parentPath: string, options: FileCreationOptions = {}): Promise<string | undefined> {
        try {
            // Validate parent directory
            if (!await PathValidator.pathExists(parentPath)) {
                vscode.window.showErrorMessage('指定されたディレクトリが存在しません');
                return undefined;
            }

            if (!await PathValidator.isDirectory(parentPath)) {
                vscode.window.showErrorMessage('ファイルの作成先はディレクトリである必要があります');
                return undefined;
            }

            // Show file name input dialog
            const fileName = await this.showFileNameInputDialog(options);
            if (!fileName) {
                return undefined; // User cancelled
            }

            // Validate file name
            const validation = this.validateFileNameWithFeedback(fileName);
            if (!validation.isValid) {
                vscode.window.showErrorMessage(validation.errorMessage || 'ファイル名が無効です');
                return undefined;
            }

            // Check for existing file
            const fullPath = path.join(parentPath, fileName);
            if (await PathValidator.pathExists(fullPath)) {
                const overwrite = await vscode.window.showWarningMessage(
                    `ファイル "${fileName}" は既に存在します。上書きしますか？`,
                    { modal: true },
                    'はい',
                    'いいえ'
                );
                
                if (overwrite !== 'はい') {
                    return undefined;
                }
            }

            // Get template content if applicable
            const content = await this.getFileContent(fileName, options);

            // Create the file
            await this.fileOperationService.createFile(fullPath, content);

            vscode.window.showInformationMessage(`ファイル "${fileName}" を作成しました`);
            return fullPath;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'ファイルの作成に失敗しました';
            vscode.window.showErrorMessage(errorMessage);
            return undefined;
        }
    }

    /**
     * Create a new folder with user input dialog
     */
    async createFolderWithDialog(parentPath: string, options: FolderCreationOptions = {}): Promise<string | undefined> {
        try {
            // Validate parent directory
            if (!await PathValidator.pathExists(parentPath)) {
                vscode.window.showErrorMessage('指定されたディレクトリが存在しません');
                return undefined;
            }

            if (!await PathValidator.isDirectory(parentPath)) {
                vscode.window.showErrorMessage('フォルダの作成先はディレクトリである必要があります');
                return undefined;
            }

            // Show folder name input dialog
            const folderName = await this.showFolderNameInputDialog(options);
            if (!folderName) {
                return undefined; // User cancelled
            }

            // Validate folder name
            const validation = this.validateFolderNameWithFeedback(folderName, options);
            if (!validation.isValid) {
                vscode.window.showErrorMessage(validation.errorMessage || 'フォルダ名が無効です');
                return undefined;
            }

            // Handle nested folder creation
            const fullPath = path.join(parentPath, folderName);
            
            // Check for existing folder
            if (await PathValidator.pathExists(fullPath)) {
                vscode.window.showErrorMessage(`フォルダ "${folderName}" は既に存在します`);
                return undefined;
            }

            // Create the folder (with nested support if enabled)
            if (options.allowNested && folderName.includes(path.sep)) {
                await this.createNestedFolders(fullPath, options.createParents || false);
            } else {
                await this.fileOperationService.createDirectory(fullPath);
            }

            vscode.window.showInformationMessage(`フォルダ "${folderName}" を作成しました`);
            return fullPath;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'フォルダの作成に失敗しました';
            vscode.window.showErrorMessage(errorMessage);
            return undefined;
        }
    }

    /**
     * Show file name input dialog with validation
     */
    private async showFileNameInputDialog(options: FileCreationOptions): Promise<string | undefined> {
        const inputBox = vscode.window.createInputBox();
        inputBox.title = '新しいファイルの作成';
        inputBox.prompt = 'ファイル名を入力してください';
        inputBox.placeholder = options.defaultExtension ? `example${options.defaultExtension}` : 'example.txt';
        
        return new Promise<string | undefined>((resolve) => {
            let currentValue = '';

            inputBox.onDidChangeValue((value) => {
                currentValue = value;
                
                // Real-time validation feedback
                if (value.trim()) {
                    const validation = this.validateFileNameWithFeedback(value);
                    if (!validation.isValid) {
                        inputBox.validationMessage = validation.errorMessage;
                    } else {
                        inputBox.validationMessage = undefined;
                        
                        // Show extension suggestion
                        const ext = path.extname(value);
                        if (!ext && options.defaultExtension) {
                            inputBox.validationMessage = `拡張子を追加することをお勧めします: ${options.defaultExtension}`;
                        }
                    }
                } else {
                    inputBox.validationMessage = options.allowEmptyName ? undefined : 'ファイル名を入力してください';
                }
            });

            inputBox.onDidAccept(() => {
                const validation = this.validateFileNameWithFeedback(currentValue);
                if (validation.isValid || options.allowEmptyName) {
                    inputBox.hide();
                    resolve(currentValue.trim() || undefined);
                }
            });

            inputBox.onDidHide(() => {
                resolve(undefined);
            });

            inputBox.show();
        });
    }

    /**
     * Show folder name input dialog with validation
     */
    private async showFolderNameInputDialog(options: FolderCreationOptions): Promise<string | undefined> {
        const inputBox = vscode.window.createInputBox();
        inputBox.title = '新しいフォルダの作成';
        inputBox.prompt = 'フォルダ名を入力してください';
        inputBox.placeholder = options.allowNested ? 'folder または nested/folder' : 'folder';
        
        return new Promise<string | undefined>((resolve) => {
            let currentValue = '';

            inputBox.onDidChangeValue((value) => {
                currentValue = value;
                
                // Real-time validation feedback
                if (value.trim()) {
                    const validation = this.validateFolderNameWithFeedback(value, options);
                    if (!validation.isValid) {
                        inputBox.validationMessage = validation.errorMessage;
                    } else {
                        inputBox.validationMessage = undefined;
                        
                        // Show nested folder info
                        if (options.allowNested && value.includes(path.sep)) {
                            const parts = value.split(path.sep).filter(p => p.trim());
                            inputBox.validationMessage = `${parts.length}つのネストしたフォルダを作成します`;
                        }
                    }
                } else {
                    inputBox.validationMessage = 'フォルダ名を入力してください';
                }
            });

            inputBox.onDidAccept(() => {
                const validation = this.validateFolderNameWithFeedback(currentValue, options);
                if (validation.isValid) {
                    inputBox.hide();
                    resolve(currentValue.trim() || undefined);
                }
            });

            inputBox.onDidHide(() => {
                resolve(undefined);
            });

            inputBox.show();
        });
    }

    /**
     * Validate file name with user-friendly feedback
     */
    private validateFileNameWithFeedback(fileName: string): ValidationResult {
        if (!fileName || fileName.trim() === '') {
            return {
                isValid: false,
                errorMessage: 'ファイル名を入力してください'
            };
        }

        // Use existing PathValidator
        const baseValidation = PathValidator.validateFileName(fileName.trim());
        if (!baseValidation || !baseValidation.isValid) {
            return baseValidation || { isValid: false, errorMessage: 'Validation failed' };
        }

        // Additional file-specific validations
        const trimmedName = fileName.trim();
        
        // Check for common problematic patterns
        if (trimmedName.includes('..')) {
            return {
                isValid: false,
                errorMessage: 'ファイル名に ".." を含めることはできません'
            };
        }

        if (trimmedName.startsWith('-')) {
            return {
                isValid: false,
                errorMessage: 'ファイル名をハイフンで始めることはお勧めしません'
            };
        }

        return { isValid: true };
    }

    /**
     * Validate folder name with user-friendly feedback
     */
    private validateFolderNameWithFeedback(folderName: string, options: FolderCreationOptions): ValidationResult {
        if (!folderName || folderName.trim() === '') {
            return {
                isValid: false,
                errorMessage: 'フォルダ名を入力してください'
            };
        }

        const trimmedName = folderName.trim();

        // Handle nested folders
        if (trimmedName.includes(path.sep)) {
            if (!options.allowNested) {
                return {
                    isValid: false,
                    errorMessage: 'ネストしたフォルダの作成は許可されていません'
                };
            }

            // Validate each part of the nested path
            const parts = trimmedName.split(path.sep).filter(p => p.trim());
            if (parts.length === 0) {
                return {
                    isValid: false,
                    errorMessage: '有効なフォルダ名を入力してください'
                };
            }

            for (const part of parts) {
                const partValidation = PathValidator.validateFileName(part);
                if (!partValidation || !partValidation.isValid) {
                    return {
                        isValid: false,
                        errorMessage: `"${part}": ${partValidation?.errorMessage || 'Invalid folder name'}`
                    };
                }
            }
        } else {
            // Single folder validation
            const baseValidation = PathValidator.validateFileName(trimmedName);
            if (!baseValidation || !baseValidation.isValid) {
                return baseValidation || { isValid: false, errorMessage: 'Invalid folder name' };
            }
        }

        // Additional folder-specific validations
        if (trimmedName.includes('..')) {
            return {
                isValid: false,
                errorMessage: 'フォルダ名に ".." を含めることはできません'
            };
        }

        return { isValid: true };
    }

    /**
     * Get file content based on extension and templates
     */
    private async getFileContent(fileName: string, options: FileCreationOptions): Promise<string> {
        const extension = path.extname(fileName).toLowerCase();
        
        // Check if we have a template for this extension
        const template = this.templates.get(extension);
        if (template && options.showTemplateSelection !== false) {
            // Ask user if they want to use the template
            const useTemplate = await vscode.window.showQuickPick(
                [
                    { label: 'テンプレートを使用', description: template.description, value: true },
                    { label: '空のファイル', description: '内容なしでファイルを作成', value: false }
                ],
                {
                    placeHolder: 'ファイルの作成方法を選択してください',
                    ignoreFocusOut: true
                }
            );

            if (useTemplate?.value) {
                return template.content;
            }
        }

        return ''; // Empty file by default
    }

    /**
     * Create nested folders
     */
    private async createNestedFolders(fullPath: string, createParents: boolean): Promise<void> {
        if (createParents) {
            // Use recursive creation
            const parts = fullPath.split(path.sep);
            let currentPath = '';
            
            for (const part of parts) {
                if (!part) continue; // Skip empty parts (e.g., from leading separator)
                
                currentPath = currentPath ? path.join(currentPath, part) : part;
                
                if (!await PathValidator.pathExists(currentPath)) {
                    await this.fileOperationService.createDirectory(currentPath);
                }
            }
        } else {
            // Create only the final directory, parent must exist
            await this.fileOperationService.createDirectory(fullPath);
        }
    }

    /**
     * Initialize default file templates
     */
    private initializeDefaultTemplates(): void {
        // TypeScript template
        this.templates.set('.ts', {
            name: 'TypeScript',
            extension: '.ts',
            content: `// TypeScript file
export {};
`,
            description: 'TypeScript ファイルテンプレート'
        });

        // JavaScript template
        this.templates.set('.js', {
            name: 'JavaScript',
            extension: '.js',
            content: `// JavaScript file
`,
            description: 'JavaScript ファイルテンプレート'
        });

        // JSON template
        this.templates.set('.json', {
            name: 'JSON',
            extension: '.json',
            content: `{
  
}
`,
            description: 'JSON ファイルテンプレート'
        });

        // Markdown template
        this.templates.set('.md', {
            name: 'Markdown',
            extension: '.md',
            content: `# Title

## Section

Content here...
`,
            description: 'Markdown ファイルテンプレート'
        });

        // HTML template
        this.templates.set('.html', {
            name: 'HTML',
            extension: '.html',
            content: `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    
</body>
</html>
`,
            description: 'HTML ファイルテンプレート'
        });

        // CSS template
        this.templates.set('.css', {
            name: 'CSS',
            extension: '.css',
            content: `/* CSS Styles */

`,
            description: 'CSS ファイルテンプレート'
        });
    }

    /**
     * Add a custom template
     */
    addTemplate(template: FileTemplate): void {
        this.templates.set(template.extension, template);
    }

    /**
     * Remove a template
     */
    removeTemplate(extension: string): void {
        this.templates.delete(extension);
    }

    /**
     * Get all available templates
     */
    getTemplates(): FileTemplate[] {
        return Array.from(this.templates.values());
    }

    /**
     * Get template by extension
     */
    getTemplate(extension: string): FileTemplate | undefined {
        return this.templates.get(extension);
    }
}