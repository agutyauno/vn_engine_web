// ==========================================
// STAGE 5: SINH BYTECODE / IR (CODE GENERATION)
// ==========================================

import type {
  ProgramAST,
  SceneASTNode,
  StatementAST,
  Instruction,
  DialogueStatement,
  RevealStatement,
  BackgroundStatement,
  ShowStatement,
  HideStatement,
  HideDialogueStatement,
  InspectStatement,
  PlayStatement,
  StopStatement,
  ChoiceStatement,
  GotoStatement,
  CallStatement,
  ReturnStatement,
  EndStatement,
  WaitStatement,
  WhileStatement,
  IfStatement,
  VarDefineStatement,
  VarAssignStatement,
  Character,
} from '@vn-engine/shared-types';
import { buildGlobalVariableSet } from './semantic';

export class CodeGenerator {
  private instructions: Instruction[] = [];
  private loopIdCounter = 0;
  private ifIdCounter = 0;
  private characters: Character[] = [];
  private globals: Set<string> = new Set();

  constructor(characters?: Character[]) {
    if (characters) {
      this.characters = characters;
    }
  }

  public generate(ast: ProgramAST): Instruction[] {
    this.instructions = [];
    this.loopIdCounter = 0;
    this.ifIdCounter = 0;
    this.globals = buildGlobalVariableSet(ast);

    // Preamble: sinh lệnh ASSIGN toàn cục từ top-level statements
    if (ast.topLevelStatements) {
      for (const stmt of ast.topLevelStatements) {
        if (stmt.type === 'VarDefineStatement') {
          const def = stmt as VarDefineStatement;
          this.instructions.push({
            type: 'ASSIGN',
            variable: def.variable,
            value: def.value,
            scope: 'global',
            loc: def.loc,
          });
        }
      }
    }

    for (const scene of ast.scenes) {
      this.generateScene(scene);
    }

    return this.instructions;
  }

  private generateScene(scene: SceneASTNode) {
    // Cọc mốc bắt đầu Scene
    this.instructions.push({
      type: 'SCENE',
      name: scene.name,
      loc: scene.loc,
    });

    for (const stmt of scene.body) {
      this.generateStatement(scene.name, stmt);
    }

    // Cọc mốc kết thúc Scene phục vụ tự động return an toàn nếu được gọi qua call
    this.instructions.push({
      type: 'SCENE_END',
      sceneName: scene.name,
      loc: scene.loc,
    });
  }

  private generateStatement(sceneName: string, stmt: StatementAST) {
    switch (stmt.type) {
      case 'DialogueStatement': {
        const d = stmt as DialogueStatement;
        this.instructions.push({
          type: 'DIALOGUE',
          character: d.character,
          text: d.text,
          displayNameOverride: d.displayNameOverride,
          uiScreenId: d.uiScreenId,
          loc: d.loc,
        });
        break;
      }

      case 'RevealStatement': {
        const r = stmt as RevealStatement;
        this.instructions.push({
          type: 'REVEAL',
          characterId: r.characterId,
          displayName: r.displayName,
          loc: r.loc,
        });
        break;
      }

      case 'BackgroundStatement': {
        const b = stmt as BackgroundStatement;
        this.instructions.push({
          type: 'BACKGROUND',
          assetId: b.assetId,
          x: b.x,
          y: b.y,
          offsetX: b.offsetX,
          offsetY: b.offsetY,
          scale: b.scale,
          scaleX: b.scaleX,
          scaleY: b.scaleY,
          rotate: b.rotate,
          flipX: b.flipX,
          flipY: b.flipY,
          alpha: b.alpha,
          transition: b.transition,
          easing: b.easing,
          duration: b.duration,
          loc: b.loc,
        });
        break;
      }

      case 'ShowStatement': {
        const s = stmt as ShowStatement;
        let sprite = s.sprite;
        if (!sprite || sprite.trim() === '') {
          const charDef = this.characters.find(
            c => c.id.toLowerCase() === s.character.toLowerCase(),
          );
          if (charDef && charDef.sprites) {
            const keys = Object.keys(charDef.sprites);
            if (keys.includes('default')) {
              sprite = 'default';
            } else if (keys.length > 0 && keys[0]) {
              sprite = keys[0];
            } else {
              sprite = 'default';
            }
          } else {
            sprite = 'default';
          }
        }

        this.instructions.push({
          type: 'SHOW',
          character: s.character,
          sprite,
          position: s.position,
          x: s.x,
          y: s.y,
          offsetX: s.offsetX,
          offsetY: s.offsetY,
          scale: s.scale,
          scaleX: s.scaleX,
          scaleY: s.scaleY,
          rotate: s.rotate,
          flipX: s.flipX,
          flipY: s.flipY,
          alpha: s.alpha,
          transition: s.transition,
          easing: s.easing,
          duration: s.duration,
          loc: s.loc,
        });
        break;
      }

      case 'HideStatement': {
        const h = stmt as HideStatement;
        if (h.character.toLowerCase() === 'dialogue') {
          this.instructions.push({
            type: 'HIDE_DIALOGUE',
            loc: h.loc,
          });
        } else {
          this.instructions.push({
            type: 'HIDE',
            character: h.character,
            loc: h.loc,
          });
        }
        break;
      }

      case 'HideDialogueStatement': {
        const h = stmt as HideDialogueStatement;
        this.instructions.push({
          type: 'HIDE_DIALOGUE',
          loc: h.loc,
        });
        break;
      }

      case 'InspectStatement': {
        const ins = stmt as InspectStatement;
        this.instructions.push({
          type: 'INSPECT_BEGIN',
          assetId: ins.assetId,
          title: ins.title,
          loc: ins.loc,
        });
        if (ins.body) {
          for (const s of ins.body) {
            this.generateStatement(sceneName, s);
          }
        }
        this.instructions.push({
          type: 'INSPECT_END',
          loc: ins.loc,
        });
        break;
      }

      case 'PlayStatement': {
        const p = stmt as PlayStatement;
        this.instructions.push({
          type: 'PLAY',
          channel: p.channel,
          assetId: p.assetId,
          volume: p.volume,
          loop: p.loop,
          fadeIn: p.fadeIn,
          loc: p.loc,
        });
        break;
      }

      case 'StopStatement': {
        const st = stmt as StopStatement;
        this.instructions.push({
          type: 'STOP',
          channel: st.channel,
          fadeOut: st.fadeOut,
          loc: st.loc,
        });
        break;
      }

      case 'GotoStatement': {
        const g = stmt as GotoStatement;
        this.instructions.push({
          type: 'GOTO',
          targetScene: g.targetScene,
          loc: g.loc,
        });
        break;
      }

      case 'CallStatement': {
        const c = stmt as CallStatement;
        this.instructions.push({
          type: 'CALL',
          targetScene: c.targetScene,
          loc: c.loc,
        });
        break;
      }

      case 'ReturnStatement': {
        const ret = stmt as ReturnStatement;
        this.instructions.push({
          type: 'RETURN',
          loc: ret.loc,
        });
        break;
      }

      case 'EndStatement': {
        const e = stmt as EndStatement;
        this.instructions.push({
          type: 'HALT',
          loc: e.loc,
        });
        break;
      }

      case 'WaitStatement': {
        const w = stmt as WaitStatement;
        this.instructions.push({
          type: 'WAIT',
          duration: w.duration,
          loc: w.loc,
        });
        break;
      }

      case 'VarDefineStatement': {
        const vd = stmt as VarDefineStatement;
        this.instructions.push({
          type: 'ASSIGN',
          variable: vd.variable,
          value: vd.value,
          scope: 'local',
          loc: vd.loc,
        });
        break;
      }

      case 'VarAssignStatement': {
        const va = stmt as VarAssignStatement;
        const scope = this.globals.has(va.variable) ? 'global' : 'local';
        this.instructions.push({
          type: 'ASSIGN',
          variable: va.variable,
          value: va.value,
          scope,
          loc: va.loc,
        });
        break;
      }

      case 'ChoiceStatement': {
        const ch = stmt as ChoiceStatement;
        this.instructions.push({
          type: 'CHOICE',
          choices: ch.choices.map(c => ({
            text: c.text,
            action: c.action ?? 'goto',
            targetScene: c.targetScene,
            condition: c.condition,
          })),
          uiScreenId: ch.uiScreenId,
          loc: ch.loc,
        });
        break;
      }

      case 'WhileStatement': {
        const wh = stmt as WhileStatement;
        const loopId = ++this.loopIdCounter;
        const loopStartScene = `${sceneName}.__while_${loopId}_start`;
        const loopEndScene = `${sceneName}.__while_${loopId}_end`;

        this.instructions.push({
          type: 'LABEL',
          name: loopStartScene,
          loc: wh.loc,
        });

        this.instructions.push({
          type: 'LOOP_START',
          condition: wh.condition,
          loopEndTargetScene: loopEndScene,
          loc: wh.loc,
        });

        for (const bodyStmt of wh.body) {
          this.generateStatement(sceneName, bodyStmt);
        }

        this.instructions.push({
          type: 'LOOP_END',
          loopStartTargetScene: loopStartScene,
          loc: wh.loc,
        });

        this.instructions.push({
          type: 'LABEL',
          name: loopEndScene,
          loc: wh.loc,
        });

        break;
      }

      case 'IfStatement': {
        const ifStmt = stmt as IfStatement;
        const ifId = ++this.ifIdCounter;
        const ifTrueScene = `${sceneName}.__if_${ifId}_true`;
        const ifElseScene = `${sceneName}.__if_${ifId}_else`;
        const ifEndScene = `${sceneName}.__if_${ifId}_end`;

        const hasAlternate = !!ifStmt.alternate;
        const targetIfNotTrue = hasAlternate ? ifElseScene : ifEndScene;

        // Nếu điều kiện đúng, nhảy vào ifTrueScene
        this.instructions.push({
          type: 'CONDITIONAL_GOTO',
          condition: ifStmt.condition,
          targetScene: ifTrueScene,
          loc: ifStmt.loc,
        });

        // Nếu không đúng, nhảy vào else hoặc kết thúc
        this.instructions.push({
          type: 'GOTO',
          targetScene: targetIfNotTrue,
          loc: ifStmt.loc,
        });

        // Nhánh Thân (True)
        this.instructions.push({
          type: 'LABEL',
          name: ifTrueScene,
          loc: ifStmt.loc,
        });

        for (const cStmt of ifStmt.consequent) {
          this.generateStatement(sceneName, cStmt);
        }

        this.instructions.push({
          type: 'GOTO',
          targetScene: ifEndScene,
          loc: ifStmt.loc,
        });

        // Nhánh Alternate (Else / Else If)
        if (hasAlternate) {
          this.instructions.push({
            type: 'LABEL',
            name: ifElseScene,
            loc: ifStmt.loc,
          });

          if (Array.isArray(ifStmt.alternate)) {
            for (const aStmt of ifStmt.alternate) {
              this.generateStatement(sceneName, aStmt);
            }
          } else if (ifStmt.alternate) {
            this.generateStatement(sceneName, ifStmt.alternate);
          }
        }

        // Điểm kết thúc if
        this.instructions.push({
          type: 'LABEL',
          name: ifEndScene,
          loc: ifStmt.loc,
        });

        break;
      }
    }
  }
}

export function generateBytecode(ast: ProgramAST, characters?: Character[]): Instruction[] {
  const generator = new CodeGenerator(characters);
  return generator.generate(ast);
}
