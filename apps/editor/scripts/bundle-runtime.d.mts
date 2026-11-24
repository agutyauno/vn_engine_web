export declare const RUNTIME_MANIFEST_FORMAT_VERSION: 1;
export declare const RUNTIME_MANIFEST_FILE: 'manifest.json';
export declare function collectRuntimeFiles(dir: string): string[];
export declare function bundleRuntime(options: { sourceDir: string; targetDir: string }): {
  files: string[];
};
