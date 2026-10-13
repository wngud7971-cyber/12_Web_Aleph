(function(){
  'use strict';
  const $=id=>document.getElementById(id),csv=ScanCSV,stream=ScanCSVStream;
  let dataset=null,source=null,types=[],generated=null,part='setup',frequent=[],profileKey='',selection=null,selectionKey='',job=0,active=null,timer=null,autoMeasure=false,historyDataset=null;
  const format=value=>value.toLocaleString('ko-KR');
  function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function busy(value){
    $('csv-read-progress').hidden=!value;$('csv-cancel').disabled=!value;
    for(const id of ['csv-delimiter','csv-column','csv-common-value','csv-null','csv-repeats'])$(id).disabled=value;
    $('csv-target').disabled=value||$('csv-null').checked;
    $('csv-form').querySelector('[type="submit"]').disabled=value;
    document.querySelectorAll('#csv-schema-body select').forEach(select=>{select.disabled=value;});
  }
  function stop(){job++;active?.abort();active=null;clearTimeout(timer);timer=null;busy(false);ScanBrowser.cancel();}
  async function task(label,action,success){
    stop();const version=job,controller=new AbortController();active=controller;busy(true);
    $('csv-progress').value=0;$('csv-progress-text').textContent=label;$('csv-error').textContent='';
    try{
      const result=await action({signal:controller.signal,onProgress:p=>{if(version===job){$('csv-progress').value=p.read/p.total*100;$('csv-progress-text').textContent=label+' · '+Math.floor(p.read/p.total*100)+'% · '+format(p.rows)+'행';}}});
      if(version!==job)return;success(result);
    }catch(error){if(version===job){$('csv-error').textContent=error.message||'파일을 읽지 못했어요.';$('csv-status').textContent='입력과 파일 형식을 확인하고 다시 시도하세요.';}}
    finally{if(version===job){active=null;busy(false);}}
  }
  function renderSQL(){
    const large=Boolean(generated?.importMode);
    $('csv-sql').textContent=generated?(large?generated.sql:generated[part]):'';
    $('csv-standard-run').hidden=large;
    $('csv-import-note').hidden=!large;
    $('csv-sql-tabs').hidden=large;
    $('csv-copy-sql').hidden=large;
    $('csv-run-title').textContent=large?'원본 CSV와 SQL 파일을 함께 준비해요.':'SQL을 복사해 DB에서 실행하세요.';
    $('csv-sql-label').textContent=large?'전체 실험 SQL 확인':'현재 단계에서 실행할 SQL';
    $('csv-next-description').textContent=large
      ? '‘다음’을 눌러 입력 화면을 여세요. scanlab-seq.json은 왼쪽, scanlab-index.json은 오른쪽의 결과 파일 선택으로 넣으세요.'
      : '‘다음’을 눌러 입력 화면을 열어 두세요. DB의 첫 SELECT에서 seq_json 셀 전체를 복사해 왼쪽 칸에 넣고, 두 번째 SELECT의 index_json을 복사해 오른쪽 칸에 넣으세요.';
    document.querySelectorAll('[data-csv-sql]').forEach(button=>{const selected=button.dataset.csvSql===part;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
    $('csv-run-hint').textContent=generated?.importMode
      ? 'CSV와 SQL을 같은 폴더에 저장하고, 위의 명령으로 전체 SQL 파일을 한 번 실행하세요.'
      : {setup:'먼저 이 코드를 DB에서 실행하세요. 완료되면 ‘2. 측정’을 누르세요.',measure:'같은 쿼리 창에서 이 코드를 실행하세요. 완료되면 ‘3. 결과’를 누르세요.',results:'두 SELECT를 실행하세요. 다음 화면을 열어 두고 DB 결과 셀을 하나씩 복사해 넣으세요.'}[part];
  }
  function resetGenerated(){generated=null;ScanFlow.setCSVReady(false);$('csv-download').disabled=true;$('csv-use').disabled=true;$('csv-feedback').textContent='';$('csv-copy-feedback').textContent='';renderSQL();}
  function settings(){return {types:[...types],column:Number($('csv-column').value),target:$('csv-target').value,nullValue:$('csv-null').checked,repeats:$('csv-repeats').value};}
  function key(options){return JSON.stringify([options.column,options.types[options.column],options.nullValue?null:csv.typed(options.target,options.types[options.column])]);}
  function showSelection(value){
    const label=JSON.stringify(value.columnLabel)+' ('+value.columnNumber+'번째 열)';
    const condition=value.target===null?label+' 값이 비어 있는(NULL)':value.target===''?label+' 값이 빈 문자열인':label+' 값이 '+JSON.stringify(value.target)+'인';
    $('csv-query-summary').textContent=format(value.total)+'행 중 '+condition+' '+format(value.matches)+'행을 찾습니다. '+(value.matches?'같은 행을 순차 스캔과 인덱스 스캔으로 찾는 시간을 비교합니다.':'현재 조건에 맞는 행이 없어요. 다른 값을 선택하거나 입력을 확인해 주세요.');
  }
  function cachedSelection(options){
    if(!dataset.streaming)return csv.lookup(dataset,options);
    const target=options.nullValue?null:csv.typed(options.target,options.types[options.column]);
    if(profileKey!==JSON.stringify([options.column,options.types[options.column]]))return null;
    const entry=frequent.find(item=>item.value===target);if(!entry)return null;
    return {total:dataset.totalRows,matches:entry.count,target,columnLabel:dataset.columns[options.column].header||'제목 없음',columnNumber:options.column+1};
  }
  function explain(){
    stop();resetGenerated();selection=null;selectionKey='';
    if(!dataset){$('csv-query-summary').textContent='표를 선택하고 찾을 열과 값을 골라 주세요.';return;}
    try{
      const options=settings();
      ScanSQLTools.set(dataset,source.file||new Blob([source.raw],{type:'text/csv;charset=utf-8'}),options);
      const expected=key(options),value=cachedSelection(options);
      if(value){selection=value;selectionKey=expected;showSelection(value);return;}
      $('csv-query-summary').textContent='입력한 값이 전체 파일에 몇 행 있는지 확인할 준비를 하고 있어요.';
      timer=setTimeout(()=>task('입력한 값의 행 수 확인',opts=>stream.lookup(dataset,options,opts),value=>{selection=value;selectionKey=expected;showSelection(value);}),400);
    }catch(error){$('csv-query-summary').textContent='찾을 조건을 확인해 주세요. '+error.message;}
  }
  function preview(){
    $('csv-preview-head').replaceChildren();$('csv-preview-body').replaceChildren();const head=document.createElement('tr');
    dataset.columns.forEach(column=>{const th=document.createElement('th');th.scope='col';th.textContent=column.header||'제목 없음';head.appendChild(th);});$('csv-preview-head').appendChild(head);
    dataset.rows.slice(0,5).forEach(row=>{const tr=document.createElement('tr');row.forEach(value=>{const td=document.createElement('td');td.textContent=value===null?'NULL':value===''?'빈 문자열':value;tr.appendChild(td);});$('csv-preview-body').appendChild(tr);});
  }
  function schema(){
    $('csv-schema-body').replaceChildren();$('csv-column').replaceChildren();
    dataset.columns.forEach((column,index)=>{
      const tr=document.createElement('tr');for(const text of [column.header||'제목 없음',column.name]){const td=document.createElement('td');td.textContent=text;tr.appendChild(td);}
      const td=document.createElement('td'),select=document.createElement('select');select.setAttribute('aria-label',column.name+' 자료형');
      for(const type of ['INTEGER','NUMERIC','TEXT']){const option=document.createElement('option');option.value=type;option.textContent=type;select.appendChild(option);}select.value=types[index];
      select.addEventListener('change',()=>{types[index]=select.value;refreshValues();});td.appendChild(select);tr.appendChild(td);
      const empty=document.createElement('td');empty.textContent=format(dataset.stats?dataset.stats[index].empty:dataset.rows.filter(row=>row[index]===null).length);tr.appendChild(empty);$('csv-schema-body').appendChild(tr);
      const option=document.createElement('option');option.value=String(index);option.textContent=(column.header||'제목 없음')+' ('+(index+1)+'번째 열)';$('csv-column').appendChild(option);
    });
    const useful=dataset.columns.findIndex(c=>/지역|region/i.test(c.header));if(useful>=0)$('csv-column').value=String(useful);
  }
  function refreshValues(){
    stop();resetGenerated();selection=null;selectionKey='';frequent=[];profileKey='';$('csv-common-value').replaceChildren();
    if(!dataset)return;
    ScanSQLTools.set(dataset,source.file||new Blob([source.raw],{type:'text/csv;charset=utf-8'}),settings());
    const index=Number($('csv-column').value),type=types[index],expected=JSON.stringify([index,type]);
    $('csv-query-summary').textContent='선택한 컬럼의 값과 행 수를 전체 파일에서 확인하고 있어요.';
    task('조회할 값과 행 수 확인',opts=>dataset.streaming?stream.profile(dataset,index,type,opts):Promise.resolve({entries:csv.profile(dataset,index,type),hasMore:false}),result=>{
      frequent=result.entries;profileKey=expected;
      frequent.slice(0,100).forEach((item,n)=>{const option=document.createElement('option');option.value=String(n);const label=item.value===null?'NULL (빈 값)':item.value===''?'빈 문자열':item.value;option.textContent=label.slice(0,80)+' · '+format(item.count)+'행';$('csv-common-value').appendChild(option);});
      let selected=0;if(source?.raw!==undefined){const seoul=frequent.findIndex(item=>item.value==='서울');if(seoul>=0)selected=seoul;}
      const first=frequent[selected];$('csv-common-value').value=String(selected);$('csv-null').checked=first?.value===null;$('csv-target').value=first?.value??'';
      $('csv-warning').textContent=dataset.warnings.join(' ')+' '+(dataset.streaming?'처음 발견한 서로 다른 값 최대 100개를 표시합니다. 표시된 각 행 수는 전체 파일에서 센 정확한 값입니다.':'목록의 값은 이 표에 실제로 들어 있어요.')+(result.hasMore?' 다른 값은 직접 입력하면 전체 파일에서 다시 셉니다.':'');
      explain();
      if(autoMeasure){autoMeasure=false;$('csv-form').requestSubmit();}
    });
  }
  function loadSource(next){
    stop();ScanSQLTools.clear();source=next;dataset=null;types=[];profileKey='';selection=null;resetGenerated();$('csv-workspace').hidden=true;$('csv-status').textContent='파일을 확인하고 있어요.';
    const delimiter=$('csv-delimiter').value==='tab'?'\t':$('csv-delimiter').value;
    task('CSV의 전체 행과 자료형 확인',async opts=>{
      if(next.raw!==undefined)return csv.parse(next.raw,delimiter);
      const meta=await stream.analyze(next.file,delimiter,opts);
      if(next.file.size<=csv.LIMITS.characters&&meta.totalRows<=csv.LIMITS.rows){const raw=new TextDecoder('utf-8',{fatal:true}).decode(await next.file.arrayBuffer());return csv.parse(raw,meta.delimiter);}
      return meta;
    },value=>{
      dataset=value;types=dataset.columns.map(c=>c.type);schema();preview();$('csv-workspace').hidden=false;
      historyDataset=ScanHistory.register({total:dataset.totalRows||dataset.rows.length,columns:dataset.columns.length,example:next.raw!==undefined});
      $('csv-status').textContent=(next.raw!==undefined?'학습용 가상 예시 CSV':'직접 선택한 CSV')+' · '+format(dataset.totalRows||dataset.rows.length)+'행 · '+dataset.columns.length+'컬럼'+(dataset.streaming?' · 나눠 읽기 완료':'');refreshValues();
    });
  }
  $('csv-file').addEventListener('change',()=>{autoMeasure=false;const file=$('csv-file').files[0];if(file)loadSource({file});});
  $('csv-sample').addEventListener('click',()=>{autoMeasure=false;$('csv-file').value='';$('csv-delimiter').value='auto';loadSource({raw:csv.sample()});});
  $('start-live-demo').addEventListener('click',()=>{ScanFlow.show('csv');$('csv-sample').click();autoMeasure=true;});
  $('csv-delimiter').addEventListener('change',()=>{autoMeasure=false;if(source)loadSource(source);});
  $('csv-column').addEventListener('change',refreshValues);
  $('csv-common-value').addEventListener('change',()=>{const item=frequent[Number($('csv-common-value').value)];if(!item)return;$('csv-null').checked=item.value===null;$('csv-target').value=item.value??'';explain();});
  $('csv-null').addEventListener('change',explain);
  $('csv-target').addEventListener('input',explain);
  $('csv-repeats').addEventListener('input',resetGenerated);
  $('csv-cancel').addEventListener('click',()=>{autoMeasure=false;stop();resetGenerated();$('csv-file').value='';selection=null;selectionKey='';$('csv-status').textContent='작업을 취소했어요. 파일이나 찾을 조건을 다시 선택해 주세요.';$('csv-query-summary').textContent='읽기를 취소했어요. 파일이나 찾을 항목을 다시 선택해 주세요.';});
  $('csv-form').addEventListener('submit',event=>{
    event.preventDefault();if(!dataset)return;resetGenerated();
    const options=settings();
    task('찾을 조건 확인',async opts=>{
      const expected=key(options),value=selection&&selectionKey===expected?selection:cachedSelection(options)||await stream.lookup(dataset,options,opts);
      options.experimentId=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():'browser_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
      return ScanEngineCore.spec(dataset,{...options,matches:value.matches});
    },config=>{
      ScanBrowser.run(source.file||new Blob([source.raw],{type:'text/csv;charset=utf-8'}),config,source.raw!==undefined?'학습용 가상 예시 CSV':'직접 선택한 CSV',{datasetId:historyDataset.id,columnLabel:dataset.columns[options.column].header});
    });
  });
  $('csv-manual-start').addEventListener('click',()=>{
    if(!dataset)return;resetGenerated();
    const options=settings();
    task('실험 준비',async opts=>{
      const expected=key(options),value=selection&&selectionKey===expected?selection:cachedSelection(options)||await stream.lookup(dataset,options,opts);
      options.experimentId=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():'csv_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
      return dataset.streaming?stream.generateImport(dataset,{...options,matches:value.matches}):csv.generate(dataset,options);
    },value=>{
      generated=value;part='setup';$('csv-download').disabled=false;$('csv-use').disabled=false;$('csv-import-note').hidden=!generated.importMode;
      $('csv-run-summary').textContent=$('csv-query-summary').textContent+' 방식별 '+generated.repeats+'회 · 조회 비율 '+format(generated.actualPercent)+'%';
      renderSQL();ScanFlow.setCSVExecution('manual');ScanFlow.setCSVReady(true);ScanFlow.setCSVResultReady(true);ScanFlow.show('csv',2);$('csv-sql-details').open=true;
    });
  });
  document.querySelectorAll('[data-csv-sql]').forEach(button=>button.addEventListener('click',()=>{part=button.dataset.csvSql;renderSQL();$('csv-copy-feedback').textContent='';$('csv-sql-details').open=true;}));
  $('csv-download').addEventListener('click',()=>{if(generated)download(new Blob([generated.sql],{type:'application/sql;charset=utf-8'}),'scanlab-my-csv-experiment.sql');});
  $('csv-data-download').addEventListener('click',()=>{if(generated?.importMode&&dataset?.file)download(dataset.file,'scanlab-input.csv');});
  $('csv-copy-sql').addEventListener('click',async()=>{
    if(!generated)return;
    try{if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(generated[part]);$('csv-copy-feedback').textContent=generated.importMode?'복사했어요. 이 코드는 psql에서 실행합니다.':'복사했어요. 같은 PostgreSQL 쿼리 창에서 실행하세요.';}
    catch(error){$('csv-sql-details').open=true;$('csv-sql').focus();const range=document.createRange();range.selectNodeContents($('csv-sql'));const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);$('csv-copy-feedback').textContent='SQL을 선택했어요. Ctrl+C로 복사하세요.';}
  });
  $('csv-use').addEventListener('click',()=>{
    if(!generated)return;
    document.dispatchEvent(new CustomEvent('scanlab:csv-connect',{detail:{experimentId:generated.experimentId,total:generated.total,matches:generated.matches,percent:generated.actualPercent,repeats:generated.repeats,column:generated.column,sqlType:generated.sqlType,sourceLabel:source?.raw!==undefined?'학습용 가상 예시 CSV':'직접 선택한 CSV',importMode:generated.importMode}}));
    if(generated.importMode)$('measurement-guidance').textContent='psql에서 생성된 scanlab-seq.json 내용을 왼쪽, scanlab-index.json 내용을 오른쪽에 넣으세요. 아래 파일 선택으로 읽을 수도 있어요.';
    $('csv-feedback').textContent='실험 조건을 연결했어요. 실제 DB 실행 결과를 넣어 주세요.';
  });
})();
