import { zipSync, strToU8, type Zippable } from 'fflate';
import type { Project, Instruction, PublishedGameBundle, AssetRef } from '@vn-engine/shared-types';
import { PUBLISHED_BUNDLE_FORMAT_VERSION } from '@vn-engine/shared-types';

export interface BuildPublishedGameZipOptions {
  project: Project;
  program: Instruction[];
  getAssetBlob: (assetId: string) => Promise<Blob | null>;
  now?: number;
}

export interface BuildPublishedGameZipResult {
  zip: Uint8Array;
  bundle: PublishedGameBundle;
  warnings: string[];
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
};

function stripVnsExtension(name: string): string {
  return name.endsWith('.vns') ? name.slice(0, -4) : name;
}

function resolveAssetExtension(fileName: string, mimeType: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex > 0 && lastDotIndex < fileName.length - 1) {
    const rawExt = fileName.slice(lastDotIndex + 1).toLowerCase();
    if (/^[a-z0-9]{1,5}$/.test(rawExt)) {
      return rawExt;
    }
  }

  const normalizedMime = mimeType.toLowerCase();
  const matchedExt = MIME_EXTENSION_MAP[normalizedMime];
  if (matchedExt) {
    return matchedExt;
  }

  return 'bin';
}

export function resolveEntrySceneName(
  project: Project,
  program: Instruction[],
): string | undefined {
  if (!project.entryScene || typeof project.entryScene !== 'string') {
    return undefined;
  }
  const entry = project.entryScene.trim();
  if (!entry) {
    return undefined;
  }

  const sceneNames = new Set<string>();
  for (const inst of program) {
    if (inst.type === 'SCENE' && typeof inst.name === 'string' && inst.name) {
      sceneNames.add(inst.name);
    }
  }

  if (sceneNames.has(entry)) {
    return entry;
  }

  const targetFile = (project.files || []).find(f => {
    if (f.name === entry) return true;
    return stripVnsExtension(f.name) === stripVnsExtension(entry);
  });

  if (!targetFile) {
    return undefined;
  }

  const contentWithoutBlockComments = targetFile.content.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rawLine of contentWithoutBlockComments.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) {
      continue;
    }

    const match = rawLine.match(/^\s*scene\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (match && match[1]) {
      const sceneName = match[1];
      return sceneNames.has(sceneName) ? sceneName : undefined;
    }
  }

  return undefined;
}

export async function buildPublishedGameZip({
  project,
  program,
  getAssetBlob,
  now = Date.now(),
}: BuildPublishedGameZipOptions): Promise<BuildPublishedGameZipResult> {
  const warnings: string[] = [];
  const bundleAssets: AssetRef[] = [];
  const assetFiles = new Map<string, Uint8Array>();

  for (const asset of project.assets || []) {
    const storageUrl = asset.storageUrl ?? '';

    // Remote HTTP / HTTPS assets: preserve as-is without fetching blob
    if (storageUrl.startsWith('http://') || storageUrl.startsWith('https://')) {
      bundleAssets.push({ ...asset });
      continue;
    }

    const blob = await getAssetBlob(asset.id);
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const hash16 = hashHex.slice(0, 16);
      const ext = resolveAssetExtension(asset.name, blob.type);
      const relativePath = `assets/${hash16}.${ext}`;

      if (!assetFiles.has(relativePath)) {
        assetFiles.set(relativePath, bytes);
      }

      bundleAssets.push({
        ...asset,
        storageUrl: relativePath,
      });
      continue;
    }

    // No blob: check for data:image/ or data:audio/ URL
    if (storageUrl.startsWith('data:image/') || storageUrl.startsWith('data:audio/')) {
      bundleAssets.push({ ...asset });
      continue;
    }

    // Otherwise omit asset and record warning containing asset.id
    warnings.push(
      `Asset "${asset.id}" (${asset.name}) is missing backing blob data and was omitted.`,
    );
  }

  const resolvedEntry = resolveEntrySceneName(project, program);

  const bundle: PublishedGameBundle = {
    formatVersion: PUBLISHED_BUNDLE_FORMAT_VERSION,
    projectId: project.id,
    title: project.title,
    program,
    assets: bundleAssets,
    publishedAt: now,
  };

  if (project.titleSettings) {
    bundle.titleSettings = project.titleSettings;
  }

  if (resolvedEntry) {
    bundle.entryScene = resolvedEntry;
  }

  const zipEntries: Zippable = {
    'project.json': [strToU8(JSON.stringify(bundle)), { level: 6 }],
  };

  for (const [path, bytes] of assetFiles.entries()) {
    zipEntries[path] = [bytes, { level: 0 }];
  }

  const zip = zipSync(zipEntries);

  return {
    zip,
    bundle,
    warnings,
  };
}
