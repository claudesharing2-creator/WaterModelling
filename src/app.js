import L from 'leaflet';
import {MODELS,validate,validateForcing,number,gridIndex} from './engine.js';
import {normalizeWater,makeGrid,inWater} from './geo.js';
import {marineData,manualData,parseCSV,osmWater} from './data.js';
import {metadata,displayValue,geoJSON,tiffBuffer,kml,csvPoint,zipFiles,download,escapeXML} from './export.js';
const $=id=>document.getElementById(id);
const ids=['name','lat','lon','radius','start','hours','n','model','release','mass','flow','concentration','releaseHours','depth','background','diffusion','decay','settling','windage','waterType','forcingMode'];
const state={water:null,waterMeta:null,forcing:null,forcingKey:null,csv:null,run:null,worker:null,probe:-1,mode:'inspect',drawing:[],demo:false,animation:null,busy:false};
const map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([-5.1,119.3],11);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',crossOrigin:true}).addTo(map);
L.control.zoom({position:'topright'}).addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
let tileErrors=0;tiles.on('tileerror',()=>{if(++tileErrors===3)notice('Basemap belum termuat. Periksa jaringan; koordinat dan domain tetap dapat digunakan.');});
map.createPane('result');map.getPane('result').style.zIndex=350;
const source=L.marker([-5.1,119.3],{icon:L.divIcon({className:'',html:'<div class="source-pin"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);
let waterLayer=null,domainLayer=null,resultLayer=null,probeLayer=null,drawLayer=null;
$('start').value=new Date(Math.floor(Date.now()/3600000)*3600000).toISOString().slice(0,16);
const fmt=(v,d=3)=>Number.isFinite(v)?v.toLocaleString('id-ID',{maximumFractionDigits:d}):'—';
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function stopAnimation(){clearInterval(state.animation);state.animation=null;$('play').textContent='Putar';}
function invalidate(){stopAnimation();state.run=null;state.probe=-1;if(resultLayer){map.removeLayer(resultLayer);resultLayer=null;}if(probeLayer){map.removeLayer(probeLayer);probeLayer=null;}$('resultContent').hidden=true;$('empty').hidden=false;$('legend').hidden=true;$('quality').textContent='Belum dihitung';$('resultTitle').textContent='Peta yang bisa ditelusuri';$('mapCaption').textContent='Skenario berubah · jalankan kembali';}
function forcingKey(p){return JSON.stringify([p.lat,p.lon,p.start,p.hours,p.model,p.windage,p.forcingMode,p.waterType,$('u').value,$('v').value,$('wu').value,$('wv').value,state.csv]);}
function readP(){
 const p={name:$('name').value.trim()||'Skenario',model:$('model').value,release:$('release').value,forcingMode:$('forcingMode').value,waterType:$('waterType').value,start:$('start').value+'Z'};
 for(const k of ['lat','lon','hours','n','mass','flow','concentration','releaseHours','depth','diffusion','decay','settling','windage'])p[k]=number($(k).value,k);
 p.radius=number($('radius').value,'radius')*1000;p.backgroundKnown=$('background').value!==''&&p.model!=='oil';p.background=p.backgroundKnown?number($('background').value,'latar'):0;
 return validate(p);
}
function adjust(){
 const model=$('model').value,oil=model==='oil';
 if(oil)$('release').value='pulse';
 $('release').disabled=oil;$('waterFields').hidden=oil;
 $('massWrap').hidden=$('release').value!=='pulse';$('continuousFields').hidden=$('release').value!=='continuous';
 $('decayWrap').hidden=model!=='decay';$('settlingWrap').hidden=model!=='tss';$('windageWrap').hidden=!oil;
 $('modelNote').textContent=MODELS[model].description;
 $('manualFields').hidden=$('forcingMode').value!=='manual';$('csvFields').hidden=$('forcingMode').value!=='csv';
}
function locate(){
 const lat=number($('lat').value,'Lintang',-80,80),lon=number($('lon').value,'Bujur',-180,180),r=number($('radius').value,'Radius',.25,20)*1000;
 source.setLatLng([lat,lon]);
 const d=r/111195,x=d/Math.cos(lat*Math.PI/180),bounds=[[lat-d,lon-x],[lat+d,lon+x]];
 if(domainLayer)map.removeLayer(domainLayer);
 domainLayer=L.rectangle(bounds,{color:'#547772',weight:1,dashArray:'5 5',fill:false,interactive:false}).addTo(map);
 map.fitBounds(bounds,{padding:[35,35]});return bounds;
}
function setWater(water,meta,demo=false){
 invalidate();state.water=normalizeWater(water);state.waterMeta=meta;state.demo=demo;
 if(waterLayer)map.removeLayer(waterLayer);
 waterLayer=L.geoJSON(state.water,{style:{color:'#128b79',weight:1.5,fillOpacity:.06},interactive:false}).addTo(map);
 $('confirmWater').checked=false;$('waterStatus').textContent=meta.source+' · '+(demo?'SINTETIS, bukan geometri aktual.':'Periksa pulau dan tanggul sebelum menjalankan.');
}
function setBusy(b){
 state.busy=b;for(const el of $('scenario').querySelectorAll('input,select,button'))el.disabled=b;
 for(const id of ['demo','scenarioFile','pickSource'])$(id).disabled=b;
 $('cancel').disabled=false;$('cancel').hidden=!b;$('progress').hidden=!b;
 if(!b)adjust();
}
async function gather(p=readP()){
 const key=forcingKey(p);let data;
 if(p.forcingMode==='global')data=await marineData(p);
 else if(p.forcingMode==='manual')data=manualData(p,number($('u').value,'u'),number($('v').value,'v'),number($('wu').value,'angin u'),number($('wv').value,'angin v'));
 else{if(!state.csv)throw Error('Unggah CSV arus terlebih dahulu.');data=parseCSV(state.csv,p);}
 if(key!==forcingKey(readP()))throw Error('Input berubah saat pengambilan data. Ambil data kembali.');
 state.forcing=data;state.forcingKey=key;
 const first=data.rows[0];$('dataStatus').classList.remove('error');$('dataStatus').textContent=data.meta.source+' · '+data.rows.length+' waktu · '+data.meta.resolution+(data.meta.gridDistanceKm!==undefined?' · jarak grid '+fmt(data.meta.gridDistanceKm,1)+' km':'')+(first.temperature!==undefined?' · SST '+fmt(first.temperature,1)+' °C · gelombang '+fmt(first.wave,1)+' m':'');
 return data;
}
async function launch(event){
 event?.preventDefault();if(state.busy)return;
 let p;
 try{
 p=readP();if(!state.water)throw Error('Tetapkan poligon air terlebih dahulu.');
 if(!$('confirmWater').checked)throw Error('Periksa batas air dan centang konfirmasi.');
 if(!inWater(state.water,p.lon,p.lat))throw Error('Titik sumber berada di luar poligon air.');
 invalidate();setBusy(true);$('progress').value=0;notice('Memeriksa data arus…');
 if(!state.forcing||state.forcingKey!==forcingKey(p))await gather(p);
 validateForcing(state.forcing.rows,p);
 notice('Membentuk sel air. Sel yang memotong garis pantai dikeluarkan…');
 await new Promise(r=>setTimeout(r,30));
 const grid=makeGrid(p,state.water);
 const input={p,grid,forcing:structuredClone(state.forcing),water:structuredClone(state.water),waterMeta:structuredClone(state.waterMeta),demo:state.demo};
 const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});state.worker=worker;
 worker.onmessage=({data})=>{
 if(data.progress!==undefined){$('progress').value=data.progress;notice('Menghitung transport dan neraca massa… '+Math.round(data.progress*100)+'%');}
 if(data.error){worker.terminate();state.worker=null;setBusy(false);notice(data.error,true);}
 if(data.result){state.run={...input,result:data.result};worker.terminate();state.worker=null;setBusy(false);renderResult();notice('Simulasi selesai. Klik peta untuk memeriksa titik.');}
 };
 worker.onerror=e=>{worker.terminate();state.worker=null;setBusy(false);notice('Mesin simulasi gagal: '+e.message,true);};
 worker.postMessage({p,grid,forcing:state.forcing.rows});
 }catch(e){setBusy(false);notice(e.message,true);}
}
function currentFrame(){return state.run.result.frames[Number($('time').value)];}
function mode(){return $('valueMode').value;}
const colors=[[195,234,224],[93,181,162],[35,141,133],[39,98,126],[52,56,92]];
function color(v,max){const t=Math.min(1,Math.max(0,v/max))*4,i=Math.min(3,Math.floor(t)),q=t-i;return colors[i].map((c,k)=>Math.round(c+(colors[i+1][k]-c)*q));}
function renderResult(){
 const run=state.run;
 $('empty').hidden=true;$('resultContent').hidden=false;$('legend').hidden=false;$('resultTitle').textContent=run.p.name;
 $('quality').textContent=run.demo?'DEMO SINTETIS':run.p.forcingMode==='csv'?'SCREENING · DATA LOKAL':'SCREENING · JENIS 1';
 $('time').max=run.result.frames.length-1;$('time').value=run.result.frames.length-1;
 $('valueMode').value='increment';$('valueMode').options[1].disabled=!run.p.backgroundKnown||run.p.model==='oil';
 $('probeLabel').textContent='Klik sel air pada peta untuk melihat deret waktu.';$('probeStats').textContent='';$('chart').classList.remove('has-data');
 drawFrame();
}
function drawFrame(){
 if(!state.run)return;
 const run=state.run,g=run.grid,frame=currentFrame(),unit=MODELS[run.p.model].unit;
 let scale=0;for(const f of run.result.frames)for(const v of f.values)if(v!==null)scale=Math.max(scale,displayValue(v,run,mode()));
 scale=Math.max(scale,1e-12);
 const canvas=document.createElement('canvas');canvas.width=g.n;canvas.height=g.n;const ctx=canvas.getContext('2d'),im=ctx.createImageData(g.n,g.n);
 for(let y=0;y<g.n;y++)for(let x=0;x<g.n;x++){const v=displayValue(frame.values[y*g.n+x],run,mode());if(v===null||v<=0)continue;const at=((g.n-1-y)*g.n+x)*4;im.data.set([...color(v,scale),Math.max(35,Math.min(255,255*Math.sqrt(v/scale)))],at);}
 ctx.putImageData(im,0,0);
 const bounds=[[g.south,g.west],[g.south+g.n*g.dlat,g.west+g.n*g.dlon]];
 if(resultLayer)map.removeLayer(resultLayer);
 resultLayer=L.imageOverlay(canvas.toDataURL(),bounds,{pane:'result',opacity:Number($('opacity').value),interactive:false}).addTo(map);
 resultLayer.getElement().style.imageRendering='pixelated';
 const meta=metadata(run,frame,mode()),b=frame.budget;
 $('timeLabel').textContent=meta.time.replace('T',' ').replace('.000Z',' UTC');
 $('legendTitle').textContent=(mode()==='total'?'Total referensi':'Tambahan sumber')+' · '+unit;
 $('legendMax').textContent=fmt(scale,5);$('maxValue').textContent=fmt(Math.max(...frame.values.filter(v=>v!==null).map(v=>displayValue(v,run,mode()))),5)+' '+unit;
 $('massValue').textContent=fmt(b.active)+' kg';$('escapedValue').textContent=fmt(b.escaped)+' kg';$('errorValue').textContent=fmt(Math.abs(b.error)/Math.max(b.injected,1e-15)*100,7)+'%';
 $('balanceNote').textContent='Masuk '+fmt(b.injected)+' kg · terurai '+fmt(b.decayed)+' kg · mengendap '+fmt(b.settled)+' kg · sel '+fmt(g.dx,0)+' m · kedalaman '+(run.p.model==='oil'?'permukaan':fmt(run.p.depth)+' m')+'.';
 $('mapCaption').textContent=(run.demo?'DEMO SINTETIS · ':'')+MODELS[run.p.model].label+' · t+'+fmt(frame.seconds/3600,2)+' jam';
 if(state.probe>=0)drawProbe();
}
function probeAt(lon,lat){
 if(!state.run){notice('Jalankan simulasi terlebih dahulu.');return;}
 const run=state.run,index=gridIndex(run.grid,lon,lat);
 $('probeLat').value=lat.toFixed(6);$('probeLon').value=lon.toFixed(6);
 if(index<0||!run.grid.mask[index]){state.probe=-1;if(probeLayer){map.removeLayer(probeLayer);probeLayer=null;}$('probeLabel').textContent='NoData — di luar domain atau bukan sel air penuh.';$('probeStats').textContent='Tidak diekstrapolasi ke daratan.';$('chart').classList.remove('has-data');return;}
 state.probe=index;if(probeLayer)map.removeLayer(probeLayer);
 probeLayer=L.marker([lat,lon],{icon:L.divIcon({className:'',html:'<div class="probe-pin"></div>',iconSize:[12,12],iconAnchor:[6,6]})}).addTo(map);
 $('probeLabel').textContent=lat.toFixed(6)+', '+lon.toFixed(6)+' · sel '+index+' · rerata sel '+fmt(run.grid.dx,0)+' m';
 drawProbe();
}
function drawProbe(){
 const run=state.run,idx=state.probe;if(!run||idx<0)return;
 const frames=run.result.frames,values=frames.map(f=>displayValue(f.values[idx],run,mode())),peak=Math.max(...values),imax=values.indexOf(peak);
 const now=values[Number($('time').value)],threshold=$('threshold').value===''?null:number($('threshold').value,'ambang',0);
 let extra='';
 if(threshold!==null){let duration=0,first=null;for(let i=0;i<values.length-1;i++){const a=values[i],b=values[i+1],dt=frames[i+1].seconds-frames[i].seconds;if(a>threshold){if(first===null)first=frames[i].seconds;duration+=b>threshold?dt:dt*(a-threshold)/(a-b);}else if(b>threshold){const cross=dt*(threshold-a)/(b-a);if(first===null)first=frames[i].seconds+cross;duration+=dt-cross;}}extra=' · Di atas ambang ~'+fmt(duration/3600,2)+' jam'+(first!==null?' · pertama t+'+fmt(first/3600,2)+' jam':'');}
 $('probeStats').textContent='Saat ini '+fmt(now,6)+' '+MODELS[run.p.model].unit+' · maksimum '+fmt(peak,6)+' pada t+'+fmt(frames[imax].seconds/3600,2)+' jam'+extra;
 const svg=$('chart'),max=Math.max(peak,1e-12),points=values.map((v,i)=>(35+i/(values.length-1)*550)+','+(105-v/max*85)).join(' ');
 // Only internally generated numeric values enter this SVG.
 svg.innerHTML='<path d="M35 15V105H585" fill="none" stroke="#ceddd7"/><polyline points="'+points+'" fill="none" stroke="#08796e" stroke-width="2"/><text x="35" y="124" font-size="10" fill="#607578">0 jam</text><text x="535" y="124" font-size="10" fill="#607578">'+run.p.hours+' jam</text><text x="35" y="12" font-size="10" fill="#607578">'+fmt(peak,5)+'</text>';
 svg.classList.add('has-data');
}
function report(){
 const run=state.run,frame=currentFrame(),meta=metadata(run,frame,mode()),e=escapeXML;
 const win=window.open('','_blank');if(!win)throw Error('Izinkan jendela laporan, lalu coba kembali.');
 const g=run.grid,n=g.n,values=frame.values,max=Math.max(...values.filter(v=>v!==null),1e-12);
 const cells=values.flatMap((v,i)=>v!==null?['<rect x="'+(i%n)*500/n+'" y="'+(n-1-Math.floor(i/n))*500/n+'" width="'+500/n+'" height="'+500/n+'" fill="rgb('+color(v,max).join(',')+')"/>']:[]).join('');
 const rows=run.result.frames.map(f=>'<tr><td>'+fmt(f.seconds/3600,2)+'</td><td>'+fmt(f.budget.injected)+'</td><td>'+fmt(f.budget.active)+'</td><td>'+fmt(f.budget.escaped)+'</td><td>'+fmt(f.budget.decayed)+'</td><td>'+fmt(f.budget.settled)+'</td></tr>').join('');
 const p=run.p;
 win.document.write('<!doctype html><html lang="id"><meta charset="utf-8"><title>'+e(p.name)+' — WaterModelling</title><style>body{font:14px system-ui;max-width:900px;margin:35px auto;padding:20px;color:#213d40}h1{font-size:27px}p{line-height:1.7}table{border-collapse:collapse;width:100%;font-size:11px}td,th{border-bottom:1px solid #ddd;text-align:left;padding:7px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px;background:#f4f7f5;padding:15px}svg{width:400px;max-width:100%;border:1px solid #dce5e2}button{padding:12px;background:#076e69;color:white;border:0;border-radius:5px}@media print{button{display:none}body{margin:0}tr{break-inside:avoid}}</style><button onclick="window.print()">Cetak / Simpan PDF</button><h1>'+e(p.name)+'</h1><p>WaterModelling · '+e(meta.quality)+'<br>'+e(meta.model_description)+'</p><p>Periode '+e(p.start)+' sampai '+e(new Date(Date.parse(p.start)+p.hours*3600000).toISOString())+'<br>Sumber WGS84 '+p.lat+', '+p.lon+' · '+e(p.release)+'<br>Arus: '+e(run.forcing.meta.source)+'<br>Waktu peta: '+e(meta.time)+'</p><h2>Peta grid georeferensi</h2><p>Utara di atas; peta skematik domain, tanpa basemap. Warna menunjukkan tambahan sumber 0 sampai '+fmt(max,6)+' '+e(meta.unit)+'. Area putih adalah NoData.</p><svg viewBox="0 0 500 500">'+cells+'</svg><p>Batas WGS84: barat '+g.west+', selatan '+g.south+', timur '+(g.west+n*g.dlon)+', utara '+(g.south+n*g.dlat)+'.</p><h2>Titik evaluasi</h2><p>'+e(state.probe>=0?$('probeLabel').textContent+' — '+$('probeStats').textContent:'Belum dipilih.')+'</p><h2>Neraca massa</h2><table><thead><tr><th>Jam</th><th>Masuk kg</th><th>Aktif kg</th><th>Keluar kg</th><th>Terurai kg</th><th>Mengendap kg</th></tr></thead><tbody>'+rows+'</tbody></table><h2>Input dan provenance</h2><pre>'+e(JSON.stringify({parameters:p,...meta},null,2))+'</pre><h2>Referensi</h2><p>Open-Meteo Marine: https://open-meteo.com/en/docs/marine-weather-api<br>EPA WASP: https://www.epa.gov/hydrowq/water-quality-analysis-simulation-program-wasp<br>OpenDrift: https://opendrift.github.io/<br>Metode screening ini merupakan implementasi tersendiri; bukan keluaran MoTuM, QUAL2Kw, WASP atau OpenOil.</p></html>');
 win.document.close();
}
function safe(fn){return async(...args)=>{try{await fn(...args);}catch(e){notice(e.message,true);}};}
$('scenario').addEventListener('submit',launch);
$('scenario').addEventListener('input',e=>{
 if(state.busy)return;
 invalidate();if(['lat','lon','radius'].includes(e.target.id)){$('confirmWater').checked=false;state.demo=false;}
 if(e.target.id!=='confirmWater'){state.forcingKey=null;$('dataStatus').textContent='Input berubah. Data akan diperiksa saat dijalankan.';}
 adjust();
});
$('locate').onclick=safe(locate);$('fit').onclick=safe(locate);
$('gather').onclick=safe(async()=>{setBusy(true);try{notice('Mengambil data…');await gather();notice('Data arus siap.');}catch(e){$('dataStatus').textContent=e.message;$('dataStatus').classList.add('error');throw e;}finally{setBusy(false);}});
$('waterAuto').onclick=safe(async()=>{setBusy(true);try{notice('Mencari poligon air OpenStreetMap…');const r=await osmWater(readP());setWater(r.water,r.meta);notice('Batas air ditemukan. Periksa geometri pada peta.');}finally{setBusy(false);}});
$('waterFile').onchange=safe(async e=>{const file=e.target.files[0];if(!file)return;if(file.size>4000000)throw Error('Maksimum GeoJSON 4 MB.');setWater(JSON.parse(await file.text()),{source:'GeoJSON air pengguna: '+file.name,fetched:new Date().toISOString()});});
$('csvFile').onchange=safe(async e=>{const file=e.target.files[0];if(!file)return;if(file.size>2000000)throw Error('Maksimum CSV 2 MB.');state.csv=await file.text();state.forcingKey=null;notice('CSV tersedia, periksa data sebelum simulasi.');});
$('csvTemplate').onclick=safe(()=>{const p=readP(),start=Date.parse(p.start);download('time,u,v,wind_u,wind_v\n'+Array.from({length:Math.ceil(p.hours)+1},(_,i)=>new Date(start+i*3600000).toISOString()+',0.1,0,0,0').join('\n'),'contoh-arus-SINTETIS.csv','text/csv');});
function mapMode(m){state.mode=m;$('pickSource').classList.toggle('active',m==='source');$('inspect').classList.toggle('active',m==='inspect');}
$('pickSource').onclick=()=>{mapMode('source');notice('Klik peta untuk memindahkan sumber.');};
$('inspect').onclick=()=>mapMode('inspect');
function endDraw(){state.drawing=[];if(drawLayer){map.removeLayer(drawLayer);drawLayer=null;}$('finishDraw').hidden=true;$('cancelDraw').hidden=true;mapMode('inspect');}
$('draw').onclick=()=>{endDraw();state.mode='draw';$('finishDraw').hidden=false;$('cancelDraw').hidden=false;notice('Klik simpul batas air, lalu Selesai menggambar. Hindari pulau; gunakan GeoJSON dengan lubang untuk pulau.');};
$('cancelDraw').onclick=endDraw;
$('finishDraw').onclick=safe(()=>{if(state.drawing.length<3)throw Error('Minimal tiga simpul.');const ring=state.drawing.map(ll=>[ll.lng,ll.lat]);ring.push([...ring[0]]);setWater({type:'Polygon',coordinates:[ring]},{source:'Batas air digambar pengguna',fetched:new Date().toISOString(),note:'Belum diverifikasi otomatis terhadap daratan.'});endDraw();notice('Periksa poligon dan konfirmasikan batas air.');});
map.on('click',safe(e=>{
 if(state.busy)return;
 if(state.mode==='draw'){state.drawing.push(e.latlng);if(drawLayer)map.removeLayer(drawLayer);drawLayer=L.polyline(state.drawing,{color:'#d78c3e',weight:2}).addTo(map);return;}
 if(state.mode==='source'){$('lat').value=e.latlng.lat.toFixed(6);$('lon').value=e.latlng.lng.toFixed(6);$('confirmWater').checked=false;state.forcingKey=null;state.demo=false;invalidate();locate();mapMode('inspect');return;}
 probeAt(e.latlng.lng,e.latlng.lat);
}));
$('cancel').onclick=()=>{state.worker?.terminate();state.worker=null;setBusy(false);notice('Simulasi dihentikan.');};
$('time').oninput=drawFrame;$('opacity').oninput=()=>resultLayer?.setOpacity(Number($('opacity').value));
$('valueMode').onchange=drawFrame;$('threshold').oninput=safe(drawProbe);
$('probeGo').onclick=safe(()=>probeAt(number($('probeLon').value,'Bujur titik',-180,180),number($('probeLat').value,'Lintang titik',-90,90)));
$('play').onclick=()=>{if(state.animation){stopAnimation();return;}if(Number($('time').value)>=$('time').max)$('time').value=0;$('play').textContent='Jeda';state.animation=setInterval(()=>{const v=Number($('time').value);if(v>=Number($('time').max)){stopAnimation();return;}$('time').value=v+1;drawFrame();},350);};
$('help').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
$('demo').onclick=safe(()=>{
 const vals={name:'Demo kanal sintetis',lat:-5.1,lon:119.3,radius:2,hours:6,n:48,model:'tracer',release:'pulse',mass:100,diffusion:2,depth:3,forcingMode:'manual',waterType:'inland',u:.08,v:0,wu:0,wv:0};
 for(const [k,v]of Object.entries(vals))$(k).value=v;
 $('background').value='';state.forcingKey=null;adjust();locate();
 const outer=[[119.27,-5.12],[119.33,-5.12],[119.33,-5.08],[119.27,-5.08],[119.27,-5.12]];
 const island=[[119.305,-5.106],[119.305,-5.094],[119.308,-5.094],[119.308,-5.106],[119.305,-5.106]];
 setWater({type:'Polygon',coordinates:[outer,island]},{source:'Demo kanal dengan penghalang sintetis',fetched:new Date().toISOString()},true);
 $('confirmWater').checked=true;notice('Demo sintetis siap. Tekan Jalankan simulasi. Tidak mewakili kondisi lokasi nyata.');
});
$('exportGeo').onclick=safe(()=>download(JSON.stringify(geoJSON(state.run,currentFrame(),mode())),'watermodelling.geojson','application/geo+json'));
$('exportTif').onclick=safe(()=>download(zipFiles({'concentration.tif':tiffBuffer(state.run,currentFrame(),mode()),'metadata.json':JSON.stringify(metadata(state.run,currentFrame(),mode()),null,2)}),'watermodelling-geotiff.zip','application/zip'));
$('exportKml').onclick=safe(()=>download(zipFiles({'doc.kml':kml(state.run,currentFrame(),mode()),'metadata.json':JSON.stringify(metadata(state.run,currentFrame(),mode()),null,2)}),'watermodelling.kmz','application/vnd.google-earth.kmz'));
$('exportCSV').onclick=safe(()=>{if(state.probe<0)throw Error('Pilih titik evaluasi terlebih dahulu.');download(csvPoint(state.run,state.probe),'watermodelling-titik.csv','text/csv');});
$('save').onclick=safe(()=>download(JSON.stringify({schema:1,...state.run},null,2),'watermodelling-skenario.json','application/json'));
$('report').onclick=safe(report);
$('scenarioFile').onchange=safe(async e=>{
 const file=e.target.files[0];if(!file)return;if(file.size>15000000)throw Error('Maksimum berkas skenario 15 MB.');
 const input=JSON.parse(await file.text());if(input.schema!==1)throw Error('Versi skenario tidak dikenal.');
 validate(input.p);validateForcing(input.forcing.rows,input.p);const water=normalizeWater(input.water);
 for(const id of ids){if(id==='start')$(id).value=input.p.start.slice(0,16);else if(id==='radius')$(id).value=input.p.radius/1000;else if(id==='background')$(id).value=input.p.backgroundKnown?input.p.background:'';else if(input.p[id]!==undefined)$(id).value=input.p[id];}
 // Import forcings explicitly as CSV; never trust saved results as new simulations.
 $('forcingMode').value='csv';state.csv='time,u,v,wind_u,wind_v\n'+input.forcing.rows.map(r=>[new Date(r.t*1000).toISOString(),r.u,r.v,r.wu??0,r.wv??0].join(',')).join('\n');
 state.forcingKey=null;adjust();locate();setWater(water,{source:'Domain dari skenario impor',original:input.waterMeta},Boolean(input.demo));notice('Input skenario dimuat. Periksa batas air dan jalankan kembali; hasil lama tidak dipakai.');
});
adjust();locate();
