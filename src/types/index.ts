export interface Song {
  id: string;
  name: string;
  artists?: Array<{
    name: string;
  }>;
  album?: {
    name: string;
    picUrl?: string;
  };
  duration?: number;
  publishTime?: number;
}

export interface AlbumInfo {
  songs: Song[];
  albumName: string;
  artistName: string;
  picUrl?: string;
  publishTime?: number;
}
