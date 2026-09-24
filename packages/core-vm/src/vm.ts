// ==========================================
// MÁY ẢO VISUAL NOVEL (VISUAL NOVEL VM CORE)
// ==========================================

import type {
  Instruction,
  VMState,
  StepResult,
  VMSnapshot,
  SaveFileData,
  DialogueInstruction,
  BackgroundInstruction,
  ShowInstruction,
  PlayInstruction,
} from '@vn-engine/shared-types';
import { CURRENT_SAVE_VERSION } from '@vn-engine/shared-types';
import { SandboxEvaluator, type AllowedFunction } from './evaluator';
import { SnapshotRingBuffer } from './ring_buffer';
import {
  InstructionBudgetExceededError,
  InvalidChoiceError,
  SceneNotFoundError,
  EmptyCallStackError,
  VMRuntimeError,
  InvalidSaveDataError,
} from './errors';
import { migrateSaveData, validateVMState } from './migration';
import { interpolate } from './interpolation';

export interface VMOptions {
  ringBufferCapacity?: number;
  maxInstructionBudget?: number;
  customFunctions?: Record<string, AllowedFunction>;
  initialVariables?: Record<string, string | number | boolean>;
}

export interface RunResult {
  stepResult: StepResult;
  sideEffects: Instruction[];
}

export class VisualNovelVM {
  private program: Instruction[];
  private state: VMState;
  private evaluator: SandboxEvaluator;
  private ringBuffer: SnapshotRingBuffer;
  private dialogueCounter = 0;
  private sceneIndexMap: Map<string, number> = new Map();
  private maxInstructionBudget: number;

  constructor(program: Instruction[], initialState?: Partial<VMState>, options?: VMOptions) {
    this.program = program;
    this.maxInstructionBudget = options?.maxInstructionBudget ?? 100000;
    this.ringBuffer = new SnapshotRingBuffer(options?.ringBufferCapacity ?? 50);
    this.evaluator = new SandboxEvaluator(options?.customFunctions);

    // Khởi tạo trạng thái mặc định
    this.state = {
      currentScene: initialState?.currentScene ?? '',
      instructionPointer: initialState?.instructionPointer ?? 0,
      callStack: initialState?.callStack ? [...initialState.callStack] : [],
      variables: {
        ...(options?.initialVariables ?? {}),
        ...(initialState?.variables ?? {}),
      },
      localVariables: { ...(initialState?.localVariables ?? {}) },
      characterDisplayOverrides: { ...(initialState?.characterDisplayOverrides ?? {}) },
      customScriptState: { ...(initialState?.customScriptState ?? {}) },
    };

    // Lập bản đồ chỉ mục Scene để nhảy O(1)
    this.buildSceneIndexMap();

    // Nếu chưa có currentScene, lấy scene đầu tiên nếu có
    if (!this.state.currentScene && this.program.length > 0) {
      const firstScene = this.program.find(i => i.type === 'SCENE');
      if (firstScene && firstScene.type === 'SCENE') {
        this.state.currentScene = firstScene.name;
      }
    }
  }

  /**
   * Lập chỉ mục vị trí các lệnh SCENE trong Bytecode
   */
  private buildSceneIndexMap(): void {
    this.sceneIndexMap.clear();
    for (let i = 0; i < this.program.length; i++) {
      const instr = this.program[i]!;
      if (instr.type === 'SCENE' || instr.type === 'LABEL') {
        this.sceneIndexMap.set(instr.name, i);
      }
    }
  }

  private getEvalContext(): Record<string, string | number | boolean> {
    return {
      ...this.state.variables,
      ...this.state.localVariables,
    };
  }

  /**
   * Tra cứu vị trí của scene đích (hỗ trợ cả tên đầy đủ và tên cục bộ)
   */
  private resolveSceneIndex(targetScene: string): number {
    // 1. Tìm chính xác tên
    if (this.sceneIndexMap.has(targetScene)) {
      return this.sceneIndexMap.get(targetScene)!;
    }

    // 2. Nếu là local scene bắt đầu bằng dấu chấm (.sub)
    if (targetScene.startsWith('.')) {
      const parentName = this.state.currentScene.split('.')[0]!;
      const resolved = `${parentName}${targetScene}`;
      if (this.sceneIndexMap.has(resolved)) {
        return this.sceneIndexMap.get(resolved)!;
      }
    }

    throw new SceneNotFoundError(targetScene);
  }

  /**
   * Nhảy con trỏ lệnh tới scene mục tiêu
   */
  public jumpToScene(targetScene: string): void {
    const targetIndex = this.resolveSceneIndex(targetScene);
    this.state.instructionPointer = targetIndex;
    const sceneInstr = this.program[targetIndex]!;
    if (sceneInstr.type === 'SCENE') {
      this.state.currentScene = sceneInstr.name;
    }
  }

  /**
   * Thực thi duy nhất 1 instruction tại instructionPointer
   */
  public step(): StepResult {
    if (this.state.instructionPointer >= this.program.length) {
      return { type: 'HALTED' };
    }

    const instr = this.program[this.state.instructionPointer]!;

    switch (instr.type) {
      case 'SCENE': {
        this.state.currentScene = instr.name;
        if (!instr.name.includes('.__')) {
          this.state.localVariables = {};
        }
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'LABEL': {
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'DIALOGUE': {
        this.state.instructionPointer++;
        this.dialogueCounter++;

        // Lưu snapshot phục vụ Rollback ngay tại điểm bắt đầu câu thoại
        const snapshot: VMSnapshot = {
          timestamp: Date.now(),
          dialogueIndex: this.dialogueCounter,
          state: JSON.parse(JSON.stringify(this.state)),
        };
        this.ringBuffer.push(snapshot);

        const evalContext = this.getEvalContext();
        const interpolatedText = interpolate(instr.text, evalContext, this.evaluator);
        const interpolatedDisplayNameOverride = instr.displayNameOverride
          ? interpolate(instr.displayNameOverride, evalContext, this.evaluator)
          : undefined;

        return {
          type: 'SUSPEND_DIALOGUE',
          instruction: {
            ...instr,
            text: interpolatedText,
            displayNameOverride: interpolatedDisplayNameOverride,
          },
        };
      }

      case 'REVEAL': {
        const evalContext = this.getEvalContext();
        this.state.characterDisplayOverrides[instr.characterId] = interpolate(
          instr.displayName,
          evalContext,
          this.evaluator,
        );
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'WAIT': {
        this.state.instructionPointer++;
        return {
          type: 'SUSPEND_WAIT',
          instruction: instr,
          duration: instr.duration,
        };
      }

      case 'BACKGROUND':
      case 'SHOW':
      case 'HIDE':
      case 'PLAY':
      case 'STOP':
      case 'RUN_SCRIPT':
      case 'SPAWN_SCRIPT': {
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'ASSIGN': {
        const evalVal = this.evaluator.evaluate(instr.value, this.getEvalContext());
        if (evalVal !== null) {
          if (instr.scope === 'local') {
            this.state.localVariables[instr.variable] = evalVal;
          } else {
            this.state.variables[instr.variable] = evalVal;
          }
        }
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'GOTO': {
        this.jumpToScene(instr.targetScene);
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'CONDITIONAL_GOTO': {
        const conditionResult = this.evaluator.evaluate(instr.condition, this.getEvalContext());
        if (conditionResult) {
          this.jumpToScene(instr.targetScene);
        } else {
          this.state.instructionPointer++;
        }
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'LOOP_START': {
        const conditionResult = this.evaluator.evaluate(instr.condition, this.getEvalContext());
        if (!conditionResult) {
          // Thoát khỏi vòng lặp: nhảy tới loopEndTargetScene
          this.jumpToScene(instr.loopEndTargetScene);
        } else {
          // Tiếp tục vào thân vòng lặp
          this.state.instructionPointer++;
        }
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'LOOP_END': {
        // Quay ngược lại điểm kiểm tra điều kiện của vòng lặp
        this.jumpToScene(instr.loopStartTargetScene);
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'CALL': {
        // Lưu frame quay lại vào callStack kèm biến local của caller
        this.state.callStack.push({
          scene: this.state.currentScene,
          ip: this.state.instructionPointer + 1,
          savedLocalVariables: { ...this.state.localVariables },
        });
        this.jumpToScene(instr.targetScene);
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'RETURN': {
        if (this.state.callStack.length === 0) {
          throw new EmptyCallStackError();
        }
        const frame = this.state.callStack.pop()!;
        this.state.currentScene = frame.scene;
        this.state.instructionPointer = frame.ip;
        this.state.localVariables = { ...(frame.savedLocalVariables ?? {}) };
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'HALT': {
        if (this.state.callStack.length > 0) {
          console.warn(
            `[VN Engine Warning] Script executed 'end' while call stack is not empty (${this.state.callStack.length} frames). Game terminated immediately.`,
          );
        }
        this.state.instructionPointer = this.program.length;
        return { type: 'HALTED' };
      }

      case 'SCENE_END': {
        if (this.state.callStack.length > 0) {
          console.warn(
            `[VN Engine Warning] Scene '${instr.sceneName}' reached end without an explicit 'return' statement. Implicit return to caller executed.`,
          );
          const frame = this.state.callStack.pop()!;
          this.state.currentScene = frame.scene;
          this.state.instructionPointer = frame.ip;
          this.state.localVariables = { ...(frame.savedLocalVariables ?? {}) };
        } else {
          this.state.instructionPointer++;
        }
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'CHOICE': {
        const evalContext = this.getEvalContext();
        const interpolatedChoices = instr.choices.map(c => ({
          ...c,
          text: interpolate(c.text, evalContext, this.evaluator),
        }));

        // Tạm dừng máy ảo tại hộp thoại lựa chọn, không tự động tăng instructionPointer
        return {
          type: 'SUSPEND_CHOICE',
          instruction: {
            ...instr,
            choices: interpolatedChoices,
          },
        };
      }

      default:
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
    }
  }

  /**
   * Chạy liên tục cho đến khi gặp điểm tương tác (DIALOGUE hoặc CHOICE) hoặc game HALTED.
   * Thu thập toàn bộ các side-effects (đổi phông nền, xuất hiện nhân vật, phát nhạc, gán biến).
   * Có bộ đếm ngắt an toàn instructionBudgetCounter chống vòng lặp vô hạn.
   */
  public runUntilInteractive(maxSteps?: number): RunResult {
    const budget = maxSteps ?? this.maxInstructionBudget;
    const sideEffects: Instruction[] = [];
    let steps = 0;

    while (steps < budget) {
      if (this.state.instructionPointer >= this.program.length) {
        return { stepResult: { type: 'HALTED' }, sideEffects };
      }

      const currentInstr = this.program[this.state.instructionPointer]!;

      // Nếu đang đứng ngay tại CHOICE (đã suspend trước đó mà chưa choose)
      if (currentInstr.type === 'CHOICE') {
        const evalContext = this.getEvalContext();
        const interpolatedChoices = currentInstr.choices.map(c => ({
          ...c,
          text: interpolate(c.text, evalContext, this.evaluator),
        }));
        return {
          stepResult: {
            type: 'SUSPEND_CHOICE',
            instruction: {
              ...currentInstr,
              choices: interpolatedChoices,
            },
          },
          sideEffects,
        };
      }

      const result = this.step();
      steps++;

      if (
        result.type === 'SUSPEND_DIALOGUE' ||
        result.type === 'SUSPEND_CHOICE' ||
        result.type === 'SUSPEND_WAIT'
      ) {
        return { stepResult: result, sideEffects };
      }

      if (result.type === 'HALTED') {
        return { stepResult: result, sideEffects };
      }

      if (result.type === 'SIDE_EFFECT') {
        sideEffects.push(result.instruction);
      }
    }

    throw new InstructionBudgetExceededError(
      budget,
      this.state.currentScene,
      this.state.instructionPointer,
    );
  }

  /**
   * Người chơi đưa ra quyết định chọn phương án trong hộp thoại CHOICE
   */
  public choose(choiceIndex: number): void {
    if (this.state.instructionPointer >= this.program.length) {
      throw new InvalidChoiceError(
        'Cannot make a choice because the script program has already ended.',
      );
    }

    const currentInstr = this.program[this.state.instructionPointer]!;
    if (currentInstr.type !== 'CHOICE') {
      throw new InvalidChoiceError(
        `Current instruction is not CHOICE (received: ${currentInstr.type}).`,
      );
    }

    const choice = currentInstr.choices[choiceIndex];
    if (!choice) {
      throw new InvalidChoiceError(
        `Choice index #${choiceIndex} does not exist (total: ${currentInstr.choices.length}).`,
      );
    }

    // Kiểm tra điều kiện (nếu có)
    if (choice.condition) {
      const allowed = this.evaluator.evaluate(choice.condition, this.getEvalContext());
      if (!allowed) {
        throw new InvalidChoiceError(`Choice "${choice.text}" has an unsatisfied condition.`);
      }
    }

    // Xóa ngăn xếp roll-forward vì người chơi đã rẽ một nhánh mới
    this.ringBuffer.clearForward();

    // Chuyển hướng con trỏ sang targetScene của lựa chọn
    this.jumpToScene(choice.targetScene);
  }

  /**
   * Lấy danh sách lựa chọn hợp lệ của hộp thoại CHOICE hiện tại
   */
  public getAvailableChoices(): Array<{
    text: string;
    targetScene: string;
    enabled: boolean;
  }> {
    if (this.state.instructionPointer >= this.program.length) return [];
    const currentInstr = this.program[this.state.instructionPointer]!;
    if (currentInstr.type !== 'CHOICE') return [];

    return currentInstr.choices.map(c => {
      let enabled = true;
      if (c.condition) {
        enabled = !!this.evaluator.evaluate(c.condition, this.getEvalContext());
      }
      return {
        text: c.text,
        targetScene: c.targetScene,
        enabled,
      };
    });
  }

  /**
   * Tua lại câu thoại trước đó (Rollback)
   */
  public rollback(): boolean {
    const snapshot = this.ringBuffer.rollback();
    if (!snapshot) {
      return false;
    }

    this.state = JSON.parse(JSON.stringify(snapshot.state));
    return true;
  }

  /**
   * Tua tiến lại câu thoại kế tiếp (Roll-forward)
   */
  public rollforward(): boolean {
    const snapshot = this.ringBuffer.rollforward();
    if (!snapshot) {
      return false;
    }

    this.state = JSON.parse(JSON.stringify(snapshot.state));
    return true;
  }

  /**
   * Kiểm tra khả năng Rollback
   */
  public canRollback(): boolean {
    return this.ringBuffer.canRollback();
  }

  /**
   * Kiểm tra khả năng Roll-forward
   */
  public canRollforward(): boolean {
    return this.ringBuffer.canRollforward();
  }

  /**
   * Lấy toàn bộ trạng thái hình ảnh, âm thanh và thoại hiện tại (State Catch-up cho Renderer)
   */
  public getStateCatchUp(): {
    background?: BackgroundInstruction;
    sprites: Map<string, ShowInstruction>;
    audio: Map<string, PlayInstruction>;
    currentDialogue?: DialogueInstruction;
  } {
    let background: BackgroundInstruction | undefined;
    const sprites = new Map<string, ShowInstruction>();
    const audio = new Map<string, PlayInstruction>();
    let currentDialogue: DialogueInstruction | undefined;

    // Quét từ đầu chương trình tới con trỏ lệnh hiện tại
    for (let i = 0; i < this.state.instructionPointer; i++) {
      const instr = this.program[i]!;
      if (instr.type === 'BACKGROUND') {
        background = instr;
      } else if (instr.type === 'SHOW') {
        sprites.set(instr.character, instr);
      } else if (instr.type === 'HIDE') {
        sprites.delete(instr.character);
      } else if (instr.type === 'PLAY') {
        audio.set(instr.channel, instr);
      } else if (instr.type === 'STOP') {
        audio.delete(instr.channel);
      } else if (instr.type === 'DIALOGUE') {
        currentDialogue = instr;
      }
    }

    if (currentDialogue) {
      const evalContext = this.getEvalContext();
      currentDialogue = {
        ...currentDialogue,
        text: interpolate(currentDialogue.text, evalContext, this.evaluator),
        displayNameOverride: currentDialogue.displayNameOverride
          ? interpolate(currentDialogue.displayNameOverride, evalContext, this.evaluator)
          : undefined,
      };
    }

    return { background, sprites, audio, currentDialogue };
  }

  /**
   * Serialize trạng thái máy ảo thành chuỗi JSON thuần túy theo cấu trúc SaveFileData (Save Game - TAD 4.4)
   */
  public serialize(dslVersion?: string): string {
    const saveData: SaveFileData = {
      version: CURRENT_SAVE_VERSION,
      dslVersion: dslVersion ?? '1.0.0',
      timestamp: Date.now(),
      state: this.state,
      dialogueCounter: this.dialogueCounter,
    };
    return JSON.stringify(saveData);
  }

  /**
   * Khôi phục trạng thái máy ảo từ chuỗi JSON (Load Game - TAD 4.4)
   * Tự động kiểm tra schema VMState và migrate save file nếu khác phiên bản
   */
  public restore(json: string): void {
    try {
      let data: unknown;
      try {
        data = JSON.parse(json);
      } catch (parseErr) {
        throw new InvalidSaveDataError(
          `Malformed JSON string: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        );
      }

      if (!data || typeof data !== 'object') {
        throw new InvalidSaveDataError('missing state.');
      }

      const saveData = migrateSaveData(data, CURRENT_SAVE_VERSION);
      validateVMState(saveData.state);

      this.state = saveData.state;
      this.dialogueCounter = saveData.dialogueCounter ?? 0;
      this.ringBuffer.clear();
    } catch (err: unknown) {
      if (err instanceof VMRuntimeError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new VMRuntimeError(`Failed to load save game: ${msg}`);
    }
  }

  /**
   * Lấy bản sao trạng thái VMState hiện tại
   */
  public getState(): Readonly<VMState> {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Lấy evaluator để phục vụ mở rộng hàm ngoài
   */
  public getEvaluator(): SandboxEvaluator {
    return this.evaluator;
  }
}
