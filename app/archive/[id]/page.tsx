import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";

import { getPublicThesisDetail } from "../actions";
import { generateAcademicCitations } from "@/lib/citations";
import { CitationBox } from "./citation-box";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const thesis = await getPublicThesisDetail(id);

  if (!thesis) {
    return {
      title: "Manuscript Not Found | PECIT Archive",
    };
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const pdfUrl = `${appUrl}/archive/${thesis.id}/pdf`;
  const pubDate = thesis.publishedAt
    ? new Date(thesis.publishedAt).toISOString().split("T")[0]
    : `${thesis.year || new Date().getFullYear()}`;

  const otherMeta: Record<string, string | string[]> = {
    // Google Scholar citation tags
    citation_title: thesis.title,
    citation_publication_date: pubDate,
    citation_pdf_url: pdfUrl,
    citation_institution: "Philippine Electronics and Communication Institute of Technology",
    // Dublin Core tags per SPEC
    "dc.title": thesis.title,
    "dc.creator": thesis.authorNames.join("; "),
    "dc.description": thesis.abstract,
    "dc.subject": thesis.keywords.join(", "),
    "dc.date": pubDate,
    "dc.rights": thesis.license || "All Rights Reserved",
  };

  if (thesis.authorNames && thesis.authorNames.length > 0) {
    otherMeta.citation_author = thesis.authorNames;
  }

  if (thesis.doi) {
    otherMeta.citation_doi = thesis.doi;
    otherMeta["dc.identifier"] = thesis.doi;
  }

  return {
    title: `${thesis.title} | PECIT Thesis Archive`,
    description: thesis.abstract.slice(0, 160),
    other: otherMeta,
  };
}

export default async function ThesisDetailPage({ params }: Props) {
  await connection();
  const { id } = await params;
  const thesis = await getPublicThesisDetail(id);

  if (!thesis) {
    notFound();
  }

  const citations = generateAcademicCitations(thesis);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#0A2540] text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center font-bold text-blue-200">
              P
            </div>
            <div>
              <div className="font-bold tracking-tight text-white group-hover:text-blue-300 transition-colors text-sm sm:text-base">
                <span className="hidden sm:inline">PECIT Institutional Repository</span>
                <span className="sm:hidden">PECIT Archive</span>
              </div>
              <div className="text-xs text-slate-400 hidden sm:block">Public Thesis Archive</div>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors whitespace-nowrap"
          >
            ← <span className="hidden sm:inline">Back to Search</span><span className="sm:hidden">Back</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb Navigation matching institutional repository */}
        <nav aria-label="Breadcrumb navigation" className="mb-6 flex items-center gap-2 text-xs sm:text-sm text-slate-500">
          <Link
            href="/"
            className="breadcrumb-home-link inline-flex items-center justify-center p-1 -ml-1 rounded-md text-slate-500 hover:text-[#1616D4] hover:bg-slate-200/50 transition-colors group cursor-pointer"
            title="Return to Repository Home"
            aria-label="Return to Repository Home"
          >
            <svg
              className="w-4 h-4 text-slate-500 group-hover:text-[#1616D4] transition-colors"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 10.5L12 3l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10.5z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </Link>
          <span className="breadcrumb-slash text-slate-300 font-normal select-none" aria-hidden="true">
            /
          </span>
          <Link
            href="/"
            className="font-medium text-slate-600 hover:text-[#1616D4] transition-colors"
          >
            Repository
          </Link>
          <span className="breadcrumb-slash text-slate-300 font-normal select-none" aria-hidden="true">
            /
          </span>
          <span className="font-semibold text-slate-800 truncate max-w-sm sm:max-w-md md:max-w-xl">
            {thesis.title}
          </span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Thesis Info & PDF Viewer */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  {thesis.department}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  {thesis.program}
                </span>
                {thesis.year && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    Class of {thesis.year}
                  </span>
                )}
                {thesis.license && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-purple-50 text-purple-700 border border-purple-200">
                    {thesis.license}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug mb-4">
                {thesis.title}
              </h1>

              {/* Authors */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 mb-6 pb-6 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Authors:</span>
                {thesis.authorNames.map((author, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-medium"
                  >
                    👤 {author}
                  </span>
                ))}
              </div>

              {/* DOI and Publication metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <div>
                  <span className="font-semibold text-slate-800 block mb-0.5">DOI Identifier</span>
                  {thesis.doi ? (
                    <a
                      href={`https://doi.org/${thesis.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono"
                    >
                      {thesis.doi} ↗
                    </a>
                  ) : (
                    <span className="text-slate-400">Institutional Catalog</span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-slate-800 block mb-0.5">Published Date</span>
                  <span>
                    {thesis.publishedAt
                      ? new Date(thesis.publishedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : `${thesis.year || "N/A"}`}
                  </span>
                </div>
              </div>

              {/* Abstract */}
              <div className="mb-6">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Abstract
                </h2>
                <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-line text-justify bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                  {thesis.abstract}
                </div>
              </div>

              {/* Keywords */}
              {thesis.keywords.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Keywords
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {thesis.keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-md text-xs bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* In-Page PDF Reader */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  📄 Full Manuscript Viewer
                </h2>
                <a
                  href={`/archive/${thesis.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
                >
                  Open PDF in New Tab ↗
                </a>
              </div>

              <div className="w-full h-[55vh] min-h-[22rem] sm:h-[650px] bg-slate-900 rounded-lg overflow-hidden border border-slate-300">
                <iframe
                  src={`/archive/${thesis.id}/pdf`}
                  title={`Manuscript: ${thesis.title}`}
                  className="w-full h-full border-0"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 text-center">
                PDF rendered via Cloudflare R2 direct stream. Access adheres to institutional repository open-access policies.
              </p>
            </div>
          </div>

          {/* Right Column: Citation & Quick Actions */}
          <div className="lg:col-span-4 space-y-6">
            {/* Citation Box Component */}
            <CitationBox citations={citations} thesisTitle={thesis.title} />

            {/* Institutional Attribution Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm text-xs text-slate-600 space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Institutional Repository</h3>
              <p>
                This thesis is officially preserved in the PECIT Academic Archives in compliance with the Philippine Data Privacy Act (RA 10173) and academic open-access standards.
              </p>
              <div className="pt-3 border-t border-slate-100 space-y-1 text-slate-500">
                <div>Institution: Philippine Electronics and Communication Institute of Technology</div>
                <div>Format: Electronic Thesis/Dissertation (ETD)</div>
                <div>Status: Peer-Reviewed &amp; Published</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
