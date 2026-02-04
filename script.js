// script.js
const baseFile = document.getElementById("baseFile");
const refFile = document.getElementById("refFile");
const baseImg = document.getElementById("basePreview");
const refImg = document.getElementById("refPreview");

const canvas = document.getElementById("maskCanvas");
const ctx = canvas.getContext("2d");

const toolBrush = document.getElementById("toolBrush");
const toolEraser = document.getElementById("toolEraser");
const undoBtn = document.getElementById("undo");
const clearBtn = document.getElementById("clear");
const downloadMaskBtn = document.getElementById("downloadMask");
const exportJsonBtn = document.getElementById("exportJson");
const runBtn = document.getElementById("runBtn");

const brushSize = document.getElementById("brushSize");
const brushSizeVal = document.getElementById("brushSizeVal");

const executionPrompt = document.getElementById("executionPrompt");
const jsonOut = document.getElementById("jsonOut");

let mode = "brush"; // brush=画白色(可编辑) eraser=画黑色(锁定)
let drawing = false;
let history = []; // 简单撤销栈
let baseMeta = null;
let refMeta = null;

function setActiveTool(next) {
  mode = next;
  toolBrush.classList.toggle("active", mode === "brush");
  toolEraser.classList.toggle("active", mode === "eraser");
}

toolBrush?.addEventListener("click", () => setActiveTool("brush"));
toolEraser?.addEventListener("click", () => setActiveTool("eraser"));

brushSize?.addEventListener("input", () => {
  brushSizeVal.textContent = String(brushSize.value);
});

function loadToImg(file, imgEl, cb) {
  const url = URL.createObjectURL(file);
  imgEl.onload = () => {
    URL.revokeObjectURL(url);
    cb?.();
  };
  imgEl.src = url;
}

function initMaskCanvasToBaseImage() {
  // 让 canvas 的“像素尺寸”= 底图原始尺寸；显示尺寸用 CSS 缩放
  canvas.width = baseImg.naturalWidth;
  canvas.height = baseImg.naturalHeight;

  // 画布显示大小 = 图片显示大小（保证覆盖一致）
  const rect = baseImg.getBoundingClientRect();
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  // 默认全黑（全部锁定）
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function getPosInImageSpace(e) {
  const rect = canvas.getBoundingClientRect();
  const xCss = e.clientX - rect.left;
  const yCss = e.clientY - rect.top;

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: xCss * scaleX,
    y: yCss * scaleY,
    scale: (scaleX + scaleY) / 2,
  };
}

function pushHistory() {
  // 轻量：存 dataURL（够用；你后面想更专业再换 ImageData）
  history.push(canvas.toDataURL("image/png"));
  if (history.length > 30) history.shift();
}

function undo() {
  if (history.length === 0) return;
  const last = history.pop();
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = last;
}

function clearMask() {
  pushHistory();
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

canvas.addEventListener("pointerdown", (e) => {
  if (!baseMeta) return;
  drawing = true;
  pushHistory();
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointerup", () => (drawing = false));
canvas.addEventListener("pointerleave", () => (drawing = false));

canvas.addEventListener("pointermove", (e) => {
  if (!drawing || !baseMeta) return;

  const { x, y, scale } = getPosInImageSpace(e);
  const size = Number(brushSize.value) * scale;

  ctx.strokeStyle = mode === "brush" ? "white" : "black";
  ctx.lineWidth = size;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 0.01, y + 0.01); // 防止点一下不出线
  ctx.stroke();
});

baseFile.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  baseMeta = { name: f.name, type: f.type, size: f.size };

  loadToImg(f, baseImg, () => {
    // 图片加载后再初始化 canvas 覆盖尺寸
    initMaskCanvasToBaseImage();
    // 窗口变化时也要同步显示尺寸
    window.addEventListener("resize", () => {
      if (!baseMeta) return;
      const rect = baseImg.getBoundingClientRect();
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    });
  });
});

refFile.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  refMeta = { name: f.name, type: f.type, size: f.size };
  loadToImg(f, refImg);
});

undoBtn?.addEventListener("click", undo);
clearBtn?.addEventListener("click", clearMask);

function buildExportObject() {
  return {
    tool: "trench-inpaint-tool",
    version: "0.1",
    created_at: new Date().toISOString(),
    base_image: baseMeta
      ? { ...baseMeta, width: baseImg.naturalWidth, height: baseImg.naturalHeight }
      : null,
    reference_image: refMeta
      ? { ...refMeta, width: refImg.naturalWidth, height: refImg.naturalHeight }
      : null,
    // white=editable, black=locked
    mask_png_data_url: baseMeta ? canvas.toDataURL("image/png") : null,
    execution_prompt: executionPrompt.value || "",
  };
}

function downloadBlob(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

downloadMaskBtn?.addEventListener("click", () => {
  if (!baseMeta) return alert("请先上传底图");
  // 直接下载 canvas 的 PNG
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "mask.png";
  a.click();
});

exportJsonBtn?.addEventListener("click", () => {
  const obj = buildExportObject();
  const text = JSON.stringify(obj, null, 2);
  jsonOut.textContent = text;
  downloadBlob("export.json", text, "application/json");
});

runBtn?.addEventListener("click", async () => {
  const obj = buildExportObject();
  const text = JSON.stringify(obj, null, 2);
  jsonOut.textContent = text;

  try {
    await navigator.clipboard.writeText(text);
    alert("已生成JSON并复制到剪贴板");
  } catch {
    // 剪贴板失败就退化为下载
    downloadBlob("export.json", text, "application/json");
    alert("复制失败，已改为下载 export.json");
  }
});
