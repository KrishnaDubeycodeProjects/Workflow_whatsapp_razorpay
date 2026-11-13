"use client";

import React, { useState, useEffect, useMemo } from "react";
import SessionGuard from "@/components/admin/SessionGuard";
import {
  Activity,
  MessageSquare,
  Users,
  CreditCard,
  BookOpen,
  FileText,
  Image as ImageIcon,
  ShieldAlert,
  Send,
  UserCheck,
  CheckCircle,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Shield,
  Database,
  Menu,
  X,
  Phone,
  Mail,
  MapPin,
  Clock,
  Sparkles,
  Lock,
  ArrowUpRight,
  Plus,
  AlertCircle,
  Printer,
  LogOut
} from "lucide-react";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "chat" | "registrations" | "payments" | "knowledge" | "services" | "assets" | "system"
  >("overview");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<string>("CONNECTING");
  const [dbLatency, setDbLatency] = useState<number>(0);

  // Live Database-driven state from Neon PostgreSQL
  const [kpis, setKpis] = useState<any>({
    total_customers: 0,
    total_registrations: 0,
    total_revenue: 0,
    active_human_takeovers: 0,
  });
  const [services, setServices] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [kbArticles, setKbArticles] = useState<any[]>([]);
  const [visualAssets, setVisualAssets] = useState<any[]>([]);

  // Mobile navigation state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileChatView, setMobileChatView] = useState<"list" | "chat">("list");
  const [mobileMoreSheetOpen, setMobileMoreSheetOpen] = useState(false);

  // Chat interaction state
  const [selectedConvId, setSelectedConvId] = useState<string>("");
  const [adminReplyText, setAdminReplyText] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<"all" | "takeover" | "ai">("all");

  // Registration & Payment inspection modals
  const [selectedReg, setSelectedReg] = useState<any>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  // Search & Filter state for Registrations & Payments
  const [regSearch, setRegSearch] = useState("");
  const [regLevelFilter, setRegLevelFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [kbFilter, setKbFilter] = useState("all");

  // Knowledge base form state
  const [newKbTitle, setNewKbTitle] = useState("");
  const [newKbContent, setNewKbContent] = useState("");
  const [newKbCategory, setNewKbCategory] = useState("Announcements");
  const [submittingKb, setSubmittingKb] = useState(false);
  const [showAddKbForm, setShowAddKbForm] = useState(false);

  // Action status message banner
  const [actionNotice, setActionNotice] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setActionNotice({ message, type });
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Authenticated fetch: if the admin session has expired, send the user back to sign in.
  // `background` requests (auto-refresh) never extend the idle session window.
  const adminFetch = async (input: string, init?: RequestInit, background = false) => {
    const headers = new Headers(init?.headers);
    if (background) headers.set("x-gec-background", "1");
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401) {
      window.location.assign("/login?reason=expired&next=/admin");
      throw new Error("Session expired. Redirecting to sign in…");
    }
    return res;
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    window.location.assign("/login");
  };

  // Fetch all live data from Neon PostgreSQL (ZERO mock data)
  const fetchDbData = async (background = false) => {
    try {
      setLoading(true);
      const res = await adminFetch("/api/admin/data", undefined, background);
      const json = await res.json();
      if (json.success && json.data) {
        setKpis(json.data.kpis || {});
        setServices(json.data.services || []);
        setConversations(json.data.conversations || []);
        setRegistrations(json.data.registrations || []);
        setPayments(json.data.payments || []);
        setKbArticles(json.data.knowledgeBase || []);
        setVisualAssets(json.data.visualAssets || []);
        setDbStatus(json.data.dbStatus || "CONNECTED");
        setDbLatency(json.data.latencyMs || 0);
        setError(null);

        // Select first conversation if none selected
        if (json.data.conversations && json.data.conversations.length > 0 && !selectedConvId) {
          setSelectedConvId(json.data.conversations[0].conversation_id);
        }
      } else {
        setError(json.error || "Failed to load database records from Neon PostgreSQL");
        setDbStatus("ERROR");
      }
    } catch (err: any) {
      console.error("Fetch DB error:", err);
      setError(err.message || "Network error querying Neon DB");
      setDbStatus("ERROR");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDbData();
    // Auto-sync with Neon DB every 20 seconds
    const interval = setInterval(() => fetchDbData(true), 20000);
    return () => clearInterval(interval);
  }, []);

  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.conversation_id === selectedConvId) || conversations[0] || null;
  }, [conversations, selectedConvId]);

  // Toggle Human Takeover in DB
  const handleToggleTakeover = async (convId?: string) => {
    const targetConvId = convId || selectedConvId || activeConversation?.conversation_id;
    if (!targetConvId) {
      showToast("Please select an active conversation first.", "error");
      return;
    }
    const targetConv = conversations.find((c) => c.conversation_id === targetConvId) || activeConversation;
    const nextMode = targetConv?.control_mode === "HUMAN_HANDOVER" ? "AI_HANDLED" : "HUMAN_HANDOVER";

    try {
      const res = await adminFetch("/api/admin/takeover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: targetConvId,
          mode: nextMode,
          adminUser: "staff_admin",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConvId(targetConvId);
        showToast(
          nextMode === "HUMAN_HANDOVER"
            ? "Takeover active! AI auto-reply paused in Neon DB."
            : "AI auto-reply resumed in Neon DB."
        );
        await fetchDbData();
      } else {
        showToast(data.error || "Failed to update handover mode in DB", "error");
      }
    } catch (e: any) {
      showToast("Error updating DB: " + e.message, "error");
    }
  };

  // Send Admin Reply directly to Neon DB & WhatsApp
  const handleSendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetConvId = selectedConvId || activeConversation?.conversation_id;
    if (!adminReplyText.trim() || !targetConvId) return;

    try {
      const res = await adminFetch("/api/admin/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: targetConvId,
          text: adminReplyText.trim(),
          adminUser: "staff_admin",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminReplyText("");
        setSelectedConvId(targetConvId);
        showToast("Message committed to Neon DB & dispatched to WhatsApp!");
        await fetchDbData();
      } else {
        showToast(data.error || "Failed to dispatch message to WhatsApp", "error");
      }
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
    }
  };

  // Add Knowledge Base article to Neon DB
  const handleAddKb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKbTitle || !newKbContent) return;

    try {
      setSubmittingKb(true);
      const res = await adminFetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newKbCategory,
          title: newKbTitle,
          content: newKbContent,
          adminUser: "staff_admin",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKbTitle("");
        setNewKbContent("");
        setShowAddKbForm(false);
        showToast("Article saved to Neon knowledge_base table!");
        await fetchDbData();
      } else {
        showToast(data.error || "Failed to save article in DB", "error");
      }
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
    } finally {
      setSubmittingKb(false);
    }
  };

  // Filtered conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const matchesSearch =
        !chatSearch ||
        (c.full_name && c.full_name.toLowerCase().includes(chatSearch.toLowerCase())) ||
        (c.whatsapp_number && c.whatsapp_number.includes(chatSearch));

      if (!matchesSearch) return false;

      if (chatFilter === "takeover") {
        return c.control_mode === "HUMAN_HANDOVER";
      }
      if (chatFilter === "ai") {
        return c.control_mode === "AI_HANDLED";
      }
      return true;
    });
  }, [conversations, chatSearch, chatFilter]);

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    return registrations.filter((r) => {
      const matchesSearch =
        !regSearch ||
        (r.full_name && r.full_name.toLowerCase().includes(regSearch.toLowerCase())) ||
        (r.mobile_number && r.mobile_number.includes(regSearch)) ||
        (r.activity && r.activity.toLowerCase().includes(regSearch.toLowerCase()));

      if (!matchesSearch) return false;
      if (regLevelFilter !== "all" && r.rider_level !== regLevelFilter) return false;
      return true;
    });
  }, [registrations, regSearch, regLevelFilter]);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (paymentFilter === "all") return true;
      return p.payment_status === paymentFilter;
    });
  }, [payments, paymentFilter]);

  // Filtered KB articles
  const filteredKb = useMemo(() => {
    return kbArticles.filter((k) => {
      if (kbFilter === "all") return true;
      return k.category.toLowerCase() === kbFilter.toLowerCase();
    });
  }, [kbArticles, kbFilter]);

  const navItems = [
    { id: "overview", label: "Operations Hub", icon: Activity, badge: null },
    {
      id: "chat",
      label: "Live Chat & Takeover",
      icon: MessageSquare,
      badge: kpis.active_human_takeovers > 0 ? `${kpis.active_human_takeovers} Alert` : null,
      badgeColor: "bg-red-50 text-red-800 border border-red-200",
    },
    { id: "registrations", label: "Riders & Consent Vault", icon: Users, badge: `${registrations.length}` },
    { id: "payments", label: "Payments & Receipts", icon: CreditCard, badge: `${payments.length}` },
    { id: "knowledge", label: "Knowledge Base & RAG", icon: BookOpen, badge: null },
    { id: "services", label: "Services & Locked Rates", icon: FileText, badge: `${services.length}` },
    { id: "assets", label: "Visual Assets Engine", icon: ImageIcon, badge: null },
    { id: "system", label: "System & Webhooks", icon: ShieldAlert, badge: null },
  ];

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-[#FBFBFA] text-stone-900 font-sans selection:bg-amber-100 selection:text-amber-900 overflow-hidden">
      <SessionGuard />
      {/* =========================================================================
          1. DESKTOP SIDEBAR NAVIGATION (Hidden on mobile)
      ========================================================================== */}
      <aside className="hidden lg:flex w-64 xl:w-72 border-r border-stone-200/90 bg-white/95 flex-col justify-between p-4 backdrop-blur-xl z-20 shrink-0">
        <div className="space-y-4">
          {/* Brand Header */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-amber-50/70 border border-amber-200/70">
            <img
              src="/assets/gec_logo.png"
              alt="Gorai Equestrian Centre"
              className="h-11 w-11 object-contain shrink-0 drop-shadow-sm"
            />
            <div className="min-w-0">
              <span className="text-xs font-bold tracking-wide text-stone-900 block leading-tight truncate uppercase">
                Gorai Equestrian
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold tracking-tight">
                  System Online
                </span>
              </div>
            </div>
          </div>

          <p className="px-2 text-[11px] text-stone-500 italic">
            “Away from the algorithm. Find your own rhythm.”
          </p>

          {/* Nav Items */}
          <nav className="space-y-1 pt-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? "bg-amber-50 text-amber-900 border border-amber-200/90 font-bold shadow-xs translate-x-1"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-amber-700" : "text-stone-400"}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive
                          ? "bg-amber-100 text-amber-800 border border-amber-200/80"
                          : item.badgeColor || "bg-stone-100 text-stone-600 border border-stone-200"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quick Links & DB Health */}
        <div className="space-y-3 pt-3 border-t border-stone-200/80">
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 text-[11px] space-y-1">
            <div className="flex items-center justify-between text-stone-600">
              <span className="flex items-center gap-1.5 font-medium">
                <Database className="h-3 w-3 text-emerald-600" /> DB Latency:
              </span>
              <span className="font-mono text-emerald-700 font-bold">{dbLatency} ms</span>
            </div>
            <div className="text-[10px] text-stone-500 truncate">AWS us-east-2 pooler connected</div>
          </div>

          <div className="space-y-1.5">
            <a
              href="/"
              target="_blank"
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-xs text-stone-700 border border-stone-200 transition group font-medium"
            >
              <span>🏡 Customer Portal</span>
              <ExternalLink className="h-3.5 w-3.5 text-stone-400 group-hover:translate-x-0.5 transition" />
            </a>
            <a
              href="/register"
              target="_blank"
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-xs text-stone-700 border border-stone-200 transition group font-medium"
            >
              <span>📝 Rider Registration</span>
              <ExternalLink className="h-3.5 w-3.5 text-stone-400 group-hover:translate-x-0.5 transition" />
            </a>
            <a
              href="/checkout"
              target="_blank"
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-xs text-stone-700 border border-stone-200 transition group font-medium"
            >
              <span>💳 Checkout & Pay</span>
              <ExternalLink className="h-3.5 w-3.5 text-stone-400 group-hover:translate-x-0.5 transition" />
            </a>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white hover:bg-red-50 text-xs text-stone-700 hover:text-red-700 border border-stone-200 hover:border-red-200 transition font-medium"
            >
              <span>Sign out</span>
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* =========================================================================
          2. MOBILE TOP HEADER (Sticky, Luxury Equestrian Style)
      ========================================================================== */}
      <header className="lg:hidden sticky top-0 z-40 h-16 border-b border-stone-200/80 bg-white/95 backdrop-blur-xl px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-1 rounded-xl bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200 transition"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5 text-amber-700" />
          </button>

          <div className="flex items-center gap-2.5">
            <img
              src="/assets/gec_logo.png"
              alt="GEC Logo"
              className="h-9 w-9 object-contain drop-shadow-sm"
            />
            <div>
              <div className="font-bold text-xs tracking-wider text-stone-900 uppercase flex items-center gap-1.5 leading-tight">
                <span>GEC ADMIN</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-[10px] text-amber-700 font-semibold leading-tight uppercase">
                {activeTab} • ACTIVE
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {kpis.active_human_takeovers > 0 && (
            <button
              onClick={() => {
                setActiveTab("chat");
                setChatFilter("takeover");
              }}
              className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded-lg text-[10px] font-bold animate-pulse"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>{kpis.active_human_takeovers} Alert</span>
            </button>
          )}

          <button
            onClick={() => fetchDbData()}
            title="Refresh Registry"
            className="p-2 rounded-xl bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-600" : ""}`} />
          </button>
        </div>
      </header>

      {/* =========================================================================
          3. MOBILE SLIDE-OVER NAVIGATION DRAWER
      ========================================================================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-4/5 max-w-xs bg-white border-r border-stone-200 h-full flex flex-col justify-between p-5 z-10 shadow-2xl overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3">
                  <img
                    src="/assets/gec_logo.png"
                    alt="Gorai Equestrian Centre"
                    className="h-10 w-10 object-contain shrink-0 drop-shadow-sm"
                  />
                  <div>
                    <h2 className="font-bold text-xs text-stone-900 tracking-wide uppercase">GORAI EQUESTRIAN</h2>
                    <span className="text-[10px] text-emerald-700 font-semibold">Active Hub ({dbLatency}ms)</span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:text-stone-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition ${
                        isActive
                          ? "bg-amber-50 text-amber-900 border border-amber-200/90 font-bold shadow-xs"
                          : "text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-4 w-4 ${isActive ? "text-amber-700" : "text-stone-400"}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isActive
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : item.badgeColor || "bg-stone-100 text-stone-600 border border-stone-200"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-2 pt-4 border-t border-stone-100">
              <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Quick Portals</div>
              <a
                href="/"
                target="_blank"
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-stone-50 text-xs text-stone-700 font-medium border border-stone-200"
              >
                <span>🏡 Customer Portal</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="/register"
                target="_blank"
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-stone-50 text-xs text-stone-700 font-medium border border-stone-200"
              >
                <span>📝 Rider Form</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="/checkout"
                target="_blank"
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-stone-50 text-xs text-stone-700 font-medium border border-stone-200"
              >
                <span>💳 Checkout Page</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white text-xs text-red-700 font-medium border border-red-200"
              >
                <span>Sign out</span>
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          4. MAIN CONTENT AREA (Clean Luxury Stone Design System)
      ========================================================================== */}
      <main className="flex-1 flex flex-col h-[calc(100vh-4rem)] lg:h-screen overflow-y-auto bg-[#FBFBFA] pb-20 lg:pb-0">
        {/* Desktop Header Bar */}
        <header className="hidden lg:flex h-16 border-b border-stone-200/80 bg-white/95 px-6 items-center justify-between backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-500">Location:</span>
            <span className="text-xs font-semibold text-stone-800">Khajuriwadi, Gorai, Mumbai – 400092</span>
            <span className="h-4 w-px bg-stone-200 mx-2" />
            <span className="text-xs text-stone-500">Official Helplines:</span>
            <span className="text-xs font-semibold text-amber-800">+91 93220 13233 / +91 90219 39252</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchDbData()}
              title="Sync Registry"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-700 border border-stone-200 transition shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-amber-600" : ""}`} />
              <span>Sync Registry</span>
            </button>

            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full font-medium shadow-xs">
              <Database className="h-3.5 w-3.5 text-emerald-600" />
              Live Connection ({dbLatency}ms)
            </span>

            <button
              onClick={handleSignOut}
              title="Sign out"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-xs font-semibold text-stone-700 border border-stone-200 transition shadow-xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        {/* Global Toast Alert */}
        {actionNotice && (
          <div
            className={`mx-4 lg:mx-6 mt-4 p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-sm transition-all animate-in fade-in slide-in-from-top-2 ${
              actionNotice.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
              <span>{actionNotice.message}</span>
            </div>
            <button onClick={() => setActionNotice(null)} className="text-stone-400 hover:text-stone-700 ml-2">
              ✕
            </button>
          </div>
        )}

        {/* Database Error Banner */}
        {error && (
          <div className="mx-4 lg:mx-6 mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
              <span>Connection Notice: {error}</span>
            </div>
            <button onClick={() => fetchDbData()} className="underline text-red-700 font-bold ml-2">
              Retry
            </button>
          </div>
        )}

        {/* Content Container */}
        <div className="p-4 lg:p-6 flex-1 max-w-7xl w-full mx-auto space-y-6">
          {/* =====================================================================
              TAB 1: OPERATIONS OVERVIEW
          ====================================================================== */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Catchy Welcome & Status Card */}
              <div className="p-6 rounded-3xl bg-white border border-stone-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold tracking-wider text-amber-800 bg-amber-50 border border-amber-200/60 px-3 py-0.5 rounded-full uppercase">
                      Operations Dashboard
                    </span>
                    <span className="text-[10px] bg-emerald-50 border border-emerald-200/60 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                      Verified Registry
                    </span>
                  </div>
                  <h2 className="text-lg lg:text-xl font-bold text-stone-900">
                    Gorai Equestrian Centre Live Portal
                  </h2>
                  <p className="text-xs text-stone-600 max-w-xl">
                    Live operational records directly synchronized with central registry. Zero mock data.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setActiveTab("chat");
                      setChatFilter("takeover");
                    }}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-sm transition flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Live Takeover ({kpis.active_human_takeovers || 0})</span>
                  </button>
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {/* Total Customers */}
                <div className="p-4 rounded-2xl bg-white border border-stone-200/90 shadow-sm relative overflow-hidden group hover:border-amber-300 transition">
                  <div className="flex items-center justify-between text-stone-500 text-xs">
                    <span className="font-semibold">Customers</span>
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                      <Users className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="text-2xl lg:text-3xl font-extrabold text-stone-900 mt-2">
                    {kpis.total_customers || 0}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
                    <Database className="h-3 w-3" /> Verified Customer Records
                  </div>
                </div>

                {/* Verified Revenue */}
                <div className="p-4 rounded-2xl bg-white border border-stone-200/90 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition">
                  <div className="flex items-center justify-between text-stone-500 text-xs">
                    <span className="font-semibold">Verified Revenue</span>
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                      <CreditCard className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="text-2xl lg:text-3xl font-extrabold text-stone-900 mt-2">
                    ₹{parseFloat(kpis.total_revenue || 0).toLocaleString("en-IN")}
                  </div>
                  <div className="text-[11px] text-stone-500 font-medium mt-1">
                    Settled & Verified Transactions
                  </div>
                </div>

                {/* Completed Registrations */}
                <div className="p-4 rounded-2xl bg-white border border-stone-200/90 shadow-sm relative overflow-hidden group hover:border-sky-300 transition">
                  <div className="flex items-center justify-between text-stone-500 text-xs">
                    <span className="font-semibold">Registrations</span>
                    <div className="p-2 rounded-xl bg-sky-50 text-sky-700">
                      <UserCheck className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="text-2xl lg:text-3xl font-extrabold text-stone-900 mt-2">
                    {kpis.total_registrations || 0}
                  </div>
                  <div className="text-[11px] text-sky-700 font-medium mt-1">
                    Signed indemnity consents
                  </div>
                </div>

                {/* Active Takeovers */}
                <div className="p-4 rounded-2xl bg-white border border-red-200 shadow-sm relative overflow-hidden group hover:border-red-300 transition">
                  <div className="flex items-center justify-between text-stone-500 text-xs">
                    <span className="font-semibold">Human Takeovers</span>
                    <div className="p-2 rounded-xl bg-red-50 text-red-700">
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="text-2xl lg:text-3xl font-extrabold text-red-600 mt-2">
                    {kpis.active_human_takeovers || 0}
                  </div>
                  <div className="text-[11px] text-red-600 font-medium mt-1">
                    Staff attention required
                  </div>
                </div>
              </div>

              {/* Quick Action Navigation Buttons for Mobile */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  onClick={() => setActiveTab("chat")}
                  className="p-3.5 rounded-2xl bg-white border border-stone-200/90 hover:border-amber-400 text-left transition shadow-xs"
                >
                  <MessageSquare className="h-5 w-5 text-amber-600 mb-1" />
                  <div className="text-xs font-bold text-stone-900">Live WhatsApp</div>
                  <div className="text-[10px] text-stone-500">{conversations.length} total chats</div>
                </button>
                <button
                  onClick={() => setActiveTab("registrations")}
                  className="p-3.5 rounded-2xl bg-white border border-stone-200/90 hover:border-amber-400 text-left transition shadow-xs"
                >
                  <Users className="h-5 w-5 text-sky-600 mb-1" />
                  <div className="text-xs font-bold text-stone-900">Rider Consents</div>
                  <div className="text-[10px] text-stone-500">{registrations.length} completed</div>
                </button>
                <button
                  onClick={() => setActiveTab("payments")}
                  className="p-3.5 rounded-2xl bg-white border border-stone-200/90 hover:border-amber-400 text-left transition shadow-xs"
                >
                  <CreditCard className="h-5 w-5 text-emerald-600 mb-1" />
                  <div className="text-xs font-bold text-stone-900">Verify Payments</div>
                  <div className="text-[10px] text-stone-500">{payments.length} transactions</div>
                </button>
                <button
                  onClick={() => setActiveTab("knowledge")}
                  className="p-3.5 rounded-2xl bg-white border border-stone-200/90 hover:border-amber-400 text-left transition shadow-xs"
                >
                  <BookOpen className="h-5 w-5 text-purple-600 mb-1" />
                  <div className="text-xs font-bold text-stone-900">Knowledge RAG</div>
                  <div className="text-[10px] text-stone-500">{kbArticles.length} published</div>
                </button>
              </div>

              {/* Live Conversations Preview & Official Services from Neon DB */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Active Conversations Preview */}
                <div className="rounded-3xl bg-white border border-stone-200/90 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                        <span>Live Conversations</span>
                        <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200/70 px-2 py-0.5 rounded-full font-mono font-semibold">
                          {conversations.length} Active
                        </span>
                      </h3>
                      <p className="text-[11px] text-stone-500">Live customer threads</p>
                    </div>
                    <button
                      onClick={() => setActiveTab("chat")}
                      className="text-xs text-amber-700 hover:text-amber-800 hover:underline font-semibold flex items-center gap-1"
                    >
                      <span>Open Chat</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {conversations.length === 0 ? (
                      <div className="p-6 text-center text-xs text-stone-400 rounded-xl bg-stone-50 border border-stone-200/60">
                        No active conversations found.
                      </div>
                    ) : (
                      conversations.slice(0, 4).map((c) => (
                        <div
                          key={c.conversation_id}
                          onClick={() => {
                            setSelectedConvId(c.conversation_id);
                            setActiveTab("chat");
                            setMobileChatView("chat");
                          }}
                          className="p-3 rounded-xl bg-stone-50/70 hover:bg-amber-50/50 border border-stone-200/70 cursor-pointer flex items-center justify-between transition group"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-stone-900 truncate">
                                {c.full_name || "Guest Customer"}
                              </span>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                                  c.control_mode === "HUMAN_HANDOVER"
                                    ? "bg-red-50 text-red-700 border border-red-200"
                                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                }`}
                              >
                                {c.control_mode === "HUMAN_HANDOVER" ? "STAFF TAKEOVER" : "AI BOT"}
                              </span>
                            </div>
                            <div className="text-[11px] text-stone-500 font-mono mt-0.5">{c.whatsapp_number}</div>
                            <div className="text-xs text-stone-600 mt-1 truncate max-w-xs">
                              {c.messages && c.messages.length > 0
                                ? c.messages[c.messages.length - 1].text
                                : "No messages recorded"}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-amber-600 group-hover:translate-x-1 transition shrink-0" />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Locked Official Pricing from DB */}
                <div className="rounded-3xl bg-white border border-stone-200/90 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-stone-900">Official GEC Services ({services.length})</h3>
                      <p className="text-[11px] text-stone-500">Official published rates and batches</p>
                    </div>
                    <button
                      onClick={() => setActiveTab("services")}
                      className="text-xs text-amber-700 hover:text-amber-800 hover:underline font-semibold flex items-center gap-1"
                    >
                      <span>Catalogue</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {services.map((s) => (
                      <div
                        key={s.service_code}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50/70 border border-stone-200/70 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-stone-900 truncate">{s.title}</div>
                          <div className="text-[10px] text-stone-500">
                            {s.duration_minutes}m • {s.sessions_count} session • {s.target_rider_level}
                          </div>
                        </div>
                        <div className="font-bold text-amber-800 shrink-0 text-sm">
                          ₹{parseFloat(s.price_inr).toLocaleString("en-IN")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 2: LIVE CHAT & HUMAN HANDOVER (Master-Detail Mobile Optimized)
          ====================================================================== */}
          {activeTab === "chat" && (
            <div className="h-[calc(100vh-10rem)] lg:h-[calc(100vh-8.5rem)] flex flex-col lg:flex-row gap-4 animate-in fade-in duration-200">
              {/* CHAT LIST (Visible on desktop OR when mobileChatView === 'list') */}
              <div
                className={`w-full lg:w-80 xl:w-96 border border-stone-200/90 rounded-2xl bg-white flex flex-col overflow-hidden shadow-sm ${
                  mobileChatView === "chat" ? "hidden lg:flex" : "flex"
                }`}
              >
                {/* Search & Filter Header */}
                <div className="p-3.5 border-b border-stone-200/80 bg-stone-50/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                      Conversations ({filteredConversations.length})
                    </span>
                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                      Live Channel
                    </span>
                  </div>

                  {/* Search bar */}
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-stone-400" />
                    <input
                      type="text"
                      placeholder="Search name or WhatsApp..."
                      value={chatSearch}
                      onChange={(e) => setChatSearch(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-amber-600 placeholder:text-stone-400 shadow-xs"
                    />
                  </div>

                  {/* Filter Pills */}
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => setChatFilter("all")}
                      className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition ${
                        chatFilter === "all"
                          ? "bg-amber-600 text-white shadow-xs"
                          : "bg-white text-stone-600 border border-stone-200"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setChatFilter("takeover")}
                      className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 ${
                        chatFilter === "takeover"
                          ? "bg-red-600 text-white shadow-xs"
                          : "bg-white text-stone-600 border border-stone-200 hover:text-red-700"
                      }`}
                    >
                      <ShieldAlert className="h-3 w-3" />
                      Takeover ({kpis.active_human_takeovers || 0})
                    </button>
                    <button
                      onClick={() => setChatFilter("ai")}
                      className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition ${
                        chatFilter === "ai"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-white text-stone-600 border border-stone-200"
                      }`}
                    >
                      AI Bot
                    </button>
                  </div>
                </div>

                {/* Conversation List Scroll */}
                <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
                  {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-stone-400">
                      No matching conversations found.
                    </div>
                  ) : (
                    filteredConversations.map((c) => {
                      const isSelected = selectedConvId === c.conversation_id;
                      const isTakeover = c.control_mode === "HUMAN_HANDOVER";
                      return (
                        <div
                          key={c.conversation_id}
                          onClick={() => {
                            setSelectedConvId(c.conversation_id);
                            setMobileChatView("chat");
                          }}
                          className={`p-3.5 cursor-pointer transition relative ${
                            isSelected
                              ? "bg-amber-50/70 border-l-4 border-amber-600"
                              : "hover:bg-stone-50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-stone-900 truncate max-w-[140px]">
                              {c.full_name || "Guest Customer"}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                                isTakeover
                                  ? "bg-red-50 text-red-700 border border-red-200 animate-pulse"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {isTakeover ? "STAFF TAKEOVER" : "AI"}
                            </span>
                          </div>

                          <div className="text-[10px] text-stone-500 font-mono mt-0.5">{c.whatsapp_number}</div>

                          <div className="text-xs text-stone-600 mt-1 truncate">
                            {c.messages && c.messages.length > 0
                              ? c.messages[c.messages.length - 1].text
                              : "No messages yet"}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* CHAT VIEW & ACTION PANEL (Visible on desktop OR when mobileChatView === 'chat') */}
              <div
                className={`flex-1 border border-stone-200/90 rounded-2xl bg-white flex flex-col overflow-hidden shadow-sm ${
                  mobileChatView === "list" ? "hidden lg:flex" : "flex"
                }`}
              >
                {activeConversation ? (
                  <>
                    {/* Chat Header */}
                    <div className="p-3.5 lg:p-4 border-b border-stone-200/80 bg-stone-50/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Mobile Back Button */}
                        <button
                          onClick={() => setMobileChatView("list")}
                          className="lg:hidden p-1.5 -ml-1 rounded-xl bg-white text-stone-600 hover:text-stone-900 border border-stone-200 shadow-xs"
                          title="Back to conversations list"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-xs lg:text-sm text-stone-900 truncate">
                              {activeConversation.full_name || "Customer"}
                            </h3>
                            <span className="text-[10px] text-amber-800 font-mono bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded">
                              {activeConversation.whatsapp_number}
                            </span>
                            <span className="text-[10px] text-stone-600 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded">
                              Lang: {activeConversation.language || "en"}
                            </span>
                          </div>
                          <div className="text-[11px] text-stone-500 mt-0.5 truncate">
                            Session: <span className="font-mono text-stone-700">{activeConversation.session_id}</span>
                          </div>
                        </div>
                      </div>

                      {/* Handover Toggle Button */}
                      <button
                        onClick={() => handleToggleTakeover(activeConversation.conversation_id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl text-xs font-bold transition shadow-xs shrink-0 ${
                          activeConversation.control_mode === "HUMAN_HANDOVER"
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        {activeConversation.control_mode === "HUMAN_HANDOVER" ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Resume AI Auto-Reply</span>
                            <span className="sm:hidden">AI Auto</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Take Over Chat (Pause AI)</span>
                            <span className="sm:hidden">Take Over</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Messages Stream */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FBFBFA]">
                      {activeConversation.messages && activeConversation.messages.length > 0 ? (
                        activeConversation.messages.map((m: any, idx: number) => {
                          const isUser = m.sender === "user";
                          const isSystem = m.sender === "system";
                          const isAdmin = m.sender === "admin_staff";

                          if (isSystem) {
                            return (
                              <div key={idx} className="flex justify-center my-2">
                                <span className="text-[11px] bg-stone-100 text-stone-700 px-3 py-1 rounded-full border border-stone-200 text-center shadow-xs">
                                  {m.text}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div key={idx} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                              <div
                                className={`max-w-[85%] sm:max-w-md rounded-2xl p-3 text-xs leading-relaxed whitespace-pre-wrap shadow-xs ${
                                  isUser
                                    ? "bg-white text-stone-900 rounded-bl-none border border-stone-200/90"
                                    : isAdmin
                                    ? "bg-amber-700 text-white rounded-br-none shadow-sm"
                                    : "bg-amber-50 text-amber-950 rounded-br-none border border-amber-200/80"
                                }`}
                              >
                                <div className="text-[9px] opacity-75 mb-1 font-bold flex items-center justify-between gap-2">
                                  <span>{isUser ? "Customer (WhatsApp)" : isAdmin ? "Staff Admin" : "GEC AI Bot"}</span>
                                  <span>{m.time}</span>
                                </div>
                                <div className="break-words">{m.text}</div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-stone-400">
                          No messages recorded for this conversation.
                        </div>
                      )}
                    </div>

                    {/* Quick Canned Snippets for Mobile */}
                    <div className="px-3 py-2 bg-stone-50 border-t border-stone-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      <span className="text-[10px] text-stone-500 font-semibold shrink-0">Quick:</span>
                      <button
                        onClick={async () => {
                          setAdminReplyText("Welcome to Gorai Equestrian Centre! How can we assist you today?");
                          if (activeConversation.control_mode !== "HUMAN_HANDOVER") {
                            await handleToggleTakeover(activeConversation.conversation_id);
                          }
                        }}
                        className="text-[10px] bg-white hover:bg-stone-100 text-stone-700 px-2.5 py-1 rounded-lg shrink-0 border border-stone-200 shadow-xs"
                      >
                        👋 Greeting
                      </button>
                      <button
                        onClick={async () => {
                          setAdminReplyText("Here is our official registration link: https://goraiequestriancentre.vercel.app/register");
                          if (activeConversation.control_mode !== "HUMAN_HANDOVER") {
                            await handleToggleTakeover(activeConversation.conversation_id);
                          }
                        }}
                        className="text-[10px] bg-white hover:bg-stone-100 text-stone-700 px-2.5 py-1 rounded-lg shrink-0 border border-stone-200 shadow-xs"
                      >
                        📝 Register Link
                      </button>
                      <button
                        onClick={async () => {
                          setAdminReplyText("We are located at Khajuriwadi, Gorai, Mumbai – 400092. Morning batches run 6:30 AM – 9:30 AM.");
                          if (activeConversation.control_mode !== "HUMAN_HANDOVER") {
                            await handleToggleTakeover(activeConversation.conversation_id);
                          }
                        }}
                        className="text-[10px] bg-white hover:bg-stone-100 text-stone-700 px-2.5 py-1 rounded-lg shrink-0 border border-stone-200 shadow-xs"
                      >
                        📍 Location & Timings
                      </button>
                    </div>

                    {/* Admin Message Send Form */}
                    <form
                      onSubmit={handleSendAdminReply}
                      className="p-3 border-t border-stone-200 bg-white flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={adminReplyText}
                        onChange={(e) => setAdminReplyText(e.target.value)}
                        placeholder="Type reply to customer on WhatsApp..."
                        className="flex-1 bg-stone-50 border border-stone-200 rounded-xl text-xs px-3.5 py-2.5 text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white placeholder:text-stone-400"
                      />
                      <button
                        type="submit"
                        disabled={!adminReplyText.trim()}
                        className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm shrink-0"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Send</span>
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-stone-400 p-8">
                    Select a conversation to view transcript.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 3: REGISTRATIONS & CONSENT VAULT
          ====================================================================== */}
          {activeTab === "registrations" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Header and Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg lg:text-xl font-bold text-stone-900">
                    Rider Registrations & Consent Vault ({registrations.length})
                  </h2>
                  <p className="text-xs text-stone-500">
                    Live records from rider registration vault.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-60">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-stone-400" />
                    <input
                      type="text"
                      placeholder="Search rider name or phone..."
                      value={regSearch}
                      onChange={(e) => setRegSearch(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-amber-600 shadow-xs"
                    />
                  </div>

                  <select
                    value={regLevelFilter}
                    onChange={(e) => setRegLevelFilter(e.target.value)}
                    className="bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 text-xs text-stone-700 focus:outline-none focus:border-amber-600 shadow-xs"
                  >
                    <option value="all">All Levels</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
              </div>

              {/* Mobile Card View (Hidden on desktop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-3">
                {filteredRegistrations.length === 0 ? (
                  <div className="col-span-full p-8 text-center text-xs text-stone-400 rounded-2xl bg-white border border-stone-200">
                    No registrations found matching criteria.
                  </div>
                ) : (
                  filteredRegistrations.map((r) => (
                    <div
                      key={r.registration_id}
                      className="p-4 rounded-2xl bg-white border border-stone-200/90 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm text-stone-900">{r.full_name}</div>
                          <div className="text-[11px] text-amber-800 font-mono">{r.mobile_number}</div>
                        </div>
                        <span className="text-[10px] bg-stone-100 text-stone-700 font-semibold px-2 py-0.5 rounded-full border border-stone-200">
                          {r.rider_level}
                        </span>
                      </div>

                      <div className="text-xs text-stone-700 space-y-1 bg-stone-50 p-2.5 rounded-xl border border-stone-200/70">
                        <div><span className="text-stone-500">Activity:</span> {r.activity}</div>
                        <div><span className="text-stone-500">Blood Group:</span> {r.blood_group || "N/A"}</div>
                        <div><span className="text-stone-500">Signature:</span> <strong className="text-stone-900">{r.digital_signature_name}</strong></div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Consent Signed</span>
                        </div>

                        <button
                          onClick={() => setSelectedReg(r)}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/70 text-xs font-bold transition shadow-xs"
                        >
                          View Full Details
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table View (Hidden on mobile) */}
              <div className="hidden lg:block border border-stone-200/90 rounded-2xl bg-white overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50/80 text-stone-600 uppercase text-[10px] tracking-wider border-b border-stone-200">
                    <tr>
                      <th className="p-3.5">Customer</th>
                      <th className="p-3.5">Activity</th>
                      <th className="p-3.5">Level</th>
                      <th className="p-3.5">Medical Decl.</th>
                      <th className="p-3.5">Safety & Indemnity</th>
                      <th className="p-3.5">Digital Signature</th>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-800">
                    {filteredRegistrations.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-stone-400">
                          No registrations found.
                        </td>
                      </tr>
                    ) : (
                      filteredRegistrations.map((r) => (
                        <tr key={r.registration_id} className="hover:bg-stone-50/70 transition">
                          <td className="p-3.5 font-semibold">
                            <div className="text-stone-900">{r.full_name}</div>
                            <div className="text-[10px] text-amber-800 font-mono">{r.mobile_number}</div>
                          </td>
                          <td className="p-3.5 text-stone-700">{r.activity}</td>
                          <td className="p-3.5">
                            <span className="bg-stone-100 text-stone-700 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-stone-200">
                              {r.rider_level}
                            </span>
                          </td>
                          <td className="p-3.5 text-emerald-700">
                            {r.medical_fitness_confirmed ? (
                              <span className="inline-flex items-center gap-1 font-medium">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Fit
                              </span>
                            ) : (
                              <span className="text-stone-400">—</span>
                            )}
                          </td>
                          <td className="p-3.5 text-emerald-700">
                            {r.safety_rules_acknowledged && r.indemnity_accepted ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                <Shield className="h-3 w-3 text-emerald-600" /> Signed
                              </span>
                            ) : (
                              <span className="text-stone-400">—</span>
                            )}
                          </td>
                          <td className="p-3.5 font-medium text-stone-700">{r.digital_signature_name || "—"}</td>
                          <td className="p-3.5 text-stone-500">{new Date(r.created_at).toLocaleDateString()}</td>
                          <td className="p-3.5">
                            <button
                              onClick={() => setSelectedReg(r)}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-900 px-3 py-1 rounded-xl text-xs font-bold border border-amber-200 transition shadow-xs"
                            >
                              Inspect Full
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Registration Modal Dialog (Mobile Bottom Sheet Friendly) */}
              {selectedReg && (
                <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
                  <div className="bg-white border border-stone-200 rounded-t-3xl sm:rounded-3xl max-w-2xl w-full p-5 lg:p-6 max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                      <div>
                        <h3 className="text-base lg:text-lg font-bold text-stone-900">
                          Rider Profile: {selectedReg.full_name}
                        </h3>
                        <div className="text-xs text-stone-500 font-mono">
                          {selectedReg.mobile_number} | {selectedReg.email || "No email provided"}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedReg(null)}
                        className="p-1 rounded-lg bg-stone-100 text-stone-500 hover:text-stone-900"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-stone-50 p-4 rounded-2xl border border-stone-200/70">
                      <div><span className="text-stone-500">Activity:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.activity}</span></div>
                      <div><span className="text-stone-500">Level:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.rider_level}</span></div>
                      <div><span className="text-stone-500">DOB:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.date_of_birth}</span></div>
                      <div><span className="text-stone-500">Height / Weight:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.height_cm} cm / {selectedReg.weight_kg} kg</span></div>
                      <div><span className="text-stone-500">Blood Group:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.blood_group}</span></div>
                      <div><span className="text-stone-500">Occupation:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.occupation || "N/A"}</span></div>
                      <div className="sm:col-span-2"><span className="text-stone-500">Address:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.address}</span></div>
                    </div>

                    <div className="border-t border-stone-100 pt-3 text-xs space-y-2">
                      <div className="font-bold text-amber-800 uppercase tracking-wider text-[11px]">Emergency Contacts:</div>
                      <div><span className="text-stone-500">Contact:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.emergency_contact_person} ({selectedReg.emergency_contact_number})</span></div>
                      <div><span className="text-stone-500">Physician:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.family_physician || "None specified"}</span></div>
                      {selectedReg.is_minor && (
                        <div><span className="text-stone-500">Minor Guardian:</span> <span className="font-bold text-stone-900 ml-2">{selectedReg.guardian_name}</span></div>
                      )}
                    </div>

                    <div className="border-t border-stone-100 pt-3 text-xs space-y-2 bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200/70">
                      <div className="font-bold text-emerald-800 uppercase tracking-wider text-[11px]">Verified Legal Consents:</div>
                      <div className="flex items-center gap-2 text-stone-800">
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Medical Fitness Declaration Confirmed</span>
                      </div>
                      <div className="flex items-center gap-2 text-stone-800">
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Official Safety Rules & Guidelines Acknowledged</span>
                      </div>
                      <div className="flex items-center gap-2 text-stone-800">
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Indemnity & Risk Waiver Terms Accepted</span>
                      </div>
                      <div className="flex items-center gap-2 text-stone-800">
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Digital Signature: <strong className="text-stone-900 ml-1">{selectedReg.digital_signature_name}</strong></span>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => setSelectedReg(null)}
                        className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition shadow-sm"
                      >
                        Close Profile
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 4: PAYMENTS & VERIFIED RECEIPTS
          ====================================================================== */}
          {activeTab === "payments" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg lg:text-xl font-bold text-stone-900">
                    Payments & Verified Transactions ({payments.length})
                  </h2>
                  <p className="text-xs text-stone-500">Live transaction records and verified payment receipts.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPaymentFilter("all")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      paymentFilter === "all"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-white text-stone-600 border border-stone-200"
                    }`}
                  >
                    All ({payments.length})
                  </button>
                  <button
                    onClick={() => setPaymentFilter("PAID")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      paymentFilter === "PAID"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-white text-stone-600 border border-stone-200"
                    }`}
                  >
                    Paid
                  </button>
                  <button
                    onClick={() => setPaymentFilter("PENDING")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      paymentFilter === "PENDING"
                        ? "bg-amber-700 text-white shadow-xs"
                        : "bg-white text-stone-600 border border-stone-200"
                    }`}
                  >
                    Pending
                  </button>
                </div>
              </div>

              {/* Mobile Payment Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-3">
                {filteredPayments.length === 0 ? (
                  <div className="col-span-full p-8 text-center text-xs text-stone-400 rounded-2xl bg-white border border-stone-200">
                    No payments found.
                  </div>
                ) : (
                  filteredPayments.map((p) => (
                    <div
                      key={p.payment_id}
                      className="p-4 rounded-2xl bg-white border border-stone-200/90 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm text-stone-900">{p.full_name}</div>
                          <div className="text-[10px] text-stone-500 font-mono">{p.whatsapp_number}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.payment_status === "PAID"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {p.payment_status}
                        </span>
                      </div>

                      <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/70 space-y-1 text-xs">
                        <div className="text-stone-700 font-medium">{p.service_title}</div>
                        <div className="text-lg font-bold text-amber-800">
                          ₹{parseFloat(p.amount_inr).toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono truncate">
                          Receipt: {p.receipt_number}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-stone-500">{new Date(p.created_at).toLocaleDateString()}</span>
                        <button
                          onClick={() => setSelectedReceipt(p)}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/70 text-xs font-bold transition shadow-xs"
                        >
                          View Official Slip
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Payments Table */}
              <div className="hidden lg:block border border-stone-200/90 rounded-2xl bg-white overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50/80 text-stone-600 uppercase text-[10px] tracking-wider border-b border-stone-200">
                    <tr>
                      <th className="p-3.5">Customer</th>
                      <th className="p-3.5">Experience</th>
                      <th className="p-3.5">Amount</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Receipt No</th>
                      <th className="p-3.5">Gateway Ref</th>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-800">
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-stone-400">
                          No verified payments found.
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((p) => (
                        <tr key={p.payment_id} className="hover:bg-stone-50/70 transition">
                          <td className="p-3.5 font-semibold">
                            <div className="text-stone-900">{p.full_name}</div>
                            <div className="text-[10px] text-amber-800 font-mono">{p.whatsapp_number}</div>
                          </td>
                          <td className="p-3.5 text-stone-700">{p.service_title}</td>
                          <td className="p-3.5 font-bold text-stone-900 text-sm">
                            ₹{parseFloat(p.amount_inr).toLocaleString("en-IN")}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                p.payment_status === "PAID"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-800 border border-amber-200"
                              }`}
                            >
                              {p.payment_status}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-stone-700">{p.receipt_number}</td>
                          <td className="p-3.5 text-[11px] text-stone-500 font-mono">
                            {p.gateway_payment_id || "Direct"}
                          </td>
                          <td className="p-3.5 text-stone-500">{new Date(p.created_at).toLocaleDateString()}</td>
                          <td className="p-3.5">
                            <button
                              onClick={() => setSelectedReceipt(p)}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-900 px-3 py-1 rounded-xl text-xs font-bold border border-amber-200 transition shadow-xs"
                            >
                              View Slip
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Receipt Modal */}
              {selectedReceipt && (
                <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                  <div className="bg-white border border-stone-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative overflow-hidden">
                    <div className="border-b border-stone-100 pb-3 text-center">
                      <img
                        src="/assets/gec_logo.png"
                        alt="GEC Crest"
                        className="h-16 w-16 object-contain mx-auto mb-2 drop-shadow-sm"
                      />
                      <h3 className="font-bold text-base text-stone-900">GORAI EQUESTRIAN CENTRE</h3>
                      <p className="text-[11px] text-stone-500">Khajuriwadi, Gorai, Mumbai – 400092</p>
                      <p className="text-[10px] text-amber-800 font-mono mt-1 font-bold bg-amber-50 border border-amber-200/60 rounded-full px-3 py-0.5 inline-block">
                        OFFICIAL PAYMENT RECEIPT (SYSTEM VERIFIED)
                      </p>
                    </div>

                    <div className="text-xs space-y-2 bg-stone-50 p-4 rounded-2xl border border-stone-200/70">
                      <div className="flex justify-between">
                        <span className="text-stone-500">Receipt No:</span>
                        <span className="font-mono text-stone-900 font-bold">{selectedReceipt.receipt_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Customer:</span>
                        <span className="text-stone-900 font-semibold">{selectedReceipt.full_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">WhatsApp:</span>
                        <span className="text-amber-800 font-mono font-medium">{selectedReceipt.whatsapp_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Experience:</span>
                        <span className="text-stone-900 font-semibold">{selectedReceipt.service_title}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-stone-200">
                        <span className="text-stone-700 font-bold">Amount Paid:</span>
                        <span className="text-amber-800 font-extrabold text-base">
                          ₹{parseFloat(selectedReceipt.amount_inr).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Status:</span>
                        <span className="text-emerald-700 font-bold">{selectedReceipt.payment_status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Gateway Ref:</span>
                        <span className="text-stone-600 font-mono text-[11px]">{selectedReceipt.gateway_payment_id || "Direct Pay"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Date:</span>
                        <span className="text-stone-600">{new Date(selectedReceipt.created_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="text-center text-[10px] text-stone-500">
                      Thank you for choosing GEC! Please present this receipt slip at the front desk before your ride.
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setSelectedReceipt(null)}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2.5 rounded-xl text-xs transition shadow-sm"
                      >
                        Close Receipt
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 5: KNOWLEDGE BASE & RAG
          ====================================================================== */}
          {activeTab === "knowledge" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg lg:text-xl font-bold text-stone-900">
                    Knowledge Base & RAG ({kbArticles.length})
                  </h2>
                  <p className="text-xs text-stone-500">
                    Verified knowledge base articles used for AI Concierge retrieval.
                  </p>
                </div>

                <button
                  onClick={() => setShowAddKbForm(!showAddKbForm)}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition self-start sm:self-auto"
                >
                  <Plus className="h-4 w-4" />
                  <span>{showAddKbForm ? "Close Form" : "Add Article"}</span>
                </button>
              </div>

              {/* Add Knowledge Form Accordion */}
              {showAddKbForm && (
                <form
                  onSubmit={handleAddKb}
                  className="p-4 lg:p-5 rounded-2xl bg-white border border-stone-200/90 space-y-3 shadow-sm animate-in fade-in"
                >
                  <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                    Publish New Knowledge Entry
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] text-stone-600 font-semibold">Category</label>
                      <select
                        value={newKbCategory}
                        onChange={(e) => setNewKbCategory(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs px-3 py-2 text-stone-900 focus:outline-none focus:border-amber-600 mt-1"
                      >
                        <option value="Announcements">Announcements</option>
                        <option value="FAQs">FAQs</option>
                        <option value="Facilities">Facilities</option>
                        <option value="Safety">Safety</option>
                        <option value="Pricing">Pricing</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-stone-600 font-semibold">Article Title</label>
                      <input
                        type="text"
                        value={newKbTitle}
                        onChange={(e) => setNewKbTitle(e.target.value)}
                        placeholder="e.g. Sunday Morning Early Batch Guidelines..."
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs px-3 py-2 text-stone-900 focus:outline-none focus:border-amber-600 mt-1"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-stone-600 font-semibold">Article Content (RAG Context)</label>
                    <textarea
                      value={newKbContent}
                      onChange={(e) => setNewKbContent(e.target.value)}
                      rows={3}
                      placeholder="Enter verified factual knowledge that will be retrieved by AWS Bedrock AI..."
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs px-3 py-2 text-stone-900 focus:outline-none focus:border-amber-600 mt-1 leading-relaxed"
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddKbForm(false)}
                      className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingKb}
                      className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs transition shadow-sm"
                    >
                      {submittingKb ? "Saving Article..." : "Commit Article"}
                    </button>
                  </div>
                </form>
              )}

              {/* Category Filter Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {["all", "announcements", "safety", "facilities", "faqs", "pricing"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setKbFilter(cat)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold capitalize transition shrink-0 ${
                      kbFilter === cat
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-white text-stone-600 border border-stone-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Articles Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
                {filteredKb.length === 0 ? (
                  <div className="col-span-full p-8 text-center text-xs text-stone-400 rounded-2xl bg-white border border-stone-200">
                    No knowledge articles found.
                  </div>
                ) : (
                  filteredKb.map((k) => (
                    <div
                      key={k.kb_id}
                      className="p-4 rounded-2xl bg-white border border-stone-200/90 shadow-sm space-y-2.5 hover:border-amber-300 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200/70 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          {k.category}
                        </span>
                        <span className="text-emerald-700 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-emerald-600" /> Live in DB
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-stone-900">{k.title}</h4>
                      <p className="text-xs text-stone-600 leading-relaxed">{k.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 6: SERVICES CATALOGUE
          ====================================================================== */}
          {activeTab === "services" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg lg:text-xl font-bold text-stone-900">
                  Official GEC Services Catalogue ({services.length})
                </h2>
                <p className="text-xs text-stone-500">
                  Live verified catalog with locked pricing and session details.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {services.map((s) => (
                  <div
                    key={s.service_code}
                    className="p-5 rounded-3xl bg-white border border-stone-200/90 space-y-3 shadow-sm hover:border-amber-300 transition flex flex-col justify-between"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-stone-100 text-stone-700 font-bold px-2.5 py-0.5 rounded-full border border-stone-200">
                          Brochure Page {s.brochure_page}
                        </span>
                        <span className="text-sm font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200/70">
                          ₹{parseFloat(s.price_inr).toLocaleString("en-IN")}
                        </span>
                      </div>

                      <h3 className="font-bold text-sm text-stone-900 leading-snug">{s.title}</h3>

                      <div className="text-xs text-stone-700 space-y-1 bg-stone-50 p-3 rounded-2xl border border-stone-200/70">
                        <div><span className="text-stone-500">Duration:</span> {s.duration_minutes} mins</div>
                        <div><span className="text-stone-500">Sessions:</span> {s.sessions_count} session(s)</div>
                        <div><span className="text-stone-500">Target Rider:</span> {s.target_rider_level}</div>
                      </div>

                      <p className="text-xs text-stone-600 leading-relaxed">{s.description}</p>
                    </div>

                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                      <span>Code: <code className="text-amber-800 font-semibold">{s.service_code}</code></span>
                      <span className="text-emerald-700 font-semibold">Active in DB</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 7: VISUAL ASSETS ENGINE
          ====================================================================== */}
          {activeTab === "assets" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg lg:text-xl font-bold text-stone-900">
                  Visual Asset Manager ({visualAssets.length})
                </h2>
                <p className="text-xs text-stone-500">
                  High-resolution brand assets and service graphics used by AI concierge.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {visualAssets.map((item) => (
                  <div
                    key={item.asset_id}
                    className="rounded-3xl bg-white border border-stone-200/90 overflow-hidden shadow-sm group hover:border-amber-300 transition"
                  >
                    <div className="h-40 w-full overflow-hidden bg-stone-100">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-3.5 space-y-1">
                      <div className="text-[10px] font-mono text-amber-800 font-bold">
                        Key: {item.topic_key} (Page {item.brochure_source_page})
                      </div>
                      <div className="font-bold text-xs text-stone-900">{item.title}</div>
                      <p className="text-[11px] text-stone-600 leading-relaxed">{item.caption_en}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 8: SYSTEM & WEBHOOKS
          ====================================================================== */}
          {activeTab === "system" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg lg:text-xl font-bold text-stone-900">
                  System Health & Neon DB Observability
                </h2>
                <p className="text-xs text-stone-500">Verified production connection parameters.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Neon DB Heartbeat */}
                <div className="p-5 rounded-3xl bg-white border border-stone-200/90 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-stone-900 flex items-center gap-2">
                      <Database className="h-4 w-4 text-emerald-600" />
                      Neon PostgreSQL Serverless
                    </span>
                    <span className="text-emerald-800 text-xs font-bold bg-emerald-50 border border-emerald-200 px-3 py-0.5 rounded-full">
                      {dbStatus} ({dbLatency}ms)
                    </span>
                  </div>
                  <p className="text-xs text-stone-600">
                    Live connection to AWS us-east-2 connection pooler. 11 active tables.
                  </p>
                  <div className="text-[11px] font-mono text-stone-700 bg-stone-50 p-3 rounded-2xl border border-stone-200 truncate">
                    Neon serverless PostgreSQL (pooled)
                  </div>
                </div>

                {/* WhatsApp Cloud API Webhook */}
                <div className="p-5 rounded-3xl bg-white border border-stone-200/90 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-stone-900 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-600" />
                      WhatsApp Webhook Route
                    </span>
                    <span className="text-emerald-800 text-xs font-bold bg-emerald-50 border border-emerald-200 px-3 py-0.5 rounded-full">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-xs text-stone-600">
                    Permanent production webhook endpoint accepting Meta Cloud API messages.
                  </p>
                  <div className="text-[11px] font-mono text-stone-700 bg-stone-50 p-3 rounded-2xl border border-stone-200 truncate">
                    https://goraiequestriancentre.vercel.app/api/webhook/whatsapp
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* =========================================================================
          5. CATCHY MOBILE BOTTOM NAVIGATION BAR
      ========================================================================== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-xl border-t border-stone-200/90 flex items-center justify-around px-2 pb-safe">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === "overview" ? "text-amber-800 font-bold" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <Activity className="h-5 w-5" />
          <span className="text-[10px] mt-0.5">Overview</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("chat");
            setMobileChatView("list");
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 relative transition ${
            activeTab === "chat" ? "text-amber-800 font-bold" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <MessageSquare className="h-5 w-5" />
          <span className="text-[10px] mt-0.5">Chat</span>
          {kpis.active_human_takeovers > 0 && (
            <span className="absolute top-1 right-5 h-2 w-2 rounded-full bg-red-500 animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("registrations")}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === "registrations" ? "text-amber-800 font-bold" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <Users className="h-5 w-5" />
          <span className="text-[10px] mt-0.5">Riders</span>
        </button>

        <button
          onClick={() => setActiveTab("payments")}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === "payments" ? "text-amber-800 font-bold" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <CreditCard className="h-5 w-5" />
          <span className="text-[10px] mt-0.5">Payments</span>
        </button>

        <button
          onClick={() => setMobileMoreSheetOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            ["knowledge", "services", "assets", "system"].includes(activeTab)
              ? "text-amber-800 font-bold"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </nav>

      {/* =========================================================================
          6. MOBILE "MORE" BOTTOM SHEET
      ========================================================================== */}
      {mobileMoreSheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm"
            onClick={() => setMobileMoreSheetOpen(false)}
          />

          <div className="relative bg-white border-t border-stone-200 rounded-t-3xl p-5 z-10 shadow-2xl space-y-4 animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <span className="font-bold text-sm text-stone-900">More Modules</span>
              <button
                onClick={() => setMobileMoreSheetOpen(false)}
                className="p-1 rounded-lg bg-stone-100 text-stone-500 hover:text-stone-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  setActiveTab("knowledge");
                  setMobileMoreSheetOpen(false);
                }}
                className="p-3 rounded-2xl bg-stone-50 hover:bg-stone-100 text-left border border-stone-200"
              >
                <BookOpen className="h-5 w-5 text-purple-600 mb-1" />
                <div className="text-xs font-bold text-stone-900">Knowledge Base</div>
                <div className="text-[10px] text-stone-500">{kbArticles.length} articles</div>
              </button>

              <button
                onClick={() => {
                  setActiveTab("services");
                  setMobileMoreSheetOpen(false);
                }}
                className="p-3 rounded-2xl bg-stone-50 hover:bg-stone-100 text-left border border-stone-200"
              >
                <FileText className="h-5 w-5 text-amber-600 mb-1" />
                <div className="text-xs font-bold text-stone-900">Services & Rates</div>
                <div className="text-[10px] text-stone-500">{services.length} services</div>
              </button>

              <button
                onClick={() => {
                  setActiveTab("assets");
                  setMobileMoreSheetOpen(false);
                }}
                className="p-3 rounded-2xl bg-stone-50 hover:bg-stone-100 text-left border border-stone-200"
              >
                <ImageIcon className="h-5 w-5 text-sky-600 mb-1" />
                <div className="text-xs font-bold text-stone-900">Visual Assets</div>
                <div className="text-[10px] text-stone-500">{visualAssets.length} images</div>
              </button>

              <button
                onClick={() => {
                  setActiveTab("system");
                  setMobileMoreSheetOpen(false);
                }}
                className="p-3 rounded-2xl bg-stone-50 hover:bg-stone-100 text-left border border-stone-200"
              >
                <ShieldAlert className="h-5 w-5 text-emerald-600 mb-1" />
                <div className="text-xs font-bold text-stone-900">System Health</div>
                <div className="text-[10px] text-stone-500">Database & Webhook</div>
              </button>
            </div>

            <div className="pt-2 border-t border-stone-100 flex gap-2">
              <a
                href="/register"
                target="_blank"
                className="flex-1 py-2.5 rounded-xl bg-stone-50 text-center text-xs text-stone-800 font-bold border border-stone-200 flex items-center justify-center gap-1.5"
              >
                <span>Register Form</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="/checkout"
                target="_blank"
                className="flex-1 py-2.5 rounded-xl bg-stone-50 text-center text-xs text-stone-800 font-bold border border-stone-200 flex items-center justify-center gap-1.5"
              >
                <span>Checkout Form</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
