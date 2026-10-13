(function(root){
  'use strict';
  const MAX_RECORDS=100;
  function createStore(){
    let sequence=0,recordSequence=0,groupsSequence=0,records=[],currentDatasetId=null;
    const datasets=new Map(),groups=new Map(),settingCounters=new Map();
    function register(info){
      if(!Number.isSafeInteger(info.total)||info.total<2||info.total>1000000||!Number.isInteger(info.columns)||info.columns<1||info.columns>30)throw new Error('CSV 규모를 확인하세요.');
      const dataset=Object.freeze({id:'data_'+(++sequence),label:'CSV '+sequence,kind:info.example?'example':'csv',total:info.total,columns:info.columns});
      datasets.set(dataset.id,dataset);settingCounters.set(dataset.id,0);currentDatasetId=dataset.id;prune(dataset.id);return {...dataset};
    }
    function prune(active){
      const used=new Set(records.map(r=>r.datasetId));if(active)used.add(active);
      for(const id of datasets.keys())if(!used.has(id)){datasets.delete(id);settingCounters.delete(id);}
      const usedGroups=new Set(records.map(r=>r.groupId));for(const id of groups.keys())if(!usedGroups.has(id))groups.delete(id);
    }
    function add(input){
      const dataset=datasets.get(input.datasetId);
      if(!dataset)throw new Error('기록할 CSV가 연결되지 않았어요.');
      if(input.execution!=='browser')throw new Error('앱에서 완료한 실제 측정만 기록합니다.');
      if(!Array.isArray(input.columnTypes)||input.columnTypes.length!==dataset.columns||input.columnTypes.some(t=>!['INTEGER','NUMERIC','TEXT'].includes(t)))throw new Error('기록의 자료형 설정이 올바르지 않아요.');
      if(!/^\d[\dA-Za-z.()+ _-]{0,39}$/.test(input.engineVersion||''))throw new Error('측정 엔진 정보를 확인하세요.');
      const seq=root.ScanLab.parseInput(JSON.stringify(input.seq),'seq'),index=root.ScanLab.parseInput(JSON.stringify(input.index),'index');
      const identity=root.ScanLab.checkMetadata(seq.metadata,index.metadata,input.experimentId);
      if(!identity.verified)throw new Error('실험 식별 정보가 있는 결과를 기록합니다.');
      const meta=seq.metadata,columnNumber=Number(meta.column.slice(2));
      if(!/^c_[1-9]\d*$/.test(meta.column)||!/^\d[\dA-Za-z.()+ _-]{0,79}$/.test(meta.server_version))throw new Error('조회 컬럼과 PostgreSQL 버전 정보를 확인하세요.');
      if(dataset.total!==meta.total_rows||!Number.isInteger(columnNumber)||columnNumber<1||columnNumber>dataset.columns||input.columnTypes[columnNumber-1]!==meta.sql_type||input.column!==meta.column||input.sqlType!==meta.sql_type||input.total!==meta.total_rows||input.matches!==meta.matched_rows||seq.values.length!==input.repeats||index.values.length!==input.repeats)throw new Error('기록의 CSV·조건·횟수가 측정 결과와 달라요.');
      for(const [method,bundle] of [['seq',input.seq],['index',input.index]])if(!Array.isArray(bundle.runs)||bundle.runs.some(run=>run.Plan?.['Node Type']!==(method==='seq'?'Seq Scan':'Index Scan')||Number(run.Plan?.['Actual Rows'])!==meta.matched_rows))throw new Error('기록의 실제 스캔 방식·조회 행 수를 확인할 수 없어요.');
      const target=input.target===null?null:root.ScanCSV.typed(input.target,meta.sql_type);
      if(target!==null&&(typeof target!=='string'||[...target].length>2000))throw new Error('조회값을 확인하세요.');
      const result=root.ScanLab.compare(seq.values,index.values);
      const cost=input.cost?root.ScanInsights.validateCost(input.cost):null;
      const groupId=JSON.stringify([dataset.id,input.columnTypes,input.engineVersion,meta.server_version]);
      const existing=records.find(r=>r.experimentId===input.experimentId);
      if(existing){
        if(existing.groupId!==groupId||existing.column!==meta.column||existing.target!==target||existing.matches!==meta.matched_rows||JSON.stringify(existing.cost)!==JSON.stringify(cost)||JSON.stringify(existing.seq)!==JSON.stringify(result.seq)||JSON.stringify(existing.index)!==JSON.stringify(result.index))throw new Error('같은 실험 코드에 서로 다른 결과가 있어요.');
        return {record:copy(existing),duplicate:true,evicted:0};
      }
      if(!groups.has(groupId)){
        const number=(settingCounters.get(dataset.id)||0)+1;settingCounters.set(dataset.id,number);
        groups.set(groupId,{id:groupId,datasetId:dataset.id,label:dataset.label+' · 자료형 설정 '+number,sequence:++groupsSequence});
      }
      const record={id:'record_'+(++recordSequence),experimentId:input.experimentId,datasetId:dataset.id,datasetLabel:dataset.label,groupId,createdAt:new Date().toISOString(),column:meta.column,columnLabel:typeof input.columnLabel==='string'?input.columnLabel.slice(0,200):meta.column,sqlType:meta.sql_type,target,total:meta.total_rows,matches:meta.matched_rows,percent:meta.matched_rows/meta.total_rows*100,seq:result.seq,index:result.index,difference:result.difference,threshold:result.threshold,winner:result.winner,engineVersion:input.engineVersion,serverVersion:meta.server_version};
      record.cost=cost;records.push(record);const evicted=Math.max(0,records.length-MAX_RECORDS);if(evicted)records.splice(0,evicted);prune(currentDatasetId);
      return {record:copy(record),duplicate:false,evicted};
    }
    function copy(record){return {...record,seq:{...record.seq},index:{...record.index},cost:record.cost?{...record.cost}:null};}
    function list(groupId){return records.filter(r=>!groupId||r.groupId===groupId).map(copy);}
    function groupList(){return [...groups.values()].sort((a,b)=>a.sequence-b.sequence).map(g=>({...g,count:records.filter(r=>r.groupId===g.id).length}));}
    function remove(id){const length=records.length;records=records.filter(r=>r.id!==id);prune(currentDatasetId);return length!==records.length;}
    function clear(){records=[];groups.clear();prune(currentDatasetId);if(currentDatasetId)settingCounters.set(currentDatasetId,0);}
    function exportCSV(groupId){
      const rows=list(groupId),labels={index:'인덱스 우위',seq:'순차 우위',unclear:'우위 불분명'};
      const headers=['기록번호','CSV묶음','자료형설정','측정시각UTC','조회컬럼','자료형','전체행수','조회행수','조회비율%','순차횟수','인덱스횟수','순차평균ms','인덱스평균ms','순차표준편차ms','인덱스표준편차ms','평균차이Dms','판정경계2SEms','판정','PGlite버전','PostgreSQL버전'];
      const lines=rows.map(r=>[r.id,r.datasetLabel,groups.get(r.groupId)?.label||'설정',r.createdAt,r.column,r.sqlType,r.total,r.matches,r.percent,r.seq.n,r.index.n,r.seq.mean,r.index.mean,r.seq.sd,r.index.sd,r.difference,r.threshold,labels[r.winner],r.engineVersion,r.serverVersion]);
      headers.push('인덱스생성ms','인덱스bytes','표bytes','생성비용회수조회횟수_참고');
      rows.forEach((r,i)=>{const summary=r.cost?root.ScanInsights.costSummary(r,r.cost):null;lines[i].push(r.cost?.buildMs??'',r.cost?.indexBytes??'',r.cost?.tableBytes??'',summary?.breakEven??'');});
      const escape=value=>'"'+String(value).replace(/"/g,'""')+'"';
      return '\ufeff'+[headers,...lines].map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
    }
    return {register,add,list,groups:groupList,remove,clear,exportCSV,size:()=>records.length};
  }
  root.ScanHistoryCore={createStore,MAX_RECORDS};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ScanHistoryCore;
})(typeof globalThis!=='undefined'?globalThis:this);
