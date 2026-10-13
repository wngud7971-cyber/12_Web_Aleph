(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const titles = {demo:'1분 예시 체험',csv:'내 데이터로 실제 실험',paper:'논문의 실제 측정 결과',practice:'큰 예시 표로 실험 준비',compare:'이미 있는 측정값 비교'};
  const sections = ['start','demo-guide','csv-lab','sql-tools','history','prepare','explore','measure','report'];
  let mode='home', step=1, ready=false, demoInputs=false, execution='browser',resultReady=false;
  function show(nextMode, nextStep=1, scroll=true) {
    if (!['home',...Object.keys(titles)].includes(nextMode)) return;
    if (nextMode==='csv' && nextStep>1 && !ready) {
      $('flow-message').textContent='먼저 CSV와 찾을 조건을 정하고 측정을 시작해 주세요.';
      return;
    }
    if(nextMode==='csv'&&nextStep===3&&!resultReady){$('flow-message').textContent='측정이 끝나면 결과가 자동으로 표시됩니다.';return;}
    mode=nextMode; step=nextStep;
    sections.forEach(id=>{$(id).hidden=true;});
    $('flow-nav').hidden=mode==='home';
    $('flow-heading').textContent=titles[mode]||'';
    $('flow-steps').hidden=mode!=='csv';
    $('flow-message').textContent='';
    document.body.dataset.mode=mode;
    if(mode==='home')$('start').hidden=false;
    if(mode==='demo'){
      $('demo-guide').hidden=false;
      $('measure').hidden=!demoInputs;
      $('report').hidden=$('analysis-result').hidden;
    }
    if(mode==='csv'){
      $('csv-lab').hidden=step===3;
      $('csv-data-panel').hidden=step!==1;
      $('csv-run-panel').hidden=step!==2;
      $('measure').hidden=step!==3;
      $('report').hidden=step!==3||$('analysis-result').hidden;
    }
    const browser=mode==='csv'&&execution==='browser';
    $('csv-browser-panel').hidden=!browser;$('csv-manual-panel').hidden=browser;
    $('measure-form').hidden=browser&&step===3;
    $('browser-inputs-toggle').hidden=!browser||step!==3;
    $('browser-inputs-toggle').setAttribute('aria-expanded','false');
    if(browser&&step===3)$('measure').hidden=true;
    $('measure-title').textContent=browser?'측정 원본 자세히 보기':'두 방식의 실행 결과를 넣어 주세요.';
    document.querySelector('[data-flow-step="2"]').textContent=execution==='browser'?'2. 앱에서 측정':'2. DB에서 실행';
    if(mode==='paper')$('explore').hidden=false;
    if(mode==='practice')$('prepare').hidden=false;
    if(mode==='compare'){
      $('measure').hidden=false;
      $('report').hidden=$('analysis-result').hidden;
    }
    $('sample-toolbar').hidden=mode!=='compare';
    $('measurement-guidance').textContent=browser
      ? '원본 CSV 전체로 실행한 결과입니다. 아래에서 시간과 실행 계획을 확인할 수 있어요.'
      : mode==='csv'
      ? 'DB에서 복사한 seq_json을 왼쪽, index_json을 오른쪽에 넣으세요. 셀 전체를 복사하고 표의 제목은 넣지 마세요.'
      : mode==='demo'
      ? '체험용으로 만든 가상 실행 시간이에요. 값을 직접 바꾸면 바꾼 입력값으로 다시 비교할 수 있어요.'
      : '각 방식의 실행 시간 숫자 또는 실행 계획 JSON을 넣으세요. 같은 데이터를 같은 조건으로 측정한 결과끼리 비교하세요.';
    document.querySelectorAll('[data-flow-step]').forEach(button=>{
      const n=Number(button.dataset.flowStep);
      button.disabled=(n>1&&!ready)||(n===3&&!resultReady);
      if(n===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
    });
    document.dispatchEvent(new CustomEvent('scanlab:flow-change',{detail:{mode,step}}));
    if(scroll){
      const target=mode==='home'?$('start'):$('flow-nav');
      (mode==='home'?$('start'):$('flow-heading')).focus({preventScroll:true});
      target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    }
  }
  function revealResult(){ $('report').hidden=false; }
  function setCSVReady(value){
    ready=Boolean(value);
    if(!ready)resultReady=false;
    document.querySelectorAll('[data-flow-step]').forEach(button=>{const n=Number(button.dataset.flowStep);button.disabled=(n>1&&!ready)||(n===3&&!resultReady);});
  }
  function demo(key){
    demoInputs=false;
    $('demo-show-input').setAttribute('aria-expanded','false');
    $('demo-show-input').textContent='예시에 사용한 시간 보기 ↓';
    show('demo',1,false);
    document.querySelector('[data-sample="'+key+'"]').click();
    document.querySelectorAll('[data-demo]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.demo===key));});
    $('measure-form').requestSubmit();
    $('flow-heading').focus({preventScroll:true});
    $('flow-nav').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }
  globalThis.ScanFlow={show,revealResult,setCSVReady,setCSVExecution:value=>{execution=value;},setCSVResultReady:value=>{resultReady=Boolean(value);document.querySelector('[data-flow-step="3"]').disabled=!resultReady;}};
  $('start-demo').addEventListener('click',()=>demo('clear'));
  $('start-csv').addEventListener('click',()=>show('csv'));
  $('demo-to-csv').addEventListener('click',()=>show('csv'));
  $('start-paper').addEventListener('click',()=>show('paper'));
  $('start-practice').addEventListener('click',()=>show('practice'));
  $('start-compare').addEventListener('click',()=>show('compare'));
  $('flow-home').addEventListener('click',()=>show('home'));
  document.querySelectorAll('[data-flow-step]').forEach(button=>button.addEventListener('click',()=>{
    const n=Number(button.dataset.flowStep);
    if(n===3&&ready&&execution==='manual')$('csv-use').click();else show('csv',n);
  }));
  $('browser-inputs-toggle').addEventListener('click',()=>{const visible=$('measure-form').hidden;$('measure-form').hidden=!visible;$('measure').hidden=!visible;$('browser-inputs-toggle').setAttribute('aria-expanded',String(visible));if(visible)$('measure').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});
  document.querySelectorAll('[data-demo]').forEach(button=>button.addEventListener('click',()=>demo(button.dataset.demo)));
  $('demo-show-input').addEventListener('click',()=>{
    demoInputs=!demoInputs;
    $('measure').hidden=!demoInputs;
    $('demo-show-input').setAttribute('aria-expanded',String(demoInputs));
    $('demo-show-input').textContent=demoInputs?'예시 시간 접기 ↑':'예시에 사용한 시간 보기 ↓';
    if(demoInputs)$('measure').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  });
  function openHash(){
    const modes={'#explore':'paper','#prepare':'practice','#csv-lab':'csv','#measure':'compare','#report':'compare'};
    if(modes[location.hash])show(modes[location.hash],1,false);
  }
  addEventListener('hashchange',openHash);
  show('home',1,false);openHash();
})();
