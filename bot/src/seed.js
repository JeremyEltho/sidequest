// The Sidequest Marketplace demo dorm: our team.
// Each agent answers on its own until its teammate DMs the bot (matched by Discord username);
// after that, that teammate approves their own deals.
// `privateNotes` and `schedule` stay with each student's own agent and are never sent to another agent.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const SEED_STUDENTS = [
  {
    id: 'levin',
    name: 'Levin',
    discordUsername: 'levvvv',
    simulated: true,
    dorm: 'Hayden Hall, 3rd floor',
    offers: [
      { item: 'broom and dustpan', kind: 'lend', price: null, floor: null, terms: 'back the same night' },
      { item: 'clip-on desk lamp', kind: 'lend', price: null, floor: null, terms: 'for a few days' },
    ],
    skills: ['proofreading essays'],
    needs: ['someone to look at a Python bug (pandas merge giving duplicate rows)'],
    availability: 'free after 6pm most days',
    courses: ['CSE 310', 'CHM 233'],
    schedule: { hours: ['09:00', '23:00'], busy: [
      { days: ['Tue', 'Thu'], start: '14:00', end: '17:00', label: 'Orgo lab', hard: true },
      { days: ['Mon'], start: '18:00', end: '20:00', label: 'team dinner', hard: false },
    ] },
    privateNotes: ['likes studying in the evening, never after 11pm', 'would rather trade a favor than take money'],
    color: '788C5D',
  },
  {
    id: 'sid',
    name: 'Sid',
    discordUsername: 's30.z',
    simulated: true,
    dorm: 'Hayden Hall, 2nd floor',
    offers: [
      { item: 'tripod', kind: 'lend', price: null, floor: null, terms: 'must be back before 8am' },
      { item: 'handheld vacuum', kind: 'lend', price: null, floor: null, terms: 'for an hour' },
    ],
    skills: ['photo editing'],
    needs: ['prints picked up from the library print shop'],
    availability: 'free 5-6pm and after 10pm',
    courses: ['CSE 310', 'ART 112'],
    schedule: { hours: ['08:00', '24:00'], busy: [
      { days: WEEKDAYS, start: '08:00', end: '16:00', label: '8am class, then studio hours', hard: true },
      { days: ['Wed'], start: '19:00', end: '21:00', label: 'rehearsal', hard: true },
    ] },
    privateNotes: ['8am class every weekday', 'asleep by midnight'],
    color: '6A9BCC',
  },
  {
    id: 'parthiva',
    name: 'Parthiva',
    discordUsername: 'pt',
    simulated: true,
    dorm: 'Hayden Hall, 1st floor',
    offers: [
      { item: 'old broom', kind: 'sell', price: 8, floor: 6, terms: 'moving out soon' },
      { item: 'mini fridge (3.1 cu ft, works great)', kind: 'sell', price: 45, floor: 35, terms: 'needs to be gone by Friday' },
      { item: 'pickups from the library or print shop', kind: 'service', price: null, floor: null, terms: 'only on the walk home around 4:40pm' },
    ],
    skills: ['calc tutoring'],
    needs: ['USB-C laptop charger for an afternoon'],
    availability: 'free 3-3:30pm and after 5pm',
    courses: ['CSE 310', 'MAT 343'],
    schedule: { hours: ['08:00', '23:30'], busy: [
      { days: ['Mon', 'Wed'], start: '15:30', end: '16:45', label: 'CS 340', hard: true },
      { days: WEEKDAYS, start: '12:00', end: '13:00', label: 'gym', hard: false },
      { days: ['Fri'], start: '13:00', end: '17:00', label: 'work-study', hard: true },
      { days: ['Thu'], start: '18:00', end: '20:00', label: 'intramural soccer', hard: false },
    ] },
    privateNotes: ['moving out at the end of the month'],
    color: 'D4A27F',
  },
];
