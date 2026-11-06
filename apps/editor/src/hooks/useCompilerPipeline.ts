import { useEffect, useRef, useCallback } from 'react';
import type { Instruction, Project } from '@vn-engine/shared-types';
import { useProjectStore } from '../core/stores/projectStore';
import { useDiagnosticsStore } from '../core/stores/diagnosticsStore';
import type { PreviewBridge } from '../core/services/previewBridge';
import type { CompilerService } from '../core/services/compilerService';
import { generateDiagnostics } from '../core/services/reconciliation';

export interface UseCompilerPipelineOptions {
  compilerService: CompilerService;
  previewBridge: PreviewBridge;
  debounceMs?: number;
}

export function useCompilerPipeline(options: UseCompilerPipelineOptions): void {
  const { compilerService, previewBridge, debounceMs = 200 } = options;

  const project = useProjectStore((s) => s.project);

  const lastBytecodeRef = useRef<Instruction[] | null>(null);
  const prevProjectRef = useRef<Project | null>(null);
  const prevFilesRef = useRef<Project['files'] | null>(null);
  const prevCharsRef = useRef<Project['characters'] | null>(null);
  const prevAssetsRef = useRef<Project['assets'] | null>(null);
  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCompile = useCallback(
    async (currentProject: Project) => {
      // 1. Reconciliation diagnostics
      const reconciliationDiags = generateDiagnostics(currentProject);
      useDiagnosticsStore.getState().setReconciliationDiagnostics(reconciliationDiags);

      // 2. DSL Compilation
      const output = await compilerService.compile(currentProject.files, {
        characters: currentProject.characters,
      });

      // 3. Update compiler diagnostics in diagnosticsStore
      useDiagnosticsStore.getState().setCompilerDiagnostics(output.diagnostics);

      // 4. Hot reload if compilation succeeded
      if (output.success && output.bytecode) {
        lastBytecodeRef.current = output.bytecode;
        previewBridge.hotReload({
          projectId: currentProject.id,
          program: output.bytecode,
          characters: currentProject.characters,
          assets: currentProject.assets,
        });
      }
    },
    [compilerService, previewBridge]
  );

  useEffect(() => {
    if (!project) {
      return;
    }

    // Initial Mount Compilation
    if (!prevProjectRef.current) {
      prevProjectRef.current = project;
      prevFilesRef.current = project.files;
      prevCharsRef.current = project.characters;
      prevAssetsRef.current = project.assets;

      runCompile(project);
      return;
    }

    const filesChanged = project.files !== prevFilesRef.current;
    const charsChanged = project.characters !== prevCharsRef.current;
    const assetsChanged = project.assets !== prevAssetsRef.current;

    prevProjectRef.current = project;
    prevFilesRef.current = project.files;
    prevCharsRef.current = project.characters;
    prevAssetsRef.current = project.assets;

    if (filesChanged) {
      if (compileTimerRef.current) {
        clearTimeout(compileTimerRef.current);
      }
      compileTimerRef.current = setTimeout(() => {
        runCompile(project);
      }, debounceMs);
    } else if (charsChanged || assetsChanged) {
      // Re-calculate reconciliation diagnostics
      const reconciliationDiags = generateDiagnostics(project);
      useDiagnosticsStore.getState().setReconciliationDiagnostics(reconciliationDiags);

      // Re-dispatch hotReload with cached bytecode
      if (lastBytecodeRef.current) {
        previewBridge.hotReload({
          projectId: project.id,
          program: lastBytecodeRef.current,
          characters: project.characters,
          assets: project.assets,
        });
      }
    }
  }, [project, debounceMs, runCompile, previewBridge]);

  useEffect(() => {
    return () => {
      if (compileTimerRef.current) {
        clearTimeout(compileTimerRef.current);
      }
    };
  }, []);
}

