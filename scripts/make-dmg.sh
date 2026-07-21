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

[ -d "$SRC_DIR/Kimi Code.app" ] || { echo "✗ .app 不存在,先跑 tauri build"; exit 1; }

# 1. 防毒:清掉 bundler 历史残留 + 顺手清理已挂载的残留卷
rm -f "$SRC_DIR"/rw.*.dmg "$SRC_DIR/.DS_Store" 2>/dev/null || true
for v in $(hdiutil info | grep -B1 "$PWD/$SRC_DIR" | grep '^/dev/disk' | awk '{print $1}'); do
  hdiutil detach "$v" -force >/dev/null 2>&1 || true
done

# 2. 干净 staging
STAGE="$(mktemp -d /tmp/kimi-dmg-stage.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$SRC_DIR/Kimi Code.app" "$STAGE/"

# 3. 打包
mkdir -p "$OUT_DIR"
TMP="$(mktemp /tmp/kimi-dmg-rw.XXXXXX.dmg)"
trap 'rm -rf "$STAGE"; rm -f "$TMP"' EXIT
OUT="$OUT_DIR/Kimi Code_${VERSION}_${ARCH}.dmg"
rm -f "$OUT"

hdiutil create -srcfolder "$STAGE" -volname "Kimi Code" -fs "HFS+" -format UDRW -ov "$TMP" >/dev/null
hdiutil convert "$TMP" -format UDZO -imagekey zlib-level=9 -ov -o "$OUT" >/dev/null
rm -f "$TMP"
echo "✓ $OUT"
