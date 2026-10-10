import { SingleBar, type Options } from 'cli-progress';
import axios from 'axios';
import * as fs from 'fs';
import { getSongInfo, checkSongAvailabilityWithRetry, getLyrics, proxyConfig, formatUnavailableHelp } from '../services/netease';
import { sanitizeFileName, getDownloadPath } from '../utils/file';
import { createSingleBar } from '../utils/progress';
import { tagFile } from '../services/tagger';

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('下载封面图片失败 Failed to download cover image:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export async function downloadSong(id: string, progressBar?: SingleBar, options?: { autoProxy?: boolean }): Promise<void> {
  const MAX_STALL_TIME = 10000; // 10 seconds
  const MAX_RETRIES = 3;
  let retryCount = 0;

  async function attemptDownload(): Promise<boolean> {
    try {
      let song;
      try {
        song = await getSongInfo(id);
      } catch (error) {
        console.error(`\n获取歌曲信息失败，跳过下载 Failed to get song info, skipping download (ID: ${id})`);
        return false;
      }

      const songName = song.name;
      const artistName = song.artists?.[0]?.name || '未知歌手 Unknown Artist';

      console.log(`\n歌曲信息 Song info: ${artistName}-${songName}`);

      const availability = await checkSongAvailabilityWithRetry(id, options?.autoProxy);
      if (!availability.available || !availability.url) {
        console.log(`无法获取下载链接，跳过下载 Cannot get download URL, skipping download\n${formatUnavailableHelp(availability.reason, options?.autoProxy)}`);
        return false;
      }

      // 获取文件格式
      const fileExtension = availability.type || availability.url.split('.').pop()?.split('?')[0] || 'mp3';
      console.log(`获取到音质 Quality: ${availability.quality || 'unknown'}, 比特率 Bitrate: ${availability.bitrate || 'unknown'}kbps, 格式 Format: ${fileExtension}`);

      const sanitizedSongName = sanitizeFileName(songName);
      const sanitizedArtistName = sanitizeFileName(artistName);
      const fileName = `${sanitizedArtistName}-${sanitizedSongName}.${fileExtension}`;
      const filePath = getDownloadPath('single', fileName);
      const lrcPath = getDownloadPath('single', `${sanitizedArtistName}-${sanitizedSongName}.lrc`);

      // 下载歌词
      const lyrics = await getLyrics(id);
      if (lyrics) {
        fs.writeFileSync(lrcPath, lyrics, 'utf8');
        console.log('歌词下载完成 Lyrics downloaded');
        console.log('网页链接 Web URL:', `https://music.163.com/#/song?id=${id}`);
      }

      if (fs.existsSync(filePath)) {
        console.log(`文件已存在，跳过下载 File exists, skipping download: ${fileName}`);
        return true;
      }

      console.log(`开始下载 Start downloading: ${artistName}-${songName}`);

      const response = await axios({
        method: 'get',
        url: availability.url,
        responseType: 'stream',
        ...(availability.needProxy ? proxyConfig : {})
      });

      const totalLength = parseInt(response.headers['content-length'], 10);
      const bar = createSingleBar();
      bar.start(Math.round(totalLength/1024), 0);

      const writer = fs.createWriteStream(filePath);
      let downloadedBytes = 0;
      let lastProgressTime = Date.now();

      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        bar.update(Math.round(downloadedBytes/1024));
        lastProgressTime = Date.now();
      });

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        const checkProgress = setInterval(() => {
          if (Date.now() - lastProgressTime > MAX_STALL_TIME) {
            clearInterval(checkProgress);
            writer.end();
            writer.on('close', () => {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath); // 删除未完成的文件
              }
              bar.stop();
              console.log('\n下载停滞，准备重试 Download stalled, preparing to retry...');
              resolve(false);
            });
          }
        }, 1000);

        writer.on('finish', async () => {
          clearInterval(checkProgress);
          bar.stop();
          if (downloadedBytes >= totalLength * 0.99) { // 允许1%的误差
            if (await tagFile(filePath, { song, lyrics })) {
              console.log('元数据已写入 Tags written');
            }
            console.log(`\n下载完成 Download completed: ${fileName}`);
            resolve(true);
          } else {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath); // 删除不完整的文件
            }
            console.log('\n下载不完整，准备重试 Incomplete download, preparing to retry...');
            resolve(false);
          }
        });

        writer.on('error', (error) => {
          clearInterval(checkProgress);
          bar.stop();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath); // 删除错误的文件
          }
          console.error('\n下载出错，准备重试 Download error, preparing to retry:', error.message);
          resolve(false);
        });
      });
    } catch (error) {
      console.error('\n下载出错，准备重试 Download error, preparing to retry:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  while (retryCount < MAX_RETRIES) {
    const success = await attemptDownload();
    if (success) return;

    retryCount++;
    if (retryCount < MAX_RETRIES) {
      console.log(`\n第 ${retryCount}/${MAX_RETRIES} 次重试 Retry ${retryCount}/${MAX_RETRIES}`);
    }
  }

  console.error('\n达到最大重试次数，下载失败 Maximum retries reached, download failed');
}
