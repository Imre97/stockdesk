import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isLockHeld, lockPath, readLock, releaseLock, writeLock } from "../../../scripts/hooks/test-lock.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DEAD_PID = 2 ** 22 - 1;

const createdRoots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "stockdesk-test-lock-"));
  createdRoots.push(root);

  return root;
}

function writeRaw(root: string, content: string): void {
  writeFileSync(lockPath(root), content, "utf8");
}

function exitedChildPid(): number {
  const result = spawnSync(process.execPath, ["-e", "process.exit(0)"], { encoding: "utf8" });
  const pid = result.pid;

  if (pid === undefined) throw new Error("Unable to spawn a child process for the stale-pid case.");

  return pid;
}

describe("scripts/hooks/test-lock.mjs", () => {
  afterEach(() => {
    while (createdRoots.length > 0) {
      const root = createdRoots.pop();
      if (root !== undefined) rmSync(root, { recursive: true, force: true });
    }
  });

  it("names the lock file .vitest-api.lock in the repository root", () => {
    expect(lockPath(repoRoot)).toBe(path.join(repoRoot, ".vitest-api.lock"));
  });

  it("reports no lock when the file is absent", () => {
    const root = makeRoot();

    expect(readLock(root)).toBeNull();
    expect(isLockHeld(root)).toBe(false);
  });

  it("writes the pid as text and reads it back", () => {
    const root = makeRoot();

    writeLock(root, process.pid);

    expect(readFileSync(lockPath(root), "utf8").trim()).toBe(String(process.pid));
    expect(readLock(root)).toBe(process.pid);
  });

  it("holds the lock while the recorded pid is alive", () => {
    const root = makeRoot();

    writeLock(root, process.pid);

    expect(isLockHeld(root)).toBe(true);
    expect(existsSync(lockPath(root))).toBe(true);
  });

  it("treats a dead pid as stale and removes the lock file", () => {
    const root = makeRoot();

    writeLock(root, DEAD_PID);

    expect(isLockHeld(root)).toBe(false);
    expect(existsSync(lockPath(root))).toBe(false);
  });

  it("treats the pid of an exited child process as stale", () => {
    const root = makeRoot();

    writeLock(root, exitedChildPid());

    expect(isLockHeld(root)).toBe(false);
    expect(existsSync(lockPath(root))).toBe(false);
  });

  it("treats unparsable content as stale and removes the lock file", () => {
    const root = makeRoot();

    writeRaw(root, "not-a-pid\n");

    expect(readLock(root)).toBeNull();
    expect(isLockHeld(root)).toBe(false);
    expect(existsSync(lockPath(root))).toBe(false);
  });

  it("treats an empty lock file as stale and removes it", () => {
    const root = makeRoot();

    writeRaw(root, "");

    expect(isLockHeld(root)).toBe(false);
    expect(existsSync(lockPath(root))).toBe(false);
  });

  it("releases the lock and tolerates a missing lock file", () => {
    const root = makeRoot();

    writeLock(root, process.pid);
    releaseLock(root);

    expect(existsSync(lockPath(root))).toBe(false);
    expect(() => releaseLock(root)).not.toThrow();
  });
});
