import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { Project, DialogueInstruction, SceneInstruction } from '@vn-engine/shared-types';
import { compile } from '@vn-engine/dsl-compiler';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';
import type { CreateProjectParams } from '../src/core/contracts/repository';

/**
 * Adapter compileProject thực hiện biên dịch toàn bộ script files trong Project
 * thông qua bộ biên dịch @vn-engine/dsl-compiler.
 */
export function compileProject(project: Project) {
  const result = compile(project.files, {
    characters: project.characters,
    assets: project.assets,
  });

  return {
    success: result.success,
    diagnostics: result.errors || [],
    program: result.program,
    ast: result.ast,
  };
}

describe('Starter Script VNS DSL Compliance (TASK-starter-script-dsl-compliance)', () => {
  let repository: IndexedDBProjectRepository;

  beforeEach(() => {
    repository = new IndexedDBProjectRepository('test_starter_script_db_' + Date.now());
  });

  afterEach(async () => {
    await repository.close();
  });

  const defaultParams: CreateProjectParams = {
    title: 'Starry Journey',
    description: 'A test visual novel project',
    displaySettings: {
      width: 1920,
      height: 1080,
      orientation: 'landscape',
      lockAspectRatio: true,
    },
  };

  it('TC-STARTER-01: default main.vns must use "#" for comments and MUST NOT contain "//"', async () => {
    const project = await repository.createProject(defaultParams);

    expect(project.files).toBeDefined();
    expect(project.files.length).toBeGreaterThanOrEqual(1);

    const mainFile = project.files.find((f) => f.name === 'main.vns');
    expect(mainFile).toBeDefined();
    expect(mainFile?.content).toBeDefined();

    const content = mainFile!.content;

    // Phải tuân thủ cú pháp comment '#' của VNS DSL Spec 1.1.0 Mục 3.1
    expect(content).toContain('# Main visual novel script');

    // Tuyệt đối không chứa comment '//' của C/JS khiến lexer nhận nhầm toán tử phép chia
    expect(content).not.toContain('//');
  });

  it('TC-STARTER-02: default project script must compile with 0 diagnostics and produce SCENE & DIALOGUE instructions', async () => {
    const project = await repository.createProject(defaultParams);

    const res = compileProject(project);

    // Kỳ vọng: 0 lỗi cú pháp và diagnostics
    expect(res.diagnostics).toHaveLength(0);
    expect(res.success).toBe(true);
    expect(res.program).toBeDefined();

    const program = res.program!;

    // Kỳ vọng: sinh ra ít nhất lệnh SCENE với tên 'start'
    const sceneInstr = program.find(
      (instr): instr is SceneInstruction => instr.type === 'SCENE' && instr.name === 'start'
    );
    expect(sceneInstr).toBeDefined();
    expect(sceneInstr?.name).toBe('start');

    // Kỳ vọng: sinh ra lệnh DIALOGUE (narrator thoại thông điệp welcome)
    const dialogueInstr = program.find(
      (instr): instr is DialogueInstruction => instr.type === 'DIALOGUE'
    );
    expect(dialogueInstr).toBeDefined();
    expect(dialogueInstr?.character).toBeNull(); // VNS DSL: narrator thoại tương ứng character: null
    expect(dialogueInstr?.text).toContain('Welcome to Starry Journey.');
  });
});
