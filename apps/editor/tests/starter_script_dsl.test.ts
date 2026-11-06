import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import type {
  Project,
  DialogueInstruction,
  SceneInstruction,
  ChoiceInstruction,
} from '@vn-engine/shared-types';
import { compile } from '@vn-engine/dsl-compiler';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';
import type { CreateProjectParams } from '../src/core/contracts/repository';

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

    expect(content).toContain('# Main visual novel script');
    expect(content).not.toContain('//');
  });

  it('TC-STARTER-02: default project script must compile with 0 diagnostics and produce SCENE & DIALOGUE instructions', async () => {
    const project = await repository.createProject(defaultParams);

    const res = compileProject(project);

    expect(res.diagnostics).toHaveLength(0);
    expect(res.success).toBe(true);
    expect(res.program).toBeDefined();

    const program = res.program!;

    const sceneInstr = program.find(
      (instr): instr is SceneInstruction => instr.type === 'SCENE' && instr.name === 'start'
    );
    expect(sceneInstr).toBeDefined();
    expect(sceneInstr?.name).toBe('start');

    const dialogueInstr = program.find(
      (instr): instr is DialogueInstruction => instr.type === 'DIALOGUE'
    );
    expect(dialogueInstr).toBeDefined();
    expect(dialogueInstr?.character).toBeNull();
    expect(dialogueInstr?.text).toContain('Welcome to Starry Journey.');
  });

  it('TC-STARTER-03: default project script contains choices, sub-scenes, and end statement', async () => {
    const project = await repository.createProject(defaultParams);
    const mainFile = project.files.find((f) => f.name === 'main.vns')!;
    const content = mainFile.content;

    expect(content).toContain('choice');
    expect(content).toContain('scene .story');
    expect(content).toContain('scene .about');
    expect(content).toContain('end');

    const res = compileProject(project);
    expect(res.diagnostics).toHaveLength(0);
    expect(res.success).toBe(true);
    expect(res.program).toBeDefined();

    const program = res.program!;

    const choiceInstr = program.find(
      (instr): instr is ChoiceInstruction => instr.type === 'CHOICE'
    );
    expect(choiceInstr).toBeDefined();
    expect(choiceInstr?.choices.length).toBeGreaterThanOrEqual(2);

    const storyScene = program.find(
      (instr): instr is SceneInstruction => instr.type === 'SCENE' && instr.name === 'start.story'
    );
    expect(storyScene).toBeDefined();

    const haltInstr = program.find(
      (instr) => instr.type === 'HALT' || (instr.type as string) === 'END'
    );
    expect(haltInstr).toBeDefined();
  });
});
