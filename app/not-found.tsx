import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-blue-50 text-[#1616D4] flex items-center justify-center text-2xl font-bold mb-4 shadow-sm">
        404
      </div>
      <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
        Manuscript or Page Not Found
      </h1>
      <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
        The requested institutional archive record or system route does not exist, has been archived, or requires elevated authorization.
      </p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 bg-[#1616D4] hover:bg-[#0A2BE7] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
        >
          Return to Archive
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg border border-slate-300 shadow-sm transition-colors"
        >
          Institutional Sign In
        </Link>
      </div>
    </div>
  );
}
