// Demo mode (?demo): a made-up department to try the app with. Every name here is invented.
import { suggestShortName } from './engine.js';

const GIVEN = ['Alex', 'Brenda', 'Calvin', 'Dora', 'Edwin', 'Fiona', 'Gavin', 'Hazel', 'Irwin', 'Janice', 'Kelvin', 'Lorna', 'Marcus', 'Nadia',
  'Oscar', 'Petra', 'Quentin', 'Rosa', 'Silas', 'Tessa', 'Ulric', 'Vera', 'Wilbur', 'Xena', 'Yusuf', 'Zelda'];
const SURNAME = ['Tan', 'Lim', 'Ong', 'Goh', 'Chua', 'Koh', 'Teo', 'Yeo', 'Seah', 'Loh', 'Poh', 'Neo', 'Lau', 'Yap', 'Chew', 'Phua', 'Kwek', 'Sim'];
const MIDDLE = ['Wei Ming', 'Hui Min', 'Jia Hao', 'Li Ting', 'Zhi Xuan', 'Kai Wen', 'Shu Fen', 'Yi Ling', 'Jun Jie', 'Mei Xin'];
const IN_GIVEN = ['Aravind', 'Deepa', 'Harish', 'Kavitha', 'Meena', 'Pradeep', 'Ravi', 'Sunita', 'Anand', 'Lakshmi'];
const IN_SURNAME = ['Pillai', 'Nair', 'Kumar', 'Raman', 'Iyer', 'Menon', 'Rao', 'Krishnan'];

// a small fixed random sequence, so every demo starts the same
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

export function makeDemo(date) {
  const rand = rng(7);
  const pick = a => a[Math.floor(rand() * a.length)];
  const used = new Set();
  const name = i => {
    for (let tries = 0; ; tries++) {
      const n = tries > 50 ? `${pick(GIVEN)} ${pick(SURNAME)} ${pick(MIDDLE)}` : i % 4 === 3 ? `${pick(IN_GIVEN)} ${pick(IN_SURNAME)}` : i % 2 ? `${pick(SURNAME)} ${pick(MIDDLE)}` : `${pick(GIVEN)} ${pick(SURNAME)} ${pick(MIDDLE)}`;
      if (!used.has(n)) { used.add(n); return n; }
    }
  };
  let id = 1;
  const staff = [];
  const add = (role, grade, extra = {}) => {
    const n = name(id);
    const p = { id: 'd' + id++, name: n, aliases: [suggestShortName(n)].filter(s => s && s !== n), role, grade, posting: '', subspecs: [], avoid: [], history: {}, source: 'demo', ...extra };
    staff.push(p);
    return p;
  };
  const seniorGrades = [...Array(4).fill('SC'), ...Array(10).fill('C'), 'VC', ...Array(6).fill('AC'), ...Array(3).fill('RP')];
  const subs = ['cardiac', 'cardiac', 'cardiac', 'paeds', 'paeds', 'paeds', 'neuro', 'neuro', 'thoracic', 'thoracic', 'hpb', 'hpb', 'obs', 'obs'];
  seniorGrades.forEach((g, i) => add('senior', g, { subspecs: subs[i] ? [subs[i]] : [] }));
  const juniorGrades = [...Array(6).fill('Senior resident'), ...Array(12).fill('Junior resident'), ...Array(3).fill('RP'), 'Locum', 'Locum', ...Array(8).fill('MOPEX'), ...Array(5).fill('Rotating resident')];
  const postings = ['P', 'RA', 'L', 'SR', 'Neu', 'Amb', 'Cardiac', '', '', ''];
  juniorGrades.forEach((g, i) => add('junior', g, {
    posting: g === 'MOPEX' || g === 'Locum' ? '' : postings[i % postings.length],
    colour: g === 'Locum' ? 'purple' : g === 'MOPEX' && i % 4 === 0 ? 'green' : '',
  }));
  for (const p of staff) if (p.aliases[0] && staff.some(o => o !== p && o.aliases[0] === p.aliases[0])) p.aliases = [];

  // the month of the chosen date: calls, liver team, leave
  const month = date.slice(0, 7);
  const days = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
  const seniors = staff.filter(p => p.role === 'senior'), juniors = staff.filter(p => p.role === 'junior' && p.grade !== 'MOPEX');
  const cardiac = seniors.filter(p => p.subspecs.includes('cardiac'));
  const junior = { rows: {} }, senior = { rows: {} }, liver = { rows: {} };
  for (let d = 1; d <= days; d++) {
    const j = k => juniors[(d * 5 + k) % juniors.length].name;
    junior.rows[d] = { r1: j(0), r2: j(1), r3: j(2), df: j(3), nf: j(4), s1pm: j(5), sicumo: j(6), icureg: j(7),
      epid: seniors[(d * 3) % seniors.length].name, epin: seniors[(d * 3 + 1) % seniors.length].name };
    senior.rows[d] = { cons: seniors[(d * 7) % seniors.length].name, c1: cardiac[d % cardiac.length].name, c3: j(8),
      sicu: seniors[Math.floor((d - 1) / 7) % seniors.length].name };
    const week = Math.floor((d - 1) / 7);
    liver.rows[d] = { ots: seniors[(week * 5 + 2) % seniors.length].name, otj: juniors[(week * 3 + 10) % juniors.length].name };
  }
  const leave = { entries: [] };
  const day = n => `${month}-${String(Math.min(days, Math.max(1, n))).padStart(2, '0')}`;
  const today = +date.slice(8, 10);
  for (let k = 0; k < 10; k++) {
    const p = staff[(k * 7 + 3) % staff.length];
    const from = today - 2 + Math.floor(rand() * 6);
    leave.entries.push({ name: p.name, from: day(from), to: day(from + Math.floor(rand() * 4)), type: k === 3 ? 'Medical Leave' : k === 6 ? 'Conference Leave' : 'Annual Leave', remarks: '' });
  }
  const notes = { 'KROR 2': 'tkr x2', 'KROR 3': 'acl', 'KROR 5': 'shoulder', 'MCOR 1': 'lap chole', 'MCOR 3': 'eye 5y', 'MCOR 4': 'hernia', 'MCOR 6': 'ent 3y',
    'MOR 1': 'craniotomy', 'MOR 2': 'lscs', 'MOR 3': 'whipple', 'MOR 4': 'vats lobectomy', 'MOR 5': 'eye', 'MOR 12': 'cabg', 'MOR 13': 'avr', 'MOR 15': 'thr', 'MOR 16': 'nil' };
  return { staff, monthly: { [month]: { junior, senior, liver, leave } }, notes };
}
