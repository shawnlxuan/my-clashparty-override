#!/bin/sh
# Invoked by the root-owned systemd service with subscriptions.env loaded.
set -eu
umask 077
: "${GENERAL_SUB_URL:?GENERAL_SUB_URL is required}"
: "${AI_SUB_URL:?AI_SUB_URL is required}"
exec 9>/run/mihomo-config-update.lock
flock -n 9 || exit 0
stage=$(mktemp -d /etc/mihomo/.update-XXXXXX)
trap 'rm -rf -- "$stage"' EXIT

curl --fail --silent --show-error --location --noproxy '*' \
  --connect-timeout 15 --max-time 90 --retry 2 \
  --user-agent 'clash-verge/v2.5.1' "$GENERAL_SUB_URL" -o "$stage/base.yaml"
curl --fail --silent --show-error --location --noproxy '*' \
  --connect-timeout 15 --max-time 90 --retry 2 \
  --user-agent 'clash-verge/v2.5.1' "$AI_SUB_URL" -o "$stage/ai.yaml"
node /etc/mihomo/extend.js "$stage/base.yaml" "$stage/config.yaml"
# Validate both freshly downloaded node lists before changing live files.
node - "$stage/ai.yaml" "$stage/config.yaml" <<'NODE'
const fs = require('fs'), yaml = require('js-yaml');
const ai = yaml.load(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(ai?.proxies) || !ai.proxies.length) throw new Error('Empty AI subscription');
const c = yaml.load(fs.readFileSync(process.argv[3], 'utf8'));
c['proxy-providers']['AI专用订阅'] = {type: 'inline', payload: ai.proxies};
fs.writeFileSync(process.argv[3] + '.check', yaml.dump(c, {noRefs: true}), {mode: 0o600});
console.log(`AI subscription: ${ai.proxies.length} nodes`);
NODE
/usr/local/bin/mihomo -t -d /etc/mihomo -f "$stage/config.yaml.check"
/usr/local/bin/mihomo -t -d /etc/mihomo -f "$stage/config.yaml"

cp -p /etc/mihomo/config.yaml "$stage/previous-config.yaml"
cp -p /etc/mihomo/base.yaml "$stage/previous-base.yaml"
cp -p /etc/mihomo/proxy_provider/rk3588_ai.yaml "$stage/previous-ai.yaml"
install -m 0600 "$stage/base.yaml" /etc/mihomo/base.yaml
install -m 0600 "$stage/ai.yaml" /etc/mihomo/proxy_provider/rk3588_ai.yaml
install -m 0600 "$stage/config.yaml" /etc/mihomo/config.yaml
verify_started() {
  systemctl restart mihomo.service || return 1
  # Type=simple can report success before TUN initialization has completed.
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    systemctl is-active --quiet mihomo.service || return 1
    if ip link show Mihomo >/dev/null 2>&1; then
      sleep 2
      systemctl is-active --quiet mihomo.service && ip link show Mihomo >/dev/null 2>&1
      return $?
    fi
  done
  return 1
}
if ! verify_started; then
  install -m 0600 "$stage/previous-base.yaml" /etc/mihomo/base.yaml
  install -m 0600 "$stage/previous-ai.yaml" /etc/mihomo/proxy_provider/rk3588_ai.yaml
  install -m 0600 "$stage/previous-config.yaml" /etc/mihomo/config.yaml
  systemctl restart mihomo.service
  exit 1
fi
