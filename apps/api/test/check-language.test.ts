import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "check-language.mjs");

const LOGIN_WITH_ACCENTS = "bejelentkez\u00e9s";
const PASSWORD_WITH_ACCENTS = "jelsz\u00f3";
const ASCII_STOP_WORD = "hib" + "a";

interface CheckResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function makeRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "stockdesk-language-"));
}

function write(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function runCheck(root: string): CheckResult {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, CHECK_LANGUAGE_ROOT: root },
  });

  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("scripts/check-language.mjs", () => {
  it("accepts a tree whose files are English only", () => {
    const root = makeRoot();
    write(root, "src/clean.ts", 'export const label = "Sign in";\n');
    write(root, "docs/notes.md", "# Notes\n\nEverything here is written in English.\n");

    const result = runCheck(root);

    expect(result.status).toBe(0);
  });

  it("reports the file and line of a non-English letter", () => {
    const root = makeRoot();
    write(root, "src/clean.ts", 'export const label = "Sign in";\n');
    write(root, "src/offending.ts", `export const first = "ok";\nexport const label = "${LOGIN_WITH_ACCENTS}";\n`);

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/offending.ts:2");
    expect(result.stderr).not.toContain("src/clean.ts");
  });

  it("allows non-English punctuation and box drawing", () => {
    const root = makeRoot();
    write(root, "docs/tree.md", "stockdesk/\n├── apps — workspaces → web and api ✓\n");

    const result = runCheck(root);

    expect(result.status).toBe(0);
  });

  it("reports an ASCII Hungarian stop word as a whole word only", () => {
    const root = makeRoot();
    write(root, "src/english.ts", 'export const villain = "nemesis";\n');
    write(root, "src/offending.ts", `export const message = "${ASCII_STOP_WORD}";\n`);

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/offending.ts:1");
    expect(result.stderr).not.toContain("src/english.ts");
  });

  it("skips translated catalogs for non-English locales but checks the English one", () => {
    const translated = makeRoot();
    write(translated, "apps/web/src/i18n/locales/hu/auth.json", `{ "login.title": "${LOGIN_WITH_ACCENTS}" }\n`);

    expect(runCheck(translated).status).toBe(0);

    const english = makeRoot();
    write(english, "apps/web/src/i18n/locales/en/auth.json", `{ "login.title": "${PASSWORD_WITH_ACCENTS}" }\n`);

    const result = runCheck(english);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("apps/web/src/i18n/locales/en/auth.json:1");
  });

  it("checks review reports as well", () => {
    const root = makeRoot();
    write(root, "docs/reviews/2026-09-08-auth.md", `# Review\n\n${PASSWORD_WITH_ACCENTS}\n`);

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("docs/reviews/2026-09-08-auth.md:3");
  });

  it("skips package-lock.json and binary files", () => {
    const root = makeRoot();
    write(root, "package-lock.json", `{ "name": "${LOGIN_WITH_ACCENTS}" }\n`);
    writeFileSync(path.join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xc3, 0xa9]));

    const result = runCheck(root);

    expect(result.status).toBe(0);
  });
});
