import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Debug logging levels
 */
export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warning = 2,
    Error = 3,
    Critical = 4
}

/**
 * Debug log entry interface
 */
export interface DebugLogEntry {
    timestamp: Date;
    level: LogLevel;
    category: string;
    message: string;
    data?: any;
    stack?: string;
}

/**
 * Debug logger configuration
 */
export interface DebugLoggerConfig {
    enabled: boolean;
    level: LogLevel;
    maxFileSize: number; // in bytes
    maxFiles: number;
    logToFile: boolean;
    logToConsole: boolean;
    logToOutputChannel: boolean;
}

/**
 * Comprehensive debug logging service
 */
export class DebugLogger {
    private static instance: DebugLogger;
    private readonly config: DebugLoggerConfig;
    private readonly outputChannel: vscode.OutputChannel;
    private readonly logEntries: DebugLogEntry[] = [];
    private readonly maxMemoryEntries = 5000;
    private logFilePath?: string;

    private constructor() {
        this.config = this.loadConfiguration();
        this.outputChannel = vscode.window.createOutputChannel('File List Extension - Debug');
        this.initializeLogFile();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): DebugLogger {
        if (!DebugLogger.instance) {
            DebugLogger.instance = new DebugLogger();
        }
        return DebugLogger.instance;
    }

    /**
     * Log debug message
     */
    debug(category: string, message: string, data?: any): void {
        this.log(LogLevel.Debug, category, message, data);
    }

    /**
     * Log info message
     */
    info(category: string, message: string, data?: any): void {
        this.log(LogLevel.Info, category, message, data);
    }

    /**
     * Log warning message
     */
    warning(category: string, message: string, data?: any): void {
        this.log(LogLevel.Warning, category, message, data);
    }

    /**
     * Log error message
     */
    error(category: string, message: string, error?: Error, data?: any): void {
        const logData = {
            ...data,
            error: error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : undefined
        };
        
        this.log(LogLevel.Error, category, message, logData, error?.stack);
    }

    /**
     * Log critical message
     */
    critical(category: string, message: string, error?: Error, data?: any): void {
        const logData = {
            ...data,
            error: error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : undefined
        };
        
        this.log(LogLevel.Critical, category, message, logData, error?.stack);
    }

    /**
     * Log performance timing
     */
    timing(category: string, operation: string, startTime: number, data?: any): void {
        const duration = Date.now() - startTime;
        this.info(category, `${operation} completed in ${duration}ms`, {
            operation,
            duration,
            ...data
        });
    }

    /**
     * Start performance timing
     */
    startTiming(category: string, operation: string): () => void {
        const startTime = Date.now();
        this.debug(category, `Starting ${operation}`);
        
        return () => {
            this.timing(category, operation, startTime);
        };
    }

    /**
     * Log with context wrapper
     */
    withContext<T>(category: string, operation: string, fn: () => T): T;
    withContext<T>(category: string, operation: string, fn: () => Promise<T>): Promise<T>;
    withContext<T>(category: string, operation: string, fn: () => T | Promise<T>): T | Promise<T> {
        const endTiming = this.startTiming(category, operation);
        
        try {
            const result = fn();
            
            if (result instanceof Promise) {
                return result
                    .then(value => {
                        endTiming();
                        return value;
                    })
                    .catch(error => {
                        this.error(category, `${operation} failed`, error);
                        endTiming();
                        throw error;
                    });
            } else {
                endTiming();
                return result;
            }
        } catch (error) {
            this.error(category, `${operation} failed`, error as Error);
            endTiming();
            throw error;
        }
    }

    /**
     * Core logging method
     */
    private log(level: LogLevel, category: string, message: string, data?: any, stack?: string): void {
        if (!this.config.enabled || level < this.config.level) {
            return;
        }

        const entry: DebugLogEntry = {
            timestamp: new Date(),
            level,
            category,
            message,
            data,
            stack
        };

        // Add to memory log
        this.logEntries.push(entry);
        if (this.logEntries.length > this.maxMemoryEntries) {
            this.logEntries.shift();
        }

        // Log to various outputs
        if (this.config.logToConsole) {
            this.logToConsole(entry);
        }

        if (this.config.logToOutputChannel) {
            this.logToOutputChannel(entry);
        }

        if (this.config.logToFile && this.logFilePath) {
            this.logToFile(entry);
        }
    }

    /**
     * Log to console
     */
    private logToConsole(entry: DebugLogEntry): void {
        const formatted = this.formatLogEntry(entry);
        
        switch (entry.level) {
            case LogLevel.Debug:
                console.debug(formatted);
                break;
            case LogLevel.Info:
                console.info(formatted);
                break;
            case LogLevel.Warning:
                console.warn(formatted);
                break;
            case LogLevel.Error:
            case LogLevel.Critical:
                console.error(formatted);
                break;
        }
    }

    /**
     * Log to output channel
     */
    private logToOutputChannel(entry: DebugLogEntry): void {
        const formatted = this.formatLogEntry(entry);
        this.outputChannel.appendLine(formatted);
    }

    /**
     * Log to file
     */
    private logToFile(entry: DebugLogEntry): void {
        if (!this.logFilePath) {
            return;
        }

        try {
            const formatted = this.formatLogEntry(entry) + '\n';
            fs.appendFileSync(this.logFilePath, formatted, 'utf8');
            
            // Check file size and rotate if necessary
            this.rotateLogFileIfNeeded();
        } catch (error) {
            // Fallback to console if file logging fails
            console.error('Failed to write to log file:', error);
        }
    }

    /**
     * Format log entry for output
     */
    private formatLogEntry(entry: DebugLogEntry): string {
        const timestamp = entry.timestamp.toISOString();
        const level = LogLevel[entry.level].toUpperCase().padEnd(8);
        const category = entry.category.padEnd(20);
        
        let formatted = `[${timestamp}] ${level} [${category}] ${entry.message}`;
        
        if (entry.data) {
            formatted += ` | Data: ${JSON.stringify(entry.data)}`;
        }
        
        if (entry.stack) {
            formatted += `\nStack: ${entry.stack}`;
        }
        
        return formatted;
    }

    /**
     * Load configuration from VS Code settings
     */
    private loadConfiguration(): DebugLoggerConfig {
        const config = vscode.workspace.getConfiguration('fileListExtension.debug');
        
        return {
            enabled: config.get('enabled', false),
            level: this.parseLogLevel(config.get('level', 'info')),
            maxFileSize: config.get('maxFileSize', 10 * 1024 * 1024), // 10MB
            maxFiles: config.get('maxFiles', 5),
            logToFile: config.get('logToFile', false),
            logToConsole: config.get('logToConsole', true),
            logToOutputChannel: config.get('logToOutputChannel', true)
        };
    }

    /**
     * Parse log level from string
     */
    private parseLogLevel(level: string): LogLevel {
        switch (level.toLowerCase()) {
            case 'debug': return LogLevel.Debug;
            case 'info': return LogLevel.Info;
            case 'warning': return LogLevel.Warning;
            case 'error': return LogLevel.Error;
            case 'critical': return LogLevel.Critical;
            default: return LogLevel.Info;
        }
    }

    /**
     * Initialize log file
     */
    private initializeLogFile(): void {
        if (!this.config.logToFile) {
            return;
        }

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return;
            }

            const logDir = path.join(workspaceFolder.uri.fsPath, '.vscode', 'logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            this.logFilePath = path.join(logDir, `file-list-extension-${timestamp}.log`);
            
            // Write initial log entry
            const header = `=== File List Extension Debug Log Started at ${new Date().toISOString()} ===\n`;
            fs.writeFileSync(this.logFilePath, header, 'utf8');
        } catch (error) {
            console.error('Failed to initialize log file:', error);
        }
    }

    /**
     * Rotate log file if it exceeds size limit
     */
    private rotateLogFileIfNeeded(): void {
        if (!this.logFilePath || !fs.existsSync(this.logFilePath)) {
            return;
        }

        try {
            const stats = fs.statSync(this.logFilePath);
            if (stats.size > this.config.maxFileSize) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rotatedPath = this.logFilePath.replace('.log', `-rotated-${timestamp}.log`);
                
                fs.renameSync(this.logFilePath, rotatedPath);
                this.initializeLogFile();
                
                // Clean up old log files
                this.cleanupOldLogFiles();
            }
        } catch (error) {
            console.error('Failed to rotate log file:', error);
        }
    }

    /**
     * Clean up old log files
     */
    private cleanupOldLogFiles(): void {
        try {
            const logDir = path.dirname(this.logFilePath!);
            const files = fs.readdirSync(logDir)
                .filter(file => file.startsWith('file-list-extension-') && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(logDir, file),
                    mtime: fs.statSync(path.join(logDir, file)).mtime
                }))
                .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

            // Keep only the most recent files
            const filesToDelete = files.slice(this.config.maxFiles);
            for (const file of filesToDelete) {
                fs.unlinkSync(file.path);
            }
        } catch (error) {
            console.error('Failed to cleanup old log files:', error);
        }
    }

    /**
     * Get log entries
     */
    getLogEntries(level?: LogLevel, category?: string, limit?: number): DebugLogEntry[] {
        let entries = [...this.logEntries];
        
        if (level !== undefined) {
            entries = entries.filter(entry => entry.level >= level);
        }
        
        if (category) {
            entries = entries.filter(entry => entry.category === category);
        }
        
        if (limit) {
            entries = entries.slice(-limit);
        }
        
        return entries;
    }

    /**
     * Clear log entries
     */
    clearLogs(): void {
        this.logEntries.length = 0;
        this.outputChannel.clear();
    }

    /**
     * Export logs to file
     */
    async exportLogs(): Promise<string | undefined> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder available');
            }

            const exportPath = path.join(workspaceFolder.uri.fsPath, `debug-export-${Date.now()}.log`);
            const content = this.logEntries
                .map(entry => this.formatLogEntry(entry))
                .join('\n');
            
            fs.writeFileSync(exportPath, content, 'utf8');
            return exportPath;
        } catch (error) {
            this.error('DebugLogger', 'Failed to export logs', error as Error);
            return undefined;
        }
    }

    /**
     * Update configuration
     */
    updateConfiguration(newConfig: Partial<DebugLoggerConfig>): void {
        Object.assign(this.config, newConfig);
        
        if (newConfig.logToFile && !this.logFilePath) {
            this.initializeLogFile();
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}

/**
 * Convenience function to get logger instance
 */
export function getLogger(): DebugLogger {
    return DebugLogger.getInstance();
}

/**
 * Decorator for automatic logging of method calls
 */
export function logMethod(category: string) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;
        
        descriptor.value = function (...args: any[]) {
            const logger = getLogger();
            const className = target.constructor.name;
            const methodName = `${className}.${propertyName}`;
            
            return logger.withContext(category, methodName, () => {
                return method.apply(this, args);
            });
        };
    };
}