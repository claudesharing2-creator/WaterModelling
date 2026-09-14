// Finite-volume mass transport on equal-area local Cartesian cells.
// Authoritative result is incremental source mass; background is a display reference.
export const VERSION='screening-fvm-0.1.0';
export const MODELS={
 tracer:{label:'Tracer konservatif',unit:'mg/L',description:'Zat terlarut tanpa reaksi. R = 0.'},
 decay:{label:'Zat terlarut — peluruhan orde 1',unit:'mg/L',description:'Peluruhan efektif: R = −kC. Masukkan k untuk zat dan kondisi yang dimodelkan.'},
 tss:{label:'TSS — pengendapan sederhana',unit:'mg/L',description:'Pengendapan: R = −(ws/h)C. Belum mencakup erosi, flokulasi, atau resuspensi.'},
 oil:{label:'Minyak permukaan — transport awal',unit:'g/m²',description:'Transport massa permukaan dengan windage. Belum OpenOil: tanpa evaporasi, emulsifikasi, droplet, atau beaching.'}
};
export function number(v,name,min=-Infinity,max=Infinity){if(v===''||v===null||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)throw Error(name+' tidak valid ('+min+' sampai '+max+').');return Number(v);}
export function validate(p){
 if(!MODELS[p.model])throw Error('Model belum didukung.');
 for(const [k,min,max] of [['lat',-80,80],['lon',-180,180],['radius',250,20000],['hours',.25,168],['depth',.1,1000],['diffusion',0,500],['mass',0,1e9],['flow',0,1e5],['concentration',0,1e7],['releaseHours',.001,168],['decay',0,100],['settling',0,1000],['windage',0,.1],['background',0,1e7]])number(p[k],k,min,max);
 if(!['pulse','continuous'].includes(p.release))throw Error('Tipe sumber tidak valid.');
 if(!['global','manual','csv'].includes(p.forcingMode))throw Error('Mode arus tidak valid.');
 if(!['marine','inland'].includes(p.waterType))throw Error('Jenis perairan tidak valid.');
 if(!Number.isInteger(p.n)||p.n<16||p.n>80)throw Error('Grid harus 16–80.');
 if(!Number.isFinite(Date.parse(p.start)))throw Error('Waktu tidak valid.');
 if(p.model==='oil'&&p.release==='continuous')throw Error('Minyak versi ini menggunakan pelepasan massa sesaat.');
 if(p.release==='pulse'&&p.mass<=0)throw Error('Massa harus lebih dari nol.');
 if(p.release==='continuous'&&p.flow*p.concentration<=0)throw Error('Debit dan konsentrasi sumber harus lebih dari nol.');
 return p;
}
export function validateForcing(series,p){
 const start=Date.parse(p.start)/1000,end=start+p.hours*3600;
 if(!Array.isArray(series)||series.length<2)throw Error('Data arus minimal dua waktu.');
 for(let i=0;i<series.length;i++){
 const r=series[i];for(const k of ['t','u','v'])number(r[k],k);
 if(Math.hypot(r.u,r.v)>10)throw Error('Arus >10 m/s di luar rentang screening.');
 if(p.model==='oil'&&p.windage>0)for(const k of ['wu','wv'])number(r[k],k,-100,100);
 if(i&&(r.t<=series[i-1].t||r.t-series[i-1].t>10800))throw Error('Waktu arus harus berurutan, tanpa celah >3 jam.');
 }
 if(series[0].t>start||series.at(-1).t<end)throw Error('Data arus tidak mencakup seluruh simulasi.');
}
export function atTime(rows,t){
 let lo=0,hi=rows.length-1;while(hi-lo>1){const m=(hi+lo)>>1;if(rows[m].t<=t)lo=m;else hi=m;}
 const a=rows[lo],b=rows[hi],q=Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t)));
 const mix=k=>Number.isFinite(a[k])&&Number.isFinite(b[k])?a[k]+q*(b[k]-a[k]):null;
 return {u:mix('u'),v:mix('v'),wu:mix('wu'),wv:mix('wv')};
}
export function gridIndex(g,lon,lat){
 const x=(lon-g.west)/g.dlon,y=(lat-g.south)/g.dlat;
 if(x<0||y<0||x>=g.n||y>=g.n)return -1;
 return Math.floor(y)*g.n+Math.floor(x);
}
export function valueOf(m,p,g){return p.model==='oil'?m/g.area*1000:m/(g.area*p.depth)*1000;}
export function simulate(p,g,forcing,progress=()=>{}){
 validate(p);validateForcing(forcing,p);
 const n=g.n,len=n*n,mask=g.mask,source=gridIndex(g,p.lon,p.lat);
 if(source<0||!mask[source])throw Error('Sumber tidak berada dalam sel air aktif. Periksa batas air atau tingkatkan resolusi.');
 const dx=g.dx,area=g.area; let mass=new Float64Array(len);
 let injected=0,escaped=0,decayed=0,settled=0,t=0,steps=0;
 if(p.release==='pulse'){mass[source]=p.mass;injected=p.mass;}
 const rate=p.release==='continuous'?p.flow*p.concentration/1000:0;
 const k=p.model==='decay'?p.decay/86400:0,ks=p.model==='tss'?p.settling/86400/p.depth:0;
 const edges=[];
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
 const a=j*n+i;if(!mask[a])continue;
 if(i<n-1&&mask[a+1])edges.push([a,a+1,1,0]);
 if(j<n-1&&mask[a+n])edges.push([a,a+n,0,1]);
 // Only bounding box edges are open; all masked interfaces are impermeable.
 if(i===0)edges.push([a,-1,-1,0]);if(i===n-1)edges.push([a,-1,1,0]);
 if(j===0)edges.push([a,-1,0,-1]);if(j===n-1)edges.push([a,-1,0,1]);
 }
 const frames=[],start=Date.parse(p.start)/1000,total=p.hours*3600,output=total/48;
 const snapshot=()=>{
 const values=Array.from(mass,(m,i)=>mask[i]?valueOf(m,p,g):null);
 let active=0;for(const m of mass)active+=m;
 frames.push({seconds:t,values,budget:{injected,active,escaped,decayed,settled,error:injected-active-escaped-decayed-settled}});
 };
 snapshot();
 for(let frame=1;frame<=48;frame++){
 const target=frame*output;
 while(t<target-1e-7){
 if(++steps>150000)throw Error('Skenario terlalu berat. Kurangi durasi/resolusi atau koefisien dispersi.');
 const v=atTime(forcing,start+t);
 const u=v.u+(p.model==='oil'?p.windage*(v.wu||0):0),w=v.v+(p.model==='oil'?p.windage*(v.wv||0):0);
 // Positivity bound includes all possible outgoing advection and diffusion.
 const lambda=(Math.abs(u)+Math.abs(w))/dx+4*p.diffusion/(dx*dx);
 let dt=Math.min(target-t,60,lambda?0.45/lambda:60);
 if(p.release==='continuous'&&t<p.releaseHours*3600)dt=Math.min(dt,p.releaseHours*3600-t);
 const add=rate*Math.max(0,Math.min(dt,p.releaseHours*3600-t));mass[source]+=add;injected+=add;
 const delta=new Float64Array(len);
 for(const [a,b,nx,ny] of edges){
 const vel=u*nx+w*ny;
 if(b>=0){
 const flux=(vel>=0?vel*mass[a]:vel*mass[b])/dx+p.diffusion*(mass[a]-mass[b])/(dx*dx);
 const dm=flux*dt;delta[a]-=dm;delta[b]+=dm;
 }else if(vel>0){const dm=vel*mass[a]/dx*dt;delta[a]-=dm;escaped+=dm;}
 }
 for(let i=0;i<len;i++)if(mask[i]){
 const adv=mass[i]+delta[i];
 if(adv< -1e-8||!Number.isFinite(adv))throw Error('Ketidakstabilan numerik. Simulasi dihentikan.');
 mass[i]=Math.max(0,adv);
 if(k+ks){const lost=mass[i]*(-Math.expm1(-(k+ks)*dt));mass[i]-=lost;decayed+=lost*k/(k+ks);settled+=lost*ks/(k+ks);}
 }
 t+=dt;
 }
 snapshot();progress(frame/48);
 }
 return {version:VERSION,frames,steps};
}
