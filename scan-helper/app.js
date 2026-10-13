(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const rows = PAPER_DATA.rows, model = ScanLab;
  const format = v => v !== 0 && Math.abs(v) < 0.001 ? v.toExponential(3) : v.toLocaleString('ko-KR', {maximumFractionDigits:3});
  const verdicts = {index:'일반 인덱스 스캔 우위',seq:'순차 스캔 우위',unclear:'우위 불분명'};
  let latest = null, sampleType = null, practice = null, practiceContext = null, csvContext=null, sqlPart = 'setup',browserResultActive=false;
  const practiceModel = ScanPractice;
  let wideKinds=[];
  function syncWideFields(){
    const count=Number($('practice-column-count').value);
    const defaults=practiceModel.wideColumns(count),selected=Number($('practice-wide-column').value||0);
    wideKinds=defaults.map((c,i)=>wideKinds[i]||c.kind);
    const schema=practiceModel.wideColumns(count,wideKinds);
    $('practice-wide-types').replaceChildren();$('practice-wide-column').replaceChildren();
    schema.forEach((c,i)=>{
      const label=document.createElement('label');label.textContent=c.label;
      const select=document.createElement('select');select.setAttribute('aria-label',c.label+' 자료형');
      for(const [kind,text] of [['integer','정수 · INTEGER'],['text','문자열 · TEXT'],['symbols','기호 포함 문자열 · TEXT']]){const option=document.createElement('option');option.value=kind;option.textContent=text;select.appendChild(option);}select.value=c.kind;
      select.addEventListener('change',()=>{const selectedKindChanged=i===Number($('practice-wide-column').value);wideKinds[i]=select.value;syncWideFields();if(selectedKindChanged)fillPracticePreset();buildPractice();});
      label.appendChild(select);$('practice-wide-types').appendChild(label);
      const option=document.createElement('option');option.value=String(i);option.textContent=c.label+' · '+(c.kind==='integer'?'정수':c.kind==='text'?'문자열':'기호 포함 문자열');$('practice-wide-column').appendChild(option);
    });
    $('practice-wide-column').value=String(Math.min(selected,count-1));
  }
  function saveText(filename, text, type='text/plain;charset=utf-8') {
    const blob=new Blob([(filename.endsWith('.sql')?'':'\ufeff')+text],{type}), url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function renderSQL() {
    $('practice-sql').textContent=practice ? practice[sqlPart] : '';
    document.querySelectorAll('[data-sql]').forEach(button=>{const active=button.dataset.sql===sqlPart;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  }
  function buildPractice() {
    $('practice-error').textContent='';
    try {
      practice=practiceModel.generate({type:$('practice-type').value,column:$('practice-column').value,columnCount:$('practice-column-count').value,columnKinds:wideKinds,wideColumn:$('practice-wide-column').value,total:$('practice-total').value,percent:$('practice-percent').value,repeats:$('practice-repeats').value,target:$('practice-target').value,other:$('practice-other').value,values:$('practice-values-list').value});
      $('practice-summary').textContent=practice.label+' · '+format(practice.total)+'행'+(practice.columnCount?' · '+practice.columnCount+'컬럼':'');
      $('practice-values').textContent=(practice.columnLabel?'조회 컬럼 '+practice.columnLabel+' · ':'')+'조회값 '+JSON.stringify(practice.target)+' / '+(practice.pool ? '혼합 목록 '+practice.pool.length+'개' : '다른 값 '+JSON.stringify(practice.other))+' · 조회 '+format(practice.matches)+'행 ('+format(practice.actualPercent)+'%) · 각 방식 '+practice.repeats+'회';
      $('practice-sql-state').textContent='실습 SQL을 만들었어요. 같은 DB 연결에서 준비 → 측정 → 결과 순서로 실행하세요. 이 앱에서는 실행하지 않습니다.';
      $('practice-type-note').textContent=$('practice-type').value==='wide' ? '전체 3~30컬럼, 최대 100만 행, 방식별 최대 30회입니다. 조회할 컬럼의 두 값을 바꿀 수 있고 나머지 컬럼에는 가상 예시 값을 넣습니다. 한 번 만든 표를 두 방식으로 측정합니다.' : $('practice-type').value==='record' ? '한 행에 실제 INTEGER 수량과 TEXT 지역·코드·기호가 함께 들어갑니다. 조회할 컬럼의 두 값을 바꿀 수 있고 다른 컬럼은 예시 값으로 유지합니다.' : $('practice-type').value==='integer' ? '조회할 값과 나머지 값에 정수를 넣으세요. 논문과 동일한 데이터나 실험 환경을 재현한 것은 아닙니다.' : $('practice-type').value==='mixed' ? '한 TEXT 컬럼에 숫자 모양 값·글자·기호를 섞어요. 조회값은 아래 목록에 있어야 하며, 나머지 행에는 다른 목록 값을 고르게 배치합니다.' : 'TEXT형 · 1~80자 · 한글, 공백, 기호, 따옴표도 가능해요. = 비교로 문자 자체를 조회합니다.';
      $('practice-structure-note').textContent=practice.type==='record'?'선택한 조회 컬럼에만 인덱스를 만들고 SELECT *로 행 전체를 읽습니다. 표본에 여러 자료형이 함께 있어도 같은 테이블·같은 쿼리의 두 스캔 방식을 비교합니다.':practice.type==='mixed'?"한 TEXT 컬럼에 여러 내용이 섞입니다. 100도 문자열 '100'으로 저장하며 실제 정수형과 구분합니다.":'문자열과 기호 포함 문자열은 TEXT형이고, 정수 실습은 INTEGER형입니다.';
      $('practice-record-preview').hidden=!practice.previewRows;
      $('practice-record-rows').replaceChildren();$('practice-preview-head').replaceChildren();
      if(practice.previewRows){
        const schema=practice.schema||Object.entries(practiceModel.columns).map(([key,c])=>({key,...c})),head=document.createElement('tr');
        schema.forEach(c=>{const cell=document.createElement('th');cell.scope='col';cell.textContent=c.label+' · '+(c.kind==='integer'?'INTEGER':'TEXT');head.appendChild(cell);});$('practice-preview-head').appendChild(head);
        practice.previewRows.forEach(row=>{const tr=document.createElement('tr');for(const c of schema){const cell=document.createElement('td');cell.textContent=String(row[c.key]);tr.appendChild(cell);}$('practice-record-rows').appendChild(tr);});
      }
      $('download-sql').disabled=false; $('use-practice').disabled=false; renderSQL();
    } catch(error) {
      practice=null; $('practice-error').textContent=error.message; $('download-sql').disabled=true; $('use-practice').disabled=true; renderSQL();
      $('practice-summary').textContent='입력값을 확인해 주세요.'; $('practice-values').textContent=''; $('practice-sql-state').textContent='입력을 수정하고 실습 SQL을 다시 만들어 주세요.';$('practice-record-preview').hidden=true;
    }
  }
  function invalidatePractice() {
    practice=null; $('download-sql').disabled=true; $('use-practice').disabled=true; $('practice-use-feedback').textContent='';
    $('practice-summary').textContent='설정을 바꿨어요.'; $('practice-values').textContent='실습 SQL 만들기를 눌러 새 설정을 적용하세요.';$('practice-record-preview').hidden=true;
    $('practice-sql-state').textContent='새 설정으로 SQL을 만들어야 저장할 수 있어요.'; renderSQL();
  }
  $('practice-form').addEventListener('input',event=>{if(event.target!==$('practice-column-count'))invalidatePractice();});
  $('practice-form').addEventListener('submit',event=>{event.preventDefault();buildPractice();});
  function showPracticeFields(){const mixed=$('practice-type').value==='mixed';$('practice-other-single').hidden=mixed;$('practice-mixed-list').hidden=!mixed;$('practice-record-column').hidden=$('practice-type').value!=='record';$('practice-wide-settings').hidden=$('practice-type').value!=='wide';}
  function fillPracticePreset(){const preset=$('practice-type').value==='wide'?practiceModel.types[wideKinds[Number($('practice-wide-column').value)]]:$('practice-type').value==='record'?practiceModel.columns[$('practice-column').value]:practiceModel.types[$('practice-type').value];if(!preset)return;$('practice-target').value=preset.target;$('practice-other').value=preset.other;if($('practice-type').value==='mixed')$('practice-values-list').value=preset.examples.join('\n');}
  $('practice-type').addEventListener('change',()=>{fillPracticePreset();showPracticeFields();buildPractice();});
  $('practice-column').addEventListener('change',()=>{fillPracticePreset();buildPractice();});
  $('practice-wide-column').addEventListener('change',()=>{fillPracticePreset();buildPractice();});
  $('practice-column-count').addEventListener('input',()=>{try{const previous=$('practice-wide-column').value;syncWideFields();if(previous!==$('practice-wide-column').value)fillPracticePreset();buildPractice();}catch(error){invalidatePractice();$('practice-error').textContent=error.message;}});
  document.querySelectorAll('[data-sql]').forEach(button=>button.addEventListener('click',()=>{sqlPart=button.dataset.sql;renderSQL();$('sql-details').open=true;}));
  $('download-sql').addEventListener('click',()=>{if(practice)saveText('scanlab-'+practice.type+'-practice.sql',practice.sql,'application/sql;charset=utf-8');});
  $('use-practice').addEventListener('click',()=>{
    if(!practice)return;
    practiceContext={label:practice.label,total:practice.total,matches:practice.matches,percent:practice.actualPercent,repeats:practice.repeats,column:practice.column,columnLabel:practice.columnLabel,columnCount:practice.columnCount,schema:practice.schema};
    $('experiment-type').value=practice.type;$('comparison-column').value=practice.column||'unspecified';$('comparison-column-label').hidden=practice.type!=='record';$('selectivity').value=String(practice.actualPercent);$('conditions').checked=false;
    csvContext=null;sampleType=null;invalidate();resetErrors();
    $('practice-use-feedback').textContent='유형과 실제 선택도를 아래 비교 칸에 연결했어요. 측정 결과는 직접 붙여 넣고 조건 확인을 표시하세요.';
    $('sample-note').textContent='생성한 '+practice.label+' 실습의 결과를 직접 넣어 주세요. 아직 측정값은 입력되지 않았어요.';
    $('seq-input').value='';$('index-input').value='';document.querySelectorAll('[data-sample]').forEach(b=>b.classList.remove('active'));
    ScanFlow.show('compare',1,false);
    $('measure').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  });
  syncWideFields();showPracticeFields();buildPractice();
  document.addEventListener('scanlab:csv-connect',event=>{
    if(csvContext?.experimentId===event.detail.experimentId){ScanFlow.show('csv',3);return;}
    csvContext=event.detail;practiceContext=null;sampleType=null;
    $('experiment-type').value='csv';$('comparison-column-label').hidden=true;$('selectivity').value=String(csvContext.percent);$('conditions').checked=false;
    $('seq-input').value='';$('index-input').value='';invalidate();resetErrors();
    $('sample-note').textContent=csvContext.sourceLabel+' 실험이 연결됐어요. seq_json과 index_json 셀 전체를 넣어 주세요.';
    document.querySelectorAll('[data-sample]').forEach(b=>b.classList.remove('active'));
    ScanFlow.show('csv',3,false);
    $('measure').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  });
  rows.forEach((row, i) => { const option = document.createElement('option'); option.value = i; option.textContent = row.selectivity+'% · '+row.source.replace('표 3 · ','').replace('표 6 · ',''); $('paper-case').appendChild(option); });
  $('paper-case').value = '1';
  function showPaper() {
    const row = rows[Number($('paper-case').value)];
    $('row-count').textContent = '100만 행 중 '+format(1e6 * row.selectivity / 100)+'행에 해당해요. 각 방식 '+row.n+'회 측정.';
    $('paper-source').textContent = row.source;
    $('paper-seq-value').textContent = format(row.seq)+' ms';
    $('paper-index-value').textContent = format(row.index)+' ms';
    const maximum = Math.max(row.seq, row.index);
    $('paper-seq-bar').style.width = row.seq / maximum * 100+'%';
    $('paper-index-bar').style.width = row.index / maximum * 100+'%';
    $('paper-verdict').textContent = row.label;
    $('paper-explanation').textContent = row.label === '우위 불분명' ? '인덱스의 평균은 더 짧지만, 측정값의 변동까지 고려하면 우위를 확정하기 어려워요. 평균이 짧다는 것과 확실히 우세하다는 것은 구분해야 해요.' : '이 실행에서는 일반 인덱스 스캔이 우세했어요. 다른 테이블·캐시·하드웨어에서도 같다고 단정할 수는 없어요.';
    $('paper-variation').textContent = '표본 표준편차: 순차 '+format(row.seqSd)+' ms / 인덱스 '+format(row.indexSd)+' ms · 표의 반올림된 값';
    $('prediction-feedback').textContent = '';
  }
  $('paper-case').addEventListener('change', showPaper);
  $('compare-prediction').addEventListener('click', () => {
    const row = rows[Number($('paper-case').value)];
    const predicted = document.querySelector('input[name=prediction]:checked').value;
    const actual = row.label === '우위 불분명' ? 'unclear' : 'index';
    $('prediction-feedback').textContent = predicted === actual ? '이번 결과와 예상이 맞아요. '+(actual === 'unclear' ? '더 빠른 평균만 보고 우위를 정하지 않는 것이 핵심이에요.' : '이 결과의 실험 조건도 함께 확인해 보세요.') : '이번 결과는 예상과 달라요. '+(actual === 'unclear' ? '평균 차이가 있어도 측정 변동에 비해 충분히 크지 않았어요.' : '100%까지도 평균 역전은 없었어요. 선택도만으로 스캔 방식을 단정할 수 없어요.');
  });
  showPaper();
  const samples = {
    clear:{seq:[50,52,49,51,50,48,53,51,49,50],index:[20,21,19,20,20,22,18,21,19,20],selectivity:'10'},
    unclear:{seq:[60,100,70,110,55,105,65,115,75,95],index:[50,95,60,105,45,100,55,110,70,90],selectivity:'80'},
    seq:{seq:[40,42,39,41,40,38,43,41,39,40],index:[75,80,78,82,76,81,79,77,80,78],selectivity:'90'}
  };
  function sampleJSON(values, scan) { return JSON.stringify(values.map((time,i) => ({Plan:{'Node Type':scan,'Actual Rows':10000,'Actual Loops':1,'Shared Hit Blocks':scan === 'Seq Scan' ? 100 : 40,'Shared Read Blocks':i === 0 ? 2 : 0},'Execution Time':time})),null,2); }
  function invalidate() {
    globalThis.ScanCost?.clear();
    latest = null; $('download-report').disabled = true; $('analysis-result').hidden = true; $('empty-result').hidden = false;
    $('empty-result').querySelector('p').textContent = '입력을 비교하면 판정과 계산 근거가 여기에 나타납니다. 수정한 값은 다시 비교해 주세요.';
  }
  function resetErrors() { for (const id of ['seq','index']) { $(id+'-error').textContent=''; $(id+'-input').removeAttribute('aria-invalid'); } $('meta-error').textContent=''; $('selectivity').removeAttribute('aria-invalid'); }
  document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.sample, sample = samples[key === 'json' ? 'clear' : key];
    $('seq-input').value = key === 'json' ? sampleJSON(sample.seq,'Seq Scan') : sample.seq.join(', ');
    $('index-input').value = key === 'json' ? sampleJSON(sample.index,'Index Scan') : sample.index.join(', ');
    $('selectivity').value = sample.selectivity; $('conditions').checked = true;
    sampleType = key; practiceContext=null;csvContext=null; $('experiment-type').value='unspecified';$('comparison-column').value='unspecified';$('comparison-column-label').hidden=true; invalidate(); resetErrors();
    $('sample-note').textContent = '학습용 가상 데이터가 입력됐어요. ‘측정값 비교하기’를 눌러 직접 결과를 확인하세요. 논문의 원자료가 아닙니다.';
    document.querySelectorAll('[data-sample]').forEach(b => b.classList.toggle('active', b === button));
  }));
  for (const id of ['seq-input','index-input','selectivity','conditions','experiment-type','comparison-column','environment-note']) $(id).addEventListener('input', () => {
    if(id==='selectivity'||id==='experiment-type'||id==='comparison-column')practiceContext=null;
    if(id==='experiment-type'){csvContext=null;$('comparison-column-label').hidden=$('experiment-type').value!=='record';$('comparison-column').value='unspecified';}
    if(id==='seq-input'||id==='index-input')sampleType=null;
    if(id==='seq-input'||id==='index-input')browserResultActive=false;
    $('sample-note').textContent = sampleType!==null ? '학습용 가상 예시의 측정값입니다. 변경한 실험 맥락으로 다시 비교해 주세요.' : '직접 입력하거나 수정한 데이터입니다. 서버로 전송하거나 브라우저에 영구 저장하지 않습니다.';
    if(sampleType===null)document.querySelectorAll('[data-sample]').forEach(b => b.classList.remove('active')); invalidate();
  });
  $('clear-input').addEventListener('click', () => { $('measure-form').reset(); sampleType=null; practiceContext=null;csvContext=null;$('comparison-column-label').hidden=true; resetErrors(); invalidate(); document.querySelectorAll('[data-sample]').forEach(b=>b.classList.remove('active')); $('sample-note').textContent='예시 버튼을 선택하거나 자신의 측정값을 넣어 주세요.'; $('seq-input').focus(); });
  for(const name of ['seq','index']){
    let fileVersion=0;
    $(name+'-input').addEventListener('input',()=>{fileVersion++;});
    $('measure-form').addEventListener('reset',()=>{fileVersion++;});
    document.querySelectorAll('[data-sample]').forEach(button=>button.addEventListener('click',()=>{fileVersion++;}));
    document.addEventListener('scanlab:csv-connect',()=>{fileVersion++;});
    $('use-practice').addEventListener('click',()=>{fileVersion++;});
    $(name+'-json-file').addEventListener('change',async()=>{
      const file=$(name+'-json-file').files[0];if(!file)return;
      $(name+'-input').value='';$(name+'-input').dispatchEvent(new Event('input'));
      const version=++fileVersion;
      try{
        if(file.size>800000)throw new Error('결과 JSON 파일이 너무 커요. 최대 200,000자 범위의 결과를 넣어 주세요.');
        const value=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
        if(version!==fileVersion)return;
        if(value.length>200000)throw new Error('결과 JSON은 최대 200,000자까지 지원해요.');
        $(name+'-input').value=value;$(name+'-input').dispatchEvent(new Event('input'));
        $(name+'-error').textContent='';$(name+'-input').removeAttribute('aria-invalid');
      }catch(error){if(version===fileVersion){$(name+'-error').textContent=error.message;}}
    });
  }
  document.addEventListener('scanlab:browser-result',event=>{
    const data=event.detail;
    document.dispatchEvent(new CustomEvent('scanlab:csv-connect',{detail:data}));
    $('seq-input').value=JSON.stringify(data.seq);$('index-input').value=JSON.stringify(data.index);
    $('seq-input').dispatchEvent(new Event('input'));$('index-input').dispatchEvent(new Event('input'));
    $('conditions').checked=true;
    browserResultActive=true;
    $('environment-note').value='브라우저 내 PostgreSQL · PGlite '+data.engineVersion+' · PostgreSQL '+data.serverVersion+' · 임시 메모리 DB · 앱이 스캔 방식과 조회 행 수 확인';
    $('sample-note').textContent='선택한 CSV 전체를 브라우저 내 PostgreSQL에서 실제 측정했습니다. 각 방식의 준비 실행 1회는 결과에서 제외했습니다.';
    $('measure-form').requestSubmit();
  });
  function makeReport(result, seq, index, selectivity, confirmed, isSample, actions, bufferNote) {
    const scope = isSample ? '가상 예시에 설정된 동일 조건. 사용자가 실제 실험을 확인한 기록이 아님.' : csvContext?.execution==='browser'&&browserResultActive ? '앱이 같은 임시 DB·조회 조건과 실제 스캔 방식·조회 행 수를 확인함. PC의 배경 부하와 캐시가 항상 동일했다는 뜻은 아님.' : confirmed ? '사용자가 동일 조건과 실행 계획을 확인했다고 표시함.' : '동일 조건 또는 실행 계획이 확인되지 않음. 계산 결과만 참고.';
    return ['스캔랩 · 실습 비교 보고서','기반 논문: '+PAPER_DATA.title,'데이터: '+(isSample ? '학습용 가상 예시 (논문 원자료 아님)' : '사용자가 직접 입력한 측정값'), '선택도: '+(selectivity === null ? '입력하지 않음' : format(selectivity)+'%'),'조건 확인: '+scope,'','판정: '+verdicts[result.winner], '순차: n='+result.seq.n+', 평균='+format(result.seq.mean)+' ms, 표본 표준편차='+format(result.seq.sd)+' ms','일반 인덱스: n='+result.index.n+', 평균='+format(result.index.mean)+' ms, 표본 표준편차='+format(result.index.sd)+' ms','D = 순차 평균 − 인덱스 평균 = '+format(result.difference)+' ms','2SE = 2 × √(s²순차/n순차 + s²인덱스/n인덱스) = '+format(result.threshold)+' ms','D > 2SE: 인덱스 우위 / D < −2SE: 순차 우위 / 나머지: 우위 불분명','', '순차 입력(ms): '+seq.values.join(', '),'인덱스 입력(ms): '+index.values.join(', '),'',bufferNote,'다음 실습:','- '+actions.join('\n- '),'','해석 범위: 탐색적 비교 기준이며 정식 유의성 검정 또는 95% 신뢰구간이 아님. 선택도로 다른 환경의 성능을 예측하지 않음. 결과는 이 입력과 측정 조건에 한정됨.','입력 계획의 SQL·관계명·필터·개인정보는 보고서에 포함하지 않음.','논문: https://12-web-aleph.vercel.app/paper.html'].join('\n');
  }
  $('measure-form').addEventListener('submit', event => {
    event.preventDefault(); resetErrors(); invalidate();
    const parsed = {}; let firstInvalid = null, selectivity = null;
    for (const name of ['seq','index']) {
      try { parsed[name] = model.parseInput($(name+'-input').value,name); }
      catch (error) { $(name+'-error').textContent = error.message; $(name+'-input').setAttribute('aria-invalid','true'); firstInvalid ||= $(name+'-input'); }
    }
    try { selectivity = model.parseSelectivity($('selectivity').value); }
    catch (error) { $('meta-error').textContent=error.message; $('selectivity').setAttribute('aria-invalid','true'); $('measurement-options').open=true; firstInvalid ||= $('selectivity'); }
    if (firstInvalid) { firstInvalid.focus(); return; }
    let identity;
    try{
      identity=model.checkMetadata(parsed.seq.metadata,parsed.index.metadata,csvContext?.experimentId||null);
      if(identity.verified){
        const meta=parsed.seq.metadata,actual=meta.matched_rows/meta.total_rows*100;
        if(csvContext&&(csvContext.total!==meta.total_rows||csvContext.matches!==meta.matched_rows))throw new Error('결과의 행 수가 연결한 CSV와 달라요. 데이터가 바뀌지 않았는지 확인하세요.');
        if(selectivity!==null&&Math.abs(selectivity-actual)>1e-8)throw new Error('입력한 선택도가 결과의 실제 조회 비율과 달라요. 선택도 입력을 비우거나 실제 비율로 바꾸세요.');
        selectivity=actual;$('selectivity').value=String(actual);$('experiment-type').value='csv';$('comparison-column-label').hidden=true;
      }
    }catch(error){$('meta-error').textContent=error.message;$('seq-input').focus();return;}
    const result = model.compare(parsed.seq.values, parsed.index.values), confirmed = $('conditions').checked;
    $('empty-result').hidden=true; $('analysis-result').hidden=false;
    $('result-tag').textContent=sampleType!==null ? '체험용 가상 실행 시간 · 실제 CSV 측정 결과 아님' : confirmed ? '논문의 방법으로 계산 · 사용자 조건 확인 표시' : '계산 결과 · 측정 조건 확인 필요';
    $('metadata-note').textContent=identity.verified||$('experiment-type').value==='csv'?identity.message:'';
    $('result-verdict').textContent={index:'인덱스로 찾는 쪽이 더 빨랐어요',seq:'차례로 읽는 쪽이 더 빨랐어요',unclear:'어느 쪽이 더 빠른지 확정하기 어려워요'}[result.winner];
    const absoluteDifference = Math.abs(result.difference);
    $('result-summary').textContent = result.winner === 'unclear' ? '평균 시간에 차이가 있어도, 실행할 때마다 달라지는 폭에 비해 작아요. 더 여러 번 측정해서 확인해 보세요.' : '이 입력에서는 '+(result.winner === 'index' ? '인덱스' : '순차')+' 스캔이 평균 '+format(absoluteDifference)+'ms 빨랐어요. 실행할 때마다 달라지는 폭까지 고려한 비교예요. 결과는 이번 데이터와 조건에 한정돼요.';
    const warnings = [];
    if (!confirmed) warnings.push('같은 쿼리·데이터·환경과 실제 스캔 방식이 확인되기 전에는 성능 개선의 근거로 쓰지 마세요.');
    if($('experiment-type').value==='csv'&&!identity.verified)warnings.push('CSV 실험 식별 정보가 없어 입력값만 비교합니다. 결과 SQL의 두 JSON 셀 전체를 넣으면 식별 정보를 확인할 수 있어요.');
    if (Math.min(result.seq.n,result.index.n) < 10) warnings.push('반복 횟수가 10회보다 적어요. 논문의 기본 실험은 각 방식 10회였어요.');
    if (result.seq.sd === 0 || result.index.sd === 0) warnings.push('한쪽 이상의 측정 변동이 0이에요. 값이 반올림되거나 복제되지 않았는지 확인하세요.');
    if (result.seq.mean === 0 || result.index.mean === 0) warnings.push('평균이 0ms인 입력이 있어요. 측정 정밀도와 단위를 확인하세요.');
    $('result-warning').textContent=warnings.join(' ');
    for (const name of ['seq','index']) { $(name+'-mean').textContent=format(result[name].mean)+' ms'; $(name+'-stats').textContent=result[name].n+'회 · 표준편차 '+format(result[name].sd)+' ms'; }
    $('difference').textContent=(result.difference > 0 ? '+' : '')+format(result.difference)+' ms';
    $('threshold').textContent=format(result.threshold)+' ms';
    const actions = [];
    if (!confirmed) actions.push('같은 SELECT 쿼리·데이터·환경인지 확인하고, 실행 계획이 각각 Seq Scan / Index Scan인지 확인하세요.');
    if (result.winner === 'unclear') actions.push('우위를 단정하지 말고 실행 순서를 섞어 추가로 측정하세요. 추가 실행은 기존 실행과 구분해 기록하세요.');
    else actions.push('결론을 이 실험 조건으로 한정하고, 선택도나 테이블 상태를 바꿨을 때도 다시 측정하세요.');
    actions.push('전원·배경 부하·테이블 크기·캐시와 읽기 블록을 기록하세요. 차이를 한 요인의 효과로 단정하지 마세요.');
    if (Math.min(result.seq.n,result.index.n) < 10) actions.push('가능하다면 각 방식 10회 이상으로 반복해 변동을 다시 확인하세요.');
    const meanRead = p => p.reads ? p.reads.reduce((a,b)=>a+b,0)/p.reads.length : null;
    const seqRead = meanRead(parsed.seq), indexRead = meanRead(parsed.index);
    const bufferNote = seqRead !== null && indexRead !== null ? '최상위 Plan의 평균 Shared Read Blocks: 순차 '+format(seqRead)+' / 인덱스 '+format(indexRead)+'. 읽기 블록은 물리 디스크 I/O와 같지 않으며, 캐시 상태나 원인을 확정하는 지표가 아닙니다.' : '버퍼 정보가 없거나 일부 실행에서 빠져 있어요. 실행 시간만으로 캐시·디스크·테이블 팽창의 영향을 판단하지 않습니다.';
    $('buffer-note').textContent=bufferNote;
    $('next-actions').replaceChildren(); actions.forEach(text => { const li=document.createElement('li'); li.textContent=text; $('next-actions').appendChild(li); });
    latest = makeReport(result,parsed.seq,parsed.index,selectivity,confirmed,sampleType !== null,actions,bufferNote);
    if($('experiment-type').value==='csv'){
      latest+='\n\n실험 데이터 구조: CSV 원래 컬럼·행 사용\n데이터 출처: '+(csvContext?csvContext.sourceLabel:'입력한 CSV 실험 결과 (원본 파일 확인 안 됨)')+'\n식별 정보 점검: '+identity.message;
      if(identity.verified){const meta=parsed.seq.metadata;latest+='\n실험 식별 코드: '+meta.experiment_id+'\n조회 컬럼: '+meta.column+' / '+meta.sql_type+'\n실제 전체 행: '+meta.total_rows+' / 조회 행: '+meta.matched_rows+'\nPostgreSQL 버전: '+meta.server_version;}
      if(csvContext&&(result.seq.n!==csvContext.repeats||result.index.n!==csvContext.repeats))warnings.push('입력 횟수가 연결한 CSV 실험의 예정 횟수와 달라요. JSON 결과가 누락되지 않았는지 확인하세요.');
    }
    const measuredType=practiceModel.types[$('experiment-type').value];
    if(measuredType)$('result-tag').textContent+=' · '+measuredType.label;
    if($('experiment-type').value!=='csv')latest+='\n\n실험 데이터 유형: '+(measuredType?measuredType.label:'미지정');
    if($('experiment-type').value==='record'){
      const measuredColumn=practiceModel.columns[$('comparison-column').value];
      latest+='\n한 행에 INTEGER 수량과 TEXT 지역·상품 코드·표시 기호 컬럼이 함께 있는 표본.\n조회 컬럼: '+(measuredColumn?measuredColumn.label+' ('+measuredColumn.name+')':'미지정');
      if(!measuredColumn)warnings.push('혼합 표본에서 실제로 조회한 컬럼도 기록해 주세요.');
    }
    if(measuredType)latest+='\n논문의 방법을 적용한 확장 실습. 정수형 0·1 원 실험의 결과가 이 실습에서도 성립한다고 가정하지 않음.';
    if(practiceContext){
      latest+='\n연결한 실습 설정: 전체 '+format(practiceContext.total)+'행, 조회 '+format(practiceContext.matches)+'행, 방식별 예정 '+practiceContext.repeats+'회.\n이 설정은 사용자가 비교에 연결한 값이며 실제 데이터·쿼리 조건은 실행 결과에서 별도 확인해야 함.';
      if(result.seq.n!==practiceContext.repeats||result.index.n!==practiceContext.repeats)warnings.push('실제 입력 횟수가 연결한 실습의 예정 횟수와 달라요. 결과를 빠뜨리지 않았는지 확인하세요.');
      if(practiceContext.columnCount)latest+='\n전체 컬럼 수: '+practiceContext.columnCount+'\n조회 컬럼: '+practiceContext.columnLabel+' ('+practiceContext.column+')\n컬럼 자료형: '+practiceContext.schema.map(c=>c.name+' '+(c.kind==='integer'?'INTEGER':'TEXT')).join(', ');
    }
    if(measuredType&&measuredType.sqlType.startsWith('text'))warnings.push('문자열의 길이·정렬 규칙·저장 크기가 결과에 영향을 줄 수 있어요. 기호 유무만의 효과로 단정하지 마세요.');
    $('result-warning').textContent=warnings.join(' ');
    latest+='\n\n실행 환경 메모: '+($('environment-note').value.trim()||'미기록')+'\n결론은 이 데이터·이 실행 환경의 입력값에 한정됩니다. 다른 PC·부하·캐시 상태의 결과를 예측하거나 보정하지 않습니다.';
    if(csvContext?.execution==='browser'&&browserResultActive){
      $('result-tag').textContent='이번 CSV로 직접 측정한 결과';
      latest=latest.replace('데이터: 사용자가 직접 입력한 측정값','데이터: 앱의 브라우저 내 PostgreSQL에서 실제 실행한 측정값');
      latest+='\n측정 환경: PGlite '+csvContext.engineVersion+' / 브라우저 내 임시 메모리 DB. 논문의 일반 PostgreSQL 환경과 달라 성능 재현이나 서버 성능 예측에 사용하지 않음.\n원본 CSV 전체 사용. 각 방식 준비 실행 1회는 제외하고 번갈아 반복 실행함.';
      if(csvContext.cost){const cost=ScanInsights.costSummary(result,csvContext.cost);latest+='\n인덱스 생성 시간 (Worker 경과 시간, 1회): '+format(cost.buildMs)+' ms\n인덱스 크기: '+(cost.indexBytes??'미확인')+' bytes / 표 크기 (인덱스 제외): '+(cost.tableBytes??'미확인')+' bytes\n생성 비용 회수 조회 횟수 (참고): '+(cost.breakEven===null?'제시하지 않음':cost.breakEven+'회')+'\n회수 횟수는 동일 조회의 평균 차이가 유지된다는 가정의 단순 계산. 데이터 수정·유지 비용 등은 제외하며 논문에서 검증한 기준이 아님.';}
    }
    if (warnings.length) latest += '\n\n확인할 점: '+warnings.join(' ');
    $('report-preview').textContent=latest; $('download-report').disabled=false;
    ScanFlow.revealResult();
    $('report').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});
  });
  $('download-report').addEventListener('click', () => {
    if (!latest) return;
    saveText('scanlab-report.txt',latest);
  });
})();
