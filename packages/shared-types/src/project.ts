// ==========================================
// CẤU TRÚC PROJECT & METADATA (TAD 2.3, system_architecture.md 3.1)
// ==========================================

export interface Project {
  id: string; // UUIDv4
  title: string;
  version: number; // Optimistic Concurrency Check (ADR-011)
  ownerId: string; // Supabase auth.uid() (ADR-019)
  defaultLanguage: string;
  publishedGameId?: string; // Lưu game-id trên Cloudflare R2 khi publish (TAD 7.1, ADR-019)
  files: ScriptFile[]; // Danh sách file kịch bản đa chương
  characters: Character[]; // Danh sách nhân vật
  variables: VariableDeclaration[];
  assets: AssetRef[];
  uiScreens: UICustomScreen[];
  customScripts: CustomScriptScreen[];
}

export interface ScriptFile {
  id: string; // UUIDv4
  name: string; // Tên chương: "chapter1.vns"
  content: string; // Nội dung DSL
  order: number;
  version: number;
}

export interface Character {
  id: string; // Mã nhân vật dùng trong script: "alice"
  name: string; // Tên hiển thị mặc định: "Alice Carroll" (ADR-020)
  colorHex?: string; // Mã màu tên trong hộp thoại: "#e91e63"
  sprites: Record<string, string>; // { "happy": "asset-uuid-1", "sad": "asset-uuid-2" }
}

export interface VariableDeclaration {
  name: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue: string | number | boolean;
}

export interface AssetRef {
  id: string; // UUIDv4
  name: string; // "bg_classroom.png"
  type: 'image' | 'audio' | 'font';
  storageUrl: string; // URL CDN Cloudflare R2
  sizeBytes: number;
}

export interface UICustomScreen {
  id: string; // "phone_message_style"
  name: string;
  templateHtml?: string;
  cssContent?: string;
}

export interface CustomScriptScreen {
  id: string; // "minigame_archery"
  name: string;
  scriptContent: string;
}
