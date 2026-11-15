const assert = require('node:assert/strict');
const { dailyCollections } = require('../src/lib/daily-collections.ts');

const zone = 'Asia/Kolkata';
const cash = {
  amount: 2.5, isPaid: true, paymentMethod: 'cash',
  paidAt: '2026-11-16T18:29:00Z', updatedAt: '2026-11-17T08:00:00Z',
  refundState: 'processed', refundedAt: '2026-11-16T18:31:00Z',
};
const orders = [
  cash, { ...cash, synthetic: true },
  { amount: 5, isPaid: true, paymentMethod: 'upi_qr',
    fulfilmentEvents: [{ action: 'upi_receipt_verified', at: '2026-11-16T18:30:00Z' }] },
  { amount: 3, isPaid: false, createdAt: '2026-11-17T10:00:00Z', status: 'waiting_cash' },
  { amount: 4, isPaid: true, updatedAt: '2026-11-17T11:00:00Z' },
];
assert.equal(dailyCollections(orders, '2026-11-16', zone).net, 250);
assert.deepEqual(dailyCollections(orders, '2026-11-17', zone), {
  cash: 0, upi: 500, online: 0, refunds: 250, net: 250, unpaid: 1, undated: 1,
});
console.log('Daily collections checks passed.');
const {orderReport,offsetDay}=require('../src/lib/daily-collections.ts');
const records=[
 {id:'web',createdAt:'2026-11-15T12:00:00Z',source:'web',...cash,collectedAt:'2026-11-17T12:00:00Z'},
 {id:'counter',createdAt:'2026-11-16T19:00:00Z',source:'counter',amount:4,status:'waiting_cash',isPaid:false},
 {id:'old',createdAt:'2026-11-10T12:00:00Z',source:'web',amount:3,status:'waiting_cash',isPaid:false},
 {id:'cancel',createdAt:'2026-11-17T08:00:00Z',source:'web',amount:8,status:'cancelled',isPaid:false},
 {id:'test',createdAt:'2026-11-17T08:00:00Z',synthetic:true,amount:4},
];
const report=orderReport(records,zone);
assert.equal(report.days['2026-11-15'].web,1);
assert.equal(report.days['2026-11-16'].cash,250);
assert.equal(report.days['2026-11-17'].net,-250);
assert.equal(report.days['2026-11-17'].received,2);
assert.equal(report.days['2026-11-17'].cancelled,1);
assert.equal(report.days['2026-11-17'].counter,1);
assert.equal(report.days['2026-11-17'].completed,1);
assert.equal(report.outstandingPaise,700);
assert.equal(report.details['2026-11-17'].get('web').events.length,2);
assert.equal(offsetDay('2024-03-01',-1),'2024-02-29');
console.log('Passed order counts, split, outstanding balance, drill-down and date boundaries.');
