#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
bundle="com.olavassbotn.Spending"
state="$HOME/Library/Application Support/banking-ios"
profiles="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
agent="$HOME/Library/LaunchAgents/$bundle.renew.plist"
app="$state/build/Build/Products/Release-iphoneos/Spending.app"
mkdir -p "$state"

say() { echo "$(date '+%F %T') $*"; }

profile_field() { security cms -D -i "$1" 2>/dev/null | plutil -extract "$2" raw -o - - 2>/dev/null; }

expire_soon_profiles() {
  local f exp
  for f in "$profiles"/*.mobileprovision; do
    [[ -e "$f" ]] || continue
    [[ "$(profile_field "$f" Entitlements.application-identifier)" == *".$bundle" ]] || continue
    exp="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$(profile_field "$f" ExpirationDate)" +%s)"
    if (( exp - $(date +%s) < 36 * 3600 )); then
      say "profile $(basename "$f") expires within 36 hours. Removing it so Xcode makes a new one"
      rm "$f"
    fi
  done
}

iphone() {
  [[ -n "${IOS_DEVICE:-}" ]] && { echo "$IOS_DEVICE"; return; }
  local json i type
  json="$(mktemp)"
  xcrun devicectl list devices --json-output "$json" >/dev/null 2>&1
  for ((i = 0; ; i++)); do
    type="$(plutil -extract "result.devices.$i.hardwareProperties.deviceType" raw -o - "$json" 2>/dev/null)" || break
    if [[ "$type" == iPhone && "$(plutil -extract "result.devices.$i.hardwareProperties.reality" raw -o - "$json")" == physical ]]; then
      plutil -extract "result.devices.$i.hardwareProperties.udid" raw -o - "$json"
      break
    fi
  done
  rm -f "$json"
}

install() {
  expire_soon_profiles
  sed -n 's/^ *custom_domain *= *"\(.*\)"/https:\/\/\1/p' "$repo/infra/terraform.tfvars" 2>/dev/null > "$repo/ios/Spending/server.txt" || true
  say "building $(git -C "$repo" rev-parse --short HEAD)"
  xcodebuild -quiet -project "$repo/ios/Spending.xcodeproj" -scheme Spending -configuration Release \
    -destination generic/platform=iOS -derivedDataPath "$state/build" -allowProvisioningUpdates build
  local key device
  key="$(profile_field "$app/embedded.mobileprovision" UUID) $(profile_field "$app/embedded.mobileprovision" ExpirationDate) $(git -C "$repo" rev-parse HEAD)"
  if [[ "${1:-}" != --force && "$key" == "$(cat "$state/installed" 2>/dev/null)" ]]; then
    say "the phone already has this build and profile"
    return
  fi
  device="$(iphone)"
  [[ -n "$device" ]] || { say "no paired iPhone. Pair it in Xcode > Devices and Simulators"; exit 1; }
  say "installing on $device. Profile expires $(profile_field "$app/embedded.mobileprovision" ExpirationDate)"
  xcrun devicectl device install app --device "$device" "$app"
  echo "$key" > "$state/installed"
  say "installed"
}

schedule() {
  mkdir -p "$(dirname "$agent")"
  cat > "$agent" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$bundle.renew</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$repo/infra/ios.sh</string><string>install</string></array>
  <key>StartInterval</key><integer>10800</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/banking-ios.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/banking-ios.log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)" "$agent" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$agent"
  say "scheduled $repo/infra/ios.sh install every 3 hours. Log: ~/Library/Logs/banking-ios.log"
}

case "${1:-}" in
  install) install "${2:-}" ;;
  schedule) schedule ;;
  unschedule) launchctl bootout "gui/$(id -u)" "$agent" 2>/dev/null || true; rm -f "$agent"; say "unscheduled" ;;
  *) echo "usage: pnpm ios install [--force] | schedule | unschedule" >&2; exit 2 ;;
esac
