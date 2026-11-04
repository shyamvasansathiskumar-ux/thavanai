/* Thavanai live demo: every screen of the desktop app, running on the in-browser database. */
(function () {
  "use strict";
  const T = window.Thavanai;
  const D = T.Dates;

  // ---------------------------------------------------------------- tiny DOM builder (text only, never innerHTML)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "value") el.value = v;
      else if (k === "checked" || k === "selected" || k === "disabled") el[k] = !!v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const $ = (s, r) => (r || document).querySelector(s);

  // ---------------------------------------------------------------- state
  let SQL = null, db = null, user = null;
  const today = () => D.today();
  const view = $("#view");

  // ---------------------------------------------------------------- storage: the database lives only in this browser (IndexedDB)
  const Store = {
    open() {
      return new Promise((res, rej) => {
        let r;
        try { r = indexedDB.open("thavanai-demo", 1); } catch (e) { rej(e); return; }
        r.onupgradeneeded = () => r.result.createObjectStore("db");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async get() {
      try { const idb = await Store.open(); return await new Promise((res) => { const q = idb.transaction("db").objectStore("db").get("main"); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
      catch (e) { return null; }
    },
    async put(bytes) {
      try { const idb = await Store.open(); await new Promise((res) => { const t = idb.transaction("db", "readwrite"); t.objectStore("db").put(bytes, "main"); t.oncomplete = res; t.onerror = res; }); }
      catch (e) { /* private mode: the demo still works, it just forgets on reload */ }
    },
    async clear() {
      try { const idb = await Store.open(); await new Promise((res) => { const t = idb.transaction("db", "readwrite"); t.objectStore("db").delete("main"); t.oncomplete = res; t.onerror = res; }); }
      catch (e) { /* nothing stored */ }
    }
  };
  let saveTimer = 0;
  function attach(database) {
    db = database;
    db.onChange(() => { clearTimeout(saveTimer); saveTimer = setTimeout(() => Store.put(db.export()), 120); });
  }

  // ---------------------------------------------------------------- login lockout (5 wrong attempts -> 30 seconds), survives a page refresh
  const MAX_ATTEMPTS = 5, LOCK_MS = 30000;
  const Lock = {
    read() { try { return JSON.parse(sessionStorage.getItem("thv-lock")) || { f: 0, until: 0 }; } catch (e) { return Lock.mem || { f: 0, until: 0 }; } },
    write(v) { Lock.mem = v; try { sessionStorage.setItem("thv-lock", JSON.stringify(v)); } catch (e) { /* memory only */ } },
    mem: null
  };

  // ---------------------------------------------------------------- session: in memory only; logs out after 15 minutes idle
  const IDLE_MS = 15 * 60 * 1000;
  let idleTimer = 0;
  function touch() { if (!user) return; clearTimeout(idleTimer); idleTimer = setTimeout(() => { logout("You were logged out after 15 minutes without activity."); }, IDLE_MS); }
  ["pointerdown", "keydown"].forEach((e) => addEventListener(e, touch, { passive: true }));
  function logout(msg) {
    user = null; clearTimeout(idleTimer); closeModal();
    sessionMsg = msg || "";
    go("login");
  }
  let sessionMsg = "";

  // ---------------------------------------------------------------- feedback
  function toast(text, kind) {
    const t = $("#toast");
    t.replaceChildren(h("span", { class: "toast-in " + (kind || "ok"), text }));
    t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 4200);
  }
  function msgBox(kind, text) { return h("p", { class: "msg " + kind, role: kind === "err" ? "alert" : "status", text }); }
  function errorText(e) {
    if (e instanceof T.ValidationError) return e.message;
    if (e instanceof T.DatabaseError) return "The database refused this: " + e.message;
    console.error(e);
    return "Something went wrong: " + (e && e.message ? e.message : e);
  }
  async function busy(btn, label, fn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = label;
    try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
  }

  // ---------------------------------------------------------------- modal
  let lastFocus = null;
  function closeModal() { const r = $("#modal-root"); if (r.firstChild) { r.replaceChildren(); document.body.classList.remove("modal-open"); if (lastFocus && lastFocus.focus) lastFocus.focus(); } }
  function modal(title, body, actions, opts) {
    lastFocus = document.activeElement;
    const box = h("div", { class: "win modal-win" + (opts && opts.wide ? " wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": title },
      winBar(title), h("div", { class: "win-body" }, body, actions ? h("div", { class: "actions" }, actions) : null));
    const back = h("div", { class: "modal-back", onmousedown: (e) => { if (e.target === back) closeModal(); } }, box);
    back.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeModal(); }
      if (e.key === "Tab") {
        const f = Array.from(box.querySelectorAll("button, input, select, textarea, a[href]")).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    $("#modal-root").replaceChildren(back);
    document.body.classList.add("modal-open");
    setTimeout(() => { const f = box.querySelector("input, select, textarea, button.primary, button.danger, button"); if (f) f.focus(); }, 30);
    return box;
  }
  function confirmBox(title, text, okLabel, danger) {
    return new Promise((res) => {
      const ok = h("button", { class: "btn " + (danger ? "danger" : "primary"), type: "button", text: okLabel, onclick: () => { closeModal(); res(true); } });
      const no = h("button", { class: "btn", type: "button", text: "Cancel", onclick: () => { closeModal(); res(false); } });
      modal(title, text.split("\n").filter(Boolean).map((p) => h("p", { class: "lead", text: p })), [no, ok]);
    });
  }

  // ---------------------------------------------------------------- layout pieces
  function winBar(title) { return h("div", { class: "win-bar" }, h("span", { class: "win-title", text: title }), h("span", { class: "dots", "aria-hidden": "true" }, h("i"), h("i"), h("i"))); }
  function win(title, ...body) { return h("section", { class: "win" }, winBar(title), h("div", { class: "win-body" }, body)); }
  function field(label, control, hint) {
    const id = control.id || ("f" + Math.random().toString(36).slice(2, 9));
    control.id = id;
    return h("div", { class: "field" }, h("label", { for: id, text: label }), control, hint ? h("small", { class: "hint", text: hint }) : null);
  }
  const input = (attrs) => h("input", Object.assign({ class: "in", autocomplete: "off", spellcheck: "false" }, attrs));
  function select(options, value, attrs) {
    const s = h("select", Object.assign({ class: "in" }, attrs));
    options.forEach(([v, l]) => s.append(h("option", { value: v, text: l, selected: String(v) === String(value) })));
    return s;
  }
  function pill(status) { return h("span", { class: "pill " + status.name.toLowerCase(), text: status.name === "ACTIVE" ? "Active" : status.label }); }
  function table(cols, rows, opts) {
    const t = h("table", { class: "grid" + (opts && opts.cls ? " " + opts.cls : "") },
      opts && opts.caption ? h("caption", { class: "sr-only", text: opts.caption }) : null,
      h("thead", null, h("tr", null, cols.map((c) => h("th", { scope: "col", class: c.num ? "num" : null, text: c.label })))),
      h("tbody", null, rows));
    return h("div", { class: "grid-wrap" }, t);
  }

  // ---------------------------------------------------------------- router
  function go(path) { const target = "#/" + path; if (location.hash === target) render(); else location.hash = target; }
  function parse() {
    const raw = (location.hash || "").replace(/^#\/?/, "");
    const [path, q] = raw.split("?");
    const params = new URLSearchParams(q || "");
    return { path: path || "", params };
  }
  const PUBLIC = new Set(["login", "setup", "start"]);
  function render() {
    if (!db) return;
    closeModal();
    let { path, params } = parse();
    const admins = new T.UserDao(db).countAdmins();
    if (!admins && path !== "setup") path = "setup";
    else if (admins && path === "setup") path = user ? "home" : "login";
    if (!user && !PUBLIC.has(path)) path = admins ? "login" : "setup";
    if (user && (path === "login" || path === "")) path = "home";
    if (user) { const fresh = new T.UserDao(db).reload(user); if (!fresh) { logout("Your account no longer exists."); return; } user = fresh; }
    const screens = { login: Login, setup: Setup, home: Home, collections: Collections, add: () => CollectionForm(null), edit: () => CollectionForm(Number(params.get("id"))), overdue: Overdue, clubs: Clubs, console: Console };
    const screen = screens[path] || Home;
    chrome(path);
    view.replaceChildren(screen(params));
    view.focus({ preventScroll: true });
    scrollTo({ top: 0 });
  }
  addEventListener("hashchange", render);

  function chrome(path) {
    const signed = !!user;
    $("#top").hidden = false; $("#foot").hidden = false;
    $("#today").textContent = "Today " + D.format(today());
    const menu = $("#menu");
    menu.replaceChildren();
    if (signed) {
      const items = [["home", "Home"], ["collections", "Collections"], ["overdue", "Overdue"], ["clubs", user.canManageClubs() ? "Clubs, events, coordinators" : "Events"]];
      if (user.canManageClubs()) items.push(["console", "Database"]);
      items.forEach(([p, l]) => menu.append(h("a", { href: "#/" + p, class: p === path || (path === "add" && p === "collections") || (path === "edit" && p === "collections") ? "on" : null, "aria-current": p === path ? "page" : null, text: l })));
      menu.append(h("span", { class: "who" }, h("span", { class: "who-name", text: user.username }), h("span", { class: "who-role", text: user.describe() })));
      menu.append(h("button", { class: "btn ghost small", type: "button", text: "Log out", onclick: () => logout("You have logged out.") }));
    }
    menu.classList.remove("open");
    $("#menuBtn").hidden = !signed;
    $("#menuBtn").setAttribute("aria-expanded", "false");
  }
  $("#menuBtn").addEventListener("click", () => { const m = $("#menu"); const o = m.classList.toggle("open"); $("#menuBtn").setAttribute("aria-expanded", String(o)); });

  // ================================================================= screens
  // ---------------------------------------------------------------- first-run setup
  function Setup() {
    const u = input({ name: "username", autocomplete: "username", maxlength: 30 });
    const p1 = input({ type: "password", autocomplete: "new-password", maxlength: 64 });
    const p2 = input({ type: "password", autocomplete: "new-password", maxlength: 64 });
    const out = h("div");
    const btn = h("button", { class: "btn primary", type: "submit", text: "Create admin" });
    const form = h("form", { class: "form narrow", novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); out.replaceChildren();
      if (p1.value !== p2.value) { out.append(msgBox("err", "The two passwords do not match.")); return; }
      try {
        await busy(btn, "Creating…", () => new T.UserDao(db).createFirstAdmin(u.value, p1.value));
        p1.value = p2.value = "";
        sessionMsg = "Admin account created. Log in to continue.";
        go("login");
      } catch (err) { out.append(msgBox("err", errorText(err))); }
    } },
      h("p", { class: "lead", text: "This runs once. The admin can then add clubs and coordinators. There is no default password." }),
      field("Username", u, "3 to 30 letters, digits, dot or underscore."),
      field("Password", p1, "At least 8 characters, with a letter and a digit."),
      field("Confirm password", p2), out, h("div", { class: "actions" }, btn));
    return h("div", { class: "center" }, win("Set up Thavanai", h("h2", { class: "win-h", text: "Create the admin account" }), form));
  }

  // ---------------------------------------------------------------- login
  function Login() {
    const u = input({ name: "username", autocomplete: "username", maxlength: 60 });
    const p = input({ type: "password", name: "password", autocomplete: "current-password", maxlength: 128 });
    const message = h("p", { class: "msg-line", role: "status", "aria-live": "polite" });
    if (sessionMsg) { message.textContent = sessionMsg; message.className = "msg-line ok"; sessionMsg = ""; }
    const btn = h("button", { class: "btn primary wide", type: "submit", text: "Log in" });
    let tick = 0;
    function lockState() {
      const s = Lock.read(); const left = s.until - Date.now();
      if (left > 0) {
        btn.disabled = true;
        message.className = "msg-line err";
        message.textContent = "Too many wrong attempts. Try again in " + Math.ceil(left / 1000) + " seconds.";
        clearTimeout(tick); tick = setTimeout(lockState, 250);
        return true;
      }
      if (s.until) { Lock.write({ f: 0, until: 0 }); message.className = "msg-line"; message.textContent = "You can try again now."; }
      btn.disabled = false;
      return false;
    }
    const form = h("form", { class: "form", novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      if (lockState()) return;
      const name = u.value, pass = p.value;
      p.value = "";
      let found = null;
      try { found = await busy(btn, "Checking…", () => new T.UserDao(db).authenticate(name, pass)); }
      catch (err) { message.className = "msg-line err"; message.textContent = errorText(err); return; }
      if (found) {
        Lock.write({ f: 0, until: 0 });
        user = found; touch();
        go("home");
        return;
      }
      const s = Lock.read(); s.f += 1;
      if (s.f >= MAX_ATTEMPTS) { s.until = Date.now() + LOCK_MS; s.f = 0; Lock.write(s); lockState(); }
      else { Lock.write(s); message.className = "msg-line err"; message.textContent = "Wrong username or password. " + (MAX_ATTEMPTS - s.f) + " attempts left."; p.focus(); }
    } },
      field("Username", u), field("Password", p), message, btn);
    setTimeout(lockState, 0);

    const demo = T.DEMO_LOGINS.filter(([n]) => db.get("SELECT 1 AS x FROM app_user WHERE username = ?", [n]));
    const helper = demo.length ? h("aside", { class: "glass demo-logins" },
      h("p", { class: "eyebrow", text: "Demo logins" }),
      h("p", { class: "small", text: "From the project's demo data. Tap one to fill the form." }),
      h("ul", null, demo.map(([n, pw, club]) => h("li", null, h("button", { class: "chip", type: "button", onclick: () => { u.value = n; p.value = pw; btn.focus(); } },
        h("span", { class: "mono", text: n }), h("span", { class: "chip-sub", text: club }))))),
      h("p", { class: "small muted", text: "Try a wrong password five times to see the 30-second lockout." })) : null;

    return h("div", { class: "login-wrap" },
      h("div", { class: "login-hero" },
        h("p", { class: "ta login-ta", text: "தவணை" }), h("h1", { text: "Thavanai" }),
        h("p", { class: "lead", text: "Record what you collect. Delete it on time. Keep the proof." })),
      win("Thavanai · Log in", form), helper);
  }

  // ---------------------------------------------------------------- home
  function Home() {
    const c = new T.ReportDao(db, user, today()).dashboardCounts();
    const tiles = [
      ["ACTIVE", c.ACTIVE, "Within retention", "nothing to do yet"],
      ["DUE_SOON", c.DUE_SOON, "Due in 7 days", "delete soon"],
      ["OVERDUE", c.OVERDUE, "Overdue for deletion", "past the delete-by date"],
      ["DELETED", c.DELETED, "Deleted with proof", "locked by the database"]
    ].map(([k, n, label, sub]) => h("a", { class: "tile " + k.toLowerCase(), href: "#/collections?status=" + k },
      h("span", { class: "tile-n", text: String(n) }), h("span", { class: "tile-l", text: label }), h("span", { class: "tile-s", text: sub })));
    const actions = [
      ["add", "Add collection", "Record what a club collected", true],
      ["collections", "View collections", "Search, update, mark as deleted"],
      ["overdue", "Overdue report", "Everything past its due date"],
      ["clubs", user.canManageClubs() ? "Clubs, events and coordinators" : "Events", user.canManageClubs() ? "Manage clubs and accounts" : "Your club's events"]
    ].map(([p, l, s, primary]) => h("a", { class: "act" + (primary ? " primary" : ""), href: "#/" + p }, h("span", { class: "act-l", text: l }), h("span", { class: "act-s", text: s })));
    actions.push(h("button", { class: "act", type: "button", onclick: ChangePassword }, h("span", { class: "act-l", text: "Change password" }), h("span", { class: "act-s", text: "Needs your current password" })));
    if (user.canManageClubs()) actions.push(h("a", { class: "act", href: "#/console" }, h("span", { class: "act-l", text: "Database console" }), h("span", { class: "act-s", text: "Try to break the proof in SQL" })));
    else actions.push(h("button", { class: "act", type: "button", onclick: () => logout("You have logged out.") }, h("span", { class: "act-l", text: "Log out" }), h("span", { class: "act-s", text: "End this session" })));

    const extra = [];
    if (c.OVERDUE) {
      const od = new T.CollectionDao(db, user, today()).search(null, "OVERDUE", null);
      const people = od.reduce((a, d) => a + d.recordCount, 0);
      extra.push(h("a", { class: "alert", href: "#/overdue" }, h("strong", { text: od.length + (od.length === 1 ? " collection is" : " collections are") + " overdue" }), " — holding personal data of " + people + " people. Open the report →"));
    }
    const sens = new T.ReportDao(db, user, today()).sensitivePerClub();
    const sensCard = sens.length ? win("Sensitive data still held", h("p", { class: "small muted", text: "People whose phone number, photo, address, ID or payment details each club still holds (active collections only)." }),
      table([{ label: "Club" }, { label: "People", num: true }], sens.map((r) => h("tr", null, h("td", { text: r.club_name }), h("td", { class: "num", text: String(r.people) }))))) : null;

    return h("div", { class: "stack" },
      h("div", { class: "home-head" },
        h("div", null, h("p", { class: "eyebrow", text: "Signed in as " + user.username + " · " + user.describe() + " · " + D.format(today()) }), h("h1", { class: "page-h", text: "What needs attention" }))),
      h("div", { class: "tiles" }, tiles), extra, h("div", { class: "acts" }, actions), sensCard);
  }

  // ---------------------------------------------------------------- change password
  function ChangePassword() {
    const cur = input({ type: "password", autocomplete: "current-password" });
    const p1 = input({ type: "password", autocomplete: "new-password" });
    const p2 = input({ type: "password", autocomplete: "new-password" });
    const out = h("div");
    const ok = h("button", { class: "btn primary", type: "button", text: "Change password" });
    ok.addEventListener("click", async () => {
      out.replaceChildren();
      if (p1.value !== p2.value) { out.append(msgBox("err", "The two new passwords do not match.")); return; }
      try {
        await busy(ok, "Saving…", () => new T.UserDao(db).changeOwnPassword(user, cur.value, p1.value));
        closeModal(); toast("Password changed.");
      } catch (e) { out.append(msgBox("err", errorText(e))); }
      finally { cur.value = ""; }
    });
    modal("Change your password", [field("Current password", cur), field("New password", p1, "At least 8 characters, with a letter and a digit."), field("Confirm new password", p2), out],
      [h("button", { class: "btn", type: "button", text: "Cancel", onclick: closeModal }), ok]);
  }

  // ---------------------------------------------------------------- collections list
  function Collections(params) {
    const dao = new T.CollectionDao(db, user, today());
    const showClub = user.canManageClubs();
    let selected = null;
    const statusSel = select([["", "All statuses"], ["ACTIVE", "Active"], ["DUE_SOON", "Due in 7 days"], ["OVERDUE", "Overdue"], ["DELETED", "Deleted"]], params.get("status") || "");
    const clubs = new T.ClubDao(db, user).findAll();
    const clubSel = user.canManageClubs() ? select([["", "All clubs"]].concat(clubs.map((c) => [c.id, c.name])), params.get("club") || "") : null;
    const text = input({ type: "search", placeholder: "Purpose, event or storage place", maxlength: 60, value: params.get("q") || "" });
    const tableHost = h("div");
    const count = h("p", { class: "small muted" });
    const btns = {
      update: h("button", { class: "btn", type: "button", text: "Update", disabled: true, onclick: () => go("edit?id=" + selected.id) }),
      del: h("button", { class: "btn danger", type: "button", text: "Mark as deleted", disabled: true, onclick: () => MarkDeleted(selected) }),
      proof: h("button", { class: "btn", type: "button", text: "View deletion proof", disabled: true, onclick: () => Proof(selected) }),
      remove: user.canRemoveEntries() ? h("button", { class: "btn ghost", type: "button", text: "Remove wrong entry", disabled: true, onclick: () => RemoveEntry(selected) }) : null,
      print: h("button", { class: "btn ghost", type: "button", text: "Print", onclick: () => window.print() })
    };
    function sync() {
      const s = !!selected, del = s && selected.deleted;
      btns.update.disabled = !s || del; btns.del.disabled = !s || del; btns.proof.disabled = !s || !del;
      if (btns.remove) btns.remove.disabled = !s || del;
      btns.update.title = del ? "This collection is marked as deleted and is locked." : "";
    }
    function load() {
      let list;
      try { list = dao.search(clubSel ? clubSel.value || null : null, statusSel.value || null, text.value); }
      catch (e) { tableHost.replaceChildren(msgBox("err", errorText(e))); return; }
      selected = null; sync();
      const now = today();
      count.textContent = list.length + (list.length === 1 ? " collection" : " collections") + (statusSel.value ? " · " + statusSel.options[statusSel.selectedIndex].text : "");
      if (!list.length) { tableHost.replaceChildren(h("p", { class: "empty", text: "No collections match these filters." })); return; }
      const rows = list.map((d) => {
        const st = d.statusOn(now);
        const tr = h("tr", { tabindex: "0", class: "pick", "aria-selected": "false" },
          h("td", { class: "num mono", text: String(d.id) }), h("td", null, pill(st)), showClub ? h("td", { text: d.clubName }) : null, h("td", { class: "wrap-s", text: d.eventName }), h("td", { class: "wrap", text: d.purpose }),
          h("td", { class: "wrap small", text: d.categoryNames }), h("td", { class: "num", text: String(d.recordCount) }), h("td", { class: "wrap small", text: d.storageLocation }),
          h("td", { class: "mono", text: D.format(d.collectedOn) }), h("td", { class: "mono strong", text: D.format(d.deleteBy) }));
        const pick = () => { tableHost.querySelectorAll("tr.pick").forEach((r) => { r.classList.remove("sel"); r.setAttribute("aria-selected", "false"); }); tr.classList.add("sel"); tr.setAttribute("aria-selected", "true"); selected = d; sync(); };
        tr.addEventListener("click", pick);
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        tr.addEventListener("dblclick", () => { if (!d.deleted) go("edit?id=" + d.id); else Proof(d); });
        return tr;
      });
      tableHost.replaceChildren(table([{ label: "ID", num: true }, { label: "Status" }].concat(showClub ? [{ label: "Club" }] : [], [{ label: "Event" }, { label: "Purpose" }, { label: "Data collected" }, { label: "People", num: true }, { label: "Stored at" }, { label: "Collected" }, { label: "Delete by" }]), rows, { caption: "Data collections", cls: "collections" }));
    }
    [statusSel, clubSel].forEach((s) => s && s.addEventListener("change", load));
    let deb = 0; text.addEventListener("input", () => { clearTimeout(deb); deb = setTimeout(load, 200); });
    load();
    return h("div", { class: "stack" },
      h("div", { class: "page-row" }, h("h1", { class: "page-h", text: "Data collections" }), h("a", { class: "btn primary", href: "#/add", text: "+ Add collection" })),
      win("Thavanai · View collections",
        h("div", { class: "filters" }, clubSel ? field("Club", clubSel) : null, field("Status", statusSel), field("Search", text)),
        count, tableHost,
        h("p", { class: "small muted", text: "Select a row, then choose an action. Status is worked out from today's date every time — it is never stored." }),
        h("div", { class: "actions left" }, btns.update, btns.del, btns.proof, btns.remove, btns.print)));
  }

  // ---------------------------------------------------------------- add / update form
  function CollectionForm(id) {
    const dao = new T.CollectionDao(db, user, today());
    const events = new T.EventDao(db, user, today()).findAll();
    let existing = null;
    if (id) {
      existing = dao.findById(id);
      if (!existing) return h("div", { class: "center" }, win("Thavanai · Update collection", msgBox("err", "This record does not exist or is not in your club."), h("a", { class: "btn", href: "#/collections", text: "Back to collections" })));
      if (existing.deleted) return h("div", { class: "center" }, win("Thavanai · Update collection #" + id, msgBox("err", "This collection is marked as deleted and is locked."), h("p", { class: "small", text: "Proof of deletion cannot be edited — in the app, or straight from the database." }), h("a", { class: "btn", href: "#/collections", text: "Back to collections" })));
    }
    if (!events.length) return h("div", { class: "center" }, win("Thavanai · Add collection", msgBox("warn", "No events yet. Add an event first from the Events screen."), h("a", { class: "btn primary", href: "#/clubs", text: "Open events" })));

    const cats = new T.CategoryDao(db).findAll();
    const ev = select([["", "Choose the event"]].concat(events.map((e) => [e.id, e.clubName + " · " + e.name + " (" + D.format(e.date) + ")"])), existing ? existing.eventId : "");
    const purpose = input({ maxlength: 200, value: existing ? existing.purpose : "", placeholder: "e.g. Seat booking for the Git and GitHub Workshop" });
    const source = select([["", "Choose"]].concat(Object.values(T.Source).map((s) => [s.name, s.label])), existing ? existing.source : "GOOGLE_FORM");
    const count = input({ type: "number", min: 1, max: 100000, step: 1, inputmode: "numeric", value: existing ? existing.recordCount : "" });
    const stored = input({ maxlength: 150, value: existing ? existing.storageLocation : "", placeholder: "e.g. Club Google Drive / Git Workshop / Bookings" });
    const collected = input({ type: "date", max: today(), value: existing ? existing.collectedOn : today() });
    const boxes = cats.map((c) => {
      const cb = h("input", { type: "checkbox", value: c.id, checked: existing ? existing.categoryIds.includes(c.id) : false });
      return { c, cb, el: h("label", { class: "check" + (c.sensitive ? " sens" : "") }, cb, h("span", { text: c.name + (c.sensitive ? " *" : "") })) };
    });
    const policy = select(Object.values(T.PolicyType).map((p) => [p.name, p.label]), existing ? existing.policyType : "AFTER_EVENT");
    const days = input({ type: "number", min: 0, max: 365, step: 1, inputmode: "numeric", value: existing ? (existing.policyDays == null ? "" : existing.policyDays) : 30 });
    const preview = h("p", { class: "preview", "aria-live": "polite" });
    const warning = h("p", { class: "warn-line", "aria-live": "polite" });
    const out = h("div");

    function build() {
      const e = events.find((x) => String(x.id) === ev.value);
      const d = new T.DataCollection({ id: existing ? existing.id : 0, eventId: Number(ev.value) || 0, eventDate: e ? e.date : null, purpose: purpose.value, source: source.value,
        recordCount: count.value === "" ? NaN : Number(count.value), storageLocation: stored.value, collectedOn: collected.value,
        categoryIds: boxes.filter((b) => b.cb.checked).map((b) => b.c.id) });
      return d;
    }
    function refresh() {
      const pt = T.PolicyType[policy.value];
      days.disabled = !pt.needsDays;
      days.closest(".field").classList.toggle("off", !pt.needsDays);
      const sens = boxes.some((b) => b.cb.checked && b.c.sensitive);
      warning.textContent = sens ? "Sensitive data selected. Delete it as soon as the purpose is over." : "";
      const d = build();
      preview.className = "preview";
      if (!d.eventDate || !d.collectedOn || !D.valid(d.collectedOn)) { preview.textContent = "Choose the event and the collection date to see the delete-by date."; preview.classList.add("muted"); return; }
      try {
        const pol = T.RetentionPolicy.of(policy.value, pt.needsDays ? days.value : null);
        const by = pol.deleteBy(d.collectedOn, d.eventDate);
        const keep = D.between(d.collectedOn, by);
        if (by < d.collectedOn) { preview.classList.add("bad"); preview.textContent = "Delete-by date " + D.format(by) + " is before the collection date. Increase the days."; }
        else if (keep > T.MAX_RETENTION_DAYS) { preview.classList.add("bad"); preview.textContent = "Keeps data " + keep + " days. The limit is " + T.MAX_RETENTION_DAYS + " days."; }
        else { preview.classList.add("good"); preview.textContent = "Delete by " + D.format(by) + "  (" + keep + " days after collection)"; }
      } catch (e) { preview.classList.add("bad"); preview.textContent = e.message; }
    }
    [ev, source, policy, collected].forEach((x) => x.addEventListener("change", refresh));
    [days, collected, count].forEach((x) => x.addEventListener("input", refresh));
    boxes.forEach((b) => b.cb.addEventListener("change", refresh));

    const save = h("button", { class: "btn primary", type: "submit", text: existing ? "Save changes" : "Save collection" });
    const form = h("form", { class: "form", novalidate: true, onsubmit: (e) => {
      e.preventDefault(); out.replaceChildren();
      try {
        const d = build();
        const pt = T.PolicyType[policy.value];
        d.policy = T.RetentionPolicy.of(policy.value, pt.needsDays ? days.value : null);
        if (existing) { dao.update(d); toast("Collection #" + d.id + " updated. Delete by " + D.format(d.deleteBy) + "."); }
        else { dao.add(d); toast("Collection #" + d.id + " saved. Delete by " + D.format(d.deleteBy) + "."); }
        go("collections");
      } catch (err) { out.append(msgBox("err", errorText(err))); out.scrollIntoView({ block: "nearest" }); }
    } },
      h("p", { class: "hint-top", text: "Record details about the data only. Never type the names, numbers or IDs themselves." }),
      h("div", { class: "two" }, field("Event", ev), field("Collected through", source)),
      field("Purpose", purpose, "Why the data was collected."),
      h("div", { class: "two" }, field("Number of people", count), field("Collected on", collected, "Not in the future; within 180 days of the event.")),
      field("Stored at", stored, "Where the data sits now: a Drive folder, a WhatsApp group, a cupboard."),
      h("fieldset", { class: "checks" }, h("legend", { text: "Data collected" }), h("div", { class: "check-grid" }, boxes.map((b) => b.el)), h("small", { class: "hint", text: "* sensitive data. Keep the retention period as short as you can." })),
      h("div", { class: "two" }, field("Retention policy", policy), field("Days", days)),
      preview, warning, out,
      h("div", { class: "actions" }, h("a", { class: "btn", href: "#/collections", text: "Cancel" }), save));
    refresh();
    return h("div", { class: "stack narrow-page" },
      h("h1", { class: "page-h", text: existing ? "Update data collection" : "Record a data collection" }),
      win(existing ? "Thavanai · Update collection #" + existing.id : "Thavanai · Add collection", form));
  }

  // ---------------------------------------------------------------- mark as deleted
  function MarkDeleted(d) {
    const dao = new T.CollectionDao(db, user, today());
    const on = input({ type: "date", max: today(), min: d.collectedOn, value: today() });
    const how = select(Object.values(T.DeletionMethod).map((m) => [m.name, m.label]), "FORM_RESPONSES_DELETED");
    const remarks = input({ maxlength: 200, placeholder: "e.g. Responses deleted from the form and the linked sheet" });
    const confirm = h("input", { type: "checkbox" });
    const out = h("div");
    const ok = h("button", { class: "btn danger", type: "button", text: "Mark as deleted", onclick: () => {
      out.replaceChildren();
      if (!confirm.checked) { out.append(msgBox("err", "Delete the data first, then tick the confirmation box.")); return; }
      try {
        dao.markDeleted({ collectionId: d.id, deletedOn: on.value, method: how.value, remarks: remarks.value });
        closeModal(); toast("Deletion recorded. Collection #" + d.id + " is now locked."); render();
      } catch (e) { out.append(msgBox("err", errorText(e))); }
    } });
    modal("Mark collection #" + d.id + " as deleted", [
      h("h2", { class: "win-h", text: "Record the deletion" }),
      h("p", { class: "small", text: d.clubName + " · " + d.eventName + " · " + d.recordCount + " people · " + d.categoryNames }),
      h("p", { class: "small muted", text: "Stored at: " + d.storageLocation }),
      field("Deleted on", on), field("How", how), field("Remarks", remarks, "Required when you choose Other."),
      h("label", { class: "check confirm" }, confirm, h("span", { text: "I confirm the data itself has been deleted from where it was stored." })),
      h("p", { class: "small muted", text: "After this the record is locked. It cannot be edited or removed." }), out
    ], [h("button", { class: "btn", type: "button", text: "Cancel", onclick: closeModal }), ok]);
  }

  function Proof(d) {
    const dao = new T.CollectionDao(db, user, today());
    let r;
    try { r = dao.findDeletion(d.id); } catch (e) { toast(errorText(e), "err"); return; }
    const body = r ? [
      h("div", { class: "stamp-row" }, h("span", { class: "stamp", text: "DELETED" }), h("p", { class: "lead", text: "Collection #" + d.id + " was deleted" })),
      h("dl", { class: "facts" },
        h("dt", { text: "Club · event" }), h("dd", { text: d.clubName + " · " + d.eventName }),
        h("dt", { text: "People" }), h("dd", { text: String(d.recordCount) }),
        h("dt", { text: "Data collected" }), h("dd", { text: d.categoryNames }),
        h("dt", { text: "Deleted on" }), h("dd", { class: "mono", text: D.format(r.deletedOn) }),
        h("dt", { text: "How" }), h("dd", { text: T.DeletionMethod[r.method].label }),
        h("dt", { text: "Remarks" }), h("dd", { text: r.remarks || "—" }),
        h("dt", { text: "Recorded by" }), h("dd", { class: "mono", text: r.deletedBy }),
        h("dt", { text: "Logged at" }), h("dd", { class: "mono", text: r.loggedAt + " UTC" })),
      h("p", { class: "small muted", text: "Four database triggers refuse any change to this record or its proof, even from the database console." })
    ] : [msgBox("warn", "Collection #" + d.id + " has not been marked as deleted yet.")];
    modal("Proof of deletion", body, [h("button", { class: "btn primary", type: "button", text: "Close", onclick: closeModal })]);
  }

  async function RemoveEntry(d) {
    const yes = await confirmBox("Remove collection #" + d.id, "Remove collection #" + d.id + " completely?\nUse this only for an entry made by mistake.\nTo record that data was deleted, use Mark as deleted instead.", "Remove", true);
    if (!yes) return;
    try { new T.CollectionDao(db, user, today()).delete(d.id); toast("Collection #" + d.id + " removed."); render(); }
    catch (e) { toast(errorText(e), "err"); }
  }

  // ---------------------------------------------------------------- overdue report
  function Overdue() {
    const list = new T.CollectionDao(db, user, today()).search(null, "OVERDUE", null).sort((a, b) => a.deleteBy < b.deleteBy ? -1 : a.deleteBy > b.deleteBy ? 1 : 0);
    const now = today();
    const people = list.reduce((a, d) => a + d.recordCount, 0);
    const summary = list.length ? h("p", { class: "summary bad", text: list.length + " collection" + (list.length === 1 ? "" : "s") + " overdue, holding personal data of " + people + " people." })
      : h("p", { class: "summary good", text: "Nothing is overdue. Every collection is within its retention period." });
    const rows = list.map((d) => h("tr", null, h("td", { class: "num mono", text: String(d.id) }), h("td", { text: d.clubName }), h("td", { text: d.eventName }), h("td", { class: "wrap", text: d.purpose }),
      h("td", { class: "wrap small", text: d.categoryNames }), h("td", { class: "num", text: String(d.recordCount) }), h("td", { class: "wrap small", text: d.storageLocation }),
      h("td", { class: "mono", text: D.format(d.deleteBy) }), h("td", { class: "num strong", text: String(d.daysOverdue(now)) })));
    return h("div", { class: "stack print-area" },
      h("div", { class: "page-row" }, h("h1", { class: "page-h", text: "Overdue deletion report · " + D.format(now) }),
        h("div", { class: "actions no-print" }, h("a", { class: "btn", href: "#/home", text: "Close" }), h("button", { class: "btn primary", type: "button", text: "Print report", onclick: () => window.print() }))),
      win("Thavanai · Overdue deletion report", summary, list.length ? table([{ label: "ID", num: true }, { label: "Club" }, { label: "Event" }, { label: "Purpose" }, { label: "Data collected" }, { label: "People", num: true }, { label: "Stored at" }, { label: "Delete by" }, { label: "Days overdue", num: true }], rows, { caption: "Overdue collections, most overdue first" }) : null,
        h("p", { class: "small muted print-note", text: "Thavanai overdue deletion report, " + D.format(now) + (user.clubId != null ? " · " + user.clubName : " · all clubs") + ". Most overdue first." })));
  }

  // ---------------------------------------------------------------- clubs, events and coordinators
  function Clubs(params) {
    const isAdmin = user.canManageClubs();
    const tabs = isAdmin ? [["events", "Events"], ["clubs", "Clubs"], ["coords", "Coordinators"]] : [["events", "Events"]];
    const cur = tabs.some(([k]) => k === params.get("tab")) ? params.get("tab") : "events";
    const bar = h("div", { class: "tabs", role: "tablist" }, tabs.map(([k, l]) => h("a", { role: "tab", class: k === cur ? "on" : null, "aria-selected": String(k === cur), href: "#/clubs?tab=" + k, text: l })));
    const pane = cur === "clubs" ? ClubsTab() : cur === "coords" ? CoordsTab() : EventsTab();
    return h("div", { class: "stack" }, h("h1", { class: "page-h", text: isAdmin ? "Clubs, events and coordinators" : "Events · " + user.clubName }),
      win(isAdmin ? "Thavanai · Clubs, events and coordinators" : "Thavanai · Events", bar, pane));
  }
  function split(listEl, formEl) { return h("div", { class: "split" }, h("div", { class: "split-l" }, listEl), h("div", { class: "split-r" }, formEl)); }
  function selectable(rows, onPick) {
    rows.forEach(({ tr, item }) => {
      const pick = () => { tr.parentNode.querySelectorAll("tr").forEach((r) => r.classList.remove("sel")); tr.classList.add("sel"); onPick(item); };
      tr.tabIndex = 0; tr.classList.add("pick");
      tr.addEventListener("click", pick);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
    return rows.map((r) => r.tr);
  }
  function EventsTab() {
    const dao = new T.EventDao(db, user, today());
    const clubs = new T.ClubDao(db, user).findAll();
    let sel = null;
    const clubSel = select(clubs.map((c) => [c.id, c.name]), user.clubId || (clubs[0] && clubs[0].id), { disabled: !user.canManageClubs() });
    const name = input({ maxlength: 100 });
    const date = input({ type: "date" });
    const out = h("div");
    const list = dao.findAll();
    const used = new Set(db.all("SELECT DISTINCT event_id FROM data_collection").map((r) => r.event_id));
    const rows = selectable(list.map((e) => ({ item: e, tr: h("tr", null, h("td", { text: e.clubName }), h("td", { text: e.name }), h("td", { class: "mono", text: D.format(e.date) }), h("td", { class: "num", text: used.has(e.id) ? "yes" : "—" })) })),
      (e) => { sel = e; clubSel.value = e.clubId; name.value = e.name; date.value = e.date; out.replaceChildren(); upd.disabled = rem.disabled = false; });
    const clear = () => { sel = null; name.value = ""; date.value = ""; upd.disabled = rem.disabled = true; out.replaceChildren(); };
    const doIt = (fn, okText) => { out.replaceChildren(); try { fn(); toast(okText); render(); } catch (e) { out.append(msgBox("err", errorText(e))); } };
    const add = h("button", { class: "btn primary", type: "button", text: "Add event", onclick: () => doIt(() => dao.add({ clubId: Number(clubSel.value), name: name.value, date: date.value }), "Event added.") });
    const upd = h("button", { class: "btn", type: "button", text: "Update", disabled: true, onclick: () => doIt(() => dao.update({ id: sel.id, clubId: Number(clubSel.value), name: name.value, date: date.value }), "Event updated.") });
    const rem = h("button", { class: "btn ghost", type: "button", text: "Remove event", disabled: true, onclick: async () => { if (await confirmBox("Remove event", "Remove this event?\n" + sel.name + " (" + D.format(sel.date) + ")", "Remove", true)) doIt(() => dao.delete(sel.id), "Event removed."); } });
    return split(list.length ? table([{ label: "Club" }, { label: "Event" }, { label: "Date" }, { label: "Has collections", num: true }], rows, { caption: "Events" }) : h("p", { class: "empty", text: "No events yet." }),
      h("div", { class: "form" }, h("p", { class: "eyebrow", text: "Add or edit an event" }), field("Club", clubSel), field("Event name", name), field("Event date", date, "An event's date cannot change once collections depend on it."), out,
        h("div", { class: "actions left" }, add, upd, rem, h("button", { class: "btn ghost", type: "button", text: "Clear", onclick: clear }))));
  }
  function ClubsTab() {
    const dao = new T.ClubDao(db, user);
    let sel = null;
    const name = input({ maxlength: 80 }), fac = input({ maxlength: 80 }), mail = input({ type: "email", maxlength: 120 });
    const out = h("div");
    const list = dao.findAll();
    const rows = selectable(list.map((c) => ({ item: c, tr: h("tr", null, h("td", { text: c.name }), h("td", { text: c.facultyIncharge }), h("td", { class: "small", text: c.contactEmail })) })),
      (c) => { sel = c; name.value = c.name; fac.value = c.facultyIncharge; mail.value = c.contactEmail; out.replaceChildren(); upd.disabled = rem.disabled = false; });
    const doIt = (fn, okText) => { out.replaceChildren(); try { fn(); toast(okText); render(); } catch (e) { out.append(msgBox("err", errorText(e))); } };
    const add = h("button", { class: "btn primary", type: "button", text: "Add club", onclick: () => doIt(() => dao.add({ name: name.value, facultyIncharge: fac.value, contactEmail: mail.value }), "Club added.") });
    const upd = h("button", { class: "btn", type: "button", text: "Update", disabled: true, onclick: () => doIt(() => dao.update({ id: sel.id, name: name.value, facultyIncharge: fac.value, contactEmail: mail.value }), "Club updated.") });
    const rem = h("button", { class: "btn ghost", type: "button", text: "Remove club", disabled: true, onclick: async () => { if (await confirmBox("Remove club", "Remove this club?\n" + sel.name, "Remove", true)) doIt(() => dao.delete(sel.id), "Club removed."); } });
    return split(table([{ label: "Club" }, { label: "Faculty in-charge" }, { label: "Contact email" }], rows, { caption: "Clubs" }),
      h("div", { class: "form" }, h("p", { class: "eyebrow", text: "Add or edit a club" }), field("Club name", name), field("Faculty in-charge", fac), field("Contact email", mail, "The club's official address, not a student's."), out,
        h("div", { class: "actions left" }, add, upd, rem)));
  }
  function CoordsTab() {
    const users = new T.UserDao(db);
    const clubs = new T.ClubDao(db, user).findAll();
    let sel = null;
    const uname = input({ maxlength: 30, autocomplete: "off" }), pass = input({ type: "password", autocomplete: "new-password", maxlength: 64 });
    const club = select(clubs.map((c) => [c.id, c.name]), clubs[0] && clubs[0].id);
    const out = h("div");
    const list = users.listCoordinators(user);
    const rows = selectable(list.map((r) => ({ item: r, tr: h("tr", null, h("td", { class: "mono", text: r.username }), h("td", { text: r.club_name })) })),
      (r) => { sel = r; out.replaceChildren(); rem.disabled = reset.disabled = false; uname.value = ""; pass.value = ""; });
    const add = h("button", { class: "btn primary", type: "button", text: "Add coordinator" });
    add.addEventListener("click", async () => {
      out.replaceChildren();
      try { await busy(add, "Adding…", () => users.createCoordinator(user, uname.value, pass.value, Number(club.value))); pass.value = ""; toast("Coordinator added."); render(); }
      catch (e) { pass.value = ""; out.append(msgBox("err", errorText(e))); }
    });
    const rem = h("button", { class: "btn ghost", type: "button", text: "Remove coordinator", disabled: true, onclick: async () => {
      if (!(await confirmBox("Remove coordinator", "Remove this coordinator's account?\n" + sel.username, "Remove", true))) return;
      out.replaceChildren();
      try { users.removeCoordinator(user, sel.user_id); toast("Coordinator removed."); render(); } catch (e) { out.append(msgBox("err", errorText(e))); }
    } });
    const reset = h("button", { class: "btn", type: "button", text: "Reset password", disabled: true });
    reset.addEventListener("click", async () => {
      out.replaceChildren();
      if (!sel) { out.append(msgBox("err", "Select a coordinator in the table, then type the new password.")); return; }
      try { await busy(reset, "Resetting…", () => users.resetCoordinatorPassword(user, sel.user_id, pass.value)); pass.value = ""; toast("Password reset. Share the new password with the coordinator in person."); }
      catch (e) { pass.value = ""; out.append(msgBox("err", errorText(e))); }
    });
    return split(table([{ label: "Username" }, { label: "Club" }], rows, { caption: "Coordinators" }),
      h("div", { class: "form" }, h("p", { class: "eyebrow", text: "Add a coordinator, or reset a password" }), field("Username", uname), field("Password", pass, "At least 8 characters, with a letter and a digit."), field("Club", club),
        h("p", { class: "small muted", text: "To reset a password, select the coordinator and type the new password above." }), out,
        h("div", { class: "actions left" }, add, reset, rem)));
  }

  // ---------------------------------------------------------------- database console (admin only)
  function Console() {
    if (!user.canManageClubs()) return h("div", { class: "center" }, win("Thavanai · Database", msgBox("err", "Only the admin can open the database console.")));
    const deleted = db.get("SELECT collection_id FROM data_collection WHERE status = 'DELETED' ORDER BY collection_id LIMIT 1");
    const id = deleted ? deleted.collection_id : 2;
    const examples = [
      ["Edit the proof", "UPDATE deletion_log SET deleted_on = '2026-01-01' WHERE collection_id = " + id + ";"],
      ["Remove the proof", "DELETE FROM deletion_log WHERE collection_id = " + id + ";"],
      ["Un-delete a record", "UPDATE data_collection SET status = 'ACTIVE' WHERE collection_id = " + id + ";"],
      ["Keep data 2 years", "UPDATE data_collection SET delete_by = date(collected_on, '+730 days') WHERE status = 'ACTIVE';"],
      ["Remove a club in use", "DELETE FROM club WHERE club_name = 'Coding Club';"],
      ["Drop the log", "DROP TABLE deletion_log;"],
      ["Overdue query", "SELECT c.club_name, e.event_name, d.record_count, d.delete_by,\n  CAST(julianday(date('now','localtime')) - julianday(d.delete_by) AS INTEGER) AS days_overdue\nFROM data_collection d JOIN event e ON e.event_id = d.event_id JOIN club c ON c.club_id = e.club_id\nWHERE d.status = 'ACTIVE' AND d.delete_by < date('now','localtime')\nORDER BY days_overdue DESC;"],
      ["Are passwords stored?", "SELECT username, role, substr(password_hash, 1, 16) || '…' AS hash, salt FROM app_user;"]
    ];
    const box = h("textarea", { class: "in sql", rows: 6, spellcheck: "false", "aria-label": "SQL statement" });
    box.value = examples[0][1];
    const out = h("div", { class: "console-out", "aria-live": "polite" });
    const run = h("button", { class: "btn primary", type: "button", text: "Run", onclick: () => {
      out.replaceChildren();
      const sql = box.value;
      try {
        const r = T.consoleRun(db, sql);
        out.append(h("p", { class: "term-line ok", text: "mysql> " + sql.split("\n")[0] + (sql.includes("\n") ? " …" : "") }));
        if (r.columns.length) {
          out.append(r.rows.length ? table(r.columns.map((c) => ({ label: c })), r.rows.map((row) => h("tr", null, row.map((v) => h("td", { class: "mono small", text: v == null ? "NULL" : String(v) })))), { cls: "sqlgrid" }) : h("p", { class: "small muted", text: "Empty set." }));
          out.append(h("p", { class: "small muted", text: r.rows.length + " row" + (r.rows.length === 1 ? "" : "s") + " in set" }));
        } else {
          out.append(h("p", { class: "term-line ok", text: "Query OK, " + r.changes + " row" + (r.changes === 1 ? "" : "s") + " affected" }));
        }
      } catch (e) {
        out.append(h("p", { class: "term-line", text: "mysql> " + sql.split("\n")[0] }));
        let text = e.message;
        if (!(e instanceof T.ValidationError)) {
          const m = /CHECK constraint failed: (\w+)/.exec(e.message);
          if (e.kind === "check" && m) text = "ERROR 3819 (HY000): Check constraint '" + m[1] + "' is violated.";
          else if (e.kind === "check") text = "ERROR 3819 (HY000): " + e.message;
          else if (e.kind === "in_use") text = "ERROR 1451 (23000): Cannot delete or update a parent row: a foreign key constraint fails.";
          else if (e.kind === "duplicate") text = "ERROR 1062 (23000): " + e.message;
          else if (e.kind === "trigger") text = "ERROR 1644 (45000): " + e.message;
          else text = "ERROR 1064 (42000): " + e.message;
        }
        out.append(h("p", { class: "term-line err", text }));
      }
    } });
    box.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run.click(); } });
    return h("div", { class: "stack" },
      h("div", { class: "page-row" }, h("h1", { class: "page-h", text: "Database console" })),
      h("p", { class: "lead narrowp", text: "This talks to the database directly, skipping every Java rule — like opening MySQL Workbench. It runs as thavanai_app, which can only SELECT, INSERT, UPDATE and DELETE. Try to change the proof of deletion: the triggers refuse." }),
      win("thavanai_app@localhost · thavanai",
        h("div", { class: "chips" }, examples.map(([l, s]) => h("button", { class: "chip", type: "button", onclick: () => { box.value = s; box.focus(); } }, h("span", { text: l })))),
        field("SQL", box, "One statement. Ctrl/⌘ + Enter runs it."), h("div", { class: "actions left" }, run), out));
  }

  // ================================================================= boot
  function StartChoice() {
    const demo = h("button", { class: "choice glass primary", type: "button" },
      h("span", { class: "eyebrow", text: "Recommended" }), h("strong", { text: "Load the demo data" }),
      h("span", { text: "4 clubs, 4 coordinators, 9 events and 12 collections — 3 already deleted. The same data as the project's DemoData tool and the slides." }));
    const fresh = h("button", { class: "choice glass", type: "button" },
      h("span", { class: "eyebrow", text: "First run" }), h("strong", { text: "Start with an empty database" }),
      h("span", { text: "See the first-run setup: you create the admin account yourself, because there is no default password." }));
    demo.addEventListener("click", () => { const d = new T.Database(SQL); T.loadDemoData(d); attach(d); Store.put(d.export()); go("login"); });
    fresh.addEventListener("click", () => { const d = new T.Database(SQL); attach(d); Store.put(d.export()); go("setup"); });
    $("#top").hidden = false; $("#foot").hidden = false; $("#menuBtn").hidden = true;
    $("#today").textContent = "Today " + D.format(today());
    view.replaceChildren(h("div", { class: "start" },
      h("p", { class: "eyebrow", text: "Live demo · runs entirely in your browser" }),
      h("h1", { class: "page-h big", text: "How do you want to start?" }),
      h("p", { class: "lead narrowp", text: "Thavanai's database — tables, CHECK constraints and the four triggers — is built in this tab. Nothing leaves your device." }),
      h("div", { class: "choices" }, demo, fresh)));
  }

  $("#resetBtn").addEventListener("click", async () => {
    if (!(await confirmBox("Reset the demo", "Delete the demo database stored in this browser and start again?\nThis only affects your own copy.", "Reset", true))) return;
    user = null;
    await Store.clear();
    try { sessionStorage.removeItem("thv-lock"); } catch (e) { /* none */ }
    location.replace(location.pathname);
  });

  async function boot() {
    const splash = $("#splash");
    const minShow = new Promise((r) => setTimeout(r, matchMedia("(prefers-reduced-motion: reduce)").matches ? 300 : 2500));
    let failed = null;
    try {
      SQL = await T.loadSql();
      const saved = await Store.get();
      if (saved) { try { attach(new T.Database(SQL, saved)); } catch (e) { await Store.clear(); } }
    } catch (e) { failed = e; }
    await minShow;
    splash.classList.add("done");
    setTimeout(() => splash.remove(), 700);
    if (failed) {
      view.replaceChildren(h("div", { class: "center" }, win("Thavanai", msgBox("err", "This browser could not start the database (" + (failed.message || failed) + "). Try a recent Chrome, Edge, Firefox or Safari."))));
      $("#top").hidden = false;
      return;
    }
    if (!db) { StartChoice(); return; }
    render();
  }
  boot();
})();
