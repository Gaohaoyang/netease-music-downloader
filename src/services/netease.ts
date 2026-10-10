import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Song, AlbumInfo, PlaylistInfo } from '../types';
import { getAutoProxy } from './proxy';

// 网易云音乐 API 加密参数
const presetKey = '0CoJUm6Qyw8W8jud';
const iv = '0102030405060708';
const eapiKey = 'e82ckenh8dichen8';
const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export let proxyConfig: AxiosRequestConfig | undefined;

export function setProxy(proxyUrl: string | undefined, silent = false) {
  if (proxyUrl) {
    proxyConfig = {
      proxy: {
        protocol: proxyUrl.startsWith('https') ? 'https' : 'http',
        host: new URL(proxyUrl).hostname,
        port: parseInt(new URL(proxyUrl).port),
      }
    };
    if (!silent) console.log('代理已设置 Proxy configured:', proxyUrl);
  } else {
    proxyConfig = undefined;
  }
}

const GUEST_NMTID = '00OJ_vv9oqXwqq8TQFLFUbVeZz059kAAAGMqWD4yw';
const guestNuid = randomBytes(16).toString('hex');

let userCookie: string | undefined;
let cookieHintShown = false;

// 接受纯 MUSIC_U 值或完整 Cookie 字符串 Accept a bare MUSIC_U value or a full cookie string
export function normalizeCookie(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let value = raw.replace(/[\r\n]+/g, ' ').trim();
  value = value.replace(/^cookie:\s*/i, '').replace(/^["']|["']$/g, '').trim();
  if (!value) return undefined;
  return value.includes('=') ? value : `MUSIC_U=${value}`;
}

// Cookie 持久化文件 Persisted cookie file (override dir with NETEASE_CONFIG_DIR)
export function getCookieFilePath(): string {
  const dir = process.env.NETEASE_CONFIG_DIR || path.join(os.homedir(), '.netease-music-downloader');
  return path.join(dir, 'cookie');
}

export function readStoredCookie(): string | undefined {
  try {
    return normalizeCookie(fs.readFileSync(getCookieFilePath(), 'utf8'));
  } catch {
    return undefined;
  }
}

export function saveStoredCookie(raw: string): boolean {
  const cookie = normalizeCookie(raw);
  if (!cookie) return false;
  const file = getCookieFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, cookie + '\n', { encoding: 'utf8', mode: 0o600 });
  return true;
}

export function clearStoredCookie(): boolean {
  try {
    fs.unlinkSync(getCookieFilePath());
    return true;
  } catch {
    return false;
  }
}

// 显示时隐藏内容 Masked summary, never reveals the value
export function describeCookie(cookie: string | undefined): string {
  if (!cookie) return '未设置 not set';
  const names = cookie.split(';').map(kv => kv.split('=')[0].trim()).filter(Boolean);
  return `已设置 set (${names.join(', ')}; ${cookie.length} chars)`;
}

// 优先级 Priority: --cookie > NETEASE_COOKIE > NETEASE_MUSIC_U > 保存的文件 saved cookie file
export function initCookie(cliValue?: string): void {
  const override = cliValue || process.env.NETEASE_COOKIE || process.env.NETEASE_MUSIC_U;
  userCookie = normalizeCookie(override) || readStoredCookie();
  if (userCookie) {
    console.log(`已使用自定义 Cookie Using ${normalizeCookie(override) ? 'provided' : 'saved'} cookie (value hidden)`);
  }
}

export function hasUserCookie(): boolean {
  return !!userCookie;
}

function buildCookie(): string {
  const parts = userCookie ? [userCookie.replace(/;\s*$/, '')] : [];
  const hasName = (name: string) =>
    parts.some(part => part.split(';').some(kv => kv.trim().toLowerCase().startsWith(name.toLowerCase() + '=')));
  if (!hasName('NMTID')) parts.push(`NMTID=${GUEST_NMTID}`);
  if (!hasName('_ntes_nuid')) parts.push(`_ntes_nuid=${guestNuid}`);
  return parts.join('; ');
}

function getHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CloudMusic/2.5.1',
    'Referer': 'https://music.163.com/',
    'Origin': 'https://music.163.com',
    'Cookie': buildCookie(),
  };
}

// 未配置 Cookie 时只提示一次 Print a one-time hint when no cookie is configured
export function showCookieHintOnce(): void {
  if (userCookie || cookieHintShown) return;
  cookieHintShown = true;
  console.log('提示：当前未配置登录 Cookie，以游客身份访问，VIP/付费歌曲可能无法下载。可运行 `cookie set <MUSIC_U>` 保存，或使用 --cookie / 环境变量 NETEASE_MUSIC_U。\nHint: No login cookie configured (guest mode); VIP/paid songs may be unavailable. Run `cookie set <MUSIC_U>` or use --cookie / the NETEASE_MUSIC_U env var.');
}

export function describeApiCode(code: number | string | undefined, message?: string): string {
  const base = `API 返回错误 API returned error: code=${code ?? 'unknown'}${message ? `, message=${message}` : ''}`;
  const c = Number(code);
  let hint = '';
  if (c === 301) {
    hint = hasUserCookie()
      ? '未登录或 Cookie 已失效，请重新获取 MUSIC_U。Not logged in or cookie invalid/expired; get a fresh MUSIC_U.'
      : '未登录，请使用 --cookie 提供 MUSIC_U。Not logged in; provide MUSIC_U via --cookie.';
  } else if (c === -460 || c === 403) {
    hint = '请求被风控拦截，可能是 IP 或地区受限（反爬）。Blocked by anti-bot, or your IP/region is restricted.';
  } else if (c === 404) {
    hint = '资源不存在或已下架。Resource not found or removed.';
  } else if (c === 429 || c === -447) {
    hint = '请求过于频繁，请稍后重试。Too many requests; retry later.';
  }
  return hint ? `${base}。${hint}` : base;
}

// 连接层错误（无响应或代理自身报错），区别于歌曲本身不可用
// Connection-level failure (no response, or the proxy itself erroring), as opposed to a song being unavailable
export function isConnectionError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  return [407, 502, 503, 504].includes(error.response.status);
}

export function describeNetworkError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return describeApiCode(error.response.status, error.response.statusText) + ' (HTTP)';
    }
    const code = error.code;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return '请求超时 Request timed out，请检查网络或使用 --auto-proxy。Check your network or use --auto-proxy.';
    }
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EAI_AGAIN') {
      return `网络连接失败 Network error (${code})，请检查网络/代理设置。Check your network/proxy settings.`;
    }
    return `网络请求失败 Network request failed: ${error.message}`;
  }
  return `未知错误 Unknown error: ${error instanceof Error ? error.message : String(error)}`;
}

// 根据 fee 字段解释无法获取 URL 的原因 Explain a null url using the fee field
function describeFee(fee: any): string | undefined {
  switch (Number(fee)) {
    case 1: return 'VIP 专属歌曲 VIP-only song (fee=1)';
    case 4: return '需单独购买数字专辑 Requires purchasing the album (fee=4)';
    case 8: return '高音质需要 VIP，普通音质可免费 High quality requires VIP (fee=8)';
    default: return undefined;
  }
}

export function formatUnavailableHelp(reason: string | undefined, autoProxy?: boolean): string {
  const lines = [reason || '未知原因 Unknown reason'];
  const steps: string[] = [];
  if (!hasUserCookie()) steps.push('`cookie set <MUSIC_U>` / --cookie <MUSIC_U>');
  if (!autoProxy) steps.push('--auto-proxy');
  if (steps.length) {
    lines.push(`建议 Suggestion: 尝试 try ${steps.join(' / ')}`);
  }
  return lines.join('\n');
}

// 音质等级，按优先级排序
const QUALITY_LEVELS = ['hires', 'lossless', 'exhigh', 'higher', 'standard'];
const QUALITY_BITRATES = {
  'standard': '128000',
  'higher': '192000',
  'exhigh': '320000',
  'lossless': '999000',
  'hires': '999000'
};

function getRandomString(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += base62[Math.floor(Math.random() * base62.length)];
  }
  return result;
}

function aesEncrypt(buffer: Buffer | string, mode: string, key: string, iv: string) {
  const keyBuffer = Buffer.from(key).slice(0, 16);
  const ivBuffer = Buffer.from(iv).slice(0, 16);
  const cipher = createCipheriv('aes-128-' + mode, keyBuffer, ivBuffer);
  cipher.setAutoPadding(true);
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function eapi(url: string, obj: any) {
  const text = JSON.stringify(obj);
  const message = `nobody${url}use${text}md5forencrypt`;
  const digest = createHash('md5').update(message).digest('hex');
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return {
    params: aesEncrypt(data, 'ecb', eapiKey, '').toString('hex').toUpperCase()
  };
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'arraybuffer',
      ...proxyConfig
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('下载封面图片失败 Failed to download cover image:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export async function getSongInfo(id: string): Promise<Song> {
  try {
    const url = '/api/v3/song/detail';
    const data = {
      c: JSON.stringify([{ id }]),
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    };

    const { params } = eapi(url, data);
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/v3/song/detail',
      new URLSearchParams({
        params
      }).toString(),
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        },
        ...proxyConfig
      }
    );

    const song = response.data?.songs?.[0];
    if (!song) throw new Error('获取歌曲信息失败 Failed to get song info');

    const artists = song.ar?.map((artist: any) => ({
      name: artist.name || '未知歌手 Unknown Artist'
    })) || [{ name: '未知歌手 Unknown Artist' }];

    return {
      id: song.id.toString(),
      name: `${song.name}${song.alia?.length ? ` (${song.alia[0]})` : ''}`,
      artists,
      album: {
        name: song.al?.name || '',
        picUrl: song.al?.picUrl
      },
      duration: song.dt, // duration in milliseconds
      publishTime: song.publishTime,
      trackNumber: song.no
    };
  } catch (error) {
    console.error('获取歌曲信息失败 Failed to get song info:', axios.isAxiosError(error) ? describeNetworkError(error) : (error instanceof Error ? error.message : 'Unknown error'));
    throw error; // 直接抛出错误，而不是返回默认值
  }
}

export async function getAlbumInfo(albumId: string): Promise<AlbumInfo> {
  try {
    const url = '/api/v1/album/' + albumId;
    const data = {
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    };

    const { params } = eapi(url, data);
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/v1/album/' + albumId,
      new URLSearchParams({
        params
      }).toString(),
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        }
      }
    );

    if (response.data?.code !== 200) {
      throw new Error(describeApiCode(response.data?.code, response.data?.message));
    }

    const album = response.data?.album;
    if (!album) {
      throw new Error('获取专辑信息失败 Failed to get album info');
    }

    const songs = response.data?.songs || [];
    const songList = songs.map((song: any) => {
      const artists = song.ar?.map((artist: any) => ({
        name: artist.name || '未知歌手 Unknown Artist'
      })) || [{ name: '未知歌手 Unknown Artist' }];

      return {
        id: song.id.toString(),
        name: `${song.name}${song.alia?.length ? ` (${song.alia[0]})` : ''}`,
        artists,
        album: {
          name: album.name || '',
          picUrl: album.picUrl
        },
        duration: song.dt,
        publishTime: song.publishTime,
        trackNumber: song.no
      };
    });

    const albumArtists = album.artists?.map((artist: any) => artist.name).filter(Boolean) || ['未知歌手 Unknown Artist'];
    const albumArtistName = albumArtists.join(',');

    return {
      songs: songList,
      albumName: album.name || '',
      artistName: albumArtistName,
      picUrl: album.picUrl,
      publishTime: album.publishTime
    };
  } catch (error) {
    console.error('获取专辑信息失败 Failed to get album info:', axios.isAxiosError(error) ? describeNetworkError(error) : (error instanceof Error ? error.message : 'Unknown error'));
    return {
      songs: [],
      albumName: '',
      artistName: '未知歌手 Unknown Artist'
    };
  }
}

interface SongUrlResult {
  url: string | null;
  reason?: string;
  // 接口级错误，换音质重试没有意义 API/network-level failure; other qualities will not help
  fatal?: boolean;
  networkError?: boolean;
}

export interface SearchResult {
  id: string;
  name: string;
  alias?: string;
  artists: string[];
  album: string;
  duration?: number;
}

export async function searchSongs(keyword: string, limit = 30): Promise<SearchResult[]> {
  const response = await axios.post(
    'https://music.163.com/api/cloudsearch/pc',
    new URLSearchParams({ s: keyword, type: '1', limit: String(limit), offset: '0', total: 'true' }).toString(),
    {
      headers: { ...getHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      ...proxyConfig
    }
  );
  if (response.data?.code !== 200) {
    throw new Error(describeApiCode(response.data?.code, response.data?.message));
  }
  return (response.data?.result?.songs || []).map((s: any) => ({
    id: String(s.id),
    name: s.name || '',
    alias: s.alia?.[0],
    artists: (s.ar || []).map((a: any) => a.name).filter(Boolean),
    album: s.al?.name || '',
    duration: s.dt
  }));
}

function parseSong(song: any): Song {
  const artists = song.ar?.map((artist: any) => ({
    name: artist.name || '未知歌手 Unknown Artist'
  })) || [{ name: '未知歌手 Unknown Artist' }];
  return {
    id: song.id.toString(),
    name: `${song.name}${song.alia?.length ? ` (${song.alia[0]})` : ''}`,
    artists,
    album: { name: song.al?.name || '', picUrl: song.al?.picUrl },
    duration: song.dt,
    publishTime: song.publishTime,
    trackNumber: song.no
  };
}

// 批量获取歌曲详情，保持传入顺序 Batch song details, preserving the given order
async function getSongsByIds(ids: string[]): Promise<Song[]> {
  const BATCH = 100;
  const byId = new Map<string, Song>();
  for (let start = 0; start < ids.length; start += BATCH) {
    const batch = ids.slice(start, start + BATCH);
    const url = '/api/v3/song/detail';
    const { params } = eapi(url, {
      c: JSON.stringify(batch.map(id => ({ id }))),
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    });
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/v3/song/detail',
      new URLSearchParams({ params }).toString(),
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        },
        timeout: 15000,
        ...proxyConfig
      }
    );
    for (const song of response.data?.songs || []) {
      byId.set(song.id.toString(), parseSong(song));
    }
  }
  return ids.map(id => byId.get(id)).filter((s): s is Song => !!s);
}

export async function getPlaylistInfo(playlistId: string): Promise<PlaylistInfo> {
  try {
    const url = '/api/v6/playlist/detail';
    const { params } = eapi(url, {
      id: playlistId,
      n: 100000,
      s: 8,
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    });
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/v6/playlist/detail',
      new URLSearchParams({ params }).toString(),
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        },
        timeout: 15000,
        ...proxyConfig
      }
    );

    if (response.data?.code !== 200) {
      let message = describeApiCode(response.data?.code, response.data?.message);
      if (Number(response.data?.code) === 404 || Number(response.data?.code) === 401) {
        message += '。歌单不存在，或为私密歌单（请先 `cookie set` 登录）。Playlist not found, or it is private (log in via `cookie set`).';
      }
      throw new Error(message);
    }

    const playlist = response.data?.playlist;
    if (!playlist) throw new Error('获取歌单信息失败 Failed to get playlist info');

    const trackIds: string[] = (playlist.trackIds || []).map((t: any) => t.id.toString());
    let songs: Song[];
    if (trackIds.length > 0) {
      songs = await getSongsByIds(trackIds);
    } else {
      songs = (playlist.tracks || []).map(parseSong);
    }
    if (songs.length < trackIds.length) {
      console.log(`警告：${trackIds.length - songs.length} 首歌曲详情获取失败 Warning: failed to load details for ${trackIds.length - songs.length} tracks`);
    }

    return {
      songs,
      playlistName: playlist.name || `playlist-${playlistId}`,
      creatorName: playlist.creator?.nickname || '未知用户 Unknown User',
      picUrl: playlist.coverImgUrl
    };
  } catch (error) {
    console.error('获取歌单信息失败 Failed to get playlist info:', axios.isAxiosError(error) ? describeNetworkError(error) : (error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
}

// 通过歌曲详情的 privilege 判断是否因版权下架：st<0 表示已下架/无版权
// Use the detail endpoint's privilege.st (<0 = removed / no copyright) to tell copyright removal from other causes
const copyrightCache = new Map<string, string | null>();

async function getCopyrightVerdict(id: string): Promise<string | null> {
  if (copyrightCache.has(id)) return copyrightCache.get(id)!;
  let verdict: string | null = null;
  try {
    const url = '/api/v3/song/detail';
    const { params } = eapi(url, {
      c: JSON.stringify([{ id }]),
      header: { os: 'iOS', appver: '2.5.1', deviceId: randomBytes(8).toString('hex').toUpperCase() }
    });
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/v3/song/detail',
      new URLSearchParams({ params }).toString(),
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        },
        timeout: 10000,
        ...proxyConfig
      }
    );
    const song = response.data?.songs?.[0];
    const priv = response.data?.privileges?.[0];
    if (!song && !priv) {
      verdict = '歌曲已不存在 Song no longer exists on NetEase (not returned by the detail API)';
    } else if (priv && Number(priv.st) < 0) {
      verdict = priv.toast
        ? `灰色歌曲：平台提示「因版权保护暂时无法使用」，可能是版权下架，也可能是地区限制，接口无法区分 Greyed out (privilege.st=${priv.st}) with NetEase's "unavailable due to copyright protection" notice: either removed for copyright or region-locked, the API cannot tell which. Try a Chinese proxy (--auto-proxy); if it still fails it is most likely removed`
        : `灰色歌曲，当前不可播放 Greyed out / unplayable (privilege.st=${priv.st}); the API does not say why`;
    } else if (song?.noCopyrightRcmd) {
      verdict = '平台标记了 noCopyrightRcmd，可能无版权（该字段并不确定）NetEase set noCopyrightRcmd; possibly no copyright (this field is not conclusive)';
    } else if (priv && Number(priv.fee) === 1 && Number(priv.pl) === 0) {
      verdict = '不是版权问题：VIP 专属歌曲，请使用 VIP 账号的 cookie NOT a copyright removal: VIP-only, use a VIP account cookie';
    } else if (priv && Number(priv.fee) === 4) {
      verdict = '不是版权问题：需单独购买 NOT a copyright removal: requires separate purchase';
    } else if (priv) {
      verdict = `未发现下架标记（st=${priv.st}, fee=${priv.fee}），更可能是登录/地区/IP 限制 No takedown flag found (st=${priv.st}, fee=${priv.fee}); more likely a login, region or IP restriction`;
    }
  } catch {
    verdict = null;
  }
  copyrightCache.set(id, verdict);
  return verdict;
}

async function getSongUrl(id: string, level: string): Promise<SongUrlResult> {
  try {
    const url = '/api/song/enhance/player/url/v1';
    const data = {
      ids: [id],
      level,
      encodeType: 'aac',
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    };

    const { params } = eapi(url, data);
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/song/enhance/player/url/v1',
      new URLSearchParams({
        params
      }).toString(),
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        },
        timeout: 10000,
        ...proxyConfig
      }
    );

    if (response.data?.code !== 200) {
      return { url: null, fatal: true, reason: describeApiCode(response.data?.code, response.data?.message) };
    }

    const songData = response.data?.data?.[0];
    if (!songData?.url) {
      const details: string[] = [];
      const feeText = describeFee(songData?.fee);
      if (feeText) details.push(feeText);
      if (songData?.freeTrialInfo) details.push('仅支持试听 Only a free trial is offered (freeTrialInfo present)');
      if (songData?.code !== undefined && songData.code !== 200) {
        const itemCode = Number(songData.code);
        if (itemCode === -110 || itemCode === 404) details.push(`无版权或已下架 No copyright / removed (item code=${songData.code})`);
        else if (itemCode === 403 || itemCode === -460) details.push(`访问被拒绝，可能是 IP/地区限制 Access denied, possibly IP/region restriction (item code=${songData.code})`);
        else details.push(`item code=${songData.code}`);
      }
      const causes = '可能原因 Possible causes: 游客/未登录 guest or not logged in; VIP/付费专属 VIP-only or paid; 地区/IP 限制 region/IP restriction; 无版权 no copyright';
      const verdict = await getCopyrightVerdict(id);
      const reason = `接口返回 200 但没有下载链接 API returned 200 but no download URL for ${level}${details.length ? ` (${details.join('; ')})` : ''}。${verdict ? `\n${verdict}` : causes}`;
      return { url: null, reason };
    }

    if (songData.freeTrialInfo) {
      console.log('警告：该链接可能仅为试听片段 Warning: this URL may be a trial clip only');
    }

    console.log(`获取到音质 Quality: ${level}, 比特率 Bitrate: ${Math.floor(songData.br / 1000)}kbps, 格式 Format: ${songData.type}, URL: ${songData.url}`);
    return { url: songData.url };
  } catch (error) {
    return { url: null, fatal: true, reason: describeNetworkError(error), networkError: isConnectionError(error) };
  }
}

export async function checkSongAvailability(id: string): Promise<{
  available: boolean;
  contentLength?: number;
  url?: string;
  quality?: string;
  bitrate?: number;
  type?: string;
  reason?: string;
  networkError?: boolean;
}> {
  let reason: string | undefined;
  let networkError = false;
  // 尝试获取最高音质
  for (const level of QUALITY_LEVELS) {
    const result = await getSongUrl(id, level);
    if (!result.url) {
      reason = reason || result.reason;
      if (result.networkError) networkError = true;
      if (result.fatal) break;
      continue;
    }
    const url = result.url;
    try {
      const response = await axios.head(url, {
        maxRedirects: 5,
        validateStatus: status => status >= 200 && status < 400,
        headers: {
          ...getHeaders(),
          'Referer': 'https://music.163.com/'
        },
        timeout: 10000,
        ...proxyConfig
      });

      const contentLength = parseInt(response.headers['content-length'], 10);
      if (contentLength > 500 * 1024) { // 大于 500KB
        return {
          available: true,
          contentLength,
          url,
          quality: level,
          bitrate: Math.floor(contentLength * 8 / (response.headers['content-duration'] || 300) / 1000), // 估算比特率
          type: url.split('.').pop()?.split('?')[0]
        };
      }
      reason = reason || `文件过小，可能是试听片段 File too small (${Number.isNaN(contentLength) ? 'unknown' : contentLength} bytes), possibly a trial clip (${level})`;
    } catch (error) {
      reason = reason || `HEAD 检查失败 HEAD check failed (${level}): ${describeNetworkError(error)}`;
      if (isConnectionError(error)) networkError = true;
    }
  }

  return { available: false, reason, networkError };
}

export async function getLyrics(id: string): Promise<string | null> {
  try {
    const url = '/api/song/lyric/v1';
    const data = {
      id,
      lv: 1,
      kv: 1,
      tv: -1,
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    };

    const { params } = eapi(url, data);
    const apiUrl = 'https://interface3.music.163.com/eapi/song/lyric/v1';
    console.log('歌词链接 Lyrics URL:', `https://music.163.com/api/song/lyric?id=${id}&lv=1&kv=1&tv=-1`);

    const response = await axios.post(
      apiUrl,
      new URLSearchParams({
        params
      }).toString(),
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        },
        ...proxyConfig
      }
    );

    if (response.data?.code !== 200) {
      console.error('获取歌词失败 Failed to get lyrics:', describeApiCode(response.data?.code, response.data?.message));
      return null;
    }

    const lrc = response.data?.lrc?.lyric;
    if (!lrc) {
      console.log('该歌曲无歌词 No lyrics available for this song');
      return null;
    }

    return lrc;
  } catch (error) {
    console.error('获取歌词失败 Failed to get lyrics:', describeNetworkError(error));
    return null;
  }
}

// 找到可用代理后沿用，不再为每首失败的歌曲重新搜索代理
// Once a working proxy is found it is reused; it is only replaced after repeated connection failures
let stickyProxyUrl: string | undefined;
let stickyProxyFailures = 0;
const MAX_STICKY_PROXY_FAILURES = 3;

export async function checkSongAvailabilityWithRetry(id: string, autoProxy?: boolean): Promise<{
  available: boolean;
  contentLength?: number;
  url?: string;
  needProxy?: boolean;
  quality?: string;
  bitrate?: number;
  type?: string;
  reason?: string;
}> {
  showCookieHintOnce();
  let reason: string | undefined;

  if (autoProxy && stickyProxyUrl) {
    setProxy(stickyProxyUrl, true);
    const result = await checkSongAvailability(id);
    if (result.available) {
      stickyProxyFailures = 0;
      return { ...result, needProxy: true };
    }
    if (!result.networkError) {
      // 歌曲本身的问题，代理没问题 The song is the problem, not the proxy
      stickyProxyFailures = 0;
      return { available: false, needProxy: true, reason: result.reason };
    }
    stickyProxyFailures++;
    if (stickyProxyFailures < MAX_STICKY_PROXY_FAILURES) {
      return { available: false, needProxy: true, reason: result.reason };
    }
    console.log(`当前代理连续 ${MAX_STICKY_PROXY_FAILURES} 次连接失败，重新寻找代理 Current proxy failed ${MAX_STICKY_PROXY_FAILURES} times in a row, finding a new one...`);
    stickyProxyUrl = undefined;
    stickyProxyFailures = 0;
  }

  // 先尝试直连
  console.log('尝试直连下载 Trying direct connection...');
  const originalProxy = proxyConfig;
  setProxy(undefined);

  try {
    const result = await checkSongAvailability(id);
    if (result.available) {
      console.log('直连成功 Direct connection successful');
      return { ...result, needProxy: false };
    }
    reason = result.reason;
    console.log('直连失败 Direct connection failed:', reason || 'unknown');
  } catch (error) {
    reason = describeNetworkError(error);
    console.log('直连失败 Direct connection failed:', reason);
  }

  // 如果直连失败且启用了自动代理，尝试寻找可用代理
  if (autoProxy) {
    console.log('正在寻找可用的代理服务器 Finding available proxy server...');
    const proxyUrl = await getAutoProxy();
    if (proxyUrl) {
      stickyProxyUrl = proxyUrl;
      stickyProxyFailures = 0;
      try {
        const result = await checkSongAvailability(id);
        if (!result.available) {
          reason = result.reason || reason;
          console.log('代理连接也失败了 Proxy connection also failed:', result.reason || 'unknown');
        }
        return { ...result, needProxy: true, reason: result.available ? undefined : reason };
      } catch (error) {
        reason = describeNetworkError(error);
        console.log('代理连接也失败了 Proxy connection also failed:', reason);
      }
    } else {
      console.log('未找到可用的代理服务器 No available proxy found');
    }
  }
  // 如果有预设的代理配置，尝试使用
  else if (originalProxy?.proxy && typeof originalProxy.proxy !== 'boolean') {
    console.log('尝试使用预设代理 Trying with preset proxy...');
    const proxyUrl = `${originalProxy.proxy.protocol}://${originalProxy.proxy.host}:${originalProxy.proxy.port}`;
    setProxy(proxyUrl);
    try {
      const result = await checkSongAvailability(id);
      if (!result.available) {
        reason = result.reason || reason;
        console.log('代理连接也失败了 Proxy connection also failed:', result.reason || 'unknown');
      }
      return { ...result, needProxy: true, reason: result.available ? undefined : reason };
    } catch (error) {
      reason = describeNetworkError(error);
      console.log('代理连接也失败了 Proxy connection also failed:', reason);
    }
  }

  return { available: false, needProxy: false, reason };
}

export async function eapiPost(path: string, extra: Record<string, unknown> = {}): Promise<any> {
  const { params } = eapi(`/api/${path}`, {
    ...extra,
    header: { os: 'iOS', appver: '2.5.1', deviceId: randomBytes(8).toString('hex').toUpperCase() }
  });
  const response = await axios.post(
    `https://interface3.music.163.com/eapi/${path}`,
    new URLSearchParams({ params }).toString(),
    {
      headers: {
        ...getHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
      },
      timeout: 10000,
      ...proxyConfig
    }
  );
  return response.data;
}

export interface AccountStatus {
  loggedIn: boolean;
  nickname?: string;
  userId?: string;
  vip?: boolean;
  vipType?: number;
  vipExpire?: number;
  svip?: boolean;
  musicPackage?: boolean;
}

// 查询当前 Cookie 的登录/VIP 状态 Query login/VIP status of the cookie currently in use
export async function getAccountStatus(): Promise<AccountStatus> {
  const account = await eapiPost('nuser/account/get');
  if (!account?.account || !account?.profile) return { loggedIn: false };
  const status: AccountStatus = {
    loggedIn: true,
    nickname: account.profile.nickname,
    userId: String(account.account.id ?? account.profile.userId ?? ''),
    vipType: Number(account.account.vipType ?? 0)
  };
  status.vip = status.vipType! > 0;
  try {
    const vip = await eapiPost('music-vip-membership/front/vip/info', { userId: status.userId });
    const d = vip?.data;
    const assoc = d?.associator;
    const musicPackage = d?.musicPackage;
    if (assoc?.expireTime || musicPackage?.expireTime) {
      const now = Date.now();
      const expiries = [assoc?.expireTime, musicPackage?.expireTime].filter((x: any) => typeof x === 'number' && x > 0);
      status.vipExpire = Math.max(...expiries);
      status.vip = expiries.some((x: number) => x > now) || status.vip;
    }
    // redplus (vipCode 300) 才是黑胶SVIP；musicPackage (220) 是付费音乐包 redplus is SVIP; musicPackage is the paid music package
    if (d?.redplus?.expireTime > Date.now()) status.svip = true;
    if (musicPackage?.expireTime > Date.now()) status.musicPackage = true;
  } catch {
    // VIP 详情是可选信息 VIP details are optional
  }
  return status;
}

let accountSummaryCache: string[] | undefined;

// 登录用户与会员等级的两行摘要（仅查询一次）Two-line login/membership summary, fetched once per run
export async function getAccountSummary(): Promise<string[]> {
  if (accountSummaryCache) return accountSummaryCache;
  let lines: string[];
  try {
    const s = await getAccountStatus();
    if (!s.loggedIn) {
      lines = [
        '登录状态 Logged in as: 游客 Guest (未登录或 Cookie 已失效 not logged in or cookie invalid)',
        '会员权限 Membership: 无 None'
      ];
    } else {
      const expire = s.vipExpire ? new Date(s.vipExpire).toLocaleDateString() : undefined;
      const level = s.vip
        ? `VIP${s.svip ? ' (SVIP)' : ''}${s.musicPackage ? ' + 付费音乐包 music package' : ''}${expire ? `, 到期 expires ${expire}` : ''} (vipType=${s.vipType})`
        : '非 VIP Not VIP';
      lines = [`登录状态 Logged in as: ${s.nickname} (id ${s.userId})`, `会员权限 Membership: ${level}`];
    }
  } catch (error) {
    lines = [
      `登录状态 Logged in as: 未知 Unknown (${describeNetworkError(error)})`,
      '会员权限 Membership: 未知 Unknown'
    ];
  }
  accountSummaryCache = lines;
  return lines;
}
