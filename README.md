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

## 使用前

公开版本不包含私人订阅地址。Clash / CMFA 请下载目标文件后，将以下占位符替换成自己的订阅地址：

- `https://example.com/replace-with-your-ai-subscription`
- `https://example.com/replace-with-your-general-subscription`（仅 CMFA 需要）

圈 X 订阅已在 App 内导入（AI = `越过山丘`，通用 = `蓝莓桥`），规则文件不再写入订阅地址。

规则参考并基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 调整。

## 圈 X：用分流链接导入，不用重写

Clash 里的 `rules` 对应圈 X 的 `[filter_local]` / `[filter_remote]`，不对应 `[rewrite_*]`。

- **分流**：按域名选出口（`越过山丘` / `蓝莓桥` / `direct` / `reject`）。
- **重写**：改 URL、Header、响应体，通常要开 MITM。当前配置没有这类需求。
- 广告、屏蔽 iOS 更新都是 `reject`，不是重写。

不要用 `quantumult-x.conf` 整份覆盖当前配置，否则会清掉已导入的节点。

### 1. 建策略组

在现有配置的 `[policy]` 追加（或在 App 里手动建同名策略组）：

```
static=越过山丘, resource-tag-regex=^越过山丘$, reject
url-latency-benchmark=蓝莓桥自动, resource-tag-regex=^蓝莓桥$, check-interval=300, tolerance=80, alive-checking=false
static=蓝莓桥, 蓝莓桥自动, resource-tag-regex=^蓝莓桥$
static=🚫 屏蔽系统更新, reject, direct
```

`resource-tag-regex` 必须和圈 X 里两个订阅的资源标签一致。

### 2. 用链接导入分流

圈 X → 分流 → 引用 → 添加。**不要开启强制策略**（一条列表里同时有 AI / 通用 / 直连 / 屏蔽更新）。

```
https://raw.githubusercontent.com/shawnlxuan/my-clashparty-override/main/quantumult-x.list
```

国内网络可用：

```
https://testingcf.jsdelivr.net/gh/shawnlxuan/my-clashparty-override@main/quantumult-x.list
```

完整对齐 Clash 时，把 [quantumult-x.conf](./quantumult-x.conf) 的 `[filter_remote]` 整段合并进去（自定义列表在最前，随后是广告 / OpenAI / 微软 / 国内）。`[filter_local]` 只保留：

```
geoip, cn, direct
final, 蓝莓桥
```

## 屏蔽 Apple OTA

用分流 `REJECT` / `reject` 拦截更新目录和固件 CDN，不引用 blackmatrix7 `SystemOTA` 整集（会误伤 `ocsp.apple.com`、`gs.apple.com`）。

临时升级：圈 X 把策略组「🚫 屏蔽系统更新」改成 `direct`；Clash 删掉或改写对应 `REJECT` 行。
