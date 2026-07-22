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

  function ensure() {
    let state = load();
    if (!state || state.version !== XplainSeed.version) {
      state = {
        version: XplainSeed.version,
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
    return state;
  }

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
      save(state);
      return state;
    },
    uid,
    getTeacher() {
      return ensure().teacher;
    },
    updateTeacher(fields) {
      return this.patch((s) => Object.assign(s.teacher, fields));
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
      this.ensureImagesFolder();
      return ensure().folders;
    },
    ensureImagesFolder() {
      const s = ensure();
      if (!s.folders) s.folders = [];
      if (!s.folders.some((f) => f.id === "f-images")) {
        this.patch((st) => {
          st.folders.unshift({
            id: "f-images",
            name: "Images",
            kind: "images",
            updated_at: new Date().toISOString(),
          });
        });
      }
    },
    isImagesFolder(folderId) {
      if (folderId === "f-images") return true;
      const f = this.getFolders().find((x) => x.id === folderId);
      return f?.kind === "images" || f?.name === "Images";
    },
    addFolder(data) {
      const folder = {
        id: uid("f"),
        name: (data.name || "New Folder").trim() || "New Folder",
        updated_at: new Date().toISOString(),
      };
      this.patch((s) => {
        if (!s.folders) s.folders = [];
        // Keep Images folder first
        const images = s.folders.filter((f) => f.id === "f-images");
        const rest = s.folders.filter((f) => f.id !== "f-images");
        s.folders = [...images, folder, ...rest];
      });
      return folder;
    },
    addMedia(item) {
      const m = {
        id: uid("m"),
        status: "uploading",
        folder_id: "f-general",
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