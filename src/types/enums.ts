// ===== Sort Order Enumeration =====

/**
 * Sort order enumeration for file listings
 */
export enum SortOrder {
    NameAsc = 'name-asc',
    NameDesc = 'name-desc',
    SizeAsc = 'size-asc',
    SizeDesc = 'size-desc',
    ModifiedAsc = 'modified-asc',
    ModifiedDesc = 'modified-desc'
}

// ===== File Operation Error Types =====

/**
 * File operation error types enumeration
 */
export enum FileOperationErrorType {
    FileNotFound = 'FILE_NOT_FOUND',
    PermissionDenied = 'PERMISSION_DENIED',
    FileAlreadyExists = 'FILE_ALREADY_EXISTS',
    InvalidFileName = 'INVALID_FILE_NAME',
    DiskSpaceInsufficient = 'DISK_SPACE_INSUFFICIENT',
    NetworkError = 'NETWORK_ERROR',
    UnknownError = 'UNKNOWN_ERROR'
}

// ===== Clipboard Operation Types =====

/**
 * Clipboard operation types
 */
export enum ClipboardOperation {
    Copy = 'copy',
    Cut = 'cut'
}

// ===== Drag & Drop Operation Types =====

/**
 * Drag & Drop operation types
 */
export enum DragDropOperation {
    Move = 'move',
    Copy = 'copy'
}

// ===== View Mode Types =====

/**
 * View mode enumeration
 */
export enum ViewMode {
    List = 'list',
    Tree = 'tree'
}

// ===== File Type Categories =====

/**
 * File type categories for enhanced functionality
 */
export enum FileTypeCategory {
    Document = 'document',
    Image = 'image',
    Video = 'video',
    Audio = 'audio',
    Archive = 'archive',
    Code = 'code',
    Data = 'data',
    Executable = 'executable',
    Unknown = 'unknown'
}

// ===== Selection Mode Types =====

/**
 * Selection mode enumeration
 */
export enum SelectionMode {
    Single = 'single',
    Multiple = 'multiple',
    Range = 'range'
}

// ===== Context Menu Action Types =====

/**
 * Context menu action types
 */
export enum ContextMenuAction {
    Copy = 'copy',
    Cut = 'cut',
    Paste = 'paste',
    Delete = 'delete',
    Rename = 'rename',
    NewFile = 'newFile',
    NewFolder = 'newFolder',
    Refresh = 'refresh',
    Properties = 'properties'
}

// ===== Keyboard Shortcut Types =====

/**
 * Keyboard shortcut action types
 */
export enum KeyboardShortcutAction {
    Copy = 'copy',
    Cut = 'cut',
    Paste = 'paste',
    Delete = 'delete',
    Rename = 'rename',
    SelectAll = 'selectAll',
    Refresh = 'refresh'
}