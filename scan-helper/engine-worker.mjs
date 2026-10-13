import {runMeasurement} from './engine-runner.mjs';
import {PGlite} from './vendor/pglite/index.js';
import './csv.js';
import './csv-stream.js';
import './model.js';
import './engine-core.js';

let running=false;
const progress=(stage,percent,text,query)=>self.postMessage({type:'progress',stage,percent,text,query});
async function resource(name){
  const response=await fetch(new URL('./vendor/pglite/'+name,import.meta.url));
  if(!response.ok)throw new Error('측정 엔진 파일을 읽지 못했어요. 압축을 모두 풀고 실행.cmd로 열어 주세요.');
  return response;
}
self.onmessage=async event=>{
  if(running)return;running=true;let pg;
  try{
    const {file}=event.data,config=ScanEngineCore.validateSpec(event.data.config);
    if(!(file instanceof Blob)||file.size>ScanCSVStream.LIMITS.bytes)throw new Error('지원 범위의 CSV를 다시 선택하세요.');
    progress('engine',0,'앱 안의 PostgreSQL 측정 엔진을 준비하고 있어요.');
    const [wasm,init,fs]=await Promise.all([resource('pglite.wasm'),resource('initdb.wasm'),resource('pglite.data')]);
    const [pgliteWasmModule,initdbWasmModule,fsBundle]=await Promise.all([WebAssembly.compile(await wasm.arrayBuffer()),WebAssembly.compile(await init.arrayBuffer()),fs.blob()]);
    pg=await PGlite.create({dataDir:'memory://',pgliteWasmModule,initdbWasmModule,fsBundle});
    const {seq,index,serverVersion,cost}=await runMeasurement(pg,file,config,progress);
    await pg.close();pg=null;
    progress('done',100,'측정을 마쳤어요. 두 방법의 실제 실행 시간을 비교합니다.');
    self.postMessage({type:'done',seq,index,serverVersion,cost,engineVersion:ScanEngineCore.VERSION});
  }catch(error){
    if(pg){try{await pg.close();}catch(_){}}
    self.postMessage({type:'error',message:'측정을 완료하지 못했어요. 파일과 설정을 확인하거나 더 작은 파일로 다시 시도하세요.',detail:error instanceof Error?error.message:'측정 엔진 오류'});
  }
};
