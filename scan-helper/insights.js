(function(root){
  'use strict';
  function validateCost(value){
    if(!value||!Number.isFinite(value.buildMs)||value.buildMs<0)throw new Error('인덱스 생성 시간을 확인할 수 없어요.');
    const result={buildMs:value.buildMs,indexBytes:null,tableBytes:null};
    for(const key of ['indexBytes','tableBytes'])if(value[key]!=null){if(!Number.isSafeInteger(value[key])||value[key]<0)throw new Error('저장 공간 정보를 확인할 수 없어요.');result[key]=value[key];}
    return result;
  }
  function costSummary(result,raw,count=100){
    const cost=validateCost(raw);
    if(!Number.isSafeInteger(count)||count<1||count>1000000000)throw new Error('예상 조회 횟수는 1~10억 사이의 정수로 입력하세요.');
    const seq=result.seq.mean,index=result.index.mean;
    if(!Number.isFinite(seq)||seq<0||!Number.isFinite(index)||index<0)throw new Error('조회 평균 시간을 확인하세요.');
    const saving=seq-index;
    const status=saving<=0?'no-saving':result.winner!=='index'?'uncertain':'estimate';
    const quotient=status==='estimate'?cost.buildMs/saving:null;
    const breakEven=quotient===null?null:Math.max(1,Math.ceil(quotient));
    return {...cost,status,saving,breakEven:Number.isSafeInteger(breakEven)?breakEven:null,count,seqTotal:seq*count,indexTotal:cost.buildMs+index*count,netSaving:saving*count-cost.buildMs};
  }
  function plot(records,column){
    const selected=records.filter(r=>r.column===column);
    if(!selected.length)return {rows:[],maximum:1};
    const group=selected[0].groupId,type=selected[0].sqlType;
    if(selected.some(r=>r.groupId!==group||r.sqlType!==type))throw new Error('같은 CSV·자료형·조회 컬럼의 기록끼리 비교하세요.');
    let maximum=0;
    for(const r of selected){
      if(!Number.isFinite(r.percent)||r.percent<0||r.percent>100)throw new Error('조회 비율을 확인하세요.');
      for(const method of ['seq','index']){const s=r[method];if(!Number.isFinite(s.mean)||s.mean<0||!Number.isFinite(s.sd)||s.sd<0)throw new Error('기록의 평균과 변동을 확인하세요.');maximum=Math.max(maximum,s.mean+s.sd);}
    }
    return {rows:selected.map(r=>({...r,seq:{...r.seq},index:{...r.index}})),maximum:maximum>0?maximum*1.1:1};
  }
  root.ScanInsights={validateCost,costSummary,plot};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ScanInsights;
})(typeof globalThis!=='undefined'?globalThis:this);
