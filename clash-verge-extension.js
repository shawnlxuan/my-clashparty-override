/**
 * Clash Verge Rev：通用订阅作为主配置，额外注入 AI 订阅
 *
 * 修正版：
 * - 不覆盖通用订阅原有的全局 IPv6、User-Agent、指纹和网络设置；
 * - 内核连节点走直连，避免规则模式把节点握手再次分流；
 * - AI 节点使用 ipv4-prefer（优先 IPv4，必要时回退 IPv6）；
 * - 自动沿用通用订阅原本的测速 URL；
 * - AI provider 使用 Clash Verge User-Agent；
 * - AI provider 使用独立缓存路径。
 */

var AI_SUB_URL = "https://example.com/replace-with-your-ai-subscription";
var AI_TEST_URL = "http://www.gstatic.com/generate_204";
var FALLBACK_TEST_URL = "http://www.google.com/generate_204";

/*
 * blackmatrix7/ios_rule_script 的 MASTER 分支会持续生成规则。
 * Mihomo 按下面的 interval 自动重新下载，无需手工复制域名。
 * testingcf.jsdelivr.net 与本脚本现有 Geo 数据源保持一致，
 * 在中国大陆网络环境下一般比 raw.githubusercontent.com 稳定。
 */
var RULE_PROVIDER_INTERVAL = 86400;
var BLACKMATRIX7_RULE_BASE =
  "https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/";

function addBlackmatrixRuleProvider(
  config,
  name,
  upstreamPath,
  cacheName
) {
  config["rule-providers"][name] = {
    type: "http",
    behavior: "classical",
    format: "yaml",
    url: BLACKMATRIX7_RULE_BASE + upstreamPath,
    path:
      "./rule_provider/blackmatrix7_" +
      cacheName +
      ".yaml",
    interval: RULE_PROVIDER_INTERVAL
  };
}

function uniqueStrings(items) {
  var result = [];
  var seen = {};

  for (var i = 0; i < items.length; i++) {
    var value = items[i];

    if (
      typeof value !== "string" ||
      value.length === 0 ||
      seen[value]
    ) {
      continue;
    }

    seen[value] = true;
    result.push(value);
  }

  return result;
}

function getCurrentProxyNames(config) {
  var proxies = Array.isArray(config.proxies)
    ? config.proxies
    : [];

  var result = [];

  for (var i = 0; i < proxies.length; i++) {
    var proxy = proxies[i];

    if (
      proxy &&
      typeof proxy.name === "string" &&
      proxy.name.length > 0
    ) {
      result.push(proxy.name);
    }
  }

  return uniqueStrings(result);
}

function getCurrentProviderNames(config) {
  var providers = config["proxy-providers"];

  if (
    !providers ||
    typeof providers !== "object" ||
    Array.isArray(providers)
  ) {
    return [];
  }

  var names = Object.keys(providers);
  var result = [];

  for (var i = 0; i < names.length; i++) {
    if (
      names[i] !== "AI专用订阅" &&
      names[i] !== "AI订阅信息镜像"
    ) {
      result.push(names[i]);
    }
  }

  return uniqueStrings(result);
}

function getOriginalTestURL(config) {
  var groups = Array.isArray(config["proxy-groups"])
    ? config["proxy-groups"]
    : [];

  for (var i = 0; i < groups.length; i++) {
    if (
      groups[i] &&
      typeof groups[i].url === "string" &&
      groups[i].url.length > 0
    ) {
      return groups[i].url;
    }
  }

  var providers = config["proxy-providers"];

  if (
    providers &&
    typeof providers === "object" &&
    !Array.isArray(providers)
  ) {
    var names = Object.keys(providers);

    for (var j = 0; j < names.length; j++) {
      var provider = providers[names[j]];
      var healthCheck =
        provider && provider["health-check"];

      if (
        healthCheck &&
        typeof healthCheck.url === "string" &&
        healthCheck.url.length > 0
      ) {
        return healthCheck.url;
      }
    }
  }

  return FALLBACK_TEST_URL;
}

function addSources(
  group,
  proxyNames,
  providerNames
) {
  if (proxyNames.length > 0) {
    group.proxies = proxyNames.slice();
  }

  if (providerNames.length > 0) {
    group.use = providerNames.slice();
  }

  return group;
}

function main(config, profileName) {
  if (!config || typeof config !== "object") {
    throw new Error(
      "当前订阅没有生成有效的 Mihomo 配置"
    );
  }

  /*
   * 注入 AI provider 之前，先记录当前通用订阅
   * 原有的节点、provider 和测速地址。
   */
  var generalProxyNames =
    getCurrentProxyNames(config);

  var generalProviderNames =
    getCurrentProviderNames(config);

  var testURL =
    getOriginalTestURL(config);

  if (
    generalProxyNames.length === 0 &&
    generalProviderNames.length === 0
  ) {
    throw new Error(
      "通用订阅中没有找到任何节点或 proxy-provider"
    );
  }

  /*
   * 只修改分流需要的设置。
   *
   * 不修改：
   * - ipv6
   * - global-ua
   * - global-client-fingerprint
   * - interface-name
   */
  config.mode = "rule";
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;

  /*
   * 让 PROCESS-NAME 能识别内核进程。
   * always：所有连接都查进程，避免 Windows TUN 下漏匹配。
   */
  config["find-process-mode"] = "always";

  /*
   * 内核出站绑定物理网卡，避免 TUN 把「连节点」的握手
   * 再送进规则表。只改这一项，保留原订阅其余 tun 字段。
   */
  if (
    config.tun &&
    typeof config.tun === "object" &&
    !Array.isArray(config.tun)
  ) {
    config.tun["auto-detect-interface"] = true;
  }

  /*
 * 显式修复 DNS。
 *
 * 保留原配置的 enhanced-mode、fake-ip-range 等字段，
 * 只覆盖可能造成解析失败的关键 DNS 项。
 */
  var originalDNS =
    config.dns &&
      typeof config.dns === "object" &&
      !Array.isArray(config.dns)
      ? config.dns
      : {};

  config.dns = Object.assign(
    {},
    originalDNS,
    {
      enable: true,

      /*
       * 不让 DNS 请求再经过当前分流规则，
       * 避免 DNS 查询自身出现循环依赖。
       */
      "respect-rules": false,

      "prefer-h3": false,
      "use-hosts": true,
      "use-system-hosts": true,
      "cache-algorithm": "arc",

      /*
       * 是否返回 AAAA 记录。
       * 你的原始订阅配置本身启用了 IPv6，因此保留。
       */
      ipv6: true,

      /*
       * 用于解析 DoH 服务器自身域名。
       * 必须优先使用纯 IP DNS。
       */
      "default-nameserver": [
        "223.5.5.5",
        "119.29.29.29",
        "1.1.1.1"
      ],

      /*
       * 普通目标域名解析。
       */
      nameserver: [
        "https://dns.alidns.com/dns-query",
        "https://doh.pub/dns-query",
        "https://1.1.1.1/dns-query"
      ],

      /*
       * 专门解析 VLESS、Hysteria2 等代理节点
       * server 字段中的域名。
       *
       * 使用纯 IP DNS，避免加密 DNS 域名再次需要解析。
       */
      "proxy-server-nameserver": [
        "223.5.5.5",
        "119.29.29.29",
        "1.1.1.1"
      ],

      /*
       * DIRECT 出口域名解析。
       */
      "direct-nameserver": [
        "223.5.5.5",
        "119.29.29.29"
      ]
    }
  );

  /*
   * 测速域名必须解析真实 IP。
   * fake-ip 会让 URLTest 把 198.18.x.x 丢给节点，节点无法访问，
   * 界面显示 Timeout，但 ChatGPT 等真实流量仍然正常。
   */
  if (config.dns["fake-ip-filter-mode"] !== "whitelist") {
    var originalFakeIPFilter = Array.isArray(originalDNS["fake-ip-filter"])
      ? originalDNS["fake-ip-filter"]
      : [];

    config.dns["fake-ip-filter"] = uniqueStrings(
      originalFakeIPFilter.concat([
        "www.gstatic.com",
        "+.gstatic.com",
        "cp.cloudflare.com",
        "captive.apple.com"
      ])
    );
  }

  /*
   * 强制开启域名嗅探。
   *
   * 用于从仅显示 IP 的 TLS、HTTP 连接中恢复域名，
   * 使 ChatGPT 等应用能够命中 AI 域名规则，而不是落入 MATCH。
   *
   * 不嗅探 QUIC：Hysteria2 / TUIC 本身就是 QUIC，
   * parse-pure-ip 会把「内核连 AI 节点」的握手当成普通 QUIC，
   * 再按伪装 SNI 重新分流，规则模式下测速和连接都会失败。
   * 全局模式不走规则表，所以同一批节点看起来完全正常。
   */
  config.sniffer = {
    enable: true,

    /*
     * 对 DNS 映射流量进行嗅探。
     */
    "force-dns-mapping": true,

    /*
     * 对只有目标 IP、没有域名的连接尝试嗅探。
     * 给走 IP 的 AI 客户端补域名；内核连节点由下面的
     * PROCESS-NAME 直连规则拦住，不会再被嗅探结果带走。
     */
    "parse-pure-ip": true,

    /*
     * 使用嗅探出来的域名参与规则匹配和实际连接。
     */
    "override-destination": true,

    "skip-domain": [
      "Mijia Cloud",
      "+.push.apple.com"
    ],

    sniff: {
      HTTP: {
        ports: [
          80,
          "8080-8880"
        ],
        "override-destination": true
      },

      TLS: {
        ports: [
          443,
          8443
        ],
        "override-destination": true
      }
    }
  };

  /*
   * GEO 数据自动更新。
   */
  config["geo-auto-update"] = true;
  config["geo-update-interval"] = 24;

  config["geox-url"] = {
    geoip:
      "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",

    geosite:
      "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",

    mmdb:
      "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb",

    asn:
      "https://github.com/xishang0128/geoip/releases/download/latest/GeoLite2-ASN.mmdb"
  };

  if (
    !config.profile ||
    typeof config.profile !== "object" ||
    Array.isArray(config.profile)
  ) {
    config.profile = {};
  }

  config.profile["store-selected"] = true;

  if (
    !config["proxy-providers"] ||
    typeof config["proxy-providers"] !== "object" ||
    Array.isArray(config["proxy-providers"])
  ) {
    config["proxy-providers"] = {};
  }

  /*
   * 注入 AI 专用订阅。
   *
   * 使用新的缓存路径，避免读取旧的失败缓存。
   */
  config["proxy-providers"]["AI专用订阅"] = {
    type: "http",
    url: AI_SUB_URL,
    path:
      "./proxy_provider/verge_ai_fixed_v2.yaml",

    interval: 21600,

    /*
     * provider 下载本身走直连。
     * 这里只影响下载订阅文件，不影响 AI 节点流量。
     */
    proxy: "DIRECT",

    /*
     * 避免订阅服务器根据 User-Agent
     * 返回网页或非 Clash 格式内容。
     */
    header: {
      "User-Agent": [
        "clash-verge/v2.5.1"
      ]
    },

    override: {
      "additional-prefix": "[AI] ",

      /*
       * 连接 AI 节点 server 时优先 IPv4，但允许 IPv6 回退。
       *
       * 原先强制 ipv4（仅 IPv4、无回退）时，校园网 / 部分宽带 /
       * 仅 IPv6 或 IPv4 质量差的网络会连不上 AI 节点，
       * 而通用订阅默认 dual，所以同一网络下通用节点仍可用。
       *
       * ipv4-prefer：TCP 双栈竞速且偏爱 IPv4，既避开常见的
       * “AAAA 能解析但 IPv6 黑洞”卡顿，又能在 IPv4 不通时走 IPv6。
       * 不关闭系统或 Mihomo 的全局 IPv6。
       */
      "ip-version": "ipv4-prefer"
    },

    "health-check": {
      enable: true,
      url: AI_TEST_URL,
      interval: 1800,
      timeout: 10000,
      lazy: true,
      "expected-status": 204
    }
  };

  /*
   * 注入远程分流规则。
   *
   * 不覆盖通用订阅原有的 rule-providers；只更新本脚本负责的
   * blackmatrix7 条目。Mihomo 每 24 小时自动与 MASTER 分支同步。
   * Anthropic/Claude、BardAI/Gemini 虽有少量重叠，但同时引用可以
   * 保留各自独有的域名，并承接上游未来独立更新。
   */
  if (
    !config["rule-providers"] ||
    typeof config["rule-providers"] !== "object" ||
    Array.isArray(config["rule-providers"])
  ) {
    config["rule-providers"] = {};
  }

  addBlackmatrixRuleProvider(
    config,
    "BM7-OpenAI",
    "OpenAI/OpenAI.yaml",
    "openai"
  );

  addBlackmatrixRuleProvider(
    config,
    "BM7-Anthropic",
    "Anthropic/Anthropic.yaml",
    "anthropic"
  );

  addBlackmatrixRuleProvider(
    config,
    "BM7-Claude",
    "Claude/Claude.yaml",
    "claude"
  );

  addBlackmatrixRuleProvider(
    config,
    "BM7-BardAI",
    "BardAI/BardAI.yaml",
    "bard_ai"
  );

  addBlackmatrixRuleProvider(
    config,
    "BM7-Gemini",
    "Gemini/Gemini.yaml",
    "gemini"
  );

  addBlackmatrixRuleProvider(
    config,
    "BM7-Copilot",
    "Copilot/Copilot.yaml",
    "copilot"
  );

  addBlackmatrixRuleProvider(
    config,
    "BM7-Civitai",
    "Civitai/Civitai.yaml",
    "civitai"
  );

  addBlackmatrixRuleProvider(
    config,
    "BM7-Microsoft",
    "Microsoft/Microsoft.yaml",
    "microsoft"
  );

  /*
   * 通用手动选择组。
   *
   * 当前通用订阅如果是 proxies 结构，
   * 节点名称会直接加入 proxies。
   *
   * 当前通用订阅如果是 proxy-providers 结构，
   * 则通过 use 引用原 provider。
   */
  var generalSelectGroup = {
    name: "🚀 通用代理",
    type: "select",

    proxies: [
      "♻️ 通用自动"
    ].concat(generalProxyNames)
  };

  if (generalProviderNames.length > 0) {
    generalSelectGroup.use =
      generalProviderNames.slice();
  }

  /*
   * 通用自动选择组。
   *
   * 只包含当前通用订阅的节点，
   * 不包含 AI 节点。
   *
   * 测速地址沿用原订阅。
   */
  var generalAutoGroup = {
    name: "♻️ 通用自动",
    type: "url-test",

    url: testURL,
    interval: 300,
    tolerance: 80,
    timeout: 8000,
    lazy: true
  };

  addSources(
    generalAutoGroup,
    generalProxyNames,
    generalProviderNames
  );

  /*
   * 节点总览只用于查看。
   * 没有任何分流规则引用本组。
   */
  var overviewGroup = {
    name: "📋 节点总览（仅查看）",
    type: "select"
  };

  addSources(
    overviewGroup,
    generalProxyNames,
    [
      "AI专用订阅"
    ].concat(generalProviderNames)
  );

  /*
   * 重建策略组。
   */
  config["proxy-groups"] = [
    {
      name: "🤖 AI代理",
      type: "select",
      url: AI_TEST_URL,

      use: [
        "AI专用订阅"
      ]
    },

    generalSelectGroup,
    generalAutoGroup,
    overviewGroup
  ];

  /*
   * 分流规则由上到下匹配。
   * 命中第一条规则后停止继续匹配。
   */
  config.rules = [
    /*
     * 测速 URL 绝不能走 DIRECT 或广告拦截。
     *
     * 内核 PROCESS-NAME 直连会把 URLTest 对 gstatic / Cloudflare
     * 的 HEAD 请求送去国内，规则模式下显示 Timeout；
     * 真实 AI 流量来自浏览器 / Cursor，不受影响，所以能连。
     * 全局模式不查规则，测速看起来又是正常的。
     *
     * Clash Verge 默认测速地址是 http://cp.cloudflare.com。
     */
    "DOMAIN,www.gstatic.com,🤖 AI代理",
    "DOMAIN-SUFFIX,gstatic.com,🤖 AI代理",
    "DOMAIN,cp.cloudflare.com,🤖 AI代理",
    "DOMAIN,captive.apple.com,🤖 AI代理",

    /*
     * 内核连节点必须直连，不能再进分流。
     *
     * 规则模式下 TUN 会把 verge-mihomo 访问 AI 节点的握手
     * 再次送进规则表。嗅探到 Reality / HY2 伪装 SNI
     * （常见为微软、谷歌）后，会命中 BM7-Microsoft 或 MATCH，
     * 流量被送去「通用代理」套娃，测速和连接都失败。
     * 全局模式不匹配规则，所以同一批 AI 节点可以成功。
     *
     * 只放行内核，不放行 clash-verge.exe：
     * 图形界面自己的联网仍应走分流。
     */
    "PROCESS-NAME,verge-mihomo.exe,DIRECT",
    "PROCESS-NAME,verge-mihomo-alpha.exe,DIRECT",
    "PROCESS-NAME,mihomo.exe,DIRECT",
    "PROCESS-NAME,clash-meta.exe,DIRECT",
    "PROCESS-NAME,verge-mihomo,DIRECT",
    "PROCESS-NAME,mihomo,DIRECT",
    "PROCESS-NAME,clash-meta,DIRECT",

    /*
     * DNS 查询不能落入 MATCH → 通用代理。
     * 1.1.1.1 不是 CN，规则模式下会套娃，节点域名解析失败。
     */
    "IP-CIDR,223.5.5.5/32,DIRECT,no-resolve",
    "IP-CIDR,223.6.6.6/32,DIRECT,no-resolve",
    "IP-CIDR,119.29.29.29/32,DIRECT,no-resolve",
    "IP-CIDR,1.1.1.1/32,DIRECT,no-resolve",
    "IP-CIDR,1.0.0.1/32,DIRECT,no-resolve",
    "DOMAIN,dns.alidns.com,DIRECT",
    "DOMAIN,doh.pub,DIRECT",

    /*
     * 局域网、回环和保留地址。
     */
    "GEOSITE,private,DIRECT",

    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,100.64.0.0/10,DIRECT,no-resolve",
    "IP-CIDR,169.254.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
    "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",

    "IP-CIDR6,::1/128,DIRECT,no-resolve",
    "IP-CIDR6,fc00::/7,DIRECT,no-resolve",
    "IP-CIDR6,fe80::/10,DIRECT,no-resolve",

    /*
     * 广告和跟踪域名。
     */
    "GEOSITE,category-ads-all,REJECT",

    /*
     * Bing 国内版直连。必须写在 Copilot / Microsoft 之前，
     * 否则 DOMAIN-SUFFIX,bing.com 会把 cn.bing.com 送去代理。
     */
    "DOMAIN,cn.bing.com,DIRECT",
    "DOMAIN-SUFFIX,cn.bing.com,DIRECT",
    "DOMAIN-SUFFIX,bing.com.cn,DIRECT",

    /*
     * 微软相关（含 Copilot、国际版 Bing）走通用代理，不占用 AI 订阅。
     * 必须在 BM7-Copilot 和 GEOSITE,category-ai-!cn 之前。
     *
     * 不用 BM7-Copilot 整集改出口：那份规则夹了 Cloudflare 等公共域名，
     * 会把 AI 节点 Reality 握手误送进通用代理。
     */
    "DOMAIN,www.bing.com,🚀 通用代理",
    "DOMAIN,bing.com,🚀 通用代理",
    "DOMAIN,r.bing.com,🚀 通用代理",
    "DOMAIN,sydney.bing.com,🚀 通用代理",
    "DOMAIN,services.bingapis.com,🚀 通用代理",
    "DOMAIN-SUFFIX,edgeservices.bing.com,🚀 通用代理",
    "DOMAIN-SUFFIX,copilot.microsoft.com,🚀 通用代理",
    "DOMAIN-SUFFIX,copilot.cloud.microsoft,🚀 通用代理",
    "DOMAIN-SUFFIX,githubcopilot.com,🚀 通用代理",
    "DOMAIN,copilot-proxy.githubusercontent.com,🚀 通用代理",
    "DOMAIN,copilot-workspace.githubnext.com,🚀 通用代理",
    "DOMAIN,gateway.bingviz.microsoft.net,🚀 通用代理",
    "DOMAIN,gateway.bingviz.microsoftapp.net,🚀 通用代理",

    /*
     * blackmatrix7 独立 AI 规则集，每 24 小时同步。
     * Copilot 规则集仍保留在 Microsoft 之前，但微软域名已在上面
     * 改走通用；其中夹带的 openai.com / chatgpt.com 仍由 OpenAI 命中 AI。
     */
    "RULE-SET,BM7-OpenAI,🤖 AI代理",
    "RULE-SET,BM7-Anthropic,🤖 AI代理",
    "RULE-SET,BM7-Claude,🤖 AI代理",
    "RULE-SET,BM7-BardAI,🤖 AI代理",
    "RULE-SET,BM7-Gemini,🤖 AI代理",
    "RULE-SET,BM7-Copilot,🤖 AI代理",
    "RULE-SET,BM7-Civitai,🤖 AI代理",

    /*
     * MetaCubeX GeoSite 的海外 AI 汇总分类。
     * geosite.dat 已由上面的 geo-auto-update 每 24 小时更新，
     * 用它覆盖独立规则集尚未单独列出的海外 AI 服务。
     */
    "GEOSITE,category-ai-!cn,🤖 AI代理",

    /*
     * 上游当前遗漏或更新较慢的常用海外 AI 域名补充。
     * 这里只保留服务自身域名，避免把共享 CDN 整体导向 AI 节点。
     */
    "DOMAIN-SUFFIX,chat.com,🤖 AI代理",
    "DOMAIN-SUFFIX,sora.com,🤖 AI代理",
    "DOMAIN-SUFFIX,claudeusercontent.com,🤖 AI代理",
    "DOMAIN,aistudio.google.com,🤖 AI代理",
    "DOMAIN,notebooklm.google.com,🤖 AI代理",
    "DOMAIN-SUFFIX,perplexity.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,pplx.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,poe.com,🤖 AI代理",
    "DOMAIN-SUFFIX,x.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,grok.com,🤖 AI代理",
    "DOMAIN-SUFFIX,mistral.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,groq.com,🤖 AI代理",
    "DOMAIN-SUFFIX,huggingface.co,🤖 AI代理",
    "DOMAIN-SUFFIX,hf.co,🤖 AI代理",
    "DOMAIN-SUFFIX,cohere.com,🤖 AI代理",
    "DOMAIN-SUFFIX,together.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,replicate.com,🤖 AI代理",
    "DOMAIN-SUFFIX,openrouter.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,deepinfra.com,🤖 AI代理",
    "DOMAIN-SUFFIX,fireworks.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,fal.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,stability.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,midjourney.com,🤖 AI代理",
    "DOMAIN-SUFFIX,runwayml.com,🤖 AI代理",
    "DOMAIN-SUFFIX,leonardo.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,ideogram.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,elevenlabs.io,🤖 AI代理",
    "DOMAIN-SUFFIX,suno.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,udio.com,🤖 AI代理",
    "DOMAIN-SUFFIX,lumalabs.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,character.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,phind.com,🤖 AI代理",
    "DOMAIN-SUFFIX,cursor.com,🤖 AI代理",
    "DOMAIN-SUFFIX,cursor.sh,🤖 AI代理",
    "DOMAIN-SUFFIX,windsurf.com,🤖 AI代理",
    "DOMAIN-SUFFIX,codeium.com,🤖 AI代理",
    "DOMAIN-SUFFIX,v0.dev,🤖 AI代理",
    "DOMAIN-SUFFIX,bolt.new,🤖 AI代理",
    "DOMAIN-SUFFIX,lovable.dev,🤖 AI代理",
    "DOMAIN-SUFFIX,manus.im,🤖 AI代理",
    "DOMAIN-SUFFIX,genspark.ai,🤖 AI代理",

    /*
     * blackmatrix7 的 Microsoft 总规则约 670 条，覆盖账号认证、
     * Office/OneDrive/Teams、Windows、Azure、Bing、Xbox 等服务。
     * 国内 Bing 与微软 Copilot 已在它之前单独分流。
     */
    "RULE-SET,BM7-Microsoft,🚀 通用代理",

    /*
     * 中国大陆域名和 IP。
     */
    "GEOSITE,cn,DIRECT",
    "GEOIP,CN,DIRECT,no-resolve",

    /*
     * 其余流量走通用订阅。
     */
    "MATCH,🚀 通用代理"
  ];

  return config;
}

