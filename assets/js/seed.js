/*
 * DEMO ONLY (same data as tools/DemoData.java). The passwords below are the published demo logins;
 * they are stored here only as PBKDF2 hashes computed ahead of time, never as text.
 */
(function (T) {
  "use strict";
  const HASHES = {
 "admin": {
  "salt": "RjkayBSiJP7PfWPktLMdQA==",
  "hash": "d9OlIZJYfFUPGo90MKhEmQUHTH4f0uWdItcSZryImr4="
 },
 "coding_lead": {
  "salt": "AfmDhbqCY7EWC00XSXAx1A==",
  "hash": "CS9h+/O7Qq3K62JL1IYNqtSMTsL1ZdKT8pNAOV80IRQ="
 },
 "robotics_lead": {
  "salt": "EDcvSfV7jwEnZmSCYYerug==",
  "hash": "oM4O2nmqOOxsxdWpQmoSZ1JgZbZAChEqx4imeZwqqwM="
 },
 "arts_lead": {
  "salt": "oEJmWiQXyYSuZdg0a6yUUQ==",
  "hash": "1P96WLzj+Yw+9VgPzWcjNpybMe7SaOCuTO/5CsJ6z50="
 },
 "nss_lead": {
  "salt": "pZd9Fv5shKvjozTDqajRYg==",
  "hash": "KPnqKYt0b5jueEpBPY5cJFYI2bEC1r6bzhb1sUHXskg="
 }
};
  T.loadDemoData = function (db) {
    const today = T.Dates.today();
    const users = new T.UserDao(db);
    if (users.countAdmins() > 0) throw new T.ValidationError("Database already has an admin. Demo data not loaded.");
    const put = (u, role, club) => users.insertHashed(u, HASHES[u].hash, HASHES[u].salt, role, club);
    db.tx(() => {
      put("admin", "ADMIN", null);
      const admin = new T.Admin(1, "admin");
      const clubs = new T.ClubDao(db, admin);
      const coding = clubs.add({ name: "Coding Club", facultyIncharge: "Dr. K. Meenakshi", contactEmail: "codingclub@rajalakshmi.edu.in" });
      const robotics = clubs.add({ name: "Robotics Club", facultyIncharge: "Mr. S. Arvind", contactEmail: "robotics@rajalakshmi.edu.in" });
      const arts = clubs.add({ name: "Fine Arts Club", facultyIncharge: "Ms. R. Divya", contactEmail: "finearts@rajalakshmi.edu.in" });
      const nss = clubs.add({ name: "NSS Unit", facultyIncharge: "Dr. P. Senthil", contactEmail: "nss@rajalakshmi.edu.in" });
      const lead = {
        coding: new T.Coordinator(put("coding_lead", "COORDINATOR", coding), "coding_lead", coding, "Coding Club"),
        robotics: new T.Coordinator(put("robotics_lead", "COORDINATOR", robotics), "robotics_lead", robotics, "Robotics Club"),
        arts: new T.Coordinator(put("arts_lead", "COORDINATOR", arts), "arts_lead", arts, "Fine Arts Club"),
        nss: new T.Coordinator(put("nss_lead", "COORDINATOR", nss), "nss_lead", nss, "NSS Unit")
      };
      const ev = new T.EventDao(db, admin, today);
      const E = (club, name, date) => ev.add({ clubId: club, name, date });
      const sprint = E(coding, "Code Sprint 2026", "2026-08-22"), hack = E(coding, "Hack the Campus", "2026-10-10"), git = E(coding, "Git and GitHub Workshop", "2026-11-15");
      const roborace = E(robotics, "RoboRace", "2026-09-12"), arduino = E(robotics, "Arduino Bootcamp", "2026-10-28");
      const rangoli = E(arts, "Onam Rangoli Contest", "2026-08-29"), photowalk = E(arts, "Photography Walk", "2026-10-02");
      const blood = E(nss, "Blood Donation Camp", "2026-09-05"), trees = E(nss, "Tree Plantation Drive", "2026-10-20");
      const add = (by, eventId, purpose, source, count, storage, collected, type, days, cats) => new T.CollectionDao(db, by, today).add(new T.DataCollection({
        eventId, purpose, source, recordCount: count, storageLocation: storage, collectedOn: collected, policy: T.RetentionPolicy.of(type, days), categoryIds: cats }));
      const NAME = 1, REGNO = 2, DEPT = 3, EMAIL = 4, PHONE = 5, PHOTO = 6, ADDRESS = 7, GOVT_ID = 8, PAYMENT = 9;
      add(lead.coding, sprint, "Participant registration and team allocation", "GOOGLE_FORM", 214, "Club Google Drive / Code Sprint / Responses sheet", "2026-08-10", "AFTER_EVENT", 30, [NAME, REGNO, DEPT, EMAIL, PHONE]);
      const certs = add(lead.coding, sprint, "Certificate generation for participants", "GOOGLE_FORM", 186, "Club Google Drive / Code Sprint / Certificates", "2026-08-23", "FIXED_DAYS", 60, [NAME, REGNO, EMAIL]);
      add(lead.coding, hack, "Team registration and problem statement choice", "GOOGLE_FORM", 132, "Club Google Drive / Hack the Campus / Teams", "2026-09-25", "AFTER_EVENT", 30, [NAME, REGNO, DEPT, EMAIL, PHONE]);
      add(lead.coding, hack, "Prize money transfer to winning teams", "EMAIL", 12, "Treasurer's email / Hack the Campus prizes", "2026-10-11", "FIXED_DAYS", 30, [NAME, PHONE, PAYMENT]);
      add(lead.coding, git, "Workshop seat booking", "GOOGLE_FORM", 96, "Club Google Drive / Git Workshop / Bookings", "2026-11-02", "AFTER_EVENT", 15, [NAME, REGNO, EMAIL]);
      add(lead.robotics, roborace, "Team registration and bot inspection slots", "GOOGLE_FORM", 58, "Robotics Drive / RoboRace 2026", "2026-09-01", "END_OF_SEMESTER", null, [NAME, REGNO, DEPT, PHONE]);
      add(lead.robotics, arduino, "Bootcamp feedback form", "GOOGLE_FORM", 41, "Robotics Drive / Arduino Bootcamp / Feedback", "2026-10-29", "FIXED_DAYS", 90, [NAME, EMAIL]);
      add(lead.arts, rangoli, "Contest entries with rangoli photographs", "WHATSAPP", 37, "Fine Arts WhatsApp group media and Drive folder", "2026-08-29", "FIXED_DAYS", 45, [NAME, REGNO, PHOTO]);
      const consent = add(lead.arts, photowalk, "Photo consent forms from participants", "PAPER_FORM", 25, "Fine Arts cupboard, Room B-204", "2026-09-28", "AFTER_EVENT", 14, [NAME, REGNO, PHONE]);
      add(lead.nss, blood, "Donor registration and follow-up contact", "PAPER_FORM", 148, "NSS office file, Admin Block", "2026-09-05", "FIXED_DAYS", 30, [NAME, DEPT, PHONE, ADDRESS]);
      add(lead.nss, trees, "Volunteer list for transport", "WHATSAPP", 64, "NSS volunteers WhatsApp group", "2026-10-15", "END_OF_SEMESTER", null, [NAME, REGNO, PHONE]);
      const ids = add(lead.nss, blood, "ID check for donors under the age rule", "PAPER_FORM", 148, "NSS office file, Admin Block", "2026-09-03", "FIXED_DAYS", 7, [NAME, GOVT_ID]);
      new T.CollectionDao(db, lead.coding, today).markDeleted({ collectionId: certs, deletedOn: "2026-10-20", method: "FILE_DELETED", remarks: "Certificate sheet deleted after all certificates were emailed" });
      new T.CollectionDao(db, lead.arts, today).markDeleted({ collectionId: consent, deletedOn: "2026-10-18", method: "PAPER_SHREDDED", remarks: "Shredded in the presence of the faculty in-charge" });
      new T.CollectionDao(db, lead.nss, today).markDeleted({ collectionId: ids, deletedOn: "2026-09-09", method: "PAPER_SHREDDED", remarks: null });
    });
  };
  T.DEMO_LOGINS = [["admin", "Admin@2026", "Admin"], ["coding_lead", "Coding@2026", "Coding Club"], ["robotics_lead", "Robot@2026", "Robotics Club"], ["arts_lead", "Arts@2026", "Fine Arts Club"], ["nss_lead", "NssUnit@2026", "NSS Unit"]];
})(window.Thavanai);
