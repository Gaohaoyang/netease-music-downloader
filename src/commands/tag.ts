import * as fs from 'fs';
import * as path from 'path';
import { getSongInfo, searchSongs, SearchResult, getAccountSummary } from '../services/netease';
import { getDurationMs, hasExistingTags, tagFile } from '../services/tagger';
import { sanitizeFileName } from '../utils/file';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav']);

export interface TagFolderOptions {
  force?: boolean;
  dryRun?: boolean;
  minScore?: number;
  recursive?: boolean;
  delayMs?: number;
}

function listAudioFiles(dir: string, recursive: boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...listAudioFiles(full, recursive));
    } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out.sort();
}

// 解析文件名 Parse "NN.Artist-Title" / "Artist-Title" / "Title"
export function parseFileName(filePath: string): { artist?: string; title: string } {
  let stem = path.basename(filePath, path.extname(filePath));
  stem = stem.replace(/^\d+\s*[.、]\s*/, '').trim();
  const idx = stem.indexOf('-');
  if (idx > 0 && idx < stem.length - 1) {
    return { artist: stem.slice(0, idx).trim(), title: stem.slice(idx + 1).trim() };
  }
  return { title: stem };
}

function normalize(s: string): string {
  return sanitizeFileName(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  if (s.length < 2) {
    if (s) map.set(s, 1);
    return map;
  }
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    map.set(g, (map.get(g) || 0) + 1);
  }
  return map;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) || 0);
  const total = [...ga.values()].reduce((x, y) => x + y, 0) + [...gb.values()].reduce((x, y) => x + y, 0);
  return total ? (2 * overlap) / total : 0;
}

export function scoreResult(
  result: SearchResult,
  parsed: { artist?: string; title: string },
  fileDurationMs?: number
): number {
  const fullTitle = normalize(result.alias ? `${result.name} (${result.alias})` : result.name);
  const baseTitle = normalize(result.name);
  const wanted = normalize(parsed.title);
  const titleSim = Math.max(similarity(fullTitle, wanted), similarity(baseTitle, wanted));

  let artistSim = 0.5;
  if (parsed.artist) {
    const wantedArtist = normalize(parsed.artist);
    const names = result.artists.map(normalize);
    if (names[0] === wantedArtist) artistSim = 1;
    else if (names.includes(wantedArtist)) artistSim = 0.9;
    else artistSim = Math.max(0, ...names.map(n => similarity(n, wantedArtist)));
  }

  let score = parsed.artist ? 0.65 * titleSim + 0.35 * artistSim : titleSim;
  if (fileDurationMs && result.duration) {
    const diff = Math.abs(fileDurationMs - result.duration);
    if (diff <= 3000) score += 0.1;
    else if (diff > 15000) score -= 0.15;
  }
  return score;
}

async function findBestMatch(
  parsed: { artist?: string; title: string },
  fileDurationMs?: number
): Promise<{ result: SearchResult; score: number } | null> {
  const queries = [parsed.artist ? `${parsed.artist} ${parsed.title}` : parsed.title];
  if (parsed.artist) queries.push(parsed.title);

  let best: { result: SearchResult; score: number } | null = null;
  for (const query of queries) {
    const results = await searchSongs(query, 30);
    for (const result of results) {
      const score = scoreResult(result, parsed, fileDurationMs);
      if (!best || score > best.score) best = { result, score };
    }
    if (best && best.score >= 0.95) break;
  }
  return best;
}

export async function tagFolder(folder: string, options: TagFolderOptions = {}): Promise<void> {
  const root = path.resolve(folder);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`文件夹不存在 Folder not found: ${root}`);
    process.exit(1);
  }

  const minScore = options.minScore ?? 0.75;
  const delayMs = options.delayMs ?? 300;
  const files = listAudioFiles(root, options.recursive !== false);
  console.log(`\n找到 ${files.length} 个音频文件 Found ${files.length} audio files in ${root}`);
  if (options.dryRun) console.log('试运行，不会写入文件 Dry run: files will not be modified');

  const counts = { tagged: 0, skipped: 0, unmatched: 0, failed: 0 };
  const problems: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rel = path.relative(root, file);
    const prefix = `[${i + 1}/${files.length}]`;
    try {
      if (!options.force && hasExistingTags(file)) {
        counts.skipped++;
        continue;
      }

      const parsed = parseFileName(file);
      const best = await findBestMatch(parsed, getDurationMs(file));
      if (!best || best.score < minScore) {
        counts.unmatched++;
        const detail = best
          ? `最接近 closest: ${best.result.artists.join('/')}-${best.result.name} (ID ${best.result.id}, 得分 score ${best.score.toFixed(2)})`
          : '无搜索结果 no search results';
        console.log(`${prefix} 未匹配 No match: ${rel} (${detail})`);
        problems.push(`${rel} | 未匹配 no match | ${detail}`);
        continue;
      }

      const { result, score } = best;
      console.log(`${prefix} ${rel} -> ${result.artists.join('/')}-${result.name} (ID ${result.id}, ${score.toFixed(2)})`);
      if (options.dryRun) {
        counts.tagged++;
        continue;
      }

      const song = await getSongInfo(result.id);
      const lrcPath = file.slice(0, file.length - path.extname(file).length) + '.lrc';
      const lyrics = fs.existsSync(lrcPath) ? fs.readFileSync(lrcPath, 'utf8').replace(/^\uFEFF/, '') : null;
      if (await tagFile(file, { song, lyrics })) {
        counts.tagged++;
      } else {
        counts.failed++;
        problems.push(`${rel} | 写入失败 write failed | ID ${result.id}`);
      }
    } catch (error) {
      counts.failed++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${prefix} 处理失败 Failed: ${rel}: ${message}`);
      problems.push(`${rel} | 错误 error | ${message}`);
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  console.log(`\n完成 Done: ${counts.tagged} 首已${options.dryRun ? '匹配' : '写入'} ${options.dryRun ? 'matched' : 'tagged'}, ${counts.skipped} 首已有标签已跳过 already tagged (skipped), ${counts.unmatched} 首未匹配 unmatched, ${counts.failed} 首失败 failed`);

  if (problems.length > 0 && !options.dryRun) {
    const logPath = path.join(root, 'tag-problems.txt');
    fs.writeFileSync(logPath, `${(await getAccountSummary()).join('\n')}\n\n未匹配/失败 Unmatched or failed files:\n${problems.join('\n')}\n`, 'utf8');
    console.log(`问题列表已保存 Problem list saved: ${logPath}`);
  }
}
