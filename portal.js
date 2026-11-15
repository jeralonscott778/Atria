/* Patient portal */
(function () {
  const app = $("#app"), TABS = [["overview", "Overview"], ["appointments", "Appointments"], ["family", "Family"], ["prescriptions", "Prescriptions"], ["records", "Records"], ["bills", "Bills"], ["plans", "Care plans"]];
  const wantEnroll = new URLSearchParams(location.search).get("enroll");
  let me = null, tab = (location.hash || "").slice(1), authMode = "login", msg = "", err = "";
  if (!TABS.some(t => t[0] === tab)) tab = wantEnroll ? "plans" : "overview";
  document.title = `Patient portal — ${DATA.hospital.fullName}`;

  const docName = id => (doctorById(id) || {}).name || DATA.hospital.fullName;
  const who = () => [me.account.name, ...me.account.family.map(f => f.name)];
  const whoSelect = id => `<div class="field"><label for="${id}">For</label><select id="${id}">${who().map(n => `<option>${esc(n)}</option>`).join("")}</select></div>`;
  const STATUS = { booked: ["Booked", "blue"], arrived: ["Arrived", "blue"], done: ["Completed", "ok"], cancelled: ["Cancelled", "red"], no_show: ["Missed", "red"] };

  function apptItem(a, upcoming) {
    const [label, cls] = STATUS[a.status];
    return `<div class="item"><div><h3>${esc(docName(a.doctorId))}</h3><p>${niceDate(a.date, me.today)}, ${t12(a.time)} · ${a.type === "video" ? "Video visit" : "In clinic"} · for ${esc(a.patient)}</p></div>
      <div class="acts">${upcoming && a.type === "video" && a.videoUrl ? `<a class="btn sm" href="${esc(a.videoUrl)}" target="_blank" rel="noopener">Join video visit</a>` : ""}${upcoming ? `<button class="btn sm danger" data-cancel="${a.id}">Cancel</button>` : `<span class="tag ${cls}">${label}</span>`}</div></div>`;
  }
  function billItem(b) {
    return `<div class="item"><div><h3>${money(b.amount)}</h3><p>${esc(b.desc)} · for ${esc(b.patient)} · ${stamp(b.at)}</p></div>
      <div class="acts">${b.paid ? `<span class="tag ok">Paid</span>` : me.payOnline ? `<button class="btn sm" data-pay="${b.id}">Pay now</button>` : `<span class="tag">Pay at the desk</span>`}</div></div>`;
  }
  function rxItem(r) {
    return `<div class="item"><div><h3>${esc(r.medicine)}</h3><p>${esc(r.dose)}${r.dose ? " · " : ""}for ${esc(r.patient)} · ${esc(docName(r.doctorId))} · ${stamp(r.at)}</p></div>
      <div class="acts">${r.refill === "requested" ? `<span class="tag blue">Refill requested</span>` : `${r.refill === "ready" ? `<span class="tag ok">Ready to collect</span>` : ""}<button class="btn sm line" data-refill="${r.id}">Request refill</button>`}</div></div>`;
  }
  function planItem(p) {
    const done = p.items.filter(i => i.done).length, tag = { pending: ["Awaiting payment", ""], active: ["Active", "ok"], completed: ["Completed", "ok"], cancelled: ["Cancelled", "red"] }[p.status];
    return `<div class="item"><div><h3>${esc(p.name)}</h3><p>For ${esc(p.patient)} · ${done} of ${p.items.length} done</p><div class="progress"><i style="width:${(done / p.items.length) * 100}%"></i></div></div>
      <div class="acts"><span class="tag ${tag[1]}">${tag[0]}</span></div>
      <div class="checks">${p.items.map(i => `<label class="${i.done ? "done" : ""}"><input type="checkbox" disabled ${i.done ? "checked" : ""}> ${esc(i.label)}</label>`).join("")}</div></div>`;
  }
  const list = (rows, empty) => `<div class="list">${rows.length ? rows.join("") : `<p class="empty">${empty}</p>`}</div>`;

  function render() {
    if (!me) {
      app.innerHTML = `<div class="auth"><p class="eyebrow">Patient portal</p><h1 style="margin:10px 0 26px">${authMode === "register" ? "Create your account." : "Welcome back."}</h1>${authHTML(authMode, err)}</div>`;
      return;
    }
    const up = me.appts.filter(a => a.status === "booked" && a.date >= me.today), past = me.appts.filter(a => !up.includes(a)).reverse();
    const unpaid = me.bills.filter(b => !b.paid), ready = me.rx.filter(r => r.refill === "ready");
    let h = `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap"><div><p class="eyebrow">Patient portal</p><h1 style="margin-top:10px">Hello, ${esc(me.account.name.split(" ")[0])}.</h1></div><button class="btn sm quiet" data-out>Sign out</button></div>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div>`;
    if (msg) h += `<p class="note ok" role="status" style="margin-top:16px">${esc(msg)}</p>`;
    if (err) h += `<p class="note err" role="alert" style="margin-top:16px">${esc(err)}</p>`;

    if (tab === "overview") {
      h += `<h2 class="sub-h">Next appointment</h2>` + list(up.slice(0, 1).map(a => apptItem(a, true)), `Nothing booked. <a class="arrow" href="index.html#doctors" style="margin-left:8px">Find a doctor</a>`);
      const todo = [...unpaid.map(billItem), ...ready.map(rxItem)];
      h += `<h2 class="sub-h">Needs your attention</h2>` + list(todo, "You are all caught up.");
      if (me.records[0]) h += `<h2 class="sub-h">Latest record</h2>` + list([recItem(me.records[0])], "");
    }
    if (tab === "appointments") h += `<h2 class="sub-h">Upcoming</h2>` + list(up.map(a => apptItem(a, true)), "Nothing booked.") + `<p style="margin-top:18px"><a class="btn" href="index.html#doctors">Book a visit</a></p><h2 class="sub-h">Past</h2>` + list(past.map(a => apptItem(a, false)), "No past visits yet.");
    if (tab === "family") h += `<h2 class="sub-h">People you can book for</h2>` + list([`<div class="item"><div><h3>${esc(me.account.name)}</h3><p>Account holder · ${esc(me.account.phone)}</p></div></div>`, ...me.account.family.map(f => `<div class="item"><div><h3>${esc(f.name)}</h3><p>${esc(f.relation || "Family")}</p></div><div class="acts"><button class="btn sm danger" data-unfam="${f.id}">Remove</button></div></div>`)], "") +
      `<form class="inline" id="fam" style="margin-top:22px"><div class="field"><label for="f-name">Full name</label><input id="f-name" required></div><div class="field"><label for="f-rel">Relationship</label><select id="f-rel"><option>Child</option><option>Parent</option><option>Spouse</option><option>Sibling</option><option>Other</option></select></div><button class="btn">Add family member</button></form>`;
    if (tab === "prescriptions") h += `<h2 class="sub-h">Your prescriptions</h2>` + list(me.rx.map(rxItem), "No prescriptions yet. They appear here after a visit.");
    if (tab === "records") h += `<h2 class="sub-h">Results and visit summaries</h2>` + list(me.records.map(recItem), "Nothing here yet. Your doctor's summary appears after each visit.");
    if (tab === "bills") h += `<h2 class="sub-h">To pay</h2>` + list(unpaid.map(billItem), "Nothing to pay.") + `<h2 class="sub-h">Paid</h2>` + list(me.bills.filter(b => b.paid).map(billItem), "No payments yet.");
    if (tab === "plans") h += `<h2 class="sub-h">Your care plans</h2>` + list(me.plans.map(planItem), "You are not enrolled in a plan yet.") +
      `<h2 class="sub-h">Enrol in a plan</h2><div class="list">${DATA.packages.map(p => `<form class="item" data-enroll="${p.id}" ${wantEnroll === p.id ? 'style="background:var(--soft);padding-left:14px;padding-right:14px"' : ""}><div><h3>${esc(p.name)}</h3><p>${money(p.price)} ${esc(p.per)} · ${esc(p.blurb)}</p></div><div class="acts inline">${whoSelect("e-" + p.id)}<button class="btn sm">Enrol</button></div></form>`).join("")}</div>`;
    app.innerHTML = h;
  }
  function recItem(r) { return `<div class="item"><div><h3>${esc(r.title)}</h3><p>For ${esc(r.patient)} · ${stamp(r.at)}</p></div><div class="body">${esc(r.text)}</div></div>`; }

  async function run(fn, okMsg) {
    msg = ""; err = "";
    try { const r = await fn(); if (r && r.account) me = r; msg = okMsg || ""; }
    catch (e) { err = e.message; if (e.status === 401) { session.token = null; me = null; err = ""; } }
    render();
  }

  app.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (d.auth) { authMode = d.auth; err = ""; return render(); }
    if (d.tab) { tab = d.tab; msg = ""; err = ""; history.replaceState(null, "", "#" + tab); return render(); }
    if ("out" in d) { session.token = null; me = null; return render(); }
    if (d.cancel) { if (!d.sure) { d.sure = 1; b.textContent = "Tap again to cancel"; return; } return run(() => api("cancel", { id: d.cancel }), "Appointment cancelled."); }
    if (d.refill) return run(() => api("refill", { id: d.refill }), "Refill requested. We will message you when it is ready.");
    if (d.unfam) return run(() => api("familyremove", { id: d.unfam }));
    if (d.pay) return run(async () => { location.href = (await api("pay", { id: d.pay })).url; });
  });
  app.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target;
    if (f.id === "auth-form") return run(() => authSubmit(f));
    if (f.id === "fam") return run(() => api("familyadd", { name: $("#f-name").value, relation: $("#f-rel").value }), "Added.");
    if (f.dataset.enroll) return run(() => api("enroll", { packageId: f.dataset.enroll, patient: $("#e-" + f.dataset.enroll).value }), "Enrolled. Pay the bill to activate the plan — it is under Bills.");
  });

  if (session.token) run(() => api("me")); else render();
})();
