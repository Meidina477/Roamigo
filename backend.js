// Data layer for M&R Away.
// With a Firebase config: Google sign-in + Firestore, synced live between devices.
// Without one: a demo store in this browser's localStorage, seeded with sample trips.
// Both expose the same small API the page uses: db.collection(path) / db.doc(path),
// user.id() / user.profiles(ids), assets.upload(blob) and photoURL(id).

import { firebaseConfig } from './firebase-config.js';

const FIREBASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
const COLORS = ['#C7361B', '#4F7FBF', '#5F7A43', '#8A5A83', '#D49B32'];
const colorFor = id => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const clean = d => JSON.parse(JSON.stringify(d));
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* photos are resized in the page, then stored as JPEG data URLs under photos/{id} */
async function toDataURL(blob) {
  return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

export async function connect() {
  if (!firebaseConfig || !firebaseConfig.apiKey) return demo();
  return firebase();
}

async function firebase() {
  const [appMod, authMod, fs] = await Promise.all([
    import(FIREBASE + 'firebase-app.js'), import(FIREBASE + 'firebase-auth.js'), import(FIREBASE + 'firebase-firestore.js'),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const store = fs.getFirestore(app);
  try { await authMod.getRedirectResult(auth); } catch {}
  const u = await new Promise(r => { const off = authMod.onAuthStateChanged(auth, x => { off(); r(x); }); });

  const signIn = async () => {
    const p = new authMod.GoogleAuthProvider();
    try { await authMod.signInWithPopup(auth, p); location.reload(); }
    catch (e) {
      if (/popup-blocked|operation-not-supported|popup-closed/.test(e.code || '')) await authMod.signInWithRedirect(auth, p);
      else throw e;
    }
  };
  const signOut = () => authMod.signOut(auth).then(() => location.reload());
  if (!u) return {mode: 'signin', signIn};

  const mapErr = e => {
    const c = e && e.code;
    throw {code: c === 'permission-denied' ? 'invalid_argument' : c === 'resource-exhausted' ? 'quota_exceeded' : 'unavailable', message: String(e && e.message || e)};
  };
  const wrap = d => ({id: d.id, exists: d.exists(), data: () => d.data()});
  const db = {
    collection: p => ({
      onSnapshot: (fn, err) => fs.onSnapshot(fs.collection(store, p), s => fn({docs: s.docs.map(wrap)}), e => err && err({code: e.code, message: e.message})),
      get: async () => ({docs: (await fs.getDocs(fs.collection(store, p))).docs.map(wrap)}),
    }),
    doc: p => ({
      onSnapshot: (fn, err) => fs.onSnapshot(fs.doc(store, p), s => fn(wrap(s)), e => err && err({code: e.code, message: e.message})),
      set: d => fs.setDoc(fs.doc(store, p), clean(d)).catch(mapErr),
      update: d => fs.updateDoc(fs.doc(store, p), clean(d)).catch(mapErr),
      delete: () => fs.deleteDoc(fs.doc(store, p)).catch(mapErr),
    }),
  };

  // who is who: each person writes their own name and picture once they sign in
  const people = {}, peopleSubs = new Set();
  fs.setDoc(fs.doc(store, 'people/' + u.uid), {name: u.displayName || '', avatar: u.photoURL || ''}).catch(() => {});
  fs.onSnapshot(fs.collection(store, 'people'), s => { s.docs.forEach(d => people[d.id] = d.data()); peopleSubs.forEach(f => f()); }, () => {});
  const user = {
    id: async () => u.uid,
    can: async () => null,
    profiles: async ids => Object.fromEntries([].concat(ids).map(id => [id, {id, name: (people[id] || {}).name || '', avatarUrl: (people[id] || {}).avatar || '', color: colorFor(id), isMe: id === u.uid}])),
  };

  const photoCache = {};
  const assets = {
    upload: async blob => {
      const data = await toDataURL(blob);
      if (data.length > 950000) throw {code: 'too_large'};
      const id = uid();
      await fs.setDoc(fs.doc(store, 'photos/' + id), {data}).catch(mapErr);
      return {id};
    },
  };
  const photoURL = async id => {
    if (!(id in photoCache)) photoCache[id] = fs.getDoc(fs.doc(store, 'photos/' + id)).then(s => s.exists() ? s.data().data : '');
    return photoCache[id];
  };

  return {mode: 'firebase', db, user, assets, photoURL, signOut, onPeople: f => peopleSubs.add(f), who: u.displayName || u.email || 'you'};
}

/* ---------- demo mode: localStorage ---------- */
function demo() {
  const KEY = 'two-tickets-demo-v1';
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!data) data = sample();
  const subs = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { throw {code: 'quota_exceeded'}; } finally { subs.forEach(f => f()); } };
  const kids = p => Object.keys(data).filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'));
  const snapC = p => ({docs: kids(p).map(k => ({id: k.slice(p.length + 1), exists: true, data: () => data[k]}))});
  const snapD = p => ({id: p.split('/').pop(), exists: p in data, data: () => data[p]});
  const listen = f => { subs.add(f); setTimeout(f, 0); return () => subs.delete(f); };
  window.addEventListener('storage', e => { if (e.key === KEY) { try { data = JSON.parse(e.newValue) || sample(); } catch {} subs.forEach(f => f()); } });
  const db = {
    collection: p => ({onSnapshot: fn => listen(() => fn(snapC(p))), get: async () => snapC(p)}),
    doc: p => ({
      onSnapshot: fn => listen(() => fn(snapD(p))),
      set: async d => { data[p] = clean(d); save(); },
      update: async d => { if (!(p in data)) throw {code: 'invalid_argument'}; data[p] = {...data[p], ...clean(d)}; save(); },
      delete: async () => { delete data[p]; save(); },
    }),
  };
  const user = {id: async () => 'me', can: async () => true, profiles: async ids => Object.fromEntries([].concat(ids).map(id => [id, {id, name: '', avatarUrl: '', color: colorFor(id), isMe: id === 'me'}]))};
  const assets = {upload: async blob => { const id = uid(); data['photos/' + id] = {data: await toDataURL(blob)}; save(); return {id}; }};
  const photoURL = async id => (data['photos/' + id] || {}).data || '';
  const reset = () => { try { localStorage.removeItem(KEY); } catch {} location.reload(); };
  return {mode: 'demo', db, user, assets, photoURL, reset};
}

function sample() {
  const B = 'trips/tsample-bali';
  const credit = (by, license, file) => ({by, license, url: 'https://commons.wikimedia.org/wiki/File:' + file});
  return {
    [B]: {sample: true, name: 'Bali, slowly', place: 'Ubud, Bali, Indonesia', start: '2026-12-12', end: '2026-12-17', status: 'booked', scene: 'forest', budget: 25000000, currency: 'IDR',
      notes: 'Visa on arrival at the airport. Bring the adapter and reef-safe sunscreen. Book the sunset dinner a week ahead.',
      photo: 'images/bali.jpg', photoCredit: credit('Freddy eduardo', 'CC BY-SA 4.0', 'Tegalalang_Rice_Terraces.jpg')},
    [B + '/tickets/k1']: {kind: 'flight', carrier: 'Garuda Indonesia', number: 'GA 402', from: 'CGK', fromCity: 'Jakarta', to: 'DPS', toCity: 'Denpasar', departDate: '2026-12-12', departTime: '08:40', arriveDate: '2026-12-12', arriveTime: '11:35', seat: '14A, 14B', ref: 'SAMPLE1', note: '20kg bag each. Check in online 24h before.'},
    [B + '/tickets/k2']: {kind: 'flight', carrier: 'Garuda Indonesia', number: 'GA 409', from: 'DPS', fromCity: 'Denpasar', to: 'CGK', toCity: 'Jakarta', departDate: '2026-12-17', departTime: '17:10', arriveDate: '2026-12-17', arriveTime: '18:05', seat: '22C, 22D', ref: 'SAMPLE1'},
    [B + '/stops/s1']: {date: '2026-12-12', time: '13:00', title: 'Driver to Ubud', place: 'Ngurah Rai Airport', note: 'About 90 minutes. The driver waits at arrivals with a sign.'},
    [B + '/stops/s2']: {date: '2026-12-12', time: '17:30', title: 'Check in at the villa', place: 'Ubud'},
    [B + '/stops/s3']: {date: '2026-12-13', time: '07:00', title: 'Tegallalang rice terraces', place: 'Tegallalang', link: 'https://www.google.com/maps/@-8.4312,115.2793,16z', note: 'Go early, before the crowds and the heat.'},
    [B + '/stops/s4']: {date: '2026-12-13', time: '10:30', title: 'Tirta Empul temple', place: 'Tampaksiring', link: 'https://www.google.com/maps/@-8.4154,115.3153,16z', note: 'Sarongs are provided at the entrance.'},
    [B + '/stops/s5']: {date: '2026-12-13', time: '16:30', title: 'Campuhan Ridge walk', place: 'Ubud', link: 'https://www.google.com/maps/@-8.5030,115.2540,16z'},
    [B + '/stops/s6']: {date: '2026-12-13', time: '19:30', title: 'Dinner at Locavore', place: 'Ubud', link: 'https://www.google.com/maps/@-8.5097,115.2625,17z'},
    [B + '/stops/s7']: {date: '2026-12-14', time: '03:30', title: 'Mount Batur sunrise hike', place: 'Kintamani', note: 'Pick-up at 3:30. Bring a jacket, it is cold at the top.'},
    [B + '/stops/s8']: {date: '2026-12-15', time: '15:00', title: 'Couples massage', place: 'Ubud'},
    [B + '/stops/s9']: {date: '2026-12-16', time: '17:45', title: 'Sunset at Uluwatu', place: 'Uluwatu Temple', note: 'Kecak fire dance at 18:00.'},
    [B + '/stops/s10']: {date: '', title: 'Try babi guling', place: 'Ibu Oka, Ubud'},
    [B + '/days/2026-12-15']: {note: 'A slow day. Pool, books, nowhere to be until three.'},
    [B + '/expenses/e1']: {label: 'Return flights for two', amount: 6800000, category: 'transport', status: 'paid', paidBy: 'a', date: '2026-10-02'},
    [B + '/expenses/e2']: {label: 'Villa in Ubud, 5 nights', amount: 9500000, category: 'stay', status: 'paid', paidBy: 'b', date: '2026-10-05'},
    [B + '/expenses/e3']: {label: 'Mount Batur hike', amount: 1400000, category: 'activities', status: 'planned', paidBy: 'a', date: '2026-12-14'},
    [B + '/expenses/e4']: {label: 'Locavore tasting menu', amount: 3200000, category: 'food', status: 'planned', paidBy: 'b', date: '2026-12-13'},
    [B + '/expenses/e5']: {label: 'Airport driver, both ways', amount: 700000, category: 'local', status: 'paid', paidBy: 'a', date: '2026-10-10'},
    'trips/tsample-skye': {sample: true, name: 'Isle of Skye', place: 'Portree, Isle of Skye, Scotland', start: '2027-05-14', end: '2027-05-19', status: 'dreaming', scene: 'mountains', budget: 3200, currency: 'GBP',
      photo: 'images/skye.jpg', photoCredit: credit('Colin', 'CC BY-SA 4.0', 'North_over_the_Quiraing,_Isle_of_Skye.jpg')},
    'bucket/bsample-kyoto': {sample: true, place: 'Kyoto', country: 'Japan', when: 'next-year', scene: 'forest', why: 'Autumn leaves, the temples at dawn, eating our way through Nishiki market.', visited: false, created: '2026-10-19T08:00:00Z',
      photo: 'images/kyoto.jpg', photoCredit: credit('Nina R from Africa', 'CC BY 2.0', 'Kyoto,_Japan_(49667780482).jpg')},
    'bucket/bsample-amalfi': {sample: true, place: 'Amalfi Coast', country: 'Italy', when: 'someday', scene: 'coast', why: 'Lemon granita and a little boat for the day.', visited: false, created: '2026-10-19T08:01:00Z',
      photo: 'images/amalfi.jpg', photoCredit: credit('Bruno Rijsman', 'CC BY-SA 2.0', 'Amalfi_Coast_(Italy,_October_2020)_-_75_(50558355441).jpg')},
    'bucket/bsample-lofoten': {sample: true, place: 'Lofoten', country: 'Norway', when: 'someday', scene: 'snow', why: 'See the northern lights together.', visited: false, created: '2026-10-19T08:02:00Z',
      photo: 'images/lofoten.jpg', photoCredit: credit('Lukas Beck', 'CC BY 4.0', 'Moskenes_Reinebringen_lub_2025-07-21_img09_Aussicht.jpg')},
  };
}
