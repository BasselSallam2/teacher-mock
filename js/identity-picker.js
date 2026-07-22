(function () {
  let state = {
    open: false,
    sessionId: null,
    query: "",
    mode: "gallery", // gallery | create
    onDone: null,
  };

  const FONTS = [
    "Nunito",
    "Space Grotesk",
    "Inter",
    "Poppins",
    "Roboto",
    "Open Sans",
    "Montserrat",
    "Lora",
    "Comic Neue",
  ];

  function ensureModal() {
    let el = document.getElementById("identity-picker-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "identity-picker-modal";
    el.className =
      "hidden fixed inset-0 z-[60] bg-on-background/50 backdrop-blur-sm flex items-center justify-center p-4";
    el.innerHTML = `
<div class="bg-surface rounded-2xl w-full max-w-3xl max-h-[88vh] border border-outline-variant/30 shadow-xl flex flex-col overflow-hidden">
  <div class="p-4 md:p-5 border-b border-outline-variant/30 flex items-start justify-between gap-3 shrink-0">
    <div>
      <h3 id="ip-title" class="text-xl font-semibold text-on-surface">Identity gallery</h3>
      <p id="ip-sub" class="text-sm text-on-surface-variant mt-0.5">Choose a brand set for colors, background, and image style.</p>
    </div>
    <button type="button" id="ip-close" class="p-1 rounded-full hover:bg-surface-container text-on-surface-variant">
      <span class="material-symbols-outlined">close</span>
    </button>
  </div>
  <div id="ip-gallery-view" class="flex flex-col min-h-0 flex-1">
    <div class="p-4 border-b border-outline-variant/20 shrink-0 flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
        <input id="ip-search" type="search" placeholder="Search identities…" class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-low border-outline-variant focus:ring-2 focus:ring-primary text-sm"/>
      </div>
      <button type="button" id="ip-new" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-on-primary shrink-0">
        <span class="material-symbols-outlined text-[18px]">add</span> New Identity
      </button>
    </div>
    <div id="ip-grid" class="flex-1 overflow-y-auto min-h-0 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start"></div>
  </div>
  <div id="ip-create-view" class="hidden flex-col min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
    <div>
      <label class="text-sm text-on-surface-variant">Name</label>
      <input id="ip-name" class="mt-1 w-full rounded-lg border-outline-variant bg-surface-container-low" placeholder="e.g. Inventors Academy Kids"/>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="text-sm text-on-surface-variant">Primary</label>
        <div class="mt-1 flex gap-2 items-center">
          <input type="color" id="ip-primary" value="#7B4DFF" class="h-10 w-12 rounded border border-outline-variant cursor-pointer"/>
          <input id="ip-primary-hex" class="flex-1 rounded-lg border-outline-variant bg-surface-container-low text-sm" value="#7B4DFF"/>
        </div>
      </div>
      <div>
        <label class="text-sm text-on-surface-variant">Secondary</label>
        <div class="mt-1 flex gap-2 items-center">
          <input type="color" id="ip-secondary" value="#F5A623" class="h-10 w-12 rounded border border-outline-variant cursor-pointer"/>
          <input id="ip-secondary-hex" class="flex-1 rounded-lg border-outline-variant bg-surface-container-low text-sm" value="#F5A623"/>
        </div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="text-sm text-on-surface-variant">Background</label>
        <select id="ip-bg" class="mt-1 w-full rounded-lg border-outline-variant bg-surface-container-low">
          <option value="simple_white">Simple white</option>
          <option value="solid_color">Solid color</option>
        </select>
      </div>
      <div>
        <label class="text-sm text-on-surface-variant">Image style</label>
        <select id="ip-image" class="mt-1 w-full rounded-lg border-outline-variant bg-surface-container-low">
          <option value="realistic">Realistic photos</option>
          <option value="cartoon">Cartoon illustrations</option>
          <option value="diagram">Scientific diagrams</option>
          <option value="mixed">Mixed</option>
        </select>
      </div>
    </div>
    <div>
      <label class="text-sm text-on-surface-variant">Typography</label>
      <select id="ip-type" class="mt-1 w-full rounded-lg border-outline-variant bg-surface-container-low">
        ${FONTS.map((f) => `<option value="${f}" style="font-family:'${f}',sans-serif">${f}</option>`).join("")}
      </select>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" id="ip-create-cancel" class="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container">Back</button>
      <button type="button" id="ip-create-save" class="px-4 py-2 rounded-lg text-sm bg-primary text-on-primary">Create &amp; use</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(el);

    el.addEventListener("click", (e) => {
      if (e.target === el) close();
    });
    el.querySelector("#ip-close").addEventListener("click", close);
    el.querySelector("#ip-search").addEventListener("input", (e) => {
      state.query = e.target.value;
      renderGrid();
    });
    el.querySelector("#ip-new").addEventListener("click", () => setMode("create"));
    el.querySelector("#ip-create-cancel").addEventListener("click", () => setMode("gallery"));
    el.querySelector("#ip-create-save").addEventListener("click", () => {
      const name = el.querySelector("#ip-name").value.trim();
      if (!name) {
        XplainUI.toast("Name required", "Enter an identity name", { icon: "error" });
        return;
      }
      const item = XplainStore.addIdentity({
        name,
        primary: el.querySelector("#ip-primary-hex").value.trim(),
        secondary: el.querySelector("#ip-secondary-hex").value.trim(),
        background_style: el.querySelector("#ip-bg").value,
        image_style: el.querySelector("#ip-image").value,
        typography: el.querySelector("#ip-type").value,
      });
      finish(item.id);
    });

    const sync = (picker, hex) => {
      const p = el.querySelector(picker);
      const h = el.querySelector(hex);
      p.addEventListener("input", () => {
        h.value = p.value;
      });
      h.addEventListener("change", () => {
        if (/^#[0-9a-fA-F]{6}$/.test(h.value)) p.value = h.value;
      });
    };
    sync("#ip-primary", "#ip-primary-hex");
    sync("#ip-secondary", "#ip-secondary-hex");
    return el;
  }

  function setMode(mode) {
    state.mode = mode;
    const el = ensureModal();
    const gallery = el.querySelector("#ip-gallery-view");
    const create = el.querySelector("#ip-create-view");
    if (mode === "create") {
      gallery.classList.add("hidden");
      create.classList.remove("hidden");
      create.classList.add("flex");
      el.querySelector("#ip-title").textContent = "New Identity";
      el.querySelector("#ip-sub").textContent = "Create a brand set and use it for this lesson.";
      el.querySelector("#ip-name").value = "";
      el.querySelector("#ip-name").focus();
    } else {
      create.classList.add("hidden");
      create.classList.remove("flex");
      gallery.classList.remove("hidden");
      el.querySelector("#ip-title").textContent = "Identity gallery";
      el.querySelector("#ip-sub").textContent =
        "Choose a brand set for colors, background, and image style.";
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
    document.getElementById("identity-picker-modal")?.classList.add("hidden");
  }

  function renderGrid() {
    const box = document.getElementById("ip-grid");
    if (!box) return;
    const q = (state.query || "").toLowerCase().trim();
    const def = XplainStore.getTeacher().default_identity_id;
    let list = XplainStore.getIdentities();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));

    box.innerHTML =
      list
        .map((i) => {
          const isDef = def === i.id;
          return `<button type="button" class="ip-pick text-left rounded-xl border border-outline-variant hover:border-primary overflow-hidden bg-surface transition-colors" data-id="${i.id}">
        <div class="h-2 flex">
          <span class="flex-1" style="background:${i.primary}"></span>
          <span class="flex-1" style="background:${i.secondary}"></span>
        </div>
        <div class="p-3.5 flex items-start gap-3">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white" style="background:linear-gradient(135deg,${i.primary},${i.secondary})">
            <span class="material-symbols-outlined text-[20px]">palette</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-on-surface truncate">${XplainUI.escapeHtml(i.name)}</span>
              ${isDef ? `<span class="text-[10px] uppercase tracking-wide text-primary font-semibold shrink-0">Default</span>` : ""}
            </div>
            <p class="text-xs text-on-surface-variant mt-0.5 truncate">${XplainUI.escapeHtml(XplainChat.imageLabel(i.image_style))} · ${XplainUI.escapeHtml(XplainChat.bgLabel(i.background_style))}</p>
            <p class="text-xs text-on-surface-variant mt-1 truncate" style="font-family:'${XplainUI.escapeHtml(i.typography || "Nunito")}',sans-serif">${XplainUI.escapeHtml(i.typography || "Nunito")}</p>
          </div>
        </div>
      </button>`;
        })
        .join("") ||
      `<p class="text-sm text-on-surface-variant col-span-full text-center py-10">No identities match. Create a new one.</p>`;

    box.querySelectorAll(".ip-pick").forEach((btn) => {
      btn.addEventListener("click", () => finish(btn.dataset.id));
    });
  }

  window.XplainIdentityPicker = {
    open(opts = {}) {
      state.sessionId = opts.sessionId || null;
      state.onDone = opts.onDone || null;
      state.query = "";
      state.open = true;
      const el = ensureModal();
      el.querySelector("#ip-search").value = "";
      setMode(opts.startCreate ? "create" : "gallery");
      el.classList.remove("hidden");
    },
    close,
  };
})();
