(function () {
  function shouldFail(name) {
    const n = (name || "").toLowerCase();
    return n.includes("scan") || n.includes("fail") || n.includes("image-only");
  }

  function isImageName(name) {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || "");
  }

  function isImageFile(fileOrName, mime) {
    if (mime && mime.startsWith("image/")) return true;
    const name =
      typeof fileOrName === "string" ? fileOrName : fileOrName?.name || "";
    return isImageName(name);
  }

  function guessMime(fileOrName) {
    if (typeof fileOrName === "object" && fileOrName?.type) return fileOrName.type;
    const name =
      typeof fileOrName === "string" ? fileOrName : fileOrName?.name || "";
    if (/\.png$/i.test(name)) return "image/png";
    if (/\.gif$/i.test(name)) return "image/gif";
    if (/\.webp$/i.test(name)) return "image/webp";
    if (/\.svg$/i.test(name)) return "image/svg+xml";
    if (/\.jpe?g$/i.test(name)) return "image/jpeg";
    if (name.endsWith(".pptx"))
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (name.endsWith(".docx"))
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return "application/pdf";
  }

  function readDataUrl(file) {
    return new Promise((resolve) => {
      if (!file || typeof file === "string" || !file.type?.startsWith("image/")) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  const MediaSim = {
    isImageFile,
    isImageName,

    async simulateUpload(fileOrName, opts = {}) {
      const name =
        typeof fileOrName === "string"
          ? fileOrName
          : fileOrName?.name || "Untitled.pdf";
      const mime = guessMime(fileOrName);
      const asImage = isImageFile(fileOrName, mime);
      const folderId = opts.folder_id;

      if (!folderId) {
        XplainUI.toast("Pick a folder", "Upload files inside a folder.", {
          icon: "folder",
        });
        opts.onDone?.(null, "rejected");
        return null;
      }

      const size =
        typeof fileOrName === "object" && fileOrName?.size
          ? fileOrName.size
          : Math.floor(Math.random() * 5e6) + 5e5;

      const dataUrl = await readDataUrl(
        typeof fileOrName === "object" ? fileOrName : null
      );

      const item = XplainStore.addMedia({
        display_name: name,
        filename: name,
        mime_type: mime,
        size_bytes: size,
        status: "uploading",
        folder_id: folderId,
        data_url: dataUrl,
      });

      const onProgress = opts.onProgress || (() => {});
      let pct = 0;
      const tick = setInterval(() => {
        pct = Math.min(100, pct + 12 + Math.random() * 18);
        onProgress(Math.floor(pct), item.id, "Uploading…");
        if (pct >= 100) {
          clearInterval(tick);
          XplainStore.updateMedia(item.id, { status: "processing" });
          onProgress(100, item.id, asImage ? "Saving image…" : "Indexing concepts…");
          setTimeout(() => {
            if (!asImage && shouldFail(name)) {
              XplainStore.updateMedia(item.id, {
                status: "failed",
                error: "Scanned/image-only PDF — no text extracted (mock).",
              });
              onProgress(100, item.id, "Failed");
              opts.onDone?.(item.id, "failed");
            } else {
              XplainStore.updateMedia(item.id, { status: "indexed" });
              onProgress(100, item.id, asImage ? "Saved" : "Indexed");
              opts.onDone?.(item.id, "indexed");
            }
          }, asImage ? 600 : 1200);
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
