(function () {
  function shouldFail(name) {
    const n = (name || "").toLowerCase();
    return n.includes("scan") || n.includes("fail") || n.includes("image-only");
  }

  const MediaSim = {
    simulateUpload(fileOrName, opts = {}) {
      const name =
        typeof fileOrName === "string"
          ? fileOrName
          : fileOrName?.name || "Untitled.pdf";
      const size =
        typeof fileOrName === "object" && fileOrName?.size
          ? fileOrName.size
          : Math.floor(Math.random() * 5e6) + 5e5;
      const mime =
        (typeof fileOrName === "object" && fileOrName?.type) ||
        (name.endsWith(".pptx")
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : name.endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf");

      const item = XplainStore.addMedia({
        display_name: name,
        filename: name,
        mime_type: mime,
        size_bytes: size,
        status: "uploading",
        folder_id: opts.folder_id || "f-general",
      });

      const onProgress = opts.onProgress || (() => {});
      let pct = 0;
      const tick = setInterval(() => {
        pct = Math.min(100, pct + 12 + Math.random() * 18);
        onProgress(Math.floor(pct), item.id, "Uploading…");
        if (pct >= 100) {
          clearInterval(tick);
          XplainStore.updateMedia(item.id, { status: "processing" });
          onProgress(100, item.id, "Indexing concepts…");
          setTimeout(() => {
            if (shouldFail(name)) {
              XplainStore.updateMedia(item.id, {
                status: "failed",
                error: "Scanned/image-only PDF — no text extracted (mock).",
              });
              onProgress(100, item.id, "Failed");
              opts.onDone?.(item.id, "failed");
            } else {
              XplainStore.updateMedia(item.id, { status: "indexed" });
              onProgress(100, item.id, "Indexed");
              opts.onDone?.(item.id, "indexed");
            }
          }, 1200);
        }
      }, 280);

      return item;
    },

    reindex(id) {
      XplainStore.updateMedia(id, { status: "processing", error: null });
      setTimeout(() => {
        const m = XplainStore.getMediaItem(id);
        if (!m) return;
        if (shouldFail(m.display_name)) {
          XplainStore.updateMedia(id, {
            status: "failed",
            error: "Re-index failed (mock).",
          });
        } else {
          XplainStore.updateMedia(id, { status: "indexed" });
        }
      }, 1500);
    },
  };

  window.XplainMedia = MediaSim;
})();