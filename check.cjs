const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const C=require('./core.js');
const root=__dirname;
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'data.js'),'utf8'),context);
const D=JSON.parse(JSON.stringify(context.window.BoardData));
const F=Object.fromEntries(D.fixtures.map(f=>[f.fixture_id,f]));
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
const run=(s,id)=>C.runFixture(s,F[id]);
function baseline(){return run(run(C.resetEvaluationState(),'T04-NORMAL-D1-A'),'T04-NORMAL-D1-B');}
check('same day upsert preserves record ID and first fetched time',()=>{const a=run(C.resetEvaluationState(),'T04-NORMAL-D1-A'),b=run(a,'T04-NORMAL-D1-B');assert.equal(a.daily_readings.length,1);assert.equal(b.daily_readings.length,1);assert.equal(b.current_reading.normalized_value,105);assert.equal(a.daily_readings[0].record_id,b.daily_readings[0].record_id);assert.equal(a.daily_readings[0].first_fetched_at,b.daily_readings[0].first_fetched_at);assert.equal(a.current_reading.normalized_value,100);});
check('next KST day adds one row and +15 pt',()=>{const s=run(baseline(),'T04-NORMAL-D2');assert.equal(s.daily_readings.length,2);assert.equal(s.last_delta,15);assert.equal(s.last_comparison.direction,'increase');});
for(const id of ['T04-TIMEOUT','T04-AUTH-401','T04-RATE-429','T04-OFFLINE','T04-SCHEMA-BREAK']){
 check(id+' preserves 105 and one row, sets exact error',()=>{const b=baseline(),s=run(b,id),e=F[id].expected;assert.deepEqual(s.daily_readings,b.daily_readings);assert.deepEqual(s.current_reading,b.current_reading);assert.equal(s.status.freshness,e.freshness);assert.equal(s.status.error_code,e.error_code);assert.equal(s.daily_readings.length,e.row_count);});
 check(id+' recovers with one next-day row; repeated recovery does not duplicate',()=>{const s=run(run(baseline(),id),'T04-RECOVER-D2');assert.deepEqual(s.status,{freshness:'fresh',error_code:'none'});assert.equal(s.daily_readings.length,2);assert.equal(s.daily_readings.filter(r=>r.record_date==='2026-08-25').length,1);assert.equal(s.current_reading.normalized_value,120);assert.equal(s.last_delta,15);assert.equal(run(s,'T04-RECOVER-D2').daily_readings.length,2);});
}
check('KST midnight derives date from actual instant',()=>{assert.equal(C.kstDate('2026-09-11T14:59:59Z'),'2026-09-11');assert.equal(C.kstDate('2026-09-11T15:00:00Z'),'2026-09-12');});
check('actual two dates preserve 23.9,19.2 and -4.7',()=>{let s=C.resetEvaluationState();D.readings.forEach(r=>{s=C.applySuccessfulReading(s,r);});assert.deepEqual(s.daily_readings.map(r=>r.record_date),['2026-09-11','2026-09-12']);assert.equal(s.last_comparison.direction,'decrease');assert.equal(s.last_delta.toFixed(1),'4.7');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'data/history.json'),'utf8')).map(r=>r.normalized_value),[23.9,19.2]);});
check('invalid numeric reading cannot overwrite valid state',()=>{const s=baseline();assert.throws(()=>C.applySuccessfulReading(s,{...F['T04-NORMAL-D2'].payload,normalized_value:NaN}));assert.equal(s.current_reading.normalized_value,105);});
check('public fixture files exactly match embedded fixtures',()=>{for(const file of fs.readdirSync(path.join(root,'official/fixtures'))){const f=JSON.parse(fs.readFileSync(path.join(root,'official/fixtures',file),'utf8'));assert.deepEqual(F[f.fixture_id],f);}});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'official/asset-manifest.json'),'utf8'));
const entries=manifest.files||manifest.assets;
check('official manifest hashes',()=>{assert.ok(entries);for(const f of entries){const rel=f.path||f.file;const expected=f.sha256;assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'official',rel))).digest('hex'),expected,rel);}});
console.log(checks+' checks passed');
