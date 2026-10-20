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

function decodeLosslessJson(raw){
  // Preserve decimal/exponent lexemes such as 1.0; Akai uses their numeric
  // representation to distinguish floating-point fields from integers.
  const floatLexemes=[],out=[];
  let last=0,quoted=false,escape=false;
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(quoted){
      if(escape){escape=false;continue}
      if(ch==='\\'){escape=true;continue}
      if(ch==='"')quoted=false;
      continue;
    }
    if(ch==='"'){quoted=true;continue}
    if((ch==='-'||(ch>='0'&&ch<='9'))&&/[:\\[,]/.test(raw[i-1]||'')){
      const match=/^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?/.exec(raw.slice(i));
      if(match){
        const token=match[0];
        if(/[.eE]/.test(token)){
          out.push(raw.slice(last,i),JSON.stringify('__MPCTUBE_FLOAT_'+floatLexemes.length+'__'));
          floatLexemes.push(token);last=i+token.length;
        }
        i+=token.length-1;
      }
    }
  }
  out.push(raw.slice(last));
  return {doc:JSON.parse(out.join('')),floatLexemes};
}
function encodeLosslessJson(doc,floatLexemes){
  return JSON.stringify(doc).replace(/"__MPCTUBE_FLOAT_(\\d+)__"/g,(_,num)=>{
    const lexeme=floatLexemes[Number(num)];
    if(typeof lexeme!=='string')throw Error('Missing floating-point value in the project.');
    return lexeme;
  });
}
function readProjectJson(raw,header){
  const parsed=decodeLosslessJson(raw);
  if(!Array.isArray(parsed.doc?.data?.tracks)||!Array.isArray(parsed.doc?.data?.sequences))throw Error('Invalid MPC Sample project data.');
  return {header,doc:parsed.doc,floatLexemes:parsed.floatLexemes};
}
function validateDrumTemplate(template,compact=false){
  const drum=template.doc?.data?.tracks?.[0]?.program?.drum;
  if(!Array.isArray(drum?.instruments)||drum.instruments.length!==(compact?1:128))
    throw Error('Expected a '+(compact?'compact ':'')+'128-pad MPC drum project.');
  if(!compact&&!drum.instruments.some(inst=>!inst?.layersv?.some(l=>l?.sampleFile||l?.sampleName)))
    throw Error('Template has no empty pads. Please use a new blank drum project.');
  return template;
}
async function parseTemplate(binary){
  const b=binary instanceof Uint8Array?binary:new Uint8Array(binary);
  if(b.length<10||b[0]!==31||b[1]!==139)throw Error('Select a genuine MPC Sample .xpj project, not a ZIP or WAV.');
  if(b.length>6000000)throw Error('Template too large. Please save a new empty project on the MPC Sample.');
  const plain=decoder.decode(await transform(b,'gunzip'));
  let pos=0;const headerLines=[];
  for(let i=0;i<5;i++){const end=plain.indexOf('\\n',pos);if(end<0)throw Error('XPJ header is incomplete.');headerLines.push(plain.slice(pos,end));pos=end+1}
  if(headerLines[0]!=='ACVS'||headerLines[2]!=='SerialisableProjectData'||headerLines[3]!=='json')throw Error('This XPJ is not an MPC Sample drum project.');
  return validateDrumTemplate(readProjectJson(plain.slice(pos),plain.slice(0,pos)));
}
function parseBundledTemplateText(raw){
  const project=validateDrumTemplate(readProjectJson(raw,'ACVS\\n1.3.0.12\\nSerialisableProjectData\\njson\\nLinux\\n'),true);
  if(project.doc.data.lastSavedProductIdentifier!=='AC50')throw Error('Bundled project is not an MPC Sample template.');
  const inst=project.doc.data.tracks[0].program.drum.instruments;
  inst.push(...Array.from({length:127},()=>JSON.parse(JSON.stringify(inst[0]))));
  return project;
}
let bundledTemplatePromise;
async function loadBundledTemplate(){
  if(!bundledTemplatePromise)bundledTemplatePromise=(async()=>{
    const response=await fetch('mpc-sample-template.json?v=20261020-1');
    if(!response.ok)throw Error('Built-in MPC Sample project template could not load (HTTP '+response.status+').');
    return parseBundledTemplateText(await response.text());
  })().catch(err=>{bundledTemplatePromise=null;throw err});
  return bundledTemplatePromise;
}
function clone(value){return JSON.parse(JSON.stringify(value))}
function makeLayer(name,frames,prototype){
  const layer=prototype?clone(prototype):{active:true,volume:{gainCoefficient:1,controlValue:1,law:1},pan:0.5};
  layer.sampleName=name.replace(/\\.wav$/i,'');
  layer.sampleFile=name;
  layer.sampleStart=0;
  layer.sampleEnd=frames;
  if(!layer.sliceInfo)layer.sliceInfo={};
  layer.sliceInfo.Start=0;layer.sliceInfo.End=frames;
  return layer;
}
function buildProject(template,kitName,samples,bpm,bars){
  if(!template?.doc?.data||samples.length!==16||samples.some((s,i)=>s.name!==('A'+String(i+1).padStart(2,'0')+'.wav')||!Number.isInteger(s.frames)||s.frames<=0))
    throw Error('Expected 16 correctly named WAV chops with nonempty sample frames.');
  validateDrumTemplate(template);
  const project={header:template.header,doc:clone(template.doc),floatLexemes:[...(template.floatLexemes||[])]};
  const asFloat=value=>{
    if(!Number.isFinite(Number(value)))throw Error('Invalid floating-point sample property.');
    project.floatLexemes.push(Number(value).toFixed(1));
    return '__MPCTUBE_FLOAT_'+(project.floatLexemes.length-1)+'__';
  };
  const data=project.doc.data,track=data.tracks[0];
  const empty=track.program.drum.instruments.find(inst=>!inst?.layersv?.some(l=>l?.sampleFile||l?.sampleName));
  if(!empty)throw Error('The template must contain empty drum pad slots.');
  track.program.drum.instruments=Array.from({length:128},(_,i)=>{
    const inst=clone(empty);
    if(i<16){
      const layers=Array.isArray(inst.layersv)?inst.layersv:[];
      layers[0]=makeLayer(samples[i].name,samples[i].frames,layers[0]);
      inst.layersv=layers;
      inst.whichMuteGroup=0;
    }
    return inst;
  });
  const samplePool=samples.map(s=>({
    version:1,name:s.name.slice(0,-4),path:s.name,loadImpl:1,
    metadata:{tempo:asFloat(bpm),rootNote:60,tune:asFloat(0),key:'C Major'}
  }));
  track.name=kitName;
  track.program.name=kitName;
  track.samples=clone(samplePool);
  data.samples=clone(samplePool);
  data.masterTempo=bpm;
  // Native sequence and infrastructure objects are left intact; only its BPM
  // changes. Rebuilding the clip map risks invalidating device routing.
  const seq=data.sequences.find(s=>s.key===0)||data.sequences[0];
  if(seq?.value)seq.value.bpm=bpm;
  if(data.info&&typeof data.info==='object')data.info.title=kitName;
  return project;
}
async function encodeProject(project){
  return transform(bytes(project.header+encodeLosslessJson(project.doc,project.floatLexemes||[])),'gzip');
}
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
root.MpcKitExport={safeName,parseTemplate,parseBundledTemplateText,loadBundledTemplate,buildProject,encodeProject,zipFiles,download,storageKey,encodedBase64,decodedBase64};
if(typeof module==='object'&&module.exports)module.exports=root.MpcKitExport;
})(typeof window!=='undefined'?window:globalThis);
