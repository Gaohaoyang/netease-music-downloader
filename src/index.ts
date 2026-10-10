#!/usr/bin/env node

import { program } from 'commander';
import { downloadSong } from './commands/download';
import { downloadAlbum } from './commands/album';
import { downloadSongLyrics, downloadAlbumLyrics } from './commands/lyrics';
import { tagFolder } from './commands/tag';
import { setTaggingEnabled } from './services/tagger';
import { downloadPlaylist, downloadPlaylistLyrics } from './commands/playlist';
import { setProxy, initCookie, normalizeCookie, saveStoredCookie, clearStoredCookie, readStoredCookie, describeCookie, getCookieFilePath, getAccountStatus, getAccountSummary } from './services/netease';
import { getAutoProxy } from './services/proxy';
import * as fs from 'fs';

program
  .name('netease-downloader')
  .description('网易云音乐下载工具 NetEase Cloud Music Downloader')
  .version('1.0.0')
  .option('-p, --proxy <url>', '设置代理服务器 Set proxy server (e.g. http://127.0.0.1:7890)')
  .option('-a, --auto-proxy', '当直连失败时自动寻找可用的中国代理服务器 Auto find available Chinese proxy server when direct connection fails')
  .option('-c, --cookie <value>', '临时覆盖已保存的 Cookie（MUSIC_U 值或完整字符串）；环境变量 NETEASE_MUSIC_U / NETEASE_COOKIE 同理 One-off override of the saved cookie (MUSIC_U value or full string); env NETEASE_MUSIC_U / NETEASE_COOKIE also override')
  .option('--no-tags', '不写入元数据（标签/封面/歌词）Do not write metadata tags (tags/cover/lyrics) into downloaded files')
  .hook('preAction', async (thisCommand, actionCommand) => {
    const options = thisCommand.opts();
    initCookie(options.cookie);
    if (options.tags === false) setTaggingEnabled(false);
    if (options.proxy) {
      setProxy(options.proxy);
    }
    if (actionCommand.parent?.name() !== 'cookie' && actionCommand.name() !== 'cookie') {
      console.log((await getAccountSummary()).join('\n') + '\n');
    }
  });

program
  .command('download')
  .description('下载单个或多个音乐 Download single or multiple songs')
  .argument('[ids...]', '音乐ID列表 List of music IDs')
  .option('-f, --file <file>', '从文件读取ID列表 Read ID list from file')
  .action(async (ids: string[], options: { file?: string }) => {
    let musicIds = ids || [];

    if (options.file) {
      try {
        const fileContent = fs.readFileSync(options.file, 'utf8');
        const fileIds = fileContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        musicIds = [...musicIds, ...fileIds];
      } catch (error) {
        console.error('读取文件失败 Failed to read file:', error);
        process.exit(1);
      }
    }

    musicIds = [...new Set(musicIds)];

    if (musicIds.length === 0) {
      console.error('请提供音乐ID Please provide music ID(s)');
      process.exit(1);
    }

    console.log(`准备下载 Preparing to download ${musicIds.length} 首歌曲 songs`);

    for (const id of musicIds) {
      await downloadSong(id, undefined, { autoProxy: program.opts().autoProxy });
    }

    console.log('\n所有下载任务完成！All download tasks completed!');
  });

program
  .command('album')
  .description('下载整张专辑 Download full album')
  .argument('<albumId>', '专辑ID或URL Album ID or URL')
  .action(async (albumId: string) => {
    await downloadAlbum(albumId, undefined, { autoProxy: program.opts().autoProxy });
  });

program
  .command('lyrics')
  .description('下载单个或多个音乐的歌词 Download lyrics for single or multiple songs')
  .argument('[ids...]', '音乐ID列表 List of music IDs')
  .option('-f, --file <file>', '从文件读取ID列表 Read ID list from file')
  .action(async (ids: string[], options: { file?: string }) => {
    let musicIds = ids || [];

    if (options.file) {
      try {
        const fileContent = fs.readFileSync(options.file, 'utf8');
        const fileIds = fileContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        musicIds = [...musicIds, ...fileIds];
      } catch (error) {
        console.error('读取文件失败 Failed to read file:', error);
        process.exit(1);
      }
    }

    musicIds = [...new Set(musicIds)];

    if (musicIds.length === 0) {
      console.error('请提供音乐ID Please provide music ID(s)');
      process.exit(1);
    }

    console.log(`准备下载 Preparing to download lyrics for ${musicIds.length} 首歌曲 songs`);

    for (const id of musicIds) {
      await downloadSongLyrics(id);
    }

    console.log('\n所有歌词下载任务完成！All lyrics download tasks completed!');
  });

program
  .command('album-lyrics')
  .description('下载整张专辑的歌词 Download lyrics for full album')
  .argument('<albumId>', '专辑ID或URL Album ID or URL')
  .action(async (albumId: string) => {
    await downloadAlbumLyrics(albumId);
  });

program
  .command('playlist')
  .description('下载整个歌单 Download full playlist')
  .argument('<playlistId>', '歌单ID或URL Playlist ID or URL')
  .option('--force', '重新下载已存在的歌曲（默认跳过）Re-download songs that already exist (skipped by default)')
  .action(async (playlistId: string, options: { force?: boolean }) => {
    await downloadPlaylist(playlistId, { autoProxy: program.opts().autoProxy, force: options.force });
  });

program
  .command('playlist-lyrics')
  .description('下载整个歌单的歌词 Download lyrics for full playlist')
  .argument('<playlistId>', '歌单ID或URL Playlist ID or URL')
  .action(async (playlistId: string) => {
    await downloadPlaylistLyrics(playlistId);
  });

program
  .command('tag')
  .description('为已下载的文件夹按文件名搜索并补全元数据 Look up songs by file name in a folder and fill in metadata')
  .argument('<folder>', '包含音频文件的文件夹 Folder containing audio files')
  .option('--force', '覆盖已有标签 Overwrite files that already have tags')
  .option('--dry-run', '只显示匹配结果，不写入 Only show matches, do not write')
  .option('--min-score <n>', '最低匹配得分 Minimum match score 0-1 (default 0.75)', parseFloat)
  .option('--no-recursive', '不处理子文件夹 Do not scan sub-folders')
  .action(async (folder: string, options: { force?: boolean; dryRun?: boolean; minScore?: number; recursive?: boolean }) => {
    await tagFolder(folder, options);
  });

const cookieCmd = program
  .command('cookie')
  .description('管理已保存的登录 Cookie Manage the saved login cookie');

cookieCmd
  .command('set')
  .description('保存 Cookie 到文件，之后所有请求自动使用 Save cookie to file; all later requests use it')
  .argument('<value>', 'MUSIC_U 值或完整 Cookie 字符串 MUSIC_U value or full cookie string')
  .action((value: string) => {
    if (!saveStoredCookie(value)) {
      console.error('Cookie 不能为空 Cookie must not be empty');
      process.exit(1);
    }
    console.log(`Cookie 已保存 Cookie saved: ${getCookieFilePath()} (value hidden)`);
  });

cookieCmd
  .command('show')
  .description('显示已保存 Cookie 的状态（不显示内容）Show saved cookie status (value hidden)')
  .action(() => {
    console.log(`文件 File: ${getCookieFilePath()}`);
    console.log(`状态 Status: ${describeCookie(readStoredCookie())}`);
  });

cookieCmd
  .command('status')
  .description('向 NetEase 查询当前 Cookie 的登录/VIP 状态 Ask NetEase for the login/VIP status of the cookie in use')
  .action(async () => {
    try {
      const s = await getAccountStatus();
      if (!s.loggedIn) {
        console.log('状态 Status: 游客/Cookie 无效或已过期 Guest, or the cookie is invalid/expired');
        console.log('请重新获取 MUSIC_U 并运行 `cookie set` Get a fresh MUSIC_U and run `cookie set`');
        return;
      }
      console.log(`状态 Status: 已登录 Logged in as ${s.nickname} (id ${s.userId})`);
      const expire = s.vipExpire ? new Date(s.vipExpire).toLocaleDateString() : undefined;
      if (s.vip) {
        console.log(`会员 Membership: VIP${s.svip ? ' (SVIP)' : ''}${s.musicPackage ? ' + 付费音乐包 music package' : ''}${expire ? `, 到期 expires ${expire}` : ''} (vipType=${s.vipType})`);
      } else {
        console.log(`会员 Membership: 非 VIP Not VIP${expire ? ` (上次到期 last expired ${expire})` : ''}，VIP 专属歌曲无法下载 VIP-only songs cannot be downloaded`);
      }
    } catch (error) {
      console.error('查询失败 Query failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

cookieCmd
  .command('clear')
  .description('删除已保存的 Cookie Remove the saved cookie')
  .action(() => {
    console.log(clearStoredCookie() ? 'Cookie 已删除 Cookie removed' : '没有已保存的 Cookie No saved cookie');
  });

program.parse();
