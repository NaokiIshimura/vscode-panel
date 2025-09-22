import * as fs from 'fs';
import { FilePermissions } from '../interfaces/core';

/**
 * Permission checking utility class
 */
export class PermissionChecker {
    /**
     * Check if a file/directory can be read
     */
    static async canRead(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath, fs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a file/directory can be written to
     */
    static async canWrite(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath, fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a file can be executed
     */
    static async canExecute(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath, fs.constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a file/directory exists
     */
    static async exists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get comprehensive file permissions
     */
    static async getFilePermissions(filePath: string): Promise<FilePermissions> {
        try {
            const stats = await fs.promises.stat(filePath);
            const fileName = require('path').basename(filePath);
            
            // Basic permission checks
            const canRead = await this.canRead(filePath);
            const canWrite = await this.canWrite(filePath);
            const canExecute = await this.canExecute(filePath);
            
            return {
                readonly: canRead && !canWrite,
                executable: canExecute,
                hidden: this.isHiddenFile(fileName, stats)
            };
        } catch (error) {
            // Return default permissions if unable to determine
            return {
                readonly: false,
                executable: false,
                hidden: false
            };
        }
    }

    /**
     * Check if a file is hidden based on platform conventions
     */
    private static isHiddenFile(fileName: string, stats: fs.Stats): boolean {
        // Unix-like systems: files starting with dot are hidden
        if (process.platform !== 'win32') {
            return fileName.startsWith('.');
        }

        // Windows: check hidden attribute if available
        // Note: This is a simplified check. Full Windows hidden file detection
        // would require platform-specific APIs
        if (fileName.startsWith('.')) {
            return true;
        }

        // On Windows, we could check file attributes, but that requires
        // additional native modules. For now, we'll use the dot convention.
        return false;
    }

    /**
     * Check if the current process has permission to perform an operation
     */
    static async checkOperationPermission(
        filePath: string, 
        operation: 'read' | 'write' | 'execute' | 'delete'
    ): Promise<{ allowed: boolean; reason?: string }> {
        try {
            const exists = await this.exists(filePath);
            
            if (!exists && operation !== 'write') {
                return {
                    allowed: false,
                    reason: 'ファイルまたはディレクトリが存在しません'
                };
            }

            switch (operation) {
                case 'read':
                    const canRead = await this.canRead(filePath);
                    return {
                        allowed: canRead,
                        reason: canRead ? undefined : '読み取り権限がありません'
                    };

                case 'write':
                    if (exists) {
                        const canWrite = await this.canWrite(filePath);
                        return {
                            allowed: canWrite,
                            reason: canWrite ? undefined : '書き込み権限がありません'
                        };
                    } else {
                        // Check parent directory write permission for new files
                        const parentDir = require('path').dirname(filePath);
                        const canWriteParent = await this.canWrite(parentDir);
                        return {
                            allowed: canWriteParent,
                            reason: canWriteParent ? undefined : '親ディレクトリに書き込み権限がありません'
                        };
                    }

                case 'execute':
                    const canExecute = await this.canExecute(filePath);
                    return {
                        allowed: canExecute,
                        reason: canExecute ? undefined : '実行権限がありません'
                    };

                case 'delete':
                    // For deletion, we need write permission on the parent directory
                    const parentDir = require('path').dirname(filePath);
                    const canDeleteFromParent = await this.canWrite(parentDir);
                    
                    if (!canDeleteFromParent) {
                        return {
                            allowed: false,
                            reason: '親ディレクトリに書き込み権限がありません'
                        };
                    }

                    // Also check if the file itself is writable (for some systems)
                    const canWriteFile = await this.canWrite(filePath);
                    return {
                        allowed: canWriteFile,
                        reason: canWriteFile ? undefined : 'ファイルが読み取り専用です'
                    };

                default:
                    return {
                        allowed: false,
                        reason: '不明な操作です'
                    };
            }
        } catch (error) {
            return {
                allowed: false,
                reason: `権限チェック中にエラーが発生しました: ${error}`
            };
        }
    }

    /**
     * Get human-readable permission description
     */
    static async getPermissionDescription(filePath: string): Promise<string> {
        try {
            const permissions = await this.getFilePermissions(filePath);
            const parts: string[] = [];

            if (permissions.readonly) {
                parts.push('読み取り専用');
            } else {
                parts.push('読み書き可能');
            }

            if (permissions.executable) {
                parts.push('実行可能');
            }

            if (permissions.hidden) {
                parts.push('隠しファイル');
            }

            return parts.join(', ');
        } catch (error) {
            return '権限不明';
        }
    }

    /**
     * Check if a directory can be traversed (entered)
     */
    static async canTraverse(dirPath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(dirPath);
            if (!stats.isDirectory()) {
                return false;
            }
            
            // Try to read the directory contents
            await fs.promises.readdir(dirPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a file is locked by another process
     */
    static async isFileLocked(filePath: string): Promise<boolean> {
        try {
            // Try to open the file in exclusive mode
            const fd = await fs.promises.open(filePath, 'r+');
            await fd.close();
            return false;
        } catch (error: any) {
            // If we get EBUSY or EACCES, the file might be locked
            if (error.code === 'EBUSY' || error.code === 'EACCES') {
                return true;
            }
            // Other errors might indicate the file doesn't exist or other issues
            return false;
        }
    }

    /**
     * Get file system information
     */
    static async getFileSystemInfo(filePath: string): Promise<{
        type: string;
        totalSpace?: number;
        freeSpace?: number;
        usedSpace?: number;
    }> {
        try {
            const stats = await fs.promises.stat(filePath);
            
            // Basic file system type detection
            // This is simplified - full implementation would use platform-specific APIs
            let fsType = 'unknown';
            
            if (process.platform === 'win32') {
                fsType = 'NTFS'; // Assumption for Windows
            } else if (process.platform === 'darwin') {
                fsType = 'APFS'; // Assumption for macOS
            } else {
                fsType = 'ext4'; // Assumption for Linux
            }

            return {
                type: fsType
            };
        } catch (error) {
            return {
                type: 'unknown'
            };
        }
    }
}