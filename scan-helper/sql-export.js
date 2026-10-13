(function(root){
  'use strict';
  const FALLBACK_LIMIT=64*1024*1024;
  function validate(dataset,types){
    if(!dataset||!Array.isArray(types)||types.length!==dataset.columns.length||types.length<1||types.length>30||types.some(t=>!['INTEGER','NUMERIC','TEXT'].includes(t)))throw new Error('CSV와 모든 컬럼의 자료형을 확인하세요.');
    if(dataset.streaming)root.ScanCSVStream.validateTypes(dataset,types);
    else dataset.rows.forEach(row=>row.forEach((v,i)=>root.ScanCSV.typed(v,types[i])));
  }
  function literal(value,type='TEXT'){
    const typed=root.ScanCSV.typed(value,type);
    return typed===null?'NULL':type==='TEXT'?"E'"+typed.replace(/\\/g,'\\\\').replace(/'/g,"''")+"'":typed;
  }
  function identifier(value){
    if(typeof value!=='string'||!value.trim()||/[\x00-\x1f\x7f]/.test(value))throw new Error('이름은 비어 있거나 줄바꿈·제어 문자를 포함할 수 없어요.');
    const name=value.trim();if(new TextEncoder().encode(name).length>63)throw new Error('테이블·컬럼 이름은 UTF-8 기준 63바이트 이내로 입력하세요. 한글은 보통 한 글자에 3바이트예요.');
    return '"'+name.replace(/"/g,'""')+'"';
  }
  function schema(types,input){
    if(input===undefined)return {relation:'pg_temp.scanlab_practice',createName:'scanlab_practice',temporary:true,names:types.map((_,i)=>'c_'+(i+1)),indexName:i=>'scanlab_value_c_'+(i+1)+'_idx'};
    if(!input||typeof input.temporary!=='boolean'||!Array.isArray(input.columnNames)||input.columnNames.length!==types.length)throw new Error('SQL 저장 설정의 모든 컬럼을 확인하세요.');
    const tableName=identifier(input.tableName),names=input.columnNames.map(identifier),plain=input.columnNames.map(n=>n.trim());
    if(new Set(plain).size!==plain.length||plain.includes('scanlab_row_id'))throw new Error('컬럼 이름이 중복됐어요. scanlab_row_id는 앱이 만드는 행 번호이므로 다른 이름을 사용하세요.');
    return {relation:(input.temporary?'pg_temp.':'public.')+tableName,createName:input.temporary?tableName:'public.'+tableName,temporary:input.temporary,names,indexName:i=>identifier('scanlab_'+(i+1)+'_'+hash(JSON.stringify([input.tableName.trim(),plain[i]]))+'_idx')};
  }
  function hash(value){let n=2166136261;for(const c of new TextEncoder().encode(value)){n^=c;n=Math.imul(n,16777619);}return (n>>>0).toString(16);}
  function suggestNames(dataset){
    const used=new Set(['scanlab_row_id']),encoder=new TextEncoder();
    return dataset.columns.map((column,i)=>{
      const initial=(column.header||'c_'+(i+1)).replace(/[\x00-\x1f\x7f]/g,'_').trim()||'c_'+(i+1);
      const fit=(name,suffix='')=>{const chars=[...name];while(encoder.encode(chars.join('')+suffix).length>63)chars.pop();return chars.join('')+suffix;};
      let name=fit(initial),n=1;while(used.has(name))name=fit(initial,'_'+(++n));used.add(name);return name;
    });
  }
  function table(dataset,types,input){
    validate(dataset,types);
    const s=schema(types,input);
    return 'CREATE '+(s.temporary?'TEMP ':'')+'TABLE '+s.createName+' (\n  scanlab_row_id bigint GENERATED ALWAYS AS IDENTITY,\n'+types.map((type,i)=>'  '+s.names[i]+' '+type+(type==='TEXT'?' COLLATE "C"':'')).join(',\n')+'\n)'+(s.temporary?' ON COMMIT PRESERVE ROWS':'')+';';
  }
  function queries(dataset,options){
    const types=options.types,create=table(dataset,types,options.schema),s=schema(types,options.schema),index=Number(options.column);
    if(!Number.isInteger(index)||index<0||index>=types.length)throw new Error('조회할 항목을 선택하세요.');
    const name=s.names[index],target=options.nullValue?null:root.ScanCSV.typed(options.target,types[index]);
    const predicate=name+(target===null?' IS NULL':' = '+literal(target,types[index]));
    const select='SELECT * FROM '+s.relation+' WHERE '+predicate+';';
    const indexSQL='CREATE INDEX IF NOT EXISTS '+s.indexName(index)+' ON '+s.relation+' ('+name+');\nANALYZE '+s.relation+';';
    const scan=method=>'-- CSV 전체 SQL을 먼저 실행하고, 같은 연결에서 사용하세요.\n'+indexSQL+'\nBEGIN;\nSET LOCAL max_parallel_workers_per_gather = 0;\nSET LOCAL jit = off;\nSET LOCAL enable_bitmapscan = off;\nSET LOCAL enable_indexonlyscan = off;\nSET LOCAL enable_seqscan = '+(method==='seq'?'on':'off')+';\nSET LOCAL enable_indexscan = '+(method==='seq'?'off':'on')+';\nEXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON)\n'+select+'\nCOMMIT;';
    return {table:create,index:indexSQL,select,seq:scan('seq'),indexScan:scan('index')};
  }
  function importCommand(dataset,types){
    validate(dataset,types);
    return '-- 앱 안의 PostgreSQL 전용: CSV를 정규화한 작은 묶음을 가상 파일로 전달합니다.\n-- 외부 PostgreSQL에는 CSV 전체 SQL 저장으로 받은 INSERT문을 사용하세요.\nCOPY pg_temp.scanlab_practice ('+types.map((_,i)=>'c_'+(i+1)).join(', ')+") FROM '/dev/blob' WITH (FORMAT csv, ENCODING 'UTF8');";
  }
  async function convert(file,dataset,types,write,options={}){
    validate(dataset,types);
    const s=schema(types,options.schema);
    if(typeof write!=='function')throw new Error('SQL 저장 위치를 확인하세요.');
    const expected=dataset.totalRows||dataset.rows.length,encoder=new TextEncoder();let bytes=0,rowCount=0,batch=[],batchLength=0,pending=[];
    const aborted=()=>{if(options.signal?.aborted)throw new DOMException('SQL 변환을 취소했어요.','AbortError');};
    async function output(text){aborted();bytes+=encoder.encode(text).length;if(options.maxBytes&&bytes>options.maxBytes)throw new Error('이 브라우저의 일반 다운로드 한도(64MiB)를 넘었어요. Chrome·Edge에서 실행.cmd 또는 공개 앱 주소로 열고 저장 위치를 선택해 주세요.');await write(text);aborted();}
    const insert='INSERT INTO '+s.relation+' ('+s.names.join(', ')+') VALUES\n';
    function flushBatch(){if(batch.length){pending.push(insert+batch.join(',\n')+';\n');batch=[];batchLength=0;}}
    await output('-- 스캔랩 CSV 전체 → PostgreSQL SQL · UTF-8\n-- 원본의 모든 데이터 행을 사용합니다. 컬럼 순서와 자료형은 SQL 저장 설정에 따릅니다.\n-- '+(s.temporary?'새 DB 연결에서 실행하세요. 임시 표는 연결 종료 시 사라집니다.':'public 스키마의 일반 표입니다. 기존 표가 있으면 생성이 실패하며 덮어쓰지 않습니다.')+'\n-- CSV의 실제 값이 포함됩니다. 공유 전 공개·예시 데이터인지 확인하세요.\nBEGIN;\n'+table(dataset,types,options.schema)+'\n');
    const scanned=await root.ScanCSVStream.scan(file,dataset.delimiter,{signal:options.signal,onRow:row=>{
      const tuple='('+row.map((value,i)=>literal(value,types[i])).join(', ')+')';batch.push(tuple);batchLength+=tuple.length;rowCount++;
      if(batch.length>=500||batchLength>=256*1024)flushBatch();
    },onChunk:async info=>{
      if(info.final)flushBatch();
      for(const text of pending)await output(text);pending=[];
      options.onProgress?.({...info,bytes});
    }});
    if(scanned.totalRows!==expected||rowCount!==expected)throw new Error('CSV 행 수가 바뀌었어요. 파일을 다시 선택하세요.');
    await output('COMMIT;\n-- 변환한 데이터: '+rowCount+'행\nSELECT count(*) AS imported_rows FROM '+s.relation+';\n');
    return {rows:rowCount,bytes};
  }
  root.ScanSQLExport={validate,literal,identifier,schema,suggestNames,table,queries,importCommand,convert,FALLBACK_LIMIT};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ScanSQLExport;
})(typeof globalThis!=='undefined'?globalThis:this);
