// ================================================================
// MONACO EDITOR - VNS LANGUAGE FEATURES (COMPLETION & GO-TO-DEFINITION)
// Tuân thủ tài liệu đặc tả UI/UX Specification & DSL Spec
// ================================================================

import * as monaco from 'monaco-editor';
import { formatVns } from '@vn-engine/dsl-compiler';
import { useDiagnosticsStore } from './core/stores/diagnosticsStore';
import { useEditorUIStore } from './core/stores/uiStore';
import { resolveQuickFixActions, type QuickFixContext } from './core/services/quickFixService';
import type { EditorDiagnostic } from './core/services/reconciliation';
import type { AssetCategory } from '@vn-engine/shared-types';

export interface SceneItem {
  name: string;
  file: string;
  line: number;
}

export interface VnsProjectContext {
  getFiles: () => Record<string, string>;
  getScenes: () => SceneItem[] | string[];
  getCharacters: () => Map<string, { displayName?: string; colorHex?: string; sprites: Set<string> }>;
  getAssets: () => { backgrounds: Set<string>; audio: Set<string>; voices?: Set<string> };
  getAssetDetails?: () => Map<string, { category?: string; type: string; sizeBytes?: number }>;
  getVariables: () => string[];
  getDiagnostics?: () => EditorDiagnostic[];
  switchActiveFile: (fileName: string) => void;
}

let featureDisposables: monaco.IDisposable[] = [];

export function registerVnsLanguageFeatures(context: VnsProjectContext): monaco.IDisposable {
  // Dispose previous registrations if any (avoids duplicate provider leaks on re-register/HMR)
  for (const d of featureDisposables) {
    d.dispose();
  }
  featureDisposables = [];

  // 1. AUTOCOMPLETE PROVIDER
  const completionDisposable = monaco.languages.registerCompletionItemProvider('vns', {
    triggerCharacters: [' ', '.', ':', '~', '"', '{'],
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

      // A0. Gợi ý khai báo Sub-scene khi gõ scene . (ADR-015 - TC-AUTO-SUBSCENE-02)
      if (/^[ \t]*scene\s+\.[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        suggestions.push({
          label: 'scene .subname { ... }',
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'Declare local sub-scene block (ADR-015)',
          documentation: 'Declare a local sub-scene nested within parent scene',
          insertText: 'scene .${1:subname} {\n\t$0\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: '00_scene_sub',
          range,
        });
        return { suggestions };
      }

      // A. Gợi ý Scene sau goto hoặc call (kèm relative sub-scenes theo ADR-015)
      if (/\b(goto|call)\s+[a-zA-Z0-9_.]*$/.test(textUntilPosition)) {
        const scenes = context.getScenes();
        for (const item of scenes) {
          const scName = typeof item === 'string' ? item : item.name;
          const scDoc =
            typeof item === 'string'
              ? `Jump execution flow to scene "${scName}"`
              : `Jump execution flow to scene "${scName}"\n\nDeclared in: ${item.file} (line ${item.line})`;

          // Canonical scene name
          suggestions.push({
            label: scName,
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: scDoc,
            insertText: scName,
            sortText: `00_${scName}`,
            range,
          });

          // ADR-015: Bổ sung gợi ý relative sub-scene (.sub) nếu scName chứa dấu chấm (TC-AUTO-SUBSCENE-01)
          const dotIdx = scName.indexOf('.');
          if (dotIdx !== -1) {
            const relName = scName.substring(dotIdx); // ví dụ: ".intro"
            suggestions.push({
              label: relName,
              kind: monaco.languages.CompletionItemKind.Function,
              detail: `Local sub-scene in ${scName.substring(0, dotIdx)}`,
              documentation:
                typeof item === 'string'
                  ? `Jump execution flow to local sub-scene "${relName}"`
                  : `Jump execution flow to local sub-scene "${relName}"\n\nCanonical: ${scName}\nDeclared in: ${item.file} (line ${item.line})`,
              insertText: relName,
              sortText: `00_${relName}`,
              range,
            });
          }
        }
        return { suggestions };
      }

      // A1. Gợi ý hành động goto / call sau dấu hai chấm của một lựa chọn ("Choice text": hoặc "Choice text": g)
      if (/"[^"]*":\s*[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        suggestions.push({
          label: 'goto',
          kind: monaco.languages.CompletionItemKind.Keyword,
          detail: 'Jump to scene',
          documentation: 'Jump execution flow to target scene',
          insertText: 'goto ',
          sortText: '00_goto',
          range,
        });
        suggestions.push({
          label: 'call',
          kind: monaco.languages.CompletionItemKind.Keyword,
          detail: 'Call subroutine scene',
          documentation: 'Call subroutine scene and return',
          insertText: 'call ',
          sortText: '00_call',
          range,
        });
        return { suggestions };
      }

      // A2. Gợi ý biến và boolean literals trong biểu thức điều kiện if và while
      if (/\b(if|while)\s+(\(?\s*)[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const vars = context.getVariables();
        for (const v of vars) {
          suggestions.push({
            label: v,
            kind: monaco.languages.CompletionItemKind.Variable,
            documentation: `Script variable: ${v}`,
            insertText: v,
            sortText: `00_${v}`,
            range,
          });
        }
        suggestions.push({
          label: 'true',
          kind: monaco.languages.CompletionItemKind.Keyword,
          documentation: 'Boolean literal true',
          insertText: 'true',
          sortText: '00_true',
          range,
        });
        suggestions.push({
          label: 'false',
          kind: monaco.languages.CompletionItemKind.Keyword,
          documentation: 'Boolean literal false',
          insertText: 'false',
          sortText: '00_false',
          range,
        });
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

      // E. Gợi ý Âm thanh sau play music / play sound / play voice
      if (/\bplay\s+(music|sound|voice)\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const assets = context.getAssets();
        const isVoice = /\bplay\s+voice\s+[a-zA-Z0-9_]*$/.test(textUntilPosition);
        const targetSet = isVoice ? assets.voices || new Set() : assets.audio;
        for (const aud of targetSet) {
          suggestions.push({
            label: aud,
            kind: monaco.languages.CompletionItemKind.File,
            documentation: `${isVoice ? 'Voice' : 'Audio'} asset: ${aud}`,
            insertText: aud,
            range,
          });
        }
        return { suggestions };
      }

      // E2. Gợi ý Kênh Dừng Âm Thanh sau stop (TC-AUTO-STOP-01)
      if (/\bstop\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const stopChannels = [
          {
            label: 'music',
            snippet: 'music fade_out: ${1:1.0s}',
            doc: 'Stop looping background music playback with fade_out duration',
          },
          {
            label: 'sound',
            snippet: 'sound',
            doc: 'Stop active sound effect playback immediately',
          },
          {
            label: 'voice',
            snippet: 'voice',
            doc: 'Stop active character voice playback immediately',
          },
          {
            label: 'all',
            snippet: 'all fade_out: ${1:1.0s}',
            doc: 'Stop all active audio channels playback with fade_out duration',
          },
        ];

        for (const ch of stopChannels) {
          suggestions.push({
            label: ch.label,
            kind: monaco.languages.CompletionItemKind.Value,
            detail: `Audio stop channel: ${ch.label}`,
            documentation: ch.doc,
            insertText: ch.snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: `00_${ch.label}`,
            range,
          });
        }
        return { suggestions };
      }

      // E1. Scoped dialogue string interpolation ({var} and typewriter tags)
      const braceMatch = textUntilPosition.match(/\{([a-zA-Z0-9_:.\/#]*)$/);
      if (braceMatch) {
        // Chỉ kích hoạt khi con trỏ ở trong chuỗi thoại hoặc prompt input
        const isDialogueOrInput =
          /^[ \t]*[a-zA-Z_][a-zA-Z0-9_]*(?:\s+as\s+"[^"]*")?:\s*"[^"]*$/.test(textUntilPosition) ||
          /^[ \t]*"[^"]*$/.test(textUntilPosition) ||
          /^[ \t]*input\s+[a-zA-Z_][a-zA-Z0-9_]*\s+"[^"]*$/.test(textUntilPosition);

        if (isDialogueOrInput) {
          const braceRange: monaco.IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - braceMatch[0].length,
            endColumn: position.column,
          };

          // Gợi ý biến kịch bản
          const vars = context.getVariables();
          for (const v of vars) {
            suggestions.push({
              label: `{${v}}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: `Variable: ${v}`,
              documentation: `Interpolate variable "${v}" into dialogue`,
              insertText: `{${v}}`,
              sortText: `00_${v}`,
              range: braceRange,
            });
          }

          // Gợi ý typewriter control tags
          const typewriterTags = [
            { tag: '{pause:0.5s}', doc: 'Pause typewriter rendering for 0.5 seconds' },
            { tag: '{pause:300ms}', doc: 'Pause typewriter rendering for 300 milliseconds' },
            { tag: '{wait:1.0s}', doc: 'Pause typewriter rendering for 1.0 second' },
            { tag: '{speed:slow}', doc: 'Change typewriter text rendering speed to slow (0.5x)' },
            { tag: '{speed:normal}', doc: 'Reset typewriter text rendering speed to normal (1.0x)' },
            { tag: '{speed:fast}', doc: 'Change typewriter text rendering speed to fast (2.0x)' },
            { tag: '{speed:2.0}', doc: 'Set custom numeric speed multiplier (e.g. 2.0x)' },
            { tag: '{color:#38bdf8}', doc: 'Colorize subsequent dialogue text with HEX color' },
            { tag: '{color:red}', doc: 'Colorize subsequent dialogue text with named color' },
            { tag: '{color:default}', doc: 'Reset dialogue text color to default theme color' },
            { tag: '{color:reset}', doc: 'Reset dialogue text color to default theme color' },
            { tag: '{/color}', doc: 'Closing tag to restore previous dialogue text color' },
          ];

          for (const t of typewriterTags) {
            suggestions.push({
              label: t.tag,
              kind: monaco.languages.CompletionItemKind.Snippet,
              detail: 'Typewriter Tag',
              documentation: t.doc,
              insertText: t.tag,
              sortText: `01_${t.tag}`,
              range: braceRange,
            });
          }

          // Gợi ý thẻ màu sắc từ các nhân vật đã cấu hình (colorHex)
          const projectChars = context.getCharacters();
          for (const [charId, info] of projectChars) {
            if (info.colorHex) {
              const charTag = `{color:${info.colorHex}}`;
              const charName = info.displayName ? `${info.displayName} (${charId})` : charId;
              suggestions.push({
                label: charTag,
                kind: monaco.languages.CompletionItemKind.Snippet,
                detail: `Character Color: ${charName}`,
                documentation: `Colorize text with ${charName}'s theme color (${info.colorHex})`,
                insertText: charTag,
                sortText: `01_${charTag}`,
                range: braceRange,
              });
            }
          }

          return { suggestions };
        }
      }

      // F0. Gợi ý biến và boolean literals trong vế phải phép gán (~ var = ...)
      if (/~\s*[a-zA-Z0-9_]+\s*=\s*[a-zA-Z0-9_+\-*/\s]*$/.test(textUntilPosition)) {
        const vars = context.getVariables();
        for (const v of vars) {
          suggestions.push({
            label: v,
            kind: monaco.languages.CompletionItemKind.Variable,
            documentation: `Script state variable: ${v}`,
            insertText: v,
            sortText: `00_${v}`,
            range,
          });
        }
        suggestions.push({
          label: 'true',
          kind: monaco.languages.CompletionItemKind.Keyword,
          documentation: 'Boolean literal true',
          insertText: 'true',
          sortText: '00_true',
          range,
        });
        suggestions.push({
          label: 'false',
          kind: monaco.languages.CompletionItemKind.Keyword,
          documentation: 'Boolean literal false',
          insertText: 'false',
          sortText: '00_false',
          range,
        });
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

      // G-1. Quét ngược phát hiện khối choice { ... } để gợi ý snippet nhánh lựa chọn (TC-AUTO-CHOICE-01)
      let isInsideChoiceBlock = false;
      let braceDepth = 0;
      for (let i = position.lineNumber; i >= 1; i--) {
        const line =
          i === position.lineNumber
            ? model.getLineContent(i).substring(0, position.column - 1)
            : model.getLineContent(i);
        const stripped = line.replace(/#.*$/, '').replace(/"[^"]*"/g, '');
        for (let j = stripped.length - 1; j >= 0; j--) {
          const ch = stripped[j];
          if (ch === '}') braceDepth++;
          else if (ch === '{') {
            if (braceDepth > 0) {
              braceDepth--;
            } else {
              const beforeBrace = stripped.substring(0, j).trim();
              if (
                /\bchoice\b/.test(beforeBrace) ||
                (i > 1 && /\bchoice\b/.test(model.getLineContent(i - 1)))
              ) {
                isInsideChoiceBlock = true;
              }
              break;
            }
          }
        }
        if (isInsideChoiceBlock || braceDepth < 0) break;
      }

      if (isInsideChoiceBlock) {
        suggestions.push({
          label: '"Choice": goto target',
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'Choice branch with goto jump',
          documentation: 'Insert choice option jumping to target scene',
          insertText: '"${1:Choice}": goto ${2:target_scene}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: '00_choice_goto',
          range,
        });
        suggestions.push({
          label: '"Choice": call target',
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'Choice branch with call subroutine',
          documentation: 'Insert choice option calling subroutine scene',
          insertText: '"${1:Choice}": call ${2:target_scene}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: '00_choice_call',
          range,
        });
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
          sortText: `02_${charId}_1`,
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
          sortText: `02_${charId}_2`,
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
          sortText: `02_${charId}_3`,
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
          sortText: `02_${charId}_4`,
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
        sortText: '02_narrator_line',
        range,
      });

      suggestions.push({
        label: '"""...""" (multiline narrator)',
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: 'Anonymous multiline narration block',
        documentation: 'Anonymous multiline dialogue statement enclosed in triple quotes',
        insertText: '"""\n\t$0\n"""',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: '02_narrator_multiline',
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
          label: 'play voice',
          doc: 'Play character voice audio: play voice "voice_id" volume: 1.0',
          snippet: 'play voice "${1:voice_asset}" volume: ${2:1.0}',
        },
        {
          label: 'stop',
          doc: 'Stop audio channel: stop music fade_out: 1.0s',
          snippet: 'stop ${1:music} fade_out: ${2:1.0s}',
        },
        {
          label: 'stop voice',
          doc: 'Stop active voice channel playback: stop voice',
          snippet: 'stop voice',
        },
        {
          label: 'input',
          doc: 'Prompt player text input: input var "Prompt question" default: "value"',
          snippet: 'input ${1:variable} "${2:Prompt question}" default: "${3:value}"',
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

      const primaryKeywords = new Set([
        'scene',
        'show',
        'hide',
        'hide dialogue',
        'background',
        'choice',
      ]);
      const mediaKeywords = new Set([
        'play music',
        'play sound',
        'play voice',
        'stop',
        'stop voice',
        'inspect',
        'wait',
        'input',
      ]);

      for (const kw of keywordSnippets) {
        const category = primaryKeywords.has(kw.label)
          ? '01'
          : mediaKeywords.has(kw.label)
          ? '03'
          : '04';
        const sortText = `${category}_${kw.label}`;

        if (kw.snippet) {
          suggestions.push({
            label: kw.label,
            kind: kw.kind ?? monaco.languages.CompletionItemKind.Snippet,
            documentation: kw.doc,
            insertText: kw.snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText,
            range,
          });
        } else {
          suggestions.push({
            label: kw.label,
            kind: kw.kind ?? monaco.languages.CompletionItemKind.Keyword,
            documentation: kw.doc,
            insertText: kw.label,
            sortText,
            range,
          });
        }
      }

      return { suggestions };
    },
  });
  featureDisposables.push(completionDisposable);

  // 2. GO-TO-DEFINITION PROVIDER (Ctrl + Click nhảy tới phân cảnh)
  const definitionDisposable = monaco.languages.registerDefinitionProvider('vns', {
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
  featureDisposables.push(definitionDisposable);

  // 3. DOCUMENT FORMATTING PROVIDER (Auto-Format: Shift + Alt + F)
  const formattingDisposable = monaco.languages.registerDocumentFormattingEditProvider('vns', {
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
  featureDisposables.push(formattingDisposable);

  // 4. HOVER PROVIDER (Zero-Trust Markdown Hover Cards)
  const hoverDisposable = monaco.languages.registerHoverProvider('vns', {
    provideHover: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber);
      if (!lineContent) return null;

      const col = Math.max(0, position.column - 1);
      const isWordChar = (c: string) => /[a-zA-Z0-9_]/.test(c);

      let start = col;
      let end = col;

      if (!isWordChar(lineContent[col] || '')) {
        const w = model.getWordAtPosition ? model.getWordAtPosition(position) : null;
        if (!w || !w.word) return null;
        start = w.startColumn - 1;
        end = w.endColumn - 1;
      } else {
        while (start > 0 && isWordChar(lineContent[start - 1]!)) {
          start--;
        }
        while (end < lineContent.length && isWordChar(lineContent[end]!)) {
          end++;
        }
      }

      const token = lineContent.substring(start, end);
      if (!token) return null;

      const wordRange: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: start + 1,
        endColumn: end + 1,
      };

      // A. Character Hover
      const chars = context.getCharacters();
      if (chars.has(token)) {
        const charInfo = chars.get(token)!;
        const spritesList = Array.from(charInfo.sprites || []).join(', ');
        const mdParts = [
          `**Character: ${token}**`,
          charInfo.displayName ? `**Display Name:** ${charInfo.displayName}` : null,
          spritesList ? `**Sprites:** ${spritesList}` : null,
        ].filter(Boolean);

        return {
          range: wordRange,
          contents: [
            {
              value: mdParts.join('\n\n'),
              isTrusted: false,
              supportHtml: false,
            },
          ],
        };
      }

      // B. Asset Details Hover
      const assetDetails = context.getAssetDetails ? context.getAssetDetails() : null;
      if (assetDetails && assetDetails.has(token)) {
        const detail = assetDetails.get(token)!;
        const mdParts = [
          `**Asset: ${token}**`,
          detail.category ? `**Category:** ${detail.category}` : null,
          detail.type ? `**Type:** ${detail.type}` : null,
          detail.sizeBytes !== undefined
            ? `**Size:** ${(detail.sizeBytes / 1024).toFixed(1)} KB (${detail.sizeBytes} bytes)`
            : null,
        ].filter(Boolean);

        return {
          range: wordRange,
          contents: [
            {
              value: mdParts.join('\n\n'),
              isTrusted: false,
              supportHtml: false,
            },
          ],
        };
      }

      // C. Scene Location Hover
      if (new RegExp(`\\b(goto|call)\\s+${token}\\b`).test(lineContent)) {
        const scenes = context.getScenes();
        for (const sc of scenes) {
          if (typeof sc !== 'string' && sc.name === token) {
            return {
              range: wordRange,
              contents: [
                {
                  value: `**Scene:** ${sc.name}\n\n**File:** ${sc.file}\n**Line:** ${sc.line}`,
                  isTrusted: false,
                  supportHtml: false,
                },
              ],
            };
          }
        }
      }

      return null;
    },
  });
  featureDisposables.push(hoverDisposable);

  // 5. CODE ACTION PROVIDER (QUICKFIX LIGHTBULB & CTRL+.)
  const codeActionDisposable = monaco.languages.registerCodeActionProvider('vns', {
    provideCodeActions: (model, range, contextData, _token) => {
      let markers = contextData.markers || [];
      if (markers.length === 0) {
        const allModelMarkers = monaco.editor.getModelMarkers({ resource: model.uri });
        markers = allModelMarkers.filter(
          m => m.startLineNumber <= range.endLineNumber && m.endLineNumber >= range.startLineNumber,
        );
      }
      if (markers.length === 0) {
        return { actions: [], dispose: () => {} };
      }

      const store = useDiagnosticsStore.getState();
      const allDiagnostics: EditorDiagnostic[] = context.getDiagnostics
        ? context.getDiagnostics()
        : [
            ...store.compilerDiagnostics,
            ...store.reconciliationDiagnostics,
            ...store.runtimeDiagnostics,
          ];

      const activeFileId = useEditorUIStore.getState().activeFileId;
      const modelUriStr = model.uri ? model.uri.toString() : '';
      const modelUriPath = model.uri ? model.uri.path : '';

      const matchDiagnosticToFile = (d: EditorDiagnostic): boolean => {
        if (!d.fileId && !d.fileName) return true;
        if (activeFileId && (d.fileId === activeFileId || d.fileName === activeFileId)) return true;
        if (d.fileId && (modelUriStr.includes(d.fileId) || modelUriPath.includes(d.fileId))) return true;
        if (d.fileName && (modelUriStr.includes(d.fileName) || modelUriPath.includes(d.fileName) || modelUriPath === `/${d.fileName}`)) return true;
        return false;
      };

      const matchedDiagnostics: EditorDiagnostic[] = [];
      for (const marker of markers) {
        for (const d of allDiagnostics) {
          if (!matchDiagnosticToFile(d)) continue;
          if (d.line !== marker.startLineNumber) continue;
          if (marker.code && d.code && marker.code !== d.code) continue;
          if (!matchedDiagnostics.includes(d)) {
            matchedDiagnostics.push(d);
          }
        }
      }

      if (matchedDiagnostics.length === 0) {
        return { actions: [], dispose: () => {} };
      }

      // Chuẩn bị assets
      const projectAssets: Array<{ id: string; name?: string; category?: AssetCategory }> = [];
      const rawAssets = context.getAssets();
      for (const bg of rawAssets.backgrounds || []) {
        projectAssets.push({ id: bg, name: bg, category: 'background' });
      }
      for (const aud of rawAssets.audio || []) {
        projectAssets.push({ id: aud, name: aud, category: 'bgm' });
      }
      if (context.getAssetDetails) {
        const details = context.getAssetDetails();
        for (const [id, det] of details.entries()) {
          if (!projectAssets.some(a => a.id === id || a.name === id)) {
            projectAssets.push({
              id,
              name: id,
              category: (det.category as AssetCategory) || 'other',
            });
          }
        }
      }

      const projectCharacters = Array.from(context.getCharacters().keys());
      const projectVariables = context.getVariables ? context.getVariables() : [];
      const cursorLine = range.startLineNumber;
      const cursorCol = range.startColumn;
      const fileId = activeFileId || modelUriStr.split('/').pop()?.replace(/\.vns$/, '') || 'active-file';

      const qfContext: QuickFixContext = {
        fileId,
        fileContent: model.getValue(),
        cursorLine,
        cursorCol,
        diagnostics: matchedDiagnostics,
        projectCharacters,
        projectAssets,
        projectVariables,
      };

      const qfActions = resolveQuickFixActions(qfContext);

      const monacoActions: monaco.languages.CodeAction[] = qfActions.map(action => {
        const codeAction: monaco.languages.CodeAction = {
          title: action.title,
          kind: action.kind,
          isPreferred: action.isPreferred,
        };

        if (action.edit) {
          codeAction.edit = {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: action.edit.range.startLine,
                    startColumn: action.edit.range.startCol,
                    endLineNumber: action.edit.range.endLine,
                    endColumn: action.edit.range.endCol,
                  },
                  text: action.edit.newText,
                },
                versionId: undefined,
              },
            ],
          };
        }

        if (action.command) {
          codeAction.command = {
            id: action.command.id,
            title: action.title,
            arguments: action.command.arguments,
          };
        }

        return codeAction;
      });

      return {
        actions: monacoActions,
        dispose: () => {},
      };
    },
  });
  featureDisposables.push(codeActionDisposable);

  return {
    dispose: () => {
      for (const d of featureDisposables) {
        d.dispose();
      }
      featureDisposables = [];
    },
  };
}
