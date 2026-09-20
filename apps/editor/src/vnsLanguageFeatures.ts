// ================================================================
// MONACO EDITOR - VNS LANGUAGE FEATURES (COMPLETION & GO-TO-DEFINITION)
// Tuân thủ tài liệu đặc tả UI/UX Specification & DSL Spec
// ================================================================

import * as monaco from 'monaco-editor';

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
            documentation: `Chuyển luồng thực thi đến phân cảnh "${sc}"`,
            insertText: sc,
            range,
          });
        }
        return { suggestions };
      }

      // B. Gợi ý Nhân vật sau show hoặc hide
      if (/\b(show|hide)\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const chars = context.getCharacters();
        for (const [charId, info] of chars) {
          suggestions.push({
            label: charId,
            kind: monaco.languages.CompletionItemKind.Class,
            documentation: info.displayName
              ? `Nhân vật: ${charId} (${info.displayName})`
              : `Nhân vật: ${charId}`,
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
              documentation: `Biểu cảm sprite "${sp}" của ${charId}`,
              insertText: sp,
              range,
            });
          }
          return { suggestions };
        }
      }

      // D. Gợi ý Hình nền sau background
      if (/\bbackground\s+[a-zA-Z0-9_]*$/.test(textUntilPosition)) {
        const assets = context.getAssets();
        for (const bg of assets.backgrounds) {
          suggestions.push({
            label: bg,
            kind: monaco.languages.CompletionItemKind.File,
            documentation: `Hình nền: ${bg}`,
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
            documentation: `Tệp âm thanh: ${aud}`,
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
            documentation: `Biến trạng thái kịch bản: ${v}`,
            insertText: v,
            range,
          });
        }
        return { suggestions };
      }

      // G. Danh sách Từ khóa Cú pháp Cốt lõi (Keywords)
      const keywords = [
        { label: 'scene', doc: 'Khai báo phân cảnh mới: scene ten_canh:' },
        { label: 'reveal', doc: 'Khai báo tên hiển thị nhân vật: reveal charId as "Tên Hiển Thị"' },
        { label: 'show', doc: 'Hiển thị nhân vật trên sân khấu: show charId sprite' },
        { label: 'hide', doc: 'Ẩn nhân vật khỏi sân khấu: hide charId' },
        { label: 'background', doc: 'Đổi hình nền phân cảnh: background bg_id with fade' },
        { label: 'play music', doc: 'Phát nhạc nền lặp lại: play music bgm_id' },
        { label: 'play sound', doc: 'Phát hiệu ứng âm thanh một lần: play sound sfx_id' },
        { label: 'stop', doc: 'Dừng kênh âm thanh: stop music with fade 1s' },
        { label: 'choice', doc: 'Tạo danh sách lựa chọn rẽ nhánh: choice: "Option A" goto sceneA' },
        { label: 'goto', doc: 'Chuyển nhánh đến scene khác: goto scene_id' },
        { label: 'call', doc: 'Gọi phân cảnh con và quay về bằng return: call sub_scene' },
        { label: 'return', doc: 'Quay về vị trí gọi trước đó của call' },
        { label: 'if', doc: 'Câu lệnh điều kiện: if (bien == true) { ... }' },
        { label: 'else', doc: 'Nhánh ngược lại của điều kiện if: else { ... }' },
        { label: 'while', doc: 'Vòng lặp điều kiện: while (dem < 5) { ... }' },
      ];

      for (const kw of keywords) {
        suggestions.push({
          label: kw.label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          documentation: kw.doc,
          insertText: kw.label,
          range,
        });
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
}
