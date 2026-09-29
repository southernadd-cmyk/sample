const keys = ['1','2','3','4','q','w','e','r','a','s','d','f','z','x','c','v'];

const els = {
  pads: document.querySelector('#pads'),
  url: document.querySelector('#youtubeUrl'),
  loadYoutube: document.querySelector('#loadYoutube'),
  file: document.querySelector('#audioFile'),
  message: document.querySelector('#message'),
  title: document.querySelector('#trackTitle'),
  duration: document.querySelector('#duration'),
  waveform: document.querySelector('#waveform'),
  selectedInfo: document.querySelector('#selectedInfo'),
  editPad: document.querySelector('#editPad'),
  editTime: document.querySelector('#editTime'),
  master: document.querySelector('#masterVolume'),
  modeBtn: document.querySelector('#modeBtn'),
  chokeBtn: document.querySelector('#chokeBtn'),
  stopAll: document.querySelector('#stopAll'),
  resetSlice: document.querySelector('#resetSlice'),
  audioState: document.querySelector('#audioState')
};

let ctx;
let masterGain;
let buffer = null;
let pads = [];
let activeSources = new Map();
let selectedPad = 0;
let mode = 'oneshot';
let monoChoke = true;

function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = Number(els.master.value);
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2,'0');
  return m + ':' + s;
}

function createPads() {
  els.pads.innerHTML = '';
  keys.forEach((key, index) => {
    const btn = document.createElement('button');
    btn.className = 'pad';
    btn.dataset.index = index;
    btn.innerHTML = '<span class="num">PAD ' + String(index + 1).padStart(2,'0') + '</span><span class="key">' + key.toUpperCase() + '</span><span class="slice">EMPTY</span>';
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      selectPad(index);
      playPad(index);
    });
    btn.addEventListener('pointerup', () => {
      if (mode === 'gate') stopPad(index);
    });
    btn.addEventListener('pointerleave', () => {
      if (mode === 'gate') stopPad(index);
    });
    els.pads.appendChild(btn);
  });
  selectPad(0);
}

function setMessage(text, isError=false) {
  els.message.textContent = text;
  els.message.style.color = isError ? 'var(--red)' : 'var(--amber)';
}

async function decodeArrayBuffer(arrayBuffer, title='Sample') {
  ensureAudio();
  setMessage('Decoding audio…');
  try {
    buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    buildSlices();
    els.title.textContent = title.toUpperCase();
    els.duration.textContent = formatTime(buffer.duration);
    els.audioState.textContent = 'READY';
    drawWaveform();
    updatePads();
    selectPad(0);
    setMessage('Ready. Hit the pads or use the keyboard.');
  } catch (err) {
    console.error(err);
    setMessage('This audio format could not be decoded by the browser.', true);
  }
}

function buildSlices() {
  const size = buffer.duration / 16;
  pads = Array.from({length:16}, (_,i) => ({
    defaultStart: i * size,
    defaultEnd: (i + 1) * size,
    start: i * size,
    end: (i + 1) * size
  }));
}

function playPad(index) {
  if (!buffer || !pads[index]) return;
  ensureAudio();
  if (monoChoke) stopAllSources();

  const slice = pads[index];
  const duration = Math.max(0.02, slice.end - slice.start);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(masterGain);

  source.onended = () => {
    if (activeSources.get(index) === source) activeSources.delete(index);
    setHit(index, false);
  };

  source.start(0, slice.start, duration);
  activeSources.set(index, source);
  setHit(index, true);
}

function stopPad(index) {
  const source = activeSources.get(index);
  if (!source) return;
  try { source.stop(); } catch {}
  activeSources.delete(index);
  setHit(index, false);
}

function stopAllSources() {
  for (const [index, source] of activeSources) {
    try { source.stop(); } catch {}
    setHit(index, false);
  }
  activeSources.clear();
}

function setHit(index, on) {
  const pad = els.pads.children[index];
  if (pad) pad.classList.toggle('hit', on);
}

function selectPad(index) {
  selectedPad = index;
  [...els.pads.children].forEach((p,i) => p.classList.toggle('selected', i === index));
  const label = 'PAD ' + String(index + 1).padStart(2,'0');
  els.selectedInfo.textContent = label;
  els.editPad.textContent = label;
  updateEditInfo();
}

function updateEditInfo() {
  const p = pads[selectedPad];
  els.editTime.textContent = p ? p.start.toFixed(2) + 's — ' + p.end.toFixed(2) + 's' : '0.00s — 0.00s';
}

function updatePads() {
  [...els.pads.children].forEach((pad, i) => {
    const p = pads[i];
    pad.querySelector('.slice').textContent = p ? p.start.toFixed(1) + '–' + p.end.toFixed(1) + 's' : 'EMPTY';
  });
}

function drawWaveform() {
  const canvas = els.waveform;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(600, Math.floor(rect.width * dpr));
  canvas.height = Math.max(180, Math.floor(rect.height * dpr));
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.clearRect(0,0,w,h);
  g.fillStyle = '#8cad74';
  g.fillRect(0,0,w,h);
  if (!buffer) return;

  const data = buffer.getChannelData(0);
  const center = h / 2;
  const step = Math.max(1, Math.floor(data.length / w));
  g.strokeStyle = '#203219';
  g.lineWidth = Math.max(1,dpr);
  g.beginPath();
  for (let x=0; x<w; x++) {
    let min=1, max=-1;
    const start = x * step;
    const end = Math.min(data.length, start + step);
    for (let i=start; i<end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    g.moveTo(x, center + min * center * .86);
    g.lineTo(x, center + max * center * .86);
  }
  g.stroke();

  g.strokeStyle = '#405b32';
  g.lineWidth = Math.max(1,dpr);
  for (let i=1;i<16;i++) {
    const x = (i / 16) * w;
    g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke();
  }
}

async function loadYouTube() {
  const url = els.url.value.trim();
  if (!url) return setMessage('Paste a YouTube URL first.', true);
  ensureAudio();
  stopAllSources();
  els.loadYoutube.disabled = true;
  els.audioState.textContent = 'LOADING';
  setMessage('Fetching the YouTube audio stream…');
  try {
    const res = await fetch('/api/youtube', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({url})
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'YouTube import failed.');
    }
    const title = res.headers.get('X-Track-Title') || 'YouTube sample';
    const blob = await res.blob();
    await decodeArrayBuffer(await blob.arrayBuffer(), title);
  } catch (err) {
    console.error(err);
    els.audioState.textContent = buffer ? 'READY' : 'NO SAMPLE';
    setMessage(err.message || 'Could not load that YouTube video.', true);
  } finally {
    els.loadYoutube.disabled = false;
  }
}

els.loadYoutube.addEventListener('click', loadYouTube);
els.url.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadYouTube();
});
els.file.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  stopAllSources();
  await decodeArrayBuffer(await file.arrayBuffer(), file.name.replace(/\.[^.]+$/, ''));
});
els.master.addEventListener('input', () => {
  if (masterGain) masterGain.gain.value = Number(els.master.value);
});
els.modeBtn.addEventListener('click', () => {
  mode = mode === 'oneshot' ? 'gate' : 'oneshot';
  els.modeBtn.dataset.mode = mode;
  els.modeBtn.textContent = 'MODE: ' + (mode === 'oneshot' ? 'ONE SHOT' : 'GATE');
});
els.chokeBtn.addEventListener('click', () => {
  monoChoke = !monoChoke;
  els.chokeBtn.classList.toggle('active', monoChoke);
  els.chokeBtn.setAttribute('aria-pressed', String(monoChoke));
  els.chokeBtn.textContent = 'MONO CHOKE: ' + (monoChoke ? 'ON' : 'OFF');
});
els.stopAll.addEventListener('click', stopAllSources);
els.resetSlice.addEventListener('click', () => {
  const p = pads[selectedPad];
  if (!p) return;
  p.start = p.defaultStart;
  p.end = p.defaultEnd;
  updatePads(); updateEditInfo();
});
document.querySelectorAll('[data-nudge]').forEach(btn => btn.addEventListener('click', () => {
  const p = pads[selectedPad];
  if (!p) return;
  const [edge, deltaText] = btn.dataset.nudge.split(':');
  const delta = Number(deltaText);
  if (edge === 'start') p.start = Math.max(0, Math.min(p.end - .02, p.start + delta));
  else p.end = Math.min(buffer.duration, Math.max(p.start + .02, p.end + delta));
  updatePads(); updateEditInfo();
}));

const down = new Set();
window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  const index = keys.indexOf(key);
  if (index < 0 || e.repeat || down.has(key)) return;
  if (['input','textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
  e.preventDefault();
  down.add(key);
  selectPad(index);
  playPad(index);
});
window.addEventListener('keyup', e => {
  const key = e.key.toLowerCase();
  const index = keys.indexOf(key);
  down.delete(key);
  if (index >= 0 && mode === 'gate') stopPad(index);
});
window.addEventListener('blur', () => { down.clear(); if (mode === 'gate') stopAllSources(); });
window.addEventListener('resize', () => drawWaveform());

createPads();
