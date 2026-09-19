/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileString } from '@vn-engine/dsl-compiler';
import { VisualNovelVM } from '../src/vm';
import type { DialogueInstruction, StepResult } from '@vn-engine/shared-types';

function asDialogue(stepResult: StepResult): DialogueInstruction {
  if (stepResult.type !== 'SUSPEND_DIALOGUE') {
    throw new Error(`Expected SUSPEND_DIALOGUE, got ${stepResult.type}`);
  }
  return stepResult.instruction as DialogueInstruction;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Mystery Investigation Scenario E2E Simulation', () => {
  it('should compile and simulate a full playthrough to True Ending', () => {
    // 1. Đọc kịch bản điều tra từ tests/fixtures/mystery_investigation.vns
    const fixturePath = path.resolve(__dirname, '../../../tests/fixtures/mystery_investigation.vns');
    const source = fs.readFileSync(fixturePath, 'utf-8');

    // 2. Biên dịch qua DSL Compiler
    const compileResult = compileString(source, 'mystery_investigation.vns');
    expect(compileResult.success).toBe(true);
    expect(compileResult.errors).toBeUndefined();
    expect(compileResult.program).toBeDefined();
    const bytecode = compileResult.program!;
    expect(bytecode.length).toBeGreaterThan(60);

    // 3. Khởi tạo VM
    const vm = new VisualNovelVM(bytecode);

    // -------------------------------------------------------------------------
    // MÀN 1: Prologue — Hành lang chiều hoàng hôn
    // -------------------------------------------------------------------------
    // Câu 1: Người dẫn chuyện
    const s1 = vm.runUntilInteractive();
    expect(s1.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const d1 = asDialogue(s1.stepResult);
    expect(d1.character).toBeNull(); // narrator
    expect(d1.text).toContain('17 giờ 30 phút chiều');

    // Kiểm tra tài nguyên khởi đầu
    const catchup1 = vm.getStateCatchUp();
    expect(catchup1.background?.assetId).toBe('bg_corridor');
    expect(catchup1.audio.get('music')?.assetId).toBe('bgm_mystery');

    // Câu 2, 3: Dẫn chuyện tiếp
    const s2 = vm.runUntilInteractive();
    expect(asDialogue(s2.stepResult).text).toContain('Mọi học sinh đã ra về từ lâu');

    const s3 = vm.runUntilInteractive();
    expect(asDialogue(s3.stepResult).text).toContain('cánh cửa phòng Hội học sinh');

    // Câu 4: Alice xuất hiện với tên ẩn danh ???
    const s4 = vm.runUntilInteractive();
    const d4 = asDialogue(s4.stepResult);
    expect(d4.character).toBe('alice');
    expect(d4.displayNameOverride).toBe('???');
    expect(d4.text).toContain('Này! Cậu đang làm gì thập thò');

    // Lựa chọn đầu tiên: Giải thích lý do
    const choice1 = vm.runUntilInteractive();
    expect(choice1.stepResult.type).toBe('SUSPEND_CHOICE');
    expect(vm.getAvailableChoices()).toHaveLength(3);

    // Chọn lựa chọn 0: "Tôi thấy cửa mở nên tò mò nhìn thử"
    vm.choose(0);

    // Alice phản hồi
    const s5 = vm.runUntilInteractive();
    expect(asDialogue(s5.stepResult).text).toContain('Cửa mở sao? Lạ thật...');

    // Reveal Alice & mời vào phòng -> trust_score được gán là 15
    const s6 = vm.runUntilInteractive();
    const d6 = asDialogue(s6.stepResult);
    expect(d6.character).toBe('alice');
    expect(d6.text).toContain('Tôi là Alice, Hội phó phụ trách kỷ luật');
    expect(vm.getState().characterDisplayOverrides['alice']).toBe('Alice - Hội Phó');
    expect(vm.getState().variables['trust_score']).toBe(15);

    const s7 = vm.runUntilInteractive();
    expect(asDialogue(s7.stepResult).text).toContain('Cậu có dám vào trong cùng tôi');

    // Lựa chọn: "Được thôi, tôi sẽ giúp cậu kiểm tra"
    const choice2 = vm.runUntilInteractive();
    expect(choice2.stepResult.type).toBe('SUSPEND_CHOICE');
    vm.choose(0);

    // -------------------------------------------------------------------------
    // MÀN 2: Bước vào phòng Hội & Vòng lặp điều tra (While Loop & Call Stack)
    // -------------------------------------------------------------------------
    const s8 = vm.runUntilInteractive();
    expect(asDialogue(s8.stepResult).text).toContain('Tài liệu trên bàn làm việc bị xáo trộn');

    // Bob xuất hiện trong hồi tưởng
    const s9 = vm.runUntilInteractive();
    expect(asDialogue(s9.stepResult).character).toBe('bob');

    const s10 = vm.runUntilInteractive();
    expect(asDialogue(s10.stepResult).text).toContain('Két sắt đựng phong bì');

    const s11 = vm.runUntilInteractive();
    expect(asDialogue(s11.stepResult).text).toContain('Chúng ta cần tìm ít nhất 3 manh mối');

    // -------------------------------------------------------------
    // Lần lặp 1: Tìm đèn pin ở bàn giáo viên
    // -------------------------------------------------------------
    // Alice hỏi trong .investigate_turn (lúc này các biến ban đầu đã được khởi tạo xong)
    const turn1Q = vm.runUntilInteractive();
    expect(asDialogue(turn1Q.stepResult).text).toContain('Cậu muốn chúng ta bắt đầu kiểm tra');
    expect(vm.getState().variables['clues_count']).toBe(0);
    expect(vm.getState().variables['energy']).toBe(100);

    const menu1 = vm.runUntilInteractive();
    expect(menu1.stepResult.type).toBe('SUSPEND_CHOICE');
    const options1 = vm.getAvailableChoices();
    // Tùy chọn tìm bàn giáo viên
    const deskOptIdx = options1.findIndex(o => o.text.includes('bàn giáo viên'));
    expect(deskOptIdx).toBeGreaterThanOrEqual(0);
    vm.choose(deskOptIdx);

    // Duyệt qua câu thoại của .search_desk
    vm.runUntilInteractive(); // "Bạn cúi xuống..."
    vm.runUntilInteractive(); // "Ngăn kéo không có..."
    const deskAlice = vm.runUntilInteractive(); // Alice nhận xét về đèn pin (sau khi đã gán has_flashlight và energy)
    expect(asDialogue(deskAlice.stepResult).text).toContain('Chiếc đèn pin này');
    expect(vm.getState().variables['has_flashlight']).toBe(true);
    expect(vm.getState().variables['energy']).toBe(85);

    // -------------------------------------------------------------
    // Lần lặp 2: Dùng đèn pin soi két sắt (tìm thấy chìa khóa)
    // -------------------------------------------------------------
    const turn2Q = vm.runUntilInteractive();
    expect(asDialogue(turn2Q.stepResult).text).toContain('Cậu muốn chúng ta bắt đầu kiểm tra');

    const menu2 = vm.runUntilInteractive();
    expect(menu2.stepResult.type).toBe('SUSPEND_CHOICE');
    const safeOptIdx = vm.getAvailableChoices().findIndex(o => o.text.includes('tủ sắt'));
    expect(safeOptIdx).toBeGreaterThanOrEqual(0);
    vm.choose(safeOptIdx);

    vm.runUntilInteractive(); // "Bạn bật đèn pin..."
    const safeAlice = vm.runUntilInteractive(); // Alice reo lên
    expect(asDialogue(safeAlice.stepResult).text).toContain('chìa khóa tủ dự phòng');

    // -------------------------------------------------------------
    // Lần lặp 3: Lục soát giá sách (tìm nhật ký)
    // -------------------------------------------------------------
    vm.runUntilInteractive(); // câu hỏi lượt 3 (sau khi gán found_key, clues_count=1, trust_score=35)
    expect(vm.getState().variables['found_key']).toBe(true);
    expect(vm.getState().variables['clues_count']).toBe(1);
    expect(vm.getState().variables['trust_score']).toBe(35);

    vm.runUntilInteractive();
    const bookOptIdx = vm.getAvailableChoices().findIndex(o => o.text.includes('giá sách'));
    expect(bookOptIdx).toBeGreaterThanOrEqual(0);
    vm.choose(bookOptIdx);

    vm.runUntilInteractive(); // "Bạn cẩn thận..."
    const bookAlice = vm.runUntilInteractive();
    expect(asDialogue(bookAlice.stepResult).text).toContain('cuốn nhật ký');

    // -------------------------------------------------------------
    // Lần lặp 4: Kiểm tra bệ cửa sổ (tìm dấu giày) -> đủ 3 manh mối
    // -------------------------------------------------------------
    vm.runUntilInteractive(); // câu hỏi lượt 4 (sau khi gán found_diary, clues_count=2)
    expect(vm.getState().variables['found_diary']).toBe(true);
    expect(vm.getState().variables['clues_count']).toBe(2);

    vm.runUntilInteractive();
    const winOptIdx = vm.getAvailableChoices().findIndex(o => o.text.includes('bệ cửa sổ'));
    expect(winOptIdx).toBeGreaterThanOrEqual(0);
    vm.choose(winOptIdx);

    vm.runUntilInteractive(); // "Bạn bước lại gần..."
    const winAlice = vm.runUntilInteractive();
    expect(asDialogue(winAlice.stepResult).text).toContain('dấu giày thể thao');

    // -------------------------------------------------------------------------
    // MÀN 3: Vòng lặp kết thúc -> Chuyển sang Đối chất (Confrontation)
    // -------------------------------------------------------------------------
    const conf1 = vm.runUntilInteractive();
    expect(asDialogue(conf1.stepResult).text).toContain('Chúng ta đã thu thập đủ cả 3 manh mối');
    expect(vm.getState().currentScene).toContain('confrontation');
    expect(vm.getState().variables['found_footprint']).toBe(true);
    expect(vm.getState().variables['clues_count']).toBe(3);

    const conf2 = vm.runUntilInteractive();
    expect(asDialogue(conf2.stepResult).text).toContain('Trang nhật ký xé dở');

    const conf3 = vm.runUntilInteractive();
    expect(asDialogue(conf3.stepResult).character).toBe('bob');
    expect(asDialogue(conf3.stepResult).text).toContain('sao vẫn còn ở trong khu vực văn phòng');

    const conf4 = vm.runUntilInteractive();
    expect(asDialogue(conf4.stepResult).text).toContain('mũi giày lại dính bùn đất');

    // Menu đối chất: Nhánh vạch trần Bob khả dụng vì trust_score >= 35
    const confChoice = vm.runUntilInteractive();
    expect(confChoice.stepResult.type).toBe('SUSPEND_CHOICE');
    const confChoices = vm.getAvailableChoices();
    const accuseOpt = confChoices.find(c => c.text.includes('Bob chính là người tự dàn cảnh'));
    expect(accuseOpt).toBeDefined();
    expect(accuseOpt?.enabled).toBe(true);

    // Chọn vạch trần Bob
    const accuseIdx = confChoices.indexOf(accuseOpt!);
    vm.choose(accuseIdx);

    // Bob thú nhận
    const confess1 = vm.runUntilInteractive();
    expect(asDialogue(confess1.stepResult).text).toContain('Các cậu dám nghi ngờ tôi');

    const confess2 = vm.runUntilInteractive();
    expect(asDialogue(confess2.stepResult).text).toContain('Tôi thừa nhận');

    const confess3 = vm.runUntilInteractive();
    expect(asDialogue(confess3.stepResult).text).toContain('Tôi sợ mọi người chê trách');

    const confess4 = vm.runUntilInteractive();
    expect(asDialogue(confess4.stepResult).text).toContain('Thật là... anh làm chúng em hết hồn');

    // -------------------------------------------------------------------------
    // KẾT THÚC HOÀN HẢO (TRUE ENDING)
    // -------------------------------------------------------------------------
    const trueEnd1 = vm.runUntilInteractive();
    expect(asDialogue(trueEnd1.stepResult).text).toContain('Cảm ơn cậu rất nhiều! Nhờ sự nhạy bén');
    expect(vm.getState().currentScene).toBe('true_ending');

    const trueEnd2 = vm.runUntilInteractive();
    expect(asDialogue(trueEnd2.stepResult).character).toBe('bob');
    expect(asDialogue(trueEnd2.stepResult).text).toContain('Hội học sinh rất cần những người nhiệt huyết');

    // Dẫn chuyện kết thúc
    vm.runUntilInteractive();
    vm.runUntilInteractive();
    vm.runUntilInteractive();
    const banner = vm.runUntilInteractive();
    expect(asDialogue(banner.stepResult).text).toContain('★ KẾT THÚC HOÀN HẢO (TRUE ENDING) ★');

    // -------------------------------------------------------------------------
    // Kiểm tra Rollback hoạt động tốt trên kịch bản phức tạp
    // -------------------------------------------------------------------------
    expect(vm.canRollback()).toBe(true);
    expect(vm.rollback()).toBe(true);
    expect(vm.canRollforward()).toBe(true);
    expect(vm.rollforward()).toBe(true);

    // Đường kẻ viền dưới kết thúc banner
    const bottomBorder = vm.runUntilInteractive();
    expect(asDialogue(bottomBorder.stepResult).text).toContain('═══════════════════════════════════════════════════');

    // Nhờ lệnh 'end' ở cuối true_ending, bước tiếp theo lập tức HALTED mà không bị trôi sang các ending khác
    const finalStep = vm.runUntilInteractive();
    expect(finalStep.stepResult.type).toBe('HALTED');
    expect(vm.getState().currentScene).toBe('true_ending');
  });
});
