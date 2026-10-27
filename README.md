# Workout

A personal workout app (PWA). It shows today's workout from my plan, lets me check off sets, and after each workout walks me through progress photos in poses it picks for that day. Over time the photos build into a library for seeing the transformation.

No build step, no server, no accounts. Plain HTML/CSS/JS that GitHub Pages serves as-is.

## Features

- **Today**: today's workout (Mon / Tue / Thu / Sat, rest days in between). Tap a set to check it off. There's an optional weight field per exercise, with the last weight you used shown as a hint. The week strip shows what you've completed this week, and you can tap any day to see that workout (or do it today instead).
- **Progress photos**: once all sets are done, the app asks for 3 poses chosen for that day's muscles (e.g. Arms → front double biceps, side triceps, back double biceps). The camera screen has:
  - a **ghost of your last photo** in the same pose, so you can line up the same distance and angle every time (or a guide figure the first time)
  - a **self-timer** (3/5/10 s, with beeps) so you can prop the phone up and step back
  - front/back camera switching, retake/save, and upload from your camera roll
- **Progress library**: a timeline of every session, plus **Compare**: side by side, a before/after **swipe**, and a **timelapse** of one pose over time.
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

## Where the data lives

Everything stays **on your phone**. Photos are in IndexedDB, and set check-offs and weights are in localStorage. Nothing is sent anywhere. That also means deleting the app (or clearing site data) deletes the photos, so use **Settings → Export backup** now and then, and always before switching phones. **Import backup** on the new phone restores everything.

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
js/store.js            set/weight logs (localStorage)
js/db.js               photo storage (IndexedDB)
js/ui.js               icons, toasts, sheets
icons/                 app icons
```
