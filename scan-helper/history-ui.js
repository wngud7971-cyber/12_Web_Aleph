(function(){
  'use strict';
  const $=id=>document.getElementById(id),store=ScanHistoryCore.createStore();
  let mode='home',step=1,activeDataset=null,activeLabel='',selectedGroup='',seen=false;
  let chartColumn='',chartRecord='',chartRows=[];
  const format=value=>value!==0&&Math.abs(value)<0.001?value.toExponential(3):value.toLocaleString('ko-KR',{maximumFractionDigits:3});
  const verdicts={index:'인덱스 우위',seq:'순차 우위',unclear:'우위 불분명'};
  function visible(){ $('history').hidden=mode!=='csv'||step!==3||!seen; }
  function condition(record){const name=record.columnLabel||record.column;if(record.target===null)return name+' IS NULL (빈 값)';const value=record.target===''?'빈 문자열':JSON.stringify(record.target);return name+' = '+value;}
  function svgNode(tag,attrs={},text){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;}
  function chartDetails(){
    const r=chartRows.find(row=>row.id===chartRecord);$('history-chart-detail').textContent=r?'기록 '+r.id.replace('record_','')+' · '+condition(r)+' · '+format(r.percent)+'% · 순차 '+format(r.seq.mean)+' ms ('+r.seq.n+'회) / 인덱스 '+format(r.index.mean)+' ms ('+r.index.n+'회) · '+verdicts[r.winner]:'';
    const svg=$('history-chart');for(const marker of svg.querySelectorAll('[data-record]')){const chosen=marker.getAttribute('data-record')===chartRecord;marker.setAttribute('stroke-width',chosen?'3':'1');marker.setAttribute('stroke',chosen?'#233c32':'white');}
  }
  function renderChart(rows){
    $('history-chart-panel').hidden=!rows.length;if(!rows.length){chartRows=[];return;}
    const columns=[...new Set(rows.map(r=>r.column))];if(!columns.includes(chartColumn))chartColumn=columns[0];
    $('history-chart-column').replaceChildren();for(const column of columns){const option=document.createElement('option');option.value=column;option.textContent=column+' · '+rows.find(r=>r.column===column).sqlType;$('history-chart-column').appendChild(option);}$('history-chart-column').value=chartColumn;
    const plot=ScanInsights.plot(rows,chartColumn);chartRows=plot.rows;
    if(!chartRows.some(r=>r.id===chartRecord))chartRecord=chartRows.at(-1).id;
    $('history-chart-record').replaceChildren();for(const r of chartRows){const option=document.createElement('option');option.value=r.id;option.textContent='기록 '+r.id.replace('record_','')+' · '+format(r.percent)+'% · '+r.seq.n+'/'+r.index.n+'회';$('history-chart-record').appendChild(option);}$('history-chart-record').value=chartRecord;
    const svg=$('history-chart');svg.replaceChildren();
    svg.appendChild(svgNode('title',{},chartRows[0].datasetLabel+' · '+chartColumn+' · 조회 비율과 평균 실행 시간'));
    svg.appendChild(svgNode('desc',{},'각 점은 개별 측정 기록의 평균입니다. 세로 막대는 평균 ± 표본 표준편차이며 신뢰구간이 아닙니다. 선으로 연결하지 않습니다.'));
    svg.appendChild(svgNode('rect',{width:800,height:380,fill:'#fffef9'}));
    const text=(x,y,value,extra={})=>svg.appendChild(svgNode('text',{x,y,fill:'#233c32','font-family':'sans-serif','font-size':12,...extra},value));
    text(70,23,chartRows[0].datasetLabel+' · '+chartColumn+' · '+chartRows.length+'개 기록');
    text(490,23,'● 순차 스캔', {fill:'#456a43'});text(630,23,'◆ 인덱스 스캔',{fill:'#5278a4'});
    const x=p=>70+p/100*675,y=v=>310-v/plot.maximum*250;
    for(let i=0;i<=5;i++){const level=plot.maximum*i/5,cy=y(level);svg.appendChild(svgNode('line',{x1:70,x2:745,y1:cy,y2:cy,stroke:'#dce0d4'}));text(61,cy+4,format(level),{'text-anchor':'end'});const percent=i*20;svg.appendChild(svgNode('line',{x1:x(percent),x2:x(percent),y1:60,y2:310,stroke:'#edf0e7'}));text(x(percent),333,percent+'%',{'text-anchor':'middle'});}
    text(70,49,'평균 실행 시간 (ms)');text(405,362,'찾은 행 / 전체 행 · 조회 비율 (%)',{'text-anchor':'middle'});
    for(const r of chartRows)for(const method of ['seq','index']){
      const stats=r[method],color=method==='seq'?'#456a43':'#5278a4',cx=x(r.percent),cy=y(stats.mean),top=y(stats.mean+stats.sd),bottom=y(Math.max(0,stats.mean-stats.sd));
      svg.appendChild(svgNode('line',{x1:cx,x2:cx,y1:top,y2:bottom,stroke:color,'stroke-width':1.5,opacity:.65}));
      for(const yy of [top,bottom])svg.appendChild(svgNode('line',{x1:cx-4,x2:cx+4,y1:yy,y2:yy,stroke:color,opacity:.65}));
      const marker=svgNode(method==='seq'?'circle':'polygon',method==='seq'?{cx,cy,r:5}:{points:(cx)+','+(cy-7)+' '+(cx+7)+','+cy+' '+cx+','+(cy+7)+' '+(cx-7)+','+cy});
      const label='기록 '+r.id.replace('record_','')+' · '+(method==='seq'?'순차':'인덱스')+' · '+format(r.percent)+'% · 평균 '+format(stats.mean)+' ms · 표준편차 '+format(stats.sd)+' ms · '+stats.n+'회';
      for(const [key,value] of Object.entries({fill:color,tabindex:0,role:'button','aria-label':label,'data-record':r.id}))marker.setAttribute(key,String(value));marker.appendChild(svgNode('title',{},label));
      const choose=()=>{chartRecord=r.id;$('history-chart-record').value=r.id;chartDetails();};marker.addEventListener('click',choose);marker.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});svg.appendChild(marker);
    }
    $('history-chart-note').textContent=(chartRows.length===1?'기록이 하나예요. 조건을 바꿔 측정하면 점이 추가돼요. ':'')+'점을 누르거나 아래에서 기록을 골라 상세 결과를 확인하세요. 같은 비율의 점은 겹칠 수 있어요. 표에서 모든 기록을 볼 수 있습니다.';chartDetails();
  }
  function render(){
    const groups=store.groups();if(selectedGroup&&!groups.some(g=>g.id===selectedGroup))selectedGroup=groups.find(g=>g.datasetId===activeDataset)?.id||'';
    $('history-group').replaceChildren();
    if(!selectedGroup){const option=document.createElement('option');option.value='';option.textContent=activeLabel?activeLabel+' · 아직 완료된 기록 없음':'기록 없음';$('history-group').appendChild(option);}
    for(const group of groups){const option=document.createElement('option');option.value=group.id;option.textContent=group.label+' · '+group.count+'개 기록';$('history-group').appendChild(option);}
    $('history-group').value=selectedGroup;$('history-group').disabled=!groups.length;
    const rows=selectedGroup?store.list(selectedGroup):[];
    $('history-count').textContent='현재 묶음 '+rows.length+'개 · 전체 '+store.size()+'/'+ScanHistoryCore.MAX_RECORDS+'개';
    $('history-empty').hidden=Boolean(rows.length);$('history-table-wrap').hidden=!rows.length;$('history-body').replaceChildren();
    rows.forEach((record,index)=>{
      const tr=document.createElement('tr');
      const values=[record.id.replace('record_',''),condition(record),record.column+' · '+record.sqlType,format(record.matches)+' / '+format(record.total)+'행',format(record.percent)+'%',record.seq.n+' / '+record.index.n+'회',format(record.seq.mean)+' ms',format(record.index.mean)+' ms',verdicts[record.winner],record.cost?format(record.cost.buildMs)+' ms / '+(record.cost.indexBytes===null?'용량 미확인':format(record.cost.indexBytes/1048576)+' MiB'):'미측정'];
      values.forEach((text,column)=>{const cell=document.createElement('td');cell.textContent=column===1&&text.length>180?text.slice(0,177)+'…':text;if(column===1)cell.title=text;tr.appendChild(cell);});
      const details=document.createElement('td');details.textContent='D '+format(record.difference)+' / 2SE '+format(record.threshold)+' ms';tr.appendChild(details);
      const actions=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='삭제';button.setAttribute('aria-label',(index+1)+'번째 실험 기록 삭제');button.addEventListener('click',()=>{store.remove(record.id);$('history-feedback').textContent='선택한 기록을 삭제했어요.';render();});actions.appendChild(button);tr.appendChild(actions);
      $('history-body').appendChild(tr);
    });
    renderChart(rows);$('history-save').disabled=!rows.length;$('history-clear').disabled=!store.size();visible();
  }
  $('history-chart-column').addEventListener('change',()=>{chartColumn=$('history-chart-column').value;render();});
  $('history-chart-record').addEventListener('change',()=>{chartRecord=$('history-chart-record').value;chartDetails();});
  $('history-chart-save').addEventListener('click',()=>{
    if(!chartRows.length)return;
    const svg=$('history-chart').cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');for(const marker of svg.querySelectorAll('[data-record]')){marker.removeAttribute('role');marker.removeAttribute('tabindex');marker.removeAttribute('data-record');}
    const text=new XMLSerializer().serializeToString(svg),url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='scanlab-experiment-chart.svg';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('history-feedback').textContent='그래프를 SVG로 저장했어요. 조회값·원본 파일명·컬럼 제목은 포함하지 않습니다.';
  });
  function register(info){const dataset=store.register(info);activeDataset=dataset.id;activeLabel=dataset.label;selectedGroup=store.groups().find(g=>g.datasetId===dataset.id)?.id||'';$('history-again').textContent=dataset.label+' 조건 바꿔 다시 측정 →';render();return dataset;}
  document.addEventListener('scanlab:browser-result',event=>{
    try{
      const result=store.add(event.detail);seen=true;selectedGroup=result.record.groupId;
      $('history-feedback').textContent=result.duplicate?'이미 기록한 실험입니다.':result.evicted?'최근 100개를 보관하기 위해 가장 오래된 기록을 지웠어요.':'측정 결과를 실험 기록에 추가했어요. 조건을 바꾸면 새 행으로 쌓입니다.';
      render();
    }catch(error){seen=true;$('history-feedback').textContent='기록을 추가하지 못했어요. '+error.message;render();}
  });
  $('history-group').addEventListener('change',()=>{selectedGroup=$('history-group').value;render();});
  $('history-again').addEventListener('click',()=>ScanFlow.show('csv',1));
  $('history-clear').addEventListener('click',()=>{store.clear();selectedGroup='';$('history-feedback').textContent='실험 기록을 모두 비웠어요.';render();});
  $('history-save').addEventListener('click',()=>{
    if(!selectedGroup||!store.list(selectedGroup).length)return;
    const url=URL.createObjectURL(new Blob([store.exportCSV(selectedGroup)],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='scanlab-experiment-history.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('history-feedback').textContent='현재 묶음의 기록을 저장했어요. 조회값·원본 파일명·컬럼 제목은 파일에 포함하지 않습니다.';
  });
  document.addEventListener('scanlab:flow-change',event=>{mode=event.detail.mode;step=event.detail.step;visible();});
  globalThis.ScanHistory={register};
})();
