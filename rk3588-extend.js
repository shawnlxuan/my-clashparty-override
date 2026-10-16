#!/usr/bin/env node
"use strict";

// Linux adapter for the shared routing script. Subscription secrets belong in
// /etc/mihomo/subscriptions.env, never in this repository.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const yaml = require("js-yaml");

function extendConfig(base, host, aiURL) {
  if (!aiURL || new URL(aiURL).protocol !== "https:") {
    throw new Error("AI_SUB_URL must be an HTTPS subscription URL");
  }
  const context = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "clash-verge-extension.js"), "utf8"),
    context,
    { timeout: 5000 }
  );
  context.AI_SUB_URL = aiURL;
  context.inputConfig = base;
  const config = vm.runInContext("main(inputConfig)", context, { timeout: 5000 });

  // Keep host-specific ports, controller access and LAN settings out of the
  // downloaded subscription. This file is populated from the existing host.
  const hostKeys = [
    "mixed-port", "port", "socks-port", "allow-lan", "bind-address",
    "external-controller", "secret", "authentication", "log-level", "ipv6"
  ];
  for (const key of hostKeys) {
    delete config[key];
    if (Object.prototype.hasOwnProperty.call(host, key)) config[key] = host[key];
  }
  config.tun = {
    enable: true,
    stack: "mixed",
    device: "Mihomo",
    "auto-route": true,
    // Existing Rockchip 5.10 deployment cannot use nft auto-redirect reliably.
    "auto-redirect": false,
    "auto-detect-interface": true,
    "strict-route": false,
    "dns-hijack": ["any:53", "tcp://any:53"],
    "route-exclude-address": [
      "127.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "169.254.0.0/16",
      "172.16.0.0/12", "192.168.0.0/16", "224.0.0.0/4",
      "255.255.255.255/32", "::1/128", "fc00::/7", "fe80::/10",
      // DNS and time synchronization must bootstrap without a working proxy.
      "223.5.5.5/32", "119.29.29.29/32", "203.107.6.88/32", "162.159.200.1/32"
    ]
  };
  config.dns["enhanced-mode"] = "fake-ip";
  config.dns["fake-ip-range"] = "198.18.0.1/16";
  config.dns.ipv6 = config.ipv6 === true;
  // A subscription policy can retain stale DNS servers or group references.
  delete config.dns["nameserver-policy"];
  delete config.dns["fake-ip-filter-mode"];
  config.dns["fake-ip-filter"] = [
    "geosite:cn", "geosite:private", "geosite:category-ntp",
    "+.lan", "+.local", "+.localhost", "+.pool.ntp.org",
    "ntp.aliyun.com", "+.gstatic.com", "cp.cloudflare.com", "captive.apple.com"
  ];
  config["proxy-providers"]["AI专用订阅"].path = "./proxy_provider/rk3588_ai.yaml";
  config.rules.unshift("DST-PORT,123,DIRECT");
  return config;
}

function convertFile(basePath, outputPath, hostPath) {
  if (path.resolve(basePath) === path.resolve(outputPath)) {
    throw new Error("Input and output must be different files");
  }
  const config = extendConfig(
    yaml.load(fs.readFileSync(basePath, "utf8")),
    yaml.load(fs.readFileSync(hostPath, "utf8")) || {},
    process.env.AI_SUB_URL
  );
  const temporary = `${outputPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, yaml.dump(config, { noRefs: true, lineWidth: -1 }), { mode: 0o600 });
    fs.renameSync(temporary, outputPath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(`Generated config: ${config.proxies?.length || 0} general nodes`);
}

if (require.main === module) {
  try {
    convertFile(
      process.argv[2] || "/etc/mihomo/base.yaml",
      process.argv[3] || "/run/mihomo-config.yaml",
      process.argv[4] || "/etc/mihomo/host.yaml"
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { extendConfig, convertFile };
