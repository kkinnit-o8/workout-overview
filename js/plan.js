// Your weekly plan. Edit freely — the app reads everything from here.
//
// weekday: 0 = Sunday, 1 = Monday ... 6 = Saturday
// exercise.id: shared between days when it's the same movement, so the
//   "last weight" hint carries over (e.g. lateral raises on Mon/Thu/Sat).
// poses: which progress photos the app asks for after that workout
//   (ids from js/poses.js).
// muscles: what the workout mainly trains. On a rest day the app picks a bonus
//   workout that doesn't hit yesterday's or tomorrow's muscles.
// Optional per exercise: bodyweight (you log only extra weight), noWeight (no
//   weight box), unit (shown after the reps, default "reps").

export const WORKOUTS = [
  {
    id: 'mon',
    weekday: 1,
    title: 'Upper Chest + Side Delts',
    muscles: ['chest', 'side-delts', 'rear-delts'],
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
    muscles: ['triceps', 'biceps'],
    poses: ['front-double-biceps', 'side-triceps', 'back-double-biceps'],
    exercises: [
      { id: 'db-kickback', name: 'Dumbbell Triceps Kickback', sets: 4, reps: '10–15' },
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
    muscles: ['side-delts', 'front-delts', 'chest', 'lats'],
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
    muscles: ['biceps', 'triceps', 'side-delts'],
    poses: ['front-double-biceps', 'side-triceps', 'front-relaxed'],
    exercises: [
      { id: 'db-curl', name: 'Dumbbell Curl', sets: 3, reps: '6–12' },
      { id: 'hammer-curl', name: 'Hammer Curl', sets: 3, reps: '8–15' },
      { id: 'concentration-curl', name: 'Concentration Curl', sets: 2, reps: '10–15' },
      { id: 'db-kickback', name: 'Dumbbell Triceps Kickback', sets: 3, reps: '10–15' },
      { id: 'dips', name: 'Dips', sets: 3, reps: '6–15', bodyweight: true },
      { id: 'close-grip-db-press', name: 'Close-Grip Dumbbell Bench Press', sets: 3, reps: '8–15' },
      { id: 'db-lateral-raise', name: 'Dumbbell Lateral Raise', sets: 4, reps: '12–20' },
    ],
  },
];

// Bonus workouts for rest days when you'd rather train. They cover what the plan
// doesn't (legs, core, upper back), so your plan days still get fresh muscles.
// `focus` finishes the sentence "Your plan doesn't train …".
export const BONUS_WORKOUTS = [
  {
    id: 'bonus-legs',
    bonus: true,
    title: 'Legs',
    focus: 'legs',
    muscles: ['legs'],
    poses: ['front-relaxed', 'side-relaxed', 'back-relaxed'],
    exercises: [
      { id: 'goblet-squat', name: 'Goblet Squat', sets: 4, reps: '8–12' },
      { id: 'db-rdl', name: 'Dumbbell Romanian Deadlift', sets: 3, reps: '8–12' },
      { id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', sets: 3, reps: '8–12', unit: 'reps/leg' },
      { id: 'db-calf-raise', name: 'Standing Dumbbell Calf Raise', sets: 3, reps: '12–20' },
    ],
  },
  {
    id: 'bonus-core',
    bonus: true,
    title: 'Core',
    focus: 'your core',
    muscles: ['core'],
    poses: ['front-relaxed', 'side-relaxed', 'front-double-biceps'],
    exercises: [
      { id: 'hanging-knee-raise', name: 'Hanging Knee Raise', sets: 3, reps: '10–15', noWeight: true },
      { id: 'db-weighted-crunch', name: 'Dumbbell Weighted Crunch', sets: 3, reps: '10–15' },
      { id: 'db-side-bend', name: 'Dumbbell Side Bend', sets: 2, reps: '12–15', unit: 'reps/side' },
      { id: 'plank', name: 'Plank', sets: 3, reps: '30–60', unit: 'sec', noWeight: true },
      { id: 'dead-bug', name: 'Dead Bug', sets: 2, reps: '8–12', unit: 'reps/side', noWeight: true },
    ],
  },
  {
    id: 'bonus-legs-core',
    bonus: true,
    title: 'Legs + Core Express',
    focus: 'legs or core',
    muscles: ['legs', 'core'],
    poses: ['front-relaxed', 'side-relaxed', 'back-relaxed'],
    exercises: [
      { id: 'goblet-squat', name: 'Goblet Squat', sets: 3, reps: '10–15' },
      { id: 'db-rdl', name: 'Dumbbell Romanian Deadlift', sets: 3, reps: '10–12' },
      { id: 'hanging-knee-raise', name: 'Hanging Knee Raise', sets: 3, reps: '10–15', noWeight: true },
      { id: 'plank', name: 'Plank', sets: 2, reps: '30–60', unit: 'sec', noWeight: true },
    ],
  },
  {
    id: 'bonus-back',
    bonus: true,
    title: 'Upper Back + Traps',
    focus: 'your upper back and traps',
    muscles: ['upper-back', 'lats', 'traps'],
    poses: ['back-relaxed', 'back-lat-spread', 'back-double-biceps'],
    exercises: [
      { id: 'one-arm-db-row', name: 'One-Arm Dumbbell Row', sets: 4, reps: '8–12', unit: 'reps/arm' },
      { id: 'chest-supported-db-row', name: 'Chest-Supported Dumbbell Row', sets: 3, reps: '10–12' },
      { id: 'db-shrug', name: 'Dumbbell Shrug', sets: 3, reps: '10–15' },
      { id: 'farmers-carry', name: "Dumbbell Farmer's Carry", sets: 3, reps: '30–45', unit: 'sec' },
    ],
  },
];

export const ALL_WORKOUTS = [...WORKOUTS, ...BONUS_WORKOUTS];

// Poses for a progress check-in on a rest day.
export const REST_DAY_POSES = ['front-relaxed', 'side-relaxed', 'back-relaxed'];

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function workoutForWeekday(weekday) {
  return WORKOUTS.find((w) => w.weekday === weekday) || null;
}

export function workoutById(id) {
  return ALL_WORKOUTS.find((w) => w.id === id) || null;
}
