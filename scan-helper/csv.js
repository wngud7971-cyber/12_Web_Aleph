(function(root){
  'use strict';
  const LIMITS={characters:2097152,rows:10000,columns:30,cell:2000};
  const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const conservativeDecimal=/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/;
  function canonicalNumber(raw){
    if(!decimal.test(raw))throw new Error('이 컬럼을 숫자로 읽을 수 없는 값이 있어요. TEXT형으로 바꾸거나 CSV를 수정하세요.');
    let negative=raw[0]==='-',unsigned=raw.replace(/^[+-]/,''),[whole,fraction='']=unsigned.split('.');
    whole=(whole||'0').replace(/^0+(?=\d)/,'');fraction=fraction.replace(/0+$/,'');
    if(whole==='0'&&!fraction)negative=false;
    return (negative?'-':'')+whole+(fraction?'.'+fraction:'');
  }
  function checkCell(value){
    if(value===null)return;
    if([...value].length>LIMITS.cell||/[\u0000\ud800-\udfff]/u.test(value.replace(/[\ud800-\udbff][\udc00-\udfff]/g,'')))throw new Error('셀에는 NUL·잘못된 유니코드 없이 최대 2,000자까지 넣을 수 있어요.');
  }
  function parseDelimited(raw,delimiter){
    const records=[];let row=[],field='',quoted=false,state='start';
    function fieldEnd(){checkCell(field);row.push(field===''&&!quoted?null:field);field='';quoted=false;state='start';if(row.length>LIMITS.columns)throw new Error('컬럼은 최대 30개까지 지원해요.');}
    function rowEnd(){fieldEnd();if(!(row.length===1&&row[0]===null))records.push(row);row=[];if(records.length>LIMITS.rows+1)throw new Error('데이터 행은 최대 10,000개까지 지원해요.');}
    for(let i=0;i<raw.length;i++){
      const c=raw[i];
      if(state==='quoted'){
        if(c==='"'){if(raw[i+1]==='"'){field+='"';i++;}else state='closed';}else field+=c;
        continue;
      }
      if(c===delimiter){fieldEnd();continue;}
      if(c==='\r'||c==='\n'){if(c==='\r'&&raw[i+1]==='\n')i++;rowEnd();continue;}
      if(state==='closed')throw new Error('닫힌 큰따옴표 뒤에는 구분자나 줄바꿈이 와야 해요. CSV 형식을 확인하세요.');
      if(c==='"'){if(state!=='start')throw new Error('필드 안의 큰따옴표는 CSV의 두 겹 큰따옴표 형식으로 감싸 주세요.');state='quoted';quoted=true;continue;}
      field+=c;state='unquoted';
    }
    if(state==='quoted')throw new Error('닫히지 않은 큰따옴표가 있어요. CSV 파일을 확인하세요.');
    if(field!==''||quoted||row.length)rowEnd();
    return records;
  }
  function infer(values){
    const nonnull=values.filter(v=>v!==null);
    if(!nonnull.length)return 'TEXT';
    if(nonnull.every(v=>/^[+-]?(?:0|[1-9]\d*)$/.test(v)&&Number.isInteger(Number(v))&&Number(v)>=-2147483648&&Number(v)<=2147483647))return 'INTEGER';
    if(nonnull.every(v=>conservativeDecimal.test(v)))return 'NUMERIC';
    return 'TEXT';
  }
  function parse(raw,delimiter='auto'){
    if(typeof raw!=='string'||raw.length>LIMITS.characters)throw new Error('CSV는 최대 2MB까지 지원해요.');
    raw=raw.replace(/^\ufeff/,'');if(!raw.trim())throw new Error('CSV 내용이 비어 있어요.');
    let records,chosen=delimiter;
    if(delimiter==='auto'){
      const first=raw.replace(/^(?:\r\n|\r|\n)+/,'');let inside=false;
      const counts=new Map([[',',0],['\t',0],[';',0]]);
      for(let i=0;i<first.length;i++){const c=first[i];if(c==='"'){if(inside&&first[i+1]==='"')i++;else inside=!inside;}else if(!inside&&(c==='\r'||c==='\n'))break;else if(!inside&&counts.has(c))counts.set(c,counts.get(c)+1);}
      chosen=[...counts].sort((a,b)=>b[1]-a[1])[0][0];records=parseDelimited(raw,chosen);
    }else{
      if(![',','\t',';'].includes(delimiter))throw new Error('쉼표·탭·세미콜론 구분자 중에서 선택하세요.');
      records=parseDelimited(raw,delimiter);
    }
    if(records.length<3)throw new Error('첫 줄 제목과 데이터 2행 이상이 필요해요.');
    const headers=records[0].map(v=>v??''),rows=records.slice(1);
    if(rows.some(r=>r.length!==headers.length))throw new Error('제목과 데이터의 컬럼 수가 달라요. 누락된 쉼표나 따옴표를 확인하세요.');
    const columns=headers.map((header,index)=>({header,index,name:'c_'+(index+1),type:infer(rows.map(r=>r[index]))}));
    const warnings=[];
    if(headers.some(h=>!h.trim())||new Set(headers).size!==headers.length)warnings.push('빈 제목·중복 제목은 컬럼 번호로 구분합니다. SQL의 컬럼명은 CSV 순서대로 c_1, c_2…입니다.');
    if(rows.length<1000)warnings.push('데이터가 1,000행보다 작아요. 이 작은 테이블의 결과를 큰 데이터의 성능으로 일반화하지 마세요.');
    return {headers,columns,rows,delimiter:chosen,warnings};
  }
  function typed(value,type){
    if(value===null)return null;
    if(type==='TEXT')return value;
    if(!['INTEGER','NUMERIC'].includes(type))throw new Error('지원하는 자료형은 INTEGER·NUMERIC·TEXT입니다.');
    const number=canonicalNumber(value);
    if(type==='INTEGER'&&(!/^-?\d+$/.test(number)||Number(number)<-2147483648||Number(number)>2147483647))throw new Error('정수형으로 읽을 수 없는 값이 있어요. NUMERIC이나 TEXT로 바꾸세요.');
    return number;
  }
  function profile(dataset,index,type){
    if(!Number.isInteger(index)||index<0||index>=dataset.columns.length)throw new Error('조회할 컬럼을 선택하세요.');
    const counts=new Map();
    for(const row of dataset.rows){const value=typed(row[index],type);counts.set(value,(counts.get(value)||0)+1);}
    return [...counts].map(([value,count])=>({value,count})).sort((a,b)=>b.count-a.count);
  }
  function lookup(dataset,options){
    const index=Number(options.column),type=options.types?.[index];
    if(!['INTEGER','NUMERIC','TEXT'].includes(type))throw new Error('조회할 컬럼의 자료형을 확인하세요.');
    const values=profile(dataset,index,type);
    const target=options.nullValue?null:typed(options.target,type);
    return {total:dataset.rows.length,matches:values.find(v=>v.value===target)?.count||0,target,columnLabel:dataset.columns[index].header||'제목 없음',columnNumber:index+1};
  }
  function literal(value){return "E'"+value.replace(/\\/g,'\\\\').replace(/'/g,"''")+"'";}
  function sqlValue(value,type){const v=typed(value,type);return v===null?'NULL':type==='TEXT'?literal(v):v;}
  function generate(dataset,options){
    const types=options.types,index=Number(options.column),repeats=Number(options.repeats);
    if(!Array.isArray(types)||types.length!==dataset.columns.length||types.some(t=>!['INTEGER','NUMERIC','TEXT'].includes(t)))throw new Error('모든 컬럼의 자료형을 확인하세요.');
    if(!Number.isInteger(repeats)||repeats<2||repeats>30)throw new Error('반복 횟수는 2~30회여야 해요.');
    const {target,matches:matched}=lookup(dataset,options);
    if(!matched)throw new Error('이 조회값에 해당하는 행이 없어요. 목록에서 값을 선택하거나 입력을 확인하세요.');
    for(const row of dataset.rows)for(let col=0;col<types.length;col++)try{typed(row[col],types[col]);}catch(error){throw new Error(dataset.columns[col].name+' 컬럼: '+error.message);}
    if(types[index]==='TEXT'&&dataset.rows.some(row=>row[index]!==null&&new TextEncoder().encode(row[index]).length>2000))throw new Error('이 컬럼의 문자열이 인덱스 실습 범위보다 길어요. 다른 컬럼을 선택하세요.');
    if(types[index]==='NUMERIC'&&dataset.rows.some(row=>row[index]!==null&&canonicalNumber(row[index]).replace(/[-.]/g,'').length>1000))throw new Error('이 컬럼의 숫자가 인덱스 실습 범위보다 길어요. 다른 컬럼을 선택하세요.');
    const experimentId=options.experimentId;
    if(typeof experimentId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(experimentId))throw new Error('실험 식별 정보가 올바르지 않아요. SQL을 다시 만드세요.');
    const column=dataset.columns[index],predicate=column.name+(target===null?' IS NULL':' = '+sqlValue(target,types[index]));
    const query='SELECT * FROM pg_temp.scanlab_practice WHERE '+predicate;
    const statements=[];
    for(let offset=0;offset<dataset.rows.length;offset+=250){
      const tuples=dataset.rows.slice(offset,offset+250).map((row,n)=>'('+(offset+n+1)+', '+row.map((v,c)=>sqlValue(v,types[c])).join(', ')+')');
      statements.push('INSERT INTO pg_temp.scanlab_practice VALUES\n'+tuples.join(',\n')+';');
    }
    const setup=`-- CSV의 원래 행과 값을 사용합니다. 추가 행을 복제하지 않습니다.
-- c_1, c_2…는 CSV 컬럼 순서이며 scanlab_row_id는 실습용 행 번호입니다.
-- 같은 DB 연결에서 준비 → 측정 → 결과 순서로 실행하세요.
BEGIN;
DROP TABLE IF EXISTS pg_temp.scanlab_practice;
DROP TABLE IF EXISTS pg_temp.scanlab_measurements;
CREATE TEMP TABLE scanlab_practice (
  scanlab_row_id integer NOT NULL,
${dataset.columns.map((c,i)=>'  '+c.name+' '+types[i]+(types[i]==='TEXT'?' COLLATE "C"':'')).join(',\n')}
) ON COMMIT PRESERVE ROWS;
${statements.join('\n')}
CREATE INDEX scanlab_value_idx ON pg_temp.scanlab_practice (${column.name});
ANALYZE pg_temp.scanlab_practice;
CREATE TEMP TABLE scanlab_measurements (method text NOT NULL, repeat_index integer NOT NULL, plan jsonb NOT NULL) ON COMMIT PRESERVE ROWS;
COMMIT;
SELECT count(*) AS total_rows, count(*) FILTER (WHERE ${predicate}) AS matched_rows,
       round(100.0 * count(*) FILTER (WHERE ${predicate}) / count(*), 4) AS actual_selectivity_pct
FROM pg_temp.scanlab_practice;`;
    const shared=root.ScanPractice.measurementSQL(query,repeats);
    const bundle=method=>`SELECT jsonb_pretty(jsonb_build_object(
  'scanlab', jsonb_build_object('version', 1, 'experiment_id', ${literal(experimentId)},
    'method', '${method}', 'column', '${column.name}', 'sql_type', '${types[index]}',
    'total_rows', (SELECT count(*) FROM pg_temp.scanlab_practice),
    'matched_rows', (SELECT count(*) FROM pg_temp.scanlab_practice WHERE ${predicate}),
    'server_version', current_setting('server_version')),
  'runs', jsonb_agg(plan ORDER BY repeat_index))) AS ${method}_json
FROM pg_temp.scanlab_measurements WHERE method = '${method}';`;
    const results='-- 첫 SELECT의 seq_json 셀 전체를 순차 칸, 두 번째 index_json 셀 전체를 인덱스 칸에 넣으세요.\n'+bundle('seq')+'\n\n'+bundle('index');
    return {type:'csv',label:'내 CSV 데이터',total:dataset.rows.length,matches:matched,actualPercent:matched/dataset.rows.length*100,repeats,column:column.name,columnNumber:index+1,columnLabel:column.header||'제목 없음',sqlType:types[index],experimentId,query,setup,measure:shared.measure,results,sql:[setup,shared.measure,results].join('\n\n')};
  }
  function sample(){const lines=['표본번호,수량,지역,상품코드,표시,금액'];for(let i=1;i<=200;i++)lines.push([i,(i%5+1)*10,['서울','부산','대전'][i%3],'P-'+String(i%20).padStart(3,'0'),['#','@','+'][i%3],(i*12.5).toFixed(2)].join(','));return lines.join('\n');}
  root.ScanCSV={parse,profile,lookup,generate,sample,typed,LIMITS};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ScanCSV;
})(typeof globalThis!=='undefined'?globalThis:this);
