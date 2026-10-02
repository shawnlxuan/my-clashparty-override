# Mihomo / Quantumult X 分流合集

本仓库保存多款客户端使用的配置与复写脚本。分流策略对齐：双订阅（AI + 通用）、国内直连、广告拒绝、屏蔽 Apple OTA。

| 文件 | 适用客户端 | 用途 |
| --- | --- | --- |
| [override.js](./override.js) | Mihomo Party | 原有覆写脚本 |
| [cmfa-config.yaml](./cmfa-config.yaml) | CMFA / Mihomo Android | 双订阅完整配置 |
| [clash-verge-extension.js](./clash-verge-extension.js) | Clash Verge Rev | 在通用订阅上注入 AI 订阅与分流 |
| [flclash-bettbox-override.js](./flclash-bettbox-override.js) | FlClash / BettBox | Android 客户端共用复写 |
| [quantumult-x.list](./quantumult-x.list) | Quantumult X | 远程分流列表（用链接导入） |
| [quantumult-x.conf](./quantumult-x.conf) | Quantumult X | 策略组 + filter_remote 片段（不含订阅地址） |
