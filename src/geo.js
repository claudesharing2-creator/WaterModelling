import {bboxPolygon,featureCollection,intersect,area,union,booleanPointInPolygon,point,kinks,booleanValid} from '@turf/turf';
export function normalizeWater(input){
 const features=input.type==='FeatureCollection'?input.features:[input.type==='Feature'?input:{type:'Feature',properties:{},geometry:input}];
 if(!Array.isArray(features)||features.length>300)throw Error('GeoJSON harus berisi 1–300 poligon.');
 let count=0;
 const walk=c=>{if(typeof c[0]==='number'){count++;if(c.length<2||!Number.isFinite(c[0])||!Number.isFinite(c[1])||Math.abs(c[0])>180||Math.abs(c[1])>85)throw Error('Koordinat GeoJSON harus WGS84 longitude, latitude.');}else for(const x of c)walk(x);};
 const polys=features.filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type)).map(f=>({type:'Feature',properties:{},geometry:f.geometry}));
 if(!polys.length)throw Error('Tidak ditemukan Polygon/MultiPolygon air.');
 for(const p of polys){walk(p.geometry.coordinates);if(count>30000)throw Error('Geometri terlalu detail (>30.000 simpul). Sederhanakan sebelum upload.');if(!booleanValid(p)||kinks(p).features.length)throw Error('Poligon tidak valid atau memotong dirinya sendiri.');}
 return polys.length===1?polys[0]:union(featureCollection(polys));
}
export function makeGrid(p,water){
 const dx=2*p.radius/p.n,deg=180/Math.PI/6371008.8;
 const dlat=dx*deg,dlon=dlat/Math.cos(p.lat*Math.PI/180);
 const west=p.lon-p.radius*deg/Math.cos(p.lat*Math.PI/180),south=p.lat-p.radius*deg;
 if(west< -180||west+p.n*dlon>180)throw Error('Domain melintasi antimeridian belum didukung.');
 const mask=[],cells=[];
 for(let y=0;y<p.n;y++)for(let x=0;x<p.n;x++){
 const b=[west+x*dlon,south+y*dlat,west+(x+1)*dlon,south+(y+1)*dlat],cell=bboxPolygon(b);
 const clip=intersect(featureCollection([cell,water]));
 // Strict full-water cells: no display clipping concealing transport through land.
 const wet=!!clip&&area(clip)/area(cell)>1-1e-8;
 mask.push(wet?1:0);cells.push(wet?cell.geometry:null);
 }
 if(!mask.some(Boolean))throw Error('Tidak ada sel air penuh. Perkecil domain atau gunakan grid lebih rapat.');
 return {n:p.n,dx,area:dx*dx,west,south,dlon,dlat,mask,cells,crs:'EPSG:4326',projection:'Local equirectangular at source latitude; maximum radius 20 km'};
}
export function inWater(water,lon,lat){return booleanPointInPolygon(point([lon,lat]),water);}
