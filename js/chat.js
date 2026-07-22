(function () {
  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function detectMentions(text) {
    const media = XplainStore.getMedia().filter((m) => m.status === "indexed");
    const classes = XplainStore.getClasses();
    const identities = XplainStore.getIdentities();
    const found = {
      media_ids: [],
      class_ids: [],
      identity_ids: [],
      page_ids: [],
      global_style: false,
      labels: [],
    };

    if (/@Global\s+Design\s+Style/i.test(text) || /@Global\s+Style/i.test(text)) {
      found.global_style = true;
      found.labels.push("Global Design Style");
    }
    for (const pm of text.matchAll(/@Page\s+(\d+)/gi)) {
      found.page_ids.push("page-" + pm[1]);
      found.labels.push("Page " + pm[1]);
    }

    const re = /@([^\n@]+?)(?=\s@|\s*$|[.,!?])/g;
    let match;
    while ((match = re.exec(text))) {
      const label = match[1].trim().replace(/[.,!?]$/, "");
      if (/^Global/i.test(label) || /^Page\s+\d+$/i.test(label)) continue;

      const m = media.find((x) =>
        x.display_name.toLowerCase().includes(label.toLowerCase())
      );
      const c = classes.find((x) =>
        x.name.toLowerCase().includes(label.toLowerCase())
      );
      const idn = identities.find((x) =>
        x.name.toLowerCase().includes(label.toLowerCase())
      );
      if (m) {
        found.media_ids.push(m.id);
        found.labels.push(m.display_name);
      }
      if (c) {
        found.class_ids.push(c.id);
        found.labels.push(c.name);
      }
      if (idn) {
        found.identity_ids.push(idn.id);
        found.labels.push(idn.name);
      }
    }
    return found;
  }

  function extractDuration(text) {
    const m = text.match(/(\d+)\s*-?\s*min/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function extractStyles(text) {
    const styles = [];
    const t = text.toLowerCase();
    if (t.includes("visual")) styles.push("visual");
    if (t.includes("kinesthetic") || t.includes("hands-on") || t.includes("hands on"))
      styles.push("kinesthetic");
    if (t.includes("auditory")) styles.push("auditory");
    if (t.includes("reading") || t.includes("writing")) styles.push("reading/writing");
    return styles;
  }

  function wantsAssessment(text) {
    const t = text.toLowerCase().trim();
    if (t === "yes" || t === "y") return true;
    if (t === "no" || t === "n") return false;
    if (/\b(no|without|skip)\b.*\b(assess|exit|ticket|quiz)/.test(t)) return false;
    if (/\b(yes|include|with)\b.*\b(assess|exit|ticket|quiz)/.test(t)) return true;
    if (t.includes("exit ticket") || t.includes("assessment")) return true;
    return null;
  }

  function parseYesNo(text) {
    const t = text.toLowerCase().trim();
    if (t === "yes" || t === "y") return true;
    if (t === "no" || t === "n") return false;
    if (/^(yeah|yep|sure|ok|okay)\b/.test(t)) return true;
    if (/^(nope|nah)\b/.test(t)) return false;
    return null;
  }

  function bgLabel(v) {
    return (
      {
        simple_white: "Simple white",
        solid_color: "Solid color",
        soft_color: "Solid color",
        patterned: "Solid color",
      }[v] || v
    );
  }

  function imageLabel(v) {
    return (
      {
        realistic: "Realistic images",
        cartoon: "Cartoon illustrations",
        diagram: "Scientific diagrams",
        mixed: "Mixed visuals",
      }[v] || v
    );
  }

  function identitySummary(id) {
    const i = XplainStore.getIdentity(id);
    if (!i) return null;
    return `${i.name} · ${imageLabel(i.image_style)} · ${bgLabel(i.background_style)}`;
  }

  function requirementsSummary(session, req) {
    const cls = session.class_id
      ? XplainStore.getClass(session.class_id)
      : null;
    const mediaNames = (session.media_ids || [])
      .map((id) => XplainStore.getMediaItem(id)?.display_name)
      .filter(Boolean);
    const idn = session.identity_id
      ? identitySummary(session.identity_id)
      : null;
    return [
      req.topic ? `Topic: ${req.topic}` : null,
      cls ? `Class: ${cls.name}` : req.grade_hint ? `Grade: ${req.grade_hint}` : null,
      req.duration ? `${req.duration}-minute lesson` : null,
      req.styles?.length ? `Learning focus: ${req.styles.join(", ")}` : null,
      req.pair_work === true
        ? "Pair work: yes"
        : req.pair_work === false
          ? "Pair work: no"
          : null,
      req.group_work === true
        ? "Group work: yes"
        : req.group_work === false
          ? "Group work: no"
          : null,
      req.assessment === false
        ? "No assessment / exit ticket"
        : req.assessment === true
          ? "Include assessment + exit ticket"
          : null,
      mediaNames.length ? `Sources: ${mediaNames.join(", ")}` : null,
      idn ? `Identity: ${idn}` : null,
    ].filter(Boolean);
  }

  function hasEnough(session, req) {
    return !!(
      req.topic &&
      session.media_ids?.length &&
      session.identity_id &&
      (session.class_id || req.grade_hint) &&
      req.duration &&
      req.styles?.length &&
      typeof req.pair_work === "boolean" &&
      typeof req.group_work === "boolean" &&
      typeof req.assessment === "boolean"
    );
  }

  function revisePlan(plan, refs, instruction) {
    const next = clone(plan);
    next.version = (next.version || 1) + 1;
    const lower = instruction.toLowerCase();

    const wantsGlobal =
      refs.includes("global-style") ||
      /@Global/i.test(instruction) ||
      (!refs.length && /global|visual style|cartoon|typography|colors|background/i.test(lower));

    if (wantsGlobal) {
      const gs = next.global_style;
      const notes = [];
      if (/cartoon/i.test(lower)) {
        notes.push(`Visual Style: ${gs.visual_style} → Cartoon Illustrations`);
        gs.visual_style = "Cartoon Illustrations";
        gs.image_style = "cartoon";
      }
      if (/realistic|photo/i.test(lower)) {
        notes.push(`Visual Style → Realistic Images`);
        gs.visual_style = "Realistic Images";
        gs.image_style = "realistic";
      }
      if (/white|simple/i.test(lower) && /background/i.test(lower)) {
        notes.push(`Background → Simple white`);
        gs.background_style = "simple_white";
      }
      if (/playful|bright|coral/i.test(lower)) {
        notes.push(`Colors updated to a more playful palette`);
        gs.colors = "Coral · Sky · Cream";
      }
      if (!notes.length) {
        notes.push("Global Design Style updated per your note.");
        gs.visual_style = (gs.visual_style || "") + " (revised)";
      }
      return {
        plan: next,
        reply:
          "I'll update the global design style only:\n\n" +
          notes.join("\n") +
          "\n\nExisting page plans were left unchanged. Edit individual pages if they should match.",
      };
    }

    const pageRefs = refs.filter((id) => id.startsWith("page-"));
    const ids = pageRefs.length ? pageRefs : refs.filter((id) => id !== "global-style");
    if (!ids.length) {
      return {
        plan,
        reply:
          "Which part should I change? Use the pencil on a page or Global Design Style so I only edit what you ask for.",
      };
    }

    ids.forEach((id) => {
      const page = next.pages.find((p) => p.id === id);
      if (!page) return;
      if (/kinesthetic|hands-on|hands on|activity/i.test(lower)) {
        page.body_md =
          "Hands-on activity: students build, sort, or role-play the concept with everyday materials.";
        page.title = page.title.replace(/—.*$/, "— Hands-on");
      } else if (/shorten|five|5 question/i.test(lower)) {
        page.body_md =
          "Short check: 5 questions (3 MCQ + 2 short). Model answers included for the teacher.";
        page.minutes = Math.min(page.minutes || 5, 5);
      } else if (/simpl|easier|beginner/i.test(lower)) {
        page.body_md =
          page.body_md +
          "\n\n*(Revised)* Simplified language and fewer jargon terms for beginners.";
      } else {
        page.body_md = page.body_md + "\n\n*(Revised)* " + instruction.slice(0, 180);
      }
    });

    return {
      plan: next,
      reply: `Updated plan to v${next.version}. Only changed: ${ids
        .map((id) => {
          const p = next.pages.find((x) => x.id === id);
          return p ? `Page ${p.number}` : id;
        })
        .join(", ")}. Everything else is untouched.`,
    };
  }

  function buildAiPages(topic) {
    const t = (topic || "").toLowerCase();
    if (!/ai|artificial|machine learning|ml\b/.test(t)) {
      return clone(XplainSeed.planTemplate.pages);
    }
    return [
      {
        id: "page-1",
        number: 1,
        type: "starter",
        title: "Page 1 — Hook: AI around us",
        minutes: 8,
        status: "ready",
        body_md:
          "Show 3 everyday AI examples (phone face unlock, maps, recommendations). Ask: “Which of these is AI — and how do you know?”",
        visual_note: "Collage of everyday AI moments",
      },
      {
        id: "page-2",
        number: 2,
        type: "instruction",
        title: "Page 2 — What is AI?",
        minutes: 12,
        status: "ready",
        body_md:
          "Define AI in student language: systems that learn patterns from data to make predictions or decisions. Contrast with a regular calculator (rules only).",
        visual_note: "Simple diagram: Data → Model → Prediction",
      },
      {
        id: "page-3",
        number: 3,
        type: "activity",
        title: "Page 3 — Train a tiny classifier",
        minutes: 15,
        status: "ready",
        body_md:
          "Pair activity: sort image cards into ‘cat / not cat’ rules, then discuss how a model might learn from many examples — and fail on edge cases.",
        visual_note: "Card sorting table layout",
      },
      {
        id: "page-4",
        number: 4,
        type: "assessment",
        title: "Page 4 — Exit ticket",
        minutes: 5,
        status: "ready",
        body_md:
          "Exit ticket: (1) One AI example from your day. (2) One risk or fairness issue. (3) One question you still have.",
        visual_note: "Three-box exit ticket card",
      },
    ];
  }

  function buildPlanSkeleton(session, requirements) {
    const plan = clone(XplainSeed.planTemplate);
    plan.version = 1;
    plan.duration_minutes = requirements.duration || 45;
    plan.learning_styles = requirements.styles?.length
      ? requirements.styles
      : ["visual"];
    plan.global_style_status = "pending";
    plan.pages = buildAiPages(requirements.topic).map((p) => ({
      ...p,
      status: "pending",
    }));

    // Reflect pair / group work on the activity page
    const activity = plan.pages.find((p) => /activity|train|practice/i.test(p.title + p.type));
    if (activity) {
      if (requirements.pair_work && requirements.group_work) {
        activity.body_md =
          "Mixed collaboration: short pair discussion, then table groups synthesize findings. Include roles so every student contributes.";
        activity.visual_note = "Pair desks → small-group tables";
      } else if (requirements.pair_work) {
        activity.body_md =
          "Pair activity: partners work through the task together, then share one insight with the class.";
        activity.visual_note = "Side-by-side pair desks";
      } else if (requirements.group_work) {
        activity.body_md =
          "Group activity: teams of 3–4 complete the task with assigned roles (recorder, presenter, checker).";
        activity.visual_note = "Small-group table layout";
      } else if (requirements.pair_work === false && requirements.group_work === false) {
        activity.body_md =
          "Individual practice: each student completes the task independently, then a brief whole-class share.";
        activity.visual_note = "Individual desk work";
      }
    }

    if (requirements.assessment === false) {
      plan.pages = plan.pages.filter((p) => p.type !== "assessment");
      plan.pages.forEach((p, i) => {
        p.number = i + 1;
        p.id = "page-" + (i + 1);
        p.title = p.title.replace(/Page \d+/, "Page " + (i + 1));
      });
    }

    const idn = session.identity_id
      ? XplainStore.getIdentity(session.identity_id)
      : null;
    if (idn) {
      plan.global_style = {
        id: "global-style",
        identity_id: idn.id,
        identity: idn.name,
        colors: `${idn.primary} · ${idn.secondary}`,
        primary: idn.primary,
        secondary: idn.secondary,
        typography: idn.typography,
        visual_style: imageLabel(idn.image_style),
        image_style: idn.image_style,
        background_style: idn.background_style,
        background: bgLabel(idn.background_style),
        rules: idn.instructions
          ? idn.instructions.split(/[.\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
          : [],
        logo_data_url: idn.logo_data_url,
      };
    }

    if (session.class_id) {
      const c = XplainStore.getClass(session.class_id);
      if (c) {
        plan.class_ref = {
          id: c.id,
          name: c.name,
          grade: c.grade,
          curriculum: c.curriculum,
        };
      }
    } else if (requirements.grade_hint) {
      plan.class_ref = {
        name: requirements.grade_hint,
        grade: requirements.grade_hint,
        curriculum: "—",
      };
    }

    if (session.media_ids?.length) {
      plan.media_ids = session.media_ids;
      plan.sources = session.media_ids.map((id) => ({
        media_asset_id: id,
        display_name: XplainStore.getMediaItem(id)?.display_name || id,
        refs: ["excerpt 1"],
      }));
    }

    const topicShort = (requirements.topic || "Lesson")
      .replace(/^.*?about\s+/i, "")
      .slice(0, 48);
    plan.title = "Lesson Plan: " + topicShort;
    plan.sections = plan.pages;
    return plan;
  }

  function offerConfirm(sessionId) {
    const sess = XplainStore.getSession(sessionId);
    const bullets = requirementsSummary(sess, sess.requirements);
    XplainStore.updateSession(sessionId, {
      agent_step: "confirm",
      awaiting_plan_confirm: true,
    });
    XplainStore.appendMessage(sessionId, {
      role: "assistant",
      text:
        "I have enough information to create your lesson plan.\n\nI understand:\n" +
        bullets.map((b) => "• " + b).join("\n") +
        "\n\nWould you like me to start creating the lesson plan?",
      meta: { confirm_plan: true },
    });
  }

  function askForSources(sessionId) {
    const media = XplainStore.getMedia()
      .filter((m) => m.status === "indexed")
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    XplainStore.updateSession(sessionId, { agent_step: "source" });
    XplainStore.appendMessage(sessionId, {
      role: "assistant",
      text:
        "Which source(s) should ground this lesson?\n\nOpen the Media Library to search folders and files — you can select more than one.",
      meta: {
        open_media_picker: true,
        recent: media.slice(0, 4).map((m) => ({
          id: m.id,
          label: m.display_name,
          icon: mimeIcon(m.mime_type),
          sub: (m.mime_type || "").includes("pdf")
            ? "PDF"
            : (m.mime_type || "").includes("presentation")
              ? "Slides"
              : (m.mime_type || "").includes("uri")
                ? "Link"
                : "File",
        })),
      },
    });
  }

  function mimeIcon(mime) {
    const m = (mime || "").toLowerCase();
    if (m.includes("pdf")) return "picture_as_pdf";
    if (m.includes("presentation") || m.includes("powerpoint")) return "slideshow";
    if (m.includes("word") || m.includes("document")) return "article";
    if (m.includes("uri") || m.includes("html")) return "link";
    if (m.startsWith("image/")) return "image";
    return "description";
  }

  function selectedSourcesMeta(sessionId) {
    const sess = XplainStore.getSession(sessionId);
    return (sess.media_ids || [])
      .map((id) => {
        const m = XplainStore.getMediaItem(id);
        if (!m) return null;
        return {
          id: m.id,
          label: m.display_name,
          icon: mimeIcon(m.mime_type),
          sub: (m.mime_type || "").includes("pdf")
            ? "PDF"
            : (m.mime_type || "").includes("presentation")
              ? "Slides"
              : (m.mime_type || "").includes("uri")
                ? "Link"
                : "File",
        };
      })
      .filter(Boolean);
  }

  function confirmSourcesMessage(sessionId) {
    const sources = selectedSourcesMeta(sessionId);
    const n = sources.length;
    XplainStore.appendMessage(sessionId, {
      role: "assistant",
      text:
        n === 1
          ? "Here’s the source I’ll use for this lesson. Add more if you want, or continue to Identity."
          : `Here are the ${n} sources I’ll use. Add more if you want, or continue to Identity.`,
      meta: {
        selected_sources: sources,
        open_media_picker: true,
        actions: [{ id: "next_identity", label: "Continue to Identity →" }],
      },
    });
  }

  function askForIdentity(sessionId) {
    const list = XplainStore.getIdentities();
    const def = XplainStore.getTeacher().default_identity_id;
    const sorted = [...list].sort((a, b) => {
      if (a.id === def) return -1;
      if (b.id === def) return 1;
      return 0;
    });
    XplainStore.updateSession(sessionId, { agent_step: "identity" });
    XplainStore.appendMessage(sessionId, {
      role: "assistant",
      text: "Which Identity (brand) should we use for colors, logo, background, and image style?",
      meta: {
        pick_identity: true,
        options: sorted.map((i) => ({
          id: i.id,
          label: i.name,
          sub: `${imageLabel(i.image_style)} · ${bgLabel(i.background_style)}`,
          primary: i.primary,
          secondary: i.secondary,
        })),
      },
    });
  }

  function askDetails(sessionId) {
    const sess = XplainStore.getSession(sessionId);
    const req = sess.requirements || {};
    XplainStore.updateSession(sessionId, { agent_step: "details" });

    if (!sess.class_id && !req.grade_hint) {
      const classes = XplainStore.getClasses().filter((c) => c.status !== "archived");
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: "Which class is this for?",
        meta: {
          pick_class: true,
          options: classes.map((c) => ({
            id: c.id,
            label: c.name,
            sub: `${c.grade || ""} · ${c.curriculum || ""}`.replace(/^ · | · $/g, ""),
            accent: c.accent || "#7B4DFF",
          })),
        },
      });
      return;
    }
    if (!req.duration) {
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: "How long is the lesson? (e.g. 45 minutes)",
        meta: {
          quick_replies: ["30 min", "45 min", "60 min"],
        },
      });
      return;
    }
    if (!req.styles?.length) {
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: "Which learning styles should I emphasize?",
        meta: {
          quick_replies: ["visual", "kinesthetic", "visual + kinesthetic", "auditory"],
        },
      });
      return;
    }
    if (req.pair_work == null) {
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: "Do you need pair work in this lesson?",
        meta: { quick_replies: ["Yes", "No"] },
      });
      return;
    }
    if (req.group_work == null) {
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: "Do you need group work?",
        meta: { quick_replies: ["Yes", "No"] },
      });
      return;
    }
    if (req.assessment == null) {
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: "Include an assessment + exit ticket?",
        meta: { quick_replies: ["Yes", "No"] },
      });
      return;
    }
    offerConfirm(sessionId);
  }

  const planLocks = new Set();

  function finalizePlanState(sessionId, fallbackPlan) {
    const final = XplainStore.getSession(sessionId);
    const finalPlan = clone(final?.plan || fallbackPlan);
    if (!finalPlan) return null;
    finalPlan.global_style_status = "ready";
    (finalPlan.pages || []).forEach((page) => {
      page.status = "ready";
    });
    finalPlan.sections = finalPlan.pages;
    const finalGen = clone(final?.plan_gen || { steps: [] });
    (finalGen.steps || []).forEach((s) => {
      s.status = "done";
    });
    XplainStore.updateSession(sessionId, {
      plan: finalPlan,
      plan_gen: finalGen,
      phase: "planning",
      agent_step: "plan_ready",
      title: finalPlan.title,
      generating_token: null,
    });
    return finalPlan;
  }

  const Chat = {
    bgLabel,
    imageLabel,

    getMentionSuggestions(query) {
      const q = (query || "").toLowerCase();
      const planItems = [];
      try {
        const id = new URLSearchParams(location.search).get("id");
        const sess = id ? XplainStore.getSession(id) : null;
        if (sess?.plan) {
          planItems.push({
            type: "style",
            id: "global-style",
            label: "Global Design Style",
            icon: "palette",
          });
          (sess.plan.pages || []).forEach((p) => {
            planItems.push({
              type: "page",
              id: p.id,
              label: "Page " + p.number,
              icon: "description",
            });
          });
        }
      } catch (_) {}

      const identities = XplainStore.getIdentities()
        .filter((i) => !q || i.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map((i) => ({
          type: "identity",
          id: i.id,
          label: i.name,
          icon: "badge",
        }));
      const media = XplainStore.getMedia()
        .filter((m) => m.status === "indexed")
        .filter((m) => !q || m.display_name.toLowerCase().includes(q))
        .slice(0, 4)
        .map((m) => ({
          type: "media",
          id: m.id,
          label: m.display_name,
          icon: "description",
        }));
      const classes = XplainStore.getClasses()
        .filter((c) => !q || c.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map((c) => ({ type: "class", id: c.id, label: c.name, icon: "groups" }));
      return [...planItems, ...identities, ...classes, ...media]
        .filter((it) => !q || it.label.toLowerCase().includes(q))
        .slice(0, 10);
    },

    selectSource(sessionId, mediaId) {
      const sess = XplainStore.getSession(sessionId);
      const merged = Array.from(new Set([...(sess.media_ids || []), mediaId]));
      XplainStore.updateSession(sessionId, { media_ids: merged });
      const name = XplainStore.getMediaItem(mediaId)?.display_name || mediaId;
      XplainStore.appendMessage(sessionId, {
        role: "user",
        text: `Source: @${name}`,
      });
      const s2 = XplainStore.getSession(sessionId);
      if (!s2.identity_id) {
        confirmSourcesMessage(sessionId);
      } else {
        askDetails(sessionId);
      }
    },

    selectSources(sessionId, mediaIds) {
      if (!mediaIds?.length) return;
      const sess = XplainStore.getSession(sessionId);
      const merged = Array.from(new Set([...(sess.media_ids || []), ...mediaIds]));
      XplainStore.updateSession(sessionId, { media_ids: merged });
      const names = mediaIds
        .map((id) => XplainStore.getMediaItem(id)?.display_name || id)
        .map((n) => "@" + n);
      XplainStore.appendMessage(sessionId, {
        role: "user",
        text:
          mediaIds.length === 1
            ? `Source: ${names[0]}`
            : `Sources (${mediaIds.length}):\n` + names.map((n) => "• " + n).join("\n"),
      });
      const s2 = XplainStore.getSession(sessionId);
      if (!s2.identity_id) {
        confirmSourcesMessage(sessionId);
      } else {
        askDetails(sessionId);
      }
    },

    goToIdentity(sessionId) {
      const sess = XplainStore.getSession(sessionId);
      if (!sess.media_ids?.length) {
        XplainStore.appendMessage(sessionId, {
          role: "assistant",
          text: "Please pick at least one source first.",
        });
        askForSources(sessionId);
        return;
      }
      askForIdentity(sessionId);
    },

    selectIdentity(sessionId, identityId) {
      XplainStore.updateSession(sessionId, { identity_id: identityId });
      const name = XplainStore.getIdentity(identityId)?.name || identityId;
      XplainStore.appendMessage(sessionId, {
        role: "user",
        text: `Identity: @${name}`,
      });
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: `Using identity “${name}”. I’ll apply its colors, background, and image style to the plan’s Global Design Style.`,
      });
      setTimeout(() => askDetails(sessionId), 200);
    },

    selectClass(sessionId, classId) {
      XplainStore.updateSession(sessionId, { class_id: classId });
      const name = XplainStore.getClass(classId)?.name || classId;
      XplainStore.appendMessage(sessionId, {
        role: "user",
        text: `Class: @${name}`,
      });
      setTimeout(() => askDetails(sessionId), 200);
    },

    applyQuickReply(sessionId, text) {
      return Chat.sendTeacherMessage(sessionId, text, []);
    },

    continueDiscussion(sessionId) {
      XplainStore.updateSession(sessionId, {
        awaiting_plan_confirm: false,
        agent_step: "details",
      });
      XplainStore.appendMessage(sessionId, {
        role: "user",
        text: "Continue discussion",
      });
      XplainStore.appendMessage(sessionId, {
        role: "assistant",
        text: "Sure — tell me anything else to include. When you’re ready, tap Make The Plan or say “create the plan”.",
      });
    },

    async createLessonPlan(sessionId) {
      if (planLocks.has(sessionId)) return;
      planLocks.add(sessionId);
      const token = "gen-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      try {
        const sess = XplainStore.getSession(sessionId);
        if (!sess) return;

        XplainStore.appendMessage(sessionId, {
          role: "user",
          text: "Make The Plan",
        });
        XplainStore.updateSession(sessionId, {
          awaiting_plan_confirm: false,
          phase: "generating_plan",
          generating_token: token,
        });
        XplainStore.appendMessage(sessionId, {
          role: "assistant",
          text: "Building your lesson draft now — style first, then each page.",
          meta: { generating: true },
        });

        const plan = buildPlanSkeleton(sess, sess.requirements || {});
        const steps = [
          { key: "style", label: "Global Design Style" },
          ...plan.pages.map((p) => ({
            key: p.id,
            label: p.title || "Page " + p.number,
          })),
        ];
        XplainStore.updateSession(sessionId, {
          plan: clone(plan),
          plan_gen: {
            steps: steps.map((s) => ({ ...s, status: "pending" })),
            current: 0,
            status_text: "Preparing your outline…",
          },
          title: plan.title,
          generating_token: token,
        });

        const isCurrent = () =>
          XplainStore.getSession(sessionId)?.generating_token === token;

        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const jitter = (min, max) =>
          min + Math.floor(Math.random() * (max - min + 1));

        // Calm opening beat so the workspace can settle before writing starts.
        await wait(1100);
        if (!isCurrent()) return;

        for (let i = 0; i < steps.length; i++) {
          if (!isCurrent()) return;

          const label = steps[i].label;
          const isStyle = steps[i].key === "style";
          const thinkMs = isStyle ? jitter(900, 1200) : jitter(700, 1000);
          const writeMs = isStyle ? jitter(1400, 1800) : jitter(1600, 2200);

          const s2 = XplainStore.getSession(sessionId);
          const p = clone(s2.plan);
          const gen = clone(s2.plan_gen);
          if (!gen?.steps?.[i]) break;
          gen.steps[i].status = "generating";
          gen.current = i;
          gen.status_text = isStyle
            ? "Setting Global Design Style…"
            : `Drafting ${label}…`;
          XplainStore.updateSession(sessionId, {
            plan: p,
            plan_gen: gen,
            generating_token: token,
          });

          await wait(thinkMs);
          if (!isCurrent()) return;

          // Mid-step copy update so the wait feels intentional, not stuck.
          const sMid = XplainStore.getSession(sessionId);
          const genMid = clone(sMid.plan_gen);
          if (genMid) {
            genMid.status_text = isStyle
              ? "Applying colors, type, and visual rules…"
              : `Shaping activities and teaching notes…`;
            XplainStore.updateSession(sessionId, {
              plan_gen: genMid,
              generating_token: token,
            });
          }

          await wait(writeMs);
          if (!isCurrent()) return;

          const s3 = XplainStore.getSession(sessionId);
          const p2 = clone(s3.plan);
          const gen2 = clone(s3.plan_gen);
          if (!gen2?.steps?.[i]) break;
          gen2.steps[i].status = "done";
          gen2.status_text =
            i < steps.length - 1
              ? `Ready — moving to the next section…`
              : "Almost done — polishing the draft…";
          if (steps[i].key === "style") p2.global_style_status = "ready";
          else {
            const page = p2.pages.find((x) => x.id === steps[i].key);
            if (page) page.status = "ready";
          }
          p2.sections = p2.pages;
          XplainStore.updateSession(sessionId, {
            plan: p2,
            plan_gen: gen2,
            phase: "generating_plan",
            generating_token: token,
          });

          // Short breath between sections so Ready → next Writing is readable.
          if (i < steps.length - 1) {
            await wait(jitter(450, 700));
            if (!isCurrent()) return;
          }
        }

        if (!isCurrent()) return;
        await wait(900);
        if (!isCurrent()) return;

        const finalPlan = finalizePlanState(sessionId, plan);
        if (!finalPlan) return;

        const already = (XplainStore.getSession(sessionId)?.messages || []).some(
          (m) => m.meta?.draft
        );
        if (!already) {
          XplainStore.appendMessage(sessionId, {
            role: "assistant",
            text: `Draft ready — '${finalPlan.title}'.\n\nReview Global Design Style and each page. Use the pin to edit any page (@Page N) or the identity style (@Global Design Style). When you’re happy, click Approve & Execute.`,
            meta: { plan_version: 1, draft: true },
          });
        }
      } catch (err) {
        console.error("createLessonPlan failed", err);
        finalizePlanState(sessionId);
      } finally {
        planLocks.delete(sessionId);
      }
    },

    isGenerating(sessionId) {
      return planLocks.has(sessionId);
    },

    /** Recover a session stuck on the generating spinner. */
    finalizeStuckPlan(sessionId) {
      if (planLocks.has(sessionId)) return false;
      const sess = XplainStore.getSession(sessionId);
      if (!sess?.plan) return false;
      if (sess.phase !== "generating_plan" && sess.phase !== "planning") {
        return false;
      }
      // Already showing a finished plan
      if (
        sess.phase === "planning" &&
        (sess.plan.pages || []).every((p) => p.status === "ready") &&
        sess.plan.global_style_status === "ready"
      ) {
        return false;
      }
      const finalPlan = finalizePlanState(sessionId, sess.plan);
      if (!finalPlan) return false;
      const already = (sess.messages || []).some((m) => m.meta?.draft);
      if (!already) {
        XplainStore.appendMessage(sessionId, {
          role: "assistant",
          text: `Draft ready — '${finalPlan.title}'.\n\nReview the plan on the right, then Approve & Execute when you’re happy.`,
          meta: { plan_version: finalPlan.version || 1, draft: true },
        });
      }
      return true;
    },

    isPlanViewable(sess) {
      if (!sess?.plan) return false;
      if (sess.phase === "planning" || sess.phase === "ready") return true;
      if (sess.phase !== "generating_plan") return false;
      const pages = sess.plan.pages || [];
      const steps = sess.plan_gen?.steps || [];
      const pagesReady =
        pages.length > 0 && pages.every((p) => p.status === "ready");
      const stepsDone =
        steps.length > 0 && steps.every((s) => s.status === "done");
      const hasDraftMsg = (sess.messages || []).some((m) => m.meta?.draft);
      return pagesReady || stepsDone || hasDraftMsg;
    },

    async sendTeacherMessage(sessionId, text, sectionRefs = []) {
      const trimmed = text.trim();
      if (!trimmed) return;

      XplainStore.appendMessage(sessionId, {
        role: "user",
        text: trimmed,
        section_refs: sectionRefs,
      });

      const session = XplainStore.getSession(sessionId);
      const mentions = detectMentions(trimmed);
      const patch = {};
      if (mentions.class_ids[0]) patch.class_id = mentions.class_ids[0];
      if (mentions.identity_ids[0]) patch.identity_id = mentions.identity_ids[0];
      if (mentions.media_ids.length) {
        patch.media_ids = Array.from(
          new Set([...(session.media_ids || []), ...mentions.media_ids])
        );
      }
      if (Object.keys(patch).length) XplainStore.updateSession(sessionId, patch);

      const refs = Array.from(
        new Set([
          ...sectionRefs,
          ...mentions.page_ids,
          ...(mentions.global_style ? ["global-style"] : []),
        ])
      );

      await new Promise((r) => setTimeout(r, 450 + Math.random() * 350));

      const sess = XplainStore.getSession(sessionId);
      const req = { ...sess.requirements };
      const step = sess.agent_step || "topic";

      // Plan editing
      if (sess.plan && (sess.phase === "planning" || sess.phase === "ready")) {
        if (sess.phase === "planning") {
          const { plan, reply } = revisePlan(sess.plan, refs, trimmed);
          if (plan !== sess.plan) {
            plan.sections = plan.pages;
            XplainStore.updateSession(sessionId, {
              plan,
              selected_section_ids: [],
              title: plan.title,
            });
          }
          XplainStore.appendMessage(sessionId, { role: "assistant", text: reply });
          return;
        }
      }

      if (
        sess.awaiting_plan_confirm &&
        /^(yes|start|create|go ahead|do it|build)/i.test(trimmed)
      ) {
        await Chat.createLessonPlan(sessionId);
        return;
      }

      const duration = extractDuration(trimmed);
      const styles = extractStyles(trimmed);
      const yn = parseYesNo(trimmed);
      const assess = wantsAssessment(trimmed);
      if (duration) req.duration = duration;
      if (styles.length)
        req.styles = Array.from(new Set([...(req.styles || []), ...styles]));
      // Yes/No answers apply in order: pair → group → assessment
      if (req.styles?.length && req.pair_work == null && yn !== null) {
        req.pair_work = yn;
      } else if (req.pair_work != null && req.group_work == null && yn !== null) {
        req.group_work = yn;
      } else if (req.group_work != null && req.assessment == null) {
        if (assess !== null) req.assessment = assess;
        else if (yn !== null) req.assessment = yn;
      }
      const grade = trimmed.match(/grade\s*\d+/i);
      if (grade) req.grade_hint = grade[0];

      // --- Guided cycle from the beginning ---
      if (step === "topic") {
        req.topic = trimmed.slice(0, 120);
        XplainStore.updateSession(sessionId, {
          requirements: req,
          title: "Lesson: " + req.topic.slice(0, 40),
        });
        XplainStore.appendMessage(sessionId, {
          role: "assistant",
          text: `Great — we’ll build a lesson about “${req.topic}”.\n\nNext I need two things: a source from your library, and an Identity set (brand colors / logo / image style).`,
        });
        setTimeout(() => askForSources(sessionId), 250);
        return;
      }

      if (step === "source") {
        if (mentions.media_ids.length || sess.media_ids?.length) {
          if (!sess.identity_id && !mentions.identity_ids.length) {
            XplainStore.updateSession(sessionId, { requirements: req });
            askForIdentity(sessionId);
            return;
          }
        } else {
          XplainStore.appendMessage(sessionId, {
            role: "assistant",
            text: "Please open the Media Library picker to choose a source, or @mention a file by name.",
            meta: { open_media_picker: true },
          });
          return;
        }
      }

      if (step === "identity") {
        if (mentions.identity_ids[0] || sess.identity_id) {
          if (mentions.identity_ids[0]) {
            XplainStore.updateSession(sessionId, {
              identity_id: mentions.identity_ids[0],
            });
          }
          XplainStore.updateSession(sessionId, { requirements: req });
          askDetails(sessionId);
          return;
        }
        XplainStore.appendMessage(sessionId, {
          role: "assistant",
          text: "Please pick an Identity set (or create one under Identities).",
        });
        askForIdentity(sessionId);
        return;
      }

      if (step === "details" || step === "confirm") {
        XplainStore.updateSession(sessionId, { requirements: req });
        if (/create (the )?plan|build (the )?plan|start/i.test(trimmed) && hasEnough(
          XplainStore.getSession(sessionId),
          req
        )) {
          offerConfirm(sessionId);
          return;
        }
        // continue collecting
        const s2 = XplainStore.getSession(sessionId);
        s2.requirements = req;
        if (hasEnough(s2, req)) {
          offerConfirm(sessionId);
        } else {
          askDetails(sessionId);
        }
        return;
      }

      // fallback
      XplainStore.updateSession(sessionId, { requirements: req });
      if (hasEnough(XplainStore.getSession(sessionId), req)) offerConfirm(sessionId);
      else askDetails(sessionId);
    },
  };

  window.XplainChat = Chat;
})();