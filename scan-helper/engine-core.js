(function(root){
  'use strict';
  const VERSION='0.5.8';
  function spec(dataset,options){
    const types=options.types,index=Number(options.column),total=dataset.totalRows||dataset.rows.length,repeats=Number(options.repeats);
    if(!Array.isArray(types)||types.length!==dataset.columns.length||types.some(t=>!['INTEGER','NUMERIC','TEXT'].includes(t)))throw new Error('모든 컬럼의 자료형을 확인하세요.');
    if(!Number.isInteger(index)||index<0||index>=types.length)throw new Error('조회할 항목을 선택하세요.');
    if(!Number.isInteger(repeats)||repeats<2||repeats>30)throw new Error('각 방식의 반복은 2~30회로 정해 주세요.');
    if(!Number.isSafeInteger(total)||total<2||total>1000000||types.length>30)throw new Error('100만 행·30컬럼 범위의 CSV를 선택하세요.');
    if(dataset.streaming)root.ScanCSVStream.validateTypes(dataset,types);
    else dataset.rows.forEach(row=>row.forEach((value,i)=>root.ScanCSV.typed(value,types[i])));
    const type=types[index],target=options.nullValue?null:root.ScanCSV.typed(options.target,type),matches=Number(options.matches);
    if(!Number.isSafeInteger(matches)||matches<1||matches>total)throw new Error('찾는 값이 있는 조건을 선택하세요. 현재 0행인 조건은 측정할 수 없어요.');
    const long=dataset.streaming?dataset.stats[index]:null,encoder=new TextEncoder();
    if(type==='TEXT'&&(long?.longText||(!long&&dataset.rows.some(row=>row[index]!==null&&encoder.encode(row[index]).length>2000))))throw new Error('조회할 컬럼에 인덱스 실습 범위보다 긴 문자열이 있어요. 다른 항목을 선택하세요.');
    if(type==='NUMERIC'&&(long?.longNumeric||(!long&&dataset.rows.some(row=>row[index]!==null&&root.ScanCSV.typed(row[index],type).replace(/[-.]/g,'').length>1000))))throw new Error('조회할 숫자가 인덱스 실습 범위보다 길어요. 다른 항목을 선택하세요.');
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(options.experimentId||''))throw new Error('실험 정보를 다시 준비해 주세요.');
    const column='c_'+(index+1),predicate=target===null?column+' IS NULL':column+' = $1::'+type;
    return {types:[...types],column,columnNumber:index+1,sqlType:type,total,matches,repeats,target,experimentId:options.experimentId,delimiter:dataset.delimiter,predicate,query:'SELECT * FROM pg_temp.scanlab_practice WHERE '+predicate,params:target===null?[]:[target],engineVersion:VERSION};
  }
  function validateSpec(value){
    if(!value||!Array.isArray(value.types)||value.types.length<1||value.types.length>30||value.types.some(t=>!['INTEGER','NUMERIC','TEXT'].includes(t)))throw new Error('측정 설정이 올바르지 않아요.');
    const n=value.columnNumber;
    if(!Number.isInteger(n)||n<1||n>value.types.length||value.column!=='c_'+n||value.sqlType!==value.types[n-1])throw new Error('조회 항목을 다시 선택하세요.');
    if(![',',';','\t'].includes(value.delimiter)||!Number.isSafeInteger(value.total)||value.total<2||value.total>1000000||!Number.isSafeInteger(value.matches)||value.matches<1||value.matches>value.total||!Number.isInteger(value.repeats)||value.repeats<2||value.repeats>30||!/^[A-Za-z0-9_-]{1,80}$/.test(value.experimentId||''))throw new Error('행 수와 측정 설정을 확인하세요.');
    const target=value.target===null?null:root.ScanCSV.typed(value.target,value.sqlType);
    const predicate=target===null?value.column+' IS NULL':value.column+' = $1::'+value.sqlType;
    return {...value,target,predicate,query:'SELECT * FROM pg_temp.scanlab_practice WHERE '+predicate,params:target===null?[]:[target]};
  }
  function encodeRow(row,types){
    if(row.length!==types.length)throw new Error('CSV 컬럼 수가 바뀌었어요. 다시 선택하세요.');
    return row.map((v,i)=>{const value=root.ScanCSV.typed(v,types[i]);return value===null?'':'"'+value.replace(/"/g,'""')+'"';}).join(',')+'\n';
  }
  function envelope(config,method,runs,serverVersion){
    return {scanlab:{version:1,experiment_id:config.experimentId,method,column:config.column,sql_type:config.sqlType,total_rows:config.total,matched_rows:config.matches,server_version:serverVersion},runs};
  }
  root.ScanEngineCore={VERSION,spec,validateSpec,encodeRow,envelope};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ScanEngineCore;
})(typeof globalThis!=='undefined'?globalThis:this);
