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
  PlayStatement,
  StopStatement,
  ChoiceStatement,
  GotoStatement,
  CallStatement,
  ReturnStatement,
  EndStatement,
  WhileStatement,
  IfStatement,
  VarAssignStatement,
} from '@vn-engine/shared-types';

export class CodeGenerator {
  private instructions: Instruction[] = [];
  private loopIdCounter = 0;
  private ifIdCounter = 0;

  public generate(ast: ProgramAST): Instruction[] {
    this.instructions = [];
    this.loopIdCounter = 0;
    this.ifIdCounter = 0;

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
          transition: b.transition,
          loc: b.loc,
        });
        break;
      }

      case 'ShowStatement': {
        const s = stmt as ShowStatement;
        this.instructions.push({
          type: 'SHOW',
          character: s.character,
          sprite: s.sprite,
          position: s.position,
          transition: s.transition,
          duration: s.duration,
          loc: s.loc,
        });
        break;
      }

      case 'HideStatement': {
        const h = stmt as HideStatement;
        this.instructions.push({
          type: 'HIDE',
          character: h.character,
          loc: h.loc,
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

      case 'VarAssignStatement': {
        const va = stmt as VarAssignStatement;
        this.instructions.push({
          type: 'ASSIGN',
          variable: va.variable,
          value: va.value,
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
          type: 'SCENE',
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
          type: 'SCENE',
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
          type: 'SCENE',
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
            type: 'SCENE',
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
          type: 'SCENE',
          name: ifEndScene,
          loc: ifStmt.loc,
        });

        break;
      }
    }
  }
}

export function generateBytecode(ast: ProgramAST): Instruction[] {
  const generator = new CodeGenerator();
  return generator.generate(ast);
}
