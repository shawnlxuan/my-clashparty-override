/**
 * FlClash / Bettbox 通用覆写脚本
 *
 * 使用方式：
 * - 当前 Profile 作为通用订阅，脚本自动读取其中的 proxies/proxy-providers；
 * - 额外注入 AI 专用订阅；
 * - FlClash 可绑定到单个 Profile；
 * - Bettbox 作为全局覆写使用，并只对目标 Profile 启用。
 */

const Compatible_With_Bettbox = { ruleOptionsEnable: true };

var AI_SUB_URL = "https://example.com/replace-with-your-ai-subscription";
var TEST_URL = "http://www.gstatic.com/generate_204";
var RULE_PROVIDER_INTERVAL = 86400;
var BLACKMATRIX7_RULE_BASE =
  "https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/";

function uniqueStrings(items) {
  var result = [];
  var seen = {};

  for (var i = 0; i < items.length; i++) {
    var value = items[i];
    if (typeof value !== "string" || value.length === 0 || seen[value]) {
      continue;
    }
    seen[value] = true;
    result.push(value);
  }

  return result;
}

function getCurrentProxyNames(config) {
  var proxies = Array.isArray(config.proxies) ? config.proxies : [];
  var result = [];

  for (var i = 0; i < proxies.length; i++) {
    if (
      proxies[i] &&
      typeof proxies[i].name === "string" &&
      proxies[i].name.length > 0
    ) {
      result.push(proxies[i].name);
    }
  }

  return uniqueStrings(result);
}

function getCurrentProviderNames(config) {
  var providers = config["proxy-providers"];
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return [];
  }

  return uniqueStrings(
    Object.keys(providers).filter(function (name) {
      return name !== "AI专用订阅";
    })
  );
}

function addSources(group, proxyNames, providerNames) {
  if (proxyNames.length > 0) {
    group.proxies = proxyNames.slice();
  }
  if (providerNames.length > 0) {
    group.use = providerNames.slice();
  }
  return group;
}

function addBlackmatrixRuleProvider(config, name, upstreamPath, cacheName) {
  config["rule-providers"][name] = {
    type: "http",
    behavior: "classical",
    format: "yaml",
    url: BLACKMATRIX7_RULE_BASE + upstreamPath,
    path: "./rules/blackmatrix7_" + cacheName + ".yaml",
    interval: RULE_PROVIDER_INTERVAL
  };
}

function main(config) {
  if (!config || typeof config !== "object") {
    throw new Error("当前 Profile 没有生成有效的 Mihomo 配置");
  }

  /* 注入 AI provider 前，先记录当前 Profile 的通用节点。 */
  var generalProxyNames = getCurrentProxyNames(config);
  var generalProviderNames = getCurrentProviderNames(config);

  if (generalProxyNames.length === 0 && generalProviderNames.length === 0) {
    throw new Error("当前通用订阅中没有找到节点或 proxy-provider");
  }

  config.mode = "rule";
  config.ipv6 = false;
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["find-process-mode"] = "always";

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

  if (!config.profile || typeof config.profile !== "object" || Array.isArray(config.profile)) {
    config.profile = {};
  }
  config.profile["store-selected"] = true;

  /* Android：保留原 DNS 其余字段，覆盖分流所需的关键项。 */
  var originalDNS =
    config.dns && typeof config.dns === "object" && !Array.isArray(config.dns)
      ? config.dns
      : {};

  config.dns = Object.assign({}, originalDNS, {
    enable: true,
    ipv6: false,
    "respect-rules": false,
    "prefer-h3": false,
    "use-hosts": true,
    "use-system-hosts": true,
    "cache-algorithm": "arc",
    "default-nameserver": ["223.5.5.5", "119.29.29.29", "1.1.1.1"],
    nameserver: [
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query",
      "https://1.1.1.1/dns-query"
    ],
    "proxy-server-nameserver": ["223.5.5.5", "119.29.29.29", "1.1.1.1"],
    "direct-nameserver": ["223.5.5.5", "119.29.29.29"]
  });

  /*
   * Android App 兼容：这些域名返回真实 IP。
   * whitelist 模式语义相反，因此不向其中追加排除项。
   */
  if (config.dns["fake-ip-filter-mode"] !== "whitelist") {
    var originalFakeIPFilter = Array.isArray(originalDNS["fake-ip-filter"])
      ? originalDNS["fake-ip-filter"]
      : [];

    config.dns["fake-ip-filter"] = uniqueStrings(
      originalFakeIPFilter.concat([
        "*.lan",
        "*.local",
        "*.arpa",
        "www.gstatic.com",
        "+.gstatic.com",
        "cp.cloudflare.com",
        "captive.apple.com",
        "+.openai.com",
        "+.chatgpt.com",
        "+.oaistatic.com",
        "+.oaiusercontent.com",
        "+.chat.com",
        "+.sora.com",
        "+.anthropic.com",
        "+.claude.ai",
        "+.claudeusercontent.com"
      ])
    );
  }

  /* 只使用嗅探结果辅助匹配，不改写 Android App 的实际目标地址。 */
  config.sniffer = {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    "override-destination": false,
    "skip-domain": [
      "Mijia Cloud",
      "+.push.apple.com",
      "+.openai.com",
      "+.chatgpt.com"
    ],
    sniff: {
      HTTP: {
        ports: [80, "8080-8880"],
        "override-destination": false
      },
      TLS: {
        ports: [443, 8443],
        "override-destination": false
      }
    }
  };

  if (
    !config["proxy-providers"] ||
    typeof config["proxy-providers"] !== "object" ||
    Array.isArray(config["proxy-providers"])
  ) {
    config["proxy-providers"] = {};
  }

  config["proxy-providers"]["AI专用订阅"] = {
    type: "http",
    url: AI_SUB_URL,
    path: "./providers/ai_injected.yaml",
    interval: 21600,
    proxy: "DIRECT",
    header: {
      "User-Agent": ["clash-verge/v2.5.1"]
    },
    override: {
      "additional-prefix": "[AI] ",
      "ip-version": "ipv4-prefer"
    },
    "health-check": {
      enable: true,
      url: TEST_URL,
      interval: 1800,
      timeout: 10000,
      lazy: true,
      "expected-status": 204
    }
  };

  if (
    !config["rule-providers"] ||
    typeof config["rule-providers"] !== "object" ||
    Array.isArray(config["rule-providers"])
  ) {
    config["rule-providers"] = {};
  }

  addBlackmatrixRuleProvider(config, "BM7-OpenAI", "OpenAI/OpenAI.yaml", "openai");
  addBlackmatrixRuleProvider(config, "BM7-Anthropic", "Anthropic/Anthropic.yaml", "anthropic");
  addBlackmatrixRuleProvider(config, "BM7-Claude", "Claude/Claude.yaml", "claude");
  addBlackmatrixRuleProvider(config, "BM7-BardAI", "BardAI/BardAI.yaml", "bard_ai");
  addBlackmatrixRuleProvider(config, "BM7-Gemini", "Gemini/Gemini.yaml", "gemini");
  addBlackmatrixRuleProvider(config, "BM7-Copilot", "Copilot/Copilot.yaml", "copilot");
  addBlackmatrixRuleProvider(config, "BM7-Civitai", "Civitai/Civitai.yaml", "civitai");
  addBlackmatrixRuleProvider(config, "BM7-Microsoft", "Microsoft/Microsoft.yaml", "microsoft");

  var generalSelectGroup = {
    name: "🚀 通用代理",
    type: "select",
    proxies: ["♻️ 通用自动"].concat(generalProxyNames)
  };
  if (generalProviderNames.length > 0) {
    generalSelectGroup.use = generalProviderNames.slice();
  }

  var generalAutoGroup = {
    name: "♻️ 通用自动",
    type: "url-test",
    url: TEST_URL,
    interval: 300,
    tolerance: 80,
    timeout: 8000,
    lazy: true,
    "empty-fallback": "REJECT"
  };
  addSources(
    generalAutoGroup,
    generalProxyNames,
    generalProviderNames
  );

  var overviewGroup = {
    name: "📋 节点总览（仅查看）",
    type: "select"
  };
  addSources(
    overviewGroup,
    generalProxyNames,
    ["AI专用订阅"].concat(generalProviderNames)
  );

  config["proxy-groups"] = [
    {
      name: "🤖 AI代理",
      type: "select",
      url: TEST_URL,
      "empty-fallback": "REJECT",
      use: ["AI专用订阅"]
    },
    generalSelectGroup,
    generalAutoGroup,
    overviewGroup
  ];

  config.rules = [
    /* 测速地址。 */
    "DOMAIN,www.gstatic.com,🤖 AI代理",
    "DOMAIN-SUFFIX,gstatic.com,🤖 AI代理",
    "DOMAIN,cp.cloudflare.com,🤖 AI代理",
    "DOMAIN,captive.apple.com,🤖 AI代理",

    /* Android 客户端/内核进程。 */
    "PROCESS-NAME,com.github.metacubex.clash.meta,DIRECT",
    "PROCESS-NAME,ClashMetaForAndroid,DIRECT",
    "PROCESS-NAME,com.follow.clash,DIRECT",
    "PROCESS-NAME,com.appshub.bettbox,DIRECT",

    /* DNS。 */
    "IP-CIDR,223.5.5.5/32,DIRECT,no-resolve",
    "IP-CIDR,223.6.6.6/32,DIRECT,no-resolve",
    "IP-CIDR,119.29.29.29/32,DIRECT,no-resolve",
    "IP-CIDR,1.1.1.1/32,DIRECT,no-resolve",
    "IP-CIDR,1.0.0.1/32,DIRECT,no-resolve",
    "DOMAIN,dns.alidns.com,DIRECT",
    "DOMAIN,doh.pub,DIRECT",

    /* 局域网、回环及保留地址。 */
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

    "GEOSITE,category-ads-all,REJECT",

    /* Bing 国内版直连。 */
    "DOMAIN,cn.bing.com,DIRECT",
    "DOMAIN-SUFFIX,cn.bing.com,DIRECT",
    "DOMAIN-SUFFIX,bing.com.cn,DIRECT",

    /* 微软、Copilot、国际 Bing 走通用代理。 */
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

    /* Android Grok 登录依赖 Google Credential Manager，保持通用出口。 */
    "DOMAIN-SUFFIX,x.ai,🚀 通用代理",
    "DOMAIN-SUFFIX,grok.com,🚀 通用代理",

    "RULE-SET,BM7-OpenAI,🤖 AI代理",
    "RULE-SET,BM7-Anthropic,🤖 AI代理",
    "RULE-SET,BM7-Claude,🤖 AI代理",
    "RULE-SET,BM7-BardAI,🤖 AI代理",
    "RULE-SET,BM7-Gemini,🤖 AI代理",
    "RULE-SET,BM7-Copilot,🤖 AI代理",
    "RULE-SET,BM7-Civitai,🤖 AI代理",
    "GEOSITE,category-ai-!cn,🤖 AI代理",

    "DOMAIN-SUFFIX,chat.com,🤖 AI代理",
    "DOMAIN-SUFFIX,sora.com,🤖 AI代理",
    "DOMAIN-SUFFIX,claudeusercontent.com,🤖 AI代理",
    "DOMAIN,aistudio.google.com,🤖 AI代理",
    "DOMAIN,notebooklm.google.com,🤖 AI代理",
    "DOMAIN-SUFFIX,perplexity.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,pplx.ai,🤖 AI代理",
    "DOMAIN-SUFFIX,poe.com,🤖 AI代理",
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

    /* Android Google Play 特例，必须在 GEOSITE,cn 之前。 */
    "DOMAIN,services.googleapis.cn,🚀 通用代理",
    "DOMAIN-SUFFIX,xn--ngstr-lra8j.com,🚀 通用代理",

    "RULE-SET,BM7-Microsoft,🚀 通用代理",
    "GEOSITE,cn,DIRECT",
    "GEOIP,CN,DIRECT,no-resolve",
    "MATCH,🚀 通用代理"
  ];

  return config;
}

