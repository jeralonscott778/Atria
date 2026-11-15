/* Whole backend in one Vercel function:  /api/app?a=<action>
   Storage: Upstash Redis over REST. Without it the app runs in demo mode and saves nothing. */
const crypto = require("crypto");
const DATA = require("../data.js");
const env = process.env;

const HOSPITAL = env.HOSPITAL_NAME || DATA.hospital.fullName;
const CUR = DATA.hospital.currency || "GHS";
const TZ_HOURS = +(env.TZ_OFFSET_HOURS || 0);
const CC = env.DEFAULT_COUNTRY_CODE || "233";
const SLOT_MIN = 30;

/* ---------------- storage ---------------- */
const R_URL = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
const R_TOK = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
const HAS_DB = !!(R_URL && R_TOK);
const SECRET = env.SESSION_SECRET || R_TOK || "demo-secret";
const mem = global.__mem2 || (global.__mem2 = new Map());

function memCmd([c, k, ...a]) {
  c = c.toUpperCase();
  const set = () => { if (!(mem.get(k) instanceof Set)) mem.set(k, new Set()); return mem.get(k); };
  const list = () => { if (!Array.isArray(mem.get(k))) mem.set(k, []); return mem.get(k); };
  switch (c) {
    case "GET": return mem.has(k) ? mem.get(k) : null;
    case "SET": if (a.includes("NX") && mem.has(k)) return null; mem.set(k, String(a[0])); return "OK";
    case "DEL": return mem.delete(k) ? 1 : 0;
    case "MGET": return [k, ...a].map(x => (mem.has(x) ? mem.get(x) : null));
    case "INCR": { const n = (+mem.get(k) || 0) + 1; mem.set(k, String(n)); return n; }
    case "EXPIRE": return 1;
    case "SADD": set().add(a[0]); return 1;
    case "SREM": return set().delete(a[0]) ? 1 : 0;
    case "SMEMBERS": return [...set()];
    case "LPUSH": list().unshift(a[0]); return list().length;
    case "LTRIM": mem.set(k, list().slice(+a[0], +a[1] + 1)); return "OK";
    case "LRANGE": return list().slice(+a[0], +a[1] + 1);
  }
  throw new Error("Unsupported command " + c);
}
async function redis(...cmd) {
  if (!HAS_DB) return memCmd(cmd);
  const r = await fetch(R_URL, { method: "POST", headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const one = async (kind, id) => { const v = await redis("GET", `${kind}:${id}`); return v ? JSON.parse(v) : null; };
async function put(kind, o, indexes = []) {
  await redis("SET", `${kind}:${o.id}`, JSON.stringify(o));
  for (const k of indexes) await redis("SADD", k, o.id);
  return o;
}
async function many(kind, setKey) {
  const ids = await redis("SMEMBERS", setKey);
  if (!ids.length) return [];
  return (await redis("MGET", ...ids.map(i => `${kind}:${i}`))).filter(Boolean).map(x => JSON.parse(x));
}
async function rateOk(key, max, seconds) {
  const n = await redis("INCR", "rl:" + key);
  if (n === 1) await redis("EXPIRE", "rl:" + key, seconds);
  return n <= max;
}

/* ---------------- helpers ---------------- */
class Bad extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const rid = n => crypto.randomBytes(n).toString("base64url");
const nowISO = () => new Date().toISOString();
const localNow = () => new Date(Date.now() + TZ_HOURS * 3600e3);
const dayStr = (offset = 0) => new Date(localNow().getTime() + offset * 864e5).toISOString().slice(0, 10);
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
const digits = p => String(p || "").replace(/\D/g, "");
function e164(p) {
  const d = digits(p);
  if (String(p).trim().startsWith("+")) return "+" + d;
  if (d.startsWith("00")) return "+" + d.slice(2);
  if (d.startsWith("0")) return "+" + CC + d.slice(1);
  return "+" + (d.startsWith(CC) ? d : CC + d);
}
const clean = (s, max = 120) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f<>]/g, " ").trim().slice(0, max);
const baseUrl = req => env.SITE_URL || `https://${req.headers.host}`;
const ip = req => (req.headers["x-forwarded-for"] || "x").split(",")[0];
const doctor = id => DATA.doctors.find(d => d.id === id);
const t12 = t => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const niceDate = d => d === dayStr() ? "today" : d === dayStr(1) ? "tomorrow" : new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const money = n => `${CUR} ${Number(n).toFixed(2)}`;

/* ---------------- messages ---------------- */
const SMS_ON = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
async function sendMsg(to, body) {
  const entry = { at: nowISO(), to: e164(to), body, status: SMS_ON ? "sent" : "not sent (SMS not set up)" };
  if (SMS_ON) {
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: env.TWILIO_FROM, To: entry.to, Body: body })
      });
      if (!r.ok) entry.status = "failed (" + r.status + ")";
    } catch (e) { entry.status = "failed"; }
  }
  await redis("LPUSH", "outbox", JSON.stringify(entry));
  await redis("LTRIM", "outbox", 0, 199);
}

/* ---------------- auth ---------------- */
const hmac = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString("hex");
const patientToken = id => { const body = `${id}.${Date.now() + 30 * 864e5}`; return `${body}.${hmac("p:" + body)}`; };
async function requirePatient(req) {
  const [id, exp, sig] = String(req.headers["x-patient"] || "").split(".");
  if (!id || !sig || sig !== hmac(`p:${id}.${exp}`) || +exp < Date.now()) throw new Bad("Please sign in again.", 401);
  const acct = await one("acct", id);
  if (!acct) throw new Bad("Please sign in again.", 401);
  return acct;
}
const PIN = env.STAFF_PIN || (HAS_DB ? null : "0000");
const staffSig = day => crypto.createHmac("sha256", String(PIN) + SECRET).update("staff:" + day).digest("hex");
function requireStaff(req) {
  const t = req.headers["x-staff"];
  if (!PIN || !t || (t !== staffSig(dayStr()) && t !== staffSig(dayStr(-1)))) throw new Bad("Please sign in again.", 401);
}
const patientNames = acct => [acct.name, ...acct.family.map(f => f.name)];
function whoFor(acct, name) {
  const n = clean(name, 80) || acct.name;
  if (!patientNames(acct).includes(n)) throw new Bad("Choose yourself or someone on your family list.");
  return n;
}

/* ---------------- slots ---------------- */
function allSlots(doc, date) {
  if (!doc.days.includes(new Date(date + "T12:00:00Z").getUTCDay())) return [];
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3), out = [];
  const now = localNow(), nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (let m = toMin(doc.start); m < toMin(doc.end); m += SLOT_MIN) {
    if (date === dayStr() && m <= nowMin + 30) continue;
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}
const live = a => !["cancelled", "no_show"].includes(a.status);
async function freeSlots(doc, date, dayAppts) {
  if (!isDate(date) || date < dayStr() || date > dayStr(60)) return [];
  if ((await redis("SMEMBERS", "block:" + doc.id)).includes(date)) return [];
  const taken = new Set((dayAppts || (await many("appt", "day:" + date))).filter(a => a.doctorId === doc.id && live(a)).map(a => a.time));
  return allSlots(doc, date).filter(t => !taken.has(t));
}

/* ---------------- bundles ---------------- */
const byNew = (a, b) => (b.at || b.createdAt || "").localeCompare(a.at || a.createdAt || "");
async function bundle(acct) {
  const [appts, rx, bills, records, plans] = await Promise.all([many("appt", "a-appt:" + acct.id), many("rx", "a-rx:" + acct.id), many("bill", "a-bill:" + acct.id), many("rec", "a-rec:" + acct.id), many("plan", "a-plan:" + acct.id)]);
  return {
    account: { id: acct.id, name: acct.name, phone: acct.phone, family: acct.family },
    appts: appts.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), rx: rx.sort(byNew), bills: bills.sort(byNew), records: records.sort(byNew), plans: plans.sort(byNew),
    today: dayStr(), payOnline: !!env.PAYSTACK_SECRET_KEY
  };
}
async function addBill(acct, patient, desc, amount, extra = {}) {
  const b = { id: rid(8), acct: acct.id, phone: acct.phone, patient, desc: clean(desc, 140), amount: Math.round(+amount * 100) / 100, paid: false, at: nowISO(), ...extra };
  if (!(b.amount > 0)) throw new Bad("Enter an amount.");
  await put("bill", b, ["a-bill:" + acct.id, "bills:open"]);
  return b;
}
async function settleBill(b, method) {
  if (b.paid) return;
  Object.assign(b, { paid: true, paidAt: nowISO(), method });
  await put("bill", b); await redis("SREM", "bills:open", b.id);
  if (b.planId) { const p = await one("plan", b.planId); if (p && p.status === "pending") { p.status = "active"; p.startedAt = nowISO(); await put("plan", p); } }
  await sendMsg(b.phone, `${HOSPITAL}: we received ${money(b.amount)} for ${b.desc}. Thank you.`);
}

/* ---------------- actions ---------------- */
const actions = {
  /* ---- public ---- */
  async avail() { // first free slot per doctor over the next 10 days
    const out = {}, days = Array.from({ length: 10 }, (_, i) => dayStr(i));
    const appts = await Promise.all(days.map(d => many("appt", "day:" + d)));
    for (const doc of DATA.doctors) for (let i = 0; i < days.length && !out[doc.id]; i++) {
      const free = await freeSlots(doc, days[i], appts[i]);
      if (free.length) out[doc.id] = { date: days[i], time: free[0] };
    }
    return { avail: out, today: dayStr() };
  },
  async slots(req) {
    const doc = doctor(req.query.doctor), from = isDate(req.query.from) ? req.query.from : dayStr(), out = {};
    if (!doc) throw new Bad("Doctor not found.", 404);
    for (let i = 0; i < 14; i++) { const d = new Date(new Date(from + "T12:00:00Z").getTime() + i * 864e5).toISOString().slice(0, 10); out[d] = await freeSlots(doc, d); }
    return { slots: out, today: dayStr() };
  },

  /* ---- patient account ---- */
  async register(req) {
    if (!(await rateOk("reg:" + ip(req), 10, 3600))) throw new Bad("Too many tries. Please try later.", 429);
    const b = req.body, name = clean(b.name, 80), phone = e164(b.phone);
    if (name.length < 2) throw new Bad("Please enter your full name.");
    if (digits(b.phone).length < 7) throw new Bad("Please enter your phone number.");
    if (!/^\d{6}$/.test(b.pin || "")) throw new Bad("Choose a 6-digit PIN.");
    if (await redis("GET", "phone:" + phone)) throw new Bad("That phone number already has an account. Sign in instead.", 409);
    const salt = rid(12), acct = { id: rid(9), name, phone, salt, pinHash: hashPin(b.pin, salt), family: [], createdAt: nowISO() };
    await put("acct", acct); await redis("SET", "phone:" + phone, acct.id);
    return { token: patientToken(acct.id), ...(await bundle(acct)) };
  },
  async login(req) {
    const phone = e164(req.body.phone);
    if (!(await rateOk("login:" + phone, 6, 900))) throw new Bad("Too many tries. Wait 15 minutes or ask the front desk to reset your PIN.", 429);
    const id = await redis("GET", "phone:" + phone), acct = id && (await one("acct", id));
    if (!acct || hashPin(req.body.pin || "", acct.salt) !== acct.pinHash) throw new Bad("That phone number and PIN do not match.", 401);
    return { token: patientToken(acct.id), ...(await bundle(acct)) };
  },
  async me(req) { return bundle(await requirePatient(req)); },
  async familyadd(req) {
    const acct = await requirePatient(req), name = clean(req.body.name, 80), relation = clean(req.body.relation, 30);
    if (name.length < 2) throw new Bad("Enter their full name.");
    if (patientNames(acct).includes(name)) throw new Bad("That name is already on your list.");
    if (acct.family.length >= 8) throw new Bad("You can add up to 8 family members.");
    acct.family.push({ id: rid(5), name, relation }); await put("acct", acct);
    return bundle(acct);
  },
  async familyremove(req) {
    const acct = await requirePatient(req);
    acct.family = acct.family.filter(f => f.id !== req.body.id); await put("acct", acct);
    return bundle(acct);
  },
  async book(req) {
    const acct = await requirePatient(req), b = req.body, doc = doctor(b.doctorId);
    if (!doc) throw new Bad("Choose a doctor.");
    const type = b.type === "video" ? "video" : "clinic";
    if (type === "video" && !doc.video) throw new Bad(`${doc.name} does not offer video visits.`);
    if (!(await freeSlots(doc, b.date)).includes(b.time)) throw new Bad("That time is no longer free. Please pick another.", 409);
    const a = { id: rid(9), acct: acct.id, phone: acct.phone, acctName: acct.name, patient: whoFor(acct, b.patient), doctorId: doc.id, date: b.date, time: b.time, type, reason: clean(b.reason, 300), status: "booked", createdAt: nowISO(), reminded: false, summary: "" };
    if (type === "video") a.videoUrl = (env.VIDEO_BASE_URL || "https://meet.jit.si/") + `${HOSPITAL.replace(/\W+/g, "")}-${rid(8)}`;
    if (!(await redis("SET", `slot:${doc.id}:${a.date}:${a.time}`, a.id, "NX"))) throw new Bad("That time was just taken. Please pick another.", 409);
    await put("appt", a, ["day:" + a.date, "a-appt:" + acct.id]);
    await sendMsg(acct.phone, `${HOSPITAL}: ${a.patient} is booked with ${doc.name}, ${niceDate(a.date)} at ${t12(a.time)}${type === "video" ? " by video" : ""}. Manage it here: ${baseUrl(req)}/portal.html`);
    return { appt: a, ...(await bundle(acct)) };
  },
  async cancel(req) {
    const acct = await requirePatient(req), a = await one("appt", clean(req.body.id, 30));
    if (!a || a.acct !== acct.id) throw new Bad("Appointment not found.", 404);
    if (a.status !== "booked") throw new Bad("This appointment can no longer be cancelled online.");
    a.status = "cancelled"; await put("appt", a); await redis("DEL", `slot:${a.doctorId}:${a.date}:${a.time}`);
    return bundle(acct);
  },
  async refill(req) {
    const acct = await requirePatient(req), r = await one("rx", clean(req.body.id, 30));
    if (!r || r.acct !== acct.id) throw new Bad("Prescription not found.", 404);
    if (r.refill === "requested") throw new Bad("You have already asked for this refill.");
    r.refill = "requested"; r.refillAt = nowISO(); await put("rx", r, ["refills:open"]);
    return bundle(acct);
  },
  async enroll(req) {
    const acct = await requirePatient(req), pk = DATA.packages.find(p => p.id === req.body.packageId);
    if (!pk) throw new Bad("Choose a package.");
    const patient = whoFor(acct, req.body.patient);
    const plan = { id: rid(8), acct: acct.id, phone: acct.phone, patient, packageId: pk.id, name: pk.name, status: "pending", items: pk.items.map(label => ({ label, done: false })), at: nowISO() };
    const bill = await addBill(acct, patient, pk.name, pk.price, { planId: plan.id });
    plan.billId = bill.id;
    await put("plan", plan, ["a-plan:" + acct.id, "plans:all"]);
    await sendMsg(acct.phone, `${HOSPITAL}: ${patient} is enrolled in ${pk.name}. It becomes active once ${money(pk.price)} is paid: ${baseUrl(req)}/portal.html`);
    return bundle(acct);
  },
  async pay(req) {
    const acct = await requirePatient(req), b = await one("bill", clean(req.body.id, 30));
    if (!b || b.acct !== acct.id || b.paid) throw new Bad("There is nothing to pay.");
    if (!env.PAYSTACK_SECRET_KEY) throw new Bad("Online payment is not set up. Please pay at the desk.");
    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST", headers: { Authorization: "Bearer " + env.PAYSTACK_SECRET_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${digits(acct.phone)}@patients.${req.headers.host.split(":")[0]}`, amount: Math.round(b.amount * 100), currency: CUR, channels: ["mobile_money", "card"], callback_url: `${baseUrl(req)}/api/app?a=payverify&bill=${b.id}` })
    });
    const j = await r.json();
    if (!j.status) throw new Bad("Payment could not be started. Please pay at the desk.", 502);
    b.ref = j.data.reference; await put("bill", b);
    return { url: j.data.authorization_url };
  },
  async payverify(req, res) {
    const b = await one("bill", clean(req.query.bill, 30)), ref = clean(req.query.reference || req.query.trxref, 80);
    if (b && !b.paid && ref && ref === b.ref) {
      const j = await (await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(ref), { headers: { Authorization: "Bearer " + env.PAYSTACK_SECRET_KEY } })).json();
      if (j.status && j.data.status === "success" && j.data.amount >= Math.round(b.amount * 100)) await settleBill(b, "online");
    }
    res.statusCode = 302; res.setHeader("Location", "/portal.html#bills"); res.end();
    return null;
  },

  /* ---- staff ---- */
  async stafflogin(req) {
    if (!(await rateOk("slogin:" + ip(req), 8, 600))) throw new Bad("Too many tries. Wait ten minutes.", 429);
    if (!PIN) throw new Bad("Set STAFF_PIN in the Vercel project settings first.", 403);
    if (String(req.body.pin || "") !== String(PIN)) throw new Bad("Wrong PIN.", 401);
    return { token: staffSig(dayStr()) };
  },
  async day(req) {
    requireStaff(req);
    const date = isDate(req.query.date) ? req.query.date : dayStr();
    const [appts, bills, refills, plans, outbox] = await Promise.all([many("appt", "day:" + date), many("bill", "bills:open"), many("rx", "refills:open"), many("plan", "plans:all"), redis("LRANGE", "outbox", 0, 29)]);
    const blocked = {};
    for (const d of DATA.doctors) blocked[d.id] = (await redis("SMEMBERS", "block:" + d.id)).includes(date);
    return {
      date, today: dayStr(), appts: appts.sort((a, b) => a.time.localeCompare(b.time)), bills: bills.sort(byNew), refills, blocked,
      plans: plans.filter(p => ["pending", "active"].includes(p.status)).sort(byNew), outbox: outbox.map(x => JSON.parse(x)),
      flags: { db: HAS_DB, sms: SMS_ON, pay: !!env.PAYSTACK_SECRET_KEY, defaultPin: !env.STAFF_PIN }
    };
  },
  async patient(req) {
    requireStaff(req);
    const id = await redis("GET", "phone:" + e164(req.query.phone)), acct = id && (await one("acct", id));
    if (!acct) throw new Bad("No account with that phone number.", 404);
    return bundle(acct);
  },
  async apptupdate(req) {
    requireStaff(req);
    const b = req.body, a = await one("appt", clean(b.id, 30));
    if (!a) throw new Bad("Appointment not found.", 404);
    if (["booked", "arrived", "done", "no_show", "cancelled"].includes(b.status)) a.status = b.status;
    if (!live(a)) await redis("DEL", `slot:${a.doctorId}:${a.date}:${a.time}`);
    if (b.summary) {
      a.summary = clean(b.summary, 3000); a.status = "done";
      await put("rec", { id: rid(8), acct: a.acct, patient: a.patient, doctorId: a.doctorId, title: `Visit summary — ${doctor(a.doctorId).name}`, text: a.summary, at: nowISO() }, ["a-rec:" + a.acct]);
      await sendMsg(a.phone, `${HOSPITAL}: the summary of ${a.patient}'s visit is in your portal: ${baseUrl(req)}/portal.html`);
    }
    await put("appt", a);
    return { appt: a };
  },
  async rxadd(req) {
    requireStaff(req);
    const b = req.body, acct = await one("acct", clean(b.acct, 30));
    if (!acct) throw new Bad("Patient not found.", 404);
    if (clean(b.medicine).length < 2) throw new Bad("Enter the medicine.");
    await put("rx", { id: rid(8), acct: acct.id, phone: acct.phone, patient: whoFor(acct, b.patient), doctorId: doctor(b.doctorId) ? b.doctorId : "", medicine: clean(b.medicine, 100), dose: clean(b.dose, 140), refill: "", at: nowISO() }, ["a-rx:" + acct.id]);
    return bundle(acct);
  },
  async refilldone(req) {
    requireStaff(req);
    const r = await one("rx", clean(req.body.id, 30));
    if (!r) throw new Bad("Not found.", 404);
    r.refill = "ready"; r.refillAt = nowISO(); await put("rx", r); await redis("SREM", "refills:open", r.id);
    await sendMsg(r.phone, `${HOSPITAL}: ${r.medicine} for ${r.patient} is ready to collect.`);
    return { ok: true };
  },
  async recadd(req) {
    requireStaff(req);
    const b = req.body, acct = await one("acct", clean(b.acct, 30));
    if (!acct) throw new Bad("Patient not found.", 404);
    if (clean(b.title).length < 2 || clean(b.text, 3000).length < 2) throw new Bad("Add a title and the result.");
    await put("rec", { id: rid(8), acct: acct.id, patient: whoFor(acct, b.patient), doctorId: "", title: clean(b.title, 100), text: clean(b.text, 3000), at: nowISO() }, ["a-rec:" + acct.id]);
    await sendMsg(acct.phone, `${HOSPITAL}: a new result is in your portal: ${baseUrl(req)}/portal.html`);
    return bundle(acct);
  },
  async billadd(req) {
    requireStaff(req);
    const b = req.body, acct = await one("acct", clean(b.acct, 30));
    if (!acct) throw new Bad("Patient not found.", 404);
    if (clean(b.desc).length < 2) throw new Bad("Say what the bill is for.");
    const bill = await addBill(acct, whoFor(acct, b.patient), b.desc, b.amount);
    await sendMsg(acct.phone, `${HOSPITAL}: a bill of ${money(bill.amount)} for ${bill.desc} is in your portal: ${baseUrl(req)}/portal.html`);
    return bundle(acct);
  },
  async billpaid(req) {
    requireStaff(req);
    const b = await one("bill", clean(req.body.id, 30));
    if (!b) throw new Bad("Not found.", 404);
    await settleBill(b, "desk");
    return { ok: true };
  },
  async planitem(req) {
    requireStaff(req);
    const p = await one("plan", clean(req.body.id, 30)), i = +req.body.index;
    if (!p || !p.items[i]) throw new Bad("Not found.", 404);
    if (p.status !== "active") throw new Bad("This plan is not active yet — it has not been paid.");
    p.items[i].done = !p.items[i].done;
    if (p.items.every(x => x.done)) p.status = "completed";
    await put("plan", p);
    return { ok: true };
  },
  async pinreset(req) {
    requireStaff(req);
    const acct = await one("acct", clean(req.body.acct, 30));
    if (!acct) throw new Bad("Patient not found.", 404);
    if (!/^\d{6}$/.test(req.body.pin || "")) throw new Bad("The new PIN must be 6 digits.");
    acct.salt = rid(12); acct.pinHash = hashPin(req.body.pin, acct.salt); await put("acct", acct);
    return { ok: true };
  },
  async block(req) {
    requireStaff(req);
    const doc = doctor(req.body.doctorId), date = req.body.date;
    if (!doc || !isDate(date)) throw new Bad("Bad request.");
    await redis(req.body.on ? "SADD" : "SREM", "block:" + doc.id, date);
    return { ok: true };
  },
  async export(req, res) {
    requireStaff(req);
    const rows = [];
    for (let i = -30; i <= 30; i++) rows.push(...(await many("appt", "day:" + dayStr(i))));
    if (req.query.format === "json") return { exportedAt: nowISO(), appointments: rows };
    const cell = x => { let s = String(x == null ? "" : x); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const csv = ["date,time,doctor,patient,account,phone,type,status,reason,summary"].concat(rows.map(a => [a.date, a.time, (doctor(a.doctorId) || {}).name, a.patient, a.acctName, a.phone, a.type, a.status, a.reason, a.summary].map(cell).join(","))).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.statusCode = 200; res.end(csv);
    return null;
  },
  async cron(req) {
    if (env.CRON_SECRET && req.headers.authorization !== "Bearer " + env.CRON_SECRET) throw new Bad("Forbidden", 403);
    let reminded = 0, missed = 0;
    for (const a of await many("appt", "day:" + dayStr(1))) if (a.status === "booked" && !a.reminded) {
      await sendMsg(a.phone, `${HOSPITAL}: reminder — ${a.patient} sees ${doctor(a.doctorId).name} tomorrow at ${t12(a.time)}${a.type === "video" ? " by video" : ""}. Details: ${baseUrl(req)}/portal.html`);
      a.reminded = true; await put("appt", a); reminded++;
    }
    for (const a of await many("appt", "day:" + dayStr(-1))) if (a.status === "booked") { a.status = "no_show"; await put("appt", a); missed++; }
    return { reminded, missed };
  }
};

module.exports = async (req, res) => {
  try {
    const fn = actions[req.query.a];
    if (!fn) throw new Bad("Unknown action.", 404);
    if (typeof req.body === "string") { try { req.body = JSON.parse(req.body); } catch (e) { req.body = {}; } }
    req.body = req.body || {};
    const out = await fn(req, res);
    if (out !== null) { res.statusCode = 200; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(out)); }
  } catch (e) {
    res.statusCode = e.status || 500; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.status ? e.message : "Something went wrong. Please try again." }));
    if (!e.status) console.error(e);
  }
};
