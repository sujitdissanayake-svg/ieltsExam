import Link from "next/link";

export default function Home() {
  return (
    <main className="w-full p-6">
      <h1 className="text-2xl font-semibold">IELTS Student Portal</h1>
      <p className="mt-2 text-sm text-slate-600">
        Starter app. Go to the Test Taker Portal to see student data.
      </p>
      <div className="mt-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-md border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Open Portal
        </Link>
      </div>
    </main>
  );
}
