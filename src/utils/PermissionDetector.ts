import * as fs from 'fs';
import * as path from 'path';
import { FilePermissions } from '../interfaces/core';

/**
 * Utility class for detecting file permissions across different platforms
 */
export class PermissionDetector {
    
    /**
     * Detect file permissions for a given file path
     */
    public static async detectPermissions(filePath: string): Promise<FilePermissions> {
        try {
            const stats = await fs.promises.stat(filePath);
            const fileName = path.basename(filePath);
            
            return {
                readonly: await this.isReadonly(filePath, stats),
                executable: await this.isExecutable(filePath, stats),
                hidden: this.isHidden(fileName, filePath)
            };
        } catch (error) {
            // Return default permissions if detection fails
            return {
                readonly: false,
                executable: false,
                hidden: false
            };
        }
    }

    /**
     * Check if file is readonly
     */
    private static async isReadonly(filePath: string, stats: fs.Stats): Promise<boolean> {
        try {
            // Try to access the file for writing
            await fs.promises.access(filePath, fs.constants.W_OK);
            return false;
        } catch {
            // If we can't write to it, it's readonly (or we don't have permission)
            try {
                // But make sure we can at least read it
                await fs.promises.access(filePath, fs.constants.R_OK);
                return true;
            } catch {
                // If we can't even read it, consider it readonly
                return true;
            }
        }
    }

    /**
     * Check if file is executable
     */
    private static async isExecutable(filePath: string, stats: fs.Stats): Promise<boolean> {
        // For directories, executable means we can traverse into them
        if (stats.isDirectory()) {
            try {
                await fs.promises.access(filePath, fs.constants.X_OK);
                return true;
            } catch {
                return false;
            }
        }

        // For files, check if they have execute permission
        try {
            await fs.promises.access(filePath, fs.constants.X_OK);
            
            // Additional check for common executable file extensions on Windows
            if (process.platform === 'win32') {
                const ext = path.extname(filePath).toLowerCase();
                const executableExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.ps1'];
                return executableExtensions.includes(ext);
            }
            
            return true;
        } catch {
            // On Windows, also check by file extension even if access check fails
            if (process.platform === 'win32') {
                const ext = path.extname(filePath).toLowerCase();
                const executableExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.ps1'];
                return executableExtensions.includes(ext);
            }
            
            return false;
        }
    }

    /**
     * Check if file is hidden
     */
    private static isHidden(fileName: string, filePath: string): boolean {
        // Unix-style hidden files (starting with dot)
        if (fileName.startsWith('.')) {
            return true;
        }

        // Windows-style hidden files (check file attributes on Windows)
        if (process.platform === 'win32') {
            try {
                // This is a simplified check - in a real implementation,
                // you might want to use Windows-specific APIs to check file attributes
                const { execSync } = require('child_process');
                const result = execSync(`attrib "${filePath}"`, { encoding: 'utf8' });
                return result.includes('H'); // H = Hidden attribute
            } catch {
                // If we can't check attributes, fall back to dot-file check
                return false;
            }
        }

        return false;
    }

    /**
     * Get detailed permission information as text
     */
    public static getPermissionDetails(permissions: FilePermissions): string[] {
        const details: string[] = [];
        
        if (permissions.readonly) {
            details.push('読み取り専用');
        } else {
            details.push('読み書き可能');
        }
        
        if (permissions.executable) {
            details.push('実行可能');
        }
        
        if (permissions.hidden) {
            details.push('隠しファイル');
        }
        
        return details;
    }

    /**
     * Get permission icons for visual indicators
     */
    public static getPermissionIcons(permissions: FilePermissions): { icon: string; tooltip: string }[] {
        const icons: { icon: string; tooltip: string }[] = [];
        
        if (permissions.readonly) {
            icons.push({
                icon: 'lock',
                tooltip: '読み取り専用'
            });
        }
        
        if (permissions.executable) {
            icons.push({
                icon: 'gear',
                tooltip: '実行可能'
            });
        }
        
        if (permissions.hidden) {
            icons.push({
                icon: 'eye-closed',
                tooltip: '隠しファイル'
            });
        }
        
        return icons;
    }

    /**
     * Check if user can perform specific operations on file
     */
    public static async canPerformOperation(filePath: string, operation: 'read' | 'write' | 'execute' | 'delete'): Promise<boolean> {
        try {
            switch (operation) {
                case 'read':
                    await fs.promises.access(filePath, fs.constants.R_OK);
                    return true;
                    
                case 'write':
                    await fs.promises.access(filePath, fs.constants.W_OK);
                    return true;
                    
                case 'execute':
                    await fs.promises.access(filePath, fs.constants.X_OK);
                    return true;
                    
                case 'delete':
                    // Check if we can write to the parent directory
                    const parentDir = path.dirname(filePath);
                    await fs.promises.access(parentDir, fs.constants.W_OK);
                    return true;
                    
                default:
                    return false;
            }
        } catch {
            return false;
        }
    }

    /**
     * Get permission summary for display
     */
    public static getPermissionSummary(permissions: FilePermissions): string {
        const parts: string[] = [];
        
        // Read/Write status
        if (permissions.readonly) {
            parts.push('R');
        } else {
            parts.push('RW');
        }
        
        // Executable status
        if (permissions.executable) {
            parts.push('X');
        }
        
        // Hidden status
        if (permissions.hidden) {
            parts.push('H');
        }
        
        return parts.join(' ');
    }

    /**
     * Get visual indicator symbols for permissions
     */
    public static getPermissionSymbols(permissions: FilePermissions): string {
        const symbols: string[] = [];
        
        if (permissions.readonly) {
            symbols.push('🔒'); // Lock symbol for readonly
        }
        
        if (permissions.executable) {
            symbols.push('⚙️'); // Gear symbol for executable
        }
        
        if (permissions.hidden) {
            symbols.push('👁️‍🗨️'); // Eye symbol for hidden
        }
        
        return symbols.join(' ');
    }

    /**
     * Get permission status for context menu filtering
     */
    public static getPermissionStatus(permissions: FilePermissions): {
        canRead: boolean;
        canWrite: boolean;
        canExecute: boolean;
        canDelete: boolean;
    } {
        return {
            canRead: true, // If we can detect permissions, we can read
            canWrite: !permissions.readonly,
            canExecute: permissions.executable,
            canDelete: !permissions.readonly // Generally, readonly files can't be deleted
        };
    }

    /**
     * Check if operation is allowed based on permissions
     */
    public static isOperationAllowed(permissions: FilePermissions, operation: 'copy' | 'cut' | 'delete' | 'rename' | 'create'): boolean {
        switch (operation) {
            case 'copy':
                return true; // Copy is always allowed if we can read
            case 'cut':
            case 'delete':
            case 'rename':
                return !permissions.readonly;
            case 'create':
                return !permissions.readonly; // For parent directory
            default:
                return false;
        }
    }

    /**
     * Get permission-based CSS class names for styling
     */
    public static getPermissionClasses(permissions: FilePermissions): string[] {
        const classes: string[] = [];
        
        if (permissions.readonly) {
            classes.push('readonly');
        }
        
        if (permissions.executable) {
            classes.push('executable');
        }
        
        if (permissions.hidden) {
            classes.push('hidden');
        }
        
        return classes;
    }

    /**
     * Get localized permission description
     */
    public static getLocalizedPermissionDescription(permissions: FilePermissions): string {
        const descriptions: string[] = [];
        
        if (permissions.readonly) {
            descriptions.push('読み取り専用');
        } else {
            descriptions.push('読み書き可能');
        }
        
        if (permissions.executable) {
            descriptions.push('実行可能');
        }
        
        if (permissions.hidden) {
            descriptions.push('隠しファイル');
        }
        
        return descriptions.join(', ');
    }
}