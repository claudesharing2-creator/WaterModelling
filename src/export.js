import {writeArrayBuffer} from 'geotiff';
import {zipSync,strToU8} from 'fflate';
import {MODELS} from './engine.js';
export const escapeXML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function metadata(run,frame,mode='increment'){
 const p=run.p;return {application:'WaterModelling',version:run.result.version,scenario:p.name,model:p.model,model_description:MODELS[p.model].description,quality:run.demo?'Synthetic demonstration':p.forcingMode==='csv'?'Screening with local forcing; not calibrated':'Global/manual screening; not calibrated',unit:MODELS[p.model].unit,value_mode:mode,time:new Date(Date.parse(p.start)+frame.seconds*1000).toISOString(),depth_m:p.model==='oil'?null:p.depth,background_reference:p.backgroundKnown?p.background:null,crs:'EPSG:4326',grid_m:run.grid.dx,forcing:run.forcing.meta,water:run.waterMeta,budget_kg:frame.budget,limitations:['Uniform spatial forcing, fixed depth, 2D screening; no hydrodynamic solver.','Only fully wet grid cells retained. Mask quality depends on supplied polygons.','Oil is surface transport only, without weathering/beaching.','Background is an optional constant reference, not an independently simulated ambient field.','K and reaction rates are user assumptions, not calibrated parameters.']};
}
export function displayValue(v,run,mode){return v===null?null:v+(mode==='total'&&run.p.model!=='oil'&&run.p.backgroundKnown?run.p.background:0);}
export function geoJSON(run,frame,mode){
 const meta=metadata(run,frame,mode);
 return {type:'FeatureCollection',metadata:meta,features:run.grid.cells.flatMap((geometry,i)=>geometry&&frame.values[i]!==null?[{type:'Feature',geometry,properties:{cell_id:i,value:displayValue(frame.values[i],run,mode),increment:frame.values[i],unit:meta.unit,time:meta.time,depth_m:meta.depth_m}}]:[])};
}
export function tiffBuffer(run,frame,mode){
 const g=run.grid,values=new Float32Array(g.n*g.n);
 for(let row=0;row<g.n;row++)for(let col=0;col<g.n;col++){
 const v=displayValue(frame.values[(g.n-1-row)*g.n+col],run,mode);values[row*g.n+col]=v===null?-9999:v;
 }
 return writeArrayBuffer(values,{width:g.n,height:g.n,BitsPerSample:[32],SampleFormat:[3],SamplesPerPixel:1,PhotometricInterpretation:1,ModelPixelScale:[g.dlon,g.dlat,0],ModelTiepoint:[0,0,0,g.west,g.south+g.n*g.dlat,0],GTModelTypeGeoKey:2,GTRasterTypeGeoKey:1,GeographicTypeGeoKey:4326,GeogCitationGeoKey:'WGS 84',GDAL_NODATA:'-9999'});
}
export function kml(run,frame,mode){
 const geo=geoJSON(run,frame,mode),e=escapeXML,meta=geo.metadata;
 const polygons=geo.features.map(f=>'<Placemark><name>'+e(f.properties.value.toPrecision(5)+' '+meta.unit)+'</name><TimeStamp><when>'+meta.time+'</when></TimeStamp><styleUrl>#water</styleUrl><ExtendedData><Data name="value"><value>'+f.properties.value+'</value></Data><Data name="unit"><value>'+e(meta.unit)+'</value></Data><Data name="cell_id"><value>'+f.properties.cell_id+'</value></Data></ExtendedData><Polygon><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>'+f.geometry.coordinates[0].map(c=>c.join(',')+',0').join(' ')+'</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>').join('');
 return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>'+e(run.p.name)+'</name><description>'+e(JSON.stringify(meta))+'</description><Style id="water"><PolyStyle><color>997e6227</color></PolyStyle><LineStyle><width>0</width></LineStyle></Style>'+polygons+'</Document></kml>';
}
export function csvPoint(run,index){
 const p=run.p,g=run.grid,x=index%g.n,y=Math.floor(index/g.n);
 const header='time_utc,longitude,latitude,increment,total_reference,unit,depth_m';
 return header+'\n'+run.result.frames.map(frame=>[new Date(Date.parse(p.start)+frame.seconds*1000).toISOString(),g.west+(x+.5)*g.dlon,g.south+(y+.5)*g.dlat,frame.values[index],p.backgroundKnown&&p.model!=='oil'?frame.values[index]+p.background:'',MODELS[p.model].unit,p.model==='oil'?'':p.depth].join(',')).join('\n');
}
export function zipFiles(files){return zipSync(Object.fromEntries(Object.entries(files).map(([name,value])=>[name,typeof value==='string'?strToU8(value):new Uint8Array(value)])));}
export function download(content,name,type='application/octet-stream'){
 const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
