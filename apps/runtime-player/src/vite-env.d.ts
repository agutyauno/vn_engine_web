/// <reference types="vite/client" />

declare module '*.vns?raw' {
  const content: string;
  export default content;
}
