// Mock VSCode API for testing
export const window = {
    createOutputChannel: (name: string) => ({
        appendLine: (message: string) => {
            // Mock implementation - could log to console if needed
            // console.log(`[${name}] ${message}`);
        },
        dispose: () => {
            // Mock implementation
        }
    }),
    createInputBox: () => ({
        title: '',
        prompt: '',
        placeholder: '',
        validationMessage: undefined,
        onDidChangeValue: (callback: (value: string) => void) => ({ dispose: () => {} }),
        onDidAccept: (callback: () => void) => ({ dispose: () => {} }),
        onDidHide: (callback: () => void) => ({ dispose: () => {} }),
        show: () => {},
        hide: () => {}
    }),
    showInformationMessage: (message: string, ...items: string[]) => Promise.resolve(undefined),
    showErrorMessage: (message: string, ...items: string[]) => Promise.resolve(undefined),
    showWarningMessage: (message: string, ...items: string[]) => Promise.resolve(undefined),
    showQuickPick: (items: any[], options?: any) => Promise.resolve(undefined),
    createQuickPick: () => ({
        title: '',
        placeholder: '',
        items: [],
        selectedItems: [],
        onDidChangeValue: (callback: (value: string) => void) => ({ dispose: () => {} }),
        onDidAccept: (callback: () => void) => ({ dispose: () => {} }),
        onDidHide: (callback: () => void) => ({ dispose: () => {} }),
        show: () => {},
        hide: () => {},
        dispose: () => {}
    })
};

export const workspace = {
    getConfiguration: (section?: string) => ({
        get: (key: string) => undefined,
        update: (key: string, value: any) => Promise.resolve()
    }),
    workspaceFolders: undefined,
    asRelativePath: (pathOrUri: string) => pathOrUri,
    createFileSystemWatcher: (pattern: any) => ({
        onDidChange: (callback: () => void) => ({ dispose: () => {} }),
        onDidCreate: (callback: () => void) => ({ dispose: () => {} }),
        onDidDelete: (callback: () => void) => ({ dispose: () => {} }),
        dispose: () => {}
    })
};

export const Uri = {
    file: (path: string) => ({ fsPath: path, path })
};

export const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2
};

export const TreeItem = class {
    constructor(public label: string, public collapsibleState?: number) {}
};

export const ConfigurationTarget = {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
};

export class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];

    get event() {
        return (listener: (e: T) => void) => {
            this.listeners.push(listener);
            return {
                dispose: () => {
                    const index = this.listeners.indexOf(listener);
                    if (index >= 0) {
                        this.listeners.splice(index, 1);
                    }
                }
            };
        };
    }

    fire(data: T): void {
        this.listeners.forEach(listener => listener(data));
    }

    dispose(): void {
        this.listeners = [];
    }
}

export const ThemeIcon = class {
    constructor(public id: string) {}
};

export const QuickPickItemKind = {
    Separator: -1,
    Default: 0
};

export class RelativePattern {
    constructor(public base: string, public pattern: string) {}
}

export class MarkdownString {
    constructor(public value?: string) {}
    
    appendText(value: string): MarkdownString {
        this.value = (this.value || '') + value;
        return this;
    }
    
    appendMarkdown(value: string): MarkdownString {
        this.value = (this.value || '') + value;
        return this;
    }
    
    appendCodeblock(value: string, language?: string): MarkdownString {
        this.value = (this.value || '') + '```' + (language || '') + '\n' + value + '\n```';
        return this;
    }
}