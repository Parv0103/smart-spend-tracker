import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "Food", icon: "🍽️", color: "#f97316" },
  { name: "Shopping", icon: "🛍️", color: "#8b5cf6" },
  { name: "Travel", icon: "✈️", color: "#0ea5e9" },
  { name: "Bills", icon: "📄", color: "#ef4444" },
  { name: "Health", icon: "💊", color: "#10b981" },
  { name: "Entertainment", icon: "🎬", color: "#f59e0b" },
  { name: "Others", icon: "📦", color: "#6b7280" },
];

const METHODS = [
  { name: "UPI", icon: "📱" },
  { name: "Cash", icon: "💵" },
  { name: "Card", icon: "💳" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "high", label: "Amount: High → Low" },
  { value: "low", label: "Amount: Low → High" },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.name, c]));

// ─── STORAGE ─────────────────────────────────────────────────────────────────

const ls = {
  get: (k, fallback) => {
    try {
      const v = localStorage.getItem(k);
      return v !== null ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

// ─── HOOKS ───────────────────────────────────────────────────────────────────

function usePersist(key, init) {
  const [val, setVal] = useState(() => ls.get(key, init));
  const set = useCallback(
    (next) => {
      setVal((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        ls.set(key, resolved);
        return resolved;
      });
    },
    [key]
  );
  return [val, set];
}

// ─── TOAST ───────────────────────────────────────────────────────────────────

let _toastId = 0;
function ToastContainer({ toasts }) {
  return (
    <div style={S.toastWrap}>
      {toasts.map((t) => (
        <div key={t.id} style={{ ...S.toast, ...(t.type === "error" ? S.toastErr : t.type === "warn" ? S.toastWarn : S.toastOk) }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = "ok") => {
    const id = ++_toastId;
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 2800);
  }, []);
  return { toasts, push };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt = (n) =>
  "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function startOf(period) {
  const d = new Date();
  if (period === "week") {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
  } else if (period === "month") {
    d.setDate(1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function labelDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function exportCSV(expenses) {
  const header = "Date,Category,Method,Amount,Note";
  const rows = expenses.map((e) =>
    [new Date(e.date).toLocaleString("en-IN"), e.category, e.method, e.amount, `"${e.note}"`].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `expenses_${isoDate(Date.now())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── EMPTY FORM ───────────────────────────────────────────────────────────────

const EMPTY_FORM = { amount: "", category: "Food", method: "UPI", note: "" };

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function ExpenseTracker() {
  const [expenses, setExpenses] = usePersist("xp_expenses", []);
  const [username, setUsername] = usePersist("xp_username", "");
  const [dark, setDark] = usePersist("xp_dark", false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [nameInput, setNameInput] = useState("");

  const [tab, setTab] = useState("home"); // home | add | reports
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterMethod, setFilterMethod] = useState("All");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [reportPeriod, setReportPeriod] = useState("month");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { toasts, push } = useToast();

  // ── dark mode on body ──
  useEffect(() => {
    document.body.style.background = dark ? "#0f0f13" : "#f5f5f7";
    document.body.style.color = dark ? "#e8e8f0" : "#1a1a2e";
  }, [dark]);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { push("Enter a valid amount", "error"); return; }
    if (!form.note.trim()) { push("Please add a note", "warn"); return; }
    if (editingId) {
      setExpenses((p) => p.map((e) => e.id === editingId ? { ...e, ...form, amount: amt } : e));
      setEditingId(null);
      push("Expense updated ✓");
    } else {
      const entry = { id: Date.now(), ...form, amount: amt, date: new Date().toISOString() };
      setExpenses((p) => [entry, ...p]);
      push("Expense added ✓");
    }
    setForm(EMPTY_FORM);
    setTab("home");
  }, [form, editingId, setExpenses, push]);

  const deleteExpense = useCallback((id) => {
    setExpenses((p) => p.filter((e) => e.id !== id));
    push("Deleted");
  }, [setExpenses, push]);

  const startEdit = useCallback((exp) => {
    setForm({ amount: String(exp.amount), category: exp.category, method: exp.method, note: exp.note });
    setEditingId(exp.id);
    setTab("add");
  }, []);

  const cancelEdit = () => { setForm(EMPTY_FORM); setEditingId(null); };

  const clearAll = () => {
    setExpenses([]);
    setShowClearConfirm(false);
    push("All data cleared");
  };

  // ── FILTERS & SORT ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...expenses];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.note.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
    }
    if (filterCat !== "All") list = list.filter((e) => e.category === filterCat);
    if (filterMethod !== "All") list = list.filter((e) => e.method === filterMethod);
    if (filterFrom) list = list.filter((e) => isoDate(e.date) >= filterFrom);
    if (filterTo) list = list.filter((e) => isoDate(e.date) <= filterTo);
    switch (sort) {
      case "oldest": list.sort((a, b) => a.date.localeCompare(b.date)); break;
      case "high": list.sort((a, b) => b.amount - a.amount); break;
      case "low": list.sort((a, b) => a.amount - b.amount); break;
      default: list.sort((a, b) => b.date.localeCompare(a.date));
    }
    return list;
  }, [expenses, search, filterCat, filterMethod, filterFrom, filterTo, sort]);

  // ── SUMMARIES ─────────────────────────────────────────────────────────────

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  const periodExpenses = useMemo(() => {
    const since = startOf(reportPeriod);
    return expenses.filter((e) => new Date(e.date) >= since);
  }, [expenses, reportPeriod]);

  const todayTotal = useMemo(() => {
    const t = isoDate(Date.now());
    return expenses.filter((e) => isoDate(e.date) === t).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const weekTotal = useMemo(() => {
    const s = startOf("week");
    return expenses.filter((e) => new Date(e.date) >= s).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const monthTotal = useMemo(() => {
    const s = startOf("month");
    return expenses.filter((e) => new Date(e.date) >= s).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const catBreakdown = useMemo(() => {
    const map = {};
    periodExpenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodExpenses]);

  const methodBreakdown = useMemo(() => {
    const map = {};
    periodExpenses.forEach((e) => { map[e.method] = (map[e.method] || 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodExpenses]);

  const periodTotal = useMemo(() => periodExpenses.reduce((s, e) => s + e.amount, 0), [periodExpenses]);

  const topCat = catBreakdown[0]?.[0];

  // ── FIRST-RUN NAME MODAL ──────────────────────────────────────────────────

  if (!username) {
    return (
      <div style={{ ...S.root, ...(dark ? S.dark : {}) }}>
        <div style={S.modal}>
          <div style={S.modalBox}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
            <h2 style={{ ...S.modalTitle, color: dark ? "#e8e8f0" : "#1a1a2e" }}>Welcome!</h2>
            <p style={{ color: dark ? "#a0a0b8" : "#6b7280", marginBottom: 24, fontSize: 15 }}>
              What should we call you?
            </p>
            <input
              autoFocus
              style={{ ...S.input, ...(dark ? S.inputDark : {}), marginBottom: 16, fontSize: 16, textAlign: "center" }}
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && nameInput.trim()) setUsername(nameInput.trim()); }}
            />
            <button
              style={{ ...S.btn, ...S.btnPrimary, width: "100%", fontSize: 16, padding: "12px 0" }}
              onClick={() => { if (nameInput.trim()) setUsername(nameInput.trim()); }}
            >
              Get Started →
            </button>
          </div>
        </div>
        <ToastContainer toasts={toasts} />
      </div>
    );
  }

  // ── TABS ──────────────────────────────────────────────────────────────────

  const isLight = !dark;
  const D = dark;

  return (
    <div style={{ ...S.root, ...(D ? S.dark : {}) }}>

      {/* STICKY HEADER */}
      <header style={{ ...S.header, ...(D ? S.headerDark : {}) }}>
        <div style={S.headerInner}>
          <div>
            <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Expense Tracker
            </div>
            <div style={{ fontWeight: 700, fontSize: 17, color: D ? "#e8e8f0" : "#1a1a2e" }}>
              Hello, {username} 👋
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              title="Toggle dark mode"
              style={{ ...S.iconBtn, ...(D ? S.iconBtnDark : {}) }}
              onClick={() => setDark((v) => !v)}
            >
              {D ? "☀️" : "🌙"}
            </button>
            <button
              title="Export CSV"
              style={{ ...S.iconBtn, ...(D ? S.iconBtnDark : {}) }}
              onClick={() => { exportCSV(filtered); push("Exported as CSV ✓"); }}
            >
              ⬇️
            </button>
          </div>
        </div>
      </header>

      {/* PAGE BODY */}
      <main style={S.main}>

        {/* ── HOME TAB ─────────────────────────────────────────────── */}
        {tab === "home" && (
          <div>
            {/* SUMMARY CARDS */}
            <div style={S.grid3}>
              {[
                { label: "Today", val: todayTotal },
                { label: "This Week", val: weekTotal },
                { label: "This Month", val: monthTotal },
              ].map(({ label, val }) => (
                <div key={label} style={{ ...S.card, ...(D ? S.cardDark : {}), textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#7c3aed" }}>{fmt(val)}</div>
                </div>
              ))}
            </div>

            {/* ALL TIME */}
            <div style={{ ...S.card, ...(D ? S.cardDark : {}), marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af" }}>All-time total</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#7c3aed" }}>{fmt(total)}</div>
              </div>
              <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af", textAlign: "right" }}>
                {expenses.length} transactions
                {topCat && <div style={{ marginTop: 4 }}>🔥 Top: <b>{topCat}</b></div>}
              </div>
            </div>

            {/* SEARCH + FILTER */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                style={{ ...S.input, ...(D ? S.inputDark : {}), flex: 1 }}
                placeholder="🔍  Search by note or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                style={{ ...S.iconBtn, ...(D ? S.iconBtnDark : {}), padding: "0 14px", borderRadius: 12 }}
                onClick={() => setShowFilters((v) => !v)}
              >
                {showFilters ? "✕" : "⚙️"}
              </button>
            </div>

            {showFilters && (
              <div style={{ ...S.card, ...(D ? S.cardDark : {}), marginBottom: 14 }}>
                <div style={S.grid2}>
                  <div>
                    <label style={S.label(D)}>Category</label>
                    <select style={{ ...S.select, ...(D ? S.selectDark : {}) }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                      <option>All</option>
                      {CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label(D)}>Method</label>
                    <select style={{ ...S.select, ...(D ? S.selectDark : {}) }} value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}>
                      <option>All</option>
                      {METHODS.map((m) => <option key={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label(D)}>From</label>
                    <input type="date" style={{ ...S.input, ...(D ? S.inputDark : {}) }} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
                  </div>
                  <div>
                    <label style={S.label(D)}>To</label>
                    <input type="date" style={{ ...S.input, ...(D ? S.inputDark : {}) }} value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label(D)}>Sort</label>
                  <select style={{ ...S.select, ...(D ? S.selectDark : {}) }} value={sort} onChange={(e) => setSort(e.target.value)}>
                    {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <button
                  style={{ ...S.btn, marginTop: 10, fontSize: 12, padding: "6px 14px", color: "#ef4444", border: "1px solid #ef444433" }}
                  onClick={() => { setSearch(""); setFilterCat("All"); setFilterMethod("All"); setFilterFrom(""); setFilterTo(""); setSort("newest"); }}
                >
                  Reset filters
                </button>
              </div>
            )}

            {/* EXPENSE LIST */}
            {filtered.length === 0 ? (
              <EmptyState D={D} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.map((e) => (
                  <ExpenseCard key={e.id} e={e} D={D} onEdit={startEdit} onDelete={deleteExpense} />
                ))}
              </div>
            )}

            {/* CLEAR ALL */}
            {expenses.length > 0 && (
              <div style={{ marginTop: 24, textAlign: "center" }}>
                {showClearConfirm ? (
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button style={{ ...S.btn, color: "#ef4444", border: "1px solid #ef4444", borderRadius: 10 }} onClick={clearAll}>
                      Yes, delete all
                    </button>
                    <button style={{ ...S.btn, ...(D ? S.cardDark : {}), border: "1px solid #ccc", borderRadius: 10 }} onClick={() => setShowClearConfirm(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button style={{ ...S.btn, color: "#9ca3af", fontSize: 13 }} onClick={() => setShowClearConfirm(true)}>
                    🗑 Clear all data
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ADD TAB ─────────────────────────────────────────────── */}
        {tab === "add" && (
          <div>
            <div style={{ marginBottom: 18 }}>
              <h2 style={{ ...S.sectionTitle, color: D ? "#e8e8f0" : "#1a1a2e" }}>
                {editingId ? "✏️ Edit Expense" : "➕ Add Expense"}
              </h2>
            </div>

            <div style={{ ...S.card, ...(D ? S.cardDark : {}), display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Amount */}
              <div>
                <label style={S.label(D)}>Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  style={{ ...S.input, ...(D ? S.inputDark : {}), fontSize: 22, fontWeight: 700, textAlign: "center" }}
                />
              </div>

              {/* Category */}
              <div>
                <label style={S.label(D)}>Category</label>
                <div style={S.chipRow}>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.name}
                      style={{
                        ...S.chip,
                        background: form.category === c.name ? c.color : D ? "#2a2a3a" : "#f3f4f6",
                        color: form.category === c.name ? "#fff" : D ? "#a0a0b8" : "#374151",
                        border: form.category === c.name ? `1.5px solid ${c.color}` : `1.5px solid ${D ? "#3a3a4a" : "#e5e7eb"}`,
                      }}
                      onClick={() => setForm({ ...form, category: c.name })}
                    >
                      {c.icon} {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Method */}
              <div>
                <label style={S.label(D)}>Payment Method</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {METHODS.map((m) => (
                    <button
                      key={m.name}
                      style={{
                        ...S.chip,
                        flex: 1,
                        justifyContent: "center",
                        background: form.method === m.name ? "#7c3aed" : D ? "#2a2a3a" : "#f3f4f6",
                        color: form.method === m.name ? "#fff" : D ? "#a0a0b8" : "#374151",
                        border: form.method === m.name ? "1.5px solid #7c3aed" : `1.5px solid ${D ? "#3a3a4a" : "#e5e7eb"}`,
                        padding: "10px 8px",
                        fontSize: 15,
                      }}
                      onClick={() => setForm({ ...form, method: m.name })}
                    >
                      {m.icon} {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label style={S.label(D)}>Note</label>
                <input
                  type="text"
                  placeholder="What was this for?"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  style={{ ...S.input, ...(D ? S.inputDark : {}) }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                />
              </div>

              <button onClick={handleSubmit} style={{ ...S.btn, ...S.btnPrimary, fontSize: 16, padding: "14px 0", marginTop: 4 }}>
                {editingId ? "Update Expense ✓" : "Add Expense +"}
              </button>
              {editingId && (
                <button onClick={() => { cancelEdit(); setTab("home"); }} style={{ ...S.btn, color: D ? "#a0a0b8" : "#9ca3af", fontSize: 14 }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── REPORTS TAB ─────────────────────────────────────────── */}
        {tab === "reports" && (
          <div>
            <h2 style={{ ...S.sectionTitle, color: D ? "#e8e8f0" : "#1a1a2e", marginBottom: 16 }}>📊 Reports</h2>

            {/* Period toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {["week", "month"].map((p) => (
                <button
                  key={p}
                  style={{
                    ...S.btn,
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 14,
                    background: reportPeriod === p ? "#7c3aed" : D ? "#2a2a3a" : "#f3f4f6",
                    color: reportPeriod === p ? "#fff" : D ? "#a0a0b8" : "#374151",
                    border: reportPeriod === p ? "none" : `1px solid ${D ? "#3a3a4a" : "#e5e7eb"}`,
                  }}
                  onClick={() => setReportPeriod(p)}
                >
                  This {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {/* Summary */}
            <div style={S.grid2}>
              <div style={{ ...S.card, ...(D ? S.cardDark : {}), textAlign: "center" }}>
                <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Spent</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#7c3aed" }}>{fmt(periodTotal)}</div>
              </div>
              <div style={{ ...S.card, ...(D ? S.cardDark : {}), textAlign: "center" }}>
                <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Transactions</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#7c3aed" }}>{periodExpenses.length}</div>
              </div>
            </div>

            {periodExpenses.length === 0 ? (
              <div style={{ textAlign: "center", color: D ? "#a0a0b8" : "#9ca3af", marginTop: 40, fontSize: 15 }}>
                No expenses this {reportPeriod}
              </div>
            ) : (
              <>
                {/* Category breakdown */}
                <div style={{ ...S.card, ...(D ? S.cardDark : {}), marginTop: 16 }}>
                  <div style={{ ...S.sectionTitle, color: D ? "#e8e8f0" : "#1a1a2e", fontSize: 14, marginBottom: 14 }}>
                    By Category
                  </div>
                  {catBreakdown.map(([cat, amt]) => {
                    const pct = periodTotal > 0 ? (amt / periodTotal) * 100 : 0;
                    const meta = CAT_MAP[cat] || { icon: "📦", color: "#6b7280" };
                    return (
                      <div key={cat} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 14, color: D ? "#e8e8f0" : "#1a1a2e" }}>
                            {meta.icon} {cat}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: D ? "#e8e8f0" : "#1a1a2e" }}>
                            {fmt(amt)} <span style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af" }}>({pct.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 99, background: D ? "#2a2a3a" : "#f3f4f6", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 99, background: meta.color, width: `${pct}%`, transition: "width 0.5s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Method breakdown */}
                <div style={{ ...S.card, ...(D ? S.cardDark : {}), marginTop: 14 }}>
                  <div style={{ ...S.sectionTitle, color: D ? "#e8e8f0" : "#1a1a2e", fontSize: 14, marginBottom: 14 }}>
                    Payment Methods
                  </div>
                  {methodBreakdown.map(([method, amt]) => {
                    const pct = periodTotal > 0 ? (amt / periodTotal) * 100 : 0;
                    const icon = METHODS.find((m) => m.name === method)?.icon || "💳";
                    return (
                      <div key={method} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${D ? "#2a2a3a" : "#f3f4f6"}` }}>
                        <span style={{ color: D ? "#e8e8f0" : "#1a1a2e" }}>{icon} {method}</span>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, color: D ? "#e8e8f0" : "#1a1a2e" }}>{fmt(amt)}</div>
                          <div style={{ fontSize: 11, color: D ? "#a0a0b8" : "#9ca3af" }}>{pct.toFixed(1)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

      </main>

      {/* BOTTOM NAV */}
      <nav style={{ ...S.nav, ...(D ? S.navDark : {}) }}>
        {[
          { id: "home", icon: "🏠", label: "Home" },
          { id: "add", icon: "➕", label: "Add" },
          { id: "reports", icon: "📊", label: "Reports" },
        ].map((t) => (
          <button
            key={t.id}
            style={{
              ...S.navBtn,
              color: tab === t.id ? "#7c3aed" : D ? "#6b7280" : "#9ca3af",
              fontWeight: tab === t.id ? 700 : 400,
            }}
            onClick={() => { setTab(t.id); if (t.id !== "add") { setEditingId(null); setForm(EMPTY_FORM); } }}
          >
            <span style={{ fontSize: 20, display: "block", marginBottom: 2 }}>{t.icon}</span>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t.label}</span>
          </button>
        ))}
      </nav>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

// ─── EXPENSE CARD ─────────────────────────────────────────────────────────────

function ExpenseCard({ e, D, onEdit, onDelete }) {
  const meta = CAT_MAP[e.category] || { icon: "📦", color: "#6b7280" };
  return (
    <div style={{ ...S.card, ...(D ? S.cardDark : {}), display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: meta.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
        {meta.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: D ? "#e8e8f0" : "#1a1a2e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {e.note || e.category}
        </div>
        <div style={{ fontSize: 12, color: D ? "#a0a0b8" : "#9ca3af", marginTop: 2 }}>
          <span style={{ background: meta.color + "22", color: meta.color, borderRadius: 6, padding: "1px 7px", fontSize: 11, fontWeight: 600, marginRight: 6 }}>
            {e.category}
          </span>
          {METHODS.find((m) => m.name === e.method)?.icon} {e.method} · {labelDate(e.date)}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: D ? "#e8e8f0" : "#1a1a2e" }}>{fmt(e.amount)}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 4, justifyContent: "flex-end" }}>
          <button style={{ ...S.btn, fontSize: 11, padding: "3px 10px", borderRadius: 8, color: "#7c3aed", border: "1px solid #7c3aed33" }} onClick={() => onEdit(e)}>
            Edit
          </button>
          <button style={{ ...S.btn, fontSize: 11, padding: "3px 10px", borderRadius: 8, color: "#ef4444", border: "1px solid #ef444433" }} onClick={() => onDelete(e.id)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────

function EmptyState({ D }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 0", color: D ? "#6b7280" : "#9ca3af" }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>🪴</div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: D ? "#a0a0b8" : "#6b7280" }}>
        No expenses yet
      </div>
      <div style={{ fontSize: 13 }}>Tap ➕ to add your first one</div>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const S = {
  root: {
    minHeight: "100vh",
    background: "#f5f5f7",
    color: "#1a1a2e",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    paddingBottom: 80,
    transition: "background 0.3s, color 0.3s",
  },
  dark: {
    background: "#0f0f13",
    color: "#e8e8f0",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    background: "rgba(245,245,247,0.85)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid #e5e7eb",
    padding: "12px 0",
  },
  headerDark: {
    background: "rgba(15,15,19,0.9)",
    borderBottom: "1px solid #2a2a3a",
  },
  headerInner: {
    maxWidth: 540,
    margin: "0 auto",
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  main: {
    maxWidth: 540,
    margin: "0 auto",
    padding: "20px 16px 0",
  },
  nav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(12px)",
    borderTop: "1px solid #e5e7eb",
    display: "flex",
    zIndex: 100,
  },
  navDark: {
    background: "rgba(15,15,19,0.95)",
    borderTop: "1px solid #2a2a3a",
  },
  navBtn: {
    flex: 1,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "10px 0 8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    transition: "color 0.2s",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #f0f0f5",
    borderRadius: 16,
    padding: "14px 16px",
    marginBottom: 0,
  },
  cardDark: {
    background: "#1a1a28",
    border: "1px solid #2a2a3a",
  },
  btn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    borderRadius: 8,
    padding: "6px 12px",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
    color: "#fff",
    borderRadius: 14,
    fontWeight: 700,
    boxShadow: "0 4px 20px rgba(124,58,237,0.3)",
    width: "100%",
  },
  iconBtn: {
    background: "#f3f4f6",
    border: "none",
    borderRadius: 10,
    width: 38,
    height: 38,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
  },
  iconBtnDark: {
    background: "#2a2a3a",
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 12,
    border: "1.5px solid #e5e7eb",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    background: "#f9fafb",
    color: "#1a1a2e",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
  },
  inputDark: {
    background: "#2a2a3a",
    border: "1.5px solid #3a3a4a",
    color: "#e8e8f0",
  },
  select: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 12,
    border: "1.5px solid #e5e7eb",
    fontSize: 14,
    outline: "none",
    background: "#f9fafb",
    color: "#1a1a2e",
    fontFamily: "inherit",
    boxSizing: "border-box",
    cursor: "pointer",
  },
  selectDark: {
    background: "#2a2a3a",
    border: "1.5px solid #3a3a4a",
    color: "#e8e8f0",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "7px 12px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    marginBottom: 14,
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    fontWeight: 800,
    fontSize: 17,
    margin: 0,
  },
  label: (D) => ({
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: D ? "#a0a0b8" : "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  }),
  // TOAST
  toastWrap: {
    position: "fixed",
    top: 72,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    pointerEvents: "none",
    width: "90%",
    maxWidth: 360,
  },
  toast: {
    padding: "11px 18px",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    textAlign: "center",
    animation: "fadeSlide 0.3s ease",
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
  },
  toastOk: { background: "#10b981", color: "#fff" },
  toastErr: { background: "#ef4444", color: "#fff" },
  toastWarn: { background: "#f59e0b", color: "#fff" },
  // MODAL
  modal: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "rgba(0,0,0,0.1)",
  },
  modalBox: {
    background: "#fff",
    borderRadius: 24,
    padding: "40px 32px",
    maxWidth: 360,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 24px 60px rgba(0,0,0,0.12)",
  },
  modalTitle: {
    fontWeight: 900,
    fontSize: 26,
    margin: "0 0 8px",
  },
};