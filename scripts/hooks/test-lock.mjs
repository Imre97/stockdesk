import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const LOCK_FILE_NAME = ".vitest-api.lock";

export function lockPath(root) {
  return path.join(root, LOCK_FILE_NAME);
}

export function readLock(root) {
  const file = lockPath(root);
  if (!existsSync(file)) return null;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return null;
  }

  const pid = Number.parseInt(content.trim(), 10);

  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function isLockHeld(root) {
  if (!existsSync(lockPath(root))) return false;

  const pid = readLock(root);
  if (pid !== null && isProcessAlive(pid)) return true;

  releaseLock(root);

  return false;
}

export function writeLock(root, pid) {
  writeFileSync(lockPath(root), `${pid}`, "utf8");
}

export function releaseLock(root) {
  rmSync(lockPath(root), { force: true });
}
