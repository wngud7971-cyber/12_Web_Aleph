(function(){
  'use strict';
  const $=id=>document.getElementById(id),sql=ScanSQLExport;
  let data=null,file=null,options=null,part='table',following=true,mode='home',step=1,revision=0,controller=null,currentText='';
  let exportSettings=null;
  const labels={table:'표 만들기',import:'데이터 가져오기 · 앱 전용',index:'인덱스 만들기',select:'조건에 맞는 행 찾기',seq:'순차 스캔 측정',indexScan:'인덱스 스캔 측정'};
  function visible(){ $('sql-tools').hidden=mode!=='csv'||!data; $('sql-follow-label').hidden=step!==2; }
  function download(text,name){const blob=text instanceof Blob?text:new Blob([text],{type:'application/sql;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function render(){
    currentText='';$('sql-query-feedback').textContent='';
    let valid=false;
    if(data){try{
      sql.validate(data,exportSettings.types);sql.schema(exportSettings.types,exportSettings.schema);valid=true;
      currentText=part==='import'?sql.importCommand(data,options.types):part==='table'?sql.table(data,exportSettings.types,exportSettings.schema):sql.queries(data,{...options,types:exportSettings.types,schema:exportSettings.schema})[part];
    }catch(error){$('sql-query-feedback').textContent=error.message;}}
    $('sql-query-preview').textContent=currentText;$('sql-query-title').textContent=labels[part];
    $('sql-query-copy').disabled=!currentText;$('sql-query-save').disabled=!currentText;
    $('sql-data-save').disabled=!valid||Boolean(controller);
    document.querySelectorAll('[data-sql-query]').forEach(button=>{const active=button.dataset.sqlQuery===part;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    visible();
  }
  function cancel(){revision++;controller?.abort();controller=null;$('sql-export-cancel').disabled=true;$('sql-data-save').disabled=false;}
  function clear(){cancel();data=null;file=null;options=null;currentText='';$('sql-tools').hidden=true;$('sql-export-progress').hidden=true;$('sql-export-feedback').textContent='';}
  function readSettings(){
    exportSettings={types:[...$('sql-schema-body').querySelectorAll('select')].map(el=>el.value),schema:{tableName:$('sql-table-name').value,temporary:$('sql-table-kind').value==='temporary',columnNames:[...$('sql-schema-body').querySelectorAll('input')].map(el=>el.value)}};
  }
  function settingsChanged(){cancel();readSettings();following=false;$('sql-follow').checked=false;$('sql-export-progress').hidden=true;$('sql-export-feedback').textContent='SQL 저장 설정을 바꿨어요. 새 설정으로 변환합니다.';render();}
  function schemaControls(names,types){
    $('sql-schema-body').replaceChildren();
    data.columns.forEach((column,i)=>{
      const tr=document.createElement('tr'),source=document.createElement('td');source.textContent=(i+1)+'. '+(column.header||'제목 없음');tr.appendChild(source);
      const nameCell=document.createElement('td'),input=document.createElement('input');input.type='text';input.value=names[i];input.maxLength=126;input.setAttribute('aria-label',(i+1)+'번째 SQL 컬럼 이름');input.addEventListener('input',settingsChanged);nameCell.appendChild(input);tr.appendChild(nameCell);
      const typeCell=document.createElement('td'),select=document.createElement('select');select.setAttribute('aria-label',(i+1)+'번째 SQL 자료형');for(const type of ['INTEGER','NUMERIC','TEXT']){const item=document.createElement('option');item.value=type;item.textContent=type;select.appendChild(item);}select.value=types[i];select.addEventListener('change',settingsChanged);typeCell.appendChild(select);tr.appendChild(typeCell);$('sql-schema-body').appendChild(tr);
    });readSettings();
  }
  function resetSettings(){
    $('sql-table-name').value='scanlab_practice';$('sql-table-kind').value='temporary';schemaControls(data.columns.map((_,i)=>'c_'+(i+1)),options.types);
  }
  function set(dataset,source,next){
    const fresh=data!==dataset;
    if(data!==dataset||JSON.stringify(options?.types)!==JSON.stringify(next.types)){cancel();$('sql-export-progress').hidden=true;$('sql-export-feedback').textContent='';}
    data=dataset;file=source;options={...next,types:[...next.types]};if(fresh)resetSettings();render();
  }
  $('sql-table-name').addEventListener('input',settingsChanged);
  $('sql-table-kind').addEventListener('change',settingsChanged);
  $('sql-use-headers').addEventListener('click',()=>{if(data){schemaControls(sql.suggestNames(data),exportSettings.types);settingsChanged();}});
  $('sql-settings-reset').addEventListener('click',()=>{if(data){resetSettings();settingsChanged();}});
  function stage(value,method){
    if(!following)return;
    const next=value==='engine'?'table':value==='import'?'import':value==='index'?'index':value==='check'?'select':value==='measure'?(method==='seq'?'seq':'indexScan'):null;
    if(next&&next!==part){part=next;render();}
  }
  document.querySelectorAll('[data-sql-query]').forEach(button=>button.addEventListener('click',()=>{part=button.dataset.sqlQuery;following=false;$('sql-follow').checked=false;render();}));
  $('sql-follow').addEventListener('change',()=>{following=$('sql-follow').checked;});
  $('sql-query-save').addEventListener('click',()=>{following=false;$('sql-follow').checked=false;if(currentText)download('-- 스캔랩 · '+labels[part]+'\n-- CSV 데이터는 별도의 CSV 전체 SQL 저장에 포함됩니다.\n'+currentText+'\n','scanlab-query-'+part+'.sql');});
  $('sql-query-copy').addEventListener('click',async()=>{
    if(!currentText)return;following=false;$('sql-follow').checked=false;const text=currentText;
    try{if(!navigator.clipboard?.writeText)throw new Error('clipboard');await navigator.clipboard.writeText(text);$('sql-query-feedback').textContent='현재 쿼리를 복사했어요.';}
    catch(error){$('sql-query-preview').focus();const range=document.createRange();range.selectNodeContents($('sql-query-preview'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('sql-query-feedback').textContent='쿼리를 선택했어요. Ctrl+C로 복사하세요.';}
  });
  $('sql-data-save').addEventListener('click',async()=>{
    if(!data||controller)return;
    const snapshot={dataset:data,file,types:[...exportSettings.types],schema:{...exportSettings.schema,columnNames:[...exportSettings.schema.columnNames]}},version=++revision;
    const abort=new AbortController();controller=abort;let writer=null,completed=false;
    $('sql-export-feedback').textContent='저장 준비 중';$('sql-data-save').disabled=true;$('sql-export-cancel').disabled=false;
    try{
      sql.validate(snapshot.dataset,snapshot.types);
      sql.schema(snapshot.types,snapshot.schema);
      // Estimate conservatively before deciding whether to allocate download chunks.
      const rows=snapshot.dataset.totalRows||snapshot.dataset.rows.length;
      const downloadEstimate=snapshot.file.size*2+rows*(60+snapshot.types.length*6)+4096;
      const direct=downloadEstimate>sql.FALLBACK_LIMIT&&typeof window.showSaveFilePicker==='function'&&window.isSecureContext;
      if(direct){
        const handle=await window.showSaveFilePicker({suggestedName:'scanlab-data.sql',types:[{description:'PostgreSQL SQL',accept:{'text/plain':['.sql']}}]});
        if(version!==revision||abort.signal.aborted)throw new DOMException('SQL 변환을 취소했어요.','AbortError');
        writer=await handle.createWritable();
      }
      if(version!==revision||abort.signal.aborted)throw new DOMException('SQL 변환을 취소했어요.','AbortError');
      const chunks=[];$('sql-export-progress').hidden=false;$('sql-export-meter').value=0;
      const result=await sql.convert(snapshot.file,snapshot.dataset,snapshot.types,text=>writer?writer.write(text):chunks.push(text),{schema:snapshot.schema,signal:abort.signal,maxBytes:writer?null:sql.FALLBACK_LIMIT,onProgress:p=>{
        if(version!==revision)return;$('sql-export-meter').value=p.read/p.total*100;$('sql-export-feedback').textContent=p.rows.toLocaleString('ko-KR')+'행 변환 중 · SQL '+(p.bytes/1048576).toFixed(1)+'MiB';
      }});
      if(version!==revision||abort.signal.aborted)throw new DOMException('SQL 변환을 취소했어요.','AbortError');
      if(writer)await writer.close();else download(new Blob(chunks,{type:'application/sql;charset=utf-8'}),'scanlab-data.sql');completed=true;
      if(version===revision)$('sql-export-feedback').textContent=result.rows.toLocaleString('ko-KR')+'행 전체를 SQL로 저장했어요. '+(result.bytes/1048576).toFixed(1)+'MiB · 테이블 생성과 모든 INSERT문이 들어 있어요.';
    }catch(error){if(version===revision)$('sql-export-feedback').textContent=error.name==='AbortError'?'SQL 저장을 취소했어요.':error.message;}
    finally{
      if(writer&&!completed){try{await writer.abort();}catch(_){}}
      if(version===revision){controller=null;$('sql-export-cancel').disabled=true;render();}
    }
  });
  $('sql-export-cancel').addEventListener('click',()=>{controller?.abort();$('sql-export-feedback').textContent='SQL 저장을 취소하고 있어요.';});
  document.addEventListener('scanlab:flow-change',event=>{mode=event.detail.mode;step=event.detail.step;visible();});
  globalThis.ScanSQLTools={set,clear,stage};
})();
