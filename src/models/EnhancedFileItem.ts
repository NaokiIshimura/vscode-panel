import * as vscode from 'vscode';
import * as path from 'path';
import { IEnhancedFileItem, FilePermissions } from '../interfaces/core';
import { FileTypeCategory } from '../types/enums';
import { FileInfoFormatter } from '../utils/FileInfoFormatter';
import { PermissionDetector } from '../utils/PermissionDetector';

/**
 * Enhanced file item class extending VSCode TreeItem
 */
export class EnhancedFileItem extends vscode.TreeItem implements IEnhancedFileItem {
    public readonly id: string;
    public readonly filePath: string;
    public readonly isDirectory: boolean;
    public readonly size: number;
    public readonly modified: Date;
    public readonly created?: Date;
    public readonly permissions?: FilePermissions;
    public readonly fileType: FileTypeCategory;
    public readonly label: string; // Override to ensure it's always a string

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        filePath: string,
        isDirectory: boolean,
        size: number,
        modified: Date,
        created?: Date,
        permissions?: FilePermissions
    ) {
        super(label, collapsibleState);
        
        this.id = filePath; // Use file path as unique identifier
        this.label = label; // Ensure label is always a string
        this.filePath = filePath;
        this.isDirectory = isDirectory;
        this.size = size;
        this.modified = modified;
        this.created = created;
        this.permissions = permissions;
        this.fileType = this.determineFileType();

        // Set up VSCode TreeItem properties
        this.resourceUri = vscode.Uri.file(filePath);
        this.contextValue = this.getContextValue();
        this.iconPath = this.getIconPath();
        this.tooltip = this.getTooltip();
        this.command = this.getCommand();
        this.description = this.getDescription();
    }

    /**
     * Get context value for context menus
     */
    private getContextValue(): string {
        const base = this.isDirectory ? 'directory' : 'file';
        const modifiers: string[] = [];
        
        if (this.permissions?.readonly) {
            modifiers.push('readonly');
        }
        
        if (this.permissions?.executable) {
            modifiers.push('executable');
        }
        
        if (this.permissions?.hidden) {
            modifiers.push('hidden');
        }
        
        return modifiers.length > 0 ? `${base}:${modifiers.join(':')}` : base;
    }

    /**
     * Get appropriate icon for the file item
     */
    private getIconPath(): vscode.ThemeIcon {
        if (this.isDirectory) {
            return new vscode.ThemeIcon('folder');
        }

        // Return file type specific icons
        switch (this.fileType) {
            case FileTypeCategory.Code:
                return new vscode.ThemeIcon('file-code');
            case FileTypeCategory.Image:
                return new vscode.ThemeIcon('file-media');
            case FileTypeCategory.Document:
                return new vscode.ThemeIcon('file-text');
            case FileTypeCategory.Archive:
                return new vscode.ThemeIcon('file-zip');
            case FileTypeCategory.Executable:
                return new vscode.ThemeIcon('gear');
            default:
                return new vscode.ThemeIcon('file');
        }
    }

    /**
     * Get tooltip text for the file item
     */
    private getTooltip(): vscode.MarkdownString {
        return FileInfoFormatter.createDetailedTooltip(this, true);
    }

    /**
     * Get command for file item click
     */
    private getCommand(): vscode.Command | undefined {
        if (!this.isDirectory) {
            return {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }
        return undefined;
    }

    /**
     * Get description text for the file item
     */
    private getDescription(): string | undefined {
        return FileInfoFormatter.createCompactDescription(this, true, true);
    }

    /**
     * Determine file type category based on extension
     */
    private determineFileType(): FileTypeCategory {
        if (this.isDirectory) {
            return FileTypeCategory.Unknown;
        }

        const ext = path.extname(this.filePath).toLowerCase();
        
        // Code files
        const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf'];
        if (codeExtensions.includes(ext)) {
            return FileTypeCategory.Code;
        }
        
        // Image files
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];
        if (imageExtensions.includes(ext)) {
            return FileTypeCategory.Image;
        }
        
        // Document files
        const documentExtensions = ['.txt', '.md', '.pdf', '.doc', '.docx', '.rtf', '.odt', '.tex'];
        if (documentExtensions.includes(ext)) {
            return FileTypeCategory.Document;
        }
        
        // Archive files
        const archiveExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'];
        if (archiveExtensions.includes(ext)) {
            return FileTypeCategory.Archive;
        }
        
        // Video files
        const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
        if (videoExtensions.includes(ext)) {
            return FileTypeCategory.Video;
        }
        
        // Audio files
        const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma'];
        if (audioExtensions.includes(ext)) {
            return FileTypeCategory.Audio;
        }
        
        // Executable files
        const executableExtensions = ['.exe', '.msi', '.app', '.deb', '.rpm', '.dmg'];
        if (executableExtensions.includes(ext)) {
            return FileTypeCategory.Executable;
        }
        
        return FileTypeCategory.Unknown;
    }

    /**
     * Get file type description
     */
    public getFileTypeDescription(): string {
        return FileInfoFormatter.getFileTypeDescription(this.filePath, this.isDirectory);
    }

    /**
     * Get permission icons for visual indicators
     */
    public getPermissionIcons(): { icon: string; tooltip: string }[] {
        if (!this.permissions) {
            return [];
        }
        return PermissionDetector.getPermissionIcons(this.permissions);
    }

    /**
     * Get permission summary
     */
    public getPermissionSummary(): string {
        if (!this.permissions) {
            return '';
        }
        return PermissionDetector.getPermissionSummary(this.permissions);
    }

    /**
     * Check if user can perform specific operations on this file
     */
    public async canPerformOperation(operation: 'read' | 'write' | 'execute' | 'delete'): Promise<boolean> {
        return PermissionDetector.canPerformOperation(this.filePath, operation);
    }

    /**
     * Check if this item matches a search query
     */
    public matchesSearch(query: string, caseSensitive: boolean = false): boolean {
        const labelText = this.label || '';
        const searchText = caseSensitive ? labelText : labelText.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        
        // Simple substring match for now
        // Can be enhanced with fuzzy matching or regex support
        return searchText.includes(searchQuery);
    }

    /**
     * Get sort key for the specified sort order
     */
    public getSortKey(sortOrder: string): string | number {
        const labelText = this.label || '';
        switch (sortOrder) {
            case 'name-asc':
            case 'name-desc':
                return labelText.toLowerCase();
            case 'size-asc':
            case 'size-desc':
                return this.size;
            case 'modified-asc':
            case 'modified-desc':
                return this.modified.getTime();
            default:
                return labelText.toLowerCase();
        }
    }

    /**
     * Create EnhancedFileItem from file system stats
     */
    static async fromPath(filePath: string): Promise<EnhancedFileItem> {
        const fs = require('fs').promises;
        const pathModule = require('path');
        
        try {
            const stats = await fs.stat(filePath);
            const fileName = pathModule.basename(filePath);
            
            // Detect permissions using the new utility
            const permissions = await PermissionDetector.detectPermissions(filePath);
            
            return new EnhancedFileItem(
                fileName,
                stats.isDirectory() ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                filePath,
                stats.isDirectory(),
                stats.isFile() ? stats.size : 0,
                stats.mtime,
                stats.birthtime,
                permissions
            );
        } catch (error) {
            throw new Error(`Failed to create EnhancedFileItem from path: ${error}`);
        }
    }
}