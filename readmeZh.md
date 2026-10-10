# 网易云音乐下载器

**本仓库绝大部分代码是由 AI 编写开发。**

一个简单易用的网易云音乐下载工具，支持单曲和专辑下载。提供多种使用方式，满足不同场景的需求。

## 功能特点

- ✨ 支持单曲/多曲下载
- 📀 支持整张专辑下载
- 🚀 显示下载进度条
- 🎵 自动获取歌手和歌名
- 📂 自动创建专辑目录
- ⚡️ 自动跳过已下载的文件
- 🔍 自动检测下架或无版权歌曲
- 📝 自动下载歌词（如果有）
- 🌐 支持代理配置
- 🔄 智能连接处理（优先尝试直连，失败后使用代理）
- 📜 支持仅下载歌词（不下载音乐文件）

## 使用方法

### 1. 通过 npx 使用 （推荐）

无需安装，直接运行：

```bash
# 下载单曲
npx netease-music-downloader download 426832090

# 下载专辑
npx netease-music-downloader album 34836039

# 仅下载单曲歌词
npx netease-music-downloader lyrics 426832090

# 仅下载专辑歌词
npx netease-music-downloader album-lyrics 34836039

# 使用自动代理下载（推荐）
npx netease-music-downloader download 426832090 --auto-proxy

# 使用手动代理下载
npx netease-music-downloader download 426832090 --proxy http://127.0.0.1:7890

# 下载歌单（ID 或 URL；私密歌单需先保存 Cookie）
npx netease-music-downloader playlist 3778678

# 重复运行即可续传：歌单文件夹中已有的歌曲会被跳过（不会发起网络请求）。
# 加上 --force 可重新下载全部歌曲。
npx netease-music-downloader playlist 3778678 --force

# 仅下载歌单歌词
npx netease-music-downloader playlist-lyrics 3778678
```

<!--
### 2. 通过 GitHub Issue 下载

最简单的使用方式，无需安装任何工具。程序会优先尝试直连下载，如果直连失败（由于 GitHub Actions 服务器在海外，这种情况可能会发生），会自动使用代理确保下载成功：

1. 访问 [Issues 页面](https://github.com/Gaohaoyang/netease-music-downloader/issues)
2. 点击 "New Issue"
3. 选择 "下载音乐" 模板
4. 填写：
   - 下载类型（单曲/专辑）
   - 音乐 ID
   - 如果只想下载歌词，勾选"仅下载歌词"选项
5. 提交 issue 后会自动开始下载
6. 下载完成后会在 issue 中提供下载链接
-->

### 2. 本地开发运行

如果需要进行本地开发：

```bash
# 克隆仓库
git clone https://github.com/Gaohaoyang/netease-music-downloader.git

# 进入目录
cd netease-music-downloader

# 安装依赖
pnpm install

# 运行命令
pnpm start download 426832090  # 下载单曲
pnpm start album 34836039     # 下载专辑
pnpm start lyrics 426832090   # 仅下载单曲歌词
pnpm start album-lyrics 34836039  # 仅下载专辑歌词

# 使用自动代理运行（推荐）
pnpm start download 426832090 --auto-proxy

# 使用手动代理运行
pnpm start download 426832090 --proxy http://127.0.0.1:7890
```

## 如何获取音乐 ID？

1. 打开网易云音乐网页版或客户端
2. 找到想要下载的歌曲或专辑
3. 复制链接，从链接中获取 ID：
   - 单曲链接：`https://music.163.com/#/song?id=426832090` 中的 `426832090`
   - 专辑链接：`https://music.163.com/#/album?id=34836039` 中的 `34836039`

## 下载目录结构

```
downloads/
├── 歌手名-歌曲名.mp3              # 单曲下载
├── 歌手名-歌曲名.lrc             # 歌词文件
└── 专辑名/                       # 专辑下载
    ├── 01.歌手名-歌曲1.mp3
    ├── 01.歌手名-歌曲1.lrc
    ├── 02.歌手名-歌曲2.mp3
    ├── 02.歌手名-歌曲2.lrc
    └── ...
```

## 使用代理

如果无法直接访问网易云音乐，可以通过以下两种方式使用代理：

### 1. 自动代理（推荐）

程序会先尝试直连下载每一首歌曲，如果失败则自动寻找并使用可用的中国代理：

```bash
# 格式
pnpm start download <歌曲ID> --auto-proxy

# 下载单曲示例
pnpm start download 426832090 --auto-proxy

# 下载专辑示例
pnpm start album 34836039 --auto-proxy
```

在下载专辑时，每一首歌曲都会先尝试直连下载。如果某首歌曲需要使用代理，代理仅会用于该首歌曲，下一首歌曲会重新尝试直连下载。

### 2. 手动代理

如果你有自己的代理服务器，可以直接指定：

```bash
# 格式
pnpm start download <歌曲ID> --proxy <代理地址>

# HTTP代理示例
pnpm start download 426832090 --proxy http://127.0.0.1:7890

# 下载专辑时使用代理
pnpm start album 34836039 --proxy http://127.0.0.1:7890
```

注意：使用手动代理时，建议使用 `http://` 而不是 `https://` 作为代理地址的协议，因为某些代理服务器可能不能正确支持 HTTPS 连接。

## 元数据标签

`download`、`album` 和 `playlist` 会自动把标签写入每个文件：标题、歌手、专辑、年份、曲目号、封面和内嵌歌词（专辑下载还会写入专辑艺人和总曲目数）。使用全局选项 `--no-tags` 可关闭。写入失败只会提示警告，不会导致下载失败。

### 为已下载的文件补全标签

对文件夹运行 `tag`。程序会按文件名（`01.歌手-歌名.mp3`、`歌手-歌名.mp3` 或 `歌名.mp3`）在网易云搜索，综合标题、歌手和时长选择最佳匹配，然后写入标签和封面。同名的 `.lrc` 会作为歌词内嵌。

```bash
# 只预览匹配结果，不修改文件
npx netease-music-downloader tag "./downloads/我的歌单" --dry-run

# 写入标签（包含子文件夹；已有标签的文件会跳过）
npx netease-music-downloader tag "./downloads/我的歌单"

# 选项：--force（覆盖已有标签）、--min-score 0.8（更严格）、--no-recursive
```

没有合适匹配的文件会记录在文件夹内的 `tag-problems.txt`。由于是按名称匹配，可能出现少量误匹配（翻唱、现场版等），建议先使用 `--dry-run`，必要时提高 `--min-score`。

## 使用登录 Cookie（VIP / 付费歌曲）

默认以游客身份访问网易云，VIP 专属或付费歌曲可能因“无下载链接”而失败。你可以提供自己的登录 Cookie。

### 如何获取 `MUSIC_U`

1. 在浏览器中登录 <https://music.163.com>。
2. 打开开发者工具（`F12`）→ **Application（应用）**（Chrome/Edge）或 **Storage（存储）**（Firefox）→ **Cookies** → `https://music.163.com`。
3. 复制名为 `MUSIC_U` 的 Cookie 的 **Value（值）**。

### 一次保存，长期使用（推荐）

```bash
npx netease-music-downloader cookie set "<MUSIC_U 的值>"   # 保存到 ~/.netease-music-downloader/cookie
npx netease-music-downloader cookie show                   # 仅显示状态，不会打印内容
npx netease-music-downloader cookie status   # 向网易云查询：是否登录？是否VIP？到期时间
npx netease-music-downloader cookie clear                  # 删除
```

之后所有命令（download / album / lyrics / album-lyrics）都会自动使用已保存的 Cookie。`--cookie` 与下方环境变量可在单次运行中临时覆盖。可通过 `NETEASE_CONFIG_DIR` 修改存储目录。

### 临时使用

```bash
# 全局选项，适用于 download / album / lyrics / album-lyrics
npx netease-music-downloader --cookie "<MUSIC_U 的值>" download 1234567

# 也支持完整 Cookie 字符串（包含 "=" 即视为完整字符串）
npx netease-music-downloader --cookie "MUSIC_U=xxx; __csrf=yyy" album 12345

# 或使用环境变量（--cookie 优先级更高）
# PowerShell: $env:NETEASE_MUSIC_U = "<MUSIC_U 的值>"
export NETEASE_MUSIC_U="<MUSIC_U 的值>"   # 或 NETEASE_COOKIE
npx netease-music-downloader download 1234567
```

仅提供值时会自动包装为 `MUSIC_U=<值>`；游客的 `NMTID` / `_ntes_nuid` 仅在缺失时补充。

> ⚠️ **请妥善保管 Cookie。** 已保存的 Cookie 文件为明文存储（Unix 下权限为 600），请保护好你的用户目录。 `MUSIC_U` 可访问你的账号，切勿分享、提交到仓库，或贴到公开 Issue/日志中。本工具不会打印它。建议使用环境变量以避免留在命令历史中；若泄露，请退出并重新登录以使其失效。

## 注意事项

- 仅供个人学习使用
- 请遵守相关法律法规
- 部分音乐可能因版权限制无法下载
- 下载的音乐文件会在 48 小时后自动清理
- 需要稳定的网络连接
- 文件名中的特殊字符会被自动移除

## License

MIT
