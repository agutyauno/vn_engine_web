/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatVns } from '../src/formatter';
import { compileString } from '../src/compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('VNS DSL Script Auto-Formatter', () => {
  it('formats unindented scene, statements and blocks cleanly', () => {
    const raw = `
scene prologue ui:"default"{
background bg_corridor transition: "fade"
show alice.serious( position:"left" ,flipX:true ,duration:0.4s )
alice as "???" : "What are you doing here?"

choice{
"I am curious":goto .curious
if !found_key{
"Search the desk":call .desk
}
}
}
`;

    const expected = `scene prologue ui: "default" {
  background bg_corridor transition: "fade"
  show alice.serious(position: "left", flipX: true, duration: 0.4s)
  alice as "???": "What are you doing here?"

  choice {
    "I am curious": goto .curious
    if !found_key {
      "Search the desk": call .desk
    }
  }
}
`;

    const formatted = formatVns(raw, { indentSize: 2 });
    expect(formatted).toBe(expected);
  });

  it('formats conditionals, while loops and else-if chains', () => {
    const raw = `
scene test_logic {
define counter = 0
while counter < 5 {
~ counter = counter + 1
if counter == 3 {
call alert
} else if counter == 4 {
call warning
} else {
call standard
}
}
}
`;

    const expected = `scene test_logic {
  define counter = 0
  while counter < 5 {
    ~ counter = counter + 1
    if counter == 3 {
      call alert
    } else if counter == 4 {
      call warning
    } else {
      call standard
    }
  }
}
`;

    const formatted = formatVns(raw, { indentSize: 2 });
    expect(formatted).toBe(expected);
  });

  it('formats wait statement and media controls', () => {
    const raw = `
scene animation_scene {
show amiya(x:0.1, y:1, transition:"shake", duration:0.5s)
wait 0.5s
show amiya(x:0.5, y:1, duration:0.6s)
wait 0.6s
stop music fade_out: 1.5s
play sound "sfx_ping" volume: 0.8
amiya: "Hello doctor"
}
`;

    const expected = `scene animation_scene {
  show amiya(x: 0.1, y: 1, transition: "shake", duration: 0.5s)
  wait 0.5s
  show amiya(x: 0.5, y: 1, duration: 0.6s)
  wait 0.6s
  stop music fade_out: 1.5s
  play sound "sfx_ping" volume: 0.8
  amiya: "Hello doctor"
}
`;

    const formatted = formatVns(raw);
    expect(formatted).toBe(expected);
  });

  it('preserves exact string literals without altering internal whitespace or interpolation', () => {
    const raw = `
scene test_strings {
alice: "  Spaces,   commas,   and special {gold + 10:comma ?? \\"default\\"} characters   "
}
`;

    const formatted = formatVns(raw);
    expect(formatted).toContain(
      'alice: "  Spaces,   commas,   and special {gold + 10:comma ?? \\"default\\"} characters   "',
    );
  });

  it('preserves comments and formats line indentation correctly', () => {
    const raw = `
# ==============================================================
# GLOBAL CONFIG
# ==============================================================
define score = 100

scene main {
# Inner comment
show alice  # Trailing comment
return
}
`;

    const expected = `# ==============================================================
# GLOBAL CONFIG
# ==============================================================
define score = 100

scene main {
  # Inner comment
  show alice  # Trailing comment
  return
}
`;

    const formatted = formatVns(raw);
    expect(formatted).toBe(expected);
  });

  it('supports custom indentSize and useTabs', () => {
    const raw = `scene demo {\nreturn\n}`;

    const formatted4 = formatVns(raw, { indentSize: 4 });
    expect(formatted4).toBe(`scene demo {\n    return\n}\n`);

    const formattedTabs = formatVns(raw, { useTabs: true });
    expect(formattedTabs).toBe(`scene demo {\n\treturn\n}\n`);
  });

  it('formats inspect statements with title and inner dialogue', () => {
    const raw = `
scene examine {
inspect gold_key title:"Chìa khóa cổ"{
"Một chiếc chìa khóa cổ xưa."
alice:"Nó rất đẹp!"
}
}
`;
    const expected = `scene examine {
  inspect gold_key title: "Chìa khóa cổ" {
    "Một chiếc chìa khóa cổ xưa."
    alice: "Nó rất đẹp!"
  }
}
`;
    const formatted = formatVns(raw, { indentSize: 2 });
    expect(formatted).toBe(expected);
  });

  it('formats golden scenario and ensures the formatted code compiles successfully', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'golden_scenario_p0.vns');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const formatted = formatVns(content, { indentSize: 2 });
    expect(formatted.length).toBeGreaterThan(100);

    // Biên dịch lại mã sau khi format
    const compileResult = compileString(formatted, 'golden_scenario_p0.vns');
    expect(compileResult.success).toBe(true);
    expect(compileResult.program).toBeDefined();
    expect(compileResult.program!.length).toBeGreaterThan(15);
  });
});
