// Minimal little-endian, uncompressed, single-band IEEE Float32 GeoTIFF.
// Baseline TIFF 6.0 IFD + GeoTIFF model transform and EPSG:4326 keys.
// Reader round-trip tests are independent (geotiff.js).
export function writeFloatGeoTIFF(values,width,height,west,north,dlon,dlat){
 if(values.length!==width*height)throw Error('Raster dimensions mismatch.');
 const keys=[1,1,0,3,1024,0,1,2,1025,0,1,1,2048,0,1,4326];
 const entries=[
 [256,4,[width]],[257,4,[height]],[258,3,[32]],[259,3,[1]],[262,3,[1]],
 [273,4,[0]],[277,3,[1]],[278,4,[height]],[279,4,[values.length*4]],
 [284,3,[1]],[339,3,[3]],[33550,12,[dlon,dlat,0]],
 [33922,12,[0,0,0,west,north,0]],[34735,3,keys],[42113,2,'-9999\0']
 ];
 const sizes={2:1,3:2,4:4,12:8};
 let offset=8+2+entries.length*12+4;
 const locations=entries.map(([,type,value])=>{const size=sizes[type]*value.length;if(size<=4)return null;const at=offset;offset+=size;offset=(offset+7)&~7;return at;});
 const pixelOffset=offset;entries.find(e=>e[0]===273)[2][0]=pixelOffset;
 const buffer=new ArrayBuffer(pixelOffset+values.length*4),view=new DataView(buffer);
 view.setUint8(0,73);view.setUint8(1,73);view.setUint16(2,42,true);view.setUint32(4,8,true);view.setUint16(8,entries.length,true);
 entries.forEach(([tag,type,value],i)=>{
 const at=10+i*12;view.setUint16(at,tag,true);view.setUint16(at+2,type,true);view.setUint32(at+4,value.length,true);
 const dest=locations[i]??(at+8);if(locations[i]!==null)view.setUint32(at+8,dest,true);
 for(let j=0;j<value.length;j++){const pos=dest+j*sizes[type];if(type===2)view.setUint8(pos,value.charCodeAt(j));else if(type===3)view.setUint16(pos,value[j],true);else if(type===4)view.setUint32(pos,value[j],true);else view.setFloat64(pos,value[j],true);}
 });
 view.setUint32(10+entries.length*12,0,true);
 for(let i=0;i<values.length;i++)view.setFloat32(pixelOffset+i*4,values[i],true);
 return buffer;
}
