"use strict";

const STORAGE_KEY = "classroom-pocket-log-v1";
const APP_VERSION = "1.0.0";

const KINDS = {
  leave: {
    label: "请假",
    icon: "i-calendar",
    short: "病假、事假、临时离校",
    hint: "病假 · 事假",
    placeholder: "补充说明，例如：发烧请假一天，家长已发来请假信息。",
    templates: ["病假", "事假", "临时离校"],
  },
  praise: {
    label: "表扬",
    icon: "i-star",
    short: "进步、助人、课堂亮点",
    hint: "进步 · 助人",
    placeholder: "例如：数学课上主动给同桌讲题，耐心讲了两遍。",
    templates: ["课堂表现好", "主动帮助同学", "进步明显", "坚持完成任务"],
  },
  conflict: {
    label: "冲突",
    icon: "i-alert",
    short: "争执、打闹、需要跟进",
    hint: "争执 · 打闹",
    placeholder: "例如：课间因篮球场地发生争执，已及时分开并分别沟通。",
    templates: ["言语争执", "肢体冲突", "课间打闹", "情绪失控"],
  },
  activity: {
    label: "活动",
    icon: "i-flag",
    short: "比赛、值日、集体活动",
    hint: "比赛 · 值日",
    placeholder: "例如：参与校运会海报设计，负责主视觉和颜色搭配。",
    templates: ["校级活动", "班级活动", "值日服务", "比赛展示"],
  },
  other: {
    label: "其他",
    icon: "i-note",
    short: "家校沟通、日常观察",
    hint: "沟通 · 观察",
    placeholder: "例如：课后来办公室聊了近期的学习状态，情绪比上周放松。",
    templates: ["家校沟通", "学习状态", "情绪状态", "安全提醒"],
  },
};

const LEAVE_TYPES = {
  sick: "病假",
  personal: "事假",
  other: "其他",
};

const LEAVE_DURATIONS = {
  half: "半天",
  day: "1天",
  multi: "多日",
};

const DEMO_NAMES = [
  "张晨",
  "李雨桐",
  "王子轩",
  "陈思远",
  "刘语嫣",
  "赵一诺",
  "孙浩然",
  "周若溪",
  "吴宇航",
  "郑可欣",
  "何明宇",
  "林诗涵",
  "高子墨",
  "唐可馨",
  "徐嘉泽",
  "曹依晨",
  "马欣妍",
  "朱嘉禾",
  "胡梓萱",
  "郭子涵",
  "罗一鸣",
  "梁诗晴",
  "宋泽宇",
  "谢安琪",
  "韩沐阳",
  "冯晨希",
  "邓皓轩",
  "许静怡",
  "蒋亦辰",
  "沈知夏",
];

let state = defaultState();
let sheetHideTimer = 0;
let lastFocusedElement = null;
let deferredInstallPrompt = null;

const app = {
  view: "home",
  recordFilter: "all",
  recordQuery: "",
  studentQuery: "",
  editor: null,
  editorStudentId: null,
};

const dom = {
  main: document.getElementById("main-content"),
  onboarding: document.getElementById("onboarding"),
  setupForm: document.getElementById("setup-form"),
  sheet: document.getElementById("sheet"),
  sheetTitle: document.getElementById("sheet-title"),
  sheetKicker: document.getElementById("sheet-kicker"),
  sheetBody: document.getElementById("sheet-body"),
  sheetFooter: document.getElementById("sheet-footer"),
  sheetBackdrop: document.getElementById("sheet-backdrop"),
  toastRegion: document.getElementById("toast-region"),
  importFile: document.getElementById("import-file"),
};

function defaultState() {
  return {
    version: 1,
    settings: {
      teacherName: "",
      className: "",
      schoolName: "",
      setupComplete: false,
      isDemo: false,
    },
    students: [],
    records: [],
  };
}

function uid(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function icon(name, className = "") {
  return `<svg${className ? ` class="${className}"` : ""} aria-hidden="true"><use href="#${name}"></use></svg>`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function toDatetimeLocal(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  const dateText = new Intl.DateTimeFormat("zh-CN", {
    ...(includeYear ? { year: "numeric" } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
  return `${dateText} ${formatTime(timestamp)}`;
}

function formatDateHeading(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  const todayKey = localDateKey(new Date());
  const yesterdayKey = localDateKey(addDays(new Date(), -1));
  const base = new Intl.DateTimeFormat("zh-CN", {
    ...(includeYear ? { year: "numeric" } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
  if (dateKey === todayKey) return `今天 · ${base}`;
  if (dateKey === yesterdayKey) return `昨天 · ${base}`;
  return base;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function getWeekDays() {
  const today = startOfDay();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(today, mondayOffset);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function normalizeStudent(student, index) {
  return {
    id: student.id || uid("stu"),
    name: String(student.name || `学生${index + 1}`).trim(),
    group: String(student.group || "").trim(),
    guardianName: String(student.guardianName || "").trim(),
    guardianPhone: String(student.guardianPhone || "").trim(),
    remark: String(student.remark || "").trim(),
    createdAt: Number(student.createdAt) || Date.now(),
  };
}

function normalizeRecord(record, index) {
  const kind = KINDS[record.kind] ? record.kind : "other";
  const parsedTimestamp =
    Number(record.occurredAt) ||
    Date.parse(record.occurredAt || "") ||
    Number(record.createdAt) ||
    Date.now();
  const note = String(record.note || record.title || "").trim();
  return {
    id: record.id || uid("rec"),
    kind,
    studentIds: Array.isArray(record.studentIds)
      ? [...new Set(record.studentIds.map(String))]
      : [],
    studentNames: Array.isArray(record.studentNames)
      ? [...new Set(record.studentNames.map((name) => String(name).trim()).filter(Boolean))]
      : [],
    note,
    occurredAt: parsedTimestamp,
    createdAt: Number(record.createdAt) || Date.now() + index,
    updatedAt: Number(record.updatedAt) || Number(record.createdAt) || Date.now(),
    followUp: Boolean(record.followUp),
    followUpDone: Boolean(record.followUpDone),
    parentNotified: Boolean(record.parentNotified),
    attention: Boolean(record.attention),
    leaveType: LEAVE_TYPES[record.leaveType] ? record.leaveType : "",
    leaveDuration: LEAVE_DURATIONS[record.leaveDuration] ? record.leaveDuration : "",
  };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return defaultState();
  const students = Array.isArray(raw.students)
    ? raw.students.filter((item) => item && typeof item === "object").map(normalizeStudent)
    : [];
  const records = Array.isArray(raw.records)
    ? raw.records.filter((item) => item && typeof item === "object").map(normalizeRecord)
    : [];
  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  return {
    version: 1,
    settings: {
      teacherName: String(settings.teacherName || "").trim(),
      className: String(settings.className || "").trim(),
      schoolName: String(settings.schoolName || "").trim(),
      setupComplete: Boolean(settings.setupComplete),
      isDemo: Boolean(settings.isDemo),
    },
    students,
    records,
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn("无法读取本地数据", error);
    return null;
  }
}

function persist({ quiet = false } = {}) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("保存失败", error);
    if (!quiet) {
      showToast("保存失败，请检查手机存储空间，并及时导出备份。", "error", 4500);
    }
    return false;
  }
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      await navigator.storage.persist();
    }
  } catch (error) {
    console.warn("无法申请持久化存储", error);
  }
}

function sortedRecords(records = state.records) {
  return [...records].sort((a, b) => {
    if (b.occurredAt !== a.occurredAt) return b.occurredAt - a.occurredAt;
    return b.createdAt - a.createdAt;
  });
}

function getStudent(studentId) {
  return state.students.find((student) => student.id === studentId);
}

function getRecordNames(record) {
  const currentNames = (record.studentIds || [])
    .map((id) => getStudent(id)?.name)
    .filter(Boolean);
  const names = currentNames.length ? currentNames : record.studentNames || [];
  return names.length ? names.join("、") : "全班";
}

function getRecordNote(record) {
  if (record.note) return record.note;
  if (record.kind === "leave") {
    return [
      LEAVE_TYPES[record.leaveType] || "请假",
      LEAVE_DURATIONS[record.leaveDuration] || "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return KINDS[record.kind].label;
}

function isToday(timestamp) {
  return localDateKey(new Date(timestamp)) === localDateKey(new Date());
}

function pendingFollowups() {
  return sortedRecords(state.records.filter((record) => record.followUp && !record.followUpDone));
}

function recordMatchesQuery(record, query) {
  if (!query) return true;
  const search = query.trim().toLowerCase();
  if (!search) return true;
  return [
    getRecordNames(record),
    getRecordNote(record),
    KINDS[record.kind].label,
    record.studentNames.join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function studentRecordCount(studentId) {
  return state.records.filter((record) => record.studentIds.includes(studentId)).length;
}

function getRecordById(recordId) {
  return state.records.find((record) => record.id === recordId);
}

function toastIcon(type) {
  return type === "error" ? icon("i-alert") : icon("i-check");
}

function showToast(message, type = "success", duration = 2600) {
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " is-error" : ""}`;
  toast.innerHTML = `${toastIcon(type)}<span>${escapeHTML(message)}</span>`;
  dom.toastRegion.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    window.setTimeout(() => toast.remove(), 220);
  }, duration);
}

function render() {
  renderNavigation();
  if (!state.settings.setupComplete) {
    dom.onboarding.hidden = false;
    document.body.classList.add("onboarding-open");
    return;
  }

  dom.onboarding.hidden = true;
  document.body.classList.remove("onboarding-open");
  if (app.view === "records") renderRecords();
  else if (app.view === "students") renderStudents();
  else if (app.view === "settings") renderSettings();
  else renderHome();
}

function renderNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === app.view;
    button.classList.toggle("is-active", active);
    if (button.classList.contains("nav-btn") || button.classList.contains("mobile-nav-btn")) {
      button.setAttribute("aria-current", active ? "page" : "false");
    }
  });
}

function navigate(view) {
  closeSheet({ immediate: true });
  app.view = view;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function teacherName() {
  return state.settings.teacherName || "老师";
}

function pageHeader(kicker, title, subtitle = "", action = "") {
  const initial = teacherName().slice(0, 1);
  return `
    <header class="page-head">
      <div>
        <p class="eyebrow">${escapeHTML(kicker)}</p>
        <h1 class="page-title">${escapeHTML(title)}</h1>
        ${subtitle ? `<p class="page-subtitle">${escapeHTML(subtitle)}</p>` : ""}
      </div>
      <div class="page-head-actions">
        ${action}
        <button class="teacher-chip" data-view="settings" aria-label="打开设置">
          <span class="avatar tone-3">${escapeHTML(initial)}</span>
          <span>${escapeHTML(teacherName())}</span>
        </button>
      </div>
    </header>
  `;
}

function recordItemHTML(record, { showDate = false } = {}) {
  const pending = record.followUp && !record.followUpDone;
  const time = formatTime(record.occurredAt);
  const date = formatDateTime(record.occurredAt);
  return `
    <button class="record-item" data-action="open-record" data-record-id="${escapeHTML(record.id)}">
      <span class="record-icon" data-kind="${record.kind}">${icon(KINDS[record.kind].icon)}</span>
      <span class="record-body">
        <span class="record-line">
          <span class="record-names">${escapeHTML(getRecordNames(record))}</span>
          <span class="record-kind">${KINDS[record.kind].label}</span>
        </span>
        <span class="record-note">${escapeHTML(getRecordNote(record))}</span>
      </span>
      <span class="record-side">
        <span>${showDate ? escapeHTML(date) : time}</span>
        ${record.followUp ? `<span class="status-dot${record.followUpDone ? " done" : ""}">${record.followUpDone ? "已跟进" : "待跟进"}</span>` : ""}
      </span>
    </button>
  `;
}

function emptyStateHTML(title, text, actionLabel = "", action = "") {
  return `
    <div class="empty-state">
      <div class="empty-mark">${icon("i-menu-book")}</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(text)}</p>
      ${actionLabel && action ? `<button class="text-link" data-action="${action}">${escapeHTML(actionLabel)}${icon("i-chevron")}</button>` : ""}
    </div>
  `;
}

function renderHome() {
  const now = new Date();
  const todayRecords = sortedRecords(state.records.filter((record) => isToday(record.occurredAt)));
  const leaveStudentIds = new Set();
  todayRecords
    .filter((record) => record.kind === "leave")
    .forEach((record) => {
      if (record.studentIds.length) {
        record.studentIds.forEach((id) => leaveStudentIds.add(id));
      } else {
        leaveStudentIds.add("class");
      }
    });
  const pending = pendingFollowups();
  const recent = sortedRecords(state.records).slice(0, 5);
  const weekDays = getWeekDays();
  const weekCounts = weekDays.map(
    (date) =>
      state.records.filter(
        (record) => localDateKey(record.occurredAt) === localDateKey(date),
      ).length,
  );
  const maxWeekCount = Math.max(1, ...weekCounts);
  const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const monthCount = state.records.filter((record) =>
    localDateKey(record.occurredAt).startsWith(monthKey),
  ).length;
  const quickOrder = ["leave", "praise", "conflict", "activity", "other"];
  const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];
  const todayIndex = weekDays.findIndex((date) => localDateKey(date) === localDateKey(now));

  dom.main.innerHTML = `
    <div class="view">
      ${pageHeader(
        `${state.settings.className} · 班级手账`,
        `${getGreeting()}，${teacherName()}`,
        new Intl.DateTimeFormat("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        }).format(now),
      )}

      <section class="hero-card" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="hero-kicker">DAILY CLASS LOG · ${String(now.getFullYear())}</p>
          <h2 id="hero-title" class="hero-title">随时记下，<br />才算真的记得。</h2>
          <p class="hero-text">课间一分钟，留下一条清楚的线索。记录会自动保存在本机，不需要网络。</p>
          <button class="hero-cta" data-action="open-add">
            ${icon("i-plus")} 记下此刻
          </button>
        </div>
        <div class="hero-date" aria-label="${now.getMonth() + 1}月${now.getDate()}日">
          <span class="date-large">${pad(now.getDate())}</span>
          <span class="date-month">${now.getMonth() + 1}月 / ${now.getFullYear()}</span>
          <span class="date-week">${new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now)}</span>
        </div>
      </section>

      ${
        state.settings.isDemo
          ? `
            <div class="demo-banner">
              <span>当前是示例数据，可放心点按体验。</span>
              <button data-action="clear-demo">换成我的班级</button>
            </div>
          `
          : ""
      }

      <section class="section-block" aria-labelledby="quick-title">
        <div class="section-head">
          <div>
            <h2 id="quick-title" class="section-title">快速记一笔</h2>
            <p class="section-caption">先选类型，学生和详情都可以稍后补</p>
          </div>
          <button class="text-link" data-view="records">全部记录${icon("i-chevron")}</button>
        </div>
        <div class="quick-grid">
          ${quickOrder
            .map(
              (kind) => `
                <button class="quick-action" data-action="open-add-kind" data-kind="${kind}">
                  <span class="quick-icon">${icon(KINDS[kind].icon)}</span>
                  <span class="quick-name">${KINDS[kind].label}</span>
                  <span class="quick-hint">${KINDS[kind].hint}</span>
                </button>
              `,
            )
            .join("")}
        </div>
        <div class="stats-row">
          <article class="stat-card">
            <strong class="stat-number">${leaveStudentIds.size}<small>人</small></strong>
            <span class="stat-label">今日请假</span>
          </article>
          <article class="stat-card">
            <strong class="stat-number">${todayRecords.length}<small>条</small></strong>
            <span class="stat-label">今日记录</span>
          </article>
          <article class="stat-card">
            <strong class="stat-number">${pending.length}<small>项</small></strong>
            <span class="stat-label">待跟进</span>
          </article>
        </div>
      </section>

      <div class="dashboard-grid">
        <section class="panel" aria-labelledby="recent-title">
          <div class="panel-head">
            <div>
              <h2 id="recent-title" class="panel-title">最近记录</h2>
              <p class="panel-meta">按发生时间倒序显示</p>
            </div>
            <button class="text-link" data-view="records">查看全部${icon("i-chevron")}</button>
          </div>
          ${
            recent.length
              ? `<div class="record-list">${recent
                  .map((record) => recordItemHTML(record, { showDate: !isToday(record.occurredAt) }))
                  .join("")}</div>`
              : emptyStateHTML(
                  "今天还没有记录",
                  "从一条请假、一次表扬或一件小事开始。",
                  "现在记一笔",
                  "open-add",
                )
          }
        </section>

        <div class="home-side">
          <section class="panel" aria-labelledby="follow-title">
            <div class="panel-head">
              <div>
                <h2 id="follow-title" class="panel-title">待跟进</h2>
                <p class="panel-meta">还没有处理完的事项</p>
              </div>
              <span class="status-dot${pending.length ? "" : " done"}">${pending.length ? `${pending.length} 项` : "已清空"}</span>
            </div>
            ${
              pending.length
                ? `
                  <div class="follow-list">
                    ${pending
                      .slice(0, 3)
                      .map(
                        (record) => `
                          <div class="follow-card">
                            <button class="follow-check" data-action="complete-followup" data-record-id="${escapeHTML(record.id)}" aria-label="标记已跟进">
                              ${icon("i-check")}
                            </button>
                            <button class="follow-open" data-action="open-record" data-record-id="${escapeHTML(record.id)}">
                              <span class="follow-name">${escapeHTML(getRecordNames(record))}</span>
                              <span class="follow-note">${escapeHTML(getRecordNote(record))}</span>
                            </button>
                          </div>
                        `,
                      )
                      .join("")}
                  </div>
                `
                : `<div class="empty-state" style="min-height: 120px; padding: 15px 8px;">
                    <div class="empty-mark" style="width: 40px; height: 40px; margin-bottom: 7px;">${icon("i-check")}</div>
                    <h3>暂时没有待办</h3>
                    <p>需要后续处理的事项会集中在这里。</p>
                  </div>`
            }
          </section>

          <section class="panel" aria-labelledby="week-title" style="margin-top: 14px;">
            <div class="panel-head">
              <div>
                <h2 id="week-title" class="panel-title">本周记录</h2>
                <p class="panel-meta">周一到周日</p>
              </div>
            </div>
            <div class="week-chart">
              ${weekDays
                .map(
                  (date, index) => `
                    <div class="week-col${index === todayIndex ? " today" : ""}">
                      <span class="week-count">${weekCounts[index]}</span>
                      <div class="week-bar-wrap">
                        <div class="week-bar" style="height: ${Math.max(4, (weekCounts[index] / maxWeekCount) * 100)}%"></div>
                      </div>
                      <span class="week-label">${weekLabels[index]}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
            <div class="month-summary">
              <span>本月已记录</span>
              <span><strong>${monthCount}</strong> 条</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function filteredRecords() {
  return sortedRecords(
    state.records.filter((record) => {
      const kindMatches = app.recordFilter === "all" || record.kind === app.recordFilter;
      return kindMatches && recordMatchesQuery(record, app.recordQuery);
    }),
  );
}

function recordsResultsHTML() {
  const records = filteredRecords();
  if (!records.length) {
    const hasFilters = app.recordFilter !== "all" || app.recordQuery.trim();
    return emptyStateHTML(
      hasFilters ? "没有找到相关记录" : "还没有班级记录",
      hasFilters ? "换个关键词或筛选条件试试。" : "记下第一条，之后查找和回看都会在这里。",
      hasFilters ? "" : "现在记一笔",
      hasFilters ? "" : "open-add",
    );
  }

  const groups = new Map();
  records.forEach((record) => {
    const key = localDateKey(record.occurredAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return `
    <div class="timeline">
      ${[...groups.entries()]
        .map(
          ([dateKey, group]) => `
            <section class="timeline-group">
              <h2 class="timeline-date">${escapeHTML(formatDateHeading(dateKey))} <span>${group.length} 条</span></h2>
              <div class="record-list">
                ${group.map((record) => recordItemHTML(record)).join("")}
              </div>
            </section>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderRecordResults() {
  const container = document.getElementById("record-results");
  const summary = document.getElementById("records-summary");
  if (!container) return;
  const count = filteredRecords().length;
  container.innerHTML = recordsResultsHTML();
  if (summary) {
    summary.innerHTML = `<span>共找到 <strong>${count}</strong> 条记录</span><span>${app.recordQuery ? `搜索：${escapeHTML(app.recordQuery)}` : "按时间倒序"}</span>`;
  }
}

function renderRecords() {
  const filterOptions = [
    ["all", "全部"],
    ["leave", "请假"],
    ["praise", "表扬"],
    ["conflict", "冲突"],
    ["activity", "活动"],
    ["other", "其他"],
  ];
  dom.main.innerHTML = `
    <div class="view">
      ${pageHeader(
        "ALL ENTRIES",
        "班级记录",
        "所有细小的变化，都值得被看见。",
        `<button class="icon-btn" data-action="open-add" aria-label="新增记录">${icon("i-plus")}</button>`,
      )}
      <div class="view-toolbar">
        <label class="search-box" aria-label="搜索记录">
          ${icon("i-search")}
          <input id="records-search" type="search" value="${escapeHTML(app.recordQuery)}" placeholder="搜索学生、事项或关键词" autocomplete="off" />
          ${app.recordQuery ? `<button class="search-clear" type="button" data-action="clear-record-search" aria-label="清空搜索">${icon("i-close")}</button>` : ""}
        </label>
        <div class="filter-chips" aria-label="按类型筛选">
          ${filterOptions
            .map(
              ([value, label]) => `
                <button class="filter-chip${app.recordFilter === value ? " is-active" : ""}" data-action="filter-records" data-filter="${value}">
                  ${label}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <div id="records-summary" class="records-summary">
        <span>共找到 <strong>${filteredRecords().length}</strong> 条记录</span>
        <span>${app.recordQuery ? `搜索：${escapeHTML(app.recordQuery)}` : "按时间倒序"}</span>
      </div>
      <div id="record-results">${recordsResultsHTML()}</div>
    </div>
  `;
}

function filteredStudents() {
  const search = app.studentQuery.trim().toLowerCase();
  if (!search) return state.students;
  return state.students.filter((student) =>
    [student.name, student.group, student.guardianName, student.remark]
      .join(" ")
      .toLowerCase()
      .includes(search),
  );
}

function studentCardHTML(student, index) {
  const count = studentRecordCount(student.id);
  const lastRecord = sortedRecords(
    state.records.filter((record) => record.studentIds.includes(student.id)),
  )[0];
  const colorIndex = index % 5;
  return `
    <button class="student-card" data-action="open-student" data-student-id="${escapeHTML(student.id)}">
      <span class="avatar tone-${colorIndex}">${escapeHTML(student.name.slice(0, 1))}</span>
      <span class="student-main">
        <span class="student-name">${escapeHTML(student.name)}</span>
        <span class="student-meta">
          <span>${student.group ? escapeHTML(student.group) : `学号 ${String(index + 1).padStart(2, "0")}`}</span>
          ${lastRecord ? `<span class="dot"></span><span>${escapeHTML(KINDS[lastRecord.kind].label)} · ${escapeHTML(formatDateTime(lastRecord.occurredAt))}</span>` : `<span class="dot"></span><span>暂无记录</span>`}
        </span>
      </span>
      <span class="student-count"><strong>${count}</strong><span>条记录</span></span>
    </button>
  `;
}

function studentResultsHTML() {
  const students = filteredStudents();
  if (!state.students.length) {
    return emptyStateHTML(
      "先建立学生名单",
      "可以逐个添加，也可以把名单一次性粘贴进来。",
      "批量导入名单",
      "open-roster-import",
    );
  }
  if (!students.length) {
    return emptyStateHTML("没有找到学生", "换个姓名、组别或备注关键词试试。");
  }
  return `<div class="students-grid">${students
    .map((student) => studentCardHTML(student, state.students.indexOf(student)))
    .join("")}</div>`;
}

function renderStudentResults() {
  const container = document.getElementById("student-results");
  const summary = document.getElementById("students-summary");
  if (!container) return;
  const count = filteredStudents().length;
  container.innerHTML = studentResultsHTML();
  if (summary) {
    summary.innerHTML = app.studentQuery
      ? `找到 <strong>${count}</strong> 名学生`
      : `全班 <strong>${state.students.length}</strong> 人`;
  }
}

function renderStudents() {
  dom.main.innerHTML = `
    <div class="view">
      ${pageHeader(
        "STUDENT ROSTER",
        "学生档案",
        `${state.settings.className} · 全班 ${state.students.length} 人`,
      )}
      <div class="students-toolbar">
        <label class="search-box" aria-label="搜索学生">
          ${icon("i-search")}
          <input id="student-search" type="search" value="${escapeHTML(app.studentQuery)}" placeholder="搜索姓名、组别或备注" autocomplete="off" />
          ${app.studentQuery ? `<button class="search-clear" type="button" data-action="clear-student-search" aria-label="清空搜索">${icon("i-close")}</button>` : ""}
        </label>
        <div class="toolbar-actions">
          <button class="secondary-btn" data-action="open-roster-import">${icon("i-upload")} 批量导入</button>
          <button class="primary-btn" data-action="open-add-student">${icon("i-plus")} 添加学生</button>
        </div>
      </div>
      <div id="students-summary" class="records-summary">
        <span>${app.studentQuery ? `找到 <strong>${filteredStudents().length}</strong> 名学生` : `全班 <strong>${state.students.length}</strong> 人`}</span>
        <span>点击查看个人档案</span>
      </div>
      <div id="student-results">${studentResultsHTML()}</div>
    </div>
  `;
}

function renderSettings() {
  const pendingCount = pendingFollowups().length;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  dom.main.innerHTML = `
    <div class="view">
      ${pageHeader("SETTINGS & BACKUP", "设置与备份", "数据只在当前设备，请定期留一份备份。")}
      <div class="settings-grid">
        <section class="settings-card">
          <div class="settings-card-head">
            <div>
              <h2>班级信息</h2>
              <p>会显示在首页和导出的记录中</p>
            </div>
            <span class="settings-icon">${icon("i-menu-book")}</span>
          </div>
          <form id="settings-identity-form" class="form-grid settings-form">
            <label class="field">
              <span>班级名称 <b>*</b></span>
              <input name="className" type="text" maxlength="30" value="${escapeHTML(state.settings.className)}" required />
            </label>
            <label class="field">
              <span>你的称呼</span>
              <input name="teacherName" type="text" maxlength="20" value="${escapeHTML(state.settings.teacherName)}" placeholder="例如：吴老师" />
            </label>
            <label class="field">
              <span>学校名称 <small>可选</small></span>
              <input name="schoolName" type="text" maxlength="40" value="${escapeHTML(state.settings.schoolName)}" placeholder="例如：育才中学" />
            </label>
            <div></div>
            <button class="primary-btn" type="submit">保存班级信息</button>
          </form>
        </section>

        <section class="settings-card">
          <div class="settings-card-head">
            <div>
              <h2>数据概览</h2>
              <p>当前设备里的内容</p>
            </div>
            <span class="settings-icon">${icon("i-shield")}</span>
          </div>
          <div class="data-overview">
            <div><strong>${state.students.length}</strong><span>学生</span></div>
            <div><strong>${state.records.length}</strong><span>记录</span></div>
            <div><strong>${pendingCount}</strong><span>待跟进</span></div>
          </div>
          <div class="action-list">
            <button class="action-row" data-action="export-json">
              ${icon("i-download")}
              <span class="action-copy"><strong>导出完整备份</strong><span>JSON 文件，可恢复全部数据</span></span>
              ${icon("i-chevron", "chevron")}
            </button>
            <button class="action-row" data-action="export-csv">
              ${icon("i-download")}
              <span class="action-copy"><strong>导出 Excel 表格</strong><span>CSV 文件，便于电脑查看和整理</span></span>
              ${icon("i-chevron", "chevron")}
            </button>
            <button class="action-row" data-action="import-json">
              ${icon("i-upload")}
              <span class="action-copy"><strong>从备份恢复</strong><span>会覆盖当前设备中的班级数据</span></span>
              ${icon("i-chevron", "chevron")}
            </button>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card-head">
            <div>
              <h2>安装与安全</h2>
              <p>像普通 App 一样使用</p>
            </div>
            <span class="settings-icon">${icon("i-phone")}</span>
          </div>
          ${
            isStandalone
              ? `<div class="privacy-box">${icon("i-check")}<div><strong>已作为独立应用运行</strong><p>之后打开桌面图标即可使用，断网也能记录。</p></div></div>`
              : `
                <div class="install-banner">
                  ${icon("i-phone")}
                  <div>
                    <strong>添加到手机桌面</strong>
                    <p>安装后全屏使用，首次打开后可离线记录。</p>
                  </div>
                  <button data-action="install-app">安装</button>
                </div>
              `
          }
          <div class="privacy-box" style="margin-top: 10px;">
            ${icon("i-shield")}
            <div>
              <strong>本地优先，不上传云端</strong>
              <p>学生信息只存储在这台设备。清除浏览器数据、卸载应用或更换手机前，请先导出备份。</p>
            </div>
          </div>
          <div class="action-list" style="margin-top: 10px;">
            <button class="action-row" data-action="open-install-help">
              ${icon("i-phone")}
              <span class="action-copy"><strong>查看安装说明</strong><span>iPhone 与 Android 添加桌面步骤</span></span>
              ${icon("i-chevron", "chevron")}
            </button>
            <button class="action-row" data-action="clear-all-data">
              ${icon("i-trash")}
              <span class="action-copy"><strong class="danger">清空全部数据</strong><span>会删除学生与记录，建议先导出备份</span></span>
              ${icon("i-chevron", "chevron")}
            </button>
          </div>
        </section>
      </div>
      <p class="about-line">班级随手记 v${APP_VERSION} · 无账号 · 无服务器 · 无广告</p>
    </div>
  `;
}

function openSheet({ title, kicker = "", body, visibleBack = false }) {
  window.clearTimeout(sheetHideTimer);
  if (dom.sheet.hidden) lastFocusedElement = document.activeElement;
  dom.sheetTitle.textContent = title;
  dom.sheetKicker.textContent = kicker;
  dom.sheetBody.innerHTML = body;
  dom.sheetFooter.innerHTML = "";
  dom.sheetFooter.hidden = true;
  dom.sheetBackdrop.hidden = false;
  dom.sheet.hidden = false;
  document.querySelector(".sheet-back").style.visibility = visibleBack ? "visible" : "hidden";
  document.body.classList.add("sheet-open");
  requestAnimationFrame(() => {
    dom.sheetBackdrop.classList.add("is-visible");
    dom.sheet.classList.add("is-visible");
    dom.sheet.focus({ preventScroll: true });
  });
}

function closeSheet({ immediate = false } = {}) {
  if (dom.sheet.hidden) return;
  window.clearTimeout(sheetHideTimer);
  dom.sheet.classList.remove("is-visible");
  dom.sheetBackdrop.classList.remove("is-visible");
  document.body.classList.remove("sheet-open");
  const finish = () => {
    dom.sheet.hidden = true;
    dom.sheetBackdrop.hidden = true;
    dom.sheetBody.innerHTML = "";
    dom.sheetFooter.innerHTML = "";
    dom.sheetFooter.hidden = true;
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus({ preventScroll: true });
    }
  };
  if (immediate) finish();
  else sheetHideTimer = window.setTimeout(finish, 330);
}

function openKindChooser(studentId = null) {
  app.editorStudentId = studentId;
  const student = studentId ? getStudent(studentId) : null;
  const options = ["leave", "praise", "conflict", "activity", "other"];
  openSheet({
    title: student ? `给 ${student.name} 记一笔` : "记一笔",
    kicker: "QUICK NOTE",
    body: `
      <p class="import-help">先选一种类型。${student ? `${escapeHTML(student.name)}会自动加入这条记录。` : "学生可以多选，也可以记录为全班。"}</p>
      <div class="kind-chooser-grid">
        ${options
          .map(
            (kind) => `
              <button class="quick-action" data-action="start-kind" data-kind="${kind}">
                <span class="quick-icon">${icon(KINDS[kind].icon)}</span>
                <span class="quick-name">${KINDS[kind].label}</span>
                <span class="quick-hint">${KINDS[kind].short}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    `,
  });
}

function openRecordEditor(kind, record = null, initialStudentId = null) {
  const validKind = KINDS[kind] ? kind : "other";
  const studentIds = new Set(
    record?.studentIds?.length
      ? record.studentIds.filter((id) => getStudent(id))
      : initialStudentId && getStudent(initialStudentId)
        ? [initialStudentId]
        : [],
  );
  app.editor = {
    mode: record ? "edit" : "create",
    recordId: record?.id || null,
    kind: record?.kind || validKind,
    studentIds,
    draft: {
      note: record?.note || "",
      occurredAt: record?.occurredAt || Date.now(),
      followUp: record ? record.followUp : validKind === "conflict",
      followUpDone: record?.followUpDone || false,
      parentNotified: record?.parentNotified || false,
      attention: record?.attention || false,
      leaveType: record?.leaveType || (validKind === "leave" ? "sick" : ""),
      leaveDuration: record?.leaveDuration || (validKind === "leave" ? "day" : ""),
    },
  };
  openSheet({
    title: record ? "编辑记录" : `记一笔 · ${KINDS[app.editor.kind].label}`,
    kicker: record ? "EDIT ENTRY" : "QUICK NOTE",
    body: "",
  });
  renderEditor();
}

function editorTitle() {
  return app.editor?.mode === "edit"
    ? "编辑记录"
    : `记一笔 · ${KINDS[app.editor.kind].label}`;
}

function selectedStudentChipsHTML() {
  if (!app.editor.studentIds.size) {
    return `<span class="selected-placeholder">全班 / 未指定学生</span>`;
  }
  return [...app.editor.studentIds]
    .map((id) => getStudent(id))
    .filter(Boolean)
    .map(
      (student) => `
        <button type="button" class="selected-chip" data-action="remove-editor-student" data-student-id="${escapeHTML(student.id)}">
          ${escapeHTML(student.name)} ${icon("i-close")}
        </button>
      `,
    )
    .join("");
}

function studentOptionsHTML(query = "") {
  if (!state.students.length) {
    return `<div class="student-empty">还没有学生名单，可先记录到“全班”，或到学生页添加名单。</div>`;
  }
  const normalized = query.trim().toLowerCase();
  const students = state.students.filter((student) =>
    student.name.toLowerCase().includes(normalized),
  );
  if (!students.length) {
    return `<div class="student-empty">没有匹配的学生</div>`;
  }
  return students
    .map(
      (student) => `
        <button
          type="button"
          class="student-option${app.editor.studentIds.has(student.id) ? " is-selected" : ""}"
          data-action="toggle-editor-student"
          data-student-id="${escapeHTML(student.id)}"
          aria-pressed="${app.editor.studentIds.has(student.id)}"
        >${escapeHTML(student.name)}</button>
      `,
    )
    .join("");
}

function templatesHTML(kind) {
  return KINDS[kind].templates
    .map((template, index) => {
      const isLeave = kind === "leave";
      const leaveValue = ["sick", "personal", "other"][index] || "other";
      return `<button type="button" class="template-chip" data-action="${isLeave ? "set-leave-template" : "use-note-template"}" data-value="${escapeHTML(isLeave ? leaveValue : template)}">${escapeHTML(template)}</button>`;
    })
    .join("");
}

function renderEditor() {
  if (!app.editor) return;
  const { kind, draft } = app.editor;
  dom.sheetTitle.textContent = editorTitle();
  dom.sheetKicker.textContent = app.editor.mode === "edit" ? "EDIT ENTRY" : "QUICK NOTE";
  dom.sheetBody.innerHTML = `
    <form id="record-editor-form" class="editor-form" novalidate>
      <input type="hidden" name="kind" value="${kind}" />
      <div class="kind-picker" aria-label="记录类型">
        ${Object.entries(KINDS)
          .map(
            ([key, config]) => `
              <button type="button" class="kind-option${kind === key ? " is-active" : ""}" data-action="set-editor-kind" data-kind="${key}" aria-pressed="${kind === key}">
                ${icon(config.icon)}
                <span>${config.label}</span>
              </button>
            `,
          )
          .join("")}
      </div>

      <section class="editor-section">
        <div class="field-label">
          <span>涉及学生</span>
          <small>可多选，不选表示全班</small>
        </div>
        <div id="selected-students" class="selected-students">${selectedStudentChipsHTML()}</div>
        <div class="student-picker">
          <label class="student-picker-head">
            ${icon("i-search")}
            <input id="editor-student-search" type="search" placeholder="输入姓名快速查找" autocomplete="off" />
          </label>
          <button type="button" class="whole-class-option${app.editor.studentIds.size === 0 ? " is-selected" : ""}" data-action="select-whole-class">
            ${icon("i-users")} 全班 / 不指定学生
          </button>
          <div id="editor-student-options" class="student-options">
            ${studentOptionsHTML()}
          </div>
        </div>
      </section>

      <section class="editor-section">
        <label for="editor-note">
          ${kind === "leave" ? "补充说明" : "发生了什么"}
          ${kind === "leave" ? "<small>可不填</small>" : "<small>一句话即可</small>"}
        </label>
        <div class="template-row">${templatesHTML(kind)}</div>
        <textarea id="editor-note" class="editor-textarea" maxlength="300" placeholder="${escapeHTML(KINDS[kind].placeholder)}">${escapeHTML(draft.note)}</textarea>
        <div class="char-count"><span id="note-count">${draft.note.length}</span>/300</div>
      </section>

      ${
        kind === "leave"
          ? `
            <section class="editor-section form-two-col">
              <label class="mini-field">
                <span>请假类型</span>
                <select id="leave-type">
                  ${Object.entries(LEAVE_TYPES)
                    .map(
                      ([value, label]) =>
                        `<option value="${value}"${draft.leaveType === value ? " selected" : ""}>${label}</option>`,
                    )
                    .join("")}
                </select>
              </label>
              <label class="mini-field">
                <span>请假时长</span>
                <select id="leave-duration">
                  ${Object.entries(LEAVE_DURATIONS)
                    .map(
                      ([value, label]) =>
                        `<option value="${value}"${draft.leaveDuration === value ? " selected" : ""}>${label}</option>`,
                    )
                    .join("")}
                </select>
              </label>
            </section>
          `
          : ""
      }

      <section class="editor-section">
        <div class="toggle-list">
          <label class="toggle-row">
            <span class="toggle-copy">
              <strong>需要后续跟进</strong>
              <span>会进入首页“待跟进”清单</span>
            </span>
            <span class="toggle">
              <input id="follow-up" type="checkbox"${draft.followUp ? " checked" : ""} />
              <span class="toggle-track"></span>
            </span>
          </label>
          <label class="toggle-row">
            <span class="toggle-copy">
              <strong>已联系家长</strong>
              <span>仅做本地备注，不会自动发送消息</span>
            </span>
            <span class="toggle">
              <input id="parent-notified" type="checkbox"${draft.parentNotified ? " checked" : ""} />
              <span class="toggle-track"></span>
            </span>
          </label>
          ${
            kind === "conflict"
              ? `
                <label class="toggle-row">
                  <span class="toggle-copy">
                    <strong>标记为重点关注</strong>
                    <span>在记录详情中醒目标出</span>
                  </span>
                  <span class="toggle">
                    <input id="record-attention" type="checkbox"${draft.attention ? " checked" : ""} />
                    <span class="toggle-track"></span>
                  </span>
                </label>
              `
              : ""
          }
        </div>
      </section>

      <section class="editor-section">
        <label class="mini-field">
          <span>发生时间</span>
          <input id="record-occurred-at" type="datetime-local" value="${toDatetimeLocal(draft.occurredAt)}" required />
        </label>
      </section>

    </form>
  `;
  dom.sheetFooter.innerHTML = `
    <div class="editor-actions">
      <button class="primary-btn" type="button" data-action="save-editor">${app.editor.mode === "edit" ? "保存修改" : "保存记录"} ${icon("i-check")}</button>
      <button class="secondary-btn" type="button" data-action="sheet-close">取消</button>
    </div>
  `;
  dom.sheetFooter.hidden = false;
}

function readEditorDraft() {
  if (!document.getElementById("record-editor-form")) return app.editor.draft;
  return {
    note: document.getElementById("editor-note")?.value || "",
    occurredAt:
      new Date(document.getElementById("record-occurred-at")?.value || Date.now()).getTime() ||
      Date.now(),
    followUp: Boolean(document.getElementById("follow-up")?.checked),
    followUpDone: app.editor.draft.followUpDone || false,
    parentNotified: Boolean(document.getElementById("parent-notified")?.checked),
    attention: Boolean(document.getElementById("record-attention")?.checked),
    leaveType:
      document.getElementById("leave-type")?.value || app.editor.draft.leaveType || "",
    leaveDuration:
      document.getElementById("leave-duration")?.value ||
      app.editor.draft.leaveDuration ||
      "",
  };
}

function refreshEditorStudents() {
  const selected = document.getElementById("selected-students");
  const wholeClass = document.querySelector(".whole-class-option");
  if (selected) selected.innerHTML = selectedStudentChipsHTML();
  if (wholeClass) {
    wholeClass.classList.toggle("is-selected", app.editor.studentIds.size === 0);
  }
  document.querySelectorAll(".student-option").forEach((option) => {
    const isSelected = app.editor.studentIds.has(option.dataset.studentId);
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
}

function toggleEditorStudent(studentId) {
  if (!studentId || !getStudent(studentId)) return;
  if (app.editor.studentIds.has(studentId)) app.editor.studentIds.delete(studentId);
  else app.editor.studentIds.add(studentId);
  refreshEditorStudents();
}

function switchEditorKind(kind) {
  if (!KINDS[kind] || kind === app.editor.kind) return;
  app.editor.draft = readEditorDraft();
  app.editor.kind = kind;
  if (kind === "conflict" && app.editor.mode === "create") {
    app.editor.draft.followUp = true;
  }
  renderEditor();
}

function saveRecordFromEditor(form) {
  if (!app.editor) return;
  const draft = readEditorDraft();
  const kind = app.editor.kind;
  const note = draft.note.trim();
  if (["leave", "praise", "conflict"].includes(kind) && app.editor.studentIds.size === 0) {
    showToast("请至少选择一名学生，或改为记录“活动 / 其他”。", "error");
    document.getElementById("editor-student-search")?.focus();
    return;
  }
  if (kind !== "leave" && !note) {
    showToast("请用一句话写下发生了什么。", "error");
    document.getElementById("editor-note")?.focus();
    return;
  }
  if (!Number.isFinite(draft.occurredAt)) {
    showToast("请选择正确的发生时间。", "error");
    return;
  }

  const existing = app.editor.recordId ? getRecordById(app.editor.recordId) : null;
  const studentIds = [...app.editor.studentIds].filter((id) => getStudent(id));
  const studentNames = studentIds.map((id) => getStudent(id).name);
  const now = Date.now();
  const record = {
    id: existing?.id || uid("rec"),
    kind,
    studentIds,
    studentNames,
    note,
    occurredAt: draft.occurredAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    followUp: draft.followUp,
    followUpDone: draft.followUp ? Boolean(existing?.followUpDone) : false,
    parentNotified: draft.parentNotified,
    attention: kind === "conflict" ? draft.attention : false,
    leaveType: kind === "leave" ? draft.leaveType || "other" : "",
    leaveDuration: kind === "leave" ? draft.leaveDuration || "day" : "",
  };

  if (existing) {
    const index = state.records.findIndex((item) => item.id === existing.id);
    state.records[index] = record;
  } else {
    state.records.push(record);
  }

  if (!persist()) return;
  closeSheet();
  render();
  showToast(existing ? "记录已更新" : "已记下");
}

function completeFollowup(recordId) {
  const record = getRecordById(recordId);
  if (!record) return;
  record.followUpDone = !record.followUpDone;
  record.updatedAt = Date.now();
  persist();
  render();
  showToast(record.followUpDone ? "已标记为跟进完成" : "已重新放回待跟进");
}

function openRecordDetail(recordId) {
  const record = getRecordById(recordId);
  if (!record) return;
  const tags = [];
  if (record.kind === "leave") {
    if (record.leaveType) tags.push(LEAVE_TYPES[record.leaveType]);
    if (record.leaveDuration) tags.push(LEAVE_DURATIONS[record.leaveDuration]);
  }
  if (record.parentNotified) tags.push("已联系家长");
  if (record.attention) tags.push("重点关注");
  if (record.followUpDone) tags.push("跟进已完成");
  const pending = record.followUp && !record.followUpDone;

  openSheet({
    title: "记录详情",
    kicker: "ENTRY DETAIL",
    body: `
      <article class="detail-hero">
        <span class="detail-kind">${icon(KINDS[record.kind].icon)} ${KINDS[record.kind].label}</span>
        <h3 class="detail-title">${escapeHTML(getRecordNames(record))}</h3>
        <div class="detail-meta">
          <span>${escapeHTML(formatDateTime(record.occurredAt))}</span>
          ${record.studentIds.length ? `<span class="dot"></span><span>${record.studentIds.length} 名学生</span>` : `<span class="dot"></span><span>全班</span>`}
        </div>
      </article>
      <section class="detail-section">
        <h3>记录内容</h3>
        <p class="detail-note">${escapeHTML(getRecordNote(record))}</p>
      </section>
      ${
        tags.length
          ? `<section class="detail-section"><h3>标记</h3><div class="detail-tags">${tags.map((tag) => `<span class="detail-tag">${escapeHTML(tag)}</span>`).join("")}</div></section>`
          : ""
      }
      ${
        record.followUp
          ? `
            <div class="followup-box${record.followUpDone ? " done" : ""}">
              <div>
                <strong>${record.followUpDone ? "这件事已经跟进完成" : "这件事还需要继续跟进"}</strong>
                <span>${record.followUpDone ? "如果还有后续，可以再次标记为待跟进。" : "处理完后记得回来勾掉，避免遗漏。"}</span>
              </div>
              <button data-action="toggle-record-followup" data-record-id="${escapeHTML(record.id)}">
                ${record.followUpDone ? "重新打开" : "标记完成"}
              </button>
            </div>
          `
          : ""
      }
      <div class="detail-actions">
        <button class="primary-btn" data-action="edit-record" data-record-id="${escapeHTML(record.id)}">${icon("i-edit")} 编辑记录</button>
        <button class="secondary-btn delete-link" data-action="delete-record" data-record-id="${escapeHTML(record.id)}" aria-label="删除记录">${icon("i-trash")}</button>
      </div>
      <p class="privacy-note" style="justify-content: center; margin-top: 14px;">创建于 ${escapeHTML(formatDateTime(record.createdAt))}${record.updatedAt !== record.createdAt ? ` · 更新于 ${escapeHTML(formatDateTime(record.updatedAt))}` : ""}</p>
    `,
  });
}

function deleteRecord(recordId) {
  const record = getRecordById(recordId);
  if (!record) return;
  if (!window.confirm(`确定删除“${getRecordNames(record)} · ${KINDS[record.kind].label}”这条记录吗？删除后无法恢复。`)) {
    return;
  }
  state.records = state.records.filter((item) => item.id !== recordId);
  persist();
  closeSheet();
  render();
  showToast("记录已删除");
}

function toggleRecordFollowupFromDetail(recordId) {
  const record = getRecordById(recordId);
  if (!record) return;
  record.followUpDone = !record.followUpDone;
  record.updatedAt = Date.now();
  persist();
  render();
  openRecordDetail(recordId);
}

function openStudentProfile(studentId) {
  const student = getStudent(studentId);
  if (!student) return;
  const records = sortedRecords(
    state.records.filter((record) => record.studentIds.includes(student.id)),
  );
  const praiseCount = records.filter((record) => record.kind === "praise").length;
  const leaveCount = records.filter((record) => record.kind === "leave").length;
  const pendingCount = records.filter(
    (record) => record.followUp && !record.followUpDone,
  ).length;
  const safePhone = (student.guardianPhone || "").replace(/[^\d+]/g, "");
  const index = state.students.indexOf(student);
  openSheet({
    title: "学生档案",
    kicker: "STUDENT PROFILE",
    body: `
      <div class="student-profile-head">
        <span class="avatar">${escapeHTML(student.name.slice(0, 1))}</span>
        <div>
          <h3>${escapeHTML(student.name)}</h3>
          <p>${escapeHTML(student.group || `学号 ${String(index + 1).padStart(2, "0")}`)} · ${escapeHTML(state.settings.className)}</p>
        </div>
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><strong>${records.length}</strong><span>全部记录</span></div>
        <div class="profile-stat"><strong>${praiseCount}</strong><span>表扬</span></div>
        <div class="profile-stat"><strong>${pendingCount}</strong><span>待跟进</span></div>
      </div>
      ${
        student.guardianName || student.guardianPhone || student.remark
          ? `
            <section class="detail-section">
              <h3>档案备注</h3>
              <div class="detail-note">
                ${student.guardianName ? `家长：${escapeHTML(student.guardianName)}\n` : ""}
                ${student.guardianPhone ? `电话：${escapeHTML(student.guardianPhone)}\n` : ""}
                ${student.remark ? escapeHTML(student.remark) : ""}
              </div>
              ${
                safePhone
                  ? `<a class="secondary-btn" style="margin-top: 8px;" href="tel:${escapeHTML(safePhone)}">${icon("i-phone")} 拨打家长电话</a>`
                  : ""
              }
            </section>
          `
          : ""
      }
      <section class="detail-section">
        <h3>个人记录 · ${records.length} 条${leaveCount ? ` · 请假 ${leaveCount} 次` : ""}</h3>
        ${
          records.length
            ? `<div class="record-list profile-record-list">${records.map((record) => recordItemHTML(record, { showDate: true })).join("")}</div>`
            : `<div class="empty-state" style="min-height: 125px; padding: 15px;">
                <div class="empty-mark" style="width: 40px; height: 40px; margin-bottom: 7px;">${icon("i-menu-book")}</div>
                <h3>还没有个人记录</h3>
                <p>记录时选中这名学生，就会自动归入这里。</p>
              </div>`
        }
      </section>
      <div class="profile-tools">
        <button class="primary-btn" data-action="open-add-for-student" data-student-id="${escapeHTML(student.id)}" aria-label="给${escapeHTML(student.name)}记一笔">${icon("i-plus")} 记一笔</button>
        <button class="secondary-btn" data-action="edit-student" data-student-id="${escapeHTML(student.id)}">${icon("i-edit")} 编辑</button>
        <button class="secondary-btn" data-action="delete-student" data-student-id="${escapeHTML(student.id)}" aria-label="删除学生">${icon("i-trash")}</button>
      </div>
    `,
  });
}

function openStudentForm(studentId = null) {
  const student = studentId ? getStudent(studentId) : null;
  openSheet({
    title: student ? "编辑学生档案" : "添加学生",
    kicker: student ? "EDIT PROFILE" : "NEW STUDENT",
    body: `
      <form id="student-editor-form" class="add-student-form" data-student-id="${escapeHTML(student?.id || "")}" novalidate>
        <label class="field">
          <span>学生姓名 <b>*</b></span>
          <input name="name" type="text" maxlength="20" value="${escapeHTML(student?.name || "")}" placeholder="输入学生姓名" required autocomplete="off" />
        </label>
        <label class="field">
          <span>组别或座位 <small>可选</small></span>
          <input name="group" type="text" maxlength="30" value="${escapeHTML(student?.group || "")}" placeholder="例如：第三组 / 第 2 排" />
        </label>
        <div class="form-two-col">
          <label class="field">
            <span>家长称呼 <small>可选</small></span>
            <input name="guardianName" type="text" maxlength="30" value="${escapeHTML(student?.guardianName || "")}" placeholder="例如：张女士" />
          </label>
          <label class="field">
            <span>联系电话 <small>可选</small></span>
            <input name="guardianPhone" type="tel" maxlength="25" value="${escapeHTML(student?.guardianPhone || "")}" placeholder="家长电话" inputmode="tel" />
          </label>
        </div>
        <label class="field">
          <span>其他备注 <small>可选</small></span>
          <textarea name="remark" rows="3" maxlength="200" placeholder="例如：对粉尘过敏；开学初情绪波动较大。">${escapeHTML(student?.remark || "")}</textarea>
        </label>
        <button class="primary-btn" type="submit">${student ? "保存档案" : "添加学生"} ${icon("i-check")}</button>
        <p class="privacy-note" style="justify-content: center;">家长联系方式同样只保存在本机。</p>
      </form>
    `,
  });
}

function saveStudent(form) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  if (!name) {
    showToast("请填写学生姓名。", "error");
    form.elements.name.focus();
    return;
  }
  const studentId = form.dataset.studentId;
  const existing = studentId ? getStudent(studentId) : null;
  const duplicate = state.students.find(
    (student) => student.name === name && student.id !== studentId,
  );
  if (!existing && duplicate) {
    const proceed = window.confirm(`班里已经有“${name}”，仍要添加同名学生吗？`);
    if (!proceed) return;
  }
  const values = {
    name,
    group: String(formData.get("group") || "").trim(),
    guardianName: String(formData.get("guardianName") || "").trim(),
    guardianPhone: String(formData.get("guardianPhone") || "").trim(),
    remark: String(formData.get("remark") || "").trim(),
  };
  if (existing) {
    Object.assign(existing, values);
  } else {
    state.students.push({
      id: uid("stu"),
      ...values,
      createdAt: Date.now(),
    });
  }
  persist();
  closeSheet();
  render();
  showToast(existing ? "学生档案已更新" : "学生已添加");
}

function deleteStudent(studentId) {
  const student = getStudent(studentId);
  if (!student) return;
  const count = studentRecordCount(studentId);
  if (
    !window.confirm(
      `确定从名单中删除“${student.name}”吗？${count ? `\n已有的 ${count} 条历史记录会保留。` : ""}`,
    )
  ) {
    return;
  }
  state.students = state.students.filter((item) => item.id !== studentId);
  persist();
  closeSheet();
  render();
  showToast("学生已从名单中删除");
}

function parseRoster(text) {
  const names = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((line) => {
      let cleaned = line.trim();
      if (!cleaned) return;
      cleaned = cleaned.replace(/^\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})[.、．,:：\s]+/, "");
      cleaned
        .split(/[,，、;；\t]+/)
        .map((name) => name.replace(/\s+/g, "").trim())
        .filter((name) => name && name.length <= 20)
        .filter((name) => !["姓名", "学生姓名", "序号", "班级", "性别"].includes(name))
        .forEach((name) => names.push(name));
    });
  return names;
}

function addStudentsFromNames(names) {
  const existingNames = new Set(state.students.map((student) => student.name));
  const added = [];
  let skipped = 0;
  names.forEach((name) => {
    if (existingNames.has(name)) {
      skipped += 1;
      return;
    }
    existingNames.add(name);
    added.push({
      id: uid("stu"),
      name,
      group: "",
      guardianName: "",
      guardianPhone: "",
      remark: "",
      createdAt: Date.now() + added.length,
    });
  });
  state.students.push(...added);
  return { added: added.length, skipped };
}

function openRosterImport() {
  openSheet({
    title: "批量导入名单",
    kicker: "IMPORT ROSTER",
    body: `
      <p class="import-help">把学生名单直接粘贴进来，每行一个名字，也支持用逗号、顿号分隔。带序号也可以，例如“1. 张晨”。</p>
      <form id="roster-import-form" class="add-student-form">
        <label class="field">
          <span>学生名单</span>
          <textarea name="roster" rows="10" placeholder="张晨&#10;李雨桐&#10;王子轩"></textarea>
        </label>
        <button class="primary-btn" type="submit">${icon("i-upload")} 导入名单</button>
        <p class="privacy-note" style="justify-content: center;">同名学生会自动跳过。</p>
      </form>
    `,
  });
}

function handleSetup(event, form) {
  event.preventDefault();
  const formData = new FormData(form);
  const className = String(formData.get("className") || "").trim();
  if (!className) {
    form.elements.className.focus();
    return;
  }
  state.settings.className = className;
  state.settings.teacherName = String(formData.get("teacher") || "").trim();
  state.settings.setupComplete = true;
  state.settings.isDemo = false;
  const names = parseRoster(formData.get("roster"));
  addStudentsFromNames(names);
  persist();
  requestPersistentStorage();
  app.view = "home";
  render();
  showToast(`已准备好，${state.settings.className}`);
}

function createDemoRecord({
  kind,
  names = [],
  note = "",
  dayOffset = 0,
  hour = 9,
  minute = 0,
  followUp = false,
  followUpDone = false,
  parentNotified = false,
  attention = false,
  leaveType = "",
  leaveDuration = "",
}) {
  const date = startOfDay(addDays(new Date(), dayOffset));
  date.setHours(hour, minute, 0, 0);
  const students = names.map((name) => state.students.find((student) => student.name === name)).filter(Boolean);
  return {
    id: uid("rec"),
    kind,
    studentIds: students.map((student) => student.id),
    studentNames: students.map((student) => student.name),
    note,
    occurredAt: date.getTime(),
    createdAt: date.getTime(),
    updatedAt: date.getTime(),
    followUp,
    followUpDone,
    parentNotified,
    attention,
    leaveType,
    leaveDuration,
  };
}

function seedDemo({ persistDemo = true } = {}) {
  state = defaultState();
  state.settings = {
    className: "八年级（3）班",
    teacherName: "吴老师",
    schoolName: "育才中学",
    setupComplete: true,
    isDemo: true,
  };
  state.students = DEMO_NAMES.map((name, index) => ({
    id: uid("stu"),
    name,
    group: `第${Math.floor(index / 5) + 1}组`,
    guardianName: "",
    guardianPhone: "",
    remark: "",
    createdAt: Date.now() + index,
  }));

  state.records = [
    createDemoRecord({
      kind: "leave",
      names: ["王子轩"],
      note: "发烧请假一天，家长早上已发来请假信息。",
      hour: 7,
      minute: 52,
      parentNotified: true,
      leaveType: "sick",
      leaveDuration: "day",
    }),
    createDemoRecord({
      kind: "praise",
      names: ["李雨桐"],
      note: "数学课上主动给同桌讲题，耐心讲了两遍。",
      hour: 10,
      minute: 20,
    }),
    createDemoRecord({
      kind: "conflict",
      names: ["张晨", "陈思远"],
      note: "课间因为篮球场地发生争执，已及时分开并分别沟通，下午继续观察。",
      hour: 13,
      minute: 46,
      followUp: true,
      attention: true,
    }),
    createDemoRecord({
      kind: "activity",
      names: ["刘语嫣", "赵一诺", "周若溪"],
      note: "午休时间完成运动会班级海报，负责主视觉和颜色搭配。",
      hour: 12,
      minute: 38,
    }),
    createDemoRecord({
      kind: "other",
      names: ["郑可欣"],
      note: "课后来办公室聊了近期的学习状态，情绪比上周放松。",
      hour: 16,
      minute: 12,
      parentNotified: true,
    }),
    createDemoRecord({
      kind: "praise",
      names: ["孙浩然"],
      note: "主动留下来整理实验器材，没有提醒就做完了。",
      dayOffset: -1,
      hour: 17,
      minute: 8,
    }),
    createDemoRecord({
      kind: "leave",
      names: ["何明宇"],
      note: "下午家中有事，家长已书面请假。",
      dayOffset: -1,
      hour: 11,
      minute: 16,
      parentNotified: true,
      leaveType: "personal",
      leaveDuration: "half",
    }),
    createDemoRecord({
      kind: "conflict",
      names: ["吴宇航", "高子墨"],
      note: "体育课后发生口角，已沟通并互相道歉，双方情绪稳定。",
      dayOffset: -2,
      hour: 15,
      minute: 30,
      followUp: true,
      followUpDone: true,
      parentNotified: true,
    }),
    createDemoRecord({
      kind: "activity",
      note: "全班参加校园安全演练，集合迅速，撤离路线清楚。",
      dayOffset: -2,
      hour: 9,
      minute: 10,
    }),
    createDemoRecord({
      kind: "other",
      names: ["唐可馨"],
      note: "连续两天按时完成订正，已经在班里口头表扬。",
      dayOffset: -3,
      hour: 16,
      minute: 40,
    }),
    createDemoRecord({
      kind: "praise",
      names: ["梁诗晴", "胡梓萱"],
      note: "英语小组展示准备充分，表达自然，带动了全组参与。",
      dayOffset: -4,
      hour: 10,
      minute: 5,
    }),
    createDemoRecord({
      kind: "leave",
      names: ["冯晨希"],
      note: "牙科复诊，上午第三节课后离校。",
      dayOffset: -5,
      hour: 11,
      minute: 0,
      parentNotified: true,
      leaveType: "sick",
      leaveDuration: "half",
    }),
  ];
  if (persistDemo) persist({ quiet: true });
  app.view = "home";
  render();
  if (persistDemo) showToast("已载入示例班级");
}

function saveClassSettings(form) {
  const formData = new FormData(form);
  const className = String(formData.get("className") || "").trim();
  if (!className) {
    form.elements.className.focus();
    return;
  }
  state.settings.className = className;
  state.settings.teacherName = String(formData.get("teacherName") || "").trim();
  state.settings.schoolName = String(formData.get("schoolName") || "").trim();
  persist();
  render();
  showToast("班级信息已保存");
}

function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function fileStamp() {
  const now = new Date();
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function exportJSON() {
  const backup = {
    app: "班级随手记",
    formatVersion: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: state,
  };
  downloadBlob(
    `班级随手记-备份-${fileStamp()}.json`,
    JSON.stringify(backup, null, 2),
    "application/json;charset=utf-8",
  );
  showToast("完整备份已导出");
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCSV() {
  const rows = [
    ["日期", "时间", "类型", "涉及学生", "记录内容", "跟进状态", "家长沟通", "重点标记"],
    ...sortedRecords().map((record) => [
      localDateKey(record.occurredAt),
      formatTime(record.occurredAt),
      KINDS[record.kind].label,
      getRecordNames(record),
      getRecordNote(record),
      record.followUp ? (record.followUpDone ? "已跟进" : "待跟进") : "无需跟进",
      record.parentNotified ? "已联系家长" : "",
      record.attention ? "重点关注" : "",
    ]),
  ];
  const content = `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  downloadBlob(
    `班级随手记-记录-${fileStamp()}.csv`,
    content,
    "text/csv;charset=utf-8",
  );
  showToast("Excel 表格已导出");
}

function importBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      const source = parsed.data || parsed;
      if (!Array.isArray(source.students) || !Array.isArray(source.records)) {
        throw new Error("备份内容不完整");
      }
      if (
        state.students.length &&
        !window.confirm("恢复备份会覆盖当前设备里的学生和记录，确定继续吗？")
      ) {
        return;
      }
      const restored = normalizeState(source);
      restored.settings.setupComplete = Boolean(
        restored.settings.className || restored.students.length || restored.records.length,
      );
      state = restored;
      persist();
      app.view = "home";
      closeSheet({ immediate: true });
      render();
      requestPersistentStorage();
      showToast(`备份已恢复：${state.students.length} 名学生，${state.records.length} 条记录`);
    } catch (error) {
      console.error(error);
      showToast("无法读取这个备份文件，请确认文件完整。", "error", 4200);
    } finally {
      dom.importFile.value = "";
    }
  });
  reader.addEventListener("error", () => {
    showToast("读取备份文件失败。", "error");
    dom.importFile.value = "";
  });
  reader.readAsText(file, "utf-8");
}

function clearAllData() {
  if (
    !window.confirm(
      "确定要清空全部学生和记录吗？\n\n这个操作无法撤销。建议先在设置中导出完整备份。",
    )
  ) {
    return;
  }
  state = defaultState();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn(error);
  }
  closeSheet({ immediate: true });
  app.view = "home";
  render();
  showToast("数据已清空");
}

function clearDemoData() {
  state = defaultState();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn(error);
  }
  closeSheet({ immediate: true });
  app.view = "home";
  render();
  showToast("示例已清空，请建立自己的班级");
}

function openInstallHelp() {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const steps = isIOS
    ? [
        "用 Safari 打开这个应用页面。",
        "点击浏览器底部或顶部的“分享”按钮。",
        "向下找到并点击“添加到主屏幕”。",
        "确认名称后点“添加”，从桌面图标打开即可。",
      ]
    : isAndroid
      ? [
          "用 Chrome 或手机自带浏览器打开这个页面。",
          "点击右上角的浏览器菜单。",
          "选择“安装应用”或“添加到主屏幕”。",
          "从桌面图标打开，之后断网也能查看和记录。",
        ]
      : [
          "在手机浏览器中打开这个应用。",
          "iPhone 使用 Safari：分享 → 添加到主屏幕。",
          "Android 使用 Chrome：菜单 → 安装应用 / 添加到主屏幕。",
          "首次打开会缓存应用，之后可离线使用。",
        ];
  openSheet({
    title: "安装到手机桌面",
    kicker: "INSTALL AS APP",
    body: `
      <p class="import-help">安装不是必须的。也可以直接用浏览器打开，但添加到桌面后更方便，断网也能记录。</p>
      <ol class="demo-list">
        ${steps.map((step) => `<li>${escapeHTML(step)}</li>`).join("")}
      </ol>
      <div class="privacy-box" style="margin-top: 16px;">
        ${icon("i-shield")}
        <div>
          <strong>换手机怎么办？</strong>
          <p>先在原手机“设置与备份”中导出完整备份，再在新手机上打开应用并恢复备份。</p>
        </div>
      </div>
      ${
        deferredInstallPrompt
          ? `<button class="primary-btn wide" data-action="install-app" style="margin-top: 15px;">现在安装</button>`
          : ""
      }
    `,
  });
}

async function promptInstall() {
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone
  ) {
    showToast("当前已经作为独立应用运行");
    return;
  }
  if (!deferredInstallPrompt) {
    openInstallHelp();
    return;
  }
  deferredInstallPrompt.prompt();
  try {
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === "accepted") showToast("正在安装班级随手记");
    else showToast("已取消安装");
  } catch (error) {
    console.warn(error);
  }
  deferredInstallPrompt = null;
  if (app.view === "settings") renderSettings();
}

function handleClick(event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    event.preventDefault();
    navigate(viewButton.dataset.view);
    return;
  }
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.action;

  if (action === "sheet-close") closeSheet();
  else if (action === "save-editor") {
    document.getElementById("record-editor-form")?.requestSubmit();
  } else if (action === "open-add") openKindChooser();
  else if (action === "open-add-kind") openRecordEditor(actionElement.dataset.kind);
  else if (action === "start-kind") {
    const studentId = app.editorStudentId;
    app.editorStudentId = null;
    openRecordEditor(actionElement.dataset.kind, null, studentId);
  } else if (action === "set-editor-kind") switchEditorKind(actionElement.dataset.kind);
  else if (action === "toggle-editor-student") toggleEditorStudent(actionElement.dataset.studentId);
  else if (action === "remove-editor-student") toggleEditorStudent(actionElement.dataset.studentId);
  else if (action === "select-whole-class") {
    app.editor.studentIds.clear();
    refreshEditorStudents();
  } else if (action === "set-leave-template") {
    const select = document.getElementById("leave-type");
    if (select) {
      select.value = actionElement.dataset.value;
      select.focus();
    }
  } else if (action === "use-note-template") {
    const textarea = document.getElementById("editor-note");
    if (textarea) {
      textarea.value = actionElement.dataset.value;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      const count = document.getElementById("note-count");
      if (count) count.textContent = String(textarea.value.length);
    }
  } else if (action === "open-record") {
    openRecordDetail(actionElement.dataset.recordId);
  } else if (action === "edit-record") {
    const record = getRecordById(actionElement.dataset.recordId);
    if (record) openRecordEditor(record.kind, record);
  } else if (action === "delete-record") {
    deleteRecord(actionElement.dataset.recordId);
  } else if (action === "complete-followup") {
    completeFollowup(actionElement.dataset.recordId);
  } else if (action === "toggle-record-followup") {
    toggleRecordFollowupFromDetail(actionElement.dataset.recordId);
  } else if (action === "filter-records") {
    app.recordFilter = actionElement.dataset.filter;
    renderRecords();
  } else if (action === "clear-record-search") {
    app.recordQuery = "";
    renderRecords();
    document.getElementById("records-search")?.focus();
  } else if (action === "clear-student-search") {
    app.studentQuery = "";
    renderStudents();
    document.getElementById("student-search")?.focus();
  } else if (action === "open-student") {
    openStudentProfile(actionElement.dataset.studentId);
  } else if (action === "open-add-student") {
    openStudentForm();
  } else if (action === "edit-student") {
    openStudentForm(actionElement.dataset.studentId);
  } else if (action === "delete-student") {
    deleteStudent(actionElement.dataset.studentId);
  } else if (action === "open-add-for-student") {
    openKindChooser(actionElement.dataset.studentId);
  } else if (action === "open-roster-import") {
    openRosterImport();
  } else if (action === "export-json") exportJSON();
  else if (action === "export-csv") exportCSV();
  else if (action === "import-json") dom.importFile.click();
  else if (action === "install-app") promptInstall();
  else if (action === "open-install-help") openInstallHelp();
  else if (action === "clear-demo") clearDemoData();
  else if (action === "clear-all-data") clearAllData();
}

function handleInput(event) {
  const target = event.target;
  if (target.id === "records-search") {
    app.recordQuery = target.value;
    renderRecordResults();
  } else if (target.id === "student-search") {
    app.studentQuery = target.value;
    renderStudentResults();
  } else if (target.id === "editor-student-search") {
    const options = document.getElementById("editor-student-options");
    if (options) options.innerHTML = studentOptionsHTML(target.value);
  } else if (target.id === "editor-note") {
    const count = document.getElementById("note-count");
    if (count) count.textContent = String(target.value.length);
  }
}

function handleSubmit(event) {
  const form = event.target;
  if (form.id === "setup-form") {
    handleSetup(event, form);
  } else if (form.id === "settings-identity-form") {
    event.preventDefault();
    saveClassSettings(form);
  } else if (form.id === "record-editor-form") {
    event.preventDefault();
    saveRecordFromEditor(form);
  } else if (form.id === "student-editor-form") {
    event.preventDefault();
    saveStudent(form);
  } else if (form.id === "roster-import-form") {
    event.preventDefault();
    const roster = new FormData(form).get("roster");
    const names = parseRoster(roster);
    if (!names.length) {
      showToast("请至少粘贴一个学生姓名。", "error");
      form.elements.roster.focus();
      return;
    }
    const result = addStudentsFromNames(names);
    if (!result.added) {
      showToast("这些学生都已经在名单里了。", "error");
      return;
    }
    persist();
    closeSheet();
    app.view = "students";
    render();
    showToast(
      `已添加 ${result.added} 名学生${result.skipped ? `，跳过 ${result.skipped} 个重复项` : ""}`,
    );
  }
}

function init() {
  const saved = loadState();
  if (saved) state = saved;

  const params = new URLSearchParams(window.location.search);
  if (!state.settings.setupComplete && params.get("demo") === "1") {
    seedDemo({ persistDemo: false });
    if (window.history && window.history.replaceState) {
      params.delete("demo");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  } else {
    const requestedView = params.get("view");
    if (["records", "students", "settings"].includes(requestedView)) {
      app.view = requestedView;
    }
    render();
    if (state.settings.setupComplete && params.get("action") === "add") {
      window.setTimeout(() => openKindChooser(), 380);
    }
    if (
      state.settings.setupComplete &&
      (params.has("source") || params.has("view") || params.has("action")) &&
      window.history &&
      window.history.replaceState
    ) {
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${window.location.hash}`,
      );
    }
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.sheet.hidden) closeSheet();
    if (event.key === "Tab" && !dom.sheet.hidden) {
      const focusable = [
        ...dom.sheet.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
        ),
      ].filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          element.getClientRects().length > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      });
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dom.sheet)) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === dom.sheet)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  dom.sheetBackdrop.addEventListener("click", () => closeSheet());
  dom.importFile.addEventListener("change", () => {
    importBackupFile(dom.importFile.files?.[0]);
  });
  document
    .getElementById("demo-btn")
    .addEventListener("click", () => seedDemo({ persistDemo: true }));

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (app.view === "settings" && state.settings.setupComplete) renderSettings();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    showToast("已添加到桌面");
    if (app.view === "settings") renderSettings();
  });

  if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service Worker 注册失败", error);
      });
    });
  }
}

init();


