(function () {
  const S = window.SITE;
  const GH = S.profile.github;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ── Projects playground ───────────────────────────────── */
  const playground = $("#playground");
  const tabsEl = $("#tabs");
  const demoEl = $("#demo");
  let cleanup = null;
  let currentId = null;

  // Read each theme's accent from CSS so the tab dots always match.
  function themeAccent(theme) {
    const probe = document.createElement("div");
    probe.dataset.theme = theme;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).getPropertyValue("--p-accent").trim();
    probe.remove();
    return c;
  }

  S.projects.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.setAttribute("role", "tab");
    b.id = "tab-" + p.id;
    b.setAttribute("aria-controls", "panel");
    b.style.setProperty("--dot", themeAccent(p.theme));
    b.innerHTML = `<span class="tab-dot" aria-hidden="true"></span><span class="tab-name">${esc(p.name)}</span><span class="tab-kind">${esc(p.kind)}</span>`;
    b.addEventListener("click", () => select(p.id, true));
    b.addEventListener("keydown", (e) => {
      const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const next = S.projects[(i + dir + S.projects.length) % S.projects.length];
      select(next.id, true);
      $("#tab-" + next.id).focus();
    });
    tabsEl.appendChild(b);
  });

  function select(id, fromUser) {
    if (id === currentId) return;
    const p = S.projects.find((x) => x.id === id) || S.projects[0];
    currentId = p.id;
    playground.dataset.theme = p.theme;
    tabsEl.querySelectorAll(".tab").forEach((t) => {
      const on = t.id === "tab-" + p.id;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    $("#panel").setAttribute("aria-labelledby", "tab-" + p.id);
    $("#pKind").textContent = p.kind;
    $("#pName").textContent = p.name;
    $("#pBlurb").textContent = p.blurb;
    $("#pStack").innerHTML = p.stack.map((s) => `<span>${esc(s)}</span>`).join("");

    const code = `https://github.com/${GH}/${p.repo}`;
    $("#pActions").innerHTML =
      (p.live ? `<a class="p-btn p-btn-primary" href="${esc(p.live)}" target="_blank" rel="noopener">Open full app ↗</a>` : "") +
      `<button type="button" class="p-btn" data-readme="${esc(p.repo)}" data-title="${esc(p.name)}">Read write-up</button>` +
      `<a class="p-btn" href="${code}" target="_blank" rel="noopener">View code ↗</a>`;

    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    // Each demo gets a brand-new container, so listeners from the previous one are dropped with it.
    demoEl.innerHTML = "";
    demoEl.classList.remove("enter");
    void demoEl.offsetWidth;
    demoEl.classList.add("enter");
    renderHowTo(p);
    const host = document.createElement("div");
    host.className = "demo-host";
    demoEl.appendChild(host);
    const demo = window.DEMOS && window.DEMOS[p.id];
    if (demo) cleanup = demo(host) || null;
    else host.innerHTML = `<p class="p-note">Demo coming soon.</p>`;

    if (fromUser) history.replaceState(null, "", "#projects/" + p.id);
  }

  // "How to play" / "How it works" box above each demo. Its open/closed state is remembered.
  let howToOpen = true;
  try { howToOpen = localStorage.getItem("howto") !== "closed"; } catch (e) {}
  function renderHowTo(p) {
    const box = $("#pHowTo");
    if (!p.howTo) { box.innerHTML = ""; return; }
    box.innerHTML = `<details class="howto" ${howToOpen ? "open" : ""}>
      <summary>${esc(p.howToTitle || "How to play")}</summary>
      <ol>${p.howTo.map((step) => `<li>${step}</li>`).join("")}</ol>
    </details>`;
    box.querySelector("details").addEventListener("toggle", (e) => {
      howToOpen = e.target.open;
      try { localStorage.setItem("howto", howToOpen ? "open" : "closed"); } catch (err) {}
    });
  }

  const fromHash = location.hash.match(/^#projects\/(.+)$/);
  select(fromHash ? fromHash[1] : S.projects[0].id, false);
  if (fromHash) addEventListener("load", () => $("#projects").scrollIntoView({ behavior: "instant" }));

  /* ── README viewer ─────────────────────────────────────── */
  const dlg = $("#readme");
  const readmeCache = {};
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-readme]");
    if (btn) openReadme(btn.dataset.readme, btn.dataset.title);
  });
  $("#readmeClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  async function openReadme(repo, title) {
    $("#readmeTitle").textContent = title + " · write-up";
    $("#readmeGh").href = `https://github.com/${GH}/${repo}#readme`;
    const body = $("#readmeBody");
    body.innerHTML = `<p style="padding:24px 0;color:var(--muted)">Loading…</p>`;
    dlg.showModal();
    try {
      if (!readmeCache[repo]) {
        const res = await fetch(`https://raw.githubusercontent.com/${GH}/${repo}/HEAD/README.md`);
        if (!res.ok) throw new Error(res.status);
        readmeCache[repo] = await res.text();
      }
      const html = window.DOMPurify.sanitize(window.marked.parse(readmeCache[repo]));
      body.innerHTML = html;
      const raw = `https://raw.githubusercontent.com/${GH}/${repo}/HEAD/`;
      const blob = `https://github.com/${GH}/${repo}/blob/HEAD/`;
      body.querySelectorAll("img[src]").forEach((img) => {
        const src = img.getAttribute("src");
        if (!/^(https?:|data:)/.test(src)) img.src = raw + src.replace(/^\.?\//, "");
        img.loading = "lazy";
      });
      body.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href");
        if (href.startsWith("#")) { a.removeAttribute("href"); return; }
        if (!/^(https?:|mailto:)/.test(href)) a.href = blob + href.replace(/^\.?\//, "");
        a.target = "_blank";
        a.rel = "noopener";
      });
    } catch (err) {
      body.innerHTML = `<p style="padding:24px 0">Couldn't load the write-up right now. <a href="https://github.com/${GH}/${repo}#readme" target="_blank" rel="noopener">Read it on GitHub ↗</a></p>`;
    }
  }

  /* ── Research & experience ─────────────────────────────── */
  const visible = (list) => list.filter((x) => !x.placeholder || S.showPlaceholders);

  function hideSection(id) {
    $("#" + id).hidden = true;
    document.querySelectorAll(`[data-section-link="${id}"]`).forEach((a) => (a.hidden = true));
  }

  const papers = visible(S.research);
  if (!papers.length) hideSection("research");
  $("#researchList").innerHTML = papers.map((r) => `
    <article class="entry${r.placeholder ? " draft" : ""}">
      <p class="entry-meta">${esc([r.venue, r.year, r.status].filter(Boolean).join(" · "))}</p>
      <h3>${esc(r.title)}</h3>
      <p>${esc(r.abstract)}</p>
      ${r.pdf || r.cite ? `<div class="btn-row">
        ${r.pdf ? `<a class="btn btn-accent btn-sm" href="${esc(r.pdf)}" target="_blank" rel="noopener">Read PDF</a>` : ""}
        ${r.cite ? `<a class="btn btn-outline btn-sm" href="${esc(r.cite)}" target="_blank" rel="noopener">Cite</a>` : ""}
      </div>` : ""}
    </article>`).join("");

  const jobs = visible(S.experience);
  if (!jobs.length) hideSection("experience");
  $("#experienceList").innerHTML = jobs.map((x) => `
    <li class="entry${x.placeholder ? " draft" : ""}">
      <div class="entry-top">
        <h3>${esc(x.role)} · ${esc(x.org)}</h3>
        <p class="entry-meta">${esc(x.dates)}</p>
      </div>
      <ul>${x.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>
    </li>`).join("");

  /* ── Contact ───────────────────────────────────────────── */
  const pr = S.profile;
  $("#contactLinks").innerHTML = [
    pr.email && `<a class="btn btn-accent" href="mailto:${esc(pr.email)}">Email me</a>`,
    pr.email && `<button type="button" class="btn btn-outline" id="copyEmail">Copy address</button>`,
    `<a class="btn btn-outline" href="https://github.com/${GH}" target="_blank" rel="noopener">GitHub</a>`,
    pr.linkedin && `<a class="btn btn-outline" href="${esc(pr.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`,
    pr.resume && `<a class="btn btn-outline" href="${esc(pr.resume)}" target="_blank" rel="noopener">Résumé PDF</a>`,
  ].filter(Boolean).join("");

  if (pr.email) {
    $("#contactEmail").textContent = pr.email;
    $("#heroEmail").href = "mailto:" + pr.email;
    const copyBtn = $("#copyEmail");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pr.email);
        copyBtn.textContent = "Copied ✓";
      } catch (e) {
        const r = document.createRange();
        r.selectNodeContents($("#contactEmail"));
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        copyBtn.textContent = "Press ⌘C / Ctrl+C";
      }
      setTimeout(() => (copyBtn.textContent = "Copy address"), 2200);
    });
  }
  $("#year").textContent = new Date().getFullYear();
})();
