import './csv.js';
import './csv-stream.js';
import './model.js';
import './engine-core.js';

export async function runMeasurement(pg,file,input,onProgress=()=>{}){
  const config=ScanEngineCore.validateSpec(input);
  const progress=onProgress;
    const definitions=config.types.map((type,i)=>'c_'+(i+1)+' '+type+(type==='TEXT'?' COLLATE "C"':'')).join(', ');
    await pg.exec('CREATE TEMP TABLE scanlab_practice (scanlab_row_id bigint GENERATED ALWAYS AS IDENTITY, '+definitions+');');
    const names=config.types.map((_,i)=>'c_'+(i+1)).join(', ');
    const copy="COPY pg_temp.scanlab_practice ("+names+") FROM '/dev/blob' WITH (FORMAT csv, ENCODING 'UTF8')";
    let batch=[],batchLength=0,imported=0;
    async function flush(){
      if(!batch.length)return;
      const blob=new Blob(batch,{type:'text/csv;charset=utf-8'});batch=[];batchLength=0;
      await pg.query(copy,[],{blob});
    }
    progress('import',5,'선택한 CSV 전체를 앱 안의 DB로 가져오고 있어요.');
    const scanned=await ScanCSVStream.scan(file,config.delimiter,{yield:false,onRow:row=>{const line=ScanEngineCore.encodeRow(row,config.types);batch.push(line);batchLength+=line.length;imported++;},onChunk:async info=>{
      if(batchLength>=512*1024||info.final)await flush();
      progress('import',5+info.read/info.total*50,'원본 '+imported.toLocaleString('ko-KR')+'행 가져오는 중');
    }});
    if(scanned.totalRows!==config.total)throw new Error('선택한 CSV의 행 수가 바뀌었어요. 다시 선택해 주세요.');
    progress('index',57,'조회 항목의 인덱스를 만들고 통계를 준비하고 있어요.');
    const buildStart=performance.now();
    await pg.exec('CREATE INDEX scanlab_value_idx ON pg_temp.scanlab_practice ('+config.column+');');
    const cost={buildMs:performance.now()-buildStart,indexBytes:null,tableBytes:null};
    // Statistics preparation and size inspection are excluded from index creation time.
    await pg.exec('ANALYZE pg_temp.scanlab_practice;');
    try{
      const sizes=await pg.query("SELECT pg_relation_size('pg_temp.scanlab_value_idx'::regclass) AS index_bytes, pg_table_size('pg_temp.scanlab_practice'::regclass) AS table_bytes");
      for(const [key,field] of [['indexBytes','index_bytes'],['tableBytes','table_bytes']]){const value=sizes.rows[0]?.[field];if(value!=null&&Number.isSafeInteger(Number(value))&&Number(value)>=0)cost[key]=Number(value);}
    }catch(_){ /* Size inspection is optional and must not stop the existing measurement. */ }
    progress('check',59,'DB에서도 전체 행 수와 조회 행 수를 확인하고 있어요.');
    const counts=await pg.query('SELECT count(*) AS total_rows, count(*) FILTER (WHERE '+config.predicate+') AS matched_rows FROM pg_temp.scanlab_practice',config.params);
    if(Number(counts.rows[0].total_rows)!==config.total||Number(counts.rows[0].matched_rows)!==config.matches)throw new Error('DB에서 센 행 수가 CSV 조건과 달라요. 자료형과 조회값을 확인해 주세요.');
    const serverVersion=(await pg.query('SHOW server_version')).rows[0].server_version;
    const runs={seq:[],index:[]};
    await pg.exec('BEGIN; SET LOCAL max_parallel_workers_per_gather=0; SET LOCAL jit=off; SET LOCAL enable_bitmapscan=off; SET LOCAL enable_indexonlyscan=off;');
    for(let round=0;round<=config.repeats;round++){
      const order=round%2===0?['seq','index']:['index','seq'];
      for(const method of order){
        progress('measure',60+(round*2+order.indexOf(method))/(2*(config.repeats+1))*38,round===0?'측정에서 제외할 준비 실행 중':(method==='seq'?'순차':'인덱스')+' 스캔 '+round+'/'+config.repeats+'회 실제 실행 중',{method});
        await pg.query("SELECT set_config('enable_seqscan',$1,true), set_config('enable_indexscan',$2,true)",[method==='seq'?'on':'off',method==='index'?'on':'off']);
        const result=await pg.query('EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) '+config.query,config.params);
        const plan=result.rows[0]['QUERY PLAN'][0];
        if(plan.Plan?.['Node Type']!==(method==='seq'?'Seq Scan':'Index Scan')||Number(plan.Plan?.['Actual Rows'])!==config.matches)throw new Error('실행 계획이 요청한 스캔 방식 또는 조회 행 수와 달라요. 이번 측정은 비교하지 않습니다.');
        if(round>0)runs[method].push(plan);
      }
    }
    await pg.exec('COMMIT;');
    const seq=ScanEngineCore.envelope(config,'seq',runs.seq,serverVersion),index=ScanEngineCore.envelope(config,'index',runs.index,serverVersion);
    ScanLab.parseInput(JSON.stringify(seq),'seq');ScanLab.parseInput(JSON.stringify(index),'index');
  return {seq,index,serverVersion,cost};
}
