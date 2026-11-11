import {defineConfig} from 'vite';
export default defineConfig({
 server:{host:'127.0.0.1',port:5173,strictPort:true,fs:{allow:['..']},proxy:{'/api':{target:'http://127.0.0.1:8788',changeOrigin:false}}},
 preview:{host:'127.0.0.1',port:5173},
 build:{
  rollupOptions:{
   output:{
    manualChunks(id){
     if(id.includes('node_modules/react')) return 'react-vendor';
     return undefined;
    }
   }
  }
 }
});
