/**
 * Academic citation generators in standard scholarly formats:
 * APA (7th), MLA (9th), IEEE, Chicago, and BibTeX.
 */

export interface CitationFormats {
  APA: string;
  MLA: string;
  IEEE: string;
  Chicago: string;
  BibTeX: string;
}

export function generateAcademicCitations(thesis: {
  title: string;
  authorNames: string[];
  year: number | null;
  department: string;
  program: string;
  doi: string | null;
  id: string;
}): CitationFormats {
  const institution = "Philippine Electronics and Communication Institute of Technology";
  const year = thesis.year || new Date().getFullYear();
  const authors = thesis.authorNames.length > 0 ? thesis.authorNames : ["PECIT Author"];

  // APA: Author, A. A., & Author, B. B. (Year). Title [Undergraduate thesis, Institution]. PECIT Institutional Archive. DOI/URL
  const apaAuthors = authors.map((a) => {
    const parts = a.trim().split(" ");
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      const initials = parts.slice(0, parts.length - 1).map((p) => `${p[0]}.`).join(" ");
      return `${last}, ${initials}`;
    }
    return a;
  }).join(", & ");

  const apaCitation = `${apaAuthors} (${year}). ${thesis.title} [Bachelor's thesis, ${institution}]. PECIT Institutional Repository.${thesis.doi ? ` https://doi.org/${thesis.doi}` : ""}`;

  // MLA: Author. "Title." Institution, Year. PECIT Archive.
  const mlaAuthors = authors.join(", and ");
  const mlaCitation = `${mlaAuthors}. "${thesis.title}." ${institution}, ${year}. PECIT Institutional Archive.${thesis.doi ? ` DOI: ${thesis.doi}` : ""}`;

  // IEEE: A. Author and B. Author, "Title," Bachelor's thesis, Institution, Year.
  const ieeeAuthors = authors.map((a) => {
    const parts = a.trim().split(" ");
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      const firstInitial = parts[0][0];
      return `${firstInitial}. ${last}`;
    }
    return a;
  }).join(" and ");

  const ieeeCitation = `${ieeeAuthors}, "${thesis.title}," Bachelor's thesis, ${institution}, ${year}.${thesis.doi ? ` doi: ${thesis.doi}.` : ""}`;

  // Chicago: Author. Year. "Title." Bachelor's thesis, Institution.
  const chicagoCitation = `${authors[0]}. ${year}. "${thesis.title}." Bachelor's thesis, ${institution}.${thesis.doi ? ` https://doi.org/${thesis.doi}.` : ""}`;

  // BibTeX: @thesis{...}
  const firstLastName = (authors[0] || "author").toLowerCase().replace(/[^a-z]/g, "");
  const bibtexKey = `${firstLastName}${year}${thesis.title.slice(0, 8).toLowerCase().replace(/[^a-z]/g, "")}`;
  const bibtexCitation = `@thesis{${bibtexKey},
  author = {${authors.join(" and ")}},
  title = {${thesis.title}},
  school = {${institution}},
  year = {${year}},
  type = {Bachelor's Thesis},
  ${thesis.doi ? `doi = {${thesis.doi}},\n  ` : ""}note = {PECIT Institutional Archive}
}`;

  return {
    APA: apaCitation,
    MLA: mlaCitation,
    IEEE: ieeeCitation,
    Chicago: chicagoCitation,
    BibTeX: bibtexCitation,
  };
}
