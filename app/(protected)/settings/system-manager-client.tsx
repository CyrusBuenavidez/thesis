"use client";

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  type SystemSettingsMap,
  type DepartmentItem,
  type ProgramItem,
  updateSystemSettings,
  addDepartment,
  updateDepartment,
  deleteDepartment,
  addProgram,
  updateProgram,
  deleteProgram,
  getDepartments,
  getPrograms,
} from "./actions";

interface Props {
  initialSettings: SystemSettingsMap;
  initialDepartments: DepartmentItem[];
  initialPrograms: ProgramItem[];
  activeTabSlug?: string;
}

type TabType = "departments" | "programs" | "senior-high-programs" | "branding";

function parseTabSlug(slug?: string | null, path?: string | null): TabType {
  if (path) {
    const cleanPath = path.toLowerCase();
    if (cleanPath.includes("/settings/programs")) return "programs";
    if (cleanPath.includes("/settings/senior-high")) return "senior-high-programs";
    if (cleanPath.includes("/settings/branding") || cleanPath.includes("/settings/branding-cms")) return "branding";
    if (cleanPath.includes("/settings/departments")) return "departments";
    if (cleanPath === "/settings" || cleanPath.endsWith("/settings/")) return "departments";
  }

  const s = slug?.toLowerCase();
  if (s === "programs") return "programs";
  if (s === "senior-high-programs" || s === "senior-high") return "senior-high-programs";
  if (s === "branding" || s === "branding-cms") return "branding";
  if (s === "departments") return "departments";

  return "departments";
}

export function SystemManagerClient({
  initialSettings,
  initialDepartments,
  initialPrograms,
  activeTabSlug,
}: Props) {
  const pathname = usePathname();

  // Manage active tab in local state for instant, smooth client-side switching without page reloads
  const [activeTab, setActiveTab] = useState<TabType>(() =>
    parseTabSlug(activeTabSlug, typeof window !== "undefined" ? window.location.pathname : pathname)
  );

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"name" | "department" | "code">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [departments, setDepartments] = useState<DepartmentItem[]>(initialDepartments);
  const [programs, setPrograms] = useState<ProgramItem[]>(initialPrograms);
  const [settings, setSettings] = useState<SystemSettingsMap>(initialSettings);
  const [domainInput, setDomainInput] = useState(
    initialSettings.allowed_email_domains.join(", "),
  );

  // Keep active tab in sync if external navigation / activeTabSlug prop changes
  useEffect(() => {
    const resolved = parseTabSlug(activeTabSlug, pathname);
    setActiveTab((prev) => (prev !== resolved ? resolved : prev));
  }, [activeTabSlug, pathname]);

  // Handle browser back and forward history buttons
  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname;
      const tab = parseTabSlug(null, currentPath);
      setActiveTab(tab);
      setSearchQuery("");
      setCurrentPage(1);
      setOpenMenuId(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Sync server prop updates smoothly if revalidated
  useEffect(() => {
    if (initialDepartments) setDepartments(initialDepartments);
  }, [initialDepartments]);

  useEffect(() => {
    if (initialPrograms) setPrograms(initialPrograms);
  }, [initialPrograms]);

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
      setDomainInput(initialSettings.allowed_email_domains?.join(", ") || "");
    }
  }, [initialSettings]);

  // Modals & UI states
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Active action menu row id
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Department Modal State
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", code: "", description: "" });

  // Program Modal State
  const [progModalOpen, setProgModalOpen] = useState(false);
  const [editingProg, setEditingProg] = useState<ProgramItem | null>(null);
  const [progForm, setProgForm] = useState({
    name: "",
    code: "",
    department_name: "",
    type: "college" as "college" | "senior_high",
    description: "",
  });

  // Delete Confirmation Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "department" | "program";
    id: string;
    title: string;
  } | null>(null);

  // Close popup menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Show auto-dismissing toast
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSearchQuery("");
    setCurrentPage(1);
    setOpenMenuId(null);

    const targetUrl = tab === "departments" ? "/settings" : `/settings/${tab}`;
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", targetUrl);
    }
  };

  const handleRefresh = () => {
    startTransition(async () => {
      try {
        const [dList, pList] = await Promise.all([getDepartments(), getPrograms()]);
        setDepartments(dList);
        setPrograms(pList);
        showToast("success", "System records refreshed successfully.");
      } catch {
        showToast("error", "Failed to refresh records.");
      }
    });
  };

  // --- Filtered & Sorted Lists ---
  const filteredDepartments = useMemo(() => {
    let list = departments;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.code && d.code.toLowerCase().includes(q)) ||
          (d.description && d.description.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => {
      const valA = a.name.toLowerCase();
      const valB = b.name.toLowerCase();
      return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  }, [departments, searchQuery, sortOrder]);

  const filteredPrograms = useMemo(() => {
    // When in "senior-high-programs" tab, show only senior high.
    // When in "programs" tab, show all programs (College + SHS per reference screenshot 3).
    let list = activeTab === "senior-high-programs"
      ? programs.filter((p) => p.type === "senior_high" || p.department_name.toUpperCase().includes("SENIOR HIGH"))
      : programs;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.department_name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }

    return [...list].sort((a, b) => {
      let valA = a.name.toLowerCase();
      let valB = b.name.toLowerCase();
      if (sortField === "code") {
        valA = a.code.toLowerCase();
        valB = b.code.toLowerCase();
      } else if (sortField === "department") {
        valA = a.department_name.toLowerCase();
        valB = b.department_name.toLowerCase();
      }
      return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  }, [programs, activeTab, searchQuery, sortField, sortOrder]);

  // Pagination slicing
  const displayedDepartments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDepartments.slice(start, start + pageSize);
  }, [filteredDepartments, currentPage]);

  const displayedPrograms = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPrograms.slice(start, start + pageSize);
  }, [filteredPrograms, currentPage]);

  const totalPages = useMemo(() => {
    const total = activeTab === "departments" ? filteredDepartments.length : filteredPrograms.length;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [activeTab, filteredDepartments.length, filteredPrograms.length]);

  // --- Department Modal Actions ---
  const openAddDepartmentModal = () => {
    setEditingDept(null);
    setDeptForm({ name: "", code: "", description: "" });
    setDeptModalOpen(true);
  };

  const openEditDepartmentModal = (dept: DepartmentItem) => {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name,
      code: dept.code || "",
      description: dept.description || "",
    });
    setDeptModalOpen(true);
    setOpenMenuId(null);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptForm.name.trim()) {
      showToast("error", "Department name is required.");
      return;
    }

    startTransition(async () => {
      if (editingDept) {
        const res = await updateDepartment(editingDept.id, deptForm);
        if (!res.success) {
          showToast("error", res.error || "Failed to update department.");
        } else {
          showToast("success", `Department "${deptForm.name}" updated successfully.`);
          setDeptModalOpen(false);
          const [dList, pList] = await Promise.all([getDepartments(), getPrograms()]);
          setDepartments(dList);
          setPrograms(pList);
        }
      } else {
        const res = await addDepartment(deptForm);
        if (!res.success) {
          showToast("error", res.error || "Failed to create department.");
        } else {
          showToast("success", `Department "${deptForm.name}" added successfully.`);
          setDeptModalOpen(false);
          const dList = await getDepartments();
          setDepartments(dList);
        }
      }
    });
  };

  // --- Program Modal Actions ---
  const openAddProgramModal = () => {
    setEditingProg(null);
    const defaultDept =
      activeTab === "senior-high-programs"
        ? departments.find((d) => d.name.toUpperCase().includes("SENIOR HIGH"))?.name ||
          "SENIOR HIGH SCHOOL"
        : departments[0]?.name || "";

    setProgForm({
      name: "",
      code: "",
      department_name: defaultDept,
      type: activeTab === "senior-high-programs" ? "senior_high" : "college",
      description: "",
    });
    setProgModalOpen(true);
  };

  const openEditProgramModal = (prog: ProgramItem) => {
    setEditingProg(prog);
    setProgForm({
      name: prog.name,
      code: prog.code,
      department_name: prog.department_name,
      type: prog.type,
      description: prog.description || "",
    });
    setProgModalOpen(true);
    setOpenMenuId(null);
  };

  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progForm.name.trim()) {
      showToast("error", "Program name is required.");
      return;
    }
    if (!progForm.code.trim()) {
      showToast("error", "Program code is required.");
      return;
    }
    if (!progForm.department_name) {
      showToast("error", "Please select a department.");
      return;
    }

    startTransition(async () => {
      if (editingProg) {
        const res = await updateProgram(editingProg.id, progForm);
        if (!res.success) {
          showToast("error", res.error || "Failed to update program.");
        } else {
          showToast("success", `Program "${progForm.code}" updated successfully.`);
          setProgModalOpen(false);
          const pList = await getPrograms();
          setPrograms(pList);
        }
      } else {
        const res = await addProgram(progForm);
        if (!res.success) {
          showToast("error", res.error || "Failed to add program.");
        } else {
          showToast("success", `Program "${progForm.code}" added successfully.`);
          setProgModalOpen(false);
          const [pList, dList] = await Promise.all([getPrograms(), getDepartments()]);
          setPrograms(pList);
          setDepartments(dList);
        }
      }
    });
  };

  // --- Delete Actions ---
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    startTransition(async () => {
      if (deleteConfirm.type === "department") {
        const res = await deleteDepartment(deleteConfirm.id);
        if (!res.success) {
          showToast("error", res.error || "Failed to delete department.");
        } else {
          showToast("success", `Department "${deleteConfirm.title}" removed.`);
          setDeleteConfirm(null);
          const dList = await getDepartments();
          setDepartments(dList);
        }
      } else {
        const res = await deleteProgram(deleteConfirm.id);
        if (!res.success) {
          showToast("error", res.error || "Failed to delete program.");
        } else {
          showToast("success", `Program "${deleteConfirm.title}" removed.`);
          setDeleteConfirm(null);
          const [pList, dList] = await Promise.all([getPrograms(), getDepartments()]);
          setPrograms(pList);
          setDepartments(dList);
        }
      }
    });
  };

  // --- Branding & Settings Form Submit ---
  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    const domains = domainInput
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    startTransition(async () => {
      try {
        const res = await updateSystemSettings({
          institution_name: settings.institution_name,
          admin_contact_email: settings.admin_contact_email,
          allowed_email_domains: domains,
          google_auto_provision: settings.google_auto_provision,
          retention_policy: settings.retention_policy,
          primary_color: settings.primary_color,
          announcement_banner: settings.announcement_banner,
          announcement_enabled: settings.announcement_enabled,
        });

        if (!res.success) {
          showToast("error", res.error || "Failed to update branding settings.");
        } else {
          showToast("success", "System settings and institutional branding saved successfully.");
        }
      } catch {
        showToast("error", "An unexpected error occurred while saving.");
      }
    });
  };

  return (
    <div className="w-full space-y-5">
      {/* Toast Notification */}
      {toast && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl text-xs font-semibold border flex items-center justify-between transition-all shadow-sm ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-xs opacity-60 hover:opacity-100 ml-4 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Header matching reference */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          System Manager
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage departments, programs, and educational tracks.
        </p>
      </div>

      {/* Modern Pill/Tab Bar matching the reference screenshots */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto select-none">
        {/* Tab 1: Departments */}
        <button
          type="button"
          onClick={() => handleTabChange("departments")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
            activeTab === "departments"
              ? "border border-[#1616D4] text-[#1616D4] bg-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
            <path d="M9 22v-4h6v4" />
            <path d="M8 6h.01" />
            <path d="M16 6h.01" />
            <path d="M12 6h.01" />
            <path d="M12 10h.01" />
            <path d="M12 14h.01" />
            <path d="M16 10h.01" />
            <path d="M16 14h.01" />
            <path d="M8 10h.01" />
            <path d="M8 14h.01" />
          </svg>
          <span>Departments</span>
        </button>

        {/* Tab 2: Programs */}
        <button
          type="button"
          onClick={() => handleTabChange("programs")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
            activeTab === "programs"
              ? "border border-[#1616D4] text-[#1616D4] bg-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
          </svg>
          <span>Programs</span>
        </button>

        {/* Tab 3: Senior High Programs */}
        <button
          type="button"
          onClick={() => handleTabChange("senior-high-programs")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
            activeTab === "senior-high-programs"
              ? "border border-[#1616D4] text-[#1616D4] bg-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <span>Senior High Programs</span>
        </button>

        {/* Tab 4: Branding & CMS */}
        <button
          type="button"
          onClick={() => handleTabChange("branding")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
            activeTab === "branding"
              ? "border border-[#1616D4] text-[#1616D4] bg-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z" />
          </svg>
          <span>Branding &amp; CMS</span>
        </button>
      </div>

      {/* --- CONTENT TABS --- */}

      {/* TAB 1: DEPARTMENTS */}
      <div className={activeTab === "departments" ? "space-y-4" : "hidden"}>
        {/* Action & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search departments..."
                className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-xs"
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isPending}
                title="Refresh departments"
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shadow-xs"
              >
                <svg className={`w-4 h-4 ${isPending ? "animate-spin text-blue-600" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
              </button>

              <button
                type="button"
                onClick={openAddDepartmentModal}
                className="px-3.5 py-2 rounded-lg bg-[#1616D4] hover:bg-[#1212B8] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <span>+</span>
                <span>Add Department</span>
              </button>
            </div>
          </div>

          {/* Departments Table matching screenshot 2 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#EEF4FF] border-b border-slate-200/80 text-[11px] font-bold text-slate-700 tracking-wider">
                    <th scope="col" className="w-12 px-3 py-3 text-center"></th>
                    <th scope="col" className="px-4 py-3">Department</th>
                    <th
                      scope="col"
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                      className="px-4 py-3 text-right cursor-pointer select-none hover:text-blue-700"
                    >
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
                        </svg>
                        <span>Programs</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {displayedDepartments.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                        No departments found. Click &quot;Add Department&quot; to create one.
                      </td>
                    </tr>
                  ) : (
                    displayedDepartments.map((dept) => (
                      <tr key={dept.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Action Menu */}
                        <td className="px-3 py-3.5 text-center relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === dept.id ? null : dept.id);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center"
                            aria-label={`Actions for ${dept.name}`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                              <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                              <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                            </svg>
                          </button>

                          {/* Dropdown Menu */}
                          {openMenuId === dept.id && (
                            <div
                              ref={menuRef}
                              className="absolute left-8 top-2 z-30 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 text-left text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => openEditDepartmentModal(dept)}
                                className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                              >
                                <span>✏️</span> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDeleteConfirm({
                                    type: "department",
                                    id: dept.id,
                                    title: dept.name,
                                  });
                                }}
                                className="w-full px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                              >
                                <span>🗑️</span> Delete
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Department Name */}
                        <td className="px-4 py-3.5 font-bold text-slate-900 tracking-wide">
                          {dept.name}
                          {dept.code && (
                            <span className="ml-2 text-[11px] text-slate-400 font-normal">
                              ({dept.code})
                            </span>
                          )}
                        </td>

                        {/* Programs Count */}
                        <td className="px-4 py-3.5 text-right font-medium text-slate-500">
                          {dept.program_count ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                              {dept.program_count} {dept.program_count === 1 ? "Program" : "Programs"}
                            </span>
                          ) : (
                            <span className="text-slate-400">0 Programs</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls matching screenshot */}
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-1.5 text-xs text-slate-600">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                aria-label="Previous Page"
              >
                &lt;
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setCurrentPage(pg)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                    currentPage === pg
                      ? "border border-[#1616D4] text-[#1616D4] bg-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {pg}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                aria-label="Next Page"
              >
                &gt;
              </button>
            </div>
          </div>
        </div>

      {/* TAB 2 & TAB 3: PROGRAMS & SENIOR HIGH PROGRAMS */}
      <div className={(activeTab === "programs" || activeTab === "senior-high-programs") ? "space-y-4" : "hidden"}>
        {/* Action & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={
                  activeTab === "senior-high-programs"
                    ? "Search senior high tracks & strands..."
                    : "Search programs..."
                }
                className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-xs"
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isPending}
                title={activeTab === "senior-high-programs" ? "Refresh senior high programs" : "Refresh programs"}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shadow-xs"
              >
                <svg className={`w-4 h-4 ${isPending ? "animate-spin text-blue-600" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
              </button>

              <button
                type="button"
                onClick={openAddProgramModal}
                className="px-3.5 py-2 rounded-lg bg-[#1616D4] hover:bg-[#1212B8] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <span>+</span>
                <span>{activeTab === "senior-high-programs" ? "Add Senior High Track" : "Add Program"}</span>
              </button>
            </div>
          </div>

          {/* Programs Table matching screenshot 1 and 3 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#EEF4FF] border-b border-slate-200/80 text-[11px] font-bold text-slate-700 tracking-wider">
                    <th scope="col" className="w-12 px-3 py-3 text-center"></th>
                    <th
                      scope="col"
                      onClick={() => {
                        setSortField("name");
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      }}
                      className="px-4 py-3 cursor-pointer select-none hover:text-blue-700"
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <span>Program Name</span>
                        <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
                        </svg>
                      </div>
                    </th>
                    <th scope="col" className="px-4 py-3">Code</th>
                    <th scope="col" className="px-4 py-3">Department</th>
                    <th scope="col" className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {displayedPrograms.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                        {activeTab === "senior-high-programs"
                          ? "No senior high programs or strands found. Click \"Add Senior High Track\" to register one."
                          : "No programs found matching the criteria. Click \"Add Program\" to register one."}
                      </td>
                    </tr>
                  ) : (
                    displayedPrograms.map((prog) => (
                      <tr key={prog.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Action Menu */}
                        <td className="px-3 py-3.5 text-center relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === prog.id ? null : prog.id);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center"
                            aria-label={`Actions for ${prog.name}`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                              <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                              <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                            </svg>
                          </button>

                          {/* Action Dropdown */}
                          {openMenuId === prog.id && (
                            <div
                              ref={menuRef}
                              className="absolute left-8 top-2 z-30 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 text-left text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => openEditProgramModal(prog)}
                                className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                              >
                                <span>✏️</span> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDeleteConfirm({
                                    type: "program",
                                    id: prog.id,
                                    title: `${prog.code} - ${prog.name}`,
                                  });
                                }}
                                className="w-full px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                              >
                                <span>🗑️</span> Delete
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Program Name */}
                        <td className="px-4 py-3.5 font-bold text-slate-900 tracking-tight">
                          {prog.name}
                        </td>

                        {/* Code Badge Pill matching reference */}
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#EAF2FF] text-[#1D68F2] tracking-wider border border-[#D3E3FD]">
                            {prog.code}
                          </span>
                        </td>

                        {/* Department */}
                        <td className="px-4 py-3.5 text-slate-700 font-medium tracking-wide">
                          {prog.department_name}
                        </td>

                        {/* Description */}
                        <td className="px-4 py-3.5 text-slate-500 max-w-sm sm:max-w-md truncate">
                          {prog.description || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-1.5 text-xs text-slate-600">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                aria-label="Previous Page"
              >
                &lt;
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setCurrentPage(pg)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                    currentPage === pg
                      ? "border border-[#1616D4] text-[#1616D4] bg-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {pg}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                aria-label="Next Page"
              >
                &gt;
              </button>
            </div>
          </div>
        </div>

      {/* TAB 4: BRANDING & CMS */}
      <form
        onSubmit={handleSaveBranding}
        className={activeTab === "branding" ? "space-y-5 sm:space-y-6" : "hidden"}
      >
          {/* Card 1: Institutional Identity & Branding */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>🏛️</span> Institutional Identity &amp; Branding
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Institution Name
                </label>
                <input
                  type="text"
                  value={settings.institution_name}
                  onChange={(e) => setSettings({ ...settings, institution_name: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Primary Brand Color (Hex)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.primary_color}
                    onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-slate-300 cursor-pointer p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={settings.primary_color}
                    onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                    className="flex-1 text-xs rounded-lg border border-slate-300 p-2.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Security & Allowed Domains */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>🔒</span> Domain &amp; Account Policies
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allowed Email Domains (Comma-Separated)
                </label>
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="pecit.edu.ph, student.pecit.edu.ph"
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Google Workspace sign-in and automated provisioning strictly restrict accounts to these domains.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Administrator Contact Email
                </label>
                <input
                  type="email"
                  value={settings.admin_contact_email}
                  onChange={(e) => setSettings({ ...settings, admin_contact_email: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Displayed on the login screen for students needing account assistance.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 pr-2">
                  <span className="text-xs font-bold text-slate-900 block">
                    Google Workspace Auto-Provisioning
                  </span>
                  <span className="text-xs text-slate-500 block mt-0.5 leading-relaxed">
                    Automatically register new accounts on first Google login (Default: False per SPEC)
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 self-start sm:self-auto">
                  <input
                    type="checkbox"
                    checked={settings.google_auto_provision}
                    onChange={(e) =>
                      setSettings({ ...settings, google_auto_provision: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1616D4]" />
                </label>
              </div>
            </div>
          </div>

          {/* Card 3: RA 10173 Data Retention Schedules */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>⚖️</span> RA 10173 Data Retention Schedules
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Activity &amp; Access Log Retention (Days)
                </label>
                <input
                  type="number"
                  min={30}
                  value={settings.retention_policy.log_retention_days}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retention_policy: {
                        ...settings.retention_policy,
                        log_retention_days: parseInt(e.target.value, 10) || 1825,
                      },
                    })
                  }
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Default: 1,825 days (5 years)</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Graduated / Closed Account Retention (Days)
                </label>
                <input
                  type="number"
                  min={30}
                  value={settings.retention_policy.closed_account_retention_days}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retention_policy: {
                        ...settings.retention_policy,
                        closed_account_retention_days: parseInt(e.target.value, 10) || 365,
                      },
                    })
                  }
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Default: 365 days (1 year)</p>
              </div>
            </div>
          </div>

          {/* Card 4: CMS Institutional Announcement Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>📢</span> Public Repository Announcement (CMS)
              </h2>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(settings.announcement_enabled)}
                  onChange={(e) =>
                    setSettings({ ...settings, announcement_enabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1616D4]" />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Announcement Notice Banner
              </label>
              <textarea
                rows={2}
                value={settings.announcement_banner || ""}
                onChange={(e) => setSettings({ ...settings, announcement_banner: e.target.value })}
                placeholder="Institutional advisory or capstone submission announcement displayed on repository homepage..."
                className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto px-8 py-3 rounded-xl bg-[#1616D4] hover:bg-[#1212B8] text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isPending ? "Saving Settings..." : "Save System Settings"}
            </button>
          </div>
        </form>

      {/* --- MODAL: ADD / EDIT DEPARTMENT --- */}
      {deptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {editingDept ? "Edit Department" : "Add New Department"}
              </h3>
              <button
                type="button"
                onClick={() => setDeptModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. COLLEGE OF COMPUTER STUDIES"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department Code / Acronym
                </label>
                <input
                  type="text"
                  placeholder="e.g. CCS"
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Academic college overseeing computer science and computing disciplines."
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeptModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-lg bg-[#1616D4] hover:bg-[#1212B8] text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Saving..." : editingDept ? "Save Changes" : "Create Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: ADD / EDIT PROGRAM --- */}
      {progModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {editingProg ? "Edit Program" : "Add New Program"}
              </h3>
              <button
                type="button"
                onClick={() => setProgModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProgram} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Program Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bachelor of Science in Information Technology"
                  value={progForm.name}
                  onChange={(e) => setProgForm({ ...progForm, name: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Program Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BSIT"
                    value={progForm.code}
                    onChange={(e) => setProgForm({ ...progForm, code: e.target.value.toUpperCase() })}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Academic Level / Track
                  </label>
                  <select
                    value={progForm.type}
                    onChange={(e) =>
                      setProgForm({ ...progForm, type: e.target.value as "college" | "senior_high" })
                    }
                    className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="college">College Degree Program</option>
                    <option value="senior_high">Senior High School Track / Strand</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={progForm.department_name}
                  onChange={(e) => {
                    const deptVal = e.target.value;
                    const isSHS = deptVal.toUpperCase().includes("SENIOR HIGH");
                    setProgForm({
                      ...progForm,
                      department_name: deptVal,
                      type: isSHS ? "senior_high" : progForm.type,
                    });
                  }}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="" disabled>Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Focuses on software engineering, network systems and digital innovations."
                  value={progForm.description}
                  onChange={(e) => setProgForm({ ...progForm, description: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setProgModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-lg bg-[#1616D4] hover:bg-[#1212B8] text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Saving..." : editingProg ? "Save Changes" : "Create Program"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: DELETE CONFIRMATION --- */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-5 sm:p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Delete {deleteConfirm.type === "department" ? "Department" : "Program"}?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Are you sure you want to remove &quot;{deleteConfirm.title}&quot;?
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
              {deleteConfirm.type === "department"
                ? "This will remove the department classification. Make sure no active programs are attached before proceeding."
                : "This program will no longer appear in future thesis submissions or student registration dropdowns."}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isPending}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isPending ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
