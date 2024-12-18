const { Octokit } = require("@octokit/rest");
const { execSync } = require("child_process");
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const archiver = require('archiver');

async function createZipFile(files, zipName, type, musicId) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipName);
        const archive = archiver('zip', {
            zlib: { level: 9 } // 最高压缩级别
        });

        output.on('close', () => {
            console.log(`ZIP created: ${archive.pointer()} bytes`);
            resolve(zipName);
        });

        archive.on('error', (err) => {
            reject(err);
        });

        archive.pipe(output);

        // 添加文件到 zip
        if (type === 'album') {
            // 获取专辑目录名（假设是downloads目录下的第一个目录）
            const albumDirs = glob.sync('downloads/*/', { directories: true });
            if (albumDirs.length > 0) {
                const albumDir = path.basename(albumDirs[0]);
                console.log(`Found album directory: ${albumDir}`);

                // 将文件添加到对应的专辑目录中
                files.forEach(file => {
                    const relativePath = path.relative('downloads', file);
                    archive.file(file, { name: relativePath });
                });
            } else {
                console.log('No album directory found, using default structure');
                const defaultAlbumDir = `album-${musicId}`;
                files.forEach(file => {
                    archive.file(file, {
                        name: path.join(defaultAlbumDir, path.basename(file))
                    });
                });
            }
        } else {
            // 单曲直接添加到根目录
            files.forEach(file => {
                archive.file(file, { name: path.basename(file) });
            });
        }

        archive.finalize();
    });
}

async function createRelease(octokit, owner, repo, tag, files, type, musicId) {
    console.log(`Creating release with tag: ${tag}`);
    console.log(`Files to compress: ${files}`);

    // 创建 zip 文件
    const zipName = `music-${tag}.zip`;
    await createZipFile(files, zipName, type, musicId);

    // 创建一个新的 release
    const { data: release } = await octokit.repos.createRelease({
        owner,
        repo,
        tag_name: tag,
        name: `Music Download ${tag}`,
        body: 'Automated music download via GitHub Actions',
        draft: false
    });

    // 上传 zip 文件到 release
    const content = fs.readFileSync(zipName);
    const { data: asset } = await octokit.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: release.id,
        name: zipName,
        data: content,
        headers: {
            'content-type': 'application/zip',
            'content-length': content.length
        }
    });

    // 清理临时文件
    fs.unlinkSync(zipName);

    return {
        release,
        assets: [{
            name: zipName,
            browser_download_url: asset.browser_download_url
        }]
    };
}

async function updateProgress(octokit, owner, repo, issueNumber, message) {
    await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: message
    });
}

async function main() {
    console.log('Starting process-issue.js...');

    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });

    console.log('GITHUB_REPOSITORY:', process.env.GITHUB_REPOSITORY);
    console.log('GITHUB_EVENT_PATH:', process.env.GITHUB_EVENT_PATH);

    // 添加环境变量检查和本地开发支持
    if (!process.env.GITHUB_REPOSITORY) {
        console.error('Error: This script is meant to be run in GitHub Actions environment');
        console.log('For local development, you can use:');
        console.log('  npm start download <musicId>');
        console.log('  npm start album <albumId>');
        process.exit(1);
    }

    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
    console.log('Owner:', owner);
    console.log('Repo:', repo);

    // 添加事件路径检查
    if (!process.env.GITHUB_EVENT_PATH) {
        console.error('Error: GITHUB_EVENT_PATH is not defined');
        process.exit(1);
    }

    const eventPath = process.env.GITHUB_EVENT_PATH;
    const event = require(eventPath);
    console.log('Event data:', JSON.stringify(event, null, 2));

    if (!event || !event.issue) {
        console.error('Error: Invalid event data');
        process.exit(1);
    }

    const issueNumber = event.issue.number;

    try {
        // 解析 issue body
        const body = event.issue.body;
        console.log('Issue body:', body);

        // 使用新的正则表达式匹配
        const typeMatch = body.match(/### Download Type 下载类型\s*\n\n(.+?)(?=\n|$)/);
        const idMatch = body.match(/### Music ID 音乐ID\s*\n\n(.+?)(?=\n|$)/);
        console.log('Type match:', typeMatch);
        console.log('ID match:', idMatch);

        if (!typeMatch || !idMatch) {
            await updateProgress(octokit, owner, repo, issueNumber,
                "❌ 无法解析请求内容，请使用正确的issue模板\nUnable to parse request content, please use the correct issue template");
            return;
        }

        // 修改类型判断逻辑
        const type = typeMatch[1].trim().startsWith('Single Song') ? 'song' : 'album';
        const musicId = idMatch[1].trim();

        console.log('Parsed type:', type);
        console.log('Parsed musicId:', musicId);

        if (!musicId || !/^\d+$/.test(musicId)) {
            await updateProgress(octokit, owner, repo, issueNumber,
                "❌ 无效的音乐ID，请提供正确的数字ID\nInvalid music ID, please provide a correct numeric ID");
            return;
        }

        if (type === 'song') {
            console.log('Downloading song:', musicId);
            try {
                // 执行下载并捕获输出
                const output = execSync(`node dist/index.js download ${musicId}`, {
                    stdio: 'pipe',
                    encoding: 'utf8'
                });

                // 先尝试获取并显示歌曲信息
                const songNameMatch = output.match(/歌曲信息 Song info:\s*(.+?)(?:\n|$)/);
                if (songNameMatch) {
                    songInfo = songNameMatch[1].trim();
                    await updateProgress(octokit, owner, repo, issueNumber,
                        `ℹ️ 歌曲信息 Song info: ${songInfo}`);
                }

                // 检查输出中是否包含无版权或下架的提示
                if (output.includes('无版权') || output.includes('已下架')) {
                    await octokit.issues.createComment({
                        owner,
                        repo,
                        issue_number: issueNumber,
                        body: `❌ 抱歉，该音乐暂时无法下载：可能是因为版权限制或已下架。\nSorry, this music is temporarily unavailable: it may be due to copyright restrictions or has been removed.\n\n建议您 Suggestions:\n1. 确认该音乐在网易云音乐是否可以正常播放\n   Check if the music can be played normally on NetEase Cloud Music\n2. 尝试下载其他音乐\n   Try downloading other music`
                    });
                    return;
                }
            } catch (error) {
                console.error('Error during song download:', error);
                throw error;
            }
        } else {
            console.log('Downloading album:', musicId);
            const output = execSync(`node dist/index.js album ${musicId}`, {
                stdio: 'pipe',
                encoding: 'utf8'
            });

            // 从输出中解析专辑信息
            const albumInfoMatch = output.match(/专辑信息 Album info:\s*(.+?)(?:\n|$)/);
            if (albumInfoMatch) {
                albumInfo = albumInfoMatch[1].trim();
                await updateProgress(octokit, owner, repo, issueNumber,
                    `ℹ️ 获取到专辑信息 Album info: ${albumInfo}`);
            }
        }

        // 检查下载结果
        const downloadedFiles = glob.sync('downloads/**/*.mp3');
        // 如果没有成功下载任何文件，直接发送消息并退出
        if (downloadedFiles.length === 0) {
            await updateProgress(octokit, owner, repo, issueNumber,
                `❌ 下载失败：未能成功下载任何文件。\n可能原因：所有歌曲都没有版权或已下架。\n\nDownload failed: No files were downloaded successfully.\nPossible reason: All songs are unavailable or have no copyright.`);
            return;
        }

        await updateProgress(octokit, owner, repo, issueNumber,
            `✅ 下载完成 Download completed，共 Total: ${downloadedFiles.length} 个文件 files\n` +
            `📦 ${type === 'song' ? `歌曲 Song：${songInfo}` : `专辑 Album：${albumInfo}`}\n` +
            `⏳ 正在打包并上传到 Release Packaging and uploading to Release...`
        );

        // 创建 release
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tag = `download-${issueNumber}-${timestamp}`;

        const { release, assets } = await createRelease(
            octokit,
            owner,
            repo,
            tag,
            downloadedFiles,
            type,
            musicId
        );

        // 添加下载链接
        const downloadLinks = assets.map(asset => {
            return `- [${asset.name}](${asset.browser_download_url})`;
        }).join('\n');

        await updateProgress(octokit, owner, repo, issueNumber,
            `🎉 处理完成！您可以从以下链接下载音乐文件：\nProcessing completed! You can download the music files from the following links:\n\n${downloadLinks}\n\n或访问 Or visit [Release 页面 page](${release.html_url})\n\n⚠️ 注意：下载链接将在 3 小时后失效，请尽快下载！\nNote: Download links will expire in 3 hours, please download as soon as possible!`);

        // 清理下载的文件
        execSync('rm -rf downloads/*');

    } catch (error) {
        console.error('Error in main process:', error);
        // 根据错误类型返回不同的提示
        let errorMessage = error.message;
        if (error.message.includes('无版权') || error.message.includes('已下架')) {
            errorMessage = '该音乐暂时无法下载：可能是因为版权限制或已下架。建议确认该音乐在网易云音乐是否可以正常播放。\nThis music is temporarily unavailable: it may be due to copyright restrictions or has been removed. Please check if the music can be played normally on NetEase Cloud Music.';
        }
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `❌ ${errorMessage}`
        });
        process.exit(1);
    } finally {
        await octokit.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            state: 'closed'
        });
    }
}

// 添加未捕获异常处理
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    process.exit(1);
});

main().catch(error => {
    console.error('Top level error:', error);
    process.exit(1);
});
