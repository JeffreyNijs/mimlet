/**
 * A small JavaScript colourer for the sandbox editor. It only decides colours for the
 * layer drawn behind the textarea, so it favours speed and never changing the text
 * over precision: a regular expression literal, for example, is coloured as division.
 */
export type TokenKind = 'plain' | 'keyword' | 'string' | 'constant' | 'function' | 'comment';

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
}

/** Longer programs are drawn as plain text, so pasting a large file stays responsive. */
export const HIGHLIGHT_LIMIT = 50_000;

const KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'of',
  'return',
  'static',
  'switch',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'yield',
]);
const CONSTANTS = new Set(['false', 'Infinity', 'NaN', 'null', 'this', 'true', 'undefined']);

const RULES: readonly [Exclude<TokenKind, 'function'> | 'name', RegExp][] = [
  ['comment', /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y],
  ['string', /'(?:[^'\\\n]|\\.)*'?|"(?:[^"\\\n]|\\.)*"?|`(?:[^`\\]|\\[\s\S])*`?/y],
  [
    'constant',
    /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?(?![\w$])/y,
  ],
  ['name', /[A-Za-z_$][\w$]*/y],
  ['keyword', /\.\.\.|=>|[=!]=?=?|[<>]=?|&&=?|\|\|=?|\?\?=?|[-+*/%&|^]=?/y],
  ['plain', /\s+|[^\s'"`\w$./=!<>&|?+\-*%^]+|[\s\S]/y],
];

/** Splits `source` into coloured runs whose texts join back to exactly `source`. */
export function highlight(source: string): Token[] {
  if (source.length > HIGHLIGHT_LIMIT) {
    return [{ kind: 'plain', text: source }];
  }
  const tokens: Token[] = [];
  // The last token that is not whitespace, to tell `x.catch(` from `catch (`.
  let previous = '';
  let index = 0;
  const push = (kind: TokenKind, text: string): void => {
    const last = tokens.at(-1);
    if (last && last.kind === kind && kind === 'plain') {
      tokens[tokens.length - 1] = { kind, text: last.text + text };
    } else {
      tokens.push({ kind, text });
    }
  };
  while (index < source.length) {
    for (const [rule, pattern] of RULES) {
      pattern.lastIndex = index;
      const match = pattern.exec(source);
      if (!match) {
        continue;
      }
      const text = match[0];
      index += text.length;
      push(rule === 'name' ? classify(text, source, index, previous) : rule, text);
      if (text.trim()) {
        previous = text;
      }
      break;
    }
  }
  return tokens;
}

function classify(word: string, source: string, end: number, previous: string): TokenKind {
  const call = /^\s*\(/.test(source.slice(end, end + 40));
  // A property such as `.default(` or `.catch(` is never a keyword.
  if (previous.endsWith('.') && previous !== '...') {
    return call ? 'function' : 'plain';
  }
  if (KEYWORDS.has(word)) {
    return 'keyword';
  }
  if (CONSTANTS.has(word) || previous === 'const') {
    return 'constant';
  }
  return call ? 'function' : 'plain';
}
