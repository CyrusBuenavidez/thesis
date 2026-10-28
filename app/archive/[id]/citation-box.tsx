"use client";

import { useState } from "react";
import type { CitationFormats } from "@/lib/citations";

interface Props {
  citations: CitationFormats;
  thesisTitle: string;
}

type CitationStyle = keyof CitationFormats;

export function CitationBox({ citations }: Props) {
  const [selectedStyle, setSelectedStyle] = useState<CitationStyle>("APA");
  const [copied, setCopied] = useState(false);

  const currentCitation = citations[selectedStyle];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentCitation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const styles: CitationStyle[] = ["APA", "MLA", "IEEE", "Chicago", "BibTeX"];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
          <span>📚</span> Scholarly Citation
        </h3>
        {copied && (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded animate-fade-in">
            Copied to clipboard!
          </span>
        )}
      </div>

      {/* Style selector pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {styles.map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => setSelectedStyle(style)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
              selectedStyle === style
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {style}
          </button>
        ))}
      </div>

      {/* Formatted Citation Output */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 font-mono leading-relaxed break-words select-all max-h-48 overflow-y-auto">
        {currentCitation}
      </div>

      {/* Copy button */}
      <button
        type="button"
        onClick={handleCopy}
        className="mt-4 w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center justify-center gap-2 shadow-sm transition-colors"
      >
        <span>📋</span> {copied ? "Citation Copied" : `Copy ${selectedStyle} Citation`}
      </button>
    </div>
  );
}
