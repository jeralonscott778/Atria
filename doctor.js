/* Doctor profile + booking */
(function () {
  const doc = doctorById(new URLSearchParams(location.search).get("id"));
  const box = $("#book");
  if (!doc) { $("#profile").innerHTML = `<h1>Doctor not found</h1><p class="muted">Go back and choose from the list.</p>`; box.hidden = true; return; }
  document.title = `${doc.name} — ${DATA.hospital.fullName}`;
  const s = { slots: null, today: "", date: null, time: null, type: "clinic", me: null, authMode: "login", err: "", busy: false, done: null };

  $("#profile").innerHTML = `
    <span class="mono lg" aria-hidden="true">${esc(initials(doc.name))}</span>
    <h1>${esc(doc.name)}</h1>
    <p class="eyebrow">${esc(doc.title)}</p>
    <p style="max-width:520px;font-size:17px;margin-top:22px">${esc(doc.bio)}</p>
    <ul class="facts">
      <li><span>Specialty</span><b style="font-weight:400">${esc(doc.specialty)}</b></li>
      <li><span>In clinic</span><b style="font-weight:400">${doc.days.map(d => DAYS[d]).join(", ")} · ${t12(doc.start)} to ${t12(doc.end)}</b></li>
      <li><span>Video visits</span><b style="font-weight:400">${doc.video ? "Yes" : "Clinic only"}</b></li>
      <li><span>Languages</span><b style="font-weight:400">${doc.languages.map(esc).join(", ")}</b></li>
      <li><span>Experience</span><b style="font-weight:400">${doc.years} years</b></li>
      <li><span>Consultation</span><b style="font-weight:400">${money(doc.fee)}</b></li>
    </ul>`;

  function render() {
    if (s.done) {
      const a = s.done;
      box.innerHTML = `<p class="eyebrow">Booked</p><h2>You are seeing ${esc(doc.name)}.</h2>
        <div class="sum"><span>${esc(a.patient)} · ${a.type === "video" ? "Video visit" : "In clinic"}</span><b>${niceDate(a.date, s.today)}, ${t12(a.time)}</b></div>
        <p class="note ok">A confirmation has been sent to your phone and we will remind you the day before.</p>
        <a class="btn" href="portal.html">Open my portal</a><a class="btn line" href="index.html#doctors">Book another</a>`;
      return;
    }
    if (!s.slots) { box.innerHTML = `<h2>Book a visit</h2><p class="muted">Loading the calendar…</p>`; return; }
    const dates = Object.keys(s.slots), free = s.date ? s.slots[s.date] : [];
    let h = `<h2>Book a visit</h2>
      <div><p class="eyebrow" style="margin-bottom:10px">Day</p><div class="days">${dates.map(d => {
        const o = dObj(d);
        return `<button class="day" data-date="${d}" aria-pressed="${s.date === d}" ${s.slots[d].length ? "" : "disabled"} aria-label="${niceDate(d, s.today)}"><span>${DAYS[o.getUTCDay()]}</span><b>${o.getUTCDate()}</b></button>`;
      }).join("")}</div></div>`;
    if (s.date) h += `<div><p class="eyebrow" style="margin-bottom:10px">Time</p><div class="slots">${free.map(t => `<button class="slot" data-time="${t}" aria-pressed="${s.time === t}">${t12(t)}</button>`).join("")}</div></div>`;
    else h += `<p class="muted small">No free times in the next two weeks. Please call us.</p>`;
    h += `<div><p class="eyebrow" style="margin-bottom:10px">How</p><div class="seg" role="group" aria-label="Visit type"><button data-type="clinic" aria-pressed="${s.type === "clinic"}">In clinic</button><button data-type="video" aria-pressed="${s.type === "video"}" ${doc.video ? "" : "disabled"}>Video${doc.video ? "" : " (not offered)"}</button></div></div>`;
    if (s.time) {
      h += `<div class="sum"><span>${s.type === "video" ? "Video visit" : "In clinic"} · ${money(doc.fee)}</span><b>${niceDate(s.date, s.today)}, ${t12(s.time)}</b></div>`;
      if (!s.me) h += `<p class="small muted">Sign in or create a free account to confirm. It takes a few seconds and keeps your results and bills together.</p>` + authHTML(s.authMode, s.err);
      else h += `<form class="form" id="confirm">
          <div class="field"><label for="b-who">Who is the visit for?</label><select id="b-who">${[s.me.account.name, ...s.me.account.family.map(f => f.name)].map(n => `<option>${esc(n)}</option>`).join("")}</select></div>
          <div class="field"><label for="b-why">What would you like help with? <span class="muted">(optional)</span></label><textarea id="b-why"></textarea></div>
          ${s.err ? `<p class="note err" role="alert">${esc(s.err)}</p>` : ""}
          <button class="btn" ${s.busy ? "disabled" : ""}>${s.busy ? "Booking…" : "Confirm booking"}</button>
          <p class="small muted">Signed in as ${esc(s.me.account.name)}. Add family members in your portal.</p>
        </form>`;
    }
    box.innerHTML = h;
  }

  async function loadSlots() {
    const r = await api("slots", null, "&doctor=" + doc.id);
    s.slots = r.slots; s.today = r.today;
    if (!s.date || !s.slots[s.date] || !s.slots[s.date].length) s.date = Object.keys(s.slots).find(d => s.slots[d].length) || null;
    if (s.date && !s.slots[s.date].includes(s.time)) s.time = null;
    render();
  }

  box.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.date) { s.date = b.dataset.date; s.time = null; s.err = ""; render(); }
    else if (b.dataset.time) { s.time = b.dataset.time; s.err = ""; render(); const f = $("#au-phone") || $("#b-why"); if (f && matchMedia("(max-width:900px)").matches) f.scrollIntoView({ block: "center", behavior: "smooth" }); }
    else if (b.dataset.type) { s.type = b.dataset.type; render(); }
    else if (b.dataset.auth) { s.authMode = b.dataset.auth; s.err = ""; render(); }
  });
  box.addEventListener("submit", async e => {
    e.preventDefault();
    if (e.target.id === "auth-form") {
      try { s.me = await authSubmit(e.target); s.err = ""; } catch (err) { s.err = err.message; }
      return render();
    }
    s.busy = true; s.err = ""; const who = $("#b-who").value, why = $("#b-why").value; render();
    try { s.done = (await api("book", { doctorId: doc.id, date: s.date, time: s.time, type: s.type, patient: who, reason: why })).appt; }
    catch (err) { s.err = err.message; if (err.status === 409) { s.time = null; await loadSlots().catch(() => {}); s.err = err.message; } if (err.status === 401) { session.token = null; s.me = null; } }
    s.busy = false; render();
  });

  loadSlots().catch(() => { box.innerHTML = `<h2>Book a visit</h2><p class="note err">The calendar could not load. Please call us to book.</p>`; });
  if (session.token) api("me").then(r => { s.me = r; render(); }).catch(() => { session.token = null; });
})();
