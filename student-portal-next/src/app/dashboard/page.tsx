"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardCard } from "@/components/DashboardCard";
import { RetakeComponentPopover } from "@/components/RetakeComponentPopover";
import { formatShortDate, formatShortDateTime } from "@/lib/dateFormat";
import ieltsExamLogo from "../../../assests/IELTS Exam logo-trim.png";

type LiveAuth = {
  email: string;
  passwordHash: string;
};

type PendingPurchaseSync = {
  packageName: string;
  sessionId: string;
};

type BridgeProfile = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  dob: string;
  candidateNumber: number;
  targetBandScore: number;
  createdAt: string;
};

type LiveOverview = {
  profile: {
    id: string;
    name: string;
    email: string;
    whatsapp: string;
    dob: string;
    candidateNumber: number;
    targetBandScore: number;
    createdAt: string;
    lastActivityAt: string;
  };
  progress: {
    paidMockTestsPurchased: number;
    completedMockTests: number;
    remainingMockTests: number;
    speakingPackage?: string;
    speakingSlotsAllocated?: number;
    speakingSlotsBooked?: number;
    speakingSlotsCompleted?: number;
    speakingSlotsRemaining?: number;
    overallBand: number | null;
    latestModuleScores: Record<string, number>;
  };
  payments: Array<{
    id?: string;
    amount?: number;
    currency?: string;
    createdAt?: string;
    method?: string;
    status?: string;
    package?: string;
    verified?: boolean;
  }>;
  results: Array<{
    id?: string;
    module?: string;
    bandScore?: number | null;
    status?: string;
    releaseAt?: string;
    testMode?: string;
    attemptId?: string;
    updatedAt?: string;
    createdAt?: string;
  }>;
  activities: Array<{
    id?: string;
    type?: string;
    createdAt?: string;
    meta?: Record<string, unknown>;
  }>;
  speakingAvailability: Array<{
    id?: string;
    examinerName?: string;
    startTs?: string;
    endTs?: string;
    durationMinutes?: number;
    status?: string;
  }>;
  speakingBookings?: Array<{
    id?: string;
    slotId?: string;
    packageName?: string;
    examinerName?: string;
    examinerEmail?: string;
    startTs?: string;
    endTs?: string;
    durationMinutes?: number;
    status?: string;
    bookedAt?: string;
    zoomLink?: string;
  }>;
  notices: string[];
};

const LIVE_AUTH_STORAGE_KEY = "ieltsPortalBridgeAuth";
const LIVE_PROFILE_STORAGE_KEY = "ieltsPortalBridgeProfile";
const PENDING_PURCHASE_STORAGE_KEY = "ieltsPortalPendingPurchaseSync";
const ALLOWED_LAUNCHER_ORIGINS = new Set(["https://www.ieltscambridge.com"]);

function formatModuleLabel(value: string | undefined) {
  const label = String(value || "").trim();
  if (!label) return "Module";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function readStoredAuth(): LiveAuth | null {
  try {
    const raw = window.localStorage.getItem(LIVE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LiveAuth>;
    const email = String(parsed.email || "").trim();
    const passwordHash = String(parsed.passwordHash || "").trim();
    if (!email || !passwordHash) return null;
    return { email, passwordHash };
  } catch {
    return null;
  }
}

function writeStoredAuth(auth: LiveAuth) {
  try {
    window.localStorage.setItem(LIVE_AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch {}
}

function clearStoredAuth() {
  try {
    window.localStorage.removeItem(LIVE_AUTH_STORAGE_KEY);
  } catch {}
}

function normalizeBridgeProfile(payload: Partial<BridgeProfile> | null | undefined): BridgeProfile | null {
  if (!payload || typeof payload !== "object") return null;
  const profile: BridgeProfile = {
    id: String(payload.id || "").trim(),
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim(),
    whatsapp: String(payload.whatsapp || "").trim(),
    dob: String(payload.dob || "").trim(),
    candidateNumber: Number(payload.candidateNumber || 0) || 0,
    targetBandScore: Number(payload.targetBandScore || 0) || 0,
    createdAt: String(payload.createdAt || "").trim()
  };
  if (!profile.name && !profile.email && !profile.candidateNumber) return null;
  return profile;
}

function readStoredProfile(): BridgeProfile | null {
  try {
    const raw = window.localStorage.getItem(LIVE_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BridgeProfile>;
    return normalizeBridgeProfile(parsed);
  } catch {
    return null;
  }
}

function writeStoredProfile(profile: BridgeProfile) {
  try {
    window.localStorage.setItem(LIVE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

function readStoredPendingPurchase(): PendingPurchaseSync | null {
  try {
    const raw = window.localStorage.getItem(PENDING_PURCHASE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPurchaseSync>;
    const packageName = String(parsed.packageName || "").trim();
    const sessionId = String(parsed.sessionId || "").trim();
    if (!packageName && !sessionId) return null;
    return { packageName, sessionId };
  } catch {
    return null;
  }
}

function writeStoredPendingPurchase(purchase: PendingPurchaseSync | null) {
  try {
    if (!purchase) {
      window.localStorage.removeItem(PENDING_PURCHASE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(PENDING_PURCHASE_STORAGE_KEY, JSON.stringify(purchase));
  } catch {}
}

async function syncPurchasedPayment(auth: LiveAuth, purchase: PendingPurchaseSync | null) {
  if (!purchase) return;
  const packageName = String(purchase.packageName || "").trim();
  if (!packageName) return;

  await fetch(getSyncPurchasedPaymentUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: auth.email,
      passwordHash: auth.passwordHash,
      package: packageName,
      sessionId: String(purchase.sessionId || "").trim(),
      source: "speaking-booking"
    })
  }).catch(() => null);
}

function getSyncPurchasedPaymentUrl() {
  if (typeof window === "undefined") {
    return "/api/users/sync-purchased-payment";
  }

  const protocol = window.location.protocol || "https:";
  const hostname = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");

  if (hostname === "localhost" || hostname === "127.0.0.1" || port === "3000") {
    return `${protocol}//${hostname}:5500/api/users/sync-purchased-payment`;
  }

  if (hostname === "www.ieltscambridge.com") {
    return "/api/users/sync-purchased-payment";
  }

  return "/api/sync-purchased-payment";
}

function decodeFragmentPayload(): { auth: LiveAuth | null; profile: BridgeProfile | null; purchase: PendingPurchaseSync | null } {
  try {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (!hash) return { auth: null, profile: null, purchase: null };

    const params = new URLSearchParams(hash);
    const encodedAuth = String(params.get("auth") || "").trim();
    const encodedProfile = String(params.get("profile") || "").trim();
    const packageName = String(params.get("package") || "").trim();
    const sessionId = String(params.get("session_id") || params.get("sessionId") || "").trim();

    let auth: LiveAuth | null = null;
    let profile: BridgeProfile | null = null;
    let purchase: PendingPurchaseSync | null = null;

    if (encodedAuth) {
      const decodedAuth = window.atob(decodeURIComponent(encodedAuth));
      const parsedAuth = JSON.parse(decodedAuth) as Partial<LiveAuth>;
      const email = String(parsedAuth.email || "").trim();
      const passwordHash = String(parsedAuth.passwordHash || "").trim();
      if (email && passwordHash) {
        auth = { email, passwordHash };
      }
    }

    if (encodedProfile) {
      const decodedProfile = decodeURIComponent(encodedProfile);
      const parsedProfile = JSON.parse(decodedProfile) as Partial<BridgeProfile>;
      profile = normalizeBridgeProfile(parsedProfile);
    }

    // Only queue purchase sync when both package and session id are present.
    if (packageName && sessionId) {
      purchase = { packageName, sessionId };
    }

    return { auth, profile, purchase };
  } catch {
    return { auth: null, profile: null, purchase: null };
  }
}

function clearFragmentAuth() {
  try {
    const nextUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", nextUrl);
  } catch {}
}

function encodeAuthPayload(auth: LiveAuth | null): string {
  if (!auth) return "";
  const email = String(auth.email || "").trim();
  const passwordHash = String(auth.passwordHash || "").trim();
  if (!email || !passwordHash) return "";
  try {
    return encodeURIComponent(window.btoa(JSON.stringify({ email, passwordHash })));
  } catch {
    return "";
  }
}

function getMainSiteBaseUrl() {
  if (typeof window === "undefined") return "https://www.ieltscambridge.com";

  const protocol = window.location.protocol || "https:";
  const hostname = (window.location.hostname || "").toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

  if (isLocal) {
    const localPort = window.location.port === "3000" ? "5500" : window.location.port || "5500";
    return `${protocol}//${hostname}:${localPort}`;
  }

  return "https://www.ieltscambridge.com";
}

function getAllowedLauncherOrigins() {
  if (typeof window === "undefined") return ALLOWED_LAUNCHER_ORIGINS;

  const origins = new Set(ALLOWED_LAUNCHER_ORIGINS);
  const protocol = window.location.protocol || "https:";
  const hostname = window.location.hostname || "";
  if (hostname) {
    origins.add(`${protocol}//${hostname}:5500`);
  }
  return origins;
}

function toMainSiteUrl(baseUrl: string, path: string) {
  const normalizedBase = String(baseUrl || "").replace(/\/$/, "");
  const normalizedPath = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function toMainSiteUrlWithQuery(baseUrl: string, path: string, query: string) {
  const url = toMainSiteUrl(baseUrl, path);
  return `${url}${String(query || "")}`;
}

function toMainSiteHash(baseUrl: string, hash: string) {
  const normalizedBase = String(baseUrl || "").replace(/\/$/, "");
  const normalizedHash = String(hash || "").startsWith("#") ? hash : `#${hash}`;
  return `${normalizedBase}/${normalizedHash}`;
}

function isAllowedLauncherOrigin(origin: string) {
  return getAllowedLauncherOrigins().has(origin);
}

function getLiveOverviewBridgeUrl() {
  if (typeof window === "undefined") {
    return "/api/users/live-overview";
  }

  const hostname = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");

  // In local dev, main portal APIs run on :5500 while Next runs on :3000.
  if (hostname === "localhost" || hostname === "127.0.0.1" || port === "3000") {
    const protocol = window.location.protocol || "https:";
    return `${protocol}//${hostname}:5500/api/users/live-overview`;
  }

  // Main site domain serves the core API routes directly.
  if (hostname === "www.ieltscambridge.com") {
    return "/api/users/live-overview";
  }

  // Student-portal deployments use a local proxy route.
  return "/api/live-overview";
}

async function loadMainPortalLiveOverview(auth: LiveAuth) {
  const response = await fetch(getLiveOverviewBridgeUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(auth)
  });

  const data = (await response.json().catch(() => ({}))) as { overview?: LiveOverview; error?: string };
  return { response, data };
}

function normalizeBridgeResponse(response: Response, data: { overview?: LiveOverview; error?: string }) {
  if (!response.ok || !data.overview) {
    return null;
  }
  return data.overview;
}

function clearLiveBridgeState(
  setLiveOverview: (value: LiveOverview | null) => void,
  setLiveMode: (value: "connecting" | "live" | "preview") => void,
  options?: { clearAuth?: boolean }
) {
  if (options?.clearAuth !== false) {
    clearStoredAuth();
  }
  setLiveOverview(null);
  setLiveMode("preview");
}

function setLiveBridgeState(overview: LiveOverview, setLiveOverview: (value: LiveOverview | null) => void, setLiveMode: (value: "connecting" | "live" | "preview") => void) {
  setLiveOverview(overview);
  setLiveMode("live");
}

function setPreviewBridgeState(setLiveOverview: (value: LiveOverview | null) => void, setLiveMode: (value: "connecting" | "live" | "preview") => void) {
  setLiveOverview(null);
  setLiveMode("preview");
}

function toMainSiteActionUrls(baseUrl: string, encodedCandidateBridgeProfile: string, freeMockAuthQuery: string) {
  return {
    freeMockUrl: toMainSiteUrlWithQuery(baseUrl, "/free-mock-test", `?bypass=1&profile=${encodedCandidateBridgeProfile}${freeMockAuthQuery}`),
    paidMockUrl: toMainSiteUrlWithQuery(baseUrl, "/packages", `?bypass=1${freeMockAuthQuery}`),
    bookIeltsUrl: toMainSiteUrl(baseUrl, "/book-exam"),
    universityUrl: toMainSiteHash(baseUrl, "#start-test")
  };
}

function formatNumericDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function normalizeResultTestMode(value: string | undefined) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "free" || mode === "free-mock" || mode === "free_mock") return "free" as const;
  if (mode === "mock" || mode === "paid" || mode === "mock-test" || mode === "mock_test") return "mock" as const;
  return "mock" as const;
}

function toAttemptBand(scores: number[]) {
  if (!scores.length) return null;
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Math.round(average * 2) / 2;
}

function formatModuleBandLabel(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return `Band ${Number(value).toFixed(1)}`;
}

function renderBandValue(value: number | null | undefined) {
  return <span className="font-bold text-blue-600">{formatModuleBandLabel(value)}</span>;
}

function renderComponentLabel(value: string) {
  return <span className="font-bold text-red-600">{value}</span>;
}

function renderNotAvailableValue() {
  return <span className="font-bold text-blue-600">Not available</span>;
}

function toTimestamp(value: string | undefined) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function resolveSpeakingSessionEndMs(slot: {
  startTs?: string;
  endTs?: string;
  durationMinutes?: number;
}) {
  const explicitEnd = toTimestamp(slot.endTs);
  if (explicitEnd != null) return explicitEnd;

  const startMs = toTimestamp(slot.startTs);
  if (startMs == null) return null;

  const durationMinutes = Number(slot.durationMinutes || 0);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return startMs + durationMinutes * 60 * 1000;
}

function getSpeakingJoinState(
  slot: {
    status?: string;
    startTs?: string;
    endTs?: string;
    durationMinutes?: number;
    zoomLink?: string;
  },
  nowMs: number
) {
  const status = String(slot.status || "").trim().toLowerCase();
  const startMs = toTimestamp(slot.startTs);
  const endMs = resolveSpeakingSessionEndMs(slot);
  const zoomLink = String(slot.zoomLink || "").trim();

  if (status === "completed") {
    return {
      label: "Completed",
      disabled: true,
      href: "",
      className: "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white cursor-default",
    };
  }

  if (startMs != null && nowMs < startMs) {
    return {
      label: `Join at ${formatShortDateTime(slot.startTs || "")}`,
      disabled: true,
      href: "",
      className: "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-500 cursor-not-allowed",
    };
  }

  if (endMs != null && nowMs > endMs) {
    return {
      label: "Session ended",
      disabled: true,
      href: "",
      className: "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-500 cursor-not-allowed",
    };
  }

  if (!zoomLink) {
    return {
      label: "Join link pending",
      disabled: true,
      href: "",
      className: "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-500 cursor-not-allowed",
    };
  }

  return {
    label: "Join Test",
    disabled: false,
    href: zoomLink,
    className: "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold bg-[#DA2C43] text-white hover:bg-[#b81f36]",
  };
}

export default function DashboardPage() {
  const [liveOverview, setLiveOverview] = useState<LiveOverview | null>(null);
  const [bridgeProfile, setBridgeProfile] = useState<BridgeProfile | null>(null);
  const [liveMode, setLiveMode] = useState<"connecting" | "live" | "preview">("connecting");
  const [mainSiteBaseUrl, setMainSiteBaseUrl] = useState("https://www.ieltscambridge.com");
  const [dashboardTargetUrl, setDashboardTargetUrl] = useState("/dashboard");
  const [freeMockAuthQuery, setFreeMockAuthQuery] = useState("");
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let fallbackTimer: number | undefined;

    setMainSiteBaseUrl(getMainSiteBaseUrl());

    const currentAuth = readStoredAuth();
    const encodedAuth = encodeAuthPayload(currentAuth);
    if (encodedAuth) {
      setFreeMockAuthQuery(`&auth=${encodedAuth}`);
    }

    async function loadLiveOverview(auth: LiveAuth) {
      setLiveMode("connecting");

      try {
        const { response, data } = await loadMainPortalLiveOverview(auth);
        const overview = normalizeBridgeResponse(response, data);
        if (!overview) {
          const shouldClearAuth = response.status === 401 || response.status === 403;
          clearLiveBridgeState(setLiveOverview, setLiveMode, { clearAuth: shouldClearAuth });
          return;
        }

        setLiveBridgeState(overview, setLiveOverview, setLiveMode);
      } catch {
        setPreviewBridgeState(setLiveOverview, setLiveMode);
      }
    }

    function handleIncomingAuth(auth: LiveAuth) {
      writeStoredAuth(auth);
      const encodedAuth = encodeAuthPayload(auth);
      setFreeMockAuthQuery(encodedAuth ? `&auth=${encodedAuth}` : "");
      const pendingPurchase = readStoredPendingPurchase();
      void syncPurchasedPayment(auth, pendingPurchase)
        .finally(() => {
          if (pendingPurchase) writeStoredPendingPurchase(null);
          void loadLiveOverview(auth);
        });
    }

    const storedProfile = readStoredProfile();
    if (storedProfile) {
      setBridgeProfile(storedProfile);
    }

    function handleMessage(event: MessageEvent) {
      if (!isAllowedLauncherOrigin(event.origin)) return;
      const payload = event.data as { type?: string; email?: string; passwordHash?: string } | null;
      if (!payload || payload.type !== "ielts-portal-auth") return;

      const email = String(payload.email || "").trim();
      const passwordHash = String(payload.passwordHash || "").trim();
      if (!email || !passwordHash) return;

      handleIncomingAuth({ email, passwordHash });
    }

    window.addEventListener("message", handleMessage);

    const fragmentPayload = decodeFragmentPayload();
    if (fragmentPayload.profile) {
      writeStoredProfile(fragmentPayload.profile);
      setBridgeProfile(fragmentPayload.profile);
    }
    if (fragmentPayload.purchase) {
      writeStoredPendingPurchase(fragmentPayload.purchase);
    }

    if (fragmentPayload.auth) {
      clearFragmentAuth();
      handleIncomingAuth(fragmentPayload.auth);
    } else {
      const storedAuth = readStoredAuth();
      if (storedAuth) {
        const pendingPurchase = readStoredPendingPurchase();
        void syncPurchasedPayment(storedAuth, pendingPurchase)
          .finally(() => {
            if (pendingPurchase) writeStoredPendingPurchase(null);
            void loadLiveOverview(storedAuth);
          });
      } else {
        fallbackTimer = window.setTimeout(() => {
          setLiveMode("preview");
        }, 1000);
      }

      if (fragmentPayload.profile) {
        clearFragmentAuth();
      }
    }

    return () => {
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const usingLive = liveMode === "live" && !!liveOverview;
  const resultRowsDescending = usingLive
    ? liveOverview.results
        .slice()
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    : [];
  const scoredResultRowsDescending = usingLive
    ? liveOverview.results
        .slice()
        .filter((result) => result.bandScore != null)
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    : [];
  const resultRowsAscending = usingLive
    ? scoredResultRowsDescending.slice().reverse()
    : [];
  const attemptSummaries = (() => {
    if (!usingLive) return [] as Array<{
      key: string;
      testMode: "free" | "mock";
      attemptId: string;
      attemptNumber: number;
      updatedAt: string;
      moduleBands: {
        listening: number | null;
        reading: number | null;
        writing: number | null;
        speaking: number | null;
      };
      overallBand: number | null;
      pendingRelease: boolean;
    }>;

    const ordered = liveOverview.results
      .slice()
      .sort((a, b) => String(a.updatedAt || a.createdAt || "").localeCompare(String(b.updatedAt || b.createdAt || "")));

    const buckets = new Map<string, {
      key: string;
      testMode: "free" | "mock";
      attemptId: string;
      firstSeenAt: string;
      updatedAt: string;
      moduleBands: {
        listening: number | null;
        reading: number | null;
        writing: number | null;
        speaking: number | null;
      };
      pendingRelease: boolean;
    }>();

    ordered.forEach((result) => {
      const testMode = normalizeResultTestMode(result.testMode);
      const attemptId = String(result.attemptId || "").trim() || String(result.id || "").trim() || `unknown-${String(result.updatedAt || result.createdAt || "")}`;
      const key = `${testMode}:${attemptId}`;
      const timestamp = String(result.updatedAt || result.createdAt || "");
      const moduleName = String(result.module || "").trim().toLowerCase();

      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          testMode,
          attemptId,
          firstSeenAt: timestamp,
          updatedAt: timestamp,
          moduleBands: {
            listening: null,
            reading: null,
            writing: null,
            speaking: null,
          },
          pendingRelease: false,
        });
      }

      const bucket = buckets.get(key);
      if (!bucket) return;

      if (!bucket.updatedAt || bucket.updatedAt.localeCompare(timestamp) < 0) {
        bucket.updatedAt = timestamp;
      }

      if (moduleName === "listening" || moduleName === "reading" || moduleName === "writing" || moduleName === "speaking") {
        bucket.moduleBands[moduleName] = typeof result.bandScore === "number" ? Number(result.bandScore) : null;
      }

      if (moduleName === "writing" && result.bandScore == null) {
        bucket.pendingRelease = true;
      }
    });

    const byMode = new Map<"free" | "mock", Array<{
      key: string;
      testMode: "free" | "mock";
      attemptId: string;
      firstSeenAt: string;
      updatedAt: string;
      moduleBands: {
        listening: number | null;
        reading: number | null;
        writing: number | null;
        speaking: number | null;
      };
      pendingRelease: boolean;
    }>>();

    Array.from(buckets.values()).forEach((bucket) => {
      const list = byMode.get(bucket.testMode) || [];
      list.push(bucket);
      byMode.set(bucket.testMode, list);
    });

    const summaries: Array<{
      key: string;
      testMode: "free" | "mock";
      attemptId: string;
      attemptNumber: number;
      updatedAt: string;
      moduleBands: {
        listening: number | null;
        reading: number | null;
        writing: number | null;
        speaking: number | null;
      };
      overallBand: number | null;
      pendingRelease: boolean;
    }> = [];

    (["free", "mock"] as const).forEach((mode) => {
      const groups = (byMode.get(mode) || []).sort((a, b) => String(a.firstSeenAt || "").localeCompare(String(b.firstSeenAt || "")));
      groups.forEach((group, index) => {
        summaries.push({
          key: group.key,
          testMode: mode,
          attemptId: group.attemptId,
          attemptNumber: index + 1,
          updatedAt: group.updatedAt,
          moduleBands: group.moduleBands,
          overallBand: mode === "free"
            ? null
            : toAttemptBand(
                [group.moduleBands.listening, group.moduleBands.reading, group.moduleBands.writing, group.moduleBands.speaking]
                  .filter((score): score is number => typeof score === "number")
              ),
          pendingRelease: group.pendingRelease,
        });
      });
    });

    return summaries.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  })();
  const freeAttemptSummaries = attemptSummaries
    .filter((item) => item.testMode === "free")
    .slice(0, 3);
  const paidAttemptSummaries = attemptSummaries.filter((item) => item.testMode === "mock");
  const targetBand = (() => {
    if (usingLive && Number(liveOverview.profile.targetBandScore) > 0) {
      return Number(liveOverview.profile.targetBandScore);
    }
    if (!usingLive && Number(bridgeProfile?.targetBandScore || 0) > 0) {
      return Number(bridgeProfile?.targetBandScore || 0);
    }
    return 0;
  })();
  const summaryName = usingLive
    ? (liveOverview.profile.name || "Candidate")
    : (bridgeProfile?.name || "Candidate");
  const summaryCandidateNumber = usingLive
    ? String(liveOverview.profile.candidateNumber || "-")
    : bridgeProfile?.candidateNumber
      ? String(bridgeProfile.candidateNumber)
      : "-";
  const summaryRegisteredAt = usingLive
    ? formatNumericDate(liveOverview.profile.createdAt || "")
    : bridgeProfile?.createdAt
      ? formatNumericDate(bridgeProfile.createdAt)
      : "-";
  const summaryEmail = usingLive
    ? (liveOverview.profile.email || "-")
    : (bridgeProfile?.email || "-");
  const summaryWhatsapp = usingLive
    ? (liveOverview.profile.whatsapp || "-")
    : (bridgeProfile?.whatsapp || "-");
  const candidateBridgeProfile = {
    id: usingLive ? String(liveOverview.profile.id || "").trim() : String(bridgeProfile?.id || "").trim(),
    name: usingLive ? String(liveOverview.profile.name || summaryName).trim() : String(summaryName || "").trim(),
    email: usingLive ? String(liveOverview.profile.email || summaryEmail).trim() : String(summaryEmail || "").trim(),
    whatsapp: usingLive ? String(liveOverview.profile.whatsapp || summaryWhatsapp).trim() : String(summaryWhatsapp || "").trim(),
    dob: usingLive ? String(liveOverview.profile.dob || "").trim() : String(bridgeProfile?.dob || "").trim(),
    candidateNumber: usingLive
      ? Number(liveOverview.profile.candidateNumber || 0) || 0
      : Number(bridgeProfile?.candidateNumber || 0) || 0,
    targetBandScore: Number(targetBand || 0) || 0,
    createdAt: usingLive
      ? String(liveOverview.profile.createdAt || "").trim()
      : String(bridgeProfile?.createdAt || "").trim(),
  };
  const encodedCandidateBridgeProfile = encodeURIComponent(JSON.stringify(candidateBridgeProfile));
  const summaryPaidTests = usingLive ? liveOverview.progress.paidMockTestsPurchased ?? 0 : 0;
  const summarySelectedPackage = (() => {
    if (!usingLive) return "-";
    if ((liveOverview.progress.paidMockTestsPurchased ?? 0) <= 0) return "-";
    const latestPaidPayment = [...liveOverview.payments]
      .filter((payment) => String(payment.status || "").toLowerCase() === "paid" && payment.verified !== false)
      .sort((left, right) => {
        const leftTime = Date.parse(String(left.createdAt || ""));
        const rightTime = Date.parse(String(right.createdAt || ""));
        const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
        const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
        return safeRight - safeLeft;
      })[0];
    const packageName = String(latestPaidPayment?.package || "").trim();
    return packageName || "-";
  })();
  const summaryCompletedTests = usingLive ? liveOverview.progress.completedMockTests ?? 0 : 0;
  const summaryRemainingTests = usingLive ? liveOverview.progress.remainingMockTests ?? 0 : 0;
  const summaryOverallBand = usingLive
    ? liveOverview.progress.overallBand == null
      ? "-"
      : Number(liveOverview.progress.overallBand).toFixed(1)
    : "-";
  const summaryModuleNotice = usingLive
    ? scoredResultRowsDescending.length === 0
      ? "No module results are published yet."
      : `Latest module result: ${formatModuleLabel(scoredResultRowsDescending[0].module)} · Band ${Number(scoredResultRowsDescending[0].bandScore || 0).toFixed(1)}`
    : "";
  const summaryLastActivity = usingLive
    ? liveOverview.profile.lastActivityAt || liveOverview.activities[0]?.createdAt || ""
    : "";
  const summaryLastActivityLabel = summaryLastActivity ? formatShortDateTime(summaryLastActivity) : "No activity recorded yet.";
  const { freeMockUrl, paidMockUrl, bookIeltsUrl, universityUrl } = toMainSiteActionUrls(
    mainSiteBaseUrl,
    encodedCandidateBridgeProfile,
    freeMockAuthQuery
  );
  const paidTestsCount = usingLive ? liveOverview.progress.paidMockTestsPurchased ?? 0 : 0;
  const actionCards = [
    {
      id: "free-mock",
      title: "Book Free Mock Test",
      detail: "Try an IELTS Academic or General free mock before booking a full package.",
      href: freeMockUrl,
      tone: "amber"
    },
    {
      id: "paid-mock",
      title: "Mock Test (Paid Version)",
      detail: usingLive ? `Booked paid mock tests: ${paidTestsCount}` : "Open the main portal to purchase and manage full mock tests.",
      href: paidMockUrl,
      tone: "rose"
    },
    {
      id: "book-ielts",
      title: "Book IELTS",
      detail: "Reserve your official IELTS exam slot from the main IELTS booking flow.",
      href: bookIeltsUrl,
      tone: "red"
    },
    {
      id: "university",
      title: "Apply for a University",
      detail: "Start the visa-support university path and review study options from the main site.",
      href: universityUrl,
      tone: "green"
    }
  ] as const;

  return (
    <main className="w-full px-6 py-5">
      <header className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[23px] font-bold text-[#DA2C43]">Test Taker Portal</p>
          <p className="mt-0.5 text-sm text-slate-600">
            Target band: <span className="font-medium">{Number(targetBand).toFixed(1)}</span>
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 self-center sm:self-auto">
          <Link
            href="/"
            className="inline-flex items-center rounded-md border border-slate-200 px-3 py-0.5 text-sm font-medium hover:bg-slate-50"
          >
            Home
          </Link>
          <Image
            src={ieltsExamLogo}
            alt="IELTS Exam logo"
            priority
            className="h-7 w-auto"
          />
        </div>
      </header>

      <hr className="mt-3.5 border-t border-[#DA2C43]" />

      <section className="mt-5 overflow-hidden rounded-[20px] bg-[linear-gradient(135deg,#1c3556_0%,#173152_65%,#24466d_100%)] px-4 py-3 text-white shadow-[0_24px_60px_rgba(15,23,43,0.22)] lg:px-5 lg:py-3.5">
        <div className="grid gap-2 xl:grid-cols-[2fr_minmax(390px,1fr)] xl:gap-2">
          <div>
            <p className="text-[0.8rem] font-bold uppercase tracking-[0.2em] text-[#F2B33D]">Candidate Profile</p>
            <h2 className="mt-1 text-[clamp(1.35rem,2.1vw,1.75rem)] font-bold leading-[1.02] whitespace-nowrap overflow-hidden text-ellipsis">Welcome, {summaryName}</h2>

            <div className="mt-2.5 grid gap-1.5 md:grid-cols-2">
              <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.13em] text-slate-200">Candidate Number</p>
                <p className="mt-1 text-[1.48rem] font-bold leading-none text-white">{summaryCandidateNumber}</p>
              </div>
              <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.13em] text-slate-200">Registered</p>
                <p className="mt-1 text-[1.48rem] font-bold leading-none text-white">{summaryRegisteredAt}</p>
              </div>
              <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.13em] text-slate-200">Email</p>
                <p className="mt-1 truncate text-[0.92rem] font-semibold leading-5 text-white" title={summaryEmail}>{summaryEmail}</p>
              </div>
              <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.13em] text-slate-200">WhatsApp</p>
                <p className="mt-1 text-[1.48rem] font-bold leading-none text-white">{summaryWhatsapp}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-1.5 auto-rows-min sm:grid-cols-2 xl:grid-cols-4 xl:grid-rows-[auto_auto] xl:gap-1.5">
            <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 text-center backdrop-blur-sm xl:min-h-[92px]">
              <p className="text-[2rem] font-bold leading-none text-white">{summaryPaidTests}</p>
              <p className="mt-1 text-[0.88rem] leading-5 text-slate-100">Paid mock tests</p>
              <p className="mt-1 text-[0.96rem] font-bold leading-5 text-white">{summarySelectedPackage}</p>
            </div>
            <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm xl:min-h-[92px]">
              <p className="text-[2rem] font-bold leading-none text-white">{summaryCompletedTests}</p>
              <p className="mt-1 max-w-[9ch] text-[0.88rem] leading-5 text-slate-100">Completed tests</p>
            </div>
            <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm xl:min-h-[92px]">
              <p className="text-[2rem] font-bold leading-none text-white">{summaryRemainingTests}</p>
              <p className="mt-1 max-w-[9ch] text-[0.88rem] leading-5 text-slate-100">Remaining tests</p>
            </div>
            <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm xl:min-h-[92px]">
              <p className="text-[2rem] font-bold leading-none text-white">{summaryOverallBand}</p>
              <p className="mt-1 max-w-[8ch] text-[0.88rem] leading-5 text-slate-100">Current overall band</p>
            </div>
            <a
              href={paidMockUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center rounded-[12px] border-2 border-white bg-white px-3 py-2 text-lg font-black uppercase tracking-[0.08em] !text-[#DA2C43] shadow-[0_18px_32px_rgba(15,23,43,0.18)] hover:bg-[#fff5f7] sm:col-span-2 xl:col-span-2 xl:min-h-[54px]"
            >
              Take Test
            </a>
            <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm sm:col-span-2 xl:col-span-2 xl:min-h-[54px]">
              <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-slate-200">Last Activity</p>
              <p className="mt-1 text-[1.06rem] font-bold leading-tight text-white">{summaryLastActivityLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardCard title={<span className="text-lg font-bold text-[#DA2C43]">Tests Taken</span>}>
          {usingLive ? (
            attemptSummaries.length === 0 ? (
              <p className="text-xs text-slate-600">No published live results yet.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto pr-2">
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Free Mock Test</p>
                      <p className="text-[11px] font-semibold text-slate-500">Max 1 attempt</p>
                    </div>
                    {freeAttemptSummaries.length === 0 ? (
                      <p className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">No free mock attempts recorded yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {freeAttemptSummaries.map((attempt) => (
                          <li key={attempt.key} className="rounded-md border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[17px] font-medium text-slate-900">Attempt {attempt.attemptNumber}</p>
                                <p className="mt-1 text-[14px] text-slate-600">{renderComponentLabel("Listening")}: {renderBandValue(attempt.moduleBands.listening)}</p>
                                <p className="text-[14px] text-slate-600">{renderComponentLabel("Reading")}: {renderBandValue(attempt.moduleBands.reading)}</p>
                                <p className="text-[14px] text-slate-600">{renderComponentLabel("Writing")}: {attempt.pendingRelease && attempt.moduleBands.writing == null ? <span className="text-red-600 font-bold">wait (12h)</span> : renderBandValue(attempt.moduleBands.writing)}</p>
                                <p className="text-[14px] text-slate-600">{renderComponentLabel("Speaking")}: {renderNotAvailableValue()}</p>
                                <p className="mt-1 text-[14px] text-slate-600">Updated: {formatShortDateTime(attempt.updatedAt || "")}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[15px] font-bold text-blue-600">Overall</p>
                                <p className="text-[17px] font-bold text-blue-600">
                                  {renderNotAvailableValue()}
                                </p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#DA2C43]">Mock Test</p>
                      <p className="text-[11px] font-semibold text-slate-500">Paid attempts</p>
                    </div>
                    {paidAttemptSummaries.length === 0 ? (
                      <p className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">No paid mock attempts recorded yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {paidAttemptSummaries.map((attempt) => (
                          <li key={attempt.key} className="rounded-md border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[17px] font-medium text-slate-900">Attempt {attempt.attemptNumber}</p>
                                <p className="mt-1 text-[14px] text-slate-600">{renderComponentLabel("Listening")}: {renderBandValue(attempt.moduleBands.listening)}</p>
                                <p className="text-[14px] text-slate-600">{renderComponentLabel("Reading")}: {renderBandValue(attempt.moduleBands.reading)}</p>
                                <p className="text-[14px] text-slate-600">{renderComponentLabel("Writing")}: {attempt.pendingRelease && attempt.moduleBands.writing == null ? <span className="text-red-600 font-bold">wait (12h)</span> : renderBandValue(attempt.moduleBands.writing)}</p>
                                <p className="text-[14px] text-slate-600">{renderComponentLabel("Speaking")}: {attempt.moduleBands.speaking == null ? renderNotAvailableValue() : renderBandValue(attempt.moduleBands.speaking)}</p>
                                <p className="mt-1 text-[14px] text-slate-600">Updated: {formatShortDateTime(attempt.updatedAt || "")}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[15px] font-bold text-blue-600">Overall</p>
                                <p className="text-[17px] font-bold text-blue-600">
                                  {attempt.overallBand == null ? (attempt.pendingRelease ? <span className="text-red-600">wait</span> : "—") : `Band ${Number(attempt.overallBand).toFixed(1)}`}
                                </p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : (
            <p className="text-xs text-slate-600">No live results yet. Sign in to load your latest records.</p>
          )}
        </DashboardCard>

        <DashboardCard title={<span className="text-lg font-bold text-[#DA2C43]">Progress (mock scores)</span>}>
          {usingLive ? (
            resultRowsAscending.length === 0 ? (
              <p className="text-xs text-slate-600">No scored live results yet.</p>
            ) : (() => {
              const minBand = 2;
              const maxBand = 9;
              const pointCount = resultRowsAscending.length;
              const width = 600;
              const height = 260;
              const paddingLeft = 44;
              const paddingRight = 10;
              const paddingTop = 12;
              const paddingBottom = 34;
              const plotWidth = width - paddingLeft - paddingRight;
              const plotHeight = height - paddingTop - paddingBottom;

              const xForIndex = (index: number) => {
                if (pointCount <= 1) return paddingLeft + plotWidth / 2;
                return paddingLeft + (index * plotWidth) / (pointCount - 1);
              };

              const yForBand = (band: number) => {
                const clamped = Math.min(maxBand, Math.max(minBand, band));
                const t = (maxBand - clamped) / (maxBand - minBand);
                return paddingTop + t * plotHeight;
              };

              const points = resultRowsAscending
                .map((result, index) => `${xForIndex(index)},${yForBand(Number(result.bandScore || 0))}`)
                .join(" ");

              return (
                <div className="w-full">
                  <svg className="h-56 w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Live student progress line graph">
                    <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={paddingTop + plotHeight} stroke="currentColor" className="text-slate-200" />
                    <line x1={paddingLeft} y1={paddingTop + plotHeight} x2={paddingLeft + plotWidth} y2={paddingTop + plotHeight} stroke="currentColor" className="text-slate-200" />
                    {Array.from({ length: maxBand - minBand + 1 }, (_, i) => minBand + i).map((tickBand) => {
                      const y = yForBand(tickBand);
                      return (
                        <g key={tickBand}>
                          <line x1={paddingLeft - 4} y1={y} x2={paddingLeft} y2={y} stroke="currentColor" className="text-slate-200" />
                          <text x={paddingLeft - 8} y={y + 4} textAnchor="end" className="fill-slate-600" fontSize="12">
                            {tickBand}
                          </text>
                        </g>
                      );
                    })}
                    {resultRowsAscending.map((result, index) => {
                      const x = xForIndex(index);
                      const y = paddingTop + plotHeight;
                      const labelY = y + 18;
                      return (
                        <g key={result.id || `${result.module}-${index}`}>
                          <line x1={x} y1={y} x2={x} y2={y + 4} stroke="currentColor" className="text-slate-200" />
                          <text x={x} y={labelY} textAnchor="middle" className="fill-slate-600" fontSize="12">
                            {index + 1}
                          </text>
                        </g>
                      );
                    })}
                    {pointCount >= 2 ? <polyline fill="none" points={points} stroke="#000" strokeWidth="2" /> : null}
                    {resultRowsAscending.map((result, index) => (
                      <circle key={result.id || `${result.module}-dot-${index}`} cx={xForIndex(index)} cy={yForBand(Number(result.bandScore || 0))} r="4" fill="#DA2C43" />
                    ))}
                  </svg>
                </div>
              );
            })()
          ) : (
            <p className="text-xs text-slate-600">No live progress data yet. Complete a scored test to populate this graph.</p>
          )}
        </DashboardCard>

        <DashboardCard title={<span className="text-lg font-bold text-[#DA2C43]">Speaking Test</span>}>
          {usingLive ? (
            (() => {
              const speakingPackage = String(liveOverview.progress.speakingPackage || "").trim() || "-";
              const speakingAllocated = Number(liveOverview.progress.speakingSlotsAllocated || 0) || 0;
              const speakingBooked = Number(liveOverview.progress.speakingSlotsBooked || 0) || 0;
              const speakingCompleted = Number(liveOverview.progress.speakingSlotsCompleted || 0) || 0;
              const speakingRemaining = Number(liveOverview.progress.speakingSlotsRemaining || 0) || 0;
              const speakingRowsRaw = Array.isArray(liveOverview.speakingBookings)
                ? liveOverview.speakingBookings
                : liveOverview.speakingAvailability.map((slot) => ({
                    id: slot.id,
                    examinerName: slot.examinerName,
                    startTs: slot.startTs,
                    endTs: slot.endTs,
                    durationMinutes: slot.durationMinutes,
                    status: slot.status,
                    bookedAt: "",
                    zoomLink: "",
                  }));
              const speakingRows = speakingRowsRaw.slice().sort((left, right) => {
                const leftMs = toTimestamp(left.startTs) || 0;
                const rightMs = toTimestamp(right.startTs) || 0;
                return leftMs - rightMs;
              });

              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2"><span className="font-semibold text-slate-700">Package:</span> {speakingPackage}</div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2"><span className="font-semibold text-slate-700">Allocated:</span> {speakingAllocated}</div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2"><span className="font-semibold text-slate-700">Booked:</span> {speakingBooked}</div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2"><span className="font-semibold text-slate-700">Completed:</span> {speakingCompleted}</div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2 col-span-2"><span className="font-semibold text-slate-700">Remaining (after completed):</span> {speakingRemaining}</div>
                  </div>

                  {speakingRows.length === 0 ? (
                    <p className="text-xs text-slate-600">No speaking sessions booked yet.</p>
                  ) : (
                    <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {speakingRows.map((slot) => {
                        const status = String(slot.status || "").trim().toLowerCase() || "unknown";
                        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
                        const statusTone = status === "completed"
                          ? "text-emerald-700"
                          : status === "booked"
                            ? "text-red-600"
                            : "text-blue-600";
                        const joinState = getSpeakingJoinState(slot, clockNowMs);

                        return (
                          <li key={slot.id || `${slot.examinerName}-${slot.startTs}`} className="rounded-md border border-slate-200 p-3">
                            <p className="text-[15px] font-semibold text-slate-900">Speaking Session</p>
                            <p className="mt-1 text-xs text-slate-600">{formatShortDateTime(slot.startTs || "")}</p>
                            <p className="mt-1 text-xs text-slate-600">{slot.examinerName || "Examiner"} · {slot.durationMinutes || 0} min</p>
                            <p className={`mt-1 text-xs font-semibold ${statusTone}`}>Status: {statusLabel}</p>
                            <div className="mt-2">
                              {joinState.disabled ? (
                                <button type="button" disabled className={joinState.className}>
                                  {joinState.label}
                                </button>
                              ) : (
                                <a href={joinState.href} target="_blank" rel="noreferrer" className={joinState.className}>
                                  {joinState.label}
                                </a>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })()
          ) : (
            <p className="text-xs text-slate-600">Sign in to view your speaking session progress.</p>
          )}
        </DashboardCard>
      </section>

      <section className="mt-4 overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(218,44,67,0.12),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(21,93,252,0.08),_transparent_28%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_28px_60px_rgba(15,23,43,0.10)] lg:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#DA2C43]">Action Hub</p>
            <h2 className="mt-2 text-[clamp(1.65rem,2.4vw,2.3rem)] font-bold leading-tight text-slate-900">Choose Your Next Step</h2>
          </div>
          <p className="max-w-xl text-sm font-bold leading-6 text-slate-600">Book tests, manage retakes, and move into IELTS or university applications from one section.</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          <a href={freeMockUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">Free Access</a>
          <a href={paidMockUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">Paid Mock Booking</a>
          <a href="#action-retake" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">Retake Support</a>
          <a href={bookIeltsUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">Official Exam</a>
          <a href={universityUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">University Path</a>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-5">
          <a
            id="action-free-mock"
            href={freeMockUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-[270px] flex-col rounded-[26px] border border-amber-200/80 bg-[linear-gradient(180deg,#fff7e8_0%,#fffdf7_100%)] p-5 shadow-[0_16px_30px_rgba(180,83,9,0.08)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_40px_rgba(180,83,9,0.14)]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Practice</p>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/85 text-lg shadow-sm">F</span>
            </div>
            <p className="mt-5 text-[1.35rem] font-bold leading-tight text-slate-900">Booking Free Mock Test</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">Try an IELTS Academic or General free mock before booking a full package.</p>
            <div className="mt-auto flex justify-center pt-6">
              <span className="inline-flex w-[220px] items-center justify-center rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-amber-800">Take a Free Mock Test</span>
            </div>
          </a>

          <a
            id="action-paid-mock"
            href={paidMockUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-[270px] flex-col rounded-[26px] border border-[#f1b6c0] bg-[linear-gradient(180deg,#fff1f4_0%,#fff8fa_100%)] p-5 shadow-[0_16px_30px_rgba(218,44,67,0.08)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_40px_rgba(218,44,67,0.14)]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#DA2C43]">Paid Mock</p>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/85 text-lg shadow-sm">P</span>
            </div>
            <p className="mt-5 text-[1.35rem] font-bold leading-tight text-slate-900">Mock Test (Paid Version)</p>
            <p className="mt-3 text-center text-sm leading-6 text-slate-600">{usingLive ? `Booked paid mock tests: ${paidTestsCount}` : "Open the main portal to purchase and manage full mock tests."}</p>
            <div className="mt-auto flex justify-center pt-6">
              <span className="inline-flex w-[220px] items-center justify-center rounded-xl bg-[#DA2C43] px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-[#b81f36]">Open Mock Tests</span>
            </div>
          </a>

          <div id="action-retake" className="flex min-h-[270px] flex-col rounded-[26px] border border-blue-200/80 bg-[linear-gradient(180deg,#eef5ff_0%,#f8fbff_100%)] p-5 shadow-[0_16px_30px_rgba(21,93,252,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Retake</p>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/85 text-lg shadow-sm">R</span>
            </div>
            <p className="mt-5 text-[1.35rem] font-bold leading-tight text-slate-900">Retake One Component</p>
            <p className="mt-3 text-center text-sm leading-6 text-slate-600">Use this only for components inside already booked paid mock tests.</p>
            <div className="mt-auto flex justify-center pt-6">
              <div className="w-[220px] rounded-2xl border border-blue-200 bg-white px-3 py-2 shadow-sm">
                <RetakeComponentPopover title="Select Component to Retake" />
              </div>
            </div>
          </div>

          <a
            id="action-official"
            href={bookIeltsUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-[270px] flex-col items-center rounded-[26px] border border-rose-200 bg-[#c30010] p-5 text-center text-white shadow-[0_18px_34px_rgba(195,0,16,0.28)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_42px_rgba(195,0,16,0.34)]"
          >
            <div className="flex w-full items-center justify-center gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">Official Exam</p>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 text-lg shadow-sm">I</span>
            </div>
            <p className="mt-5 text-[1.35rem] font-bold leading-tight">Book IELTS</p>
            <p className="mt-3 text-sm leading-6 text-white/90">Reserve your official IELTS exam slot from the main IELTS booking flow.</p>
            <div className="mt-auto flex justify-center pt-6">
              <span className="inline-flex w-[220px] items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#b90d2a] transition group-hover:bg-rose-50">Take the Official Test</span>
            </div>
          </a>

          <a
            id="action-university"
            href={universityUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-[270px] flex-col items-center rounded-[26px] border border-[#6bcbe8] bg-[linear-gradient(180deg,#1f4fd8_0%,#1ec9dc_100%)] p-5 text-center text-white shadow-[0_18px_34px_rgba(31,79,216,0.30)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_42px_rgba(30,201,220,0.34)]"
          >
            <div className="flex w-full items-center justify-center gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">Study Abroad</p>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 text-lg shadow-sm">U</span>
            </div>
            <p className="mt-5 text-[1.35rem] font-bold leading-tight">Apply for a University</p>
            <p className="mt-3 text-sm leading-6 text-white/90">Continue with the visa-support university path and review study options from the main site.</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-xl bg-[#ffd447] px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#0b0b0b]">100% Free Service</span>
              <span className="rounded-xl bg-[#c30010] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.08em] text-white">100% Visa Success</span>
            </div>
            <div className="mt-auto flex justify-center pt-6">
              <span className="inline-flex w-[220px] items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#1f4fd8] transition group-hover:bg-cyan-50">Search Universities</span>
            </div>
          </a>
        </div>
      </section>
    </main>
  );
}
