import * as assert from 'assert';
import { FileInfoFormatter } from '../utils/FileInfoFormatter';
import { IEnhancedFileItem, FilePermissions } from '../interfaces/core';

describe('FileInfoFormatter', () => {
    let mockFileItem: IEnhancedFileItem;
    let mockDirectoryItem: IEnhancedFileItem;
    let mockPermissions: FilePermissions;

    beforeEach(() => {
        mockPermissions = {
            readonly: false,
            executable: true,
            hidden: false
        };

        mockFileItem = {
            id: '/test/file.txt',
            label: 'file.txt',
            filePath: '/test/file.txt',
            isDirectory: false,
            size: 1024,
            modified: new Date('2023-12-01T10:00:00Z'),
            created: new Date('2023-11-01T10:00:00Z'),
            permissions: mockPermissions
        };

        mockDirectoryItem = {
            id: '/test/folder',
            label: 'folder',
            filePath: '/test/folder',
            isDirectory: true,
            size: 0,
            modified: new Date('2023-12-01T10:00:00Z'),
            created: new Date('2023-11-01T10:00:00Z'),
            permissions: mockPermissions
        };
    });

    describe('formatFileSize', () => {
        it('should format bytes correctly', () => {
            assert.strictEqual(FileInfoFormatter.formatFileSize(0), '0 B');
            assert.strictEqual(FileInfoFormatter.formatFileSize(512), '512 B');
            assert.strictEqual(FileInfoFormatter.formatFileSize(1024), '1 KB');
            assert.strictEqual(FileInfoFormatter.formatFileSize(1536), '1.5 KB');
            assert.strictEqual(FileInfoFormatter.formatFileSize(1048576), '1 MB');
            assert.strictEqual(FileInfoFormatter.formatFileSize(1073741824), '1 GB');
        });

        it('should handle large file sizes', () => {
            const terabyte = 1024 * 1024 * 1024 * 1024;
            assert.strictEqual(FileInfoFormatter.formatFileSize(terabyte), '1 TB');
            
            const petabyte = terabyte * 1024;
            assert.strictEqual(FileInfoFormatter.formatFileSize(petabyte), '1 PB');
        });

        it('should handle negative sizes', () => {
            assert.strictEqual(FileInfoFormatter.formatFileSize(-1), 'Unknown');
        });

        it('should format decimal places appropriately', () => {
            assert.strictEqual(FileInfoFormatter.formatFileSize(1500), '1.46 KB');
            assert.strictEqual(FileInfoFormatter.formatFileSize(15000), '14.6 KB');
        });
    });

    describe('getRelativeTimeString', () => {
        it('should return "今" for very recent times', () => {
            const now = new Date();
            const recent = new Date(now.getTime() - 10000); // 10 seconds ago
            assert.strictEqual(FileInfoFormatter.getRelativeTimeString(recent), '今');
        });

        it('should format minutes correctly', () => {
            const now = new Date();
            const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
            assert.strictEqual(FileInfoFormatter.getRelativeTimeString(twoMinutesAgo), '2分前');
        });

        it('should format hours correctly', () => {
            const now = new Date();
            const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
            assert.strictEqual(FileInfoFormatter.getRelativeTimeString(threeHoursAgo), '3時間前');
        });

        it('should format days correctly', () => {
            const now = new Date();
            const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
            assert.strictEqual(FileInfoFormatter.getRelativeTimeString(fiveDaysAgo), '5日前');
        });

        it('should format weeks correctly', () => {
            const now = new Date();
            const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
            assert.strictEqual(FileInfoFormatter.getRelativeTimeString(twoWeeksAgo), '2週間前');
        });

        it('should format months correctly', () => {
            const now = new Date();
            const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            assert.strictEqual(FileInfoFormatter.getRelativeTimeString(threeMonthsAgo), '3ヶ月前');
        });

        it('should format years correctly', () => {
            const now = new Date();
            const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
            assert.strictEqual(FileInfoFormatter.getRelativeTimeString(twoYearsAgo), '2年前');
        });
    });

    describe('formatAbsoluteTime', () => {
        const testDate = new Date('2023-12-01T15:30:45');

        it('should format full time correctly', () => {
            const result = FileInfoFormatter.formatAbsoluteTime(testDate, 'full');
            assert.ok(/2023.*12.*01.*15.*30.*45/.test(result));
        });

        it('should format date only', () => {
            const result = FileInfoFormatter.formatAbsoluteTime(testDate, 'date');
            assert.ok(/2023.*12.*01/.test(result));
            assert.ok(!/15.*30.*45/.test(result));
        });

        it('should format time only', () => {
            const result = FileInfoFormatter.formatAbsoluteTime(testDate, 'time');
            assert.ok(/15.*30.*45/.test(result));
            assert.ok(!/2023.*12.*01/.test(result));
        });

        it('should format compact time', () => {
            const result = FileInfoFormatter.formatAbsoluteTime(testDate, 'compact');
            assert.ok(/23.*12.*01.*15.*30/.test(result));
            assert.ok(!/45/.test(result)); // seconds not included in compact
        });
    });

    describe('getPermissionText', () => {
        it('should return empty string for undefined permissions', () => {
            assert.strictEqual(FileInfoFormatter.getPermissionText(undefined), '');
        });

        it('should format single permission', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: false,
                hidden: false
            };
            assert.strictEqual(FileInfoFormatter.getPermissionText(permissions), '読み取り専用');
        });

        it('should format multiple permissions', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: true,
                hidden: true
            };
            const result = FileInfoFormatter.getPermissionText(permissions);
            assert.ok(result.includes('読み取り専用'));
            assert.ok(result.includes('実行可能'));
            assert.ok(result.includes('隠しファイル'));
        });

        it('should return empty string for no permissions set', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: false,
                hidden: false
            };
            assert.strictEqual(FileInfoFormatter.getPermissionText(permissions), '');
        });
    });

    describe('createDetailedTooltip', () => {
        it('should create tooltip for file with all information', () => {
            const tooltip = FileInfoFormatter.createDetailedTooltip(mockFileItem, true);
            
            assert.ok(tooltip.value.includes('**file.txt**'));
            assert.ok(tooltip.value.includes('**種類:** ファイル'));
            assert.ok(tooltip.value.includes('**サイズ:** 1 KB'));
            assert.ok(tooltip.value.includes('**パス:**'));
            assert.ok(tooltip.value.includes('/test/file.txt'));
            assert.ok(tooltip.value.includes('**更新:**'));
            assert.ok(tooltip.value.includes('**作成:**'));
            assert.ok(tooltip.value.includes('**権限:** 実行可能'));
        });

        it('should create tooltip for directory', () => {
            const tooltip = FileInfoFormatter.createDetailedTooltip(mockDirectoryItem, true);
            
            assert.ok(tooltip.value.includes('**folder**'));
            assert.ok(tooltip.value.includes('**種類:** ディレクトリ'));
            assert.ok(!tooltip.value.includes('**サイズ:**'));
        });

        it('should handle relative time display', () => {
            const tooltip = FileInfoFormatter.createDetailedTooltip(mockFileItem, true);
            assert.ok(tooltip.value.includes('前')); // Should contain relative time
        });

        it('should handle absolute time display', () => {
            const tooltip = FileInfoFormatter.createDetailedTooltip(mockFileItem, false);
            assert.ok(tooltip.value.includes('2023')); // Should contain absolute time
        });

        it('should handle missing created date', () => {
            const itemWithoutCreated = { ...mockFileItem, created: undefined };
            const tooltip = FileInfoFormatter.createDetailedTooltip(itemWithoutCreated, true);
            
            assert.ok(tooltip.value.includes('**更新:**'));
            assert.ok(!tooltip.value.includes('**作成:**'));
        });

        it('should handle missing permissions', () => {
            const itemWithoutPermissions = { ...mockFileItem, permissions: undefined };
            const tooltip = FileInfoFormatter.createDetailedTooltip(itemWithoutPermissions, true);
            
            assert.ok(!tooltip.value.includes('**権限:**'));
        });
    });

    describe('createCompactDescription', () => {
        it('should create description for file with size and time', () => {
            const description = FileInfoFormatter.createCompactDescription(mockFileItem, true, true);
            assert.ok(description.includes('1 KB'));
            assert.ok(description.includes('•'));
            assert.ok(/前|今/.test(description)); // Should contain relative time
        });

        it('should create description with size only', () => {
            const description = FileInfoFormatter.createCompactDescription(mockFileItem, true, false);
            assert.strictEqual(description, '1 KB');
        });

        it('should create description with time only', () => {
            const description = FileInfoFormatter.createCompactDescription(mockFileItem, false, true);
            assert.ok(/前|今/.test(description));
            assert.ok(!description.includes('KB'));
        });

        it('should return relative time for directory when time is enabled', () => {
            const description = FileInfoFormatter.createCompactDescription(mockDirectoryItem, true, true);
            assert.ok(/前|今/.test(description));
            assert.ok(!description.includes('KB'));
        });

        it('should return empty string for directory when only size is enabled', () => {
            const description = FileInfoFormatter.createCompactDescription(mockDirectoryItem, true, false);
            assert.strictEqual(description, '');
        });
    });

    describe('formatFileCount', () => {
        it('should format file count only', () => {
            assert.strictEqual(FileInfoFormatter.formatFileCount(5, 0), '5個のファイル');
        });

        it('should format directory count only', () => {
            assert.strictEqual(FileInfoFormatter.formatFileCount(0, 3), '3個のフォルダ');
        });

        it('should format both file and directory counts', () => {
            const result = FileInfoFormatter.formatFileCount(5, 3);
            assert.ok(result.includes('5個のファイル'));
            assert.ok(result.includes('3個のフォルダ'));
            assert.ok(result.includes(','));
        });

        it('should handle empty folder', () => {
            assert.strictEqual(FileInfoFormatter.formatFileCount(0, 0), '空のフォルダ');
        });
    });

    describe('getFileTypeDescription', () => {
        it('should return フォルダ for directories', () => {
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('/path/to/folder', true), 'フォルダ');
        });

        it('should return specific descriptions for known file types', () => {
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.js', false), 'JavaScript ファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.ts', false), 'TypeScript ファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.py', false), 'Python ファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.html', false), 'HTML ファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.css', false), 'CSS ファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.json', false), 'JSON ファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.md', false), 'Markdown ファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.txt', false), 'テキストファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.pdf', false), 'PDF ファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.jpg', false), 'JPEG 画像');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.png', false), 'PNG 画像');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.zip', false), 'ZIP アーカイブ');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.mp4', false), 'MP4 動画');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.mp3', false), 'MP3 音声');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.exe', false), '実行ファイル');
        });

        it('should handle unknown file extensions', () => {
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.xyz', false), 'XYZ ファイル');
        });

        it('should handle files without extensions', () => {
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('README', false), 'ファイル');
        });

        it('should be case insensitive', () => {
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.JS', false), 'JavaScript ファイル');
            assert.strictEqual(FileInfoFormatter.getFileTypeDescription('test.PNG', false), 'PNG 画像');
        });
    });
});