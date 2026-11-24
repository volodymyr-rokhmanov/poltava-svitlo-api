const fs = require('fs');
const { chromium } = require('playwright');

const URL = 'https://www.poe.pl.ua/disconnection/power-outages/';
const TARGET_QUEUE = '3.1';

// Перетворює інтервали відключень на повний розклад доби (світло є / світла немає)
function buildFullDaySchedule(offIntervals) {
  const toMinutes = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };
  const toTimeStr = (mins) => {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  const sorted = offIntervals
    .map(([start, end]) => [toMinutes(start), end === '24:00' ? 1440 : toMinutes(end)])
    .sort((a, b) => a[0] - b[0]);

  const timeline = [];
  let cursor = 0;

  for (const [start, end] of sorted) {
    if (start > cursor) {
      timeline.push({
        time: `${toTimeStr(cursor)} - ${toTimeStr(start)}`,
        start: toTimeStr(cursor),
        status: 'on'
      });
    }
    timeline.push({
      time: `${toTimeStr(start)} - ${toTimeStr(end)}`,
      start: toTimeStr(start),
      status: 'off'
    });
    cursor = Math.max(cursor, end);
  }

  if (cursor < 1440) {
    timeline.push({
      time: `${toTimeStr(cursor)} - 24:00`,
      start: toTimeStr(cursor),
      status: 'on'
    });
  }

  return timeline;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Шукаємо рядок формату: "3.1 — 00:00–00:30, 13:00–13:30, 17:00–19:00"
    const lineRegex = new RegExp(`${TARGET_QUEUE}\\s*[—–-]\\s*([0-9:,\\s–-]+)`, 'i');
    const match = bodyText.match(lineRegex);

    let offIntervals = [];
    if (match && match[1]) {
      const pairs = match[1].matchAll(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/g);
      for (const p of pairs) {
        offIntervals.push([p[1], p[2]]);
      }
    }

    const now = new Date().toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const result = {
      queue: TARGET_QUEUE,
      updatedAt: now,
      hours: offIntervals.length > 0 
        ? buildFullDaySchedule(offIntervals) 
        : [{ time: '00:00 - 24:00', start: '00:00', status: 'on' }]
    };

    fs.writeFileSync('schedule_3_1.json', JSON.stringify(result, null, 2));
    console.log('Оновлено:', JSON.stringify(result));
  } finally {
    await browser.close();
  }
}

run();
