(function () {
  function navClass(active) {
    if (active) {
      return "flex items-center gap-3 px-4 py-3 bg-primary-container text-on-primary-container rounded-lg font-medium text-sm";
    }
    return "flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-container-high rounded-lg text-sm transition-colors";
  }

  const AdminLayout = {
    init(opts = {}) {
      if (window.XplainLayout) XplainLayout.applyTailwind();
      XplainStore.requirePlatformAuth("login.html");

      const active = opts.active || "dashboard";
      const shell = document.getElementById("admin-shell");
      if (!shell) return null;

      shell.innerHTML = `
<div class="bg-background text-on-background font-body-md min-h-screen flex">
  <aside id="admin-sidebar" class="mobile-drawer md:translate-x-0 fixed md:sticky top-0 left-0 z-50 md:z-40 flex flex-col h-screen w-[280px] bg-surface-container-low border-r border-outline-variant p-2 shrink-0">
    <div class="p-4 mb-2 flex items-center gap-3">
      <img src="../assets/logo.png" alt="getXplain" class="w-10 h-10 rounded-lg object-contain shrink-0 bg-white border border-outline-variant/40 p-0.5"/>
      <div class="min-w-0 flex-1">
        <h2 class="font-headline-md font-bold text-on-surface text-[17px] leading-tight truncate">get<span class="text-primary">X</span>plain</h2>
        <p class="text-xs text-on-surface-variant">Platform admin</p>
      </div>
      <button type="button" class="md:hidden p-1" id="admin-close-drawer"><span class="material-symbols-outlined">close</span></button>
    </div>
    <nav class="flex-1 space-y-1 px-2 overflow-y-auto">
      <a class="${navClass(active === "dashboard")}" href="dashboard.html">
        <span class="material-symbols-outlined">dashboard</span>
        <span>Dashboard</span>
      </a>
      <a class="${navClass(active === "organizations")}" href="organizations.html">
        <span class="material-symbols-outlined">corporate_fare</span>
        <span>Organizations</span>
      </a>
      <a class="${navClass(active === "teachers")}" href="teachers.html">
        <span class="material-symbols-outlined">group</span>
        <span>Teachers</span>
      </a>
    </nav>
    <div class="mt-auto px-2 pb-4 space-y-1 border-t border-outline-variant/30 pt-4">
      <a class="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-container-high rounded-lg text-sm" href="../login.html">
        <span class="material-symbols-outlined">school</span>
        <span>Teacher app</span>
      </a>
      <button type="button" id="admin-logout" class="w-full flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-container-high rounded-lg text-sm text-left">
        <span class="material-symbols-outlined">logout</span>
        <span>Log out</span>
      </button>
    </div>
  </aside>
  <div id="admin-drawer-backdrop" class="fixed inset-0 bg-black/40 z-40 hidden md:hidden"></div>
  <div class="flex-1 flex flex-col min-w-0 min-h-screen">
    <header class="flex items-center gap-3 px-4 md:px-10 py-4 sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-outline-variant shrink-0">
      <button type="button" class="md:hidden p-2 -ml-2 rounded-full hover:bg-surface-container-high" id="admin-open-drawer">
        <span class="material-symbols-outlined">menu</span>
      </button>
      <h1 class="text-xl md:text-2xl font-semibold text-on-surface truncate">${XplainUI.escapeHtml(opts.title || "Dashboard")}</h1>
    </header>
    <div id="admin-page-content" class="flex-1 p-4 md:p-10 overflow-y-auto"></div>
  </div>
</div>`;

      const content = document.getElementById("admin-page-content");
      const template = document.getElementById("page-template");
      if (content && template) {
        content.appendChild(template.content.cloneNode(true));
      }

      const sidebar = document.getElementById("admin-sidebar");
      const backdrop = document.getElementById("admin-drawer-backdrop");
      const open = () => {
        sidebar?.classList.add("open");
        backdrop?.classList.remove("hidden");
      };
      const close = () => {
        sidebar?.classList.remove("open");
        backdrop?.classList.add("hidden");
      };
      document.getElementById("admin-open-drawer")?.addEventListener("click", open);
      document.getElementById("admin-close-drawer")?.addEventListener("click", close);
      backdrop?.addEventListener("click", close);

      document.getElementById("admin-logout")?.addEventListener("click", () => {
        XplainStore.logout();
        location.href = "login.html";
      });

      return content;
    },
  };

  window.XplainAdminLayout = AdminLayout;
})();
