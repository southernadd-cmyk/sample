/* MPCTube MPC Sample kit exporter.
 * Uses an empty project saved by the user's own MPC Sample as a firmware-compatible
 * template. No template is sent to a server. Native XPJ is gzip + ACVS JSON.
 * ZIP writer is deliberately dependency-free and uses the STORE method.
 */
(function(root){
'use strict';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const storageKey='mpctube-mpc-sample-template-v1';
const bytes=s=>encoder.encode(s);
function safeName(value){return (String(value||'MPCTube Kit').normalize('NFKC').replace(/[^a-zA-Z0-9 _-]/g,'').trim().replace(/\s+/g,' ').slice(0,55)||'MPCTube Kit')}
function encodedBase64(input){let out='';for(let i=0;i<input.length;i+=8192)out+=String.fromCharCode(...input.subarray(i,i+8192));return btoa(out)}
function decodedBase64(encoded){const str=atob(encoded),a=new Uint8Array(str.length);for(let i=0;i<str.length;i++)a[i]=str.charCodeAt(i);return a}
async function transform(data,format){if(typeof globalThis[format==='gzip'?'CompressionStream':'DecompressionStream']!=='function')throw Error('This browser does not support native gzip; use a current Chrome version.');const stream=new Blob([data]).stream().pipeThrough(format==='gzip'?new CompressionStream('gzip'):new DecompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer())}
async function parseTemplate(binary){
  const b=binary instanceof Uint8Array?binary:new Uint8Array(binary);
  if(b.length<10||b[0]!==31||b[1]!==139)throw Error('Select a genuine MPC Sample .xpj project, not a ZIP or WAV.');
  if(b.length>6000000)throw Error('Template too large. Please save a new empty project on the MPC Sample.');
  const plain=decoder.decode(await transform(b,'gunzip'));
  let pos=0;const headerLines=[];
  for(let i=0;i<5;i++){const end=plain.indexOf('\n',pos);if(end<0)throw Error('XPJ header is incomplete.');headerLines.push(plain.slice(pos,end));pos=end+1}
  if(headerLines[0]!=='ACVS'||headerLines[2]!=='SerialisableProjectData'||headerLines[3]!=='json')throw Error('This XPJ is not an MPC Sample drum project.');
  let doc;try{doc=JSON.parse(plain.slice(pos))}catch{throw Error('XPJ contains invalid project JSON.')}
  const drum=doc?.data?.tracks?.[0]?.program?.drum;
  if(!Array.isArray(drum?.instruments)||drum.instruments.length!==128||!Array.isArray(doc.data.sequences))throw Error('Project must contain a 128-pad drum program on track 1. Create a fresh drum project on your MPC Sample.');
  if(!drum.instruments.some(inst=>!inst?.layersv?.some(l=>l?.sampleFile||l?.sampleName)))throw Error('Template has no empty pads. Please use a new blank drum project.');
  return {header:plain.slice(0,pos),doc};
}
function clone(value){return JSON.parse(JSON.stringify(value))}
function makeLayer(name,frames,prototype){
  const layer=prototype?clone(prototype):{};
  Object.assign(layer,{
    active:true,volume:{gainCoefficient:1,controlValue:1,law:1},pan:0.5,pitch:0,
    coarseTune:0,fineTune:0,velocityStart:0,velocityEnd:127,
    sampleStart:0,sampleEnd:frames,loop:false,loopStart:0,loopEnd:frames,
    loopCrossfadeLength:0,loopFineTune:0,mute:false,rootNote:0,keyTrackEnable:false,
    sampleName:name.replace(/\.wav$/i,''),sampleFile:name,sliceIndex:129,
    direction:0,offset:0,version:layer.version||11,loopMode:0,
    layerLoopModeOverridesSliceLoopMode:true,
    sliceInfo:{Start:0,End:frames,LoopStart:0,LoopMode:0,PulsePosition:0,
      LoopCrossfadeLength:0,LoopCrossfadeType:0,TailLength:0,TailLoopPosition:0.5}
  });
  return layer;
}
function buildProject(template,kitName,samples,bpm,bars){
  if(!template?.doc?.data||samples.length!==16||samples.some((s,i)=>s.name!==('A'+String(i+1).padStart(2,'0')+'.wav')||!Number.isInteger(s.frames)||s.frames<=0))throw Error('Expected 16 correctly named WAV chops with nonempty sample frames.');
  const project=clone(template.doc),data=project.data;
  const track=data.tracks[0],originalName=track.name,originalProgramName=track.program.name;
  const instruments=track.program.drum.instruments;
  const empty=instruments.find(inst=>!inst?.layersv?.some(l=>l?.sampleFile||l?.sampleName));
  if(!empty)throw Error('An empty drum pad is needed in the template.');
  const active=instruments.find(inst=>inst?.layersv?.some(l=>l?.sampleFile||l?.sampleName))||empty;
  const prototype=active.layersv?.find(l=>l?.sampleFile||l?.sampleName)||null;
  track.program.drum.instruments=Array.from({length:128},(_,i)=>{
    if(i>=16)return clone(empty);
    const entry=samples[i],inst=clone(active);
    inst.whichMuteGroup=0;inst.zonePlayTime=1;
    inst.layersv=[makeLayer(entry.name,entry.frames,prototype)];
    return inst;
  });
  const samplePool=samples.map(s=>({
    version:1,name:s.name.slice(0,-4),path:s.name,loadImpl:0,
    metadata:{tempo:bpm,rootNote:60,tune:0,key:'C Major'}
  }));
  track.name=kitName;track.program.name=kitName;track.samples=clone(samplePool);
  data.samples=clone(samplePool);data.masterTempo=bpm;data.masterTempoEnabled=true;
  if(data.info&&typeof data.info==='object')data.info.title=kitName;
  const pulses=3840*bars;
  const seq=data.sequences.find(s=>s.key===0)||data.sequences[0];
  if(!seq?.value)throw Error('Project template is missing a playable sequence.');
  const value=seq.value;
  value.bpm=bpm;value.lengthBars=bars;value.lengthPulses=pulses;value.loopEndBar=bars;value.loopEndPulses=pulses;
  if(!Array.isArray(value.trackClipMaps))throw Error('Project template has no track clip map.');
  for(const group of value.trackClipMaps){
    if(!Array.isArray(group))continue;
    for(const clip of group){
      if(!clip?.value)continue;
      clip.value.endPulses=pulses;clip.value.loopEndPulses=pulses;
      if(clip.value.eventList?.events)clip.value.eventList.events=[];
      if([originalName,originalProgramName].includes(clip.key)||[originalName,originalProgramName].includes(clip.value.name)){
        clip.key=kitName;clip.value.name=kitName;
      }
    }
  }
  data.sequences=[{key:0,value}];
  return {header:template.header,doc:project};
}
async function encodeProject(project){return transform(bytes(project.header+JSON.stringify(project.doc)),'gzip')}
let table=null;
function crc32(input){
  if(!table){table=Array.from({length:256},(_,k)=>{for(let i=0;i<8;i++)k=k&1?0xedb88320^(k>>>1):k>>>1;return k>>>0})}
  let crc=0xffffffff;for(const b of input)crc=table[(crc^b)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function zipFiles(files){
  if(files.length>65535)throw Error('Too many ZIP entries.');
  const parts=[],central=[];let offset=0,centralSize=0;
  for(const file of files){
    const name=bytes(file.name),body=file.data instanceof Uint8Array?file.data:new Uint8Array(file.data);
    if(name.length>65535||body.length>0xffffffff||offset+body.length>0xffffffff)throw Error('Kit exceeds the ZIP32 limit.');
    const checksum=crc32(body);
    const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);
    lv.setUint32(14,checksum,true);lv.setUint32(18,body.length,true);lv.setUint32(22,body.length,true);
    lv.setUint16(26,name.length,true);local.set(name,30);
    const dir=new Uint8Array(46+name.length),dv=new DataView(dir.buffer);
    dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x800,true);
    dv.setUint32(16,checksum,true);dv.setUint32(20,body.length,true);dv.setUint32(24,body.length,true);
    dv.setUint16(28,name.length,true);dv.setUint32(42,offset,true);dir.set(name,46);
    parts.push(local,body);central.push(dir);offset+=local.length+body.length;centralSize+=dir.length;
  }
  const footer=new Uint8Array(22),fv=new DataView(footer.buffer);
  fv.setUint32(0,0x06054b50,true);fv.setUint16(8,files.length,true);fv.setUint16(10,files.length,true);
  fv.setUint32(12,centralSize,true);fv.setUint32(16,offset,true);
  return new Blob([...parts,...central,footer],{type:'application/zip'});
}
function download(blob,filename){
  const href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),60000);
}
root.MpcKitExport={safeName,parseTemplate,buildProject,encodeProject,zipFiles,download,storageKey,encodedBase64,decodedBase64};
if(typeof module==='object'&&module.exports)module.exports=root.MpcKitExport;
})(typeof window!=='undefined'?window:globalThis);
