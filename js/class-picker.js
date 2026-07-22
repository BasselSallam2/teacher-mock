(function () {
  let state = {
    open: false,
    sessionId: null,
    query: "",
    mode: "gallery", // gallery | create
    onDone: null,
  };

  function ensureModal() {
    let el = document.getElementById("class-picker-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "class-picker-modal";
    el.className =
      "hidden fixed inset-0 z-[60] bg-on-background/50 backdrop-blur-sm flex items-center justify-center p-4";
    el.innerHTML = `
<div class="bg-surface rounded-2xl w-full max-w-3xl max-h-[88vh] border border-outline-variant/30 shadow-xl flex flex-col overflow-hidden">
  <div class="p-4 md:p-5 border-b border-outline-variant/30 flex items-start justify-between gap-3 shrink-0">
    <div>
      <h3 id="cp-title" class="text-xl font-semibold text-on-surface">Class gallery</h3>
      <p id="cp-sub" class="text-sm text-on-surface-variant mt-0.5">Choose which class this lesson is for.</p>
    </div>
    <button type="button" id="cp-close" class="p-1 rounded-full hover:bg-surface-container text-on-surface-variant">
      <span class="material-symbols-outlined">close</span>
    </button>
  </div>
  <div id="cp-gallery-view" class="flex flex-col min-h-0 flex-1">
    <div class="p-4 border-b border-outline-variant/20 shrink-0 flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
        <input id="cp-search" type="search" placeholder="Search classes…" class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-low border-outline-variant focus:ring-2 focus:ring-primary text-sm"/>
      </div>
      <button type="button" id="cp-new" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-on-primary shrink-0">
        <span class="material-symbols-outlined text-[18px]">add</span> New Class
      </button>
    </div>
    <div id="cp-grid" class="flex-1 overflow-y-auto min-h-0 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start"></div>
  </div>
  <div id="cp-create-view" class="hidden flex-col min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
    <div>
      <label class="text-sm text-on-surface-variant">Name</label>
      <input id="cp-name" class="mt-1 w-full rounded-lg border-outline-variant bg-surface-container-low" placeholder="e.g. Grade 8 Bio (A)"/>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="text-sm text-on-surface-variant">Grade</label>
        <input id="cp-grade" class="mt-1 w-full rounded-lg border-outline-variant bg-surface-container-low" placeholder="Grade 8"/>
      </div>
      <div>
        <label class="text-sm text-on-surface-variant">Curriculum</label>
        <select id="cp-curriculum" class="mt-1 w-full rounded-lg border-outline-variant bg-surface-container-low">
          <option>British</option>
          <option>American</option>
          <option>IB Diploma</option>
          <option>National</option>
          <option>Other</option>
        </select>
      </div>
    </div>
    <div>
      <label class="text-sm text-on-surface-variant">Description</label>
      <textarea id="cp-desc" rows="3" class="mt-1 w-full rounded-lg border-outline-variant bg-surface-container-low" placeholder="Optional notes"></textarea>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" id="cp-create-cancel" class="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container">Back</button>
      <button type="button" id="cp-create-save" class="px-4 py-2 rounded-lg text-sm bg-primary text-on-primary">Create &amp; use</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(el);

    el.addEventListener("click", (e) => {
      if (e.target === el) close();
    });
    el.querySelector("#cp-close").addEventListener("click", close);
    el.querySelector("#cp-search").addEventListener("input", (e) => {
      state.query = e.target.value;
      renderGrid();
    });
    el.querySelector("#cp-new").addEventListener("click", () => setMode("create"));
    el.querySelector("#cp-create-cancel").addEventListener("click", () => setMode("gallery"));
    el.querySelector("#cp-create-save").addEventListener("click", () => {
      const name = el.querySelector("#cp-name").value.trim();
      const grade = el.querySelector("#cp-grade").value.trim();
      if (!name || !grade) {
        XplainUI.toast("Required fields", "Name and grade are required", { icon: "error" });
        return;
      }
      const item = XplainStore.addClass({
        name,
        grade,
        curriculum: el.querySelector("#cp-curriculum").value,
        description: el.querySelector("#cp-desc").value.trim(),
      });
      finish(item.id);
    });
    return el;
  }

  function setMode(mode) {
    state.mode = mode;
    const el = ensureModal();
    const gallery = el.querySelector("#cp-gallery-view");
    const create = el.querySelector("#cp-create-view");
    if (mode === "create") {
      gallery.classList.add("hidden");
      create.classList.remove("hidden");
      create.classList.add("flex");
      el.querySelector("#cp-title").textContent = "New Class";
      el.querySelector("#cp-sub").textContent = "Create a class and use it for this lesson.";
      el.querySelector("#cp-name").value = "";
      el.querySelector("#cp-grade").value = "";
      el.querySelector("#cp-desc").value = "";
      el.querySelector("#cp-name").focus();
    } else {
      create.classList.add("hidden");
      create.classList.remove("flex");
      gallery.classList.remove("hidden");
      el.querySelector("#cp-title").textContent = "Class gallery";
      el.querySelector("#cp-sub").textContent = "Choose which class this lesson is for.";
      renderGrid();
    }
  }

  function finish(id) {
    const cb = state.onDone;
    close();
    cb?.(id);
  }

  function close() {
    state.open = false;
    document.getElementById("class-picker-modal")?.classList.add("hidden");
  }

  function renderGrid() {
    const box = document.getElementById("cp-grid");
    if (!box) return;
    const q = (state.query || "").toLowerCase().trim();
    let list = XplainStore.getClasses().filter((c) => c.status !== "archived");
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.grade || "").toLowerCase().includes(q) ||
          (c.curriculum || "").toLowerCase().includes(q)
      );
    }

    box.innerHTML =
      list
        .map((c) => {
          const accent = c.accent || "#7B4DFF";
          const lessons = XplainStore.getLessonsForClass(c.id).length;
          return `<button type="button" class="cp-pick text-left rounded-xl border border-outline-variant hover:border-primary overflow-hidden bg-surface transition-colors" data-id="${c.id}">
        <div class="h-1.5" style="background:${accent}"></div>
        <div class="p-3.5 flex items-start gap-3">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white" style="background:${accent}">
            <span class="material-symbols-outlined text-[20px]">groups</span>
          </div>
          <div class="min-w-0 flex-1">
            <span class="font-semibold text-on-surface truncate block">${XplainUI.escapeHtml(c.name)}</span>
            <p class="text-xs text-on-surface-variant mt-0.5 truncate">${XplainUI.escapeHtml(c.grade || "")} · ${XplainUI.escapeHtml(c.curriculum || "")}</p>
            <p class="text-xs text-on-surface-variant mt-1">${lessons} lesson${lessons === 1 ? "" : "s"}</p>
          </div>
        </div>
      </button>`;
        })
        .join("") ||
      `<p class="text-sm text-on-surface-variant col-span-full text-center py-10">No classes match. Create a new one.</p>`;

    box.querySelectorAll(".cp-pick").forEach((btn) => {
      btn.addEventListener("click", () => finish(btn.dataset.id));
    });
  }

  window.XplainClassPicker = {
    open(opts = {}) {
      state.sessionId = opts.sessionId || null;
      state.onDone = opts.onDone || null;
      state.query = "";
      state.open = true;
      const el = ensureModal();
      el.querySelector("#cp-search").value = "";
      setMode(opts.startCreate ? "create" : "gallery");
      el.classList.remove("hidden");
    },
    close,
  };
})();
