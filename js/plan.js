// Your weekly plan. Edit freely — the app reads everything from here.
//
// weekday: 0 = Sunday, 1 = Monday ... 6 = Saturday
// exercise.id: shared between days when it's the same movement, so the
//   "last weight" hint carries over (e.g. lateral raises on Mon/Thu/Sat).
// poses: which progress photos the app asks for after that workout
//   (ids from js/poses.js).

export const WORKOUTS = [
  {
    id: 'mon',
    weekday: 1,
    title: 'Upper Chest + Side Delts',
    poses: ['front-relaxed', 'side-chest', 'side-relaxed'],
    exercises: [
      { id: 'incline-db-press', name: 'Incline Dumbbell Press', sets: 4, reps: '6–12' },
      { id: 'db-squeeze-press', name: 'Dumbbell Squeeze Press', sets: 3, reps: '8–15' },
      { id: 'db-lateral-raise', name: 'Dumbbell Lateral Raise', sets: 4, reps: '12–20' },
      { id: 'leaning-lateral-raise', name: 'Leaning Dumbbell Lateral Raise', sets: 3, reps: '12–20' },
      { id: 'rear-delt-fly', name: 'Rear-Delt Dumbbell Fly', sets: 3, reps: '12–20' },
    ],
  },
  {
    id: 'tue',
    weekday: 2,
    title: 'Arms',
    poses: ['front-double-biceps', 'side-triceps', 'back-double-biceps'],
    exercises: [
      { id: 'oh-triceps-ext', name: 'Overhead Dumbbell Triceps Extension', sets: 4, reps: '8–15' },
      { id: 'dips', name: 'Dips', sets: 3, reps: '6–12', bodyweight: true },
      { id: 'db-skull-crusher', name: 'Dumbbell Skull Crushers', sets: 3, reps: '10–15' },
      { id: 'db-curl', name: 'Dumbbell Curl', sets: 3, reps: '8–12' },
      { id: 'hammer-curl', name: 'Hammer Curl', sets: 3, reps: '8–15' },
      { id: 'incline-db-curl', name: 'Incline Dumbbell Curl', sets: 2, reps: '10–15' },
    ],
  },
  {
    id: 'thu',
    weekday: 4,
    title: 'Shoulders + Chest + Lats',
    poses: ['front-lat-spread', 'back-lat-spread', 'side-chest'],
    exercises: [
      { id: 'db-lateral-raise', name: 'Dumbbell Lateral Raise', sets: 4, reps: '10–20' },
      { id: 'leaning-lateral-raise', name: 'Leaning Lateral Raise', sets: 3, reps: '12–20' },
      { id: 'lateral-raise-partials', name: 'Lateral Raise Partials', sets: 2, reps: '20–30' },
      { id: 'db-shoulder-press', name: 'Dumbbell Shoulder Press', sets: 2, reps: '6–12' },
      { id: 'incline-db-press', name: 'Incline Dumbbell Press', sets: 3, reps: '8–12' },
      { id: 'pull-ups', name: 'Pull-Ups', sets: 3, reps: '6–12', bodyweight: true },
    ],
  },
  {
    id: 'sat',
    weekday: 6,
    title: 'Arms + Side Delts',
    poses: ['front-double-biceps', 'side-triceps', 'front-relaxed'],
    exercises: [
      { id: 'db-curl', name: 'Dumbbell Curl', sets: 3, reps: '6–12' },
      { id: 'hammer-curl', name: 'Hammer Curl', sets: 3, reps: '8–15' },
      { id: 'concentration-curl', name: 'Concentration Curl', sets: 2, reps: '10–15' },
      { id: 'oh-triceps-ext', name: 'Overhead Dumbbell Triceps Extension', sets: 3, reps: '8–15' },
      { id: 'dips', name: 'Dips', sets: 3, reps: '6–15', bodyweight: true },
      { id: 'close-grip-db-press', name: 'Close-Grip Dumbbell Bench Press', sets: 3, reps: '8–15' },
      { id: 'db-lateral-raise', name: 'Dumbbell Lateral Raise', sets: 4, reps: '12–20' },
    ],
  },
];

// Poses for a progress check-in on a rest day.
export const REST_DAY_POSES = ['front-relaxed', 'side-relaxed', 'back-relaxed'];

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function workoutForWeekday(weekday) {
  return WORKOUTS.find((w) => w.weekday === weekday) || null;
}

export function workoutById(id) {
  return WORKOUTS.find((w) => w.id === id) || null;
}
