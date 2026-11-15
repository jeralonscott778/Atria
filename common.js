/* Shared by every page */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} }
};
const session = { get token() { return store.get("atria-patient"); }, set token(v) { v ? store.set("atria-patient", v) : store.del("atria-patient"); } };

async function api(action, body, qs = "") {
  const r = await fetch(`/api/app?a=${action}${qs}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-patient": session.token || "", "x-staff": store.get("atria-staff") || "" },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong. Please try again."), { status: r.status });
  return j;
}

const doctorById = id => DATA.doctors.find(d => d.id === id);
const initials = name => name.replace(/^Dr\.?\s+/, "").split(/\s+/).map(w => w[0]).slice(0, 2).join("");
const t12 = t => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const money = n => `${DATA.hospital.currency} ${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const dObj = iso => new Date(iso + "T12:00:00Z");
function niceDate(iso, today) {
  const diff = Math.round((dObj(iso) - dObj(today)) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return dObj(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
const stamp = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* header and footer are the same everywhere */
(function chrome() {
  const h = DATA.hospital, top = $("#top"), foot = $("#foot");
  if (top) top.innerHTML = `<div class="wrap">
      <a class="logo" href="index.html">${esc(h.name)}</a>
      <nav aria-label="Main"><a href="index.html#doctors">Doctors</a><a href="index.html#how">How it works</a><a href="index.html#packages">Care packages</a><a href="portal.html">Patient portal</a></nav>
      <div class="top-right"><a href="portal.html" class="hide-s">${session.token ? "My portal" : "Sign in"}</a><a class="btn sm" href="index.html#doctors">Book a visit</a></div>
    </div>`;
  if (foot) foot.innerHTML = `<div class="wrap">
      <div class="foot-grid">
        <div><div class="logo">${esc(h.name)}</div><p class="muted" style="max-width:300px;margin-top:10px">Consultant-led care, booked in a minute and followed through properly.</p></div>
        <div class="foot-col"><b>Explore</b><a href="index.html#doctors">Find a doctor</a><a href="index.html#packages">Care packages</a><a href="portal.html">Patient portal</a><a href="staff.html">Staff sign-in</a></div>
        <div class="foot-col"><b>Contact</b><span>${esc(h.address || "Hospital address")}</span>${h.phone ? `<a href="tel:${esc(h.phone.replace(/[^\d+]/g, ""))}">${esc(h.phone)}</a>` : "<span>Phone number</span>"}${h.email ? `<a href="mailto:${esc(h.email)}">${esc(h.email)}</a>` : "<span>Email address</span>"}</div>
      </div>
      <div class="legal"><span>© ${new Date().getFullYear()} ${esc(h.fullName)}</span><span>In an emergency, call or come straight in — do not book online.</span></div>
    </div>`;
})();

/* sign-in / create-account form used on the portal and when booking */
function authHTML(mode, err) {
  const reg = mode === "register";
  return `<form class="form" id="auth-form" data-mode="${mode}">
      <div class="seg" role="group" aria-label="Account"><button type="button" data-auth="login" aria-pressed="${!reg}">Sign in</button><button type="button" data-auth="register" aria-pressed="${reg}">Create account</button></div>
      ${reg ? `<div class="field"><label for="au-name">Full name</label><input id="au-name" autocomplete="name" required></div>` : ""}
      <div class="field"><label for="au-phone">Phone number</label><input id="au-phone" type="tel" inputmode="tel" autocomplete="tel" required></div>
      <div class="field"><label for="au-pin">${reg ? "Choose a 6-digit PIN" : "PIN"}</label><input id="au-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="${reg ? "new-password" : "current-password"}" required></div>
      ${err ? `<p class="note err" role="alert">${esc(err)}</p>` : ""}
      <button class="btn">${reg ? "Create account" : "Sign in"}</button>
      ${reg ? "" : `<p class="small muted">Forgot your PIN? The front desk can reset it for you.</p>`}
    </form>`;
}
async function authSubmit(form) {
  const reg = form.dataset.mode === "register";
  const r = await api(reg ? "register" : "login", { name: reg ? $("#au-name").value : undefined, phone: $("#au-phone").value, pin: $("#au-pin").value });
  session.token = r.token;
  return r;
}
