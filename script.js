(() => {
  const $ = (id) => document.getElementById(id);

  const baseFile = $("baseFile");
  const refFile = $("refFile");

  const basePreview = $("basePreview");
  const refPreview = $("refPreview");

  const emptyTip = $("emptyTip");
  const refEmptyTip = $("refEmptyTip");

  const maskCanvas = $("maskCanvas");
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });

  const toolBrush = $("toolBrush");
  const toolEraser = $("toolEraser");
  const undoBtn = $("undo");
  const clearBtn = $("clear");
  const downloadMaskBtn = $("downloadMask");
  const exportJsonBtn = $("exportJson");

  const brushSize = $("brushSize");
  const brushSizeVal = $("brushSizeVal");

  const promptPreset = $("promptPreset");
  const applyPreset = $("applyPreset");
  const promptText = $("promptText");
  const copyPrompt = $("copyPrompt");

  let drawing = false;
  let last = null;
  let activeTool = "brush"; // brush | eraser
  const undoStack = [];
  const UNDO_LIMIT = 20;

  function setTool(name) {
    activeTool = name;
    toolBrush.classList.toggle("active", name === "brush");
    toolEraser.classList.toggle("active", name === "eraser");
  }

  function pushUndo() {
    if (!maskCanvas.width || !maskCanvas.height) return;
    try {
      const img = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      undoStack.push(img);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    } catch {
      // ignore (cross-origin won't happen here because local files)
    }
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return;
    ctx.putImageData(prev, 0, 0);
  }

  function clearMask() {
    if (!maskCanvas.width || !maskCanvas.height) return;
    pushUndo();
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }

  function resizeCanvasToImage(imgEl) {
    if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;

    maskCanvas.width = imgEl.naturalWidth;
    maskCanvas.height = imgEl.naturalHeight;

    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function getPointFromEvent(e) {
    const rect = maskCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * (maskCanvas.width / rect.width);
    const y = (clientY - rect.top) * (maskCanvas.height / rect.height);
    return { x, y };
  }

  function strokeLine(a, b) {
    ctx.save();

    const size = Number(brushSize.value || 24);
    ctx.lineWidth = size;

    if (activeTool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(255,255,255,1)";
    }

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.restore();
  }

  function onDown(e) {
    if (!maskCanvas.width) return;
    drawing = true;
    pushUndo();
    last = getPointFromEvent(e);
    e.preventDefault();
  }

  function onMove(e) {
    if (!drawing || !last) return;
    const p = getPointFromEvent(e);
    strokeLine(last, p);
    last = p;
    e.preventDefault();
  }

  function onUp(e) {
    drawing = false;
    last = null;
    e.preventDefault();
  }

  function downloadMaskPNG() {
    if (!maskCanvas.width) return;

    const out = document.createElement("canvas");
    out.width = maskCanvas.width;
    out.height = maskCanvas.height;
    const octx = out.getContext("2d");

    // black background (locked)
    octx.fillStyle = "#000";
    octx.fillRect(0, 0, out.width, out.height);

    // white strokes (editable)
    octx.drawImage(maskCanvas, 0, 0);

    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mask.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  }

  function exportJSON() {
    const base = baseFile.files && baseFile.files[0] ? baseFile.files[0].name : "";
    const ref = refFile.files && refFile.files[0] ? refFile.files[0].name : "";

    const payload = {
      tool: "trench-inpaint-tool",
      version: "1.0.0",
      created_at: new Date().toISOString(),
      inputs: {
        base_image_filename: base,
        reference_image_filename: ref
      },
      execution_prompt: (promptText.value || "").trim(),
      mask: {
        convention: "white_editable_black_locked",
        note: "Use the downloaded mask.png; mask pixels are not embedded by default."
      }
    };

    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "payload.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function copyPromptToClipboard() {
    const text = (promptText.value || "").trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      copyPrompt.textContent = "已复制";
      setTimeout(() => (copyPrompt.textContent = "复制PROMPT"), 900);
    } catch {
      // fallback
      promptText.focus();
      promptText.select();
      document.execCommand("copy");
      copyPrompt.textContent = "已复制";
      setTimeout(() => (copyPrompt.textContent = "复制PROMPT"), 900);
    }
  }

  function applyPresetText() {
    const k = promptPreset.value;
    if (!k) return;

    if (k === "strict_civil") {
      promptText.value =
`TASK
STRICT civil-engineering-grade IMAGE-TO-IMAGE INPAINT. NOT text-to-image.

INPUT
- Image 1 = BASE IMAGE (尺寸/画幅/分辨率完全一致)
- Image 2 = ENGINEERING REFERENCE (仅作结构逻辑参考，禁止像素复制)

P0 ABSOLUTE
- ONLY edit inside the MASK (white editable)
- Outside MASK must remain pixel-perfect identical to Image 1
- Do NOT touch: people, signs/text, watermark, road texture outside mask

GOAL (inside mask only)
- Generate trench / shoring system as required
- Match original lighting, perspective, noise/grain, sharpness
- No white-line residue; mask boundary is a hard cut`;
    }

    if (k === "simple_goal") {
      promptText.value =
`只在白色Mask内修改，Mask外像素级不变。
目标：在Mask内生成指定沟槽/支护结构；透视正确、光照一致；不改人物/文字/水印。`;
    }
  }

  // ---- events ----
  toolBrush.addEventListener("click", () => setTool("brush"));
  toolEraser.addEventListener("click", () => setTool("eraser"));

  undoBtn.addEventListener("click", undo);
  clearBtn.addEventListener("click", clearMask);
  downloadMaskBtn.addEventListener("click", downloadMaskPNG);
  exportJsonBtn.addEventListener("click", exportJSON);

  brushSize.addEventListener("input", () => {
    brushSizeVal.textContent = String(brushSize.value);
  });

  applyPreset.addEventListener("click", applyPresetText);
  copyPrompt.addEventListener("click", copyPromptToClipboard);

  // pointer events for drawing
  maskCanvas.addEventListener("pointerdown", onDown);
  maskCanvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  // upload preview
  baseFile.addEventListener("change", () => {
    const f = baseFile.files && baseFile.files[0];
    if (!f) return;

    emptyTip.style.display = "none";
    const url = URL.createObjectURL(f);

    basePreview.onload = () => {
      resizeCanvasToImage(basePreview);
      // show canvas overlay
      maskCanvas.style.display = "block";
      URL.revokeObjectURL(url);
    };

    basePreview.src = url;
  });

  refFile.addEventListener("change", () => {
    const f = refFile.files && refFile.files[0];
    if (!f) return;

    refEmptyTip.style.display = "none";
    const url = URL.createObjectURL(f);
    refPreview.onload = () => URL.revokeObjectURL(url);
    refPreview.src = url;
  });

  // init
  brushSizeVal.textContent = String(brushSize.value);
  setTool("brush");
  maskCanvas.style.display = "block";
})();
