import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const WORKSPACE_ROOTS = ["apps", "packages"];

function readStdinJson() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function listWorkspaces(root) {
  const found = [];
  for (const group of WORKSPACE_ROOTS) {
    const groupDir = path.join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgPath = path.join(groupDir, entry.name, "package.json");
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.scripts?.test) found.push({ name: pkg.name, dir: `${group}/${entry.name}` });
    }
  }
  return found;
}

function changedPaths(root) {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim().replace(/\\/g, "/"));
}

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const input = readStdinJson();

if (input.stop_hook_active) process.exit(0);

const workspaces = listWorkspaces(root);
if (workspaces.length === 0) process.exit(0);

const changed = changedPaths(root);
const targets =
  changed === null
    ? workspaces
    : workspaces.filter((ws) => changed.some((p) => p.startsWith(`${ws.dir}/`)));

if (targets.length === 0) process.exit(0);

const failures = [];
for (const ws of targets) {
  const result = spawnSync("npm", ["test", "--workspace", ws.name, "--", "--run"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    failures.push(`--- ${ws.name} ---\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
}

if (failures.length === 0) process.exit(0);

process.stderr.write(`Tests failed in ${failures.length} workspace(s). Fix before stopping.\n`);
process.stderr.write(failures.join("\n"));
process.exit(2);
