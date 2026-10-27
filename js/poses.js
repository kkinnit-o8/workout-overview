// Progress-photo poses + a simple guide figure for each.
// Figures are drawn in a 300×400 (3:4) box — the same shape as the photos.
// Side poses face frame-left: "left side to the camera" as the camera sees it.

export const POSES = {
  'front-relaxed': {
    name: 'Front Relaxed',
    shows: 'Overall shape, delts, chest',
    cue: 'Face the camera, feet shoulder-width apart. Let your arms hang slightly away from your sides and flare your lats a little. Stand tall.',
  },
  'side-relaxed': {
    name: 'Side Relaxed',
    shows: 'Side delts, chest, posture',
    cue: 'Turn your left side to the camera. Arms hang naturally, chest up, shoulders down.',
  },
  'back-relaxed': {
    name: 'Back Relaxed',
    shows: 'Back width, rear delts',
    cue: 'Back to the camera, feet shoulder-width apart. Arms slightly out, spread your shoulder blades.',
  },
  'front-double-biceps': {
    name: 'Front Double Biceps',
    shows: 'Biceps, delts, width',
    cue: 'Face the camera. Raise your arms to shoulder height, bend the elbows and squeeze both biceps hard.',
  },
  'back-double-biceps': {
    name: 'Back Double Biceps',
    shows: 'Arms, rear delts, back',
    cue: 'Back to the camera. Arms up as in the front double biceps. Flex the biceps and spread your upper back.',
  },
  'side-chest': {
    name: 'Side Chest',
    shows: 'Upper chest, front delts, arms',
    cue: 'Left side to the camera. Bend your near arm 90°, grab that wrist with your other hand and push your chest up and out.',
  },
  'side-triceps': {
    name: 'Side Triceps',
    shows: 'Triceps, side delts',
    cue: 'Left side to the camera. Straighten your near arm down and slightly back, grab its wrist behind you and lock out the triceps.',
  },
  'front-lat-spread': {
    name: 'Front Lat Spread',
    shows: 'Lats, delts, V-taper',
    cue: 'Face the camera. Fists on your waist, elbows forward, then flare your lats as wide as you can.',
  },
  'back-lat-spread': {
    name: 'Back Lat Spread',
    shows: 'Lats, back width',
    cue: 'Back to the camera. Fists on your waist, pull the elbows forward and spread your lats wide.',
  },
};

// --- Guide figures -------------------------------------------------------
// Each figure: head [x, y], optional nose [x, y] (side views), torso polygon,
// limbs as [x1, y1, x2, y2, width], fists as [x, y], spine (back views).

const mirrorX = (x) => 300 - x;
const mirrorLimb = ([x1, y1, x2, y2, w]) => [mirrorX(x1), y1, mirrorX(x2), y2, w];
const symmetric = (limbs) => [...limbs, ...limbs.map(mirrorLimb)];

const FRONT_LEGS = symmetric([
  [138, 226, 135, 300, 30],
  [135, 300, 133, 370, 22],
  [133, 376, 121, 379, 12],
]);
const WIDE_LEGS = symmetric([
  [138, 226, 129, 300, 30],
  [129, 300, 125, 370, 22],
  [125, 376, 113, 379, 12],
]);
const TORSO = [[110, 108], [190, 108], [176, 168], [168, 218], [132, 218], [124, 168]];
const WIDE_TORSO = [[104, 108], [196, 108], [180, 165], [168, 218], [132, 218], [120, 165]];

const front = {
  relaxed: {
    head: [150, 56],
    torso: TORSO,
    limbs: [
      ...symmetric([
        [105, 114, 95, 168, 22],
        [95, 168, 92, 222, 18],
      ]),
      ...FRONT_LEGS,
    ],
  },
  doubleBiceps: {
    head: [150, 56],
    torso: WIDE_TORSO,
    limbs: [
      ...symmetric([
        [104, 114, 60, 118, 24],
        [60, 118, 70, 66, 20],
      ]),
      ...WIDE_LEGS,
    ],
    fists: [[72, 58], [228, 58]],
  },
  latSpread: {
    head: [150, 56],
    torso: WIDE_TORSO,
    limbs: [
      ...symmetric([
        [102, 114, 78, 160, 24],
        [78, 160, 122, 202, 20],
      ]),
      ...WIDE_LEGS,
    ],
    fists: [[125, 205], [175, 205]],
  },
};

const withSpine = (fig) => ({ ...fig, spine: true });

// Back leg (behind) first, so the near leg draws on top.
const SIDE_LEGS_STRAIGHT = [
  [152, 222, 150, 300, 32],
  [150, 300, 154, 370, 22],
  [154, 376, 132, 378, 12],
];
const SIDE_LEGS_STAGGER = [
  [158, 222, 162, 300, 28],
  [162, 300, 168, 370, 20],
  [150, 222, 136, 296, 32],
  [136, 296, 146, 370, 22],
  [146, 375, 124, 377, 12],
];

const FIGURES = {
  'front-relaxed': front.relaxed,
  'back-relaxed': withSpine(front.relaxed),
  'front-double-biceps': front.doubleBiceps,
  'back-double-biceps': withSpine(front.doubleBiceps),
  'front-lat-spread': front.latSpread,
  'back-lat-spread': withSpine(front.latSpread),
  'side-relaxed': {
    head: [146, 56],
    nose: [121, 60],
    torso: [[140, 104], [166, 104], [172, 150], [166, 215], [138, 215], [130, 170], [128, 130]],
    limbs: [
      ...SIDE_LEGS_STRAIGHT,
      [154, 112, 156, 168, 22],
      [156, 168, 152, 222, 18],
    ],
  },
  'side-chest': {
    head: [142, 56],
    nose: [117, 60],
    torso: [[136, 104], [164, 104], [170, 150], [164, 215], [136, 215], [126, 165], [122, 126]],
    limbs: [
      ...SIDE_LEGS_STAGGER,
      [150, 112, 140, 170, 22],
      [140, 170, 102, 165, 18],
    ],
    fists: [[98, 165]],
  },
  'side-triceps': {
    head: [144, 56],
    nose: [119, 60],
    torso: [[138, 104], [164, 104], [170, 150], [164, 215], [136, 215], [128, 165], [126, 128]],
    limbs: [
      ...SIDE_LEGS_STAGGER,
      [156, 112, 167, 168, 24],
      [167, 168, 173, 222, 20],
    ],
    fists: [[174, 227]],
  },
};

export function poseFigureSVG(poseId, className = '') {
  const f = FIGURES[poseId];
  if (!f) return '';
  const limbs = f.limbs
    .map(([x1, y1, x2, y2, w]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}"/>`)
    .join('');
  const torso = `<polygon points="${f.torso.map((p) => p.join(',')).join(' ')}" stroke-width="18"/>`;
  const fists = (f.fists || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11"/>`).join('');
  const nose = f.nose ? `<circle cx="${f.nose[0]}" cy="${f.nose[1]}" r="6"/>` : '';
  const neck = `<line x1="${f.head[0] + 3}" y1="78" x2="${f.head[0] + 4}" y2="104" stroke-width="22"/>`;
  const spine = f.spine
    ? `<line class="fig-spine" x1="150" y1="116" x2="150" y2="206" stroke-width="4"/>`
    : '';
  return `<svg class="figure ${className}" viewBox="0 0 300 400" aria-hidden="true">
    <g class="fig-body" stroke-linecap="round" stroke-linejoin="round">
      ${limbs}${torso}${neck}${fists}${nose}
      <circle cx="${f.head[0]}" cy="${f.head[1]}" r="25"/>
    </g>${spine}
  </svg>`;
}
