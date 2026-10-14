/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileString } from '../src/compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('VNS Test Lab Suite (vns_test_lab.vns)', () => {
  // =========================================================================
  // PHẦN 1: KỊCH BẢN CHÍNH — TOÀN BỘ 14 PHÒNG LAB
  // =========================================================================
  describe('Phần 1: Biên dịch kịch bản tổng hợp 14 phòng Lab', () => {
    it('biên dịch sạch 100% vns_test_lab.vns mà không phát sinh bất kỳ lỗi nào', () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'vns_test_lab.vns');
      const content = fs.readFileSync(fixturePath, 'utf-8');

      const result = compileString(content, 'vns_test_lab.vns', {
        characters: [
          {
            id: 'doctor',
            name: 'Doctor',
            colorHex: '#e91e63',
            sprites: { happy: 'doc_happy', serious: 'doc_serious' },
          },
        ],
      });

      if (!result.success) {
        console.error('Compiler Errors:', result.errors);
      }
      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.program).toBeDefined();

      const program = result.program!;
      expect(program.length).toBeGreaterThan(100);

      // Xác minh sự hiện diện của các scene chính
      const sceneNames = program
        .filter(i => i.type === 'SCENE')
        .map(s => (s as { name: string }).name);

      expect(sceneNames).toContain('hub');
      expect(sceneNames).toContain('hub2');
      expect(sceneNames).toContain('lab_text');
      expect(sceneNames).toContain('lab_visual');
      expect(sceneNames).toContain('lab_flow');
      expect(sceneNames).toContain('lab_catchup');
      expect(sceneNames).toContain('lab_inspect');
      expect(sceneNames).toContain('lab_audio');
      expect(sceneNames).toContain('lab_input');
      expect(sceneNames).toContain('lab_skins');
      expect(sceneNames).toContain('lab_callstack');
      expect(sceneNames).toContain('lab_preamble');
      expect(sceneNames).toContain('lab_disabled');
      expect(sceneNames).toContain('lab_format');
      expect(sceneNames).toContain('lab_endcall');
    });
  });

  // =========================================================================
  // PHẦN 2: KHO LỖI BIÊN DỊCH — COMPILER ERRORS [C01 - C22]
  // =========================================================================
  describe('Phần 2: Kho lỗi biên dịch (Compiler Errors C01 - C22)', () => {
    it('[C01] Gán biến chưa khai báo -> báo lỗi must be declared before assignment', () => {
      const script = `
        scene err_c01 {
            ~ ghost = 1
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/must be declared before assignment/i);
      expect(res.errors![0]?.message).toContain('ghost');
    });

    it('[C02] Nội suy biến chưa khai báo -> báo lỗi in string interpolation', () => {
      const script = `
        scene err_c02 {
            narrator: "Xin chào {nobody}!"
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/in string interpolation/i);
      expect(res.errors![0]?.message).toContain('nobody');
    });

    it('[C03] Khai báo global trùng -> báo lỗi defined multiple times at top-level', () => {
      const script = `
        define gold = 1
        define gold = 2
        scene s {
            narrator: "x"
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/defined multiple times at top-level/i);
    });

    it('[C04] Local trùng tên global -> báo lỗi already declared as global', () => {
      const script = `
        define gold = 1
        scene err_c04 {
            define gold = 5
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/already declared as global/i);
    });

    it('[C05] goto tới scene không tồn tại -> báo lỗi Target of goto does not exist', () => {
      const script = `
        scene err_c05 {
            goto khong_ton_tai
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/does not exist in script/i);
      expect(res.errors![0]?.message).toContain('khong_ton_tai');
    });

    it('[C06] Trùng tên scene -> báo lỗi Scene name is defined multiple times', () => {
      const script = `
        scene hub {
            narrator: "1"
        }
        scene hub {
            narrator: "2"
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/is defined multiple times/i);
    });

    it('[C07] Sub-scene lồng sub-scene -> báo lỗi Sub-scenes strictly limited to 1 level', () => {
      const script = `
        scene err_c07 {
            scene .a {
                scene .b {
                    narrator: "x"
                }
            }
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/strictly limited to 1 level/i);
    });

    it('[C08] position cùng x/y -> báo lỗi cannot use both position and x/y coordinates', () => {
      const script = `
        scene err_c08 {
            show doctor.happy(position: "left", x: 0.2)
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/cannot use both 'position' and 'x'\/'y'/i);
    });

    it('[C09] transition không hợp lệ -> báo lỗi unknown transition', () => {
      const script = `
        scene err_c09 {
            background bg_x transition: "teleport"
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/unknown transition "teleport"/i);
    });

    it('[C10] easing không hợp lệ -> báo lỗi unknown easing', () => {
      const script = `
        scene err_c10 {
            show doctor.happy(easing: "hyper")
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/unknown easing "hyper"/i);
    });

    it('[C11] Thiếu dấu } ở cuối -> báo lỗi cú pháp Parser (Syntax error)', () => {
      const script = `
        scene err_c11 {
            narrator: "thiếu ngoặc đóng"
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors!.length).toBeGreaterThan(0);
    });

    it('[C12] Biểu thức sai cú pháp -> báo lỗi cú pháp biểu thức', () => {
      const script = `
        define trust = 0
        scene err_c12 {
            if trust > {
                narrator: "x"
            }
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors!.length).toBeGreaterThan(0);
    });

    it('[C13] Toán tử modulo % -> biên dịch thành công', () => {
      const script = `
        define trust = 10
        scene err_c13 {
            ~ trust = trust % 2
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(true);
      expect(res.errors).toBeUndefined();
      expect(res.program).toBeDefined();
    });

    it('[C14] Dùng x làm tên biến toàn cục -> biên dịch thành công', () => {
      const script = `
        define x = 1
        scene s {
            narrator: "x = {x}"
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(true);
      expect(res.errors).toBeUndefined();
    });

    it('[C15] goto dạng global.local -> biên dịch và phân giải chính xác', () => {
      const script = `
        scene lab_flow {
            scene .turn {
                narrator: "trong sub"
            }
        }
        scene err_c15 {
            goto lab_flow.turn
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(true);
      expect(res.errors).toBeUndefined();
    });

    it('[C16] choice if có 2 option bên trong -> biên dịch thành công', () => {
      const script = `
        scene err_c16 {
            choice {
                if true {
                    "Một": goto hub
                    "Hai": goto hub
                }
            }
        }
        scene hub {
            narrator: "hub"
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(true);
      expect(res.errors).toBeUndefined();
    });

    it('[C17] Sub-scene khai báo ở top-level -> báo lỗi cannot be declared at top-level', () => {
      const script = `
        scene .orphan {
            narrator: "x"
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/cannot be declared at top-level/i);
    });

    it('[C18] Scene global có dấu chấm -> báo lỗi cannot contain dot', () => {
      const script = `
        scene 1.5 {
            narrator: "x"
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/cannot contain '\.'/i);
    });

    it('[C19] Ký tự lạ ngoài bảng chữ cái DSL -> báo lỗi Lexer error', () => {
      const script = `
        scene err_c19 {
            narrator: "x" $
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/Lexer error/i);
    });

    it('[C20] define local trùng trong cùng scene -> báo lỗi defined multiple times in scene', () => {
      const script = `
        scene err_c20 {
            define t = 1
            define t = 2
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/defined multiple times in scene/i);
    });
  });

  // =========================================================================
  // PHẦN 3: KHO LỖI RUNTIME DƯỚI GÓC NHÌN BIÊN DỊCH — [R01 - R07]
  // =========================================================================
  describe('Phần 3: Các khối scene Runtime [R01 - R07] dưới góc nhìn Compiler', () => {
    it('[R01] Biến chưa khai báo trong biểu thức điều kiện -> Semantic Validator chặn ngay khi compile', () => {
      const script = `
        scene err_r01 {
            narrator: "Trước lỗi."
            if scor > 5 {
                narrator: "Không tới được."
            }
        }
      `;
      const res = compileString(script);
      // Validator hiện tại bắt biến chưa khai báo trong biểu thức
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toContain('scor');
    });

    it('[R02] Gọi hàm ngoài whitelist -> Semantic Validator chặn hàm không được phép', () => {
      const script = `
        define trust = 0
        scene err_r02 {
            narrator: "Trước lỗi."
            ~ trust = foo(1)
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect(res.errors![0]?.message).toMatch(/Unknown function 'foo'/i);
    });

    it('[R03] Chia cho 0 -> Compile hợp lệ thành Bytecode (lỗi xảy ra khi VM thực thi)', () => {
      const script = `
        define trust = 0
        scene err_r03 {
            narrator: "Trước lỗi."
            ~ trust = 10 / 0
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(true);
      expect(res.program).toBeDefined();
    });

    it('[R04] Sai kiểu dữ liệu (chuỗi - số) -> Compile hợp lệ thành Bytecode (lỗi xảy ra khi VM thực thi)', () => {
      const script = `
        define trust = 0
        scene err_r04 {
            narrator: "Trước lỗi."
            ~ trust = "abc" - 1
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(true);
      expect(res.program).toBeDefined();
    });

    it('[R05] Vòng lặp vô hạn -> Compile hợp lệ thành Bytecode cấu trúc LOOP (lỗi chặn bởi VM Budget)', () => {
      const script = `
        define counter = 0
        scene err_r05 {
            narrator: "Sắp lặp vô hạn."
            while true {
                ~ counter = counter + 1
            }
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(true);
      expect(res.program).toBeDefined();
      const loopStarts = res.program!.filter(i => i.type === 'LOOP_START');
      expect(loopStarts.length).toBe(1);
    });

    it('[R06] return khi không có call -> Compile hợp lệ câu lệnh RETURN Bytecode', () => {
      const script = `
        scene err_r06 {
            narrator: "Return không caller."
            return
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(true);
      expect(res.program).toBeDefined();
      expect(res.program!.some(i => i.type === 'RETURN')).toBe(true);
    });

    it('[R07] Mọi lựa chọn đều bị khóa (condition: false) -> Compile hợp lệ câu lệnh CHOICE', () => {
      const script = `
        scene err_r07 {
            narrator: "Mọi lựa chọn đều khóa."
            choice {
                if false {
                    "Không bấm được": goto err_r07
                }
            }
        }
      `;
      const res = compileString(script);
      expect(res.success).toBe(true);
      expect(res.program).toBeDefined();
      const choiceInstr = res.program!.find(i => i.type === 'CHOICE');
      expect(choiceInstr).toBeDefined();
    });
  });
});
