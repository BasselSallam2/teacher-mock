(function () {
  const KEY = "xplain-teacher-mock-v1";

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("XplainStore save failed, retrying without media previews", err);
      try {
        const slim = JSON.parse(JSON.stringify(state));
        (slim.media || []).forEach((m) => {
          if (m.data_url && String(m.data_url).length > 2000) m.data_url = null;
        });
        (slim.identities || []).forEach((i) => {
          if (i.logo_data_url && String(i.logo_data_url).length > 2000) {
            i.logo_data_url = null;
          }
        });
        (slim.organizations || []).forEach((o) => {
          if (o.logo_data_url && String(o.logo_data_url).length > 2000) {
            o.logo_data_url = null;
          }
        });
        if (slim.teacher?.logo_data_url && String(slim.teacher.logo_data_url).length > 2000) {
          slim.teacher.logo_data_url = null;
        }
        (slim.sessions || []).forEach((s) => {
          const map = s.image_attachments || {};
          Object.values(map).forEach((att) => {
            (att.images || []).forEach((img) => {
              if (img.preview_url && String(img.preview_url).length > 2000) {
                img.preview_url = null;
              }
            });
          });
        });
        localStorage.setItem(KEY, JSON.stringify(slim));
      } catch (err2) {
        console.error("XplainStore save failed", err2);
      }
    }
    // Async so UI listener errors cannot abort callers (e.g. plan generation).
    queueMicrotask(() => {
      try {
        window.dispatchEvent(new CustomEvent("xplain:store", { detail: state }));
      } catch (e) {
        console.error("xplain:store listener error", e);
      }
    });
  }

  function emailDomain(email) {
    const parts = String(email || "").toLowerCase().trim().split("@");
    return parts.length === 2 ? parts[1] : "";
  }

  function syncTeacherMirror(state) {
    const sess = state.session;
    if (!sess || sess.kind !== "teacher") {
      state.teacher = deepClone(XplainSeed.teacher);
      return;
    }
    const user = (state.users || []).find((u) => u.id === sess.userId);
    if (!user) {
      state.teacher = deepClone(XplainSeed.teacher);
      return;
    }
    const org = (state.organizations || []).find((o) => o.id === user.organization_id);
    state.teacher = {
      id: user.id,
      email: user.email,
      display_name: user.name,
      school_name: org?.name || "",
      locale: user.locale || "en",
      logo_data_url: org?.logo_data_url || null,
      default_identity_id: user.default_identity_id || null,
      role: user.role,
      organization_id: user.organization_id,
      phone: user.phone || "",
      status: user.status || "active",
    };
  }

  function ensure() {
    let state = load();
    if (!state || state.version !== XplainSeed.version) {
      state = {
        version: XplainSeed.version,
        organizations: deepClone(XplainSeed.organizations),
        users: deepClone(XplainSeed.users),
        platformAdmins: deepClone(XplainSeed.platformAdmins),
        grades: deepClone(XplainSeed.grades || []),
        curriculums: deepClone(XplainSeed.curriculums || []),
        backgrounds: deepClone(XplainSeed.backgrounds || []),
        image_styles: deepClone(XplainSeed.image_styles || []),
        fonts: deepClone(XplainSeed.fonts || []),
        session: null,
        teacher: deepClone(XplainSeed.teacher),
        identities: deepClone(XplainSeed.identities),
        classes: deepClone(XplainSeed.classes),
        media: deepClone(XplainSeed.media),
        folders: deepClone(XplainSeed.folders),
        lessons: deepClone(XplainSeed.lessons),
        sessions: deepClone(XplainSeed.sessions),
      };
      // Attach ready lesson content for demo
      const ready = state.lessons.find((l) => l.id === "l-photo-ready");
      if (ready) ready.content = deepClone(XplainSeed.lessonTemplate);
      save(state);
    }
    if (!state.organizations) state.organizations = deepClone(XplainSeed.organizations);
    if (!state.users) state.users = deepClone(XplainSeed.users);
    if (!state.platformAdmins) state.platformAdmins = deepClone(XplainSeed.platformAdmins);
    if (!state.grades) state.grades = deepClone(XplainSeed.grades || []);
    if (!state.curriculums) state.curriculums = deepClone(XplainSeed.curriculums || []);
    if (!state.backgrounds) state.backgrounds = deepClone(XplainSeed.backgrounds || []);
    if (!state.image_styles) state.image_styles = deepClone(XplainSeed.image_styles || []);
    if (!state.fonts) state.fonts = deepClone(XplainSeed.fonts || []);
    if (state.session === undefined) state.session = null;
    migrateMediaFolders(state);
    syncTeacherMirror(state);
    return state;
  }

  /** Nested folders + remove legacy Images folder. */
  function migrateMediaFolders(state) {
    if (!state.folders) state.folders = [];
    if (!state.media) state.media = [];
    let changed = false;

    const imagesIds = new Set(
      state.folders
        .filter(
          (f) =>
            f.id === "f-images" ||
            f.name === "Images" ||
            f.kind === "images"
        )
        .map((f) => f.id)
    );

    if (imagesIds.size) {
      state.media.forEach((m) => {
        if (imagesIds.has(m.folder_id)) {
          m.folder_id = "f-general";
          changed = true;
        }
      });
      const before = state.folders.length;
      state.folders = state.folders.filter((f) => !imagesIds.has(f.id));
      if (state.folders.length !== before) changed = true;
    }

    state.folders.forEach((f) => {
      if (f.parent_id === undefined) {
        f.parent_id = null;
        changed = true;
      }
      if (f.kind !== undefined) {
        delete f.kind;
        changed = true;
      }
    });

    if (changed) save(state);
  }

  const CATALOG_KEYS = ["grades", "curriculums", "backgrounds", "image_styles", "fonts"];

  const Store = {
    get() {
      return ensure();
    },
    reset() {
      localStorage.removeItem(KEY);
      return ensure();
    },
    patch(mutator) {
      const state = ensure();
      mutator(state);
      syncTeacherMirror(state);
      save(state);
      return state;
    },
    uid,

    // —— Auth / session ——
    getAuthSession() {
      return ensure().session;
    },
    getCurrentUser() {
      const sess = this.getAuthSession();
      if (!sess || sess.kind !== "teacher") return null;
      return (ensure().users || []).find((u) => u.id === sess.userId) || null;
    },
    isOrgAdmin() {
      const u = this.getCurrentUser();
      return u?.role === "org_admin";
    },
    requireTeacherAuth(loginPath) {
      const sess = this.getAuthSession();
      if (!sess || sess.kind !== "teacher") {
        location.replace(loginPath || "login.html");
        throw new Error("XplainStore: teacher auth required");
      }
      const user = this.getCurrentUser();
      if (!user || user.status === "inactive") {
        this.logout();
        location.replace(loginPath || "login.html");
        throw new Error("XplainStore: teacher auth required");
      }
      return true;
    },
    requirePlatformAuth(loginPath) {
      const sess = this.getAuthSession();
      if (!sess || sess.kind !== "platform") {
        location.replace(loginPath || "login.html");
        throw new Error("XplainStore: platform auth required");
      }
      return true;
    },
    login(email, password) {
      const e = String(email || "").toLowerCase().trim();
      const user = (ensure().users || []).find(
        (u) => u.email.toLowerCase() === e && u.password === password
      );
      if (!user) return { ok: false, error: "Invalid email or password" };
      if (user.status === "inactive") return { ok: false, error: "Account is inactive" };
      this.patch((s) => {
        s.session = { kind: "teacher", userId: user.id };
      });
      return { ok: true, user };
    },
    platformLogin(email, password) {
      const e = String(email || "").toLowerCase().trim();
      const admin = (ensure().platformAdmins || []).find(
        (a) => a.email.toLowerCase() === e && a.password === password
      );
      if (!admin) return { ok: false, error: "Invalid email or password" };
      this.patch((s) => {
        s.session = { kind: "platform", userId: admin.id };
      });
      return { ok: true, admin };
    },
    logout() {
      this.patch((s) => {
        s.session = null;
      });
    },
    findOrgByEmailDomain(email) {
      const domain = emailDomain(email);
      if (!domain) return null;
      return (
        (ensure().organizations || []).find((o) =>
          (o.domains || []).some((d) => d.toLowerCase() === domain)
        ) || null
      );
    },
    emailDomain,
    signup(data) {
      const name = (data.name || "").trim();
      const email = String(data.email || "").toLowerCase().trim();
      const password = data.password || "";
      const phone = (data.phone || "").trim();
      if (!name || !email || !password) {
        return { ok: false, error: "Name, email, and password are required" };
      }
      if (password !== data.confirmPassword) {
        return { ok: false, error: "Passwords do not match" };
      }
      const existing = (ensure().users || []).find((u) => u.email.toLowerCase() === email);
      if (existing) return { ok: false, error: "An account with this email already exists" };

      const matchedOrg = this.findOrgByEmailDomain(email);
      if (matchedOrg) {
        const pending = {
          name,
          email,
          password,
          phone,
          organization_id: matchedOrg.id,
        };
        try {
          sessionStorage.setItem("xplain-pending-signup", JSON.stringify(pending));
        } catch (_) {}
        return { ok: true, needsConfirm: true, organization: matchedOrg, pending };
      }

      const domain = emailDomain(email);
      const orgName = domain
        ? domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + " Organization"
        : name + "'s Organization";
      const org = {
        id: uid("org"),
        name: orgName,
        domains: domain ? [domain] : [],
        logo_data_url: null,
        created_at: new Date().toISOString(),
      };
      const user = {
        id: uid("u"),
        name,
        email,
        password,
        phone,
        role: "org_admin",
        organization_id: org.id,
        status: "active",
        locale: "en",
        default_identity_id: null,
        created_at: new Date().toISOString(),
      };
      this.patch((s) => {
        s.organizations.push(org);
        s.users.push(user);
        s.session = { kind: "teacher", userId: user.id };
      });
      return { ok: true, needsConfirm: false, user, organization: org };
    },
    confirmOrgJoin() {
      let pending = null;
      try {
        pending = JSON.parse(sessionStorage.getItem("xplain-pending-signup") || "null");
      } catch (_) {
        pending = null;
      }
      if (!pending) return { ok: false, error: "No pending signup" };
      const org = (ensure().organizations || []).find((o) => o.id === pending.organization_id);
      if (!org) return { ok: false, error: "Organization not found" };
      const existing = (ensure().users || []).find(
        (u) => u.email.toLowerCase() === pending.email.toLowerCase()
      );
      if (existing) return { ok: false, error: "An account with this email already exists" };
      const user = {
        id: uid("u"),
        name: pending.name,
        email: pending.email,
        password: pending.password,
        phone: pending.phone || "",
        role: "teacher",
        organization_id: org.id,
        status: "active",
        locale: "en",
        default_identity_id: null,
        created_at: new Date().toISOString(),
      };
      this.patch((s) => {
        s.users.push(user);
        s.session = { kind: "teacher", userId: user.id };
      });
      try {
        sessionStorage.removeItem("xplain-pending-signup");
      } catch (_) {}
      return { ok: true, user, organization: org };
    },
    clearPendingSignup() {
      try {
        sessionStorage.removeItem("xplain-pending-signup");
      } catch (_) {}
    },
    getPendingSignup() {
      try {
        return JSON.parse(sessionStorage.getItem("xplain-pending-signup") || "null");
      } catch (_) {
        return null;
      }
    },

    // —— Organizations ——
    getOrganizations() {
      return ensure().organizations || [];
    },
    getOrganization(id) {
      return this.getOrganizations().find((o) => o.id === id) || null;
    },
    getCurrentOrganization() {
      const user = this.getCurrentUser();
      if (!user) return null;
      return this.getOrganization(user.organization_id);
    },
    getUsersForOrg(orgId) {
      return (ensure().users || [])
        .filter((u) => u.organization_id === orgId)
        .slice()
        .sort((a, b) => {
          if (a.role === "org_admin" && b.role !== "org_admin") return -1;
          if (b.role === "org_admin" && a.role !== "org_admin") return 1;
          return a.name.localeCompare(b.name);
        });
    },
    updateUserForOrg(orgId, userId, fields) {
      const user = this.getUser(userId);
      if (!user || user.organization_id !== orgId) {
        return { ok: false, error: "User not found in this organization" };
      }
      const name = fields.name != null ? String(fields.name).trim() : user.name;
      const email =
        fields.email != null ? String(fields.email).toLowerCase().trim() : user.email;
      const phone = fields.phone != null ? String(fields.phone).trim() : user.phone;
      const role =
        fields.role != null
          ? fields.role === "org_admin"
            ? "org_admin"
            : "teacher"
          : user.role;
      const status =
        fields.status != null
          ? fields.status === "inactive"
            ? "inactive"
            : "active"
          : user.status;
      if (!name || !email) return { ok: false, error: "Name and email are required" };
      const clash = (ensure().users || []).find(
        (u) => u.id !== userId && u.email.toLowerCase() === email
      );
      if (clash) return { ok: false, error: "Email already exists" };
      // Keep at least one active org admin
      if (user.role === "org_admin" && (role !== "org_admin" || status === "inactive")) {
        const otherAdmins = this.getUsersForOrg(orgId).filter(
          (u) => u.id !== userId && u.role === "org_admin" && u.status === "active"
        );
        if (!otherAdmins.length) {
          return { ok: false, error: "Organization must keep at least one active admin" };
        }
      }
      this.patch((s) => {
        const u = (s.users || []).find((x) => x.id === userId);
        if (!u) return;
        Object.assign(u, { name, email, phone, role, status });
        if (fields.password) u.password = fields.password;
      });
      return { ok: true, user: this.getUser(userId) };
    },
    deleteUserFromOrg(orgId, userId) {
      const user = this.getUser(userId);
      if (!user || user.organization_id !== orgId) {
        return { ok: false, error: "User not found in this organization" };
      }
      const me = this.getCurrentUser();
      if (me && me.id === userId) {
        return { ok: false, error: "You cannot remove your own account" };
      }
      if (user.role === "org_admin") {
        const otherAdmins = this.getUsersForOrg(orgId).filter(
          (u) => u.id !== userId && u.role === "org_admin" && u.status === "active"
        );
        if (!otherAdmins.length) {
          return { ok: false, error: "Organization must keep at least one active admin" };
        }
      }
      this.deleteUser(userId);
      return { ok: true };
    },
    updateOrganization(id, fields) {
      this.patch((s) => {
        const o = (s.organizations || []).find((x) => x.id === id);
        if (o) Object.assign(o, fields);
      });
    },
    saveOrganization(id, data) {
      const org = this.getOrganization(id);
      if (!org) return { ok: false, error: "Organization not found" };
      const name = (data.name || "").trim();
      if (!name) return { ok: false, error: "Name is required" };
      const domains = String(data.domains || "")
        .split(/[,\s]+/)
        .map((d) => d.toLowerCase().trim())
        .filter(Boolean);
      for (const d of domains) {
        const clash = this.getOrganizations().find(
          (o) => o.id !== id && (o.domains || []).some((x) => x.toLowerCase() === d)
        );
        if (clash) return { ok: false, error: "Domain already used: " + d };
      }
      this.patch((s) => {
        const o = (s.organizations || []).find((x) => x.id === id);
        if (!o) return;
        o.name = name;
        o.domains = domains;
        if (data.logo_data_url !== undefined) o.logo_data_url = data.logo_data_url;
      });
      return { ok: true, organization: this.getOrganization(id) };
    },
    deleteOrganization(id) {
      const org = this.getOrganization(id);
      if (!org) return { ok: false, error: "Organization not found" };
      this.patch((s) => {
        s.organizations = (s.organizations || []).filter((o) => o.id !== id);
        const removedUserIds = new Set(
          (s.users || []).filter((u) => u.organization_id === id).map((u) => u.id)
        );
        s.users = (s.users || []).filter((u) => u.organization_id !== id);
        if (
          s.session?.kind === "teacher" &&
          removedUserIds.has(s.session.userId)
        ) {
          s.session = null;
        }
      });
      return { ok: true };
    },
    updatePlatformUser(userId, fields) {
      const user = this.getUser(userId);
      if (!user) return { ok: false, error: "User not found" };
      const name = fields.name != null ? String(fields.name).trim() : user.name;
      const email =
        fields.email != null ? String(fields.email).toLowerCase().trim() : user.email;
      const phone = fields.phone != null ? String(fields.phone).trim() : user.phone;
      const role =
        fields.role != null
          ? fields.role === "org_admin"
            ? "org_admin"
            : "teacher"
          : user.role;
      const status =
        fields.status != null
          ? fields.status === "inactive"
            ? "inactive"
            : "active"
          : user.status;
      const organization_id =
        fields.organization_id != null ? fields.organization_id : user.organization_id;
      if (!name || !email) return { ok: false, error: "Name and email are required" };
      if (!this.getOrganization(organization_id)) {
        return { ok: false, error: "Organization not found" };
      }
      if (
        (ensure().users || []).some(
          (u) => u.id !== userId && u.email.toLowerCase() === email
        )
      ) {
        return { ok: false, error: "Email already exists" };
      }
      this.patch((s) => {
        const u = (s.users || []).find((x) => x.id === userId);
        if (!u) return;
        Object.assign(u, { name, email, phone, role, status, organization_id });
        if (fields.password) u.password = fields.password;
      });
      return { ok: true, user: this.getUser(userId) };
    },
    addOrgDomain(orgId, domain) {
      const d = String(domain || "").toLowerCase().trim();
      if (!d) return { ok: false, error: "Domain required" };
      const clash = this.getOrganizations().find(
        (o) => o.id !== orgId && (o.domains || []).some((x) => x.toLowerCase() === d)
      );
      if (clash) return { ok: false, error: "Domain already used by another organization" };
      this.patch((s) => {
        const o = (s.organizations || []).find((x) => x.id === orgId);
        if (!o) return;
        if (!o.domains) o.domains = [];
        if (!o.domains.some((x) => x.toLowerCase() === d)) o.domains.push(d);
      });
      return { ok: true };
    },
    removeOrgDomain(orgId, domain) {
      const d = String(domain || "").toLowerCase().trim();
      this.patch((s) => {
        const o = (s.organizations || []).find((x) => x.id === orgId);
        if (o) o.domains = (o.domains || []).filter((x) => x.toLowerCase() !== d);
      });
    },

    // —— Platform admin ops ——
    getAllUsers() {
      return ensure().users || [];
    },
    getUser(id) {
      return this.getAllUsers().find((u) => u.id === id) || null;
    },
    setUserStatus(userId, status) {
      this.patch((s) => {
        const u = (s.users || []).find((x) => x.id === userId);
        if (u) u.status = status;
      });
    },
    deleteUser(userId) {
      this.patch((s) => {
        s.users = (s.users || []).filter((u) => u.id !== userId);
        if (s.session?.kind === "teacher" && s.session.userId === userId) {
          s.session = null;
        }
      });
    },
    resetUserPassword(userId, newPassword) {
      const pw = newPassword || "reset123";
      this.patch((s) => {
        const u = (s.users || []).find((x) => x.id === userId);
        if (u) u.password = pw;
      });
      return pw;
    },
    createOrganizationWithAdmin(data) {
      const orgName = (data.orgName || "").trim();
      const domains = String(data.domains || "")
        .split(/[,\s]+/)
        .map((d) => d.toLowerCase().trim())
        .filter(Boolean);
      const name = (data.adminName || "").trim();
      const email = String(data.adminEmail || "").toLowerCase().trim();
      const password = data.adminPassword || "";
      const phone = (data.adminPhone || "").trim();
      if (!orgName || !name || !email || !password) {
        return { ok: false, error: "Organization name and admin account fields are required" };
      }
      if ((ensure().users || []).some((u) => u.email.toLowerCase() === email)) {
        return { ok: false, error: "Admin email already exists" };
      }
      for (const d of domains) {
        if (
          this.getOrganizations().some((o) =>
            (o.domains || []).some((x) => x.toLowerCase() === d)
          )
        ) {
          return { ok: false, error: "Domain already registered: " + d };
        }
      }
      const org = {
        id: uid("org"),
        name: orgName,
        domains,
        logo_data_url: null,
        created_at: new Date().toISOString(),
      };
      const user = {
        id: uid("u"),
        name,
        email,
        password,
        phone,
        role: "org_admin",
        organization_id: org.id,
        status: "active",
        locale: "en",
        default_identity_id: null,
        created_at: new Date().toISOString(),
      };
      this.patch((s) => {
        s.organizations.push(org);
        s.users.push(user);
      });
      return { ok: true, organization: org, user };
    },
    createUserForOrg(data) {
      const name = (data.name || "").trim();
      const email = String(data.email || "").toLowerCase().trim();
      const password = data.password || "";
      const phone = (data.phone || "").trim();
      const organization_id = data.organization_id;
      const role = data.role === "org_admin" ? "org_admin" : "teacher";
      if (!name || !email || !password || !organization_id) {
        return { ok: false, error: "Name, email, password, and organization are required" };
      }
      if (!this.getOrganization(organization_id)) {
        return { ok: false, error: "Organization not found" };
      }
      if ((ensure().users || []).some((u) => u.email.toLowerCase() === email)) {
        return { ok: false, error: "Email already exists" };
      }
      const user = {
        id: uid("u"),
        name,
        email,
        password,
        phone,
        role,
        organization_id,
        status: "active",
        locale: "en",
        default_identity_id: null,
        created_at: new Date().toISOString(),
      };
      this.patch((s) => {
        s.users.push(user);
      });
      return { ok: true, user };
    },
    getPlatformStats() {
      const media = ensure().media || [];
      const users = ensure().users || [];
      const orgs = ensure().organizations || [];
      return {
        users: users.length,
        files: media.length,
        fileSizeBytes: media.reduce((sum, m) => sum + (m.size_bytes || 0), 0),
        organizations: orgs.length,
        grades: (ensure().grades || []).length,
        curriculums: (ensure().curriculums || []).length,
        backgrounds: (ensure().backgrounds || []).length,
        image_styles: (ensure().image_styles || []).length,
        fonts: (ensure().fonts || []).length,
      };
    },

    // —— Catalog droplists (grades, curriculums, backgrounds, image_styles, fonts) ——
    catalogKeys: CATALOG_KEYS,
    getCatalog(key) {
      if (!CATALOG_KEYS.includes(key)) return [];
      return (ensure()[key] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    },
    getCatalogItem(key, id) {
      return this.getCatalog(key).find((x) => x.id === id) || null;
    },
    createCatalogItem(key, data) {
      if (!CATALOG_KEYS.includes(key)) return { ok: false, error: "Unknown catalog" };
      const name = (data.name || "").trim();
      if (!name) return { ok: false, error: "Name is required" };
      const existing = (ensure()[key] || []).find(
        (x) => x.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) return { ok: false, error: "Name already exists" };
      const item = {
        id: uid(key.slice(0, 3)),
        name,
      };
      if (key === "fonts") {
        const url = (data.url || "").trim();
        if (!url) return { ok: false, error: "Font URL is required" };
        item.url = url;
      }
      this.patch((s) => {
        if (!s[key]) s[key] = [];
        s[key].push(item);
      });
      return { ok: true, item };
    },
    updateCatalogItem(key, id, data) {
      if (!CATALOG_KEYS.includes(key)) return { ok: false, error: "Unknown catalog" };
      const item = (ensure()[key] || []).find((x) => x.id === id);
      if (!item) return { ok: false, error: "Item not found" };
      const name = data.name != null ? String(data.name).trim() : item.name;
      if (!name) return { ok: false, error: "Name is required" };
      const clash = (ensure()[key] || []).find(
        (x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase()
      );
      if (clash) return { ok: false, error: "Name already exists" };
      let url = item.url;
      if (key === "fonts") {
        url = data.url != null ? String(data.url).trim() : item.url;
        if (!url) return { ok: false, error: "Font URL is required" };
      }
      this.patch((s) => {
        const row = (s[key] || []).find((x) => x.id === id);
        if (!row) return;
        row.name = name;
        if (key === "fonts") row.url = url;
      });
      return { ok: true, item: this.getCatalogItem(key, id) };
    },
    deleteCatalogItem(key, id) {
      if (!CATALOG_KEYS.includes(key)) return { ok: false, error: "Unknown catalog" };
      const item = (ensure()[key] || []).find((x) => x.id === id);
      if (!item) return { ok: false, error: "Item not found" };
      this.patch((s) => {
        s[key] = (s[key] || []).filter((x) => x.id !== id);
      });
      return { ok: true };
    },

    getTeacher() {
      const state = ensure();
      syncTeacherMirror(state);
      return state.teacher;
    },
    updateTeacher(fields) {
      return this.patch((s) => {
        const sess = s.session;
        if (sess?.kind === "teacher") {
          const user = (s.users || []).find((u) => u.id === sess.userId);
          if (user) {
            if (fields.display_name != null) user.name = fields.display_name;
            if (fields.locale != null) user.locale = fields.locale;
            if (fields.default_identity_id != null) {
              user.default_identity_id = fields.default_identity_id;
            }
            if (fields.phone != null) user.phone = fields.phone;
          }
          if (fields.school_name != null || fields.logo_data_url != null) {
            const org = (s.organizations || []).find((o) => o.id === user?.organization_id);
            if (org) {
              if (fields.school_name != null) org.name = fields.school_name;
              if (fields.logo_data_url != null) org.logo_data_url = fields.logo_data_url;
            }
          }
        }
        Object.assign(s.teacher, fields);
      });
    },
    getIdentities() {
      return ensure().identities || [];
    },
    getIdentity(id) {
      return this.getIdentities().find((i) => i.id === id);
    },
    addIdentity(data) {
      const item = {
        id: uid("id"),
        name: data.name || "Untitled Identity",
        primary: data.primary || "#7B4DFF",
        secondary: data.secondary || "#F5A623",
        background_style: data.background_style || "simple_white",
        image_style: data.image_style || "realistic",
        typography: data.typography || "Nunito",
        instructions: data.instructions || "",
        logo_data_url: data.logo_data_url || null,
        created_at: new Date().toISOString(),
      };
      this.patch((s) => {
        if (!s.identities) s.identities = [];
        s.identities.unshift(item);
      });
      return item;
    },
    updateIdentity(id, fields) {
      this.patch((s) => {
        const i = (s.identities || []).find((x) => x.id === id);
        if (i) Object.assign(i, fields);
      });
    },
    deleteIdentity(id) {
      this.patch((s) => {
        s.identities = (s.identities || []).filter((x) => x.id !== id);
        if (s.teacher.default_identity_id === id) {
          s.teacher.default_identity_id = s.identities[0]?.id || null;
        }
      });
    },
    getClasses() {
      return ensure().classes;
    },
    getClass(id) {
      return ensure().classes.find((c) => c.id === id);
    },
    addClass(data) {
      const cls = {
        id: uid("c"),
        status: "active",
        accent: data.accent || "#7B4DFF",
        created_at: new Date().toISOString(),
        description: data.description || "",
        ...data,
      };
      delete cls.student_count;
      this.patch((s) => s.classes.unshift(cls));
      return cls;
    },
    getLessonsForClass(classId, limit) {
      const list = this.getLessons()
        .filter((l) => l.class_id === classId)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      return typeof limit === "number" ? list.slice(0, limit) : list;
    },
    updateClass(id, fields) {
      this.patch((s) => {
        const c = s.classes.find((x) => x.id === id);
        if (c) Object.assign(c, fields);
      });
    },
    deleteClass(id) {
      this.patch((s) => {
        s.classes = s.classes.filter((c) => c.id !== id);
      });
    },
    getMedia() {
      return ensure().media;
    },
    getMediaItem(id) {
      return ensure().media.find((m) => m.id === id);
    },
    getFolders() {
      return ensure().folders;
    },
    getFolder(id) {
      return ensure().folders.find((f) => f.id === id) || null;
    },
    getChildFolders(parentId) {
      const pid = parentId == null ? null : parentId;
      return this.getFolders()
        .filter((f) => (f.parent_id == null ? null : f.parent_id) === pid)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    getFolderPath(folderId) {
      const path = [];
      let id = folderId;
      const seen = new Set();
      while (id) {
        if (seen.has(id)) break;
        seen.add(id);
        const f = this.getFolder(id);
        if (!f) break;
        path.unshift(f);
        id = f.parent_id;
      }
      return path;
    },
    addFolder(data) {
      const folder = {
        id: uid("f"),
        name: (data.name || "New Folder").trim() || "New Folder",
        parent_id: data.parent_id == null ? null : data.parent_id,
        updated_at: new Date().toISOString(),
      };
      this.patch((s) => {
        if (!s.folders) s.folders = [];
        s.folders.push(folder);
      });
      return folder;
    },
    renameFolder(id, name) {
      const trimmed = (name || "").trim();
      if (!trimmed) return false;
      this.patch((s) => {
        const f = s.folders.find((x) => x.id === id);
        if (f) {
          f.name = trimmed;
          f.updated_at = new Date().toISOString();
        }
      });
      return true;
    },
    /**
     * Refuse delete if folder has child folders or media.
     * @returns {{ ok: boolean, reason?: string }}
     */
    deleteFolder(id) {
      const children = this.getChildFolders(id);
      if (children.length) {
        return { ok: false, reason: "Folder has subfolders. Remove them first." };
      }
      const mediaCount = this.getMedia().filter((m) => m.folder_id === id).length;
      if (mediaCount) {
        return {
          ok: false,
          reason: "Folder has files. Delete or move them first.",
        };
      }
      this.patch((s) => {
        s.folders = s.folders.filter((f) => f.id !== id);
      });
      return { ok: true };
    },
    addMedia(item) {
      const m = {
        id: uid("m"),
        status: "uploading",
        folder_id: item.folder_id,
        uploaded_by: ensure().teacher.display_name,
        description: "",
        created_at: new Date().toISOString(),
        ...item,
      };
      this.patch((s) => s.media.unshift(m));
      return m;
    },
    updateMedia(id, fields) {
      this.patch((s) => {
        const m = s.media.find((x) => x.id === id);
        if (m) Object.assign(m, fields);
      });
    },
    deleteMedia(id) {
      this.patch((s) => {
        s.media = s.media.filter((m) => m.id !== id);
      });
    },
    getLessons() {
      return ensure().lessons;
    },
    getLesson(id) {
      return ensure().lessons.find((l) => l.id === id);
    },
    upsertLesson(lesson) {
      this.patch((s) => {
        const i = s.lessons.findIndex((l) => l.id === lesson.id);
        if (i >= 0) s.lessons[i] = lesson;
        else s.lessons.unshift(lesson);
      });
    },
    getSessions() {
      return ensure().sessions;
    },
    getSession(id) {
      return ensure().sessions.find((s) => s.id === id);
    },
    createSession(opts = {}) {
      const session = {
        id: uid("sess"),
        phase: "intake",
        title: opts.title || "New Lesson",
        class_id: opts.class_id || null,
        media_ids: opts.media_ids || [],
        identity_id: opts.identity_id || null,
        messages: [
          {
            id: uid("msg"),
            role: "assistant",
            text: "Hi! Let's build a lesson from scratch.\n\nWhat topic should we teach? (e.g. “Build a lesson about AI for Grade 8”)",
            at: new Date().toISOString(),
          },
        ],
        // collect: topic → source → identity → details → confirm
        agent_step: "topic",
        awaiting_plan_confirm: false,
        requirements: {
          topic: null,
          duration: null,
          styles: [],
          pair_work: null,
          group_work: null,
          assessment: null,
          language: "en",
          grade_hint: null,
        },
        plan: null,
        plan_gen: null,
        selected_section_ids: [],
        lesson_id: null,
        slides: [],
        build_progress: null,
        export_status: null,
        image_attachments: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.patch((s) => s.sessions.unshift(session));
      return session;
    },
    updateSession(id, fields) {
      this.patch((s) => {
        const sess = s.sessions.find((x) => x.id === id);
        if (sess) {
          Object.assign(sess, fields, { updated_at: new Date().toISOString() });
        }
      });
    },
    appendMessage(sessionId, msg) {
      this.patch((s) => {
        const sess = s.sessions.find((x) => x.id === sessionId);
        if (sess) {
          sess.messages.push({
            id: uid("msg"),
            at: new Date().toISOString(),
            ...msg,
          });
          sess.updated_at = new Date().toISOString();
        }
      });
    },
  };

  window.XplainStore = Store;
})();