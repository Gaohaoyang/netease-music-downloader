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
  trackNumber?: number;
}

export interface AlbumInfo {
  songs: Song[];
  albumName: string;
  artistName: string;
  picUrl?: string;
  publishTime?: number;
}

export interface PlaylistInfo {
  songs: Song[];
  playlistName: string;
  creatorName: string;
  picUrl?: string;
}
