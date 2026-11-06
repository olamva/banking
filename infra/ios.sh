#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
bundle="com.olavassbotn.Spending"
state="$HOME/Library/Application Support/banking-ios"
profiles="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
agent="$HOME/Library/LaunchAgents/$bundle.renew.plist"
src="$state/src"
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
    if (( exp - $(date +%s) < 5 * 86400 )); then
      say "profile $(basename "$f") expires within 5 days. Removing it so Xcode makes a new one"
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
    if [[ "$type" == iPhone && "$(plutil -extract "result.devices.$i.hardwareProperties.reality" raw -o - "$json")" == physical \
      && "$(plutil -extract "result.devices.$i.connectionProperties.tunnelState" raw -o - "$json")" != unavailable ]]; then
      plutil -extract "result.devices.$i.hardwareProperties.udid" raw -o - "$json"
      break
    fi
  done
  rm -f "$json"
}

server_txt() {
  [[ ! -f "$repo/infra/terraform.tfvars" ]] || sed -n 's/^ *custom_domain *= *"\(.*\)"/https:\/\/\1/p' "$repo/infra/terraform.tfvars" > "$1/ios/Spending/server.txt"
}

install() {
  expire_soon_profiles
  server_txt "$repo"
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
  [[ -n "$device" ]] || { say "no reachable iPhone. Connect it with USB, or use a wifi without client isolation. eduroam isolates clients. Pair it once in Xcode > Devices and Simulators"; exit 1; }
  say "installing on $device. Profile expires $(profile_field "$app/embedded.mobileprovision" ExpirationDate)"
  xcrun devicectl device install app --device "$device" "$app"
  echo "$key" > "$state/installed"
  say "installed"
}

renew() {
  git -C "$src" fetch -q origin main && git -C "$src" checkout -q --detach FETCH_HEAD && bash "$src/infra/ios.sh" install
}

schedule() {
  [[ -d "$src/.git" ]] || git clone -q "$(git -C "$repo" remote get-url origin)" "$src"
  git -C "$src" fetch -q origin main
  git -C "$src" checkout -q --detach FETCH_HEAD
  server_txt "$src"
  swiftc -O -o "$state/usb" "$src/infra/ios-usb.swift"
  mkdir -p "$(dirname "$agent")"
  cat > "$agent" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$bundle.renew</string>
  <key>ProgramArguments</key>
  <array><string>$state/usb</string><string>$src/infra/ios.sh</string><string>renew</string></array>
  <key>LaunchEvents</key>
  <dict>
    <key>com.apple.iokit.matching</key>
    <dict>
      <key>$bundle.usb</key>
      <dict>
        <key>IOProviderClass</key><string>IOUSBHostDevice</string>
        <key>idVendor</key><integer>1452</integer>
        <key>idProduct</key><integer>4776</integer>
        <key>IOMatchLaunchStream</key><true/>
      </dict>
    </dict>
  </dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/banking-ios.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/banking-ios.log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)" "$agent" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$agent"
  say "scheduled a build of origin/main in $src each time the iPhone connects over USB. Log: ~/Library/Logs/banking-ios.log"
}

case "${1:-}" in
  install) install "${2:-}" ;;
  renew) renew || { osascript -e 'display notification "See ~/Library/Logs/banking-ios.log" with title "Spending install failed"'; exit 1; } ;;
  schedule) schedule ;;
  unschedule) launchctl bootout "gui/$(id -u)" "$agent" 2>/dev/null || true; rm -f "$agent"; say "unscheduled" ;;
  *) echo "usage: pnpm ios install [--force] | schedule | unschedule" >&2; exit 2 ;;
esac
