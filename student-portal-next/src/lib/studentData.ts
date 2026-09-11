import type { StudentRecord } from "@/lib/student";

export const studentRecord: StudentRecord = {
  profile: {
    id: "stu-001",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    timezone: "Asia/Karachi",
    targetBand: 7.5
  },
  courses: [
    {
      id: "course-core",
      title: "IELTS Academic: Core Skills",
      level: "Intermediate",
      startDate: "2026-02-10",
      modules: [
        {
          id: "m-listening",
          title: "Listening",
          lessons: [
            { id: "l-1", title: "Section 1: Form Completion", completed: true },
            { id: "l-2", title: "Section 2: Map Labelling", completed: false },
            { id: "l-3", title: "Section 3: Multiple Choice", completed: false }
          ]
        },
        {
          id: "m-reading",
          title: "Reading",
          lessons: [
            { id: "r-1", title: "Skimming & Scanning", completed: true },
            { id: "r-2", title: "True/False/Not Given", completed: false },
            { id: "r-3", title: "Matching Headings", completed: false }
          ]
        }
      ]
    },
    {
      id: "course-writing",
      title: "Writing Task 2 Mastery",
      level: "Advanced",
      startDate: "2026-02-24",
      modules: [
        {
          id: "m-structure",
          title: "Essay Structure",
          lessons: [
            { id: "w-1", title: "Opinion Essay: Structure", completed: true },
            { id: "w-2", title: "Coherence & Cohesion", completed: false },
            { id: "w-3", title: "Lexical Resource: Paraphrasing", completed: false }
          ]
        }
      ]
    }
  ],
  schedule: [
    {
      id: "sess-1",
      title: "Speaking Test",
      startAt: "2026-03-11T18:00:00+05:00",
      durationMinutes: 13,
      teacher: "Ms. Patel",
      mode: "Online"
    },
    {
      id: "sess-2",
      title: "Remaining Tests",
      startAt: "2026-03-12T17:00:00+05:00",
      durationMinutes: 45,
      teacher: "Mr. Chen",
      mode: "Online"
    },
    {
      id: "sess-3",
      title: "Take a Test",
      startAt: "2026-03-14T11:00:00+05:00",
      durationMinutes: 60,
      teacher: "Ms. Ahmed",
      mode: "In-person",
      location: "Room 204"
    }
  ],
  assignments: [
    {
      id: "asg-1",
      title: "Purchase a Test",
      courseId: "course-core",
      dueAt: "2026-03-12T21:00:00+05:00",
      status: "In progress"
    },
    {
      id: "asg-2",
      title: "Take / Retake one component",
      courseId: "course-core",
      dueAt: "2026-03-17T21:00:00+05:00",
      status: "Not started"
    },
    {
      id: "asg-4",
      title: "Learn IELTS",
      courseId: "course-core",
      dueAt: "2026-03-20T21:00:00+05:00",
      status: "Not started"
    },
    {
      id: "asg-3",
      title: "You currently have no purchased tests.",
      courseId: "course-writing",
      dueAt: "2026-03-08T21:00:00+05:00",
      status: "Graded",
      submittedAt: "2026-03-08T19:40:00+05:00",
      scoreBand: 6.5,
      feedback: "Good structure; focus on stronger topic sentences and fewer grammar slips."
    }
  ],
  mockTests: [
    {
      id: "mock-2026-03-09",
      takenAt: "2026-03-09T10:00:00+05:00",
      listening: 7.5,
      reading: 7,
      writing: 6.5,
      speaking: 7
    },
    {
      id: "mock-2026-02-23",
      takenAt: "2026-02-23T10:00:00+05:00",
      listening: 7,
      reading: 6.5,
      writing: 6,
      speaking: 6.5
    }
  ],
  announcements: [
    {
      id: "ann-1",
      title: "Book IELTS",
      detail: "",
      publishedAt: "2026-03-09T16:00:00+05:00"
    },
    {
      id: "ann-2",
      title: "Direct Apply for a University with the Visa Support 100%",
      detail: "",
      publishedAt: "2026-03-06T12:00:00+05:00"
    }
  ]
};
