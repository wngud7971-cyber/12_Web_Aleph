(function(root){
  'use strict';
  const LIMITS={bytes:500*1024*1024,rows:1000000,columns:30,cell:2000,chunk:256*1024,values:100};
  const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const conservative=/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/;
  const integer=/^[+-]?(?:0|[1-9]\d*)$/;
  function aborted(signal){if(signal?.aborted){const error=new Error('작업을 취소했어요.');error.name='AbortError';throw error;}}
  function checkCell(value){
    if((value.length>LIMITS.cell&&[...value].length>LIMITS.cell)||/[\u0000\ud800-\udfff]/u.test(value))throw new Error('셀에는 NUL·잘못된 유니코드 없이 최대 2,000자까지 넣을 수 있어요.');
  }
  function createParser(delimiter,onRow,onBlank){
    if(![',','\t',';'].includes(delimiter))throw new Error('쉼표·탭·세미콜론 구분자를 선택하세요.');
    let row=[],field='',quoted=false,state='start',skipLF=false;
    function fieldEnd(){checkCell(field);row.push(field===''&&!quoted?null:field);if(row.length>LIMITS.columns)throw new Error('컬럼은 최대 30개까지 지원해요.');field='';quoted=false;state='start';}
    function rowEnd(){fieldEnd();if(row.length===1&&row[0]===null)onBlank?.();else onRow(row);row=[];}
    function feed(text){
      for(let i=0;i<text.length;i++){
        const c=text[i];
        if(skipLF){skipLF=false;if(c==='\n')continue;}
        if(state==='quoted'){
          if(c==='"')state='afterQuote';else field+=c;
        }else if(state==='afterQuote'&&c==='"'){field+='"';state='quoted';}
        else if(c===delimiter)fieldEnd();
        else if(c==='\r'||c==='\n'){rowEnd();skipLF=c==='\r';}
        else if(state==='afterQuote')throw new Error('닫힌 큰따옴표 뒤에는 구분자나 줄바꿈이 와야 해요.');
        else if(c==='"'){if(state!=='start')throw new Error('필드 안의 큰따옴표는 두 겹 큰따옴표 형식으로 감싸 주세요.');state='quoted';quoted=true;}
        else {field+=c;state='unquoted';}
        if(field.length>LIMITS.cell*2)throw new Error('셀은 최대 2,000자까지 지원해요.');
      }
    }
    function finish(){if(state==='quoted')throw new Error('닫히지 않은 큰따옴표가 있어요.');if(field!==''||quoted||row.length)rowEnd();}
    return {feed,finish};
  }
  function headerDelimiter(text,final){
    let inside=false,started=false;const counts=new Map([[',',0],['\t',0],[';',0]]);
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(!started&&(c==='\r'||c==='\n'))continue;
      started=true;
      if(c==='"'){if(inside&&text[i+1]==='"')i++;else inside=!inside;}
      else if(!inside&&(c==='\r'||c==='\n'))return [...counts].sort((a,b)=>b[1]-a[1])[0][0];
      else if(!inside&&counts.has(c))counts.set(c,counts.get(c)+1);
    }
    if(final&&!inside&&started)return [...counts].sort((a,b)=>b[1]-a[1])[0][0];
    if(text.length>LIMITS.cell*2*LIMITS.columns+2*LIMITS.columns)throw new Error('컬럼 제목이 너무 길거나 큰따옴표가 닫히지 않았어요.');
    return null;
  }
  async function scan(file,delimiter='auto',options={}){
    if(!file||!Number.isSafeInteger(file.size)||file.size<1)throw new Error('내용이 있는 UTF-8 CSV를 선택하세요.');
    if(file.size>LIMITS.bytes)throw new Error('파일은 최대 500MB까지 지원해요.');
    if(delimiter!=='auto'&&![',','\t',';'].includes(delimiter))throw new Error('CSV 구분자를 확인하세요.');
    const chunk=options.chunkSize||LIMITS.chunk;
    if(!Number.isInteger(chunk)||chunk<1||chunk>1024*1024)throw new Error('파일 읽기 크기가 올바르지 않아요.');
    const decoder=new TextDecoder('utf-8',{fatal:true});
    let headers=null,totalRows=0,blankRows=0,copyTerminator=false,prefix='',parser=null,chosen=delimiter==='auto'?null:delimiter,first=true;
    const rowReceived=row=>{
      if(!headers){headers=row.map(v=>v??'');return;}
      if(row.length!==headers.length)throw new Error((totalRows+1)+'번째 데이터 행의 컬럼 수가 제목과 달라요.');
      if(++totalRows>LIMITS.rows)throw new Error('데이터는 최대 100만 행까지 지원해요.');
      if(row.length===1&&row[0]==='\\.')copyTerminator=true;
      options.onRow?.(row,totalRows,headers);
    };
    function consume(text,final=false){
      if(first&&text){text=text.replace(/^\ufeff/,'');first=false;}
      if(!parser){prefix+=text;if(!chosen)chosen=headerDelimiter(prefix,final);if(!chosen)return;parser=createParser(chosen,rowReceived,()=>blankRows++);parser.feed(prefix);prefix='';}
      else parser.feed(text);
    }
    for(let offset=0;offset<file.size;offset+=chunk){
      aborted(options.signal);
      const end=Math.min(file.size,offset+chunk),buffer=await file.slice(offset,end).arrayBuffer();
      aborted(options.signal);
      let text;try{text=decoder.decode(buffer,{stream:true});}catch(error){throw new Error('UTF-8 CSV로 저장한 뒤 다시 선택해 주세요.');}
      consume(text);
      await options.onChunk?.({read:end,total:file.size,rows:totalRows});
      options.onProgress?.({read:end,total:file.size,rows:totalRows});
      if(options.yield!==false)await new Promise(resolve=>setTimeout(resolve,0));
    }
    aborted(options.signal);
    let tail;try{tail=decoder.decode();}catch(error){throw new Error('UTF-8 CSV로 저장한 뒤 다시 선택해 주세요.');}
    consume(tail,true);parser?.finish();aborted(options.signal);
    await options.onChunk?.({read:file.size,total:file.size,rows:totalRows,final:true});
    if(!headers||totalRows<2)throw new Error('첫 줄 제목과 데이터 2행 이상이 필요해요.');
    return {headers,totalRows,delimiter:chosen,blankRows,copyTerminator};
  }
  async function analyze(file,delimiter='auto',options={}){
    const preview=[],stats=[],encoder=new TextEncoder();
    const result=await scan(file,delimiter,{...options,onRow:(row,n,headers)=>{
      if(n===1)headers.forEach(()=>stats.push({empty:0,nonnull:0,integerInference:true,numericInference:true,integerAllowed:true,numericAllowed:true,longText:false,longNumeric:false}));
      if(n<=5)preview.push(row);
      row.forEach((value,i)=>{
        const s=stats[i];if(value===null){s.empty++;return;}s.nonnull++;
        const numeric=(s.numericInference||s.numericAllowed||s.integerAllowed)&&decimal.test(value);
        if(s.integerAllowed){const number=Number(value);s.integerAllowed=Boolean(numeric&&Number.isInteger(number)&&number>=-2147483648&&number<=2147483647);}
        if(s.numericAllowed)s.numericAllowed=Boolean(numeric);
        if(s.integerInference)s.integerInference=s.integerAllowed&&integer.test(value);
        if(s.numericInference)s.numericInference=Boolean(numeric&&conservative.test(value));
        if(!s.longText&&value.length>666)s.longText=encoder.encode(value).length>2000;
        if(!s.longNumeric&&numeric&&value.length>1000)s.longNumeric=root.ScanCSV.typed(value,'NUMERIC').replace(/[-.]/g,'').length>1000;
      });
      options.onRow?.(row,n,headers);
    }});
    const columns=result.headers.map((header,index)=>({header,index,name:'c_'+(index+1),type:!stats[index].nonnull?'TEXT':stats[index].integerInference?'INTEGER':stats[index].numericInference?'NUMERIC':'TEXT'}));
    const warnings=[];
    if(result.headers.some(h=>!h.trim())||new Set(result.headers).size!==result.headers.length)warnings.push('빈 제목·중복 제목은 컬럼 번호로 구분합니다.');
    if(result.totalRows<1000)warnings.push('작은 테이블의 결과를 큰 데이터의 성능으로 일반화하지 마세요.');
    return {...result,columns,rows:preview,stats,warnings,file,streaming:true};
  }
  function validateTypes(dataset,types){
    if(!Array.isArray(types)||types.length!==dataset.columns.length||types.some(t=>!['INTEGER','NUMERIC','TEXT'].includes(t)))throw new Error('모든 컬럼의 자료형을 확인하세요.');
    types.forEach((type,i)=>{const s=dataset.stats[i];if((type==='INTEGER'&&!s.integerAllowed)||(type==='NUMERIC'&&!s.numericAllowed))throw new Error(dataset.columns[i].name+' 컬럼을 '+type+'형으로 읽을 수 없는 값이 있어요.');});
  }
  function columnCheck(dataset,index,type){
    index=Number(index);if(!Number.isInteger(index)||index<0||index>=dataset.columns.length)throw new Error('조회할 컬럼을 선택하세요.');
    if(!['INTEGER','NUMERIC','TEXT'].includes(type))throw new Error('조회할 컬럼의 자료형을 확인하세요.');
    if(type==='INTEGER'&&!dataset.stats[index].integerAllowed||type==='NUMERIC'&&!dataset.stats[index].numericAllowed)throw new Error('이 컬럼을 선택한 숫자형으로 읽을 수 없어요. 자료형을 확인하세요.');
    return index;
  }
  async function profile(dataset,index,type,options={}){
    index=columnCheck(dataset,index,type);const counts=new Map();let hasMore=false;
    const result=await scan(dataset.file,dataset.delimiter,{...options,onRow:row=>{
      const value=root.ScanCSV.typed(row[index],type);
      if(counts.has(value))counts.set(value,counts.get(value)+1);
      else if(counts.size<LIMITS.values)counts.set(value,1);
      else hasMore=true;
    }});
    if(result.totalRows!==dataset.totalRows)throw new Error('파일의 행 수가 바뀌었어요. 파일을 다시 선택하세요.');
    return {entries:[...counts].map(([value,count])=>({value,count})).sort((a,b)=>b.count-a.count),hasMore};
  }
  async function lookup(dataset,options,scanOptions={}){
    const index=columnCheck(dataset,options.column,options.types?.[Number(options.column)]),type=options.types[index];
    const target=options.nullValue?null:root.ScanCSV.typed(options.target,type);let matches=0;
    const result=await scan(dataset.file,dataset.delimiter,{...scanOptions,onRow:row=>{if(root.ScanCSV.typed(row[index],type)===target)matches++;}});
    if(result.totalRows!==dataset.totalRows)throw new Error('파일의 행 수가 바뀌었어요. 파일을 다시 선택하세요.');
    return {total:dataset.totalRows,matches,target,columnLabel:dataset.columns[index].header||'제목 없음',columnNumber:index+1};
  }
  function literal(value){return "E'"+value.replace(/\\/g,'\\\\').replace(/'/g,"''")+"'";}
  function generateImport(dataset,options){
    const types=options.types,index=columnCheck(dataset,options.column,types?.[Number(options.column)]),repeats=Number(options.repeats),matched=Number(options.matches);
    validateTypes(dataset,types);
    if(dataset.blankRows)throw new Error('대용량 DB 가져오기는 빈 줄이 없는 CSV가 필요해요. 원본의 빈 줄을 제거한 뒤 다시 선택하세요.');
    if(dataset.copyTerminator)throw new Error('한 컬럼 전체 행이 역슬래시와 점인 값은 psql 가져오기를 중단할 수 있어요. 이 CSV는 현재 가져오기 범위에 포함되지 않습니다.');
    if(!Number.isSafeInteger(matched)||matched<1||matched>dataset.totalRows)throw new Error('찾을 조건의 행 수를 먼저 확인하세요. 0행인 조건은 실험할 수 없어요.');
    if(!Number.isInteger(repeats)||repeats<2||repeats>30)throw new Error('반복 횟수는 2~30회여야 해요.');
    if(typeof options.experimentId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(options.experimentId))throw new Error('실험 식별 정보가 올바르지 않아요.');
    const type=types[index],s=dataset.stats[index];
    if(type==='TEXT'&&s.longText||type==='NUMERIC'&&s.longNumeric)throw new Error('조회할 컬럼에 인덱스 실습 범위보다 긴 값이 있어요. 다른 컬럼을 선택하세요.');
    const target=options.nullValue?null:root.ScanCSV.typed(options.target,type),column=dataset.columns[index];
    const predicate=column.name+(target===null?' IS NULL':' = '+(type==='TEXT'?literal(target):target)),query='SELECT * FROM pg_temp.scanlab_practice WHERE '+predicate;
    const delimiter=dataset.delimiter==='\t'?"E'\\t'":literal(dataset.delimiter);
    const setup=`-- 대용량 CSV용 · psql에서 실행하세요. pgAdmin의 일반 SQL 창은 역슬래시 명령을 실행하지 않습니다.
-- 선택한 원본 CSV를 scanlab-input.csv로 저장하고 SQL과 같은 폴더에 두세요.
-- 이 스크립트는 클라이언트의 원본 CSV를 읽습니다. 원본 행을 복제하거나 본문에 붙여 넣지 않습니다.
\\set ON_ERROR_STOP on
\\encoding UTF8
BEGIN;
DROP TABLE IF EXISTS pg_temp.scanlab_practice;
DROP TABLE IF EXISTS pg_temp.scanlab_measurements;
CREATE TEMP TABLE scanlab_practice (
  scanlab_row_id bigint GENERATED ALWAYS AS IDENTITY,
${dataset.columns.map((c,i)=>'  '+c.name+' '+types[i]+(types[i]==='TEXT'?' COLLATE "C"':'')).join(',\n')}
) ON COMMIT PRESERVE ROWS;
\\copy pg_temp.scanlab_practice (${dataset.columns.map(c=>c.name).join(', ')}) FROM 'scanlab-input.csv' WITH (FORMAT csv, HEADER true, DELIMITER ${delimiter}, ENCODING 'UTF8')
CREATE INDEX scanlab_value_idx ON pg_temp.scanlab_practice (${column.name});
ANALYZE pg_temp.scanlab_practice;
CREATE TEMP TABLE scanlab_measurements (method text NOT NULL, repeat_index integer NOT NULL, plan jsonb NOT NULL) ON COMMIT PRESERVE ROWS;
COMMIT;
SELECT count(*) AS total_rows, count(*) FILTER (WHERE ${predicate}) AS matched_rows,
       round(100.0 * count(*) FILTER (WHERE ${predicate}) / count(*), 4) AS actual_selectivity_pct
FROM pg_temp.scanlab_practice;`;
    const {measure}=root.ScanPractice.measurementSQL(query,repeats);
    const bundle=method=>`SELECT jsonb_pretty(jsonb_build_object(
  'scanlab', jsonb_build_object('version', 1, 'experiment_id', ${literal(options.experimentId)},
    'method', '${method}', 'column', '${column.name}', 'sql_type', '${type}',
    'total_rows', (SELECT count(*) FROM pg_temp.scanlab_practice),
    'matched_rows', (SELECT count(*) FROM pg_temp.scanlab_practice WHERE ${predicate}),
    'server_version', current_setting('server_version')),
  'runs', jsonb_agg(plan ORDER BY repeat_index)))
FROM pg_temp.scanlab_measurements WHERE method = '${method}';`;
    const results=`-- 2개의 JSON 파일을 현재 폴더에 저장합니다. 동일 이름의 이전 결과를 덮어씁니다.
\\pset format unaligned
\\pset tuples_only on
\\pset pager off
\\o scanlab-seq.json
${bundle('seq')}
\\o scanlab-index.json
${bundle('index')}
\\o`;
    return {type:'csv',label:'내 CSV 데이터',total:dataset.totalRows,matches:matched,actualPercent:matched/dataset.totalRows*100,repeats,column:column.name,columnNumber:index+1,columnLabel:column.header||'제목 없음',sqlType:type,experimentId:options.experimentId,importMode:true,query,setup,measure,results,sql:[setup,measure,results].join('\n\n')};
  }
  root.ScanCSVStream={LIMITS,createParser,scan,analyze,profile,lookup,validateTypes,generateImport};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ScanCSVStream;
})(typeof globalThis!=='undefined'?globalThis:this);
