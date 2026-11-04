/*
 * Thavanai engine: the same rules as the Java application, running in the browser.
 *
 *   schema      7 tables, 5 CHECK constraints, foreign keys, 4 triggers (SQLite via sql.js)
 *   security    PBKDF2-HMAC-SHA256, 600,000 iterations, 16-byte salt, constant-time compare
 *   model       User (abstract) -> Admin, Coordinator; RetentionPolicy -> 3 policies
 *   db          one DAO per table, every query a prepared statement with bound values
 *
 * Nothing here stores personal data. Only facts about it.
 */
(function (global) {
  "use strict";

  // ------------------------------------------------------------------ errors
  /** A rule the user broke. The message is shown as-is (Java: ValidationException). */
  class ValidationError extends Error {
    constructor(message) { super(message); this.name = "ValidationError"; }
  }
  /** Something the database itself refused (trigger, CHECK, foreign key). */
  class DatabaseError extends Error {
    constructor(message) { super(message); this.name = "DatabaseError"; }
  }

  /** Every free-text field passes through here before any other rule.
      Invisible characters are removed (they are never typed on purpose and can disguise text);
      anything that looks like markup or script is refused with a message, never silently changed.
      SQL needs no stripping: every query binds its values, so text can never become SQL. */
  const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;
  const MARKUP = [
    /<\/?[a-z!?]/i,
    /(java|vb)script\s*:/i,
    /data\s*:\s*text\/html/i,
    /\bon[a-z]{3,}\s*=/i,
    /&(#x?[0-9a-f]+|lt|gt|quot|apos);?/i,
    /\$\{|\{\{/
  ];
  const TextGuard = {
    clean(value) {
      if (value == null) return "";
      return String(value).normalize("NFC").replace(INVISIBLE, "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
    },
    check(field, text) {
      if (text == null || text === "") return;
      for (const re of MARKUP) if (re.test(text)) throw new ValidationError(field + " looks like it contains code or markup. Use plain words only.");
    }
  };

  function requireText(value, field, min, max) {
    const v = TextGuard.clean(value);
    TextGuard.check(field, v);
    if (!v) throw new ValidationError(field + " is required.");
    if (v.length < min) throw new ValidationError(field + " must be at least " + min + " characters.");
    if (v.length > max) throw new ValidationError(field + " can be at most " + max + " characters.");
    return v;
  }

  // ------------------------------------------------------------------ dates (ISO yyyy-mm-dd internally, dd-MM-yyyy on screen)
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const Dates = {
    today() {
      const d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    },
    valid(iso) {
      if (typeof iso !== "string" || !ISO.test(iso)) return false;
      const [y, m, d] = iso.split("-").map(Number);
      const t = new Date(Date.UTC(y, m - 1, d));
      return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
    },
    toUTC(iso) { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); },
    fromUTC(ms) { const t = new Date(ms); return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0"); },
    plusDays(iso, n) { return Dates.fromUTC(Dates.toUTC(iso) + n * 86400000); },
    plusYears(iso, n) { const [y, m, d] = iso.split("-").map(Number); const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate(); return (y + n) + "-" + String(m).padStart(2, "0") + "-" + String(Math.min(d, last)).padStart(2, "0"); },
    between(a, b) { return Math.round((Dates.toUTC(b) - Dates.toUTC(a)) / 86400000); },
    format(iso) { if (!iso) return ""; const [y, m, d] = iso.split("-"); return d + "-" + m + "-" + y; },
    long(iso) { const t = new Date(Dates.toUTC(iso)); return t.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
  };

  // ------------------------------------------------------------------ enums (match the database ENUM values exactly)
  const enumOf = (pairs) => Object.freeze(Object.fromEntries(pairs.map(([k, label, extra]) => [k, Object.freeze(Object.assign({ name: k, label }, extra || {}))])));
  const Role = enumOf([["ADMIN", "Admin"], ["COORDINATOR", "Club coordinator"]]);
  const Source = enumOf([["GOOGLE_FORM", "Google Form"], ["PAPER_FORM", "Paper form"], ["WHATSAPP", "WhatsApp"], ["EMAIL", "Email"], ["OTHER", "Other"]]);
  const PolicyType = enumOf([
    ["FIXED_DAYS", "Fixed number of days after collection", { needsDays: true }],
    ["AFTER_EVENT", "Number of days after the event", { needsDays: true }],
    ["END_OF_SEMESTER", "Until the end of the semester", { needsDays: false }]
  ]);
  const DeletionMethod = enumOf([["FORM_RESPONSES_DELETED", "Form responses deleted"], ["FILE_DELETED", "File or sheet deleted"], ["PAPER_SHREDDED", "Paper forms shredded"], ["OTHER", "Other"]]);
  const CollectionStatus = enumOf([["ACTIVE", "Within retention"], ["DUE_SOON", "Due in 7 days"], ["OVERDUE", "Overdue"], ["DELETED", "Deleted"]]);
  const DUE_SOON_DAYS = 7;
  const MAX_RETENTION_DAYS = 365;
  const MAX_DAYS_FROM_EVENT = 180;

  // ------------------------------------------------------------------ personal data guard
  /*
   * Refuses free text that looks like personal data. Same four patterns as the Java PersonalDataGuard,
   * plus two closed loopholes found in review:
   *   - phone numbers written in groups (987 654 3210, 98-7654-3210, +91 98765 43210)
   *   - full REC register numbers (13 digits, 2116...) and any other long run of digits
   */
  const PHONE = /(?<!\d)(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/;
  const PHONE_GROUPED = /(?<!\d)(\+?91[\s.-]?)?[6-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const EMAIL_SPELT = /\b[\w.+-]+\s*(\[at\]|\(at\)|\sat\s)\s*[\w-]+\s*(\[dot\]|\(dot\)|\sdot\s)\s*\w+/i;
  const ID_NUMBER = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/;
  const REG_NO = /(?<!\d)2\d{8}(?!\d)/;
  const LONG_DIGITS = /(?<!\d)\d(?:[\s-]?\d){9,}(?!\d)/;
  const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/;
  const PersonalDataGuard = {
    check(field, text) {
      if (text == null || text === "") return;
      const t = String(text);
      if (PHONE.test(t) || PHONE_GROUPED.test(t)) throw new ValidationError(field + " looks like it contains a phone number. Describe the data, do not copy it.");
      if (EMAIL.test(t) || EMAIL_SPELT.test(t)) throw new ValidationError(field + " looks like it contains an email address. Describe the data, do not copy it.");
      if (ID_NUMBER.test(t) || PAN.test(t)) throw new ValidationError(field + " looks like it contains an ID number. Describe the data, do not copy it.");
      if (REG_NO.test(t) || LONG_DIGITS.test(t)) throw new ValidationError(field + " looks like it contains a register number. Describe the data, do not copy it.");
    }
  };

  // ------------------------------------------------------------------ password hashing (Web Crypto, built into the browser)
  const ITERATIONS = 600000;
  const KEY_BITS = 256;
  const enc = new TextEncoder();
  const b64 = (bytes) => btoa(String.fromCharCode.apply(null, Array.from(bytes)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const PasswordHasher = {
    ITERATIONS,
    newSalt() { const s = new Uint8Array(16); crypto.getRandomValues(s); return b64(s); },
    async hash(password, salt) {
      const key = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: ITERATIONS }, key, KEY_BITS);
      return b64(new Uint8Array(bits));
    },
    /** Constant-time comparison: the time taken does not reveal how many characters matched. */
    async verify(password, salt, expected) {
      const actual = await PasswordHasher.hash(password, salt);
      const a = enc.encode(actual), b = enc.encode(String(expected));
      let diff = a.length ^ b.length;
      for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
      return diff === 0;
    },
    checkUsername(username) {
      if (username == null || !/^[A-Za-z0-9_.]{3,30}$/.test(username)) throw new ValidationError("Username must be 3 to 30 characters: letters, digits, dot or underscore.");
    },
    checkStrength(password) {
      const p = String(password || "");
      if (p.length < 8) throw new ValidationError("Password must be at least 8 characters.");
      if (p.length > 64) throw new ValidationError("Password can be at most 64 characters.");
      if (!/\p{L}/u.test(p) || !/\p{Nd}/u.test(p)) throw new ValidationError("Password must contain at least one letter and one digit.");
    }
  };

  // ------------------------------------------------------------------ users (abstraction, inheritance, polymorphism)
  class User {
    constructor(id, username) {
      if (new.target === User) throw new TypeError("User is abstract");
      Object.defineProperty(this, "id", { value: id, enumerable: true });
      Object.defineProperty(this, "username", { value: username, enumerable: true });
      Object.freeze(this);
    }
    /* abstract */ get role() { throw new Error("abstract"); }
    /* abstract */ get clubId() { throw new Error("abstract"); }
    /* abstract */ canManageClubs() { throw new Error("abstract"); }
    /* abstract */ canAccessClub() { throw new Error("abstract"); }
    /* abstract */ canRemoveEntries() { throw new Error("abstract"); }
    /* abstract */ describe() { throw new Error("abstract"); }
    /** Factory: builds the right subclass from the row in app_user. */
    static create(id, username, role, clubId, clubName) {
      return role === "ADMIN" ? new Admin(id, username) : new Coordinator(id, username, clubId, clubName);
    }
  }
  class Admin extends User {
    get role() { return Role.ADMIN; }
    get clubId() { return null; }
    canManageClubs() { return true; }
    canAccessClub() { return true; }
    canRemoveEntries() { return true; }
    describe() { return Role.ADMIN.label; }
  }
  const CLUB = new WeakMap();
  class Coordinator extends User {
    constructor(id, username, clubId, clubName) { super(id, username); CLUB.set(this, { clubId, clubName }); }
    get role() { return Role.COORDINATOR; }
    get clubId() { return CLUB.get(this).clubId; }
    get clubName() { return CLUB.get(this).clubName; }
    canManageClubs() { return false; }
    canAccessClub(clubId) { return this.clubId === Number(clubId); }
    canRemoveEntries() { return false; }
    describe() { return Role.COORDINATOR.label + ", " + this.clubName; }
  }

  // ------------------------------------------------------------------ retention policies (interface + three implementations)
  class FixedDaysPolicy {
    constructor(days) { this.days = days; Object.freeze(this); }
    get type() { return PolicyType.FIXED_DAYS; }
    deleteBy(collectedOn) { return Dates.plusDays(collectedOn, this.days); }
  }
  class AfterEventPolicy {
    constructor(days) { this.days = days; Object.freeze(this); }
    get type() { return PolicyType.AFTER_EVENT; }
    deleteBy(collectedOn, eventDate) { return Dates.plusDays(eventDate, this.days); }
  }
  class EndOfSemesterPolicy {
    constructor() { this.days = null; Object.freeze(this); }
    get type() { return PolicyType.END_OF_SEMESTER; }
    /** 31 May and 30 November: the next one on or after the collection date. */
    deleteBy(collectedOn) {
      const y = Number(collectedOn.slice(0, 4));
      const even = y + "-05-31", odd = y + "-11-30";
      if (collectedOn <= even) return even;
      if (collectedOn <= odd) return odd;
      return (y + 1) + "-05-31";
    }
  }
  const RetentionPolicy = {
    MAX_RETENTION_DAYS,
    /** Factory: the right policy object for a stored or chosen type. */
    of(type, days) {
      const t = typeof type === "string" ? PolicyType[type] : type;
      if (!t) throw new ValidationError("Choose a retention policy.");
      const need = (min) => {
        if (days == null || days === "" || !Number.isInteger(Number(days))) throw new ValidationError("Enter the number of days for this policy.");
        const n = Number(days);
        if (n < min || n > MAX_RETENTION_DAYS) throw new ValidationError("Days must be between " + min + " and " + MAX_RETENTION_DAYS + ".");
        return n;
      };
      if (t === PolicyType.FIXED_DAYS) return new FixedDaysPolicy(need(1));
      if (t === PolicyType.AFTER_EVENT) return new AfterEventPolicy(need(0));
      if (t === PolicyType.END_OF_SEMESTER) return new EndOfSemesterPolicy();
      throw new ValidationError("Unknown retention policy.");
    }
  };

  // ------------------------------------------------------------------ models with their own validation
  const CLUB_EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
  function validateClub(c) {
    c.name = requireText(c.name, "Club name", 3, 80);
    c.facultyIncharge = requireText(c.facultyIncharge, "Faculty in-charge", 3, 80);
    c.contactEmail = requireText(c.contactEmail, "Contact email", 5, 120);
    PersonalDataGuard.check("Club name", c.name);
    if (!CLUB_EMAIL.test(c.contactEmail)) throw new ValidationError("Contact email is not a valid email address.");
    return c;
  }
  function validateEvent(e, today) {
    e.name = requireText(e.name, "Event name", 3, 100);
    PersonalDataGuard.check("Event name", e.name);
    if (!(Number(e.clubId) > 0)) throw new ValidationError("Choose the club that runs this event.");
    if (!e.date) throw new ValidationError("Choose the event date.");
    if (!Dates.valid(e.date)) throw new ValidationError("Event date is not a valid date.");
    if (e.date < Dates.plusYears(today, -2) || e.date > Dates.plusYears(today, 1)) throw new ValidationError("Event date must be within the last two years or the next year.");
    return e;
  }

  /** One data collection. deleteBy has no setter: only a policy can produce it (encapsulation). */
  const DELETE_BY = new WeakMap();
  class DataCollection {
    constructor(fields) {
      Object.assign(this, { id: 0, eventId: 0, eventDate: null, purpose: "", source: null, recordCount: 0, storageLocation: "", collectedOn: null, policy: null, categoryIds: [] }, fields || {});
      DELETE_BY.set(this, fields && fields._deleteBy || null);
      delete this._deleteBy;
    }
    get deleteBy() { return DELETE_BY.get(this); }
    validateAndApplyPolicy(today) {
      if (!(Number(this.eventId) > 0) || !this.eventDate) throw new ValidationError("Choose the event this data was collected for.");
      this.purpose = requireText(this.purpose, "Purpose", 5, 200);
      this.storageLocation = requireText(this.storageLocation, "Stored at", 3, 150);
      PersonalDataGuard.check("Purpose", this.purpose);
      PersonalDataGuard.check("Stored at", this.storageLocation);
      if (!this.source || !Source[this.source]) throw new ValidationError("Choose where the data was collected.");
      const n = Number(this.recordCount);
      if (!Number.isInteger(n) || n < 1 || n > 100000) throw new ValidationError("Number of people must be between 1 and 100000.");
      this.recordCount = n;
      if (!this.collectedOn) throw new ValidationError("Choose the date the data was collected.");
      if (!Dates.valid(this.collectedOn)) throw new ValidationError("Collected on is not a valid date.");
      if (this.collectedOn > today) throw new ValidationError("Collected on cannot be a future date.");
      if (Math.abs(Dates.between(this.eventDate, this.collectedOn)) > MAX_DAYS_FROM_EVENT) throw new ValidationError("Collected on must be within " + MAX_DAYS_FROM_EVENT + " days of the event date. Check the event you selected.");
      const ids = Array.from(new Set((this.categoryIds || []).map(Number))).filter((x) => Number.isInteger(x) && x >= 1 && x <= 9);
      if (!ids.length) throw new ValidationError("Tick at least one kind of data that was collected.");
      this.categoryIds = ids.sort((a, b) => a - b);
      if (!this.policy) throw new ValidationError("Choose a retention policy.");
      this.applyPolicy();
    }
    applyPolicy() {
      const date = this.policy.deleteBy(this.collectedOn, this.eventDate);
      if (date < this.collectedOn) throw new ValidationError("With this policy the delete-by date (" + Dates.format(date) + ") falls before the collection date. Increase the number of days.");
      const keep = Dates.between(this.collectedOn, date);
      if (keep > MAX_RETENTION_DAYS) throw new ValidationError("Data cannot be kept for more than " + MAX_RETENTION_DAYS + " days. This policy keeps it for " + keep + " days.");
      DELETE_BY.set(this, date);
    }
    statusOn(today) {
      if (this.deleted) return CollectionStatus.DELETED;
      if (this.deleteBy < today) return CollectionStatus.OVERDUE;
      if (this.deleteBy <= Dates.plusDays(today, DUE_SOON_DAYS)) return CollectionStatus.DUE_SOON;
      return CollectionStatus.ACTIVE;
    }
    daysOverdue(today) { return Math.max(0, Dates.between(this.deleteBy, today)); }
  }

  function validateDeletion(r, collectedOn, today) {
    if (!r.deletedOn) throw new ValidationError("Choose the date the data was deleted.");
    if (!Dates.valid(r.deletedOn)) throw new ValidationError("Deleted on is not a valid date.");
    if (r.deletedOn > today) throw new ValidationError("Deleted on cannot be a future date.");
    if (r.deletedOn < collectedOn) throw new ValidationError("Deleted on cannot be before the data was collected.");
    if (!r.method || !DeletionMethod[r.method]) throw new ValidationError("Choose how the data was deleted.");
    if (r.remarks != null) {
      r.remarks = TextGuard.clean(r.remarks);
      TextGuard.check("Remarks", r.remarks);
      if (r.remarks.length > 200) throw new ValidationError("Remarks can be at most 200 characters.");
      if (!r.remarks) r.remarks = null;
      PersonalDataGuard.check("Remarks", r.remarks);
    }
    if (r.method === "OTHER" && r.remarks == null) throw new ValidationError("Describe how the data was deleted when you choose Other.");
    return r;
  }

  // ------------------------------------------------------------------ schema (SQLite translation of sql/schema.sql)
  const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE club (
  club_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  club_name        TEXT NOT NULL UNIQUE CHECK (length(club_name) <= 80),
  faculty_incharge TEXT NOT NULL CHECK (length(faculty_incharge) <= 80),
  contact_email    TEXT NOT NULL CHECK (length(contact_email) <= 120)
);
CREATE TABLE app_user (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 30),
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('ADMIN','COORDINATOR')),
  club_id       INTEGER NULL REFERENCES club(club_id) ON DELETE RESTRICT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_role_club CHECK ((role = 'ADMIN' AND club_id IS NULL) OR (role = 'COORDINATOR' AND club_id IS NOT NULL))
);
CREATE TABLE event (
  event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id    INTEGER NOT NULL REFERENCES club(club_id) ON DELETE RESTRICT,
  event_name TEXT NOT NULL CHECK (length(event_name) <= 100),
  event_date TEXT NOT NULL CHECK (event_date = date(event_date)),
  CONSTRAINT uq_event UNIQUE (club_id, event_name, event_date)
);
CREATE TABLE data_category (
  category_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  is_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (is_sensitive IN (0,1))
);
CREATE TABLE data_collection (
  collection_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         INTEGER NOT NULL REFERENCES event(event_id) ON DELETE RESTRICT,
  purpose          TEXT NOT NULL CHECK (length(purpose) <= 200),
  source           TEXT NOT NULL CHECK (source IN ('GOOGLE_FORM','PAPER_FORM','WHATSAPP','EMAIL','OTHER')),
  record_count     INTEGER NOT NULL,
  storage_location TEXT NOT NULL CHECK (length(storage_location) <= 150),
  collected_on     TEXT NOT NULL CHECK (collected_on = date(collected_on)),
  policy_type      TEXT NOT NULL CHECK (policy_type IN ('FIXED_DAYS','AFTER_EVENT','END_OF_SEMESTER')),
  policy_days      INTEGER NULL,
  delete_by        TEXT NOT NULL CHECK (delete_by = date(delete_by)),
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DELETED')),
  created_by       INTEGER NOT NULL REFERENCES app_user(user_id) ON DELETE RESTRICT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NULL,
  CONSTRAINT chk_count    CHECK (record_count BETWEEN 1 AND 100000),
  CONSTRAINT chk_order    CHECK (delete_by >= collected_on),
  CONSTRAINT chk_max_keep CHECK (julianday(delete_by) - julianday(collected_on) <= 365),
  CONSTRAINT chk_days     CHECK (policy_days IS NULL OR policy_days BETWEEN 0 AND 365)
);
CREATE INDEX idx_coll_status_due ON data_collection (status, delete_by);
CREATE TABLE collection_category (
  collection_id INTEGER NOT NULL REFERENCES data_collection(collection_id) ON DELETE CASCADE,
  category_id   INTEGER NOT NULL REFERENCES data_category(category_id) ON DELETE RESTRICT,
  PRIMARY KEY (collection_id, category_id)
);
CREATE TABLE deletion_log (
  log_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL UNIQUE REFERENCES data_collection(collection_id) ON DELETE RESTRICT,
  deleted_by    INTEGER NOT NULL REFERENCES app_user(user_id) ON DELETE RESTRICT,
  deleted_on    TEXT NOT NULL CHECK (deleted_on = date(deleted_on)),
  method        TEXT NOT NULL CHECK (method IN ('FORM_RESPONSES_DELETED','FILE_DELETED','PAPER_SHREDDED','OTHER')),
  remarks       TEXT NULL CHECK (remarks IS NULL OR length(remarks) <= 200),
  logged_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_lock_deleted_update BEFORE UPDATE ON data_collection
FOR EACH ROW WHEN OLD.status = 'DELETED'
BEGIN SELECT RAISE(ABORT, 'This collection is marked as deleted and is locked.'); END;
CREATE TRIGGER trg_lock_deleted_delete BEFORE DELETE ON data_collection
FOR EACH ROW WHEN OLD.status = 'DELETED'
BEGIN SELECT RAISE(ABORT, 'A deleted collection is proof of deletion and cannot be removed.'); END;
CREATE TRIGGER trg_log_no_update BEFORE UPDATE ON deletion_log
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Deletion records cannot be edited.'); END;
CREATE TRIGGER trg_log_no_delete BEFORE DELETE ON deletion_log
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Deletion records cannot be removed.'); END;
INSERT INTO data_category (name, is_sensitive) VALUES
  ('Name',0),('Register number',0),('Department and year',0),('Email address',0),
  ('Phone number',1),('Photo',1),('Home address',1),('Government ID',1),('Payment details',1);
`;

  // ------------------------------------------------------------------ database wrapper (the "JDBC" layer)
  class Database {
    constructor(SQL, bytes) {
      this.sql = SQL;
      this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
      this.db.exec("PRAGMA foreign_keys = ON;");
      if (!bytes) this.db.exec(SCHEMA);
      this.listeners = [];
      this.inTx = false;
    }
    onChange(fn) { this.listeners.push(fn); }
    changed() { if (!this.inTx) this.listeners.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); }
    /** Prepared statement, values bound separately (no string building, no SQL injection). */
    all(sql, params) {
      const st = this.db.prepare(sql);
      try {
        st.bind(params || []);
        const rows = [];
        while (st.step()) rows.push(st.getAsObject());
        return rows;
      } catch (e) { throw translate(e); } finally { st.free(); }
    }
    get(sql, params) { return this.all(sql, params)[0] || null; }
    run(sql, params) {
      const st = this.db.prepare(sql);
      try {
        st.bind(params || []);
        st.step();
        const changes = this.db.getRowsModified();
        const id = this.db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
        this.changed();
        return { changes, id };
      } catch (e) { throw translate(e); } finally { st.free(); }
    }
    /** All or nothing (Java: setAutoCommit(false) ... commit / rollback). */
    tx(fn) {
      if (this.inTx) return fn(); // nested: part of the outer transaction
      this.db.exec("BEGIN IMMEDIATE");
      this.inTx = true;
      try {
        const r = fn();
        this.db.exec("COMMIT");
        this.inTx = false;
        this.changed();
        return r;
      } catch (e) {
        try { this.db.exec("ROLLBACK"); } catch (_) { /* already rolled back */ }
        this.inTx = false;
        throw e;
      }
    }
    /** sql.js reopens the database while exporting, which resets connection settings: switch foreign keys back on. */
    export() { const bytes = this.db.export(); this.db.exec("PRAGMA foreign_keys = ON;"); return bytes; }
    foreignKeysOn() { return Number(this.db.exec("PRAGMA foreign_keys")[0].values[0][0]) === 1; }
    close() { this.db.close(); }
  }

  /** Turns database messages into friendly ones (Java: DbErrors). */
  function translate(e) {
    if (e instanceof ValidationError || e instanceof DatabaseError) return e;
    const m = String(e && e.message || e);
    const err = new DatabaseError(m.replace(/^Error:\s*/, ""));
    err.kind = /UNIQUE constraint/.test(m) ? "duplicate" : /FOREIGN KEY constraint/.test(m) ? "in_use" : /CHECK constraint/.test(m) ? "check" : /locked|cannot be (edited|removed)|proof of deletion/.test(m) ? "trigger" : "other";
    return err;
  }
  function explain(e, duplicateMsg, inUseMsg) {
    if (!(e instanceof DatabaseError)) return e;
    if (e.kind === "trigger") return new ValidationError(e.message);
    if (e.kind === "duplicate" && duplicateMsg) return new ValidationError(duplicateMsg);
    if (e.kind === "in_use" && inUseMsg) return new ValidationError(inUseMsg);
    return e;
  }

  // ------------------------------------------------------------------ DAOs
  const USER_SELECT = "SELECT u.user_id, u.username, u.password_hash, u.salt, u.role, u.club_id, c.club_name FROM app_user u LEFT JOIN club c ON c.club_id = u.club_id ";
  const mapUser = (r) => User.create(r.user_id, r.username, r.role, r.club_id == null ? null : Number(r.club_id), r.club_name);
  let DUMMY = null;

  class UserDao {
    constructor(db) { this.db = db; }
    /** Unknown usernames take as long as wrong passwords, so the screen never reveals which usernames exist. */
    async authenticate(username, password) {
      const row = this.db.get(USER_SELECT + "WHERE u.username = ?", [username == null ? "" : String(username).trim()]);
      if (!row) {
        if (!DUMMY) DUMMY = PasswordHasher.newSalt();
        await PasswordHasher.hash(String(password || ""), DUMMY);
        return null;
      }
      const ok = await PasswordHasher.verify(String(password || ""), row.salt, row.password_hash);
      return ok ? mapUser(row) : null;
    }
    reload(user) { const r = this.db.get(USER_SELECT + "WHERE u.user_id = ?", [user.id]); return r ? mapUser(r) : null; }
    countAdmins() { return Number(this.db.get("SELECT COUNT(*) AS n FROM app_user WHERE role = 'ADMIN'").n); }
    async createFirstAdmin(username, password) {
      if (this.countAdmins() > 0) throw new ValidationError("An admin account already exists.");
      await this.insert(username, password, "ADMIN", null);
    }
    async createCoordinator(actor, username, password, clubId) {
      if (!actor || !actor.canManageClubs()) throw new ValidationError("Only the admin can add coordinators.");
      if (!(Number(clubId) > 0)) throw new ValidationError("Choose the coordinator's club.");
      await this.insert(username, password, "COORDINATOR", Number(clubId));
    }
    removeCoordinator(actor, userId) {
      if (!actor || !actor.canManageClubs()) throw new ValidationError("Only the admin can remove coordinators.");
      try {
        const r = this.db.run("DELETE FROM app_user WHERE user_id = ? AND role = 'COORDINATOR'", [Number(userId)]);
        if (r.changes !== 1) throw new ValidationError("Choose a coordinator to remove.");
      } catch (e) { throw explain(e, null, "This coordinator has entered records, so the account is kept as part of the history."); }
    }
    async changeOwnPassword(user, oldPassword, newPassword) {
      if (!(await this.authenticate(user.username, oldPassword))) throw new ValidationError("Your current password is wrong.");
      await this.setPassword(user.id, newPassword);
    }
    async resetCoordinatorPassword(actor, userId, newPassword) {
      if (!actor || !actor.canManageClubs()) throw new ValidationError("Only the admin can reset passwords.");
      if (!this.db.get("SELECT 1 AS x FROM app_user WHERE user_id = ? AND role = 'COORDINATOR'", [Number(userId)])) throw new ValidationError("Choose a coordinator first.");
      await this.setPassword(Number(userId), newPassword);
    }
    async setPassword(userId, newPassword) {
      PasswordHasher.checkStrength(newPassword);
      const salt = PasswordHasher.newSalt();
      const hash = await PasswordHasher.hash(newPassword, salt);
      this.db.run("UPDATE app_user SET password_hash = ?, salt = ? WHERE user_id = ?", [hash, salt, userId]);
    }
    listCoordinators(actor) {
      if (!actor || !actor.canManageClubs()) throw new ValidationError("Only the admin can see coordinators.");
      return this.db.all("SELECT u.user_id, u.username, c.club_name FROM app_user u JOIN club c ON c.club_id = u.club_id WHERE u.role = 'COORDINATOR' ORDER BY c.club_name, u.username");
    }
    async insert(username, password, role, clubId) {
      PasswordHasher.checkUsername(username);
      PasswordHasher.checkStrength(password);
      const salt = PasswordHasher.newSalt();
      const hash = await PasswordHasher.hash(password, salt);
      this.insertHashed(String(username).trim(), hash, salt, role, clubId);
    }
    insertHashed(username, hash, salt, role, clubId) {
      try {
        return this.db.run("INSERT INTO app_user (username, password_hash, salt, role, club_id) VALUES (?, ?, ?, ?, ?)", [username, hash, salt, role, clubId]).id;
      } catch (e) { throw explain(e, "This username is already taken.", "That club does not exist."); }
    }
  }

  /** Clubs. Unlike the desktop version, every change checks the actor here too, not only on the screen. */
  class ClubDao {
    constructor(db, actor) { this.db = db; this.actor = actor; }
    guard() { if (!this.actor || !this.actor.canManageClubs()) throw new ValidationError("Only the admin can manage clubs."); }
    add(club) {
      this.guard(); validateClub(club);
      try { return this.db.run("INSERT INTO club (club_name, faculty_incharge, contact_email) VALUES (?, ?, ?)", [club.name, club.facultyIncharge, club.contactEmail]).id; }
      catch (e) { throw explain(e, "A club with this name already exists.", null); }
    }
    findById(id) { const r = this.db.get("SELECT * FROM club WHERE club_id = ?", [Number(id)]); return r ? mapClub(r) : null; }
    findAll() {
      if (this.actor && !this.actor.canManageClubs()) return this.db.all("SELECT * FROM club WHERE club_id = ?", [this.actor.clubId]).map(mapClub);
      return this.db.all("SELECT * FROM club ORDER BY club_name").map(mapClub);
    }
    update(club) {
      this.guard(); validateClub(club);
      try {
        const r = this.db.run("UPDATE club SET club_name = ?, faculty_incharge = ?, contact_email = ? WHERE club_id = ?", [club.name, club.facultyIncharge, club.contactEmail, Number(club.id)]);
        if (r.changes !== 1) throw new ValidationError("This club no longer exists.");
      } catch (e) { throw explain(e, "A club with this name already exists.", null); }
    }
    delete(id) {
      this.guard();
      try {
        const r = this.db.run("DELETE FROM club WHERE club_id = ?", [Number(id)]);
        if (r.changes !== 1) throw new ValidationError("This club no longer exists.");
      } catch (e) { throw explain(e, null, "This club still has events or coordinators. Remove those first."); }
    }
  }
  const mapClub = (r) => ({ id: r.club_id, name: r.club_name, facultyIncharge: r.faculty_incharge, contactEmail: r.contact_email });

  const EVENT_SELECT = "SELECT e.event_id, e.club_id, c.club_name, e.event_name, e.event_date FROM event e JOIN club c ON c.club_id = e.club_id ";
  const mapEvent = (r) => ({ id: r.event_id, clubId: r.club_id, clubName: r.club_name, name: r.event_name, date: r.event_date });
  class EventDao {
    constructor(db, user, today) { this.db = db; this.user = user; this.today = today || Dates.today(); }
    checkClub(clubId) { if (!this.user.canAccessClub(Number(clubId))) throw new ValidationError("You can only manage events for your own club."); }
    add(ev) {
      validateEvent(ev, this.today); this.checkClub(ev.clubId);
      try { return this.db.run("INSERT INTO event (club_id, event_name, event_date) VALUES (?, ?, ?)", [Number(ev.clubId), ev.name, ev.date]).id; }
      catch (e) { throw explain(e, "This club already has an event with this name on this date.", "That club does not exist."); }
    }
    findById(id) {
      const r = this.db.get(EVENT_SELECT + "WHERE e.event_id = ?", [Number(id)]);
      if (!r) return null;
      const e = mapEvent(r);
      return this.user.canAccessClub(e.clubId) ? e : null;
    }
    findAll() {
      const own = this.user.clubId;
      return this.db.all(EVENT_SELECT + (own == null ? "" : "WHERE e.club_id = ? ") + "ORDER BY e.event_date DESC, e.event_name", own == null ? [] : [own]).map(mapEvent);
    }
    hasCollections(id) { return !!this.db.get("SELECT 1 AS x FROM data_collection WHERE event_id = ? LIMIT 1", [Number(id)]); }
    update(ev) {
      validateEvent(ev, this.today);
      const existing = this.findById(ev.id);
      if (!existing) throw new ValidationError("This event no longer exists or is not in your club.");
      this.checkClub(ev.clubId);
      if (existing.clubId !== Number(ev.clubId) && this.hasCollections(ev.id)) throw new ValidationError("Data collections are recorded against this event, so it cannot move to another club.");
      if (existing.date !== ev.date && this.hasCollections(ev.id)) throw new ValidationError("Data collections are recorded against this event, so its date cannot change. Their delete-by dates depend on it.");
      try { this.db.run("UPDATE event SET club_id = ?, event_name = ?, event_date = ? WHERE event_id = ?", [Number(ev.clubId), ev.name, ev.date, Number(ev.id)]); }
      catch (e) { throw explain(e, "This club already has an event with this name on this date.", null); }
    }
    delete(id) {
      if (!this.findById(id)) throw new ValidationError("This event no longer exists or is not in your club.");
      try { this.db.run("DELETE FROM event WHERE event_id = ?", [Number(id)]); }
      catch (e) { throw explain(e, null, "Data collections are recorded against this event, so it cannot be removed."); }
    }
  }

  class CategoryDao {
    constructor(db) { this.db = db; }
    findAll() { return this.db.all("SELECT * FROM data_category ORDER BY category_id").map((r) => ({ id: r.category_id, name: r.name, sensitive: !!r.is_sensitive })); }
  }

  const COLL_SELECT = "SELECT d.*, e.event_name, e.event_date, e.club_id, c.club_name, "
    + "(SELECT group_concat(name, ', ') FROM (SELECT dc.name AS name FROM collection_category cc JOIN data_category dc ON dc.category_id = cc.category_id WHERE cc.collection_id = d.collection_id ORDER BY dc.category_id)) AS categories, "
    + "(SELECT group_concat(category_id) FROM (SELECT cc2.category_id FROM collection_category cc2 WHERE cc2.collection_id = d.collection_id ORDER BY cc2.category_id)) AS category_ids "
    + "FROM data_collection d JOIN event e ON e.event_id = d.event_id JOIN club c ON c.club_id = e.club_id ";
  function mapCollection(r) {
    const d = new DataCollection({
      id: r.collection_id, eventId: r.event_id, eventName: r.event_name, eventDate: r.event_date, clubId: r.club_id, clubName: r.club_name,
      purpose: r.purpose, source: r.source, recordCount: r.record_count, storageLocation: r.storage_location, collectedOn: r.collected_on,
      policyType: r.policy_type, policyDays: r.policy_days, policy: RetentionPolicy.of(r.policy_type, r.policy_days),
      deleted: r.status === "DELETED", createdBy: r.created_by, categoryNames: r.categories || "",
      categoryIds: r.category_ids ? String(r.category_ids).split(",").map(Number) : [], _deleteBy: r.delete_by
    });
    return d;
  }

  class CollectionDao {
    constructor(db, user, today) { this.db = db; this.user = user; this.today = today || Dates.today(); }
    loadEvent(eventId) {
      if (!(Number(eventId) > 0)) throw new ValidationError("Choose the event this data was collected for.");
      const ev = new EventDao(this.db, this.user, this.today).findById(eventId);
      if (!ev) throw new ValidationError("Choose one of your club's events.");
      return ev;
    }
    add(d) {
      const ev = this.loadEvent(d.eventId);
      d.eventDate = ev.date;
      d.validateAndApplyPolicy(this.today);
      return this.db.tx(() => {
        const id = this.db.run("INSERT INTO data_collection (event_id, purpose, source, record_count, storage_location, collected_on, policy_type, policy_days, delete_by, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [Number(d.eventId), d.purpose, d.source, d.recordCount, d.storageLocation, d.collectedOn, d.policy.type.name, d.policy.days, d.deleteBy, this.user.id]).id;
        this.insertCategories(id, d.categoryIds);
        d.id = id;
        return id;
      });
    }
    insertCategories(id, ids) { ids.forEach((c) => this.db.run("INSERT INTO collection_category (collection_id, category_id) VALUES (?, ?)", [id, c])); }
    findById(id) {
      const r = this.db.get(COLL_SELECT + "WHERE d.collection_id = ?", [Number(id)]);
      if (!r) return null;
      const d = mapCollection(r);
      return this.user.canAccessClub(d.clubId) ? d : null;
    }
    findAll() { return this.search(null, null, null); }
    /** Optional filters. DUE_SOON and OVERDUE are worked out from today, never stored. */
    search(clubId, status, text) {
      let sql = COLL_SELECT + "WHERE 1 = 1 ";
      const p = [];
      if (this.user.clubId != null) { sql += "AND e.club_id = ? "; p.push(this.user.clubId); }
      else if (clubId != null && clubId !== "") { sql += "AND e.club_id = ? "; p.push(Number(clubId)); }
      const today = this.today, soon = Dates.plusDays(today, DUE_SOON_DAYS);
      if (status === "DELETED") sql += "AND d.status = 'DELETED' ";
      else if (status === "OVERDUE") { sql += "AND d.status = 'ACTIVE' AND d.delete_by < ? "; p.push(today); }
      else if (status === "DUE_SOON") { sql += "AND d.status = 'ACTIVE' AND d.delete_by BETWEEN ? AND ? "; p.push(today, soon); }
      else if (status === "ACTIVE") { sql += "AND d.status = 'ACTIVE' AND d.delete_by > ? "; p.push(soon); }
      if (text != null && String(text).trim()) {
        sql += "AND (d.purpose LIKE ? ESCAPE '\\' OR e.event_name LIKE ? ESCAPE '\\' OR d.storage_location LIKE ? ESCAPE '\\') ";
        const like = "%" + String(text).trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_") + "%";
        p.push(like, like, like);
      }
      sql += "ORDER BY CASE d.status WHEN 'ACTIVE' THEN 0 ELSE 1 END, d.delete_by, d.collection_id";
      return this.db.all(sql, p).map(mapCollection);
    }
    findDeletion(id) {
      if (!this.findById(id)) throw new ValidationError("This record does not exist or is not in your club.");
      const r = this.db.get("SELECT l.*, u.username FROM deletion_log l JOIN app_user u ON u.user_id = l.deleted_by WHERE l.collection_id = ?", [Number(id)]);
      return r ? { collectionId: r.collection_id, deletedOn: r.deleted_on, method: r.method, remarks: r.remarks, deletedBy: r.username, loggedAt: r.logged_at } : null;
    }
    requireEditable(id) {
      const d = this.findById(id);
      if (!d) throw new ValidationError("This record does not exist or is not in your club.");
      if (d.deleted) throw new ValidationError("This collection is marked as deleted. It is locked as proof of deletion.");
      return d;
    }
    update(d) {
      const existing = this.requireEditable(d.id);
      const ev = this.loadEvent(d.eventId);
      d.eventDate = ev.date;
      d.validateAndApplyPolicy(this.today);
      if (existing.clubId !== ev.clubId) throw new ValidationError("A collection cannot be moved to another club's event.");
      try {
        this.db.tx(() => {
          const r = this.db.run("UPDATE data_collection SET event_id = ?, purpose = ?, source = ?, record_count = ?, storage_location = ?, collected_on = ?, policy_type = ?, policy_days = ?, delete_by = ?, updated_at = CURRENT_TIMESTAMP WHERE collection_id = ? AND status = 'ACTIVE'",
            [Number(d.eventId), d.purpose, d.source, d.recordCount, d.storageLocation, d.collectedOn, d.policy.type.name, d.policy.days, d.deleteBy, Number(d.id)]);
          if (r.changes !== 1) throw new ValidationError("This record was changed by someone else. Reload and try again.");
          this.db.run("DELETE FROM collection_category WHERE collection_id = ?", [Number(d.id)]);
          this.insertCategories(Number(d.id), d.categoryIds);
        });
      } catch (e) { throw explain(e, null, null); }
    }
    /** The log row and the status change are saved together or not at all. */
    markDeleted(record) {
      const d = this.requireEditable(record.collectionId);
      validateDeletion(record, d.collectedOn, this.today);
      try {
        this.db.tx(() => {
          const s = this.db.get("SELECT status FROM data_collection WHERE collection_id = ?", [d.id]);
          if (!s || s.status !== "ACTIVE") throw new ValidationError("This collection is already marked as deleted.");
          this.db.run("INSERT INTO deletion_log (collection_id, deleted_by, deleted_on, method, remarks) VALUES (?,?,?,?,?)", [d.id, this.user.id, record.deletedOn, record.method, record.remarks == null ? null : record.remarks]);
          const r = this.db.run("UPDATE data_collection SET status = 'DELETED', updated_at = CURRENT_TIMESTAMP WHERE collection_id = ? AND status = 'ACTIVE'", [d.id]);
          if (r.changes !== 1) throw new ValidationError("This collection is already marked as deleted.");
        });
      } catch (e) { throw explain(e, "This collection is already marked as deleted.", null); }
    }
    /** Removes a wrongly entered record. Admin only, never for a record already marked deleted. */
    delete(id) {
      if (!this.user.canRemoveEntries()) throw new ValidationError("Only the admin can remove a wrongly entered record.");
      this.requireEditable(id);
      try {
        const r = this.db.run("DELETE FROM data_collection WHERE collection_id = ? AND status = 'ACTIVE'", [Number(id)]);
        if (r.changes !== 1) throw new ValidationError("This record can no longer be removed.");
      } catch (e) { throw explain(e, null, null); }
    }
  }

  class ReportDao {
    constructor(db, user, today) { this.db = db; this.user = user; this.today = today || Dates.today(); }
    /** One query, four conditional sums. */
    dashboardCounts() {
      const today = this.today, soon = Dates.plusDays(today, DUE_SOON_DAYS);
      const own = this.user.clubId;
      const r = this.db.get("SELECT "
        + "COALESCE(SUM(d.status = 'ACTIVE' AND d.delete_by > ?),0) AS active_ok, "
        + "COALESCE(SUM(d.status = 'ACTIVE' AND d.delete_by BETWEEN ? AND ?),0) AS due_soon, "
        + "COALESCE(SUM(d.status = 'ACTIVE' AND d.delete_by < ?),0) AS overdue, "
        + "COALESCE(SUM(d.status = 'DELETED'),0) AS deleted "
        + "FROM data_collection d JOIN event e ON e.event_id = d.event_id " + (own == null ? "" : "WHERE e.club_id = ?"),
        own == null ? [soon, today, soon, today] : [soon, today, soon, today, own]);
      return { ACTIVE: Number(r.active_ok), DUE_SOON: Number(r.due_soon), OVERDUE: Number(r.overdue), DELETED: Number(r.deleted) };
    }
    sensitivePerClub() {
      const own = this.user.clubId;
      return this.db.all("SELECT c.club_name, SUM(d.record_count) AS people FROM data_collection d JOIN event e ON e.event_id = d.event_id JOIN club c ON c.club_id = e.club_id "
        + "WHERE d.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM collection_category cc JOIN data_category dc ON dc.category_id = cc.category_id WHERE cc.collection_id = d.collection_id AND dc.is_sensitive = 1) "
        + (own == null ? "" : "AND e.club_id = ? ") + "GROUP BY c.club_name ORDER BY c.club_name", own == null ? [] : [own]);
    }
  }

  // ------------------------------------------------------------------ the database console (as thavanai_app: no DROP, ALTER, CREATE or PRAGMA)
  const ALLOWED = /^\s*(select|insert|update|delete|with)\b/i;
  const SECRET_COLS = /\b(password_hash|salt)\b/i;
  const TABLE_NAMES = /\b(club|app_user|event|data_category|data_collection|collection_category|deletion_log)\b/gi;
  const FORBIDDEN = /\b(pragma|attach|detach|drop|alter|create|vacuum|reindex|analyze|load_extension|sqlite_master|sqlite_schema|sqlite_sequence)\b/i;
  function consoleRun(db, sql) {
    const s = String(sql || "").trim().replace(/;\s*$/, "");
    if (!s) throw new ValidationError("Type one SQL statement.");
    if (s.length > 2000) throw new ValidationError("That statement is too long for the console.");
    if (!ALLOWED.test(s) || FORBIDDEN.test(s)) throw new ValidationError("ERROR 1142: thavanai_app may only SELECT, INSERT, UPDATE and DELETE. It has no DROP, ALTER, CREATE or PRAGMA rights.");
    // structural checks run on the statement with its quoted text blanked out, so a value can't hide or fake a keyword
    const bare = s.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    if (/;/.test(bare)) throw new ValidationError("One statement at a time. The console runs a single statement, so nothing after a semicolon can slip through.");
    if (/\brecursive\b/i.test(bare)) throw new ValidationError("ERROR 1142: recursive queries are switched off in this console, so a runaway query cannot freeze the page.");
    if (/\b(randomblob|zeroblob|printf|format)\s*\(/i.test(bare)) throw new ValidationError("ERROR 1142: randomblob, zeroblob, printf and format are switched off in this console.");
    if ((bare.match(TABLE_NAMES) || []).length > 6) throw new ValidationError("ERROR 1142: at most six table references in one console statement.");
    if (SECRET_COLS.test(bare)) throw new ValidationError("ERROR 1143 (42000): SELECT command denied to user 'thavanai_app' for column '" + bare.match(SECRET_COLS)[1].toLowerCase() + "'. Password hashes and salts never leave the login code.");
    if (/\bapp_user\b/i.test(bare)) {
      if (/\b(insert|update|delete|replace)\b/i.test(bare)) throw new ValidationError("ERROR 1142 (42000): accounts can only be changed through the app (Clubs, events and coordinators), never straight in SQL.");
      if (/\b(union|intersect|except|with)\b/i.test(bare)) throw new ValidationError("ERROR 1142 (42000): UNION, INTERSECT, EXCEPT and WITH are not allowed on app_user, so its hidden columns cannot be renamed into view.");
    }
    let st;
    try { st = db.db.prepare(s); } catch (e) { throw translate(e); }
    try {
      const cols = st.getColumnNames();
      const hide = cols.map((c) => SECRET_COLS.test(c));
      const rows = [];
      while (st.step()) { const r = st.get(); rows.push(hide.some(Boolean) ? r.map((v, i) => hide[i] ? "(hidden)" : v) : r); if (rows.length >= 200) break; }
      const changes = cols.length ? 0 : db.db.getRowsModified();
      if (!cols.length) db.changed();
      return { columns: cols, rows, changes };
    } catch (e) { throw translate(e); } finally { st.free(); }
  }

  // ------------------------------------------------------------------ loading the database engine, checked byte for byte
  const WASM_SHA384 = "R/MwdqDq6/VfWyY+p8u2RAFr+3gVOgzxeJqDeDxCnpQaVqOc9tEFLu4wdQfoDpb5";
  const WASM_BYTES = 652953;
  /** Downloads the SQLite engine, checks its SHA-384 fingerprint, then starts it.
      onProgress(fraction, step) is optional and only reports; it cannot change what is loaded. */
  async function loadSql(base, onProgress) {
    const report = (f, step) => { if (typeof onProgress === "function") { try { onProgress(f, step); } catch (e) { /* display only */ } } };
    report(0, "download");
    const res = await fetch((base || "") + "vendor/sql-wasm.wasm", { credentials: "omit", cache: "force-cache" });
    if (!res.ok) throw new Error("could not download the database engine");
    let bytes;
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader(), parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        report(Math.min(1, got / WASM_BYTES) * 0.8, "download");
      }
      bytes = new Uint8Array(got);
      let at = 0;
      for (const p of parts) { bytes.set(p, at); at += p.length; }
    } else bytes = new Uint8Array(await res.arrayBuffer());
    report(0.82, "verify");
    const digest = b64(new Uint8Array(await crypto.subtle.digest("SHA-384", bytes)));
    if (digest !== WASM_SHA384) throw new Error("the database engine failed its integrity check");
    report(0.9, "start");
    const SQL = await global.initSqlJs({ wasmBinary: bytes });
    report(1, "ready");
    return SQL;
  }

  global.Thavanai = {
    loadSql, TextGuard, WASM_SHA384,
    ValidationError, DatabaseError, Dates, Role, Source, PolicyType, DeletionMethod, CollectionStatus,
    DUE_SOON_DAYS, MAX_RETENTION_DAYS, MAX_DAYS_FROM_EVENT, PersonalDataGuard, PasswordHasher,
    User, Admin, Coordinator, RetentionPolicy, FixedDaysPolicy, AfterEventPolicy, EndOfSemesterPolicy,
    DataCollection, Database, UserDao, ClubDao, EventDao, CategoryDao, CollectionDao, ReportDao,
    validateDeletion, consoleRun, SCHEMA
  };
})(window);
