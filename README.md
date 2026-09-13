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

- **分流**：按域名选出口（`🤖 AI代理` / `🚀 通用代理` / `direct` / `reject`）。
- **重写**：改 URL、Header、响应体，通常要开 MITM。当前配置没有这类需求。
- 广告、屏蔽 iOS 更新都是 `reject`，不是重写。

不要用 `quantumult-x.conf` 整份覆盖当前配置，否则会清掉已导入的节点。

**策略组和订阅不能同名。** 导入分流后如果「自定义策略」里出现 `越过山丘` / `蓝莓桥`，且下面一行是 `DIRECT`，说明圈 X 自动建了空策略组，流量不会进 PROXY 里的节点。删掉这两个空策略，只保留 PROXY 里那两份订阅。

### 1. 改策略组

主页「自定义策略」里只保留这些，并把节点来源指到订阅：

| 自定义策略 | 应包含 | 不要指向 |
| --- | --- | --- |
| 🤖 AI代理 | 资源「越过山丘」的节点 | 不要套 🚀 通用代理，不要只剩 DIRECT |
| ♻️ 通用自动 | 资源「蓝莓桥」的节点（延迟测试） | 测速失败出现黄色 `!` 时先确认已包含蓝莓桥 |
| 🚀 通用代理 | `♻️ 通用自动` + 资源「蓝莓桥」 | 不要只剩 DIRECT |
| 🚫 屏蔽系统更新 | `reject`（默认）、`direct` | 不要停在 DIRECT，否则系统更新拦不住 |

对应配置：

```
static=🤖 AI代理, resource-tag-regex=越过山丘
url-latency-benchmark=♻️ 通用自动, resource-tag-regex=蓝莓桥, check-interval=300, tolerance=80, alive-checking=false
static=🚀 通用代理, ♻️ 通用自动, resource-tag-regex=蓝莓桥
static=🚫 屏蔽系统更新, reject, direct
```

App 里也可以：点进策略组 → 编辑 → 包含资源 → 勾选对应订阅。

### 2. 用链接导入分流

圈 X → 分流规则 → 引用 → 添加。**不要开启强制策略。**

```
https://raw.githubusercontent.com/shawnlxuan/my-clashparty-override/main/quantumult-x.list
```

国内网络可用：

```
https://testingcf.jsdelivr.net/gh/shawnlxuan/my-clashparty-override@main/quantumult-x.list
```

导入或更新后，点一次该资源的「更新」。完整对齐 Clash 时，再把 [quantumult-x.conf](./quantumult-x.conf) 的 `[filter_remote]` 其余条目加上（广告 / OpenAI / 微软 / 国内）。`[filter_local]` 只保留：

```
geoip, cn, direct
final, 🚀 通用代理
```

## 屏蔽 Apple OTA

用分流 `REJECT` / `reject` 拦截更新目录和固件 CDN，不引用 blackmatrix7 `SystemOTA` 整集（会误伤 `ocsp.apple.com`、`gs.apple.com`）。

临时升级：圈 X 把策略组「🚫 屏蔽系统更新」改成 `direct`；Clash 删掉或改写对应 `REJECT` 行。
