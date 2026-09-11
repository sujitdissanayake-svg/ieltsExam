export type CourseLevel = "Foundation" | "Intermediate" | "Advanced";
export type AssignmentStatus = "Not started" | "In progress" | "Submitted" | "Graded";

export type BandScore = number; // typically 0.0–9.0 in 0.5 steps

export type StudentProfile = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  targetBand: BandScore;
};

export type CourseLesson = {
  id: string;
  title: string;
  completed: boolean;
};

export type CourseModule = {
  id: string;
  title: string;
  lessons: CourseLesson[];
};

export type Course = {
  id: string;
  title: string;
  level: CourseLevel;
  startDate: string; // ISO date
  modules: CourseModule[];
};

export type ClassSession = {
  id: string;
  title: string;
  startAt: string; // ISO date-time
  durationMinutes: number;
  teacher: string;
  mode: "Online" | "In-person";
  location?: string;
};

export type Assignment = {
  id: string;
  title: string;
  courseId: string;
  dueAt: string; // ISO date-time
  status: AssignmentStatus;
  submittedAt?: string; // ISO date-time
  scoreBand?: BandScore;
  feedback?: string;
};

export type MockTestAttempt = {
  id: string;
  takenAt: string; // ISO date-time
  listening: BandScore;
  reading: BandScore;
  writing: BandScore;
  speaking: BandScore;
};

export type Announcement = {
  id: string;
  title: string;
  detail: string;
  publishedAt: string; // ISO date-time
};

export type StudentRecord = {
  profile: StudentProfile;
  courses: Course[];
  schedule: ClassSession[];
  assignments: Assignment[];
  mockTests: MockTestAttempt[];
  announcements: Announcement[];
};

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function computeOverallBand(attempt: MockTestAttempt): BandScore {
  const avg = (attempt.listening + attempt.reading + attempt.writing + attempt.speaking) / 4;
  return roundToHalf(avg);
}

export function bandToPercent(band: BandScore): number {
  const clamped = Math.max(0, Math.min(9, band));
  return Math.round((clamped / 9) * 100);
}

export function getCourseLessonStats(course: Course): {
  totalLessons: number;
  completedLessons: number;
  nextLessonTitle: string | null;
} {
  const lessons = course.modules.flatMap((m) => m.lessons);
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter((l) => l.completed).length;
  const nextLessonTitle = lessons.find((l) => !l.completed)?.title ?? null;
  return { totalLessons, completedLessons, nextLessonTitle };
}
