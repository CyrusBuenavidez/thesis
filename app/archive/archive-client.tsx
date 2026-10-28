"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Input,
  Tag,
  Select,
  Card,
  Modal,
  Carousel,
  Button,
  Pagination,
  Typography,
  Divider,
  Row,
  Col,
  Tooltip,
  Spin,
  message,
} from "antd";
import {
  GlobalOutlined,
  SearchOutlined,
  FileTextOutlined,
  BookOutlined,
  SafetyCertificateOutlined,
  LockOutlined,
  UserOutlined,
  CalendarOutlined,
  CopyOutlined,
  CheckOutlined,
  AppstoreOutlined,
  BarsOutlined,
  ArrowUpOutlined,
  PhoneOutlined,
  BankOutlined,
  ReadOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  QuestionCircleOutlined,
  LinkOutlined,
} from "@ant-design/icons";

import {
  searchArchiveTheses,
  getPublicThesisDetail,
  type ArchiveSearchResult,
  type PublicThesisDetail,
} from "./actions";
import {
  generateAcademicCitations,
  type CitationFormats,
} from "@/lib/citations";

const { Title, Text, Paragraph } = Typography;

interface Props {
  initialResult: ArchiveSearchResult;
  initialParams: {
    query?: string;
    department?: string;
    program?: string;
    year?: number;
    license?: string;
    view?: "grid" | "list";
    sortBy?: "newest" | "oldest" | "title";
    page?: number;
  };
  availableDepartments?: string[];
}

const DEPARTMENTS = [
  "All",
  "COLLEGE OF COMPUTER STUDIES",
  "COLLEGE OF BUSINESS AND ACCOUNTANCY",
  "COLLEGE OF ENGINEERING",
  "COLLEGE OF EDUCATION",
  "SENIOR HIGH SCHOOL",
];

const WHY_ARCHIVE_SLIDES = [
  {
    title: "Centralized Metadata Hub",
    description:
      "A unified, secure repository for all institutional research. Our system consolidates decades of academic excellence into a single, easily navigable digital platform.",
  },
  {
    title: "Accelerated Discovery",
    description:
      "Instant access to abstracts and detailed metadata. Researchers can find relevant studies in seconds using our advanced filtering and search algorithms.",
  },
  {
    title: "Enhanced Academic Visibility",
    description:
      "Broaden the impact of your work. The archive ensures that student and faculty research is discoverable by the global academic community and future scholars.",
  },
  {
    title: "Digital Preservation Standards",
    description:
      "Standards-compliant archival ensuring long-term accessibility. We protect intellectual property with robust backups and modern data preservation formats.",
  },
];

export function ArchiveClient({
  initialResult,
  initialParams,
  availableDepartments,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const deptList = useMemo(() => {
    if (availableDepartments && availableDepartments.length > 0) {
      return ["All", ...availableDepartments];
    }
    return DEPARTMENTS;
  }, [availableDepartments]);

  // Search input state with 250ms debounce
  const [searchQuery, setSearchQuery] = useState(initialParams.query || "");
  const [debouncedQuery, setDebouncedQuery] = useState(initialParams.query || "");

  // Active filters
  const [department, setDepartment] = useState(initialParams.department || "");
  const [program, setProgram] = useState(initialParams.program || "");
  const [year, setYear] = useState<number | undefined>(initialParams.year);
  const [license, setLicense] = useState(initialParams.license || "");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">(
    initialParams.sortBy || "newest",
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">(
    initialParams.view || "grid",
  );
  const [page, setPage] = useState(initialParams.page || 1);

  // Search results
  const [results, setResults] = useState<ArchiveSearchResult>(initialResult);

  // Detail Modal state
  const [previewThesisId, setPreviewThesisId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewThesis, setPreviewThesis] = useState<PublicThesisDetail | null>(null);
  const [citations, setCitations] = useState<CitationFormats | null>(null);
  const [copiedStyle, setCopiedStyle] = useState<string | null>(null);

  // Info Modals state (User Manual, Research Policy, Submission Guide)
  const [activeGuideModal, setActiveGuideModal] = useState<
    "manual" | "policy" | "submission" | "faq" | "terms" | null
  >(null);

  // Scroll to top button visibility
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Mobile menu toggle
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Scroll listener for back-to-top button
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 250ms debounce effect for search input per SPEC
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Synchronize state to URL query parameters
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (department && department !== "all") params.set("dept", department);
    if (program && program !== "all") params.set("prog", program);
    if (year) params.set("yr", String(year));
    if (license && license !== "all") params.set("lic", license);
    if (viewMode !== "grid") params.set("view", viewMode);
    if (sortBy !== "newest") params.set("sort", sortBy);
    if (page > 1) params.set("p", String(page));

    const newUrl = params.toString() ? `/?${params.toString()}` : "/";
    window.history.replaceState(null, "", newUrl);
  }, [debouncedQuery, department, program, year, license, viewMode, sortBy, page]);

  // Fetch results when filters, query, sort, or page changes
  useEffect(() => {
    let active = true;
    startTransition(async () => {
      try {
        const res = await searchArchiveTheses({
          query: debouncedQuery.trim() || undefined,
          department: department || undefined,
          program: program || undefined,
          year: year || undefined,
          license: license || undefined,
          sortBy,
          page,
          pageSize: 12,
        });
        if (active) {
          setResults(res);
        }
      } catch (err) {
        console.error("Failed to execute search:", err);
      }
    });

    return () => {
      active = false;
    };
  }, [debouncedQuery, department, program, year, license, sortBy, page]);

  // Open Detail Modal
  const handleOpenPreview = async (thesisId: string) => {
    setPreviewThesisId(thesisId);
    setPreviewLoading(true);
    setPreviewThesis(null);
    setCitations(null);

    try {
      const detail = await getPublicThesisDetail(thesisId);
      if (detail) {
        setPreviewThesis(detail);
        setCitations(generateAcademicCitations(detail));
      }
    } catch (err) {
      console.error("Failed to fetch thesis detail:", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewThesisId(null);
    setPreviewThesis(null);
  };

  const handleCopyCitation = async (text: string, style: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStyle(style);
      message.success(`Copied ${style} citation to clipboard!`);
      setTimeout(() => setCopiedStyle(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setDepartment("");
    setProgram("");
    setYear(undefined);
    setLicense("");
    setPage(1);
    setSortBy("newest");
  };

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-[#1616D4] selection:text-white">
      {/* 1. AntD Enhanced Header / Navigation Shell matching thesis-archive-rust */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          {/* Brand Logo & Title matching screenshot */}
          <Link href="/" className="flex items-center gap-3 group min-w-0 shrink-0">
            <div className="relative flex items-center justify-center shrink-0">
              <Image
                src="/ptas-logo.png"
                alt="PECIT Thesis Archive System logo"
                width={90}
                height={42}
                className="w-16 h-8 sm:w-22 sm:h-10 object-contain drop-shadow-sm"
                priority
              />
            </div>
            <span className="font-extrabold tracking-tight text-sm sm:text-base md:text-lg text-[#1616D4] group-hover:text-[#0A2BE7] transition-colors leading-none whitespace-nowrap">
              THESIS ARCHIVE SYSTEM
            </span>
          </Link>

          {/* Navigation Anchor Links matching screenshot */}
          <nav className="hidden lg:flex items-center gap-2.5 xl:gap-6 2xl:gap-8 text-xs xl:text-sm font-medium text-slate-700">
            <button
              type="button"
              onClick={() => scrollToSection("hero")}
              className="hover:text-[#1616D4] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <GlobalOutlined className="text-base" /> Home
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("search")}
              className="hover:text-[#1616D4] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <SearchOutlined className="text-base" /> Search
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("categories")}
              className="hover:text-[#1616D4] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileTextOutlined className="text-base" /> Research Categories
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("guides")}
              className="hover:text-[#1616D4] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <BookOutlined className="text-base" /> Manual &amp; Guides
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("privacy")}
              className="hover:text-[#1616D4] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <SafetyCertificateOutlined className="text-base" /> Compliance &amp; Privacy
            </button>
          </nav>

          {/* Right Action: Sign In Button */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link href="/login" className="shrink-0">
              <Button
                type="primary"
                size="middle"
                aria-label="Sign In"
                style={{
                  background: "#1616D4",
                  borderColor: "#1616D4",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  height: 38,
                  padding: "0 18px",
                  boxShadow: "0 4px 14px rgba(22, 22, 212, 0.25)",
                }}
                className="hover:!bg-[#0A2BE7] transition-all"
              >
                Sign In
              </Button>
            </Link>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileMenuOpen}
            >
              <BarsOutlined style={{ fontSize: 20 }} />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2 shadow-xl animate-in fade-in duration-150">
            <Button
              type="text"
              block
              icon={<GlobalOutlined />}
              onClick={() => {
                scrollToSection("hero");
                setIsMobileMenuOpen(false);
              }}
              style={{ textAlign: "left", justifyContent: "flex-start", height: 40, fontWeight: 600 }}
            >
              Home
            </Button>
            <Button
              type="text"
              block
              icon={<SearchOutlined />}
              onClick={() => {
                scrollToSection("search");
                setIsMobileMenuOpen(false);
              }}
              style={{ textAlign: "left", justifyContent: "flex-start", height: 40, fontWeight: 600 }}
            >
              Search
            </Button>
            <Button
              type="text"
              block
              icon={<FileTextOutlined />}
              onClick={() => {
                scrollToSection("categories");
                setIsMobileMenuOpen(false);
              }}
              style={{ textAlign: "left", justifyContent: "flex-start", height: 40, fontWeight: 600 }}
            >
              Research Categories
            </Button>
            <Button
              type="text"
              block
              icon={<BookOutlined />}
              onClick={() => {
                scrollToSection("guides");
                setIsMobileMenuOpen(false);
              }}
              style={{ textAlign: "left", justifyContent: "flex-start", height: 40, fontWeight: 600 }}
            >
              Manual &amp; Guides
            </Button>
            <Button
              type="text"
              block
              icon={<SafetyCertificateOutlined />}
              onClick={() => {
                scrollToSection("privacy");
                setIsMobileMenuOpen(false);
              }}
              style={{ textAlign: "left", justifyContent: "flex-start", height: 40, fontWeight: 600 }}
            >
              Compliance &amp; Privacy
            </Button>
            <div className="pt-2">
              <Link href="/login" className="block w-full">
                <Button
                  type="primary"
                  block
                  style={{
                    background: "#1616D4",
                    borderColor: "#1616D4",
                    borderRadius: 8,
                    fontWeight: 700,
                    height: 40,
                  }}
                >
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* 2. Hero Banner matching thesis-archive-rust */}
      <section
        id="hero"
        className="relative flex min-h-[clamp(33rem,34vw,41rem)] items-center bg-cover bg-center text-white py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden shadow-inner scroll-mt-20 sm:scroll-mt-24"
        style={{
          backgroundImage:
            "linear-gradient(rgba(10, 32, 120, 0.46), rgba(8, 25, 96, 0.52)), url('/hero-cover.png')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        <div className="relative z-10 w-full min-w-0 max-w-4xl mx-auto text-center space-y-6">
          <Title
            level={1}
            style={{
              color: "#fff",
              fontSize: "clamp(2rem, 6vw, 4.5rem)",
              fontWeight: 800,
              letterSpacing: -1.5,
              textShadow: "0 8px 32px rgba(0,0,0,0.3)",
              margin: 0,
            }}
          >
            Discover Knowledge.
          </Title>

          <Paragraph
            style={{
              color: "rgba(255,255,255,0.95)",
              fontSize: "clamp(1.1rem, 3.5vw, 1.35rem)",
              lineHeight: 1.6,
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            Explore our comprehensive digital archive of research papers and dissertations, meticulously curated for the scholars and innovators of tomorrow.
          </Paragraph>

          {/* AntD Search Box matching reference `Kt.Search` */}
          <div className="archive-hero-search w-full min-w-0 pt-4 max-w-2xl mx-auto">
            <div
              style={{
                boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
                borderRadius: 12,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <Input.Search
                size="large"
                placeholder="Search for research, authors, or topics..."
                allowClear
                enterButton={
                  <Button
                    type="primary"
                    style={{
                      background: "#1E293B",
                      borderColor: "#1E293B",
                      padding: "0 20px",
                      height: 52,
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    Search Archive
                  </Button>
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onSearch={() => scrollToSection("categories")}
                style={{ height: 52 }}
              />
            </div>
          </div>

          <p className="text-xs text-blue-200/60 font-semibold tracking-widest uppercase pt-2">
            Advancing academic transparency through digital innovation.
          </p>
        </div>
      </section>

      {/* 3. Research Categories & Search Catalog Section */}
      <section id="categories" className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-14 sm:py-16 scroll-mt-20 sm:scroll-mt-24">
        {/* Section Heading */}
        <div id="search" className="archive-section-heading mb-6 scroll-mt-20 sm:scroll-mt-24">
          <Title
            level={2}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
              fontWeight: 800,
              color: "#0F172A",
            }}
          >
            <FileTextOutlined style={{ color: "#1616D4" }} /> Research Categories
          </Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            Browse institutional theses across academic departments and specialization programs.
          </Text>
        </div>

        {/* AntD CheckableTag Pills matching reference `Fn.CheckableTag` */}
        <div className="archive-category-tags flex flex-wrap gap-2.5 sm:gap-3 mb-8">
          {deptList.map((deptName: string) => {
            const isSelected =
              deptName === "All"
                ? !department || department === "all"
                : department.toLowerCase() === deptName.toLowerCase();

            return (
              <Tag.CheckableTag
                key={deptName}
                checked={isSelected}
                onChange={() => {
                  if (deptName === "All") {
                    setDepartment("");
                  } else {
                    setDepartment(deptName);
                  }
                  setPage(1);
                }}
                style={{
                  padding: "6px 18px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 20,
                  border: `1px solid ${isSelected ? "#1616D4" : "#CBD5E1"}`,
                  background: isSelected ? "#1616D4" : "#fff",
                  color: isSelected ? "#fff" : "#334155",
                  boxShadow: isSelected ? "0 4px 12px rgba(22, 22, 212, 0.2)" : "none",
                  transition: "all 0.2s ease",
                  cursor: "pointer",
                }}
              >
                {deptName}
              </Tag.CheckableTag>
            );
          })}
        </div>

        {/* Secondary Filter Bar & Results Meta using AntD Select */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm mb-8 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Filter Dropdowns */}
            <div className="archive-filter-controls flex flex-wrap items-center gap-3">
              {/* Program Filter */}
              <Select
                value={program || undefined}
                placeholder="All Programs / Tracks"
                allowClear
                onChange={(val) => {
                  setProgram(val || "");
                  setPage(1);
                }}
                style={{ minWidth: 200 }}
                options={[
                  { label: "All Programs / Tracks", value: "" },
                  ...results.facets.programs.map((p) => ({
                    label: `${p.value} (${p.count})`,
                    value: p.value,
                  })),
                ]}
              />

              {/* Graduation Year */}
              <Select
                value={year || undefined}
                placeholder="All Years"
                allowClear
                onChange={(val) => {
                  setYear(val ? Number(val) : undefined);
                  setPage(1);
                }}
                style={{ minWidth: 130 }}
                options={[
                  { label: "All Years", value: "" },
                  ...results.facets.years.map((y) => ({
                    label: `${y.value} (${y.count})`,
                    value: y.value,
                  })),
                ]}
              />

              {/* License Filter */}
              <Select
                value={license || undefined}
                placeholder="All Licenses"
                allowClear
                onChange={(val) => {
                  setLicense(val || "");
                  setPage(1);
                }}
                style={{ minWidth: 150 }}
                options={[
                  { label: "All Licenses", value: "" },
                  ...results.facets.licenses.map((lic) => ({
                    label: `${lic.value.toUpperCase()} (${lic.count})`,
                    value: lic.value,
                  })),
                ]}
              />

              {/* Reset button */}
              {(department || program || year || license || searchQuery) && (
                <Button
                  type="link"
                  danger
                  size="small"
                  onClick={handleResetFilters}
                  style={{ fontWeight: 600, padding: 0 }}
                >
                  Reset Filters ✕
                </Button>
              )}
            </div>

            {/* Right Controls: Sort & View Toggle */}
            <div className="archive-sort-controls flex items-center gap-3 shrink-0">
              <Select
                value={sortBy}
                onChange={(val) => {
                  setSortBy(val);
                  setPage(1);
                }}
                style={{ minWidth: 170 }}
                options={[
                  { label: "Sort: Newest First", value: "newest" },
                  { label: "Sort: Oldest First", value: "oldest" },
                  { label: "Sort: Title (A-Z)", value: "title" },
                ]}
              />

              {/* View Toggle */}
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <Button
                  type={viewMode === "grid" ? "primary" : "text"}
                  size="small"
                  icon={<AppstoreOutlined />}
                  onClick={() => setViewMode("grid")}
                  aria-label="Switch to grid view"
                  style={
                    viewMode === "grid"
                      ? { background: "#1616D4" }
                      : { color: "#64748b" }
                  }
                />
                <Button
                  type={viewMode === "list" ? "primary" : "text"}
                  size="small"
                  icon={<BarsOutlined />}
                  onClick={() => setViewMode("list")}
                  aria-label="Switch to list view"
                  style={
                    viewMode === "list"
                      ? { background: "#1616D4" }
                      : { color: "#64748b" }
                  }
                />
              </div>
            </div>
          </div>

          {/* Active Filter Chips Bar */}
          {(debouncedQuery || (department && department !== "all") || (program && program !== "all") || year || (license && license !== "all")) && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-500 mr-1">Active Filters:</span>
              
              {debouncedQuery && (
                <Tag
                  closable
                  onClose={() => setSearchQuery("")}
                  color="blue"
                  style={{ borderRadius: 6, fontWeight: 600, padding: "2px 8px" }}
                >
                  Query: &ldquo;{debouncedQuery}&rdquo;
                </Tag>
              )}

              {department && department !== "all" && (
                <Tag
                  closable
                  onClose={() => setDepartment("")}
                  color="cyan"
                  style={{ borderRadius: 6, fontWeight: 600, padding: "2px 8px" }}
                >
                  Dept: {department}
                </Tag>
              )}

              {program && program !== "all" && (
                <Tag
                  closable
                  onClose={() => setProgram("")}
                  color="purple"
                  style={{ borderRadius: 6, fontWeight: 600, padding: "2px 8px" }}
                >
                  Program: {program}
                </Tag>
              )}

              {year && (
                <Tag
                  closable
                  onClose={() => setYear(undefined)}
                  color="orange"
                  style={{ borderRadius: 6, fontWeight: 600, padding: "2px 8px" }}
                >
                  Year: {year}
                </Tag>
              )}

              {license && license !== "all" && (
                <Tag
                  closable
                  onClose={() => setLicense("")}
                  color="geekblue"
                  style={{ borderRadius: 6, fontWeight: 600, padding: "2px 8px" }}
                >
                  License: {license}
                </Tag>
              )}

              <Button
                type="link"
                size="small"
                onClick={handleResetFilters}
                style={{ color: "#dc2626", fontWeight: 700, padding: "0 4px", fontSize: 12 }}
              >
                Clear all filters ✕
              </Button>
            </div>
          )}

          {/* Result Telemetry and Counts */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <Text strong style={{ color: "#334155" }}>
                Showing {results.total} published studies
              </Text>
            </div>

            {/* Performance cache speed indicator */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className={results.cached ? "text-emerald-600 font-bold" : "text-blue-600"}>
                {results.cached ? <ThunderboltOutlined /> : <DatabaseOutlined />}{" "}
                {results.cached ? "Redis Cache Hit" : "Postgres Query"}: {results.durationMs}ms
              </span>
              {isPending && <Spin size="small" />}
            </div>
          </div>
        </div>

        {/* Results Grid / List using AntD Cards */}
        {results.items.length === 0 ? (
          <Card style={{ textAlign: "center", padding: "60px 20px", borderRadius: 16 }}>
            <span className="text-4xl block mb-3">🔍</span>
            <Title level={4} style={{ color: "#1e293b", marginBottom: 8 }}>
              No Published Theses Found
            </Title>
            <Paragraph type="secondary" style={{ maxWidth: 450, margin: "0 auto 16px" }}>
              No manuscript matches your current filter parameters. Try broadening your keywords or resetting filters.
            </Paragraph>
            <Button type="primary" onClick={handleResetFilters} style={{ background: "#1616D4" }}>
              Clear All Filters
            </Button>
          </Card>
        ) : viewMode === "grid" ? (
          <Row gutter={[24, 24]}>
            {results.items.map((thesis) => (
              <Col key={thesis.id} xs={24} sm={12} lg={8} xl={6}>
                <Card
                  hoverable
                  onClick={() => handleOpenPreview(thesis.id)}
                  style={{
                    height: "100%",
                    borderRadius: 14,
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.03)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  styles={{
                    body: {
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      padding: "20px",
                      justifyContent: "space-between",
                    },
                  }}
                  cover={
                    <div
                      style={{
                        height: 72,
                        background: "linear-gradient(135deg, #f0f4ff 0%, #e2e8f0 100%)",
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white shadow-xs flex items-center justify-center text-[#1616D4]">
                          <BookOutlined style={{ fontSize: 16 }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 tracking-wider uppercase">
                          PECIT Archive
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Tag
                          color="green"
                          style={{
                            margin: 0,
                            borderRadius: 10,
                            fontSize: 12,
                            fontWeight: 700,
                            padding: "2px 8px",
                          }}
                        >
                          OPEN ACCESS
                        </Tag>
                      </div>
                    </div>
                  }
                >
                  <div>
                    {/* Department Tag */}
                    <Tag
                      color="blue"
                      style={{
                        marginBottom: 10,
                        borderRadius: 4,
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                    >
                      {thesis.department}
                    </Tag>

                    {/* Title */}
                    <Title
                      level={5}
                      style={{
                        marginTop: 0,
                        marginBottom: 8,
                        lineHeight: 1.4,
                        color: "#0F172A",
                        fontWeight: 800,
                      }}
                      ellipsis={{ rows: 2 }}
                    >
                      {thesis.title}
                    </Title>

                    {/* Author & Year */}
                    <Text type="secondary" style={{ marginBottom: 4, display: "block", fontSize: 12 }}>
                      By <Text strong>{thesis.authorNames?.[0] || "PECIT Researcher"}</Text>
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 10 }}>
                      Published {thesis.year || "2026"}
                    </Text>

                    {/* DOI Badge */}
                    {thesis.doi && (
                      <div
                        style={{
                          display: "inline-block",
                          fontSize: 11,
                          background: "rgba(22, 22, 212, 0.06)",
                          color: "#1616D4",
                          padding: "3px 8px",
                          borderRadius: 4,
                          marginBottom: 12,
                          fontWeight: 700,
                          fontFamily: "monospace",
                        }}
                      >
                        DOI: {thesis.doi}
                      </div>
                    )}

                    {/* Abstract snippet */}
                    <Paragraph
                      ellipsis={{ rows: 3 }}
                      type="secondary"
                      style={{ marginBottom: 0, fontSize: 12, lineHeight: 1.6 }}
                    >
                      {thesis.abstract || "No abstract openly available for this research study."}
                    </Paragraph>
                  </div>

                  {/* Keywords footer */}
                  {thesis.keywords && thesis.keywords.length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
                      {thesis.keywords.slice(0, 3).map((kw) => (
                        <Tag
                          key={kw}
                          style={{
                            border: 0,
                            background: "#f1f5f9",
                            color: "#64748b",
                            fontSize: 11,
                            borderRadius: 4,
                          }}
                        >
                          #{kw}
                        </Tag>
                      ))}
                    </div>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          /* List View matching DSpace reference */
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm divide-y divide-slate-100">
            {results.items.map((thesis) => (
              <div
                key={thesis.id}
                onClick={() => handleOpenPreview(thesis.id)}
                className="p-6 hover:bg-slate-50/80 transition-colors cursor-pointer group"
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag color="blue" style={{ borderRadius: 4, fontWeight: 600 }}>
                        {thesis.department}
                      </Tag>
                      {thesis.program && (
                        <Tag style={{ borderRadius: 4, background: "#f1f5f9", color: "#475569" }}>
                          {thesis.program}
                        </Tag>
                      )}
                    </div>

                    <Title
                      level={4}
                      style={{
                        margin: "0 0 8px 0",
                        color: "#0F172A",
                        fontWeight: 700,
                        lineHeight: 1.35,
                      }}
                      className="group-hover:text-[#1616D4] transition-colors"
                    >
                      {thesis.title}
                    </Title>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                      <span>
                        <UserOutlined style={{ marginRight: 4 }} /> By{" "}
                        <Text strong>{thesis.authorNames?.[0] || "PECIT Researcher"}</Text>
                      </span>
                      <span>
                        <CalendarOutlined style={{ marginRight: 4 }} /> Published {thesis.year || "2026"}
                      </span>
                      {thesis.doi && <span className="font-mono text-blue-700">DOI: {thesis.doi}</span>}
                    </div>

                    <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                      {thesis.abstract || "No abstract overtly provided..."}
                    </Paragraph>
                  </div>

                  <div className="shrink-0 flex flex-row sm:flex-col items-center sm:items-end gap-2">
                    <Tag color="green" style={{ borderRadius: 12, fontWeight: 700, padding: "2px 10px" }}>
                      OPEN ACCESS
                    </Tag>
                    <span className="text-xs font-semibold text-[#1616D4] group-hover:underline">
                      View Details →
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AntD Pagination */}
        {results.totalPages > 1 && (
          <div className="flex justify-center mt-12">
            <Pagination
              current={page}
              total={results.total}
              pageSize={results.pageSize}
              onChange={(p) => setPage(p)}
              showSizeChanger={false}
            />
          </div>
        )}
      </section>

      {/* 4. Manual & Guides Section matching thesis-archive-rust */}
      <section id="guides" className="bg-white border-t border-slate-200/80 py-20 px-4 sm:px-6 lg:px-8 scroll-mt-20 sm:scroll-mt-24">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1616D4] flex items-center justify-center mx-auto mb-4 text-2xl shadow-xs">
              <BookOutlined />
            </div>
            <Title level={2} style={{ fontWeight: 800, color: "#0F172A", margin: "0 0 8px 0" }}>
              Manual &amp; Guides
            </Title>
            <Text type="secondary" style={{ fontSize: 16 }}>
              Premium documentation and policies for our digital thesis archive.
            </Text>
          </div>

          {/* 3 Guide Cards with 3D illustrations */}
          <Row gutter={[32, 32]} justify="center">
            {/* Card 1: User Manual */}
            <Col xs={24} md={8}>
              <div
                onClick={() => setActiveGuideModal("manual")}
                className="bg-[#F8FAFC] rounded-3xl p-8 sm:p-10 border border-slate-200/60 shadow-xs hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 text-center flex flex-col items-center justify-between cursor-pointer group h-full"
              >
                <div className="w-full max-w-[240px] aspect-square flex items-center justify-center mb-6">
                  <Image
                    src="/guide-books-3d.png"
                    alt="User Manual"
                    width={220}
                    height={220}
                    className="object-contain drop-shadow-2xl group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div>
                  <Title
                    level={3}
                    style={{
                      fontWeight: 800,
                      marginBottom: 8,
                      color: "#0F172A",
                    }}
                    className="group-hover:text-[#1616D4] transition-colors"
                  >
                    User Manual
                  </Title>
                  <Paragraph type="secondary" style={{ margin: 0, fontSize: 14 }}>
                    Step-by-step navigation guide for search, citations, and student access.
                  </Paragraph>
                </div>
              </div>
            </Col>

            {/* Card 2: Research Policy */}
            <Col xs={24} md={8}>
              <div
                onClick={() => setActiveGuideModal("policy")}
                className="bg-[#F8FAFC] rounded-3xl p-8 sm:p-10 border border-slate-200/60 shadow-xs hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 text-center flex flex-col items-center justify-between cursor-pointer group h-full"
              >
                <div className="w-full max-w-[240px] aspect-square flex items-center justify-center mb-6">
                  <Image
                    src="/guide-checklist-3d.png"
                    alt="Research Policy"
                    width={220}
                    height={220}
                    className="object-contain drop-shadow-2xl group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div>
                  <Title
                    level={3}
                    style={{
                      fontWeight: 800,
                      marginBottom: 8,
                      color: "#0F172A",
                    }}
                    className="group-hover:text-[#1616D4] transition-colors"
                  >
                    Research Policy
                  </Title>
                  <Paragraph type="secondary" style={{ margin: 0, fontSize: 14 }}>
                    Intellectual property rules, copyright protections, and citation ethics.
                  </Paragraph>
                </div>
              </div>
            </Col>

            {/* Card 3: Submission Guide */}
            <Col xs={24} md={8}>
              <div
                onClick={() => setActiveGuideModal("submission")}
                className="bg-[#F8FAFC] rounded-3xl p-8 sm:p-10 border border-slate-200/60 shadow-xs hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 text-center flex flex-col items-center justify-between cursor-pointer group h-full"
              >
                <div className="w-full max-w-[240px] aspect-square flex items-center justify-center mb-6">
                  <Image
                    src="/guide-question-3d.png"
                    alt="Submission Guide"
                    width={220}
                    height={220}
                    className="object-contain drop-shadow-2xl group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div>
                  <Title
                    level={3}
                    style={{
                      fontWeight: 800,
                      marginBottom: 8,
                      color: "#0F172A",
                    }}
                    className="group-hover:text-[#1616D4] transition-colors"
                  >
                    Submission Guide
                  </Title>
                  <Paragraph type="secondary" style={{ margin: 0, fontSize: 14 }}>
                    Manuscript preparation, PDF guidelines, and approval process.
                  </Paragraph>
                </div>
              </div>
            </Col>
          </Row>

          {/* 5. "Why use the Archive?" Section using AntD Carousel */}
          <div
            style={{
              maxWidth: 1000,
              margin: "80px auto 0",
              padding: "60px 40px",
              background: "#fff",
              borderRadius: 32,
              border: "1px solid rgba(0,0,0,0.04)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.02)",
              textAlign: "center",
            }}
          >
            <Title level={3} style={{ fontWeight: 800, marginBottom: 32, color: "#1616D4" }}>
              Why use the Archive?
            </Title>

            <Carousel autoplay effect="fade">
              {WHY_ARCHIVE_SLIDES.map((slide) => (
                <div key={slide.title} style={{ padding: "10px 20px" }}>
                  <Title level={4} style={{ fontWeight: 700, marginBottom: 12, color: "#0F172A" }}>
                    {slide.title}
                  </Title>
                  <Paragraph style={{ fontSize: 16, color: "#64748b", lineHeight: 1.8, maxWidth: 680, margin: "0 auto" }}>
                    {slide.description}
                  </Paragraph>
                </div>
              ))}
            </Carousel>

            <Divider style={{ margin: "40px 0 20px" }} />
            <Text type="secondary" italic style={{ fontSize: 15 }}>
              &ldquo;Advancing academic transparency through digital innovation.&rdquo;
            </Text>
          </div>
        </div>
      </section>

      {/* 6. Data Privacy & NPC Compliance Section matching thesis-archive-rust */}
      <section id="privacy" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-100/70 border-t border-slate-200/80 scroll-mt-20 sm:scroll-mt-24">
        <div className="max-w-4xl mx-auto">
          {/* Section Header with NPC badge */}
          <div className="text-center mb-12">
            <div className="flex justify-center mb-4">
              <Image
                src="/npc-logo.png"
                alt="National Privacy Commission"
                width={220}
                height={90}
                className="h-16 w-auto object-contain drop-shadow-sm"
              />
            </div>
            <Title level={2} style={{ fontWeight: 800, color: "#0F172A", margin: "0 0 8px 0" }}>
              Data Privacy &amp; NPC Compliance
            </Title>
            <Text type="secondary" style={{ fontSize: 15 }}>
              We are committed to protecting your research data and adhering to the Data Privacy Act of 2012 (RA 10173).
            </Text>
          </div>

          {/* White Card Container */}
          <div className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-200/80 shadow-md space-y-8">
            <div>
              <Title level={3} style={{ fontWeight: 800, color: "#1616D4", marginBottom: 16 }}>
                Your Data, Protected.
              </Title>
              <Paragraph style={{ color: "#475569", fontSize: 15, lineHeight: 1.8, marginBottom: 24 }}>
                This digital archive exclusively serves the thesis research output of our brilliant students and faculty. In compliance with the <Text strong>National Privacy Commission (NPC)</Text>, we ensure that all metadata and abstracts are handled with strict confidentiality and used solely for academic referencing.
              </Paragraph>

              {/* 2 Compliant Cards */}
              <Row gutter={[20, 20]}>
                <Col xs={24} sm={12}>
                  <div className="p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200/60 h-full">
                    <Text strong style={{ fontSize: 16, display: "block", marginBottom: 8, color: "#0F172A" }}>
                      Academic Use Only
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6, display: "block" }}>
                      All research materials are processed strictly for academic citation, peer review, and verification purposes.
                    </Text>
                  </div>
                </Col>

                <Col xs={24} sm={12}>
                  <div className="p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200/60 h-full">
                    <Text strong style={{ fontSize: 16, display: "block", marginBottom: 8, color: "#0F172A" }}>
                      RA 10173 Compliant
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6, display: "block" }}>
                      Full adherence to the Philippine Data Privacy laws ensuring your intellectual property and identity remain secure.
                    </Text>
                  </div>
                </Col>
              </Row>
            </div>

            {/* Bottom 3 Pillars with NPC Seal */}
            <div className="pt-8 border-t border-slate-100">
              <Row gutter={[20, 20]} justify="center" align="middle" style={{ textAlign: "center" }}>
                <Col xs={12} md={8}>
                  <div>
                    <Text strong style={{ display: "block", fontSize: 13, color: "#0F172A", letterSpacing: "1px" }}>
                      TRANSPARENCY
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Clear data usage policies.
                    </Text>
                  </div>
                </Col>

                <Col xs={24} md={8}>
                  <div className="flex flex-col items-center">
                    <Image
                      src="/npc-logo.png"
                      alt="NPC Compliant Seal"
                      width={140}
                      height={70}
                      className="h-11 w-auto object-contain mb-2 drop-shadow-sm"
                    />
                    <Text strong style={{ fontSize: 12, color: "#64748b", letterSpacing: "1px" }}>
                      NPC COMPLIANT SYSTEM
                    </Text>
                  </div>
                </Col>

                <Col xs={12} md={8}>
                  <div>
                    <Text strong style={{ display: "block", fontSize: 13, color: "#0F172A", letterSpacing: "1px" }}>
                      LEGITIMACY
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Strict academic purpose.
                    </Text>
                  </div>
                </Col>
              </Row>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Comprehensive Institutional Footer matching thesis-archive-rust */}
      <footer className="bg-[#0B0F19] text-white pt-16 pb-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-slate-800/80">
          {/* Col 1: Institutional Identity */}
          <div>
            <div className="mx-auto grid w-fit grid-cols-[5.5rem_1px_9rem] items-center gap-4 md:mx-0">
              <div className="flex flex-col items-center gap-2">
                <Image
                  src="/pecit-mono-logo.png"
                  alt="PECIT monochrome seal"
                  width={88}
                  height={88}
                  className="h-[5.5rem] w-[5.5rem] object-contain"
                />
                <span className="text-xs font-extrabold text-white">PECIT</span>
              </div>

              <div className="h-16 w-px self-start mt-3 bg-slate-700" aria-hidden="true" />

              <div className="flex flex-col items-center gap-2">
                <Image
                  src="/ptas-logo.png"
                  alt="PTAS logo"
                  width={144}
                  height={81}
                  className="h-[5.5rem] w-36 object-contain"
                />
                <span className="text-xs font-extrabold text-white">PTAS</span>
              </div>
            </div>
          </div>

          {/* Col 2: Manual & Guides / Terms */}
          <div className="space-y-6">
            <div>
              <h5 className="text-xs font-extrabold tracking-wider text-slate-300 uppercase mb-3">
                MANUAL &amp; GUIDES
              </h5>
              <ul className="space-y-2 text-xs text-slate-400">
                <li>
                  <button type="button" onClick={() => setActiveGuideModal("manual")} className="hover:text-blue-400 cursor-pointer">
                    • User Manual
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveGuideModal("policy")} className="hover:text-blue-400 cursor-pointer">
                    • Research Policy
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveGuideModal("submission")} className="hover:text-blue-400 cursor-pointer">
                    • Submission Guide
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-xs font-extrabold tracking-wider text-slate-300 uppercase mb-3">
                TERMS &amp; PRIVACY
              </h5>
              <ul className="space-y-2 text-xs text-slate-400">
                <li>
                  <button type="button" onClick={() => setActiveGuideModal("terms")} className="hover:text-blue-400 cursor-pointer">
                    • Terms of Use and Conditions
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollToSection("privacy")} className="hover:text-blue-400 cursor-pointer">
                    • Data Privacy Policy (RA 10173)
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Col 3: FAQs & Institutional Address */}
          <div className="space-y-6">
            <div>
              <h5 className="text-xs font-extrabold tracking-wider text-slate-300 uppercase mb-3">
                FREQUENTLY ASKED QUESTIONS
              </h5>
              <ul className="space-y-2 text-xs text-slate-400">
                <li>
                  <button type="button" onClick={() => setActiveGuideModal("faq")} className="hover:text-blue-400 cursor-pointer">
                    • General Access FAQ
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveGuideModal("submission")} className="hover:text-blue-400 cursor-pointer">
                    • Submission FAQ
                  </button>
                </li>
                <li>
                  <Link href="/login" className="hover:text-blue-400">
                    • Account Help &amp; Login
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-xs font-extrabold tracking-wider text-slate-300 uppercase mb-2 flex items-center gap-1.5">
                <BankOutlined /> Institution Address
              </h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                Capitol-Bonbon Road, Imadejas Subd., Butuan City, PH
              </p>
            </div>
          </div>

          {/* Col 4: For Inquiries Contact Numbers */}
          <div>
            <h5 className="text-xs font-extrabold tracking-wider text-slate-300 uppercase mb-4">
              FOR INQUIRIES
            </h5>
            <div className="space-y-4 text-xs text-slate-400">
              <div>
                <span className="font-bold text-white flex items-center gap-1.5 mb-0.5">
                  <PhoneOutlined /> COLLEGE
                </span>
                <p className="pl-5 leading-relaxed">
                  (+63) 92704-95730 or<br />(+63) 95138-70989
                </p>
              </div>

              <div>
                <span className="font-bold text-white flex items-center gap-1.5 mb-0.5">
                  <PhoneOutlined /> TESDA
                </span>
                <p className="pl-5 leading-relaxed">
                  (+63) 96391-58460 or<br />(+63) 92704-95730
                </p>
              </div>

              <div>
                <span className="font-bold text-white flex items-center gap-1.5 mb-0.5">
                  <PhoneOutlined /> BASIC EDUCATION
                </span>
                <p className="pl-5 leading-relaxed">
                  (+63) 93868-50231
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom copyright row */}
        <div className="max-w-7xl mx-auto pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© 2026 THESIS ARCHIVE SYSTEM. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-white transition-colors">
              Portal Access
            </Link>
            <button type="button" onClick={() => scrollToSection("privacy")} className="hover:text-white transition-colors cursor-pointer">
              RA 10173 Privacy
            </button>
          </div>
        </div>
      </footer>

      {/* Back to Top Floating Button */}
      {showScrollTop && (
        <Tooltip title="Back to top">
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<ArrowUpOutlined />}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 1000,
              background: "#1616D4",
              boxShadow: "0 4px 16px rgba(22, 22, 212, 0.4)",
              width: 46,
              height: 46,
            }}
          />
        </Tooltip>
      )}

      {/* 8. AntD Record Metadata Overview Modal matching reference */}
      <Modal
        open={!!previewThesisId}
        onCancel={handleClosePreview}
        width={850}
        centered
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                background: "rgba(22, 22, 212, 0.08)",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(22, 22, 212, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileTextOutlined style={{ color: "#1616D4", fontSize: 20 }} />
            </div>
            <div>
              <span style={{ color: "#0F172A", fontSize: 18, fontWeight: 800, display: "block" }}>
                Record Metadata Overview
              </span>
              <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500 }}>
                Institutional Scholarly Repository
              </span>
            </div>
          </div>
        }
        footer={[
          <Button
            key="close"
            type="primary"
            onClick={handleClosePreview}
            style={{
              background: "#1616D4",
              borderRadius: 8,
              height: 40,
              fontWeight: 700,
              padding: "0 24px",
            }}
          >
            Close Record
          </Button>,
        ]}
        styles={{
          body: {
            maxHeight: "75vh",
            overflowY: "auto",
            padding: "20px 24px",
          },
        }}
      >
        {previewLoading || !previewThesis ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <Spin size="large" />
            <p style={{ marginTop: 16, color: "#94a3b8", fontSize: 13 }}>
              Retrieving academic record metadata...
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Department & Program Badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Tag color="blue" style={{ borderRadius: 4, fontWeight: 600, padding: "3px 10px", fontSize: 12 }}>
                {previewThesis.department}
              </Tag>
              {previewThesis.program && (
                <Tag color="cyan" style={{ borderRadius: 4, fontWeight: 600, padding: "3px 10px", fontSize: 12 }}>
                  {previewThesis.program}
                </Tag>
              )}
            </div>

            {/* Title */}
            <Title level={3} style={{ margin: 0, color: "#0F172A", fontWeight: 800, lineHeight: 1.3 }}>
              {previewThesis.title}
            </Title>

            {/* Abstract Overview Card */}
            <Card
              size="small"
              title={
                <Text strong style={{ color: "#1616D4", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <FileTextOutlined /> ABSTRACT OVERVIEW
                </Text>
              }
              style={{
                background: "#F8FAFC",
                borderLeft: "5px solid #1616D4",
                borderRadius: "4px 12px 12px 4px",
                border: "1px solid #E2E8F0",
              }}
              styles={{ body: { padding: 18 } }}
            >
              <Paragraph style={{ fontSize: 14, lineHeight: 1.8, color: "#334155", margin: 0, whiteSpace: "pre-wrap" }}>
                {previewThesis.abstract || "No abstract overtly available for this document."}
              </Paragraph>
            </Card>

            {/* Authors & Institutional Metadata Grid */}
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <div style={{ padding: 16, background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", height: "100%" }}>
                  <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", fontWeight: 800, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <UserOutlined style={{ color: "#1616D4" }} /> PRIMARY AUTHOR
                  </Text>
                  <Text strong style={{ fontSize: 16, color: "#0F172A", display: "block" }}>
                    {previewThesis.authorNames?.[0] || "PECIT Researcher"}
                  </Text>
                </div>
              </Col>

              <Col xs={24} sm={12}>
                <div style={{ padding: 16, background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", height: "100%" }}>
                  <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", fontWeight: 800, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <UserOutlined style={{ color: "#1616D4" }} /> CO-AUTHORS
                  </Text>
                  <Text strong style={{ fontSize: 16, color: "#0F172A", display: "block" }}>
                    {previewThesis.authorNames && previewThesis.authorNames.length > 1
                      ? previewThesis.authorNames.slice(1).join(", ")
                      : "None"}
                  </Text>
                </div>
              </Col>

              <Col xs={24} sm={12}>
                <div style={{ padding: 16, background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", height: "100%" }}>
                  <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", fontWeight: 800, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <GlobalOutlined style={{ color: "#1616D4" }} /> INSTITUTION &amp; YEAR
                  </Text>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Text strong style={{ fontSize: 16, color: "#0F172A" }}>
                      Institutional Record
                    </Text>
                    <Text style={{ color: "#cbd5e1", fontSize: 16 }}>|</Text>
                    <Text strong style={{ fontSize: 16, color: "#1616D4" }}>
                      {previewThesis.year || "2026"}
                    </Text>
                  </div>
                </div>
              </Col>

              {previewThesis.doi && (
                <Col xs={24} sm={12}>
                  <div style={{ padding: 16, background: "rgba(22, 22, 212, 0.04)", borderRadius: 12, border: "1px dashed rgba(22, 22, 212, 0.3)", height: "100%" }}>
                    <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: "#1616D4", fontWeight: 800, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <LinkOutlined /> DOI REFERENCE
                    </Text>
                    <Text strong style={{ fontSize: 14, color: "#0F172A", wordBreak: "break-all", fontFamily: "monospace" }}>
                      {previewThesis.doi}
                    </Text>
                  </div>
                </Col>
              )}
            </Row>

            {/* Keywords */}
            {previewThesis.keywords && previewThesis.keywords.length > 0 && (
              <div>
                <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", fontWeight: 800, display: "block", marginBottom: 8 }}>
                  INDEXED KEYWORDS
                </Text>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {previewThesis.keywords.map((kw) => (
                    <Tag key={kw} style={{ borderRadius: 4, padding: "4px 10px", fontSize: 12, background: "#f1f5f9", border: 0 }}>
                      {kw}
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {/* Academic Citations with Copy Tool */}
            {citations && (
              <Card
                size="small"
                title={
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Text strong style={{ fontSize: 13, color: "#0F172A", textTransform: "uppercase", letterSpacing: "1px" }}>
                      📚 ACADEMIC CITATIONS
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Click to copy
                    </Text>
                  </div>
                }
                style={{ borderRadius: 12, border: "1px solid #E2E8F0" }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(["APA", "MLA", "IEEE", "Chicago", "BibTeX"] as const).map((style) => (
                    <div
                      key={style}
                      onClick={() => handleCopyCitation(citations[style], style)}
                      className="p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200/80 transition-colors cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div className="flex-1 pr-3 truncate">
                        <span className="font-bold text-[#1616D4] uppercase mr-2">{style}:</span>
                        <span className="text-slate-600 font-mono text-xs">{citations[style]}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 shrink-0">
                        {copiedStyle === style ? (
                          <span style={{ color: "#16a34a", fontWeight: 700 }}>
                            <CheckOutlined /> Copied
                          </span>
                        ) : (
                          <span>
                            <CopyOutlined /> Copy
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Manuscript Access Box matching thesis-archive-rust */}
            <div
              style={{
                padding: "36px 24px",
                background: "linear-gradient(180deg, rgba(22, 22, 212, 0.03) 0%, rgba(248, 250, 252, 0.8) 100%)",
                borderRadius: 16,
                border: "1px solid #E2E8F0",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px auto",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.05)",
                  fontSize: 24,
                  color: "#1616D4",
                }}
              >
                <LockOutlined />
              </div>
              <Title level={4} style={{ color: "#0F172A", margin: "0 0 12px 0", fontWeight: 800 }}>
                Confidential Resource
              </Title>
              <Paragraph style={{ color: "#64748b", fontSize: 14, maxWidth: 540, margin: "0 auto 28px auto", lineHeight: 1.7 }}>
                The full manuscript, raw methodology, and dataset results are strictly shielded for internal use. Access is restricted to authorized clients securely connected to the Intranet Portal.
              </Paragraph>
              <Link href="/login">
                <Button
                  type="primary"
                  size="large"
                  style={{
                    background: "#0A2BE7",
                    borderRadius: 10,
                    fontWeight: 800,
                    padding: "0 36px",
                    height: 48,
                    fontSize: 15,
                    boxShadow: "0 8px 20px rgba(10, 43, 231, 0.3)",
                  }}
                >
                  SEE MORE... LOGIN TO PORTAL
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Modal>

      {/* 9. Guides Informational Modal (User Manual / Policy / Submission / FAQ / Terms) */}
      <Modal
        open={!!activeGuideModal}
        onCancel={() => setActiveGuideModal(null)}
        width={700}
        centered
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {activeGuideModal === "manual" && <BookOutlined style={{ color: "#1616D4", fontSize: 20 }} />}
            {activeGuideModal === "policy" && <SafetyCertificateOutlined style={{ color: "#1616D4", fontSize: 20 }} />}
            {activeGuideModal === "submission" && <FileTextOutlined style={{ color: "#1616D4", fontSize: 20 }} />}
            {activeGuideModal === "faq" && <QuestionCircleOutlined style={{ color: "#1616D4", fontSize: 20 }} />}
            {activeGuideModal === "terms" && <ReadOutlined style={{ color: "#1616D4", fontSize: 20 }} />}
            <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
              {activeGuideModal === "manual" && "Archive User Manual"}
              {activeGuideModal === "policy" && "Institutional Research Policy"}
              {activeGuideModal === "submission" && "Thesis Submission Guidelines"}
              {activeGuideModal === "faq" && "Frequently Asked Questions"}
              {activeGuideModal === "terms" && "Terms of Use and Conditions"}
            </span>
          </div>
        }
        footer={[
          <Button
            key="ok"
            type="primary"
            onClick={() => setActiveGuideModal(null)}
            style={{ background: "#1E293B", borderRadius: 6 }}
          >
            Understood
          </Button>,
        ]}
      >
        <div style={{ padding: "12px 0", fontSize: 14, color: "#475569", lineHeight: 1.8 }}>
          {activeGuideModal === "manual" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Paragraph strong style={{ color: "#0F172A" }}>
                Welcome to the PECIT Thesis Archive System (PTAS) User Guide.
              </Paragraph>
              <p>
                1. <strong>Searching the Repository:</strong> Use the hero search bar or category tags to find published capstone manuscripts by department, graduation year, or program track.
              </p>
              <p>
                2. <strong>Viewing Metadata:</strong> Click on any research card to open the record metadata dialog, containing abstracts, co-authors, DOI records, and indexed keywords.
              </p>
              <p>
                3. <strong>Generating Citations:</strong> Under each thesis overview, choose APA 7th, MLA 9th, IEEE, Chicago, or BibTeX and click &ldquo;Copy&rdquo; to paste directly into your bibliography.
              </p>
              <p>
                4. <strong>Portal Sign In:</strong> Click &ldquo;Admin / Client Portal&rdquo; on the upper right to sign into the system with your institutional credentials.
              </p>
            </div>
          )}

          {activeGuideModal === "policy" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Paragraph strong style={{ color: "#0F172A" }}>
                PECIT Institutional Research &amp; Intellectual Property Policy.
              </Paragraph>
              <p>
                • <strong>Compliance with RA 10173:</strong> In strict compliance with the Data Privacy Act of 2012, all personal information, contact numbers, and raw student identifiers are protected.
              </p>
              <p>
                • <strong>Intellectual Property:</strong> Authors retain academic copyright over their submitted manuscripts. The institute retains a non-exclusive license for scholarly preservation, archiving, and research indexing.
              </p>
              <p>
                • <strong>Embargo &amp; Confidentiality:</strong> Proprietary, patent-pending, or sponsor-funded research may be placed under administrative embargo for up to two years.
              </p>
            </div>
          )}

          {activeGuideModal === "submission" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Paragraph strong style={{ color: "#0F172A" }}>
                Student Researcher Manuscript Submission Steps.
              </Paragraph>
              <p>
                1. Log into your account using the <strong>Admin / Client Portal</strong> button.
              </p>
              <p>
                2. Navigate to <strong>My Thesis</strong> in your module navigation menu.
              </p>
              <p>
                3. Click <strong>+ Submit Thesis Manuscript</strong> and fill in the title, abstract, authors, and keywords.
              </p>
              <p>
                4. Upload your finalized PDF document. The system will perform automated checks before forwarding the submission to your assigned faculty advisor.
              </p>
            </div>
          )}

          {activeGuideModal === "faq" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Paragraph strong style={{ color: "#0F172A" }}>
                Frequently Asked Questions.
              </Paragraph>
              <p>
                <strong>Q: Who can view the theses in the archive?</strong><br />
                A: Public users can freely search and view abstracts, metadata, and citation references. Full manuscripts are shielded for authenticated institutional access.
              </p>
              <p>
                <strong>Q: How do I request full manuscript access?</strong><br />
                A: Authorized PECIT students and faculty can log in through the portal. For external scholarly inquiries, contact the Academic Librarian at the library office.
              </p>
            </div>
          )}

          {activeGuideModal === "terms" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Paragraph strong style={{ color: "#0F172A" }}>
                Terms of Use and Conditions.
              </Paragraph>
              <p>
                By accessing the PECIT Thesis Archive System, you agree to utilize the materials exclusively for non-commercial educational and research purposes. Systematic harvesting or unauthorized scraping is strictly prohibited.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
