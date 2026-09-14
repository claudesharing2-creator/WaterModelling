import {simulate} from './engine.js';
self.onmessage=({data})=>{try{const result=simulate(data.p,data.grid,data.forcing,progress=>self.postMessage({progress}));self.postMessage({result});}catch(e){self.postMessage({error:e.message});}};
