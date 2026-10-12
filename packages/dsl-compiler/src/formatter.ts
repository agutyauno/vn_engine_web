// ================================================================
// VNS DSL SCRIPT AUTO-FORMATTER
// Định dạng mã nguồn VNS DSL theo chuẩn thụt lề, khoảng trắng và cú pháp
// ================================================================

export interface VnsFormatOptions {
  /**
   * Số lượng khoảng trắng cho mỗi cấp thụt lề (mặc định: 2).
   */
  indentSize?: number;
  /**
   * Sử dụng ký tự Tab ('\t') thay vì khoảng trắng (mặc định: false).
   */
  useTabs?: boolean;
}

/**
 * Tách dòng mã nguồn thành phần code thực tế và phần comment ở cuối dòng (nếu có),
 * bảo vệ tuyệt đối chuỗi string literal ("...").
 */
function splitCodeAndComment(line: string): { code: string; comment: string } {
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '#') {
      return {
        code: line.substring(0, i).trimEnd(),
        comment: line.substring(i).trimEnd(),
      };
    }
  }

  return { code: line.trimEnd(), comment: '' };
}

/**
 * Đếm số lượng ngoặc nhọn mở '{' và đóng '}' bên ngoài các chuỗi ký tự và comment.
 */
function countBracesOutsideStrings(code: string): {
  opens: number;
  closes: number;
  startsWithClose: boolean;
} {
  let opens = 0;
  let closes = 0;
  let inString = false;
  let isEscaped = false;
  let codeWithoutStrings = '';

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    codeWithoutStrings += char;
    if (char === '{') opens++;
    if (char === '}') closes++;
  }

  const trimmed = codeWithoutStrings.trim();
  const startsWithClose = trimmed.startsWith('}');

  return { opens, closes, startsWithClose };
}

/**
 * Chuẩn hóa biểu thức số học / logic / điều kiện bên ngoài các chuỗi.
 */
function formatExpression(expr: string): string {
  const strings: string[] = [];

  // Trích xuất toàn bộ chuỗi string literal và thay bằng placeholder __STR_i__
  const sanitized = expr.replace(/"([^"\\]|\\.)*"/g, match => {
    strings.push(match);
    return `__VNS_STR_${strings.length - 1}__`;
  });

  // 1. Chuẩn hóa khoảng trắng quanh toán tử đa ký tự (<=, >=, ==, !=, &&, ||)
  let result = sanitized.replace(/\s*(<=|>=|==|!=|&&|\|\|)\s*/g, ' $1 ');

  // 2. Chuẩn hóa toán tử so sánh đơn (<, >) khi không dính vào <=, >=
  result = result.replace(/([^\s<=!])\s*([<>])\s*([^\s=])/g, '$1 $2 $3');

  // 3. Chuẩn hóa toán tử số học (+, *, /) và trừ nhị phân (-)
  result = result.replace(/([a-zA-Z0-9_\)\]])\s*([\+\*\/])\s*([a-zA-Z0-9_\(\[!])/g, '$1 $2 $3');
  result = result.replace(/([a-zA-Z0-9_\)\]])\s*(-)\s*([a-zA-Z0-9_\(\[!])/g, '$1 - $3');

  // 4. Thu gọn khoảng trắng thừa
  result = result.replace(/[ \t]+/g, ' ').trim();

  // 5. Khôi phục chuỗi string literal nguyên vẹn
  result = result.replace(/__VNS_STR_(\d+)__/g, (_, idx) => strings[Number(idx)] ?? '');

  return result;
}

/**
 * Tách danh sách tham số dạng (key: value, ...) theo dấu phẩy bên ngoài string.
 */
function splitParams(paramsStr: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < paramsStr.length; i++) {
    const char = paramsStr[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      current += char;
      continue;
    }

    if (char === '"') {
      inString = true;
      current += char;
      continue;
    }

    if (char === ',') {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(current);
  }

  return parts;
}

/**
 * Định dạng danh sách tham số đặt tên (named parameters) bên trong ngoặc đơn.
 */
function formatNamedParams(paramsContent: string): string {
  const rawParams = splitParams(paramsContent);
  const formattedParams = rawParams
    .map(p => {
      const trimmed = p.trim();
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.substring(0, colonIdx).trim();
        const val = trimmed.substring(colonIdx + 1).trim();
        return `${key}: ${val}`;
      }
      return trimmed;
    })
    .filter(Boolean);

  return formattedParams.join(', ');
}

/**
 * Định dạng câu lệnh kịch bản VNS theo từng dòng cụ thể.
 */
function formatStatement(trimmedCode: string): string {
  // 1. Scene header: scene <name> [ui: "..."] {
  const sceneMatch = trimmedCode.match(
    /^scene\s+([a-zA-Z0-9_\.]+)(?:\s+ui:\s*("([^"\\]|\\.)*"))?\s*\{$/,
  );
  if (sceneMatch && sceneMatch[1]) {
    const sceneName = sceneMatch[1];
    const uiAttr = sceneMatch[2];
    if (uiAttr) {
      return `scene ${sceneName} ui: ${uiAttr} {`;
    }
    return `scene ${sceneName} {`;
  }

  // 1b. Empty scene: scene <name> {}
  const emptySceneMatch = trimmedCode.match(
    /^scene\s+([a-zA-Z0-9_\.]+)(?:\s+ui:\s*("([^"\\]|\\.)*"))?\s*\{\s*\}$/,
  );
  if (emptySceneMatch && emptySceneMatch[1]) {
    const sceneName = emptySceneMatch[1];
    const uiAttr = emptySceneMatch[2];
    if (uiAttr) {
      return `scene ${sceneName} ui: ${uiAttr} {}`;
    }
    return `scene ${sceneName} {}`;
  }

  // 2. Choice header: choice {
  if (/^choice\s*\{$/.test(trimmedCode)) {
    return 'choice {';
  }

  // 2b. Inspect statement: inspect <assetId> [title: "..."] {
  const inspectMatch = trimmedCode.match(
    /^inspect\s+([a-zA-Z0-9_]+)(?:\s+title:\s*("([^"\\]|\\.)*"))?\s*\{$/,
  );
  if (inspectMatch && inspectMatch[1]) {
    const assetId = inspectMatch[1];
    const titleAttr = inspectMatch[2];
    if (titleAttr) {
      return `inspect ${assetId} title: ${titleAttr} {`;
    }
    return `inspect ${assetId} {`;
  }

  const emptyInspectMatch = trimmedCode.match(
    /^inspect\s+([a-zA-Z0-9_]+)(?:\s+title:\s*("([^"\\]|\\.)*"))?\s*\{\s*\}$/,
  );
  if (emptyInspectMatch && emptyInspectMatch[1]) {
    const assetId = emptyInspectMatch[1];
    const titleAttr = emptyInspectMatch[2];
    if (titleAttr) {
      return `inspect ${assetId} title: ${titleAttr} {}`;
    }
    return `inspect ${assetId} {}`;
  }

  // 3. Conditionals & Loops
  // } else if <cond> {
  const closeElseIfMatch = trimmedCode.match(/^\}\s*else\s+if\s+(.+?)\s*\{$/);
  if (closeElseIfMatch && closeElseIfMatch[1]) {
    return `} else if ${formatExpression(closeElseIfMatch[1])} {`;
  }

  // } else {
  if (/^\}\s*else\s*\{$/.test(trimmedCode)) {
    return '} else {';
  }

  // else if <cond> {
  const elseIfMatch = trimmedCode.match(/^else\s+if\s+(.+?)\s*\{$/);
  if (elseIfMatch && elseIfMatch[1]) {
    return `else if ${formatExpression(elseIfMatch[1])} {`;
  }

  // else {
  if (/^else\s*\{$/.test(trimmedCode)) {
    return 'else {';
  }

  // if <cond> {
  const ifMatch = trimmedCode.match(/^if\s+(.+?)\s*\{$/);
  if (ifMatch && ifMatch[1]) {
    return `if ${formatExpression(ifMatch[1])} {`;
  }

  // while <cond> {
  const whileMatch = trimmedCode.match(/^while\s+(.+?)\s*\{$/);
  if (whileMatch && whileMatch[1]) {
    return `while ${formatExpression(whileMatch[1])} {`;
  }

  // 4. Choice Option: "Label": goto / call <target>
  const choiceOptMatch = trimmedCode.match(
    /^("([^"\\]|\\.)*")\s*:\s*(goto|call)\s+([a-zA-Z0-9_\.]+)$/,
  );
  if (choiceOptMatch && choiceOptMatch[1] && choiceOptMatch[3] && choiceOptMatch[4]) {
    return `${choiceOptMatch[1]}: ${choiceOptMatch[3]} ${choiceOptMatch[4]}`;
  }

  // 5. Dialogue with character alias: char as "Alias": "Text"
  const aliasDialogueMatch = trimmedCode.match(
    /^([a-zA-Z0-9_]+)\s+as\s+("([^"\\]|\\.)*")\s*:\s*("([^"\\]|\\.)*")$/,
  );
  if (
    aliasDialogueMatch &&
    aliasDialogueMatch[1] &&
    aliasDialogueMatch[2] &&
    aliasDialogueMatch[4]
  ) {
    return `${aliasDialogueMatch[1]} as ${aliasDialogueMatch[2]}: ${aliasDialogueMatch[4]}`;
  }

  // 6. Character / Narrator dialogue: char: "Text"
  const charDialogueMatch = trimmedCode.match(/^([a-zA-Z0-9_]+)\s*:\s*("([^"\\]|\\.)*")$/);
  if (charDialogueMatch && charDialogueMatch[1] && charDialogueMatch[2]) {
    return `${charDialogueMatch[1]}: ${charDialogueMatch[2]}`;
  }

  // 7. Bare narration dialogue: "Text"
  if (/^"([^"\\]|\\.)*"$/.test(trimmedCode)) {
    return trimmedCode;
  }

  // 8. Variable declaration: define var_name = expr
  const defineMatch = trimmedCode.match(/^define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
  if (defineMatch && defineMatch[1] && defineMatch[2]) {
    return `define ${defineMatch[1]} = ${formatExpression(defineMatch[2])}`;
  }

  // 9. Variable reassignment: ~ var_name = expr
  const assignMatch = trimmedCode.match(/^~\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
  if (assignMatch && assignMatch[1] && assignMatch[2]) {
    return `~ ${assignMatch[1]} = ${formatExpression(assignMatch[2])}`;
  }

  // 10. Control flow: goto, call, wait, return, end
  const gotoMatch = trimmedCode.match(/^goto\s+([a-zA-Z0-9_\.]+)$/);
  if (gotoMatch && gotoMatch[1]) {
    return `goto ${gotoMatch[1]}`;
  }

  const callMatch = trimmedCode.match(/^call\s+([a-zA-Z0-9_\.]+)$/);
  if (callMatch && callMatch[1]) {
    return `call ${callMatch[1]}`;
  }

  const waitMatch = trimmedCode.match(/^wait\s+([0-9]+(?:\.[0-9]+)?s?)$/);
  if (waitMatch && waitMatch[1]) {
    return `wait ${waitMatch[1]}`;
  }

  const revealMatch = trimmedCode.match(/^reveal\s+([a-zA-Z0-9_]+)\s+as\s+("([^"\\]|\\.)*")$/);
  if (revealMatch && revealMatch[1] && revealMatch[2]) {
    return `reveal ${revealMatch[1]} as ${revealMatch[2]}`;
  }

  const runScriptMatch = trimmedCode.match(/^run_script\s+("([^"\\]|\\.)*")$/);
  if (runScriptMatch && runScriptMatch[1]) {
    return `run_script ${runScriptMatch[1]}`;
  }

  const spawnScriptMatch = trimmedCode.match(/^spawn_script\s+("([^"\\]|\\.)*")$/);
  if (spawnScriptMatch && spawnScriptMatch[1]) {
    return `spawn_script ${spawnScriptMatch[1]}`;
  }

  if (trimmedCode === 'return') return 'return';
  if (trimmedCode === 'end') return 'end';
  if (trimmedCode === '}') return '}';

  // 11. Visual & Audio Media statements
  // Hide
  const hideMatch = trimmedCode.match(/^hide\s+([a-zA-Z0-9_]+)$/);
  if (hideMatch && hideMatch[1]) {
    return `hide ${hideMatch[1]}`;
  }

  // Show: show char[.sprite][(params)]
  const showMatch = trimmedCode.match(
    /^show\s+([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)?)(?:\s*\((.*)\))?$/,
  );
  if (showMatch && showMatch[1]) {
    const charTarget = showMatch[1];
    const paramsContent = showMatch[2];
    if (paramsContent !== undefined) {
      return `show ${charTarget}(${formatNamedParams(paramsContent)})`;
    }
    return `show ${charTarget}`;
  }

  // Background: background asset[(params)] hoặc background asset transition: "..."
  const bgParamsMatch = trimmedCode.match(/^background\s+([a-zA-Z0-9_]+)\s*\((.*)\)$/);
  if (bgParamsMatch && bgParamsMatch[1] && bgParamsMatch[2] !== undefined) {
    return `background ${bgParamsMatch[1]}(${formatNamedParams(bgParamsMatch[2])})`;
  }

  const bgTransMatch = trimmedCode.match(
    /^background\s+([a-zA-Z0-9_]+)\s+transition:\s*("([^"\\]|\\.)*")$/,
  );
  if (bgTransMatch && bgTransMatch[1] && bgTransMatch[2]) {
    return `background ${bgTransMatch[1]} transition: ${bgTransMatch[2]}`;
  }

  const bgSimpleMatch = trimmedCode.match(/^background\s+([a-zA-Z0-9_]+)$/);
  if (bgSimpleMatch && bgSimpleMatch[1]) {
    return `background ${bgSimpleMatch[1]}`;
  }

  // Play: play <channel> "<asset>" [params]
  const playMatch = trimmedCode.match(
    /^play\s+([a-zA-Z0-9_]+)\s+("([^"\\]|\\.)*")(?:\s+(.+))?$/,
  );
  if (playMatch && playMatch[1] && playMatch[2]) {
    const channel = playMatch[1];
    const asset = playMatch[2];
    const extra = playMatch[4];
    if (extra) {
      // Chuẩn hóa khoảng trắng giữa các thuộc tính named
      const normalizedExtra = extra
        .replace(/([a-zA-Z_]+)\s*:\s*/g, '$1: ')
        .replace(/\s+/g, ' ')
        .trim();
      return `play ${channel} ${asset} ${normalizedExtra}`;
    }
    return `play ${channel} ${asset}`;
  }

  // Stop: stop <channel> [fade_out: duration]
  const stopMatch = trimmedCode.match(
    /^stop\s+([a-zA-Z0-9_]+)(?:\s+(?:fade_out|fadeOut):\s*([0-9]+(?:\.[0-9]+)?s?))?$/,
  );
  if (stopMatch && stopMatch[1]) {
    const channel = stopMatch[1];
    const fade = stopMatch[2];
    if (fade) {
      return `stop ${channel} fade_out: ${fade}`;
    }
    return `stop ${channel}`;
  }

  // Fallback an toàn: giữ nguyên nội dung code gốc (chỉ loại bỏ khoảng trắng thừa 2 đầu)
  return trimmedCode;
}

function countTripleQuotes(line: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = line.indexOf('"""', idx)) !== -1) {
    let backslashCount = 0;
    let b = idx - 1;
    while (b >= 0 && line[b] === '\\') {
      backslashCount++;
      b--;
    }
    if (backslashCount % 2 === 0) {
      count++;
    }
    idx += 3;
  }
  return count;
}

/**
 * Hàm chính tự động định dạng mã kịch bản VNS DSL (Auto-Format).
 *
 * @param source Mã nguồn VNS DSL đầu vào.
 * @param options Tùy chọn cấu hình (kích thước thụt lề, dùng tabs...).
 * @returns Chuỗi mã nguồn đã được định dạng chuẩn mực.
 */
export function formatVns(source: string, options?: VnsFormatOptions): string {
  const indentSize = options?.indentSize ?? 2;
  const useTabs = options?.useTabs ?? false;

  const rawLines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const resultLines: string[] = [];

  let currentIndent = 0;
  let consecutiveBlankLines = 0;
  let inMultilineString = false;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i] ?? '';

    // Nếu đang trong chuỗi nhiều dòng """...""", giữ nguyên 100% dòng hiện tại
    if (inMultilineString) {
      resultLines.push(rawLine);
      const quotes = countTripleQuotes(rawLine);
      if (quotes % 2 === 1) {
        inMultilineString = false;
      }
      continue;
    }

    const trimmedRaw = rawLine.trim();

    // 1. Xử lý dòng trống
    if (trimmedRaw.length === 0) {
      consecutiveBlankLines++;
      // Chỉ giữ tối đa 1 dòng trống liên tiếp
      if (consecutiveBlankLines <= 1 && resultLines.length > 0) {
        resultLines.push('');
      }
      continue;
    }

    consecutiveBlankLines = 0;

    // Kiểm tra nếu dòng này bắt đầu một multiline string (số lượng """ là lẻ)
    const tripleQuotesInLine = countTripleQuotes(rawLine);
    if (tripleQuotesInLine % 2 === 1) {
      const { opens, closes, startsWithClose } = countBracesOutsideStrings(rawLine);
      const lineIndent = startsWithClose ? Math.max(0, currentIndent - 1) : currentIndent;
      const indentPrefix = useTabs ? '\t'.repeat(lineIndent) : ' '.repeat(lineIndent * indentSize);
      resultLines.push(`${indentPrefix}${trimmedRaw}`);
      inMultilineString = true;
      currentIndent = Math.max(0, currentIndent + (opens - closes));
      continue;
    }

    // 2. Tách Code và Comment
    const { code, comment } = splitCodeAndComment(rawLine);

    // Trường hợp 2A: Toàn bộ dòng là Comment
    if (code.length === 0 && comment.length > 0) {
      // Nếu là comment banner kiểu # === hoặc # --- ở cột 0 ban đầu:
      const wasAtColumnZero = rawLine.startsWith('#');
      let commentIndent = currentIndent;
      if (wasAtColumnZero && (comment.startsWith('# =') || comment.startsWith('# -'))) {
        commentIndent = 0;
      }

      const indentPrefix = useTabs
        ? '\t'.repeat(commentIndent)
        : ' '.repeat(commentIndent * indentSize);

      resultLines.push(`${indentPrefix}${comment}`);
      continue;
    }

    // Trường hợp 2B: Có code (và có thể có trailing comment)
    const { opens, closes, startsWithClose } = countBracesOutsideStrings(code);

    // Nếu dòng bắt đầu bằng dấu đóng ngoặc '}', thụt lùi cấp độ dòng hiện tại
    const lineIndent = startsWithClose ? Math.max(0, currentIndent - 1) : currentIndent;

    // Tự động thêm 1 dòng trống trước các top-level scene nếu dòng trước đó không phải dòng trống
    const isTopLevelScene = lineIndent === 0 && /^scene\s+/.test(code.trim());
    if (isTopLevelScene && resultLines.length > 0 && resultLines[resultLines.length - 1] !== '') {
      resultLines.push('');
    }

    // Định dạng code
    const formattedCode = formatStatement(code.trim());

    // Ghép thụt lề + code + comment cuối dòng (nếu có)
    const indentPrefix = useTabs ? '\t'.repeat(lineIndent) : ' '.repeat(lineIndent * indentSize);

    if (comment.length > 0) {
      resultLines.push(`${indentPrefix}${formattedCode}  ${comment}`);
    } else {
      resultLines.push(`${indentPrefix}${formattedCode}`);
    }

    // Cập nhật lại currentIndent cho các dòng kế tiếp
    currentIndent = Math.max(0, currentIndent + (opens - closes));
  }

  // Xóa các dòng trống ở cuối và kết thúc file bằng đúng 1 ký tự xuống dòng
  while (resultLines.length > 0 && resultLines[resultLines.length - 1] === '') {
    resultLines.pop();
  }

  return resultLines.join('\n') + '\n';
}
