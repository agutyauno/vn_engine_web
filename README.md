# VN Engine Web

> **Nền tảng sáng tác, mô phỏng và phát hành Visual Novel thế hệ mới hoàn toàn trên trình duyệt Web.**

[![CI](https://github.com/agutyauno/vn_engine_web/actions/workflows/ci.yml/badge.svg)](https://github.com/agutyauno/vn_engine_web/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-12.x-orange.svg)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📖 Giới Thiệu Dự Án

**VN Engine Web** là một nền tảng mã nguồn mở hiện đại, cung cấp giải pháp toàn diện từ khâu viết kịch bản, quản lý tài nguyên (hình ảnh, âm thanh, biểu cảm), chạy thử nghiệm (Live Preview) cho đến phát hành trò chơi Visual Novel:

- **Không cần cài đặt phức tạp**: Mọi thao tác biên kịch, dàn dựng và trải nghiệm đều chạy trực tiếp trên nền tảng Web tiêu chuẩn.
- **Ngôn ngữ kịch bản trực quan (VNS DSL)**: Cú pháp ngắn gọn, dễ đọc, phù hợp cho cả nhà văn, biên kịch lẫn lập trình viên.
- **Máy ảo Bytecode xác định (Deterministic VM)**: Đảm bảo độ mượt mà cao, hỗ trợ tính năng Rollback (tua lại lời thoại) tức thì và lưu trữ Save/Load an toàn.
- **Đồ họa PixiJS v8**: Tận dụng WebGL / WebGPU tăng tốc phần cứng, chuyển cảnh mượt mà, hỗ trợ tự động phác thảo bóng người (Silhouette) khi chưa có ảnh nhân vật.

---

## 🌟 Tính Năng Nổi Bật

### 1. Ngôn ngữ Kịch bản VNS DSL (Visual Novel Script)

- **Kịch bản phân đoạn**: Khai báo `scene` và các sub-scene cục bộ (`scene .sub`).
- **Thoại & Danh xưng**: Cú pháp `alice: "..."`, ghi đè tạm thời 1 dòng (`alice as "???": "..."`), hoặc lộ diện danh tính lâu dài (`reveal alice as "Alice"`).
- **Phân định phạm vi biến (Variable Scoping)**:
  - Khai báo ngoài scene (`define affection = 0`) $\rightarrow$ Biến **Global** (lưu trữ trọn đời game).
  - Khai báo trong scene (`define counter = 0`) $\rightarrow$ Biến **Local** (phạm vi riêng, reset khi vào lại scene).
  - Tái gán an toàn bằng `~ bien = gia_tri` (Strict Mode: bắt lỗi nếu biến chưa từng được `define`).
- **Cấu trúc điều khiển**: Rẽ nhánh `if / else`, vòng lặp `while`, nhảy `goto`, gọi hàm có hồi quy `call ... return`, tạm dừng kịch bản tự động `wait <duration>`, kết thúc hạ màn `end`.
- **Lựa chọn phân nhánh (`choice`)**: Hỗ trợ lựa chọn có điều kiện lồng nhau `if`.

### 2. Nội Suy Chuỗi & Thẻ Nhịp Điệu Typewriter

- **Nội suy biểu thức**: Nhúng biến `{playerName}` hoặc phép toán an toàn `{gold - cost}` vào câu thoại và nhãn lựa chọn.
- **Bộ lọc định dạng (Filters)**: `{gold:comma}` (phân cách hàng nghìn `1,500,000`), `{name:upper}`, `{name:capitalize}`, `{rate:round}`.
- **Giá trị dự phòng (Fallback)**: `{nickname ?? "Khách lạ"}`.
- **Thẻ điều khiển Typewriter**:
  - Tạm dừng kịch tính: `{pause:0.8s}` hoặc `{wait:0.8s}`.
  - Tốc độ gõ chữ linh hoạt: `{speed:slow}`, `{speed:normal}`, `{speed:fast}`.
  - Đổi màu chữ cục bộ: `{color:#38bdf8}vật phẩm đặc biệt{/color}` (100% XSS-Safe qua text nodes).

### 3. Đồ Họa & Điều Khiển Hình Ảnh (Transforms & Motion System)

- **Biến đổi hình học (Transforms)**:
  - Phóng to / thu nhỏ linh hoạt (`scale`, `scaleX`, `scaleY`).
  - Xoay đa chiều theo góc độ (`rotate: 15`, `rotate: -30`).
  - Lật gương tức thì (`flipX: true`, `flipY: true`).
  - Tùy chỉnh độ mờ / trong suốt (`alpha: 0.0` đến `1.0`).
- **Định vị & Bố cục tinh tế**:
  - Căn nhanh qua vị trí chuẩn hóa (`position: "left" | "center" | "right"`).
  - Tọa độ tỷ lệ tương đối (`x`, `y` từ `0.0` đến `1.0`).
  - Dịch chuyển bù đắp điểm ảnh (`offsetX`, `offsetY` dạng pixel).
- **Preset Chuyển Động & Hiệu Ứng Phong Phú**:
  - `shake` (rung chấn kinh ngạc/va đập), `hop` (nhảy cẫng vui sướng), `bounce` (tưng nảy), `wobble` (lắc lư bối rối), `pop` (nhún nảy xuất hiện), `zoom`, `slide`, `fade`.
  - Bộ hàm gia tốc (Easing): `linear`, `ease_in`, `ease_out`, `ease_in_out`, `bounce`, `elastic`.
- Áp dụng đồng bộ cho cả sprite nhân vật (`show`) lẫn phông nền (`background`).

### 4. Studio Biên Kịch Trực Quan (Web Editor)

- Tích hợp **Monaco Editor** với đầy đủ Syntax Highlighting, Autocompletion (Snippet Templates), phân tích ngữ nghĩa báo lỗi thời gian thực (Real-time Diagnostics), và **Tự động định dạng mã nguồn (Auto-Format)** qua phím tắt `Shift + Alt + F`, nút bấm `⚡ Format`, hoặc menu chuột phải.
- **Trình quản lý Asset & Nhân vật**: Upload phông nền, âm thanh, biểu cảm sprite; cơ chế _Thêm nhanh (1-click)_ kèm màu đại diện Wireframe.
- **Drawer Biến Watch & Biến cờ**: Theo dõi trạng thái biến Global / Local theo thời gian thực khi chạy thử kịch bản.
- **Cửa sổ rời (Pop-out Preview)**: Mở trình phát game ở màn hình riêng biệt hoặc xem trực tiếp bên cạnh kịch bản.

### 5. Máy Ảo Runtime & Trình Phát (Runtime Player)

- Hệ thống **Save / Load** nhiều trang với ảnh chụp màn hình thu nhỏ (Thumbnail preview).
- **Rollback / Roll-forward** quay ngược hoặc tiến tới từng câu thoại dựa trên cấu trúc Ring Buffer (lưu giữ trọn vẹn toàn bộ transform & vị trí ảnh).
- **Lịch sử thoại (Backlog)**: Xem lại toàn bộ hội thoại đã qua, tự động lọc sạch thẻ điều khiển nội suy.
- Hỗ trợ chế độ đọc tự động (**Auto**) và tua nhanh (**Skip**).

---

## 🏗️ Cấu Trúc Monorepo

```
vn_engine_web/
├── apps/
│   ├── editor/              # Web Editor Studio (Monaco Editor, Asset Manager, Live Preview)
│   └── runtime-player/      # Ứng dụng Player chạy game độc lập (Typewriter, Save/Load, HUD)
├── packages/
│   ├── shared-types/        # Định nghĩa kiểu dữ liệu chung (AST, Instructions, Runtime State, Schema)
│   ├── dsl-compiler/        # Trình biên dịch VNS DSL (Chevrotain Lexer/Parser, Semantic Check, Codegen)
│   ├── core-vm/             # Máy ảo thực thi Bytecode, Sandbox Evaluator, Rollback Buffer, Interpolation
│   ├── renderer/            # Trình dựng hình 2D PixiJS v8 (Layers, Sprites, Background, Silhouettes)
│   └── audio/               # Quản lý âm thanh Web Audio API (Kênh BGM, SFX, Voice, Fade-in/out)
└── .github/workflows/       # Pipeline CI/CD tự động (Lint, Format, Typecheck, Test)
```

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### Yêu Cầu Môi Trường

- **Node.js**: Phiên bản `>= 20.0.0` (Khuyến nghị: Node.js 22 LTS hoặc 25).
- **pnpm**: Phiên bản `12.x` (hoặc tối thiểu `9.x`).

### 1. Clone Repository

```bash
git clone https://github.com/agutyauno/vn_engine_web.git
cd vn_engine_web
```

### 2. Cài Đặt Dependencies

Sử dụng `pnpm` để cài đặt gói cho toàn bộ workspace:

```bash
pnpm install
```

### 3. Biên Dịch Các Packages Nội Bộ

Build toàn bộ thư viện nền tảng (`shared-types`, `dsl-compiler`, `core-vm`, `renderer`, `audio`):

```bash
pnpm build
```

### 4. Khởi Chạy Môi Trường Phát Triển (Development)

Bạn có thể chạy riêng từng ứng dụng hoặc chạy song song:

- **Khởi chạy Web Editor Studio** (cổng mặc định `3001`):

  ```bash
  pnpm dev
  ```

  Truy cập: [http://localhost:3001](http://localhost:3001)

- **Khởi chạy Standalone Runtime Player** (cổng mặc định `3000`):
  ```bash
  pnpm dev:player
  ```
  Truy cập: [http://localhost:3000](http://localhost:3000)

---

## 🛠️ Danh Mục Lệnh Thường Dùng (Scripts)

| Lệnh                | Mô tả chức năng                                                        |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm build`        | Biên dịch toàn bộ các gói thư viện và build production bundle cho apps |
| `pnpm test`         | Chạy toàn bộ 130+ bài kiểm thử tự động với Vitest                      |
| `pnpm test:smoke`   | Chạy Headless Smoke Test cho luồng chạy game hoàn chỉnh                |
| `pnpm typecheck`    | Kiểm tra lỗi kiểu TypeScript (`tsc --noEmit`) trên toàn bộ monorepo    |
| `pnpm lint`         | Quét kiểm tra quy chuẩn mã nguồn bằng ESLint                           |
| `pnpm format`       | Tự động định dạng toàn bộ mã nguồn theo chuẩn Prettier                 |
| `pnpm format:check` | Kiểm tra tính tuân thủ định dạng mã nguồn (dùng trong CI)              |

---

## 📝 Ví Dụ Kịch Bản VNS Mẫu

Dưới đây là một đoạn kịch bản `.vns` thể hiện các tính năng tiêu biểu:

```vns
# Khai báo biến Global ở cấp độ file (top-level)
define player_name = "Khang"
define gold = 150000
define trust_score = 0

scene prologue ui: "default" {
    background bg_corridor(scale: 1.1, transition: "zoom", duration: 1.0s)
    play music "bgm_mystery" volume: 0.6 loop: true fade_in: 1.0s
    play sound "sfx_door_creak" volume: 0.8

    narrator: "Hoàng hôn buông xuống dãy hành lang vắng lặng."

    show alice.serious(position: "left", flipX: true, duration: 0.4s)
    alice as "???": "{speed:slow}Này... {pause:0.6s}Cậu đang làm gì ở trước cửa phòng Hội học sinh?{speed:normal}"

    choice {
        "Tôi thấy cửa mở nên tò mò nhìn thử": goto .explain_curious
        "Tôi chỉ đi ngang qua thôi": goto .explain_passby
    }

    scene .explain_curious {
        ~ trust_score = 20
        reveal alice as "Alice"
        show alice.happy(position: "center", scale: 1.2, transition: "hop", duration: 0.5s)
        wait 0.5s
        alice: "Chào {player_name}! Điểm tin cậy của bạn hiện tại là {color:#38bdf8}{trust_score}%{/color}."
        alice: "Số tiền bạn đang mang theo: {gold:comma} vàng."
        goto chapter1_investigation
    }

    scene .explain_passby {
        show alice.surprised(rotate: -10, transition: "shake", easing: "elastic", duration: 0.5s)
        alice as "???": "Đáng ngờ thật đấy. Tạm biệt!"
        end
    }
}

scene chapter1_investigation {
    narrator: "Cuộc điều tra chính thức bắt đầu..."
}
```

---

## 🤝 Quy Trình Đóng Góp (Contributing)

1. Fork repository và tạo nhánh mới (`git checkout -b feature/tinh-nang-moi`).
2. Viết mã nguồn và bổ sung unit test tương ứng trong thư mục `tests/`.
3. Kiểm tra tính toàn vẹn của mã nguồn trước khi tạo Pull Request:
   ```bash
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm test
   ```
4. Commit thay đổi và gửi Pull Request về nhánh `main`.

---

## 📄 Bản Quyền

Dự án được phát hành theo giấy phép [MIT License](LICENSE).
