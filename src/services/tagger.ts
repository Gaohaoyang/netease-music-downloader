import axios from 'axios';
import { ByteVector, File, Picture, PictureType } from 'node-taglib-sharp';
import { Song } from '../types';
import { proxyConfig } from './netease';

let taggingEnabled = true;

export function setTaggingEnabled(enabled: boolean): void {
  taggingEnabled = enabled;
}

export function isTaggingEnabled(): boolean {
  return taggingEnabled;
}

export interface TagOptions {
  song: Song;
  albumArtist?: string;
  trackNumber?: number;
  trackTotal?: number;
  lyrics?: string | null;
  overwrite?: boolean;
}

const coverCache = new Map<string, Buffer | null>();

export async function fetchCover(picUrl: string | undefined): Promise<Buffer | null> {
  if (!picUrl) return null;
  const url = picUrl.includes('?') ? picUrl : `${picUrl}?param=1000y1000`;
  if (coverCache.has(url)) return coverCache.get(url)!;
  let data: Buffer | null = null;
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, ...proxyConfig });
    data = Buffer.from(response.data);
  } catch (error) {
    console.error('下载封面失败 Failed to download cover:', error instanceof Error ? error.message : 'Unknown error');
  }
  if (coverCache.size >= 20) coverCache.delete(coverCache.keys().next().value as string);
  coverCache.set(url, data);
  return data;
}

function imageMime(buf: Buffer): string {
  return buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : 'image/jpeg';
}

export function hasExistingTags(filePath: string): boolean {
  const file = File.createFromPath(filePath);
  try {
    const tag = file.tag;
    return !!(tag.title && tag.performers.length > 0 && tag.album);
  } finally {
    file.dispose();
  }
}

export function getDurationMs(filePath: string): number | undefined {
  const file = File.createFromPath(filePath);
  try {
    return file.properties.durationMilliseconds || undefined;
  } finally {
    file.dispose();
  }
}

// 写入元数据，失败只警告，不影响下载 Write tags; failures only warn and never fail the download
export async function tagFile(filePath: string, options: TagOptions): Promise<boolean> {
  if (!taggingEnabled) return false;
  try {
    const { song } = options;
    const cover = await fetchCover(song.album?.picUrl);
    const file = File.createFromPath(filePath);
    try {
      const tag = file.tag;
      tag.title = song.name;
      const artists = (song.artists || []).map(a => a.name).filter(Boolean);
      if (artists.length) tag.performers = artists;
      if (options.albumArtist) tag.albumArtists = [options.albumArtist];
      if (song.album?.name) tag.album = song.album.name;
      if (song.publishTime && song.publishTime > 0) tag.year = new Date(song.publishTime).getUTCFullYear();
      const track = options.trackNumber ?? song.trackNumber;
      if (track && track > 0) tag.track = track;
      if (options.trackTotal && options.trackTotal > 0) tag.trackCount = options.trackTotal;
      if (options.lyrics) tag.lyrics = options.lyrics;
      if (cover) {
        tag.pictures = [Picture.fromFullData(ByteVector.fromByteArray(cover), PictureType.FrontCover, imageMime(cover), 'Cover')];
      }
      file.save();
    } finally {
      file.dispose();
    }
    return true;
  } catch (error) {
    console.error(`写入元数据失败 Failed to write tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}
