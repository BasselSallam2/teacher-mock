(function () {
  let state = {
    open: false,
    sessionId: null,
    currentFolderId: null, // null = My Drive root (browse folders); use "all" for search-all
    browseAll: false,
    query: "",
    selected: new Set(),
    onDone: null,
  };

  function ensureModal() {
    let el = document.getElementById("media-picker-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "media-picker-modal";
    el.className =
      "hidden fixed inset-0 z-[60] bg-on-background/50 backdrop-blur-sm flex items-center justify-center p-4";
    el.innerHTML = `
<div class="bg-surface rounded-2xl w-full max-w-4xl max-h-[88vh] border border-outline-variant/30 shadow-xl flex flex-col overflow-hidden">
  <div class="p-4 md:p-5 border-b border-outline-variant/30 flex items-start justify-between gap-3 shrink-0">
    <div>
      <h3 class="text-xl font-semibold text-on-surface">Select sources</h3>
      <p class="text-sm text-on-surface-variant mt-0.5">Browse folders or search indexed files.</p>
    </div>
    <button type="button" id="mp-close" class="p-1 rounded-full hover:bg-surface-container text-on-surface-variant">
      <span class="material-symbols-outlined">close</span>
    </button>
  </div>
  <div class="p-4 border-b border-outline-variant/20 shrink-0 space-y-3">
    <div class="relative">
      <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
      <input id="mp-search" type="search" placeholder="Search by file name…" class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-low border-outline-variant focus:ring-2 focus:ring-primary text-sm"/>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <nav id="mp-breadcrumb" class="flex items-center gap-1 min-w-0 flex-1 text-sm overflow-x-auto"></nav>
      <button type="button" id="mp-all-files" class="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-outline-variant text-on-surface-variant hover:bg-surface-container">All files</button>
    </div>
  </div>
  <div id="mp-list" class="flex-1 overflow-y-auto min-h-0 divide-y divide-outline-variant/20"></div>
  <div class="p-4 border-t border-outline-variant/30 bg-surface-container-lowest flex flex-wrap items-center justify-between gap-3 shrink-0">
    <p id="mp-count" class="text-sm text-on-surface-variant">0 selected</p>
    <div class="flex gap-2">
      <button type="button" id="mp-cancel" class="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container">Cancel</button>
      <button type="button" id="mp-confirm" class="px-4 py-2 rounded-lg text-sm bg-primary text-on-primary disabled:opacity-40" disabled>Add to lesson</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(el);

    el.addEventListener("click", (e) => {
      if (e.target === el) close();
    });
    el.querySelector("#mp-close").addEventListener("click", close);
    el.querySelector("#mp-cancel").addEventListener("click", close);
    el.querySelector("#mp-search").addEventListener("input", (e) => {
      state.query = e.target.value;
      if (state.query.trim()) state.browseAll = true;
      renderChrome();
      renderList();
    });
    el.querySelector("#mp-all-files").addEventListener("click", () => {
      state.browseAll = true;
      state.currentFolderId = null;
      renderChrome();
      renderList();
    });
    el.querySelector("#mp-confirm").addEventListener("click", () => {
      const ids = Array.from(state.selected);
      if (!ids.length) return;
      const cb = state.onDone;
      close();
      cb?.(ids);
    });
    return el;
  }

  function close() {
    state.open = false;
    document.getElementById("media-picker-modal")?.classList.add("hidden");
  }

  function renderChrome() {
    const nav = document.getElementById("mp-breadcrumb");
    const allBtn = document.getElementById("mp-all-files");
    allBtn.classList.toggle("bg-primary-container", state.browseAll);
    allBtn.classList.toggle("text-on-primary-container", state.browseAll);
    allBtn.classList.toggle("border-primary-container", state.browseAll);

    if (state.browseAll) {
      nav.innerHTML = `<span class="text-on-surface-variant">Searching all indexed files</span>`;
      return;
    }

    const path = state.currentFolderId
      ? XplainStore.getFolderPath(state.currentFolderId)
      : [];
    const crumb = (id, label, isLast) => {
      if (isLast) {
        return `<span class="font-semibold text-on-surface truncate max-w-[140px]">${XplainUI.escapeHtml(label)}</span>`;
      }
      return `<button type="button" class="mp-crumb text-on-surface-variant hover:text-primary truncate max-w-[120px]" data-id="${id === null ? "" : id}">${XplainUI.escapeHtml(label)}</button>`;
    };
    const parts = [crumb(null, "My Drive", path.length === 0)];
    path.forEach((f, i) => {
      parts.push(
        `<span class="material-symbols-outlined text-on-surface-variant text-[16px] shrink-0">chevron_right</span>`
      );
      parts.push(crumb(f.id, f.name, i === path.length - 1));
    });
    nav.innerHTML = parts.join("");
    nav.querySelectorAll(".mp-crumb").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.id;
        state.browseAll = false;
        state.currentFolderId = v === "" ? null : v;
        renderChrome();
        renderList();
      });
    });
  }

  function filteredMedia() {
    const q = (state.query || "").toLowerCase().trim();
    return XplainStore.getMedia()
      .filter((m) => m.status === "indexed")
      .filter((m) => {
        if (state.browseAll || q) {
          return (
            !q ||
            m.display_name.toLowerCase().includes(q) ||
            (m.description || "").toLowerCase().includes(q)
          );
        }
        if (!state.currentFolderId) return false;
        return m.folder_id === state.currentFolderId;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  function renderList() {
    const list = document.getElementById("mp-list");
    const confirm = document.getElementById("mp-confirm");
    const count = document.getElementById("mp-count");
    count.textContent =
      state.selected.size === 0
        ? "0 selected"
        : `${state.selected.size} selected`;
    confirm.disabled = state.selected.size === 0;

    const q = (state.query || "").toLowerCase().trim();
    const browsing = !state.browseAll && !q;
    const childFolders = browsing
      ? XplainStore.getChildFolders(state.currentFolderId)
      : [];
    const items = filteredMedia();
    const folderNames = Object.fromEntries(
      XplainStore.getFolders().map((f) => [f.id, f.name])
    );

    if (!childFolders.length && !items.length) {
      list.innerHTML = `<div class="p-10 text-center text-sm text-on-surface-variant">
        <span class="material-symbols-outlined text-3xl mb-2 block">folder_off</span>
        ${
          browsing && !state.currentFolderId
            ? "Open a folder to pick files, or use All files / search."
            : "No matching indexed files."
        }
        <a href="media.html" class="block mt-2 text-primary hover:underline">Go to Media Library</a>
      </div>`;
      return;
    }

    const folderRows = childFolders
      .map(
        (f) => `
<button type="button" class="mp-open-folder w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container text-left" data-id="${f.id}">
  <div class="w-10 h-10 rounded-lg bg-primary-container/30 text-primary flex items-center justify-center shrink-0">
    <span class="material-symbols-outlined fill-icon">folder</span>
  </div>
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium text-on-surface truncate">${XplainUI.escapeHtml(f.name)}</p>
    <p class="text-xs text-on-surface-variant">Folder</p>
  </div>
  <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
</button>`
      )
      .join("");

    const fileRows = items
      .map((m) => {
        const checked = state.selected.has(m.id);
        return `
<label class="flex items-center gap-3 px-4 py-3 hover:bg-surface-container cursor-pointer ${checked ? "bg-primary/5" : ""}">
  <input type="checkbox" class="mp-check rounded border-outline-variant text-primary focus:ring-primary" data-id="${m.id}" ${checked ? "checked" : ""}/>
  <div class="w-10 h-10 rounded-lg ${m.mime_type?.includes("pdf") ? "bg-error-container text-on-error-container" : "bg-primary-container/40 text-primary"} flex items-center justify-center shrink-0">
    <span class="material-symbols-outlined text-lg">${XplainUI.mediaIcon(m.mime_type)}</span>
  </div>
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium text-on-surface truncate">${XplainUI.escapeHtml(m.display_name)}</p>
    <p class="text-xs text-on-surface-variant truncate">${XplainUI.escapeHtml(folderNames[m.folder_id] || "Unfiled")} · ${XplainUI.formatBytes(m.size_bytes)}</p>
  </div>
</label>`;
      })
      .join("");

    list.innerHTML = folderRows + fileRows;

    list.querySelectorAll(".mp-open-folder").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.browseAll = false;
        state.currentFolderId = btn.dataset.id;
        state.query = "";
        const search = document.getElementById("mp-search");
        if (search) search.value = "";
        renderChrome();
        renderList();
      });
    });
    list.querySelectorAll(".mp-check").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) state.selected.add(cb.dataset.id);
        else state.selected.delete(cb.dataset.id);
        renderList();
      });
    });
  }

  const MediaPicker = {
    /** @param {{ sessionId: string, preselected?: string[], onDone: (ids: string[]) => void }} opts */
    open(opts) {
      state.sessionId = opts.sessionId;
      state.onDone = opts.onDone;
      state.currentFolderId = null;
      state.browseAll = false;
      state.query = "";
      state.selected = new Set(opts.preselected || []);
      state.open = true;
      const el = ensureModal();
      el.classList.remove("hidden");
      const search = el.querySelector("#mp-search");
      search.value = "";
      renderChrome();
      renderList();
      setTimeout(() => search.focus(), 50);
    },
    close,
  };

  window.XplainMediaPicker = MediaPicker;
})();
