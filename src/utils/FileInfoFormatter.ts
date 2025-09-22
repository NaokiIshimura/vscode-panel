import * as vscode from 'vscode';
import { IEnhancedFileItem, FilePermissions } from '../interfaces/core';

/**
 * Utility class for formatting file information display
 */
export class FileInfoFormatter {
    
    /**
     * Format file size in human readable format with appropriate units
     */
    public static formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        if (bytes < 0) return 'Unknown';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        if (i >= sizes.length) {
            return `${(bytes / Math.pow(k, sizes.length - 1)).toFixed(2)} ${sizes[sizes.length - 1]}`;
        }

        const value = bytes / Math.pow(k, i);
        
        // For exact values (like 1024 = 1 KB), don't show decimals
        if (value === Math.floor(value)) {
            return `${Math.floor(value)} ${sizes[i]}`;
        }
        
        const decimals = i === 0 ? 0 : (value < 10 ? 2 : 1);
        return `${value.toFixed(decimals)} ${sizes[i]}`;
    }

    /**
     * Get relative time string (e.g., "2 hours ago", "3 days ago")
     */
    public static getRelativeTimeString(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);
        const diffYears = Math.floor(diffDays / 365);

        if (diffYears > 0) {
            return `${diffYears}年前`;
        } else if (diffMonths > 0) {
            return `${diffMonths}ヶ月前`;
        } else if (diffWeeks > 0) {
            return `${diffWeeks}週間前`;
        } else if (diffDays > 0) {
            return `${diffDays}日前`;
        } else if (diffHours > 0) {
            return `${diffHours}時間前`;
        } else if (diffMinutes > 0) {
            return `${diffMinutes}分前`;
        } else if (diffSeconds > 30) {
            return `${diffSeconds}秒前`;
        } else {
            return '今';
        }
    }

    /**
     * Format modified date for display in tree items
     */
    public static formatModifiedDate(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        // If within last 7 days, show relative time
        if (diffDays < 7) {
            return this.getRelativeTimeString(date);
        }
        
        // Otherwise show compact date
        return this.formatAbsoluteTime(date, 'compact');
    }

    /**
     * Format absolute time with options for different formats
     */
    public static formatAbsoluteTime(date: Date, format: 'full' | 'date' | 'time' | 'compact' = 'full'): string {
        const options: Intl.DateTimeFormatOptions = {};
        
        switch (format) {
            case 'full':
                options.year = 'numeric';
                options.month = '2-digit';
                options.day = '2-digit';
                options.hour = '2-digit';
                options.minute = '2-digit';
                options.second = '2-digit';
                break;
            case 'date':
                options.year = 'numeric';
                options.month = '2-digit';
                options.day = '2-digit';
                break;
            case 'time':
                options.hour = '2-digit';
                options.minute = '2-digit';
                options.second = '2-digit';
                break;
            case 'compact':
                options.year = '2-digit';
                options.month = '2-digit';
                options.day = '2-digit';
                options.hour = '2-digit';
                options.minute = '2-digit';
                break;
        }

        return date.toLocaleString('ja-JP', options);
    }

    /**
     * Get permission text description
     */
    public static getPermissionText(permissions?: FilePermissions): string {
        if (!permissions) {
            return '';
        }

        const parts: string[] = [];
        
        if (permissions.readonly) {
            parts.push('読み取り専用');
        }
        
        if (permissions.executable) {
            parts.push('実行可能');
        }
        
        if (permissions.hidden) {
            parts.push('隠しファイル');
        }
        
        return parts.join(', ');
    }

    /**
     * Create comprehensive tooltip for file item
     */
    public static createDetailedTooltip(item: IEnhancedFileItem, showRelativeTime: boolean = true): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        
        // File name and type
        tooltip.appendMarkdown(`**${item.label}**\n\n`);
        
        if (item.isDirectory) {
            tooltip.appendMarkdown('**種類:** ディレクトリ\n');
        } else {
            const sizeText = this.formatFileSize(item.size);
            tooltip.appendMarkdown(`**種類:** ファイル\n`);
            tooltip.appendMarkdown(`**サイズ:** ${sizeText}\n`);
        }
        
        // Path information
        tooltip.appendMarkdown(`**パス:** \`${item.filePath}\`\n\n`);
        
        // Time information
        if (showRelativeTime) {
            const relativeTime = this.getRelativeTimeString(item.modified);
            tooltip.appendMarkdown(`**更新:** ${relativeTime} (${this.formatAbsoluteTime(item.modified, 'compact')})\n`);
        } else {
            tooltip.appendMarkdown(`**更新日時:** ${this.formatAbsoluteTime(item.modified)}\n`);
        }
        
        if (item.created) {
            if (showRelativeTime) {
                const relativeCreated = this.getRelativeTimeString(item.created);
                tooltip.appendMarkdown(`**作成:** ${relativeCreated} (${this.formatAbsoluteTime(item.created, 'compact')})\n`);
            } else {
                tooltip.appendMarkdown(`**作成日時:** ${this.formatAbsoluteTime(item.created)}\n`);
            }
        }
        
        // Permission information
        if (item.permissions) {
            const permissionText = this.getPermissionText(item.permissions);
            if (permissionText) {
                tooltip.appendMarkdown(`**権限:** ${permissionText}\n`);
            }
        }
        
        return tooltip;
    }

    /**
     * Create compact description for tree item
     */
    public static createCompactDescription(item: IEnhancedFileItem, showSize: boolean = true, showTime: boolean = true): string {
        if (item.isDirectory) {
            return showTime ? this.getRelativeTimeString(item.modified) : '';
        }
        
        const parts: string[] = [];
        
        if (showSize) {
            parts.push(this.formatFileSize(item.size));
        }
        
        if (showTime) {
            parts.push(this.getRelativeTimeString(item.modified));
        }
        
        return parts.join(' • ');
    }

    /**
     * Format file count information
     */
    public static formatFileCount(fileCount: number, dirCount: number): string {
        const parts: string[] = [];
        
        if (fileCount > 0) {
            parts.push(`${fileCount}個のファイル`);
        }
        
        if (dirCount > 0) {
            parts.push(`${dirCount}個のフォルダ`);
        }
        
        if (parts.length === 0) {
            return '空のフォルダ';
        }
        
        return parts.join(', ');
    }

    /**
     * Get file type description based on extension
     */
    public static getFileTypeDescription(filePath: string, isDirectory: boolean): string {
        if (isDirectory) {
            return 'フォルダ';
        }

        const fileName = filePath.split('/').pop() || filePath;
        const dotIndex = fileName.lastIndexOf('.');
        
        // No extension or file starts with dot (hidden file without extension)
        if (dotIndex === -1 || dotIndex === 0) {
            return 'ファイル';
        }
        
        const ext = fileName.substring(dotIndex).toLowerCase();

        // Common file type descriptions (using extensions with dots)
        const typeMap: { [key: string]: string } = {
            // Code files
            'js': 'JavaScript ファイル',
            'ts': 'TypeScript ファイル',
            'jsx': 'React JSX ファイル',
            'tsx': 'React TSX ファイル',
            'py': 'Python ファイル',
            'java': 'Java ファイル',
            'c': 'C ファイル',
            'cpp': 'C++ ファイル',
            'cs': 'C# ファイル',
            'php': 'PHP ファイル',
            'rb': 'Ruby ファイル',
            'go': 'Go ファイル',
            'rs': 'Rust ファイル',
            'swift': 'Swift ファイル',
            'kt': 'Kotlin ファイル',
            
            // Web files
            'html': 'HTML ファイル',
            'css': 'CSS ファイル',
            'scss': 'SCSS ファイル',
            'sass': 'Sass ファイル',
            'less': 'Less ファイル',
            'vue': 'Vue ファイル',
            'svelte': 'Svelte ファイル',
            
            // Data files
            'json': 'JSON ファイル',
            'xml': 'XML ファイル',
            'yaml': 'YAML ファイル',
            'yml': 'YAML ファイル',
            'toml': 'TOML ファイル',
            'ini': 'INI ファイル',
            'cfg': '設定ファイル',
            'conf': '設定ファイル',
            
            // Document files
            'txt': 'テキストファイル',
            'md': 'Markdown ファイル',
            'pdf': 'PDF ファイル',
            'doc': 'Word 文書',
            'docx': 'Word 文書',
            'rtf': 'RTF 文書',
            'odt': 'OpenDocument テキスト',
            
            // Image files
            'jpg': 'JPEG 画像',
            'jpeg': 'JPEG 画像',
            'png': 'PNG 画像',
            'gif': 'GIF 画像',
            'bmp': 'BMP 画像',
            'svg': 'SVG 画像',
            'webp': 'WebP 画像',
            'ico': 'アイコンファイル',
            
            // Archive files
            'zip': 'ZIP アーカイブ',
            'rar': 'RAR アーカイブ',
            '7z': '7-Zip アーカイブ',
            'tar': 'TAR アーカイブ',
            'gz': 'Gzip アーカイブ',
            
            // Video files
            'mp4': 'MP4 動画',
            'avi': 'AVI 動画',
            'mkv': 'MKV 動画',
            'mov': 'QuickTime 動画',
            'wmv': 'WMV 動画',
            
            // Audio files
            'mp3': 'MP3 音声',
            'wav': 'WAV 音声',
            'flac': 'FLAC 音声',
            'aac': 'AAC 音声',
            'ogg': 'OGG 音声',
            
            // Executable files
            'exe': '実行ファイル',
            'msi': 'Windows インストーラー',
            'app': 'macOS アプリケーション',
            'deb': 'Debian パッケージ',
            'rpm': 'RPM パッケージ',
            'dmg': 'macOS ディスクイメージ'
        };

        return typeMap[ext] || `${ext.toUpperCase()} ファイル`;
    }
}