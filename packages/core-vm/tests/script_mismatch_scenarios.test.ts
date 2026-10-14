import { describe, it, expect, vi } from 'vitest';
import { VisualNovelVM, computeScriptHash } from '../src/vm';
import { SceneNotFoundError, VariableNotFoundError } from '../src/errors';
import type {
  Instruction,
  SaveFileData,
  DialogueInstruction,
  ChoiceInstruction,
} from '@vn-engine/shared-types';

describe('ScriptHash Mismatch & Desync Scenarios (Comprehensive Test Suite)', () => {
  // =========================================================================
  // KỊCH BẢN 1: Sửa 1 câu thoại (Edit 1 dialogue)
  // =========================================================================
  describe('Kịch bản 1: Sửa 1 câu thoại', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào buổi sáng!' },
      { type: 'DIALOGUE', character: 'alice', text: 'Hôm nay trời đẹp quá.' },
    ];

    const modifiedProgram: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào buổi sáng bạn hiền!' }, // Sửa câu thoại 1
      { type: 'DIALOGUE', character: 'alice', text: 'Hôm nay trời đẹp quá.' },
    ];

    it('phát hiện mismatch scriptHash và cảnh báo desyncWarning: true', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const vmOriginal = new VisualNovelVM(originalProgram);
      vmOriginal.runUntilInteractive(); // Dừng tại câu thoại 1 (IP = 2, chuẩn bị sang câu 2)
      const saveJson = vmOriginal.serialize({ projectId: 'test_proj' });

      const hashOrig = computeScriptHash(originalProgram);
      const hashMod = computeScriptHash(modifiedProgram);
      expect(hashOrig).not.toBe(hashMod);

      const vmModified = new VisualNovelVM(modifiedProgram);
      const restoreResult = vmModified.restore(saveJson);

      expect(restoreResult.desyncWarning).toBe(true);
      expect(restoreResult.savedHash).toBe(hashOrig);
      expect(restoreResult.currentHash).toBe(hashMod);

      // Nếu tiếp tục nạp theo IP: con trỏ đã đọc xong câu 1, bước tiếp theo chạy ra câu 2
      const stepRes = vmModified.step();
      expect(stepRes.type).toBe('SUSPEND_DIALOGUE');
      if (stepRes.type === 'SUSPEND_DIALOGUE') {
        expect((stepRes.instruction as DialogueInstruction).text).toBe('Hôm nay trời đẹp quá.');
      }

      // Nếu người chơi chọn "Về đầu cảnh": chạy lại từ đầu câu thoại đã sửa
      vmModified.startAt({ scene: 'intro' });
      const restartRes = vmModified.runUntilInteractive();
      expect(restartRes.stepResult.type).toBe('SUSPEND_DIALOGUE');
      if (restartRes.stepResult.type === 'SUSPEND_DIALOGUE') {
        expect((restartRes.stepResult.instruction as DialogueInstruction).text).toBe(
          'Chào buổi sáng bạn hiền!',
        );
      }

      consoleWarnSpy.mockRestore();
    });
  });

  // =========================================================================
  // KỊCH BẢN 2: Chèn dòng ở trước scene đang save (Prepend scenes/lines before save point)
  // =========================================================================
  describe('Kịch bản 2: Chèn dòng ở trước scene đang save', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'chapter1' }, // index 0
      { type: 'DIALOGUE', character: 'alice', text: 'Câu thoại Ch1-A' }, // index 1
      { type: 'DIALOGUE', character: 'alice', text: 'Câu thoại Ch1-B' }, // index 2
    ];

    const modifiedProgram: Instruction[] = [
      // Chèn thêm 1 scene mở đầu phía trước
      { type: 'SCENE', name: 'prologue' }, // index 0
      { type: 'DIALOGUE', character: 'narrator', text: 'Lời dẫn mở đầu 1' }, // index 1
      { type: 'DIALOGUE', character: 'narrator', text: 'Lời dẫn mở đầu 2' }, // index 2
      { type: 'SCENE', name: 'chapter1' }, // index 3 (dịch chuyển từ 0 -> 3)
      { type: 'DIALOGUE', character: 'alice', text: 'Câu thoại Ch1-A' }, // index 4
      { type: 'DIALOGUE', character: 'alice', text: 'Câu thoại Ch1-B' }, // index 5
    ];

    it('tự động re-anchor con trỏ IP theo sceneOffset, không nhảy nhầm vào scene mở đầu', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const vmOrig = new VisualNovelVM(originalProgram);
      vmOrig.runUntilInteractive(); // Dừng tại Ch1-A, IP = 2, sceneOffset = 2
      const saveJson = vmOrig.serialize({ projectId: 'test_proj' });

      const parsed: SaveFileData = JSON.parse(saveJson);
      expect(parsed.sceneOffset).toBe(2);
      expect(parsed.state.currentScene).toBe('chapter1');

      const vmMod = new VisualNovelVM(modifiedProgram);
      const restoreResult = vmMod.restore(saveJson);

      expect(restoreResult.desyncWarning).toBe(true);
      // chapter1 ở index 3 + sceneOffset 2 = index 5
      expect(vmMod.getState().currentScene).toBe('chapter1');
      expect(vmMod.getState().instructionPointer).toBe(5);

      // Bước tiếp theo thực thi câu thoại Ch1-B, không phải câu trong prologue
      const stepRes = vmMod.step();
      expect(stepRes.type).toBe('SUSPEND_DIALOGUE');
      if (stepRes.type === 'SUSPEND_DIALOGUE') {
        expect((stepRes.instruction as DialogueInstruction).text).toBe('Câu thoại Ch1-B');
      }

      consoleWarnSpy.mockRestore();
    });
  });

  // =========================================================================
  // KỊCH BẢN 3: Chèn dòng trong cùng scene, trước điểm save (Insert lines in same scene)
  // =========================================================================
  describe('Kịch bản 3: Chèn dòng trong cùng scene, trước điểm save', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'main' }, // idx 0
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 1' }, // idx 1
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 2' }, // idx 2 (save tại đây)
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 3' }, // idx 3
    ];

    const modifiedProgram: Instruction[] = [
      { type: 'SCENE', name: 'main' }, // idx 0
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 1' }, // idx 1
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 1.5 mới chèn' }, // idx 2 (CHÈN MỚI)
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 2' }, // idx 3
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 3' }, // idx 4
    ];

    it('phát hiện lệch dòng khi nạp tiếp tục vs giải pháp cứu hộ "Về đầu cảnh"', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const vmOrig = new VisualNovelVM(originalProgram);
      vmOrig.step(); // Qua SCENE (IP=1)
      vmOrig.step(); // Dòng 1 (IP=2)
      vmOrig.step(); // Dòng 2 (IP=3, sceneOffset = 3)
      const saveJson = vmOrig.serialize({ projectId: 'test_proj' });

      const vmMod = new VisualNovelVM(modifiedProgram);
      const restoreResult = vmMod.restore(saveJson);

      expect(restoreResult.desyncWarning).toBe(true);
      // Do sceneOffset = 3, trong kịch bản mới vị trí 3 là Dòng 2 (bị lặp lại 1 câu do có dòng mới chèn phía trước)
      expect(vmMod.getState().instructionPointer).toBe(3);

      // Cứu hộ an toàn: "Về đầu cảnh" (startAt({ scene: 'main' }))
      vmMod.startAt({ scene: 'main' });
      // Người chơi đọc tuần tự đầy đủ từ đầu cảnh mà không bị sót câu mới chèn
      const s1 = vmMod.runUntilInteractive();
      expect(s1.stepResult.type).toBe('SUSPEND_DIALOGUE');
      if (s1.stepResult.type === 'SUSPEND_DIALOGUE') {
        expect((s1.stepResult.instruction as DialogueInstruction).text).toBe('Dòng 1');
      }

      const s2 = vmMod.step();
      expect(s2.type).toBe('SUSPEND_DIALOGUE');
      if (s2.type === 'SUSPEND_DIALOGUE') {
        expect((s2.instruction as DialogueInstruction).text).toBe('Dòng 1.5 mới chèn');
      }

      const s3 = vmMod.step();
      expect(s3.type).toBe('SUSPEND_DIALOGUE');
      if (s3.type === 'SUSPEND_DIALOGUE') {
        expect((s3.instruction as DialogueInstruction).text).toBe('Dòng 2');
      }

      consoleWarnSpy.mockRestore();
    });
  });

  // =========================================================================
  // KỊCH BẢN 4: Xoá dòng trong cùng scene, trước điểm save (Delete lines in same scene)
  // =========================================================================
  describe('Kịch bản 4: Xoá dòng trong cùng scene, trước điểm save', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'main' }, // idx 0
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 1' }, // idx 1
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 2 (bị xóa ở bản mới)' }, // idx 2
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 3' }, // idx 3
      { type: 'HALT' }, // idx 4
    ];

    const modifiedProgram: Instruction[] = [
      { type: 'SCENE', name: 'main' }, // idx 0
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 1' }, // idx 1
      { type: 'DIALOGUE', character: 'alice', text: 'Dòng 3' }, // idx 2 (Dòng 2 đã xóa)
      { type: 'HALT' }, // idx 3
    ];

    it('giới hạn con trỏ IP bằng clamping không vượt quá ranh giới scene và hỗ trợ về đầu cảnh', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const vmOrig = new VisualNovelVM(originalProgram);
      vmOrig.step(); // SCENE (IP=1)
      vmOrig.step(); // Dòng 1 (IP=2)
      vmOrig.step(); // Dòng 2 (IP=3)
      vmOrig.step(); // Dòng 3 (IP=4, sceneOffset = 4)
      const saveJson = vmOrig.serialize({ projectId: 'test_proj' });

      const vmMod = new VisualNovelVM(modifiedProgram);
      const restoreResult = vmMod.restore(saveJson);

      expect(restoreResult.desyncWarning).toBe(true);
      // Kịch bản mới chỉ có 4 lệnh (maxIP = 4), expectedIP = 0 + 4 = 4.
      // Clamping đảm bảo IP không bị vượt quá giới hạn chương trình
      expect(vmMod.getState().instructionPointer).toBeLessThanOrEqual(modifiedProgram.length);

      // Cứu hộ "Về đầu cảnh":
      vmMod.startAt({ scene: 'main' });
      const step1 = vmMod.runUntilInteractive();
      expect(step1.stepResult.type).toBe('SUSPEND_DIALOGUE');
      if (step1.stepResult.type === 'SUSPEND_DIALOGUE') {
        expect((step1.stepResult.instruction as DialogueInstruction).text).toBe('Dòng 1');
      }

      const step2 = vmMod.step();
      expect(step2.type).toBe('SUSPEND_DIALOGUE');
      if (step2.type === 'SUSPEND_DIALOGUE') {
        expect((step2.instruction as DialogueInstruction).text).toBe('Dòng 3');
      }

      consoleWarnSpy.mockRestore();
    });
  });

  // =========================================================================
  // KỊCH BẢN 5: Đổi tên scene đang save (Rename the saved scene)
  // =========================================================================
  describe('Kịch bản 5: Đổi tên scene đang save', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'dungeon_room_1' },
      { type: 'ASSIGN', variable: 'has_torch', value: { type: 'Literal', value: true } },
      { type: 'DIALOGUE', character: 'hero', text: 'Căn phòng tối om.' },
    ];

    const modifiedProgram: Instruction[] = [
      // Tác giả đổi tên scene từ dungeon_room_1 thành dungeon_boss_chamber
      { type: 'SCENE', name: 'dungeon_boss_chamber' },
      { type: 'ASSIGN', variable: 'has_torch', value: { type: 'Literal', value: true } },
      { type: 'DIALOGUE', character: 'hero', text: 'Căn phòng trùm nguy hiểm.' },
    ];

    it('giữ nguyên biến số đã lưu khi scene không còn tồn tại và cho phép chuyển hướng cứu hộ', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const vmOrig = new VisualNovelVM(originalProgram);
      vmOrig.runUntilInteractive(); // Chạy qua ASSIGN, dừng ở DIALOGUE
      expect(vmOrig.getState().variables['has_torch']).toBe(true);
      const saveJson = vmOrig.serialize({ projectId: 'test_proj' });

      const vmMod = new VisualNovelVM(modifiedProgram);
      const restoreResult = vmMod.restore(saveJson);

      expect(restoreResult.desyncWarning).toBe(true);
      // Biến số từ save file được khôi phục trọn vẹn
      expect(vmMod.getState().variables['has_torch']).toBe(true);

      // Cảnh cũ dungeon_room_1 không còn tồn tại -> startAt ném SceneNotFoundError
      expect(() => vmMod.startAt({ scene: 'dungeon_room_1' })).toThrow(SceneNotFoundError);

      // Player chuyển hướng người chơi an toàn vào scene mới với toàn bộ vật phẩm/biến cũ
      const startedNew = vmMod.startAt({ scene: 'dungeon_boss_chamber' });
      expect(startedNew).toBe(true);
      expect(vmMod.getState().currentScene).toBe('dungeon_boss_chamber');
      expect(vmMod.getState().variables['has_torch']).toBe(true);

      const stepNew = vmMod.runUntilInteractive();
      expect(stepNew.stepResult.type).toBe('SUSPEND_DIALOGUE');
      if (stepNew.stepResult.type === 'SUSPEND_DIALOGUE') {
        expect((stepNew.stepResult.instruction as DialogueInstruction).text).toBe(
          'Căn phòng trùm nguy hiểm.',
        );
      }

      consoleWarnSpy.mockRestore();
    });
  });

  // =========================================================================
  // KỊCH BẢN 6: Thêm biến mới và sử dụng trong thoại (New variable used in interpolation)
  // =========================================================================
  describe('Kịch bản 6: Thêm biến mới và sử dụng trong thoại', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'greeting' },
      { type: 'ASSIGN', variable: 'playerName', value: { type: 'Literal', value: 'Nam' } },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào {playerName}!' },
    ];

    const modifiedProgram: Instruction[] = [
      { type: 'SCENE', name: 'greeting' },
      { type: 'ASSIGN', variable: 'playerName', value: { type: 'Literal', value: 'Nam' } },
      { type: 'ASSIGN', variable: 'playerRank', value: { type: 'Literal', value: 'Đại Hiệp' } }, // Biến mới
      { type: 'DIALOGUE', character: 'alice', text: 'Chào {playerRank} {playerName}!' },
    ];

    it('nội suy an toàn khi biến mới chưa có trong save, và cập nhật đủ khi về đầu cảnh', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const vmOrig = new VisualNovelVM(originalProgram);
      vmOrig.runUntilInteractive();
      const saveJson = vmOrig.serialize({ projectId: 'test_proj' });

      const vmMod = new VisualNovelVM(modifiedProgram);
      const restoreResult = vmMod.restore(saveJson);

      expect(restoreResult.desyncWarning).toBe(true);
      // Biến mới playerRank chưa tồn tại trong save cũ
      expect(vmMod.getState().variables['playerRank']).toBeUndefined();
      expect(vmMod.getState().variables['playerName']).toBe('Nam');

      // Khi người chơi chọn "Về đầu cảnh":
      vmMod.startAt({ scene: 'greeting' });
      const runRes = vmMod.runUntilInteractive();

      expect(runRes.stepResult.type).toBe('SUSPEND_DIALOGUE');
      // Biến mới đã được gán giá trị
      expect(vmMod.getState().variables['playerRank']).toBe('Đại Hiệp');

      // State Catch-up nội suy chuỗi hiển thị đúng cả 2 biến
      const catchUp = vmMod.getStateCatchUp();
      expect(catchUp.currentDialogue?.text).toBe('Chào Đại Hiệp Nam!');

      consoleWarnSpy.mockRestore();
    });
  });

  // =========================================================================
  // KỊCH BẢN 7: Save khi đang trong CALL rồi sửa scene gọi (Save inside CALL, caller modified)
  // =========================================================================
  describe('Kịch bản 7: Save khi đang trong CALL rồi sửa scene gọi', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'caller' }, // idx 0
      { type: 'DIALOGUE', character: 'a', text: 'Caller 1' }, // idx 1
      { type: 'CALL', targetScene: 'callee' }, // idx 2
      { type: 'DIALOGUE', character: 'a', text: 'Caller sau khi return' }, // idx 3
      { type: 'HALT' }, // idx 4
      { type: 'SCENE', name: 'callee' }, // idx 5
      { type: 'DIALOGUE', character: 'b', text: 'Trong callee' }, // idx 6 (Save tại đây)
      { type: 'RETURN' }, // idx 7
    ];

    const modifiedProgram: Instruction[] = [
      { type: 'SCENE', name: 'caller' }, // idx 0
      { type: 'DIALOGUE', character: 'a', text: 'Caller 1' }, // idx 1
      { type: 'DIALOGUE', character: 'a', text: 'Caller 1.5 mới thêm' }, // idx 2 (Chèn thêm)
      { type: 'CALL', targetScene: 'callee' }, // idx 3
      { type: 'DIALOGUE', character: 'a', text: 'Caller sau khi return' }, // idx 4
      { type: 'HALT' }, // idx 5
      { type: 'SCENE', name: 'callee' }, // idx 6
      { type: 'DIALOGUE', character: 'b', text: 'Trong callee' }, // idx 7
      { type: 'RETURN' }, // idx 8
    ];

    it('báo desync khi save trong call stack và cho phép phục hồi về đầu cảnh con hoặc cảnh cha', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const vmOrig = new VisualNovelVM(originalProgram);
      vmOrig.step(); // SCENE caller (IP=1)
      vmOrig.step(); // Caller 1 (IP=2)
      vmOrig.step(); // CALL callee -> push callStack [{ scene: 'caller', ip: 3 }] -> jump callee (IP=6)
      vmOrig.step(); // Trong callee (IP=7, suspended)

      expect(vmOrig.getState().callStack.length).toBe(1);
      expect(vmOrig.getState().callStack[0]?.ip).toBe(3);

      const saveJson = vmOrig.serialize({ projectId: 'test_proj' });

      // Nạp vào kịch bản đã bị sửa caller
      const vmMod = new VisualNovelVM(modifiedProgram);
      const restoreResult = vmMod.restore(saveJson);

      expect(restoreResult.desyncWarning).toBe(true);

      // Phương án 1: Về đầu cảnh con callee
      vmMod.startAt({ scene: 'callee' });
      expect(vmMod.getState().currentScene).toBe('callee');
      const stepCallee = vmMod.runUntilInteractive();
      expect(stepCallee.stepResult.type).toBe('SUSPEND_DIALOGUE');
      if (stepCallee.stepResult.type === 'SUSPEND_DIALOGUE') {
        expect((stepCallee.stepResult.instruction as DialogueInstruction).text).toBe(
          'Trong callee',
        );
      }

      // Phương án 2: Về đầu cảnh cha caller để đảm bảo luồng call stack mới nhất
      vmMod.startAt({ scene: 'caller' });
      expect(vmMod.getState().currentScene).toBe('caller');
      const s1 = vmMod.runUntilInteractive();
      expect(s1.stepResult.type).toBe('SUSPEND_DIALOGUE');
      if (s1.stepResult.type === 'SUSPEND_DIALOGUE') {
        expect((s1.stepResult.instruction as DialogueInstruction).text).toBe('Caller 1');
      }

      const s2 = vmMod.step();
      expect(s2.type).toBe('SUSPEND_DIALOGUE');
      if (s2.type === 'SUSPEND_DIALOGUE') {
        expect((s2.instruction as DialogueInstruction).text).toBe('Caller 1.5 mới thêm');
      }

      consoleWarnSpy.mockRestore();
    });
  });

  // =========================================================================
  // KỊCH BẢN 8: Đổi thứ tự hoặc thêm lựa chọn khi đang ở CHOICE (Choice reorder/add)
  // =========================================================================
  describe('Kịch bản 8: Đổi thứ tự hoặc thêm lựa chọn khi đang ở CHOICE', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'crossroad' },
      {
        type: 'CHOICE',
        choices: [
          { text: 'Đường A', targetScene: 'scene_a' },
          { text: 'Đường B', targetScene: 'scene_b' },
        ],
      },
      { type: 'SCENE', name: 'scene_a' },
      { type: 'DIALOGUE', character: 'narrator', text: 'Đến nhánh A' },
      { type: 'SCENE', name: 'scene_b' },
      { type: 'DIALOGUE', character: 'narrator', text: 'Đến nhánh B' },
    ];

    const modifiedProgram: Instruction[] = [
      { type: 'SCENE', name: 'crossroad' },
      {
        type: 'CHOICE',
        choices: [
          { text: 'Đường Bí Mật (Mới)', targetScene: 'scene_secret' }, // Chèn vào index 0
          { text: 'Đường A', targetScene: 'scene_a' }, // index 1
          { text: 'Đường B', targetScene: 'scene_b' }, // index 2
        ],
      },
      { type: 'SCENE', name: 'scene_secret' },
      { type: 'DIALOGUE', character: 'narrator', text: 'Đến nhánh Bí Mật' },
      { type: 'SCENE', name: 'scene_a' },
      { type: 'DIALOGUE', character: 'narrator', text: 'Đến nhánh A' },
      { type: 'SCENE', name: 'scene_b' },
      { type: 'DIALOGUE', character: 'narrator', text: 'Đến nhánh B' },
    ];

    it('cảnh báo desync khi đang dừng ở CHOICE và đọc danh sách lựa chọn mới sau khi phục hồi', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const vmOrig = new VisualNovelVM(originalProgram);
      const res = vmOrig.runUntilInteractive();
      expect(res.stepResult.type).toBe('SUSPEND_CHOICE');
      const saveJson = vmOrig.serialize({ projectId: 'test_proj' });

      const vmMod = new VisualNovelVM(modifiedProgram);
      const restoreResult = vmMod.restore(saveJson);

      expect(restoreResult.desyncWarning).toBe(true);

      // Khởi động lại cảnh lựa chọn trên kịch bản mới
      vmMod.startAt({ scene: 'crossroad' });
      const newChoiceStep = vmMod.runUntilInteractive();
      expect(newChoiceStep.stepResult.type).toBe('SUSPEND_CHOICE');

      if (newChoiceStep.stepResult.type === 'SUSPEND_CHOICE') {
        const choiceInstr = newChoiceStep.stepResult.instruction as ChoiceInstruction;
        expect(choiceInstr.choices).toHaveLength(3);
        expect(choiceInstr.choices[0]?.text).toBe('Đường Bí Mật (Mới)');
      }

      // Người chơi chọn lựa chọn mới index 0
      vmMod.choose(0);
      const stepSecret = vmMod.runUntilInteractive();
      expect(stepSecret.stepResult.type).toBe('SUSPEND_DIALOGUE');
      if (stepSecret.stepResult.type === 'SUSPEND_DIALOGUE') {
        expect((stepSecret.stepResult.instruction as DialogueInstruction).text).toBe(
          'Đến nhánh Bí Mật',
        );
      }

      consoleWarnSpy.mockRestore();
    });
  });

  // =========================================================================
  // KỊCH BẢN 9: Thêm biến global mới dùng trong điều kiện (New global variable in condition)
  // =========================================================================
  describe('Kịch bản 9: Thêm biến global mới dùng trong điều kiện', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'gate' },
      { type: 'ASSIGN', variable: 'gold', value: { type: 'Literal', value: 100 } },
      { type: 'DIALOGUE', character: 'guard', text: 'Chào người lạ.' },
      { type: 'GOTO', targetScene: 'standard_gate' },
      { type: 'SCENE', name: 'standard_gate' },
      { type: 'DIALOGUE', character: 'guard', text: 'Cổng thường.' },
      { type: 'SCENE', name: 'vip_gate' },
      { type: 'DIALOGUE', character: 'guard', text: 'Cổng VIP.' },
    ];

    const modifiedProgram: Instruction[] = [
      { type: 'SCENE', name: 'gate' },
      { type: 'ASSIGN', variable: 'gold', value: { type: 'Literal', value: 100 } },
      { type: 'DIALOGUE', character: 'guard', text: 'Chào người lạ.' },
      // Thêm điều kiện dựa trên biến mới is_vip (chưa hề có trong save file cũ)
      {
        type: 'CONDITIONAL_GOTO',
        condition: {
          type: 'BinaryExpression',
          operator: '==',
          left: { type: 'Identifier', name: 'is_vip' },
          right: { type: 'Literal', value: true },
        },
        targetScene: 'vip_gate',
      },
      { type: 'GOTO', targetScene: 'standard_gate' },
      { type: 'SCENE', name: 'standard_gate' },
      { type: 'DIALOGUE', character: 'guard', text: 'Cổng thường.' },
      { type: 'SCENE', name: 'vip_gate' },
      { type: 'DIALOGUE', character: 'guard', text: 'Cổng VIP.' },
    ];

    it('ném lỗi VariableNotFoundError khi biến mới chưa khởi tạo, và chạy mượt mà khi có default', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const vmOrig = new VisualNovelVM(originalProgram);
      vmOrig.runUntilInteractive(); // Dừng tại 'Chào người lạ.'
      const saveJson = vmOrig.serialize({ projectId: 'test_proj' });

      // Trường hợp 1: Nạp vào VM mới không có initialVariables cho is_vip
      const vmMod = new VisualNovelVM(modifiedProgram);
      const restoreResult = vmMod.restore(saveJson);
      expect(restoreResult.desyncWarning).toBe(true);
      expect(vmMod.getState().variables['is_vip']).toBeUndefined();

      // Khi chạy tiếp, evaluator gặp is_vip chưa khởi tạo -> ném VariableNotFoundError an toàn
      expect(() => vmMod.runUntilInteractive()).toThrow(VariableNotFoundError);

      // Trường hợp 2: Khi Engine được cấu hình với initialVariables mặc định (từ project metadata)
      const vmModWithDefaults = new VisualNovelVM(modifiedProgram, undefined, {
        initialVariables: { is_vip: false },
      });
      vmModWithDefaults.restore(saveJson);

      // Save file khôi phục gold: 100, và biến is_vip có default false
      // Khi gặp CONDITIONAL_GOTO: false == true là false -> rẽ sang standard_gate
      const stepRes = vmModWithDefaults.runUntilInteractive();
      expect(stepRes.stepResult.type).toBe('SUSPEND_DIALOGUE');
      if (stepRes.stepResult.type === 'SUSPEND_DIALOGUE') {
        expect((stepRes.stepResult.instruction as DialogueInstruction).text).toBe('Cổng thường.');
      }
      expect(vmModWithDefaults.getState().currentScene).toBe('standard_gate');

      consoleWarnSpy.mockRestore();
    });
  });
});
