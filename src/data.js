import osmtogeojson from 'osmtogeojson';
import {normalizeWater} from './geo.js';
import {validateForcing,number} from './engine.js';
export async function getJSON(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('Layanan data merespons HTTP '+response.status);
 const data=await response.json();if(data.error)throw Error(data.reason||data.error);
 return data;
}
export function vector(speed,direction,from=false){
 const r=direction*Math.PI/180,s=from?-speed:speed;return {u:s*Math.sin(r),v:s*Math.cos(r)};
}
function scaleUnit(unit){if(unit==='m/s')return 1;if(unit==='km/h')return 1/3.6;if(unit==='kn')return .514444;throw Error('Satuan kecepatan tidak dikenal: '+unit);}
export async function marineData(p){
 if(p.waterType!=='marine')throw Error('Arus Marine API hanya untuk laut. Gunakan arus manual/CSV untuk sungai dan danau.');
 const start=Date.parse(p.start),end=start+p.hours*3600000;
 const from=new Date(start-3600000).toISOString().slice(0,10),to=new Date(end+3600000).toISOString().slice(0,10);
 const common={latitude:p.lat,longitude:p.lon,start_date:from,end_date:to,timezone:'GMT',timeformat:'unixtime'};
 const marineURL='https://marine-api.open-meteo.com/v1/marine?'+new URLSearchParams({...common,cell_selection:'sea',velocity_unit:'ms',hourly:'ocean_current_velocity,ocean_current_direction,sea_surface_temperature,wave_height,sea_level_height_msl'});
 const windURL='https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({...common,wind_speed_unit:'ms',hourly:'wind_speed_10m,wind_direction_10m'});
 const [mr,wr]=await Promise.allSettled([getJSON(marineURL),getJSON(windURL)]);
 if(mr.status==='rejected')throw mr.reason;
 if(wr.status==='rejected'&&p.model==='oil'&&p.windage>0)throw Error('Angin diperlukan untuk windage minyak: '+wr.reason.message);
 const m=mr.value,w=wr.status==='fulfilled'?wr.value:null;
 if(!m.hourly?.time)throw Error('Arus laut tidak tersedia.');
 const cs=scaleUnit(m.hourly_units.ocean_current_velocity),ws=w?scaleUnit(w.hourly_units.wind_speed_10m):1;
 const wind=new Map((w?.hourly?.time||[]).map((t,i)=>[t,{speed:w.hourly.wind_speed_10m[i],dir:w.hourly.wind_direction_10m[i]}]));
 const rows=m.hourly.time.map((t,i)=>{
 const speed=m.hourly.ocean_current_velocity[i],dir=m.hourly.ocean_current_direction[i],windRow=wind.get(t);
 const a=Number.isFinite(speed)&&Number.isFinite(dir)?vector(speed*cs,dir):{u:null,v:null};
 const b=windRow&&Number.isFinite(windRow.speed)&&Number.isFinite(windRow.dir)?vector(windRow.speed*ws,windRow.dir,true):{u:null,v:null};
 return {t,...a,wu:b.u,wv:b.v,temperature:m.hourly.sea_surface_temperature?.[i]??null,wave:m.hourly.wave_height?.[i]??null,level:m.hourly.sea_level_height_msl?.[i]??null};
 }).filter(r=>r.t>=Math.floor(start/3600000)*3600&&r.t<=Math.ceil(end/3600000)*3600);
 validateForcing(rows,p);
 const gridDistance=6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin((m.latitude-p.lat)*Math.PI/360)**2+Math.cos(p.lat*Math.PI/180)*Math.cos(m.latitude*Math.PI/180)*Math.sin((m.longitude-p.lon)*Math.PI/360)**2)));
 return {rows,meta:{source:'Open-Meteo Marine + Weather',fetched:new Date().toISOString(),marineURL,windURL,requested:[p.lon,p.lat],grid:[m.longitude,m.latitude],gridDistanceKm:gridDistance,resolution:'Arus sekitar 8 km; satu lokasi, berubah per jam, seragam di domain',windAvailable:!!w,contextOnly:'SST, gelombang, muka laut ditampilkan sebagai konteks; tidak mengubah kedalaman/reaksi. Arus Marine sudah mencakup kontribusi gelombang/pasang sehingga tidak ditambahkan lagi.'}};
}
export function manualData(p,u,v,wu,wv){
 const start=Date.parse(p.start)/1000,rows=[];
 for(let t=start;t<start+p.hours*3600;t+=3600)rows.push({t,u,v,wu,wv});
 rows.push({t:start+p.hours*3600,u,v,wu,wv});
 validateForcing(rows,p);
 return {rows,meta:{source:'Asumsi arus seragam manual',fetched:new Date().toISOString(),resolution:'Konstan dalam ruang dan waktu'}};
}
export function parseCSV(text,p){
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);if(lines.length>20000)throw Error('CSV terlalu panjang.');
 const heads=lines.shift().split(',').map(x=>x.trim());
 for(const h of ['time','u','v'])if(!heads.includes(h))throw Error('CSV membutuhkan time,u,v (u/v dalam m/s; waktu ISO dengan Z atau offset).');
 const rows=lines.filter(l=>l.trim()).map(line=>{
 const parts=line.split(',').map(x=>x.trim());if(parts.length!==heads.length)throw Error('Jumlah kolom CSV tidak sama.');
 const r=Object.fromEntries(heads.map((h,i)=>[h,parts[i]]));
 if(!/(Z|[+-]\d\d:\d\d)$/.test(r.time))throw Error('Waktu CSV harus memiliki zona waktu Z atau +08:00.');
 return {t:Date.parse(r.time)/1000,u:number(r.u,'u',-10,10),v:number(r.v,'v',-10,10),wu:r.wind_u!==undefined?number(r.wind_u,'wind_u',-100,100):null,wv:r.wind_v!==undefined?number(r.wind_v,'wind_v',-100,100):null};
 });validateForcing(rows,p);return {rows,meta:{source:'CSV arus lokal pengguna',fetched:new Date().toISOString(),resolution:'Seragam spasial; interpolasi linier komponen u/v terhadap waktu'}};
}
export async function osmWater(p){
 const d=p.radius/111195*1.5,x=d/Math.cos(p.lat*Math.PI/180);
 const box=[p.lat-d,p.lon-x,p.lat+d,p.lon+x].join(',');
 const query='[out:json][timeout:30];(way["natural"="water"]('+box+');relation["natural"="water"]('+box+');way["waterway"="riverbank"]('+box+');relation["waterway"="riverbank"]('+box+'););out geom;';
 const data=await getJSON('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query})});
 const geo=osmtogeojson(data);
 const water=normalizeWater(geo);
 return {water,meta:{source:'OpenStreetMap water polygons / Overpass',fetched:new Date().toISOString(),license:'ODbL; © OpenStreetMap contributors',note:'Poligon laut terbuka umumnya tidak tersedia. Garis pantai, tanggul dan pulau harus diperiksa.'}};
}
