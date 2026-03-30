const { rcedit } = require('rcedit');
const path = require('path');

const exe = path.join('dist', 'win-unpacked', 'Strava Challenge Tracker.exe');
const ico = path.resolve('icon.ico');

rcedit(exe, { icon: ico })
  .then(() => console.log('Icon patched into exe'))
  .catch(e => { console.error(e); process.exit(1); });
