// Test setup - mock vscode module
import * as path from 'path';

// Mock the vscode module
const vscodeModule = require('./mocks/vscode');

// Set up module resolution for vscode
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id: string) {
    if (id === 'vscode') {
        return vscodeModule;
    }
    return originalRequire.apply(this, arguments);
};

// Also handle ES module imports
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request: string, parent: any, isMain: boolean) {
    if (request === 'vscode') {
        return path.join(__dirname, 'mocks', 'vscode.js');
    }
    return originalResolveFilename.call(this, request, parent, isMain);
};