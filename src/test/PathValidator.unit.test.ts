import * as assert from 'assert';
import * as path from 'path';
import { PathValidator } from '../utils/PathValidator';

suite('PathValidator Unit Tests', () => {
    const mockWorkspaceRoot = '/workspace/root';
    
    suite('Path Validation', () => {
        test('should return true for valid paths within workspace', () => {
            const validPath = path.join(mockWorkspaceRoot, 'src', 'file.ts');
            const result = PathValidator.isValidPath(validPath, mockWorkspaceRoot);
            assert.strictEqual(result, true);
        });

        test('should return false for paths outside workspace (directory traversal)', () => {
            const invalidPath = path.join(mockWorkspaceRoot, '..', '..', 'etc', 'passwd');
            const result = PathValidator.isValidPath(invalidPath, mockWorkspaceRoot);
            assert.strictEqual(result, false);
        });

        test('should return false for absolute paths outside workspace', () => {
            const invalidPath = '/etc/passwd';
            const result = PathValidator.isValidPath(invalidPath, mockWorkspaceRoot);
            assert.strictEqual(result, false);
        });

        test('should handle workspace root path', () => {
            const result = PathValidator.isValidPath(mockWorkspaceRoot, mockWorkspaceRoot);
            assert.strictEqual(result, true);
        });
    });

    suite('File Name Validation', () => {
        test('should validate correct file names', () => {
            const result = PathValidator.validateFileName('file.txt');
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.errorMessage, undefined);
        });

        test('should reject empty file names', () => {
            const result = PathValidator.validateFileName('');
            assert.strictEqual(result.isValid, false);
            assert.strictEqual(typeof result.errorMessage, 'string');
        });

        test('should reject file names with invalid characters', () => {
            const invalidNames = ['file<>.txt', 'file|name.txt', 'file?.txt'];
            
            for (const name of invalidNames) {
                const result = PathValidator.validateFileName(name);
                assert.strictEqual(result.isValid, false, `Should reject: ${name}`);
                assert.strictEqual(typeof result.errorMessage, 'string');
            }
        });

        test('should reject file names that are too long', () => {
            const longName = 'a'.repeat(256) + '.txt';
            const result = PathValidator.validateFileName(longName);
            assert.strictEqual(result.isValid, false);
            assert.strictEqual(typeof result.errorMessage, 'string');
        });

        test('should reject reserved names on Windows', () => {
            const originalPlatform = process.platform;
            
            // Mock Windows platform
            Object.defineProperty(process, 'platform', { value: 'win32' });
            
            const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
            
            for (const name of reservedNames) {
                const result = PathValidator.validateFileName(name);
                assert.strictEqual(result.isValid, false, `Should reject reserved name: ${name}`);
            }
            
            // Restore original platform
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });
    });

    suite('File Name Sanitization', () => {
        test('should remove dangerous characters', () => {
            const dangerousName = 'file<>:"|?*.txt';
            const sanitized = PathValidator.sanitizeFileName(dangerousName);
            assert.strictEqual(sanitized, 'file_______.txt');
        });

        test('should preserve safe characters', () => {
            const safeName = 'my-file_123.txt';
            const sanitized = PathValidator.sanitizeFileName(safeName);
            assert.strictEqual(sanitized, safeName);
        });

        test('should handle empty string', () => {
            const sanitized = PathValidator.sanitizeFileName('');
            assert.strictEqual(sanitized, 'untitled');
        });

        test('should handle null/undefined input', () => {
            const sanitized1 = PathValidator.sanitizeFileName(null as any);
            const sanitized2 = PathValidator.sanitizeFileName(undefined as any);
            assert.strictEqual(sanitized1, 'untitled');
            assert.strictEqual(sanitized2, 'untitled');
        });

        test('should truncate very long names', () => {
            const longName = 'a'.repeat(300) + '.txt';
            const sanitized = PathValidator.sanitizeFileName(longName);
            assert.strictEqual(sanitized.length <= 255, true);
            assert.strictEqual(sanitized.endsWith('.txt'), true);
        });
    });

    suite('Path Utilities', () => {
        test('should normalize path separators', () => {
            const windowsPath = 'src\\components\\file.ts';
            const normalized = PathValidator.normalizePath(windowsPath);
            // Result depends on platform, but should be normalized
            assert.strictEqual(typeof normalized, 'string');
            assert.strictEqual(normalized.length > 0, true);
        });

        test('should join paths safely', () => {
            const joined = PathValidator.joinPaths('src', 'components', 'file.ts');
            assert.strictEqual(joined, path.join('src', 'components', 'file.ts'));
        });

        test('should resolve paths', () => {
            const resolved = PathValidator.resolvePath('file.ts', '/workspace');
            assert.strictEqual(resolved, path.resolve('/workspace', 'file.ts'));
        });

        test('should get file extension', () => {
            const ext = PathValidator.getExtension('file.txt');
            assert.strictEqual(ext, '.txt');
        });

        test('should get name without extension', () => {
            const name = PathValidator.getNameWithoutExtension('file.txt');
            assert.strictEqual(name, 'file');
        });

        test('should get directory name', () => {
            const dir = PathValidator.getDirectoryName('/path/to/file.txt');
            assert.strictEqual(dir, path.dirname('/path/to/file.txt'));
        });

        test('should get base name', () => {
            const base = PathValidator.getBaseName('/path/to/file.txt');
            assert.strictEqual(base, 'file.txt');
        });

        test('should get relative path', () => {
            const relativePath = PathValidator.getRelativePath('/workspace/src/file.ts', '/workspace');
            assert.strictEqual(relativePath, path.join('src', 'file.ts'));
        });
    });

    suite('Error Handling', () => {
        test('should handle invalid paths gracefully', () => {
            // Test with invalid characters that might cause path.resolve to throw
            const result = PathValidator.isValidPath('\0invalid', mockWorkspaceRoot);
            assert.strictEqual(result, false);
        });

        test('should handle relative path edge cases', () => {
            const relativePath = PathValidator.getRelativePath('/workspace', '/workspace');
            assert.strictEqual(relativePath, '.');
        });
    });
});