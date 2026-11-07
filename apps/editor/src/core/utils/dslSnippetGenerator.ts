import type { AssetCategory } from '@vn-engine/shared-types';

export type DslSnippetCategory = AssetCategory | 'audio' | string;

export type DslSnippetEntity =
  | { type: 'character'; charId: string }
  | { type: 'expression'; charId: string; expressionKey: string }
  | {
      type: 'asset';
      assetName: string;
      category?: DslSnippetCategory;
      assetType?: string;
    };

export function generateDslSnippet(entity: DslSnippetEntity): string {
  switch (entity.type) {
    case 'character':
      return `show ${entity.charId}`;
    case 'expression':
      return `show ${entity.charId}.${entity.expressionKey}`;
    case 'asset': {
      const cleanName = entity.assetName.replace(/\.[^/.]+$/, '');
      const category = entity.category;
      if (category === 'background' || (!category && entity.assetType === 'image')) {
        return `background ${cleanName}`;
      }
      if (category === 'sprite') {
        return `show ${cleanName}`;
      }
      if (category === 'bgm') {
        return `play music "${entity.assetName}"`;
      }
      if (category === 'voice') {
        return `play voice "${entity.assetName}"`;
      }
      if (category === 'audio' || category === 'sfx') {
        return `play sound "${entity.assetName}"`;
      }
      return `background ${cleanName}`;
    }
  }
}
