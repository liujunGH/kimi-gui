#!/usr/bin/env bash
# sync.sh —— 同步上游官方 kimi-web 更新到我们的 web/
#
# 用法:
#   ./sync.sh fetch     拉取上游最新 + 推进 .upstream/kimi-code-src 的 HEAD
#   ./sync.sh diff      显示上游自上次 baseline 以来改了哪些 apps/kimi-web 文件
#   ./sync.sh merge     把上游改动应用到 web/(需手动解决冲突)
#   ./sync.sh baseline  更新 baseline 到当前 HEAD(merge 完后调)
#
# 重要:这是 fork 维护命脉。改 PATCHES.md 里记的文件时冲突必现,按 PATCHES
# 清单解决。详见 HANDOFF.md 第 6 节 + ARCHITECTURE.md 附录 A。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM="$ROOT/.upstream/kimi-code-src"
BASELINE_FILE="$ROOT/.upstream/UPSTREAM_BASELINE.txt"
OUR_WEB="$ROOT/web"

if [[ ! -d "$UPSTREAM/.git" ]]; then
  echo "❌ 上游源码不在 $UPSTREAM(或不是 git 仓库)"
  echo "   先按 ARCHITECTURE.md 第 6 节重新 fork"
  exit 1
fi

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "❌ 没有 baseline 文件 $BASELINE_FILE"
  exit 1
fi

baseline_commit=$(head -1 "$BASELINE_FILE")

cmd="${1:-}"
case "$cmd" in
  fetch)
    echo "=== 拉取上游最新 + 推进 HEAD ==="
    cd "$UPSTREAM"
    # 1. 拉远端 refs
    git fetch --all --tags 2>&1 | tail -5
    # 2. 推进本地 HEAD 到远端默认分支头(原 main 分支名按上游实际调整)
    #    上游默认分支从 origin/HEAD 解析;失败回退到 origin/main
    remote_head=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || true)
    remote_head="${remote_head:-main}"
    echo "远端默认分支: origin/$remote_head"
    # 用 reset 而不是 merge:.upstream 是只读镜像,我们不需要 merge commit
    git reset --hard "origin/$remote_head" 2>&1 | tail -3
    echo ""
    new_head=$(git rev-parse HEAD)
    if [[ "$new_head" == "$baseline_commit" ]]; then
      echo "✅ 已是最新(baseline == HEAD == $new_head)"
    else
      echo "⚠️  上游有更新。用 './sync.sh diff' 看改动,'./sync.sh merge' 应用到 web/"
    fi
    ;;

  diff)
    echo "=== baseline: $baseline_commit ==="
    echo "=== 上游 apps/kimi-web 改动(相对 baseline)==="
    cd "$UPSTREAM"
    if [[ "$(git rev-parse HEAD)" == "$baseline_commit" ]]; then
      echo "(空)HEAD == baseline。先 './sync.sh fetch' 拉取上游更新。"
      exit 0
    fi
    git diff --stat "$baseline_commit..HEAD" -- apps/kimi-web | tail -30
    echo ""
    echo "完整 diff: cd $UPSTREAM && git diff $baseline_commit..HEAD -- apps/kimi-web"
    ;;

  merge)
    cd "$UPSTREAM"
    if [[ "$(git rev-parse HEAD)" == "$baseline_commit" ]]; then
      echo "❌ HEAD == baseline,没有要 merge 的改动。先 './sync.sh fetch'"
      exit 1
    fi
    echo "=== 生成 patch(baseline → HEAD)==="
    patch_file="$ROOT/.upstream/tmp/sync-$(date +%Y%m%d-%H%M%S).patch"
    mkdir -p "$(dirname "$patch_file")"
    git diff "$baseline_commit..HEAD" -- apps/kimi-web > "$patch_file"
    echo "patch 写到: $patch_file"

    # patch 为空(上游改了 apps/kimi-code 等其他目录但没动 apps/kimi-web)→ 直接退出
    if [[ ! -s "$patch_file" ]]; then
      echo "✅ patch 为空 —— 上游此区间未改 apps/kimi-web,无需 merge"
      echo "   但 HEAD 已推进到 $(git rev-parse --short HEAD)"
      echo "   跑 './sync.sh baseline' 把 baseline 也推进(避免下次重复检查)"
      exit 0
    fi
    echo ""
    # patch 内路径形如 a/apps/kimi-web/src/foo.ts / b/apps/kimi-web/src/foo.ts
    # 要映射到 web/src/foo.ts。
    # -p3 剥掉 "a/" + "apps/" + "kimi-web/",剩 "src/foo.ts"
    # --directory=web 把它写到 web/src/foo.ts
    echo "=== 应用 patch 到 web/ ==="
    echo "⚠️  冲突会出现在 PATCHES.md 里记的文件。手动解决。"
    echo ""
    cd "$ROOT"
    if git apply --check -p3 --directory=web --reverse --whitespace=nowarn < "$patch_file" 2>/dev/null; then
      # reverse check 通过 = 全部能干净应用
      git apply -p3 --directory=web --whitespace=nowarn < "$patch_file"
      echo "✅ 干净应用"
    else
      echo "⚠️  有冲突,用 --3way 手动解决:"
      if git apply --3way -p3 --directory=web --whitespace=nowarn < "$patch_file"; then
        echo "✅ 3way 应用完成"
      else
        echo "❌ 应用失败。手动:"
        echo "  cd $UPSTREAM && git diff $baseline_commit..HEAD -- apps/kimi-web/<文件>"
        echo "  然后对照 web/<对应文件> 手动 merge"
        exit 1
      fi
    fi
    echo ""
    echo "✅ 应用完成。检查 PATCHES.md 里记的文件,然后 './sync.sh baseline'"
    ;;

  baseline)
    cd "$UPSTREAM"
    new_commit=$(git rev-parse HEAD)
    new_subject=$(git log -1 --format="%h %ci %s")
    {
      echo "$new_commit"
      echo "$new_subject"
    } > "$BASELINE_FILE"
    echo "✅ baseline 更新到: $new_subject"
    ;;

  *)
    cat <<EOF
用法: $0 <command>

  fetch     拉取上游最新 + 推进 .upstream HEAD(用 reset --hard)
  diff      显示上游 apps/kimi-web 相对 baseline 的改动
  merge     应用上游改动到 web/(-p3 --directory=web 路径映射)
  baseline  merge 成功后,把 baseline 更新到当前 HEAD

详见 ARCHITECTURE.md 第 6 节 / HANDOFF.md 第 6 节 / PATCHES.md。
EOF
    exit 1
    ;;
esac
