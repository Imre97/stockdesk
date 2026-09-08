import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const LINTABLE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

function readStdinJson() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const input = readStdinJson();
const filePath = input?.tool_response?.filePath ?? input?.tool_input?.file_path;

if (!filePath || !LINTABLE.has(path.extname(filePath))) process.exit(0);

const absolute = path.resolve(root, filePath);
const insideRoot = absolute.startsWith(path.resolve(root) + path.sep);
if (!insideRoot || !existsSync(absolute)) process.exit(0);

const binName = process.platform === "win32" ? "eslint.cmd" : "eslint";
const eslintBin = path.join(root, "node_modules", ".bin", binName);
if (!existsSync(eslintBin)) process.exit(0);

const result = spawnSync(eslintBin, ["--fix", "--max-warnings", "0", absolute], {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.status === 0) process.exit(0);

process.stderr.write(`ESLint failed for ${path.relative(root, absolute)}\n`);
process.stderr.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(2);
