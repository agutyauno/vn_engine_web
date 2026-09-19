// ==========================================
// ĐIỂM KHỞI ĐẦU RUNTIME PLAYER (DEMO SCENARIO)
// ==========================================

import { compileString } from '@vn-engine/dsl-compiler';
import { VNPlayer } from './player';

const DEMO_VNS_SCRIPT = `
scene start {
    background bg_classroom
    show alice.smile(position: "left")
    play music "bgm_peaceful" volume: 0.8 loop: true

    alice as "???": "Chào cậu! Cậu là học sinh mới chuyển đến trường này đúng không?"
    alice as "???": "Mình thấy cậu đứng ngơ ngác trước cửa lớp nãy giờ."

    choice {
        "Đúng vậy, mình vừa chuyển tới hôm nay": goto talk_new_student
        "Cậu là ai thế?": goto talk_who_are_you
        "Không có gì đâu (Im lặng)": goto talk_silent
    }
}

scene talk_new_student {
    alice: "Thế thì chào mừng cậu đến với lớp chúng ta nhé!"
    ~ points = 20
    goto talk_introduce
}

scene talk_who_are_you {
    alice: "Haha, đã bất lịch sự không giới thiệu trước rồi."
    ~ points = 10
    goto talk_introduce
}

scene talk_silent {
    alice: "Cậu có vẻ là người ít nói nhỉ?"
    ~ points = 0
    goto talk_introduce
}

scene talk_introduce {
    reveal alice as "Alice"
    show alice.happy(position: "center", duration: 0.4s)
    play sound "sfx_bell" volume: 0.9

    alice: "Mình tên là Alice, lớp trưởng của lớp 11A2!"
    alice: "Tiết học sắp bắt đầu rồi. Chiều nay tan học cậu có muốn cùng mình đi dạo sân trường không?"

    choice {
        "Rất sẵn lòng, hẹn gặp cậu buổi chiều!": goto afternoon_walk
        "Để dịp khác nhé, chiều nay mình bận rồi": goto decline
    }
}

scene afternoon_walk {
    background bg_courtyard transition: "fade"
    show alice.smile(position: "center")
    play music "bgm_evening" volume: 0.7 loop: true

    alice: "Gió chiều ở sân trường mát thật đấy!"
    alice: "Cậu cảm thấy ngày đầu tiên ở trường mới thế nào?"
    
    if points >= 15 {
        goto good_ending
    } else {
        goto normal_ending
    }
}

scene decline {
    show alice.smile(position: "left", duration: 0.3s)
    alice: "Tiếc quá, vậy hẹn cậu hôm khác nha!"
    goto normal_ending
}

scene good_ending {
    show alice.happy(position: "center")
    alice: "Thật vui vì được làm bạn với cậu! Chúng ta cùng cố gắng trong năm học này nhé!"
    stop music fade_out: 1.5s
    narrator: "Hai người cùng nhau ngắm hoàng hôn buông xuống sân trường. Một tình bạn đẹp bắt đầu nở hoa."
    narrator: "[ KẾT THÚC CÓ HẬU (GOOD ENDING) ]"
}

scene normal_ending {
    show alice.smile(position: "center")
    alice: "Hẹn gặp lại cậu vào ngày mai nhé!"
    stop music fade_out: 1.5s
    narrator: "Ngày đầu tiên trôi qua một cách yên bình."
    narrator: "[ KẾT THÚC THƯỜNG (NORMAL ENDING) ]"
}
`;

window.addEventListener('DOMContentLoaded', async () => {
    console.log('[RuntimePlayer] Đang biên dịch kịch bản VNS mẫu...');

    const compileResult = compileString(DEMO_VNS_SCRIPT, 'demo.vns');
    if (!compileResult.success || !compileResult.program) {
        console.error('[RuntimePlayer] Lỗi biên dịch kịch bản demo:', compileResult.errors);
        alert('Lỗi biên dịch kịch bản demo! Vui lòng kiểm tra Console.');
        return;
    }

    console.log(
        `[RuntimePlayer] Biên dịch thành công ${compileResult.program.length} instructions. Khởi tạo VNPlayer...`,
    );

    const player = new VNPlayer(compileResult.program);
    await player.start();

    // Expose player to window for debugging if needed
    (window as unknown as { vnPlayer: VNPlayer }).vnPlayer = player;
});
