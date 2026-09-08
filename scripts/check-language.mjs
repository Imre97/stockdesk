import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SELF_PATH = "scripts/check-language.mjs";
const SKIPPED_FILES = new Set(["package-lock.json", SELF_PATH]);
const TRANSLATED_CATALOG = /^apps\/web\/src\/i18n\/locales\/(?!en\/)[^/]+\/[^/]+\.json$/;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", "coverage", "playwright-report", "test-results"]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".svgz", ".avif",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".pdf", ".zip", ".gz",
  ".mp3", ".mp4", ".webm", ".wasm", ".node", ".exe", ".dll",
]);

const HUNGARIAN_STOP_WORDS = ["és", "nem", "vagy", "bejelentkezés", "jelszó", "felhasználó", "hiba", "siker"];

const STOP_WORD_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${HUNGARIAN_STOP_WORDS.join("|")})(?![\\p{L}\\p{N}_])`,
  "iu",
);

function resolveRoot() {
  const override = process.argv[2] ?? process.env.CHECK_LANGUAGE_ROOT;
  if (override === undefined || override === "") return repoRoot;
  return path.resolve(override);
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function trackedFiles(root) {
  const result = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`git ls-files failed in ${root}: ${result.stderr ?? ""}`);
  }

  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function walkFiles(root, relativeDirectory = "") {
  const absolute = path.join(root, relativeDirectory);
  const files = [];

  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relative = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      files.push(...walkFiles(root, relative));
      continue;
    }
    if (entry.isFile()) files.push(relative);
  }

  return files;
}

function listFiles(root) {
  const files = root === repoRoot ? trackedFiles(root) : walkFiles(root);
  return files.map(toPosix);
}

function isSkipped(file) {
  if (SKIPPED_FILES.has(file)) return true;
  if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) return true;
  return TRANSLATED_CATALOG.test(file);
}

function findNonEnglishLetter(line) {
  for (const character of line) {
    if (character.codePointAt(0) < 128) continue;
    if (/\p{L}/u.test(character)) return character;
  }

  return undefined;
}

function inspect(root, file) {
  const buffer = readFileSync(path.join(root, file));
  if (buffer.includes(0)) return [];

  const findings = [];

  buffer.toString("utf8").split("\n").forEach((line, index) => {
    const letter = findNonEnglishLetter(line);
    if (letter !== undefined) {
      findings.push(`${file}:${index + 1}: non-English letter ${JSON.stringify(letter)}`);
      return;
    }

    const match = STOP_WORD_PATTERN.exec(line);
    if (match !== null) findings.push(`${file}:${index + 1}: non-English word ${JSON.stringify(match[0])}`);
  });

  return findings;
}

const root = resolveRoot();
const findings = [];

for (const file of listFiles(root)) {
  if (isSkipped(file)) continue;
  findings.push(...inspect(root, file));
}

if (findings.length === 0) {
  process.stdout.write("Language check passed: every scanned file is English only.\n");
  process.exit(0);
}

process.stderr.write("Language check failed: non-English content found.\n");
process.stderr.write(`${findings.join("\n")}\n`);
process.stderr.write("Translate the content to English. Only non-English UI catalogs under apps/web/src/i18n/locales are exempt.\n");
process.exit(1);
