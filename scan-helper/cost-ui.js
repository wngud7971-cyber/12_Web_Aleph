(function(){
  'use strict';
  const $=id=>document.getElementById(id),format=v=>v!==0&&Math.abs(v)<0.001?v.toExponential(3):v.toLocaleString('ko-KR',{maximumFractionDigits:3});
  let measured=null;
  const bytes=value=>value===null?'측정하지 못했어요':value.toLocaleString('ko-KR')+' bytes · '+format(value/1048576)+' MiB';
  function render(){
    $('cost-error').textContent='';
    if(!measured){$('index-cost').hidden=true;return;}
    $('index-cost').hidden=false;
    try{
      const raw=$('cost-count').value.trim();
      if(!/^\d+$/.test(raw))throw new Error('예상 조회 횟수는 1~10억 사이의 정수로 입력하세요.');
      const value=ScanInsights.costSummary(measured.result,measured.cost,Number(raw));
      $('cost-build').textContent=format(value.buildMs)+' ms';
      $('cost-size').textContent=bytes(value.indexBytes);
      $('cost-table').textContent='표 저장 공간 (인덱스 제외): '+bytes(value.tableBytes);
      $('cost-saving').textContent=value.saving>0?'조회당 평균 '+format(value.saving)+' ms 절약':'인덱스가 조회당 평균 '+format(-value.saving)+' ms 더 걸리거나 같아요.';
      $('cost-break-even').textContent=value.status==='no-saving'?'현재 평균으로는 생성 비용을 회수할 수 없어요.':value.status==='uncertain'?'조회 시간의 우위가 불분명해 회수 횟수를 제시하지 않아요.':value.breakEven===null?'시간 차이가 너무 작아 회수 횟수를 안정적으로 계산하기 어려워요.':'같은 조회 약 '+format(value.breakEven)+'회에서 생성 비용과 누적 절약 시간이 같아지거나 절약이 커져요.';
      $('cost-projection').textContent='평균으로 계산한 '+format(value.count)+'회: 순차 '+format(value.seqTotal)+' ms / 인덱스 생성 + 조회 '+format(value.indexTotal)+' ms. '+(value.netSaving>=0?'인덱스 사용 시 약 '+format(value.netSaving)+' ms 절약.':'생성 비용 포함 시 약 '+format(-value.netSaving)+' ms 추가.');
      if(value.status!=='estimate')$('cost-projection').textContent+=' 이 계산으로 인덱스 사용을 권장하지 않습니다.';
    }catch(error){$('cost-break-even').textContent='예상 횟수를 확인해 주세요.';$('cost-projection').textContent='';$('cost-error').textContent=error.message;}
  }
  document.addEventListener('scanlab:browser-result',event=>{
    measured=null;
    try{const d=event.detail;if(d.cost){measured={cost:ScanInsights.validateCost(d.cost),result:ScanLab.compare(ScanLab.parseInput(JSON.stringify(d.seq),'seq').values,ScanLab.parseInput(JSON.stringify(d.index),'index').values)};}}
    catch(_){measured=null;}
    $('cost-count').value='100';render();
  });
  for(const id of ['seq-input','index-input'])$(id).addEventListener('input',()=>{measured=null;render();});
  document.addEventListener('scanlab:csv-connect',()=>{measured=null;render();});
  // Run after the result bridge has populated the input fields.
  $('cost-count').addEventListener('input',render);
  globalThis.ScanCost={clear:()=>{measured=null;render();}};
})();
