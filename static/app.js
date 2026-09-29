const keys=['1','2','3','4','q','w','e','r','a','s','d','f','z','x','c','v'];
const els={pads:document.querySelector('#pads'),url:document.querySelector('#youtubeUrl'),loadYoutube:document.querySelector('#loadYoutube'),file:document.querySelector('#audioFile'),message:document.querySelector('#message'),title:document.querySelector('#trackTitle'),duration:document.querySelector('#duration'),waveform:document.querySelector('#waveform'),selectedInfo:document.querySelector('#selectedInfo'),editPad:document.querySelector('#editPad'),editTime:document.querySelector('#editTime'),master:document.querySelector('#masterVolume'),modeBtn:document.querySelector('#modeBtn'),chokeBtn:document.querySelector('#chokeBtn'),stopAll:document.querySelector('#stopAll'),resetSlice:document.querySelector('#resetSlice'),audioState:document.querySelector('#audioState'),autoChop:document.querySelector('#autoChop'),equalChop:document.querySelector('#equalChop'),recordLayer:document.querySelector('#recordLayer'),stopRecord:document.querySelector('#stopRecord'),playLayers:document.querySelector('#playLayers'),stopLayers:document.querySelector('#stopLayers'),exportWav:document.querySelector('#exportWav'),layers:document.querySelector('#layers'),recordStatus:document.querySelector('#recordStatus'),recordClock:document.querySelector('#recordClock'),videoMode:document.querySelector('#videoMode'),videoPanel:document.querySelector('#videoPanel'),videoStatus:document.querySelector('#videoStatus'),youtubePlayer:document.querySelector('#youtubePlayer'),localVideo:document.querySelector('#localVideo'),videoPlaceholder:document.querySelector('#videoPlaceholder')};
let ctx,masterGain,buffer=null,pads=[],selectedPad=0,mode='oneshot',monoChoke=true;
let activeSources=new Map(),scheduledSources=[],dragMarker=-1;
let layers=[],recording=false,currentLayer=null,recordStart=0,recordTimer=null,mixStart=0,mixTimer=null;
let videoMode=false,videoKind=null,youtubeVideoId=null,youtubePlayer=null,youtubeReady=false,videoStopTimer=null,localVideoUrl=null;

function ensureAudio(){if(!ctx){ctx=new(window.AudioContext||window.webkitAudioContext)();masterGain=ctx.createGain();masterGain.gain.value=Number(els.master.value);masterGain.connect(ctx.destination)}if(ctx.state==='suspended')ctx.resume()}
function formatTime(s){if(!Number.isFinite(s))return'--:--';const m=Math.floor(s/60),sec=Math.floor(s%60).toString().padStart(2,'0');return m+':'+sec}
function formatClock(s){const m=Math.floor(s/60).toString().padStart(2,'0'),sec=Math.floor(s%60).toString().padStart(2,'0'),t=Math.floor((s%1)*10);return m+':'+sec+'.'+t}
function setMessage(t,e=false){els.message.textContent=t;els.message.style.color=e?'var(--red)':'var(--amber)'}


function youtubeIdFromUrl(value){
  try{
    const u=new URL(value);
    if(u.hostname==='youtu.be')return u.pathname.split('/').filter(Boolean)[0]||null;
    if(u.hostname.includes('youtube.com')){
      if(u.pathname==='/watch')return u.searchParams.get('v');
      const parts=u.pathname.split('/').filter(Boolean);
      if(['shorts','embed','live'].includes(parts[0]))return parts[1]||null;
    }
  }catch{}
  return null
}
function ensureYoutubeApi(){
  if(window.YT&&window.YT.Player)return Promise.resolve();
  return new Promise(resolve=>{
    const done=()=>resolve();
    if(window.YT&&window.YT.Player)return done();
    const existing=document.querySelector('script[data-youtube-api]');
    if(!existing){
      const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.dataset.youtubeApi='1';document.head.appendChild(s)
    }
    const prev=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{if(typeof prev==='function')prev();done()}
  })
}
async function prepareYoutubeVideo(url){
  const id=youtubeIdFromUrl(url);if(!id)return;
  videoKind='youtube';youtubeVideoId=id;els.videoStatus.textContent='YOUTUBE READY';els.videoPlaceholder.classList.add('hidden');els.localVideo.classList.remove('active');
  await ensureYoutubeApi();
  if(youtubePlayer&&typeof youtubePlayer.loadVideoById==='function'){youtubePlayer.cueVideoById(id);youtubePlayer.mute();youtubeReady=true;document.querySelector('#youtubePlayer iframe')?.classList.add('active');return}
  youtubePlayer=new YT.Player('youtubePlayer',{
    videoId:id,
    playerVars:{playsinline:1,controls:0,disablekb:1,rel:0,modestbranding:1},
    events:{onReady:e=>{youtubeReady=true;e.target.mute();const f=document.querySelector('#youtubePlayer iframe');if(f)f.classList.add('active')}}
  })
}
function prepareLocalVideo(file){
  if(localVideoUrl)URL.revokeObjectURL(localVideoUrl);
  localVideoUrl=URL.createObjectURL(file);videoKind='local';youtubeVideoId=null;els.localVideo.src=localVideoUrl;els.localVideo.muted=true;els.localVideo.classList.add('active');
  const f=document.querySelector('#youtubePlayer iframe');if(f)f.classList.remove('active');
  els.videoPlaceholder.classList.add('hidden');els.videoStatus.textContent='LOCAL VIDEO READY'
}
function stopVideo(){
  if(videoStopTimer){clearTimeout(videoStopTimer);videoStopTimer=null}
  if(videoKind==='youtube'&&youtubeReady&&youtubePlayer){try{youtubePlayer.pauseVideo()}catch{}}
  if(videoKind==='local'){try{els.localVideo.pause()}catch{}}
}
function triggerVideo(index,duration){
  if(!videoMode||!pads[index]||!videoKind)return;
  const start=pads[index].start;stopVideo();
  if(videoKind==='youtube'&&youtubeReady&&youtubePlayer){
    try{youtubePlayer.mute();youtubePlayer.seekTo(start,true);youtubePlayer.playVideo()}catch{}
  }else if(videoKind==='local'){
    try{els.localVideo.currentTime=start;els.localVideo.play().catch(()=>{})}catch{}
  }
  videoStopTimer=setTimeout(stopVideo,Math.max(.05,duration)*1000)
}
function setVideoMode(on){
  videoMode=on;els.videoMode.classList.toggle('active',on);els.videoMode.textContent='VIDEO MODE: '+(on?'ON':'OFF');els.videoPanel.classList.toggle('hidden',!on);els.videoPanel.setAttribute('aria-hidden',String(!on));if(!on)stopVideo()
}

function createPads(){els.pads.innerHTML='';keys.forEach((key,index)=>{const btn=document.createElement('button');btn.className='pad';btn.dataset.index=index;btn.innerHTML='<span class="num">PAD '+String(index+1).padStart(2,'0')+'</span><span class="key">'+key.toUpperCase()+'</span><span class="slice">EMPTY</span>';btn.addEventListener('pointerdown',e=>{e.preventDefault();selectPad(index);playPad(index,true)});btn.addEventListener('pointerup',()=>{if(mode==='gate')stopPad(index)});btn.addEventListener('pointerleave',()=>{if(mode==='gate')stopPad(index)});els.pads.appendChild(btn)});selectPad(0)}
async function decodeArrayBuffer(ab,title='Sample'){ensureAudio();setMessage('Decoding audio…');try{buffer=await ctx.decodeAudioData(ab.slice(0));buildSlices();layers=[];renderLayers();els.title.textContent=title.toUpperCase();els.duration.textContent=formatTime(buffer.duration);els.audioState.textContent='READY';drawWaveform();updatePads();selectPad(0);setMessage('Ready. Hit the pads, then record layers.')}catch(err){console.error(err);setMessage('This audio format could not be decoded by the browser.',true)}}
function buildSlices(){applyBoundaries(Array.from({length:17},(_,i)=>buffer.duration*i/16),true)}
function applyBoundaries(boundaries,setDefaults=false){pads=Array.from({length:16},(_,i)=>{const old=pads[i]||{};const start=boundaries[i],end=boundaries[i+1];return{defaultStart:setDefaults?start:(old.defaultStart??start),defaultEnd:setDefaults?end:(old.defaultEnd??end),start,end}});updatePads();updateEditInfo();drawWaveform()}
function transientChop(){
  if(!buffer)return;
  const data=buffer.getChannelData(0),sr=buffer.sampleRate,window=Math.max(64,Math.floor(sr*.01)),hop=Math.max(32,Math.floor(window/2)),env=[];
  for(let i=0;i+window<data.length;i+=hop){let sum=0;for(let j=0;j<window;j++){const v=data[i+j];sum+=v*v}env.push(Math.sqrt(sum/window))}
  const smooth=[];let ema=0;for(let i=0;i<env.length;i++){ema=ema*.88+env[i]*.12;smooth.push(ema)}
  const candidates=[];for(let i=2;i<smooth.length-2;i++){const prev=(smooth[i-1]+smooth[i-2])/2,delta=smooth[i]-prev;if(delta>0&&smooth[i]>=smooth[i-1]&&smooth[i]>=smooth[i+1])candidates.push({i,score:delta*(.35+smooth[i])})}
  candidates.sort((a,b)=>b.score-a.score);
  const minGap=.12,points=[0,buffer.duration];
  for(const c of candidates){const t=c.i*hop/sr;if(t<.03||t>buffer.duration-.03)continue;if(points.every(p=>Math.abs(p-t)>=minGap)){points.push(t);if(points.length===17)break}}
  if(points.length<17){for(let i=1;i<16&&points.length<17;i++){const t=buffer.duration*i/16;if(points.every(p=>Math.abs(p-t)>=minGap/2))points.push(t)}}
  points.sort((a,b)=>a-b);
  while(points.length>17){let best=1,bestGap=Infinity;for(let i=1;i<points.length-1;i++){const gap=points[i+1]-points[i-1];if(gap<bestGap){bestGap=gap;best=i}}points.splice(best,1)}
  while(points.length<17){let gapIndex=0,gapSize=0;for(let i=0;i<points.length-1;i++){const gap=points[i+1]-points[i];if(gap>gapSize){gapSize=gap;gapIndex=i}}points.splice(gapIndex+1,0,(points[gapIndex]+points[gapIndex+1])/2)}
  applyBoundaries(points,false);setMessage('Transient chop applied. Drag the vertical markers to fine-tune it.')
}

function makeSource(index,destination=masterGain,when=0,durationOverride=null){if(!buffer||!pads[index])return null;const slice=pads[index],duration=Math.max(.02,durationOverride??(slice.end-slice.start)),source=(destination.context||ctx).createBufferSource();source.buffer=buffer;source.connect(destination);source.start(when,slice.start,duration);return source}
function playPad(index,capture=false){if(!buffer||!pads[index])return;ensureAudio();if(monoChoke)stopAllLiveSources();const slice=pads[index],duration=Math.max(.02,slice.end-slice.start),source=makeSource(index,masterGain,0,duration);if(!source)return;source.onended=()=>{if(activeSources.get(index)===source)activeSources.delete(index);setHit(index,false)};activeSources.set(index,source);setHit(index,true);triggerVideo(index,duration);if(capture&&recording&&currentLayer)currentLayer.events.push({pad:index,time:Math.max(0,ctx.currentTime-recordStart),duration,start:slice.start})}
function stopPad(index){const source=activeSources.get(index);if(!source)return;try{source.stop()}catch{}activeSources.delete(index);setHit(index,false)}
function stopAllLiveSources(){for(const[index,source]of activeSources){try{source.stop()}catch{}setHit(index,false)}activeSources.clear()}
function stopScheduled(){for(const s of scheduledSources){try{s.stop()}catch{}}scheduledSources=[];if(mixTimer){clearInterval(mixTimer);mixTimer=null}}
function setHit(i,on){const p=els.pads.children[i];if(p)p.classList.toggle('hit',on)}
function selectPad(i){selectedPad=i;[...els.pads.children].forEach((p,n)=>p.classList.toggle('selected',n===i));const label='PAD '+String(i+1).padStart(2,'0');els.selectedInfo.textContent=label;els.editPad.textContent=label;updateEditInfo()}
function updateEditInfo(){const p=pads[selectedPad];els.editTime.textContent=p?p.start.toFixed(2)+'s — '+p.end.toFixed(2)+'s':'0.00s — 0.00s'}
function updatePads(){[...els.pads.children].forEach((pad,i)=>{const p=pads[i];pad.querySelector('.slice').textContent=p?p.start.toFixed(1)+'–'+p.end.toFixed(1)+'s':'EMPTY'})}

function drawWaveform(){const c=els.waveform,dpr=window.devicePixelRatio||1,r=c.getBoundingClientRect();c.width=Math.max(600,Math.floor(r.width*dpr));c.height=Math.max(180,Math.floor(r.height*dpr));const g=c.getContext('2d'),w=c.width,h=c.height;g.clearRect(0,0,w,h);g.fillStyle='#8cad74';g.fillRect(0,0,w,h);if(!buffer)return;const data=buffer.getChannelData(0),center=h/2,step=Math.max(1,Math.floor(data.length/w));g.strokeStyle='#203219';g.lineWidth=Math.max(1,dpr);g.beginPath();for(let x=0;x<w;x++){let min=1,max=-1,start=x*step,end=Math.min(data.length,start+step);for(let i=start;i<end;i++){const v=data[i];if(v<min)min=v;if(v>max)max=v}g.moveTo(x,center+min*center*.86);g.lineTo(x,center+max*center*.86)}g.stroke();g.strokeStyle='#405b32';for(let i=1;i<16;i++){const x=(pads[i]?.start??(buffer.duration*i/16))/buffer.duration*w;g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}}

function mixDuration(){let end=0;for(const l of layers.filter(x=>!x.muted))for(const e of l.events)end=Math.max(end,e.time+e.duration);return end}
function scheduleLayers(excludeCurrent=false){ensureAudio();stopScheduled();const start=ctx.currentTime+.03;for(const layer of layers){if(layer.muted||(excludeCurrent&&layer===currentLayer))continue;for(const e of layer.events){const p=pads[e.pad];if(!p)continue;const s=ctx.createBufferSource();s.buffer=buffer;s.connect(masterGain);s.start(start+e.time,e.start??p.start,e.duration);scheduledSources.push(s)}}return start}
function startRecording(){if(!buffer)return setMessage('Load a sample first.',true);if(recording)return;ensureAudio();stopScheduled();currentLayer={id:Date.now(),name:'Layer '+(layers.length+1),muted:false,events:[]};layers.push(currentLayer);recordStart=scheduleLayers(true);recording=true;els.recordLayer.classList.add('active');els.recordStatus.textContent='RECORDING '+currentLayer.name.toUpperCase();recordTimer=setInterval(()=>els.recordClock.textContent=formatClock(ctx.currentTime-recordStart),50);renderLayers();setMessage('Recording new layer. Existing layers are playing underneath it.')}
function stopRecording(){if(!recording)return;recording=false;els.recordLayer.classList.remove('active');if(recordTimer){clearInterval(recordTimer);recordTimer=null}stopScheduled();const empty=currentLayer&&currentLayer.events.length===0;if(empty)layers=layers.filter(l=>l!==currentLayer);currentLayer=null;els.recordStatus.textContent='READY TO OVERDUB';els.recordClock.textContent=formatClock(mixDuration());renderLayers();setMessage(empty?'Empty layer discarded.':'Layer saved. Record again to overdub another layer.')}
function playMix(){if(!layers.some(l=>!l.muted&&l.events.length))return setMessage('Record a layer first.',true);if(recording)stopRecording();mixStart=scheduleLayers(false);els.recordStatus.textContent='PLAYING MIX';mixTimer=setInterval(()=>{const t=ctx.currentTime-mixStart,d=mixDuration();els.recordClock.textContent=formatClock(Math.min(t,d));if(t>d+.1){stopScheduled();els.recordStatus.textContent='READY TO OVERDUB'}},50)}
function renderLayers(){els.layers.innerHTML='';if(!layers.length){els.layers.innerHTML='<div class="empty-layer">No recorded layers yet.</div>';return}layers.forEach(layer=>{const row=document.createElement('div');row.className='layer'+(layer.muted?' muted':'');row.innerHTML='<div class="layer-meta"><span class="layer-name">'+layer.name+'</span><span class="layer-events">'+layer.events.length+' hits</span></div><button data-action="mute">'+(layer.muted?'UNMUTE':'MUTE')+'</button><button data-action="solo">SOLO</button><button data-action="delete">DELETE</button>';row.querySelector('[data-action="mute"]').onclick=()=>{layer.muted=!layer.muted;renderLayers()};row.querySelector('[data-action="solo"]').onclick=()=>{layers.forEach(l=>l.muted=l!==layer);renderLayers()};row.querySelector('[data-action="delete"]').onclick=()=>{layers=layers.filter(l=>l!==layer);renderLayers();els.recordClock.textContent=formatClock(mixDuration())};els.layers.appendChild(row)})}

async function exportWav(){if(!buffer||!layers.some(l=>!l.muted&&l.events.length))return setMessage('Nothing recorded to export.',true);const duration=mixDuration()+.15,sr=buffer.sampleRate,offline=new OfflineAudioContext(2,Math.ceil(duration*sr),sr),gain=offline.createGain();gain.gain.value=Number(els.master.value);gain.connect(offline.destination);for(const layer of layers){if(layer.muted)continue;for(const e of layer.events)makeSourceOffline(offline,gain,e)}setMessage('Rendering WAV…');try{const rendered=await offline.startRendering(),wav=audioBufferToWav(rendered),blob=new Blob([wav],{type:'audio/wav'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sample-performance-'+new Date().toISOString().replace(/[:.]/g,'-')+'.wav';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);setMessage('WAV exported.')}catch(err){console.error(err);setMessage('Could not render WAV.',true)}}
function makeSourceOffline(offline,dest,e){const p=pads[e.pad];if(!p)return;const s=offline.createBufferSource();s.buffer=buffer;s.connect(dest);s.start(e.time,e.start??p.start,Math.max(.02,e.duration))}
function audioBufferToWav(b){const channels=b.numberOfChannels,samples=b.length,bytes=44+samples*channels*2,ab=new ArrayBuffer(bytes),v=new DataView(ab);let o=0;const str=s=>{for(let i=0;i<s.length;i++)v.setUint8(o++,s.charCodeAt(i))},u32=n=>{v.setUint32(o,n,true);o+=4},u16=n=>{v.setUint16(o,n,true);o+=2};str('RIFF');u32(bytes-8);str('WAVE');str('fmt ');u32(16);u16(1);u16(channels);u32(b.sampleRate);u32(b.sampleRate*channels*2);u16(channels*2);u16(16);str('data');u32(samples*channels*2);const data=Array.from({length:channels},(_,c)=>b.getChannelData(c));for(let i=0;i<samples;i++)for(let c=0;c<channels;c++){const x=Math.max(-1,Math.min(1,data[c][i]));v.setInt16(o,x<0?x*32768:x*32767,true);o+=2}return ab}

async function loadYouTube(){const url=els.url.value.trim();if(!url)return setMessage('Paste a YouTube URL first.',true);ensureAudio();stopAllLiveSources();stopScheduled();els.loadYoutube.disabled=true;els.audioState.textContent='LOADING';setMessage('Fetching the YouTube audio stream…');try{const res=await fetch('/api/youtube',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});if(!res.ok){const body=await res.json().catch(()=>({}));throw new Error(body.error||'YouTube import failed.')}const title=res.headers.get('X-Track-Title')||'YouTube sample',blob=await res.blob();await decodeArrayBuffer(await blob.arrayBuffer(),title);prepareYoutubeVideo(url).catch(err=>console.warn('Video preview unavailable',err))}catch(err){console.error(err);els.audioState.textContent=buffer?'READY':'NO SAMPLE';setMessage(err.message||'Could not load that YouTube video.',true)}finally{els.loadYoutube.disabled=false}}

els.loadYoutube.addEventListener('click',loadYouTube);els.url.addEventListener('keydown',e=>{if(e.key==='Enter')loadYouTube()});els.file.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;stopAllLiveSources();stopScheduled();if(f.type.startsWith('video/'))prepareLocalVideo(f);else{videoKind=null;els.videoStatus.textContent='NO VIDEO';els.videoPlaceholder.classList.remove('hidden');els.localVideo.classList.remove('active')}await decodeArrayBuffer(await f.arrayBuffer(),f.name.replace(/\.[^.]+$/,''))});els.master.addEventListener('input',()=>{if(masterGain)masterGain.gain.value=Number(els.master.value)});els.modeBtn.addEventListener('click',()=>{mode=mode==='oneshot'?'gate':'oneshot';els.modeBtn.textContent='MODE: '+(mode==='oneshot'?'ONE SHOT':'GATE')});els.chokeBtn.addEventListener('click',()=>{monoChoke=!monoChoke;els.chokeBtn.classList.toggle('active',monoChoke);els.chokeBtn.setAttribute('aria-pressed',String(monoChoke));els.chokeBtn.textContent='MONO CHOKE: '+(monoChoke?'ON':'OFF')});els.stopAll.addEventListener('click',()=>{stopAllLiveSources();stopScheduled()});els.resetSlice.addEventListener('click',()=>{const p=pads[selectedPad];if(!p)return;p.start=p.defaultStart;p.end=p.defaultEnd;updatePads();updateEditInfo()});document.querySelectorAll('[data-nudge]').forEach(btn=>btn.addEventListener('click',()=>{const p=pads[selectedPad];if(!p)return;const[edge,d]=btn.dataset.nudge.split(':'),delta=Number(d);if(edge==='start')p.start=Math.max(0,Math.min(p.end-.02,p.start+delta));else p.end=Math.min(buffer.duration,Math.max(p.start+.02,p.end+delta));updatePads();updateEditInfo()}));
els.videoMode.addEventListener('click',()=>setVideoMode(!videoMode));
els.autoChop.addEventListener('click',transientChop);
els.equalChop.addEventListener('click',()=>{if(!buffer)return;applyBoundaries(Array.from({length:17},(_,i)=>buffer.duration*i/16),false);setMessage('Reset to 16 equal chops.')});
els.recordLayer.addEventListener('click',startRecording);els.stopRecord.addEventListener('click',stopRecording);els.playLayers.addEventListener('click',playMix);els.stopLayers.addEventListener('click',()=>{stopScheduled();els.recordStatus.textContent=recording?'RECORDING':'READY TO OVERDUB'});els.exportWav.addEventListener('click',exportWav);

const down=new Set();window.addEventListener('keydown',e=>{const key=e.key.toLowerCase(),index=keys.indexOf(key);if(index<0||e.repeat||down.has(key))return;if(['input','textarea'].includes(document.activeElement?.tagName?.toLowerCase()))return;e.preventDefault();down.add(key);selectPad(index);playPad(index,true)});window.addEventListener('keyup',e=>{const key=e.key.toLowerCase(),index=keys.indexOf(key);down.delete(key);if(index>=0&&mode==='gate')stopPad(index)});window.addEventListener('blur',()=>{down.clear();if(mode==='gate')stopAllLiveSources()});els.waveform.addEventListener('pointerdown',e=>{if(!buffer)return;const r=els.waveform.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*buffer.duration;let nearest=-1,best=Infinity;for(let i=1;i<16;i++){const d=Math.abs(pads[i].start-x);if(d<best){best=d;nearest=i}}if(best<buffer.duration*.035){dragMarker=nearest;els.waveform.setPointerCapture?.(e.pointerId)}});
els.waveform.addEventListener('pointermove',e=>{if(dragMarker<1||!buffer)return;const r=els.waveform.getBoundingClientRect(),t=Math.max(pads[dragMarker-1].start+.02,Math.min(pads[dragMarker].end-.02,(e.clientX-r.left)/r.width*buffer.duration));pads[dragMarker-1].end=t;pads[dragMarker].start=t;updatePads();updateEditInfo();drawWaveform()});
const endDrag=()=>{dragMarker=-1};els.waveform.addEventListener('pointerup',endDrag);els.waveform.addEventListener('pointercancel',endDrag);
window.addEventListener('resize',drawWaveform);setVideoMode(false);createPads();