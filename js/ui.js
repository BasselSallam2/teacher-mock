(function () {
  function ensureToastRoot() {
    let root = document.getElementById("toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "toast-root";
      document.body.appendChild(root);
    }
    return root;
  }

  const UI = {
    toast(title, subtitle, opts = {}) {
      const root = ensureToastRoot();
      const el = document.createElement("div");
      el.className =
        "toast-animate bg-slate-800 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-4 min-w-[280px] max-w-sm border border-white/10 relative overflow-hidden";
      el.innerHTML = `
        <span class="material-symbols-outlined text-primary-fixed-dim ${opts.spin ? "animate-spin-slow" : ""}">${opts.icon || "info"}</span>
        <div class="flex-1">
          <h4 class="font-semibold text-sm">${title}</h4>
          ${subtitle ? `<p class="text-xs text-slate-300 mt-0.5">${subtitle}</p>` : ""}
        </div>
        <button class="text-slate-400 hover:text-white" aria-label="Dismiss">
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
        ${opts.progress ? `<div class="absolute bottom-0 left-0 h-1 bg-primary-fixed-dim w-1/3 rounded-bl-xl"></div>` : ""}
      `;
      el.querySelector("button").onclick = () => el.remove();
      root.appendChild(el);
      if (!opts.persist) {
        setTimeout(() => el.remove(), opts.duration || 4000);
      }
      return el;
    },

    formatBytes(n) {
      if (!n) return "--";
      if (n < 1024) return n + " B";
      if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
      return (n / 1048576).toFixed(1) + " MB";
    },

    relativeTime(iso) {
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return mins + "m ago";
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + "h ago";
      const days = Math.floor(hrs / 24);
      return days + "d ago";
    },

    statusChip(status) {
      const map = {
        indexed: { label: "Indexed", cls: "bg-success/20 text-success" },
        ready: { label: "Ready", cls: "bg-success/20 text-success" },
        active: { label: "Active", cls: "bg-success/20 text-success" },
        uploading: { label: "Uploading", cls: "bg-primary-container/20 text-primary animate-pulse" },
        processing: { label: "Processing", cls: "bg-primary-container/20 text-primary animate-pulse" },
        building: { label: "Building", cls: "bg-surface-variant text-on-surface-variant" },
        failed: { label: "Failed", cls: "bg-error-container text-on-error-container" },
        draft: { label: "Draft", cls: "bg-surface-variant text-on-surface-variant" },
        planning: { label: "Planning", cls: "bg-secondary-container/40 text-on-secondary-container" },
      };
      const m = map[status] || { label: status, cls: "bg-surface-variant text-on-surface-variant" };
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm ${m.cls}">${
        status === "processing" || status === "uploading" || status === "building"
          ? `<span class="material-symbols-outlined text-[12px] animate-spin">sync</span>`
          : status === "ready" || status === "indexed" || status === "active"
            ? `<span class="w-1.5 h-1.5 rounded-full bg-success"></span>`
            : ""
      }${m.label}</span>`;
    },

    mediaIcon(mime) {
      if (!mime) return "link";
      if (mime.startsWith("image/")) return "image";
      if (mime.includes("pdf")) return "picture_as_pdf";
      if (mime.includes("presentation") || mime.includes("powerpoint")) return "slideshow";
      if (mime.includes("word") || mime.includes("document")) return "description";
      if (mime.includes("uri")) return "link";
      return "insert_drive_file";
    },

    sectionIcon(type) {
      return (
        {
          starter: "play_circle",
          instruction: "school",
          activity: "group_work",
          assessment: "assignment_turned_in",
          exit_ticket: "logout",
        }[type] || "article"
      );
    },

    escapeHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },

    renderMdLite(text) {
      if (!text) return "";
      let t = this.escapeHtml(text);
      t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/`([^`]+)`/g, '<code class="bg-surface-container-high px-1 rounded text-sm">$1</code>');
      t = t.replace(/\n\n/g, "</p><p class='mt-2'>");
      t = t.replace(/\n/g, "<br>");
      return "<p>" + t + "</p>";
    },

    openModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove("hidden");
    },
    closeModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    },

    /**
     * Custom Confirm / Cancel popup (replaces window.confirm).
     * @returns {Promise<boolean>}
     */
    confirmDialog(opts = {}) {
      const title = opts.title || "Are you sure?";
      const message = opts.message || "";
      const confirmLabel = opts.confirmLabel || "Confirm";
      const cancelLabel = opts.cancelLabel || "Cancel";
      const danger = opts.danger !== false;

      return new Promise((resolve) => {
        const existing = document.getElementById("xplain-confirm-root");
        if (existing) existing.remove();

        const root = document.createElement("div");
        root.id = "xplain-confirm-root";
        root.className =
          "fixed inset-0 z-[200] flex items-center justify-center p-4";
        root.innerHTML = `
          <div class="absolute inset-0 bg-black/40" data-confirm-backdrop></div>
          <div role="dialog" aria-modal="true" aria-labelledby="xplain-confirm-title"
            class="relative bg-surface border border-outline-variant rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h3 id="xplain-confirm-title" class="text-lg font-semibold text-on-surface">${this.escapeHtml(title)}</h3>
            ${
              message
                ? `<p class="text-sm text-on-surface-variant">${this.escapeHtml(message)}</p>`
                : ""
            }
            <div class="flex gap-3 pt-1">
              <button type="button" data-confirm-ok
                class="flex-1 py-2.5 rounded-lg text-sm font-medium ${
                  danger
                    ? "bg-error text-on-error hover:opacity-90"
                    : "bg-primary-container text-on-primary-container hover:opacity-90"
                }">${this.escapeHtml(confirmLabel)}</button>
              <button type="button" data-confirm-cancel
                class="flex-1 py-2.5 border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low">${this.escapeHtml(cancelLabel)}</button>
            </div>
          </div>`;
        document.body.appendChild(root);

        const finish = (value) => {
          root.remove();
          document.removeEventListener("keydown", onKey);
          resolve(value);
        };
        const onKey = (e) => {
          if (e.key === "Escape") finish(false);
        };
        document.addEventListener("keydown", onKey);
        root.querySelector("[data-confirm-backdrop]").onclick = () => finish(false);
        root.querySelector("[data-confirm-cancel]").onclick = () => finish(false);
        root.querySelector("[data-confirm-ok]").onclick = () => finish(true);
        root.querySelector("[data-confirm-ok]").focus();
      });
    },

    /** Wrap a password input with a visibility eye toggle. */
    attachPasswordToggle(input) {
      const el =
        typeof input === "string" ? document.getElementById(input) : input;
      if (!el || el.dataset.pwToggle === "1") return;
      el.dataset.pwToggle = "1";

      const wrap = document.createElement("div");
      wrap.className = "relative mt-1";
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      el.classList.remove("mt-1");
      if (!/\bpr-\d/.test(el.className)) {
        el.classList.add("pr-11");
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface";
      btn.setAttribute("aria-label", "Show password");
      btn.innerHTML = `<span class="material-symbols-outlined text-[20px] leading-none">visibility</span>`;
      wrap.appendChild(btn);

      btn.addEventListener("click", () => {
        const showing = el.type === "text";
        el.type = showing ? "password" : "text";
        const icon = showing ? "visibility" : "visibility_off";
        btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        btn.querySelector("span").textContent = icon;
      });
    },
  };

  window.XplainUI = UI;
})();