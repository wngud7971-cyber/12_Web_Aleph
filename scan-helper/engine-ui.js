(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  $('local-launch-note').hidden=location.protocol!=='file:';
  let worker=null,revision=0,context=null;
  function cancel(visible=false){
    if(!worker)return;
    revision++;worker.terminate();worker=null;context=null;
    $('browser-cancel').disabled=true;
    $('csv-form').querySelector('[type="submit"]').disabled=false;
    if(visible){$('browser-status').textContent='측정을 취소했어요. 데이터 선택으로 돌아가 다시 시작할 수 있어요.';$('browser-back').hidden=false;ScanFlow.setCSVResultReady(false);}
  }
  function run(file,config,sourceLabel,recordContext={}){
    cancel();revision++;const version=revision;
    ScanFlow.setCSVExecution('browser');ScanFlow.setCSVReady(true);ScanFlow.setCSVResultReady(false);ScanFlow.show('csv',2);
    $('browser-error').textContent='';$('browser-error-detail').textContent='';$('browser-back').hidden=true;
    $('browser-progress').value=0;$('browser-status').textContent='측정 엔진을 준비합니다.';
    $('browser-experiment').textContent=config.total.toLocaleString('ko-KR')+'행 중 '+config.matches.toLocaleString('ko-KR')+'행 찾기 · 각 방식 '+config.repeats+'회';
    $('browser-cancel').disabled=false;$('csv-form').querySelector('[type="submit"]').disabled=true;
    if(location.protocol==='file:'){
      $('browser-error').textContent='압축을 푼 폴더에서 실행.cmd를 눌러 앱을 열어 주세요. 측정 엔진은 공개 사이트나 이 실행 방법에서 작동합니다.';
      $('browser-status').textContent='앱을 여는 방법을 확인해 주세요.';$('browser-cancel').disabled=true;$('browser-back').hidden=false;$('csv-form').querySelector('[type="submit"]').disabled=false;return;
    }
    try{
      worker=new Worker(new URL('./engine-worker.mjs',document.baseURI),{type:'module'});
      context={experimentId:config.experimentId,total:config.total,matches:config.matches,percent:config.matches/config.total*100,repeats:config.repeats,column:config.column,sqlType:config.sqlType,sourceLabel,execution:'browser',engineVersion:ScanEngineCore.VERSION,datasetId:recordContext.datasetId,columnLabel:recordContext.columnLabel,target:config.target,columnTypes:[...config.types]};
      const fail=message=>{
        if(version!==revision)return;
        $('browser-error').textContent=message;$('browser-status').textContent='측정을 완료하지 못했어요.';$('browser-back').hidden=false;cancel();ScanFlow.setCSVResultReady(false);
      };
      worker.onerror=event=>{event.preventDefault();fail('측정 엔진을 실행하지 못했어요. 압축 전체를 풀고 실행.cmd로 열거나, 최신 Chrome·Edge에서 다시 시도하세요.');};
      worker.onmessage=event=>{
        if(version!==revision)return;const data=event.data;
        if(data.type==='progress'){$('browser-progress').value=data.percent;$('browser-status').textContent=data.text;ScanSQLTools.stage(data.stage,data.query?.method);}
        if(data.type==='error'){$('browser-error-detail').textContent=data.detail||'';fail(data.message);}
        if(data.type==='done'){
          const detail={...context,...data};cancel();ScanFlow.setCSVResultReady(true);
          document.dispatchEvent(new CustomEvent('scanlab:browser-result',{detail}));
        }
      };
      worker.postMessage({file,config});
    }catch(error){cancel();$('browser-error').textContent='이 브라우저에서 측정 기능을 시작하지 못했어요. 최신 Chrome·Edge에서 다시 열어 주세요.';$('browser-back').hidden=false;}
  }
  $('browser-cancel').addEventListener('click',()=>cancel(true));
  $('browser-back').addEventListener('click',()=>ScanFlow.show('csv',1));
  document.addEventListener('scanlab:flow-change',event=>{if(worker&&(event.detail.mode!=='csv'||event.detail.step===1))cancel(true);});
  globalThis.ScanBrowser={run,cancel};
})();
