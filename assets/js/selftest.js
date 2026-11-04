/*
 * The 61 loophole checks from test/thavanai/test/SelfTest.java, run against a fresh database
 * filled with the demo data. Each check either does something that must succeed,
 * or tries something that the application or the database must refuse.
 */
(function (T) {
  "use strict";
  T.runSelfTest = async function (SQL, out) {
    const db = new T.Database(SQL);
    T.loadDemoData(db);
    const today = T.Dates.today();
    const d = (s) => s;
    let passed = 0, failed = 0;
    const log = (type, text, extra) => out({ type, text, extra });

    const users = new T.UserDao(db);
    const admin = await users.authenticate("admin", "Admin@2026");
    const coding = await users.authenticate("coding_lead", "Coding@2026");
    const robotics = await users.authenticate("robotics_lead", "Robot@2026");
    const codingDao = new T.CollectionDao(db, coding, today);
    const adminDao = new T.CollectionDao(db, admin, today);
    const roboCollection = new T.CollectionDao(db, robotics, today).findAll()[0].id;
    const codingEvent = new T.EventDao(db, coding, today).findAll().find((e) => e.name === "Hack the Campus").id;

    const truth = (b) => { if (!b) throw new Error("condition was false"); };
    const equal = (a, b) => { if (a !== b) throw new Error("expected " + b + " but was " + a); };
    async function expectRule(fn) {
      try { await fn(); } catch (e) {
        if (e instanceof T.ValidationError) { log("note", "message: " + e.message); return; }
        throw e;
      }
      throw new Error("action was allowed but should have been refused");
    }
    function expectSqlBlock(sql) {
      try { db.db.run(sql); } catch (e) { log("note", "database said: " + String(e.message || e).replace(/\s+/g, " ")); return; }
      throw new Error("database accepted: " + sql);
    }
    async function check(name, fn) {
      try { await fn(); passed++; log("pass", name); }
      catch (e) { failed++; log("fail", name, String(e && e.message || e)); }
    }
    const section = (name) => log("section", name);
    const sample = (eventId, collected, type, days, cats) => new T.DataCollection({
      eventId, purpose: "Self test collection", source: "GOOGLE_FORM", recordCount: 10, storageLocation: "Test drive folder",
      collectedOn: collected, policy: T.RetentionPolicy.of(type, days), categoryIds: cats || [] });

    section("Login and passwords");
    await check("correct password logs in", async () => truth(!!(await users.authenticate("admin", "Admin@2026"))));
    await check("wrong password is refused", async () => truth(!(await users.authenticate("admin", "admin2026"))));
    await check("unknown username is refused", async () => truth(!(await users.authenticate("nobody", "Admin@2026"))));
    await check("SQL injection in username is refused", async () => truth(!(await users.authenticate("' OR '1'='1' -- ", "x"))));
    await check("SQL injection in password is refused", async () => truth(!(await users.authenticate("admin", "' OR '1'='1"))));
    await check("weak password is rejected", () => expectRule(() => users.createCoordinator(admin, "weak_user", "password", 1)));
    await check("duplicate username is rejected", () => expectRule(() => users.createCoordinator(admin, "coding_lead", "Another@2026", 1)));
    await check("coordinator cannot create accounts", () => expectRule(() => users.createCoordinator(coding, "sneaky", "Sneaky@2026", 1)));
    await check("second admin cannot be created through first-run", () => expectRule(() => users.createFirstAdmin("admin2", "Admin2@2026")));
    await check("passwords are not stored in plain text", () => truth(Number(db.get("SELECT COUNT(*) AS n FROM app_user WHERE password_hash LIKE '%Admin@2026%'").n) === 0));
    await check("password change needs the current password", () => expectRule(() => users.changeOwnPassword(coding, "wrong", "NewPass@2026")));
    await check("password change and reset work", async () => {
      await users.changeOwnPassword(robotics, "Robot@2026", "Robot@2027");
      truth(!!(await users.authenticate("robotics_lead", "Robot@2027")));
      await users.resetCoordinatorPassword(admin, robotics.id, "Robot@2026");
      truth(!!(await users.authenticate("robotics_lead", "Robot@2026")));
    });
    await check("coordinator cannot reset passwords", () => expectRule(() => users.resetCoordinatorPassword(coding, robotics.id, "Hacked@2026")));

    section("Club scoping");
    await check("coordinator sees only own club", () => truth(codingDao.findAll().every((x) => x.clubName === "Coding Club")));
    await check("coordinator cannot open another club's record", () => truth(codingDao.findById(roboCollection) === null));
    await check("coordinator cannot mark another club's record deleted", () => expectRule(() => codingDao.markDeleted({ collectionId: roboCollection, deletedOn: today, method: "FILE_DELETED", remarks: null })));
    await check("coordinator cannot add events for another club", () => expectRule(() => new T.EventDao(db, coding, today).add({ clubId: 2, name: "Fake event", date: today })));
    await check("coordinator cannot remove entries", () => expectRule(() => codingDao.delete(codingDao.findAll()[0].id)));

    section("Input rules");
    await check("future collection date is rejected", () => expectRule(() => codingDao.add(sample(codingEvent, T.Dates.plusDays(today, 1), "FIXED_DAYS", 30, [1]))));
    await check("no data categories is rejected", () => expectRule(() => codingDao.add(sample(codingEvent, d("2026-10-01"), "FIXED_DAYS", 30, []))));
    await check("more than 365 days retention is rejected", () => expectRule(() => codingDao.add(sample(codingEvent, d("2026-10-01"), "FIXED_DAYS", 400, [1]))));
    await check("after-event policy ending before collection is rejected", () => expectRule(() => codingDao.add(sample(codingEvent, d("2026-10-30"), "AFTER_EVENT", 5, [1]))));
    await check("collection far from its event is rejected", () => expectRule(() => codingDao.add(sample(codingEvent, d("2026-01-02"), "FIXED_DAYS", 30, [1]))));
    await check("zero people is rejected", () => expectRule(() => { const x = sample(codingEvent, d("2026-10-01"), "FIXED_DAYS", 30, [1]); x.recordCount = 0; return codingDao.add(x); }));
    await check("blank purpose is rejected", () => expectRule(() => { const x = sample(codingEvent, d("2026-10-01"), "FIXED_DAYS", 30, [1]); x.purpose = "   "; return codingDao.add(x); }));
    await check("phone number typed into purpose is rejected", () => expectRule(() => { const x = sample(codingEvent, d("2026-10-01"), "FIXED_DAYS", 30, [1]); x.purpose = "Call 98765 43210 for queries"; return codingDao.add(x); }));
    await check("email typed into storage location is rejected", () => expectRule(() => { const x = sample(codingEvent, d("2026-10-01"), "FIXED_DAYS", 30, [1]); x.storageLocation = "sent to priya.k@gmail.com"; return codingDao.add(x); }));
    await check("register number typed into purpose is rejected", () => expectRule(() => { const x = sample(codingEvent, d("2026-10-01"), "FIXED_DAYS", 30, [1]); x.purpose = "Winner list: 231001065 and others"; return codingDao.add(x); }));
    await check("normal text with a year is allowed", () => T.PersonalDataGuard.check("Purpose", "Registration for Hackathon 2026, 132 teams"));

    section("Retention policies");
    await check("fixed days: 1 Oct + 30 = 31 Oct", () => equal(T.RetentionPolicy.of("FIXED_DAYS", 30).deleteBy("2026-10-01", "2026-10-10"), "2026-10-31"));
    await check("after event: 10 Oct + 30 = 9 Nov", () => equal(T.RetentionPolicy.of("AFTER_EVENT", 30).deleteBy("2026-09-25", "2026-10-10"), "2026-11-09"));
    await check("end of semester: March -> 31 May", () => equal(T.RetentionPolicy.of("END_OF_SEMESTER", null).deleteBy("2026-03-10", "2026-03-10"), "2026-05-31"));
    await check("end of semester: July -> 30 Nov", () => equal(T.RetentionPolicy.of("END_OF_SEMESTER", null).deleteBy("2026-07-01", "2026-07-01"), "2026-11-30"));
    await check("end of semester: December -> next 31 May", () => equal(T.RetentionPolicy.of("END_OF_SEMESTER", null).deleteBy("2026-12-05", "2026-12-05"), "2027-05-31"));
    await check("leap year: 1 Feb 2028 + 30 = 2 Mar 2028", () => equal(T.RetentionPolicy.of("FIXED_DAYS", 30).deleteBy("2028-02-01", "2028-02-01"), "2028-03-02"));

    section("Create, update, delete");
    let newId = 0;
    await check("valid collection is saved with computed delete-by date", () => {
      newId = codingDao.add(sample(codingEvent, d("2026-10-01"), "FIXED_DAYS", 30, [1, 4]));
      equal(codingDao.findById(newId).deleteBy, "2026-10-31");
    });
    await check("update recalculates delete-by date", () => {
      const x = codingDao.findById(newId); x.policy = T.RetentionPolicy.of("FIXED_DAYS", 10); codingDao.update(x);
      equal(codingDao.findById(newId).deleteBy, "2026-10-11");
    });
    await check("update replaces categories", () => {
      const x = codingDao.findById(newId); x.categoryIds = [5]; codingDao.update(x);
      equal(codingDao.findById(newId).categoryNames, "Phone number");
    });
    await check("admin can remove a wrong ACTIVE entry, categories go with it", () => {
      adminDao.delete(newId);
      truth(adminDao.findById(newId) === null);
      truth(Number(db.get("SELECT COUNT(*) AS n FROM collection_category WHERE collection_id = ?", [newId]).n) === 0);
    });

    section("Proof of deletion");
    const target = codingDao.search(null, "OVERDUE", null)[0].id;
    await check("deletion date before collection is rejected", () => expectRule(() => codingDao.markDeleted({ collectionId: target, deletedOn: "2026-01-01", method: "FILE_DELETED", remarks: null })));
    await check("method Other without remarks is rejected", () => expectRule(() => codingDao.markDeleted({ collectionId: target, deletedOn: today, method: "OTHER", remarks: "" })));
    await check("mark as deleted works", () => {
      codingDao.markDeleted({ collectionId: target, deletedOn: today, method: "FORM_RESPONSES_DELETED", remarks: "test" });
      truth(codingDao.findById(target).deleted);
      truth(!!codingDao.findDeletion(target));
    });
    await check("marking the same record twice is rejected", () => expectRule(() => codingDao.markDeleted({ collectionId: target, deletedOn: today, method: "FILE_DELETED", remarks: null })));
    await check("a deleted record cannot be updated in the app", () => expectRule(() => codingDao.update(codingDao.findById(target))));
    await check("a deleted record cannot be removed in the app", () => expectRule(() => adminDao.delete(target)));
    await check("trigger blocks direct SQL UPDATE of a deleted record", () => expectSqlBlock("UPDATE data_collection SET status = 'ACTIVE' WHERE collection_id = " + target));
    await check("trigger blocks direct SQL DELETE of a deleted record", () => expectSqlBlock("DELETE FROM data_collection WHERE collection_id = " + target));
    await check("trigger blocks editing the deletion log", () => expectSqlBlock("UPDATE deletion_log SET deleted_on = '2026-01-01' WHERE collection_id = " + target));
    await check("trigger blocks removing the deletion log", () => expectSqlBlock("DELETE FROM deletion_log WHERE collection_id = " + target));

    section("Database constraints");
    await check("CHECK blocks zero people inserted directly", () => expectSqlBlock("INSERT INTO data_collection (event_id, purpose, source, record_count, storage_location, collected_on, policy_type, policy_days, delete_by, created_by) VALUES (" + codingEvent + ", 'x', 'OTHER', 0, 'x', '2026-10-01', 'FIXED_DAYS', 10, '2026-10-11', 1)"));
    await check("CHECK blocks retention over 365 days inserted directly", () => expectSqlBlock("INSERT INTO data_collection (event_id, purpose, source, record_count, storage_location, collected_on, policy_type, policy_days, delete_by, created_by) VALUES (" + codingEvent + ", 'x', 'OTHER', 5, 'x', '2026-10-01', 'FIXED_DAYS', 10, '2028-10-11', 1)"));
    await check("CHECK blocks a coordinator with no club", () => expectSqlBlock("INSERT INTO app_user (username, password_hash, salt, role, club_id) VALUES ('x1','h','s','COORDINATOR',NULL)"));
    await check("club with events cannot be removed", () => expectRule(() => new T.ClubDao(db, admin).delete(1)));
    await check("event with collections cannot be removed", () => expectRule(() => new T.EventDao(db, admin, today).delete(codingEvent)));
    await check("event date cannot change once collections exist", () => expectRule(() => {
      const ev = new T.EventDao(db, admin, today).findById(codingEvent); ev.date = T.Dates.plusDays(ev.date, 3); new T.EventDao(db, admin, today).update(ev);
    }));
    await check("coordinator who entered records cannot be removed", () => expectRule(() => users.removeCoordinator(admin, coding.id)));

    section("Reports and search");
    await check("dashboard counts add up to all records", () => {
      const c = new T.ReportDao(db, admin, today).dashboardCounts();
      truth(c.ACTIVE + c.DUE_SOON + c.OVERDUE + c.DELETED === adminDao.findAll().length);
    });
    await check("overdue list is all ACTIVE and past due", () => truth(adminDao.search(null, "OVERDUE", null).every((x) => !x.deleted && x.deleteBy < today)));
    await check("status filters split records without overlap", () => {
      let total = 0; ["ACTIVE", "DUE_SOON", "OVERDUE", "DELETED"].forEach((s) => { total += adminDao.search(null, s, null).length; });
      truth(total === adminDao.findAll().length);
    });
    await check("searching for % does not match everything", () => truth(adminDao.search(null, null, "%").length === 0));
    await check("text search finds by event name", () => truth(adminDao.search(null, null, "RoboRace").length > 0));

    db.close();
    log("result", "RESULT: " + passed + " passed, " + failed + " failed", { passed, failed });
    return { passed, failed };
  };
})(window.Thavanai);
