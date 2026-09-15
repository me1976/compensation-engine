const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const context = vm.createContext({ console });
vm.runInContext([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n'), context);
const plan = context.planOccupancyAssignments;
assert.equal(vm.runInContext('isExemptFromOccupancy("ايمن") && !isExcludedFromAll("ايمن")', context), true);
const vacancies = [{period: 1}, {period: 2}];
let result = plan(vacancies, ['A', 'B'], {2:{B:true}}, {}, {A:10,B:23}, {});
assert.deepEqual(Array.from(result), ['B','A'], 'Must reassign A from first period to avoid repetition');
result = plan(vacancies, ['A'], {}, {}, {A:20}, {});
assert.deepEqual(Array.from(result), ['A','A'], 'Repeat only when necessary for coverage');
assert.equal(plan(vacancies, ['A'], {}, {}, {A:24}, {}).filter(Boolean).length, 0);
assert.equal(plan(vacancies, ['A'], {}, {A:5}, {A:20}, {}).filter(Boolean).length, 1);
assert.equal(plan(vacancies, ['A'], {}, {}, {A:20}, {A:3}).filter(Boolean).length, 1);
assert.equal(plan([{period:1},{period:1}], ['A'], {}, {}, {A:20}, {}).filter(Boolean).length, 1);

// Exhaustive independent oracle for small graphs checks maximum coverage and minimum repetitions.
let seed = 42;
const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
for (let trial = 0; trial < 120; trial++) {
  const teachers = ['A','B','C'];
  const slots = Array.from({length:4}, () => ({period:1 + Math.floor(random()*3)}));
  const busy = {}, weekly = {}, daily = {};
  teachers.forEach(t => { weekly[t] = 21 + Math.floor(random()*4); daily[t] = 3 + Math.floor(random()*4); });
  for (let p=1;p<=3;p++) { busy[p]={}; teachers.forEach(t => { if(random()<0.3) busy[p][t]=true; }); }
  let best = [-1, -Infinity];
  const count = {}, used = new Set();
  function enumerate(index, covered) {
    if(index===slots.length) {
      const repeats=Object.values(count).reduce((sum,n)=>sum+Math.max(0,n-1),0);
      if(covered>best[0] || (covered===best[0] && -repeats>best[1])) best=[covered,-repeats];
      return;
    }
    enumerate(index+1,covered);
    for(const t of teachers) {
      const key=t+'|'+slots[index].period;
      if(busy[slots[index].period][t] || used.has(key) || (count[t]||0)>=Math.min(24-weekly[t],6-daily[t])) continue;
      used.add(key); count[t]=(count[t]||0)+1;
      enumerate(index+1,covered+1);
      count[t]--; used.delete(key);
    }
  }
  enumerate(0,0);
  const actual=Array.from(plan(slots,teachers,busy,daily,weekly,{}));
  const selected=actual.filter(Boolean), totals={};
  selected.forEach(t=>totals[t]=(totals[t]||0)+1);
  const repeats=Object.values(totals).reduce((sum,n)=>sum+Math.max(0,n-1),0);
  assert.deepEqual([selected.length,-repeats],best);
}
for (const day of ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس']) {
  for (const absent of [['زغارنه'],['عبدالله','مغربي']]) {
    const output = context.runEngine(day, '2026-09-15', absent);
    assert.equal(output.integrity.allPassed, true);
  }
}
const elements = new Map();
context.document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', style: {} });
    return elements.get(id);
  },
  querySelectorAll() { return [{dataset:{teacher:'زغارنه'}}]; }
};
context.alert = message => { throw new Error(message); };
vm.runInContext('getSelectedDate = () => "2026-09-15"; updateDateDisplay = () => {};', context);
for (const day of ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس']) {
  context.document.getElementById('daySelect').value = day;
  context.runOccupancy();
  assert.equal(vm.runInContext('Object.values(FIELD_SCHEDULE[currentDay]).some(row => Object.values(row).some(c => c.status === LessonStatus.OCCUPANCY && isExemptFromOccupancy(c.teacher)))', context), false);
}
console.log('PASS: occupancy limits, Ayman exclusion, 120 exhaustive comparisons, 10 compensation scenarios, 5 full occupancy runs');
