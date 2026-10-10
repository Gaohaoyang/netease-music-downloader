# NetEase Music Downloader

**Most of the code in this repository was written and developed by AI.**

[中文文档](./readmeZh.md)

A simple and easy-to-use tool for downloading music from NetEase Cloud Music. Supporting both single songs and albums with multiple ways to use.

## Features

- ✨ Support single/multiple song downloads
- 📀 Support full album downloads
- 🚀 Show download progress
- 🎵 Auto-fetch artist and song names
- 📂 Auto-create album directories
- ⚡️ Auto-skip downloaded files
- 🔍 Auto-detect unavailable or copyright-protected songs
- 📝 Auto-download lyrics (if available)
- 🌐 Support proxy configuration
- 🔄 Smart connection handling (try direct connection first, then use proxy if needed)
- 📜 Support lyrics-only downloads (without music files)

## Usage

### 1. Use via npx (Recommended)

No installation needed, run directly:

```bash
# Download a song
npx netease-music-downloader download 426832090

# Download an album
npx netease-music-downloader album 34836039

# Download lyrics only for a song
npx netease-music-downloader lyrics 426832090

# Download lyrics only for an album
npx netease-music-downloader album-lyrics 34836039

# Download with auto proxy (recommended)
npx netease-music-downloader download 426832090 --auto-proxy

# Download with manual proxy
npx netease-music-downloader download 426832090 --proxy http://127.0.0.1:7890

# Download a playlist (ID or URL; private playlists need a saved cookie)
npx netease-music-downloader playlist 3778678

# Re-running a playlist resumes it: songs already in the playlist folder are skipped
# (no network requests for them). Add --force to re-download everything.
npx netease-music-downloader playlist 3778678 --force

# Download lyrics only for a playlist
npx netease-music-downloader playlist-lyrics 3778678
```

<!--
### 2. Download via GitHub Issue

The easiest way to use, no installation required. The program will first try a direct connection, and if that fails (which may happen as the GitHub Actions server is located overseas), it will automatically use a proxy to ensure successful downloads:

1. Visit [Issues page](https://github.com/Gaohaoyang/netease-music-downloader/issues)
2. Click "New Issue"
3. Choose "Download Music" template
4. Fill in:
   - Type (song/album)
   - Music ID
   - Check "Lyrics only" if you only want to download lyrics
5. Submit the issue and download will start automatically
6. Download links will be provided in the issue comments
-->

### 2. Local Development

For local development:

```bash
# Clone repository
git clone https://github.com/Gaohaoyang/netease-music-downloader.git

# Enter directory
cd netease-music-downloader

# Install dependencies
pnpm install

# Run commands
pnpm start download 426832090  # Download a song
pnpm start album 34836039     # Download an album
pnpm start lyrics 426832090   # Download lyrics only for a song
pnpm start album-lyrics 34836039  # Download lyrics only for an album

# Run with auto proxy (recommended)
pnpm start download 426832090 --auto-proxy

# Run with manual proxy
pnpm start download 426832090 --proxy http://127.0.0.1:7890
```

## How to Get Music ID?

1. Open NetEase Cloud Music website or client
2. Find the song or album you want to download
3. Copy the link and get the ID from it:
   - Song link: `426832090` from `https://music.163.com/#/song?id=426832090`
   - Album link: `34836039` from `https://music.163.com/#/album?id=34836039`

## Download Directory Structure

```
downloads/
├── artist-songname.mp3              # Single song
├── artist-songname.lrc             # Lyrics file
└── album-name/                      # Album
    ├── 01.artist-song1.mp3
    ├── 01.artist-song1.lrc
    ├── 02.artist-song2.mp3
    ├── 02.artist-song2.lrc
    └── ...
```

## Using Proxy

If you're having trouble accessing NetEase Music directly, you can use a proxy in two ways:

### 1. Auto Proxy (Recommended)

The program will first try a direct connection for each song. If that fails, it will automatically find and use an available Chinese proxy:

```bash
# Format
pnpm start download <song_id> --auto-proxy

# Example with song download
pnpm start download 426832090 --auto-proxy

# Example with album download
pnpm start album 34836039 --auto-proxy
```

When downloading an album, each song will first attempt a direct connection. If a song requires a proxy, it will be used only for that specific song, and the next song will start with a direct connection attempt again.

### 2. Manual Proxy

If you have your own proxy server, you can specify it directly:

```bash
# Format
pnpm start download <song_id> --proxy <proxy_url>

# Example with HTTP proxy
pnpm start download 426832090 --proxy http://127.0.0.1:7890

# Example with album download using proxy
pnpm start album 34836039 --proxy http://127.0.0.1:7890
```

Note: When using a manual proxy, prefer using `http://` instead of `https://` for the proxy URL, as some proxy servers may not properly support HTTPS connections.

## Metadata Tags

`download`, `album` and `playlist` automatically write ID3/Vorbis/MP4 tags into each file: title, artist(s), album, year, track number, cover art and embedded lyrics (album downloads also set album artist and track total). Use the global `--no-tags` option to turn this off. Tagging failures only print a warning and never fail the download.

### Tag files you already downloaded

Point `tag` at a folder. Each audio file is searched on NetEase by its file name (`01.Artist-Title.mp3`, `Artist-Title.mp3` or just `Title.mp3`), the best match is chosen (title, artist and duration are compared), and the tags and cover are filled in. A sibling `.lrc` file is embedded as lyrics.

```bash
# Preview matches without changing any file
npx netease-music-downloader tag "./downloads/My Playlist" --dry-run

# Write tags (sub-folders included; files that already have tags are skipped)
npx netease-music-downloader tag "./downloads/My Playlist"

# Options: --force (overwrite existing tags), --min-score 0.8 (stricter), --no-recursive
```

Files with no good match are listed in `tag-problems.txt` inside the folder. Matching is by name, so a few wrong matches (covers, live versions) are possible; use `--dry-run` first and raise `--min-score` if needed.

## Using a Login Cookie (VIP / Paid Songs)

By default the tool accesses NetEase as a guest, so VIP-only or paid songs may fail with "no download URL". You can supply your own login cookie.

### How to get `MUSIC_U`

1. Log in at <https://music.163.com> in your browser.
2. Open DevTools (`F12`) → **Application** (Chrome/Edge) or **Storage** (Firefox) → **Cookies** → `https://music.163.com`.
3. Copy the **Value** of the cookie named `MUSIC_U`.

### Save the cookie once (recommended)

```bash
npx netease-music-downloader cookie set "<MUSIC_U value>"   # saved to ~/.netease-music-downloader/cookie
npx netease-music-downloader cookie show                    # status only, value is never printed
npx netease-music-downloader cookie status   # ask NetEase: logged in? VIP? expiry
npx netease-music-downloader cookie clear                   # remove it
```

Every later command (download / album / lyrics / album-lyrics) automatically uses the saved cookie. `--cookie` and the env vars below override it for a single run. Set `NETEASE_CONFIG_DIR` to change the storage directory.

### One-off usage

```bash
# Global option, works with download / album / lyrics / album-lyrics
npx netease-music-downloader --cookie "<MUSIC_U value>" download 1234567

# A full cookie string (anything containing "=") is also accepted
npx netease-music-downloader --cookie "MUSIC_U=xxx; __csrf=yyy" album 12345

# Or use environment variables (--cookie takes precedence)
# PowerShell: $env:NETEASE_MUSIC_U = "<MUSIC_U value>"
export NETEASE_MUSIC_U="<MUSIC_U value>"   # or NETEASE_COOKIE
npx netease-music-downloader download 1234567
```

A bare value is wrapped as `MUSIC_U=<value>`; the guest `NMTID` / `_ntes_nuid` cookies are added only when absent.

> ⚠️ **Keep your cookie secret.** The saved cookie file is stored in plain text (mode 600 on Unix); protect your home directory. `MUSIC_U` grants access to your account. Never share it, commit it, or paste it into public issues/logs. The tool never prints it. Prefer environment variables over shell history, and log out / re-login to revoke it if leaked.

## Notes

- For personal learning use only
- Please comply with relevant laws and regulations
- Some music may be unavailable due to copyright restrictions
- Downloaded music files will be automatically cleaned up after 48 hours
- Stable network connection required
- Special characters in filenames will be automatically removed

## License

MIT
