// Sends the app's reminder notifications as Web Push.
// Runs every hour from .github/workflows/reminders.yml and sends whatever is due
// at the current hour in your time zone. Settings come from the PUSH_CONFIG secret
// (the "setup code" copied from the app: Settings → Notifications).
//
//   PUSH_CONFIG='…' node scripts/send-reminders.mjs            # due reminders now
//   PUSH_CONFIG='…' REMINDER_MODE=test node scripts/send-reminders.mjs

import webpush from 'web-push';
import { WORKOUTS, DAY_NAMES, workoutForWeekday } from '../js/plan.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function workoutSummary(w) {
  const sets = w.exercises.reduce((n, ex) => n + ex.sets, 0);
  return `${w.exercises.length} exercises · ${sets} sets.`;
}

// Hour (0–23) and weekday (0 = Sunday) right now in `tz`.
export function localTime(now, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { hour: Number(parts.hour), weekday: WEEKDAYS.indexOf(parts.weekday) };
}

// Messages due at this hour. "[...]" parts only show when the app knows your streak.
export function dueMessages(reminders = {}, weekday, hour) {
  const today = workoutForWeekday(weekday);
  const out = [];
  if (reminders.weighIn === hour) {
    out.push({
      type: 'weighIn',
      title: '⚖️ Morning weigh-in',
      body: 'Step on the scale before breakfast and log it in the app.',
      alt: today
        ? { title: `💪 Today: ${today.title}`, body: workoutSummary(today) }
        : { title: '😴 Rest day', body: 'Recovery counts toward your streak.' },
    });
  }
  if (today && reminders.workout === hour) {
    out.push({
      type: 'workout',
      title: `💪 Today: ${today.title}`,
      body: `${workoutSummary(today)}[ Keep your {streak}-day streak going.]`,
      alt: { title: `✅ ${today.title} done`, body: 'Nice work[ — {streak}-day streak]. Rest up.' },
    });
  }
  if (today && reminders.streak === hour) {
    out.push({
      type: 'streak',
      title: '🔥 Don’t break your streak',
      body: `Do at least half of today’s ${today.title} workout[ to keep your {streak}-day streak].`,
      alt: { title: '🔥 Streak secured', body: 'Today is done[ — {streak} days and counting].' },
    });
  }
  if (weekday === 0 && reminders.weekly === hour) {
    out.push({
      type: 'weekly',
      title: '📅 Your week ahead',
      body: WORKOUTS.map((w) => `${DAY_NAMES[w.weekday].slice(0, 3)}: ${w.title}`).join(' · '),
    });
  }
  return out;
}

async function main() {
  const raw = process.env.PUSH_CONFIG;
  if (!raw) {
    console.log('No PUSH_CONFIG secret yet — nothing to send. Set it up from the app: Settings → Notifications.');
    return;
  }
  const config = JSON.parse(raw);
  webpush.setVapidDetails(config.subject, config.vapid.publicKey, config.vapid.privateKey);

  const { hour, weekday } = localTime(new Date(), config.tz || 'UTC');
  const messages =
    process.env.REMINDER_MODE === 'test'
      ? [{ type: 'test', title: '✅ Reminders work', body: 'This test came from GitHub Actions. You’re all set.' }]
      : dueMessages(config.reminders, weekday, hour);

  console.log(`${config.tz} ${DAY_NAMES[weekday]} ${hour}:00 → ${messages.length ? messages.map((m) => m.type).join(', ') : 'nothing due'}`);
  for (const msg of messages) {
    try {
      const res = await webpush.sendNotification(config.subscription, JSON.stringify(msg), { TTL: 2 * 3600, urgency: 'high' });
      console.log(`Sent ${msg.type} (${res.statusCode})`);
    } catch (err) {
      process.exitCode = 1;
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.error('The phone’s subscription has expired. Open the app → Settings → Notifications, turn them on again and update the PUSH_CONFIG secret.');
      } else {
        console.error(`Failed to send ${msg.type}: ${err.statusCode || ''} ${err.body || err.message}`);
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
