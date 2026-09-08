import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SECRET_PATTERNS = [
  { name: "Anthropic API key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI style key", regex: /sk-(?:proj-|live-)?[A-Za-z0-9]{20,}/ },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Alpaca key id", regex: /\b(?:PK|AK)[A-Z0-9]{18,}\b/ },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Slack token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Stripe key", regex: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: "Private key block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: "JWT", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    name: "Connection string with password",
    regex:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s/]+:[^@\s/]{4,}@(?!(?:localhost|127\.0\.0\.1|postgres|db|database)(?:[:/]|$))/i,
  },
  {
    name: "Assigned secret value",
    regex:
      /\b(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|jwt[_-]?secret|password|passwd)\b\s*[:=]\s*["'`]?[A-Za-z0-9+/_\-.]{16,}["'`]?/i,
  },
];

const ALLOWLIST_MARKERS = ["test-secret", "placeholder", "example", "changeme", "your-", "<", "xxx", "dummy", "fake"];

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".env", ".toml",
  ".prisma", ".sql", ".html", ".css", ".txt", ".sh", ".ps1", ".example",
]);

function readStdinJson() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function isCommitCommand(command) {
  return /\bgit\b[^|;&]*\bcommit\b/.test(command ?? "");
}

function stagedFiles(root) {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function stagedContent(root, file) {
  const result = spawnSync("git", ["show", `:${file}`], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout : "";
}

function isForbiddenEnvFile(file) {
  const base = path.basename(file);
  return base.startsWith(".env") && base !== ".env.example";
}

function looksAllowlisted(line) {
  const lower = line.toLowerCase();
  return ALLOWLIST_MARKERS.some((marker) => lower.includes(marker));
}

function scan(file, content) {
  const findings = [];
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (looksAllowlisted(line)) return;
    for (const { name, regex } of SECRET_PATTERNS) {
      if (regex.test(line)) {
        findings.push(`${file}:${index + 1}: ${name}`);
        break;
      }
    }
  });
  return findings;
}

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const input = readStdinJson();
const command = input?.tool_input?.command;

if (command !== undefined && !isCommitCommand(command)) process.exit(0);

const files = stagedFiles(root);
if (files.length === 0) process.exit(0);

const findings = [];
for (const file of files) {
  if (isForbiddenEnvFile(file)) {
    findings.push(`${file}: environment file staged; only .env.example may be committed`);
    continue;
  }
  const ext = path.extname(file) || path.basename(file);
  if (!TEXT_EXTENSIONS.has(ext) && !file.endsWith(".env.example")) continue;
  findings.push(...scan(file, stagedContent(root, file)));
}

if (findings.length === 0) process.exit(0);

process.stderr.write("Commit blocked: possible secrets in staged files.\n");
process.stderr.write(findings.join("\n") + "\n");
process.stderr.write("Remove the value, move it to .env, reference it by name in .env.example, then commit again.\n");
process.exit(2);
