import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import { PermissionDetector } from '../utils/PermissionDetector';
import { FilePermissions } from '../interfaces/core';

describe('PermissionDetector', () => {
    let mockStat: sinon.SinonStub;
    let mockAccess: sinon.SinonStub;
    let originalPlatform: string;
    
    beforeEach(() => {
        mockStat = sinon.stub(fs.promises, 'stat');
        mockAccess = sinon.stub(fs.promises, 'access');
        
        // Store original platform
        originalPlatform = process.platform;
        
        // Set to a known state
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            writable: true
        });
    });

    afterEach(() => {
        sinon.restore();
        
        // Restore original platform
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            writable: true
        });
    });

    describe('detectPermissions', () => {
        it('should detect basic permissions for a regular file', async () => {
            const mockStats = {
                isDirectory: () => false,
                isFile: () => true,
                size: 1024,
                mtime: new Date(),
                birthtime: new Date()
            };

            mockStat.resolves(mockStats as any);
            mockAccess.callsFake(async (filePath: string, mode: number) => {
                if (mode === fs.constants.W_OK) {
                    return Promise.resolve(); // File is writable
                }
                if (mode === fs.constants.R_OK) {
                    return Promise.resolve(); // File is readable
                }
                if (mode === fs.constants.X_OK) {
                    throw new Error('Not executable'); // File is not executable
                }
            });

            const permissions = await PermissionDetector.detectPermissions('/test/file.txt');

            assert.deepStrictEqual(permissions, {
                readonly: false,
                executable: false,
                hidden: false
            });
        });

        it('should detect readonly file', async () => {
            const mockStats = {
                isDirectory: () => false,
                isFile: () => true
            };

            mockStat.resolves(mockStats as any);
            mockAccess.callsFake(async (filePath: string, mode: number) => {
                if (mode === fs.constants.W_OK) {
                    throw new Error('Not writable'); // File is readonly
                }
                if (mode === fs.constants.R_OK) {
                    return Promise.resolve(); // File is readable
                }
                if (mode === fs.constants.X_OK) {
                    throw new Error('Not executable');
                }
            });

            const permissions = await PermissionDetector.detectPermissions('/test/readonly.txt');

            assert.strictEqual(permissions.readonly, true);
        });

        it('should detect hidden file (dot file)', async () => {
            const mockStats = {
                isDirectory: () => false,
                isFile: () => true
            };

            mockStat.resolves(mockStats as any);
            mockAccess.resolves(undefined);

            const permissions = await PermissionDetector.detectPermissions('/test/.hidden');

            assert.strictEqual(permissions.hidden, true);
        });

        it('should return default permissions on error', async () => {
            mockStat.rejects(new Error('File not found'));

            const permissions = await PermissionDetector.detectPermissions('/nonexistent/file');

            assert.deepStrictEqual(permissions, {
                readonly: false,
                executable: false,
                hidden: false
            });
        });
    });

    describe('getPermissionDetails', () => {
        it('should return detailed permission descriptions', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: true,
                hidden: true
            };

            const details = PermissionDetector.getPermissionDetails(permissions);

            assert.ok(details.includes('読み取り専用'));
            assert.ok(details.includes('実行可能'));
            assert.ok(details.includes('隠しファイル'));
        });

        it('should return read-write for non-readonly files', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: false,
                hidden: false
            };

            const details = PermissionDetector.getPermissionDetails(permissions);

            assert.ok(details.includes('読み書き可能'));
            assert.ok(!details.includes('実行可能'));
            assert.ok(!details.includes('隠しファイル'));
        });
    });

    describe('getPermissionIcons', () => {
        it('should return appropriate icons for permissions', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: true,
                hidden: true
            };

            const icons = PermissionDetector.getPermissionIcons(permissions);

            assert.strictEqual(icons.length, 3);
            assert.ok(icons.find(icon => icon.icon === 'lock'));
            assert.ok(icons.find(icon => icon.icon === 'gear'));
            assert.ok(icons.find(icon => icon.icon === 'eye-closed'));
        });

        it('should return empty array for no special permissions', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: false,
                hidden: false
            };

            const icons = PermissionDetector.getPermissionIcons(permissions);

            assert.strictEqual(icons.length, 0);
        });
    });

    describe('getPermissionSummary', () => {
        it('should return RW X H for full permissions', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: true,
                hidden: true
            };

            const summary = PermissionDetector.getPermissionSummary(permissions);

            assert.strictEqual(summary, 'RW X H');
        });

        it('should return R for readonly file', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: false,
                hidden: false
            };

            const summary = PermissionDetector.getPermissionSummary(permissions);

            assert.strictEqual(summary, 'R');
        });

        it('should return RW for read-write file', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: false,
                hidden: false
            };

            const summary = PermissionDetector.getPermissionSummary(permissions);

            assert.strictEqual(summary, 'RW');
        });
    });

    describe('getPermissionSymbols', () => {
        it('should return appropriate symbols for permissions', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: true,
                hidden: true
            };

            const symbols = PermissionDetector.getPermissionSymbols(permissions);

            assert.ok(symbols.includes('🔒'));
            assert.ok(symbols.includes('⚙️'));
            assert.ok(symbols.includes('👁️‍🗨️'));
        });

        it('should return empty string for no special permissions', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: false,
                hidden: false
            };

            const symbols = PermissionDetector.getPermissionSymbols(permissions);

            assert.strictEqual(symbols, '');
        });
    });

    describe('getPermissionStatus', () => {
        it('should return correct status for readonly file', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: false,
                hidden: false
            };

            const status = PermissionDetector.getPermissionStatus(permissions);

            assert.strictEqual(status.canRead, true);
            assert.strictEqual(status.canWrite, false);
            assert.strictEqual(status.canExecute, false);
            assert.strictEqual(status.canDelete, false);
        });

        it('should return correct status for executable file', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: true,
                hidden: false
            };

            const status = PermissionDetector.getPermissionStatus(permissions);

            assert.strictEqual(status.canRead, true);
            assert.strictEqual(status.canWrite, true);
            assert.strictEqual(status.canExecute, true);
            assert.strictEqual(status.canDelete, true);
        });
    });

    describe('isOperationAllowed', () => {
        it('should allow copy for any permissions', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: false,
                hidden: true
            };

            const allowed = PermissionDetector.isOperationAllowed(permissions, 'copy');

            assert.strictEqual(allowed, true);
        });

        it('should not allow cut/delete/rename for readonly files', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: false,
                hidden: false
            };

            assert.strictEqual(PermissionDetector.isOperationAllowed(permissions, 'cut'), false);
            assert.strictEqual(PermissionDetector.isOperationAllowed(permissions, 'delete'), false);
            assert.strictEqual(PermissionDetector.isOperationAllowed(permissions, 'rename'), false);
        });

        it('should allow all operations for writable files', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: true,
                hidden: false
            };

            assert.strictEqual(PermissionDetector.isOperationAllowed(permissions, 'copy'), true);
            assert.strictEqual(PermissionDetector.isOperationAllowed(permissions, 'cut'), true);
            assert.strictEqual(PermissionDetector.isOperationAllowed(permissions, 'delete'), true);
            assert.strictEqual(PermissionDetector.isOperationAllowed(permissions, 'rename'), true);
            assert.strictEqual(PermissionDetector.isOperationAllowed(permissions, 'create'), true);
        });
    });

    describe('getPermissionClasses', () => {
        it('should return appropriate CSS classes', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: false,
                hidden: true
            };

            const classes = PermissionDetector.getPermissionClasses(permissions);

            assert.ok(classes.includes('readonly'));
            assert.ok(classes.includes('hidden'));
            assert.ok(!classes.includes('executable'));
        });

        it('should return empty array for no special permissions', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: false,
                hidden: false
            };

            const classes = PermissionDetector.getPermissionClasses(permissions);

            assert.strictEqual(classes.length, 0);
        });
    });

    describe('getLocalizedPermissionDescription', () => {
        it('should return localized description for readonly file', () => {
            const permissions: FilePermissions = {
                readonly: true,
                executable: false,
                hidden: false
            };

            const description = PermissionDetector.getLocalizedPermissionDescription(permissions);

            assert.ok(description.includes('読み取り専用'));
        });

        it('should return localized description for executable hidden file', () => {
            const permissions: FilePermissions = {
                readonly: false,
                executable: true,
                hidden: true
            };

            const description = PermissionDetector.getLocalizedPermissionDescription(permissions);

            assert.ok(description.includes('読み書き可能'));
            assert.ok(description.includes('実行可能'));
            assert.ok(description.includes('隠しファイル'));
        });
    });
});