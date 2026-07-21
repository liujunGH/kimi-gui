/* ============================================================
   kimi-gui 原型 v2 · 共享交互脚本(原型专用,真实产品无此文件)
   - 注入原型导航条 + 主题切换(localStorage: proto-theme)
   - 交互模拟:侧栏折叠 / 思考开关 / Composer 双模 / 队列面板 /
     审批单键 y/a/n/p / Review pane ⌘B / Inspect 右栏 ⌘I /
     工作区菜单 / 设置导航 / 折叠 hunk 展开
   数据全部写死在 HTML,JS 只切 class。
   ============================================================ */
(function () {
  "use strict";

  var PAGES = [
    { id: "index", name: "空闲态" },
    { id: "running", name: "运行态" },
    { id: "steer-feedback", name: "插话反馈" },
    { id: "approval", name: "审批" },
    { id: "multi-agent", name: "多 Agent" },
    { id: "diff", name: "Diff" },
    { id: "settings", name: "设置" }
  ];

  var ICON_SUN = '<svg class="ic ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICON_MOON = '<svg class="ic ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- 主题 ---------- */
  function currentTheme() { return document.documentElement.getAttribute("data-theme") || "light"; }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("proto-theme", t);
    var btn = $(".pb-theme");
    if (btn) btn.innerHTML = t === "dark" ? ICON_SUN : ICON_MOON;
  }

  /* ---------- 原型导航条(默认收起为 chip,点击展开) ---------- */
  function injectPrototypeChrome(page) {
    var bar = document.createElement("div");
    bar.className = "prototype-bar mini";
    var links = "";
    PAGES.forEach(function (p) {
      links += '<a href="' + p.id + '.html"' + (p.id === page ? ' class="active"' : "") + ">" + p.name + "</a>";
    });
    bar.innerHTML =
      '<button class="pb-chip" title="原型导航">原型 v2 <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg></button>' +
      '<div class="pb-inner">' + links +
      '<span class="pb-divider"></span>' +
      '<button class="pb-theme" title="切换主题">' + (currentTheme() === "dark" ? ICON_SUN : ICON_MOON) + "</button>" +
      "</div>";
    document.body.appendChild(bar);
    $(".pb-chip", bar).addEventListener("click", function () { bar.classList.toggle("mini"); });
    $(".pb-theme", bar).addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  }

  /* ---------- 侧栏折叠(单一展开入口,修复旧版双按钮重叠) ---------- */
  function bindSidebarCollapse() {
    $all('[data-action="toggle-sidebar"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        $(".app").classList.toggle("sidebar-collapsed");
      });
    });
  }

  /* ---------- 思考链:行内折叠 + 全局开关(关 → 全部折叠,含流式) ---------- */
  function bindThinkingToggle() {
    $all(".think-summary").forEach(function (sum) {
      sum.addEventListener("click", function () {
        var t = sum.closest(".think");
        if (t) t.classList.toggle("open");
      });
    });
    var tg = $(".toolbar-thinking-toggle");
    if (tg) tg.addEventListener("click", function () {
      var on = tg.classList.toggle("on");
      $all(".think").forEach(function (t) { t.classList.toggle("open", on); });
    });
  }

  /* ---------- Composer 双模(排队 / 插话) ---------- */
  function bindComposerModes() {
    var modes = $(".composer-modes");
    if (!modes) return;
    var composer = modes.closest(".composer");
    var ta = composer ? $("textarea", composer) : null;
    $all(".mode-btn", modes).forEach(function (btn) {
      btn.addEventListener("click", function () {
        $all(".mode-btn", modes).forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var steer = btn.classList.contains("mode-steer");
        if (composer) composer.classList.toggle("mode-steer-on", steer);
        if (ta && btn.getAttribute("data-placeholder")) ta.setAttribute("placeholder", btn.getAttribute("data-placeholder"));
      });
    });
  }

  /* ---------- 队列指示器 ↔ 面板(同页共存,修复旧版死绑定) ---------- */
  function bindQueueToggle() {
    var ind = $(".queue-indicator");
    var panel = $(".queue-panel");
    if (!ind || !panel) return;
    ind.addEventListener("click", function () {
      panel.classList.toggle("open");
      ind.classList.toggle("open");
    });
  }

  /* ---------- 模型 / 思考深度弹层(对齐官方:模型列表 + Low/High/Max) ---------- */
  /* mock:真实从 daemon 拉取(不同账号的列表不同) */
  var MODELS = [
    { id: "k27-coding", name: "K2.7 Coding" },
    { id: "k27-highspeed", name: "K2.7 Coding Highspeed" },
    { id: "k3", name: "K3" }
  ];
  /* mock:Low/High/Max 档位是推测,daemon 是否支持 effort 待 M0 验证(spec 6.7.4) */
  var EFFORTS = ["Low", "High", "Max"];
  var modelState = { model: "k3", effort: "High" };
  var SVG_CHEVRON = '<svg class="ic ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  var SVG_CHECK_SM = '<svg class="mp-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var SVG_FLAG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/></svg>';

  function loadModelState() {
    try {
      var s = JSON.parse(localStorage.getItem("proto-model") || "null");
      if (s && MODELS.some(function (m) { return m.id === s.model; }) && EFFORTS.indexOf(s.effort) >= 0) modelState = s;
    } catch (e) { /* ignore */ }
  }
  function saveModelState() {
    try { localStorage.setItem("proto-model", JSON.stringify(modelState)); } catch (e) { /* ignore */ }
  }
  function modelName(id) {
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i].name;
    return MODELS[0].name;
  }
  function renderModelPill(pill) {
    pill.innerHTML = modelName(modelState.model) + '<span class="model-thinking">&nbsp;&middot; ' + modelState.effort + "</span>" + SVG_CHEVRON;
  }
  function closeModelPop() {
    var pop = $(".model-pop.open");
    if (pop) pop.classList.remove("open");
    var p = $(".model-pill.open");
    if (p) p.classList.remove("open");
  }
  function bindModelPicker() {
    var pill = $(".model-pill");
    var composer = $(".composer");
    if (!pill || !composer) return;
    loadModelState();

    var pop = document.createElement("div");
    pop.className = "model-pop";
    var html = '<div class="mp-label">MANAGED:KIMI-CODE</div>';
    MODELS.forEach(function (m) {
      html += '<button class="mp-item' + (m.id === modelState.model ? " active" : "") + '" data-model="' + m.id + '">' +
        SVG_CHECK_SM + '<span class="mp-name">' + m.name + "</span></button>";
    });
    html += '<div class="mp-sep"></div>';
    html += '<div class="mp-row"><span class="mp-row-label">思考</span><span class="mp-seg">';
    EFFORTS.forEach(function (lv) {
      html += '<button data-effort="' + lv + '"' + (lv === modelState.effort ? ' class="active"' : "") + ">" + lv + "</button>";
    });
    html += "</span></div>";
    html += '<div class="mp-sep"></div><button class="mp-more">更多模型&hellip;</button>';
    pop.innerHTML = html;
    composer.appendChild(pop);

    renderModelPill(pill);

    pill.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = !pop.classList.contains("open");
      closeModelPop();
      closeCtxPop();
      if (willOpen) { pop.classList.add("open"); pill.classList.add("open"); }
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    $all(".mp-item[data-model]", pop).forEach(function (item) {
      item.addEventListener("click", function () {
        modelState.model = item.getAttribute("data-model");
        saveModelState();
        $all(".mp-item[data-model]", pop).forEach(function (i) { i.classList.toggle("active", i === item); });
        renderModelPill(pill);
        closeModelPop();
      });
    });
    $all(".mp-seg button", pop).forEach(function (btn) {
      btn.addEventListener("click", function () {
        modelState.effort = btn.getAttribute("data-effort");
        saveModelState();
        $all(".mp-seg button", pop).forEach(function (b) { b.classList.toggle("active", b === btn); });
        renderModelPill(pill);
        /* 切深度不收起,可继续对比 */
      });
    });
    $(".mp-more", pop).addEventListener("click", closeModelPop);
    document.addEventListener("click", closeModelPop);
  }

  /* ---------- 上下文 / 额度指示(对齐 Codex:环形用量 + 点击详情卡) ---------- */
  var CTX_MOCK = { pct: 42, used: "108.5k", total: "258k", q5h: 33, q5hReset: "3h 38m", qWeek: 7, qWeekReset: "6d 22h" };
  function closeCtxPop() {
    var pop = $(".ctx-pop.open");
    if (pop) pop.classList.remove("open");
  }
  function bindContextMeter() {
    var composer = $(".composer");
    var right = composer ? $(".composer .toolbar-group.right") : null;
    var modelPill = right ? $(".model-pill", right) : null;
    if (!composer || !right || !modelPill) return;

    var ring = document.createElement("button");
    ring.className = "ctx-ring" + (CTX_MOCK.pct >= 85 ? " pct-danger" : CTX_MOCK.pct >= 60 ? " pct-warn" : "");
    ring.title = "上下文与额度";
    var c = 2 * Math.PI * 7;
    ring.innerHTML =
      '<svg viewBox="0 0 18 18" fill="none">' +
      '<circle class="ring-bg" cx="9" cy="9" r="7" stroke-width="2"/>' +
      '<circle class="ring-fg" cx="9" cy="9" r="7" stroke-width="2" stroke-linecap="round" stroke-dasharray="' +
      c.toFixed(1) + " " + (c * (1 - CTX_MOCK.pct / 100)).toFixed(1) + '"/>' +
      "</svg>";
    right.insertBefore(ring, modelPill);

    var pop = document.createElement("div");
    pop.className = "ctx-pop";
    composer.appendChild(pop);

    function render() {
      var titleEl = $(".toolbar-title");
      var permEl = $(".composer .perm-pill");
      pop.innerHTML =
        '<div class="ck-row"><span class="k">会话</span><span class="v v-ellipsis">' + (titleEl ? titleEl.textContent.trim() : "当前会话") + "</span></div>" +
        '<div class="ck-row"><span class="k">模型</span><span class="v">kimi-code/' + modelState.model + "</span></div>" +
        '<div class="ck-row"><span class="k">思考</span><span class="v">' + modelState.effort + "</span></div>" +
        '<div class="ck-row"><span class="k">权限</span><span class="v">' + (permEl ? permEl.textContent.trim().split(/\s+/)[0] : "逐条确认") + "</span></div>" +
        '<div class="ck-row"><span class="k">上下文</span><span class="v">' + CTX_MOCK.used + " / " + CTX_MOCK.total + " · " + CTX_MOCK.pct + "%</span></div>" +
        '<div class="ck-bar"><div class="ck-fill" style="width:' + CTX_MOCK.pct + '%"></div></div>' +
        '<div class="ck-row"><span class="k">状态</span><span class="v">' + ($(".composer.is-running") ? "运行中" : "空闲") + "</span></div>" +
        '<div class="ck-sep"></div>' +
        '<div class="ck-row"><span class="k">5 小时额度</span><span class="v">' + CTX_MOCK.q5h + "%(" + CTX_MOCK.q5hReset + " 后重置)</span></div>" +
        '<div class="ck-row"><span class="k">每周额度</span><span class="v">' + CTX_MOCK.qWeek + "%(" + CTX_MOCK.qWeekReset + " 后重置)</span></div>";
    }
    render();

    ring.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = !pop.classList.contains("open");
      closeModelPop();
      closeCtxPop();
      if (willOpen) { render(); pop.classList.add("open"); }
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", closeCtxPop);
  }

  /* ---------- 队列行操作(对齐 Codex:引导=立即插话 / 编辑 / 删除) ---------- */
  function syncQueueCount(dock) {
    var rows = $all(".qp-row", dock).length;
    var qc = $(".qi-count", dock);
    if (qc) qc.textContent = rows + " 条";
    var hint = $(".qp-hint", dock);
    if (hint) hint.textContent = rows > 0 ? rows + " 条 · 拖拽重排" : "队列已空";
    if (rows === 0) {
      var panel = $(".queue-panel", dock);
      if (panel) panel.classList.remove("open");
      var ind = $(".queue-indicator", dock);
      if (ind) { ind.classList.remove("open"); ind.style.display = "none"; }
    }
  }
  function showSteerFeedback(dock) {
    var fb = $(".steer-feedback", dock);
    if (!fb) {
      fb = document.createElement("div");
      fb.className = "steer-feedback";
      fb.innerHTML = SVG_FLAG + "<span>已插话到当前轮 · 1 段引导</span>";
      var composer = $(".composer", dock);
      dock.insertBefore(fb, composer);
      fb._created = true;
    }
    if (fb._created) {
      clearTimeout(fb._timer);
      fb._timer = setTimeout(function () { if (fb.parentNode) fb.parentNode.removeChild(fb); }, 4000);
    }
  }
  function markSteerInThinking(text) {
    var body = $(".think.thinking .think-body");
    if (!body) return;
    var existing = $(".think-user-steer", body);
    if (existing) { $(".steer-text", existing).textContent = text; return; }
    var mark = document.createElement("div");
    mark.className = "think-user-steer";
    mark.innerHTML = '<span class="steer-icon">' + SVG_FLAG + '</span><span class="steer-label">用户引导</span><span class="steer-text"></span>';
    $(".steer-text", mark).textContent = text;
    body.insertBefore(mark, body.firstChild);
    var think = body.closest(".think");
    if (think && !think.classList.contains("open")) think.classList.add("open");
  }
  function bindQueueActions() {
    var dock = $(".dock-inner");
    if (!dock) return;
    dock.addEventListener("click", function (e) {
      var t = e.target;
      var btn = t.closest ? t.closest("[data-action]") : null;
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      if (action !== "qp-steer" && action !== "qp-edit" && action !== "qp-del") return;
      var row = btn.closest(".qp-row");
      if (!row) return;
      var textEl = $(".qp-text", row);
      var text = textEl ? textEl.textContent : "";
      row.parentNode.removeChild(row);
      syncQueueCount(dock);
      if (action === "qp-steer") {
        showSteerFeedback(dock);
        markSteerInThinking(text);
      } else if (action === "qp-edit") {
        var ta = $(".composer textarea", dock);
        if (ta) { ta.value = text; ta.focus(); }
      }
    });
  }

  /* ---------- 任务菜单 + 侧边任务(对齐 Codex,⌥⌘S 开合) ---------- */
  var SVG_MORE = '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';
  var SVG_PIN = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 11V4h6v7l3 5H6l3-5z"/></svg>';
  var SVG_PENCIL = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
  var SVG_ARCHIVE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>';
  var SVG_SIDE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>';
  var SVG_COPY = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  var SVG_PLAY = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg>';
  var SVG_CLOCK = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>';
  var SVG_EXTERNAL = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
  var SVG_X_SM = '<svg class="ic ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var SVG_TERMINAL = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>';
  var SVG_CHECK_LG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var SVG_SHIELD = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-3.6 8-10V5.5L12 2 4 5.5V12c0 6.4 8 10 8 10z"/></svg>';
  var SVG_ARROW_UP = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

  function mi(svg, label, kbd, action, hasSub) {
    return '<button class="menu-item"' + (action ? ' data-action="' + action + '"' : "") + ">" +
      '<span class="mi-ic">' + svg + '</span><span class="mi-label">' + label + "</span>" +
      (kbd ? '<span class="mi-kbd"><span class="kbd">' + kbd + "</kbd></span>" : "") +
      (hasSub ? '<span class="mi-kbd">' + SVG_CHEVRON.replace("M6 9l6 6 6-6", "M9 6l6 6-6 6") + "</span>" : "") +
      "</button>";
  }

  function toggleSideTask(force) {
    var st = $(".side-task");
    if (!st) return;
    var willOpen = typeof force === "boolean" ? force : !st.classList.contains("open");
    st.classList.toggle("open", willOpen);
    $(".app-main").classList.toggle("side-open", willOpen);
    /* 原型导航 chip 上移,避开侧边面板底部的 Composer */
    var chip = $(".prototype-bar");
    if (chip) chip.style.bottom = willOpen ? "116px" : "";
  }

  /* ---------- 侧边任务内容填充(默认线程 / 子智能体 transcript) ---------- */
  function transcriptBody(task, blocks) {
    var h = '<div class="msg-user"><div class="u-bubble">' + task + "</div></div>";
    blocks.forEach(function (b) {
      h += '<div class="msg-assistant">';
      if (b.text) h += '<div class="a-content"><p>' + b.text + "</p></div>";
      if (b.ask) h += '<div class="st-ask">' + b.ask + "</div>";
      if (b.tool) {
        h += '<div class="tool-call"><div class="tool-head"><span class="tool-icon">' + SVG_TERMINAL +
          '</span><span class="tool-name">' + b.tool + '</span><span class="tool-detail">' + (b.toolDetail || "") + '</span>' +
          '<span class="tool-status">' + (b.done ? SVG_CHECK_LG : '<span class="dot dot-running"></span>') + "</span></div></div>";
      }
      h += "</div>";
    });
    return h;
  }

  var DEFAULT_SIDE = {
    title: "侧边任务", status: "运行中", statusCls: "pill-accent", dot: "dot-running",
    thread: "DiffView 重做", ws: "kimi-gui",
    body: transcriptBody("把 DiffView 重做一下:语法高亮对齐 GitHub,大 hunk 自动折叠。", [
      { text: "shiki 已接入,hunk 折叠完成,正在跑最后一轮回归:", tool: "run_command", toolDetail: "pnpm test --diff · 41/41 通过", done: true },
      { text: "回归通过,正在收尾:把折叠阈值写进设置项…", tool: "edit_file", toolDetail: "diffHighlight.ts · 写入中…" }
    ])
  };

  var AGENT_TRANSCRIPTS = {
    "refactor-thinking": {
      title: "refactor-thinking", status: "运行中", statusCls: "pill-accent", dot: "dot-running",
      thread: "refactor-thinking", ws: "子智能体 · /swarm 重构 4 个组件",
      body: transcriptBody("重写 ThinkingBlock:思考块折叠/展开/流式限高,保持现有 API 不变。", [
        { text: "折叠动画与单行 teaser 已完成(7/12),正在处理流式 240px 限高与全局开关的联动…", tool: "edit_file", toolDetail: "ThinkingBlock.vue · 写入中…" }
      ])
    },
    "refactor-composer": {
      title: "refactor-composer", status: "运行中", statusCls: "pill-accent", dot: "dot-running",
      thread: "refactor-composer", ws: "子智能体 · /swarm 重构 4 个组件",
      body: transcriptBody("Composer 双模改造:排队/插话分段控件 + 队列面板。", [
        { text: "分段控件与 placeholder 联动完成(5/15),正在接队列面板的展开/收起…", tool: "edit_file", toolDetail: "Composer.vue · 写入中…" }
      ])
    },
    "refactor-approval": {
      title: "refactor-approval", status: "待输入", statusCls: "pill-warning", dot: "dot-waiting",
      thread: "refactor-approval", ws: "子智能体 · /swarm 重构 4 个组件",
      body: transcriptBody("重写 ApprovalCard:内联不阻塞 Composer + 单键 y/a/n/p。", [
        { text: "四种 kind 的 body 结构已定(shell / diff / file / plan),键位映射完成 2/9。" },
        { ask: "审批按钮顺序用 [批准][本会话][拒绝][反馈] 还是 [批准][拒绝][本会话][反馈]?回答后我继续。" }
      ])
    },
    "refactor-diff": {
      title: "refactor-diff", status: "已完成", statusCls: "pill-success", dot: "dot-done",
      thread: "refactor-diff", ws: "子智能体 · /swarm 重构 4 个组件",
      body: transcriptBody("DiffView 重做:语法高亮对齐 GitHub,大 hunk 自动折叠。", [
        { text: "完成,15/15 项。shiki 接入 + tk-* token 映射 + 折叠条点击展开。", tool: "edit_file", toolDetail: "DiffView.vue · +48 −12", done: true }
      ])
    },
    "review-composer": {
      title: "review-composer", status: "已完成", statusCls: "pill-success", dot: "dot-done",
      thread: "review-composer", ws: "子智能体 · 独立审查",
      body: transcriptBody("审查 Composer 双模改动的代码质量。", [
        { text: "结论:0 P0 / 1 P1(steer 模式 placeholder 未联动),已修复并回归。", tool: "run_command", toolDetail: "pnpm lint · 0 errors", done: true }
      ])
    },
    "explore-protocol": {
      title: "explore-protocol", status: "已完成", statusCls: "pill-success", dot: "dot-done",
      thread: "explore-protocol", ws: "子智能体 · 协议调研",
      body: transcriptBody("确认 steer / queue 的协议端点。", [
        { text: "确认:steer 走 POST /api/v1/prompts:steer;queue 是客户端队列,无独立端点。", tool: "read_file", toolDetail: "api/daemon/types.ts", done: true }
      ])
    },
    "refactor-sidebar": {
      title: "refactor-sidebar", status: "已完成", statusCls: "pill-success", dot: "dot-done",
      thread: "refactor-sidebar", ws: "子智能体 · 侧栏重写",
      body: transcriptBody("侧栏重写:工作区分组 + 折叠 + 悬浮菜单。", [
        { text: "完成,结构参考官方 Sidebar.vue,交互对齐 Codex 桌面端。", tool: "edit_file", toolDetail: "Sidebar.vue · +210 −96", done: true }
      ])
    },
    "test-approval": {
      title: "test-approval", status: "已完成", statusCls: "pill-success", dot: "dot-done",
      thread: "test-approval", ws: "子智能体 · 键位单测",
      body: transcriptBody("审批单键 y/a/n/p 的键位单测。", [
        { text: "8/8 通过,含输入法组合键排除场景。", tool: "run_command", toolDetail: "pnpm test approval · 8/8", done: true }
      ])
    },
    "explore-tokens": {
      title: "explore-tokens", status: "已完成", statusCls: "pill-success", dot: "dot-done",
      thread: "explore-tokens", ws: "子智能体 · 视觉调研",
      body: transcriptBody("调研官方 token 配色体系。", [
        { text: "结论:保留 Kimi 蓝 #1783ff,中性色用透明度,深色 accent 转 #4c9aff。", tool: "read_file", toolDetail: "apps/kimi-web/src/style.css", done: true }
      ])
    }
  };

  function fillSideTask(d) {
    var st = $(".side-task");
    if (!st) return;
    $(".st-title", st).textContent = d.title;
    var pill = $(".st-status", st);
    if (pill) {
      pill.className = "pill st-status " + d.statusCls;
      pill.innerHTML = '<span class="dot ' + d.dot + '"></span>' + d.status;
    }
    $(".st-thread-dot", st).className = "dot st-thread-dot " + d.dot;
    $(".st-thread-name", st).textContent = d.thread;
    $(".st-thread-ws", st).textContent = d.ws;
    $(".st-body", st).innerHTML = d.body;
    var ta = $(".st-composer textarea", st);
    if (ta) ta.setAttribute("placeholder", "给「" + d.title + "」发消息…");
  }

  /* 钻取子智能体 transcript:复用侧边分栏,关掉管理面板 */
  function openAgentTranscript(key) {
    var t = AGENT_TRANSCRIPTS[key];
    if (!t) { toggleAgentPanel(true); return; }
    fillSideTask(t);
    toggleAgentPanel(false);
    toggleSideTask(true);
  }

  function bindThreadChrome() {
    var toolbar = $(".app-toolbar");
    var title = toolbar ? $(".toolbar-title", toolbar) : null;
    if (!toolbar || !title || !$(".app-conversation")) return;

    var btn = document.createElement("button");
    btn.className = "icon-btn title-more";
    btn.title = "任务菜单";
    btn.innerHTML = SVG_MORE;
    title.insertAdjacentElement("afterend", btn);

    var menu = document.createElement("div");
    menu.className = "thread-menu";
    menu.innerHTML =
      mi(SVG_PIN, "置顶任务", "⌥⌘P", "pin-thread") +
      mi(SVG_PENCIL, "重命名任务", "⌥⌘R") +
      mi(SVG_ARCHIVE, "归档任务", "⇧⌘A") +
      '<div class="menu-sep"></div>' +
      mi(SVG_SIDE, "打开侧边任务", "⌥⌘S", "toggle-side-task") +
      '<div class="menu-sep"></div>' +
      mi(SVG_COPY, "复制", null, null, true) +
      mi(SVG_PLAY, "在…中继续", null, null, true) +
      mi(SVG_CLOCK, "添加计划任务…") +
      '<div class="menu-sep"></div>' +
      mi(SVG_EXTERNAL, "在新窗口中打开");
    toolbar.appendChild(menu);

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.toggle("open");
    });
    /* 菜单项点击后自然冒泡到 document 关闭;只有侧边任务有真实行为 */
    $all('[data-action="toggle-side-task"]', menu).forEach(function (item) {
      item.addEventListener("click", function () { fillSideTask(DEFAULT_SIDE); toggleSideTask(true); });
    });
    $all('[data-action="pin-thread"]', menu).forEach(function (item) {
      item.addEventListener("click", pinCurrentThread);
    });

    /* 侧边任务面板:真分栏(主区让位),骨架 + 内容可替换 */
    var main = $(".app-main");
    var st = document.createElement("aside");
    st.className = "side-task";
    st.innerHTML =
      '<div class="st-head">' + SVG_SIDE +
        '<span class="st-title"></span>' +
        '<span class="pill st-status"></span>' +
        '<button class="icon-btn st-close" title="关闭 Esc">' + SVG_X_SM + "</button>" +
      "</div>" +
      '<div class="st-thread"><span class="dot st-thread-dot"></span><span class="st-thread-name"></span><span class="st-thread-ws"></span></div>' +
      '<div class="st-body"></div>' +
      '<div class="st-composer"><div class="composer">' +
        '<div class="composer-input"><textarea rows="1"></textarea></div>' +
        '<div class="composer-toolbar">' +
          '<div class="toolbar-group"><button class="perm-pill perm-danger" title="权限模式:完全自主">' + SVG_SHIELD + "完全自主</button></div>" +
          '<div class="toolbar-group right"><button class="composer-send" title="发送">' + SVG_ARROW_UP + "</button></div>" +
        "</div>" +
      "</div></div>";
    main.appendChild(st);
    fillSideTask(DEFAULT_SIDE);
    $(".st-close", st).addEventListener("click", function () { toggleSideTask(false); });
  }

  /* ---------- 子智能体面板(管理 + 完成历史,对齐 Codex) ---------- */
  var SVG_BOT = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="14" height="11" rx="2.5"/><path d="M12 9V5.5"/><circle cx="12" cy="4.5" r="1" fill="currentColor" stroke="none"/><circle cx="9.5" cy="14" r="0.6" fill="currentColor" stroke="none"/><circle cx="14.5" cy="14" r="0.6" fill="currentColor" stroke="none"/><path d="M9.5 16.8h5"/></svg>';
  function toggleAgentPanel(force) {
    var p = $(".agent-panel");
    if (!p) return;
    if (typeof force === "boolean") p.classList.toggle("open", force);
    else p.classList.toggle("open");
  }
  function apRow(key, icon, v, name, sum, time, barPct, running) {
    return '<div class="ap-row" data-agent="' + key + '">' +
      '<span class="ap-icon ' + v + '">' + icon + "</span>" +
      '<span class="ap-main"><span class="ap-name">' + (running ? '<span class="dot dot-running"></span>' : "") + name + "</span>" +
      '<span class="ap-sum">' + sum + "</span>" +
      (barPct ? '<span class="ap-bar"><span class="ap-bar-fill" style="width:' + barPct + '%"></span></span>' : "") +
      "</span>" +
      '<span class="ap-time">' + time + "</span>" +
      "</div>";
  }
  function bindAgentPanel() {
    if (!$(".subagent-card")) return;
    var toolbar = $(".app-toolbar");
    var main = $(".app-main");
    if (!toolbar || !main) return;

    var btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.title = "子智能体";
    btn.innerHTML = SVG_BOT;
    toolbar.appendChild(btn);

    var panel = document.createElement("aside");
    panel.className = "agent-panel";
    panel.innerHTML =
      '<div class="ap-head">' + SVG_BOT +
        '<span class="ap-title">子智能体</span>' +
        '<button class="icon-btn ap-close" title="关闭 Esc">' + SVG_X_SM + "</button>" +
      "</div>" +
      '<div class="ap-body">' +
        '<div class="ap-label">已开启 · 2</div>' +
        apRow("refactor-thinking", "R", "v1", "refactor-thinking", "正在重写流式渲染逻辑,思考块限高方案已确认… 7/12", "3 分", 58, true) +
        apRow("refactor-composer", "C", "v1", "refactor-composer", "双模切换布局已完成,正在接队列面板… 5/15", "1 分", 33, true) +
        '<div class="ap-label" style="margin-top:14px">完成 · 6</div>' +
        apRow("refactor-diff", "D", "v2", "refactor-diff", "DiffView 高亮与 hunk 折叠已完成,15/15 项。", "12 分") +
        apRow("review-composer", "R", "v2", "review-composer", "双模切换代码审查:0 P0 / 1 P1,已修复。", "46 分") +
        apRow("explore-protocol", "E", "v3", "explore-protocol", "steer/queue 端点确认:POST /api/v1/prompts:steer。", "1 小时") +
        apRow("refactor-sidebar", "S", "v2", "refactor-sidebar", "侧栏分组与折叠重写完成,交互对齐 Codex。", "2 小时") +
        apRow("test-approval", "T", "v2", "test-approval", "审批单键 y/a/n/p 键位单测 8/8 通过。", "3 小时") +
        apRow("explore-tokens", "T", "v3", "explore-tokens", "token 体系调研:配色对齐官方 style.css。", "5 小时") +
        '<button class="ap-more">再显示 10 个</button>' +
      "</div>";
    main.appendChild(panel);

    btn.addEventListener("click", function () { toggleAgentPanel(); });
    $(".ap-close", panel).addEventListener("click", function () { toggleAgentPanel(false); });
    /* 面板行点击 → 钻取该 agent 的 transcript 分栏 */
    $all(".ap-row[data-agent]", panel).forEach(function (row) {
      row.addEventListener("click", function () { openAgentTranscript(row.getAttribute("data-agent")); });
    });
    /* 对话流卡片点击 → 直接钻取该 agent */
    $all(".subagent-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var nameEl = $(".sa-name", card);
        openAgentTranscript(nameEl ? nameEl.textContent.trim() : "");
      });
    });
  }

  /* ---------- 文件右键菜单(diff 区域:IDE 打开 / 复制路径 / 自动换行) ---------- */
  var SVG_CHEVRON_RIGHT = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  var SVG_APPS = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
  var SVG_WRAP = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4"/><path d="M8 16l-3 2 3 2"/></svg>';

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "proto-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.classList.add("out");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, 1400);
  }
  function clip(text) {
    try { if (navigator.clipboard) navigator.clipboard.writeText(text); } catch (e) { /* ignore */ }
  }
  function absPath(f) {
    if (f.charAt(0) === "/") return f;
    return "/Users/liujun/project/kimi-gui/" + (f.indexOf("/") >= 0 ? f : "web/src/components/" + f);
  }
  function fileOf(el) {
    var f = el.querySelector(".diff-file");
    if (f) return f.textContent.trim();
    var ap = el.closest ? el.closest(".approval") : null;
    if (ap) {
      var p = ap.querySelector(".ah-path");
      if (p) return p.textContent.trim().split(" · ")[0];
    }
    return "DiffView.vue";
  }

  var openFileMenu = null;
  function bindFileContextMenu() {
    var menu = null;
    function closeMenu() { if (menu) { menu.parentNode.removeChild(menu); menu = null; } }
    document.addEventListener("click", closeMenu);
    document.addEventListener("contextmenu", function () { closeMenu(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

    function fmItem(action, svg, label, disabled, chevron) {
      return '<button class="menu-item' + (disabled ? " is-disabled" : "") + '" data-fm="' + action + '">' +
        (svg ? '<span class="mi-ic">' + svg + "</span>" : "") +
        '<span class="mi-label">' + label + "</span>" +
        (chevron ? '<span class="mi-kbd">' + SVG_CHEVRON_RIGHT + "</span>" : "") +
        "</button>";
    }

    openFileMenu = function (x, y, file, card) {
      closeMenu();
      var hasSel = !!String(window.getSelection());
      menu = document.createElement("div");
      menu.className = "file-menu";
      menu.innerHTML =
        fmItem("ide", SVG_EXTERNAL, '在 "VS Code" 中打开') +
        '<div class="fm-sub">' +
          fmItem("noop", SVG_APPS, "打开方式", false, true) +
          '<div class="file-menu-sub">' +
            fmItem("open:VS Code", null, "VS Code") +
            fmItem("open:Cursor", null, "Cursor") +
            fmItem("open:IntelliJ IDEA", null, "IntelliJ IDEA") +
            fmItem("open:Zed", null, "Zed") +
            '<div class="menu-sep"></div>' +
            fmItem("open:访达", null, "访达") +
          "</div>" +
        "</div>" +
        '<div class="menu-sep"></div>' +
        fmItem("copy-sel", SVG_COPY, "复制所选内容", !hasSel) +
        fmItem("copy-abs", SVG_COPY, "复制路径") +
        fmItem("copy-rel", SVG_COPY, "复制相对路径") +
        '<div class="menu-sep"></div>' +
        fmItem("wrap", SVG_WRAP, "切换自动换行");
      document.body.appendChild(menu);
      menu.style.left = Math.min(x, window.innerWidth - 220) + "px";
      menu.style.top = Math.min(y, window.innerHeight - 300) + "px";
      /* 保住文本选区,复制所选内容才有效 */
      menu.addEventListener("mousedown", function (e) { e.preventDefault(); });
      menu.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest("[data-fm]") : null;
        if (!btn) return;
        var act = btn.getAttribute("data-fm");
        if (act === "noop") return;
        closeMenu();
        if (act === "ide") return toast('已在 "VS Code" 中打开(原型模拟)');
        if (act.indexOf("open:") === 0) return toast('已在 "' + act.slice(5) + '" 中打开(原型模拟)');
        if (act === "copy-sel") { clip(String(window.getSelection())); return toast("已复制所选内容"); }
        if (act === "copy-abs") { clip(absPath(file)); return toast("已复制路径"); }
        if (act === "copy-rel") { clip(file); return toast("已复制相对路径"); }
        if (act === "wrap") {
          $all(".diff-lines", card).forEach(function (d) { d.classList.toggle("wrap"); });
        }
      });
    };

    document.addEventListener("contextmenu", function (e) {
      var card = e.target.closest ? e.target.closest(".diff-inline, .rp-diff, .body-diff") : null;
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      openFileMenu(e.clientX, e.clientY, fileOf(card), card);
    });
  }

  /* ---------- Composer 补全:/ 斜杠命令 + @ 文件提及 ----------
     数据来源(真实产品,勿写死):
     - 内置命令:前端写死,desc 为 i18n 文案(见 SLASH_COMMANDS)
     - Skills:GET /sessions/{id}/skills + GET /workspaces/{id}/skills 动态合并(此处 mock)
     - @ 文件:工作区文件索引(此处 mock) */
  var SLASH_COMMANDS = [
    { cmd: "new", desc: "新建会话" },
    { cmd: "clear", desc: "清空当前会话上下文" },
    { cmd: "login", desc: "登录账号" },
    { cmd: "plan", desc: "进入计划模式" },
    { cmd: "swarm", desc: "多智能体并行执行", acceptsInput: true },
    { cmd: "goal", desc: "进入目标模式(长期任务)", acceptsInput: true },
    { cmd: "btw", desc: "把话题开到侧边任务", acceptsInput: true },
    { cmd: "auto", desc: "自动模式:审批自动通过" },
    { cmd: "yolo", desc: "完全放权,跳过所有审批(危险)" },
    { cmd: "thinking", desc: "切换思考深度" },
    { cmd: "compact", desc: "压缩上下文,保留要点", acceptsInput: true },
    { cmd: "undo", desc: "撤销上一轮改动" },
    { cmd: "fork", desc: "从当前会话分叉出新线程" },
    { cmd: "export", desc: "导出会话记录" },
    { cmd: "status", desc: "查看会话状态与用量" }
  ];
  /* mock Skills:真实从 /sessions/{id}/skills + /workspaces/{id}/skills 拉取,字段 { name, description, source } */
  var SKILL_COMMANDS = [
    { cmd: "草稿评审", desc: "评审当前草稿并给出修改建议", isSkill: true, acceptsInput: true },
    { cmd: "代码审查", desc: "按项目规约审查本轮改动", isSkill: true },
    { cmd: "写周报", desc: "汇总本周工作生成周报草稿", isSkill: true }
  ];
  /* mock 文件列表:真实来自工作区文件索引 */
  var AT_FILES = [
    "web/src/components/codex/Composer.vue",
    "web/src/components/codex/ThinkingBlock.vue",
    "web/src/components/codex/ApprovalCard.vue",
    "web/src/components/codex/DiffView.vue",
    "web/src/api/daemon/client.ts",
    "web/package.json",
    "package.json",
    "docs/superpowers/specs/2026-07-18-kimi-gui-design.md"
  ];
  var SVG_FILE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';

  function bindComposerAssist() {
    var composer = $(".composer");
    var ta = composer ? $("textarea", composer) : null;
    if (!composer || !ta) return;
    var pop = document.createElement("div");
    pop.className = "assist-pop";
    composer.appendChild(pop);
    var mode = null, matches = [], idx = 0, atStart = -1;

    function close() { pop.classList.remove("open"); mode = null; }
    function update() {
      var v = ta.value;
      var slashM = v.match(/^\/(\w*)$/);
      var atM = v.match(/(?:^|\s)@([^\s@]*)$/);
      if (slashM) { mode = "slash"; render(slashM[1].toLowerCase()); }
      else if (atM) { mode = "at"; atStart = v.lastIndexOf("@"); render(atM[1].toLowerCase()); }
      else close();
    }
    function render(q) {
      var html = "";
      if (mode === "slash") {
        var cmds = SLASH_COMMANDS.filter(function (c) { return c.cmd.toLowerCase().indexOf(q) >= 0; });
        var skills = SKILL_COMMANDS.filter(function (c) { return c.cmd.toLowerCase().indexOf(q) >= 0; });
        matches = cmds.concat(skills);
        html = '<div class="as-label">命令</div><div class="as-list">';
        if (!cmds.length && !skills.length) html += '<div class="as-empty">无匹配命令</div>';
        cmds.forEach(function (c, i) {
          html += '<button class="assist-item' + (i === idx ? " active" : "") + '" data-i="' + i + '"><span class="as-cmd">/' + c.cmd + '</span><span class="as-desc">' + c.desc + "</span></button>";
        });
        if (skills.length) {
          html += '<div class="as-label as-label-sub">Skills<span class="as-dynamic">动态</span></div>';
          skills.forEach(function (c, j) {
            var i = cmds.length + j;
            html += '<button class="assist-item' + (i === idx ? " active" : "") + '" data-i="' + i + '"><span class="as-cmd">/' + c.cmd + '</span><span class="as-desc">' + c.desc + '</span><span class="as-tag">skill</span></button>';
          });
        }
        html += "</div>";
      } else {
        matches = AT_FILES.filter(function (f) { return f.toLowerCase().indexOf(q) >= 0; });
        html = '<div class="as-label">文件</div><div class="as-list">';
        if (!matches.length) html += '<div class="as-empty">无匹配文件</div>';
        matches.forEach(function (f, i) {
          html += '<button class="assist-item' + (i === idx ? " active" : "") + '" data-i="' + i + '"><span class="mi-ic">' + SVG_FILE + '</span><span class="as-cmd as-file">' + f + "</span></button>";
        });
        html += "</div>";
      }
      pop.innerHTML = html;
      pop.classList.add("open");
      $all(".assist-item", pop).forEach(function (item) {
        item.addEventListener("mousedown", function (e) { e.preventDefault(); });
        item.addEventListener("click", function () { pick(parseInt(item.getAttribute("data-i"), 10)); });
      });
      var act = $(".assist-item.active", pop);
      if (act && act.scrollIntoView) act.scrollIntoView({ block: "nearest" });
    }
    function pick(i) {
      var m = matches[i];
      if (!m) return;
      if (mode === "slash") {
        if (m.acceptsInput) {
          /* /swarm /goal /btw /compact 等:留在输入框继续打参数 */
          ta.value = "/" + m.cmd + " ";
        } else {
          /* 无参命令:直接执行(原型用 toast 示意) */
          ta.value = "";
          toast("已执行 /" + m.cmd + "(原型)");
        }
      } else {
        ta.value = ta.value.slice(0, atStart) + "@" + m + " ";
      }
      close();
      ta.focus();
    }
    ta.addEventListener("input", function () { idx = 0; update(); });
    ta.addEventListener("keydown", function (e) {
      if (!mode || !pop.classList.contains("open")) return;
      if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, matches.length - 1); update(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); update(); }
      else if ((e.key === "Enter" || e.key === "Tab") && matches.length) { e.preventDefault(); e.stopPropagation(); pick(idx); }
      else if (e.key === "Escape") { e.stopPropagation(); close(); }
    });
    document.addEventListener("click", function (e) {
      if (mode && !pop.contains(e.target) && e.target !== ta) close();
    });
  }

  /* ---------- 权限三档切换(perm-pill 弹层) ----------
     三档语义对齐官方(逐条确认/自动通过/完全自主);
     daemon 是否有 set_mode 端点待 M0 验证(spec 6.7.4) ---------- */
  var PERMS = [
    { id: "manual", name: "逐条确认", desc: "每个工具操作都需要你手动确认", cls: "" },
    { id: "auto", name: "自动通过", desc: "自动批准工具操作,但遇到关键问题仍会询问", cls: "perm-yolo" },
    { id: "full", name: "完全自主", desc: "完全自主运行,智能体自己做决定,不再询问", cls: "perm-danger" }
  ];
  var permState = "manual";
  function closePermPop() {
    var pop = $(".perm-pop.open");
    if (pop) pop.classList.remove("open");
    var pill = $(".perm-pill.open");
    if (pill) pill.classList.remove("open");
  }
  function bindPermPicker() {
    var pill = $(".composer .perm-pill");
    var composer = $(".composer");
    if (!pill || !composer) return;
    try {
      var s = localStorage.getItem("proto-perm");
      if (PERMS.some(function (p) { return p.id === s; })) permState = s;
    } catch (e) { /* ignore */ }
    var pop = document.createElement("div");
    pop.className = "model-pop perm-pop";
    composer.appendChild(pop);

    function cur() {
      for (var i = 0; i < PERMS.length; i++) if (PERMS[i].id === permState) return PERMS[i];
      return PERMS[0];
    }
    function renderPill() {
      var c = cur();
      pill.className = "perm-pill" + (pop.classList.contains("open") ? " open" : "") + (c.cls ? " " + c.cls : "");
      pill.innerHTML = SVG_SHIELD + c.name + SVG_CHEVRON;
    }
    function render() {
      var html = '<div class="mp-label">权限模式</div>';
      PERMS.forEach(function (p) {
        html += '<button class="mp-item' + (p.id === permState ? " active" : "") + '" data-perm="' + p.id + '">' +
          SVG_CHECK_SM + '<span class="mp-text"><span class="mp-name">' + p.name + '</span><span class="mp-desc">' + p.desc + "</span></span></button>";
      });
      pop.innerHTML = html;
      $all(".mp-item", pop).forEach(function (item) {
        item.addEventListener("click", function () {
          permState = item.getAttribute("data-perm");
          try { localStorage.setItem("proto-perm", permState); } catch (e) { /* ignore */ }
          closePermPop();
          renderPill();
        });
      });
    }
    pill.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = !pop.classList.contains("open");
      closeModelPop();
      closeCtxPop();
      closePermPop();
      if (willOpen) { render(); pop.classList.add("open"); pill.classList.add("open"); renderPill(); }
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", closePermPop);
    document.addEventListener("click", function () { renderPill(); });
    renderPill();
  }

  /* ---------- 模式开关(计划 / Swarm / 目标,可多选,激活显示在 pill 上) ---------- */
  var MODES = [
    { id: "plan", name: "计划", desc: "先让智能体梳理计划,再修改文件" },
    { id: "swarm", name: "Swarm", desc: "并行运行多个智能体,适合大范围探索" },
    { id: "goal", name: "目标", desc: "持续跟踪一个目标,直到任务完成" }
  ];
  var SVG_SLIDERS = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="16" cy="6" r="2.2"/><circle cx="8" cy="12" r="2.2"/><circle cx="16" cy="18" r="2.2"/><path d="M3 6h10.5M18.5 6H21M3 12h2.5M10.5 12H21M3 18h10.5M18.5 18H21"/></svg>';
  var SVG_PLAN = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var SVG_SPARKLE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
  var SVG_TARGET = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>';
  var MODE_ICONS = { plan: SVG_PLAN, swarm: SVG_SPARKLE, goal: SVG_TARGET };
  var modeState = { plan: false, swarm: false, goal: false };
  function closeModePop() {
    var pop = $(".mode-pop.open");
    if (pop) pop.classList.remove("open");
    var pill = $(".mode-pill.open");
    if (pill) pill.classList.remove("open");
  }
  function bindModePicker() {
    var composer = $(".composer");
    var leftGroup = composer ? $(".composer .toolbar-group:not(.right)") : null;
    if (!composer || !leftGroup) return;
    modeState.swarm = document.body.getAttribute("data-page") === "multi-agent";

    var pill = document.createElement("button");
    pill.className = "perm-pill mode-pill";
    pill.title = "模式";
    leftGroup.appendChild(pill);

    var pop = document.createElement("div");
    pop.className = "model-pop mode-pop";
    composer.appendChild(pop);

    function renderPill() {
      var active = MODES.filter(function (m) { return modeState[m.id]; });
      pill.innerHTML = SVG_SLIDERS + "模式" +
        (active.length ? '<span class="mode-tag">' + active.map(function (m) { return m.name; }).join(" · ") + "</span>" : "") +
        SVG_CHEVRON;
    }
    function render() {
      var html = '<div class="mp-label">模式</div>';
      MODES.forEach(function (m) {
        html += '<label class="mp-row mode-row' + (modeState[m.id] ? " mode-on" : "") + '">' +
          '<span class="mi-ic">' + MODE_ICONS[m.id] + "</span>" +
          '<span class="mp-text"><span class="mp-name">' + m.name + '</span><span class="mp-desc">' + m.desc + "</span></span>" +
          '<span class="mode-sw"><input type="checkbox" data-mode="' + m.id + '"' + (modeState[m.id] ? " checked" : "") + '><span class="mode-sw-slider"></span></span>' +
          "</label>";
      });
      pop.innerHTML = html;
      $all(".mode-sw input", pop).forEach(function (input) {
        input.addEventListener("change", function () {
          var id = input.getAttribute("data-mode");
          modeState[id] = input.checked;
          var row = input.closest(".mode-row");
          if (row) row.classList.toggle("mode-on", input.checked);
          renderPill();
        });
      });
    }
    pill.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = !pop.classList.contains("open");
      closeAllPops();
      if (willOpen) { render(); pop.classList.add("open"); pill.classList.add("open"); }
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", closeModePop);
    renderPill();
  }

  function closeAllPops() {
    closeModelPop();
    closeCtxPop();
    closePermPop();
    closeModePop();
  }

  /* ---------- 侧栏:置顶当前线程 + 状态过滤 ---------- */
  function pinCurrentThread() {
    var titleEl = $(".toolbar-title");
    var list = $(".sidebar-list");
    if (!titleEl || !list) return;
    var title = titleEl.textContent.trim();
    var pinGroup = $(".pin-group", list);
    if (pinGroup) {
      var rows = $all(".thread-row", pinGroup);
      for (var i = 0; i < rows.length; i++) {
        var t = $(".thread-title", rows[i]);
        if (t && t.textContent.trim() === title) {
          rows[i].parentNode.removeChild(rows[i]);
          if (!$all(".thread-row", pinGroup).length) pinGroup.parentNode.removeChild(pinGroup);
          toast("已取消置顶");
          return;
        }
      }
    }
    var target = null;
    $all(".thread-row", list).forEach(function (r) {
      var t = $(".thread-title", r);
      if (!target && t && t.textContent.trim() === title && !r.closest(".pin-group")) target = r;
    });
    if (!target) return;
    if (!pinGroup) {
      pinGroup = document.createElement("section");
      pinGroup.className = "workspace-group pin-group";
      pinGroup.innerHTML = '<div class="workspace-header"><span class="ws-name">置顶</span></div><div class="ws-threads"></div>';
      list.insertBefore(pinGroup, list.firstChild);
    }
    var clone = target.cloneNode(true);
    clone.classList.remove("active");
    $(".ws-threads", pinGroup).appendChild(clone);
    toast("已置顶「" + title + "」");
  }

  function bindSidebarFilter() {
    var search = $(".sidebar-search");
    var list = $(".sidebar-list");
    if (!search || !list) return;
    var bar = document.createElement("div");
    bar.className = "side-filter";
    bar.innerHTML =
      '<button class="sf-chip active" data-filter="all">全部</button>' +
      '<button class="sf-chip" data-filter="running">运行中</button>' +
      '<button class="sf-chip" data-filter="waiting">待审批</button>';
    search.insertAdjacentElement("afterend", bar);
    $all(".sf-chip", bar).forEach(function (chip) {
      chip.addEventListener("click", function () {
        $all(".sf-chip", bar).forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        var f = chip.getAttribute("data-filter");
        $all(".thread-row", list).forEach(function (row) {
          var show = f === "all" ||
            (f === "running" && $(".dot-running", row)) ||
            (f === "waiting" && $(".dot-waiting", row));
          row.classList.toggle("filtered-out", !show);
        });
        var visibleGroups = 0;
        $all(".workspace-group", list).forEach(function (g) {
          var anyVisible = $all(".thread-row", g).some(function (r) { return !r.classList.contains("filtered-out"); });
          g.classList.toggle("filtered-out", !anyVisible);
          if (anyVisible) visibleGroups++;
        });
        /* 零匹配空态:筛选的是会话,项目无匹配会话时不展示;一个都没有就给提示 */
        var empty = $(".sf-empty", list);
        if (visibleGroups === 0 && f !== "all") {
          if (!empty) {
            empty = document.createElement("div");
            empty.className = "sf-empty";
            empty.textContent = "没有符合筛选的会话";
            list.appendChild(empty);
          }
        } else if (empty) {
          empty.parentNode.removeChild(empty);
        }
      });
    });
  }

  /* ---------- Composer 发送(Enter 发送 / Shift+Enter 换行 / ⌘+Enter 同效) ---------- */
  var SVG_GRIP = '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';
  var SVG_TURN = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v2"/></svg>';
  var SVG_PENCIL_SM = '<svg class="ic ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
  var SVG_TRASH_SM = '<svg class="ic ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

  function appendUserBubble(text) {
    var conv = $(".conversation");
    if (!conv) return;
    var msg = document.createElement("div");
    msg.className = "msg-user";
    var bubble = document.createElement("div");
    bubble.className = "u-bubble";
    bubble.textContent = text;
    var meta = document.createElement("div");
    meta.className = "u-meta";
    meta.textContent = "刚刚";
    msg.appendChild(bubble);
    msg.appendChild(meta);
    conv.appendChild(msg);
    var sc = $(".app-conversation");
    if (sc) sc.scrollTop = sc.scrollHeight;
  }
  function appendQueueRow(dock, text) {
    var panel = $(".queue-panel", dock);
    if (!panel) return;
    var row = document.createElement("div");
    row.className = "qp-row";
    row.innerHTML =
      '<span class="qp-grip">' + SVG_GRIP + '</span>' +
      '<span class="qp-num">' + ($all(".qp-row", panel).length + 1) + "</span>" +
      '<span class="qp-text"></span>' +
      '<span class="qp-actions">' +
        '<button class="qp-steer" data-action="qp-steer" title="转为引导:立即插话到当前轮">' + SVG_TURN + '引导</button>' +
        '<button class="icon-btn" data-action="qp-edit" title="编辑">' + SVG_PENCIL_SM + '</button>' +
        '<button class="icon-btn" data-action="qp-del" title="删除">' + SVG_TRASH_SM + '</button>' +
      "</span>";
    $(".qp-text", row).textContent = text;
    panel.appendChild(row);
    var ind = $(".queue-indicator", dock);
    if (ind) ind.style.display = "";
    syncQueueCount(dock);
  }
  function bindComposerSend() {
    var composer = $(".composer");
    var ta = composer ? $("textarea", composer) : null;
    if (!composer || !ta) return;
    function send() {
      /* 补全菜单开着时,Enter 归菜单 */
      if ($(".assist-pop.open")) return;
      var text = ta.value.trim();
      if (!text) return;
      var dock = composer.closest(".dock-inner") || document;
      if (composer.classList.contains("is-running")) {
        if (composer.classList.contains("mode-steer-on")) {
          /* 插话:反馈气泡 + 思考块打引导标记(复用队列引导链路) */
          showSteerFeedback(dock);
          markSteerInThinking(text);
        } else {
          /* 排队:进队列面板 + 计数联动 */
          appendQueueRow(dock, text);
        }
      } else {
        appendUserBubble(text);
      }
      ta.value = "";
      ta.focus();
    }
    ta.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      send();
    });
    var sendBtn = $(".composer-send", composer);
    if (sendBtn && !sendBtn.classList.contains("stop")) {
      sendBtn.addEventListener("click", send);
    }
  }

  /* ---------- 账号 / 登录整合(侧栏底部账号行 + 登录弹窗) ---------- */
  var AUTH_KEY = "proto-auth";
  var SVG_PERSON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>';
  var SVG_CARET = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 15l4-4 4 4"/></svg>';
  function authState() {
    try { return localStorage.getItem(AUTH_KEY) === "out" ? "out" : "in"; } catch (e) { return "in"; }
  }
  function setAuth(s) {
    try { localStorage.setItem(AUTH_KEY, s); } catch (e) { /* ignore */ }
    renderAccount();
  }
  function renderAccount() {
    var row = $(".acct-row");
    if (!row) return;
    if (authState() === "in") {
      row.innerHTML = '<span class="acct-avatar">J</span><span class="acct-name">jun</span><span class="acct-caret">' + SVG_CARET + "</span>";
    } else {
      row.innerHTML = '<span class="acct-avatar out">' + SVG_PERSON + '</span><span class="acct-name">未登录</span><span class="acct-caret">' + SVG_CARET + "</span>";
    }
  }
  function closeLoginModal() {
    var ov = $(".login-overlay");
    if (ov) ov.classList.remove("open");
  }
  function openLoginModal() {
    var ov = $(".login-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "login-overlay";
      ov.innerHTML =
        '<div class="login-card">' +
          '<span class="login-logo">K</span>' +
          '<div class="login-title">登录 Kimi Code</div>' +
          '<div class="login-desc">将跳转到浏览器完成授权<br>授权成功后自动返回应用</div>' +
          '<button class="login-btn">使用 Kimi 账号登录</button>' +
          '<button class="login-cancel">取消</button>' +
        "</div>";
      document.body.appendChild(ov);
      $(".login-btn", ov).addEventListener("click", function () {
        toast("已打开浏览器授权(原型)");
        setTimeout(function () {
          closeLoginModal();
          setAuth("in");
          toast("登录成功,欢迎回来,jun");
        }, 1200);
      });
      $(".login-cancel", ov).addEventListener("click", closeLoginModal);
      ov.addEventListener("click", function (e) { if (e.target === ov) closeLoginModal(); });
    }
    ov.classList.add("open");
  }
  function bindAccount() {
    var footer = $(".sidebar-footer");
    if (!footer) return;
    var row = document.createElement("button");
    row.className = "acct-row";
    footer.insertBefore(row, footer.firstChild);
    renderAccount();

    var menu = document.createElement("div");
    menu.className = "acct-menu";
    footer.appendChild(menu);

    row.addEventListener("click", function (e) {
      e.stopPropagation();
      if (authState() === "out") { openLoginModal(); return; }
      menu.innerHTML =
        '<div class="acct-head">jun@moonshot.cn</div>' +
        '<button class="menu-item" data-acct="settings"><span class="mi-label">账号设置</span></button>' +
        '<button class="menu-item" data-acct="switch"><span class="mi-label">切换账号</span></button>' +
        '<div class="menu-sep"></div>' +
        '<button class="menu-item" data-acct="logout"><span class="mi-label">退出登录</span></button>';
      menu.classList.toggle("open");
    });
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
      var item = e.target.closest ? e.target.closest("[data-acct]") : null;
      if (!item) return;
      menu.classList.remove("open");
      var act = item.getAttribute("data-acct");
      if (act === "logout") { setAuth("out"); toast("已退出登录"); }
      else if (act === "switch") openLoginModal();
      else toast("账号设置(原型)");
    });
    document.addEventListener("click", function () { menu.classList.remove("open"); });
  }

  /* ---------- 流式思考:自动跟随最新 + 用户上滚暂停 + 「↓ 最新」回跳 ----------
     原型用定时器 mock 流式;真实产品由 thinking.delta 驱动,滚锚行为不变 */
  var STREAM_POOL = [
    "继续读 handleSend 的分支处理,确认 queue 与 steer 的边界…",
    "检查双模状态放组件本地 ref 是否影响既有快照…",
    "对照 Codex 队列指示器的展开态与计数口径…",
    "确认 placeholder 与模式切换的联动顺序…",
    "定位 thinking.css 的限高规则与滚动锚点…",
    "梳理本轮改动涉及的样式文件与 token 依赖…",
    "准备写分段控件激活态的样式与动效…"
  ];
  function bindThinkingStream() {
    var body = $(".think.thinking .think-body");
    if (!body) return;
    var contents = $all(".think-content", body);
    var content = contents[contents.length - 1];
    if (!content) return;
    var follow = true;
    var pill = null;
    body.addEventListener("scroll", function () {
      follow = body.scrollTop + body.clientHeight >= body.scrollHeight - 24;
      if (follow && pill) { pill.parentNode.removeChild(pill); pill = null; }
    });
    function showPill() {
      if (pill) return;
      pill = document.createElement("button");
      pill.className = "think-scroll-pill";
      pill.textContent = "↓ 最新";
      pill.addEventListener("click", function (e) {
        e.stopPropagation();
        body.scrollTop = body.scrollHeight;
        follow = true;
        pill.parentNode.removeChild(pill);
        pill = null;
      });
      body.parentNode.appendChild(pill);
    }
    var i = 0;
    var timer = setInterval(function () {
      if (i >= STREAM_POOL.length) { clearInterval(timer); return; }
      content.appendChild(document.createTextNode(" " + STREAM_POOL[i++]));
      if (follow) body.scrollTop = body.scrollHeight;
      else showPill();
    }, 450);
  }

  /* ---------- 审批单键 y/a/n/p(作用于页面全部审批卡) ---------- */
  var APPROVAL_KEYS = { y: "approve", a: "session", n: "reject", p: "feedback" };
  function bindApprovalKeys() {
    document.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "input" || tag === "select") return;
      var key = APPROVAL_KEYS[e.key.toLowerCase()];
      if (!key) return;
      $all('.act-btn[data-key="' + key + '"]').forEach(function (btn) {
        btn.classList.add("pressed");
        setTimeout(function () { btn.classList.remove("pressed"); }, 140);
      });
    });
  }

  /* ---------- Review pane ---------- */
  function toggleReview(force) {
    var pane = $(".review-pane");
    if (!pane) return;
    if (typeof force === "boolean") pane.classList.toggle("open", force);
    else pane.classList.toggle("open");
  }
  function bindReviewPane() {
    $all('[data-action="toggle-review"]').forEach(function (b) {
      b.addEventListener("click", function () { toggleReview(); });
    });
    var close = $(".rp-close");
    if (close) close.addEventListener("click", function () { toggleReview(false); });
    $all(".rp-file").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $all(".rp-file").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        var id = chip.getAttribute("data-file");
        $all(".rp-diff").forEach(function (d) {
          d.hidden = d.getAttribute("data-file") !== id;
        });
      });
    });
  }

  /* ---------- Inspect 右栏 ---------- */
  function setDetailTab(id) {
    $all(".dp-tab").forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-tab") === id); });
    $all(".dp-pane").forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-pane") === id); });
  }
  function toggleDetail(open, tab) {
    var pane = $(".detail-pane");
    if (!pane) return;
    var willOpen = typeof open === "boolean" ? open : !pane.classList.contains("open");
    pane.classList.toggle("open", willOpen);
    if (willOpen) setDetailTab(tab || ($(".dp-tab.active") ? $(".dp-tab.active").getAttribute("data-tab") : "thread"));
  }
  function bindDetailPane() {
    $all('[data-action="toggle-detail"]').forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); toggleDetail(); });
    });
    $all("[data-open-detail]").forEach(function (el) {
      el.addEventListener("click", function () { toggleDetail(true, el.getAttribute("data-open-detail")); });
    });
    $all(".dp-tab").forEach(function (t) {
      t.addEventListener("click", function () { setDetailTab(t.getAttribute("data-tab")); });
    });
  }

  /* ---------- 工作区菜单(单个 ⋯ 入口;排序勾选只在排序项间切换) ---------- */
  function closeMenus() {
    $all(".ws-menu.open, .thread-menu.open").forEach(function (m) { m.classList.remove("open"); });
    $all(".workspace-header.menu-open").forEach(function (h) { h.classList.remove("menu-open"); });
  }
  function bindWorkspaceMenu() {
    $all(".ws-action[data-menu]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var menu = $('.ws-menu[data-id="' + btn.getAttribute("data-menu") + '"]');
        var wasOpen = menu && menu.classList.contains("open");
        closeMenus();
        if (menu && !wasOpen) {
          menu.classList.add("open");
          var header = btn.closest(".workspace-header");
          if (header) header.classList.add("menu-open");
        }
      });
    });
    $all(".ws-menu .menu-item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        if (item.hasAttribute("data-sort")) {
          $all(".menu-item[data-sort]", item.closest(".ws-menu")).forEach(function (i) { i.classList.remove("active"); });
          item.classList.add("active");
        }
        closeMenus();
      });
    });
    document.addEventListener("click", closeMenus);
  }

  /* ---------- 工作区分组折叠 ---------- */
  function bindWorkspaceToggle() {
    $all(".ws-toggle").forEach(function (t) {
      t.addEventListener("click", function () {
        var g = t.closest(".workspace-group");
        if (g) g.classList.toggle("ws-closed");
      });
    });
  }

  /* ---------- 设置页导航(点击切换 section,修复旧版死锚点) ---------- */
  function bindSettingsNav() {
    var nav = $(".settings-nav");
    if (!nav) return;
    $all("a[data-section]", nav).forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        $all("a", nav).forEach(function (x) { x.classList.remove("active"); });
        a.classList.add("active");
        var id = a.getAttribute("data-section");
        $all(".settings-section").forEach(function (s) { s.classList.toggle("active", s.id === id); });
      });
    });
  }

  /* ---------- 折叠 hunk 点击展开(data-hunk 配对) ---------- */
  function bindCollapsedHunks() {
    $all(".dl-collapsed").forEach(function (row) {
      row.addEventListener("click", function () {
        var id = row.getAttribute("data-hunk");
        if (!id) return;
        $all('.dl-hidden[data-hunk="' + id + '"]').forEach(function (dl) {
          dl.classList.remove("dl-hidden");
        });
        row.style.display = "none";
      });
    });
  }

  /* ---------- 全局键:Esc 关浮层 / ⌘B review / ⌘I inspect / ⌥⌘S 侧边任务 ---------- */
  function bindGlobalKeys() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeMenus();
        closeAllPops();
        closeLoginModal();
        toggleReview(false);
        toggleDetail(false);
        toggleSideTask(false);
        toggleAgentPanel(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b" && $(".review-pane")) {
        e.preventDefault(); toggleReview();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i" && $(".detail-pane")) {
        e.preventDefault(); toggleDetail();
      }
      /* mac 上 ⌥+字母产生特殊字符,用 e.code 判断 */
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === "KeyS" && $(".side-task")) {
        e.preventDefault(); toggleSideTask();
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === "KeyP" && $(".sidebar-list")) {
        e.preventDefault(); pinCurrentThread();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body.getAttribute("data-page") || "index";
    /* 支持 ?theme=dark|light 直接指定主题(演示/截图用) */
    var qsTheme = null;
    try { qsTheme = new URLSearchParams(location.search).get("theme"); } catch (e) { /* noop */ }
    if (qsTheme === "dark" || qsTheme === "light") applyTheme(qsTheme);
    injectPrototypeChrome(page);
    bindSidebarCollapse();
    bindThinkingToggle();
    bindComposerModes();
    bindQueueToggle();
    bindModelPicker();
    bindContextMeter();
    bindPermPicker();
    bindModePicker();
    bindComposerAssist();
    bindComposerSend();
    bindThinkingStream();
    bindQueueActions();
    bindThreadChrome();
    bindSidebarFilter();
    bindAccount();
    bindAgentPanel();
    bindFileContextMenu();
    bindApprovalKeys();
    bindReviewPane();
    bindDetailPane();
    bindWorkspaceMenu();
    bindWorkspaceToggle();
    bindSettingsNav();
    bindCollapsedHunks();
    bindGlobalKeys();
    /* ?pop=model|queue|side 直接展开对应浮层(演示/截图用) */
    var popParam = null;
    try { popParam = new URLSearchParams(location.search).get("pop"); } catch (e) { /* noop */ }
    if (popParam === "model") {
      var mp = $(".model-pop"); var mpl = $(".model-pill");
      if (mp) { mp.classList.add("open"); if (mpl) mpl.classList.add("open"); }
    } else if (popParam === "queue") {
      var qi = $(".queue-indicator"); var qp = $(".queue-panel");
      if (qi && qp) { qi.classList.add("open"); qp.classList.add("open"); }
    } else if (popParam === "menu") {
      var tm = $(".thread-menu");
      if (tm) tm.classList.add("open");
    } else if (popParam === "ctx") {
      var cp = $(".ctx-pop");
      if (cp) cp.classList.add("open");
    } else if (popParam === "agents") {
      toggleAgentPanel(true);
    } else if (popParam === "transcript") {
      openAgentTranscript("refactor-thinking");
    } else if (popParam === "slash") {
      var taS = $(".composer textarea");
      if (taS) { taS.value = "/"; taS.dispatchEvent(new Event("input")); }
    } else if (popParam === "at") {
      var taA = $(".composer textarea");
      if (taA) { taA.value = "参考 @Comp"; taA.dispatchEvent(new Event("input")); }
    } else if (popParam === "perm") {
      var pP = $(".composer .perm-pill");
      if (pP) pP.click();
    } else if (popParam === "mode") {
      var mP = $(".mode-pill");
      if (mP) mP.click();
    } else if (popParam === "login") {
      openLoginModal();
    } else if (popParam === "filemenu") {
      var di = $(".diff-inline");
      if (di && openFileMenu) {
        var fr = di.getBoundingClientRect();
        openFileMenu(Math.round(fr.left + fr.width / 2), Math.round(fr.top + 70), fileOf(di), di);
      }
    } else if (popParam === "side") {
      toggleSideTask(true);
    }
    /* ?filter=running|waiting 直接应用侧栏筛选(演示/截图用) */
    var filterParam = null;
    try { filterParam = new URLSearchParams(location.search).get("filter"); } catch (e) { /* noop */ }
    if (filterParam) {
      var chip = $('.sf-chip[data-filter="' + filterParam + '"]');
      if (chip) chip.click();
    }
  });
})();
