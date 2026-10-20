'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const fs=require('node:fs');
const path=require('node:path');
const exporter=require('../docs/mpc-kit-export.js');
const encode=s=>new TextEncoder().encode(s);
function blankProject(){
  const empty={whichMuteGroup:0,zonePlayTime:1,layersv:[]};
  return {header:'ACVS\n1.3.0.12\nSerialisableProjectData\njson\nLinux\n',
    doc:{data:{tracks:[{name:'Drum 1',program:{name:'Drum 1',drum:{instruments:Array.from({length:128},()=>structuredClone(empty))}},samples:[]}],
    samples:[],sequences:[{key:0,value:{bpm:120,lengthBars:2,lengthPulses:7680,loopEndBar:2,loopEndPulses:7680,
      trackClipMaps:[[{key:'Drum 1',value:{name:'Drum 1',endPulses:7680,loopEndPulses:7680,eventList:{events:[{note:36}]}}}]]}}],
    masterTempo:120,masterTempoEnabled:false,info:{title:'Blank'}}}};
}
function entries(){return Array.from({length:16},(_,i)=>({name:'A'+String(i+1).padStart(2,'0')+'.wav',frames:22050+i}))}
test('gzip XPJ template parser recognises a device project and rejects unrelated data',async()=>{
  const base=blankProject();
  const xpj=zlib.gzipSync(base.header+JSON.stringify(base.doc));
  const parsed=await exporter.parseTemplate(xpj);
  assert.equal(parsed.doc.data.tracks[0].program.drum.instruments.length,128);
  await assert.rejects(exporter.parseTemplate(encode('RIFF bad')),/genuine MPC Sample/);
});
test('pad mapping, source samples, BPM and clip cleanup are preserved',()=>{
  const template=blankProject(),kit='Chop Test',names=entries();
  const result=exporter.buildProject(template,kit,names,94,4).doc.data;
  assert.equal(result.tracks[0].name,kit);
  assert.equal(result.tracks[0].program.drum.instruments.length,128);
  assert.deepEqual(result.samples.map(e=>e.path),names.map(e=>e.name));
  assert.deepEqual(result.tracks[0].samples.map(e=>e.name),names.map(e=>e.name.slice(0,-4)));
  names.forEach((v,i)=>{
    const inst=result.tracks[0].program.drum.instruments[i];
    assert.equal(inst.layersv[0].sampleFile,v.name);
    assert.equal(inst.layersv[0].sampleEnd,v.frames);
    assert.equal(inst.layersv[0].sliceInfo.End,v.frames);
  });
  assert.equal(result.tracks[0].program.drum.instruments[16].layersv.length,0);
  assert.equal(result.sequences[0].value.bpm,94);
  assert.equal(result.sequences[0].value.lengthBars,2,'native sequence lengths are not rebuilt');
  assert.equal(result.sequences[0].value.trackClipMaps[0][0].key,'Drum 1');
  assert.deepEqual(result.sequences[0].value.trackClipMaps[0][0].value.eventList.events,[{note:36}],'template sequence data is preserved');
  assert.equal(template.doc.data.tracks[0].name,'Drum 1','source template must remain untouched');
});
test('generated XPJ can be decompressed and read back',async()=>{
  const project=exporter.buildProject(blankProject(),'Drum 01',entries(),120,2);
  const data=await exporter.encodeProject(project);
  assert.equal(data[0],31);assert.equal(data[1],139);
  const restored=await exporter.parseTemplate(data);
  assert.equal(restored.doc.data.samples.length,16);
});
test('ZIP contains the project and 16 independent chops with working CRC32',async()=>{
  const zip=exporter.zipFiles([{name:'Kit.xpj',data:encode('test')},
    ...entries().map((s,i)=>({name:'Kit_[ProjectData]/'+s.name,data:encode('audio-'+i)}))]);
  const b=Buffer.from(await zip.arrayBuffer());
  let pos=0,count=0;
  while(b.readUInt32LE(pos)===0x04034b50){
    const crc=b.readUInt32LE(pos+14),size=b.readUInt32LE(pos+18),len=b.readUInt16LE(pos+26);
    const name=b.subarray(pos+30,pos+30+len).toString();
    const content=b.subarray(pos+30+len,pos+30+len+size);
    assert.equal(crc,require('node:zlib').crc32(content));
    if(count>0)assert.equal(name,'Kit_[ProjectData]/A'+String(count).padStart(2,'0')+'.wav');
    pos+=30+len+size;count++;
  }
  assert.equal(count,17);
  assert.equal(b.readUInt32LE(pos),0x02014b50);
  assert.equal(b.readUInt32LE(b.length-22),0x06054b50);
  assert.equal(b.readUInt16LE(b.length-12),17);
});
test('UI loads exporter before app and uses consistent IDs',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../docs/app.js'),'utf8');
  assert.ok(html.indexOf('mpc-kit-export.js')<html.indexOf('app.js?v='));
  for(const id of ['exportMpcKit','mpcTemplateFile','chooseMpcTemplate','mpcTemplateStatus']){
    assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(app,new RegExp('#'+id));
  }
});

test('safe filenames cannot escape the project folder',()=>{
  assert.equal(exporter.safeName('../My: Broken/Kit'), 'My BrokenKit');
});

test('MPC Export starts Save As, never opens the template file picker',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../docs/app.js'),'utf8');
  const start=app.indexOf('async function exportMpcSampleKit(){');
  const end=app.indexOf("document.querySelector('#chooseMpcTemplate')",start);
  const exportCode=app.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(exportCode,/showSaveFilePicker/);
  assert.match(exportCode,/MpcKitExport\.download/);
  assert.doesNotMatch(exportCode,/mpcTemplateFile\.click\(/);
  assert.match(exportCode,/if\(native\)/);
  assert.match(exportCode,/PAD MAP\.csv/);
  assert.match(exportCode,/WAV CHOPS ONLY/);
  assert.match(app,/mpcKitButton\.addEventListener\('click',exportMpcSampleKit\)/);
});

test('built-in MPC Sample project is available with no user-provided template',async()=>{
  const raw=fs.readFileSync(path.join(__dirname,'../docs/mpc-sample-template.json'),'utf8');
  assert.ok(raw.length<500000,'bundled template should stay compact');
  const template=exporter.parseBundledTemplateText(raw);
  assert.equal(template.doc.data.lastSavedProductIdentifier,'AC50');
  const instruments=template.doc.data.tracks[0].program.drum.instruments;
  assert.equal(instruments.length,128);
  assert.notEqual(instruments[0],instruments[1]);
  assert.equal(instruments[0].layersv.length,8);
  assert.equal(template.doc.data.samples.length,0);
  const project=exporter.buildProject(template,'No Setup',entries(),104,2);
  const bytes=await exporter.encodeProject(project);
  const plain=zlib.gunzipSync(Buffer.from(bytes)).toString('utf8');
  assert.ok(plain.startsWith('ACVS\n1.3.0.12\nSerialisableProjectData\njson\nLinux\n'));
  assert.ok(plain.includes('"gainCoefficient":1.0'),'typed floating numbers must retain decimal syntax');
  assert.ok(plain.includes('"tempo":104.0'),'sample tempo must be encoded as decimal');
  assert.ok(!plain.includes('__MPCTUBE_FLOAT_'),'placeholder must not reach the device');
  const restored=await exporter.parseTemplate(bytes);
  assert.equal(restored.doc.data.tracks[0].program.drum.instruments.length,128);
  assert.equal(restored.doc.data.samples.length,16);
  assert.equal(restored.doc.data.tracks[0].program.drum.instruments[0].layersv[0].sampleFile,'A01.wav');
  assert.equal(restored.doc.data.tracks[0].program.drum.instruments[15].layersv[0].sampleEnd,22065);
});
test('Export always includes native XPJ without template picker',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../docs/app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
  const start=app.indexOf('async function exportMpcSampleKit(){');
  const end=app.indexOf("document.querySelector('#chooseMpcTemplate')",start);
  const body=app.slice(start,end);
  assert.match(body,/mpcDeviceTemplate\|\|await MpcKitExport\.loadBundledTemplate\(\)/);
  assert.match(body,/const native=true/);
  assert.match(body,/\.xpj'/);
  assert.doesNotMatch(body,/mpcTemplateFile\.click\(/);
  assert.ok(html.includes('mpc-sample-template.json')===false,'template should be fetched by exporter only');
});
