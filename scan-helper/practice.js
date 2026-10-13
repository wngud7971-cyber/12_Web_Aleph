(function (root) {
  'use strict';
  const types = {
    integer:{label:'정수', sqlType:'integer', target:'100', other:'250', examples:['100','250']},
    text:{label:'문자열', sqlType:'text COLLATE "C"', target:'서울', other:'부산', examples:['서울','부산']},
    symbols:{label:'기호 포함 문자열', sqlType:'text COLLATE "C"', target:'A-100#_!', other:'B+200@/.', examples:['A-100#_!','B+200@/.']},
    mixed:{label:'혼합 값 (한 컬럼 TEXT)',sqlType:'text COLLATE "C"',target:'100',other:'서울',examples:['100','서울','A-100#_!','250','부산','B+200@/.']},
    record:{label:'혼합 표본 (한 행에 여러 자료형)',sqlType:'multiple',target:'100',other:'250',examples:['100','250']},
    wide:{label:'컬럼 수를 정한 예시 표',sqlType:'multiple',target:'100',other:'250',examples:['100','250']}
  };
  const columns = {
    number:{name:'sample_number',label:'수량',kind:'integer',target:'100',other:'250'},
    text:{name:'sample_text',label:'지역',kind:'text',target:'서울',other:'부산'},
    code:{name:'sample_code',label:'상품 코드',kind:'symbols',target:'A-100',other:'B+200'},
    mark:{name:'sample_mark',label:'표시 기호',kind:'symbols',target:'#',other:'@'}
  };
  const limits={rows:1000000,columns:30,repeats:30};
  function wideColumns(count=6,kinds){
    count=Number(count);
    if(!Number.isInteger(count)||count<3||count>limits.columns)throw new Error('예시 표의 컬럼 수는 3~30개로 입력해 주세요.');
    if(kinds!==undefined&&(!Array.isArray(kinds)||kinds.length!==count))throw new Error('컬럼 수와 자료형 설정을 확인하세요.');
    return Array.from({length:count},(_,i)=>{
      const kind=kinds?kinds[i]:['integer','text','symbols'][i%3];
      if(!['integer','text','symbols'].includes(kind))throw new Error('컬럼의 자료형은 정수·문자열·기호 포함 문자열 중에서 선택해 주세요.');
      return {key:'col_'+(i+1),name:'col_'+(i+1),label:(i+1)+'번째 컬럼',kind,target:types[kind].target,other:types[kind].other};
    });
  }
  function generateWide(options){
    const schema=wideColumns(options.columnCount??6,options.columnKinds),index=Number(options.wideColumn??0),total=Number(options.total),percent=Number(options.percent),repeats=Number(options.repeats);
    if(!Number.isInteger(index)||index<0||index>=schema.length)throw new Error('예시 표에서 조회할 컬럼을 선택해 주세요.');
    if(![10000,100000,limits.rows].includes(total))throw new Error('전체 행 수는 1만·10만·100만 행 중에서 선택해 주세요. 최대 100만 행입니다.');
    if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(options.percent).trim())||!Number.isFinite(percent)||percent<=0||percent>100)throw new Error('선택도는 0보다 크고 100 이하인 숫자여야 해요.');
    if(!Number.isInteger(repeats)||repeats<2||repeats>limits.repeats)throw new Error('반복 횟수는 2~30회여야 해요.');
    const selected=schema[index],target=validateValue(options.target,selected.kind),other=validateValue(options.other,selected.kind);
    if(target===other)throw new Error('조회할 값과 나머지 행의 값은 서로 달라야 해요.');
    const matches=Math.round(total*percent/100);
    if(matches<1)throw new Error('조회할 행이 1개보다 적어요. 선택도나 전체 행 수를 늘려 주세요.');
    const condition='(g::bigint * 104729) % '+total+' < '+matches;
    const sqlValue=(value,kind)=>kind==='integer'?value:literal(value),rowA={},rowB={};
    const expressions=schema.map((c,i)=>{
      const a=i===index?target:c.target,b=i===index?other:c.other;
      rowA[c.key]=c.kind==='integer'?Number(a):a;rowB[c.key]=c.kind==='integer'?Number(b):b;
      return 'CASE WHEN '+(i===index?condition:'g % 2 = 0')+' THEN '+sqlValue(a,c.kind)+' ELSE '+sqlValue(b,c.kind)+' END';
    });
    const predicate=selected.name+' = '+sqlValue(target,selected.kind),query='SELECT * FROM pg_temp.scanlab_practice WHERE '+predicate;
    const setup=`-- 스캔랩 · 컬럼 수를 정한 예시 표 / PostgreSQL 18
-- 전체 ${total}행 · ${schema.length}컬럼. 숨겨진 추가 컬럼이나 원본 CSV 복제는 없습니다.
-- 현재 연결의 실습용 임시 테이블만 다시 만듭니다. 같은 연결에서 준비 → 측정 → 결과를 실행하세요.
BEGIN;
DROP TABLE IF EXISTS pg_temp.scanlab_practice;
DROP TABLE IF EXISTS pg_temp.scanlab_measurements;
CREATE TEMP TABLE scanlab_practice (
${schema.map(c=>'  '+c.name+' '+(c.kind==='integer'?'integer':'text COLLATE "C"')+' NOT NULL').join(',\n')}
) ON COMMIT PRESERVE ROWS;
INSERT INTO pg_temp.scanlab_practice (${schema.map(c=>c.name).join(', ')})
SELECT ${expressions.join(',\n       ')}
FROM generate_series(1, ${total}) AS series(g);
CREATE INDEX scanlab_value_idx ON pg_temp.scanlab_practice (${selected.name});
ANALYZE pg_temp.scanlab_practice;
CREATE TEMP TABLE scanlab_measurements (method text NOT NULL, repeat_index integer NOT NULL, plan jsonb NOT NULL) ON COMMIT PRESERVE ROWS;
COMMIT;
SELECT count(*) AS total_rows, count(*) FILTER (WHERE ${predicate}) AS matched_rows,
       round(100.0 * count(*) FILTER (WHERE ${predicate}) / count(*), 4) AS actual_selectivity_pct
FROM pg_temp.scanlab_practice;`;
    const {measure}=measurementSQL(query,repeats);
    const results=`-- 첫 SELECT의 seq_json, 두 번째 SELECT의 index_json 셀 전체를 비교 칸에 넣으세요.
SELECT jsonb_pretty(jsonb_agg(plan ORDER BY repeat_index)) AS seq_json
FROM pg_temp.scanlab_measurements WHERE method = 'seq';

SELECT jsonb_pretty(jsonb_agg(plan ORDER BY repeat_index)) AS index_json
FROM pg_temp.scanlab_measurements WHERE method = 'index';

SELECT method, repeat_index, plan->>'Execution Time' AS execution_time_ms,
       plan->'Plan'->>'Node Type' AS root_node
FROM pg_temp.scanlab_measurements ORDER BY repeat_index, method;`;
    return {type:'wide',label:types.wide.label,total,matches,actualPercent:matches/total*100,repeats,target,other,pool:null,column:selected.key,columnLabel:selected.label,columnCount:schema.length,schema,previewRows:[rowA,rowB],query,setup,measure,results,sql:[setup,measure,results].join('\n\n')};
  }
  function literal(value) { return "E'" + value.replace(/\\/g,'\\\\').replace(/'/g,"''") + "'"; }
  function validateValue(raw, type) {
    if (typeof raw !== 'string') throw new Error('조회값과 다른 값을 입력해 주세요.');
    if (type === 'integer') {
      if (!/^[+-]?\d+$/.test(raw.trim())) throw new Error('정수형은 소수점 없는 정수만 넣어 주세요.');
      const value = Number(raw.trim());
      if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw new Error('정수는 -2,147,483,648~2,147,483,647 범위여야 해요.');
      return String(value);
    }
    if (!raw.length || [...raw].length > 80 || /[\u0000-\u001f\u007f]/.test(raw) || /[\ud800-\udfff]/u.test(raw.replace(/[\ud800-\udbff][\udc00-\udfff]/g,''))) throw new Error('문자열은 제어문자 없이 1~80자로 넣어 주세요. 한글·공백·기호·따옴표를 사용할 수 있어요.');
    return raw;
  }
  function generate(options) {
    if(options.type==='wide')return generateWide(options);
    const type = Object.prototype.hasOwnProperty.call(types,options.type) ? types[options.type] : null;
    if (!type) throw new Error('지원하는 데이터 유형을 선택해 주세요.');
    const column=options.type==='record'&&Object.prototype.hasOwnProperty.call(columns,options.column)?columns[options.column]:null;
    if(options.type==='record'&&!column)throw new Error('혼합 표본에서 조회할 컬럼을 선택해 주세요.');
    const valueType=column?column.kind:options.type;
    const total = Number(options.total), percent = Number(options.percent), repeats = Number(options.repeats);
    if (![10000,100000,1000000].includes(total)) throw new Error('전체 행 수는 제공된 세 가지 중에서 선택해 주세요.');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(options.percent).trim()) || !Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error('선택도는 0보다 크고 100 이하인 숫자여야 해요.');
    if (!Number.isInteger(repeats) || repeats < 2 || repeats > 30) throw new Error('반복 횟수는 2~30회여야 해요.');
    const target = validateValue(options.type==='mixed'&&typeof options.target==='string'?options.target.trim():options.target,valueType);
    let other = null, pool = null;
    if(options.type==='mixed') {
      if(typeof options.values!=='string'||options.values.length>4000)throw new Error('혼합 예시를 한 줄에 하나씩, 최대 20개 넣어 주세요.');
      const lines=options.values.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
      if(lines.length<3||lines.length>20)throw new Error('혼합 예시는 한 줄에 하나씩 3~20개 넣어 주세요.');
      pool=[...new Set(lines.map(v=>validateValue(v,'mixed')))];
      if(!pool.includes(target))throw new Error('조회할 값이 혼합 예시 목록 안에 있어야 해요.');
      if(!pool.some(v=>/^[+-]?\d+$/.test(v))||!pool.some(v=>/\p{L}/u.test(v))||!pool.some(v=>/[\p{P}\p{S}]/u.test(v)))throw new Error('혼합 예시에 숫자 모양 값, 글자, 기호가 모두 포함되도록 넣어 주세요. 예: 100 / 서울 / A-100#_!');
      if(pool.length<3)throw new Error('서로 다른 혼합 값을 3개 이상 넣어 주세요.');
      other=pool.filter(v=>v!==target);
    } else {
      other=validateValue(options.other,valueType);
      if(target===other)throw new Error('조회할 값과 나머지 행의 값은 서로 달라야 해요.');
    }
    const matches = Math.round(total * percent / 100);
    if (matches < 1) throw new Error('조회할 행이 1개보다 적어요. 선택도나 전체 행 수를 늘려 주세요.');
    if(options.type==='mixed'&&total-matches<other.length)throw new Error('모든 혼합 값이 실제로 들어가도록 선택도를 낮춰 주세요. 조회값이 모든 행을 차지하면 값이 섞이지 않아요.');
    const actualPercent = matches / total * 100;
    const targetSQL = valueType === 'integer' ? target : literal(target);
    const permutation = `(g::bigint * 104729) % ${total}`;
    const otherSQL = options.type === 'mixed' ? `(ARRAY[${other.map(literal).join(', ')}]::text[])[(((${permutation} - ${matches}) % ${other.length}) + 1)::integer]` : valueType === 'integer' ? other : literal(other);
    const filterColumn=column?column.name:'sample_value';
    const query = 'SELECT * FROM pg_temp.scanlab_practice WHERE '+filterColumn+' = '+targetSQL;
    const condition=''+permutation+' < '+matches;
    const cases='CASE WHEN '+condition+' THEN '+targetSQL+' ELSE '+otherSQL+' END';
    let definitions='  sample_value '+type.sqlType+' NOT NULL', insertColumns='id, sample_value, payload', expressions=cases, previewRows=null;
    if(column){
      const rowA={},rowB={};
      definitions=Object.values(columns).map(c=>'  '+c.name+' '+(c.kind==='integer'?'integer':'text COLLATE "C"')+' NOT NULL').join(',\n');
      insertColumns='id, '+Object.values(columns).map(c=>c.name).join(', ')+', payload';
      expressions=Object.entries(columns).map(([key,c])=>{
        const a=c===column?target:c.target,b=c===column?other:c.other;
        rowA[key]=c.kind==='integer'?Number(a):a;rowB[key]=c.kind==='integer'?Number(b):b;
        return 'CASE WHEN '+condition+' THEN '+(c.kind==='integer'?a:literal(a))+' ELSE '+(c.kind==='integer'?b:literal(b))+' END';
      }).join(',\n       ');
      previewRows=[rowA,rowB];
    }
    const setup = `-- 스캔랩 · ${type.label} 확장 실습 / PostgreSQL 18
-- 현재 연결의 스캔랩 임시 테이블만 다시 만듭니다.
-- 준비와 측정 SQL은 같은 연결에서 실행하세요. 연결 종료 시 데이터가 사라집니다.
BEGIN;
DROP TABLE IF EXISTS pg_temp.scanlab_practice;
DROP TABLE IF EXISTS pg_temp.scanlab_measurements;
CREATE TEMP TABLE scanlab_practice (
  id integer NOT NULL,
${definitions},
  payload text NOT NULL
) ON COMMIT PRESERVE ROWS;
INSERT INTO pg_temp.scanlab_practice (${insertColumns})
SELECT g,
       ${expressions},
       repeat('x', 40)
FROM generate_series(1, ${total}) AS series(g);
CREATE INDEX scanlab_value_idx ON pg_temp.scanlab_practice (${filterColumn});
ANALYZE pg_temp.scanlab_practice;
CREATE TEMP TABLE scanlab_measurements (
  method text NOT NULL,
  repeat_index integer NOT NULL,
  plan jsonb NOT NULL
) ON COMMIT PRESERVE ROWS;
COMMIT;
-- 실제 행 수와 조회 비율을 확인합니다. 이 COUNT는 측정 쿼리가 아닙니다.
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE ${filterColumn} = ${targetSQL}) AS matched_rows,
       round(100.0 * count(*) FILTER (WHERE ${filterColumn} = ${targetSQL}) / count(*), 4) AS actual_selectivity_pct
FROM pg_temp.scanlab_practice;`;
    const {measure}=measurementSQL(query,repeats);
    const results = `-- 순차 결과: seq_json 셀의 JSON 전체를 앱의 순차 스캔 칸에 넣으세요.
SELECT jsonb_pretty(jsonb_agg(plan ORDER BY repeat_index)) AS seq_json
FROM pg_temp.scanlab_measurements WHERE method = 'seq';

-- 인덱스 결과: index_json 셀의 JSON 전체를 앱의 일반 인덱스 칸에 넣으세요.
SELECT jsonb_pretty(jsonb_agg(plan ORDER BY repeat_index)) AS index_json
FROM pg_temp.scanlab_measurements WHERE method = 'index';

-- 실행 계획이 의도한 스캔으로 나왔는지 별도로 확인할 수 있습니다.
SELECT method, repeat_index, plan->>'Execution Time' AS execution_time_ms,
       plan->'Plan'->>'Node Type' AS root_node
FROM pg_temp.scanlab_measurements ORDER BY repeat_index, method;`;
    return {type:options.type,label:type.label,total,matches,actualPercent,repeats,target,other,pool,column:options.type==='record'?options.column:null,columnLabel:column?column.label:null,previewRows,query,setup,measure,results,sql:[setup,measure,results].join('\n\n')};
  }
  function measurementSQL(query,repeats){
    const body = `DECLARE
  run_no integer;
  method_key text;
  method_order text[];
  execution_plan json;
  measurement_query text := ${literal('EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) '+query)};
BEGIN
  -- run_no=0은 각 방식 한 번의 준비 실행이며 저장하지 않습니다.
  FOR run_no IN 0..${repeats} LOOP
    method_order := CASE WHEN run_no % 2 = 0
                        THEN ARRAY['seq', 'index'] ELSE ARRAY['index', 'seq'] END;
    FOREACH method_key IN ARRAY method_order LOOP
      PERFORM set_config('enable_seqscan', CASE WHEN method_key = 'seq' THEN 'on' ELSE 'off' END, true);
      PERFORM set_config('enable_indexscan', CASE WHEN method_key = 'seq' THEN 'off' ELSE 'on' END, true);
      EXECUTE measurement_query INTO execution_plan;
      IF run_no > 0 THEN
        INSERT INTO pg_temp.scanlab_measurements (method, repeat_index, plan)
        VALUES (method_key, run_no, (execution_plan::jsonb)->0);
      END IF;
    END LOOP;
  END LOOP;
END;`;
    let delimiter = '$scanlab_0$', number = 0;
    while (body.includes(delimiter)) delimiter = '$scanlab_'+(++number)+'$';
    const measure = `-- 준비 SQL 실행 뒤 같은 연결에서 실행하세요.
-- 일반 인덱스와 순차 스캔을 번갈아 각 ${repeats}회 측정합니다.
-- 초기 준비 실행 각 1회는 저장하지 않습니다. 아래 설정은 트랜잭션 안에서만 유지됩니다.
BEGIN;
SET LOCAL max_parallel_workers_per_gather = 0;
SET LOCAL jit = off;
SET LOCAL enable_bitmapscan = off;
SET LOCAL enable_indexonlyscan = off;
TRUNCATE pg_temp.scanlab_measurements;
DO ${delimiter}
${body}
${delimiter};
COMMIT;`;
    return {measure};
  }
  const api = {types,columns,limits,wideColumns,generate,measurementSQL};
  root.ScanPractice = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
