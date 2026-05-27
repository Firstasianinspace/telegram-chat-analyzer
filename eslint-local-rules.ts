/**
 * Custom ESLint rules for the chat-analyzer project.
 * Loaded as the `local` plugin in eslint.config.ts.
 */
import type { Rule } from 'eslint'

// ─── no-hardcoded-colors ────────────────────────────────────────────────────
// Disallow hard-coded hex / rgb* / hsl* colour literals in source files.
// Use CSS custom properties or theme tokens instead.
const noHardcodedColors: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow hard-coded colour values; use CSS custom properties.' },
    schema: [],
    messages: {
      noHardcodedColor:
        'Avoid hard-coded colour "{{value}}". Use a CSS custom property or theme token instead.',
    },
  },
  create(context) {
    const colorRegex = /#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})\b|rgba?\s*\(|hsla?\s*\(/i

    function check(node: Rule.Node & { value?: unknown }): void {
      if (typeof node.value === 'string' && colorRegex.test(node.value)) {
        context.report({ node, messageId: 'noHardcodedColor', data: { value: node.value } })
      }
    }

    return {
      Literal: check,
      TemplateElement(node) {
        const raw = (node as unknown as { value: { raw: string } }).value.raw
        if (colorRegex.test(raw)) {
          context.report({
            node,
            messageId: 'noHardcodedColor',
            data: { value: raw },
          } as Parameters<typeof context.report>[0])
        }
      },
    }
  },
}
function countLogicalOperators(node?: Rule.Node): number {
  if (!node) return 0
  const n = node as unknown as { type: string; left?: Rule.Node; right?: Rule.Node; operator?: string }
  if (n.type === 'LogicalExpression') {
    return 1 + countLogicalOperators(n.left) + countLogicalOperators(n?.right)
  }
  return 0
}

function isDescribeCall(node: Rule.Node): boolean {
  const n = node as unknown as { type: string; callee?: { name?: string } }
  return (
    n.type === 'CallExpression' &&
    (n.callee?.name === 'describe' || n.callee?.name === 'fdescribe' || n.callee?.name === 'xdescribe')
  )
}

// ─── composable-must-use-vue ─────────────────────────────────────────────────
// Files whose names start with "use" (composables) must import at least one
// symbol from 'vue'.
const composableMustUseVue: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Composable files must import at least one reactive primitive from vue.' },
    schema: [],
    messages: {
      missingVueImport:
        'This composable file does not import anything from "vue". Composables should use Vue reactivity APIs.',
    },
  },
  create(context) {
    const filename = context.getFilename()
    const isComposable = /\/use[A-Z][\w]*\.[jt]s$/.test(filename)
    if (!isComposable) return {}

    let hasVueImport = false

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'vue') hasVueImport = true
      },
      'Program:exit'(node) {
        if (!hasVueImport) {
          context.report({ node, messageId: 'missingVueImport' })
        }
      },
    }
  },
}

// ─── extract-condition-variable ───────────────────────────────────────────────
// Warn when an `if` statement's test contains more than two logical operators,
// suggesting the condition should be extracted to a named variable.
const extractConditionVariable: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Complex boolean conditions should be extracted into a named variable for readability.',
    },
    schema: [
      {
        type: 'object',
        properties: { maxOperators: { type: 'integer', minimum: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      extractCondition:
        'This condition has {{count}} logical operators. Extract it into a named variable.',
    },
  },
  create(context) {
    const maxOperators: number =
      (context.options[0] as { maxOperators?: number } | undefined)?.maxOperators ?? 2



    return {
      IfStatement(node) {
        const n = node as unknown as { test: Rule.Node }
        const count = countLogicalOperators(n.test)
        if (count > maxOperators) {
          context.report({
            node,
            messageId: 'extractCondition',
            data: { count: String(count) },
          })
        }
      },
    }
  },
}

// ─── no-let-in-describe ───────────────────────────────────────────────────────
// Disallow `let` declarations directly inside a `describe` callback, which can
// lead to subtle test-isolation bugs. Prefer `beforeEach` + `const`.
const noLetInDescribe: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow let declarations inside describe() callbacks.',
    },
    schema: [],
    messages: {
      noLet:
        'Avoid `let` inside describe(). Prefer `const` with re-assignment inside beforeEach().',
    },
  },
  create(context) {
    let describeDepth = 0

    return {
      CallExpression(node) {
        if (isDescribeCall(node)) describeDepth++
      },
      'CallExpression:exit'(node) {
        if (isDescribeCall(node)) describeDepth--
      },
      VariableDeclaration(node) {
        const n = node as unknown as { kind: string }
        if (describeDepth > 0 && n.kind === 'let') {
          context.report({ node, messageId: 'noLet' })
        }
      },
    }
  },
}

// ─── Plugin export ────────────────────────────────────────────────────────────
const localRules = {
  rules: {
    'no-hardcoded-colors': noHardcodedColors,
    'composable-must-use-vue': composableMustUseVue,
    'extract-condition-variable': extractConditionVariable,
    'no-let-in-describe': noLetInDescribe,
  },
}

export default localRules
