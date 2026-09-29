const API_BASE=(window.SAMPLER_API_BASE || 'https://sample-production-df5c.up.railway.app').replace(/\/$/, '');
const keys=['1','2','3','4','q','w','e','r','a','s','d','f','z','x','c','v'];
const els={pads:document.querySelector('#pads'),url:document.querySelector('#youtubeUrl'),loadYoutube:document.querySelector('#loadYoutube'),file:document.querySelector('#audioFile'),message:document.querySelector('#message'),title:document.querySelector('#trackTitle'),duration:document.querySelector('#duration'),waveform:document.querySelector('#waveform'),selectedInfo:document.querySelector('#selectedInfo'),editPad:document.querySelector('#editPad'),editTime:document.querySelector('#editTime'),master:document.querySelector('#masterVolume'),modeBtn:document.querySelector('#modeBtn'),chokeBtn:document.querySelector('#chokeBtn'),stopAll:document.querySelector('#stopAll'),resetSlice:document.querySelector('#resetSlice'),audioState:document.querySelector('#audioState'),autoChop:document.querySelector('#autoChop'),equalChop:document.querySelector('#equalChop'),recordLayer:document.querySelector('#recordLayer'),stopRecord:document.querySelector('#stopRecord'),playLayers:document.querySelector('#playLayers'),stopLayers:document.querySelector('#stopLayers'),exportWav:document.querySelector('#exportWav'),layers:document.querySelector('#layers'),recordStatus:document.querySelector('#recordStatus'),recordClock:document.querySelector('#recordClock'),videoMode:document.querySelector('#videoMode'),videoPanel:document.querySelector('#videoPanel'),videoStatus:document.querySelector('#videoStatus'),youtubePlayer:document.querySelector('#youtubePlayer'),localVideo:document.querySelector('#localVideo'),videoPlaceholder:document.querySelector('#videoPlaceholder'),captureYoutube:document.querySelector('#captureYoutube'),stopCapture:document.querySelector('#stopCapture'),sourceBpm:document.querySelector('#sourceBpm'),targetBpm:document.querySelector('#targetBpm'),pitch:document.querySelector('#pitch'),pitchValue:document.querySelector('#pitchValue'),sourceInfo:document.querySelector('#sourceInfo'),sourcesList:document.querySelector('#sourcesList'),sourcesSummary:document.querySelector('#sourcesSummary'),loopBars:document.querySelector('#loopBars'),quantise:document.querySelector('#quantise'),metronome:document.querySelector('#metronome'),countIn:document.querySelector('#countIn'),midiConnect:document.querySelector('#midiConnect'),midiLearn:document.querySelector('#midiLearn'),midiReset:document.querySelector('#midiReset'),midiDevice:document.querySelector('#midiDevice'),midiStatus:document.querySelector('#midiStatus'),midiMapStatus:document.querySelector('#midiMapStatus')};
let ctx,masterGain,buffer=null,pads=[],selectedPad=0,mode='oneshot',monoChoke=false;
let detectedSourceBpm=120;
let sampleSources=new Map(),activeSourceId=null,sourceSequence=0;
let activeSources=new Map(),scheduledSources=[],dragMarker=-1;
let layers=[],recording=false,currentLayer=null,recordStart=0,recordTimer=null,mixStart=0,mixTimer=null;
let metronomeOn=false,countInOn=true,loopScheduler=null,nextLoopAt=0,transportStart=0,transportExcludeCurrent=false,transportMode=null,metroNodes=[],countInTimer=null;
let videoMode=false,videoKind=null,youtubeVideoId=null,youtubePlayer=null,youtubeReady=false,videoStopTimer=null,localVideoUrl=null;
let captureRecorder=null,captureStream=null,captureChunks=[],captureTimer=null,captureStopping=false;
let midiAccess=null,midiInput=null,midiLearning=false,midiLearnPad=0,midiHeld=new Map();
let midiMap=new Map(Array.from({length:16},(_,i)=>[36+i,i]));

function ensureAudio(){if(!ctx){ctx=new(window.AudioContext||window.webkitAudioContext)();masterGain=ctx.createGain();masterGain.gain.value=Number(els.master.value);masterGain.connect(ctx.destination)}if(ctx.state==='suspended')ctx.resume()}
function formatTime(s){if(!Number.isFinite(s))return'--:--';const m=Math.floor(s/60),sec=Math.floor(s%60).toString().padStart(2,'0');return m+':'+sec}
function formatClock(s){const m=Math.floor(s/60).toString().padStart(2,'0'),sec=Math.floor(s%60).toString().padStart(2,'0'),t=Math.floor((s%1)*10);return m+':'+sec+'.'+t}
function setMessage(t,e=false){els.message.textContent=t;els.message.style.color=e?'var(--red)':'var(--amber)'}
function clampBpm(v){return Math.max(40,Math.min(240,Number(v)||120))}
function getPlaybackRate(){
  const source=clampBpm(els.sourceBpm?.value||detectedSourceBpm);
  const target=clampBpm(els.targetBpm?.value||source);
  const semitones=Number(els.pitch?.value)||0;
  return Math.max(.25,Math.min(4,(target/source)*Math.pow(2,semitones/12)))
}
function updateTempoUi(){
  if(!els.pitchValue)return;
  const st=Number(els.pitch.value)||0;
  els.pitchValue.textContent=(st>0?'+':'')+st+' st';
}
function clonePads(sourcePads=pads){
  return sourcePads.map(p=>({...p}))
}
function activeSource(){return activeSourceId?sampleSources.get(activeSourceId):null}
function sourceForEvent(e){return (e?.sourceId&&sampleSources.get(e.sourceId))||activeSource()||null}
function saveActiveSourceState(){
  const src=activeSource();
  if(!src)return;
  src.pads=clonePads();
  src.bpm=clampBpm(els.sourceBpm?.value||src.bpm||120);
  src.pitch=Number(els.pitch?.value)||0;
}
function updateSourceInfo(){
  const count=sampleSources.size;
  if(els.sourceInfo)els.sourceInfo.textContent=count+' SOURCE'+(count===1?'':'S')+' LOADED';
  if(els.sourcesSummary)els.sourcesSummary.textContent=count?count+' LOADED':'NO SOURCES YET'
}
function renderSources(){
  updateSourceInfo();
  if(!els.sourcesList)return;
  els.sourcesList.innerHTML='';
  if(!sampleSources.size){
    els.sourcesList.innerHTML='<div class="sources-empty">Captured YouTube sources will appear here.</div>';
    return
  }
  [...sampleSources.values()].forEach((src,index)=>{
    const btn=document.createElement('button');
    btn.className='source-card'+(src.id===activeSourceId?' active':'');
    btn.type='button';
    btn.dataset.sourceId=src.id;
    btn.innerHTML=
      '<span class="source-index">'+String(index+1).padStart(2,'0')+'</span>'+
      '<span class="source-copy"><strong>'+escapeHtml(src.title||('Source '+(index+1)))+'</strong>'+
      '<small>'+Math.round(src.bpm||120)+' BPM • '+formatTime(src.buffer?.duration||0)+'</small></span>'+
      '<span class="source-use">'+(src.id===activeSourceId?'ACTIVE':'USE')+'</span>';
    btn.addEventListener('click',()=>switchSource(src.id));
    els.sourcesList.appendChild(btn)
  })
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}
async function switchSource(sourceId){
  if(sourceId===activeSourceId)return;
  const src=sampleSources.get(sourceId);
  if(!src?.buffer)return;
  if(recording)stopRecording(); else stopScheduled();
  stopAllLiveSources();
  saveActiveSourceState();

  activeSourceId=sourceId;
  buffer=src.buffer;
  pads=clonePads(src.pads||[]);
  if(!pads.length){
    applyBoundaries(Array.from({length:17},(_,i)=>buffer.duration*i/16),true);
    src.pads=clonePads()
  }
  detectedSourceBpm=src.bpm||detectBpm(buffer);
  els.sourceBpm.value=Math.round(detectedSourceBpm);
  els.pitch.value=Number.isFinite(src.pitch)?src.pitch:0;
  updateTempoUi();
  els.title.textContent=(src.title||'Sample').toUpperCase();
  els.duration.textContent=formatTime(buffer.duration);
  els.audioState.textContent='READY';
  if(src.url){
    els.url.value=src.url;
    prepareYoutubeVideo(src.url).catch(()=>{})
  }
  drawWaveform();updatePads();selectPad(0);renderSources();
  setMessage('Switched to '+(src.title||'source')+'. Existing layers remain in the mix.')
}
function beatDuration(){return 60/clampBpm(els.targetBpm?.value||120)}
function loopBars(){return Math.max(1,Number(els.loopBars?.value)||4)}
function loopBeats(){return loopBars()*4}
function loopDuration(){return loopBeats()*beatDuration()}
function quantiseBeat(rawBeat){
  const q=els.quantise?.value||'off';
  if(q==='off')return ((rawBeat%loopBeats())+loopBeats())%loopBeats();
  const step=4/Number(q);
  const snapped=Math.round(rawBeat/step)*step;
  return ((snapped%loopBeats())+loopBeats())%loopBeats()
}
function eventBeat(e){return e.beat!=null?e.beat:(e.time||0)/beatDuration()}
function eventTime(e){return eventBeat(e)*beatDuration()}
function updateGrooveUi(){
  els.metronome?.classList.toggle('active',metronomeOn);
  if(els.metronome)els.metronome.textContent='METRONOME: '+(metronomeOn?'ON':'OFF');
  els.countIn?.classList.toggle('active',countInOn);
  if(els.countIn)els.countIn.textContent=countInOn?'COUNT-IN: 1 BAR':'COUNT-IN: OFF'
}
function detectBpm(audioBuffer){
  try{
    const data=audioBuffer.getChannelData(0),sr=audioBuffer.sampleRate;
    const hop=Math.max(256,Math.floor(sr*.012));
    const env=[];
    for(let i=0;i<data.length;i+=hop){
      const end=Math.min(data.length,i+hop);let sum=0;
      for(let j=i;j<end;j++){const v=data[j];sum+=v*v}
      env.push(Math.sqrt(sum/Math.max(1,end-i)))
    }
    if(env.length<20)return 120;
    const mean=env.reduce((a,b)=>a+b,0)/env.length;
    const variance=env.reduce((a,b)=>a+(b-mean)*(b-mean),0)/env.length;
    const threshold=mean+Math.sqrt(variance)*.8;
    const peaks=[];let last=-Infinity;
    const minGap=Math.max(1,Math.floor(.18*sr/hop));
    for(let i=2;i<env.length-2;i++){
      if(env[i]>threshold&&env[i]>=env[i-1]&&env[i]>=env[i+1]&&i-last>=minGap){peaks.push(i);last=i}
    }
    if(peaks.length<4)return 120;
    const hist=new Map();
    for(let i=1;i<peaks.length;i++){
      const seconds=(peaks[i]-peaks[i-1])*hop/sr;
      if(seconds<=0)continue;
      let bpm=60/seconds;
      while(bpm<70)bpm*=2;
      while(bpm>180)bpm/=2;
      if(bpm>=70&&bpm<=180){
        const bin=Math.round(bpm);
        hist.set(bin,(hist.get(bin)||0)+1)
      }
    }
    if(!hist.size)return 120;
    return [...hist.entries()].sort((a,b)=>b[1]-a[1])[0][0]
  }catch{return 120}
}


function saveMidiMap(){
  try{localStorage.setItem('mpctube-midi-map-v1',JSON.stringify([...midiMap.entries()]))}catch{}
}
function loadMidiMap(){
  try{
    const saved=JSON.parse(localStorage.getItem('mpctube-midi-map-v1')||'null');
    if(Array.isArray(saved)&&saved.length){
      midiMap=new Map(saved.map(([note,pad])=>[Number(note),Number(pad)]).filter(([note,pad])=>Number.isFinite(note)&&pad>=0&&pad<16))
    }
  }catch{}
}
function resetMidiMap(){
  midiMap=new Map(Array.from({length:16},(_,i)=>[36+i,i]));
  saveMidiMap();
  midiLearning=false;midiLearnPad=0;
  updateMidiUi();
  setMessage('MIDI map reset: notes 36–51 trigger Pads 01–16.')
}
function midiNoteName(note){
  const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const n=Number(note)||0;
  return names[((n%12)+12)%12]+(Math.floor(n/12)-1)
}
function updateMidiUi(){
  const connected=!!midiInput;
  if(els.midiStatus)els.midiStatus.textContent=connected?('CONNECTED: '+(midiInput.name||'MIDI INPUT')):(midiAccess?'NO INPUT SELECTED':'NOT CONNECTED');
  if(els.midiConnect){
    els.midiConnect.classList.toggle('active',!!midiAccess);
    els.midiConnect.textContent=midiAccess?'MIDI ENABLED':'ENABLE MIDI'
  }
  if(els.midiLearn){
    els.midiLearn.disabled=!midiAccess;
    els.midiLearn.classList.toggle('active',midiLearning);
    els.midiLearn.textContent=midiLearning?'LEARNING PAD '+String(midiLearnPad+1).padStart(2,'0'):'MIDI LEARN'
  }
  if(els.midiReset)els.midiReset.disabled=!midiAccess;
  if(els.midiMapStatus){
    if(midiLearning)els.midiMapStatus.textContent='Press a MIDI pad/key for PAD '+String(midiLearnPad+1).padStart(2,'0')+'.';
    else{
      const entries=[...midiMap.entries()].sort((a,b)=>a[1]-b[1]);
      const complete=entries.length===16;
      els.midiMapStatus.textContent=complete
        ? 'Mapped 16 pads • '+midiNoteName(entries[0]?.[0]??36)+'–'+midiNoteName(entries.at(-1)?.[0]??51)
        : 'Custom map: '+entries.length+' of 16 pads mapped.'
    }
  }
}
function refreshMidiInputs(){
  if(!midiAccess||!els.midiDevice)return;
  const inputs=[...midiAccess.inputs.values()];
  const current=midiInput?.id||els.midiDevice.value;
  els.midiDevice.innerHTML='';
  if(!inputs.length){
    const opt=document.createElement('option');opt.value='';opt.textContent='No MIDI input detected';els.midiDevice.appendChild(opt);
    els.midiDevice.disabled=true;
    setMidiInput(null);
    return
  }
  els.midiDevice.disabled=false;
  inputs.forEach(input=>{
    const opt=document.createElement('option');
    opt.value=input.id;opt.textContent=input.name||input.manufacturer||('MIDI '+input.id);
    els.midiDevice.appendChild(opt)
  });
  const chosen=inputs.find(x=>x.id===current)||inputs[0];
  els.midiDevice.value=chosen.id;
  setMidiInput(chosen)
}
function setMidiInput(input){
  if(midiInput)midiInput.onmidimessage=null;
  midiInput=input||null;
  midiHeld.clear();
  if(midiInput)midiInput.onmidimessage=handleMidiMessage;
  updateMidiUi()
}
function handleMidiMessage(event){
  const [status,noteRaw,velocityRaw]=event.data||[];
  const command=(status||0)&0xf0,note=Number(noteRaw),velocity=Number(velocityRaw)||0;
  const noteOn=command===0x90&&velocity>0;
  const noteOff=command===0x80||(command===0x90&&velocity===0);
  if(!noteOn&&!noteOff)return;

  if(noteOn&&midiLearning){
    for(const [mappedNote,pad] of [...midiMap.entries()])if(pad===midiLearnPad||mappedNote===note)midiMap.delete(mappedNote);
    midiMap.set(note,midiLearnPad);
    saveMidiMap();
    midiLearnPad++;
    if(midiLearnPad>=16){midiLearning=false;midiLearnPad=0;setMessage('MIDI Learn complete — all 16 pads mapped.')}
    updateMidiUi();
    return
  }

  const pad=midiMap.get(note);
  if(pad==null)return;
  if(noteOn){
    const amount=Math.max(.05,Math.min(1,velocity/127));
    midiHeld.set(note,pad);
    selectPad(pad);playPad(pad,true,amount)
  }else if(noteOff){
    const heldPad=midiHeld.get(note);
    midiHeld.delete(note);
    if(mode==='gate'&&heldPad!=null)stopPad(heldPad)
  }
}
async function enableMidi(){
  if(!navigator.requestMIDIAccess){
    setMessage('Web MIDI is not supported by this browser.',true);
    if(els.midiStatus)els.midiStatus.textContent='UNSUPPORTED';
    return
  }
  try{
    midiAccess=await navigator.requestMIDIAccess({sysex:false});
    midiAccess.onstatechange=refreshMidiInputs;
    refreshMidiInputs();
    updateMidiUi();
    setMessage(midiInput?'MIDI ready: '+(midiInput.name||'controller')+'.':'MIDI enabled. Connect a controller to continue.')
  }catch(err){
    console.error(err);
    setMessage('MIDI permission was denied or unavailable.',true);
    if(els.midiStatus)els.midiStatus.textContent='PERMISSION DENIED'
  }
}
function toggleMidiLearn(){
  if(!midiAccess)return;
  midiLearning=!midiLearning;
  midiLearnPad=0;
  if(midiLearning)midiMap=new Map();
  updateMidiUi();
  setMessage(midiLearning?'MIDI Learn: press the controller pad/key you want assigned to PAD 01.':'MIDI Learn cancelled.')
}

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
function youtubeFrame(){
  const el=document.querySelector('#youtubePlayer');
  return el?.tagName==='IFRAME'?el:el?.querySelector?.('iframe')||null
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
  if(youtubePlayer&&typeof youtubePlayer.loadVideoById==='function'){youtubePlayer.cueVideoById(id);youtubePlayer.mute();youtubeReady=true;youtubeFrame()?.classList.add('active');return}
  youtubePlayer=new YT.Player('youtubePlayer',{
    videoId:id,
    playerVars:{playsinline:1,controls:0,disablekb:1,rel:0,modestbranding:1},
    events:{onReady:e=>{youtubeReady=true;e.target.mute();const f=youtubeFrame();if(f)f.classList.add('active')}}
  })
}
function prepareLocalVideo(file){
  if(localVideoUrl)URL.revokeObjectURL(localVideoUrl);
  localVideoUrl=URL.createObjectURL(file);videoKind='local';youtubeVideoId=null;els.localVideo.src=localVideoUrl;els.localVideo.muted=true;els.localVideo.classList.add('active');
  const f=youtubeFrame();if(f)f.classList.remove('active');
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

async function startBrowserCapture(){
  const url=els.url.value.trim();
  if(!url||!youtubeIdFromUrl(url))return setMessage('Paste a valid YouTube URL first.',true);
  if(!navigator.mediaDevices?.getDisplayMedia)return setMessage('This browser does not support tab-audio capture.',true);
  if(captureRecorder)return;
  saveActiveSourceState();
  if(recording)stopRecording();
  else stopScheduled();
  stopAllLiveSources();

  try{
    setVideoMode(true);
    await prepareYoutubeVideo(url);
    setMessage('Choose "This Tab" and make sure tab audio is shared.');
    const supported=navigator.mediaDevices.getSupportedConstraints?.()||{};
    const audio={suppressLocalAudioPlayback:false};
    if(supported.restrictOwnAudio)audio.restrictOwnAudio=false;

    captureStream=await navigator.mediaDevices.getDisplayMedia({
      video:true,
      audio,
      preferCurrentTab:true,
      selfBrowserSurface:'include',
      systemAudio:'include'
    });

    const audioTracks=captureStream.getAudioTracks();
    if(!audioTracks.length){
      captureStream.getTracks().forEach(t=>t.stop());
      captureStream=null;
      return setMessage('No tab audio was shared. Try again and enable "Share tab audio".',true);
    }

    const audioOnly=new MediaStream(audioTracks);
    const mimeCandidates=['audio/webm;codecs=opus','audio/webm'];
    const mime=mimeCandidates.find(x=>MediaRecorder.isTypeSupported?.(x))||'';
    captureChunks=[];
    captureStopping=false;
    captureRecorder=new MediaRecorder(audioOnly,mime?{mimeType:mime}:undefined);
    captureRecorder.ondataavailable=e=>{if(e.data&&e.data.size)captureChunks.push(e.data)};
    captureRecorder.onstop=finishBrowserCapture;
    captureStream.getVideoTracks()[0]?.addEventListener('ended',()=>stopBrowserCapture());

    captureRecorder.start(500);
    els.captureYoutube.disabled=true;
    els.stopCapture.disabled=false;
    els.audioState.textContent='CAPTURING';
    setMessage('Capturing YouTube audio in this browser… click STOP CAPTURE when you have enough.');

    if(youtubeReady&&youtubePlayer){
      try{
        youtubePlayer.unMute();
        youtubePlayer.seekTo(0,true);
        youtubePlayer.playVideo();
      }catch(err){console.warn('Could not auto-start YouTube playback',err)}
    }

    captureTimer=setTimeout(()=>stopBrowserCapture(),15*60*1000);
  }catch(err){
    console.error(err);
    if(captureStream){captureStream.getTracks().forEach(t=>t.stop());captureStream=null}
    captureRecorder=null;
    els.captureYoutube.disabled=false;
    els.stopCapture.disabled=true;
    els.audioState.textContent=buffer?'READY':'NO SAMPLE';
    if(err?.name==='NotAllowedError')setMessage('Capture was cancelled or permission was denied.',true);
    else setMessage('Could not start browser capture: '+(err?.message||err),true)
  }
}
function stopBrowserCapture(){
  if(captureStopping)return;
  captureStopping=true;
  if(captureTimer){clearTimeout(captureTimer);captureTimer=null}
  if(youtubeReady&&youtubePlayer){try{youtubePlayer.pauseVideo();youtubePlayer.mute()}catch{}}
  if(captureRecorder&&captureRecorder.state!=='inactive'){
    try{captureRecorder.stop()}catch{}
  }else{
    finishBrowserCapture()
  }
}
async function finishBrowserCapture(){
  if(captureTimer){clearTimeout(captureTimer);captureTimer=null}
  const stream=captureStream;
  captureStream=null;
  if(stream)stream.getTracks().forEach(t=>t.stop());
  const recorder=captureRecorder;
  captureRecorder=null;
  els.captureYoutube.disabled=false;
  els.stopCapture.disabled=true;

  const chunks=captureChunks;
  captureChunks=[];
  if(!chunks.length){
    captureStopping=false;
    els.audioState.textContent=buffer?'READY':'NO SAMPLE';
    return setMessage('No audio was captured.',true)
  }

  try{
    const type=recorder?.mimeType||'audio/webm';
    const blob=new Blob(chunks,{type});
    const id=youtubeIdFromUrl(els.url.value.trim());
    let capturedTitle=id?'Captured YouTube '+id:'Captured YouTube';
    try{
      const videoData=youtubePlayer?.getVideoData?.();
      if(videoData?.title)capturedTitle=videoData.title
    }catch{}
    await decodeArrayBuffer(await blob.arrayBuffer(),capturedTitle);
    setMessage('New source loaded. Existing recorded layers were kept.');
  }catch(err){
    console.error(err);
    els.audioState.textContent=buffer?'READY':'NO SAMPLE';
    setMessage('Captured audio could not be decoded.',true)
  }finally{
    captureStopping=false
  }
}

function createPads(){els.pads.innerHTML='';keys.forEach((key,index)=>{const btn=document.createElement('button');btn.className='pad';btn.dataset.index=index;btn.innerHTML='<span class="num">PAD '+String(index+1).padStart(2,'0')+'</span><span class="key">'+key.toUpperCase()+'</span><span class="slice">EMPTY</span>';btn.addEventListener('pointerdown',e=>{e.preventDefault();selectPad(index);playPad(index,true)});btn.addEventListener('pointerup',()=>{if(mode==='gate')stopPad(index)});btn.addEventListener('pointerleave',()=>{if(mode==='gate')stopPad(index)});els.pads.appendChild(btn)});selectPad(0)}
async function decodeArrayBuffer(ab,title='Sample'){
  ensureAudio();setMessage('Decoding audio…');
  try{
    const decoded=await ctx.decodeAudioData(ab.slice(0));
    buffer=decoded;
    detectedSourceBpm=detectBpm(buffer);
    if(els.sourceBpm)els.sourceBpm.value=Math.round(detectedSourceBpm);
    if(els.targetBpm&&sampleSources.size===0)els.targetBpm.value=Math.round(detectedSourceBpm);
    if(els.pitch)els.pitch.value=0;
    updateTempoUi();
    buildSlices();

    const sourceId='source-'+(++sourceSequence);
    sampleSources.set(sourceId,{
      id:sourceId,
      title,
      buffer:decoded,
      bpm:detectedSourceBpm,
      pitch:0,
      pads:clonePads(),
      url:els.url?.value?.trim()||'',
      youtubeId:youtubeIdFromUrl(els.url?.value?.trim()||''),
      createdAt:Date.now()
    });
    activeSourceId=sourceId;
    renderSources();
    renderLayers();

    els.title.textContent=title.toUpperCase();
    els.duration.textContent=formatTime(buffer.duration);
    els.audioState.textContent='READY';
    drawWaveform();updatePads();selectPad(0);
    setMessage('Ready. Source '+sampleSources.size+' loaded; '+layers.length+' recorded layer'+(layers.length===1?'':'s')+' preserved.')
  }catch(err){
    console.error(err);setMessage('This audio format could not be decoded by the browser.',true)
  }
}
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

function makeSource(index,destination=masterGain,when=0,durationOverride=null,rateOverride=null,velocity=1){if(!buffer||!pads[index])return null;const slice=pads[index],duration=Math.max(.02,durationOverride??(slice.end-slice.start)),context=destination.context||ctx,source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.playbackRate.value=rateOverride??getPlaybackRate();gain.gain.value=Math.max(0,Math.min(1.2,Number(velocity)||1));source.connect(gain);gain.connect(destination);source.start(when,slice.start,duration);return source}
function playPad(index,capture=false,velocity=1){if(!buffer||!pads[index])return;ensureAudio();if(monoChoke)stopAllLiveSources();const slice=pads[index],duration=Math.max(.02,slice.end-slice.start),rate=getPlaybackRate(),source=makeSource(index,masterGain,0,duration,rate,velocity);if(!source)return;let group=activeSources.get(index);if(!group){group=new Set();activeSources.set(index,group)}group.add(source);source.onended=()=>{const g=activeSources.get(index);if(g){g.delete(source);if(!g.size){activeSources.delete(index);setHit(index,false)}}};setHit(index,true);triggerVideo(index,duration/rate);if(capture&&recording&&currentLayer&&ctx.currentTime>=recordStart){
  const rawBeat=(ctx.currentTime-recordStart)/beatDuration();
  const beat=quantiseBeat(rawBeat);
  currentLayer.events.push({pad:index,beat,time:beat*beatDuration(),duration,start:slice.start,rate,velocity,sourceId:activeSourceId})
}}
function stopPad(index){const group=activeSources.get(index);if(!group)return;for(const source of group){try{source.stop()}catch{}}activeSources.delete(index);setHit(index,false)}
function stopAllLiveSources(){for(const[index,group]of activeSources){for(const source of group){try{source.stop()}catch{}}setHit(index,false)}activeSources.clear()}
function stopScheduled(){
  for(const s of scheduledSources){try{s.stop()}catch{}}
  scheduledSources=[];
  for(const n of metroNodes){try{n.stop()}catch{}}
  metroNodes=[];
  if(loopScheduler){clearInterval(loopScheduler);loopScheduler=null}
  if(mixTimer){clearInterval(mixTimer);mixTimer=null}
  if(countInTimer){clearTimeout(countInTimer);countInTimer=null}
  transportMode=null
}
function setHit(i,on){const p=els.pads.children[i];if(p)p.classList.toggle('hit',on)}
function selectPad(i){selectedPad=i;[...els.pads.children].forEach((p,n)=>p.classList.toggle('selected',n===i));const label='PAD '+String(i+1).padStart(2,'0');els.selectedInfo.textContent=label;els.editPad.textContent=label;updateEditInfo()}
function updateEditInfo(){const p=pads[selectedPad];els.editTime.textContent=p?p.start.toFixed(2)+'s — '+p.end.toFixed(2)+'s':'0.00s — 0.00s'}
function updatePads(){[...els.pads.children].forEach((pad,i)=>{const p=pads[i];pad.querySelector('.slice').textContent=p?p.start.toFixed(1)+'–'+p.end.toFixed(1)+'s':'EMPTY'});const src=activeSource();if(src)src.pads=clonePads()}

function drawWaveform(){const c=els.waveform,dpr=window.devicePixelRatio||1,r=c.getBoundingClientRect();c.width=Math.max(600,Math.floor(r.width*dpr));c.height=Math.max(180,Math.floor(r.height*dpr));const g=c.getContext('2d'),w=c.width,h=c.height;g.clearRect(0,0,w,h);g.fillStyle='#8cad74';g.fillRect(0,0,w,h);if(!buffer)return;const data=buffer.getChannelData(0),center=h/2,step=Math.max(1,Math.floor(data.length/w));g.strokeStyle='#203219';g.lineWidth=Math.max(1,dpr);g.beginPath();for(let x=0;x<w;x++){let min=1,max=-1,start=x*step,end=Math.min(data.length,start+step);for(let i=start;i<end;i++){const v=data[i];if(v<min)min=v;if(v>max)max=v}g.moveTo(x,center+min*center*.86);g.lineTo(x,center+max*center*.86)}g.stroke();g.strokeStyle='#405b32';for(let i=1;i<16;i++){const x=(pads[i]?.start??(buffer.duration*i/16))/buffer.duration*w;g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}}

function mixDuration(){return loopDuration()}
function scheduleClick(when,accent=false){
  if(!ctx||when<ctx.currentTime-.02)return;
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.frequency.value=accent?1280:900;
  gain.gain.setValueAtTime(0.0001,when);
  gain.gain.exponentialRampToValueAtTime(accent?.14:.09,when+.002);
  gain.gain.exponentialRampToValueAtTime(.0001,when+.045);
  osc.connect(gain);gain.connect(masterGain);
  osc.start(when);osc.stop(when+.055);
  metroNodes.push(osc)
}
function scheduleMetronomeCycle(cycleStart){
  if(!metronomeOn)return;
  const beat=beatDuration();
  for(let i=0;i<loopBeats();i++)scheduleClick(cycleStart+i*beat,i%4===0)
}
function scheduleLayerCycle(cycleStart,excludeCurrent=false){
  for(const layer of layers){
    if(layer.muted||(excludeCurrent&&layer===currentLayer))continue;
    for(const e of layer.events){
      const src=sourceForEvent(e);
      if(!src?.buffer)continue;
      const s=ctx.createBufferSource(),gain=ctx.createGain();
      s.buffer=src.buffer;s.playbackRate.value=e.rate||1;gain.gain.value=e.velocity??1;s.connect(gain);gain.connect(masterGain);
      s.start(cycleStart+eventTime(e),e.start??0,e.duration);
      scheduledSources.push(s)
    }
  }
}
function scheduleLoopCycle(cycleStart,excludeCurrent=false){
  scheduleLayerCycle(cycleStart,excludeCurrent);
  scheduleMetronomeCycle(cycleStart)
}
function startLoopTransport(startAt,excludeCurrent=false,modeName='play'){
  ensureAudio();stopScheduled();
  transportStart=startAt;
  transportExcludeCurrent=excludeCurrent;
  transportMode=modeName;
  nextLoopAt=startAt;
  const pump=()=>{
    const horizon=ctx.currentTime+.35;
    while(nextLoopAt<horizon){
      scheduleLoopCycle(nextLoopAt,transportExcludeCurrent);
      nextLoopAt+=loopDuration()
    }
  };
  pump();
  loopScheduler=setInterval(pump,60)
}
function scheduleCountIn(startAt){
  const beat=beatDuration();
  for(let i=0;i<4;i++)scheduleClick(startAt+i*beat,i===0)
}
function startRecording(){
  if(!buffer)return setMessage('Capture a sample first.',true);
  if(recording)return;
  ensureAudio();stopScheduled();
  currentLayer={id:Date.now(),name:'Layer '+(layers.length+1),muted:false,sourceId:activeSourceId,sourceTitle:activeSource()?.title||'Unknown source',events:[]};
  layers.push(currentLayer);
  const prep=ctx.currentTime+.08;
  recordStart=prep+(countInOn?4*beatDuration():0);
  recording=true;
  els.recordLayer.classList.add('active');
  if(countInOn){
    scheduleCountIn(prep);
    els.recordStatus.textContent='COUNT-IN';
    countInTimer=setTimeout(()=>{
      if(recording)els.recordStatus.textContent='RECORDING '+currentLayer.name.toUpperCase()
    },Math.max(0,(recordStart-ctx.currentTime)*1000))
  }else{
    els.recordStatus.textContent='RECORDING '+currentLayer.name.toUpperCase()
  }
  startLoopTransport(recordStart,true,'record');
  recordTimer=setInterval(()=>{
    const remaining=recordStart-ctx.currentTime;
    if(remaining>0){
      els.recordClock.textContent='-'+formatClock(remaining)
    }else{
      const pos=((ctx.currentTime-recordStart)%loopDuration()+loopDuration())%loopDuration();
      els.recordClock.textContent=formatClock(pos)
    }
  },50);
  renderLayers();
  setMessage('Loop recording armed. Hits are '+((els.quantise?.value||'off')==='off'?'unquantised':('quantised to 1/'+els.quantise.value))+'.')
}
function stopRecording(){
  if(!recording)return;
  recording=false;
  els.recordLayer.classList.remove('active');
  if(recordTimer){clearInterval(recordTimer);recordTimer=null}
  stopScheduled();
  const empty=currentLayer&&currentLayer.events.length===0;
  if(empty)layers=layers.filter(l=>l!==currentLayer);
  currentLayer=null;
  els.recordStatus.textContent='READY TO OVERDUB';
  els.recordClock.textContent=formatClock(loopDuration());
  renderLayers();
  setMessage(empty?'Empty layer discarded.':'Layer saved as a '+loopBars()+'-bar loop.')
}
function playMix(){
  if(!layers.some(l=>!l.muted&&l.events.length))return setMessage('Record a layer first.',true);
  if(recording)stopRecording();
  mixStart=ctx.currentTime+.08;
  startLoopTransport(mixStart,false,'play');
  els.recordStatus.textContent='LOOPING MIX';
  mixTimer=setInterval(()=>{
    const pos=((ctx.currentTime-mixStart)%loopDuration()+loopDuration())%loopDuration();
    els.recordClock.textContent=formatClock(pos)
  },50)
}
function renderLayers(){els.layers.innerHTML='';if(!layers.length){els.layers.innerHTML='<div class="empty-layer">No recorded layers yet.</div>';return}layers.forEach(layer=>{const row=document.createElement('div');row.className='layer'+(layer.muted?' muted':'');row.innerHTML='<div class="layer-meta"><span class="layer-name">'+layer.name+'</span><span class="layer-source">'+(layer.sourceTitle||'Sample source')+'</span><span class="layer-events">'+layer.events.length+' hits</span></div><button data-action="mute">'+(layer.muted?'UNMUTE':'MUTE')+'</button><button data-action="solo">SOLO</button><button data-action="delete">DELETE</button>';row.querySelector('[data-action="mute"]').onclick=()=>{layer.muted=!layer.muted;renderLayers()};row.querySelector('[data-action="solo"]').onclick=()=>{layers.forEach(l=>l.muted=l!==layer);renderLayers()};row.querySelector('[data-action="delete"]').onclick=()=>{layers=layers.filter(l=>l!==layer);renderLayers();els.recordClock.textContent=formatClock(mixDuration())};els.layers.appendChild(row)})}

async function exportWav(){if(!buffer||!layers.some(l=>!l.muted&&l.events.length))return setMessage('Nothing recorded to export.',true);const duration=loopDuration(),sr=buffer.sampleRate,offline=new OfflineAudioContext(2,Math.ceil(duration*sr),sr),gain=offline.createGain();gain.gain.value=Number(els.master.value);gain.connect(offline.destination);for(const layer of layers){if(layer.muted)continue;for(const e of layer.events)makeSourceOffline(offline,gain,e)}setMessage('Rendering '+loopBars()+'-bar loop WAV…');try{const rendered=await offline.startRendering(),wav=audioBufferToWav(rendered),blob=new Blob([wav],{type:'audio/wav'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sample-loop-'+loopBars()+'bar-'+Math.round(clampBpm(els.targetBpm.value))+'bpm-'+new Date().toISOString().replace(/[:.]/g,'-')+'.wav';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);setMessage('Loop WAV exported.')}catch(err){console.error(err);setMessage('Could not render WAV.',true)}}
function makeSourceOffline(offline,dest,e){const src=sourceForEvent(e);if(!src?.buffer)return;const s=offline.createBufferSource(),gain=offline.createGain();s.buffer=src.buffer;s.playbackRate.value=e.rate||1;gain.gain.value=e.velocity??1;s.connect(gain);gain.connect(dest);s.start(eventTime(e),e.start??0,Math.max(.02,e.duration))}
function audioBufferToWav(b){const channels=b.numberOfChannels,samples=b.length,bytes=44+samples*channels*2,ab=new ArrayBuffer(bytes),v=new DataView(ab);let o=0;const str=s=>{for(let i=0;i<s.length;i++)v.setUint8(o++,s.charCodeAt(i))},u32=n=>{v.setUint32(o,n,true);o+=4},u16=n=>{v.setUint16(o,n,true);o+=2};str('RIFF');u32(bytes-8);str('WAVE');str('fmt ');u32(16);u16(1);u16(channels);u32(b.sampleRate);u32(b.sampleRate*channels*2);u16(channels*2);u16(16);str('data');u32(samples*channels*2);const data=Array.from({length:channels},(_,c)=>b.getChannelData(c));for(let i=0;i<samples;i++)for(let c=0;c<channels;c++){const x=Math.max(-1,Math.min(1,data[c][i]));v.setInt16(o,x<0?x*32768:x*32767,true);o+=2}return ab}

async function loadYouTube(){const url=els.url.value.trim();if(!url)return setMessage('Paste a YouTube URL first.',true);if(!youtubeIdFromUrl(url))return setMessage('Paste a valid YouTube URL first.',true);prepareYoutubeVideo(url).catch(err=>console.warn('Video preview unavailable',err));ensureAudio();stopAllLiveSources();stopScheduled();els.loadYoutube.disabled=true;els.audioState.textContent='LOADING';setMessage('Fetching the YouTube audio stream…');try{const res=await fetch(API_BASE+'/api/youtube',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});if(!res.ok){const body=await res.json().catch(()=>({}));throw new Error(body.error||'YouTube import failed.')}const title=res.headers.get('X-Track-Title')||'YouTube sample',blob=await res.blob();await decodeArrayBuffer(await blob.arrayBuffer(),title)}catch(err){console.error(err);els.audioState.textContent=buffer?'READY':'NO SAMPLE';setMessage(err.message||'Could not load that YouTube video.',true)}finally{els.loadYoutube.disabled=false}}

els.captureYoutube.addEventListener('click',startBrowserCapture);els.stopCapture.addEventListener('click',stopBrowserCapture);els.url.addEventListener('keydown',e=>{if(e.key==='Enter')startBrowserCapture()});els.master.addEventListener('input',()=>{if(masterGain)masterGain.gain.value=Number(els.master.value)});els.modeBtn.addEventListener('click',()=>{mode=mode==='oneshot'?'gate':'oneshot';els.modeBtn.textContent='MODE: '+(mode==='oneshot'?'ONE SHOT':'GATE')});els.chokeBtn.addEventListener('click',()=>{monoChoke=!monoChoke;const poly=!monoChoke;els.chokeBtn.classList.toggle('active',poly);els.chokeBtn.setAttribute('aria-pressed',String(poly));els.chokeBtn.textContent='POLY: '+(poly?'ON':'OFF')});els.stopAll.addEventListener('click',()=>{stopAllLiveSources();stopScheduled()});els.resetSlice.addEventListener('click',()=>{const p=pads[selectedPad];if(!p)return;p.start=p.defaultStart;p.end=p.defaultEnd;updatePads();updateEditInfo()});document.querySelectorAll('[data-nudge]').forEach(btn=>btn.addEventListener('click',()=>{const p=pads[selectedPad];if(!p)return;const[edge,d]=btn.dataset.nudge.split(':'),delta=Number(d);if(edge==='start')p.start=Math.max(0,Math.min(p.end-.02,p.start+delta));else p.end=Math.min(buffer.duration,Math.max(p.start+.02,p.end+delta));updatePads();updateEditInfo()}));
els.sourceBpm.addEventListener('change',()=>{els.sourceBpm.value=clampBpm(els.sourceBpm.value);const src=activeSource();if(src)src.bpm=Number(els.sourceBpm.value);updateTempoUi();renderSources()});els.targetBpm.addEventListener('change',()=>{els.targetBpm.value=clampBpm(els.targetBpm.value);updateTempoUi();if(transportMode){if(recording)stopRecording();else{stopScheduled();els.recordStatus.textContent='READY TO OVERDUB'}}els.recordClock.textContent=formatClock(loopDuration())});els.pitch.addEventListener('input',()=>{const src=activeSource();if(src)src.pitch=Number(els.pitch.value)||0;updateTempoUi()});els.videoMode.addEventListener('click',()=>setVideoMode(!videoMode));
els.autoChop.addEventListener('click',transientChop);
els.equalChop.addEventListener('click',()=>{if(!buffer)return;applyBoundaries(Array.from({length:17},(_,i)=>buffer.duration*i/16),false);setMessage('Reset to 16 equal chops.')});
els.metronome.addEventListener('click',()=>{metronomeOn=!metronomeOn;updateGrooveUi()});
els.countIn.addEventListener('click',()=>{countInOn=!countInOn;updateGrooveUi()});
els.loopBars.addEventListener('change',()=>{if(transportMode){const wasRecording=recording;if(wasRecording)stopRecording();else{stopScheduled();els.recordStatus.textContent='READY TO OVERDUB'}}els.recordClock.textContent=formatClock(loopDuration());setMessage('Loop length: '+loopBars()+' bars.')});
els.quantise.addEventListener('change',()=>setMessage(els.quantise.value==='off'?'Quantise off.':'Quantise set to 1/'+els.quantise.value+'.'));
els.recordLayer.addEventListener('click',startRecording);els.stopRecord.addEventListener('click',stopRecording);els.playLayers.addEventListener('click',playMix);els.stopLayers.addEventListener('click',()=>{if(recording)stopRecording();else{stopScheduled();els.recordStatus.textContent='READY TO OVERDUB';els.recordClock.textContent=formatClock(loopDuration())}});els.exportWav.addEventListener('click',exportWav);

els.midiConnect.addEventListener('click',enableMidi);
els.midiLearn.addEventListener('click',toggleMidiLearn);
els.midiReset.addEventListener('click',resetMidiMap);
els.midiDevice.addEventListener('change',()=>{const input=midiAccess?.inputs.get(els.midiDevice.value)||null;setMidiInput(input);if(input)setMessage('MIDI input: '+(input.name||'controller')+'.')});
loadMidiMap();updateMidiUi();

const down=new Set();window.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName?.toLowerCase();
  if(['input','textarea','select'].includes(tag))return;
  if(e.shiftKey&&e.code==='KeyR'){
    if(e.repeat)return;
    e.preventDefault();
    recording?stopRecording():startRecording();
    return
  }
  const key=e.key.toLowerCase(),index=keys.indexOf(key);
  if(index<0||e.repeat||down.has(key))return;
  e.preventDefault();down.add(key);selectPad(index);playPad(index,true)
});window.addEventListener('keyup',e=>{const key=e.key.toLowerCase(),index=keys.indexOf(key);down.delete(key);if(index>=0&&mode==='gate')stopPad(index)});window.addEventListener('blur',()=>{down.clear();if(mode==='gate')stopAllLiveSources()});els.waveform.addEventListener('pointerdown',e=>{if(!buffer)return;const r=els.waveform.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*buffer.duration;let nearest=-1,best=Infinity;for(let i=1;i<16;i++){const d=Math.abs(pads[i].start-x);if(d<best){best=d;nearest=i}}if(best<buffer.duration*.035){dragMarker=nearest;els.waveform.setPointerCapture?.(e.pointerId)}});
els.waveform.addEventListener('pointermove',e=>{if(dragMarker<1||!buffer)return;const r=els.waveform.getBoundingClientRect(),t=Math.max(pads[dragMarker-1].start+.02,Math.min(pads[dragMarker].end-.02,(e.clientX-r.left)/r.width*buffer.duration));pads[dragMarker-1].end=t;pads[dragMarker].start=t;updatePads();updateEditInfo();drawWaveform()});
const endDrag=()=>{dragMarker=-1};els.waveform.addEventListener('pointerup',endDrag);els.waveform.addEventListener('pointercancel',endDrag);
window.addEventListener('resize',drawWaveform);setVideoMode(false);updateGrooveUi();renderSources();createPads();