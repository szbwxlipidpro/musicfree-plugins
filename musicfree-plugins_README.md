# MusicFree Plugins

个人维护的 MusicFree 插件订阅仓库。

当前主要提供：

- **网易云（Android）**：适配 MusicFree 安卓端。
- 通过 GitHub Raw 地址进行网络安装和更新。
- 插件本身**不包含任何个人账号凭据、Cookie、`MUSIC_U`、密码或 Token**。

## 订阅地址

在 MusicFree 安卓端进入：

**插件设置 → 添加 / 从网络安装插件**

然后填入：

```text
https://raw.githubusercontent.com/szbwxlipidpro/musicfree-plugins/main/plugins.json
```

当前插件文件：

```text
https://raw.githubusercontent.com/szbwxlipidpro/musicfree-plugins/main/网易云_Android.js
```

## 网易云插件

当前版本：**2.3.0**

主要功能：

- 网易云榜单
- 推荐歌单
- 歌曲 / 歌单搜索
- 歌单详情
- 歌词
- 使用用户本人账号已有权限获取可播放媒体

插件针对 MusicFree Android 的 JavaScript 运行环境进行了兼容处理。

## 账号与隐私

本仓库不会保存用户的网易云账号凭据。

如需使用本人网易云账号已有的播放权限，请仅在 **MusicFree 客户端本地的插件用户变量**中配置自己的 `MUSIC_U` / Cookie。

请注意：

- **不要**把真实 `MUSIC_U`、Cookie、密码、Token 提交到 GitHub。
- **不要**在 Issue、截图、日志或聊天中公开这些凭据。
- `MUSIC_U` 应视为登录凭据；如怀疑泄露，应及时使原会话失效并重新登录。
- 插件不会把网易云登录 Cookie 附加到无关的第三方服务器请求。

## 使用边界

本项目仅用于访问用户本人有权访问的内容。

本仓库：

- 不提供音乐文件；
- 不提供第三方音源替换；
- 不提供会员、付费、DRM、地区或版权限制绕过；
- 不提供账号共享；
- 不包含用户账号数据。

不同歌曲是否可以播放，仍取决于对应账号实际拥有的权限以及服务端当前可用性。

## 更新方式

插件升级后，只需要更新仓库中的插件文件和版本号。

MusicFree 端可以通过原订阅地址重新加载 / 更新，无需每次在手机文件管理器中重新寻找 `.js` 文件。

建议以后保持：

```text
musicfree-plugins/
├── README.md
├── plugins.json
└── 网易云_Android.js
```

如果后续增加更多插件，可继续统一放入 `plugins.json`。

## 安全建议

公开仓库提交前建议确认不存在以下内容：

- `MUSIC_U`
- Cookie
- API Key
- Access Token / Refresh Token
- 密码
- 私钥
- `.env` 文件
- 含账号信息的截图或日志

如果敏感信息曾经被提交到 Git 历史中，单纯删除当前文件并不足够；应先立即撤销 / 更换对应凭据，再根据需要清理 Git 历史。

## 免责声明

本项目为个人学习与插件适配用途，与网易云音乐、MusicFree 及其运营方无隶属或官方合作关系。

使用者应遵守所在地法律法规、相关服务条款以及内容版权要求。
