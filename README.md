# Mihomo 客户端复写合集

本仓库保存多款 Mihomo 客户端使用的配置与复写脚本。

| 文件 | 适用客户端 | 用途 |
| --- | --- | --- |
| [override.js](./override.js) | Mihomo Party | 原有覆写脚本 |
| [cmfa-config.yaml](./cmfa-config.yaml) | CMFA / Mihomo Android | 双订阅完整配置 |
| [clash-verge-extension.js](./clash-verge-extension.js) | Clash Verge Rev | 在通用订阅上注入 AI 订阅与分流 |
| [flclash-bettbox-override.js](./flclash-bettbox-override.js) | FlClash / BettBox | Android 客户端共用复写 |

## 使用前

公开版本不包含私人订阅地址。请下载目标文件后，将以下占位符替换成自己的订阅地址：

- `https://example.com/replace-with-your-ai-subscription`
- `https://example.com/replace-with-your-general-subscription`（仅 CMFA 配置需要）

规则参考并基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 调整。
