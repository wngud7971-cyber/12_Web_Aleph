(function (root) {
  'use strict';
  const MAX_RUNS = 500, MAX_TIME = 1e9, MAX_LENGTH = 200000;
  const numeric = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  function validTime(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_TIME; }
  function stats(values) {
    let mean = 0, m2 = 0;
    values.forEach((v, i) => { const delta = v - mean; mean += delta / (i + 1); m2 += delta * (v - mean); });
    return { n: values.length, mean, variance: Math.max(0, m2 / (values.length - 1)), sd: Math.sqrt(Math.max(0, m2 / (values.length - 1))) };
  }
  function compare(seqValues, indexValues) {
    for (const values of [seqValues, indexValues]) {
      if (!Array.isArray(values) || values.length < 2 || values.length > MAX_RUNS || !values.every(validTime)) throw new Error('각 방식에 유효한 실행 시간을 2~500개 넣어 주세요.');
    }
    const seq = stats(seqValues), index = stats(indexValues);
    const difference = seq.mean - index.mean;
    const se = Math.sqrt(seq.variance / seq.n + index.variance / index.n), threshold = 2 * se;
    const winner = difference > threshold ? 'index' : difference < -threshold ? 'seq' : 'unclear';
    return {seq, index, difference, se, threshold, winner};
  }
  function jsonDocuments(raw) {
    try { return [JSON.parse(raw)]; } catch (_) { /* Multiple complete JSON documents can follow one another. */ }
    const documents = [];
    let start = -1, depth = 0, quoted = false, escaped = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (start < 0) {
        if (/\s/.test(c)) continue;
        if (c !== '[' && c !== '{') throw new Error('JSON 결과만 넣어 주세요. SQL 문이나 출력 표의 머리글은 빼 주세요.');
        start = i; depth = 1; continue;
      }
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') quoted = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) { try { documents.push(JSON.parse(raw.slice(start, i + 1))); } catch (_) { throw new Error('JSON 문법을 확인해 주세요.'); } start = -1; }
      }
      if (documents.length > MAX_RUNS) throw new Error('각 방식은 최대 500회까지만 비교할 수 있어요.');
    }
    if (start >= 0 || !documents.length) throw new Error('JSON 문법을 확인해 주세요. 중괄호와 대괄호가 모두 닫혀 있어야 해요.');
    return documents;
  }
  function parsePlans(raw, expected) {
    const pending = typeof raw==='string'?jsonDocuments(raw):[raw], records = [];
    let traversed = 0;
    while (pending.length) {
      const value = pending.shift();
      if (++traversed > 10000) throw new Error('JSON 구조가 너무 커요. 실행 결과만 넣어 주세요.');
      if (Array.isArray(value)) { pending.push(...value); continue; }
      if (!value || typeof value !== 'object' || !value.Plan || !validTime(value['Execution Time'])) throw new Error('Plan과 숫자 Execution Time이 있는 EXPLAIN ANALYZE JSON이 필요해요.');
      const scans = [], nodes = [value.Plan];
      let unsupported = false;
      while (nodes.length) {
        const node = nodes.pop();
        if (++traversed > 10000 || !node || typeof node !== 'object' || typeof node['Node Type'] !== 'string') throw new Error('올바른 실행 계획 노드가 필요해요.');
        const type = node['Node Type'];
        if (type.includes('Scan')) scans.push(type);
        if (type.startsWith('Parallel ') || type.includes('Join') || type === 'Nested Loop' || type.startsWith('Gather') || node['Parallel Aware'] === true || Number(node['Workers Launched']) > 0) unsupported = true;
        if (node.Plans !== undefined) { if (!Array.isArray(node.Plans)) throw new Error('Plans는 배열이어야 해요.'); nodes.push(...node.Plans); }
      }
      const required = expected === 'seq' ? 'Seq Scan' : 'Index Scan';
      if (unsupported || scans.length !== 1 || scans[0] !== required) throw new Error('이 칸에는 '+required+' 노드가 하나인 비병렬·단일 대상 실행 계획을 넣어 주세요. 조인·비트맵·인덱스 온리는 비교 범위에서 제외해요.');
      const read = value.Plan['Shared Read Blocks'], hit = value.Plan['Shared Hit Blocks'];
      records.push({time:value['Execution Time'], read:Number.isSafeInteger(read) && read >= 0 ? read : null, hit:Number.isSafeInteger(hit) && hit >= 0 ? hit : null});
      if (records.length > MAX_RUNS) throw new Error('각 방식은 최대 500회까지만 비교할 수 있어요.');
    }
    return {values:records.map(r => r.time), kind:'json', reads:records.every(r => r.read !== null) ? records.map(r => r.read) : null, hits:records.every(r => r.hit !== null) ? records.map(r => r.hit) : null};
  }
  function parseInput(raw, expected) {
    if (typeof raw !== 'string' || raw.length > MAX_LENGTH) throw new Error('입력은 200,000자 이내로 줄여 주세요.');
    raw = raw.trim();
    if (!raw) throw new Error('실행 시간을 2회 이상 넣거나 위의 예시 버튼을 눌러 주세요.');
    let result;
    if (raw[0] === '[' || raw[0] === '{') {
      const documents=jsonDocuments(raw),envelope=documents.length===1&&!Array.isArray(documents[0])?documents[0]:null;
      if(envelope&&Object.prototype.hasOwnProperty.call(envelope,'scanlab')){
        const meta=envelope.scanlab;
        if(!meta||meta.version!==1||meta.method!==expected||typeof meta.experiment_id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(meta.experiment_id)||typeof meta.column!=='string'||!/^c_\d+$/.test(meta.column)||!['INTEGER','NUMERIC','TEXT'].includes(meta.sql_type)||!Number.isSafeInteger(meta.total_rows)||meta.total_rows<1||!Number.isSafeInteger(meta.matched_rows)||meta.matched_rows<1||meta.matched_rows>meta.total_rows||typeof meta.server_version!=='string'||meta.server_version.length>80||!Array.isArray(envelope.runs))throw new Error('CSV 실험의 식별 정보가 올바르지 않거나 다른 방식의 칸에 넣었어요. seq_json / index_json 셀 전체를 알맞은 칸에 넣어 주세요.');
        result=parsePlans(envelope.runs,expected);
        result.metadata={version:1,experiment_id:meta.experiment_id,column:meta.column,sql_type:meta.sql_type,total_rows:meta.total_rows,matched_rows:meta.matched_rows,server_version:meta.server_version};
      }else result=parsePlans(documents,expected);
    }
    else {
      if (/^,|,$|,\s*,/.test(raw)) throw new Error('쉼표 사이에 비어 있는 측정값이 있어요. 숫자를 넣거나 쉼표를 지워 주세요.');
      const tokens = raw.split(/[\s,]+/);
      if (!tokens.every(t => numeric.test(t))) throw new Error('숫자만 넣어 주세요. 단위(ms), 음수, 문자는 빼 주세요.');
      const values = tokens.map(Number);
      if (!values.every(validTime)) throw new Error('실행 시간은 0~1,000,000,000ms의 유한한 숫자여야 해요.');
      result = {values, kind:'numbers', reads:null, hits:null};
    }
    if (result.values.length < 2) throw new Error('한 번의 측정으로는 변동을 계산할 수 없어요. 각 방식에 2회 이상 넣어 주세요.');
    if (result.values.length > MAX_RUNS) throw new Error('각 방식은 최대 500회까지만 비교할 수 있어요.');
    return result;
  }
  function parseSelectivity(raw) {
    raw = raw.trim();
    if (!raw) return null;
    if (!numeric.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > 100) throw new Error('선택도는 0~100 사이의 숫자만 넣어 주세요. % 기호는 빼 주세요.');
    return Number(raw);
  }
  function checkMetadata(seq,index,expectedId=null){
    if(!seq||!index)return {verified:false,message:'실험 식별 정보가 양쪽 모두에 없어 데이터·조회 조건의 일치를 자동 확인하지 못했어요.'};
    for(const key of ['experiment_id','column','sql_type','total_rows','matched_rows','server_version'])if(seq[key]!==index[key])throw new Error('두 결과의 '+({experiment_id:'실험 식별 코드',column:'조회 컬럼',sql_type:'자료형',total_rows:'전체 행 수',matched_rows:'조회 행 수',server_version:'PostgreSQL 버전'}[key])+'가 달라요. 같은 준비·측정 SQL에서 나온 두 결과를 넣어 주세요.');
    if(expectedId&&seq.experiment_id!==expectedId)throw new Error('결과가 현재 연결한 CSV 실험과 달라요. 해당 SQL을 다시 측정하거나 올바른 실험을 비교에 연결하세요.');
    return {verified:true,message:'양쪽 결과의 실험 식별 코드·조회 컬럼·자료형·행 수·PostgreSQL 버전이 일치해요. 전원·부하·캐시 상태는 별도로 확인해야 합니다.'};
  }
  const api = {stats, compare, parseInput, parseSelectivity,checkMetadata};
  root.ScanLab = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
