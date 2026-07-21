(function () {
  const TAILWIND_COLORS = {
    "error-container": "#ffdad6",
    "surface-tint": "#6733ea",
    success: "#10B981",
    surface: "#FFFFFF",
    "on-background": "#110D2B",
    background: "#F4F1FF",
    "inverse-surface": "#302c4c",
    "border-subtle": "rgba(123, 77, 255, 0.20)",
    "secondary-container": "#feae2c",
    "on-tertiary": "#ffffff",
    "surface-container-low": "#f6f1ff",
    "text-secondary": "#3D3760",
    tertiary: "#9d2d6c",
    "surface-dim": "#dcd5fe",
    "on-tertiary-fixed": "#3d0025",
    "on-surface-variant": "#494456",
    "on-secondary": "#ffffff",
    "on-error-container": "#93000a",
    "on-primary-fixed-variant": "#4e00d1",
    "on-primary": "#ffffff",
    "primary-fixed": "#e7deff",
    "on-secondary-fixed": "#291800",
    primary: "#622ce5",
    "secondary-fixed": "#ffddb4",
    "inverse-on-surface": "#f4eeff",
    "tertiary-container": "#bc4685",
    "inverse-primary": "#cdbdff",
    "primary-fixed-dim": "#cdbdff",
    "surface-container-lowest": "#ffffff",
    "surface-container-high": "#ebe5ff",
    error: "#FF4B5C",
    "surface-bright": "#fcf8ff",
    secondary: "#835500",
    "surface-container": "#f1ebff",
    "on-secondary-fixed-variant": "#633f00",
    info: "#3B82F6",
    "secondary-fixed-dim": "#ffb955",
    "on-secondary-container": "#6b4500",
    "on-primary-fixed": "#1f005f",
    "surface-variant": "#e5deff",
    "primary-container": "#7b4dff",
    "on-tertiary-fixed-variant": "#841658",
    "on-tertiary-container": "#fff6f7",
    "tertiary-fixed-dim": "#ffafd2",
    outline: "#7a7487",
    "on-error": "#ffffff",
    "on-surface": "#1b1736",
    "outline-variant": "#cac3d8",
    "surface-container-highest": "#e5deff",
    "tertiary-fixed": "#ffd8e7",
    "on-primary-container": "#fcf6ff",
  };

  function pageName() {
    const p = location.pathname.split("/").pop() || "index.html";
    return p.replace(".html", "") || "index";
  }

  function navClass(active) {
    if (active) {
      return "flex items-center gap-3 px-4 py-3 bg-primary-container text-on-primary-container rounded-lg font-bold font-label-md text-label-md";
    }
    return "flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-container-high rounded-lg font-label-md text-label-md transition-all";
  }

  function renderSidebar(active) {
    const teacher = XplainStore.getTeacher();
    const initial = (teacher.display_name || "IA")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    return `
<aside id="sidebar" class="mobile-drawer md:translate-x-0 fixed md:sticky top-0 left-0 z-50 md:z-40 flex flex-col h-screen w-[320px] bg-surface-container-low border-r border-outline-variant p-2 space-y-2 shrink-0">
  <div class="p-4 mb-2 flex items-center gap-3">
    <div class="w-10 h-10 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center shrink-0 font-bold">
      ${teacher.logo_data_url ? `<img src="${teacher.logo_data_url}" alt="" class="w-full h-full object-cover rounded-lg"/>` : `<span class="material-symbols-outlined">school</span>`}
    </div>
    <div class="min-w-0">
      <h2 class="font-semibold text-on-surface text-[16px] leading-tight truncate">${XplainUI.escapeHtml(teacher.school_name || "Institution Authority")}</h2>
      <p class="text-xs text-on-surface-variant">Academic Workspace</p>
    </div>
    <button class="md:hidden ml-auto p-1" id="close-drawer"><span class="material-symbols-outlined">close</span></button>
  </div>
  <div class="px-2 mb-4">
    <a href="workspace.html?new=1" class="w-full bg-primary-container text-on-primary-container py-3 px-4 rounded-lg font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
      <span class="material-symbols-outlined text-sm">add</span>
      <span>New Lesson</span>
    </a>
  </div>
  <nav class="flex-1 space-y-1 px-2 overflow-y-auto">
    <a class="${navClass(active === "index")}" href="index.html">
      <span class="material-symbols-outlined">dashboard</span>
      <span>Dashboard</span>
    </a>
    <a class="${navClass(active === "media")}" href="media.html">
      <span class="material-symbols-outlined">folder_open</span>
      <span>Media Library</span>
    </a>
    <a class="${navClass(active === "identities")}" href="identities.html">
      <span class="material-symbols-outlined">palette</span>
      <span>Identities</span>
    </a>
    <a class="${navClass(active === "classes")}" href="classes.html">
      <span class="material-symbols-outlined">groups</span>
      <span>Classes</span>
    </a>
    <a class="${navClass(active === "lessons" || active === "workspace")}" href="lessons.html">
      <span class="material-symbols-outlined ${active === "lessons" || active === "workspace" ? "fill-icon" : ""}">menu_book</span>
      <span>Lesson Sessions</span>
    </a>
  </nav>
  <div class="mt-auto px-2 pb-4 space-y-1 border-t border-outline-variant/30 pt-4">
    <a class="${navClass(active === "settings")}" href="settings.html">
      <span class="material-symbols-outlined">settings</span>
      <span>Settings</span>
    </a>
    <a class="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-container-high rounded-lg font-label-md text-label-md" href="#" id="support-link">
      <span class="material-symbols-outlined">contact_support</span>
      <span>Support</span>
    </a>
  </div>
</aside>
<div id="drawer-backdrop" class="fixed inset-0 bg-black/40 z-40 hidden md:hidden"></div>`;
  }

  function renderTopbar(opts = {}) {
    const teacher = XplainStore.getTeacher();
    return `
<header class="flex justify-between items-center px-4 md:px-16 py-4 w-full z-30 bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 shrink-0">
  <div class="flex items-center gap-3">
    <button class="md:hidden p-2 -ml-2 text-on-surface hover:bg-surface-container-high rounded-full" id="open-drawer">
      <span class="material-symbols-outlined">menu</span>
    </button>
    <span class="font-bold text-primary text-xl">Xplain AI</span>
    ${opts.title ? `<span class="hidden md:inline text-on-surface-variant mx-2">/</span><h2 class="hidden md:block font-semibold text-on-surface text-2xl">${opts.title}</h2>` : ""}
    <nav class="hidden lg:flex gap-4 ml-6">
      <a class="text-sm text-on-surface-variant hover:bg-surface-container-high px-2 py-1 rounded" href="#">Help</a>
      <a class="text-sm text-on-surface-variant hover:bg-surface-container-high px-2 py-1 rounded" href="#">Docs</a>
    </nav>
  </div>
  <div class="flex items-center gap-3">
    ${opts.search !== false ? `
    <div class="hidden md:flex relative items-center">
      <span class="material-symbols-outlined absolute left-3 text-outline text-sm">search</span>
      <input id="global-search" class="bg-surface-container-low border border-outline-variant rounded-full pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:border-primary w-48" placeholder="Search..." type="text"/>
    </div>` : ""}
    <a href="settings.html" class="hidden sm:block text-sm text-primary hover:underline">School Settings</a>
    <button class="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant" title="Notifications">
      <span class="material-symbols-outlined">notifications</span>
    </button>
    <a href="settings.html" class="w-9 h-9 rounded-full bg-surface-variant border border-outline-variant flex items-center justify-center overflow-hidden text-xs font-bold text-primary" title="${XplainUI.escapeHtml(teacher.display_name)}">
      ${(teacher.display_name || "T").split(" ").map((w) => w[0]).join("").slice(0, 2)}
    </a>
  </div>
</header>`;
  }

  function renderFooter() {
    return `
<footer class="w-full py-8 bg-surface border-t border-outline-variant mt-auto">
  <div class="flex flex-col md:flex-row justify-between items-center px-4 md:px-16 max-w-7xl mx-auto gap-4">
    <p class="text-sm text-on-surface-variant">© 2026 Xplain AI Teacher Tools. All academic rights reserved.</p>
    <div class="flex gap-6 text-sm">
      <a class="text-on-surface-variant hover:text-primary underline opacity-70" href="#">Privacy Policy</a>
      <a class="text-on-surface-variant hover:text-primary underline opacity-70" href="#">Terms of Service</a>
      <a class="text-on-surface-variant hover:text-primary underline opacity-70" href="#">Security</a>
    </div>
  </div>
</footer>`;
  }

  const Layout = {
    colors: TAILWIND_COLORS,
    init(opts = {}) {
      if (window.tailwind) {
        tailwind.config = {
          darkMode: "class",
          theme: {
            extend: {
              colors: TAILWIND_COLORS,
              borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px" },
              spacing: {
                unit: "8px",
                "margin-tablet": "32px",
                "margin-desktop": "64px",
                gutter: "24px",
                "container-max": "1280px",
                "margin-mobile": "16px",
                "split-view-sidebar": "320px",
                base: "4px",
              },
              fontFamily: {
                "headline-xl": ["Inter"],
                "label-md": ["Inter"],
                "body-lg": ["Inter"],
                "body-md": ["Inter"],
                "headline-md": ["Inter"],
                "label-sm": ["Inter"],
                "headline-lg-mobile": ["Inter"],
                "headline-lg": ["Inter"],
              },
            },
          },
        };
      }

      const active = opts.active || pageName();
      const shell = document.getElementById("app-shell");
      if (!shell) return;

      const hideSidebar = opts.hideSidebar === true;
      shell.innerHTML = `
<div class="bg-background text-on-background font-body-md min-h-screen flex ${opts.overflowHidden ? "h-screen overflow-hidden" : ""}">
  ${hideSidebar ? "" : renderSidebar(active)}
  <div class="flex-1 flex flex-col min-w-0 ${opts.overflowHidden ? "h-full overflow-hidden" : "min-h-screen"}">
    ${opts.hideTopbar ? "" : renderTopbar(opts)}
    <div id="page-content" class="flex-1 ${opts.overflowHidden ? "overflow-hidden flex flex-col min-h-0" : ""}"></div>
    ${opts.hideFooter || opts.overflowHidden ? "" : renderFooter()}
  </div>
</div>`;

      const content = document.getElementById("page-content");
      const template = document.getElementById("page-template");
      if (content && template) {
        content.appendChild(template.content.cloneNode(true));
      }

      const openBtn = document.getElementById("open-drawer");
      const closeBtn = document.getElementById("close-drawer");
      const backdrop = document.getElementById("drawer-backdrop");
      const sidebar = document.getElementById("sidebar");
      function openDrawer() {
        sidebar?.classList.add("open");
        backdrop?.classList.remove("hidden");
      }
      function closeDrawer() {
        sidebar?.classList.remove("open");
        backdrop?.classList.add("hidden");
      }
      openBtn?.addEventListener("click", openDrawer);
      closeBtn?.addEventListener("click", closeDrawer);
      backdrop?.addEventListener("click", closeDrawer);

      document.getElementById("support-link")?.addEventListener("click", (e) => {
        e.preventDefault();
        XplainUI.toast("Support", "This is a UI mock — no tickets are sent.", { icon: "contact_support" });
      });

      return content;
    },
  };

  window.XplainLayout = Layout;
})();