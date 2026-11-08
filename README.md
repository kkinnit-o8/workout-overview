# Workout

A personal workout app (PWA). It shows today's workout from my plan, lets me check off sets, and after each workout walks me through progress photos in poses it picks for that day. Over time the photos build into a library for seeing the transformation.

No build step, no server, no accounts. Plain HTML/CSS/JS that GitHub Pages serves as-is.

## Features

- **Morning weigh-in**: a quick card at the top of Today for this morning's body weight (kg). It shows the change since your last weigh-in.
- **Today**: today's workout (Mon / Tue / Thu / Sat, rest days in between). Tap a set to check it off. Type the weight you used next to each exercise. The card shows last time, your record and your goal, and beating your record pops a 🏆. The week strip shows what you've completed this week, and you can tap any day to see that workout (or do it today instead).
- **Rest-day bonus**: on a rest day, tap **Don't feel like resting? Get a workout** and the app picks one: Legs, Core, Legs + Core Express or Upper Back + Traps. It only picks workouts that don't hit yesterday's or tomorrow's muscles (so no back work before Thursday's pull-ups), favours the one you've done least recently, and says why it chose it. **Something else** swaps it, and **Rest instead** goes back to resting. The bonus workouts live in `js/plan.js` (`BONUS_WORKOUTS`).
- **Pull-ups and dips**: type only the **extra** weight (leave it empty or 0 for none). The app adds your body weight from the morning weigh-in and shows the total.
- **Streak** 🔥: days in a row on plan. Rest days count automatically; a workout day counts once at least half its sets are done. It's shown at the top of Today, along with how many sets are left to keep it.
- **Progress photos**: once all sets are done, the app asks for 3 poses chosen for that day's muscles (e.g. Arms → front double biceps, side triceps, back double biceps). The camera screen has:
  - a **ghost of your last photo** in the same pose, so you can line up the same distance and angle every time (or a guide figure the first time)
  - a **self-timer** (3/5/10 s, with beeps) so you can prop the phone up and step back
  - front/back camera switching, retake/save, and upload from your camera roll
- **Progress library**: a timeline of every session, plus **Compare**: side by side, a before/after **swipe**, and a **timelapse** of one pose over time.
- **Stats**:
  - your streak and best streak, workouts this week, total workouts and records set in the last 30 days
  - a GitHub-style **activity heatmap** for the last year. Rest days are filled in too; only skipped workout days stay empty. Tap a square to see what you did.
  - a **body-weight chart** with each morning weigh-in plus a 7-day average, so daily water swings don't hide the real trend. You can add, fix or delete any day's entry.
  - a **weight goal**: a target in a number of days, weeks or months. It shows the pace you need, your actual pace, whether you're on track, and roughly when you'll get there.
  - **Exercises**: every exercise with its record. Tap one for a chart of the weight you've used over time, its list of records, and a **goal** (e.g. incline press 36 kg, curls 20 kg, pull-ups +20 kg), with or without a deadline.
- **Notifications** (optional, see below): morning weigh-in, today's workout, an evening streak check and the week ahead on Sundays.
- **Works offline** after the first load, and installs to the home screen.
- **Backup**: export/import everything (photos + logs) as one file from Settings.

## Put it online (GitHub Pages)

1. Open the repo on GitHub → **Settings** → **Pages**.
2. Under *Build and deployment*, choose **Source: Deploy from a branch**.
3. Pick the branch that holds these files (e.g. `main`) and the **/ (root)** folder, then **Save**.
4. After about a minute the app is live at **https://kkinnit-o8.github.io/workout-overview/**

(GitHub Pages on a private repo needs a paid GitHub plan. On a free account, make the repo public. The photos are never uploaded anywhere, so they stay private either way.)

## Install on your phone

- **iPhone (Safari)**: open the link → **Share** → **Add to Home Screen**.
- **Android (Chrome)**: open the link → **Install app** (or ⋮ → *Add to Home screen*).

Install it rather than just bookmarking it. Installed apps work offline, and on iPhone they're exempt from Safari's habit of clearing website data after 7 days without a visit.

## Turn on notifications

A web app can't schedule notifications by itself, so the reminders are sent by a small GitHub Actions workflow in this repo ([`.github/workflows/reminders.yml`](.github/workflows/reminders.yml)). It runs every hour and sends whatever is due at that hour in your time zone. One-time setup:

1. **iPhone:** install the app to the Home Screen first and open it from there (iOS 16.4 or newer). Web notifications don't work in a normal Safari tab.
2. In the app: **Settings → Notifications**. Pick the times you want, then tap **Turn on notifications** and allow them.
3. Tap **Copy setup code**.
4. On GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret**. Name it `PUSH_CONFIG`, paste the code, and save. (The app has a button that opens this page.)
5. Test it: repo → **Actions → Reminders → Run workflow**. A test notification should arrive within a minute.

Good to know:

- If you change the reminder times, copy the setup code again and update the secret. The app reminds you.
- The setup code contains this phone's private notification key, so only paste it into your repo's secrets.
- GitHub sometimes runs scheduled jobs a few minutes late, so reminders arrive "around" the hour.
- If you've already weighed in or trained, the reminder says so instead of nagging, e.g. "✅ Arms done — 12-day streak".
- In a public repo, GitHub pauses scheduled workflows after 60 days with no commits. Re-enable it under **Actions** if reminders stop. In a private repo the hourly job uses about 720 of the 2,000 free Actions minutes per month.

## Where the data lives

Everything stays **on your phone**. Photos are in IndexedDB, and set check-offs, lifting weights, body weight and goals are in localStorage. Nothing is sent anywhere (notifications only need the setup code you put in your own repo). That also means deleting the app (or clearing site data) deletes the photos, so use **Settings → Export backup** now and then, and always before switching phones. **Import backup** on the new phone restores everything.

## Change the plan

Everything about the plan is in [`js/plan.js`](js/plan.js): days, exercises, sets/reps, and which poses get photographed after each workout. Edit it on GitHub, commit, and the app picks up the change on the next launch or two. The service worker refreshes its cache in the background.

The poses (names, how-to cues, guide figures) are in [`js/poses.js`](js/poses.js).

## Run locally

Any static file server works, e.g.:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

The camera needs a secure context: `localhost` or HTTPS (GitHub Pages is HTTPS).

## Files

```
index.html             app shell
manifest.webmanifest   PWA manifest
sw.js                  service worker (offline cache)
css/style.css          styles
js/app.js              Today tab, navigation
js/plan.js             ← your workout plan
js/poses.js            progress-photo poses + guide figures
js/camera.js           photo session (camera, ghost overlay, timer)
js/library.js          Progress tab (timeline, compare, viewer)
js/settings.js         settings sheet, backup export/import
js/stats.js            Stats tab: streak, activity heatmap
js/weight.js           body-weight card, chart and weight goal
js/exercises.js        exercise records, charts and goals
js/goals.js            "in X days/weeks/months" picker, goal progress
js/bonus.js            picks a rest-day bonus workout
js/chart.js            line chart used by the Stats tab
js/notify.js           notification setup (keys, setup code)
js/store.js            logs, weights, goals, streak (localStorage)
js/db.js               photo storage (IndexedDB)
js/ui.js               icons, toasts, sheets
icons/                 app icons
scripts/send-reminders.mjs          sends the reminders (run by GitHub Actions)
.github/workflows/reminders.yml     hourly reminder job
```
