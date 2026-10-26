"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardCard } from "@/components/DashboardCard";
import { formatShortDate, formatShortDateTime, formatSriLankaDateTime } from "@/lib/dateFormat";
import ieltsExamLogo from "../../../assests/IELTS Exam logo-trim.png";

type LiveAuth = {
  email: string;
  passwordHash: string;
};

type PendingPurchaseSync = {
  packageName: string;
  sessionId: string;
};

type PayHerePayment = {
  sandbox: boolean;
  merchant_id: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  order_id: string;
  items: string;
  amount: string;
  currency: string;
  hash: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  custom_1: string;
  custom_2: string;
};

declare global {
  interface Window {
    payhere?: {
      onCompleted?: (orderId: string) => void;
      onDismissed?: () => void;
      onError?: (error: string) => void;
      startPayment: (payment: PayHerePayment) => void;
    };
  }
}

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
    paper?: number;
    purchaseType?: string;
    orderId?: string;
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
    paper?: string | number;
    attemptType?: string;
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
const MAX_PAID_RETAKES_PER_TEST = 5;
let payHereScriptPromise: Promise<void> | null = null;

function loadPayHereScript() {
  if (window.payhere) return Promise.resolve();
  if (payHereScriptPromise) return payHereScriptPromise;

  payHereScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.payhere.lk/lib/payhere-2.0.js";
    script.async = true;
    script.onload = () => window.payhere ? resolve() : reject(new Error("PayHere did not load."));
    script.onerror = () => reject(new Error("Unable to load PayHere."));
    document.head.appendChild(script);
  });
  return payHereScriptPromise;
}

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

function getPayHereOrderUrl() {
  if (typeof window === "undefined") return "/api/payments/create-payhere-order";

  const protocol = window.location.protocol || "https:";
  const hostname = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  if (hostname === "localhost" || hostname === "127.0.0.1" || port === "3000") {
    return `${protocol}//${hostname}:5500/api/payments/create-payhere-order`;
  }
  if (hostname === "www.ieltscambridge.com") return "/api/payments/create-payhere-order";
  return "/api/payhere-order";
}

function getExchangeRateUrl() {
  if (typeof window === "undefined") return "/api/exchange-rate";

  const protocol = window.location.protocol || "https:";
  const hostname = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  if (hostname === "localhost" || hostname === "127.0.0.1" || port === "3000") {
    return `${protocol}//${hostname}:5500/api/exchange-rate`;
  }
  if (hostname === "www.ieltscambridge.com") return "/api/exchange-rate";
  return "/api/exchange-rate";
}

function formatLkrAmount(usdAmount: number, usdLkrRate: number) {
  const localAmount = new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usdAmount * usdLkrRate);
  return `LKR ${localAmount}`;
}

function getCompleteSpeakingSessionUrl() {
  if (typeof window === "undefined") return "/api/speaking/complete";

  const protocol = window.location.protocol || "https:";
  const hostname = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  if (hostname === "localhost" || hostname === "127.0.0.1" || port === "3000") {
    return `${protocol}//${hostname}:5500/api/speaking/complete`;
  }
  if (hostname === "www.ieltscambridge.com") return "/api/speaking/complete";
  return "/api/complete-speaking-session";
}

function getTokenRedeemUrl() {
  if (typeof window === "undefined") return "/api/tokens/redeem";

  const protocol = window.location.protocol || "https:";
  const hostname = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  if (hostname === "localhost" || hostname === "127.0.0.1" || port === "3000") {
    return `${protocol}//${hostname}:5500/api/tokens/redeem`;
  }
  if (hostname === "www.ieltscambridge.com") return "/api/tokens/redeem";
  return "/api/redeem-token";
}

function getRetakeTokenRedeemUrl() {
  if (typeof window === "undefined") return "/api/retake-tokens/redeem";

  const protocol = window.location.protocol || "https:";
  const hostname = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  if (hostname === "localhost" || hostname === "127.0.0.1" || port === "3000") {
    return `${protocol}//${hostname}:5500/api/retake-tokens/redeem`;
  }
  if (hostname === "www.ieltscambridge.com") return "/api/retake-tokens/redeem";
  return "/api/redeem-retake-token";
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
  nowMs: number,
  testLabel: string
) {
  const status = String(slot.status || "").trim().toLowerCase();
  const startMs = toTimestamp(slot.startTs);
  const endMs = resolveSpeakingSessionEndMs(slot);
  const zoomLink = String(slot.zoomLink || "").trim();

  if (status === "completed") {
    return {
      label: `Completed ${testLabel} Speaking`,
      disabled: true,
      href: "",
      statusLabel: "Completed",
      className: "inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white cursor-default",
    };
  }

  if (status === "incomplete") {
    return {
      label: "Incomplete",
      disabled: true,
      href: "",
      statusLabel: "Incomplete",
      className: "inline-flex w-full items-center justify-center rounded-lg bg-red-100 px-4 py-2.5 text-sm font-bold text-red-700 cursor-not-allowed",
    };
  }

  if (startMs != null && nowMs < startMs) {
    return {
      label: `Join at ${formatSriLankaDateTime(slot.startTs || "")}`,
      disabled: true,
      href: "",
      statusLabel: "Booked",
      className: "inline-flex w-full items-center justify-center rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-500 cursor-not-allowed",
    };
  }

  if (endMs != null && nowMs > endMs) {
    return {
      label: "Incomplete",
      disabled: true,
      href: "",
      statusLabel: "Incomplete",
      className: "inline-flex w-full items-center justify-center rounded-lg bg-red-100 px-4 py-2.5 text-sm font-bold text-red-700 cursor-not-allowed",
    };
  }

  if (!zoomLink) {
    return {
      label: "Join link pending",
      disabled: true,
      href: "",
      statusLabel: "Booked",
      className: "inline-flex w-full items-center justify-center rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-500 cursor-not-allowed",
    };
  }

  return {
    label: "Join Now",
    disabled: false,
    href: zoomLink,
    statusLabel: "Booked",
    className: "inline-flex w-full items-center justify-center rounded-lg bg-[#DA2C43] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(218,44,67,0.28)] transition hover:bg-[#b81f36] focus:outline-none focus:ring-2 focus:ring-[#DA2C43] focus:ring-offset-2",
  };
}

export default function DashboardPage() {
  const [liveOverview, setLiveOverview] = useState<LiveOverview | null>(null);
  const [usdLkrRate, setUsdLkrRate] = useState<number | null>(null);
  const [bridgeProfile, setBridgeProfile] = useState<BridgeProfile | null>(null);
  const [liveMode, setLiveMode] = useState<"connecting" | "live" | "preview">("connecting");
  const [mainSiteBaseUrl, setMainSiteBaseUrl] = useState("https://www.ieltscambridge.com");
  const [dashboardTargetUrl, setDashboardTargetUrl] = useState("/dashboard");
  const [freeMockAuthQuery, setFreeMockAuthQuery] = useState("");
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());
  const [bookingPaper, setBookingPaper] = useState<number | null>(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingGuidancePaper, setBookingGuidancePaper] = useState<number | null>(null);
  const [retakePurchasePaper, setRetakePurchasePaper] = useState<number | null>(null);
  const [retakeTokenPaper, setRetakeTokenPaper] = useState<number | null>(null);
  const [tokenPaper, setTokenPaper] = useState<number | null>(null);
  const [tokenCode, setTokenCode] = useState("");
  const [tokenMessage, setTokenMessage] = useState("");
  const [redeemingToken, setRedeemingToken] = useState(false);
  const [retakeTokenCode, setRetakeTokenCode] = useState("");
  const [retakeTokenMessage, setRetakeTokenMessage] = useState("");
  const [redeemingRetakeToken, setRedeemingRetakeToken] = useState(false);
  const [completingSpeakingSlotId, setCompletingSpeakingSlotId] = useState("");
  const [speakingActionMessage, setSpeakingActionMessage] = useState("");
  const testPriceLkrLabel = usdLkrRate === null
    ? "(LKR rate unavailable)"
    : `(${formatLkrAmount(23, usdLkrRate)})`;

  const logOut = () => {
    clearLiveBridgeState(setLiveOverview, setLiveMode, { clearAuth: true });
    setBridgeProfile(null);
    window.localStorage.removeItem(LIVE_PROFILE_STORAGE_KEY);
    window.localStorage.removeItem(PENDING_PURCHASE_STORAGE_KEY);
    window.location.assign(mainSiteBaseUrl);
  };

  const completeSpeakingSession = async (slotId: string) => {
    const auth = readStoredAuth();
    if (!auth) {
      setSpeakingActionMessage("Please sign in again before joining your speaking session.");
      return;
    }

    setCompletingSpeakingSlotId(slotId);
    setSpeakingActionMessage("");
    try {
      const response = await fetch(getCompleteSpeakingSessionUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, slotId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Unable to update your speaking session.");
      }

      const { response: overviewResponse, data: overviewData } = await loadMainPortalLiveOverview(auth);
      const overview = normalizeBridgeResponse(overviewResponse, overviewData);
      if (!overview) {
        throw new Error("Speaking session joined, but the portal could not refresh. Please refresh this page.");
      }
      setLiveBridgeState(overview, setLiveOverview, setLiveMode);
    } catch (error) {
      setSpeakingActionMessage(error instanceof Error ? error.message : "Unable to update your speaking session.");
    } finally {
      setCompletingSpeakingSlotId("");
    }
  };

  const redeemToken = async () => {
    const auth = readStoredAuth();
    if (!auth || tokenPaper == null) {
      setTokenMessage("Please sign in again before redeeming a token.");
      return;
    }

    const code = tokenCode.trim();
    if (!code) {
      setTokenMessage("Enter the token code provided by your institution.");
      return;
    }

    setRedeemingToken(true);
    setTokenMessage("");
    try {
      const response = await fetch(getTokenRedeemUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, code, paper: tokenPaper }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Unable to redeem this token.");
      }

      const { response: overviewResponse, data: overviewData } = await loadMainPortalLiveOverview(auth);
      const overview = normalizeBridgeResponse(overviewResponse, overviewData);
      if (!overview) {
        throw new Error("Token redeemed, but the test booking could not be refreshed. Please refresh the page.");
      }
      setLiveBridgeState(overview, setLiveOverview, setLiveMode);
      setTokenPaper(null);
      setTokenCode("");
      setBookingMessage(`Test ${String(tokenPaper).padStart(2, "0")} has been booked using your token.`);
    } catch (error) {
      setTokenMessage(error instanceof Error ? error.message : "Unable to redeem this token.");
    } finally {
      setRedeemingToken(false);
    }
  };

  const redeemRetakeToken = async () => {
    const auth = readStoredAuth();
    if (!auth || retakeTokenPaper == null) {
      setRetakeTokenMessage("Please sign in again before redeeming a retake token.");
      return;
    }
    const code = retakeTokenCode.trim();
    if (!code) {
      setRetakeTokenMessage("Enter the retake token code provided by your institution.");
      return;
    }
    setRedeemingRetakeToken(true);
    setRetakeTokenMessage("");
    try {
      const response = await fetch(getRetakeTokenRedeemUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, code, paper: retakeTokenPaper }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to redeem this retake token.");

      const { response: overviewResponse, data: overviewData } = await loadMainPortalLiveOverview(auth);
      const overview = normalizeBridgeResponse(overviewResponse, overviewData);
      if (!overview) throw new Error("Retake token redeemed, but the portal could not be refreshed. Please refresh the page.");
      const redeemedPaper = retakeTokenPaper;
      setLiveBridgeState(overview, setLiveOverview, setLiveMode);
      setRetakeTokenPaper(null);
      setRetakeTokenCode("");
      setBookingMessage(`Your retake token has activated Test ${String(redeemedPaper).padStart(2, "0")} retake.`);
    } catch (error) {
      setRetakeTokenMessage(error instanceof Error ? error.message : "Unable to redeem this retake token.");
    } finally {
      setRedeemingRetakeToken(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const refreshExchangeRate = async () => {
      try {
        const response = await fetch(getExchangeRateUrl(), { cache: "no-store" });
        const data = (await response.json()) as { rate?: number; error?: string };
        const rate = Number(data.rate);
        if (!response.ok || !Number.isFinite(rate) || rate <= 0) {
          throw new Error(data.error || "Unable to retrieve a valid USD/LKR rate.");
        }
        if (active) setUsdLkrRate(rate);
      } catch (error) {
        console.error("Unable to refresh the USD/LKR exchange rate.", error);
      }
    };

    void refreshExchangeRate();
    const timer = window.setInterval(refreshExchangeRate, 15 * 60 * 1000);
    window.addEventListener("focus", refreshExchangeRate);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshExchangeRate);
    };
  }, []);

  useEffect(() => {
    void loadPayHereScript().catch((error) => {
      console.warn("PayHere preloading failed; it will be retried when a test is booked.", error);
    });
  }, []);

  useEffect(() => {
    let fallbackTimer: number | undefined;
    let liveRefreshTimer: number | undefined;

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

    liveRefreshTimer = window.setInterval(() => {
      if (document.hidden) return;
      const auth = readStoredAuth();
      if (auth) void loadLiveOverview(auth);
    }, 30000);

    return () => {
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      if (liveRefreshTimer) {
        window.clearInterval(liveRefreshTimer);
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
  const speakingBookingStatusByPaper = new Map<number, string>();
  if (usingLive) {
    (liveOverview.speakingBookings || []).forEach((booking) => {
      const match = String(booking.packageName || "").match(/\d+/);
      const paper = Math.max(1, Math.min(10, Number(match && match[0]) || 0));
      if (paper) speakingBookingStatusByPaper.set(paper, String(booking.status || "").trim().toLowerCase());
    });
  }
  const attemptSummaries = (() => {
    if (!usingLive) return [] as Array<{
      key: string;
      testMode: "free" | "mock";
      paper: number;
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
      speakingBookingStatus: string;
    }>;

    const ordered = liveOverview.results
      .slice()
      .sort((a, b) => String(a.updatedAt || a.createdAt || "").localeCompare(String(b.updatedAt || b.createdAt || "")));

    const buckets = new Map<string, {
      key: string;
      testMode: "free" | "mock";
      paper: number;
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
      speakingBookingStatus: string;
    }>();

    ordered.forEach((result) => {
      const testMode = normalizeResultTestMode(result.testMode);
      const paper = Math.max(1, Math.min(10, Number(result.paper) || 1));
      const attemptId = String(result.attemptId || "").trim() || String(result.id || "").trim() || `unknown-${String(result.updatedAt || result.createdAt || "")}`;
      const key = `${paper}:${testMode}:${attemptId}`;
      const timestamp = String(result.updatedAt || result.createdAt || "");
      const moduleName = String(result.module || "").trim().toLowerCase();

      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          testMode,
          paper,
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
          speakingBookingStatus: speakingBookingStatusByPaper.get(paper) || "",
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

    const byPaper = new Map<number, Array<{
      key: string;
      testMode: "free" | "mock";
      paper: number;
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
      speakingBookingStatus: string;
    }>>();

    Array.from(buckets.values()).forEach((bucket) => {
      const list = byPaper.get(bucket.paper) || [];
      list.push(bucket);
      byPaper.set(bucket.paper, list);
    });

    const summaries: Array<{
      key: string;
      testMode: "free" | "mock";
      paper: number;
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
      speakingBookingStatus: string;
    }> = [];

    Array.from(byPaper.entries()).forEach(([paper, paperAttempts]) => {
      const groups = paperAttempts.sort((a, b) => String(a.firstSeenAt || "").localeCompare(String(b.firstSeenAt || "")));
      groups.forEach((group, index) => {
        summaries.push({
          key: group.key,
          testMode: group.testMode,
          paper,
          attemptId: group.attemptId,
          attemptNumber: index + 1,
          updatedAt: group.updatedAt,
          moduleBands: group.moduleBands,
          overallBand: group.testMode === "free"
            ? null
            : group.speakingBookingStatus && group.moduleBands.speaking == null
              ? null
            : toAttemptBand(
                [group.moduleBands.listening, group.moduleBands.reading, group.moduleBands.writing, group.moduleBands.speaking]
                  .filter((score): score is number => typeof score === "number")
              ),
          pendingRelease: group.pendingRelease,
          speakingBookingStatus: group.speakingBookingStatus,
        });
      });
    });

    return summaries.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  })();
  const latestPaperAttemptSummaries = (() => {
    const byPaper = new Map<number, typeof attemptSummaries>();
    attemptSummaries.forEach((attempt) => {
      const attempts = byPaper.get(attempt.paper) || [];
      attempts.push(attempt);
      byPaper.set(attempt.paper, attempts);
    });

    return Array.from(byPaper.entries())
      .map(([paper, attempts]) => ({
        paper,
        attempts: attempts.sort((a, b) => a.attemptNumber - b.attemptNumber).slice(0, 4),
        updatedAt: attempts.reduce((latest, attempt) => String(latest).localeCompare(String(attempt.updatedAt || "")) < 0 ? attempt.updatedAt : latest, ""),
      }))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
  })();
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
  const selectedPackage = ["Lite", "Basic", "Standard", "Pro"].find(
    (packageName) => packageName === summarySelectedPackage
  );
  const testEntryUrl = (paper: number, attemptType: "initial" | "retake") => {
    if (paper === 1) {
      return toMainSiteUrlWithQuery(
        mainSiteBaseUrl,
        "/ielts-academic.html",
        `?bypass=1&testMode=mock&module=academic&package=Lite&paper=1&attempt=${attemptType}&profile=${encodedCandidateBridgeProfile}${freeMockAuthQuery}`
      );
    }

    if (paper === 2) {
      return toMainSiteUrlWithQuery(
        mainSiteBaseUrl,
        "/ielts-academic.html",
        `?bypass=1&testMode=mock&module=academic&package=Lite&paper=1&attempt=${attemptType}&profile=${encodedCandidateBridgeProfile}${freeMockAuthQuery}`
      );
    }

    if (paper === 3) {
      return toMainSiteUrlWithQuery(
        mainSiteBaseUrl,
        "/ielts-academic-basic-paper1.html",
        `?bypass=1&testMode=mock&module=academic&package=Basic&paper=1&attempt=${attemptType}&profile=${encodedCandidateBridgeProfile}${freeMockAuthQuery}`
      );
    }

    return toMainSiteUrlWithQuery(
      mainSiteBaseUrl,
      "/ielts-academic.html",
      `?bypass=1&testMode=mock&module=academic&paper=${paper}&attempt=${attemptType}&profile=${encodedCandidateBridgeProfile}${freeMockAuthQuery}`
    );
  };
  const bookedPapers = new Set<number>();
  if (usingLive) {
    liveOverview.payments
      .filter((payment) => String(payment.status || "").toLowerCase() === "paid" && payment.verified !== false)
      .forEach((payment) => {
        const paper = Math.max(1, Math.min(10, Number(payment.paper) || 0));
        if (paper) bookedPapers.add(paper);
      });
  }
  const completedSlotAttempts = new Map<number, Set<"initial" | "retake">>();
  const retakeAttemptIdsByPaper = new Map<number, Set<string>>();
  if (usingLive) {
    liveOverview.results
      .forEach((result) => {
        const paper = Math.max(1, Math.min(10, Number(result.paper) || 1));
        const attemptType = String(result.attemptType || "").toLowerCase() === "retake" ? "retake" : "initial";
        const attempts = completedSlotAttempts.get(paper) || new Set<"initial" | "retake">();
        attempts.add(attemptType);
        completedSlotAttempts.set(paper, attempts);

        if (attemptType === "retake") {
          const attemptIds = retakeAttemptIdsByPaper.get(paper) || new Set<string>();
          const attemptId = String(result.attemptId || result.id || `${result.module || "module"}-${result.createdAt || ""}`);
          attemptIds.add(attemptId);
          retakeAttemptIdsByPaper.set(paper, attemptIds);
        }
      });
  }
  const paidRetakeEntitlementsByPaper = new Map<number, number>();
  if (usingLive) {
    liveOverview.payments
      .filter((payment) => String(payment.status || "").toLowerCase() === "paid" && payment.verified !== false && String(payment.purchaseType || "").toLowerCase() === "retake")
      .forEach((payment) => {
        const paper = Math.max(1, Math.min(10, Number(payment.paper) || 0));
        if (paper) {
          paidRetakeEntitlementsByPaper.set(paper, (paidRetakeEntitlementsByPaper.get(paper) || 0) + 1);
        }
      });
  }
  const nextBookingPaper = Array.from({ length: 10 }, (_, index) => index + 1)
    .find((paper) => !bookedPapers.has(paper)) || null;

  const startPayHerePayment = async (paper: number, purchaseType: "test" | "retake" = "test") => {
    const auth = readStoredAuth();
    if (!auth) {
      setBookingMessage("Please sign in to book a test.");
      return;
    }

    setBookingPaper(paper);
    setBookingMessage("");
    try {
      const orderRequest = fetch(getPayHereOrderUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, paper, purchaseType }),
      });
      const [response] = await Promise.all([orderRequest, loadPayHereScript()]);
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        payment?: PayHerePayment;
      };
      if (!response.ok || !data.payment) {
        throw new Error(data.error || "Unable to start PayHere payment.");
      }

      if (!window.payhere) throw new Error("PayHere did not load.");

      window.payhere.onCompleted = (orderId) => {
        setBookingPaper(null);
        setBookingMessage("Confirming your payment with PayHere...");
        void (async () => {
          const auth = readStoredAuth();
          if (!auth) return;

          for (const delayMs of [1000, 2000, 4000, 8000]) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
            try {
              const { response, data } = await loadMainPortalLiveOverview(auth);
              const overview = normalizeBridgeResponse(response, data);
              if (!overview) continue;

              setLiveBridgeState(overview, setLiveOverview, setLiveMode);
              const paymentConfirmed = overview.payments.some((payment) =>
                String(payment.orderId || "") === orderId &&
                String(payment.status || "").toLowerCase() === "paid" &&
                payment.verified !== false
              );
              if (paymentConfirmed) {
                setBookingMessage(purchaseType === "retake" ? "Payment confirmed. Your retake is now ready." : "Payment confirmed. Your test is now ready to take.");
                return;
              }
            } catch {
              // The visible confirmation message is retained while the next verification attempt runs.
            }
          }
          setBookingMessage("Payment was submitted. Your booked test will unlock once PayHere confirms the payment.");
        })();
      };
      window.payhere.onDismissed = () => {
        setBookingPaper(null);
        setBookingMessage("Payment was cancelled.");
      };
      window.payhere.onError = (error) => {
        setBookingPaper(null);
        setBookingMessage(`PayHere error: ${error}`);
      };
      window.payhere.startPayment(data.payment);
    } catch (error) {
      setBookingPaper(null);
      setBookingMessage(error instanceof Error ? error.message : "Unable to start PayHere payment.");
    }
  };

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
              <p className="mt-1 max-w-[9ch] text-[0.88rem] leading-5 text-slate-100">Completed sections</p>
            </div>
            <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm xl:min-h-[92px]">
              <p className="text-[2rem] font-bold leading-none text-white">{summaryRemainingTests}</p>
              <p className="mt-1 max-w-[9ch] text-[0.88rem] leading-5 text-slate-100">Remaining tests</p>
            </div>
            <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm xl:min-h-[92px]">
              <p className="text-[2rem] font-bold leading-none text-white">{summaryOverallBand}</p>
              <p className="mt-1 max-w-[8ch] text-[0.88rem] leading-5 text-slate-100">Current overall band</p>
            </div>
            <button
              type="button"
              onClick={logOut}
              className="flex items-center justify-center rounded-[12px] border-2 border-white bg-white px-3 py-2 text-lg font-black uppercase tracking-[0.08em] !text-[#DA2C43] shadow-[0_18px_32px_rgba(15,23,43,0.18)] hover:bg-[#fff5f7] sm:col-span-2 xl:col-span-2 xl:min-h-[54px]"
            >
              Log Out
            </button>
            <div className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-sm sm:col-span-2 xl:col-span-2 xl:min-h-[54px]">
              <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-slate-200">Last Activity</p>
              <p className="mt-1 text-[1.06rem] font-bold leading-tight text-white">{summaryLastActivityLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="tests-taken" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardCard title={<span className="text-lg font-bold text-[#DA2C43]">Tests Taken</span>}>
          {usingLive ? (
            !latestPaperAttemptSummaries ? (
              <p className="text-xs text-slate-600">No published live results yet.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto pr-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#DA2C43]">
                    {String(latestPaperAttemptSummaries.paper).padStart(2, "0")} Test
                  </p>
                  <p className="text-[11px] font-semibold text-slate-500">Latest test taken</p>
                </div>
                <ul className="space-y-3">
                  {latestPaperAttemptSummaries.attempts.map((attempt) => {
                    const labels = ["First", "Second", "Third", "Fourth"];
                    const attemptLabel = labels[attempt.attemptNumber - 1] || `${attempt.attemptNumber}th`;
                    return (
                      <li key={attempt.key} className="rounded-md border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[17px] font-bold text-slate-900">
                              {String(latestPaperAttemptSummaries.paper).padStart(2, "0")} Test {attemptLabel} Attempt
                            </p>
                            <p className="mt-1 text-[14px] text-slate-600">{renderComponentLabel("Listening")}: {renderBandValue(attempt.moduleBands.listening)}</p>
                            <p className="text-[14px] text-slate-600">{renderComponentLabel("Reading")}: {renderBandValue(attempt.moduleBands.reading)}</p>
                            <p className="text-[14px] text-slate-600">{renderComponentLabel("Writing")}: {attempt.pendingRelease && attempt.moduleBands.writing == null ? <span className="text-red-600 font-bold">wait (12h)</span> : renderBandValue(attempt.moduleBands.writing)}</p>
                            <p className="text-[14px] text-slate-600">{renderComponentLabel("Speaking")}: {
                              attempt.moduleBands.speaking != null
                                ? renderBandValue(attempt.moduleBands.speaking)
                                : attempt.speakingBookingStatus === "booked"
                                  ? <span className="font-bold text-blue-600">Booked</span>
                                  : attempt.speakingBookingStatus === "completed"
                                    ? <span className="text-red-600 font-bold">wait (48h)</span>
                                    : renderNotAvailableValue()
                            }</p>
                            <p className="mt-1 text-[14px] text-slate-600">Updated: {formatShortDateTime(attempt.updatedAt || "")}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[15px] font-bold text-blue-600">Overall</p>
                            <p className="text-[17px] font-bold text-blue-600">
                              {attempt.overallBand == null
                                ? attempt.pendingRelease
                                  ? <span className="text-red-600">wait</span>
                                  : attempt.speakingBookingStatus === "booked"
                                    ? <span className="text-blue-600">Booked</span>
                                    : attempt.speakingBookingStatus === "completed"
                                      ? <span className="text-red-600">wait (48h)</span>
                                      : "—"
                                : `Band ${Number(attempt.overallBand).toFixed(1)}`}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
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
              const latestCompletedWriting = [...liveOverview.results]
                .filter((result) => String(result.module || "").trim().toLowerCase() === "writing")
                .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))[0];
              const completedPaperNumber = Number(latestCompletedWriting?.paper) || 0;
              const completedPaper = completedPaperNumber >= 1 && completedPaperNumber <= 10 ? completedPaperNumber : 0;
              const speakingTest = completedPaper ? `${String(completedPaper).padStart(2, "0")} Test` : "-";
              const speakingAllocated = Number(liveOverview.progress.speakingSlotsAllocated || 0) || 0;
              const speakingBooked = Number(liveOverview.progress.speakingSlotsBooked || 0) || 0;
              const speakingCompleted = Number(liveOverview.progress.speakingSlotsCompleted || 0) || 0;
              const speakingRemaining = Number(liveOverview.progress.speakingSlotsRemaining || 0) || 0;
              const speakingRowsRaw = Array.isArray(liveOverview.speakingBookings)
                ? liveOverview.speakingBookings
                : liveOverview.speakingAvailability.map((slot) => ({
                    id: slot.id,
                    slotId: slot.id,
                    packageName: "",
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
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2"><span className="font-semibold text-slate-700">Test:</span> {speakingTest}</div>
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
                        const packageTestLabel = String(slot.packageName || "").trim();
                        const slotTestLabel = /^\d{1,2} Test$/i.test(packageTestLabel) ? packageTestLabel : speakingTest;
                        const joinState = getSpeakingJoinState(slot, clockNowMs, slotTestLabel);
                        const statusLabel = joinState.statusLabel;
                        const statusTone = statusLabel === "Completed"
                          ? "text-emerald-700"
                          : statusLabel === "Incomplete"
                            ? "text-red-700"
                            : status === "booked"
                            ? "text-red-600"
                            : "text-blue-600";
                        const isCompleting = completingSpeakingSlotId === String(slot.slotId || slot.id || "");

                        return (
                          <li key={slot.id || `${slot.examinerName}-${slot.startTs}`} className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[15px] font-bold text-slate-900">Speaking Session · {slotTestLabel}</p>
                                <p className="mt-0.5 text-xs text-slate-600">{slot.examinerName || "Examiner"} · {slot.durationMinutes || 0} min</p>
                              </div>
                              <span className={`rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold ${statusTone}`}>{statusLabel}</span>
                            </div>
                            <div className="mt-3 rounded-lg border border-[#DA2C43]/20 bg-[#FFF5F6] px-3 py-2.5">
                              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#B81F36]">Speaking date and time</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{formatSriLankaDateTime(slot.startTs || "")}</p>
                            </div>
                            <div className="mt-3">
                              {joinState.disabled ? (
                                <button type="button" disabled className={joinState.className}>
                                  {joinState.label}
                                </button>
                              ) : (
                                <a
                                  href={joinState.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={joinState.className}
                                  onClick={() => {
                                    void completeSpeakingSession(String(slot.slotId || slot.id || ""));
                                  }}
                                >
                                  {isCompleting ? "Joining..." : joinState.label}
                                </a>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {speakingActionMessage ? <p className="text-xs font-semibold text-red-700">{speakingActionMessage}</p> : null}
                </div>
              );
            })()
          ) : (
            <p className="text-xs text-slate-600">Sign in to view your speaking session progress.</p>
          )}
        </DashboardCard>
      </section>

      <section
        aria-label="Action Hub"
        className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(218,44,67,0.08),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(21,93,252,0.08),_transparent_30%),linear-gradient(145deg,#ffffff_0%,#f6f8fc_100%)] p-4 shadow-[0_22px_55px_rgba(15,23,43,0.08)] sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#DA2C43]">Action Hub</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.8rem]">IELTS Academic</h2>
            <p className="mt-1 text-sm text-slate-600">Book a package, start a test, or pick up where you left off.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm">
            {selectedPackage ? `${selectedPackage} plan` : "10 test slots"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-4">
          <div className="w-full max-w-none rounded-[22px] border border-slate-200 bg-white/90 p-3 shadow-[0_8px_24px_rgba(15,23,43,0.05)] sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900">Your test slots</h3>
                <p className="mt-1 text-base font-extrabold tracking-tight text-[#DA2C43]">Please read the instructions below carefully before taking your test.</p>
                <p className="mt-1 text-base text-slate-500">Choose an action for each test.</p>
              </div>
              <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-base font-bold text-[#DA2C43]">01—10</span>
            </div>

            <div className="space-y-1.5">
              {bookingMessage && (
                <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700" role="status">
                  {bookingMessage}
                </p>
              )}
              {Array.from({ length: 10 }, (_, index) => {
                const paper = index + 1;
                const testLabel = `${String(paper).padStart(2, "0")} Test`;
                const attempts = completedSlotAttempts.get(paper);
                const initialCompleted = attempts?.has("initial") || false;
                const booked = bookedPapers.has(paper);
                const bookingAvailable = paper === 1 || completedSlotAttempts.get(paper - 1)?.has("initial");
                const canBook = bookingAvailable && !booked;
                const initialAvailable = booked && !initialCompleted;
                const retakeAttemptsTaken = retakeAttemptIdsByPaper.get(paper)?.size || 0;
                const paidRetakeEntitlements = paidRetakeEntitlementsByPaper.get(paper) || 0;
                const retakeAvailable = initialCompleted && retakeAttemptsTaken < 1 + paidRetakeEntitlements;
                const canPurchaseRetake = initialCompleted && paidRetakeEntitlements < MAX_PAID_RETAKES_PER_TEST && retakeAttemptsTaken >= 1 + paidRetakeEntitlements;
                const paidRetakeLimitReached = paidRetakeEntitlements >= MAX_PAID_RETAKES_PER_TEST && !retakeAvailable;
                const initialUrl = testEntryUrl(paper, "initial");
                const retakeUrl = testEntryUrl(paper, "retake");

                return (
                  <div
                    key={paper}
                    className="grid grid-cols-[minmax(100px,1fr)_minmax(160px,1.5fr)_minmax(94px,0.85fr)_repeat(2,minmax(150px,1.45fr))_minmax(140px,1.35fr)_minmax(160px,1.5fr)] gap-1.5 rounded-xl border border-slate-100 bg-slate-50/80 p-1.5 transition hover:border-slate-200 hover:bg-white sm:gap-2"
                  >
                    <p className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-center text-base font-extrabold tracking-tight text-white shadow-sm shadow-emerald-900/15 sm:text-lg">{testLabel}</p>
                    <button
                      type="button"
                      disabled={bookingPaper !== null || booked}
                      onClick={() => {
                        if (canBook) {
                          void startPayHerePayment(paper);
                          return;
                        }
                        setBookingGuidancePaper(paper);
                      }}
                      className={`rounded-lg border px-1 py-2 text-center text-[18px] leading-tight transition focus-visible:outline-none focus-visible:ring-2 ${booked ? "cursor-default border-slate-300 bg-slate-200 font-bold text-slate-900 shadow-sm shadow-slate-300/40 disabled:cursor-default disabled:bg-slate-200 disabled:text-slate-900 disabled:opacity-100" : "border-slate-200 bg-white font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"}`}
                      aria-label={`Book ${testLabel}`}
                    >
                      {booked ? "Test Booked" : bookingPaper === paper ? "Opening PayHere..." : "Book the Test"}
                    </button>
                    <p className="min-w-0 text-center text-sm font-bold leading-tight text-slate-900" aria-label={`${testLabel} price: $23.00 ${testPriceLkrLabel}`}>
                      <span className="block">$23.00</span>
                      <span className="block text-xs font-medium text-slate-600">{testPriceLkrLabel}</span>
                    </p>
                    <a
                      href={initialUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={!initialAvailable}
                      tabIndex={!initialAvailable ? -1 : undefined}
                      onClick={(event) => {
                        if (!initialAvailable) event.preventDefault();
                      }}
                      className={`rounded-lg px-1 py-2 text-center text-[18px] font-bold leading-tight transition focus-visible:outline-none focus-visible:ring-2 ${initialAvailable ? "bg-[#DA2C43] text-white shadow-sm shadow-rose-900/10 hover:-translate-y-0.5 hover:bg-[#b81f36] focus-visible:ring-rose-500" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}
                      aria-label={`Take ${testLabel} now`}
                    >
                      {initialCompleted ? "Test Completed" : "Take the Test Now"}
                    </a>
                    <a
                      href={retakeUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={!retakeAvailable}
                      tabIndex={!retakeAvailable ? -1 : undefined}
                      onClick={(event) => {
                        if (!retakeAvailable) event.preventDefault();
                      }}
                      className={`rounded-lg border px-1 py-2 text-center text-[18px] leading-tight transition focus-visible:outline-none focus-visible:ring-2 ${retakeAvailable ? "border-[#DA2C43] bg-[#DA2C43] font-bold text-white shadow-sm shadow-rose-900/20 hover:-translate-y-0.5 hover:bg-[#b81f36] focus-visible:ring-rose-500" : "cursor-not-allowed border-slate-200 bg-slate-100 font-semibold text-slate-400"}`}
                      aria-label={`Retake ${testLabel}`}
                    >
                      {retakeAvailable ? "Retake Available" : retakeAttemptsTaken > 0 ? "Retake Completed" : "Retake the Test"}
                    </a>
                    <button
                      type="button"
                      disabled={booked}
                      onClick={() => {
                        setTokenPaper(paper);
                        setTokenCode("");
                        setTokenMessage("");
                      }}
                      className={`rounded-lg border px-1 py-2 text-center text-[18px] leading-tight transition focus-visible:outline-none focus-visible:ring-2 ${booked ? "cursor-default border-slate-300 bg-slate-200 font-bold text-slate-900 shadow-sm shadow-slate-300/40 disabled:cursor-default disabled:bg-slate-200 disabled:text-slate-900 disabled:opacity-100" : "border-indigo-200 bg-indigo-50 font-semibold text-indigo-800 hover:border-indigo-300 hover:bg-indigo-100 focus-visible:ring-indigo-500"}`}
                      aria-label={`Use a token for ${testLabel}`}
                    >
                      {booked ? "Test Booked" : "Use a Token"}
                    </button>
                    <button
                      type="button"
                      disabled={!canPurchaseRetake || bookingPaper !== null}
                      onClick={() => setRetakePurchasePaper(paper)}
                      className={`rounded-lg border px-1 py-1.5 text-center text-base leading-tight transition focus-visible:outline-none focus-visible:ring-2 ${canPurchaseRetake && bookingPaper === null ? "border-[#DA2C43] bg-[#DA2C43] font-bold text-white shadow-sm shadow-rose-900/20 hover:-translate-y-0.5 hover:bg-[#b81f36] focus-visible:ring-rose-500" : "cursor-not-allowed border-slate-200 bg-slate-100 font-semibold text-slate-400"}`}
                      aria-label={`Take ${testLabel} again for $2.00`}
                    >
                      {paidRetakeLimitReached ? (
                        <span className="block">Retake Limit Reached</span>
                      ) : (
                        <>
                          <span className="block">Take Test Again</span>
                          <span className="block text-sm font-bold">$2.00</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="max-w-[1064px] rounded-[22px] border border-slate-200 bg-white/90 p-5 shadow-[0_8px_24px_rgba(15,23,43,0.05)]">
            <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#DA2C43]">Candidate guidance</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Important Instructions for Taking the IELTS Test</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">Please read the following instructions carefully before starting your test.</p>

            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-700">
              <li>
                <span className="font-bold text-slate-900">Complete the Test Once You Start:</span> Once you begin the test, you must complete it. If you close the browser before completing the test, the system will mark the test as taken. You will then have only one additional attempt, called the <span className="font-bold">Retake</span>.
              </li>
              <li>
                <span className="font-bold text-slate-900">Secure Power and Network Connection:</span> Before starting, ensure that you have a stable power supply and internet connection. If power or network connectivity is lost, your test may not be completed and will be marked as taken. You will then have only the Retake attempt remaining.
              </li>
              <li>
                <span className="font-bold text-slate-900">Speaking Session in the Retake:</span> The Retake attempt does not include a Speaking session.
              </li>
              <li>
                <span className="font-bold text-slate-900">Booking the Speaking Session:</span> After completing the test, you can book your Speaking session. The booking option will appear after the Writing section. You can take the Speaking session only after 48 hours have passed from the time you took the test.
              </li>
              <li>
                <span className="font-bold text-slate-900">Book Your Speaking Session Carefully:</span> You must book your Speaking session through the available booking option. If you miss your booked session, you will lose that opportunity. Please ensure that you attend your session as scheduled.
              </li>
              <li>
                <span className="font-bold text-slate-900">Viewing Your Band Scores:</span>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li><span className="font-semibold">Listening and Reading:</span> Your band scores will be available immediately after you complete the test.</li>
                  <li><span className="font-semibold">Writing and Speaking:</span> Your band scores will be available within an additional 24–48 hours after the test is taken.</li>
                </ul>
              </li>
              <li>
                <span className="font-bold text-slate-900">Checking Your Final Results:</span> Your updated band scores will be displayed in the <span className="font-bold">Tests Taken</span> section of your account.
              </li>
            </ol>

            <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold leading-6 text-rose-800">
              Please follow these instructions carefully to avoid losing your test attempts or Speaking session opportunity.
            </p>
          </aside>
          </div>

        </div>
      </section>
      {bookingGuidancePaper != null && nextBookingPaper != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-guidance-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl"
          >
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#DA2C43]">Test booking sequence</p>
            <h2 id="booking-guidance-title" className="mt-2 text-2xl font-bold text-slate-900">
              Continue with Test {String(nextBookingPaper).padStart(2, "0")}
            </h2>
            <p className="mt-3 text-base leading-6 text-slate-600">
              Tests are released in sequence to support an organised learning journey. Please book Test {String(nextBookingPaper).padStart(2, "0")} before booking Test {String(bookingGuidancePaper).padStart(2, "0")}.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setBookingGuidancePaper(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => {
                  setBookingGuidancePaper(null);
                  void startPayHerePayment(nextBookingPaper);
                }}
                className="rounded-lg bg-[#DA2C43] px-4 py-2 font-bold text-white transition hover:bg-[#b81f36]"
              >
                Book Test {String(nextBookingPaper).padStart(2, "0")} now
              </button>
            </div>
          </section>
        </div>
      )}
      {retakePurchasePaper != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="retake-purchase-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl"
          >
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-violet-700">Retake entitlement</p>
            <h2 id="retake-purchase-title" className="mt-2 text-2xl font-bold text-slate-900">
              Take {String(retakePurchasePaper).padStart(2, "0")} Test Again
            </h2>
            <p className="mt-3 text-base leading-6 text-slate-600">
              Purchase one retake for $2.00 USD. Retakes include Listening, Reading, and Writing only; they do not include a Speaking test.
            </p>
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => {
                  const paper = retakePurchasePaper;
                  setRetakePurchasePaper(null);
                  void startPayHerePayment(paper, "retake");
                }}
                className="rounded-lg bg-violet-700 px-4 py-3 font-bold text-white transition hover:bg-violet-800"
              >
                Pay with Payment Gateway — $2.00
              </button>
              <button
                type="button"
                onClick={() => {
                  setRetakeTokenPaper(retakePurchasePaper);
                  setRetakePurchasePaper(null);
                  setRetakeTokenCode("");
                  setRetakeTokenMessage("");
                }}
                className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 font-bold text-violet-800 transition hover:bg-violet-100"
              >
                Use Your Retake Token
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRetakePurchasePaper(null)}
              className="mt-5 font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-900"
            >
              Not now
            </button>
          </section>
        </div>
      )}
      {retakeTokenPaper != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="retake-token-redemption-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-violet-700">Retake token</p>
            <h2 id="retake-token-redemption-title" className="mt-2 text-2xl font-bold text-slate-900">
              Activate {String(retakeTokenPaper).padStart(2, "0")} Test Retake
            </h2>
            <p className="mt-3 text-base leading-6 text-slate-600">
              Enter your $2.00 USD retake token. It can be used once and activates Listening, Reading, and Writing only.
            </p>
            <label className="mt-5 block text-sm font-bold text-slate-800" htmlFor="retake-token-code">Retake token code</label>
            <input
              id="retake-token-code"
              value={retakeTokenCode}
              onChange={(event) => setRetakeTokenCode(event.target.value)}
              autoComplete="off"
              disabled={redeemingRetakeToken}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
              placeholder="IELTS-RETAKE-..."
            />
            {retakeTokenMessage && <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">{retakeTokenMessage}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" disabled={redeemingRetakeToken} onClick={() => setRetakeTokenPaper(null)} className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
              <button type="button" disabled={redeemingRetakeToken} onClick={() => void redeemRetakeToken()} className="rounded-lg bg-violet-700 px-4 py-2 font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60">
                {redeemingRetakeToken ? "Redeeming..." : "Use Retake Token"}
              </button>
            </div>
          </section>
        </div>
      )}
      {tokenPaper != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="token-redemption-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-indigo-700">Test booking token</p>
            <h2 id="token-redemption-title" className="mt-2 text-2xl font-bold text-slate-900">
              Book {String(tokenPaper).padStart(2, "0")} Test with a token
            </h2>
            <p className="mt-3 text-base leading-6 text-slate-600">
              Enter the $23.00 USD ({usdLkrRate === null ? "LKR rate unavailable" : formatLkrAmount(23, usdLkrRate)}) token provided by your institution. It can be used only once and will be deactivated immediately after booking this test.
            </p>
            <label className="mt-5 block text-sm font-bold text-slate-800" htmlFor="test-token-code">
              Token code
            </label>
            <input
              id="test-token-code"
              value={tokenCode}
              onChange={(event) => setTokenCode(event.target.value)}
              autoComplete="off"
              disabled={redeemingToken}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100"
              placeholder="IELTS-RTK-..."
            />
            {tokenMessage && <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">{tokenMessage}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={redeemingToken}
                onClick={() => setTokenPaper(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={redeemingToken}
                onClick={() => void redeemToken()}
                className="rounded-lg bg-indigo-700 px-4 py-2 font-bold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {redeemingToken ? "Redeeming..." : "Use Token"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
