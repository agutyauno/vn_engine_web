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

        // Gợi ý cả Image Assets làm đạo cụ sân khấu (Props / Items)
        if (/\bshow\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
          const assets = context.getAssets();
          for (const assetId of assets.backgrounds) {
            if (!chars.has(assetId)) {
              suggestions.push({
                label: assetId,
                kind: monaco.languages.CompletionItemKind.File,
                documentation: `Prop / Item asset: ${assetId} (Default center anchor 0.5, 0.5)`,
                insertText: assetId,
                range,
              });
            }
          }
        }
        return { suggestions };
      }

      // B1. Gợi ý Image Assets sau inspect
      if (/\binspect\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const assets = context.getAssets();
        for (const assetId of assets.backgrounds) {
          suggestions.push({
            label: assetId,
            kind: monaco.languages.CompletionItemKind.File,
            documentation: `Inspect item / asset: ${assetId}`,
            insertText: assetId,
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

      // C1. Gợi ý giá trị cho transition:
      if (/\btransition:\s*"?([a-zA-Z0-9_]*)$/.test(textUntilPosition)) {
        const hasOpeningQuote = /"[^"]*$/.test(textUntilPosition);
        const transList: Array<{ name: string; doc: string }> = [
          { name: 'fade', doc: 'Fade in / cross-fade opacity' },
          { name: 'dissolve', doc: 'Smooth cross-dissolve' },
          { name: 'shake', doc: 'Violent horizontal screen/sprite shake' },
          { name: 'hop', doc: 'Cheerful vertical jump and land' },
          { name: 'bounce', doc: 'Bouncy drop and floor recoil' },
          { name: 'wobble', doc: 'Playful rotational rocking oscillation' },
          { name: 'pop', doc: 'Punchy scale overshoot and rebound' },
          { name: 'zoom', doc: 'Scale zoom in from center' },
          { name: 'slide', doc: 'Slide smoothly into position' },
          { name: 'slide_left', doc: 'Slide in from screen left' },
          { name: 'slide_right', doc: 'Slide in from screen right' },
          { name: 'slide_up', doc: 'Slide in from screen bottom' },
          { name: 'slide_down', doc: 'Slide in from screen top' },
        ];
        for (const t of transList) {
          suggestions.push({
            label: t.name,
            kind: monaco.languages.CompletionItemKind.Value,
            documentation: t.doc,
            insertText: hasOpeningQuote ? t.name : `"${t.name}"`,
            range,
          });
        }
        return { suggestions };
      }

      // C2. Gợi ý giá trị cho easing:
      if (/\beasing:\s*"?([a-zA-Z0-9_]*)$/.test(textUntilPosition)) {
        const hasOpeningQuote = /"[^"]*$/.test(textUntilPosition);
        const easingList: Array<{ name: string; doc: string }> = [
          { name: 'ease_out', doc: 'Natural deceleration (default, smoothest visual feel)' },
          { name: 'ease_in_out', doc: 'Smooth acceleration and deceleration' },
          { name: 'ease_in', doc: 'Gradual acceleration from rest' },
          { name: 'bounce', doc: 'Physically based mechanical bounce' },
          { name: 'elastic', doc: 'Rubber band spring oscillation' },
          { name: 'linear', doc: 'Constant velocity motion' },
        ];
        for (const e of easingList) {
          suggestions.push({
            label: e.name,
            kind: monaco.languages.CompletionItemKind.Value,
            documentation: e.doc,
            insertText: hasOpeningQuote ? e.name : `"${e.name}"`,
            range,
          });
        }
        return { suggestions };
      }

      // C3. Gợi ý giá trị cho position:
      if (/\bposition:\s*"?([a-zA-Z0-9_]*)$/.test(textUntilPosition)) {
        const hasOpeningQuote = /"[^"]*$/.test(textUntilPosition);
        const posList: Array<{ name: string; doc: string }> = [
          { name: 'left', doc: 'Left anchor position (22% screen width)' },
          { name: 'center', doc: 'Center anchor position (50% screen width)' },
          { name: 'right', doc: 'Right anchor position (78% screen width)' },
        ];
        for (const p of posList) {
          suggestions.push({
            label: p.name,
            kind: monaco.languages.CompletionItemKind.Value,
            documentation: p.doc,
            insertText: hasOpeningQuote ? p.name : `"${p.name}"`,
            range,
          });
        }
        return { suggestions };
      }

      // C4. Gợi ý thuộc tính biến đổi ảnh (Show & Background parameters)
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

      // F1. Gợi ý Nhân vật sau reveal
      if (/\breveal\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const chars = context.getCharacters();
        for (const [charId, info] of chars) {
          suggestions.push({
            label: charId,
            kind: monaco.languages.CompletionItemKind.User,
            detail: info.displayName ? `${charId} (${info.displayName})` : charId,
            documentation: `Reveal real name for character "${charId}"`,
            insertText: `${charId} as "\${1:${info.displayName || 'Display Name'}}"`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        }
        return { suggestions };
      }

      // F2. Gợi ý chuỗi thoại ngay sau dấu hai chấm (hoặc sau character: / narrator:)
      if (/^[ \t]*[a-zA-Z_][a-zA-Z0-9_]*(?:\s+as\s+"[^"]*")?:\s*$/.test(textUntilPosition)) {
        suggestions.push({
          label: '"dialogue"',
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'Single-line dialogue string',
          documentation: 'Insert single-line dialogue text',
          insertText: '"${1:dialogue}"',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: '01_dialogue',
          range,
        });
        suggestions.push({
          label: '"""multiline dialogue"""',
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'Multiline dialogue block with triple quotes',
          documentation: 'Insert multiline dialogue enclosed in triple quotes',
          insertText: '"""\n\t$0\n"""',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: '02_multiline',
          range,
        });
        return { suggestions };
      }

      // F3. Gợi ý dấu hai chấm / alias sau khi đã gõ tên nhân vật ở đầu dòng: e.g. "alice "
      const charSpaceMatch = textUntilPosition.match(/^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)\s+$/);
      if (charSpaceMatch && charSpaceMatch[1]) {
        const id = charSpaceMatch[1];
        const chars = context.getCharacters();
        if (chars.has(id) || id === 'narrator') {
          suggestions.push({
            label: ': "dialogue"',
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: 'Complete dialogue line',
            documentation: `Insert colon and dialogue for ${id}`,
            insertText: ': "${1:dialogue}"',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: '01_colon_dialogue',
            range,
          });
          suggestions.push({
            label: ': """multiline"""',
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: 'Complete multiline dialogue',
            documentation: `Insert colon and multiline dialogue for ${id}`,
            insertText: ': """\n\t$0\n"""',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: '02_colon_multiline',
            range,
          });
          if (id !== 'narrator') {
            const charInfo = chars.get(id);
            suggestions.push({
              label: 'as "Name": "dialogue"',
              kind: monaco.languages.CompletionItemKind.Snippet,
              detail: 'Dialogue with temporary display name',
              documentation: `Override display name for ${id}`,
              insertText: `as "\${1:${charInfo?.displayName || 'Name'}}": "\${2:dialogue}"`,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              sortText: '03_as_dialogue',
              range,
            });
          }
          return { suggestions };
        }
      }

      // G0. Gợi ý Nhân vật cho câu thoại (Character Dialogue Statements)
      const projectChars = context.getCharacters();
      for (const [charId, info] of projectChars) {
        // Gợi ý thoại chuẩn: charId: "..."
        suggestions.push({
          label: `${charId}: "..."`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: info.displayName ? `Dialogue: ${info.displayName}` : `Dialogue: ${charId}`,
          documentation: `Dialogue statement for ${charId}${info.displayName ? ` (${info.displayName})` : ''}`,
          insertText: `${charId}: "\${1:dialogue}"`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `01_${charId}_1`,
          range,
        });

        // Gợi ý thoại nhiều dòng: charId: """..."""
        suggestions.push({
          label: `${charId}: """..."""`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: `Multiline dialogue: ${charId}`,
          documentation: `Multiline dialogue statement with triple quotes for ${charId}`,
          insertText: `${charId}: """\n\t$0\n"""`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `01_${charId}_2`,
          range,
        });

        // Gợi ý thoại kèm bí danh: charId as "Name": "..."
        suggestions.push({
          label: `${charId} as "..."`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: `Dialogue with display name override`,
          documentation: `Dialogue statement with alias for ${charId}`,
          insertText: `${charId} as "\${1:${info.displayName || 'Name'}}": "\${2:dialogue}"`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `01_${charId}_3`,
          range,
        });

        // Gợi ý tên nhân vật thuần túy (User ID)
        suggestions.push({
          label: charId,
          kind: monaco.languages.CompletionItemKind.User,
          detail: info.displayName
            ? `Character: ${charId} (${info.displayName})`
            : `Character: ${charId}`,
          documentation: `Character ID "${charId}"`,
          insertText: charId,
          sortText: `01_${charId}_4`,
          range,
        });
      }

      // Gợi ý thoại Người dẫn chuyện (Narrator)
      suggestions.push({
        label: 'narrator: "..."',
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: 'Narrator monologue',
        documentation: 'Dialogue statement without speaker nameplate',
        insertText: 'narrator: "${1:dialogue}"',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: '02_narrator_1',
        range,
      });

      suggestions.push({
        label: 'narrator: """..."""',
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: 'Multiline narrator monologue',
        documentation: 'Multiline narrator monologue with triple quotes',
        insertText: 'narrator: """\n\t$0\n"""',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: '02_narrator_2',
        range,
      });

      suggestions.push({
        label: '"..." (narrator line)',
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: 'Anonymous narration line',
        documentation: 'Anonymous dialogue statement without character name',
        insertText: '"${1:dialogue}"',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: '03_narrator_line',
        range,
      });

      suggestions.push({
        label: '"""...""" (multiline narrator)',
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: 'Anonymous multiline narration block',
        documentation: 'Anonymous multiline dialogue statement enclosed in triple quotes',
        insertText: '"""\n\t$0\n"""',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: '03_narrator_multiline',
        range,
      });

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
          label: 'inspect',
          doc: 'Inspect item modal with backdrop blur: inspect item_id title: "..." { ... }',
          snippet: 'inspect ${1:asset_id} title: "${2:Item Title}" {\n\t"$0"\n}',
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
            sortText: `04_${kw.label}`,
            range,
          });
        } else {
          suggestions.push({
            label: kw.label,
            kind: kw.kind ?? monaco.languages.CompletionItemKind.Keyword,
            documentation: kw.doc,
            insertText: kw.label,
            sortText: `04_${kw.label}`,
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
      const escapedTarget = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const [fileName, content] of Object.entries(files)) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const lineStr = lines[i] ?? '';
          const match = lineStr.match(new RegExp(`^\\s*scene\\s+${escapedTarget}\\s*(\\{|$)`));
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
