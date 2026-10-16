# Mihomo / Quantumult X 分流合集

本仓库保存多款客户端使用的配置与复写脚本。分流策略对齐：双订阅（AI + 通用）、国内直连、广告拒绝、屏蔽 Apple OTA。

| 文件 | 适用客户端 | 用途 |
| --- | --- | --- |
| [override.js](./override.js) | Mihomo Party | 原有覆写脚本 |
| [cmfa-config.yaml](./cmfa-config.yaml) | CMFA / Mihomo Android | 双订阅完整配置 |
| [clash-verge-extension.js](./clash-verge-extension.js) | Clash Verge Rev | 在通用订阅上注入 AI 订阅与分流 |
| [rk3588-extend.js](./rk3588-extend.js) | RK3588 / Ubuntu / Mihomo TUN | 复用最新分流脚本，适配 Linux TUN、DNS 和 NTP |
| [rk3588-update.sh](./rk3588-update.sh) | RK3588 更新服务 | 下载双订阅，校验后应用，启动失败回退 |
| [flclash-bettbox-override.js](./flclash-bettbox-override.js) | FlClash / BettBox | Android 客户端共用复写 |
| [quantumult-x.list](./quantumult-x.list) | Quantumult X | 远程分流列表（用链接导入） |
| [quantumult-x.conf](./quantumult-x.conf) | Quantumult X | 策略组 + filter_remote 片段（不含订阅地址） |

规则来源包含 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script)
的远程服务规则集、MetaCubeX 的 GeoSite/GEOIP 数据，以及本仓库的自定义分流例外。
Verge、FlClash/BettBox、CMFA 与 Quantumult X 均引用 blackmatrix7 的 SteamCN
规则集，每 24 小时更新，命中的 Steam 下载/CDN 等域名走直连；未命中的 Steam
流量继续沿用现有策略。Party 版原本已包含 SteamCN，RK3588 复用 Verge 脚本。

更新后需重新应用客户端配置。Quantumult X 还需将 [quantumult-x.conf](./quantumult-x.conf)
中 `[filter_remote]` 的 SteamCN 条目加入当前配置；只刷新 `quantumult-x.list` 不会新增远程规则。

RK3588 部署在 `/etc/mihomo/`：`rk3588-extend.js` 安装为 `extend.js`，与
`clash-verge-extension.js` 同目录；`rk3588-update.sh` 安装为 `update.sh`。
依赖 Node.js、`js-yaml`、curl、flock 和 Mihomo。`host.yaml` 保存本机端口、
控制接口等设置；仅 root 可读的 `subscriptions.env` 保存 `GENERAL_SUB_URL`
和 `AI_SUB_URL`，不要将真实订阅地址提交到仓库。

在板卡执行 `sudo systemctl start mihomo-config-update.service` 可刷新双订阅。
更新器先下载并校验两份订阅与生成配置，成功后重启内核；启动失败恢复更新前配置。
`mihomo-config.path` 监听脚本、主机设置和订阅地址文件的修改。AI provider 每 6 小时
更新，规则集每 24 小时更新；通用订阅通过上述更新服务刷新。

2026-10-05 修复：板卡系统时间滞后导致 TLS 校验失败，已配置可达的 NTP 服务器；
清理订阅继承的 DNS fallback 和 respect-rules，给 DNS/NTP 设置独立直连路径。
保留 Rockchip 5.10 适用的 mixed TUN 与 LAN 路由排除设置。
原部署备份位于板卡 `/etc/mihomo/backup-before-20261005/`。
