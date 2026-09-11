'use strict';
const C = window.BoardCore, D = window.BoardData;
const $ = s => document.querySelector(s);
const fmt = n => Number(n).toFixed(1);
const liveKey = 't04-live-journal-v2';
let current = null, busy = false, replay = C.resetEvaluationState(), timeline = [];
const messages = {
  timeout: ['응답이 너무 늦습니다.', '잠시 후 다시 시도해 주세요.'],
  auth: ['외부 원천이 요청을 거절했습니다.', '데이터 제공처의 공개 접근 상태를 확인한 뒤 다시 시도해 주세요.'],
  rate_limit: ['호출 한도에 도달했습니다.', '요청을 잠시 멈추고 제한이 풀린 뒤 다시 시도해 주세요.'],
  offline: ['네트워크가 연결되지 않았습니다.', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'],
  schema_error: ['응답 형식이 바뀌었습니다.', '정상값은 보존됩니다. 데이터 형식이 복구된 뒤 다시 시도해 주세요.']
};
function text(id, value) { $(id).textContent = value; }
function rowsInto(target, readings, synthetic=false) {
  const host=$(target); host.replaceChildren();
  readings.forEach(r=>{
    const row=document.createElement('div'); row.className='row';
    const top=document.createElement('div'); top.className='rowtop';
    const date=document.createElement('b'); date.textContent=r.record_date;
    const val=document.createElement('strong'); val.textContent=fmt(r.normalized_value)+' '+r.unit;
    top.append(date,val); row.append(top);
    const detail=document.createElement('small');
    detail.textContent='원천 시각 '+(r.source_time||'제공하지 않음')+' · 조회 '+r.fetched_at;
    row.append(detail);
    if(!synthetic){const a=document.createElement('a');a.href=r.source_url;a.textContent=r.source_url;a.target='_blank';a.rel='noreferrer';const p=document.createElement('small');p.append(a);row.append(p);}
    host.append(row);
  });
}
const evidence=D.readings.reduce((s,r)=>C.applySuccessfulReading(s,r),C.resetEvaluationState());
rowsInto('#history',evidence.daily_readings.map(r=>r.reading));
text('#count',evidence.daily_readings.length+' / 2');
const signed=D.readings[1].normalized_value-D.readings[0].normalized_value;
text('#delta','어제 대비 '+(signed>0?'▲ +':signed<0?'▼ ':'• ')+fmt(signed)+' °C');
function showCurrent(r){
  current=r; text('#value',fmt(r.normalized_value));text('#unit',r.unit);
  text('#observed',r.source_time);text('#fetched',r.fetched_at);$('#source').href=r.source_url;
  text('#disp',fmt(r.normalized_value)+' '+r.unit);
}
function status(freshness,label){$('#status').className='status '+freshness;text('#status',label);}
function cacheState(){try{const s=JSON.parse(localStorage.getItem(liveKey));C.validateNormalizedReading(s.current_reading);if(!Array.isArray(s.daily_readings))return null;s.daily_readings.forEach(r=>C.validateNormalizedReading(r.reading));return s;}catch{return null;}}
showCurrent(cacheState()?.current_reading||D.readings[1]);
status('loading','조회 중');
async function fetchLive(){
  if(busy)return;busy=true;$('#refresh').disabled=true;
  status('loading','조회 중');$('#msg').className='msg';text('#msg','실제 공개 원천에서 최신 값을 불러오는 중입니다.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    if(!navigator.onLine)throw Error('offline');
    const res=await fetch(D.api,{signal:controller.signal,cache:'no-store'});
    if(res.status===401||res.status===403)throw Error('auth');
    if(res.status===429)throw Error('rate_limit');
    if(!res.ok)throw Error('schema_error');
    let raw;try{raw=await res.json();}catch{throw Error('schema_error');}
    const value=raw?.current?.temperature_2m, sourceTime=raw?.current?.time;
    if(typeof value!=='number'||!Number.isFinite(value)||raw?.current_units?.temperature_2m!=='°C'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(sourceTime)||raw.utc_offset_seconds!==32400)throw Error('schema_error');
    const fetched=new Date(Date.now()+9*3600000).toISOString().slice(0,19)+'+09:00';
    const reading={signal_id:'seoul-temperature-2m',normalized_value:value,unit:'°C',source_name:'Open-Meteo',source_url:D.api,source_time:sourceTime+(sourceTime.length===16?':00':'')+'+09:00',fetched_at:fetched,record_timezone:'Asia/Seoul',record_date:C.kstDate(fetched)};
    const state=C.applySuccessfulReading(cacheState()||C.resetEvaluationState(),reading);
    showCurrent(state.current_reading);
    text('#raw',fmt(value)+' °C');
    try{
      localStorage.setItem(liveKey,JSON.stringify(state));
      const saved=cacheState()?.current_reading;if(!saved||JSON.stringify(saved)!==JSON.stringify(state.current_reading))throw Error('storage');
      text('#norm',fmt(saved.normalized_value)+' '+saved.unit);
      text('#storage-note','원자료·저장값·화면값이 일치합니다. 제출용 두 기록은 새 조회로 변경되지 않습니다.');
    }catch{
      text('#norm','저장 실패');text('#storage-note','브라우저 저장 공간을 사용할 수 없습니다. 현재 조회값만 표시하며, 공개된 이틀 기록은 보존됩니다.');
    }
    status('fresh','FRESH');text('#msg','실제 공개 원천에서 정상적으로 값을 받았습니다.');
  }catch(e){
    const code=e.name==='AbortError'?'timeout':messages[e.message]?e.message:e instanceof TypeError?'offline':'schema_error';
    status('stale','STALE · 오래된 값');$('#msg').className='msg danger';
    text('#msg',messages[code].join(' ')+' 마지막 정상값과 조회 시각을 그대로 유지했습니다.');
  }finally{clearTimeout(timer);busy=false;$('#refresh').disabled=false;}
}
const fixtures=Object.fromEntries(D.fixtures.map(f=>[f.fixture_id,f]));
function step(id){replay=C.runFixture(replay,fixtures[id]);timeline.push({id,count:replay.daily_readings.length,value:replay.current_reading?.normalized_value,status:replay.status});}
function baseline(){replay=C.resetEvaluationState();timeline=[];step('T04-NORMAL-D1-A');step('T04-NORMAL-D1-B');}
function renderReplay(title,description){
  $('#result').classList.remove('hidden');text('#rt',title);text('#rd',description);
  const s=replay.status;
  $('#test-status').className='status '+(s?.freshness==='stale'?'stale':'fresh');
  text('#test-status',s?.freshness==='stale'?'STALE · 오래된 값':'FRESH · 정상');
  text('#test-value',replay.current_reading?fmt(replay.current_reading.normalized_value)+' '+replay.current_reading.unit:'--');
  text('#test-count',replay.daily_readings.length+'건');
  const comp=replay.last_comparison;
  text('#test-delta',comp.state==='comparable'?'이전 합성 날짜 대비 '+(comp.direction==='decrease'?'-':'+')+fmt(comp.magnitude)+' '+comp.unit:'비교할 다음 날짜 기록이 아직 없습니다.');
  rowsInto('#test-history',replay.daily_readings.map(r=>r.reading),true);
  const list=$('#test-timeline');list.replaceChildren();
  timeline.forEach((t,i)=>{const li=document.createElement('li');li.textContent=(i+1)+'단계: '+t.value+' pt · '+t.count+'건 · '+(t.status.freshness==='stale'?'오래된 값 ('+t.status.error_code+')':'정상');list.append(li);});
  $('#recover').hidden=!s||s.freshness!=='stale';
  text('#test-detail',JSON.stringify(replay,null,2));
}
document.querySelectorAll('[data-e]').forEach(b=>b.addEventListener('click',()=>{
  baseline();step(b.dataset.e);const code=replay.status.error_code;
  renderReplay(messages[code][0],messages[code][1]+' 마지막 정상값 105 pt와 기존 기록 1건을 유지했습니다.');
}));
$('#normal').onclick=()=>{baseline();step('T04-NORMAL-D2');renderReplay('같은 날은 갱신, 다음 날은 새 기록','첫날 100 → 같은 날 105로 갱신해도 1건입니다. 다음 날 120을 저장하면 2건, 변화는 +15 pt입니다.');};
$('#recover').onclick=()=>{if(replay.status?.freshness!=='stale')return;step('T04-RECOVER-D2');renderReplay('정상 복구되었습니다.','오류가 해제되고 다음 합성 날짜 기록을 정확히 1건 추가했습니다.');};
$('#reset').onclick=()=>{replay=C.resetEvaluationState();timeline=[];$('#result').classList.add('hidden');text('#test-detail',JSON.stringify(replay));};
$('#close').onclick=()=>$('#result').classList.add('hidden');
$('#refresh').onclick=fetchLive;
fetchLive();
