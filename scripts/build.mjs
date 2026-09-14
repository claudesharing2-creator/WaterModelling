import {build} from 'esbuild';
import {mkdir,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true}); await mkdir('dist',{recursive:true});
await build({entryPoints:['src/app.js','src/worker.js'],outdir:'dist',bundle:true,format:'esm',target:'es2022',minify:true,loader:{'.png':'file'},assetNames:'assets/[name]-[hash]'});
await cp('index.html','dist/index.html'); await cp('src/style.css','dist/style.css');
await cp('node_modules/leaflet/dist/leaflet.css','dist/leaflet.css');
await cp('node_modules/leaflet/dist/images','dist/images',{recursive:true});
await cp('docs','dist/docs',{recursive:true});
console.log('Static site ready: dist/ (relative URLs, GitHub project Pages compatible).');
