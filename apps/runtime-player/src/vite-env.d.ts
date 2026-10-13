/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EDITOR_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vns?raw' {
  const content: string;
  export default content;
}
