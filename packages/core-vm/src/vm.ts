// ==========================================
// MÁY ẢO VISUAL NOVEL (VISUAL NOVEL VM CORE)
// ==========================================

import type {
  Instruction,
  VMState,
  StepResult,
  VMSnapshot,
  DialogueInstruction,
  BackgroundInstruction,
  ShowInstruction,
  PlayInstruction,
} from '@vn-engine/shared-types';
import { SandboxEvaluator, type AllowedFunction } from './evaluator';
import { SnapshotRingBuffer } from './ring_buffer';
import {
  InstructionBudgetExceededError,
  InvalidChoiceError,
  SceneNotFoundError,
  EmptyCallStackError,
} from './errors';

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
      if (instr.type === 'SCENE') {
        this.sceneIndexMap.set(instr.name, i);
      }
    }
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

    // 3. Tìm scene có đuôi trùng
    for (const [name, index] of this.sceneIndexMap.entries()) {
      if (name.endsWith(`.${targetScene}`) || name === targetScene) {
        return index;
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

        return {
          type: 'SUSPEND_DIALOGUE',
          instruction: instr,
        };
      }

      case 'REVEAL': {
        this.state.characterDisplayOverrides[instr.characterId] = instr.displayName;
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
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
        const evalVal = this.evaluator.evaluate(instr.value, this.state.variables);
        if (evalVal !== null) {
          this.state.variables[instr.variable] = evalVal;
        }
        this.state.instructionPointer++;
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'GOTO': {
        this.jumpToScene(instr.targetScene);
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'CONDITIONAL_GOTO': {
        const conditionResult = this.evaluator.evaluate(instr.condition, this.state.variables);
        if (conditionResult) {
          this.jumpToScene(instr.targetScene);
        } else {
          this.state.instructionPointer++;
        }
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'LOOP_START': {
        const conditionResult = this.evaluator.evaluate(instr.condition, this.state.variables);
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
        // Lưu frame quay lại vào callStack
        this.state.callStack.push({
          scene: this.state.currentScene,
          ip: this.state.instructionPointer + 1,
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
        return { type: 'SIDE_EFFECT', instruction: instr };
      }

      case 'CHOICE': {
        // Tạm dừng máy ảo tại hộp thoại lựa chọn, không tự động tăng instructionPointer
        return {
          type: 'SUSPEND_CHOICE',
          instruction: instr,
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
        return {
          stepResult: { type: 'SUSPEND_CHOICE', instruction: currentInstr },
          sideEffects,
        };
      }

      const result = this.step();
      steps++;

      if (result.type === 'SUSPEND_DIALOGUE' || result.type === 'SUSPEND_CHOICE') {
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
      throw new InvalidChoiceError('Không thể lựa chọn vì chương trình kịch bản đã kết thúc.');
    }

    const currentInstr = this.program[this.state.instructionPointer]!;
    if (currentInstr.type !== 'CHOICE') {
      throw new InvalidChoiceError(
        `Lệnh hiện tại không phải là CHOICE (nhận được: ${currentInstr.type}).`,
      );
    }

    const choice = currentInstr.choices[choiceIndex];
    if (!choice) {
      throw new InvalidChoiceError(
        `Chỉ mục lựa chọn #${choiceIndex} không tồn tại (tổng số: ${currentInstr.choices.length}).`,
      );
    }

    // Kiểm tra điều kiện (nếu có)
    if (choice.condition) {
      const allowed = this.evaluator.evaluate(choice.condition, this.state.variables);
      if (!allowed) {
        throw new InvalidChoiceError(`Lựa chọn "${choice.text}" có điều kiện không được thỏa mãn.`);
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
        enabled = !!this.evaluator.evaluate(c.condition, this.state.variables);
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

    return { background, sprites, audio, currentDialogue };
  }

  /**
   * Serialize trạng thái máy ảo thành chuỗi JSON thuần túy (Save Game)
   */
  public serialize(): string {
    return JSON.stringify({
      state: this.state,
      dialogueCounter: this.dialogueCounter,
    });
  }

  /**
   * Khôi phục trạng thái máy ảo từ chuỗi JSON (Load Game)
   */
  public restore(json: string): void {
    const data = JSON.parse(json);
    this.state = data.state;
    this.dialogueCounter = data.dialogueCounter ?? 0;
    this.ringBuffer.clear();
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
