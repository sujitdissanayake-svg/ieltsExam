export type Course = {
  id: string;
  title: string;
  level: "Foundation" | "Intermediate" | "Advanced";
  nextLesson: string;
};

export type UpcomingClass = {
  id: string;
  title: string;
  when: string;
};

export type Assignment = {
  id: string;
  title: string;
  due: string;
  status: "Not started" | "In progress" | "Submitted";
};

export type Announcement = {
  id: string;
  title: string;
  detail: string;
};

export const demoStudent = {
  name: "Aisha Khan",
  targetBand: 7.5
};

export const demoCourses: Course[] = [
  {
    id: "course-1",
    title: "IELTS Academic: Core Skills",
    level: "Intermediate",
    nextLesson: "Listening Section 2: Map Labelling"
  },
  {
    id: "course-2",
    title: "Writing Task 2 Mastery",
    level: "Advanced",
    nextLesson: "Opinion Essay: Structure + Coherence"
  }
];

export const demoUpcoming: UpcomingClass[] = [
  { id: "class-1", title: "Speaking Test", when: "Tomorrow · 6:00 PM" },
  { id: "class-2", title: "Remaining Tests", when: "Thu · 5:00 PM" },
  { id: "class-3", title: "Writing feedback workshop", when: "Sat · 11:00 AM" }
];

export const demoAssignments: Assignment[] = [
  {
    id: "hw-1",
    title: "Writing Task 1 (Report): 150 words",
    due: "Due in 2 days",
    status: "In progress"
  },
  {
    id: "hw-2",
    title: "Reading: True/False/Not Given set",
    due: "Due next week",
    status: "Not started"
  }
];

export const demoAnnouncements: Announcement[] = [
  {
    id: "ann-1",
    title: "Mock test results released",
    detail: "Check your progress card for a breakdown."
  },
  {
    id: "ann-2",
    title: "New speaking questions pack",
    detail: "Added 30 fresh Part 2 cue cards to your course materials."
  }
];

export const demoProgress = {
  overall: 68,
  listening: 72,
  reading: 64,
  writing: 61,
  speaking: 75
};
