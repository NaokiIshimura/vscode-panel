import * as path from 'path';
import * as fs from 'fs';
import { ValidationResult } from '../interfaces/core';

/**
 * Path validation utility class
 */
export class PathValidator {
    // Invalid characters for file names on different platforms
    private static readonly INVALID_CHARS_WINDOWS = /[<>:"|?*]/g;
    private static readonly INVALID_CHARS_UNIX = /[<>:"|?*]/g; // More permissive on Unix
    
    // Reserved names on Windows
    private static readonly RESERVED_NAMES_WINDOWS = [
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
    ];

    /**
     * Validate if a path is within the workspace root (prevent directory traversal)
     */
    static isValidPath(targetPath: string, workspaceRoot: string): boolean {
        try {
            const resolvedPath = path.resolve(targetPath);
            const resolvedRoot = path.resolve(workspaceRoot);
            return resolvedPath.startsWith(resolvedRoot);
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate file name for the current platform
     */
    static validateFileName(fileName: string): ValidationResult {
        if (!fileName || fileName.trim() === '') {
            return {
                isValid: false,
                errorMessage: 'ファイル名を入力してください'
            };
        }

        const trimmedName = fileName.trim();

        // Check length
        if (trimmedName.length > 255) {
            return {
                isValid: false,
                errorMessage: 'ファイル名が長すぎます（255文字以内）'
            };
        }

        // Check for invalid characters
        const invalidChars = process.platform === 'win32' 
            ? this.INVALID_CHARS_WINDOWS 
            : this.INVALID_CHARS_UNIX;

        if (invalidChars.test(trimmedName)) {
            return {
                isValid: false,
                errorMessage: 'ファイル名に使用できない文字が含まれています: < > : " | ? * / \\'
            };
        }

        // Check for reserved names on Windows
        if (process.platform === 'win32') {
            const nameWithoutExt = path.parse(trimmedName).name.toUpperCase();
            if (this.RESERVED_NAMES_WINDOWS.includes(nameWithoutExt)) {
                return {
                    isValid: false,
                    errorMessage: `"${trimmedName}" は予約されたファイル名です`
                };
            }
        }

        // Check for names starting or ending with spaces or dots
        if (trimmedName.startsWith(' ') || trimmedName.endsWith(' ')) {
            return {
                isValid: false,
                errorMessage: 'ファイル名の先頭または末尾にスペースは使用できません'
            };
        }

        if (process.platform === 'win32' && (trimmedName.startsWith('.') || trimmedName.endsWith('.'))) {
            return {
                isValid: false,
                errorMessage: 'Windowsでは、ファイル名の先頭または末尾にドットは使用できません'
            };
        }

        return {
            isValid: true
        };
    }

    /**
     * Sanitize file name by removing or replacing invalid characters
     */
    static sanitizeFileName(fileName: string): string {
        if (!fileName) {
            return 'untitled';
        }

        let sanitized = fileName.trim();

        // Replace invalid characters with underscore
        const invalidChars = process.platform === 'win32' 
            ? this.INVALID_CHARS_WINDOWS 
            : this.INVALID_CHARS_UNIX;

        sanitized = sanitized.replace(invalidChars, '_');

        // Handle reserved names on Windows
        if (process.platform === 'win32') {
            const nameWithoutExt = path.parse(sanitized).name.toUpperCase();
            if (this.RESERVED_NAMES_WINDOWS.includes(nameWithoutExt)) {
                const ext = path.extname(sanitized);
                sanitized = `${nameWithoutExt}_${ext}`;
            }
        }

        // Remove leading/trailing spaces and dots on Windows
        if (process.platform === 'win32') {
            sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, '');
        } else {
            sanitized = sanitized.replace(/^[\s]+|[\s]+$/g, '');
        }

        // Ensure the name is not empty after sanitization
        if (!sanitized) {
            sanitized = 'untitled';
        }

        // Truncate if too long
        if (sanitized.length > 255) {
            const ext = path.extname(sanitized);
            const nameWithoutExt = path.parse(sanitized).name;
            const maxNameLength = 255 - ext.length;
            sanitized = nameWithoutExt.substring(0, maxNameLength) + ext;
        }

        return sanitized;
    }

    /**
     * Check if a path exists and is accessible
     */
    static async pathExists(targetPath: string): Promise<boolean> {
        try {
            await fs.promises.access(targetPath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a path is a directory
     */
    static async isDirectory(targetPath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(targetPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Check if a path is readable
     */
    static async isReadable(targetPath: string): Promise<boolean> {
        try {
            await fs.promises.access(targetPath, fs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a path is writable
     */
    static async isWritable(targetPath: string): Promise<boolean> {
        try {
            await fs.promises.access(targetPath, fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get relative path from workspace root
     */
    static getRelativePath(fullPath: string, workspaceRoot: string): string {
        try {
            const relativePath = path.relative(workspaceRoot, fullPath);
            return relativePath || '.';
        } catch {
            return fullPath;
        }
    }

    /**
     * Normalize path separators for the current platform
     */
    static normalizePath(targetPath: string): string {
        return path.normalize(targetPath);
    }

    /**
     * Join paths safely
     */
    static joinPaths(...paths: string[]): string {
        return path.join(...paths);
    }

    /**
     * Resolve path to absolute path
     */
    static resolvePath(targetPath: string, basePath?: string): string {
        if (basePath) {
            return path.resolve(basePath, targetPath);
        }
        return path.resolve(targetPath);
    }

    /**
     * Get file extension
     */
    static getExtension(filePath: string): string {
        return path.extname(filePath);
    }

    /**
     * Get file name without extension
     */
    static getNameWithoutExtension(filePath: string): string {
        return path.parse(filePath).name;
    }

    /**
     * Get directory name
     */
    static getDirectoryName(filePath: string): string {
        return path.dirname(filePath);
    }

    /**
     * Get base name (file name with extension)
     */
    static getBaseName(filePath: string): string {
        return path.basename(filePath);
    }

    /**
     * Generate unique file name if file already exists
     */
    static async generateUniqueFileName(basePath: string, fileName: string): Promise<string> {
        const dir = path.dirname(basePath);
        const ext = path.extname(fileName);
        const nameWithoutExt = path.parse(fileName).name;
        
        let counter = 1;
        let uniqueName = fileName;
        let fullPath = path.join(dir, uniqueName);
        
        while (await this.pathExists(fullPath)) {
            uniqueName = `${nameWithoutExt} (${counter})${ext}`;
            fullPath = path.join(dir, uniqueName);
            counter++;
        }
        
        return uniqueName;
    }
}