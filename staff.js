/* Staff dashboard */
(function () {
  const app = $("#app"), TABS = [["day", "Appointments"], ["patients", "Patients"], ["refills", "Refills"], ["bills", "Bills"], ["plans", "Care plans"], ["msgs", "Messages"], ["tools", "Tools"]];
  let tok = store.get("atria-staff"), D = null, P = null, tab = "day", date = "", note = "", err = "", offline = false;
  $("#s-logo").textContent = DATA.hospital.name;
  document.title = `Staff — ${DATA.hospital.fullName}`;
  const docName = id => (doctorById(id) || {}).name || "—";
  const STATUS = { booked: ["Booked", "blue"], arrived: ["Arrived", "blue"], done: ["Done", "ok"], cancelled: ["Cancelled", "red"], no_show: ["No-show", "red"] };
  const list = (rows, empty) => `<div class="list">${rows.length ? rows.join("") : `<p class="empty">${empty}</p>`}</div>`;
  const whoSelect = (id, acct) => `<div class="field"><label for="${id}">For</label><select id="${id}">${[acct.name, ...acct.family.map(f => f.name)].map(n => `<option>${esc(n)}</option>`).join("")}</select></div>`;

  async function load() {
    try { D = await api("day", null, date ? "&date=" + date : ""); offline = false; store.set("atria-staff-cache", D); }
    catch (e) { if (e.status === 401) { tok = null; store.del("atria-staff"); return render(); } offline = true; D = D || store.get("atria-staff-cache"); }
    if (!D) return;
    date = D.date; $("#net").hidden = !offline;
    const el = document.activeElement;
    if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && app.contains(el) && el.id !== "date") return;
    render();
  }

  function apptItem(a) {
    const [label, cls] = STATUS[a.status], open = ["booked", "arrived"].includes(a.status);
    return `<div class="item"><div><h3>${t12(a.time)} · ${esc(a.patient)}</h3><p>${esc(docName(a.doctorId))} · ${a.type === "video" ? "Video" : "Clinic"} · account ${esc(a.acctName)} <a href="tel:${esc(a.phone)}">${esc(a.phone)}</a>${a.reason ? " · “" + esc(a.reason) + "”" : ""}</p></div>
      <div class="acts"><span class="tag ${cls}">${label}</span>${a.status === "booked" ? `<button class="btn sm" data-status="arrived" data-id="${a.id}">Arrived</button><button class="btn sm quiet" data-status="no_show" data-id="${a.id}">No-show</button>` : ""}${a.type === "video" && open ? `<a class="btn sm line" href="${esc(a.videoUrl)}" target="_blank" rel="noopener">Open video room</a>` : ""}<button class="btn sm quiet" data-open="${esc(a.phone)}">Patient file</button></div>
      ${open ? `<details class="box" style="grid-column:1/-1;margin-top:0"><summary>Write the visit summary and finish</summary><form class="form" data-summary="${a.id}"><div class="field"><label for="sum-${a.id}">Summary the patient will read</label><textarea id="sum-${a.id}" required></textarea></div><button class="btn sm" style="align-self:flex-start">Save and finish visit</button></form></details>` : a.summary ? `<div class="body">${esc(a.summary)}</div>` : ""}</div>`;
  }

  function render() {
    $("#out").hidden = !tok;
    if (!tok) { app.innerHTML = `<div class="auth"><p class="eyebrow">Staff only</p><h1 style="margin:10px 0 26px">Staff sign-in.</h1><form class="form" id="slogin"><div class="field"><label for="pin">Staff PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="current-password" required></div>${err ? `<p class="note err" role="alert">${esc(err)}</p>` : ""}<button class="btn">Sign in</button></form></div>`; return; }
    if (!D) { app.innerHTML = `<p class="muted">Loading…</p>`; return; }
    const A = D.appts, n = s => A.filter(a => a.status === s).length, f = D.flags;
    let h = `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap"><div><p class="eyebrow">Staff</p><h1 style="margin-top:10px">${D.date === D.today ? "Today" : niceDate(D.date, D.today)}.</h1></div><div class="field"><label for="date" class="small">Day</label><input class="date-in" type="date" id="date" value="${D.date}"></div></div>`;
    if (!f.db) h += `<p class="note warn" style="margin-top:16px">Demo mode: no database is connected, so nothing is saved. Add “Upstash for Redis” to this Vercel project to go live.</p>`;
    if (f.db && f.defaultPin) h += `<p class="note warn" style="margin-top:16px">Set STAFF_PIN in the Vercel project settings.</p>`;
    if (!f.sms) h += `<p class="note warn" style="margin-top:8px">Text messages are not being sent yet (no SMS account connected). See Messages for what would go out.</p>`;
    if (note) h += `<p class="note ok" role="status" style="margin-top:8px">${esc(note)}</p>`;
    if (err) h += `<p class="note err" role="alert" style="margin-top:8px">${esc(err)}</p>`;
    h += `<div class="kpis">${[["Booked", n("booked")], ["Arrived", n("arrived")], ["Done", n("done")], ["Video visits", A.filter(a => a.type === "video" && a.status !== "cancelled").length]].map(([l, x]) => `<div class="kpi"><b>${x}</b><span>${l}</span></div>`).join("")}</div>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}${k === "refills" && D.refills.length ? ` (${D.refills.length})` : ""}${k === "bills" && D.bills.length ? ` (${D.bills.length})` : ""}</button>`).join("")}</div>`;

    if (tab === "day") h += list(A.map(apptItem), "No appointments on this day.") +
      `<details class="box"><summary>Doctor leave on this day</summary><div class="checks">${DATA.doctors.map(d => `<label><input type="checkbox" data-block="${d.id}" ${D.blocked[d.id] ? "checked" : ""}> ${esc(d.name)} is away — stop new bookings</label>`).join("")}</div></details>`;

    if (tab === "patients") {
      h += `<form class="inline" id="find" style="margin-top:22px"><div class="field"><label for="p-phone">Find a patient by phone number</label><input id="p-phone" type="tel" value="${esc(P ? P.account.phone : "")}" required></div><button class="btn">Open file</button></form>`;
      if (P) {
        const a = P.account;
        h += `<h2 class="sub-h">${esc(a.name)}</h2><p class="muted">${esc(a.phone)}${a.family.length ? " · family: " + a.family.map(x => esc(x.name)).join(", ") : ""}</p>
          <details class="box"><summary>Add a prescription</summary><form class="form" id="rx"><div class="row2">${whoSelect("rx-who", a)}<div class="field"><label for="rx-doc">Doctor</label><select id="rx-doc">${DATA.doctors.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></div></div><div class="row2"><div class="field"><label for="rx-med">Medicine</label><input id="rx-med" required></div><div class="field"><label for="rx-dose">How to take it</label><input id="rx-dose"></div></div><button class="btn sm" style="align-self:flex-start">Add prescription</button></form></details>
          <details class="box"><summary>Send a result</summary><form class="form" id="rec"><div class="row2">${whoSelect("rec-who", a)}<div class="field"><label for="rec-title">Title</label><input id="rec-title" placeholder="Full blood count" required></div></div><div class="field"><label for="rec-text">Result in plain words</label><textarea id="rec-text" required></textarea></div><button class="btn sm" style="align-self:flex-start">Send to portal</button></form></details>
          <details class="box"><summary>Add a bill</summary><form class="form" id="bill"><div class="row2">${whoSelect("bill-who", a)}<div class="field"><label for="bill-amt">Amount (${esc(DATA.hospital.currency)})</label><input id="bill-amt" type="number" min="0" step="0.01" required></div></div><div class="field"><label for="bill-desc">What it is for</label><input id="bill-desc" required></div><button class="btn sm" style="align-self:flex-start">Add bill</button></form></details>
          <details class="box"><summary>Reset portal PIN</summary><form class="inline" id="pinr"><div class="field"><label for="new-pin">New 6-digit PIN</label><input id="new-pin" inputmode="numeric" maxlength="6" required></div><button class="btn sm">Reset PIN</button></form></details>
          <h2 class="sub-h">Appointments</h2>` + list(P.appts.slice().reverse().slice(0, 8).map(x => `<div class="item"><div><h3>${niceDate(x.date, P.today)}, ${t12(x.time)}</h3><p>${esc(x.patient)} · ${esc(docName(x.doctorId))} · ${x.type}</p></div><div class="acts"><span class="tag ${STATUS[x.status][1]}">${STATUS[x.status][0]}</span></div></div>`), "None.") +
          `<h2 class="sub-h">Prescriptions</h2>` + list(P.rx.map(r => `<div class="item"><div><h3>${esc(r.medicine)}</h3><p>${esc(r.dose)} · ${esc(r.patient)} · ${stamp(r.at)}</p></div></div>`), "None.") +
          `<h2 class="sub-h">Bills</h2>` + list(P.bills.map(b => `<div class="item"><div><h3>${money(b.amount)}</h3><p>${esc(b.desc)} · ${esc(b.patient)}</p></div><div class="acts">${b.paid ? `<span class="tag ok">Paid</span>` : `<button class="btn sm" data-paid="${b.id}">Paid at desk</button>`}</div></div>`), "None.");
      }
    }
    if (tab === "refills") h += list(D.refills.map(r => `<div class="item"><div><h3>${esc(r.medicine)}</h3><p>${esc(r.dose)} · ${esc(r.patient)} · ${esc(r.phone)}</p></div><div class="acts"><button class="btn sm" data-refilldone="${r.id}">Ready — tell patient</button></div></div>`), "No refill requests.");
    if (tab === "bills") h += list(D.bills.map(b => `<div class="item"><div><h3>${money(b.amount)}</h3><p>${esc(b.desc)} · ${esc(b.patient)} · ${esc(b.phone)} · ${stamp(b.at)}</p></div><div class="acts"><button class="btn sm" data-paid="${b.id}">Paid at desk</button></div></div>`), "No unpaid bills.");
    if (tab === "plans") h += list(D.plans.map(p => `<div class="item"><div><h3>${esc(p.name)}</h3><p>${esc(p.patient)} · ${esc(p.phone)}</p></div><div class="acts"><span class="tag ${p.status === "active" ? "ok" : ""}">${p.status === "active" ? "Active" : "Awaiting payment"}</span></div><div class="checks">${p.items.map((i, k) => `<label class="${i.done ? "done" : ""}"><input type="checkbox" data-plan="${p.id}" data-index="${k}" ${i.done ? "checked" : ""} ${p.status === "active" ? "" : "disabled"}> ${esc(i.label)}</label>`).join("")}</div></div>`), "No one is enrolled in a plan yet.");
    if (tab === "msgs") h += list(D.outbox.map(m => `<div class="item"><div><h3>${esc(m.to)}</h3><p>${esc(m.body)}</p></div><div class="acts"><span class="tag">${esc(m.status)}</span></div></div>`), "No messages yet.");
    if (tab === "tools") h += `<h2 class="sub-h">Export and backup</h2><p class="muted" style="max-width:520px;margin:8px 0 18px">Appointments from the last 30 days to the next 30. Keep a copy so the hospital never depends on one system.</p><div class="cta"><button class="btn line" data-export="csv">Download spreadsheet (CSV)</button><button class="btn line" data-export="json">Download backup (JSON)</button></div>`;
    app.innerHTML = h; note = ""; err = "";
  }

  async function act(fn, ok) {
    try { const r = await fn(); if (r && r.account) P = r; note = ok || ""; } catch (e) { err = e.message; }
    if (document.activeElement) document.activeElement.blur();
    await load();
  }
  const openPatient = phone => act(async () => { P = await api("patient", null, "&phone=" + encodeURIComponent(phone)); tab = "patients"; });

  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (b.id === "out") { tok = null; store.del("atria-staff"); store.del("atria-staff-cache"); D = P = null; return render(); }
    if (d.tab) { tab = d.tab; return render(); }
    if (d.status) return act(() => api("apptupdate", { id: d.id, status: d.status }));
    if (d.open) return openPatient(d.open);
    if (d.paid) return act(async () => { await api("billpaid", { id: d.paid }); if (P) P = await api("patient", null, "&phone=" + encodeURIComponent(P.account.phone)); }, "Marked as paid.");
    if (d.refilldone) return act(() => api("refilldone", { id: d.refilldone }), "Patient told the medicine is ready.");
    if (d.export) return act(async () => {
      const r = await fetch(`/api/app?a=export&format=${d.export}`, { headers: { "x-staff": tok } });
      if (!r.ok) throw new Error("Export failed.");
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = `appointments-${D.today}.${d.export}`; a.click();
    });
  });
  document.addEventListener("change", e => {
    const d = e.target.dataset;
    if (e.target.id === "date") { date = e.target.value; e.target.blur(); return load(); }
    if (d.block) return act(() => api("block", { doctorId: d.block, date: D.date, on: e.target.checked }), e.target.checked ? "New bookings stopped for that doctor on this day." : "Bookings reopened.");
    if (d.plan) return act(() => api("planitem", { id: d.plan, index: +d.index }));
  });
  document.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target, v = id => $("#" + id).value.trim();
    if (f.id === "slogin") return api("stafflogin", { pin: v("pin") }).then(r => { tok = r.token; store.set("atria-staff", tok); load(); }, x => { err = x.message; render(); });
    if (f.dataset.summary) return act(() => api("apptupdate", { id: f.dataset.summary, summary: f.querySelector("textarea").value }), "Visit finished. The summary is in the patient's portal.");
    if (f.id === "find") return openPatient(v("p-phone"));
    const acct = P && P.account.id;
    if (f.id === "rx") return act(() => api("rxadd", { acct, patient: v("rx-who"), doctorId: v("rx-doc"), medicine: v("rx-med"), dose: v("rx-dose") }), "Prescription added.");
    if (f.id === "rec") return act(() => api("recadd", { acct, patient: v("rec-who"), title: v("rec-title"), text: v("rec-text") }), "Result sent to the patient's portal.");
    if (f.id === "bill") return act(() => api("billadd", { acct, patient: v("bill-who"), desc: v("bill-desc"), amount: v("bill-amt") }), "Bill added.");
    if (f.id === "pinr") return act(() => api("pinreset", { acct, pin: v("new-pin") }), "PIN reset. Tell the patient their new PIN.");
  });

  setInterval(() => { if (tok) load(); }, 25000);
  if (tok) load(); else render();
})();
