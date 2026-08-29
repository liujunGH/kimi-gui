#!/usr/bin/env bash
# 自制 DMG(替代 tauri 自带的 bundle_dmg.sh):
# tauri 的 dmg bundler 把临时 rw.<pid>.dmg 落在 bundle/macos 源目录里,
# 残留/竞态导致「设备上无剩余空间」间歇失败(见 HANDOFF 版本锚点 0.1.1)。
# 本脚本:
#   1. 先清源目录里所有 rw.*.dmg 残留 + .DS_Store(防自我中毒)
#   2. 拷 .app 到 /tmp 干净 staging 目录再打包(源目录永不被污染)
#   3. 临时镜像放 /tmp,两步 create+convert,确定性产出
set -euo pipefail

SRC_DIR="src-tauri/target/release/bundle/macos"
OUT_DIR="src-tauri/target/release/bundle/dmg"
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).version")"
ARCH="$(uname -m)"
[ "$ARCH" = "arm64" ] && ARCH="aarch64"

[ -d "$SRC_DIR/Kimi Studio.app" ] || { echo "✗ .app 不存在,先跑 tauri build"; exit 1; }

# 1. 防毒:清掉 bundler 历史残留 + 顺手清理已挂载的残留卷
rm -f "$SRC_DIR"/rw.*.dmg "$SRC_DIR/.DS_Store" 2>/dev/null || true
for v in $(hdiutil info | grep -B1 "$PWD/$SRC_DIR" | grep '^/dev/disk' | awk '{print $1}'); do
  hdiutil detach "$v" -force >/dev/null 2>&1 || true
done

# 2. 先完整签名构建目录中的 App，再复制到干净 staging。
# Tauri 的 ad-hoc 结果只绑定主二进制；如果只在 staging 中重签，DMG
# 虽然有效，但 bundle/macos 下供本地体验的 App 会继续校验失败。
codesign --deep --force --sign - "$SRC_DIR/Kimi Studio.app"

# 2.1 干净 staging
STAGE="$(mktemp -d /tmp/kimi-dmg-stage.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$SRC_DIR/Kimi Studio.app" "$STAGE/"

# 2.2 Applications 拖放引导:DMG 根放 /Applications 替身,用户打开后把
# app 图标拖到它上面完成安装(没有它 DMG 里只有孤零零一个 app)。
ln -s /Applications "$STAGE/Applications"

# 2.5 再签 staging，避免复制工具或文件系统丢失 bundle seal。
codesign --deep --force --sign - "$STAGE/Kimi Studio.app"

# 3. 打包
mkdir -p "$OUT_DIR"
TMP="$(mktemp /tmp/kimi-dmg-rw.XXXXXX.dmg)"
trap 'rm -rf "$STAGE"; rm -f "$TMP"' EXIT
OUT="$OUT_DIR/Kimi Studio_${VERSION}_${ARCH}.dmg"
rm -f "$OUT"

hdiutil create -srcfolder "$STAGE" -volname "Kimi Studio" -fs "HFS+" -format UDRW -ov "$TMP" >/dev/null

# 3.5 Finder 图标视图布局(app 左、Applications 右)。UDRW 可写阶段设置,
# convert 后布局固化在卷的 .DS_Store 里。CI 无头环境可能没有 Finder——
# 布局失败只降级为默认列表视图,不影响 DMG 产出,不阻塞发版。
MOUNT_DIR="$(mktemp -d /tmp/kimi-dmg-mount.XXXXXX)"
if DEVICE="$(hdiutil attach -readwrite -noverify -noautofs_mount -mountpoint "$MOUNT_DIR" "$TMP" 2>/dev/null | grep '^/dev/' | awk '{print $1}' | head -1)"; then
  # 失败时把 osascript 的 stderr 尾部带出来(无头环境排查线索),仍只降级不阻塞
  if ! LAYOUT_ERR="$(osascript 2>&1 >/dev/null <<APPLESCRIPT
tell application "Finder"
  tell disk "Kimi Studio"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {400, 200, 960, 480}
    set icon size of the view options of container window to 128
    set arrangement of the view options of container window to not arranged
    set position of item "Kimi Studio" of container window to {160, 140}
    set position of item "Applications" of container window to {400, 140}
    update without registering applications
    close
  end tell
end tell
APPLESCRIPT
)"; then
    echo "  (Finder 布局不可用,使用默认视图)"
    echo "$LAYOUT_ERR" | tail -3
  fi
  sleep 2
  hdiutil detach "$DEVICE" -force >/dev/null 2>&1 || true
fi
rm -rf "$MOUNT_DIR"

hdiutil convert "$TMP" -format UDZO -imagekey zlib-level=9 -ov -o "$OUT" >/dev/null
rm -f "$TMP"
echo "✓ $OUT(含 /Applications 拖放引导)"
