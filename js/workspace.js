(function () {
  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function slidePlaceholdersFromPlan(plan) {
    const slides = [
      {
        id: "s-title",
        title: plan.title.replace(/^Lesson Plan:\s*/i, ""),
        subtitle: "Title slide · " + (plan.global_style?.visual_style || ""),
        section_id: "global-style",
        status: "pending",
      },
    ];
    const pages = plan.pages || plan.sections || [];
    pages.forEach((page) => {
      slides.push({
        id: "s-" + page.id,
        title: page.title,
        subtitle: page.visual_note || `Page ${page.number} · ${page.minutes || "?"} min`,
        section_id: page.id,
        status: "pending",
      });
    });
    return slides;
  }

  const Workspace = {
    ensureSessionFromUrl() {
      const params = new URLSearchParams(location.search);
      if (params.get("new") === "1") {
        const session = XplainStore.createSession({
          title: "New Lesson",
        });
        history.replaceState({}, "", "workspace.html?id=" + session.id);
        return session;
      }
      const id = params.get("id");
      if (id) {
        const s = XplainStore.getSession(id);
        if (s) return s;
      }
      const lessonId = params.get("lesson");
      if (lessonId) {
        const lesson = XplainStore.getLesson(lessonId);
        if (lesson?.session_id) {
          const s = XplainStore.getSession(lesson.session_id);
          if (s) return s;
        }
        // Open ready lesson in a synthetic session view
        if (lesson && lesson.status === "ready") {
          const session = XplainStore.createSession({
            title: lesson.title,
            class_id: lesson.class_id,
          });
          const content = lesson.content || clone(XplainSeed.lessonTemplate);
          XplainStore.updateSession(session.id, {
            phase: "ready",
            plan: null,
            lesson_id: lesson.id,
            slides: content.slides || [],
            title: lesson.title,
            messages: [
              {
                id: XplainStore.uid("msg"),
                role: "assistant",
                text: "This lesson is ready. Ask me to revise any section, or export PDF / PPTX.",
                at: new Date().toISOString(),
              },
            ],
            _readyContent: content,
          });
          // store content on lesson link
          XplainStore.patch((st) => {
            const sess = st.sessions.find((x) => x.id === session.id);
            if (sess) sess.readyContent = content;
          });
          history.replaceState({}, "", "workspace.html?id=" + session.id);
          return XplainStore.getSession(session.id);
        }
      }
      // fallback: create new
      const session = XplainStore.createSession({
        title: "New Lesson",
      });
      history.replaceState({}, "", "workspace.html?id=" + session.id);
      return session;
    },

    async approve(sessionId) {
      const session = XplainStore.getSession(sessionId);
      if (!session?.plan) {
        XplainUI.toast("No plan yet", "Chat with the agent to generate a draft first.", {
          icon: "warning",
        });
        return;
      }

      const slides = slidePlaceholdersFromPlan(session.plan);
      const attachments = session.image_attachments || {};
      slides.forEach((s) => {
        const key = s.section_id || s.id;
        if ((attachments[key]?.images || []).length || (attachments[s.id]?.images || []).length) {
          s.has_teacher_images = true;
          const att = attachments[key] || attachments[s.id];
          if (att?.prompt) s.subtitle = att.prompt;
        }
      });
      const lessonId = XplainStore.uid("l");
      const lesson = {
        id: lessonId,
        title: session.plan.title.replace(/^Lesson Plan:\s*/i, ""),
        class_id: session.class_id,
        status: "building",
        icon: "science",
        updated_at: new Date().toISOString(),
        session_id: sessionId,
        build_progress: { current: 0, total: slides.length, label: "Queued…" },
      };
      XplainStore.upsertLesson(lesson);
      XplainStore.updateSession(sessionId, {
        phase: "building",
        lesson_id: lessonId,
        slides,
        build_progress: { current: 0, total: slides.length, label: "Starting build…" },
        export_status: null,
      });
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: `Plan approved & executing. Building lesson (${slides.length} slides)…`,
      });

      for (let i = 0; i < slides.length; i++) {
        await new Promise((r) => setTimeout(r, 700));
        slides[i].status = "generating";
        XplainStore.updateSession(sessionId, {
          slides: clone(slides),
          build_progress: {
            current: i + 1,
            total: slides.length,
            label: `Generating slide ${i + 1} of ${slides.length}…`,
          },
        });
        XplainStore.upsertLesson({
          ...XplainStore.getLesson(lessonId),
          build_progress: {
            current: i + 1,
            total: slides.length,
            label: `Generating slide ${i + 1} of ${slides.length}…`,
          },
        });
        await new Promise((r) => setTimeout(r, 500));
        slides[i].status = "ready";
        XplainStore.updateSession(sessionId, { slides: clone(slides) });
      }

      const content = clone(XplainSeed.lessonTemplate);
      content.title = lesson.title;
      content.slides = slides.map((s) => ({ ...s, status: "ready" }));
      content.global_style = session.plan.global_style;
      // Map plan pages → built sections
      if (session.plan.pages) {
        content.sections = session.plan.pages.map((p) => ({
          id: p.id,
          type: p.type,
          title: p.title,
          minutes: p.minutes,
          body_md: p.body_md,
          has_diagram: p.type === "instruction",
          source: p.visual_note || "",
        }));
      }
      if (session.plan.class_ref) content.class_ref = session.plan.class_ref;
      content.duration_minutes = session.plan.duration_minutes;
      content.learning_styles = session.plan.learning_styles;

      XplainStore.upsertLesson({
        id: lessonId,
        title: lesson.title,
        class_id: session.class_id,
        status: "ready",
        icon: "science",
        updated_at: new Date().toISOString(),
        session_id: sessionId,
        content,
      });
      XplainStore.updateSession(sessionId, {
        phase: "ready",
        slides: content.slides,
        build_progress: null,
        readyContent: content,
      });
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: "Lesson is ready. You can export PDF or PPTX, or select a section and ask for a revision.",
      });
      XplainUI.toast("Lesson ready", content.title, { icon: "check_circle" });
    },

    async exportLesson(sessionId, format) {
      XplainStore.updateSession(sessionId, {
        export_status: { format, state: "exporting" },
      });
      const toast = XplainUI.toast(
        `Preparing ${format.toUpperCase()} Export`,
        "Generating slides and formatting content…",
        { icon: "progress_activity", spin: true, persist: true, progress: true }
      );
      await new Promise((r) => setTimeout(r, 2200));
      toast?.remove();
      XplainStore.updateSession(sessionId, {
        export_status: { format, state: "ready" },
      });
      const teacher = XplainStore.getTeacher();
      const blob = new Blob(
        [
          `Xplain AI Mock Export (${format.toUpperCase()})\n`,
          `School: ${teacher.school_name}\n`,
          `Teacher: ${teacher.display_name}\n`,
          `Session: ${sessionId}\n`,
          `Generated: ${new Date().toISOString()}\n`,
          `\nThis is a UI mock — no real ${format.toUpperCase()} binary was produced.\n`,
        ],
        { type: "text/plain" }
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `lesson-export-mock.${format === "pdf" ? "txt" : "txt"}`;
      a.click();
      URL.revokeObjectURL(a.href);
      XplainUI.toast(`${format.toUpperCase()} ready`, "Mock file downloaded.", {
        icon: "download",
      });
    },

    async reviseBuiltSection(sessionId, sectionId, instruction) {
      XplainStore.appendMessage(sessionId, {
        role: "user",
        text: instruction,
        section_refs: [sectionId],
      });
      await new Promise((r) => setTimeout(r, 800));
      const sess = XplainStore.getSession(sessionId);
      const content = clone(sess.readyContent || XplainSeed.lessonTemplate);
      if (sectionId === "global-style" && content.global_style) {
        if (/cartoon/i.test(instruction || "")) {
          content.global_style.visual_style = "Cartoon Illustrations";
        } else {
          content.global_style.visual_style =
            (content.global_style.visual_style || "") + " (revised)";
        }
      } else {
        const sec = content.sections.find((s) => s.id === sectionId);
        if (sec) {
          sec.body_md =
            sec.body_md +
            "\n\n*(Regenerated)* " +
            (instruction || "Updated per teacher request.");
          if (/kinesthetic|hands|match/i.test(instruction || "")) {
            sec.body_md =
              '**Hands-on** — Students move/build with everyday materials only.';
          }
        }
      }
      XplainStore.updateSession(sessionId, { readyContent: content });
      if (sess.lesson_id) {
        const lesson = XplainStore.getLesson(sess.lesson_id);
        if (lesson) {
          XplainStore.upsertLesson({
            ...lesson,
            content,
            updated_at: new Date().toISOString(),
          });
        }
      }
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: "Updated `" + sectionId + "` only. Other pages/assets unchanged.",
      });
    },

    getImageAttachment(sessionId, targetId) {
      const sess = XplainStore.getSession(sessionId);
      const map = sess.image_attachments || {};
      return map[targetId] || { prompt: "", images: [] };
    },

    hasImageAttachment(sessionId, targetId) {
      const att = this.getImageAttachment(sessionId, targetId);
      return !!(att.images && att.images.length);
    },

    async addImageToTarget(sessionId, targetId, file) {
      XplainStore.ensureImagesFolder();
      const item = await XplainMedia.simulateUpload(file, {
        folder_id: "f-images",
        images_only: true,
      });
      if (!item) return null;
      await new Promise((r) => setTimeout(r, 700));
      const media = XplainStore.getMediaItem(item.id);
      const sess = XplainStore.getSession(sessionId);
      const map = { ...(sess.image_attachments || {}) };
      const cur = map[targetId] || { prompt: "", images: [] };
      const img = {
        id: XplainStore.uid("imgd"),
        media_id: item.id,
        name: media?.display_name || file.name || "image",
        preview_url: media?.data_url || null,
      };
      map[targetId] = {
        prompt: cur.prompt || "",
        images: [...(cur.images || []), img],
      };
      XplainStore.updateSession(sessionId, { image_attachments: map });
      return img;
    },

    removeImageFromTarget(sessionId, targetId, imageId) {
      const sess = XplainStore.getSession(sessionId);
      const map = { ...(sess.image_attachments || {}) };
      const cur = map[targetId];
      if (!cur) return;
      map[targetId] = {
        ...cur,
        images: (cur.images || []).filter((i) => i.id !== imageId),
      };
      XplainStore.updateSession(sessionId, { image_attachments: map });
    },

    async confirmImageAttachment(sessionId, targetId, prompt) {
      const text = (prompt || "").trim();
      if (!text) {
        XplainUI.toast("Add a prompt", "Tell the AI what to do with the image(s).", {
          icon: "edit",
        });
        return false;
      }
      const sess = XplainStore.getSession(sessionId);
      const map = { ...(sess.image_attachments || {}) };
      const cur = map[targetId] || { prompt: "", images: [] };
      if (!(cur.images || []).length) {
        XplainUI.toast("Upload an image", "Add at least one image first.", {
          icon: "image",
        });
        return false;
      }
      map[targetId] = { ...cur, prompt: text };
      XplainStore.updateSession(sessionId, { image_attachments: map });

      const names = cur.images.map((i) => i.name).join(", ");
      XplainStore.appendMessage(sessionId, {
        role: "user",
        text: `Image for ${targetId} (${names}):\n${text}`,
      });
      await new Promise((r) => setTimeout(r, 500));

      if (sess.plan?.pages) {
        const plan = clone(sess.plan);
        const page = plan.pages.find((p) => p.id === targetId);
        if (page) {
          page.visual_note = text;
          page.has_teacher_images = true;
          page.body_md =
            (page.body_md || "") +
            "\n\n*[Image]* " +
            cur.images.map((i) => "**" + i.name + "**").join(", ") +
            " — " +
            text;
        }
        XplainStore.updateSession(sessionId, { plan });
      }

      const slides = sess.slides || [];
      if (slides.length) {
        const nextSlides = clone(slides);
        const slide = nextSlides.find(
          (s) => s.id === targetId || s.section_id === targetId
        );
        if (slide) {
          slide.subtitle = text;
          slide.has_teacher_images = true;
        }
        XplainStore.updateSession(sessionId, { slides: nextSlides });
      }

      if (sess.readyContent) {
        const content = clone(sess.readyContent);
        const sec = (content.sections || []).find((s) => s.id === targetId);
        if (sec) {
          sec.body_md =
            (sec.body_md || "") +
            "\n\n*[Image]* " +
            cur.images.map((i) => "**" + i.name + "**").join(", ") +
            " — " +
            text;
          sec.source = "Teacher image: " + names;
          sec.has_teacher_images = true;
        }
        if (content.slides?.length) {
          const slide = content.slides.find(
            (s) => s.id === targetId || s.section_id === targetId
          );
          if (slide) {
            slide.subtitle = text;
            slide.has_teacher_images = true;
          }
        }
        XplainStore.updateSession(sessionId, { readyContent: content });
        if (sess.lesson_id) {
          const lesson = XplainStore.getLesson(sess.lesson_id);
          if (lesson) {
            XplainStore.upsertLesson({
              ...lesson,
              content,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }

      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text:
          "Saved image directions for this item:\n\n• " +
          text +
          "\n\nI'll use " +
          cur.images.length +
          " image(s).",
      });
      XplainUI.toast("Saved", "Image directions updated", { icon: "image" });
      return true;
    },

    // Keep approve compatible: apply any attachments that aren't on pages yet
    async applyImageDirectives(sessionId) {
      const sess = XplainStore.getSession(sessionId);
      const map = sess.image_attachments || {};
      const entries = Object.entries(map).filter(
        ([, v]) => v.prompt && (v.images || []).length
      );
      if (!entries.length) return false;
      for (const [targetId, att] of entries) {
        await this.confirmImageAttachment(sessionId, targetId, att.prompt);
      }
      return true;
    },
  };

  window.XplainWorkspace = Workspace;
})();
