export declare function lockPath(root: string): string;
export declare function readLock(root: string): number | null;
export declare function isLockHeld(root: string): boolean;
export declare function writeLock(root: string, pid: number): void;
export declare function releaseLock(root: string): void;
