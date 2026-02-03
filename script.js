const baseInput = document.getElementById('baseImage'); // 你原来的底图 input 的 id（如果不是这个名字，改成你的）
const basePreview = document.getElementById('basePreview');
const canvas = document.getElementById('maskCanvas');
const ctx = canvas.getContext('2d');

let tool = 'brush';     // brush | eraser
let drawing = false;
let last = null;
let history = [];       // 用于撤销：存 ImageData

function setActive(id){
  document.querySelectorAll('.btn').forEach(b=>b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function snapshot(){
  try { history.push(ctx.getImageData(0,0,canvas.width,canvas.height)); } catch(e){}
  if(history.length>30) history.shift();
}

function undo(){
  const prev = history.pop();
  if(prev) ctx.putImageData(prev,0,0);
}

function clearMask(){
  snapshot();
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

function resizeCanvasToImage(){
  // 关键：canvas 像素尺寸跟图片原始像素一致，画出来才不糊
  canvas.width = basePreview.naturalWidth;
  canvas.height = basePreview.naturalHeight;

  // 再用 CSS 让 canvas 跟随 img 的显示尺寸（我们在 css 里用 width:100% height:100% 覆盖）
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function getPos(e){
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return {x,y};
}

function drawLine(a,b){
  ctx.save();
  if(tool==='eraser'){
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = 40;
  }else{
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,1)'; // 白色=可编辑区
    ctx.lineWidth = 40;
  }
  ctx.beginPath();
  ctx.moveTo(a.x,a.y);
  ctx.lineTo(b.x,b.y);
  ctx.stroke();
  ctx.restore();
}

canvas.addEventListener('pointerdown', (e)=>{
  drawing = true;
  snapshot();
  last = getPos(e);
});
canvas.addEventListener('pointermove', (e)=>{
  if(!drawing) return;
  const p = getPos(e);
  drawLine(last,p);
  last = p;
});
window.addEventListener('pointerup', ()=>{ drawing=false; last=null; });

// 工具按钮
document.getElementById('toolBrush').onclick = ()=>{ tool='brush'; setActive('toolBrush'); };
document.getElementById('toolEraser').onclick = ()=>{ tool='eraser'; setActive('toolEraser'); };
document.getElementById('undo').onclick = ()=>undo();
document.getElementById('clear').onclick = ()=>clearMask();

// 下载 mask（黑底白字），符合常见 inpaint mask 约定
document.getElementById('downloadMask').onclick = ()=>{
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const octx = out.getContext('2d');

  // 黑底
  octx.fillStyle = '#000';
  octx.fillRect(0,0,out.width,out.height);
  // 把当前 canvas 的白色笔迹贴过去
  octx.drawImage(canvas,0,0);

  out.toBlob((blob)=>{
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mask.png';
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
};

// 导出 JSON（先简单导出：文件名 + mask 的 dataURL）
document.getElementById('exportJson').onclick = ()=>{
  const payload = {
    base_image: baseInput?.files?.[0]?.name || "",
    mask_png_dataurl: canvas.toDataURL('image/png'),
    tool: "trench-inpaint-tool",
    notes: "white=editable, black=locked"
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'payload.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

// 底图上传后显示并同步 canvas 尺寸
baseInput?.addEventListener('change', ()=>{
  const f = baseInput.files?.[0];
  if(!f) return;
  basePreview.src = URL.createObjectURL(f);
  basePreview.onload = ()=> resizeCanvasToImage();
});
