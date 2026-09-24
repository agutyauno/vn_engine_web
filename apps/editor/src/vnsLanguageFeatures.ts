// ================================================================
// MONACO EDITOR - VNS LANGUAGE FEATURES (COMPLETION & GO-TO-DEFINITION)
// Tuân thủ tài liệu đặc tả UI/UX Specification & DSL Spec
// ================================================================

import * as monaco from 'monaco-editor';
import { formatVns } from '@vn-engine/dsl-compiler';

export interface VnsProjectContext {
  getFiles: () => Record<string, string>;
  getScenes: () => string[];
  getCharacters: () => Map<string, { displayName?: string; sprites: Set<string> }>;
  getAssets: () => { backgrounds: Set<string>; audio: Set<string> };
  getVariables: () => string[];
  switchActiveFile: (fileName: string) => void;
}

export function registerVnsLanguageFeatures(context: VnsProjectContext): void {
  // 1. AUTOCOMPLETE PROVIDER
  monaco.languages.registerCompletionItemProvider('vns', {
    triggerCharacters: [' ', '.', ':', '~', '"'],
    provideCompletionItems: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const textUntilPosition = lineContent.substring(0, position.column - 1);
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];

      // A. Gợi ý Scene sau goto hoặc call
      if (/\b(goto|call)\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const scenes = context.getScenes();
        for (const sc of scenes) {
          suggestions.push({
            label: sc,
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: `Jump execution flow to scene "${sc}"`,
            insertText: sc,
            range,
          });
        }
        return { suggestions };
      }

      // B. Gợi ý Nhân vật hoặc dialogue sau show hoặc hide
      if (/\b(show|hide)\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        if (/\bhide\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
          suggestions.push({
            label: 'dialogue',
            kind: monaco.languages.CompletionItemKind.Keyword,
            documentation: 'Hide dialogue box without blocking script flow (cutscene mode)',
            insertText: 'dialogue',
            range,
          });
        }
        const chars = context.getCharacters();
        for (const [charId, info] of chars) {
          suggestions.push({
            label: charId,
            kind: monaco.languages.CompletionItemKind.Class,
            documentation: info.displayName
              ? `Character: ${charId} (${info.displayName})`
              : `Character: ${charId}`,
            insertText: charId,
            range,
          });
        }
        return { suggestions };
      }

      // C. Gợi ý Sprite sau "show <character>." hoặc "show <character> "
      const showMatch = textUntilPosition.match(/\bshow\s+([a-zA-Z0-9_]+)[\.\s]([a-zA-Z0-9_]*)$/);
      if (showMatch && showMatch[1]) {
        const charId = showMatch[1];
        const chars = context.getCharacters();
        const charInfo = chars.get(charId);
        if (charInfo) {
          for (const sp of charInfo.sprites) {
            suggestions.push({
              label: sp,
              kind: monaco.languages.CompletionItemKind.EnumMember,
              documentation: `Sprite expression "${sp}" of ${charId}`,
              insertText: sp,
              range,
            });
          }
          return { suggestions };
        }
      }

      // C2. Gợi ý thuộc tính biến đổi ảnh (Show & Background parameters)
      if (/\b(show|background)\b[^(\n]*\([^)\n]*$/.test(textUntilPosition)) {
        const paramOptions = [
          {
            label: 'scale: ',
            insert: 'scale: 1.2',
            doc: 'Uniform scale (e.g. scale: 1.2)',
          },
          {
            label: 'rotate: ',
            insert: 'rotate: 15',
            doc: 'Rotation angle in degrees (e.g. rotate: 45 or -30)',
          },
          { label: 'flipX: ', insert: 'flipX: true', doc: 'Horizontal flip (flipX: true)' },
          { label: 'flipY: ', insert: 'flipY: true', doc: 'Vertical flip (flipY: true)' },
          {
            label: 'position: ',
            insert: 'position: "center"',
            doc: 'Anchor position ("left" | "center" | "right")',
          },
          { label: 'x: ', insert: 'x: 0.5', doc: 'Normalized screen X coordinate (0.0 to 1.0)' },
          { label: 'y: ', insert: 'y: 0.8', doc: 'Normalized screen Y coordinate (0.0 to 1.0)' },
          { label: 'offsetX: ', insert: 'offsetX: 20', doc: 'Horizontal pixel offset' },
          { label: 'offsetY: ', insert: 'offsetY: -20', doc: 'Vertical pixel offset' },
          { label: 'alpha: ', insert: 'alpha: 0.8', doc: 'Opacity / alpha (0.0 to 1.0)' },
          {
            label: 'transition: ',
            insert: 'transition: "shake"',
            doc: 'Motion effect ("shake" | "hop" | "bounce" | "wobble" | "pop" | "zoom" | "fade" | "slide")',
          },
          {
            label: 'easing: ',
            insert: 'easing: "ease_out"',
            doc: 'Easing curve ("ease_out" | "ease_in_out" | "bounce" | "elastic" | "linear")',
          },
          {
            label: 'duration: ',
            insert: 'duration: 0.5s',
            doc: 'Animation duration (e.g. 0.5s)',
          },
        ];

        for (const p of paramOptions) {
          suggestions.push({
            label: p.label,
            kind: monaco.languages.CompletionItemKind.Property,
            documentation: p.doc,
            insertText: p.insert,
            range,
          });
        }
        return { suggestions };
      }

      // D. Gợi ý Hình nền sau background
      if (/\bbackground\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const assets = context.getAssets();
        for (const bg of assets.backgrounds) {
          suggestions.push({
            label: bg,
            kind: monaco.languages.CompletionItemKind.File,
            documentation: `Background: ${bg}`,
            insertText: bg,
            range,
          });
        }
        return { suggestions };
      }

      // E. Gợi ý Âm thanh sau play music / play sound
      if (/\bplay\s+(music|sound)\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const assets = context.getAssets();
        for (const aud of assets.audio) {
          suggestions.push({
            label: aud,
            kind: monaco.languages.CompletionItemKind.File,
            documentation: `Audio asset: ${aud}`,
            insertText: aud,
            range,
          });
        }
        return { suggestions };
      }

      // F. Gợi ý Biến trạng thái sau ~
      if (/~\s*[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const vars = context.getVariables();
        for (const v of vars) {
          suggestions.push({
            label: v,
            kind: monaco.languages.CompletionItemKind.Variable,
            documentation: `Script state variable: ${v}`,
            insertText: v,
            range,
          });
        }
        return { suggestions };
      }

      // G. Danh sách Từ khóa Cú pháp Cốt lõi & Snippets (Keywords & Snippets)
      const keywordSnippets: Array<{
        label: string;
        doc: string;
        snippet?: string;
        kind?: monaco.languages.CompletionItemKind;
      }> = [
        {
          label: 'scene',
          doc: 'Declare new scene block: scene name { ... }',
          snippet: 'scene ${1:name} {\n\t$0\n}',
        },
        {
          label: 'wait',
          doc: 'Pause execution for duration without user click: wait 0.5s',
          snippet: 'wait ${1:0.5s}',
        },
        {
          label: 'show',
          doc: 'Show character on stage: show charId.sprite',
          snippet: 'show ${1:character}.${2:sprite}',
        },
        {
          label: 'hide',
          doc: 'Hide character from stage: hide charId',
          snippet: 'hide ${1:character}',
        },
        {
          label: 'hide dialogue',
          doc: 'Hide dialogue box without blocking script: hide dialogue',
          snippet: 'hide dialogue',
        },
        {
          label: 'background',
          doc: 'Change stage background: background bg_id transition: "fade"',
          snippet: 'background ${1:bg_asset} transition: "${2:fade}"',
        },
        {
          label: 'choice',
          doc: 'Branching choice menu block',
          snippet: 'choice {\n\t"${1:Choice 1}": goto ${2:target_scene}\n\t$0\n}',
        },
        {
          label: 'play music',
          doc: 'Play looping background music: play music "bgm_id" volume: 0.8 loop: true',
          snippet: 'play music "${1:bgm_asset}" volume: ${2:0.8} loop: true',
        },
        {
          label: 'play sound',
          doc: 'Play sound effect once: play sound "sfx_id" volume: 0.8',
          snippet: 'play sound "${1:sfx_asset}" volume: ${2:0.8}',
        },
        {
          label: 'stop',
          doc: 'Stop audio channel: stop music fade_out: 1.0s',
          snippet: 'stop ${1:music} fade_out: ${2:1.0s}',
        },
        {
          label: 'goto',
          doc: 'Jump to scene: goto target_scene',
          snippet: 'goto ${1:scene_name}',
        },
        {
          label: 'call',
          doc: 'Call subroutine scene and return: call sub_scene',
          snippet: 'call ${1:scene_name}',
        },
        {
          label: 'reveal',
          doc: 'Declare character display name: reveal charId as "Display Name"',
          snippet: 'reveal ${1:character} as "${2:Display Name}"',
        },
        {
          label: 'define',
          doc: 'Declare variable: define var_name = value',
          snippet: 'define ${1:variable_name} = ${2:0}',
        },
        {
          label: 'if',
          doc: 'Conditional block: if (condition) { ... }',
          snippet: 'if ${1:condition} {\n\t$0\n}',
        },
        {
          label: 'else',
          doc: 'Alternative branch block: else { ... }',
          snippet: 'else {\n\t$0\n}',
        },
        {
          label: 'while',
          doc: 'Conditional loop: while (condition) { ... }',
          snippet: 'while ${1:condition} {\n\t$0\n}',
        },
        {
          label: 'return',
          doc: 'Return from subroutine call',
          kind: monaco.languages.CompletionItemKind.Keyword,
        },
        {
          label: 'end',
          doc: 'End the visual novel story',
          kind: monaco.languages.CompletionItemKind.Keyword,
        },
      ];

      for (const kw of keywordSnippets) {
        if (kw.snippet) {
          suggestions.push({
            label: kw.label,
            kind: kw.kind ?? monaco.languages.CompletionItemKind.Snippet,
            documentation: kw.doc,
            insertText: kw.snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        } else {
          suggestions.push({
            label: kw.label,
            kind: kw.kind ?? monaco.languages.CompletionItemKind.Keyword,
            documentation: kw.doc,
            insertText: kw.label,
            range,
          });
        }
      }

      return { suggestions };
    },
  });

  // 2. GO-TO-DEFINITION PROVIDER (Ctrl + Click nhảy tới phân cảnh)
  monaco.languages.registerDefinitionProvider('vns', {
    provideDefinition: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const targetWord = word.word;

      // Kiểm tra nếu con trỏ đang trỏ vào tên scene sau lệnh goto hoặc call
      const isSceneJump = new RegExp(`\\b(goto|call)\\s+${targetWord}\\b`).test(lineContent);
      if (!isSceneJump) return null;

      // Tìm kiếm trong toàn bộ các tệp của dự án
      const files = context.getFiles();
      for (const [fileName, content] of Object.entries(files)) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const lineStr = lines[i] ?? '';
          const match = lineStr.match(new RegExp(`^\\s*scene\\s+${targetWord}\\s*:`));
          if (match) {
            const targetUri = monaco.Uri.parse(`inmemory://project/${fileName}`);
            return {
              uri: targetUri,
              range: {
                startLineNumber: i + 1,
                startColumn: 1,
                endLineNumber: i + 1,
                endColumn: lineStr.length + 1,
              },
            };
          }
        }
      }

      return null;
    },
  });

  // 3. DOCUMENT FORMATTING PROVIDER (Auto-Format: Shift + Alt + F)
  monaco.languages.registerDocumentFormattingEditProvider('vns', {
    provideDocumentFormattingEdits: (model, options) => {
      const originalText = model.getValue();
      const formattedText = formatVns(originalText, {
        indentSize: options.tabSize,
        useTabs: !options.insertSpaces,
      });

      if (formattedText === originalText) {
        return [];
      }

      return [
        {
          range: model.getFullModelRange(),
          text: formattedText,
        },
      ];
    },
  });
}
