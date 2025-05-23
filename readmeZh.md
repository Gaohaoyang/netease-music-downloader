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

## 注意事项

- 仅供个人学习使用
- 请遵守相关法律法规
- 部分音乐可能因版权限制无法下载
- 下载的音乐文件会在 48 小时后自动清理
- 需要稳定的网络连接
- 文件名中的特殊字符会被自动移除

## License

MIT
