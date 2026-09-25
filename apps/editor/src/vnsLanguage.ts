// ================================================================
// MONACO EDITOR - VNS LANGUAGE DEFINITION & THEME
// Tuân thủ tài liệu đặc tả cú pháp VNS (docs/dsl spec.md)
// ================================================================

import * as monaco from 'monaco-editor';

export function registerVnsLanguage(): void {
  monaco.languages.register({ id: 'vns' });

  monaco.languages.setLanguageConfiguration('vns', {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['{', '}'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
  });

  monaco.languages.setMonarchTokensProvider('vns', {
    defaultToken: '',
    tokenPostfix: '.vns',

    keywords: [
      'scene',
      'as',
      'reveal',
      'background',
      'show',
      'hide',
      'play',
      'stop',
      'choice',
      'goto',
      'call',
      'return',
      'end',
      'if',
      'else',
      'while',
      'wait',
      'dialogue',
      'inspect',
      'title',
      'volume',
      'fade_in',
      'fadeIn',
      'fade_out',
      'fadeOut',
      'position',
      'transition',
      'duration',
      'loop',
      'ui',
      'true',
      'false',
      'scale',
      'scaleX',
      'scaleY',
      'scale_x',
      'scale_y',
      'rotate',
      'rotation',
      'flipX',
      'flipY',
      'flip_x',
      'flip_y',
      'x',
      'y',
      'offsetX',
      'offsetY',
      'offset_x',
      'offset_y',
      'alpha',
      'opacity',
      'easing',
    ],

    tokenizer: {
      root: [
        // Comments
        [/#.*$/, 'comment'],

        // Strings
        [/"([^"\\]|\\.)*"/, 'string'],

        // Duration literals (1s, 2.5s)
        [/[0-9]+(\.[0-9]+)?s\b/, 'number.duration'],

        // Number literals
        [/[0-9]+(\.[0-9]+)?/, 'number'],

        // Dot identifier (.local_scene)
        [/\.[a-zA-Z_][a-zA-Z0-9_]*/, 'type.identifier'],

        // Tilde variable assignment
        [/~/, 'delimiter'],

        // Keywords and Identifiers
        [
          /[a-zA-Z_][a-zA-Z0-9_]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier',
            },
          },
        ],

        // Brackets & Delimiters
        [/[{}()]/, '@brackets'],
        [/[:,]/, 'delimiter'],

        // Operators
        [/<=|>=|==|!=|&&|\|\||[=+\-*/<>!]/, 'operator'],
      ],
    },
  });

  monaco.editor.defineTheme('vns-wireframe-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '71717a', fontStyle: 'italic' },
      { token: 'keyword', foreground: '38bdf8', fontStyle: 'bold' },
      { token: 'string', foreground: '4ade80' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'number.duration', foreground: 'f59e0b' },
      { token: 'type.identifier', foreground: 'c084fc' },
      { token: 'identifier', foreground: 'f4f4f5' },
      { token: 'operator', foreground: 'e4e4e7' },
      { token: 'delimiter', foreground: 'a1a1aa' },
    ],
    colors: {
      'editor.background': '#080808',
      'editor.foreground': '#f4f4f5',
      'editorLineNumber.foreground': '#3f3f46',
      'editorLineNumber.activeForeground': '#ffffff',
      'editor.lineHighlightBackground': '#121212',
      'editor.selectionBackground': '#27272a',
      'editorCursor.foreground': '#38bdf8',
      'editorWhitespace.foreground': '#27272a',
    },
  });
}
