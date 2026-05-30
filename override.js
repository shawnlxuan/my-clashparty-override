/*

支持的传入参数：
- loadbalance: 启用负载均衡（url-test/load-balance，默认 false）
- landing: 启用落地节点功能（如机场家宽/星链/落地分组，默认 false）
- ipv6: 启用 IPv6 支持（默认 false）
- full: 输出完整配置（适合纯内核启动，默认 false）
- keepalive: 启用 tcp-keep-alive（默认 false）
- fakeip: DNS 使用 FakeIP 模式（默认 false，false 为 RedirHost）
- quic: 允许 QUIC 流量（UDP 443，默认 false）
- threshold: 国家节点数量小于该值时不显示分组 (默认 0)
*/

const NODE_SUFFIX = "节点";
const HEALTH_CHECK_URL = "https://cp.cloudflare.com/generate_204";
const HEALTH_CHECK_INTERVAL = 300;
const HEALTH_CHECK_EXPECTED_STATUS = 204;
const LOW_COST_PATTERN = "(?:^|[^0-9.])0\\.[0-5](?:[^0-9.]|$)|低倍率|省流|大流量|实验性";
const LANDING_PATTERN = "家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地";
const PREFERRED_COUNTRY_ORDER = ["香港", "台湾", "日本", "美国", "新加坡"];

function parseBool(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
    }
    if (typeof value === "number") {
        return value === 1;
    }
    return false;
}

function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === 'undefined') {
        return defaultValue;
    }
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
}

/**
 * 解析传入的脚本参数，并将其转换为内部使用的功能开关（feature flags）。
 * @param {object} args - 传入的原始参数对象，如 $arguments。
 * @returns {object} - 包含所有功能开关状态的对象。
 */
function buildFeatureFlags(args = {}) {
    const spec = {
        loadbalance: "loadBalance",
        landing: "landing",
        ipv6: "ipv6Enabled",
        full: "fullConfig",
        keepalive: "keepAliveEnabled",
        fakeip: "fakeIPEnabled",
        quic: "quicEnabled"
    };

    const flags = Object.entries(spec).reduce((acc, [sourceKey, targetKey]) => {
        acc[targetKey] = parseBool(args[sourceKey]) || false;
        return acc;
    }, {});

    // 单独处理数字参数
    flags.countryThreshold = Math.max(0, parseNumber(args.threshold, 0));

    return flags;
}

const rawArgs = typeof $arguments !== 'undefined' ? $arguments : {};
const {
    loadBalance,
    landing,
    ipv6Enabled,
    fullConfig,
    keepAliveEnabled,
    fakeIPEnabled,
    quicEnabled,
    countryThreshold
} = buildFeatureFlags(rawArgs);

function getCountryGroupNames(countryInfo, minCount) {
    return countryInfo
        .filter(item => item.count >= minCount)
        .map(item => item.country + NODE_SUFFIX);
}

function stripNodeSuffix(groupNames) {
    return groupNames.map(name => name.endsWith(NODE_SUFFIX) ? name.slice(0, -NODE_SUFFIX.length) : name);
}

const PROXY_GROUPS = {
    SELECT: "选择代理",
    MANUAL: "手动选择",
    FALLBACK: "故障转移",
    DIRECT: "直连",
    LANDING: "落地节点",
    LOW_COST: "低倍率节点",
    FINAL: "Final",
};

// 辅助函数，用于根据条件构建数组，自动过滤掉无效值（如 false, null）
const buildList = (...elements) => elements.flat().filter(Boolean);

// 【修复】重构 buildBaseLists
function buildBaseLists({ landing, lowCost, countryGroupNames }) {
    
    // “选择节点”组 (主分组) 的候选列表
    const defaultSelector = buildList(
        PROXY_GROUPS.FALLBACK,
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    // “故障转移”组的候选列表
    const defaultFallback = buildList(
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
    );
    
    // 【修复】为所有子分组 (AI, 媒体, 静态资源) 创建一个不含 "选择代理" 的列表
    const subgroupProxies = buildList(
        countryGroupNames,
        PROXY_GROUPS.FALLBACK,
        landing && PROXY_GROUPS.LANDING,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        PROXY_GROUPS.DIRECT
    );

    // “直连”优先的代理列表 (Bilibili 用)
    const defaultProxiesDirect = buildList(
        PROXY_GROUPS.DIRECT,
        countryGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.MANUAL
    );

    return { defaultSelector, defaultFallback, subgroupProxies, defaultProxiesDirect };
}

// 【修复】使用 format: "text" 并添加所有 .list 规则
const ruleProviders = {
    "ADBlock": {
        "type": "http",
        "behavior": "domain",
        "format": "mrs",
        "interval": 28800,
        "url": "https://cdn.jsdelivr.net/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.mrs",
        "path": "./ruleset/ADBlock.mrs"
    },
    "TruthSocial": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/TruthSocial.list",
        "path": "./ruleset/TruthSocial.list"
    },
    "StaticResources": {
        "type": "http",
        "behavior": "domain",
        "format": "text",
        "interval": 86400,
        "url": "https://ruleset.skk.moe/Clash/domainset/cdn.txt",
        "path": "./ruleset/StaticResources.txt"
    },
    "CDNResources": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://ruleset.skk.moe/Clash/non_ip/cdn.txt",
        "path": "./ruleset/CDNResources.txt"
    },
    "TikTok": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/TikTok.list",
        "path": "./ruleset/TikTok.list"
    },
    "EHentai": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/EHentai.list",
        "path": "./ruleset/EHentai.list"
    },
    "SteamFix": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/SteamFix.list",
        "path": "./ruleset/SteamFix.list"
    },
    "GoogleFCM": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/FirebaseCloudMessaging.list",
        "path": "./ruleset/FirebaseCloudMessaging.list"
    },
    "AdditionalFilter": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/AdditionalFilter.list",
        "path": "./ruleset/AdditionalFilter.list"
    },
    "AdditionalCDNResources": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/AdditionalCDNResources.list",
        "path": "./ruleset/AdditionalCDNResources.list"
    },
    "Crypto": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@master/ruleset/Crypto.list",
        "path": "./ruleset/Crypto.list"
    },
    "GFWList": {
        "type": "http",
        "behavior": "domain",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/gfw.txt",
        "path": "./ruleset/GFWList.txt"
    },
    // 【修复】添加所有 .list 规则
    "OpenAI": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/OpenAI/OpenAI.list",
        "path": "./ruleset/OpenAI.list"
    },
    "Gemini": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Gemini/Gemini.list",
        "path": "./ruleset/Gemini.list"
    },
    "Claude": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Claude/Claude.list",
        "path": "./ruleset/Claude.list"
    },
    "GitHub": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/GitHub/GitHub.list",
        "path": "./ruleset/GitHub.list"
    },
    "Steam": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Steam/Steam.list",
        "path": "./ruleset/Steam.list"
    },
    "SteamCN": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/SteamCN/SteamCN.list",
        "path": "./ruleset/SteamCN.list"
    },
    // 【新增】Xbox 规则
    "Xbox": {
        "type": "http",
        "behavior": "classical",
        "format": "text",
        "interval": 86400,
        "url": "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Xbox/Xbox.list",
        "path": "./ruleset/Xbox.list"
    }
}

// 【修复】彻底重排所有规则的优先级
const baseRules = [
    // --- 1. 广告和隐私规则 (最高优先级) ---
    `RULE-SET,ADBlock,广告拦截`,
    `RULE-SET,AdditionalFilter,广告拦截`,

    // --- 2. 高优先级直连规则 (CN/Private/SteamFix) ---
    `RULE-SET,SteamCN,${PROXY_GROUPS.DIRECT}`, // 【修复】使用 .list 规则
    `RULE-SET,SteamFix,${PROXY_GROUPS.DIRECT}`, // (保留) 原始 SteamFix
    `GEOSITE,PRIVATE,${PROXY_GROUPS.DIRECT}`,
    `GEOSITE,CN,${PROXY_GROUPS.DIRECT}`,
    `GEOIP,PRIVATE,${PROXY_GROUPS.DIRECT},no-resolve`,
    `GEOIP,CN,${PROXY_GROUPS.DIRECT},no-resolve`,
    `GEOSITE,GOOGLE-PLAY@CN,${PROXY_GROUPS.DIRECT}`,
    `GEOSITE,MICROSOFT@CN,${PROXY_GROUPS.DIRECT}`,
    `RULE-SET,GoogleFCM,${PROXY_GROUPS.DIRECT}`,

    // --- 3. 特定服务规则 (AI, 媒体等) ---
    // 【修复】使用 .list 规则
    `RULE-SET,OpenAI,OpenAI`,
    `RULE-SET,Gemini,Gemini`,
    `RULE-SET,Claude,Claude`,
    `RULE-SET,GitHub,GitHub`,
    // 【修改】Steam 规则指向 SELECT
    `RULE-SET,Steam,${PROXY_GROUPS.SELECT}`,
    // 【新增】Xbox 规则
    `RULE-SET,Xbox,Xbox`,
    
    `GEOSITE,TELEGRAM,Telegram`,
    `GEOSITE,YOUTUBE,YouTube`,
    `GEOSITE,NETFLIX,Netflix`,
    `GEOIP,NETFLIX,Netflix,no-resolve`,
    `GEOIP,TELEGRAM,Telegram,no-resolve`,
    `GEOSITE,BILIBILI,Bilibili`,
    "DST-PORT,22,SSH(22端口)",

    // --- 4. Google (Fallback) ---
    // (如果 Gemini.list 不全，GEOSITE,google 会捕获剩余的 google 流量)
    `GEOSITE,google,Gemini`, 
    `GEOIP,GOOGLE,Gemini,no-resolve`,
    
    // --- 5. 被删除的分组 (指向手动) ---
    `RULE-SET,TruthSocial,${PROXY_GROUPS.MANUAL}`, // (修改)
    `RULE-SET,Crypto,${PROXY_GROUPS.MANUAL}`, // (修改)
    `RULE-SET,EHentai,${PROXY_GROUPS.MANUAL}`, // (修改)
    `RULE-SET,TikTok,${PROXY_GROUPS.MANUAL}`, // (修改)
    `GEOSITE,SPOTIFY,${PROXY_GROUPS.MANUAL}`, // (修改)
    `GEOSITE,BAHAMUT,${PROXY_GROUPS.MANUAL}`, // (修改)
    `GEOSITE,PIKPAK,${PROXY_GROUPS.MANUAL}`, // (修改)
    
    // --- 6. 静态资源 ---
    `RULE-SET,StaticResources,静态资源`,
    `RULE-SET,CDNResources,静态资源`,
    `RULE-SET,AdditionalCDNResources,静态资源`,

    // --- 7. GFW 规则 ---
    `RULE-SET,GFWList,${PROXY_GROUPS.SELECT}`,

    // --- 8. 最终回退规则 ---
    `MATCH,${PROXY_GROUPS.FINAL}`
];


function buildRules({ quicEnabled }) {
    const ruleList = [...baseRules];
    if (!quicEnabled) {
        // 屏蔽 QUIC 流量，避免网络环境 UDP 速度不佳时影响体验
        ruleList.unshift("AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    }
    return ruleList;
}

const snifferConfig = {
    "sniff": {
        "TLS": {
            "ports": [443, 8443],
        },
        "HTTP": {
            "ports": [80, 8080, 8880],
        },
        "QUIC": {
            "ports": [443, 8443],
        }
    },
    "override-destination": false,
    "enable": true,
    "force-dns-mapping": true,
    "skip-domain": [
        "Mijia Cloud",
        "dlg.io.mi.com",
        "+.push.apple.com"
    ]
};

function buildDnsConfig({ mode, fakeIpFilter }) {
    const config = {
        "enable": true,
        "ipv6": ipv6Enabled,
        "prefer-h3": false,
        "enhanced-mode": mode,
        "default-nameserver": [
            "119.29.29.29",
            "223.5.5.5"
        ],
        "nameserver": [
            "system",
            "223.5.5.5",
            "119.29.29.29",
            "180.184.1.1"
        ],
        "fallback": [
            "https://dns.cloudflare.com/dns-query",
            "https://dns.sb/dns-query",
            "tcp://208.67.222.222",
            "tcp://8.26.56.2"
        ],
        "proxy-server-nameserver": [
            "https://dns.alidns.com/dns-query",
            "tls://dot.pub"
        ]
    };

    if (fakeIpFilter) {
        config["fake-ip-filter"] = fakeIpFilter;
    }

    return config;
}

const dnsConfig = buildDnsConfig({ mode: "redir-host" });
const dnsConfigFakeIp = buildDnsConfig({
    mode: "fake-ip",
    fakeIpFilter: [
        "geosite:private",
        "geosite:connectivity-check",
        "Mijia Cloud",
        "dlg.io.mi.com",
        "localhost.ptlogin2.qq.com",
        "*.icloud.com",
        "*.stun.*.*",
        "*.stun.*.*.*"
    ]
});

const geoxURL = {
    "geoip": "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
    "geosite": "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
    "mmdb": "https://cdn.jsdelivr.net/gh/Loyalsoldier/geoip@release/Country.mmdb",
    "asn": "https://cdn.jsdelivr.net/gh/Loyalsoldier/geoip@release/GeoLite2-ASN.mmdb"
};

// 地区元数据
const countriesMeta = {
    "香港": {
        pattern: "(?i)香港|港|(?:^|[^A-Za-z])HK(?:[^A-Za-z]|$)|Hong Kong|HongKong|hongkong|🇭🇰",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Hong_Kong.png"
    },
    "澳门": {
        pattern: "(?i)澳门|(?:^|[^A-Za-z])MO(?:[^A-Za-z]|$)|Macau|🇲🇴",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Macao.png"
    },
    "台湾": {
        pattern: "(?i)台|新北|彰化|(?:^|[^A-Za-z])TW(?:[^A-Za-z]|$)|Taiwan|🇹🇼",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Taiwan.png"
    },
    "新加坡": {
        pattern: "(?i)新加坡|坡|狮城|(?:^|[^A-Za-z])SG(?:[^A-Za-z]|$)|Singapore|🇸🇬",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Singapore.png"
    },
    "日本": {
        pattern: "(?i)日本|川日|东京|大阪|泉日|埼玉|沪日|深日|(?:^|[^A-Za-z])JP(?:[^A-Za-z]|$)|Japan|🇯🇵",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Japan.png"
    },
    "韩国": {
        pattern: "(?i)(?:^|[^A-Za-z])KR(?:[^A-Za-z]|$)|Korea|(?:^|[^A-Za-z])KOR(?:[^A-Za-z]|$)|首尔|韩|韓|🇰🇷",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Korea.png"
    },
    "美国": {
        pattern: "(?i)美国|美|(?:^|[^A-Za-z])US(?:[^A-Za-z]|$)|United States|🇺🇸",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/United_States.png"
    },
    "加拿大": {
        pattern: "(?i)加拿大|Canada|(?:^|[^A-Za-z])CA(?:[^A-Za-z]|$)|🇨🇦",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Canada.png"
    },
    "英国": {
        pattern: "(?i)英国|United Kingdom|(?:^|[^A-Za-z])UK(?:[^A-Za-z]|$)|伦敦|London|🇬🇧",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/United_Kingdom.png"
    },
    "澳大利亚": {
        pattern: "(?i)澳洲|澳大利亚|(?:^|[^A-Za-z])AU(?:[^A-Za-z]|$)|Australia|🇦🇺",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Australia.png"
    },
    "德国": {
        pattern: "(?i)德国|德|(?:^|[^A-Za-z])DE(?:[^A-Za-z]|$)|Germany|🇩🇪",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Germany.png"
    },
    "法国": {
        pattern: "(?i)法国|法|(?:^|[^A-Za-z])FR(?:[^A-Za-z]|$)|France|🇫🇷",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/France.png"
    },
    "俄罗斯": {
        pattern: "(?i)俄罗斯|俄|(?:^|[^A-Za-z])RU(?:[^A-Za-z]|$)|Russia|🇷🇺",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Russia.png"
    },
    "泰国": {
        pattern: "(?i)泰国|泰|(?:^|[^A-Za-z])TH(?:[^A-Za-z]|$)|Thailand|🇹🇭",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Thailand.png"
    },
    "印度": {
        pattern: "(?i)印度|(?:^|[^A-Za-z])IN(?:[^A-Za-z]|$)|India|🇮🇳",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/India.png"
    },
    "马来西亚": {
        pattern: "(?i)马来西亚|马来|(?:^|[^A-Za-z])MY(?:[^A-Za-z]|$)|Malaysia|🇲🇾",
        icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Malaysia.png"
    },
};

function buildCountryRegexMap() {
    const compiledRegex = {};
    for (const [country, meta] of Object.entries(countriesMeta)) {
        compiledRegex[country] = new RegExp(
            meta.pattern.replace(/^\(\?i\)/, ''),
            'i'
        );
    }
    return compiledRegex;
}

const COUNTRY_REGEX_ENTRIES = Object.entries(buildCountryRegexMap());
const PREFERRED_COUNTRY_INDEX = new Map(
    PREFERRED_COUNTRY_ORDER.map((country, index) => [country, index])
);

function scanProxies(config, { landing }) {
    const proxies = config.proxies || [];
    const landingRegex = new RegExp(LANDING_PATTERN, 'i');
    const lowCostRegex = new RegExp(LOW_COST_PATTERN, 'i');
    const countryCounts = Object.create(null);
    const proxyInfo = [];
    let lowCost = false;
    let hasLanding = false;

    for (const proxy of proxies) {
        const name = (proxy && typeof proxy.name === "string") ? proxy.name : "";
        const isLowCost = lowCostRegex.test(name);
        const isLanding = landingRegex.test(name);
        let matchedCountry = null;

        if (isLowCost) {
            lowCost = true;
        }
        if (isLanding) {
            hasLanding = true;
        }

        for (const [country, regex] of COUNTRY_REGEX_ENTRIES) {
            if (regex.test(name)) {
                matchedCountry = country;
                break;
            }
        }

        if (matchedCountry && !isLowCost && (!landing || !isLanding)) {
            countryCounts[matchedCountry] = (countryCounts[matchedCountry] || 0) + 1;
        }

        proxyInfo.push({ name, country: matchedCountry, isLowCost, isLanding });
    }

    const countryInfo = Object.entries(countryCounts).map(([country, count]) => ({ country, count }));
    return { countryInfo, proxyInfo, lowCost, hasLanding };
}


function buildCountryProxyGroups({ countries, landing, loadBalance }) {
    const groups = [];
    const baseExcludeFilter = LOW_COST_PATTERN;
    const landingExcludeFilter = `(?i)${LANDING_PATTERN}`;
    const groupType = loadBalance ? "load-balance" : "url-test";

    for (const country of countries) {
        const meta = countriesMeta[country];
        if (!meta) continue;

        const groupConfig = {
            "name": `${country}${NODE_SUFFIX}`,
            "icon": meta.icon,
            "include-all": true,
            "filter": meta.pattern,
            "exclude-filter": landing ? `${landingExcludeFilter}|${baseExcludeFilter}` : baseExcludeFilter,
            "type": groupType
        };

        Object.assign(groupConfig, {
            "url": HEALTH_CHECK_URL,
            "interval": HEALTH_CHECK_INTERVAL,
            "expected-status": HEALTH_CHECK_EXPECTED_STATUS,
            "lazy": true
        });

        if (loadBalance) {
            groupConfig["strategy"] = "consistent-hashing";
        } else {
            Object.assign(groupConfig, {
                "tolerance": 20
            });
        }

        groups.push(groupConfig);
    }

    return groups;
}

// 【修复】重构 buildProxyGroups
function buildProxyGroups({
    landing,
    countries,
    countryProxyGroups,
    lowCost,
    subgroupProxies, 
    defaultProxiesDirect,
    defaultSelector,
    defaultFallback,
    manualIncludeAll,
    sortedManualProxies // 【修改】接收排序后的节点列表
}) {
    // 查看是否有特定地区的节点
    const hasTW = countries.includes("台湾");
    const hasHK = countries.includes("香港");

    return [
        {
            "name": PROXY_GROUPS.SELECT,
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Auto.png",
            "type": "select",
            "proxies": defaultSelector // "选择代理" 组使用主列表
        },
        {
            "name": PROXY_GROUPS.MANUAL,
            "icon": "https://cdn.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/select.png", // 恢复图标
            "type": "select",
            ...(manualIncludeAll ? { "include-all": true } : {}),
            // 【修改】使用排序后的零散节点列表，并移除 "include-all"
            "proxies": sortedManualProxies
        },
        (landing) ? {
            "name": PROXY_GROUPS.LANDING,
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Airport.png",
            "type": "select",
            "include-all": true,
            "filter": `(?i)${LANDING_PATTERN}`,
        } : null,
        {
            "name": PROXY_GROUPS.FALLBACK,
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Round_Robin.png",
            "type": "fallback",
            "url": HEALTH_CHECK_URL,
            "proxies": defaultFallback,
            "interval": HEALTH_CHECK_INTERVAL,
            "expected-status": HEALTH_CHECK_EXPECTED_STATUS,
            "tolerance": 20,
            "lazy": true
        },
        {
            "name": "静态资源",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Static.png",
            "type": "select",
            "proxies": subgroupProxies, // 【修复】使用子分组列表
        },
        // 【修复】重建 AI 分组
        {
            "name": "OpenAI",
            "icon": "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@master/icons/chatgpt.png",
            "type": "select",
            "proxies": subgroupProxies
        },
        {
            "name": "Gemini",
            "icon": "https://cdn.simpleicons.org/googlegemini", 
            "type": "select",
            "proxies": subgroupProxies
        },
        {
            "name": "Claude",
            "icon": "https://cdn.simpleicons.org/claude", 
            "type": "select",
            "proxies": subgroupProxies
        },
        // 【修复】重建 GitHub 分组
        {
            "name": "GitHub",
            "icon": "https://cdn.simpleicons.org/github",
            "type": "select",
            "proxies": subgroupProxies
        },
        {
            "name": "Telegram",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Telegram.png",
            "type": "select",
            "proxies": subgroupProxies 
        },
        {
            "name": "YouTube",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/YouTube.png",
            "type": "select",
            "proxies": subgroupProxies 
        },
        {
            "name": "Bilibili",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/bilibili.png",
            "type": "select",
            "proxies": (hasTW && hasHK) ? [PROXY_GROUPS.DIRECT, "台湾节点", "香港节点"] : defaultProxiesDirect
        },
        {
            "name": "Netflix",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Netflix.png",
            "type": "select",
            "proxies": subgroupProxies 
        },
        // 【修改】添加 Xbox 分组 (替换原 Steam 分组)
        {
            "name": "Xbox",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Xbox.png", 
            "type": "select",
            "proxies": subgroupProxies
        },
        {
            "name": "SSH(22端口)",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Server.png",
            "type": "select",
            "proxies": subgroupProxies 
        },
        {
            "name": PROXY_GROUPS.DIRECT,
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Direct.png",
            "type": "select",
            "proxies": [
                "DIRECT", PROXY_GROUPS.SELECT
            ]
        },
        {
            "name": PROXY_GROUPS.FINAL,
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Final.png",
            "type": "select",
            "proxies": [
                PROXY_GROUPS.SELECT, "DIRECT"
            ]
        },
        {
            "name": "广告拦截",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png",
            "type": "select",
            "proxies": [
                "REJECT", "REJECT-DROP",  PROXY_GROUPS.DIRECT
            ]
        },
        // 【删除】所有被移除的分组
        (lowCost) ? {
            "name": PROXY_GROUPS.LOW_COST,
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Lab.png",
            "type": "url-test",
            "url": HEALTH_CHECK_URL,
            "interval": HEALTH_CHECK_INTERVAL,
            "expected-status": HEALTH_CHECK_EXPECTED_STATUS,
            "tolerance": 20,
            "lazy": true,
            "include-all": true,
            "filter": `(?i)${LOW_COST_PATTERN}`
        } : null,
        ...countryProxyGroups
    ].filter(Boolean); // 过滤掉 null 值
}

function main(config = {}) {
    const resultConfig = { ...config, proxies: config.proxies || [] };
    const { countryInfo, proxyInfo, lowCost, hasLanding } = scanProxies(resultConfig, { landing });
    const landingEnabled = landing && hasLanding;
    const hasProxyProviders = !!(resultConfig["proxy-providers"] && Object.keys(resultConfig["proxy-providers"]).length);
    const countryGroupNames = getCountryGroupNames(countryInfo, countryThreshold);
    const countries = stripNodeSuffix(countryGroupNames);

    const countrySet = new Set(countries);

    function getSortKey(proxyMeta) {
        if (!proxyMeta.country) return PREFERRED_COUNTRY_ORDER.length + 1;

        if (PREFERRED_COUNTRY_INDEX.has(proxyMeta.country)) {
            return PREFERRED_COUNTRY_INDEX.get(proxyMeta.country);
        }
        if (countrySet.has(proxyMeta.country)) return PREFERRED_COUNTRY_ORDER.length;

        return PREFERRED_COUNTRY_ORDER.length + 1;
    }

    const sortedManualProxies = [...proxyInfo].sort((a, b) => {
        const keyA = getSortKey(a);
        const keyB = getSortKey(b);
        if (keyA !== keyB) {
            return keyA - keyB;
        }
        return a.name.localeCompare(b.name);
    }).map(item => item.name).filter(Boolean);

    // 构建基础数组
    const {
        defaultSelector,
        defaultFallback,
        subgroupProxies, 
        defaultProxiesDirect
    } = buildBaseLists({ landing: landingEnabled, lowCost, countryGroupNames });

    // 为地区构建对应的 url-test / load-balance 组
    const countryProxyGroups = buildCountryProxyGroups({ countries, landing: landingEnabled, loadBalance });

    // 生成代理组
    const proxyGroups = buildProxyGroups({
        landing: landingEnabled,
        countries,
        countryProxyGroups,
        lowCost,
        subgroupProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback,
        manualIncludeAll: hasProxyProviders && sortedManualProxies.length === 0,
        sortedManualProxies // 【修改】传入排序后的节点列表
    });
    
    // 完整书写 Global 代理组以确保兼容性
    const globalProxies = proxyGroups.map(item => item.name);  
    proxyGroups.push(
        {
            "name": "GLOBAL",
            "icon": "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Global.png",
            "include-all": true,
            "type": "select",
            "proxies": globalProxies
        }
    );

    const finalRules = buildRules({ quicEnabled });

    if (fullConfig) Object.assign(resultConfig, {
        "mixed-port": 7890,
        "redir-port": 7892,
        "tproxy-port": 7893,
        "routing-mark": 7894,
        "allow-lan": true,
        "ipv6": ipv6Enabled,
        "mode": "rule",
        "unified-delay": true,
        "tcp-concurrent": true,
        "find-process-mode": "off",
        "log-level": "info",
        "geodata-loader": "standard",
        "external-controller": ":9999",
        "disable-keep-alive": !keepAliveEnabled,
        "profile": {
            "store-selected": true,
        }
    });

    Object.assign(resultConfig, {
        "proxy-groups": proxyGroups,
        "rule-providers": ruleProviders,
        "rules": finalRules,
        "sniffer": snifferConfig,
        "dns": fakeIPEnabled ? dnsConfigFakeIp : dnsConfig,
        "geodata-mode": true,
        "geox-url": geoxURL,
    });

    return resultConfig;
}

