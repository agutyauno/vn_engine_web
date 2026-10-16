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
  AssignInstruction,
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
  emptyCallStackBehavior?: 'throw' | 'halt';
}

export interface RunResult {
  stepResult: StepResult;
  sideEffects: Instruction[];
}

/**
 * Kết quả khôi phục trạng thái Save Game (TAD 4.4 / Bug 3.3)
 */
export interface RestoreResult {
  desyncWarning: boolean;
  savedHash?: string;
  currentHash?: string;
}

/**
 * Tính mã băm FNV-1a 32-bit cho mảng chỉ lệnh bytecode program.
 * Đảm bảo tính tất định (deterministic), không phụ thuộc môi trường.
 */
export function computeScriptHash(program: readonly unknown[]): string {
  const str = JSON.stringify(program);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class VisualNovelVM {
  private program: Instruction[];
  private state: VMState;
  private evaluator: SandboxEvaluator;
  private ringBuffer: SnapshotRingBuffer;
  private dialogueCounter = 0;
  private sceneIndexMap: Map<string, number> = new Map();
  private dialogueKeyMap: Map<number, string> = new Map();
  private maxInstructionBudget: number;
  private emptyCallStackBehavior: 'throw' | 'halt';
  private preambleExecuted = false;
  private cachedScriptHash: string | null = null;
  private initialVariables: Record<string, string | number | boolean>;

  constructor(program: Instruction[], initialState?: Partial<VMState>, options?: VMOptions) {
    this.program = program;
    this.maxInstructionBudget = options?.maxInstructionBudget ?? 100000;
    this.ringBuffer = new SnapshotRingBuffer(options?.ringBufferCapacity ?? 50);
    this.evaluator = new SandboxEvaluator(options?.customFunctions);
    this.emptyCallStackBehavior = options?.emptyCallStackBehavior ?? 'throw';
    this.initialVariables = { ...(options?.initialVariables ?? {}) };

    // Khởi tạo trạng thái mặc định
    this.state = {
      currentScene: initialState?.currentScene ?? '',
      instructionPointer: initialState?.instructionPointer ?? 0,
      callStack: initialState?.callStack ? [...initialState.callStack] : [],
      variables: {
        ...this.initialVariables,
        ...(initialState?.variables ?? {}),
      },
      localVariables: { ...(initialState?.localVariables ?? {}) },
      characterDisplayOverrides: { ...(initialState?.characterDisplayOverrides ?? {}) },
      customScriptState: { ...(initialState?.customScriptState ?? {}) },
      activeInspect: initialState?.activeInspect ?? null,
      activeBackground: initialState?.activeBackground,
      activeSprites: { ...(initialState?.activeSprites ?? {}) },
      activeAudio: { ...(initialState?.activeAudio ?? {}) },
      currentDialogue: initialState?.currentDialogue,
    };

    // Lập bản đồ chỉ mục Scene để nhảy O(1) và sinh khóa định danh câu thoại
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
   * Lập chỉ mục vị trí các lệnh SCENE trong Bytecode và ánh xạ khóa câu thoại (Read Text Tracking)
   */
  private buildSceneIndexMap(): void {
    this.sceneIndexMap.clear();
    this.dialogueKeyMap.clear();
    let currentScene = '';
    let sceneDialogueCount = 0;

    for (let i = 0; i < this.program.length; i++) {
      const instr = this.program[i]!;
      if (instr.type === 'SCENE') {
        currentScene = instr.name;
        sceneDialogueCount = 0;
        this.sceneIndexMap.set(instr.name, i);
      } else if (instr.type === 'LABEL') {
        this.sceneIndexMap.set(instr.name, i);
      } else if (instr.type === 'DIALOGUE') {
        const key = `${currentScene || 'global'}#${sceneDialogueCount}:${instr.character ?? ''}:${instr.text}`;
        this.dialogueKeyMap.set(i, key);
        sceneDialogueCount++;
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
   * Thực thi các lệnh ASSIGN toàn cục ở phần đầu chương trình (Preamble)
   */
  public executePreamble(): void {
    if (this.preambleExecuted) return;
    this.preambleExecuted = true;

    let i = 0;
    while (i < this.program.length) {
      const instr = this.program[i]!;
      if (instr.type === 'SCENE') {
        break;
      }
      if (instr.type === 'ASSIGN' && instr.scope === 'global') {
        const assign = instr as AssignInstruction;
        const evalVal = this.evaluator.evaluate(assign.value, this.getEvalContext());
        if (evalVal !== null) {
          this.state.variables[assign.variable] = evalVal;
        }
      }
      i++;
    }
  }

  /**
   * Quét và nạp trạng thái hiển thị tích lũy tới điểm nhảy (cho Run from Line / Scene khi VM mới)
   */
  private seedCatchUpStateUpTo(targetIndex: number): void {
    for (let i = 0; i < targetIndex; i++) {
      const instr = this.program[i]!;
      if (instr.type === 'BACKGROUND') {
        this.state.activeBackground = instr;
      } else if (instr.type === 'SHOW') {
        if (!this.state.activeSprites) this.state.activeSprites = {};
        this.state.activeSprites[instr.character] = instr;
      } else if (instr.type === 'HIDE') {
        if (this.state.activeSprites) {
          delete this.state.activeSprites[instr.character];
        }
      } else if (instr.type === 'PLAY') {
        const isPersistent =
          instr.loop === true || instr.channel === 'music' || instr.channel === 'ambience';
        if (isPersistent) {
          if (!this.state.activeAudio) this.state.activeAudio = {};
          this.state.activeAudio[instr.channel] = instr;
        } else if (this.state.activeAudio && this.state.activeAudio[instr.channel]) {
          delete this.state.activeAudio[instr.channel];
        }
      } else if (instr.type === 'STOP') {
        if (this.state.activeAudio) {
          delete this.state.activeAudio[instr.channel];
        }
      } else if (instr.type === 'DIALOGUE') {
        this.state.currentDialogue = instr;
      } else if (instr.type === 'HIDE_DIALOGUE') {
        this.state.currentDialogue = undefined;
      } else if (instr.type === 'INSPECT_BEGIN') {
        this.state.activeInspect = { assetId: instr.assetId, title: instr.title };
      } else if (instr.type === 'INSPECT_END') {
        this.state.activeInspect = null;
      }
    }
  }

  /**
   * Nhảy con trỏ lệnh nội bộ (không kích hoạt lại Preamble hay ghi đè state catch-up)
   */
  private jumpTo(targetIndex: number, sceneName?: string): void {
    this.state.instructionPointer = targetIndex;
    if (sceneName) {
      this.state.currentScene = sceneName;
    } else if (targetIndex < this.program.length) {
      const instr = this.program[targetIndex]!;
      if (instr.type === 'SCENE') {
        this.state.currentScene = instr.name;
      }
    }
  }

  /**
   * Lưu snapshot tại điểm dừng CHOICE để khi người chơi bấm Rollback sẽ đóng menu choice
   * và quay về câu thoại trước đó thay vì bị lùi 2 câu.
   */
  private captureChoiceSnapshot(): void {
    const lastSnapshot = this.ringBuffer.peek();
    if (
      !lastSnapshot ||
      lastSnapshot.interactionType !== 'CHOICE' ||
      lastSnapshot.state.instructionPointer !== this.state.instructionPointer
    ) {
      const snapshot: VMSnapshot = {
        timestamp: Date.now(),
        dialogueIndex: this.dialogueCounter,
        state: JSON.parse(JSON.stringify(this.state)),
        interactionType: 'CHOICE',
      };
      this.ringBuffer.push(snapshot);
    }
  }

  /**
   * Khởi động máy ảo tại một vị trí xác định (dùng cho Player hoặc Editor "Run this scene / line")
   */
  public startAt(target: { scene?: string; line?: number; fileId?: string }): boolean {
    this.executePreamble();
    if (target.scene) {
      this.jumpToScene(target.scene, { seedCatchUp: true });
      return true;
    }
    if (target.line !== undefined) {
      return this.jumpToLine(target.line, target.fileId, { seedCatchUp: true });
    }
    return false;
  }

  /**
   * Nhảy con trỏ lệnh tới scene mục tiêu (Public API)
   */
  public jumpToScene(targetScene: string, options?: { seedCatchUp?: boolean }): void {
    this.executePreamble();
    const targetIndex = this.resolveSceneIndex(targetScene);
    if (options?.seedCatchUp) {
      this.seedCatchUpStateUpTo(targetIndex);
    }
    this.jumpTo(targetIndex);
    const sceneInstr = this.program[targetIndex]!;
    if (sceneInstr && sceneInstr.type === 'SCENE') {
      this.state.currentScene = sceneInstr.name;
    }
  }

  /**
   * Nhảy con trỏ lệnh tới câu lệnh gần nhất tương ứng với dòng kịch bản trong file
   */
  public jumpToLine(line: number, fileId?: string, options?: { seedCatchUp?: boolean }): boolean {
    let targetIndex = -1;
    let minDiff = Infinity;

    for (let i = 0; i < this.program.length; i++) {
      const instr = this.program[i]!;
      if (!instr.loc) continue;
      if (fileId && instr.loc.fileId && instr.loc.fileId !== fileId) continue;

      if (instr.loc.line >= line) {
        const diff = instr.loc.line - line;
        if (diff < minDiff) {
          minDiff = diff;
          targetIndex = i;
          if (diff === 0) break;
        }
      }
    }

    if (targetIndex !== -1) {
      this.executePreamble();
      if (options?.seedCatchUp) {
        this.seedCatchUpStateUpTo(targetIndex);
      }
      this.jumpTo(targetIndex);
      // Cập nhật currentScene tương ứng
      for (let i = targetIndex; i >= 0; i--) {
        const instr = this.program[i]!;
        if (instr.type === 'SCENE') {
          this.state.currentScene = instr.name;
          break;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Thực thi duy nhất 1 instruction tại instructionPointer
   */
  public step(): StepResult {
    if (!this.preambleExecuted) {
      this.executePreamble();
    }

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
        this.state.currentDialogue = instr;

        // Lưu snapshot phục vụ Rollback ngay tại điểm bắt đầu câu thoại
        const snapshot: VMSnapshot = {
          timestamp: Date.now(),
          dialogueIndex: this.dialogueCounter,
          state: JSON.parse(JSON.stringify(this.state)),
          interactionType: 'DIALOGUE',
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

      case 'BACKGROUND': {
        this.state.activeBackground = instr;
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'SHOW': {
        if (!this.state.activeSprites) this.state.activeSprites = {};
        this.state.activeSprites[instr.character] = instr;
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'HIDE': {
        if (this.state.activeSprites) {
          delete this.state.activeSprites[instr.character];
        }
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'HIDE_DIALOGUE': {
        this.state.currentDialogue = undefined;
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'PLAY': {
        const isPersistent =
          instr.loop === true || instr.channel === 'music' || instr.channel === 'ambience';
        if (isPersistent) {
          if (!this.state.activeAudio) this.state.activeAudio = {};
          this.state.activeAudio[instr.channel] = instr;
        } else if (this.state.activeAudio && this.state.activeAudio[instr.channel]) {
          delete this.state.activeAudio[instr.channel];
        }
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'STOP': {
        if (this.state.activeAudio) {
          delete this.state.activeAudio[instr.channel];
        }
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'RUN_SCRIPT':
      case 'SPAWN_SCRIPT': {
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'INSPECT_BEGIN': {
        const evalContext = this.getEvalContext();
        const interpolatedTitle = instr.title
          ? interpolate(instr.title, evalContext, this.evaluator)
          : undefined;
        this.state.activeInspect = {
          assetId: instr.assetId,
          title: interpolatedTitle,
        };
        this.state.instructionPointer++;
        return {
          type: 'SIDE_EFFECT',
          instruction: {
            ...instr,
            title: interpolatedTitle,
          },
        };
      }

      case 'INSPECT_END': {
        this.state.activeInspect = null;
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
        const targetIndex = this.resolveSceneIndex(instr.targetScene);
        this.jumpTo(targetIndex);
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'CONDITIONAL_GOTO': {
        const conditionResult = this.evaluator.evaluate(instr.condition, this.getEvalContext());
        if (conditionResult) {
          const targetIndex = this.resolveSceneIndex(instr.targetScene);
          this.jumpTo(targetIndex);
        } else {
          this.state.instructionPointer++;
        }
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'LOOP_START': {
        const conditionResult = this.evaluator.evaluate(instr.condition, this.getEvalContext());
        if (!conditionResult) {
          // Thoát khỏi vòng lặp: nhảy tới loopEndTargetScene
          const targetIndex = this.resolveSceneIndex(instr.loopEndTargetScene);
          this.jumpTo(targetIndex);
        } else {
          // Tiếp tục vào thân vòng lặp
          this.state.instructionPointer++;
        }
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'LOOP_END': {
        // Quay ngược lại điểm kiểm tra điều kiện của vòng lặp
        const targetIndex = this.resolveSceneIndex(instr.loopStartTargetScene);
        this.jumpTo(targetIndex);
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'CALL': {
        // Lưu frame quay lại vào callStack kèm biến local của caller
        this.state.callStack.push({
          scene: this.state.currentScene,
          targetScene: instr.targetScene,
          ip: this.state.instructionPointer + 1,
          savedLocalVariables: { ...this.state.localVariables },
        });
        const targetIndex = this.resolveSceneIndex(instr.targetScene);
        this.jumpTo(targetIndex);
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'RETURN': {
        if (this.state.callStack.length === 0) {
          if (this.emptyCallStackBehavior === 'halt') {
            console.warn(
              `[VN Engine Warning] Script executed 'return' while call stack is empty. Game halted safely.`,
            );
            this.state.instructionPointer = this.program.length;
            return { type: 'HALTED' };
          }
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
        const topFrame = this.state.callStack[this.state.callStack.length - 1];
        if (topFrame && topFrame.targetScene === instr.sceneName) {
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
        this.captureChoiceSnapshot();
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
        this.captureChoiceSnapshot();
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

    if (choice.action === 'call') {
      this.state.callStack.push({
        scene: this.state.currentScene,
        ip: this.state.instructionPointer + 1,
        savedLocalVariables: { ...this.state.localVariables },
      });
    }

    // Chuyển hướng con trỏ sang targetScene của lựa chọn
    const targetIndex = this.resolveSceneIndex(choice.targetScene);
    this.jumpTo(targetIndex);
  }

  /**
   * Lấy danh sách lựa chọn hợp lệ của hộp thoại CHOICE hiện tại
   */
  public getAvailableChoices(): Array<{
    text: string;
    targetScene: string;
    action?: 'goto' | 'call';
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
        action: c.action ?? 'goto',
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
    activeInspect?: { assetId: string; title?: string } | null;
  } {
    const background = this.state.activeBackground;
    const sprites = new Map<string, ShowInstruction>(
      Object.entries(this.state.activeSprites || {}),
    );
    const audio = new Map<string, PlayInstruction>(Object.entries(this.state.activeAudio || {}));
    let currentDialogue = this.state.currentDialogue;
    let activeInspect = this.state.activeInspect ?? null;

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

    if (activeInspect && activeInspect.title) {
      const evalContext = this.getEvalContext();
      activeInspect = {
        ...activeInspect,
        title: interpolate(activeInspect.title, evalContext, this.evaluator),
      };
    }

    return { background, sprites, audio, currentDialogue, activeInspect };
  }

  /**
   * Lấy mã băm bytecode của kịch bản hiện tại (TAD 4.4 / Bug 3.3)
   */
  public getScriptHash(): string {
    if (!this.cachedScriptHash) {
      this.cachedScriptHash = computeScriptHash(this.program);
    }
    return this.cachedScriptHash;
  }

  /**
   * Lấy mã định danh độc nhất của câu thoại hiện tại phục vụ theo dõi câu đã đọc (Read Text Tracking)
   */
  public getCurrentDialogueKey(): string | null {
    if (this.state.instructionPointer <= 0 || this.state.instructionPointer > this.program.length) {
      return null;
    }
    const idx = this.state.instructionPointer - 1;
    const instr = this.program[idx];
    if (!instr || instr.type !== 'DIALOGUE') {
      return null;
    }
    return this.dialogueKeyMap.get(idx) ?? null;
  }

  /**
   * Lấy mã định danh độc nhất của một câu thoại theo chỉ số instruction trong chương trình
   */
  public getDialogueKey(instructionIndex: number): string | null {
    return this.dialogueKeyMap.get(instructionIndex) ?? null;
  }

  /**
   * Serialize trạng thái máy ảo thành chuỗi JSON thuần túy theo cấu trúc SaveFileData (Save Game - TAD 4.4)
   */
  public serialize(
    options?: string | { dslVersion?: string; projectId?: string; scriptHash?: string },
  ): string {
    const meta = typeof options === 'string' ? { dslVersion: options } : (options ?? {});

    let sceneOffset = 0;
    const sceneIdx = this.program.findIndex(
      i => i.type === 'SCENE' && i.name === this.state.currentScene,
    );
    if (sceneIdx !== -1 && this.state.instructionPointer >= sceneIdx) {
      sceneOffset = this.state.instructionPointer - sceneIdx;
    }

    const scriptHash = meta.scriptHash ?? this.getScriptHash();

    const saveData: SaveFileData = {
      version: CURRENT_SAVE_VERSION,
      projectId: meta.projectId,
      scriptHash,
      sceneOffset,
      dslVersion: meta.dslVersion ?? '1.0.0',
      timestamp: Date.now(),
      state: this.state,
      dialogueCounter: this.dialogueCounter,
    };
    return JSON.stringify(saveData);
  }

  /**
   * Khôi phục trạng thái máy ảo từ chuỗi JSON (Load Game - TAD 4.4)
   * Tự động kiểm tra schema VMState, migrate save file, cảnh báo desync và neo lại an toàn theo sceneOffset
   */
  public restore(json: string): RestoreResult {
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

      let desyncWarning = false;
      const currentHash = this.getScriptHash();
      if (saveData.scriptHash && saveData.scriptHash !== currentHash) {
        desyncWarning = true;
        console.warn(
          `[VN Engine Warning] Script hash mismatch during restore (saved: ${saveData.scriptHash}, current: ${currentHash}). Save state may desync.`,
        );
      }

      this.state = {
        ...saveData.state,
        variables: {
          ...this.initialVariables,
          ...saveData.state.variables,
        },
        activeSprites: saveData.state.activeSprites ? { ...saveData.state.activeSprites } : {},
        activeAudio: saveData.state.activeAudio ? { ...saveData.state.activeAudio } : {},
      };

      // Tái neo con trỏ IP theo sceneOffset nếu kịch bản bị sửa đổi làm lệch IP tuyệt đối
      if (
        this.program.length > 0 &&
        saveData.sceneOffset !== undefined &&
        saveData.state.currentScene
      ) {
        const sceneIdx = this.program.findIndex(
          i => i.type === 'SCENE' && i.name === saveData.state.currentScene,
        );
        if (sceneIdx !== -1) {
          const expectedIP = sceneIdx + saveData.sceneOffset;
          const nextSceneIdx = this.program.findIndex(
            (instr, idx) => idx > sceneIdx && instr.type === 'SCENE',
          );
          const maxIP = nextSceneIdx !== -1 ? nextSceneIdx : this.program.length;
          this.state.instructionPointer = Math.min(Math.max(expectedIP, sceneIdx), maxIP);
        }
      }

      this.dialogueCounter = saveData.dialogueCounter ?? 0;
      this.ringBuffer.clear();
      this.preambleExecuted = true;

      return {
        desyncWarning,
        savedHash: saveData.scriptHash,
        currentHash,
      };
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
   * Can thiệp / ghi đè giá trị biến runtime phục vụ Live Debugging (ADR-024)
   * @param name Tên biến cần thay đổi
   * @param value Giá trị mới (chuỗi, số hoặc boolean)
   * @param scope Phạm vi biến: 'global' | 'local'. Mặc định: tự suy luận ('local' nếu biến đang có trong localVariables, ngược lại là 'global')
   */
  public setVariable(
    name: string,
    value: string | number | boolean,
    scope?: 'global' | 'local',
  ): void {
    if (scope === 'local') {
      this.state.localVariables[name] = value;
    } else if (scope === 'global') {
      this.state.variables[name] = value;
    } else {
      if (name in this.state.localVariables) {
        this.state.localVariables[name] = value;
      } else {
        this.state.variables[name] = value;
      }
    }
  }

  /**
   * Lấy evaluator để phục vụ mở rộng hàm ngoài
   */
  public getEvaluator(): SandboxEvaluator {
    return this.evaluator;
  }
}

