import js from "@eslint/js";
import globals from "globals";
import i18next from "eslint-plugin-i18next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const DECIMAL_MESSAGE =
  "Native number math is forbidden for money, prices, and quantities: use Decimal from @stockdesk/shared.";

const decimalRestrictions = [
  { selector: "CallExpression[callee.type='Identifier'][callee.name='Number']", message: DECIMAL_MESSAGE },
  { selector: "CallExpression[callee.type='Identifier'][callee.name='parseFloat']", message: DECIMAL_MESSAGE },
  { selector: "CallExpression[callee.type='Identifier'][callee.name='parseInt']", message: DECIMAL_MESSAGE },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.object.name='Math'][callee.property.name='round']",
    message: DECIMAL_MESSAGE,
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='toFixed']",
    message: DECIMAL_MESSAGE,
  },
];

const ISSUE_REFERENCE = /(#\d+|https?:\/\/\S+|[A-Z][A-Z0-9]+-\d+)/;

const stockdeskPlugin = {
  rules: {
    "no-warning-comments": {
      meta: {
        type: "suggestion",
        schema: [
          {
            type: "object",
            properties: { terms: { type: "array", items: { type: "string" } } },
            additionalProperties: false,
          },
        ],
        messages: {
          missingIssue: "'{{term}}' comment without an issue reference; add an issue reference such as #123.",
        },
      },
      create(context) {
        const terms = context.options[0]?.terms ?? ["todo", "fixme"];
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              const text = comment.value;
              const lowered = text.toLowerCase();
              const term = terms.find((candidate) => lowered.includes(candidate.toLowerCase()));
              if (term === undefined) continue;
              if (ISSUE_REFERENCE.test(text)) continue;
              context.report({ node: comment, messageId: "missingIssue", data: { term } });
            }
          },
        };
      },
    },
  },
};

const sourceGlobs = ["apps/api/src/**", "apps/web/src/**", "packages/shared/src/**"];
const testGlobs = ["**/*.test.ts", "**/*.test.tsx", "apps/api/test/**"];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/routeTree.gen.ts",
      "apps/web/src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { stockdesk: stockdeskPlugin },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "no-inline-comments": "error",
      "stockdesk/no-warning-comments": ["error", { terms: ["todo", "fixme"] }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: sourceGlobs,
    rules: { "no-restricted-syntax": ["error", ...decimalRestrictions] },
  },
  {
    files: ["**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./api", "../api", "**/api", "**/lib/http", "**/lib/http/**"],
              message: "Render files must not fetch: move the call into features/<domain>/api.ts or hooks.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ["apps/web/src/**/*.tsx"],
    plugins: { i18next },
    rules: { "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }] },
  },
  {
    files: testGlobs,
    plugins: { i18next },
    rules: {
      "no-restricted-syntax": "off",
      "no-restricted-imports": "off",
      "i18next/no-literal-string": "off",
    },
  },
);
