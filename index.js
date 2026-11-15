/* Home page: doctor finder and care packages */
(function () {
  const state = { q: "", spec: "All", video: false, avail: {}, today: "" };
  document.title = `${DATA.hospital.fullName} — find a doctor, book in a minute`;

  function renderChips() {
    const specs = ["All", ...DATA.specialties.filter(s => DATA.doctors.some(d => d.specialty === s))];
    $("#chips").innerHTML = specs.map(s => `<button class="chip" data-spec="${esc(s)}" aria-pressed="${state.spec === s}">${esc(s)}</button>`).join("") +
      `<button class="chip" data-video aria-pressed="${state.video}">Video visits</button>`;
  }
  function renderDoctors() {
    const q = state.q.toLowerCase();
    const rows = DATA.doctors.filter(d =>
      (state.spec === "All" || d.specialty === state.spec) && (!state.video || d.video) &&
      (!q || [d.name, d.specialty, d.title, d.bio].join(" ").toLowerCase().includes(q)));
    $("#doc-list").innerHTML = rows.length ? rows.map(d => {
      const a = state.avail[d.id];
      return `<a class="doc" href="doctor.html?id=${d.id}">
        <span class="mono" aria-hidden="true">${esc(initials(d.name))}</span>
        <span><span class="doc-name">${esc(d.name)}</span><br><span class="small muted">${esc(d.title)}</span></span>
        <span class="spec small">${esc(d.specialty)}${d.video ? ' · <span class="tag blue">Video</span>' : ""}</span>
        <span class="next small"><span class="muted">Next free</span><b>${a ? `${niceDate(a.date, state.today)}, ${t12(a.time)}` : state.today ? "Fully booked" : "…"}</b></span>
        <span class="btn sm line go">Book</span>
      </a>`;
    }).join("") : `<p class="empty">No doctor matches that search. Try a different word, or call us and we will point you to the right person.</p>`;
  }
  function renderPacks() {
    $("#packs").innerHTML = DATA.packages.map(p => `<article class="pack">
        <h3>${esc(p.name)}</h3>
        <div class="price">${money(p.price)}<small>${esc(p.per)}</small></div>
        <p class="small muted">${esc(p.blurb)}</p>
        <ul class="ticks">${p.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
        <a class="arrow" style="align-self:flex-start" href="portal.html?enroll=${p.id}">Enrol</a>
      </article>`).join("");
  }

  $("#q").addEventListener("input", e => { state.q = e.target.value.trim(); renderDoctors(); });
  $("#chips").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if ("video" in b.dataset) state.video = !state.video; else state.spec = b.dataset.spec;
    renderChips(); renderDoctors();
  });
  $("[data-video]").addEventListener("click", () => { state.video = true; renderChips(); renderDoctors(); });

  renderChips(); renderDoctors(); renderPacks();
  api("avail").then(r => { state.avail = r.avail; state.today = r.today; renderDoctors(); }).catch(() => {});
})();
