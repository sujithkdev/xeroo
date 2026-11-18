const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {scheduleSlots}=require('../src/lib/checkout-domain.ts');
const rules={workingHoursStart:'08:00',workingHoursEnd:'10:00',slotDurationMinutes:30,minPrepMinutes:0};
for(const [zone,expected] of [['Asia/Kolkata','2026-11-15T03:00:00.000Z'],['Asia/Kathmandu','2026-11-15T02:45:00.000Z'],['Pacific/Kiritimati','2026-11-15T18:30:00.000Z']]){
 const slots=scheduleSlots({...rules,timezone:zone},Date.parse('2026-11-15T00:00:00Z'));
 assert.equal(slots[0],expected);assert.equal(new Set(slots).size,slots.length);
 console.log('PASS timezone',zone);
}
const dst={...rules,timezone:'America/New_York',workingHoursStart:'00:00',workingHoursEnd:'04:00'};
const spring=scheduleSlots(dst,Date.parse('2026-03-08T05:00:00Z'));
assert(spring.includes('2026-03-08T07:00:00.000Z'));
const fall=scheduleSlots(dst,Date.parse('2026-11-01T04:00:00Z'));
assert(fall.includes('2026-11-01T05:30:00.000Z'));
assert(!fall.includes('2026-11-01T06:30:00.000Z'));
assert.throws(()=>scheduleSlots({...rules,timezone:'invalid-zone'}));
console.log('PASS daylight saving gap, repeated slot, invalid timezone');
