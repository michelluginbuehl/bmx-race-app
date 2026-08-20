import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "./db";
import RiderForm from "./components/RiderForm";
import { generateCategoryHeats, generateFinals } from "./race";
import HeatInput from "./components/HeatInput";
import AppHeader from "./components/AppHeader";
import ReleaseNotes from "./components/ReleaseNotes";
import { APP_CHANGE_NOTE, APP_NAME, APP_VERSION, DATA_SCHEMA_VERSION, STORAGE_KEYS } from "./config/appConfig";
import { appStorage, encodeStorageValue } from "./utils/storage";
import { createBackupEnvelope, getBackupSummary, normalizeManagedEventsForSchema, validateBackupStructure } from "./utils/backup";
import { createOnlineBackup, deactivatePublicLiveRace, getOnlineAppStateStatus, isOnlineStorageConfigured, listOnlineBackups, loadOnlineAppState, loadOnlineBackup, loadPublicLiveRace, loadPublicLiveRaceMeta, publishPublicLiveRace, saveOnlineAppState, setOnlineStorageAuthToken, type OnlineBackupListItem, type OnlineStorageStatus, type PublicLiveRaceMeta, type PublicLiveRacePayload } from "./utils/onlineStorage";
import { refreshFirebaseAuthSession, signInWithFirebaseEmailPassword, signOutFirebaseAuth, type FirebaseAuthSession } from "./utils/onlineAuth";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const ROW_HEIGHT = 30;
const BOX_MIN_HEIGHT = 8 * ROW_HEIGHT + 34;
const RACES = ["Race 1", "Race 2", "Race 3", "Race 4", "Race 5", "Race 6", "Race 7", "Race 8", "Race 9", "Race 10"] as const;
type RaceName = (typeof RACES)[number];

type ManagedEvent = {
  id: string;
  type: "series" | "single";
  name: string;
  year: number;
  createdAt: string;
  updatedAt?: string;
  archived?: boolean;
  archivedAt?: string;
  dataVersion?: number;
};

const BMX_AGE_CATEGORIES = [
  {
    minBoys: 0,
    maxBoys: 7,
    minGirls: 0,
    maxGirls: 8,
    label: "Boys bis 7 / Girls bis 8",
  },
  {
    minBoys: 8,
    maxBoys: 9,
    minGirls: 9,
    maxGirls: 10,
    label: "Boys 8 & 9 / Girls 9 & 10",
  },
  {
    minBoys: 10,
    maxBoys: 11,
    minGirls: 11,
    maxGirls: 12,
    label: "Boys 10 & 11 / Girls 11 & 12",
  },
  {
    minBoys: 12,
    maxBoys: 13,
    minGirls: 13,
    maxGirls: 14,
    label: "Boys 12 & 13 / Girls 13 & 14",
  },
  {
    minBoys: 14,
    maxBoys: 15,
    minGirls: 15,
    maxGirls: 16,
    label: "Boys 14 & 15 / Girls 15 & 16",
  },
  {
    minBoys: 16,
    maxBoys: 200,
    minGirls: 17,
    maxGirls: 200,
    label: "Boys 16+ / Girls 17+",
  },
] as const;

const CRUISER_CATEGORY = "Cruiser";
const PLAUSCH_CATEGORIES = ["Plausch 1", "Plausch 2", "Plausch 3"] as const;
const SPECIAL_CATEGORY_OPTIONS = [...PLAUSCH_CATEGORIES, CRUISER_CATEGORY] as const;
const BOYS_16_PLUS_CATEGORY = "Boys 16+ / Girls 17+";
const EVENT_LIST_KEY = STORAGE_KEYS.managedEvents;
const MAX_RIDERS_PER_RACE_CATEGORY = 32;
const SEMIFINAL_MIN_RIDERS = 20;
const FINAL_DISPLAY_ROUND_ORDER = [
  "Manuelle Rangliste",
  "Halbfinal 1",
  "Halbfinal 2",
  "D-Final",
  "C-Final",
  "B-Final",
  "A-Final",
] as const;
const FINAL_QUALIFYING_DISPLAY_ROUND_ORDER = [
  "Manuelle Rangliste",
  "Halbfinal 1",
  "Halbfinal 2",
  "D-Final",
  "C-Final",
  "B-Final",
] as const;
const FINAL_PRE_A_DISPLAY_ROUND_ORDER = [
  "Manuelle Rangliste",
  "D-Final",
  "C-Final",
  "B-Final",
] as const;
const RACE_RANKING_ROUND_ORDER = [
  "Manuelle Rangliste",
  "4. Vorlauf",
  "A-Final",
  "B-Final",
  "C-Final",
  "D-Final",
] as const;
const FINAL_RESULT_ROUND_NAMES = [
  "Manuelle Rangliste",
  "Halbfinal 1",
  "Halbfinal 2",
  "A-Final",
  "B-Final",
  "C-Final",
  "D-Final",
  "4. Vorlauf",
] as const;

const PUBLIC_LIVE_RACE_REFRESH_SECONDS = 30;
const PUBLIC_LIVE_STARTLIST_REFRESH_SECONDS = 3600;
const PUBLIC_LIVE_BACKGROUND_REFRESH_SECONDS = 300;

const publicLiveHasRaceProgram = (liveRace: any, meta?: PublicLiveRaceMeta | null): boolean => {
  if (meta?.hasRaceProgram === true || liveRace?.hasRaceProgram === true) return true;

  const hasMotos = Array.isArray(liveRace?.motos) && liveRace.motos.some((categoryBlock: any) =>
    Array.isArray(categoryBlock?.runs) && categoryBlock.runs.some((run: any) =>
      Array.isArray(run?.races) && run.races.length > 0,
    ),
  );
  const hasFinals = Array.isArray(liveRace?.finals) && liveRace.finals.some((categoryBlock: any) =>
    Array.isArray(categoryBlock?.rounds) && categoryBlock.rounds.length > 0,
  );

  return hasMotos || hasFinals;
};

const getPublicLiveRefreshSeconds = (liveRace: any, meta?: PublicLiveRaceMeta | null, tabVisible = true): number => {
  if (!tabVisible) return PUBLIC_LIVE_BACKGROUND_REFRESH_SECONDS;
  return publicLiveHasRaceProgram(liveRace, meta) ? PUBLIC_LIVE_RACE_REFRESH_SECONDS : PUBLIC_LIVE_STARTLIST_REFRESH_SECONDS;
};


export default function App() {
  const [selectedRace, setSelectedRace] = useState<RaceName>("Race 1");
  const [viewMode, setViewMode] = useState<
    "dashboard" | "participants" | "race" | "overall"
  >("dashboard");
  const [appShellView, setAppShellView] = useState<"events" | "manager" | "history" | "masterParticipants" | "guide" | "regulations" | "dataCheck">("events");
  const [managedEvents, setManagedEvents] = useState<ManagedEvent[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string>("");

  const [allRiders, setAllRiders] = useState<any[]>([]);
  const [masterParticipants, setMasterParticipants] = useState<any[]>([]);
  const [selectedMasterParticipant, setSelectedMasterParticipant] = useState<any | null>(null);
  const [lastEditedMasterParticipantId, setLastEditedMasterParticipantId] = useState<string>("");
  const [riders, setRiders] = useState<any[]>([]);
  const [heats, setHeats] = useState<any>({});
  const [results, setResults] = useState<any>({});
  const [finals, setFinals] = useState<any>({});
  const [finalResults, setFinalResults] = useState<any>({});

  const [editingRider, setEditingRider] = useState<any | null>(null);
  const participantFormRef = useRef<HTMLDivElement | null>(null);
  const participantRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [overallManualOrder, setOverallManualOrder] = useState<
    Record<string, string[]>
  >({});
  const [generatedOverallByCategory, setGeneratedOverallByCategory] = useState<
    Record<string, any[]>
  >({});
  const [finalManualOrder, setFinalManualOrder] = useState<
    Record<string, string[]>
  >({});
  const [cruiserMergeTarget, setCruiserMergeTarget] = useState<string>("");
  const [categoryMergeTargets, setCategoryMergeTargets] = useState<Record<string, string>>({});
  const [participantEventYear, setParticipantEventYear] = useState<string>(
    String(new Date().getFullYear()),
  );
  const [raceClosed, setRaceClosed] = useState(false);
  const [selectedRiderInfo, setSelectedRiderInfo] = useState<any | null>(null);
  const [raceNavigationOpen, setRaceNavigationOpen] = useState(false);
  const [activeRaceEntryKey, setActiveRaceEntryKey] = useState<string>("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [showEventCreateChoice, setShowEventCreateChoice] = useState(false);
  const [showArchivedEvents, setShowArchivedEvents] = useState(false);
  const [eventParticipantSearch, setEventParticipantSearch] = useState("");
  const [eventParticipantCategoryFilter, setEventParticipantCategoryFilter] = useState("all");
  const [showEventParticipantCreateForm, setShowEventParticipantCreateForm] = useState(false);
  const eventParticipantCreateKnownIdsRef = useRef<Set<string>>(new Set());
  const [masterParticipantSearch, setMasterParticipantSearch] = useState("");
  const [masterParticipantFilter, setMasterParticipantFilter] = useState<"active" | "trash" | "all">("active");
  const [masterParticipantDraftLookup, setMasterParticipantDraftLookup] = useState({ name: "", plate: "", birthYear: "", gender: "", club: "" });
  const [participantSpecialCategoryDraft, setParticipantSpecialCategoryDraft] = useState<string>("");
  const [participantSpecialCategoryDraftDirty, setParticipantSpecialCategoryDraftDirty] = useState(false);
  const [duplicateOkKeys, setDuplicateOkKeys] = useState<string[]>([]);
  const [showEmergencyTools, setShowEmergencyTools] = useState(false);
  const [lateAddParticipantValue, setLateAddParticipantValue] = useState("");
  const [selectedMasterParticipantKeys, setSelectedMasterParticipantKeys] = useState<string[]>([]);
  const [manualResultsMode, setManualResultsMode] = useState(false);
  const [manualResultOrder, setManualResultOrder] = useState<Record<string, string[]>>({});
  const [eventTileCounts, setEventTileCounts] = useState<Record<string, { total: number; races: Record<string, number> }>>({});
  const [participantQuickFilter, setParticipantQuickFilter] = useState<
    "all" | "selectedRace" | "notSelectedRace" | "missing" | "duplicates" | "cruiser" | "plausch"
  >("all");
  const [changeLog, setChangeLog] = useState<string[]>([]);
  const [changeLogFilter, setChangeLogFilter] = useState<string>("Alle");
  const [overallLocked, setOverallLocked] = useState(false);
  const [overallCreatedAt, setOverallCreatedAt] = useState("");
  const [backupHistory, setBackupHistory] = useState<any[]>([]);
  const [lastSaveAt, setLastSaveAt] = useState("");
  const [seriesRaceCount, setSeriesRaceCount] = useState<number>(4);
  const [overallCountingRaces, setOverallCountingRaces] = useState<number>(3);
  const [seriesLocked, setSeriesLocked] = useState(false);
  const [seriesTemplates, setSeriesTemplates] = useState<any[]>([]);

  const [eventSeries, setEventSeries] = useState("");
  const [homeEventSeries, setHomeEventSeries] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLogo, setEventLogo] = useState<string>("");
  const [backupMessage, setBackupMessage] = useState("");
  const [onlineStorageMessage, setOnlineStorageMessage] = useState("");
  const [lastOnlineSaveAt, setLastOnlineSaveAt] = useState("");
  const [onlineStatus, setOnlineStatus] = useState<OnlineStorageStatus | null>(null);
  const [onlineStatusCheckedAt, setOnlineStatusCheckedAt] = useState("");
  const [onlineBackups, setOnlineBackups] = useState<OnlineBackupListItem[]>([]);
  const [selectedOnlineBackupId, setSelectedOnlineBackupId] = useState("");
  const [onlineStatusLoading, setOnlineStatusLoading] = useState(false);
  const [showAdvancedStorageOptions, setShowAdvancedStorageOptions] = useState(false);
  const [firebaseAuthSession, setFirebaseAuthSession] = useState<FirebaseAuthSession | null>(null);
  const [firebaseAuthEmail, setFirebaseAuthEmail] = useState("");
  const [firebaseAuthPassword, setFirebaseAuthPassword] = useState("");
  const [firebaseAuthLoading, setFirebaseAuthLoading] = useState(false);
  const [firebaseAuthMessage, setFirebaseAuthMessage] = useState("");
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loadedRace, setLoadedRace] = useState<RaceName | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastIntegrityCheckAt, setLastIntegrityCheckAt] = useState("");
  const [dataCheckIssues, setDataCheckIssues] = useState<Array<{ level: "info" | "warning" | "error"; title: string; detail: string; repairable?: boolean }>>([]);
  const [dataCheckRunning, setDataCheckRunning] = useState(false);
  const [dataRepairMessage, setDataRepairMessage] = useState("");
  const [isPublicLiveView, setIsPublicLiveView] = useState(() => typeof window !== "undefined" && window.location.hash.toLowerCase() === "#live");
  const [publicLiveRace, setPublicLiveRace] = useState<PublicLiveRacePayload | null>(null);
  const [publicLiveMeta, setPublicLiveMeta] = useState<PublicLiveRaceMeta | null>(null);
  const [publicLiveLoading, setPublicLiveLoading] = useState(false);
  const [publicLiveMessage, setPublicLiveMessage] = useState("");
  const [publicLiveCheckedAt, setPublicLiveCheckedAt] = useState("");
  const [publicLiveFullLoadedAt, setPublicLiveFullLoadedAt] = useState("");
  const [publicLiveTabVisible, setPublicLiveTabVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const [publicLiveSearch, setPublicLiveSearch] = useState("");
  const [publicLiveCategoryFilter, setPublicLiveCategoryFilter] = useState("all");
  const [publicLiveMyRiderQuery, setPublicLiveMyRiderQuery] = useState("");
  const publicLiveTvMode = false;
  const [deviceName, setDeviceName] = useState(() => appStorage.getItem("bmx_device_name") || "");
  const [saveConflictMessage, setSaveConflictMessage] = useState("");
  const [adminLiveRace, setAdminLiveRace] = useState<PublicLiveRacePayload | null>(null);
  const [liveRaceMessage, setLiveRaceMessage] = useState("");
  const [liveRaceLoading, setLiveRaceLoading] = useState(false);
  const liveAutoPublishInProgressRef = useRef(false);
  const liveAutoPublishCallbackRef = useRef<() => Promise<void>>(async () => undefined);

  const colors: Record<string, string> = {
    pageBg: "#eef3f7",
    pageGradient: "linear-gradient(180deg, #eef6ff 0%, #f6f8fb 42%, #eef3f7 100%)",
    cardBg: "#ffffff",
    cardSoftBg: "#f8fbff",
    cardBorder: "#d8e1ea",
    cardBorderStrong: "#b9c7d6",
    title: "#172033",
    text: "#283545",
    muted: "#6d7b8a",
    blueBtn: "#2563eb",
    blueBtnDark: "#1d4ed8",
    blueBorder: "#93c5fd",
    greenBtn: "#16a34a",
    redBtn: "#dc2626",
    orangeBtn: "#f59e0b",
    yellowBtn: "#facc15",
    grayBtn: "#e9eef5",
    grayBtnText: "#273445",
    finalA: "#fff1b8",
    finalABorder: "#d7a800",
    finalB: "#e8f1ff",
    finalBBorder: "#7da7f7",
    finalC: "#f3e8ff",
    finalCBorder: "#b290f5",
    fourthMotoBg: "#e7fff3",
    fourthMotoBorder: "#46b97a",
    goldBg: "#fff4bf",
    goldBorder: "#d4a500",
    silverBg: "#f1f3f5",
    silverBorder: "#9aa4ad",
    bronzeBg: "#f7dfcf",
    bronzeBorder: "#b87333",
    successBg: "#e8f8ef",
    successBorder: "#91d7aa",
    greenBg: "#e8f8ef",
    greenBorder: "#91d7aa",
    warningBg: "#fff7e6",
    warningBorder: "#f0b429",
    dangerBg: "#fff1f1",
    dangerBorder: "#f2b8b5",
    tableHeadBg: "#edf4fb",
    tableRowAlt: "#f8fbff",
  };

  const raceKeyMap = Object.fromEntries(
    RACES.map((race, index) => [race, `race${index + 1}`]),
  ) as Record<RaceName, string>;

  const activeRaces = useMemo(() => {
    const currentEvent = managedEvents.find((event) => event.id === currentEventId) || null;
    const count = currentEvent?.type === "single" ? 1 : Math.max(1, Math.min(10, seriesRaceCount));
    return RACES.slice(0, count) as RaceName[];
  }, [seriesRaceCount, managedEvents, currentEventId]);

  const isSingleEvent = useMemo(
    () => (managedEvents.find((event) => event.id === currentEventId) || null)?.type === "single",
    [managedEvents, currentEventId],
  );


  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateLiveRoute = () => setIsPublicLiveView(window.location.hash.toLowerCase() === "#live");
    updateLiveRoute();
    window.addEventListener("hashchange", updateLiveRoute);
    return () => window.removeEventListener("hashchange", updateLiveRoute);
  }, []);

  useEffect(() => {
    if (!deviceName.trim()) return;
    appStorage.setItem("bmx_device_name", deviceName.trim());
  }, [deviceName]);


  const getRiderGenderCode = (rider: any) => {
    const value = String(rider?.gender || rider?.geschlecht || "")
      .trim()
      .toLowerCase();
    if (
      [
        "g",
        "girl",
        "girls",
        "w",
        "weiblich",
        "f",
        "female",
        "mädchen",
        "maedchen",
      ].includes(value)
    )
      return "G";
    if (
      [
        "b",
        "boy",
        "boys",
        "m",
        "männlich",
        "maennlich",
        "male",
        "knabe",
      ].includes(value)
    )
      return "B";
    return "";
  };

  const getRiderBirthYear = (rider: any) => {
    const value = Number(
      rider?.birthYear ||
        rider?.jahrgang ||
        rider?.year ||
        rider?.geburtsjahr ||
        0,
    );
    return Number.isFinite(value) && value > 1900 ? value : 0;
  };

  const getRiderAge = (rider: any) => {
    const eventYear = Number(participantEventYear);
    const birthYear = getRiderBirthYear(rider);
    if (!Number.isFinite(eventYear) || !birthYear) return null;
    return eventYear - birthYear;
  };

  const isPlauschCategory = (category: any) =>
    PLAUSCH_CATEGORIES.includes(String(category || "").trim() as any);

  const normalizeSpecialCategoryValue = (value: any) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const lower = text.toLowerCase();
    const plausch = PLAUSCH_CATEGORIES.find((category) => category.toLowerCase() === lower);
    if (plausch) return plausch;
    if (lower.includes("cruiser")) return CRUISER_CATEGORY;
    return "";
  };

  const getSpecialCategoryValue = (rider: any) => {
    const explicit = normalizeSpecialCategoryValue(rider?.specialCategory || rider?.plauschCategory);
    if (explicit) return explicit;
    const category = normalizeSpecialCategoryValue(rider?.category);
    if (category) return category;
    if (rider?.cruiser || rider?.isCruiser) return CRUISER_CATEGORY;
    return "";
  };

  const getDerivedCategory = (rider: any) => {
    const specialCategory = getSpecialCategoryValue(rider);
    if (specialCategory) return specialCategory;

    const gender = getRiderGenderCode(rider);
    const age = getRiderAge(rider);

    if (age !== null && age >= 0 && gender) {
      const found = BMX_AGE_CATEGORIES.find((cat) =>
        gender === "G"
          ? age >= cat.minGirls && age <= cat.maxGirls
          : age >= cat.minBoys && age <= cat.maxBoys,
      );
      if (found) return found.label;
    }

    return rider?.category || "Ohne Kategorie";
  };

  const normalizeRider = (rider: any) => ({
    ...rider,
    ...getRiderIdentityPatch(rider),
    birthYear: getRiderBirthYear(rider) || rider?.birthYear || "",
    gender: getRiderGenderCode(rider) || rider?.gender || "",
    category: getDerivedCategory(rider),
  });

  const getRiderMetaLabel = (rider: any) => {
    const birthYear = getRiderBirthYear(rider);
    const gender = getRiderGenderCode(rider);
    return [birthYear || "-", gender || "-"].join(" | ");
  };

  const getCategorySortValue = (category: string) => {
    const normalizedSpecial = normalizeSpecialCategoryValue(category);
    if (isPlauschCategory(normalizedSpecial)) {
      return -100 + PLAUSCH_CATEGORIES.indexOf(normalizedSpecial as any);
    }
    const fixedIndex = BMX_AGE_CATEGORIES.findIndex(
      (cat) => cat.label === category,
    );
    if (normalizedSpecial === CRUISER_CATEGORY) {
      const boys16Index = BMX_AGE_CATEGORIES.findIndex((cat) => cat.label === BOYS_16_PLUS_CATEGORY);
      return (boys16Index >= 0 ? boys16Index * 10 : 50) - 1;
    }
    if (fixedIndex >= 0) return fixedIndex * 10;
    const numbers = String(category || "").match(/\d+/g);
    if (!numbers || numbers.length === 0) return 5000;
    return Number(numbers[0]);
  };

  const sortCategories = (categories: string[]) =>
    [...categories].sort((a, b) => {
      const valueDiff = getCategorySortValue(a) - getCategorySortValue(b);
      if (valueDiff !== 0) return valueDiff;
      return String(a).localeCompare(String(b), "de-CH", { numeric: true });
    });

  const sortRidersByCategoryAndName = (items: any[]) =>
    [...items].sort((a: any, b: any) => {
      const ordered = sortCategories([a.category, b.category]);
      if (ordered[0] !== ordered[1]) {
        if (ordered[0] === a.category) return -1;
        if (ordered[0] === b.category) return 1;
      }
      return String(a.name).localeCompare(String(b.name), "de-CH", {
        numeric: true,
      });
    });

  const scrollToSection = (id: string, block: ScrollLogicalPosition = "start") => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block });
  };

  const addChangeLog = (text: string) => {
    const time = new Date().toLocaleTimeString("de-CH", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setChangeLog((prev) => [`${time} ${text}`, ...prev].slice(0, 80));
  };

  const getStatusBadgeStyle = (status: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      padding: "7px 12px",
      fontSize: 13,
      fontWeight: 950,
      border: "1px solid transparent",
      whiteSpace: "nowrap",
      letterSpacing: "0.01em",
      lineHeight: 1.1,
    };
    const normalized = String(status || "").toLowerCase();
    if (normalized.includes("abgeschlossen") || normalized.includes("offiziell")) {
      return { ...base, background: colors.successBg, color: "#166534", borderColor: colors.successBorder };
    }
    if (normalized.includes("resultate")) {
      return { ...base, background: "#e8f1ff", color: colors.blueBtnDark, borderColor: "#acc8ff" };
    }
    if (normalized.includes("final")) {
      return { ...base, background: "#f3e8ff", color: "#6d28d9", borderColor: "#c4b5fd" };
    }
    if (normalized.includes("vorlauf")) {
      return { ...base, background: "#eef4ff", color: colors.blueBtn, borderColor: "#bfd2ff" };
    }
    if (normalized.includes("archiv")) {
      return { ...base, background: "#e5e7eb", color: "#374151", borderColor: "#cbd5e1" };
    }
    if (normalized.includes("serie") || normalized.includes("einzel")) {
      return { ...base, background: "#eef4ff", color: colors.blueBtnDark, borderColor: "#bfd2ff" };
    }
    return { ...base, background: "#f1f4f7", color: colors.muted, borderColor: colors.cardBorder };
  };

  const getRiderSearchText = (r: any) =>
    `${r.name || ""} ${r.plate || ""} ${r.club || ""} ${r.category || ""} ${getRiderMetaLabel(r)}`.toLowerCase();

  const matchesGlobalSearch = (r: any) => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return true;
    return getRiderSearchText(r).includes(query);
  };

  const normalizeParticipantName = (value: string) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const getSortedNameKey = (value: string) =>
    normalizeParticipantName(value).split(" ").filter(Boolean).sort().join(" ");

  const getLevenshteinDistance = (a: string, b: string) => {
    const s1 = normalizeParticipantName(a);
    const s2 = normalizeParticipantName(b);
    if (!s1 || !s2) return Math.max(s1.length, s2.length);
    const prev = Array.from({ length: s2.length + 1 }, (_, i) => i);
    for (let i = 1; i <= s1.length; i += 1) {
      const curr = [i];
      for (let j = 1; j <= s2.length; j += 1) {
        curr[j] = Math.min(
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + (s1[i - 1] === s2[j - 1] ? 0 : 1),
        );
      }
      for (let j = 0; j < prev.length; j += 1) prev[j] = curr[j];
    }
    return prev[s2.length];
  };

  const areLikelyDuplicateParticipants = (a: any, b: any) => {
    const sameMeta = String(a.birthYear || "") === String(b.birthYear || "") && String(a.gender || "") === String(b.gender || "");
    const samePlate = String(a.plate || "").trim() && String(a.plate || "").trim() === String(b.plate || "").trim();
    const nameA = normalizeParticipantName(a.name || "");
    const nameB = normalizeParticipantName(b.name || "");
    const sortedA = getSortedNameKey(a.name || "");
    const sortedB = getSortedNameKey(b.name || "");
    const distance = getLevenshteinDistance(nameA, nameB);
    if (samePlate && sameMeta) return true;
    if (sameMeta && sortedA && sortedA === sortedB) return true;
    if (sameMeta && Math.max(nameA.length, nameB.length) >= 6 && distance <= 2) return true;
    return false;
  };

  const duplicateGroupPalette = [
    { bg: "#fff7d6", border: "#f2b705", text: "#7c5600" },
    { bg: "#e8f1ff", border: "#7da7f7", text: "#1d4ed8" },
    { bg: "#f3e8ff", border: "#b290f5", text: "#6b21a8" },
    { bg: "#e7fff3", border: "#46b97a", text: "#047857" },
    { bg: "#fff1f1", border: "#f2b8b5", text: "#b91c1c" },
    { bg: "#e0f7fa", border: "#67c4d0", text: "#0e7490" },
  ];

  const getDuplicateMasterParticipantInfo = (items: any[]) => {
    const okKeys = new Set(duplicateOkKeys);
    const unconfirmed = items.filter((item: any) => !okKeys.has(String(item.key || "")));
    const parent = new Map<string, string>();
    const find = (key: string): string => {
      const current = parent.get(key) || key;
      if (current === key) return key;
      const root = find(current);
      parent.set(key, root);
      return root;
    };
    const union = (a: string, b: string) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent.set(rootB, rootA);
    };

    unconfirmed.forEach((item: any, index: number) => {
      const key = String(item.key || `${item.name}-${index}`);
      parent.set(key, key);
    });

    for (let i = 0; i < unconfirmed.length; i += 1) {
      for (let j = i + 1; j < unconfirmed.length; j += 1) {
        if (areLikelyDuplicateParticipants(unconfirmed[i], unconfirmed[j])) {
          const keyA = String(unconfirmed[i].key || `${unconfirmed[i].name}-${i}`);
          const keyB = String(unconfirmed[j].key || `${unconfirmed[j].name}-${j}`);
          union(keyA, keyB);
        }
      }
    }

    const grouped = new Map<string, string[]>();
    Array.from(parent.keys()).forEach((key) => {
      const root = find(key);
      const list = grouped.get(root) || [];
      list.push(key);
      grouped.set(root, list);
    });

    const keys = new Set<string>();
    const byKey: Record<string, { groupIndex: number; bg: string; border: string; text: string }> = {};
    let groupIndex = 0;
    Array.from(grouped.values()).filter((group) => group.length > 1).forEach((group) => {
      const palette = duplicateGroupPalette[groupIndex % duplicateGroupPalette.length];
      group.forEach((key) => {
        keys.add(key);
        byKey[key] = { groupIndex: groupIndex + 1, ...palette };
      });
      groupIndex += 1;
    });

    return { keys, byKey, groupCount: groupIndex };
  };

  const markMasterParticipantDuplicateOk = (key: string) => {
    const next = Array.from(new Set([...duplicateOkKeys, key]));
    setDuplicateOkKeys(next);
    appStorage.setItem(STORAGE_KEYS.duplicateOkKeys, JSON.stringify(next));
  };

  const getDuplicateMasterParticipantKeys = (items: any[]) => getDuplicateMasterParticipantInfo(items).keys;



  const globalSearchResults = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return [];
    return allRiders.filter((r: any) => getRiderSearchText(r).includes(query)).slice(0, 12);
  }, [allRiders, globalSearch]);


  const getRawManagedEvents = (): ManagedEvent[] => {
    try {
      const parsed = JSON.parse(appStorage.getItem(EVENT_LIST_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveManagedEvents = (events: ManagedEvent[]) => {
    const versionedEvents = normalizeManagedEventsForSchema(events);
    const sorted = [...versionedEvents].sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || (b.year || 0) - (a.year || 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
    appStorage.setItem(EVENT_LIST_KEY, JSON.stringify(sorted));
    setManagedEvents(sorted);
  };

  const scopedKeyForEvent = (eventId: string, key: string) => {
    if (!eventId || eventId === "legacy") return key;
    if (!key.startsWith("bmx_") || key.startsWith("bmx_event_")) return key;
    if (key === EVENT_LIST_KEY) return key;
    return `bmx_event_${eventId}_${key}`;
  };

  const scopedKey = (key: string) => scopedKeyForEvent(currentEventId, key);

  const getCurrentEvent = () => managedEvents.find((event) => event.id === currentEventId) || null;

  const getEventDisplayName = (event: ManagedEvent) => `${event.name || (event.type === "single" ? "Einzel Rennen" : "Rennserie")} · ${event.year}`;

  const resetCurrentEventState = () => {
    setSelectedRace("Race 1");
    setAllRiders([]);
    setRiders([]);
    setHeats({});
    setResults({});
    setFinals({});
    setFinalResults({});
    setEditingRider(null);
    setOverallManualOrder({});
    setGeneratedOverallByCategory({});
    setFinalManualOrder({});
    setCruiserMergeTarget("");
    setCategoryMergeTargets({});
    setRaceClosed(false);
    setSelectedRiderInfo(null);
    setRaceNavigationOpen(false);
    setChangeLog([]);
    setOverallLocked(false);
    setOverallCreatedAt("");
    setBackupHistory([]);
    setLastSaveAt("");
    setHomeEventSeries("");
    setEventSeries("");
    setEventLocation("");
    setEventDate("");
    setLoadedRace(null);
  };

  const writeInitialEventValue = (eventId: string, key: string, value: any) => {
    const storageKey = scopedKeyForEvent(eventId, key);
    appStorage.setItem(storageKey, encodeStorageValue(value));
  };

  const initializeManagedEventStorage = (event: ManagedEvent) => {
    const raceCount = event.type === "single" ? 1 : 4;
    const countingRaces = event.type === "single" ? 1 : 3;

    writeInitialEventValue(event.id, "bmx_selected_race", "Race 1");
    writeInitialEventValue(event.id, "bmx_home_event_series", event.name.trim());
    writeInitialEventValue(event.id, "bmx_participant_event_year", String(event.year || new Date().getFullYear()));
    writeInitialEventValue(event.id, "bmx_series_race_count", raceCount);
    writeInitialEventValue(event.id, "bmx_overall_counting_races", countingRaces);
    writeInitialEventValue(event.id, "bmx_series_locked", false);
    writeInitialEventValue(event.id, "bmx_overall_manual_order", {});
    writeInitialEventValue(event.id, "bmx_generated_overall", {});
    writeInitialEventValue(event.id, "bmx_overall_locked", false);
    writeInitialEventValue(event.id, "bmx_overall_created_at", "");
    writeInitialEventValue(event.id, "bmx_change_log", []);
    writeInitialEventValue(event.id, "bmx_backup_history", []);
    writeInitialEventValue(event.id, "bmx_last_save_at", "");

    RACES.forEach((race) => {
      const racePrefix = `bmx_${race.toLowerCase().replace(/\s+/g, "_")}`;
      writeInitialEventValue(event.id, `${racePrefix}_event_series`, "");
      writeInitialEventValue(event.id, `${racePrefix}_event_location`, "");
      writeInitialEventValue(event.id, `${racePrefix}_event_date`, "");
      writeInitialEventValue(event.id, `${racePrefix}_heats`, {});
      writeInitialEventValue(event.id, `${racePrefix}_results`, {});
      writeInitialEventValue(event.id, `${racePrefix}_finals`, {});
      writeInitialEventValue(event.id, `${racePrefix}_final_results`, {});
      writeInitialEventValue(event.id, `${racePrefix}_final_manual_order`, {});
      writeInitialEventValue(event.id, `${racePrefix}_cruiser_merge_target`, "");
      writeInitialEventValue(event.id, `${racePrefix}_category_merge_targets`, {});
      writeInitialEventValue(event.id, `${racePrefix}_race_closed`, false);
    });
  };

  const createManagedEvent = (type?: "series" | "single") => {
    let selectedType = type;
    if (!selectedType) {
      const choice = window.prompt('Was möchtest du erstellen?\n\n1 = Einzelrennen\n2 = Rennserie', '2');
      if (!choice) return;
      selectedType = choice.trim() === '1' ? 'single' : 'series';
    }

    const defaultName = selectedType === "single" ? "Einzelrennen" : "Neue Rennserie";
    const name = window.prompt(selectedType === "single" ? "Name des Einzelrennens" : "Name der Rennserie", defaultName);
    if (!name) return;
    const yearValue = window.prompt("Jahr", String(new Date().getFullYear()));
    const year = Math.max(2000, Math.min(2100, Number(yearValue) || new Date().getFullYear()));
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const nextEvent: ManagedEvent = { id, type: selectedType, name: name.trim(), year, createdAt, updatedAt: createdAt, dataVersion: DATA_SCHEMA_VERSION };
    initializeManagedEventStorage(nextEvent);
    const nextEvents = [...managedEvents, nextEvent];
    saveManagedEvents(nextEvents);
    openManagedEvent(nextEvent);
  };

  const renameManagedEvent = (event: ManagedEvent) => {
    const nextName = window.prompt("Name bearbeiten", event.name || "");
    if (!nextName || !nextName.trim()) return;
    const nextEvents = managedEvents.map((item) =>
      item.id === event.id ? { ...item, name: nextName.trim(), updatedAt: new Date().toISOString() } : item,
    );
    saveManagedEvents(nextEvents);
    appStorage.setItem(scopedKeyForEvent(event.id, "bmx_home_event_series"), JSON.stringify(nextName.trim()));
    if (currentEventId === event.id) setHomeEventSeries(nextName.trim());
  };

  const toggleManagedEventArchive = (event: ManagedEvent, archived: boolean) => {
    const message = archived
      ? `${event.name} archivieren? Das Rennen bleibt erhalten und wird auf der Startseite eingeklappt.`
      : `${event.name} wieder aktiv anzeigen?`;
    if (!window.confirm(message)) return;
    const nextEvents = managedEvents.map((item) =>
      item.id === event.id
        ? { ...item, archived, archivedAt: archived ? new Date().toISOString() : "", updatedAt: new Date().toISOString() }
        : item,
    );
    saveManagedEvents(nextEvents);
  };

  const deleteManagedEvent = async (event: ManagedEvent) => {
    const eventName = getEventDisplayName(event);
    if (
      !window.confirm(
        `${eventName} wirklich löschen?\n\nDas Rennen / die Rennserie wird von der Startseite entfernt. Alle zugehörigen Teilnehmer-Zuordnungen, Motos, Finals, Resultate und Einstellungen dieses Eintrags werden gelöscht.\n\nVor dem Löschen wird automatisch ein komplettes Backup erstellt.`,
      )
    )
      return;

    const deletedEventWasOpen = currentEventId === event.id;
    const eventKeyPrefix = `bmx_event_${event.id}_`;
    const nextEvents = managedEvents.filter((item) => item.id !== event.id);

    // Wichtig: Wenn das aktuell geöffnete Rennen gelöscht wird, zuerst die UI vom Event entkoppeln.
    // Dadurch rendert React nicht mehr mit einer Event-ID, deren Daten gerade entfernt werden.
    if (deletedEventWasOpen) {
      setInitialLoaded(false);
      setHasUnsavedChanges(false);
      setAppShellView("events");
      setViewMode("dashboard");
      resetCurrentEventState();
      setCurrentEventId("");
    }

    try {
      await exportBackup(`Sicherheitsbackup vor Löschen von ${eventName}`);
    } catch (error: any) {
      if (!window.confirm(`Das automatische Backup konnte nicht erstellt werden. Trotzdem löschen?\n\nFehler: ${error?.message || "Unbekannter Fehler"}`)) return;
    }

    saveManagedEvents(nextEvents);

    try {
      await db.transaction("rw", db.table("riders"), db.table("appData"), async () => {
        const allRiders = await db.table("riders").toArray();
        const riderIdsToDelete = allRiders
          .filter((rider: any) => String(rider.eventId || "") === String(event.id))
          .map((rider: any) => rider.id)
          .filter(Boolean);
        if (riderIdsToDelete.length > 0) {
          await db.table("riders").bulkDelete(riderIdsToDelete);
        }

        const allAppData = await db.table("appData").toArray();
        const appDataKeysToDelete = allAppData
          .filter((row: any) => String(row.key || "").startsWith(eventKeyPrefix))
          .map((row: any) => row.key)
          .filter(Boolean);
        if (appDataKeysToDelete.length > 0) {
          await db.table("appData").bulkDelete(appDataKeysToDelete);
        }
      });

      appStorage.keys().forEach((key) => {
        if (key.startsWith(eventKeyPrefix)) appStorage.removeItem(key);
      });
    } catch (error: any) {
      window.alert(`Rennen wurde aus der Startliste entfernt, aber beim Bereinigen der lokalen Daten ist ein Fehler aufgetreten: ${error?.message || "Unbekannter Fehler"}`);
    }

    if (deletedEventWasOpen) {
      setAllRiders([]);
      setRiders([]);
      setHeats({});
      setResults({});
      setFinals({});
      setFinalResults({});
      setOverallManualOrder({});
      setGeneratedOverallByCategory({});
    } else {
      await loadAllRiders();
      await loadRaceRiders();
    }
    await loadMasterParticipants();
    setBackupMessage(`Gelöscht: ${eventName}`);
  };

  const getFilteredManagedEvents = (archived: boolean) => {
    const query = eventSearch.trim().toLowerCase();
    return managedEvents.filter((event) => {
      if (!!event.archived !== archived) return false;
      if (!query) return true;
      return [event.name, event.year, event.type === "single" ? "Einzelrennen" : "Rennserie"]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  };

  const getEventGroupedByYearFrom = (events: ManagedEvent[]) => {
    const groups: Record<string, ManagedEvent[]> = {};
    events.forEach((event) => {
      const year = String(event.year || new Date(event.createdAt).getFullYear() || new Date().getFullYear());
      if (!groups[year]) groups[year] = [];
      groups[year].push(event);
    });
    return Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a))
      .map((year) => ({ year, events: groups[year].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) }));
  };

  const openManagedEvent = async (event: ManagedEvent) => {
    if (currentEventId && initialLoaded && hasUnsavedChanges) {
      const saved = await saveOnlineFullAppState();
      if (!saved) return;
    }
    setInitialLoaded(false);
    resetCurrentEventState();
    setCurrentEventId(event.id);
    setAppShellView("manager");
    setViewMode("dashboard");
  };

  const getEventGroupedByYear = () => getEventGroupedByYearFrom(getFilteredManagedEvents(false));

  const getArchivedEventGroupedByYear = () => getEventGroupedByYearFrom(getFilteredManagedEvents(true));

  const getEventHistoryEntries = () => {
    return managedEvents.map((event) => {
      const logs = JSON.parse(appStorage.getItem(scopedKeyForEvent(event.id, "bmx_change_log")) || "[]");
      const backups = JSON.parse(appStorage.getItem(scopedKeyForEvent(event.id, "bmx_backup_history")) || "[]");
      return { event, logs: Array.isArray(logs) ? logs : [], backups: Array.isArray(backups) ? backups : [] };
    });
  };


  const getEventStoragePrefix = (eventId: string) => `bmx_event_${eventId}_`;

  const getShortEventId = (event?: ManagedEvent | null) => {
    if (!event?.id) return "-";
    return String(event.id).slice(0, 8);
  };

  const getStoredValueForEvent = (eventId: string, key: string, fallback: any = null) => {
    try {
      const raw = appStorage.getItem(scopedKeyForEvent(eventId, key));
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const getManagedEventProgress = (event: ManagedEvent) => {
    const raceCount = getManagedEventRaceCount(event.id, event.type);
    let closed = 0;
    let withResults = 0;
    RACES.slice(0, raceCount).forEach((race) => {
      const prefix = `bmx_${race.toLowerCase().replace(/\s+/g, "_")}`;
      const isClosed = !!getStoredValueForEvent(event.id, `${prefix}_race_closed`, false);
      const raceResults = getStoredValueForEvent(event.id, `${prefix}_final_results`, {});
      const resultCount = raceResults && typeof raceResults === "object"
        ? Object.values(raceResults).reduce<number>((sum, value: any) => sum + (Array.isArray(value) ? value.length : 0), 0)
        : 0;
      if (isClosed) closed += 1;
      if (resultCount > 0) withResults += 1;
    });
    const percent = raceCount > 0 ? Math.round((closed / raceCount) * 100) : 0;
    return { raceCount, closed, withResults, percent };
  };

  const runDataIntegrityCheck = async () => {
    setDataCheckRunning(true);
    setDataRepairMessage("");
    try {
      const events = getRawManagedEvents();
      const eventIds = new Set(events.map((event) => String(event.id || "")).filter(Boolean));
      const ridersRaw = await db.table("riders").toArray();
      const appRows = await db.table("appData").toArray();
      const issues: Array<{ level: "info" | "warning" | "error"; title: string; detail: string; repairable?: boolean }> = [];

      const duplicateEventIds = events
        .map((event) => String(event.id || ""))
        .filter((id, index, array) => id && array.indexOf(id) !== index);
      if (duplicateEventIds.length) {
        issues.push({ level: "error", title: "Doppelte Rennen/Rennserien-IDs", detail: `Mehrfach vorhanden: ${Array.from(new Set(duplicateEventIds)).join(", ")}` });
      }

      events.forEach((event) => {
        if (!event.id || !event.name || !event.year) {
          issues.push({ level: "warning", title: "Unvollständige Rennen/Rennserie", detail: `${event.name || "Ohne Name"} hat fehlende Basisdaten.` });
        }
        if (event.type === "single") {
          const count = Number(getStoredValueForEvent(event.id, "bmx_series_race_count", 1));
          if (count !== 1) {
            issues.push({ level: "warning", title: "Einzelrennen mit falscher Race-Anzahl", detail: `${event.name}: Race-Anzahl wird auf 1 repariert.`, repairable: true });
          }
        }
      });

      const riderIds = ridersRaw.map((rider: any) => String(rider.id || "")).filter(Boolean);
      const duplicateRiderIds = riderIds.filter((id, index, array) => array.indexOf(id) !== index);
      if (duplicateRiderIds.length) {
        issues.push({ level: "error", title: "Doppelte Teilnehmer-IDs", detail: `Mehrfach vorhanden: ${Array.from(new Set(duplicateRiderIds)).slice(0, 8).join(", ")}` });
      }

      ridersRaw.forEach((rider: any) => {
        const eventId = String(rider.eventId || "master");
        if (!rider.id) issues.push({ level: "error", title: "Teilnehmer ohne ID", detail: `${rider.name || "Unbekannt"} hat keine eindeutige ID.` });
        if (!rider.participantId || !rider.masterId) issues.push({ level: "warning", title: "Teilnehmer ohne stabile Teilnehmer-ID", detail: `${rider.name || "Unbekannt"} wird mit einer stabilen Teilnehmer-ID ergänzt.`, repairable: true });
        if (!rider.name || !rider.plate) issues.push({ level: "warning", title: "Teilnehmer mit fehlenden Pflichtdaten", detail: `${rider.name || "Ohne Name"} / #${rider.plate || "-"}` });
        if (eventId !== "master" && eventId !== "legacy" && !eventIds.has(eventId)) {
          issues.push({ level: "warning", title: "Teilnehmer in unbekanntem Rennen", detail: `${rider.name || "Unbekannt"} verweist auf Event ${eventId}.`, repairable: true });
        }
      });

      const findKnownRider = (eventRiders: any[], row: any) => {
        const rowId = String(row?.riderId || row?.id || "");
        const stableId = String(row?.participantId || row?.masterId || "");
        return eventRiders.find((rider: any) =>
          (rowId && String(rider.id || "") === rowId) ||
          (stableId && String(rider.participantId || rider.masterId || "") === stableId)
        );
      };

      events.forEach((event) => {
        const eventRiders = ridersRaw.filter((rider: any) => !rider.deletedAt && String(rider.eventId || "") === String(event.id));
        const raceCount = getManagedEventRaceCount(event.id, event.type);

        RACES.slice(0, raceCount).forEach((race) => {
          const flag = raceKeyMap[race];
          const raceRiders = eventRiders.filter((rider: any) => !!rider[flag]);
          const categoryMap = new Map<string, any[]>();
          raceRiders.forEach((rider: any) => {
            const category = String(rider.category || getDerivedCategory(rider) || "Ohne Kategorie").trim();
            categoryMap.set(category, [...(categoryMap.get(category) || []), rider]);
          });

          categoryMap.forEach((items, category) => {
            if (items.length > MAX_RIDERS_PER_RACE_CATEGORY) {
              issues.push({ level: "error", title: "Kategorie mit zu vielen Teilnehmern", detail: `${event.name} · ${race} · ${category}: ${items.length} Teilnehmer. Maximal erlaubt sind ${MAX_RIDERS_PER_RACE_CATEGORY}.` });
            }

            const plateGroups = new Map<string, any[]>();
            items.forEach((rider: any) => {
              const plate = String(rider.plate || "").trim();
              if (!plate) return;
              plateGroups.set(plate, [...(plateGroups.get(plate) || []), rider]);
            });
            plateGroups.forEach((duplicates, plate) => {
              if (duplicates.length > 1) {
                issues.push({ level: "warning", title: "Doppelte Startnummer pro Kategorie", detail: `${event.name} · ${race} · ${category} · #${plate}: ${duplicates.map((rider: any) => rider.name || "Unbekannt").join(", ")}` });
              }
            });
          });

          const heatsData = getStoredRaceDataForEvent(event.id, race, "heats", {});
          Object.entries(heatsData || {}).forEach(([category, runGroups]: [string, any]) => {
            (Array.isArray(runGroups) ? runGroups : []).forEach((motoRuns: any[], runIndex: number) => {
              (Array.isArray(motoRuns) ? motoRuns : []).forEach((heat: any[], heatIndex: number) => {
                (Array.isArray(heat) ? heat : []).forEach((entry: any) => {
                  if (!findKnownRider(eventRiders, entry)) {
                    issues.push({ level: "warning", title: "Moto-Eintrag ohne Teilnehmer-Verknüpfung", detail: `${event.name} · ${race} · ${category} · Moto ${runIndex + 1} / Lauf ${heatIndex + 1}: ${entry?.name || "Unbekannt"} (#${entry?.plate || "-"}).`, repairable: false });
                  }
                });
              });
            });
          });

          const resultData = getStoredRaceDataForEvent(event.id, race, "results", {});
          Object.entries(resultData || {}).forEach(([key, rows]: [string, any]) => {
            (Array.isArray(rows) ? rows : []).forEach((entry: any) => {
              if (!findKnownRider(eventRiders, entry)) {
                issues.push({ level: "warning", title: "Moto-Resultat ohne Teilnehmer-Verknüpfung", detail: `${event.name} · ${race} · ${key}: ${entry?.name || "Unbekannt"} (#${entry?.plate || "-"}).` });
              }
            });
          });

          const finalsData = getStoredRaceDataForEvent(event.id, race, "finals", {});
          const finalResultsData = getStoredRaceDataForEvent(event.id, race, "final_results", {});
          Object.entries(finalsData || {}).forEach(([category, rounds]: [string, any]) => {
            const hasHalfFinals = !!rounds?.["Halbfinal 1"]?.length || !!rounds?.["Halbfinal 2"]?.length;
            const half1Complete = !rounds?.["Halbfinal 1"]?.length || (Array.isArray(finalResultsData?.[`${category}_Halbfinal 1`]) && finalResultsData[`${category}_Halbfinal 1`].length >= rounds["Halbfinal 1"].length);
            const half2Complete = !rounds?.["Halbfinal 2"]?.length || (Array.isArray(finalResultsData?.[`${category}_Halbfinal 2`]) && finalResultsData[`${category}_Halbfinal 2`].length >= rounds["Halbfinal 2"].length);
            if (hasHalfFinals && (!rounds?.["A-Final"]?.length || !rounds?.["B-Final"]?.length) && (!half1Complete || !half2Complete)) {
              issues.push({ level: "info", title: "Halbfinal-Kategorie noch nicht freigeschaltet", detail: `${event.name} · ${race} · ${category}: A/B-Finals werden erst nach vollständigen Halbfinalresultaten erstellt.` });
            }
            Object.entries(rounds || {}).forEach(([roundName, heat]: [string, any]) => {
              (Array.isArray(heat) ? heat : []).forEach((entry: any) => {
                if (!findKnownRider(eventRiders, entry)) {
                  issues.push({ level: "warning", title: "Final-Eintrag ohne Teilnehmer-Verknüpfung", detail: `${event.name} · ${race} · ${category} · ${roundName}: ${entry?.name || "Unbekannt"} (#${entry?.plate || "-"}).` });
                }
              });
            });
          });

          Object.entries(finalResultsData || {}).forEach(([key, rows]: [string, any]) => {
            (Array.isArray(rows) ? rows : []).forEach((entry: any) => {
              if (!findKnownRider(eventRiders, entry)) {
                issues.push({ level: "warning", title: "Finalresultat ohne Teilnehmer-Verknüpfung", detail: `${event.name} · ${race} · ${key}: ${entry?.name || "Unbekannt"} (#${entry?.plate || "-"}).` });
              }
            });
          });
        });
      });

      appRows.forEach((row: any) => {
        const key = String(row.key || "");
        const match = key.match(/^bmx_event_([^_]+)_/);
        if (match && !eventIds.has(match[1])) {
          issues.push({ level: "warning", title: "Verwaiste gespeicherte Renndaten", detail: `Gespeicherter Schlüssel gehört zu keinem aktiven Rennen: ${key}`, repairable: true });
        }
      });

      if (!issues.length) {
        issues.push({ level: "info", title: "Alles in Ordnung", detail: `Geprüft: ${events.length} Rennen/Rennserien, ${ridersRaw.length} Teilnehmer, ${appRows.length} gespeicherte Datensätze.` });
      }
      setDataCheckIssues(issues);
      setLastIntegrityCheckAt(new Date().toISOString());
    } catch (error: any) {
      setDataCheckIssues([{ level: "error", title: "Datenprüfung fehlgeschlagen", detail: error?.message || "Unbekannter Fehler" }]);
    } finally {
      setDataCheckRunning(false);
    }
  };

  const repairDataIntegrity = async () => {
    if (!window.confirm("Daten automatisch reparieren? Vorher wird ein vollständiges Backup erstellt.")) return;
    await exportBackup("Sicherheitsbackup vor Datenreparatur");
    try {
      const events = getRawManagedEvents();
      const eventIds = new Set(events.map((event) => String(event.id || "")).filter(Boolean));
      for (const event of events) {
        if (event.type === "single") {
          writeInitialEventValue(event.id, "bmx_series_race_count", 1);
        }
      }
      const ridersRaw = await db.table("riders").toArray();
      const identityUpdates = ridersRaw
        .filter((rider: any) => !rider.participantId || !rider.masterId)
        .map((rider: any) => ({ ...rider, ...getRiderIdentityPatch(rider) }));
      if (identityUpdates.length) await db.table("riders").bulkPut(identityUpdates);
      const orphanedRiders = ridersRaw.filter((rider: any) => {
        const eventId = String(rider.eventId || "master");
        return eventId !== "master" && eventId !== "legacy" && !eventIds.has(eventId);
      });
      if (orphanedRiders.length) {
        await db.table("riders").bulkPut(orphanedRiders.map((rider: any) => ({ ...rider, eventId: "master", repairedAt: new Date().toISOString() })));
      }
      const appRows = await db.table("appData").toArray();
      const orphanedAppKeys = appRows
        .filter((row: any) => {
          const match = String(row.key || "").match(/^bmx_event_([^_]+)_/);
          return match && !eventIds.has(match[1]);
        })
        .map((row: any) => row.key);
      if (orphanedAppKeys.length) {
        await db.table("appData").bulkDelete(orphanedAppKeys);
        orphanedAppKeys.forEach((key: string) => appStorage.removeItem(key));
      }
      setDataRepairMessage(`Reparatur abgeschlossen. Teilnehmer-IDs ergänzt: ${identityUpdates.length}, Teilnehmer verschoben: ${orphanedRiders.length}, verwaiste Datensätze entfernt: ${orphanedAppKeys.length}.`);
      await loadMasterParticipants();
      await loadAllRiders();
      await runDataIntegrityCheck();
    } catch (error: any) {
      alert(`Datenreparatur fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
    }
  };

  const exportManagedEventBackup = async (event: ManagedEvent) => {
    try {
      const eventKeyPrefix = getEventStoragePrefix(event.id);
      const ridersBackup = (await db.table("riders").toArray()).filter((rider: any) => String(rider.eventId || "") === String(event.id));
      const appDataBackup = (await db.table("appData").toArray()).filter((row: any) => String(row.key || "").startsWith(eventKeyPrefix));
      const safeName = `${event.name || "Rennen"}-${event.year || ""}`.replace(/[^a-z0-9äöüÄÖÜ_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, "0");
      const fileName = `BMX-Race-Manager_${safeName}_${APP_VERSION}_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
      const backup = { app: APP_NAME, appName: APP_NAME, appVersion: APP_VERSION, backupVersion: 2, dataSchemaVersion: DATA_SCHEMA_VERSION, version: DATA_SCHEMA_VERSION, scope: "single-event", exportedAt: now.toISOString(), event: { ...event, dataVersion: event.dataVersion || DATA_SCHEMA_VERSION }, managedEvents: [{ ...event, dataVersion: event.dataVersion || DATA_SCHEMA_VERSION }], riders: ridersBackup, appData: appDataBackup };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBackupMessage(`Event exportiert: ${fileName}`);
      addChangeLog(`Event exportiert: ${event.name}`);
    } catch (error: any) {
      alert(`Event-Export fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
    }
  };

  const loadMasterParticipants = async () => {
    const all = (await db.table("riders").toArray()).map(normalizeRider);
    setMasterParticipants(all);
  };

  const getMasterParticipantGroups = () => {
    const eventMap = new Map<string, ManagedEvent>(managedEvents.map((event) => [event.id, event]));
    const groups = new Map<string, any>();
    masterParticipants.filter((rider: any) => !rider.deletedAt).forEach((rider: any) => {
      const key = getMasterParticipantKey(rider);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          raw: rider,
          masterId: rider.participantId || rider.masterId || rider.id,
          participantId: rider.participantId || rider.masterId || rider.id,
          name: rider.name || "",
          plate: rider.plate || "",
          birthYear: rider.birthYear || rider.jahrgang || "",
          gender: rider.gender || rider.geschlecht || "",
          club: rider.club || "",
          cruiser: !!(rider.cruiser || rider.isCruiser),
          events: [] as any[],
        });
      }
      const group = groups.get(key);
      if (rider.eventId === "master") {
        group.raw = rider;
        group.masterId = rider.participantId || rider.masterId || rider.id;
        group.participantId = rider.participantId || rider.masterId || rider.id;
        group.name = rider.name || group.name;
        group.plate = rider.plate || group.plate;
        group.birthYear = rider.birthYear || rider.jahrgang || group.birthYear;
        group.gender = rider.gender || rider.geschlecht || group.gender;
        group.club = rider.club || group.club;
        group.cruiser = !!(rider.cruiser || rider.isCruiser);
        return;
      }
      const event = eventMap.get(rider.eventId || "legacy");
      group.events.push({
        eventId: rider.eventId || "legacy",
        riderId: rider.id,
        raw: rider,
        name: event?.name || (rider.eventId === "legacy" || !rider.eventId ? "Bestehende Rennserie" : "Unbekanntes Rennen"),
        year: event?.year || "",
        type: event?.type || "series",
        races: RACES.filter((race) => !!rider[raceKeyMap[race]]).map((race) => race.replace("Race ", "R")).join(", ") || "keine Race-Zuordnung",
      });
    });
    return Array.from(groups.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  };


  const normalizeEventIdForCount = (value: any) => String(value || "legacy");

  const getRiderCountId = (rider: any) => String(rider?.id || `${rider?.name || ""}-${rider?.plate || ""}-${rider?.birthYear || rider?.jahrgang || ""}-${rider?.gender || rider?.geschlecht || ""}`);
  const getStableParticipantId = (rider: any) => {
    const existing = String(rider?.participantId || rider?.masterId || rider?.id || "").trim();
    return existing || crypto.randomUUID();
  };

  const getRiderIdentityPatch = (rider: any) => {
    const stableId = getStableParticipantId(rider);
    return {
      participantId: String(rider?.participantId || stableId),
      masterId: String(rider?.masterId || stableId),
    };
  };

  const ensureCurrentEventRiderIdentities = async () => {
    const all = await db.table("riders").toArray();
    const current = all.filter((rider: any) => !rider.deletedAt).filter(belongsToCurrentEvent);
    const updates = current
      .filter((rider: any) => !rider.participantId || !rider.masterId)
      .map((rider: any) => ({ ...rider, ...getRiderIdentityPatch(rider) }));
    if (updates.length > 0) {
      await db.table("riders").bulkPut(updates);
    }
    return updates.length;
  };

  const getRaceAssignmentPatch = (rider: any) =>
    Object.fromEntries(RACES.map((race) => [raceKeyMap[race], !!rider?.[raceKeyMap[race]]])) as Record<string, boolean>;


  const getManagedEventParticipantCount = (eventId: string) => {
    const normalizedEventId = normalizeEventIdForCount(eventId);
    return eventTileCounts[normalizedEventId]?.total ?? 0;
  };

  const getManagedEventRaceParticipantCounts = (event: ManagedEvent) => {
    const raceCount = getManagedEventRaceCount(event.id, event.type);
    const counts = eventTileCounts[normalizeEventIdForCount(event.id)]?.races || {};
    return RACES.slice(0, raceCount).map((race) => ({ race, count: counts[race] || 0 }));
  };

  const deleteMasterParticipantGroup = async (participant: any) => {
    const name = participant?.name || "diesen Teilnehmer";
    const eventCount = Array.isArray(participant?.events) ? participant.events.length : 0;
    const message = eventCount > 0
      ? `${name} in den Papierkorb verschieben? Der Teilnehmer wird aus der Hauptdatenbank und aus ${eventCount} Rennen/Rennserien ausgeblendet und kann wiederhergestellt werden.`
      : `${name} in den Papierkorb verschieben? Der Teilnehmer kann wiederhergestellt werden.`;
    if (!window.confirm(message)) return;

    await exportBackup("Sicherheitsbackup vor Teilnehmer-Papierkorb");
    const all = (await db.table("riders").toArray()).map(normalizeRider);
    const key = getMasterParticipantKey(participant.raw || participant);
    const masterId = String(participant.masterId || participant.raw?.masterId || participant.raw?.id || "");
    const idsToTrash = all
      .filter((rider: any) => {
        if (rider.deletedAt) return false;
        const riderId = String(rider.id || "");
        const riderMasterId = String(rider.masterId || "");
        return getMasterParticipantKey(rider) === key || (!!masterId && (riderId === masterId || riderMasterId === masterId));
      })
      .map((rider: any) => rider.id)
      .filter(Boolean);

    if (idsToTrash.length === 0) return;
    const deletedAt = new Date().toISOString();
    for (const id of idsToTrash) {
      await db.table("riders").update(id, { deletedAt });
    }
    setSelectedMasterParticipant(null);
    setEditingRider(null);
    setLastEditedMasterParticipantId("");
    await loadMasterParticipants();
    await loadAllRiders();
    await loadRaceRiders();
    setBackupMessage(`Teilnehmer in Papierkorb verschoben: ${name}`);
  };

  const getDeletedMasterParticipantGroups = () => {
    const groups = new Map<string, any>();
    masterParticipants.filter((rider: any) => !!rider.deletedAt).forEach((rider: any) => {
      const key = getMasterParticipantKey(rider);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          raw: rider,
          masterId: rider.eventId === "master" ? rider.id : rider.masterId || rider.id,
          name: rider.name || "",
          plate: rider.plate || "",
          birthYear: rider.birthYear || rider.jahrgang || "",
          gender: rider.gender || rider.geschlecht || "",
          club: rider.club || "",
          deletedAt: rider.deletedAt,
          count: 0,
        });
      }
      groups.get(key).count += 1;
    });
    return Array.from(groups.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  };

  const restoreMasterParticipantGroup = async (participant: any) => {
    const all = (await db.table("riders").toArray()).map(normalizeRider);
    const key = getMasterParticipantKey(participant.raw || participant);
    const masterId = String(participant.masterId || participant.raw?.masterId || participant.raw?.id || "");
    const idsToRestore = all
      .filter((rider: any) => {
        const riderId = String(rider.id || "");
        const riderMasterId = String(rider.masterId || "");
        return rider.deletedAt && (getMasterParticipantKey(rider) === key || (!!masterId && (riderId === masterId || riderMasterId === masterId)));
      })
      .map((rider: any) => rider.id)
      .filter(Boolean);
    for (const id of idsToRestore) {
      await db.table("riders").update(id, { deletedAt: "" });
    }
    await loadMasterParticipants();
    await loadAllRiders();
    await loadRaceRiders();
    setBackupMessage(`Teilnehmer wiederhergestellt: ${participant.name}`);
  };

  const permanentlyDeleteMasterParticipantGroup = async (participant: any) => {
    if (!window.confirm(`${participant.name} endgültig aus dem Papierkorb löschen?`)) return;
    await exportBackup("Sicherheitsbackup vor endgültigem Teilnehmer-Löschen");
    const all = (await db.table("riders").toArray()).map(normalizeRider);
    const key = getMasterParticipantKey(participant.raw || participant);
    const idsToDelete = all.filter((rider: any) => rider.deletedAt && getMasterParticipantKey(rider) === key).map((rider: any) => rider.id).filter(Boolean);
    if (idsToDelete.length) await db.table("riders").bulkDelete(idsToDelete);
    await loadMasterParticipants();
    await loadAllRiders();
    await loadRaceRiders();
    setBackupMessage(`Teilnehmer endgültig gelöscht: ${participant.name}`);
  };

  const permanentlyDeleteAllTrashParticipants = async () => {
    const all = (await db.table("riders").toArray()).map(normalizeRider);
    const idsToDelete = all
      .filter((rider: any) => !!rider.deletedAt)
      .map((rider: any) => rider.id)
      .filter(Boolean);
    if (idsToDelete.length === 0) {
      window.alert("Der Papierkorb ist leer.");
      return;
    }
    if (!window.confirm(`Alle Teilnehmer im Papierkorb endgültig löschen?

Es werden ${idsToDelete.length} Papierkorb-Einträge dauerhaft entfernt. Vorher wird automatisch ein komplettes Sicherheitsbackup erstellt.`)) return;
    await exportBackup("Sicherheitsbackup vor Papierkorb-Leerung");
    await db.table("riders").bulkDelete(idsToDelete);
    setSelectedMasterParticipant(null);
    setEditingRider(null);
    setLastEditedMasterParticipantId("");
    await loadMasterParticipants();
    await loadAllRiders();
    await loadRaceRiders();
    setBackupMessage(`Papierkorb geleert: ${idsToDelete.length} Teilnehmer-Einträge endgültig gelöscht.`);
  };

  const clearAllParticipantRowsAndRaceData = async () => {
    const participantDataSuffixes = [
      "_heats",
      "_results",
      "_finals",
      "_final_results",
      "_final_manual_order",
      "_race_closed",
      "_cruiser_merge_target",
      "_category_merge_targets",
    ];
    const participantGlobalKeys = new Set([
      "bmx_generated_overall",
      "bmx_overall_manual_order",
      "bmx_overall_locked",
      "bmx_overall_created_at",
      STORAGE_KEYS.duplicateOkKeys,
    ]);
    const shouldClearParticipantDataKey = (key: string) => {
      const isRaceDataKey =
        participantDataSuffixes.some((suffix) => key.endsWith(suffix)) ||
        key.includes("_race_1_") ||
        key.includes("_race_2_") ||
        key.includes("_race_3_") ||
        key.includes("_race_4_") ||
        key.includes("_race_5_") ||
        key.includes("_race_6_") ||
        key.includes("_race_7_") ||
        key.includes("_race_8_") ||
        key.includes("_race_9_") ||
        key.includes("_race_10_");
      return participantGlobalKeys.has(key) || isRaceDataKey;
    };

    await db.transaction("rw", db.table("riders"), db.table("appData"), async () => {
      await db.table("riders").clear();
      const allAppData = await db.table("appData").toArray();
      const keysToDelete = allAppData
        .map((row: any) => String(row.key || ""))
        .filter(shouldClearParticipantDataKey);
      if (keysToDelete.length > 0) await db.table("appData").bulkDelete(keysToDelete);
    });

    appStorage.keys().forEach((key) => {
      if (shouldClearParticipantDataKey(key)) appStorage.removeItem(key);
    });
    appStorage.setItem(STORAGE_KEYS.duplicateOkKeys, JSON.stringify([]));
    setDuplicateOkKeys([]);
  };

  const deleteAllMasterParticipants = async () => {
    const all = (await db.table("riders").toArray()).map(normalizeRider);
    if (all.length === 0) {
      window.alert("Es sind keine Teilnehmerdaten vorhanden.");
      return;
    }
    if (
      !window.confirm(
        `Alle Teilnehmer endgültig löschen?

Es werden ${all.length} Teilnehmerdatensätze aus Hauptdatenbank, Rennen/Rennserien und Papierkorb gelöscht. Zugehörige Motos, Resultate, Finals und Gesamtwertungsdaten werden ebenfalls entfernt, damit beim späteren Import/Hinzufügen keine alten Teilnehmer mehr als vorhanden erkannt werden.

Vorher wird automatisch ein komplettes Sicherheitsbackup erstellt.`,
      )
    ) return;

    await exportBackup("Sicherheitsbackup vor vollständiger Teilnehmer-Löschung");
    await clearAllParticipantRowsAndRaceData();
    setSelectedMasterParticipant(null);
    setEditingRider(null);
    setLastEditedMasterParticipantId("");
    setMasterParticipantFilter("active");
    setAllRiders([]);
    setRiders([]);
    setHeats({});
    setResults({});
    setFinals({});
    setFinalResults({});
    setOverallManualOrder({});
    setGeneratedOverallByCategory({});
    setBackupMessage("Alle Teilnehmer und zugehörigen Renn-/Resultatdaten wurden gelöscht.");
    await loadMasterParticipants();
    addChangeLog("Alle Teilnehmer und zugehörigen Renn-/Resultatdaten endgültig gelöscht");
  };

  const getMasterParticipantKey = (rider: any) => [
    String(rider.name || "").trim().toLowerCase().replace(/\s+/g, " "),
    rider.birthYear || rider.jahrgang || "",
    rider.gender || rider.geschlecht || "",
  ].join("|||");

  const getMasterParticipantSearchText = (participant: any) => [
    participant.name,
    participant.plate,
    participant.club,
    participant.birthYear,
    participant.gender,
  ].filter(Boolean).join(" ").toLowerCase();

  const getEventParticipantSuggestionCategory = (participant: any) => {
    const source = participant?.raw || participant;
    return String(source?.category || getDerivedCategory(source) || "Ohne Kategorie");
  };

  const getEventParticipantCategoryOptions = () => {
    const currentKeys = new Set(allRiders.map((rider: any) => getMasterParticipantKey(rider)));
    const categories = getMasterParticipantGroups()
      .filter((participant: any) => !currentKeys.has(participant.key))
      .map(getEventParticipantSuggestionCategory)
      .filter(Boolean);
    return ["all", ...sortCategories(Array.from(new Set(categories)) as string[])];
  };

  const groupEventParticipantSuggestionsByCategory = (items: any[]) => {
    return items.reduce((acc: Record<string, any[]>, participant: any) => {
      const category = getEventParticipantSuggestionCategory(participant);
      if (!acc[category]) acc[category] = [];
      acc[category].push(participant);
      return acc;
    }, {});
  };

  const getMasterParticipantSuggestions = () => {
    const query = eventParticipantSearch.trim().toLowerCase();
    const existingKeys = new Set(allRiders.map((rider: any) => getMasterParticipantKey(rider)));
    let groups = getMasterParticipantGroups().filter((participant: any) => !existingKeys.has(participant.key));
    if (eventParticipantCategoryFilter !== "all") {
      groups = groups.filter((participant: any) => getEventParticipantSuggestionCategory(participant) === eventParticipantCategoryFilter);
    }
    if (!query) return groups;
    const parts = query.split(/\s+/).filter(Boolean);
    return groups.filter((participant: any) => {
      const text = `${getMasterParticipantSearchText(participant)} ${getEventParticipantSuggestionCategory(participant)}`.toLowerCase();
      return parts.every((part) => text.includes(part)) || text.includes(query);
    });
  };

  const lateAddParticipantCandidates = useMemo(() => {
    const flag = raceKeyMap[selectedRace];
    const currentEventKeys = new Set(allRiders.map((rider: any) => getMasterParticipantKey(rider)));
    const eventCandidates = allRiders
      .filter((rider: any) => !rider.deletedAt && !rider[flag])
      .map((rider: any) => ({
        value: `event:${rider.id}`,
        label: `${rider.plate ? `#${rider.plate} ` : ""}${rider.name || "Ohne Name"} · ${rider.category || getDerivedCategory(rider)}${rider.club ? ` · ${rider.club}` : ""}`,
        search: getMasterParticipantSearchText(rider),
        source: "event",
        rider,
      }));

    const masterCandidates = getMasterParticipantGroups()
      .filter((participant: any) => !currentEventKeys.has(participant.key))
      .map((participant: any) => ({
        value: `master:${participant.key}`,
        label: `${participant.plate ? `#${participant.plate} ` : ""}${participant.name || "Ohne Name"} · ${participant.raw?.category || getDerivedCategory(participant.raw || participant)}${participant.club ? ` · ${participant.club}` : ""}`,
        search: getMasterParticipantSearchText(participant),
        source: "master",
        participant,
      }));

    return [...eventCandidates, ...masterCandidates].sort((a, b) => a.label.localeCompare(b.label, "de-CH", { numeric: true }));
  }, [allRiders, masterParticipants, managedEvents, selectedRace]);

  const addMasterParticipantToCurrentEvent = async (participant: any, addToSelectedRace = false) => {
    if (!currentEventId) {
      window.alert("Bitte zuerst ein Rennen oder eine Rennserie öffnen.");
      return;
    }
    const current = (await db.table("riders").toArray()).map(normalizeRider).filter(belongsToCurrentEvent);
    const key = getMasterParticipantKey(participant.raw || participant);
    const source = participant.raw || participant;
    const stableId = String(participant.masterId || source.participantId || source.masterId || source.id || crypto.randomUUID());
    const alreadyExists = current.some((rider: any) => getMasterParticipantKey(rider) === key || String(rider.participantId || rider.masterId || "") === stableId);
    if (alreadyExists) {
      window.alert("Dieser Teilnehmer ist in diesem Rennen / dieser Rennserie bereits vorhanden.");
      return;
    }
    const newId = crypto.randomUUID();
    await db.table("riders").add({
      id: newId,
      participantId: stableId,
      masterId: stableId,
      name: source.name || participant.name || "",
      plate: source.plate || participant.plate || "",
      birthYear: Number(source.birthYear || source.jahrgang || participant.birthYear) || undefined,
      jahrgang: Number(source.birthYear || source.jahrgang || participant.birthYear) || undefined,
      gender: source.gender || source.geschlecht || participant.gender || "",
      geschlecht: source.gender || source.geschlecht || participant.gender || "",
      club: source.club || participant.club || "",
      cruiser: !!(source.cruiser || source.isCruiser || participant.cruiser),
      isCruiser: !!(source.cruiser || source.isCruiser || participant.cruiser),
      eventId: currentEventId || "legacy",
      ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`race${index + 1}`, false])),
      ...(addToSelectedRace ? { [raceKeyMap[selectedRace]]: true } : {}),
    });
    await loadAllRiders();
    await loadRaceRiders();
    addChangeLog(`Teilnehmer aus Hauptdatenbank hinzugefügt: ${source.name || participant.name}${addToSelectedRace ? ` (${selectedRace})` : ""}`);
  };

  const findEditedRiderAfterSave = (items: any[], original: any) => {
    const originalId = String(original?.id || "");
    const originalStableId = String(original?.participantId || original?.masterId || original?.id || "");
    const byId = items.find((item: any) => originalId && String(item.id || "") === originalId);
    if (byId) return byId;
    const byStableId = items.find((item: any) => originalStableId && String(item.participantId || item.masterId || "") === originalStableId);
    if (byStableId) return byStableId;
    const originalPlate = String(original?.plate || "").trim();
    const originalBirthYear = String(original?.birthYear || original?.jahrgang || "").trim();
    const originalGender = String(original?.gender || original?.geschlecht || "").trim().toLowerCase();
    return items.find((item: any) =>
      String(item.plate || "").trim() === originalPlate &&
      String(item.birthYear || item.jahrgang || "").trim() === originalBirthYear &&
      String(item.gender || item.geschlecht || "").trim().toLowerCase() === originalGender
    ) || null;
  };

  const getParticipantStableId = (rider: any) => String(rider?.participantId || rider?.masterId || rider?.id || "").trim();

  const readParticipantDraftFromForm = (container: HTMLElement | null) => {
    const draft = { name: "", plate: "", birthYear: "", gender: "", club: "" };
    if (!container) return draft;
    const controls = Array.from(container.querySelectorAll("input, select, textarea")) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
    controls.forEach((control) => {
      const input = control as HTMLInputElement;
      const type = String(input.type || "").toLowerCase();
      if (["button", "submit", "file", "checkbox", "radio"].includes(type)) return;
      const value = String(control.value || "").trim();
      if (!value) return;
      const fingerprint = [
        control.getAttribute("name"),
        control.getAttribute("id"),
        control.getAttribute("placeholder"),
        control.getAttribute("aria-label"),
        control.closest("label")?.textContent,
        control.previousElementSibling?.textContent,
      ].filter(Boolean).join(" ").toLowerCase();

      if (/startnummer|plate|nummer|nr\.?/.test(fingerprint)) {
        draft.plate = draft.plate || value;
      } else if (/jahrgang|geburtsjahr|birth/.test(fingerprint)) {
        draft.birthYear = draft.birthYear || value;
      } else if (/verein|club/.test(fingerprint)) {
        draft.club = draft.club || value;
      } else if (/geschlecht|gender|b\/g/.test(fingerprint)) {
        draft.gender = draft.gender || value;
      } else if (/name|fahrer|teilnehmer/.test(fingerprint)) {
        draft.name = draft.name || value;
      } else if (!draft.name && type !== "number" && type !== "date") {
        draft.name = value;
      }
    });
    return draft;
  };

  const handleMasterParticipantDraftInputCapture = (event: React.FormEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    window.setTimeout(() => {
      setMasterParticipantDraftLookup(readParticipantDraftFromForm(container));
    }, 0);
  };

  const seedMasterParticipantDraftLookup = (participant: any) => {
    setMasterParticipantDraftLookup({
      name: participant?.name || participant?.raw?.name || "",
      plate: participant?.plate || participant?.raw?.plate || "",
      birthYear: String(participant?.birthYear || participant?.raw?.birthYear || participant?.raw?.jahrgang || ""),
      gender: participant?.gender || participant?.raw?.gender || participant?.raw?.geschlecht || "",
      club: participant?.club || participant?.raw?.club || "",
    });
  };

  const getParticipantEntrySuggestions = () => {
    const draftName = normalizeParticipantName(masterParticipantDraftLookup.name);
    if (draftName.length < 2) return [];
    const draft = {
      name: masterParticipantDraftLookup.name,
      plate: masterParticipantDraftLookup.plate,
      birthYear: masterParticipantDraftLookup.birthYear,
      gender: masterParticipantDraftLookup.gender,
    };
    const sortedDraftName = getSortedNameKey(draft.name || "");
    const editingStableId = getParticipantStableId(editingRider);
    const editingKey = editingRider ? getMasterParticipantKey(editingRider) : "";

    return getMasterParticipantGroups()
      .filter((participant: any) => {
        const stableId = String(participant.participantId || participant.masterId || participant.raw?.id || "");
        return !(editingStableId && stableId === editingStableId) && (!editingKey || participant.key !== editingKey);
      })
      .map((participant: any) => {
        const participantName = normalizeParticipantName(participant.name || "");
        const sortedParticipantName = getSortedNameKey(participant.name || "");
        const distance = getLevenshteinDistance(draftName, participantName);
        let score = 0;
        if (participantName === draftName) score += 110;
        if (sortedDraftName && sortedDraftName === sortedParticipantName) score += 95;
        if (participantName.startsWith(draftName)) score += 70;
        if (participantName.includes(draftName) || draftName.includes(participantName)) score += 55;
        if (Math.max(draftName.length, participantName.length) >= 5 && distance <= 2) score += 52;
        if (Math.max(draftName.length, participantName.length) >= 8 && distance <= 3) score += 38;
        draftName.split(" ").filter((part) => part.length >= 2).forEach((part) => {
          if (participantName.includes(part)) score += 12;
        });
        if (String(draft.plate || "").trim() && String(draft.plate || "").trim() === String(participant.plate || "").trim()) score += 34;
        if (String(draft.birthYear || "").trim() && String(draft.birthYear || "").trim() === String(participant.birthYear || "").trim()) score += 22;
        if (String(draft.gender || "").trim() && getRiderGenderCode(draft) && getRiderGenderCode(draft) === getRiderGenderCode(participant)) score += 10;
        if (areLikelyDuplicateParticipants({ ...draft, gender: getRiderGenderCode(draft) }, participant)) score += 40;
        return { participant, score, distance };
      })
      .filter((entry: any) => entry.score >= 45)
      .sort((a: any, b: any) => b.score - a.score || a.distance - b.distance || String(a.participant.name || "").localeCompare(String(b.participant.name || ""), "de-CH", { numeric: true }))
      .slice(0, 6);
  };

  const getRiderSharedDataPatch = (rider: any, options?: { preservePlate?: boolean }) => {
    const birthYear = getRiderBirthYear(rider) || "";
    const gender = getRiderGenderCode(rider) || "";
    const specialCategory = getSpecialCategoryValue(rider);
    const baseWithoutPlate = {
      name: rider?.name || "",
      birthYear,
      jahrgang: birthYear,
      gender,
      geschlecht: gender,
      club: rider?.club || "",
      cruiser: specialCategory === CRUISER_CATEGORY,
      isCruiser: specialCategory === CRUISER_CATEGORY,
      specialCategory,
      plauschCategory: isPlauschCategory(specialCategory) ? specialCategory : "",
    };
    const base = options?.preservePlate
      ? baseWithoutPlate
      : { ...baseWithoutPlate, plate: rider?.plate || "" };
    return {
      ...base,
      category: getDerivedCategory({ ...rider, ...base }),
    };
  };

  const shouldPatchStoredRiderRow = (row: any, linkedIds: Set<string>, stableId: string) => {
    if (!row || typeof row !== "object") return false;
    const rowId = String(row.riderId ?? row.id ?? "");
    const rowStableId = String(row.participantId || row.masterId || "");
    return (!!rowId && linkedIds.has(rowId)) || (!!stableId && rowStableId === stableId);
  };

  const patchStoredRiderDataDeep = (value: any, linkedIds: Set<string>, stableId: string, updatedRider: any, idReplacement?: { oldId: string; newId: string }, options?: { preservePlate?: boolean }) => {
    const patch = getRiderSharedDataPatch(updatedRider, options);
    const visit = (node: any): any => {
      if (Array.isArray(node)) return node.map(visit);
      if (!node || typeof node !== "object") return node;

      const patchedChildren: any = {};
      Object.keys(node).forEach((key) => {
        patchedChildren[key] = visit(node[key]);
      });

      if (!shouldPatchStoredRiderRow(node, linkedIds, stableId)) return patchedChildren;

      const next: any = {
        ...patchedChildren,
        ...patch,
        participantId: stableId || patchedChildren.participantId,
        masterId: stableId || patchedChildren.masterId,
      };
      if (idReplacement?.oldId && idReplacement?.newId) {
        if (String(next.id || "") === idReplacement.oldId) next.id = idReplacement.newId;
        if (String(next.riderId || "") === idReplacement.oldId) next.riderId = idReplacement.newId;
      }
      return next;
    };
    return visit(value);
  };

  const isStoredRaceClosedForEvent = (eventId: string, race: RaceName) => {
    try {
      if (String(eventId || "legacy") === String(currentEventId || "legacy") && race === selectedRace) return !!raceClosed;
      const key = scopedKeyForEvent(String(eventId || "legacy"), `bmx_${race.toLowerCase().replace(/\s+/g, "_")}_race_closed`);
      return !!JSON.parse(appStorage.getItem(key) || "false");
    } catch {
      return false;
    }
  };

  const saveEventRaceValue = async (eventId: string, race: RaceName, suffix: string, value: any) => {
    const baseKey = `bmx_${race.toLowerCase().replace(/\s+/g, "_")}_${suffix}`;
    const storageKey = scopedKeyForEvent(eventId, baseKey);
    appStorage.setItem(storageKey, encodeStorageValue(value));
    await db.table("appData").put({ key: storageKey, value });
  };

  const syncRiderSharedDataToAllReferences = async (original: any, edited: any) => {
    const stableId = getParticipantStableId(original) || getParticipantStableId(edited);
    if (!stableId) return;

    const allRows = (await db.table("riders").toArray()).map(normalizeRider);
    const linkedRowsBefore = allRows.filter((row: any) => {
      const rowStable = getParticipantStableId(row);
      return rowStable === stableId || String(row.id || "") === String(original?.id || "") || String(row.id || "") === String(edited?.id || "");
    });
    const linkedIds = new Set<string>(linkedRowsBefore.map((row: any) => String(row.id || "")).filter(Boolean));
    if (original?.id) linkedIds.add(String(original.id));
    if (edited?.id) linkedIds.add(String(edited.id));

    const patch = getRiderSharedDataPatch(edited);
    const editedId = String(edited?.id || "");
    const originalId = String(original?.id || "");
    const assignmentPatch = originalId === editedId ? getRaceAssignmentPatch(edited) : getRaceAssignmentPatch(original);
    const updatedRows = linkedRowsBefore.map((row: any) => {
      const isEditedRow = editedId && String(row.id || "") === editedId;
      return {
        ...row,
        ...patch,
        ...(isEditedRow ? assignmentPatch : {}),
        participantId: stableId,
        masterId: stableId,
        eventId: row.eventId || (String(row.id || "") === editedId ? (edited.eventId || original.eventId || currentEventId || "legacy") : "master"),
      };
    });
    if (updatedRows.length) await db.table("riders").bulkPut(updatedRows);

    const idReplacement = originalId && editedId && originalId !== editedId ? { oldId: originalId, newId: editedId } : undefined;
    const eventsToPatch = getRawManagedEvents();
    const allEvents = eventsToPatch.length ? eventsToPatch : [{ id: currentEventId || "legacy", type: "series" } as any];

    for (const event of allEvents) {
      for (const race of RACES) {
        for (const suffix of ["heats", "results", "finals", "final_results"] as const) {
          const storageKey = scopedKeyForEvent(String(event.id || "legacy"), `bmx_${race.toLowerCase().replace(/\s+/g, "_")}_${suffix}`);
          const raw = appStorage.getItem(storageKey);
          if (raw === null) continue;
          try {
            const parsed = JSON.parse(raw || "{}");
            const patched = patchStoredRiderDataDeep(parsed, linkedIds, stableId, edited, idReplacement, { preservePlate: isStoredRaceClosedForEvent(String(event.id || "legacy"), race) });
            await saveEventRaceValue(String(event.id || "legacy"), race, suffix, patched);
            if (String(event.id || "legacy") === String(currentEventId || "legacy") && race === selectedRace) {
              if (suffix === "heats") setHeats(patched);
              if (suffix === "results") setResults(patched);
              if (suffix === "finals") setFinals(patched);
              if (suffix === "final_results") setFinalResults(patched);
            }
          } catch {
            // Defekte alte Storage-Einträge beim Synchronisieren überspringen.
          }
        }
      }

      const overallKey = scopedKeyForEvent(String(event.id || "legacy"), "bmx_generated_overall");
      const rawOverall = appStorage.getItem(overallKey);
      if (rawOverall !== null) {
        try {
          const parsedOverall = JSON.parse(rawOverall || "{}");
          const patchedOverall = patchStoredRiderDataDeep(parsedOverall, linkedIds, stableId, edited, idReplacement);
          appStorage.setItem(overallKey, encodeStorageValue(patchedOverall));
          await db.table("appData").put({ key: overallKey, value: patchedOverall });
          if (String(event.id || "legacy") === String(currentEventId || "legacy")) setGeneratedOverallByCategory(patchedOverall);
        } catch {
          // Defekte Gesamtwertungsdaten überspringen.
        }
      }
    }
  };

  const findSavedRiderByDraft = async (draft: any, eventIdHint?: string) => {
    const nameKey = normalizeParticipantName(draft?.name || "");
    const plate = String(draft?.plate || "").trim();
    const birthYear = String(draft?.birthYear || "").trim();
    const gender = String(getRiderGenderCode(draft) || draft?.gender || "").trim();
    const rows = (await db.table("riders").toArray()).map(normalizeRider).filter((rider: any) => !rider.deletedAt);
    const scored = rows
      .filter((rider: any) => !eventIdHint || String(rider.eventId || "") === String(eventIdHint))
      .map((rider: any) => {
        let score = 0;
        if (nameKey && normalizeParticipantName(rider.name || "") === nameKey) score += 60;
        if (plate && String(rider.plate || "").trim() === plate) score += 25;
        if (birthYear && String(getRiderBirthYear(rider) || "").trim() === birthYear) score += 10;
        if (gender && String(getRiderGenderCode(rider) || "").trim() === gender) score += 5;
        return { rider, score };
      })
      .filter((entry: any) => entry.score >= 60)
      .sort((a: any, b: any) => b.score - a.score);
    return scored[0]?.rider || null;
  };

  const applySpecialCategoryToRider = async (riderId: string, specialCategoryValue: string) => {
    if (!riderId) return "";
    const originalRow = await db.table("riders").get(riderId);
    if (!originalRow) return "";
    const normalizedSpecial = normalizeSpecialCategoryValue(specialCategoryValue);
    const specialPatch = {
      specialCategory: normalizedSpecial,
      plauschCategory: isPlauschCategory(normalizedSpecial) ? normalizedSpecial : "",
      cruiser: normalizedSpecial === CRUISER_CATEGORY,
      isCruiser: normalizedSpecial === CRUISER_CATEGORY,
    };
    const edited = {
      ...originalRow,
      ...specialPatch,
      category: getDerivedCategory({ ...originalRow, ...specialPatch }),
    };
    await db.table("riders").update(riderId, {
      ...specialPatch,
      category: edited.category,
    });
    await syncRiderSharedDataToAllReferences(originalRow, edited);
    if (normalizedSpecial) addChangeLog(`Spezial-Kategorie gesetzt: ${edited.name || "Teilnehmer"} → ${normalizedSpecial}`);
    return String(riderId);
  };

  const preserveEditedRiderLinks = async (original: any) => {
    if (!original?.id) return "";
    const originalId = String(original.id);
    const originalIdentity = getRiderIdentityPatch(original);
    const allAfter = (await db.table("riders").toArray()).map(normalizeRider).filter((rider: any) => !rider.deletedAt);
    const edited = findEditedRiderAfterSave(allAfter, original);
    if (!edited?.id) return originalId;

    const editedId = String(edited.id);
    const stableId = String(originalIdentity.participantId || originalIdentity.masterId || originalId);
    await db.table("riders").update(editedId, {
      participantId: stableId,
      masterId: stableId,
      eventId: edited.eventId || original.eventId || currentEventId || "legacy",
    });

    await syncRiderSharedDataToAllReferences(original, { ...edited, participantId: stableId, masterId: stableId });
    if (editedId !== originalId) addChangeLog("Teilnehmer-ID bei Bearbeitung stabilisiert");
    addChangeLog("Teilnehmerdaten überall synchronisiert");
    return editedId || originalId;
  };

  const handleRiderFormChange = async () => {
    const original = editingRider ? { ...editingRider } : null;
    const draftBeforeSave = { ...masterParticipantDraftLookup };
    const specialBeforeSave = participantSpecialCategoryDraft;
    const originalSpecial = getSpecialCategoryValue(original);
    const shouldApplySpecial = participantSpecialCategoryDraftDirty || !!originalSpecial;
    let editedId = original ? await preserveEditedRiderLinks(original) : String(lastEditedMasterParticipantId || "");
    if (!editedId && shouldApplySpecial) {
      const saved =
        (await findSavedRiderByDraft(draftBeforeSave, appShellView === "masterParticipants" ? "master" : currentEventId || "legacy")) ||
        (await findSavedRiderByDraft(draftBeforeSave));
      editedId = String(saved?.id || "");
    }
    if (editedId && shouldApplySpecial) await applySpecialCategoryToRider(editedId, specialBeforeSave);
    setEditingRider(null);
    setParticipantSpecialCategoryDraft("");
    setParticipantSpecialCategoryDraftDirty(false);
    setMasterParticipantDraftLookup({ name: "", plate: "", birthYear: "", gender: "", club: "" });
    await ensureCurrentEventRiderIdentities();
    await loadMasterParticipants();
    await loadAllRiders();
    await loadRaceRiders();
    if (editedId) {
      setLastEditedMasterParticipantId(editedId);
      window.setTimeout(() => {
        (participantRowRefs.current[String(editedId)] || participantRowRefs.current[`master-${String(editedId)}`])?.scrollIntoView({ behavior: "auto", block: "center" });
      }, 0);
    }
  };


  const toggleMasterParticipantSelection = (key: string) => {
    setSelectedMasterParticipantKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const addSelectedMasterParticipantsToCurrentEvent = async () => {
    const suggestions = getMasterParticipantSuggestions();
    const selected = suggestions.filter((participant: any) => selectedMasterParticipantKeys.includes(participant.key));
    if (selected.length === 0) {
      window.alert("Bitte zuerst Teilnehmer auswählen.");
      return;
    }
    for (const participant of selected) {
      await addMasterParticipantToCurrentEvent(participant, true);
    }
    setSelectedMasterParticipantKeys([]);
  };

  const selectVisibleMasterParticipantCategory = (category: string) => {
    const categoryKeys = getMasterParticipantSuggestions()
      .filter((participant: any) => getEventParticipantSuggestionCategory(participant) === category)
      .map((participant: any) => participant.key);
    setSelectedMasterParticipantKeys((prev) => Array.from(new Set([...prev, ...categoryKeys])));
  };

  const addVisibleMasterParticipantCategoryToCurrentRace = async (category: string) => {
    const items = getMasterParticipantSuggestions().filter((participant: any) => getEventParticipantSuggestionCategory(participant) === category);
    if (items.length === 0) return;
    if (!window.confirm(`${items.length} Teilnehmer aus "${category}" zu ${selectedRace} hinzufügen?`)) return;
    for (const participant of items) {
      await addMasterParticipantToCurrentEvent(participant, true);
    }
    setSelectedMasterParticipantKeys((prev) => prev.filter((key) => !items.some((participant: any) => participant.key === key)));
  };

  const startEventParticipantCreate = async () => {
    if (Object.keys(heats || {}).length > 0) {
      window.alert("Motos sind bereits erstellt. Neue Teilnehmer bitte über Notfall / Reparatur → Teilnehmer nachträglich hinzufügen ergänzen, damit bestehende Gates geschützt bleiben.");
      return;
    }
    const allRows = (await db.table("riders").toArray()).map(normalizeRider).filter((r: any) => !r.deletedAt).filter(belongsToCurrentEvent);
    eventParticipantCreateKnownIdsRef.current = new Set(allRows.map((rider: any) => String(rider.id || "")).filter(Boolean));
    setEditingRider(null);
    setParticipantSpecialCategoryDraft("");
    setParticipantSpecialCategoryDraftDirty(false);
    setLastEditedMasterParticipantId("");
    setShowEventParticipantCreateForm(true);
    window.setTimeout(() => participantFormRef.current?.scrollIntoView({ behavior: "auto", block: "start" }), 0);
  };

  const markNewestCreatedParticipantForCurrentRace = async () => {
    const flag = raceKeyMap[selectedRace];
    const beforeIds = eventParticipantCreateKnownIdsRef.current;
    const allRows = (await db.table("riders").toArray()).map(normalizeRider).filter((r: any) => !r.deletedAt).filter(belongsToCurrentEvent);
    const created = allRows.filter((rider: any) => !beforeIds.has(String(rider.id || "")));
    const target = created[created.length - 1];
    if (!target?.id) return "";
    await db.table("riders").update(target.id, { [flag]: true, eventId: currentEventId || "legacy" });
    addChangeLog(`Neuer Teilnehmer direkt im Rennen erfasst und zu ${selectedRace} hinzugefügt: ${target.name || "Ohne Name"}`);
    return String(target.id || "");
  };

  const handleEventParticipantFormChange = async () => {
    const wasEditing = !!editingRider;
    if (wasEditing) {
      await handleRiderFormChange();
      return;
    }
    const specialBeforeSave = participantSpecialCategoryDraft;
    const shouldApplySpecial = participantSpecialCategoryDraftDirty;
    const createdId = showEventParticipantCreateForm ? await markNewestCreatedParticipantForCurrentRace() : "";
    if (createdId && shouldApplySpecial) await applySpecialCategoryToRider(createdId, specialBeforeSave);
    setShowEventParticipantCreateForm(false);
    setParticipantSpecialCategoryDraft("");
    setParticipantSpecialCategoryDraftDirty(false);
    await ensureCurrentEventRiderIdentities();
    await loadMasterParticipants();
    await loadAllRiders();
    await loadRaceRiders();
    if (createdId) {
      setLastEditedMasterParticipantId(createdId);
      window.setTimeout(() => {
        (participantRowRefs.current[String(createdId)] || participantRowRefs.current[`master-${String(createdId)}`])?.scrollIntoView({ behavior: "auto", block: "center" });
      }, 0);
    }
  };


  const readScopedEventValue = <T,>(eventId: string, key: string, fallback: T): T => {
    try {
      const storageKey = scopedKeyForEvent(eventId || "legacy", key);
      const value = appStorage.getItem(storageKey);
      if (value === null) return fallback;
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };

  const getManagedEventRaceCount = (eventId: string, type?: string) => {
    if (type === "single") return 1;
    const stored = readScopedEventValue<number>(eventId || "legacy", "bmx_series_race_count", 4);
    return Math.max(1, Math.min(10, Number(stored) || 4));
  };

  const getStoredRaceDataForEvent = (eventId: string, race: RaceName, key: string, fallback: any) => {
    return readScopedEventValue<any>(
      eventId || "legacy",
      `bmx_${race.toLowerCase().replace(/\s+/g, "_")}_${key}`,
      fallback,
    );
  };

  const findRaceResultForParticipant = (entry: any, race: RaceName) => {
    const stored = getStoredRaceDataForEvent(entry.eventId || "legacy", race, "final_results", {});
    const rows: any[] = [];
    Object.keys(stored || {}).forEach((category) => {
      const categoryRows = Array.isArray(stored[category]) ? stored[category] : [];
      categoryRows.forEach((row: any, index: number) => rows.push({ ...row, category, fallbackRank: index + 1 }));
    });

    const riderId = String(entry.riderId || entry.raw?.id || "");
    const name = String(entry.raw?.name || "").trim().toLowerCase();
    const birthYear = String(entry.raw?.birthYear || entry.raw?.jahrgang || "");
    const gender = String(entry.raw?.gender || entry.raw?.geschlecht || "");

    return rows.find((row) => {
      const rowId = String(row.id ?? row.riderId ?? "");
      if (riderId && rowId && rowId === riderId) return true;
      const rowName = String(row.name || "").trim().toLowerCase();
      const rowBirthYear = String(row.birthYear || row.jahrgang || "");
      const rowGender = String(row.gender || row.geschlecht || "");
      return !!name && rowName === name && (!birthYear || rowBirthYear === birthYear) && (!gender || rowGender === gender);
    });
  };

  const findOverallResultForParticipant = (entry: any) => {
    const stored = readScopedEventValue<Record<string, any[]>>(entry.eventId || "legacy", "bmx_generated_overall", {});
    const riderId = String(entry.riderId || entry.raw?.id || "");
    const name = String(entry.raw?.name || "").trim().toLowerCase();

    for (const category of Object.keys(stored || {})) {
      const rows = Array.isArray(stored[category]) ? stored[category] : [];
      const foundIndex = rows.findIndex((row: any) => {
        const rowId = String(row.id ?? row.riderId ?? "");
        if (riderId && rowId && rowId === riderId) return true;
        return !!name && String(row.name || "").trim().toLowerCase() === name;
      });
      if (foundIndex >= 0) {
        const row = rows[foundIndex];
        return { category, rank: foundIndex + 1, total: row.total, raceCount: row.raceCount };
      }
    }
    return null;
  };

  const getMasterParticipantEventDetails = (participant: any) => {
    return (participant?.events || []).map((entry: any) => {
      const raceCount = getManagedEventRaceCount(entry.eventId || "legacy", entry.type);
      const races = RACES.slice(0, raceCount).map((race) => {
        const flag = raceKeyMap[race];
        const assigned = !!entry.raw?.[flag];
        const result = findRaceResultForParticipant(entry, race);
        return {
          race,
          assigned,
          rank: result ? (result.rank || result.position || result.place || result.fallbackRank) : null,
          status: result ? (result.status || "OK") : "",
          category: result ? (result.originalCategory || result.category || entry.raw?.category || "") : (entry.raw?.category || ""),
        };
      });
      return { ...entry, raceCount, races, overall: findOverallResultForParticipant(entry) };
    });
  };


  const getStoredRaceData = (race: RaceName, key: string, fallback: any) => {
    if (race === selectedRace && key === "heats") return heats;
    if (race === selectedRace && key === "finals") return finals;
    if (race === selectedRace && key === "final_results") return finalResults;
    try {
      return JSON.parse(appStorage.getItem(getRaceStorageKey(race, key)) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  };

  const getRaceRankingForRider = (race: RaceName, riderId: string) => {
    const stored = getStoredRaceData(race, "final_results", {});
    const flat: any[] = [];
    Object.keys(stored || {}).forEach((cat) => {
      const rows = Array.isArray(stored[cat]) ? stored[cat] : [];
      rows.forEach((row: any, index: number) => flat.push({ ...row, category: cat, fallbackRank: index + 1 }));
    });
    const found = flat.find((row) => String(row.id ?? row.riderId) === String(riderId));
    if (!found) return null;
    return {
      rank: found.rank || found.position || found.place || found.fallbackRank,
      status: found.status || "OK",
      category: found.originalCategory || found.category || "",
    };
  };

  const getOverallInfoForRider = (riderId: string) => {
    for (const category of Object.keys(overallByCategory || {})) {
      const items = applyManualOrder(category, overallByCategory[category] || []);
      const index = items.findIndex((item: any) => String(item.riderId) === String(riderId));
      if (index >= 0) return { category, rank: index + 1, total: items[index].total, raceCount: items[index].raceCount };
    }
    return null;
  };

  const getOverallPreviewRows = (): Array<{ race: RaceName; count: number; status: string; countsForOverall: boolean }> =>
    activeRaces.map((race) => {
      const stored = getStoredRaceData(race, "final_results", {}) as Record<string, unknown>;
      const resultGroups = Object.values(stored || {}) as unknown[];
      const count: number = resultGroups.reduce<number>((sum, rows) => {
        return sum + (Array.isArray(rows) ? rows.length : 0);
      }, 0);
      return { race, count, status: getRaceStatus(race), countsForOverall: getRaceClosedValue(race) && count > 0 };
    });

  const getLastBackup = () => backupHistory[0] || null;

  const getBackupAgeMinutes = () => {
    const last = getLastBackup();
    if (!last?.iso) return null;
    const diff = Date.now() - new Date(last.iso).getTime();
    return Math.max(0, Math.round(diff / 60000));
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return "Noch nie";
    try {
      return new Date(iso).toLocaleString("de-CH");
    } catch {
      return "Unbekannt";
    }
  };

  const backupAgeMinutes = getBackupAgeMinutes();
  const backupWarningActive = backupAgeMinutes === null || backupAgeMinutes > 30;

  const masterParticipantExcelHeaders = [
    "Teilnehmer ID",
    "Name",
    "Startnummer",
    "Verein",
    "Jahrgang",
    "Geschlecht",
    "Cruiser",
    "Spezial-Kategorie",
    "Kategorie",
    "Race1",
    "Race2",
    "Race3",
    "Race4",
    "Race5",
    "Race6",
    "Race7",
    "Race8",
    "Race9",
    "Race10",
    "Resultate Übersicht",
    "Gesamtwertung Übersicht",
  ];

  const normalizeExcelHeader = (value: any) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");

  const getExcelCell = (row: any, aliases: string[]) => {
    const aliasKeys = aliases.map(normalizeExcelHeader);
    for (const key of Object.keys(row || {})) {
      if (aliasKeys.includes(normalizeExcelHeader(key))) return row[key];
    }
    return "";
  };

  const parseExcelBoolean = (value: any) => {
    const text = String(value ?? "").trim().toLowerCase();
    return ["x", "ja", "yes", "true", "1", "cruiser"].includes(text);
  };

  const parseExcelYear = (value: any) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 1900 ? Math.round(number) : undefined;
  };

  const formatExcelBoolean = (value: any) => value ? "x" : "";

  const buildMasterParticipantResultRows = (groups: any[]) => {
    const rows: any[] = [];
    groups.forEach((participant: any) => {
      const details = getMasterParticipantEventDetails(participant);
      details.forEach((event: any) => {
        event.races.forEach((raceInfo: any) => {
          if (!raceInfo.assigned && !raceInfo.rank) return;
          rows.push({
            "Teilnehmer ID": participant.participantId || participant.masterId || "",
            Name: participant.name || "",
            Startnummer: participant.plate || "",
            Verein: participant.club || "",
            Jahrgang: participant.birthYear || "",
            Geschlecht: participant.gender || "",
            Kategorie: raceInfo.category || participant.raw?.category || getDerivedCategory(participant.raw || participant),
            Rennen: `${event.name || "Rennen"} ${event.year || ""}`.trim(),
            Typ: event.type === "single" ? "Einzelrennen" : "Rennserie",
            Lauf: raceInfo.race,
            Zugeordnet: raceInfo.assigned ? "Ja" : "Nein",
            Rang: raceInfo.rank || "",
            Status: raceInfo.status || "",
            Gesamtwertung: event.overall ? `Rang ${event.overall.rank} · ${event.overall.total} Punkte` : "",
          });
        });
      });
    });
    return rows;
  };

  const buildMasterParticipantExcelRows = (groups: any[]) => {
    return groups.map((participant: any) => {
      const raw = participant.raw || participant;
      const details = getMasterParticipantEventDetails(participant);
      const resultSummary = details.flatMap((event: any) =>
        event.races
          .filter((raceInfo: any) => raceInfo.assigned || raceInfo.rank)
          .map((raceInfo: any) => {
            const rankText = raceInfo.rank ? `Rang ${raceInfo.rank}` : "angemeldet";
            return `${event.name || "Rennen"} ${event.year || ""} ${raceInfo.race}: ${rankText}`.replace(/\s+/g, " ").trim();
          }),
      ).join(" | ");
      const overallSummary = details
        .filter((event: any) => !!event.overall)
        .map((event: any) => `${event.name || "Rennen"}: Rang ${event.overall.rank} · ${event.overall.total} Punkte`)
        .join(" | ");

      return {
        "Teilnehmer ID": participant.participantId || participant.masterId || getParticipantStableId(raw),
        Name: participant.name || "",
        Startnummer: participant.plate || "",
        Verein: participant.club || "",
        Jahrgang: participant.birthYear || "",
        Geschlecht: participant.gender || "",
        Cruiser: formatExcelBoolean(getSpecialCategoryValue(raw) === CRUISER_CATEGORY),
        "Spezial-Kategorie": getSpecialCategoryValue(raw),
        Kategorie: getDerivedCategory(raw),
        Race1: formatExcelBoolean(raw.race1),
        Race2: formatExcelBoolean(raw.race2),
        Race3: formatExcelBoolean(raw.race3),
        Race4: formatExcelBoolean(raw.race4),
        Race5: formatExcelBoolean(raw.race5),
        Race6: formatExcelBoolean(raw.race6),
        Race7: formatExcelBoolean(raw.race7),
        Race8: formatExcelBoolean(raw.race8),
        Race9: formatExcelBoolean(raw.race9),
        Race10: formatExcelBoolean(raw.race10),
        "Resultate Übersicht": resultSummary,
        "Gesamtwertung Übersicht": overallSummary,
      };
    });
  };

  const exportMasterParticipantsExcel = () => {
    const groups = getMasterParticipantGroups();
    if (groups.length === 0) {
      window.alert("Es sind keine aktiven Teilnehmer zum Exportieren vorhanden.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const participantRows = buildMasterParticipantExcelRows(groups);
    const participantWs = XLSX.utils.json_to_sheet(participantRows, { header: masterParticipantExcelHeaders });
    participantWs["!cols"] = [
      { wch: 40 }, { wch: 28 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 28 },
      ...Array.from({ length: 10 }, () => ({ wch: 8 })),
      { wch: 70 }, { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, participantWs, "Teilnehmer");

    const resultRows = buildMasterParticipantResultRows(groups);
    const resultWs = XLSX.utils.json_to_sheet(resultRows.length ? resultRows : [{ Hinweis: "Noch keine Resultate vorhanden" }]);
    resultWs["!cols"] = [
      { wch: 40 }, { wch: 28 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 28 }, { wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 28 },
    ];
    XLSX.utils.book_append_sheet(wb, resultWs, "Resultate");

    const infoRows = [
      { Feld: "Wichtig", Beschreibung: "Nur das Blatt Teilnehmer wird beim Import eingelesen. Das Blatt Resultate dient nur zur Kontrolle und wird nicht importiert." },
      { Feld: "Teilnehmer ID", Beschreibung: "Bestehende ID nicht ändern. Neue Teilnehmer können leer bleiben; beim Import wird automatisch eine neue Teilnehmer-ID vergeben." },
      { Feld: "Geschlecht", Beschreibung: "B für Boys / männlich, G für Girls / weiblich." },
      { Feld: "Cruiser und Race-Spalten", Beschreibung: "x, ja, yes, true oder 1 bedeutet aktiv." },
      { Feld: "Spezial-Kategorie", Beschreibung: "Optional: Cruiser, Plausch 1, Plausch 2 oder Plausch 3. Diese Kategorie übersteuert die automatische Alterskategorie." },
      { Feld: "Resultate", Beschreibung: "Resultate und Gesamtwertung bleiben in der App geschützt. Beim Import werden nur Stammdaten synchronisiert." },
    ];
    const infoWs = XLSX.utils.json_to_sheet(infoRows);
    infoWs["!cols"] = [{ wch: 24 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, infoWs, "Anleitung");

    const safeDate = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `BMX-Teilnehmer-Hauptdatenbank_${safeDate}.xlsx`);
    addChangeLog("Teilnehmer-Hauptdatenbank Excel exportiert");
  };

  const downloadExcelTemplate = () => {
    const rows = [
      { "Teilnehmer ID": "", Name: "Max Muster", Startnummer: "23", Verein: "BMX Club", Jahrgang: "2014", Geschlecht: "B", Cruiser: "", "Spezial-Kategorie": "", Kategorie: "", Race1: "x", Race2: "x", Race3: "", Race4: "", Race5: "", Race6: "", Race7: "", Race8: "", Race9: "", Race10: "", "Resultate Übersicht": "", "Gesamtwertung Übersicht": "" },
      { "Teilnehmer ID": "", Name: "Lina Beispiel", Startnummer: "41", Verein: "BMX Club", Jahrgang: "2015", Geschlecht: "G", Cruiser: "x", "Spezial-Kategorie": "Cruiser", Kategorie: "", Race1: "x", Race2: "", Race3: "", Race4: "", Race5: "", Race6: "", Race7: "", Race8: "", Race9: "", Race10: "", "Resultate Übersicht": "", "Gesamtwertung Übersicht": "" },
    ];
    const ws = XLSX.utils.json_to_sheet(rows, { header: masterParticipantExcelHeaders });
    ws["!cols"] = [{ wch: 40 }, { wch: 28 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 28 }, ...Array.from({ length: 10 }, () => ({ wch: 8 })), { wch: 40 }, { wch: 35 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Teilnehmer");
    XLSX.writeFile(wb, "BMX-Teilnehmer-Vorlage.xlsx");
    addChangeLog("Teilnehmer Excel-Vorlage heruntergeladen");
  };

  const handleMasterParticipantsExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheetName = wb.SheetNames.includes("Teilnehmer") ? "Teilnehmer" : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
      const importRows = rows.filter((row: any) =>
        String(getExcelCell(row, ["Name"])).trim() ||
        String(getExcelCell(row, ["Startnummer", "Plate", "Nummer"])).trim() ||
        String(getExcelCell(row, ["Teilnehmer ID", "Participant ID", "ID"])).trim(),
      );

      if (importRows.length === 0) {
        window.alert("Im Excel wurden keine Teilnehmerdaten gefunden.");
        return;
      }

      const allRows = (await db.table("riders").toArray()).map(normalizeRider);
      const activeRows = allRows.filter((rider: any) => !rider.deletedAt);
      const byStableId = new Map<string, any[]>();
      const byMasterKey = new Map<string, any[]>();
      activeRows.forEach((rider: any) => {
        const stableId = getParticipantStableId(rider);
        if (stableId) byStableId.set(stableId, [...(byStableId.get(stableId) || []), rider]);
        const key = getMasterParticipantKey(rider);
        byMasterKey.set(key, [...(byMasterKey.get(key) || []), rider]);
      });

      const preparedRows = importRows.map((row: any) => {
        const name = String(getExcelCell(row, ["Name", "Teilnehmer", "Fahrer"])).trim();
        const plate = String(getExcelCell(row, ["Startnummer", "Plate", "Nummer"])).trim();
        const club = String(getExcelCell(row, ["Verein", "Club"])).trim();
        const birthYear = parseExcelYear(getExcelCell(row, ["Jahrgang", "BirthYear", "Geburtsjahr"]));
        const genderRaw = String(getExcelCell(row, ["Geschlecht", "Gender"])).trim().toUpperCase();
        const gender = genderRaw.startsWith("G") || genderRaw.startsWith("W") || genderRaw.startsWith("F") ? "G" : genderRaw.startsWith("B") || genderRaw.startsWith("M") ? "B" : genderRaw;
        const cruiser = parseExcelBoolean(getExcelCell(row, ["Cruiser"]));
        const categoryFromExcel = String(getExcelCell(row, ["Kategorie", "Category"])).trim();
        const specialCategory = normalizeSpecialCategoryValue(getExcelCell(row, ["Spezial-Kategorie", "SpezialKategorie", "Special Category", "Plausch"])) || normalizeSpecialCategoryValue(categoryFromExcel) || (cruiser ? CRUISER_CATEGORY : "");
        const participantId = String(getExcelCell(row, ["Teilnehmer ID", "Participant ID", "ID"])).trim();
        const racePatch = Object.fromEntries(RACES.map((race) => [raceKeyMap[race], parseExcelBoolean(getExcelCell(row, [race.replace(" ", ""), race, raceKeyMap[race]]))]));
        const specialPatch = {
          cruiser: specialCategory === CRUISER_CATEGORY,
          isCruiser: specialCategory === CRUISER_CATEGORY,
          specialCategory,
          plauschCategory: isPlauschCategory(specialCategory) ? specialCategory : "",
        };
        const patch = {
          name,
          plate,
          club,
          birthYear,
          jahrgang: birthYear,
          gender,
          geschlecht: gender,
          ...specialPatch,
          category: getDerivedCategory({ birthYear, gender, geschlecht: gender, jahrgang: birthYear, category: categoryFromExcel, ...specialPatch }),
          ...racePatch,
        };
        const key = getMasterParticipantKey(patch);
        const matchedById = participantId ? byStableId.get(participantId) || [] : [];
        const matchedByKey = !matchedById.length ? byMasterKey.get(key) || [] : [];
        return { row, patch, participantId, existingRows: matchedById.length ? matchedById : matchedByKey };
      });

      const updateCount = preparedRows.filter((entry) => entry.existingRows.length > 0).length;
      const newCount = preparedRows.length - updateCount;
      if (!window.confirm(`Teilnehmer aus Excel importieren?\n\nDatei: ${file.name}\nAktualisieren: ${updateCount}\nNeu anlegen: ${newCount}\n\nBestehende Resultate werden nicht überschrieben. Stammdaten werden über die Teilnehmer-ID synchronisiert.`)) return;

      await exportBackup("Sicherheitsbackup vor Teilnehmer-Excel-Import");

      let created = 0;
      let updated = 0;
      for (const entry of preparedRows) {
        const existingRows = entry.existingRows;
        if (existingRows.length > 0) {
          const representative = existingRows.find((rider: any) => rider.eventId === "master") || existingRows[0];
          const stableId = entry.participantId || getParticipantStableId(representative);
          const edited = {
            ...representative,
            ...entry.patch,
            participantId: stableId,
            masterId: stableId,
            eventId: representative.eventId || "master",
          };
          await db.table("riders").update(representative.id, getRiderSharedDataPatch(edited));
          await db.table("riders").update(representative.id, { participantId: stableId, masterId: stableId });
          await syncRiderSharedDataToAllReferences(representative, edited);
          updated += 1;
        } else {
          const stableId = entry.participantId || crypto.randomUUID();
          const id = crypto.randomUUID();
          await db.table("riders").add({
            id,
            participantId: stableId,
            masterId: stableId,
            eventId: "master",
            ...entry.patch,
          });
          created += 1;
        }
      }

      await loadMasterParticipants();
      await loadAllRiders();
      await loadRaceRiders();
      setBackupMessage(`Teilnehmer-Excel importiert: ${updated} aktualisiert, ${created} neu angelegt.`);
      addChangeLog(`Teilnehmer-Excel importiert: ${updated} aktualisiert, ${created} neu`);
    } catch (error: any) {
      window.alert(`Teilnehmer-Excel Import fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
    }
  };

  const scrollHome = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const riderTableStyle: React.CSSProperties = {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "80px minmax(160px, 1fr) 95px minmax(130px, 0.8fr)",
    gap: 10,
    alignItems: "center",
  };

  const riderTableHeaderStyle: React.CSSProperties = {
    ...riderTableStyle,
    fontWeight: 800,
    color: colors.title,
    borderBottom: "1px solid #d8e0e6",
    paddingBottom: 6,
    marginBottom: 4,
  };

  const riderTableRowStyle: React.CSSProperties = {
    ...riderTableStyle,
    minHeight: ROW_HEIGHT,
    overflow: "hidden",
  };

  const renderRiderTableHeader = () => (
    <div style={riderTableHeaderStyle}>
      <div>Plate</div>
      <div>Name</div>
      <div>Jg | B/G</div>
      <div>Verein</div>
    </div>
  );

  const renderRiderCells = (r: any) => (
    <div style={riderTableRowStyle}>
      <div style={{ fontWeight: 800 }}>#{r.plate}</div>
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <div>{r.name}</div>
        <div style={{ color: colors.muted, fontSize: 11, fontFamily: "monospace" }}>ID: {getParticipantStableId(r).slice(0, 8) || "-"}</div>
      </div>
      <div>{getRiderMetaLabel(r)}</div>
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {r.club || "-"}
      </div>
    </div>
  );

  const getStorageKey = (suffix: string) =>
    scopedKey(`bmx_${selectedRace.toLowerCase().replace(/\s+/g, "_")}_${suffix}`);

  const getRaceStorageKey = (race: RaceName, suffix: string) =>
    scopedKey(`bmx_${race.toLowerCase().replace(/\s+/g, "_")}_${suffix}`);

  const saveAppData = async (key: string, value: any) => {
    const storageKey = scopedKey(key);
    await db.table("appData").put({ key: storageKey, value });
  };

  const loadAppData = async <T,>(key: string, fallback: T): Promise<T> => {
    const storageKey = scopedKey(key);
    const saved = await db.table("appData").get(storageKey);
    if (saved && Object.prototype.hasOwnProperty.call(saved, "value"))
      return saved.value as T;

    const localValue = appStorage.getItem(storageKey);
    if (localValue === null) return fallback;

    try {
      return JSON.parse(localValue) as T;
    } catch {
      return localValue as T;
    }
  };

  const saveBoth = async (key: string, value: any) => {
    const storageKey = scopedKey(key);
    appStorage.setItem(storageKey, encodeStorageValue(value));
    await saveAppData(key, value);
  };

  const belongsToCurrentEvent = (rider: any) => {
    if (!currentEventId || currentEventId === "legacy") return !rider.eventId || rider.eventId === "legacy";
    return rider.eventId === currentEventId;
  };

  const loadAllRiders = async () => {
    const all = (await db.table("riders").toArray()).map(normalizeRider).filter((r: any) => !r.deletedAt).filter(belongsToCurrentEvent);

    setAllRiders(sortRidersByCategoryAndName(all));
  };

  const loadRaceRiders = async () => {
    const all = (await db.table("riders").toArray()).map(normalizeRider).filter((r: any) => !r.deletedAt).filter(belongsToCurrentEvent);
    const flag = raceKeyMap[selectedRace];

    const filtered = all.filter((r: any) => !!r[flag]);

    setRiders(sortRidersByCategoryAndName(filtered));
    setAllRiders(sortRidersByCategoryAndName(all));
  };

  useEffect(() => {
    try {
      const saved = appStorage.getItem(STORAGE_KEYS.duplicateOkKeys);
      if (saved) setDuplicateOkKeys(JSON.parse(saved));
    } catch {
      setDuplicateOkKeys([]);
    }
  }, []);

  useEffect(() => {
    signOutFirebaseAuth();
    setFirebaseAuthSession(null);
    setOnlineStorageAuthToken("");
    setFirebaseAuthPassword("");
    setFirebaseAuthMessage("");
    setFirebaseAuthReady(true);
  }, []);

  useEffect(() => {
    if (!editingRider) return;
    const shouldScrollToForm = viewMode === "participants" || appShellView === "masterParticipants";
    if (!shouldScrollToForm) return;
    window.setTimeout(() => {
      participantFormRef.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    }, 60);
  }, [editingRider?.id, viewMode, appShellView]);

  useEffect(() => {
    setParticipantSpecialCategoryDraft(editingRider ? getSpecialCategoryValue(editingRider) : "");
    setParticipantSpecialCategoryDraftDirty(false);
  }, [editingRider?.id]);

  useEffect(() => {
    const existing = getRawManagedEvents();
    if (existing.length > 0) {
      saveManagedEvents(existing);
      return;
    }
    const legacyEvent: ManagedEvent = {
      id: "legacy",
      type: "series",
      name: "Bestehende Rennserie",
      year: new Date().getFullYear(),
      createdAt: new Date().toISOString(),
    };
    saveManagedEvents([legacyEvent]);
  }, []);

  useEffect(() => {
    if (appShellView !== "manager" || !currentEventId) return;
    if (!managedEvents.some((event) => event.id === currentEventId)) {
      setInitialLoaded(false);
      setHasUnsavedChanges(false);
      resetCurrentEventState();
      setCurrentEventId("");
      setAppShellView("events");
      setViewMode("dashboard");
      return;
    }
    const loadInitialData = async () => {
      const allSavedAppData = await db.table("appData").toArray();
      allSavedAppData.forEach((row: any) => {
        if (!row?.key) return;
        appStorage.setItem(row.key, encodeStorageValue(row.value));
      });

      const savedRace = await loadAppData<string>(
        "bmx_selected_race",
        "Race 1",
      );
      if (savedRace && RACES.includes(savedRace as RaceName)) {
        setSelectedRace(savedRace as RaceName);
      }

      const savedOverallOrder = await loadAppData<Record<string, string[]>>(
        "bmx_overall_manual_order",
        {},
      );
      const savedParticipantEventYear = await loadAppData<string>(
        "bmx_participant_event_year",
        String(new Date().getFullYear()),
      );
      const savedGeneratedOverall = await loadAppData<Record<string, any[]>>(
        "bmx_generated_overall",
        {},
      );
      const savedChangeLog = await loadAppData<string[]>("bmx_change_log", []);
      const savedOverallLocked = await loadAppData<boolean>("bmx_overall_locked", false);
      const savedOverallCreatedAt = await loadAppData<string>("bmx_overall_created_at", "");
      const savedBackupHistory = await loadAppData<any[]>("bmx_backup_history", []);
      const savedLastSaveAt = await loadAppData<string>("bmx_last_save_at", "");
      const savedLastOnlineSaveAt = await loadAppData<string>("bmx_last_online_save_at", "");
      const savedHomeEventSeries = await loadAppData<string>("bmx_home_event_series", "");
      const savedSeriesRaceCount = await loadAppData<number>("bmx_series_race_count", 4);
      const savedOverallCountingRaces = await loadAppData<number>("bmx_overall_counting_races", 3);
      const savedGlobalEventLogo = await loadAppData<string>("bmx_event_logo", "");
      const eventForLoad = managedEvents.find((event) => event.id === currentEventId) || null;
      const normalizedRaceCount = eventForLoad?.type === "single"
        ? 1
        : Math.max(1, Math.min(10, Number(savedSeriesRaceCount) || 4));
      const normalizedCountingRaces = eventForLoad?.type === "single"
        ? 1
        : Math.max(1, Math.min(normalizedRaceCount, Number(savedOverallCountingRaces) || 3));
      setHomeEventSeries(savedHomeEventSeries || eventForLoad?.name || "");
      setSeriesRaceCount(normalizedRaceCount);
      setOverallCountingRaces(normalizedCountingRaces);
      setEventLogo(savedGlobalEventLogo || "");
      setBackupHistory(Array.isArray(savedBackupHistory) ? savedBackupHistory : []);
      setLastSaveAt(savedLastSaveAt || "");
      setLastOnlineSaveAt(savedLastOnlineSaveAt || "");
      setChangeLog(savedChangeLog || []);
      setOverallLocked(!!savedOverallLocked);
      setOverallCreatedAt(savedOverallCreatedAt || "");
      setOverallManualOrder(savedOverallOrder || {});
      setGeneratedOverallByCategory(savedGeneratedOverall || {});
      setParticipantEventYear(
        savedParticipantEventYear || String(new Date().getFullYear()),
      );
      setInitialLoaded(true);
    };

    loadInitialData();
  }, [appShellView, currentEventId, managedEvents]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_selected_race", selectedRace);
  }, [selectedRace, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_overall_manual_order", overallManualOrder);
  }, [overallManualOrder, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_generated_overall", generatedOverallByCategory);
  }, [generatedOverallByCategory, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_overall_locked", overallLocked);
  }, [overallLocked, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_overall_created_at", overallCreatedAt);
  }, [overallCreatedAt, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_backup_history", backupHistory);
  }, [backupHistory, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_home_event_series", homeEventSeries);
  }, [homeEventSeries, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_series_race_count", seriesRaceCount);
    if (!activeRaces.includes(selectedRace)) {
      setSelectedRace(activeRaces[activeRaces.length - 1] || "Race 1");
    }
  }, [seriesRaceCount, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    const nextCounting = Math.max(1, Math.min(overallCountingRaces, seriesRaceCount));
    if (nextCounting !== overallCountingRaces) setOverallCountingRaces(nextCounting);
    saveBoth("bmx_overall_counting_races", nextCounting);
  }, [overallCountingRaces, seriesRaceCount, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_series_locked", seriesLocked);
  }, [seriesLocked, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_series_templates", seriesTemplates);
  }, [seriesTemplates, initialLoaded]);

  useEffect(() => {
    if (appShellView === "masterParticipants" || appShellView === "events") {
      loadMasterParticipants();
    }
  }, [appShellView, managedEvents]);

  useEffect(() => {
    const loadEventTileCounts = async () => {
      const all = (await db.table("riders").toArray()).map(normalizeRider).filter((rider: any) => !rider.deletedAt);
      const nextCounts: Record<string, { total: number; races: Record<string, number> }> = {};
      managedEvents.forEach((event) => {
        const eventId = normalizeEventIdForCount(event.id);
        const eventRiders = all.filter((rider: any) => normalizeEventIdForCount(rider.eventId) === eventId && normalizeEventIdForCount(rider.eventId) !== "master");
        const totalIds = new Set<string>();
        eventRiders.forEach((rider: any) => totalIds.add(getRiderCountId(rider)));
        const raceCounts: Record<string, number> = {};
        RACES.forEach((race) => {
          const flag = raceKeyMap[race];
          const raceIds = new Set<string>();
          eventRiders.forEach((rider: any) => {
            if (rider[flag] === true) raceIds.add(getRiderCountId(rider));
          });
          raceCounts[race] = raceIds.size;
        });
        nextCounts[eventId] = { total: totalIds.size, races: raceCounts };
      });
      setEventTileCounts(nextCounts);
    };

    if (appShellView === "events" || appShellView === "masterParticipants") {
      loadEventTileCounts();
    }
  }, [appShellView, managedEvents, masterParticipants]);

  useEffect(() => {
    if (appShellView === "manager" && viewMode === "participants") {
      loadMasterParticipants();
    }
  }, [appShellView, viewMode, currentEventId]);

  useEffect(() => {
    if (!initialLoaded || appShellView !== "manager") return;
    setHasUnsavedChanges(true);
  }, [
    allRiders,
    heats,
    results,
    finals,
    finalResults,
    overallManualOrder,
    generatedOverallByCategory,
    cruiserMergeTarget,
    categoryMergeTargets,
    participantEventYear,
    homeEventSeries,
    eventSeries,
    eventLocation,
    eventDate,
    seriesRaceCount,
    overallCountingRaces,
    raceClosed,
    initialLoaded,
    appShellView,
  ]);


  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_participant_event_year", participantEventYear);
    loadAllRiders();
    loadRaceRiders();
  }, [participantEventYear, initialLoaded]);

  useEffect(() => {
    if (!initialLoaded || !currentEventId) return;
    ensureCurrentEventRiderIdentities().then((changed) => {
      if (changed > 0) {
        loadMasterParticipants();
        loadAllRiders();
        loadRaceRiders();
      }
    });
  }, [initialLoaded, currentEventId]);

  useEffect(() => {
    if (!initialLoaded) return;

    let cancelled = false;
    setLoadedRace(null);
    loadRaceRiders();

    const loadRaceData = async () => {
      const nextEventSeries = await loadAppData<string>(
        getStorageKey("event_series"),
        "",
      );
      const nextEventLocation = await loadAppData<string>(
        getStorageKey("event_location"),
        "",
      );
      const nextEventDate = await loadAppData<string>(
        getStorageKey("event_date"),
        "",
      );
      const legacyRaceLogo = await loadAppData<string>(
        getStorageKey("event_logo"),
        "",
      );
      const nextHeats = await loadAppData<any>(getStorageKey("heats"), {});
      const nextResults = await loadAppData<any>(getStorageKey("results"), {});
      const nextFinals = await loadAppData<any>(getStorageKey("finals"), {});
      const nextFinalResults = await loadAppData<any>(
        getStorageKey("final_results"),
        {},
      );
      const nextFinalManualOrder = await loadAppData<Record<string, string[]>>(
        getStorageKey("final_manual_order"),
        {},
      );
      const nextCruiserMergeTarget = await loadAppData<string>(
        getStorageKey("cruiser_merge_target"),
        "",
      );
      const nextCategoryMergeTargets = await loadAppData<Record<string, string>>(
        getStorageKey("category_merge_targets"),
        {},
      );
      const nextRaceClosed = await loadAppData<boolean>(
        getStorageKey("race_closed"),
        false,
      );

      if (cancelled) return;

      setEventSeries(nextEventSeries || "");
      setEventLocation(nextEventLocation || "");
      setEventDate(nextEventDate || "");
      setEventLogo((current) => current || legacyRaceLogo || "");
      setHeats(nextHeats || {});
      setResults(nextResults || {});
      setFinals(nextFinals || {});
      setFinalResults(nextFinalResults || {});
      setFinalManualOrder(nextFinalManualOrder || {});
      setCruiserMergeTarget(nextCruiserMergeTarget || "");
      setCategoryMergeTargets(nextCategoryMergeTargets && typeof nextCategoryMergeTargets === "object" ? nextCategoryMergeTargets : {});
      setRaceClosed(!!nextRaceClosed);
      setSelectedRiderInfo(null);
      setLoadedRace(selectedRace);
    };

    loadRaceData();

    return () => {
      cancelled = true;
    };
  }, [selectedRace, initialLoaded]);

  const canSaveRaceData = initialLoaded && loadedRace === selectedRace;

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("event_series"), eventSeries);
  }, [eventSeries, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("event_location"), eventLocation);
  }, [eventLocation, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("event_date"), eventDate);
  }, [eventDate, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_event_logo", eventLogo || "");
  }, [eventLogo, initialLoaded]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("heats"), heats);
  }, [heats, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("results"), results);
  }, [results, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("finals"), finals);
  }, [finals, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("final_results"), finalResults);
  }, [finalResults, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("final_manual_order"), finalManualOrder);
  }, [finalManualOrder, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("cruiser_merge_target"), cruiserMergeTarget);
  }, [cruiserMergeTarget, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("category_merge_targets"), categoryMergeTargets);
  }, [categoryMergeTargets, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("race_closed"), raceClosed);
  }, [raceClosed, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_change_log", changeLog);
  }, [changeLog, initialLoaded]);

  const deleteRider = async (id: string) => {
    if (!window.confirm("Teilnehmer in den Papierkorb verschieben?")) return;
    await exportBackup("Sicherheitsbackup vor Teilnehmer-Papierkorb");
    await db.table("riders").update(id, { deletedAt: new Date().toISOString() });
    if (editingRider?.id === id) setEditingRider(null);
    await loadMasterParticipants();
    await loadAllRiders();
    await loadRaceRiders();
    addChangeLog("Teilnehmer in Papierkorb verschoben");
  };

  const deleteAllRiders = async () => {
    if (
      !window.confirm(
        `Alle Teilnehmer in diesem Rennen / dieser Rennserie endgültig löschen?

Zugehörige Motos, Resultate, Finals und Gesamtwertungsdaten dieses Eintrags werden ebenfalls entfernt. Vorher wird automatisch ein komplettes Sicherheitsbackup erstellt.`,
      )
    )
      return;
    await exportBackup("Sicherheitsbackup vor Teilnehmer-Löschung im Rennen");
    const allBeforeDelete = (await db.table("riders").toArray()).map(normalizeRider);
    const currentIds = allBeforeDelete.filter(belongsToCurrentEvent).map((r: any) => r.id).filter(Boolean);
    if (currentIds.length > 0) await db.table("riders").bulkDelete(currentIds);
    setEditingRider(null);
    setAllRiders([]);
    setRiders([]);
    setHeats({});
    setResults({});
    setFinals({});
    setFinalResults({});
    setOverallManualOrder({});
    setGeneratedOverallByCategory({});
    addChangeLog("Alle Teilnehmer und zugehörigen Renn-/Resultatdaten dieses Rennens gelöscht");
  };

  const deleteAllRaceAssignments = async () => {
    if (!window.confirm(`${selectedRace}: Race-Zuordnungen wirklich löschen?`))
      return;
    const all = (await db.table("riders").toArray()).map(normalizeRider).filter((r: any) => !r.deletedAt).filter(belongsToCurrentEvent);
    const flag = raceKeyMap[selectedRace];

    for (const rider of all) {
      await db.table("riders").update(rider.id, { [flag]: false });
    }

    setRiders([]);
    setHeats({});
    setResults({});
    setFinals({});
    setFinalResults({});
    await loadAllRiders();
    await loadRaceRiders();
    addChangeLog(`${selectedRace}: Race-Zuordnungen gelöscht`);
  };

  const isCruiserCategory = (category: string) =>
    String(category || "")
      .toLowerCase()
      .includes("cruiser");

  const originalRaceCategories = () =>
    sortCategories(
      Array.from(new Set(riders.map((r: any) => r.category).filter(Boolean))),
    );

  const mergeableCruiserTargets = useMemo(() => {
    return originalRaceCategories().filter((cat) => !isCruiserCategory(cat));
  }, [riders]);

  const getMergeableTargetsForCategory = (category: string) =>
    originalRaceCategories().filter((cat) => cat !== category);

  const getCategoryMergeTarget = (category: string) => {
    const generalTarget = String(categoryMergeTargets[category] || "");
    const legacyCruiserTarget = isCruiserCategory(category) ? String(cruiserMergeTarget || "") : "";
    const target = generalTarget || legacyCruiserTarget;
    return getMergeableTargetsForCategory(category).includes(target) ? target : "";
  };

  const setCategoryMergeTarget = (category: string, target: string) => {
    setCategoryMergeTargets((prev) => {
      const next = { ...prev };
      if (target) next[category] = target;
      else delete next[category];
      return next;
    });
    if (isCruiserCategory(category)) setCruiserMergeTarget(target);
  };

  const getEffectiveHeatCategory = (category: string) => {
    const target = getCategoryMergeTarget(category);
    return target || category;
  };

  const getEffectiveFinalCategory = (category: string) =>
    getEffectiveHeatCategory(category);

  const getFinalRaceCategories = () =>
    sortCategories(
      Array.from(
        new Set(
          originalRaceCategories().map((cat) => getEffectiveFinalCategory(cat)),
        ),
      ),
    );

  const getOriginalCategoriesForFinalRaceCategory = (finalCategory: string) =>
    originalRaceCategories().filter(
      (cat) => getEffectiveFinalCategory(cat) === finalCategory,
    );

  const getEffectiveRaceCategoryCounts = (items: any[]) => {
    const counts: Record<string, number> = {};
    (items || []).forEach((rider: any) => {
      const category = getEffectiveHeatCategory(rider.category || "Ohne Kategorie");
      counts[category] = (counts[category] || 0) + 1;
    });
    return counts;
  };

  const getTooLargeRaceCategories = (items: any[]) =>
    Object.entries(getEffectiveRaceCategoryCounts(items))
      .filter(([, count]) => count > MAX_RIDERS_PER_RACE_CATEGORY)
      .map(([category, count]) => ({ category, count }));

  const hasDnsStatus = (row: any) => String(row?.status || "").toUpperCase() === "DNS";

  const createStartListRows = (rows: any[]) =>
    (rows || []).map((row: any, index: number) => ({
      ...row,
      startPos: index + 1,
      riderId: String(row.riderId || row.id || ""),
    }));

  const buildSemiFinalProgram = (ranking: any[]) => {
    const top16 = ranking.slice(0, 16);
    const remaining = ranking.slice(16, MAX_RIDERS_PER_RACE_CATEGORY);
    const semi1Indexes = [0, 3, 4, 7, 8, 11, 12, 15];
    const semi2Indexes = [1, 2, 5, 6, 9, 10, 13, 14];
    const program: Record<string, any[]> = {
      "Halbfinal 1": createStartListRows(semi1Indexes.map((index) => top16[index]).filter(Boolean)),
      "Halbfinal 2": createStartListRows(semi2Indexes.map((index) => top16[index]).filter(Boolean)),
    };

    // C- und D-Finals werden bewusst noch nicht freigeschaltet.
    // Sie werden erst nach vollständig erfassten Halbfinalresultaten zusammen mit B- und A-Final erzeugt.
    return program;
  };

  const isSemifinalProgram = (rounds: Record<string, any[]> | undefined) =>
    !!rounds?.["Halbfinal 1"] || !!rounds?.["Halbfinal 2"];

  const sortSemiFinalRowsForQualification = (rows: any[]) =>
    sortRaceResultRows((rows || []).filter((row: any) => !hasDnsStatus(row)));

  const getCombinedFinalRanking = (finalCategory: string) => {
    const combined: any[] = [];

    getOriginalCategoriesForFinalRaceCategory(finalCategory).forEach(
      (originalCategory) => {
        getRanking(originalCategory).forEach((row: any) => {
          combined.push({
            ...row,
            originalCategory,
            category: originalCategory,
          });
        });
      },
    );

    return combined.sort((a: any, b: any) => {
      if (a.total !== b.total) return a.total - b.total;
      if ((a.runs?.[2] || 99) !== (b.runs?.[2] || 99))
        return (a.runs?.[2] || 99) - (b.runs?.[2] || 99);
      if ((a.runs?.[1] || 99) !== (b.runs?.[1] || 99))
        return (a.runs?.[1] || 99) - (b.runs?.[1] || 99);
      return String(a.name).localeCompare(String(b.name), "de-CH", {
        numeric: true,
      });
    });
  };

  const getRoundDisplayName = (roundName: string) =>
    roundName === "4. Vorlauf" ? "4. Moto" : roundName;

  const getFinalCategoryLabel = (finalCategory: string) => {
    const originals = getOriginalCategoriesForFinalRaceCategory(finalCategory);
    if (originals.length <= 1) return finalCategory;
    return `${finalCategory} + ${originals.filter((cat) => cat !== finalCategory).join(" + ")}`;
  };

  type RaceFlowEntry = {
    key: string;
    type: "moto" | "final";
    category: string;
    label: string;
    sectionId: string;
    startList: any[];
    result: any[];
  };

  const isCompleteRaceEntry = (startList: any[] = [], result: any[] = []) =>
    startList.length > 0 && result.length >= startList.length;

  const getMotoEntryKey = (cat: string, runIndex: number, heatIndex: number) =>
    `moto|${cat}_${runIndex}_${heatIndex}`;

  const getFinalEntryKey = (cat: string, roundName: string) =>
    `final|${cat}_${roundName}`;

  const getRaceFlowSectionId = (entryKey: string) =>
    `race-flow-${String(entryKey || "").replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const getFinalFlowRoundNames = (rounds: Record<string, any[]> | undefined, aFinalBlock = false) => {
    if (!rounds) return [] as string[];
    const order = aFinalBlock
      ? ["4. Vorlauf", "A-Final"]
      : ["Manuelle Rangliste", "Halbfinal 1", "Halbfinal 2", "D-Final", "C-Final", "B-Final"];
    return order.filter((roundName) => Array.isArray(rounds[roundName]) && rounds[roundName].length > 0);
  };

  const getRaceFlowEntries = (overrideResults?: any, overrideFinalResults?: any): RaceFlowEntry[] => {
    const resultData = overrideResults || results || {};
    const finalResultData = overrideFinalResults || finalResults || {};
    const entries: RaceFlowEntry[] = [];

    [0, 1, 2].forEach((runIndex) => {
      sortCategories(Object.keys(heats || {})).forEach((cat) => {
        ((heats?.[cat]?.[runIndex] || []) as any[]).forEach((group: any[], heatIndex: number) => {
          const resultKey = `${cat}_${runIndex}_${heatIndex}`;
          const entryKey = getMotoEntryKey(cat, runIndex, heatIndex);
          entries.push({
            key: entryKey,
            type: "moto",
            category: cat,
            label: `Moto ${runIndex + 1} · Race ${getSequentialHeatRaceNumber(heats, cat, runIndex, heatIndex)}`,
            sectionId: getRaceFlowSectionId(entryKey),
            startList: group || [],
            result: Array.isArray(resultData[resultKey]) ? resultData[resultKey] : [],
          });
        });
      });
    });

    const finalCategories = sortCategories(Object.keys(finals || {}));
    finalCategories.forEach((cat) => {
      getFinalFlowRoundNames(finals?.[cat], false).forEach((roundName) => {
        const resultKey = `${cat}_${roundName}`;
        const entryKey = getFinalEntryKey(cat, roundName);
        entries.push({
          key: entryKey,
          type: "final",
          category: cat,
          label: `${getRoundDisplayName(roundName)} · ${getFinalCategoryLabel(cat)}`,
          sectionId: getRaceFlowSectionId(entryKey),
          startList: finals?.[cat]?.[roundName] || [],
          result: Array.isArray(finalResultData[resultKey]) ? finalResultData[resultKey] : [],
        });
      });
    });
    finalCategories.forEach((cat) => {
      getFinalFlowRoundNames(finals?.[cat], true).forEach((roundName) => {
        const resultKey = `${cat}_${roundName}`;
        const entryKey = getFinalEntryKey(cat, roundName);
        entries.push({
          key: entryKey,
          type: "final",
          category: cat,
          label: `${getRoundDisplayName(roundName)} · ${getFinalCategoryLabel(cat)}`,
          sectionId: getRaceFlowSectionId(entryKey),
          startList: finals?.[cat]?.[roundName] || [],
          result: Array.isArray(finalResultData[resultKey]) ? finalResultData[resultKey] : [],
        });
      });
    });

    return entries;
  };

  const getFirstOpenRaceFlowEntry = (entries = getRaceFlowEntries()) =>
    entries.find((entry) => !isCompleteRaceEntry(entry.startList, entry.result));

  const getResolvedActiveRaceEntryKey = (entries = getRaceFlowEntries()) => {
    const active = entries.find((entry) => entry.key === activeRaceEntryKey);
    if (active && !isCompleteRaceEntry(active.startList, active.result)) return active.key;
    return getFirstOpenRaceFlowEntry(entries)?.key || "";
  };

  const getNextOpenRaceFlowEntryAfter = (currentKey: string, entries = getRaceFlowEntries()) => {
    const currentIndex = entries.findIndex((entry) => entry.key === currentKey);
    const ordered = currentIndex >= 0 ? entries.slice(currentIndex + 1) : entries;
    return ordered.find((entry) => !isCompleteRaceEntry(entry.startList, entry.result)) || getFirstOpenRaceFlowEntry(entries) || null;
  };

  const activateNextRaceFlowEntryAfter = (currentKey: string, overrideResults?: any, overrideFinalResults?: any) => {
    const entries = getRaceFlowEntries(overrideResults, overrideFinalResults);
    const next = getNextOpenRaceFlowEntryAfter(currentKey, entries);
    setActiveRaceEntryKey(next?.key || "");
    if (next?.sectionId) {
      window.setTimeout(() => scrollToSection(`${next.sectionId}-input`, "center"), 260);
    }
  };

  const isRaceFlowEntryActive = (entryKey: string) =>
    getResolvedActiveRaceEntryKey() === entryKey;

  const isRaceFlowEntryAtGate = (entryKey: string) => {
    const entries = getRaceFlowEntries();
    const activeKey = getResolvedActiveRaceEntryKey(entries);
    const activeIndex = entries.findIndex((entry) => entry.key === activeKey);
    if (activeIndex < 0) return false;
    const nextOpen = entries.slice(activeIndex + 1).find((entry) => !isCompleteRaceEntry(entry.startList, entry.result));
    return nextOpen?.key === entryKey;
  };

  const getRaceFlowBadgeLabel = (entryKey: string, complete: boolean) => {
    if (complete) return "abgeschlossen";
    if (isRaceFlowEntryActive(entryKey)) return "läuft jetzt";
    if (isRaceFlowEntryAtGate(entryKey)) return "ans Gate";
    return "wartet";
  };

  const getRaceFlowWrapperStyle = (base: React.CSSProperties, entryKey: string, complete: boolean): React.CSSProperties => {
    if (isRaceFlowEntryActive(entryKey)) {
      return {
        ...base,
        border: `4px solid ${colors.blueBtn}`,
        background: "#eaf2ff",
        boxShadow: "0 10px 26px rgba(37,99,235,0.18)",
      };
    }
    if (isRaceFlowEntryAtGate(entryKey)) {
      return {
        ...base,
        border: `4px solid ${colors.redBtn}`,
        background: "#fff1f1",
        boxShadow: "0 10px 26px rgba(220,38,38,0.14)",
      };
    }
    if (complete) {
      return { ...base, opacity: 0.92 };
    }
    return base;
  };

  const getRaceFlowBadgeStyle = (entryKey: string, complete: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 96,
      padding: "5px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 1000,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    };
    if (complete) return { ...base, background: colors.greenBg, color: colors.greenBtn, border: `1px solid ${colors.greenBorder}` };
    if (isRaceFlowEntryActive(entryKey)) return { ...base, background: colors.blueBtn, color: "#fff", border: `1px solid ${colors.blueBtn}` };
    if (isRaceFlowEntryAtGate(entryKey)) return { ...base, background: colors.redBtn, color: "#fff", border: `1px solid ${colors.redBtn}` };
    return { ...base, background: colors.grayBtn, color: colors.grayBtnText, border: `1px solid ${colors.cardBorder}` };
  };

  useEffect(() => {
    const availableCategories = originalRaceCategories();
    setCategoryMergeTargets((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      (Object.entries(prev || {}) as [string, string][]).forEach(([category, target]) => {
        if (availableCategories.includes(category) && target && availableCategories.includes(target) && target !== category) {
          next[category] = target;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (cruiserMergeTarget && !mergeableCruiserTargets.includes(cruiserMergeTarget)) setCruiserMergeTarget("");
  }, [riders, cruiserMergeTarget, mergeableCruiserTargets]);

  useEffect(() => {
    const entries = getRaceFlowEntries();
    if (entries.length === 0) {
      if (activeRaceEntryKey) setActiveRaceEntryKey("");
      return;
    }
    const active = entries.find((entry) => entry.key === activeRaceEntryKey);
    if (!active || isCompleteRaceEntry(active.startList, active.result)) {
      const firstOpen = getFirstOpenRaceFlowEntry(entries);
      const nextKey = firstOpen?.key || "";
      if (nextKey !== activeRaceEntryKey) setActiveRaceEntryKey(nextKey);
    }
  }, [heats, results, finals, finalResults, selectedRace]);

  const getDuplicatePlateKey = (category: string, plate: string) =>
    `${String(category || "Ohne Kategorie").trim()}|||${String(plate || "").trim()}`;

  const getDuplicatePlateGroups = (items: any[]) => {
    const plateMap = new Map<
      string,
      { category: string; plate: string; names: string[]; ids: string[] }
    >();

    items.forEach((r: any) => {
      const plate = String(r.plate || "").trim();
      if (!plate) return;

      const category = String(r.category || "Ohne Kategorie").trim();
      const key = getDuplicatePlateKey(category, plate);
      const entry = plateMap.get(key) || {
        category,
        plate,
        names: [],
        ids: [],
      };
      entry.names.push(String(r.name || "Ohne Name").trim());
      entry.ids.push(String(r.id || ""));
      plateMap.set(key, entry);
    });

    return Array.from(plateMap.values()).filter(
      (entry) => entry.names.length > 1,
    );
  };

  const getRiderValidationIssues = (items: any[]) => {
    const missing: string[] = [];

    items.forEach((r: any) => {
      const name = String(r.name || "").trim();
      const plate = String(r.plate || "").trim();
      const birthYear = getRiderBirthYear(r);
      const gender = getRiderGenderCode(r);

      if (!name || !plate || !birthYear || !gender) {
        missing.push(
          `${name || "Ohne Name"}${plate ? ` (#${plate})` : ""}: ${[
            !name ? "Name" : "",
            !plate ? "Plate" : "",
            !birthYear ? "Jahrgang" : "",
            !gender ? "B/G" : "",
          ]
            .filter(Boolean)
            .join(", ")}`,
        );
      }
    });

    const duplicates = getDuplicatePlateGroups(items).map(
      (entry) =>
        `${entry.category} - #${entry.plate}: ${entry.names.join(", ")}`,
    );

    return { missing, duplicates };
  };

  const validateSelectedRaceBeforeBuild = () => {
    const issues = getRiderValidationIssues(riders);

    if (issues.missing.length > 0) {
      alert(
        [
          "Bitte fehlende Pflichtfelder vor dem Erstellen der Läufe korrigieren.",
          `\nFehlende Pflichtfelder:\n${issues.missing.slice(0, 12).join("\n")}`,
          issues.missing.length > 12 ? "\nWeitere Einträge vorhanden." : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return false;
    }

    const tooLargeCategories = getTooLargeRaceCategories(riders);
    if (tooLargeCategories.length > 0) {
      alert(
        [
          `Maximal ${MAX_RIDERS_PER_RACE_CATEGORY} Teilnehmer pro Kategorie/Laufgruppe erlaubt.`,
          "Bitte Teilnehmer reduzieren oder Kategorien anders aufteilen.",
          `\nZu grosse Kategorien:\n${tooLargeCategories.map((entry) => `${entry.category}: ${entry.count} Teilnehmer`).join("\n")}`,
        ].join("\n"),
      );
      return false;
    }

    if (issues.duplicates.length > 0) {
      return window.confirm(
        [
          "Warnung: Es gibt doppelte Startnummern in derselben Kategorie.",
          "Das Rennen kann trotzdem durchgeführt werden.",
          `\nDoppelte Startnummern pro Kategorie:\n${issues.duplicates.slice(0, 12).join("\n")}`,
          issues.duplicates.length > 12 ? "\nWeitere Einträge vorhanden." : "",
          "\nMotos trotzdem erstellen?",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    return true;
  };

  const getRaceStatus = (race: RaceName) => {
    const heatData =
      race === selectedRace
        ? heats
        : JSON.parse(
            appStorage.getItem(getRaceStorageKey(race, "heats")) || "{}",
          );
    const finalData =
      race === selectedRace
        ? finals
        : JSON.parse(
            appStorage.getItem(getRaceStorageKey(race, "finals")) || "{}",
          );
    const finalResultData =
      race === selectedRace
        ? finalResults
        : JSON.parse(
            appStorage.getItem(getRaceStorageKey(race, "final_results")) ||
              "{}",
          );
    const closed =
      race === selectedRace
        ? raceClosed
        : JSON.parse(
            appStorage.getItem(getRaceStorageKey(race, "race_closed")) ||
              "false",
          );

    if (closed) return "Abgeschlossen";
    if (
      Object.values(finalResultData || {}).some(
        (x: any) => Array.isArray(x) && x.length > 0,
      )
    )
      return "Resultate erfasst";
    if (Object.keys(finalData || {}).length > 0) return "Finals erstellt";
    if (Object.keys(heatData || {}).length > 0) return "Motos erstellt";
    return "Offen";
  };

  const getSequentialHeatRaceNumber = (heatData: any, category: string, runIndex: number, heatIndex: number) => {
    let count = 0;
    for (const cat of sortCategories(Object.keys(heatData || {}))) {
      const groups = heatData?.[cat]?.[runIndex] || [];
      if (cat === category) return count + heatIndex + 1;
      count += Array.isArray(groups) ? groups.length : 0;
    }
    return heatIndex + 1;
  };

  const findRiderStartInfo = (rider: any) => {
    const riderId = String(rider?.id ?? rider?.riderId ?? "");
    const raceInfos = activeRaces.map((race) => {
      const raceHeats = getStoredRaceData(race, "heats", {});
      const raceFinals = getStoredRaceData(race, "finals", {});
      const heatsInfo: any[] = [];
      const finalsInfo: any[] = [];

      Object.keys(raceHeats || {}).forEach((cat) => {
        (raceHeats[cat] || []).forEach((runGroups: any[], runIndex: number) => {
          (runGroups || []).forEach((group: any[], heatIndex: number) => {
            const found = (group || []).find((x: any) => String(x.id ?? x.riderId) === riderId);
            if (found) heatsInfo.push({ run: runIndex + 1, heat: getSequentialHeatRaceNumber(raceHeats, cat, runIndex, heatIndex), startPos: found.startPos || "-", category: cat });
          });
        });
      });

      Object.keys(raceFinals || {}).forEach((cat) => {
        Object.keys(raceFinals[cat] || {}).forEach((roundName) => {
          const found = (raceFinals[cat][roundName] || []).find((x: any) => String(x.id ?? x.riderId) === riderId);
          if (found) finalsInfo.push({ roundName, startPos: found.startPos || "-", category: getFinalCategoryLabel(cat) });
        });
      });

      return { race, assigned: !!rider?.[raceKeyMap[race]], heatsInfo, finalsInfo, ranking: getRaceRankingForRider(race, riderId) };
    });

    const currentRace = raceInfos.find((x) => x.race === selectedRace) || raceInfos[0];
    return {
      rider,
      heatsInfo: currentRace.heatsInfo,
      finalsInfo: currentRace.finalsInfo,
      raceInfos,
      overallInfo: getOverallInfoForRider(riderId),
    };
  };

  const openRiderInfo = (rider: any) =>
    setSelectedRiderInfo(findRiderStartInfo(rider));

  const ensureRaceInformationComplete = () => {
    let nextSeries = homeEventSeries.trim();
    let nextLocation = eventLocation.trim();
    let nextDate = eventDate.trim();

    const missing = [
      !nextSeries ? "Rennserie" : "",
      !nextLocation ? "Rennort" : "",
      !nextDate ? "Datum" : "",
    ].filter(Boolean);
    if (!missing.length) return true;

    window.alert(`Für ${selectedRace} fehlen noch folgende Renninformationen: ${missing.join(", ")}. Diese Daten werden jetzt abgefragt.`);

    if (!nextSeries) {
      nextSeries = window.prompt("Rennserie / Rennname eingeben", getCurrentEvent()?.name || "")?.trim() || "";
      if (nextSeries) setHomeEventSeries(nextSeries);
    }
    if (!nextLocation) {
      nextLocation = window.prompt("Rennort eingeben", eventLocation || "")?.trim() || "";
      if (nextLocation) setEventLocation(nextLocation);
    }
    if (!nextDate) {
      nextDate = window.prompt("Datum eingeben (YYYY-MM-DD)", eventDate || new Date().toISOString().slice(0, 10))?.trim() || "";
      if (nextDate) setEventDate(nextDate);
    }

    const stillMissing = [
      !nextSeries ? "Rennserie" : "",
      !nextLocation ? "Rennort" : "",
      !nextDate ? "Datum" : "",
    ].filter(Boolean);

    if (stillMissing.length > 0) {
      window.alert(`Manuelle Rangliste kann noch nicht gestartet werden. Es fehlt: ${stillMissing.join(", ")}.`);
      return false;
    }

    return true;
  };


  const startManualResultsMode = async () => {
    if (!ensureRaceInformationComplete()) return;
    if (raceClosed) {
      alert("Dieses Race ist abgeschlossen. Für Änderungen Race zuerst wieder öffnen.");
      return;
    }
    if (!validateSelectedRaceBeforeBuild()) return;

    const hasExistingRaceData =
      Object.keys(heats || {}).length > 0 ||
      Object.keys(results || {}).length > 0 ||
      Object.keys(finals || {}).length > 0 ||
      Object.keys(finalResults || {}).length > 0;

    if (hasExistingRaceData) {
      const proceed = window.confirm(
        "Manuelle Rangliste starten? Bestehende Motos, Finals oder Resultate dieses Race werden erst beim Speichern der manuellen Rangliste ersetzt.",
      );
      if (!proceed) return;
      await exportBackup("Sicherheitsbackup vor manueller Rangliste");
    }

    const categories = sortCategories(Object.keys(manualRankingGroups)).filter((cat) => (manualRankingGroups[cat] || []).length > 0);
    if (categories.length === 0) {
      window.alert("Es sind keine Teilnehmer für dieses Race ausgewählt.");
      return;
    }

    setManualResultOrder({});
    setManualResultsMode(true);
    addChangeLog(`${selectedRace}: Manuelle Rangliste gestartet`);
    setTimeout(() => scrollToSection("manual-results"), 0);
  };

  const toggleManualResultRider = (category: string, rider: any) => {
    const riderId = String(rider?.id ?? rider?.riderId ?? "");
    if (!riderId) return;
    setManualResultOrder((prev) => {
      const current = prev[category] || [];
      const exists = current.includes(riderId);
      return {
        ...prev,
        [category]: exists ? current.filter((id) => id !== riderId) : [...current, riderId],
      };
    });
  };

  const clearManualResultCategory = (category: string) => {
    setManualResultOrder((prev) => ({ ...prev, [category]: [] }));
  };

  const addRemainingManualResultCategory = (category: string) => {
    const current = manualResultOrder[category] || [];
    const remaining = (manualRankingGroups[category] || [])
      .map((r: any) => String(r.id))
      .filter((id: string) => !current.includes(id));
    setManualResultOrder((prev) => ({ ...prev, [category]: [...current, ...remaining] }));
  };

  const createManualResults = () => {
    if (raceClosed) {
      alert("Dieses Race ist abgeschlossen. Für Änderungen Race zuerst wieder öffnen.");
      return;
    }

    const categories = sortCategories(Object.keys(manualRankingGroups));
    const missing = categories
      .map((cat) => {
        const total = (manualRankingGroups[cat] || []).length;
        const selected = (manualResultOrder[cat] || []).length;
        return selected < total ? `${cat}: ${selected}/${total}` : "";
      })
      .filter(Boolean);

    if (missing.length > 0) {
      window.alert(
        `Bitte zuerst alle Teilnehmer platzieren.\n\nNoch offen:\n${missing.join("\n")}\n\nDie Resultatliste wird erst gespeichert, wenn alle Fahrer einer Kategorie in der Rangfolge angeklickt wurden.`,
      );
      return;
    }

    const nextFinals: Record<string, Record<string, any[]>> = {};
    const nextFinalResults: Record<string, any[]> = {};
    const nextManualOrder: Record<string, string[]> = {};

    categories.forEach((cat) => {
      const selectedIds = manualResultOrder[cat] || [];
      if (selectedIds.length === 0) return;
      const riderMap = new Map<string, any>((manualRankingGroups[cat] || []).map((r: any) => [String(r.id), r]));
      const rows = selectedIds
        .map((id, index) => {
          const rider = riderMap.get(id);
          if (!rider) return null;
          return {
            ...rider,
            riderId: String(rider.id),
            rank: index + 1,
            points: index + 1,
            startPos: index + 1,
            status: "",
            originalCategory: cat,
            manualRankingOnly: true,
          };
        })
        .filter(Boolean) as any[];

      const finalCategory = getEffectiveFinalCategory(cat);
      if (!nextFinals[finalCategory]) nextFinals[finalCategory] = { "Manuelle Rangliste": [] };
      nextFinals[finalCategory]["Manuelle Rangliste"].push(...rows);
      nextFinalResults[`${finalCategory}_Manuelle Rangliste`] = [
        ...(nextFinalResults[`${finalCategory}_Manuelle Rangliste`] || []),
        ...rows,
      ];
      nextManualOrder[cat] = rows.map((row) => String(row.riderId));
    });

    if (Object.keys(nextFinalResults).length === 0) {
      window.alert("Bitte zuerst mindestens einen Teilnehmer für die manuelle Resultatliste auswählen.");
      return;
    }

    setHeats({});
    setResults({});
    setFinals(nextFinals);
    setFinalResults(nextFinalResults);
    setFinalManualOrder(nextManualOrder);
    setManualResultsMode(false);
    setManualResultOrder({});
    addChangeLog(`${selectedRace}: Manuelle Rangliste erstellt`);
    triggerAutomaticLivePublish(750);
    setTimeout(() => scrollToSection("resultate"), 0);
  };

  const createHeats = async () => {
    if (!ensureRaceInformationComplete()) return;
    if (raceClosed) {
      alert(
        "Dieses Race ist abgeschlossen. Für Änderungen Race zuerst wieder öffnen.",
      );
      return;
    }
    if (!validateSelectedRaceBeforeBuild()) return;
    if (Object.keys(heats || {}).length > 0) {
      if (!window.confirm("Motos neu erstellen? Bestehende Motos/Resultate werden überschrieben.")) return;
      await exportBackup("Sicherheitsbackup vor Motos neu erstellen");
    }

    const heatRiders = riders.map((r: any) => ({
      ...r,
      originalCategory: r.category,
      category: getEffectiveHeatCategory(r.category),
    }));

    const generatedHeats = generateCategoryHeats(heatRiders);
    const newHeats = orderRecordByCategories(generatedHeats);
    setHeats(newHeats);
    setResults({});
    setFinals({});
    setFinalResults({});
    setFinalManualOrder({});
    setManualResultsMode(false);
    setManualResultOrder({});
    addChangeLog(`${selectedRace}: Motos erstellt`);
    triggerAutomaticLivePublish(750);
  };

  const getFirstFreeGate = (group: any[]) => {
    const used = new Set((group || []).map((r: any) => Number(r.startPos)).filter((value: number) => value >= 1 && value <= 8));
    for (let gate = 1; gate <= 8; gate += 1) {
      if (!used.has(gate)) return gate;
    }
    return 0;
  };

  const hasRiderInHeatCategory = (categoryHeats: any[][][], riderId: string, stableId: string) =>
    (categoryHeats || []).some((runGroups: any[][]) =>
      (runGroups || []).some((group: any[]) =>
        (group || []).some((r: any) =>
          String(r.id ?? r.riderId ?? "") === riderId || (!!stableId && String(r.participantId || r.masterId || "") === stableId),
        ),
      ),
    );

  const countUniqueHeatCategoryRiders = (categoryHeats: any[][][]) => {
    const ids = new Set<string>();
    (categoryHeats || []).forEach((runGroups: any[][]) => {
      (runGroups || []).forEach((group: any[]) => {
        (group || []).forEach((r: any) => {
          const id = String(r.participantId || r.masterId || r.riderId || r.id || "");
          if (id) ids.add(id);
        });
      });
    });
    return ids.size;
  };

  const replaceRaceCategoryData = (record: Record<string, any>, category: string) =>
    Object.fromEntries(Object.entries(record || {}).filter(([key]) => !String(key).startsWith(`${category}_`)));

  const getCategoryHeatGroupCapacity = (categoryHeats: any[][][]) => {
    const groupCount = Math.max(0, ...(categoryHeats || []).map((runGroups: any[][]) => Array.isArray(runGroups) ? runGroups.length : 0));
    return groupCount * 8;
  };

  const addRiderToExistingCategoryHeats = (categoryHeats: any[][][], rider: any, heatCategory: string) => {
    let failed = false;
    const nextCategoryHeats = (categoryHeats || []).map((runGroups: any[][]) => {
      const groups = (runGroups || []).map((group: any[]) => [...(group || [])]);
      let bestGroupIndex = -1;
      groups.forEach((group, index) => {
        if (group.length >= 8 || getFirstFreeGate(group) < 1) return;
        if (bestGroupIndex < 0 || group.length < groups[bestGroupIndex].length) bestGroupIndex = index;
      });
      if (bestGroupIndex < 0) {
        failed = true;
        return groups;
      }
      const gate = getFirstFreeGate(groups[bestGroupIndex]);
      groups[bestGroupIndex] = [
        ...groups[bestGroupIndex],
        {
          ...rider,
          riderId: String(rider.id),
          originalCategory: rider.category,
          category: heatCategory,
          startPos: gate,
        },
      ].sort((a: any, b: any) => (a.startPos || 99) - (b.startPos || 99));
      return groups;
    });

    if (failed || nextCategoryHeats.length === 0) return null;
    return nextCategoryHeats;
  };

  const rebuildSingleHeatCategory = (raceRiders: any[], heatCategory: string) => {
    const heatRiders = raceRiders
      .filter((rider: any) => getEffectiveHeatCategory(rider.category) === heatCategory)
      .map((rider: any) => ({
        ...rider,
        originalCategory: rider.category,
        category: heatCategory,
      }));
    const generated = generateCategoryHeats(heatRiders);
    return generated[heatCategory] || [];
  };

  const addLateParticipantToCurrentRace = async () => {
    if (raceClosed) {
      window.alert("Dieses Race ist abgeschlossen. Für Änderungen Race zuerst wieder öffnen.");
      return;
    }
    if (!Object.keys(heats || {}).length) {
      window.alert("Bitte zuerst Motos erstellen. Danach können Teilnehmer nachträglich ergänzt werden.");
      return;
    }
    if (!lateAddParticipantValue) {
      window.alert("Bitte zuerst einen Teilnehmer auswählen.");
      return;
    }

    const selected: any = lateAddParticipantCandidates.find((candidate: any) => candidate.value === lateAddParticipantValue);
    if (!selected) {
      window.alert("Der ausgewählte Teilnehmer wurde nicht gefunden.");
      return;
    }

    const flag = raceKeyMap[selectedRace];
    const allRows = (await db.table("riders").toArray()).map(normalizeRider).filter((r: any) => !r.deletedAt);
    let rider: any | null = null;

    if (selected.source === "event") {
      rider = allRows.find((row: any) => String(row.id || "") === String(selected.rider?.id || "")) || selected.rider;
      if (!rider?.id) {
        window.alert("Der Teilnehmer konnte im aktuellen Rennen nicht gefunden werden.");
        return;
      }
      await db.table("riders").update(rider.id, { [flag]: true });
      rider = { ...rider, [flag]: true };
    } else {
      const source = selected.participant?.raw || selected.participant;
      const stableId = String(selected.participant?.masterId || source?.participantId || source?.masterId || source?.id || crypto.randomUUID());
      const newId = crypto.randomUUID();
      rider = normalizeRider({
        id: newId,
        participantId: stableId,
        masterId: stableId,
        name: source?.name || selected.participant?.name || "",
        plate: source?.plate || selected.participant?.plate || "",
        birthYear: Number(source?.birthYear || source?.jahrgang || selected.participant?.birthYear) || undefined,
        jahrgang: Number(source?.birthYear || source?.jahrgang || selected.participant?.birthYear) || undefined,
        gender: source?.gender || source?.geschlecht || selected.participant?.gender || "",
        geschlecht: source?.gender || source?.geschlecht || selected.participant?.gender || "",
        club: source?.club || selected.participant?.club || "",
        cruiser: !!(source?.cruiser || source?.isCruiser || selected.participant?.cruiser),
        isCruiser: !!(source?.cruiser || source?.isCruiser || selected.participant?.cruiser),
        eventId: currentEventId || "legacy",
        ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`race${index + 1}`, false])),
        [flag]: true,
      });
      await db.table("riders").add(rider);
    }

    const rollbackLateAdd = async () => {
      if (!rider?.id) return;
      if (selected.source === "master") await db.table("riders").delete(rider.id);
      else await db.table("riders").update(rider.id, { [flag]: false });
    };

    const heatCategory = getEffectiveHeatCategory(rider.category);
    const categoryHeats = heats[heatCategory] || [];
    const riderId = String(rider.id || "");
    const stableId = getParticipantStableId(rider);
    if (hasRiderInHeatCategory(categoryHeats, riderId, stableId)) {
      window.alert("Dieser Teilnehmer ist in den Motos dieser Kategorie bereits vorhanden.");
      await rollbackLateAdd();
      await loadAllRiders();
      await loadRaceRiders();
      return;
    }

    const raceRidersAfter = allRows
      .filter((row: any) => belongsToCurrentEvent(row))
      .map((row: any) => String(row.id || "") === riderId ? { ...row, [flag]: true } : row)
      .concat(selected.source === "master" ? [rider] : [])
      .filter((row: any) => !!row[flag]);

    const existingCount = countUniqueHeatCategoryRiders(categoryHeats);
    const nextCount = Math.max(existingCount + 1, raceRidersAfter.filter((row: any) => getEffectiveHeatCategory(row.category) === heatCategory).length);
    if (nextCount > MAX_RIDERS_PER_RACE_CATEGORY) {
      window.alert(
        `Teilnehmer kann nicht hinzugefügt werden. Für die Kategorie "${heatCategory}" wären danach ${nextCount} Teilnehmer vorhanden. Maximal erlaubt sind ${MAX_RIDERS_PER_RACE_CATEGORY}.`,
      );
      await rollbackLateAdd();
      await loadAllRiders();
      await loadRaceRiders();
      return;
    }
    const capacity = getCategoryHeatGroupCapacity(categoryHeats);
    const categoryHasSavedData = Object.keys(results || {}).some((key) => key.startsWith(`${heatCategory}_`)) || !!finals[getEffectiveFinalCategory(rider.category)] || Object.keys(finalResults || {}).some((key) => key.startsWith(`${getEffectiveFinalCategory(rider.category)}_`));
    const needsRebuild = !categoryHeats.length || capacity < nextCount;

    if (needsRebuild) {
      const threshold = capacity || 8;
      const savedDataText = categoryHasSavedData ? "\n\nGespeicherte Resultate/Finals dieser Kategorie werden entfernt, damit die Kategorie neu gefahren oder neu erfasst werden kann." : "";
      const proceed = window.confirm(
        categoryHeats.length
          ? `Achtung, Anzahl grösser ${threshold}. Soll bei dieser Kategorie neue Motos erstellt werden?

Nur die Kategorie "${heatCategory}" wird neu eingeteilt. Bestehende Motos anderer Kategorien bleiben unverändert.${savedDataText}`
          : `Für die Kategorie "${heatCategory}" existieren noch keine Motos. Soll diese Kategorie jetzt mit dem nachgemeldeten Teilnehmer erstellt werden?${savedDataText}`,
      );
      if (!proceed) {
        await rollbackLateAdd();
        await loadAllRiders();
        await loadRaceRiders();
        return;
      }
      await exportBackup(`Sicherheitsbackup vor Nachmeldung in ${heatCategory}`);
      const rebuiltCategoryHeats = rebuildSingleHeatCategory(raceRidersAfter, heatCategory);
      setHeats(orderRecordByCategories({ ...(heats || {}), [heatCategory]: rebuiltCategoryHeats }));
    } else {
      if (categoryHasSavedData) {
        const proceed = window.confirm(
          `Für die Kategorie "${heatCategory}" existieren bereits Resultate oder Finals.

Teilnehmer trotzdem nachträglich hinzufügen? Die gespeicherten Resultate/Finals dieser Kategorie werden entfernt, damit die Rangliste neu erfasst werden kann.`,
        );
        if (!proceed) {
          await rollbackLateAdd();
          await loadAllRiders();
          await loadRaceRiders();
          return;
        }
        await exportBackup(`Sicherheitsbackup vor Nachmeldung in ${heatCategory}`);
      }
      const nextCategoryHeats = addRiderToExistingCategoryHeats(categoryHeats, rider, heatCategory);
      if (!nextCategoryHeats) {
        window.alert("In dieser Kategorie konnte kein freier Gate-Platz gefunden werden. Bitte Kategorie neu einteilen.");
        await rollbackLateAdd();
        await loadAllRiders();
        await loadRaceRiders();
        return;
      }
      setHeats(orderRecordByCategories({ ...(heats || {}), [heatCategory]: nextCategoryHeats }));
    }

    const finalCategory = getEffectiveFinalCategory(rider.category);
    const nextResults = replaceRaceCategoryData(results, heatCategory);
    const nextFinals = { ...(finals || {}) };
    delete nextFinals[finalCategory];
    const nextFinalResults = replaceRaceCategoryData(finalResults, finalCategory);
    const nextFinalManualOrder = { ...(finalManualOrder || {}) };
    delete nextFinalManualOrder[finalCategory];

    setResults(nextResults);
    setFinals(nextFinals);
    setFinalResults(nextFinalResults);
    setFinalManualOrder(nextFinalManualOrder);
    setLateAddParticipantValue("");
    await loadAllRiders();
    await loadRaceRiders();
    addChangeLog(`${selectedRace}: Teilnehmer nachträglich hinzugefügt (${rider.name || "Ohne Name"})`);
    setTimeout(() => scrollToSection("vorlauf-1"), 0);
  };

  const resetHeats = async () => {
    if (
      !window.confirm(
        `${selectedRace} wirklich zurücksetzen? Motos, Finals und Resultate dieses Race werden gelöscht.`,
      )
    )
      return;
    await exportBackup("Sicherheitsbackup vor Race-Reset");
    setRaceClosed(false);
    setHeats({});
    setResults({});
    setFinals({});
    setFinalResults({});
    setFinalManualOrder({});
    setManualResultsMode(false);
    setManualResultOrder({});
    addChangeLog(`${selectedRace}: zurückgesetzt`);
  };

  const saveHeatResult = (
    cat: string,
    run: number,
    heatIndex: number,
    data: any[],
  ) => {
    if (raceClosed) {
      alert(
        "Dieses Race ist abgeschlossen. Resultate können erst nach dem Wiederöffnen geändert werden.",
      );
      return;
    }
    const key = `${cat}_${run}_${heatIndex}`;
    const entryKey = getMotoEntryKey(cat, run, heatIndex);
    const nextResults = {
      ...(results || {}),
      [key]: data,
    };
    setResults(nextResults);

    const startList = heats?.[cat]?.[run]?.[heatIndex] || [];
    if (isCompleteRaceEntry(startList, data)) {
      activateNextRaceFlowEntryAfter(entryKey, nextResults, finalResults);
      triggerAutomaticLivePublish(650);
    } else {
      setActiveRaceEntryKey(entryKey);
    }
  };

  const saveFinalResult = (cat: string, roundName: string, data: any[]) => {
    if (raceClosed) {
      alert(
        "Dieses Race ist abgeschlossen. Resultate können erst nach dem Wiederöffnen geändert werden.",
      );
      return;
    }
    const key = `${cat}_${roundName}`;
    const entryKey = getFinalEntryKey(cat, roundName);
    const nextFinalResults = {
      ...(finalResults || {}),
      [key]: data,
    };
    setFinalResults(nextFinalResults);

    const startList = finals?.[cat]?.[roundName] || [];
    if (isCompleteRaceEntry(startList, data)) {
      activateNextRaceFlowEntryAfter(entryKey, results, nextFinalResults);
      triggerAutomaticLivePublish(650);
    } else {
      setActiveRaceEntryKey(entryKey);
    }
  };

  const getRacePenaltyOrder = (row: any) => {
    const statuses = Object.values(row?.runs || {}).map((value: any) =>
      String(value || "").toUpperCase(),
    );
    return statuses.includes("DSQ") ? 1 : 0;
  };

  const getRunSortValue = (value: any) => {
    const status = String(value || "").toUpperCase();
    if (status === "DNF") return 10;
    if (status === "DNS") return 10;
    if (status === "DSQ") return 50;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 99;
  };

  const getRanking = (cat: string) => {
    const scores: any = {};

    Object.keys(results).forEach((key) => {
      const parts = key.split("_");
      const run = Number(parts[parts.length - 2]);
      const heatResult = results[key] || [];

      heatResult.forEach((r: any) => {
        const riderData = riders.find(
          (x: any) => String(x.id) === String(r.riderId),
        );
        if (!riderData || riderData.category !== cat) return;

        if (!scores[r.riderId]) {
          scores[r.riderId] = {
            riderId: r.riderId,
            name: r.name,
            plate: r.plate,
            club: r.club || riderData?.club || "",
            birthYear: getRiderBirthYear(riderData || r) || "",
            gender: getRiderGenderCode(riderData || r) || "",
            total: 0,
            runs: {},
          };
        }

        const status = String(r.status || "").toUpperCase();
        const points =
          status === "DNF" || status === "DNS"
            ? 10
            : status === "DSQ"
              ? 50
              : Number(r.points ?? r.rank ?? 0);
        scores[r.riderId].total += points;
        scores[r.riderId].runs[run] = status || r.rank;
      });
    });

    return Object.values(scores).sort((a: any, b: any) => {
      const penaltyDiff = getRacePenaltyOrder(a) - getRacePenaltyOrder(b);
      if (penaltyDiff !== 0) return penaltyDiff;
      if (a.total !== b.total) return a.total - b.total;
      const run2Diff = getRunSortValue(a.runs[2]) - getRunSortValue(b.runs[2]);
      if (run2Diff !== 0) return run2Diff;
      return getRunSortValue(a.runs[1]) - getRunSortValue(b.runs[1]);
    });
  };

  const createMainFinalsFromSemifinals = async () => {
    if (raceClosed) {
      alert("Dieses Race ist abgeschlossen. Für Änderungen Race zuerst wieder öffnen.");
      return;
    }

    const nextFinals: Record<string, Record<string, any[]>> = { ...(finals || {}) };
    const nextFinalResults: Record<string, any[]> = { ...(finalResults || {}) };
    const warnings: string[] = [];
    let createdCount = 0;

    sortCategories(Object.keys(nextFinals || {})).forEach((finalCategory) => {
      const rounds = nextFinals[finalCategory] || {};
      if (!isSemifinalProgram(rounds) || rounds["A-Final"] || rounds["B-Final"]) return;

      const semi1Start = rounds["Halbfinal 1"] || [];
      const semi2Start = rounds["Halbfinal 2"] || [];
      const semi1Results = finalResults[`${finalCategory}_Halbfinal 1`] || [];
      const semi2Results = finalResults[`${finalCategory}_Halbfinal 2`] || [];

      if (semi1Results.length < semi1Start.length || semi2Results.length < semi2Start.length) {
        warnings.push(`${getFinalCategoryLabel(finalCategory)}: Halbfinalresultate noch nicht vollständig erfasst.`);
        return;
      }

      const semi1Sorted = sortSemiFinalRowsForQualification(semi1Results);
      const semi2Sorted = sortSemiFinalRowsForQualification(semi2Results);
      const aFinalRows = createStartListRows([
        ...semi1Sorted.slice(0, 4),
        ...semi2Sorted.slice(0, 4),
      ]);
      const bFinalRows = createStartListRows([
        ...semi1Sorted.slice(4, 8),
        ...semi2Sorted.slice(4, 8),
      ]);
      const remainingFromMotos = getCombinedFinalRanking(finalCategory).slice(16, MAX_RIDERS_PER_RACE_CATEGORY);
      const cFinalRows = createStartListRows(remainingFromMotos.slice(0, 8));
      const dFinalRows = createStartListRows(remainingFromMotos.slice(8, 16));

      if (aFinalRows.length === 0) {
        warnings.push(`${getFinalCategoryLabel(finalCategory)}: Aus den Halbfinals konnten keine A-Final-Fahrer ermittelt werden.`);
        return;
      }

      nextFinals[finalCategory] = {
        ...rounds,
        ...(dFinalRows.length > 0 ? { "D-Final": dFinalRows } : {}),
        ...(cFinalRows.length > 0 ? { "C-Final": cFinalRows } : {}),
        ...(bFinalRows.length > 0 ? { "B-Final": bFinalRows } : {}),
        "A-Final": aFinalRows,
      };
      delete nextFinalResults[`${finalCategory}_A-Final`];
      delete nextFinalResults[`${finalCategory}_B-Final`];
      delete nextFinalResults[`${finalCategory}_C-Final`];
      delete nextFinalResults[`${finalCategory}_D-Final`];
      createdCount += 1;
    });

    if (createdCount === 0) {
      window.alert(
        warnings.length
          ? `Finals konnten noch nicht freigeschaltet werden:\n\n${warnings.join("\n")}`
          : "Es gibt keine offenen Halbfinals, aus denen Finals freigeschaltet werden können.",
      );
      return;
    }

    if (warnings.length > 0) {
      window.alert(`Einige Kategorien wurden übersprungen:\n\n${warnings.join("\n")}`);
    }

    setFinals(orderRecordByCategories(nextFinals));
    setFinalResults(nextFinalResults);
    setFinalManualOrder({});
    addChangeLog(`${selectedRace}: Finals aus Halbfinals freigeschaltet`);
  };

  const createFinals = async () => {
    if (raceClosed) {
      alert(
        "Dieses Race ist abgeschlossen. Für Änderungen Race zuerst wieder öffnen.",
      );
      return;
    }
    if (Object.keys(finals || {}).length > 0) {
      if (!window.confirm("Finals neu erstellen? Bestehende Finalresultate werden gelöscht.")) return;
      await exportBackup("Sicherheitsbackup vor Finals neu erstellen");
    }
    const all: any = {};
    const tooLargeCategories: string[] = [];

    getFinalRaceCategories().forEach((finalCategory) => {
      const categoryRiders = riders.filter(
        (r: any) => getEffectiveFinalCategory(r.category) === finalCategory,
      );
      const ranking = getCombinedFinalRanking(finalCategory);
      if (ranking.length === 0) return;

      if (categoryRiders.length > MAX_RIDERS_PER_RACE_CATEGORY || ranking.length > MAX_RIDERS_PER_RACE_CATEGORY) {
        tooLargeCategories.push(`${getFinalCategoryLabel(finalCategory)}: ${Math.max(categoryRiders.length, ranking.length)} Teilnehmer`);
        return;
      }

      if (categoryRiders.length <= 8) {
        const fourthMoto = ranking.map((r: any, index: number) => ({
          ...r,
          startPos: index + 1,
        }));

        all[finalCategory] = {
          "4. Vorlauf": fourthMoto,
        };
      } else if (categoryRiders.length >= SEMIFINAL_MIN_RIDERS) {
        all[finalCategory] = buildSemiFinalProgram(ranking);
      } else {
        all[finalCategory] = generateFinals(ranking);
      }
    });

    if (tooLargeCategories.length > 0) {
      window.alert(
        `Finals können nicht erstellt werden. Maximal ${MAX_RIDERS_PER_RACE_CATEGORY} Teilnehmer pro Kategorie/Laufgruppe erlaubt.\n\n${tooLargeCategories.join("\n")}`,
      );
      return;
    }

    setFinals(orderRecordByCategories(all));
    setFinalResults({});
    setFinalManualOrder({});
    setManualResultsMode(false);
    setManualResultOrder({});
    addChangeLog(`${selectedRace}: Finals erstellt`);
    triggerAutomaticLivePublish(750);
  };

  const groupedAll = useMemo(() => {
    return allRiders.reduce((acc: any, r: any) => {
      if (!acc[r.category]) acc[r.category] = [];
      acc[r.category].push(r);
      return acc;
    }, {});
  }, [allRiders]);

  const duplicatePlateRiderIds = useMemo(() => {
    const duplicateIds = new Set<string>();
    getDuplicatePlateGroups(allRiders).forEach((entry) => {
      entry.ids.forEach((id) => {
        if (id) duplicateIds.add(id);
      });
    });
    return duplicateIds;
  }, [allRiders]);

  const filteredAllRiders = useMemo(() => {
    return allRiders.filter((r: any) => {
      if (!matchesGlobalSearch(r)) return false;
      if (participantQuickFilter === "selectedRace")
        return !!r[raceKeyMap[selectedRace]];
      if (participantQuickFilter === "notSelectedRace")
        return !r[raceKeyMap[selectedRace]];
      if (participantQuickFilter === "duplicates")
        return duplicatePlateRiderIds.has(String(r.id || ""));
      if (participantQuickFilter === "cruiser")
        return getSpecialCategoryValue(r) === CRUISER_CATEGORY;
      if (participantQuickFilter === "plausch")
        return isPlauschCategory(getSpecialCategoryValue(r));
      if (participantQuickFilter === "missing") {
        const issue = getRiderValidationIssues([r]);
        return issue.missing.length > 0;
      }
      return true;
    });
  }, [allRiders, globalSearch, participantQuickFilter, duplicatePlateRiderIds, selectedRace]);

  const filteredGroupedAll = useMemo(() => {
    return filteredAllRiders.reduce((acc: any, r: any) => {
      if (!acc[r.category]) acc[r.category] = [];
      acc[r.category].push(r);
      return acc;
    }, {});
  }, [filteredAllRiders]);

  const participantIssues = useMemo(
    () => getRiderValidationIssues(allRiders),
    [allRiders],
  );

  const getRaceParticipantCount = (race: RaceName) => {
    const key = raceKeyMap[race];
    return allRiders.filter((r: any) => !!r[key]).length;
  };



  const orderRecordByCategories = <T,>(record: Record<string, T>): Record<string, T> => {
    const ordered: Record<string, T> = {};
    sortCategories(Object.keys(record || {})).forEach((category) => {
      ordered[category] = record[category];
    });
    return ordered;
  };

  const getRaceClosedValue = (race: RaceName) => {
    if (race === selectedRace) return !!raceClosed;
    try {
      return JSON.parse(appStorage.getItem(getRaceStorageKey(race, "race_closed")) || "false");
    } catch {
      return false;
    }
  };

  const getOverallEligibleRaces = () => activeRaces.filter((race) => getRaceClosedValue(race));

  const getCategoryBadgeStyle = (category: string): React.CSSProperties => {
    const palette = [
      ["#e8f1ff", "#1f5fbf", "#acc8ff"],
      ["#eaf8ef", "#176b38", "#a8ddb8"],
      ["#fff4d8", "#8a5a00", "#f3c46a"],
      ["#f1ecff", "#5a3db8", "#c7b9ff"],
      ["#ffeef0", "#a83a48", "#ffb8c1"],
      ["#eef8f8", "#21747a", "#a9dfe3"],
    ];
    const index = Math.abs(String(category || "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % palette.length;
    const [background, color, borderColor] = normalizeSpecialCategoryValue(category) === CRUISER_CATEGORY
      ? ["#111827", "#ffffff", "#111827"]
      : isPlauschCategory(normalizeSpecialCategoryValue(category))
        ? ["#fff7ed", "#9a3412", "#fdba74"]
        : palette[index];
    return {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "7px 12px",
      fontSize: 13,
      fontWeight: 950,
      background,
      color,
      border: `1px solid ${borderColor}`,
      whiteSpace: "nowrap",
    };
  };

  const getChangeLogFilterOptions = () => ["Alle", "Teilnehmer", ...activeRaces, "Gesamtwertung", "PDF", "Backup"];

  const filteredChangeLog = changeLogFilter === "Alle"
    ? changeLog
    : changeLog.filter((entry) => entry.toLowerCase().includes(changeLogFilter.toLowerCase()));

  const dashboardStats = useMemo(() => {
    return {
      total: allRiders.length,
      missingCount: participantIssues.missing.length,
      duplicateCount: participantIssues.duplicates.length,
    };
  }, [allRiders, participantIssues]);

  const groupedRace = useMemo(() => {
    return riders.reduce((acc: any, r: any) => {
      if (!acc[r.category]) acc[r.category] = [];
      acc[r.category].push(r);
      return acc;
    }, {});
  }, [riders]);

  // Separate Datenbasis für die manuelle Rangliste:
  // bewusst NICHT aus Motos/Heats abgeleitet, damit auch bei mehr als 8 Fahrern
  // alle Teilnehmer einer Kategorie in einer einzigen Kachel anklickbar bleiben.
  const manualRankingGroups = useMemo(() => {
    return riders.reduce((acc: Record<string, any[]>, rider: any) => {
      const category = String(rider?.category || "Ohne Kategorie");
      if (!acc[category]) acc[category] = [];
      acc[category].push(rider);
      return acc;
    }, {});
  }, [riders]);

  const basePanelStyle: React.CSSProperties = {
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 20,
    background: colors.cardBg,
    padding: 18,
    boxShadow: "0 12px 30px rgba(23,32,51,0.08)",
  };

  const listBoxStyle: React.CSSProperties = {
    minHeight: BOX_MIN_HEIGHT,
  };

  const mainButtonStyle: React.CSSProperties = {
    background: colors.blueBtn,
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "14px 22px",
    minHeight: 54,
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 16,
    boxShadow: "0 6px 14px rgba(37,99,235,0.20)",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    background: colors.grayBtn,
    color: colors.grayBtnText,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 14,
    padding: "14px 22px",
    minHeight: 54,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 16,
  };

  const homeButtonStyle: React.CSSProperties = {
    background: colors.title,
    color: "#fff",
    border: "2px solid #111827",
    borderRadius: 14,
    padding: "14px 24px",
    minHeight: 54,
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 16,
    boxShadow: "0 7px 16px rgba(17,24,39,0.20)",
  };

  const compactHomeButtonStyle: React.CSSProperties = {
    background: colors.grayBtn,
    color: colors.grayBtnText,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 12,
    padding: "10px 14px",
    minHeight: 44,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
    whiteSpace: "nowrap",
  };

  const compactPrimaryButtonStyle: React.CSSProperties = {
    background: colors.blueBtn,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    minHeight: 44,
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 13,
    whiteSpace: "nowrap",
    boxShadow: "0 4px 10px rgba(37,99,235,0.16)",
  };

  const compactSaveButtonStyle: React.CSSProperties = {
    ...compactPrimaryButtonStyle,
    background: "#facc15",
    color: "#1f2937",
    border: "1px solid #eab308",
    fontWeight: 900,
  };

  const compactHomeHighlightButtonStyle: React.CSSProperties = {
    ...compactPrimaryButtonStyle,
    background: colors.title,
    fontWeight: 900,
    boxShadow: "0 3px 9px rgba(17,24,39,0.16)",
  };

  const compactDangerButtonStyle: React.CSSProperties = {
    ...compactPrimaryButtonStyle,
    background: colors.redBtn,
  };

  const compactDisabledButtonStyle: React.CSSProperties = {
    background: "#d8e0e6",
    color: "#7b8794",
    border: "1px solid #c5ced8",
    borderRadius: 12,
    padding: "10px 14px",
    minHeight: 44,
    cursor: "not-allowed",
    fontWeight: 900,
    fontSize: 13,
    opacity: 0.75,
    whiteSpace: "nowrap",
  };

  const smallGhostButtonStyle: React.CSSProperties = {
    background: "#fff",
    color: colors.grayBtnText,
    border: "1px solid #d3dbe3",
    borderRadius: 12,
    padding: "10px 14px",
    minHeight: 44,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
    whiteSpace: "nowrap",
  };

  const actionSaveButtonStyle: React.CSSProperties = {
    ...compactPrimaryButtonStyle,
    background: colors.greenBtn,
    boxShadow: "0 6px 14px rgba(22,163,74,0.22)",
  };

  const actionWarningButtonStyle: React.CSSProperties = {
    ...compactPrimaryButtonStyle,
    background: colors.orangeBtn,
    color: "#1f2937",
    border: "1px solid #d97706",
    boxShadow: "0 6px 14px rgba(245,158,11,0.22)",
  };

  const actionDangerButtonStyle: React.CSSProperties = {
    ...compactPrimaryButtonStyle,
    background: colors.redBtn,
    boxShadow: "0 6px 14px rgba(220,38,38,0.20)",
  };

  const getRaceStatusPanelStyle = (closed: boolean, hasHeats: boolean, hasFinals: boolean): React.CSSProperties => ({
    ...basePanelStyle,
    marginBottom: 18,
    borderColor: closed ? colors.redBtn : hasFinals ? "#c4b5fd" : hasHeats ? colors.blueBorder : colors.greenBorder,
    borderLeft: `8px solid ${closed ? colors.redBtn : hasFinals ? "#8b5cf6" : hasHeats ? colors.blueBtn : colors.greenBtn}`,
    background: closed
      ? "linear-gradient(135deg, #fff1f1 0%, #ffffff 72%)"
      : hasFinals
        ? "linear-gradient(135deg, #f3e8ff 0%, #ffffff 72%)"
        : hasHeats
          ? "linear-gradient(135deg, #eef4ff 0%, #ffffff 72%)"
          : "linear-gradient(135deg, #ecfdf5 0%, #ffffff 72%)",
    boxShadow: "0 14px 32px rgba(23,32,51,0.12)",
  });

  const raceStatusStepStyle = (active: boolean, done: boolean): React.CSSProperties => ({
    display: "grid",
    gap: 4,
    alignContent: "center",
    minHeight: 58,
    padding: "10px 12px",
    borderRadius: 14,
    border: `1px solid ${done ? colors.successBorder : active ? colors.blueBorder : colors.cardBorder}`,
    background: done ? colors.successBg : active ? "#eef4ff" : "#f8fafc",
    color: done ? "#166534" : active ? colors.blueBtnDark : colors.muted,
    fontWeight: 950,
  });

  const disabledButtonStyle: React.CSSProperties = {
    background: "#d8e0e6",
    color: "#7b8794",
    border: "1px solid #c5ced8",
    borderRadius: 12,
    padding: "14px 22px",
    minHeight: 54,
    cursor: "not-allowed",
    fontWeight: 900,
    fontSize: 16,
    opacity: 0.75,
  };

  const activeRaceButtonStyle: React.CSSProperties = {
    background: colors.blueBtn,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "14px 22px",
    minHeight: 54,
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 16,
  };

  const inactiveRaceButtonStyle: React.CSSProperties = {
    background: "#ffffff",
    color: colors.grayBtnText,
    border: "1px solid #d3dbe3",
    borderRadius: 12,
    padding: "14px 22px",
    minHeight: 54,
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 16,
  };

  const dangerButtonStyle: React.CSSProperties = {
    background: colors.redBtn,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "14px 22px",
    minHeight: 54,
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 16,
  };

  const smallDeleteButtonStyle: React.CSSProperties = {
    background: "#fff1f1",
    color: colors.redBtn,
    border: `1px solid #f2bcbc`,
    borderRadius: 10,
    padding: "8px 12px",
    minHeight: 40,
    cursor: "pointer",
    fontWeight: 850,
  };

  const editButtonStyle: React.CSSProperties = {
    background: "#eef4ff",
    color: colors.blueBtn,
    border: "1px solid #bfd2ff",
    borderRadius: 10,
    padding: "8px 12px",
    minHeight: 40,
    cursor: "pointer",
    fontWeight: 850,
  };

  const moveButtonStyle: React.CSSProperties = {
    background: "#eef4ff",
    color: colors.blueBtn,
    border: "1px solid #bfd2ff",
    borderRadius: 10,
    padding: "8px 11px",
    minHeight: 38,
    cursor: "pointer",
    fontWeight: 850,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 11,
    border: `1px solid ${colors.cardBorderStrong}`,
    fontSize: 14,
    boxSizing: "border-box",
    background: "#fff",
    outlineColor: colors.blueBtn,
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontWeight: 900,
    color: colors.title,
    fontSize: 13,
    letterSpacing: "0.01em",
  };

  const tableHeaderStyle: React.CSSProperties = {
    padding: "11px 9px",
    textAlign: "left",
    borderBottom: `1px solid ${colors.cardBorder}`,
    color: colors.title,
    background: colors.tableHeadBg,
    fontWeight: 900,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
  };

  const tableCellStyle: React.CSSProperties = {
    padding: "10px 9px",
    verticalAlign: "top",
    color: colors.text,
    borderBottom: `1px solid ${colors.cardBorder}`,
  };


  const sectionTitleStyle: React.CSSProperties = {
    margin: 0,
    color: colors.title,
    fontSize: 20,
    fontWeight: 950,
    letterSpacing: "-0.01em",
  };

  const helperTextStyle: React.CSSProperties = {
    color: colors.muted,
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.35,
  };

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    padding: "5px 9px",
    border: `1px solid ${colors.cardBorder}`,
    background: colors.cardSoftBg,
    color: colors.grayBtnText,
    fontWeight: 900,
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  const checkboxCellStyle: React.CSSProperties = {
    width: 82,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  };

  const largeCheckboxStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    cursor: "pointer",
  };

  const stickyButtonBarStyle: React.CSSProperties = {
    ...basePanelStyle,
    padding: 8,
    position: "sticky",
    top: 0,
    zIndex: 20,
    marginBottom: 18,
    borderRadius: "0 0 18px 18px",
    background: "rgba(255,255,255,0.96)",
    backdropFilter: "blur(8px)",
    boxShadow: "0 8px 20px rgba(23,32,51,0.12)",
  };

  const topRaceNavRowStyle: React.CSSProperties = {
    display: "flex",
    gap: 6,
    flexWrap: "nowrap",
    alignItems: "stretch",
    width: "100%",
    overflowX: "hidden",
    paddingBottom: 0,
  };

  const topRaceNavButtonStyle: React.CSSProperties = {
    flex: "1 1 0",
    minWidth: 0,
    minHeight: 40,
    padding: "7px 6px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 11.5,
    lineHeight: 1.12,
    whiteSpace: "normal",
    boxShadow: "none",
  };

  const sideRaceNavigationStyle: React.CSSProperties = {
    position: "fixed",
    right: 14,
    top: 10,
    zIndex: 30,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
    width: 118,
  };

  const sideRaceNavigationButtonStyle: React.CSSProperties = {
    background: colors.title,
    color: "#fff",
    border: "1px solid #111827",
    borderRadius: 999,
    padding: "10px 8px",
    minHeight: 52,
    width: 52,
    alignSelf: "flex-end",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 22,
    lineHeight: 1,
    boxShadow: "0 8px 18px rgba(17,24,39,0.24)",
  };

  const sideRaceNavigationSubButtonStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.98)",
    color: colors.grayBtnText,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 10,
    padding: "10px 8px",
    minHeight: 40,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 11,
    lineHeight: 1.1,
    boxShadow: "0 4px 12px rgba(31,42,55,0.12)",
  };

  const buildRaceSeriesLabel = (race: RaceName = selectedRace) => {
    const base = homeEventSeries.trim();
    return base ? `${base} ${race}` : race;
  };

  const renderSpecialCategorySelector = (note?: string) => (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 14, border: `1px solid ${colors.cardBorder}`, background: "#fff" }}>
      <label style={labelStyle}>Spezial-Kategorie</label>
      <select
        value={participantSpecialCategoryDraft}
        onChange={(e) => { setParticipantSpecialCategoryDraft(e.target.value); setParticipantSpecialCategoryDraftDirty(true); }}
        style={inputStyle}
      >
        <option value="">Automatische Kategorie nach Jahrgang/Geschlecht</option>
        {SPECIAL_CATEGORY_OPTIONS.map((category) => (
          <option key={category} value={category}>{category}</option>
        ))}
      </select>
      <div style={{ ...helperTextStyle, marginTop: 6 }}>
        {note || "Plausch 1–3 und Cruiser werden wie eigene Kategorien gewertet. Plausch-Kategorien starten im Programm zuerst; Cruiser startet direkt vor Boys 16+ / Girls 17+."}
      </div>
    </div>
  );



  useEffect(() => {
    const hideLegacyCruiserCheckbox = () => {
      const containers = Array.from(document.querySelectorAll(".rider-form-no-legacy-cruiser"));
      containers.forEach((container) => {
        const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
        checkboxes.forEach((checkbox) => {
          let node: HTMLElement | null = checkbox.closest("label") as HTMLElement | null;
          let fallback: HTMLElement | null = checkbox.parentElement;
          for (let i = 0; i < 4 && fallback && !node; i += 1) {
            const text = String(fallback.textContent || "").toLowerCase();
            if (text.includes("cruiser")) node = fallback;
            fallback = fallback.parentElement;
          }
          const targetText = String(node?.textContent || "").toLowerCase();
          if (node && targetText.includes("cruiser")) {
            node.style.display = "none";
          }
        });
      });
    };
    hideLegacyCruiserCheckbox();
    const timer = window.setTimeout(hideLegacyCruiserCheckbox, 0);
    return () => window.clearTimeout(timer);
  }, [editingRider, showEventParticipantCreateForm, appShellView, viewMode, currentEventId]);

  const renderAppHeader = () => (
    <AppHeader
      onHomeClick={async () => {
        if (!isFirebaseSignedIn) return;
        if (appShellView === "manager" && currentEventId && initialLoaded && hasUnsavedChanges) {
          const saved = await saveOnlineFullAppState();
          if (!saved) return;
        }
        setAppShellView("events");
        setViewMode("dashboard");
      }}
      colors={colors}
    />
  );

  const versionFooter = (
    <div
      style={{
        marginTop: 28,
        padding: "12px 14px",
        borderTop: `1px solid ${colors.cardBorder}`,
        color: colors.muted,
        fontWeight: 800,
        display: "flex",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span>Version {APP_VERSION}</span>
    </div>
  );

  const getRaceCardStyle = (hasResult: boolean): React.CSSProperties => ({
    marginBottom: 15,
    padding: 12,
    background: hasResult ? colors.greenBg : "#f8fafc",
    borderRadius: 10,
    border: `2px solid ${hasResult ? colors.greenBorder : colors.cardBorder}`,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  });

  const getFinalCardStyle = (
    roundName: string,
    hasResult: boolean,
  ): React.CSSProperties => {
    let background = "#f8fafc";
    let border = colors.cardBorder;
    let borderWidth = 2;
    let boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
    let transform = "none";

    if (roundName === "A-Final") {
      background = colors.finalA;
      border = colors.finalABorder;
      borderWidth = 4;
      boxShadow = "0 6px 18px rgba(215,168,0,0.18)";
      transform = "scale(1.01)";
    } else if (roundName === "B-Final") {
      background = colors.finalB;
      border = colors.finalBBorder;
    } else if (roundName === "C-Final") {
      background = colors.finalC;
      border = colors.finalCBorder;
    } else if (roundName === "D-Final") {
      background = "#fff7ed";
      border = "#fdba74";
    } else if (roundName.startsWith("Halbfinal")) {
      background = "#ecfeff";
      border = "#67e8f9";
      borderWidth = 3;
    } else if (roundName === "4. Vorlauf") {
      background = colors.fourthMotoBg;
      border = colors.fourthMotoBorder;
      borderWidth = 3;
      boxShadow = "0 4px 14px rgba(70,185,122,0.15)";
    } else if (roundName === "Manuelle Rangliste") {
      background = "#eef7ff";
      border = colors.blueBtn;
      borderWidth = 3;
      boxShadow = "0 4px 14px rgba(43,108,176,0.14)";
    }

    if (hasResult) {
      background = colors.greenBg;
      border = colors.greenBorder;
      if (roundName === "A-Final") {
        borderWidth = 4;
        boxShadow = "0 6px 18px rgba(80,170,110,0.2)";
      }
    }

    return {
      marginBottom: roundName === "A-Final" || roundName === "Manuelle Rangliste" ? 24 : 15,
      padding: roundName === "A-Final" || roundName === "Manuelle Rangliste" ? 16 : 12,
      background,
      borderRadius: 12,
      border: `${borderWidth}px solid ${border}`,
      boxShadow,
      transform,
    };
  };

  const getMedalRowStyle = (rank: number): React.CSSProperties => {
    if (rank === 1)
      return {
        background: colors.goldBg,
        border: `1px solid ${colors.goldBorder}`,
        borderRadius: 8,
        padding: "0 8px",
      };
    if (rank === 2)
      return {
        background: colors.silverBg,
        border: `1px solid ${colors.silverBorder}`,
        borderRadius: 8,
        padding: "0 8px",
      };
    if (rank === 3)
      return {
        background: colors.bronzeBg,
        border: `1px solid ${colors.bronzeBorder}`,
        borderRadius: 8,
        padding: "0 8px",
      };
    return { padding: "0 8px" };
  };

  const getRoundLabelForRankingAndPdf = (roundName: string) =>
    roundName === "4. Vorlauf" ? "4. Moto" : roundName;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setEventLogo(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const sanitizeFilePart = (value: string) =>
    (value || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\p{L}\p{N}_-]/gu, "");

  const buildPdfFilename = (base: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const labelMap: Record<string, string> = {
      bmx_finalresultate: "Resultate",
      bmx_vorlaeufe_startplaetze: "Vorlaeufe",
      bmx_finals_startplaetze: "Finals",
      bmx_gesamtwertung: "Gesamtwertung",
    };
    const documentType = labelMap[base] || base;
    const parts = [
      APP_NAME,
      buildRaceSeriesLabel(),
      documentType,
      eventDate || today,
    ].map(sanitizeFilePart).filter(Boolean);

    return `${parts.join("_") || "BMX_Race_Manager"}.pdf`;
  };

  const renderRows = (
    items: any[],
    renderItem: (item: any, index: number) => React.ReactNode,
  ) =>
    items.length > 0 ? (
      items.map((item, index) => (
        <div
          key={String(item.riderId ?? item.id ?? index)}
          style={{
            minHeight: ROW_HEIGHT,
            display: "flex",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          {renderItem(item, index)}
        </div>
      ))
    ) : (
      <div style={{ color: "#999" }}>-</div>
    );

  const startListTableStyle: React.CSSProperties = {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "54px 80px minmax(150px, 1fr) 95px minmax(120px, 0.8fr)",
    gap: 10,
    alignItems: "center",
  };

  const renderStartListHeader = () => (
    <div style={{ ...startListTableStyle, fontWeight: 800, color: colors.title, borderBottom: "1px solid #d8e0e6", paddingBottom: 6, marginBottom: 4 }}>
      <div>Gate</div>
      <div>Plate</div>
      <div>Name</div>
      <div>Jg | B/G</div>
      <div>Verein</div>
    </div>
  );

  const renderStartListCells = (r: any) => (
    <div style={{ ...startListTableStyle, minHeight: ROW_HEIGHT, overflow: "hidden" }}>
      <div style={{ fontWeight: 950, color: colors.blueBtn }}>{r.startPos || "-"}</div>
      <div style={{ fontWeight: 800 }}>#{r.plate}</div>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <div>{r.name}</div>
        <div style={{ color: colors.muted, fontSize: 11, fontFamily: "monospace" }}>ID: {getParticipantStableId(r).slice(0, 8) || "-"}</div>
      </div>
      <div>{getRiderMetaLabel(r)}</div>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.club || "-"}</div>
    </div>
  );

  const renderStartList = (heat: any[]) => (
    <div style={{ flex: "0 0 44%", ...basePanelStyle }}>
      <strong style={{ color: colors.title }}>Startliste</strong>
      <div style={{ ...listBoxStyle, marginTop: 8 }}>
        {renderStartListHeader()}
        {[...heat]
          .sort((a: any, b: any) => (a.startPos || 99) - (b.startPos || 99))
          .map((r: any) => (
            <div
              key={String(r.riderId ?? r.id)}
              style={{
                minHeight: ROW_HEIGHT,
                display: "flex",
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              {renderStartListCells(r)}
            </div>
          ))}
      </div>
    </div>
  );

  const renderSavedResult = (result: any[]) => (
    <div style={{ flex: "1 1 0", ...basePanelStyle }}>
      <strong style={{ color: colors.title }}>Zieleinlauf</strong>
      <div style={{ ...listBoxStyle, marginTop: 8 }}>
        {renderRows(result, (r, i) => (
          <div
            style={{
              width: "100%",
              ...getMedalRowStyle(i + 1),
              display: "grid",
              gridTemplateColumns:
                "44px 80px minmax(160px, 1fr) 95px minmax(130px, 0.8fr)",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div>{i + 1}.</div>
            <div style={{ fontWeight: 800 }}>#{r.plate}</div>
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.name}
            </div>
            <div>{r.status || getRiderMetaLabel(r)}</div>
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.club || "-"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const getVisiblePreAFinalRoundNames = (rounds: Record<string, any[]> | undefined) => {
    if (!rounds) return [] as string[];
    const hasMainFinals = !!rounds["A-Final"]?.length;
    const order = hasMainFinals ? FINAL_PRE_A_DISPLAY_ROUND_ORDER : FINAL_QUALIFYING_DISPLAY_ROUND_ORDER;
    return order.filter((roundName) => {
      const heat = rounds[roundName];
      return Array.isArray(heat) && heat.length > 0;
    });
  };

  const getVisibleAFinalRoundNames = (rounds: Record<string, any[]> | undefined) => {
    if (!rounds) return [] as string[];
    return ["4. Vorlauf", "A-Final"].filter((roundName) => {
      const heat = rounds[roundName];
      return Array.isArray(heat) && heat.length > 0;
    });
  };

  const renderFinalRoundCard = (cat: string, roundName: string) => {
    const heat = finals[cat]?.[roundName];
    if (!heat || heat.length === 0) return null;

    const key = `${cat}_${roundName}`;
    const result = finalResults[key] || [];

    const entryKey = getFinalEntryKey(cat, roundName);
    const complete = isCompleteRaceEntry(heat, result);

    return (
      <details
        id={getRaceFlowSectionId(entryKey)}
        key={key}
        open={isRaceFlowEntryActive(entryKey)}
        onToggle={(event) => {
          if ((event.currentTarget as HTMLDetailsElement).open) setActiveRaceEntryKey(entryKey);
        }}
        style={getRaceFlowWrapperStyle(getFinalCardStyle(roundName, result.length > 0), entryKey, complete)}
      >
        <summary
          style={{
            cursor: "pointer",
            listStyle: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <strong
            style={{
              color: colors.title,
              fontSize: roundName === "A-Final" || roundName === "Manuelle Rangliste" ? 22 : 18,
            }}
          >
            {getRoundDisplayName(roundName)}
          </strong>
          <span style={getRaceFlowBadgeStyle(entryKey, complete)}>
            {getRaceFlowBadgeLabel(entryKey, complete)}
          </span>
        </summary>

        <div
          style={{ display: "flex", gap: 20, marginTop: 10 }}
        >
          {renderStartList(heat)}
          {renderSavedResult(result)}
        </div>

        <div id={`${getRaceFlowSectionId(entryKey)}-input`} style={{ marginTop: 16, scrollMarginTop: 120 }}>
          <HeatInput
            heat={heat}
            value={result}
            allowUnlimitedSelectedRows={roundName === "Manuelle Rangliste"}
            onSave={(data: any[]) =>
              saveFinalResult(cat, roundName, data)
            }
          />
        </div>
      </details>
    );
  };

  const getResultStatusOrder = (status: any) => {
    const value = String(status || "").toUpperCase();
    if (value === "DNF" || value === "DNS") return 1;
    if (value === "DSQ") return 2;
    return 0;
  };

  const sortRaceResultRows = (rows: any[]) =>
    [...rows].sort((a: any, b: any) => {
      const statusDiff = getResultStatusOrder(a.status) - getResultStatusOrder(b.status);
      if (statusDiff !== 0) return statusDiff;
      return Number(a.rank || 999) - Number(b.rank || 999);
    });

  const buildFinalCategoryRanking = (cat: string, useManualOrder = true) => {
    const roundOrder = RACE_RANKING_ROUND_ORDER;
    const ranking: any[] = [];
    let globalRank = 1;

    roundOrder.forEach((roundName) => {
      const finalCategory = getEffectiveFinalCategory(cat);
      const saved = finalResults[`${finalCategory}_${roundName}`] || [];
      saved.forEach((r: any) => {
        if (hasDnsStatus(r)) return;
        const riderData = riders.find(
          (x: any) => String(x.id) === String(r.riderId),
        );
        if (!riderData || riderData.category !== cat) return;
        ranking.push({
          rank: globalRank,
          name: r.name,
          plate: r.plate,
          riderId: String(r.riderId),
          club: r.club || riderData?.club || "",
          birthYear: getRiderBirthYear(riderData || r) || "",
          gender: getRiderGenderCode(riderData || r) || "",
          roundName,
          run1: (
            getRanking(cat).find(
              (x: any) => String(x.riderId) === String(r.riderId),
            ) as any
          )?.runs?.[0],
          run2: (
            getRanking(cat).find(
              (x: any) => String(x.riderId) === String(r.riderId),
            ) as any
          )?.runs?.[1],
          run3: (
            getRanking(cat).find(
              (x: any) => String(x.riderId) === String(r.riderId),
            ) as any
          )?.runs?.[2],
          finalRun: r.status || r.rank,
          status: r.status || "",
          overallNoPoints: false,
        });
        globalRank += 1;
      });
    });

    if (!useManualOrder) return sortRaceResultRows(ranking).map((item, index) => ({ ...item, rank: index + 1 }));

    const saved = finalManualOrder[cat] || [];
    if (saved.length === 0) return sortRaceResultRows(ranking).map((item, index) => ({ ...item, rank: index + 1 }));

    const map = new Map(ranking.map((item) => [item.riderId, item]));
    const ordered: any[] = [];

    saved.forEach((id) => {
      const found = map.get(id);
      if (found) {
        ordered.push(found);
        map.delete(id);
      }
    });

    map.forEach((value) => ordered.push(value));

    // Wichtig: Wenn eine manuelle Reihenfolge gespeichert ist, darf hier NICHT
    // nochmals automatisch nach Rangpunkten/Status sortiert werden. Sonst wird
    // das manuelle Verschieben in der Race-Rangliste sofort wieder aufgehoben.
    return ordered.map((item, index) => ({ ...item, rank: index + 1 }));
  };

  const moveFinalRanking = (category: string, index: number, dir: number) => {
    const current = buildFinalCategoryRanking(category, true);
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= current.length) return;

    const ids = current.map((item) => item.riderId);
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];

    setFinalManualOrder((prev) => ({
      ...prev,
      [category]: ids,
    }));
    addChangeLog(`${selectedRace}: Rangliste ${category} manuell geändert`);
  };

  const addPdfHeader = (
    doc: jsPDF,
    title: string,
    subtitle: string,
    showEventInfo = true,
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(31, 42, 55);
    doc.roundedRect(10, 8, pageWidth - 20, 16, 3, 3, "F");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${APP_NAME} · ${APP_VERSION}`, 14, 18);

    doc.setFillColor(245, 248, 252);
    doc.roundedRect(10, 26, pageWidth - 20, 22, 3, 3, "F");
    doc.setDrawColor(210, 220, 230);
    doc.roundedRect(10, 26, pageWidth - 20, 22, 3, 3, "S");

    doc.setFontSize(17);
    doc.setTextColor(31, 42, 55);
    doc.text(title, 14, 35);

    doc.setFontSize(10);
    doc.setTextColor(78, 91, 111);
    doc.text(subtitle, 14, 43);

    const logoSize = 28;
    const logoX = pageWidth - 14 - logoSize;
    const logoY = 12;

    if (showEventInfo) {
      const eventInfoWidth = eventLogo ? 72 : 90;
      const eventInfoX = logoX - eventInfoWidth - 6;

      doc.setFillColor(232, 241, 255);
      doc.roundedRect(eventInfoX, 12, eventInfoWidth, 31, 3, 3, "F");

      doc.setFontSize(8);
      doc.setTextColor(31, 42, 55);
      doc.text(`Ort: ${eventLocation || "-"}`, eventInfoX + 3, 21);
      doc.text(`Datum: ${eventDate || "-"}`, eventInfoX + 3, 29);
      doc.text(`Race: ${selectedRace || "-"}`, eventInfoX + 3, 37);
    }

    if (eventLogo) {
      try {
        doc.addImage(eventLogo, "PNG", logoX, logoY, logoSize, logoSize);
      } catch {
        try {
          doc.addImage(eventLogo, "JPEG", logoX, logoY, logoSize, logoSize);
        } catch {}
      }
    }

    doc.setDrawColor(170, 184, 202);
    doc.line(10, 51, pageWidth - 10, 51);
  };

  const pageHeight = (doc: jsPDF) => doc.internal.pageSize.getHeight();

  const ensurePdfSpace = (
    doc: jsPDF,
    currentY: number,
    neededHeight: number,
    title: string,
    subtitle: string,
    category?: string,
  ) => {
    if (currentY + neededHeight <= pageHeight(doc) - 12) return currentY;

    doc.addPage();
    addPdfHeader(doc, title, subtitle);

    let newY = 52;
    if (category) {
      doc.setFontSize(13);
      doc.setTextColor(31, 42, 55);
      doc.text(category, 14, newY);
      newY += 6;
    }
    return newY;
  };

  const addPdfPageNumbers = (doc: jsPDF) => {
    const totalPages = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeightValue = doc.internal.pageSize.getHeight();

    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFontSize(8);
      doc.setTextColor(110, 120, 130);
      const created = new Date().toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
      doc.text(`${APP_NAME} ${APP_VERSION} · Erstellt ${created}`, 14, pageHeightValue - 7);
      doc.text(
        `Seite ${page} / ${totalPages}`,
        pageWidth - 38,
        pageHeightValue - 7,
      );
    }
  };

  const getPdfSectionColor = (label: string) => {
    if (label === "Race 1") return [232, 241, 255];
    if (label === "Race 2") return [233, 248, 239];
    if (label === "Race 3") return [245, 237, 255];
    if (label === "Manuelle Rangliste") return [207, 226, 255];
    if (label === "A-Final") return [255, 233, 168];
    if (label === "B-Final") return [232, 241, 255];
    if (label === "C-Final") return [241, 232, 255];
    if (label === "D-Final") return [255, 239, 219];
    if (String(label).startsWith("Halbfinal")) return [226, 245, 255];
    if (label === "4. Vorlauf") return [231, 255, 243];
    return [245, 247, 250];
  };

  const exportFinalsPdf = () => {
    const doc = new jsPDF("landscape");
    let firstPage = true;

    originalRaceCategories().forEach((cat) => {
      const ranking = buildFinalCategoryRanking(cat);
      if (ranking.length === 0) return;

      if (!firstPage) doc.addPage();
      firstPage = false;

      addPdfHeader(doc, buildRaceSeriesLabel(), `Kategorie: ${cat}`);

      autoTable(doc, {
        startY: 52,
        margin: { left: 14, right: 20 },
        head: [
          [
            "Rang",
            "Plate",
            "Name",
            "Jg | B/G",
            "Club",
            "Lauf 1",
            "Lauf 2",
            "Lauf 3",
            "Finals/Moto 4",
            "Wertungslauf",
          ],
        ],
        body: ranking.map((r: any) => [
          r.rank,
          r.plate,
          r.name,
          getRiderMetaLabel(
            riders.find((x: any) => String(x.id) === String(r.riderId)) || r,
          ),
          r.club || "",
          r.run1 ?? "-",
          r.run2 ?? "-",
          r.run3 ?? "-",
          r.finalRun ?? "-",
          getRoundLabelForRankingAndPdf(r.roundName),
        ]),
        pageBreak: "auto",
        rowPageBreak: "avoid",
        styles: { fontSize: 8, cellPadding: 1.1, minCellHeight: 4.8 },
        headStyles: { fillColor: [45, 108, 223] },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 22 },
          2: { cellWidth: 52 },
          3: { cellWidth: 24 },
          4: { cellWidth: 46 },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 },
          7: { cellWidth: 20 },
          8: { cellWidth: 28 },
          9: { cellWidth: 34 },
        },
        didParseCell: (data) => {
          if (data.section === "body") {
            const rowRank = Number(data.row.raw[0]);
            if (rowRank === 1) data.cell.styles.fillColor = [255, 244, 191];
            else if (rowRank === 2)
              data.cell.styles.fillColor = [241, 243, 245];
            else if (rowRank === 3)
              data.cell.styles.fillColor = [247, 223, 207];
          }
        },
      });
    });

    addPdfPageNumbers(doc);
    doc.save(buildPdfFilename("bmx_finalresultate"));
  };

  const exportHeatsStartPdf = () => {
    const doc = new jsPDF("landscape");
    let firstPage = true;

    [0, 1, 2].forEach((runIndex) => {
      if (!Object.keys(heats).length) return;

      if (!firstPage) doc.addPage();
      firstPage = false;

      const title = "BMX Motos - Startplätze";
      const subtitle = `Moto ${runIndex + 1}`;
      addPdfHeader(doc, title, subtitle);

      let currentY = 52;

      Object.keys(heats).forEach((cat) => {
        const catHeats = heats[cat]?.[runIndex] || [];
        if (!catHeats.length) return;

        currentY = ensurePdfSpace(doc, currentY, 18, title, subtitle);
        doc.setFontSize(13);
        doc.setTextColor(31, 42, 55);
        doc.text(cat, 14, currentY);
        currentY += 6;

        catHeats.forEach((group: any[], heatIndex: number) => {
          const heatLabel = `Race ${getSequentialHeatRaceNumber(heats, cat, runIndex, heatIndex)}`;
          const sectionColor = getPdfSectionColor(heatLabel);

          currentY = ensurePdfSpace(doc, currentY, 52, title, subtitle, cat);

          autoTable(doc, {
            startY: currentY,
            margin: { left: 14, right: 20 },
            head: [[heatLabel, "", "", "", "", ""]],
            body: Array.from({ length: 8 }).map((_, pos) => {
              const rider = group.find((r: any) => r.startPos === pos + 1);
              return [
                "",
                pos + 1,
                rider ? rider.name : "-",
                rider ? rider.plate : "-",
                rider ? getRiderMetaLabel(rider) : "-",
                rider ? rider.club || "-" : "-",
              ];
            }),
            theme: "grid",
            pageBreak: "avoid",
            rowPageBreak: "avoid",
            styles: { fontSize: 8, cellPadding: 1.1, minCellHeight: 4.8 },
            headStyles: {
              fillColor: sectionColor as [number, number, number],
              textColor: [31, 42, 55],
              halign: "left",
              fontStyle: "bold",
            },
            columnStyles: {
              0: { cellWidth: 26 },
              1: { cellWidth: 28 },
              2: { cellWidth: 64 },
              3: { cellWidth: 30 },
              4: { cellWidth: 28 },
              5: { cellWidth: 44 },
            },
            didParseCell: (data) => {
              if (data.section === "head") {
                if (data.column.index === 0) data.cell.text = [heatLabel];
                else if (data.column.index === 1) data.cell.text = ["Start"];
                else if (data.column.index === 2) data.cell.text = ["Name"];
                else if (data.column.index === 3) data.cell.text = ["Plate"];
                else if (data.column.index === 4) data.cell.text = ["Jg | B/G"];
                else if (data.column.index === 5) data.cell.text = ["Club"];
              }
            },
          });

          currentY = (doc as any).lastAutoTable.finalY + 6;
        });

        currentY += 4;
      });
    });

    addPdfPageNumbers(doc);
    doc.save(buildPdfFilename("bmx_motos_startplaetze"));
  };

  const exportFinalsStartPdf = () => {
    const doc = new jsPDF("landscape");
    let firstPage = true;
    const title = "BMX Finals - Startplätze";

    const addFinalsStartPage = (cat: string, roundNames: string[], titleSuffix = "") => {
      const rounds = finals[cat];
      if (!rounds) return;
      const visibleRoundNames = roundNames.filter((roundName) => {
        const heat = rounds[roundName];
        return Array.isArray(heat) && heat.length > 0;
      });
      if (visibleRoundNames.length === 0) return;

      if (!firstPage) doc.addPage();
      firstPage = false;

      const subtitle = `Kategorie: ${getFinalCategoryLabel(cat)}${titleSuffix}`;
      addPdfHeader(doc, title, subtitle);

      let currentY = 52;

      visibleRoundNames.forEach((roundName) => {
        const heat = rounds[roundName];
        if (!heat || !heat.length) return;

        const sectionColor = getPdfSectionColor(roundName);
        currentY = ensurePdfSpace(doc, currentY, 52, title, subtitle, cat);

        autoTable(doc, {
          startY: currentY,
          margin: { left: 14, right: 20 },
          head: [[getRoundDisplayName(roundName), "", "", "", ""]],
          body: Array.from({ length: roundName === "Manuelle Rangliste" ? heat.length : 8 }).map((_, pos) => {
            const rider = heat.find((r: any) => r.startPos === pos + 1);
            return [
              pos + 1,
              rider ? rider.name : "-",
              rider ? rider.plate : "-",
              rider ? getRiderMetaLabel(rider) : "-",
              rider ? rider.club || "-" : "-",
            ];
          }),
          theme: "grid",
          pageBreak: "avoid",
          rowPageBreak: "avoid",
          styles: { fontSize: 8, cellPadding: 1.1, minCellHeight: 4.8 },
          headStyles: {
            fillColor: sectionColor as [number, number, number],
            textColor: [31, 42, 55],
            halign: "left",
            fontStyle: "bold",
          },
          columnStyles: {
            0: { cellWidth: 28 },
            1: { cellWidth: 72 },
            2: { cellWidth: 32 },
            3: { cellWidth: 28 },
            4: { cellWidth: 50 },
          },
          didParseCell: (data) => {
            if (data.section === "head") {
              if (data.column.index === 0) data.cell.text = [getRoundDisplayName(roundName)];
              else if (data.column.index === 1) data.cell.text = ["Name"];
              else if (data.column.index === 2) data.cell.text = ["Plate"];
              else if (data.column.index === 3) data.cell.text = ["Jg | B/G"];
              else if (data.column.index === 4) data.cell.text = ["Club"];
            }
          },
        });

        currentY = (doc as any).lastAutoTable.finalY + 6;
      });
    };

    const categories = sortCategories(Object.keys(finals || {}));
    categories.forEach((cat) => addFinalsStartPage(cat, getVisiblePreAFinalRoundNames(finals[cat])));
    categories.forEach((cat) => addFinalsStartPage(cat, getVisibleAFinalRoundNames(finals[cat]), " · A-Final"));

    addPdfPageNumbers(doc);
    doc.save(buildPdfFilename("bmx_finals_startplaetze"));
  };

  const toggleRaceForRider = async (
    riderId: string,
    race: RaceName,
    checked: boolean,
  ) => {
    const flag = raceKeyMap[race];
    await db.table("riders").update(riderId, { [flag]: checked });
    await loadAllRiders();
    await loadRaceRiders();
    addChangeLog(`${race}: Teilnehmerzuordnung geändert`);
  };

  const areAllSelectedForRace = (race: RaceName, category?: string) => {
    const flag = raceKeyMap[race];
    const items = category
      ? allRiders.filter((r: any) => r.category === category)
      : allRiders;
    return items.length > 0 && items.every((r: any) => !!r[flag]);
  };

  const selectAllForRace = async (race: RaceName, category?: string) => {
    const flag = raceKeyMap[race];
    const items = category
      ? allRiders.filter((r: any) => r.category === category)
      : allRiders;
    const nextValue = !areAllSelectedForRace(race, category);
    if (
      !window.confirm(
        `${race}: ${category ? "Kategorie " + category : "alle Teilnehmer"} wirklich ${nextValue ? "auswählen" : "abwählen"}?`,
      )
    )
      return;

    for (const rider of items) {
      await db.table("riders").update(rider.id, { [flag]: nextValue });
    }
    await loadAllRiders();
    await loadRaceRiders();
    addChangeLog(
      `${race}: ${category ? "Kategorie " + category : "alle Teilnehmer"} ${nextValue ? "ausgewählt" : "abgewählt"}`,
    );
  };

  const getOverallPointsForRank = (rank: number) => {
    if (rank <= 0) return 0;
    if (rank === 1) return 75;
    if (rank === 2) return 70;
    if (rank === 3) return 65;
    if (rank === 4) return 62;
    if (rank === 5) return 60;
    if (rank === 6) return 59;
    if (rank === 7) return 58;
    if (rank === 8) return 57;
    if (rank === 9) return 56;
    return Math.max(0, 65 - rank);
  };

  const loadFinalResultsForRace = (race: RaceName) => {
    const raw = appStorage.getItem(getRaceStorageKey(race, "final_results"));
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  };

  const loadFinalManualOrderForRace = (race: RaceName) => {
    const raw = appStorage.getItem(
      getRaceStorageKey(race, "final_manual_order"),
    );
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  };

  const raceHasFinalResults = (race: RaceName) => {
    const parsed = loadFinalResultsForRace(race);
    return Object.values(parsed).some(
      (value: any) => Array.isArray(value) && value.length > 0,
    );
  };
  const raceHasAnyData = (race: RaceName) => {
    const heatData = getStoredRaceData(race, "heats", {});
    const finalData = getStoredRaceData(race, "finals", {});
    const finalResultData = getStoredRaceData(race, "final_results", {});
    const closed = race === selectedRace
      ? raceClosed
      : JSON.parse(appStorage.getItem(getRaceStorageKey(race, "race_closed")) || "false");
    return !!closed || Object.keys(heatData || {}).length > 0 || Object.keys(finalData || {}).length > 0 || Object.values(finalResultData || {}).some((value: any) => Array.isArray(value) && value.length > 0);
  };

  const getMinimumSeriesRaceCount = () => {
    const indexes = RACES.map((race, index) => (raceHasAnyData(race) ? index + 1 : 0));
    return Math.max(1, ...indexes);
  };

  const getUsedRaceLabels = () =>
    RACES.map((race, index) => (raceHasAnyData(race) ? `Race ${index + 1}` : "")).filter(Boolean);

  const getSeriesSettingWarnings = () => {
    const warnings: string[] = [];
    const minAllowed = getMinimumSeriesRaceCount();
    const usedRaces = getUsedRaceLabels();
    const completedRaces = activeRaces.filter((race) => raceHasFinalResults(race)).length;

    if (seriesRaceCount < minAllowed) {
      warnings.push(`Anzahl Rennen ist zu tief. Minimum ist Race ${minAllowed}, weil dort bereits Daten vorhanden sind.`);
    }

    if (usedRaces.length > 0 && minAllowed > seriesRaceCount) {
      warnings.push(`Vorhandene Race-Daten liegen ausserhalb der Serie: ${usedRaces.join(", ")}.`);
    }

    if (overallCountingRaces > seriesRaceCount) {
      warnings.push("Anzahl zählende Rennen darf nicht grösser sein als die Anzahl Rennen der Serie.");
    }

    if (completedRaces > 0 && overallCountingRaces > completedRaces) {
      warnings.push(`Zwischenwertung: Erst ${completedRaces} von ${overallCountingRaces} zählenden Rennen haben Resultate.`);
    }

    return warnings;
  };

  const updateSeriesRaceCount = (nextRaw: number) => {
    if (seriesLocked) {
      window.alert("Die Serie ist abgeschlossen. Bitte zuerst wieder öffnen.");
      return;
    }
    const minAllowed = getMinimumSeriesRaceCount();
    const requested = Number(nextRaw) || minAllowed;
    const next = Math.max(minAllowed, Math.min(10, requested));
    if (next !== requested) {
      const used = getUsedRaceLabels();
      window.alert(
        `Die Anzahl Rennen kann nicht unter ${minAllowed} reduziert werden, weil bereits Daten vorhanden sind.${used.length ? `\n\nBetroffene Rennen: ${used.join(", ")}` : ""}`
      );
    }
    setSeriesRaceCount(next);
    setOverallCountingRaces((current) => Math.max(1, Math.min(current, next)));
  };

  const updateOverallCountingRaces = (nextRaw: number) => {
    if (seriesLocked) {
      window.alert("Die Serie ist abgeschlossen. Bitte zuerst wieder öffnen.");
      return;
    }
    const requested = Number(nextRaw) || 1;
    const next = Math.max(1, Math.min(seriesRaceCount, requested));
    if (next !== requested) {
      window.alert(`Die Anzahl zählende Rennen muss zwischen 1 und ${seriesRaceCount} liegen.`);
    }
    setOverallCountingRaces(next);
  };

  const getSeriesRulesText = () =>
    `${seriesRaceCount} Rennen in Serie · beste ${overallCountingRaces} Resultate zählen · (${Math.max(0, seriesRaceCount - overallCountingRaces)}) Streichresultat${Math.max(0, seriesRaceCount - overallCountingRaces) === 1 ? "" : "e"}`;

  const toggleSeriesLocked = () => {
    if (seriesLocked) {
      if (!window.confirm("Serie wieder öffnen? Danach können Serien-Einstellungen wieder geändert werden.")) return;
      setSeriesLocked(false);
      addChangeLog("Serie wieder geöffnet");
      return;
    }
    if (!window.confirm("Serie abschliessen? Serien-Einstellungen werden gesperrt, bis die Serie wieder geöffnet wird.")) return;
    setSeriesLocked(true);
    addChangeLog("Serie abgeschlossen");
  };

  const saveSeriesTemplate = () => {
    const suggested = homeEventSeries.trim() || `Vorlage ${seriesTemplates.length + 1}`;
    const name = window.prompt("Name der Serienvorlage", suggested);
    if (!name) return;
    const template = {
      id: `${Date.now()}`,
      name: name.trim(),
      seriesRaceCount,
      overallCountingRaces,
      homeEventSeries,
      eventLogo,
      createdAt: new Date().toISOString(),
    };
    setSeriesTemplates((prev) => [template, ...prev.filter((x) => x.name !== template.name)].slice(0, 10));
    addChangeLog(`Serienvorlage gespeichert: ${template.name}`);
  };

  const applySeriesTemplate = (templateId: string) => {
    const template = seriesTemplates.find((x) => String(x.id) === String(templateId));
    if (!template) return;
    if (seriesLocked) {
      window.alert("Die Serie ist abgeschlossen. Bitte zuerst wieder öffnen.");
      return;
    }
    if (!window.confirm(`Serienvorlage "${template.name}" übernehmen?`)) return;
    const minAllowed = getMinimumSeriesRaceCount();
    const nextRaceCount = Math.max(minAllowed, Math.min(10, Number(template.seriesRaceCount) || seriesRaceCount));
    const nextCounting = Math.max(1, Math.min(nextRaceCount, Number(template.overallCountingRaces) || overallCountingRaces));
    setSeriesRaceCount(nextRaceCount);
    setOverallCountingRaces(nextCounting);
    setHomeEventSeries(template.homeEventSeries || homeEventSeries);
    if (template.eventLogo) setEventLogo(template.eventLogo);
    addChangeLog(`Serienvorlage übernommen: ${template.name}`);
  };

  const deleteSeriesTemplate = (templateId: string) => {
    const template = seriesTemplates.find((x) => String(x.id) === String(templateId));
    if (!template) return;
    if (!window.confirm(`Serienvorlage "${template.name}" löschen?`)) return;
    setSeriesTemplates((prev) => prev.filter((x) => String(x.id) !== String(templateId)));
    addChangeLog(`Serienvorlage gelöscht: ${template.name}`);
  };


  const getRoundNameFromFinalResultKey = (key: string) =>
    FINAL_RESULT_ROUND_NAMES.find((roundName) => key.endsWith(`_${roundName}`)) || "";

  const buildRaceCategoryRankingFromStoredFinals = (
    race: RaceName,
    category: string,
    parsedFinalResults: Record<string, any[]>,
    savedFinalOrder: Record<string, string[]>,
  ) => {
    const roundOrder = RACE_RANKING_ROUND_ORDER;
    const ranking: any[] = [];
    let globalRank = 1;

    roundOrder.forEach((roundName) => {
      const roundRows: any[] = [];

      Object.keys(parsedFinalResults || {}).forEach((key) => {
        if (getRoundNameFromFinalResultKey(key) !== roundName) return;
        const value = Array.isArray(parsedFinalResults[key]) ? parsedFinalResults[key] : [];
        value.forEach((entry: any) => {
          if (hasDnsStatus(entry)) return;
          const riderData = allRiders.find((x: any) => String(x.id) === String(entry.riderId));
          const originalCategory = riderData?.category || entry.originalCategory || entry.category || "";
          if (originalCategory !== category) return;
          roundRows.push({
            ...entry,
            riderId: String(entry.riderId),
            originalCategory,
            category,
            roundName,
          });
        });
      });

      sortRaceResultRows(roundRows).forEach((row) => {
        ranking.push({ ...row, rank: globalRank });
        globalRank += 1;
      });
    });

    const savedOrder = savedFinalOrder[category] || [];
    if (savedOrder.length > 0) {
      const map = new Map(ranking.map((item: any) => [String(item.riderId), item]));
      const ordered: any[] = [];
      savedOrder.forEach((id: string) => {
        const found = map.get(String(id));
        if (found) {
          ordered.push(found);
          map.delete(String(id));
        }
      });
      map.forEach((value) => ordered.push(value));
      return ordered.map((item, index) => ({ ...item, rank: index + 1 }));
    }

    return sortRaceResultRows(ranking).map((item, index) => ({ ...item, rank: index + 1 }));
  };

  const buildRacePointsMap = (race: RaceName) => {
    const parsed = loadFinalResultsForRace(race);
    const savedFinalOrder = loadFinalManualOrderForRace(race);

    const categories = new Set<string>();
    Object.keys(parsed || {}).forEach((key) => {
      const value = Array.isArray(parsed[key]) ? parsed[key] : [];
      value.forEach((entry: any) => {
        const riderData = allRiders.find((x: any) => String(x.id) === String(entry.riderId));
        const originalCategory = riderData?.category || entry.originalCategory || entry.category || "";
        if (originalCategory) categories.add(originalCategory);
      });
    });

    const pointsMap: Record<string, number | null> = {};

    categories.forEach((category) => {
      const raceRankingForOverall = buildRaceCategoryRankingFromStoredFinals(
        race,
        category,
        parsed,
        savedFinalOrder,
      );

      raceRankingForOverall.forEach((r: any, index: number) => {
        const riderId = String(r.riderId);
        const rank = index + 1;
        pointsMap[riderId] = getOverallPointsForRank(rank);
      });
    });

    return pointsMap;
  };

  const calculateOverallByCategory = (onlyEnoughRaces = false) => {
    const eligibleRaces = getOverallEligibleRaces();
    const raceMaps = eligibleRaces.map((race) => buildRacePointsMap(race));
    const completedRaceCount = eligibleRaces.filter((race) => raceHasFinalResults(race)).length;
    const requiredCountingRaces = Math.max(1, Math.min(overallCountingRaces, seriesRaceCount));

    const grouped: Record<string, any[]> = {};

    allRiders.forEach((r: any) => {
      const riderId = String(r.id);
      const racePoints = raceMaps.map((map) => map[riderId] ?? null);

      const participated = racePoints.filter((x) => x !== null) as number[];
      if (participated.length === 0) return;
      if (onlyEnoughRaces && participated.length < requiredCountingRaces) return;

      const scoredEntries = racePoints
        .map((points, index) => ({
          raceIndex: activeRaces.indexOf(eligibleRaces[index]) + 1,
          race: eligibleRaces[index],
          points: points ?? -999,
        }))
        .filter((x) => x.points >= 0);

      const sortedBest = [...scoredEntries].sort(
        (a, b) => b.points - a.points || a.raceIndex - b.raceIndex,
      );
      const countedEntries = sortedBest.slice(0, requiredCountingRaces);
      const droppedEntries = sortedBest.slice(requiredCountingRaces);
      const total = countedEntries.reduce((sum, x) => sum + x.points, 0);
      const dropResults = droppedEntries.map((x) => x.points).sort((a, b) => b - a);
      const countedRaceIndexes = new Set(countedEntries.map((x) => x.raceIndex));
      const lastRacePlayed =
        [...scoredEntries].sort((a, b) => b.raceIndex - a.raceIndex)[0]
          ?.points ?? -1;
      const bestSingleResult = sortedBest[0]?.points ?? -1;

      const item: any = {
        riderId,
        name: r.name,
        plate: r.plate,
        club: r.club || "",
        birthYear: getRiderBirthYear(r) || "",
        gender: getRiderGenderCode(r) || "",
        category: r.category,
        raceCount: participated.length,
        total,
        dropResult: dropResults[0] ?? -1,
        dropResults,
        countedRaceIndexes: Array.from(countedRaceIndexes),
        droppedRaceIndexes: droppedEntries.map((x) => x.raceIndex),
        lastRacePlayed,
        bestSingleResult,
      };

      activeRaces.forEach((_, index) => {
        item[`race${index + 1}`] = null;
      });
      racePoints.forEach((points, index) => {
        const activeIndex = activeRaces.indexOf(eligibleRaces[index]);
        if (activeIndex >= 0) item[`race${activeIndex + 1}`] = points;
      });

      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(item);
    });

    Object.keys(grouped).forEach((category) => {
      grouped[category].sort((a, b) => {
        if (a.total !== b.total) return b.total - a.total;
        const maxDrops = Math.max(a.dropResults?.length || 0, b.dropResults?.length || 0);
        for (let i = 0; i < maxDrops; i += 1) {
          const aDrop = a.dropResults?.[i] ?? -1;
          const bDrop = b.dropResults?.[i] ?? -1;
          if (aDrop !== bDrop) return bDrop - aDrop;
        }
        if (a.bestSingleResult !== b.bestSingleResult) return b.bestSingleResult - a.bestSingleResult;
        if (a.lastRacePlayed !== b.lastRacePlayed)
          return b.lastRacePlayed - a.lastRacePlayed;
        return String(a.name).localeCompare(String(b.name));
      });
    });

    return grouped;
  };

  const createOverallRanking = async () => {
    if (overallLocked) {
      window.alert("Die Gesamtwertung ist gesperrt. Bitte zuerst freigeben, bevor sie neu erstellt wird.");
      return;
    }
    const preview = getOverallPreviewRows();
    const summary = preview.map((x) => `${x.race}: ${x.count} Resultate (${x.status})`).join("\n");
    const requiredCountingRaces = Math.max(1, Math.min(overallCountingRaces, seriesRaceCount));
    const mode = window.prompt(
      `Gesamtwertung erstellen: Welche Teilnehmer sollen erscheinen?\n\n` +
        `1 = Alle Teilnehmer mit mindestens einem Resultat\n` +
        `2 = Nur Teilnehmer mit genügend Rennen (${requiredCountingRaces})\n\n` +
        `Eingabe 1 oder 2:`,
      "1",
    );
    if (mode === null) return;
    const normalizedMode = String(mode).trim();
    if (normalizedMode !== "1" && normalizedMode !== "2") {
      window.alert("Bitte Gesamtwertung nochmals erstellen und 1 oder 2 eingeben.");
      return;
    }
    const onlyEnoughRaces = normalizedMode === "2";
    const modeLabel = onlyEnoughRaces
      ? `Nur Teilnehmer mit genügend Rennen (${requiredCountingRaces})`
      : "Alle Teilnehmer mit mindestens einem Resultat";
    if (!window.confirm(`Gesamtwertung jetzt erstellen/aktualisieren?\n\nModus: ${modeLabel}\nSerien-Einstellung: ${seriesRaceCount} Rennen, beste ${overallCountingRaces} zählen.\nTie-Breaker: bessere Streichresultate.\n\n${summary}`)) return;
    const nextOverall = calculateOverallByCategory(onlyEnoughRaces);
    setGeneratedOverallByCategory(nextOverall);
    setOverallManualOrder({});
    const createdAt = new Date().toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
    setOverallCreatedAt(createdAt);
    setOverallLocked(false);
    addChangeLog(`Gesamtwertung erstellt (${createdAt}) · ${modeLabel}`);
    setViewMode("overall");
  };

  const toggleOverallLocked = () => {
    if (Object.keys(overallByCategory).length === 0) {
      window.alert("Es ist noch keine Gesamtwertung erstellt.");
      return;
    }
    if (overallLocked) {
      if (!window.confirm("Gesamtwertung freigeben? Danach kann sie wieder neu erstellt oder manuell geändert werden.")) return;
      setOverallLocked(false);
      addChangeLog("Gesamtwertung freigegeben");
      return;
    }
    if (!window.confirm("Gesamtwertung sperren? Manuelle Änderungen und Neuerstellung sind danach geschützt.")) return;
    setOverallLocked(true);
    addChangeLog("Gesamtwertung gesperrt");
  };

  const getRaceCloseWarnings = () => {
    const warnings: string[] = [];
    if (Object.keys(heats || {}).length === 0)
      warnings.push("Motos wurden noch nicht erstellt.");
    if (Object.keys(finals || {}).length === 0)
      warnings.push("Finals wurden noch nicht erstellt.");

    Object.keys(finals || {}).forEach((cat) => {
      if (isSemifinalProgram(finals[cat]) && !finals[cat]?.["A-Final"]) {
        warnings.push(`${getFinalCategoryLabel(cat)}: Finals wurden aus den Halbfinals noch nicht freigeschaltet.`);
      }
      Object.keys(finals[cat] || {}).forEach((roundName) => {
        const startList = finals[cat][roundName] || [];
        const saved = finalResults[`${cat}_${roundName}`] || [];
        if (startList.length > 0 && saved.length !== startList.length) {
          warnings.push(
            `${getFinalCategoryLabel(cat)} ${getRoundDisplayName(roundName)}: ${saved.length}/${startList.length} Resultate erfasst.`,
          );
        }
        const ids = new Set<string>();
        const ranks = new Set<number>();
        saved.forEach((r: any) => {
          const id = String(r.riderId || "");
          const status = String(r.status || "").toUpperCase();
          const rank = Number(r.rank);
          if (id && ids.has(id))
            warnings.push(
              `${getFinalCategoryLabel(cat)} ${getRoundDisplayName(roundName)}: Fahrer doppelt im Resultat.`,
            );
          if (id) ids.add(id);
          if (!status && (!Number.isFinite(rank) || rank <= 0)) {
            warnings.push(`${getFinalCategoryLabel(cat)} ${getRoundDisplayName(roundName)}: Resultat ohne Rang oder Status.`);
          }
          if (!status && Number.isFinite(rank) && rank > 0) {
            if (ranks.has(rank)) warnings.push(`${getFinalCategoryLabel(cat)} ${getRoundDisplayName(roundName)}: Rang ${rank} ist doppelt vergeben.`);
            ranks.add(rank);
          }
        });
      });
    });

    return warnings;
  };

  const toggleRaceClosed = () => {
    if (raceClosed) {
      if (
        !window.confirm(
          `${selectedRace} wieder öffnen? Danach können Resultate wieder geändert werden.`,
        )
      )
        return;
      setRaceClosed(false);
      addChangeLog(`${selectedRace}: wieder geöffnet`);
      return;
    }

    const warnings = getRaceCloseWarnings();
    const warningText = warnings.length
      ? `\n\nWarnungen vor dem Abschluss:\n${warnings.slice(0, 12).join("\n")}`
      : "";
    if (
      !window.confirm(
        `${selectedRace} abschliessen und sperren? Motos, Finals und Resultate sind danach gegen versehentliche Änderungen geschützt.${warningText}`,
      )
    )
      return;
    setRaceClosed(true);
    addChangeLog(`${selectedRace}: abgeschlossen`);

    if (isCurrentRaceLive) {
      const shouldEndLive = window.confirm(
        `${selectedRace} wurde abgeschlossen.\n\nSoll die öffentliche Live-Ansicht jetzt auch beendet werden?\n\nOK = Live-Ansicht beenden\nAbbrechen = Live-Ansicht weiter anzeigen`,
      );
      if (shouldEndLive) {
        window.setTimeout(() => {
          void deactivateCurrentRaceLive(true);
        }, 0);
      } else {
        setLiveRaceMessage("Race abgeschlossen. Live-Ansicht bleibt aktiv und wird automatisch aktualisiert.");
        window.setTimeout(() => {
          void liveAutoPublishCallbackRef.current();
        }, 500);
      }
    }
  };

  const overallByCategory = generatedOverallByCategory;

  const applyManualOrder = (category: string, items: any[]) => {
    const saved = overallManualOrder[category] || [];
    if (saved.length === 0) return items;

    const map = new Map(items.map((item) => [item.riderId, item]));
    const ordered: any[] = [];

    saved.forEach((id) => {
      const found = map.get(id);
      if (found) {
        ordered.push(found);
        map.delete(id);
      }
    });

    map.forEach((value) => ordered.push(value));
    return ordered;
  };

  const moveOverall = (category: string, index: number, dir: number) => {
    const current = applyManualOrder(
      category,
      overallByCategory[category] || [],
    );
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= current.length) return;

    const ids = current.map((x) => x.riderId);
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];

    setOverallManualOrder((prev) => ({
      ...prev,
      [category]: ids,
    }));
    addChangeLog(`Gesamtwertung ${category} manuell geändert`);
  };

  const saveCurrentState = async (options: { markClean?: boolean; showMessage?: boolean; logChange?: boolean } = {}) => {
    const { markClean = false, showMessage = false, logChange = false } = options;
    try {
      const iso = new Date().toISOString();
      await saveBoth("bmx_last_save_at", iso);
      await saveBoth("bmx_home_event_series", homeEventSeries || "");
      await saveBoth("bmx_event_logo", eventLogo || "");
      await saveBoth("bmx_participant_event_year", participantEventYear);
      await saveBoth("bmx_generated_overall", generatedOverallByCategory || {});
      await saveBoth("bmx_overall_manual_order", overallManualOrder || {});
      await saveBoth("bmx_overall_locked", overallLocked);
      await saveBoth("bmx_overall_created_at", overallCreatedAt || "");
      await saveBoth("bmx_change_log", changeLog || []);
      setLastSaveAt(iso);
      if (markClean) setHasUnsavedChanges(false);
      if (showMessage) setBackupMessage(`Zwischenspeicher aktualisiert: ${formatDateTime(iso)}`);
      if (logChange) addChangeLog(`Zwischenspeicher aktualisiert: ${formatDateTime(iso)}`);
      return iso;
    } catch (error: any) {
      alert(`Speichern fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
      return "";
    }
  };

  const buildBackupFileName = () => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
    const cleanSeries = (homeEventSeries || "BMX-Race")
      .replace(/[^a-z0-9äöüÄÖÜ_-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const cleanApp = APP_NAME.replace(/[^a-z0-9äöüÄÖÜ_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return `${cleanApp}_${cleanSeries}_${APP_VERSION}_${date}_${time}.json`;
  };

  const buildFullAppBackupEnvelope = async (reason = "Manuelles Backup") => {
    const ridersBackup = await db.table("riders").toArray();
    const appDataBackup = await db.table("appData").toArray();
    const eventsBackup = getRawManagedEvents();

    const backup = createBackupEnvelope({
      reason,
      lastSaveAt,
      managedEvents: normalizeManagedEventsForSchema(eventsBackup),
      riders: ridersBackup,
      appData: appDataBackup,
    });

    return { backup, ridersBackup, appDataBackup, eventsBackup };
  };

  const restoreFullAppBackupEnvelope = async (backup: any) => {
    await db.transaction(
      "rw",
      db.table("riders"),
      db.table("appData"),
      async () => {
        await db.table("riders").clear();
        await db.table("appData").clear();
        if (Array.isArray(backup.riders) && backup.riders.length > 0) await db.table("riders").bulkPut(backup.riders);
        if (Array.isArray(backup.appData) && backup.appData.length > 0) await db.table("appData").bulkPut(backup.appData);
      },
    );

    appStorage.keys().forEach((key) => {
      if (key.startsWith("bmx_")) appStorage.removeItem(key);
    });

    const eventsToRestore = normalizeManagedEventsForSchema(Array.isArray(backup.managedEvents) ? backup.managedEvents : getRawManagedEvents());
    appStorage.setItem(EVENT_LIST_KEY, JSON.stringify(eventsToRestore));
    if (Array.isArray(backup.appData)) {
      for (const row of backup.appData) {
        if (row && typeof row.key === "string") appStorage.setItem(row.key, encodeStorageValue(row.value));
      }
    }
  };

  const exportBackup = async (reason = "Manuelles Backup") => {
    try {
      const { backup, ridersBackup, eventsBackup } = await buildFullAppBackupEnvelope(reason);

      const fileName = buildBackupFileName();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const backupEntry = { fileName, iso: new Date().toISOString(), riderCount: ridersBackup.length, eventCount: eventsBackup.length, reason };
      const nextBackupHistory = [backupEntry, ...backupHistory].slice(0, 12);
      setBackupHistory(nextBackupHistory);
      await saveBoth("bmx_backup_history", nextBackupHistory);
      setBackupMessage(`Backup erstellt: ${fileName}`);
      addChangeLog(`${reason}: ${fileName}`);
    } catch (error: any) {
      setBackupMessage("");
      alert(
        `Backup-Export fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`,
      );
    }
  };

  const saveAndExportFullBackup = async () => {
    await createNamedOnlineBackup();
  };

  const isLocalNewerThanOnline = (onlineIso?: string) => {
    if (hasUnsavedChanges) return true;
    if (!lastSaveAt || !onlineIso) return false;
    const localTime = new Date(lastSaveAt).getTime();
    const onlineTime = new Date(onlineIso).getTime();
    return Number.isFinite(localTime) && Number.isFinite(onlineTime) && localTime > onlineTime;
  };

  const formatPayloadSize = (size?: number) => {
    const parsed = Number(size);
    if (!Number.isFinite(parsed) || parsed <= 0) return "-";
    const kiloBytes = parsed / 1024;
    if (kiloBytes >= 1024) return `${(kiloBytes / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(kiloBytes))} KB`;
  };

  const isFirebaseSignedIn = Boolean(firebaseAuthSession?.idToken);

  const ensureOnlineAuthSession = async (actionLabel = "Online-Funktion", showAlert = true) => {
    if (!isOnlineStorageConfigured()) {
      const message = "Online-Speicher ist noch nicht konfiguriert. Bitte Vercel Environment Variables prüfen.";
      setOnlineStatus({ ok: false, exists: false, message });
      setOnlineStorageMessage(message);
      if (showAlert) window.alert(message);
      return null;
    }

    if (firebaseAuthSession?.idToken) {
      const expiresAtMs = new Date(firebaseAuthSession.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() > 5 * 60 * 1000) {
        setOnlineStorageAuthToken(firebaseAuthSession.idToken);
        return firebaseAuthSession;
      }

      try {
        const refreshedSession = await refreshFirebaseAuthSession(firebaseAuthSession);
        setFirebaseAuthSession(refreshedSession);
        setOnlineStorageAuthToken(refreshedSession.idToken);
        if (refreshedSession.email) setFirebaseAuthEmail(refreshedSession.email);
        return refreshedSession;
      } catch {
        signOutFirebaseAuth();
      }
    }

    setFirebaseAuthSession(null);
    setOnlineStorageAuthToken("");
    const message = `${actionLabel} benötigt eine Anmeldung. Bitte zuerst mit Firebase E-Mail und Passwort anmelden.`;
    setFirebaseAuthMessage(message);
    setOnlineStorageMessage(message);
    if (showAlert) window.alert(message);
    return null;
  };

  const loginFirebaseAuth = async () => {
    try {
      setFirebaseAuthLoading(true);
      setFirebaseAuthMessage("Anmeldung läuft ...");
      const session = await signInWithFirebaseEmailPassword(firebaseAuthEmail, firebaseAuthPassword);
      setFirebaseAuthSession(session);
      setOnlineStorageAuthToken(session.idToken);
      setFirebaseAuthPassword("");
      setFirebaseAuthMessage(`Angemeldet als ${session.email}`);
      setOnlineStorageMessage(`Angemeldet als ${session.email}`);
      await refreshOnlineStatus(false, session);
    } catch (error: any) {
      const message = error?.message || "Firebase Login fehlgeschlagen.";
      setFirebaseAuthMessage(message);
      window.alert(message);
    } finally {
      setFirebaseAuthLoading(false);
    }
  };

  const logoutFirebaseAuth = () => {
    signOutFirebaseAuth();
    setFirebaseAuthSession(null);
    setOnlineStorageAuthToken("");
    setFirebaseAuthPassword("");
    setOnlineStorageMessage("Abgemeldet. Online speichern/laden ist gesperrt.");
    setFirebaseAuthMessage("Abgemeldet. Bitte neu anmelden, um online zu speichern oder zu laden.");
  };

  const refreshOnlineStatus = async (showAlert = false, existingSession?: FirebaseAuthSession | null) => {
    const authSession = existingSession || (await ensureOnlineAuthSession("Online-Status prüfen", showAlert));
    if (!authSession) return null;
    setOnlineStorageAuthToken(authSession.idToken);

    try {
      setOnlineStatusLoading(true);
      setOnlineStorageMessage("Online-Status wird geprüft ...");
      const [statusResult, backupResult] = await Promise.all([
        getOnlineAppStateStatus(),
        listOnlineBackups(),
      ]);
      const checkedAt = new Date().toISOString();
      setOnlineStatus(statusResult);
      setOnlineStatusCheckedAt(checkedAt);
      if (backupResult.ok) {
        setOnlineBackups(backupResult.backups);
        if (!selectedOnlineBackupId && backupResult.backups[0]?.id) setSelectedOnlineBackupId(backupResult.backups[0].id);
      }
      const localNewerNote = statusResult.exists && isLocalNewerThanOnline(statusResult.updatedAt)
        ? " Lokale Daten sind neuer als der Online-Stand."
        : "";
      const backupNote = backupResult.ok ? ` Online-Backups: ${backupResult.backups.length}.` : " Online-Backups konnten nicht geprüft werden.";
      const deviceNote = statusResult.savedByDevice ? ` Zuletzt gespeichert von: ${statusResult.savedByDevice}.` : "";
      const revisionNote = statusResult.saveRevision ? ` Revision: ${statusResult.saveRevision}.` : "";
      const message = `${statusResult.message}${statusResult.updatedAt ? ` Stand: ${formatDateTime(statusResult.updatedAt)}.` : ""}${deviceNote}${revisionNote}${localNewerNote}${backupNote}`;
      setOnlineStorageMessage(message);
      if (showAlert) window.alert(message);
      return { statusResult, backupResult };
    } catch (error: any) {
      const message = `Online-Status konnte nicht geprüft werden: ${error?.message || "Unbekannter Fehler"}`;
      setOnlineStorageMessage(message);
      if (showAlert) window.alert(message);
      return null;
    } finally {
      setOnlineStatusLoading(false);
    }
  };

  const getEffectiveDeviceName = () => {
    const current = deviceName.trim();
    if (current) return current;
    const fallback = typeof navigator !== "undefined" && /ipad|iphone|mobile/i.test(navigator.userAgent) ? "iPad / Mobilgerät" : "Browser-Gerät";
    setDeviceName(fallback);
    appStorage.setItem("bmx_device_name", fallback);
    return fallback;
  };

  const isOnlineStatusNewerThanLastKnownSave = (status?: OnlineStorageStatus | null) => {
    if (!status?.exists || !status.updatedAt) return false;
    const onlineTime = new Date(status.updatedAt).getTime();
    const knownTime = lastOnlineSaveAt ? new Date(lastOnlineSaveAt).getTime() : 0;
    return Number.isFinite(onlineTime) && onlineTime > knownTime + 1500;
  };

  const checkOnlineSaveConflictBeforeSave = async () => {
    const status = await getOnlineAppStateStatus();
    setOnlineStatus(status);
    setOnlineStatusCheckedAt(new Date().toISOString());
    if (!status.ok || !status.exists || !isOnlineStatusNewerThanLastKnownSave(status)) return { canSave: true, status };

    const message = `Online-Konflikt erkannt.

Der Online-Stand wurde seit deiner letzten bekannten Speicherung geändert.

Online: ${formatDateTime(status.updatedAt)}${status.savedByDevice ? ` · Gerät: ${status.savedByDevice}` : ""}
Dieses Gerät: ${lastSaveAt ? formatDateTime(lastSaveAt) : "unbekannt"}

Bitte wählen:
1 = Meine lokale Version trotzdem online speichern
2 = Online-Version laden
3 = Abbrechen`;
    const choice = window.prompt(message, "3");
    const normalized = String(choice || "").trim();
    if (normalized === "1") {
      setSaveConflictMessage("Konflikt bewusst überschrieben. Lokale Version wurde online gespeichert.");
      return { canSave: true, status };
    }
    if (normalized === "2") {
      await loadOnlineFullAppState();
      return { canSave: false, status };
    }
    setSaveConflictMessage("Speichern abgebrochen, weil online ein neuerer Stand vorhanden ist.");
    return { canSave: false, status };
  };

  const saveOnlineFullAppState = async () => {
    const authSession = await ensureOnlineAuthSession("Online speichern");
    if (!authSession) return false;

    try {
      const conflictCheck = await checkOnlineSaveConflictBeforeSave();
      if (!conflictCheck.canSave) return false;

      setOnlineStorageMessage("Online speichern läuft ...");
      await saveCurrentState();
      const { backup, ridersBackup, eventsBackup } = await buildFullAppBackupEnvelope("Online speichern");
      const result = await saveOnlineAppState(backup, {
        appName: APP_NAME,
        appVersion: APP_VERSION,
        riderCount: ridersBackup.length,
        eventCount: eventsBackup.length,
        saveRevision: Number(conflictCheck.status?.saveRevision || 0) + 1,
        savedByDevice: getEffectiveDeviceName(),
      });

      if (!result.ok) throw new Error(result.message || "Online-Speichern fehlgeschlagen.");

      const iso = result.updatedAt || new Date().toISOString();
      await saveBoth("bmx_last_online_save_at", iso);
      setLastOnlineSaveAt(iso);
      setHasUnsavedChanges(false);
      setOnlineStatus({ ok: true, exists: true, message: "Online-Daten vorhanden.", updatedAt: iso, appVersion: APP_VERSION, riderCount: ridersBackup.length, eventCount: eventsBackup.length, saveRevision: Number(conflictCheck.status?.saveRevision || 0) + 1, savedByDevice: getEffectiveDeviceName() });
      setOnlineStatusCheckedAt(new Date().toISOString());

      let liveNote = "";
      if (isCurrentRaceLive) {
        const livePayload = buildPublicLiveRacePayload();
        const liveResult = await publishPublicLiveRace(livePayload);
        if (!liveResult.ok) throw new Error(liveResult.message || "Live-Rennen konnte nicht aktualisiert werden.");
        const updatedLivePayload = { ...livePayload, updatedAt: liveResult.updatedAt || livePayload.updatedAt, active: true };
        setAdminLiveRace(updatedLivePayload);
        liveNote = ` · Live aktualisiert: ${formatDateTime(updatedLivePayload.updatedAt)}`;
      }

      setOnlineStorageMessage(`Online gespeichert: ${formatDateTime(iso)}${liveNote}`);
      setBackupMessage(`Online gespeichert: ${formatDateTime(iso)}${liveNote}`);
      addChangeLog(`Online gespeichert: ${formatDateTime(iso)}${liveNote}`);
      return true;
    } catch (error: any) {
      setOnlineStorageMessage("");
      window.alert(`Online-Speichern fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
      return false;
    }
  };

  const askBeforeReplacingLocalData = async (sourceLabel: string, updatedAt?: string) => {
    if (isLocalNewerThanOnline(updatedAt)) {
      const choice = window.prompt(
        `Konflikt erkannt: Die lokalen Daten auf diesem Gerät sind neuer als ${sourceLabel}.

` +
          `Lokaler Stand: ${formatDateTime(lastSaveAt)}
` +
          `${sourceLabel}: ${updatedAt ? formatDateTime(updatedAt) : "unbekannt"}

` +
          `Bitte auswählen:
` +
          `1 = ${sourceLabel} laden und lokale Daten ersetzen
` +
          `2 = Lokale Version zuerst als aktuellen Online-Stand speichern
` +
          `3 = Abbrechen, nichts verändern

` +
          `Empfehlung: Bei Unsicherheit zuerst abbrechen oder lokale Version online speichern.`,
        "3",
      );
      const normalizedChoice = String(choice || "").trim();
      if (normalizedChoice === "2") {
        await saveOnlineFullAppState();
        return false;
      }
      if (normalizedChoice !== "1") return false;
    }

    return window.confirm(
      `${sourceLabel} laden?

` +
        `Stand: ${updatedAt ? formatDateTime(updatedAt) : "unbekannt"}

` +
        `Wichtig:
` +
        `- Alle aktuellen lokalen Daten auf diesem Gerät werden ersetzt.
` +
        `- Vorher wird automatisch ein komplettes Datei-Sicherheitsbackup heruntergeladen.
` +
        `- Rennen, Teilnehmer, Resultate und Einstellungen werden aus dem gewählten Online-Stand übernommen.

` +
        `Nur fortfahren, wenn du diesen Stand wirklich wiederherstellen möchtest.`,
    );
  };

  const restoreOnlineBackupData = async (backup: any, sourceLabel: string, updatedAt?: string) => {
    const validation = validateBackupStructure(backup);
    if (!validation.ok) {
      throw new Error(validation.message || "Die Online-Daten sind unvollständig oder beschädigt.");
    }

    const backupSummary = getBackupSummary(backup);
    const detailsOk = window.confirm(
      `${sourceLabel} wirklich wiederherstellen?

` +
        `Inhalt des gewählten Online-Stands:
` +
        `- Rennen/Rennserien: ${backupSummary.eventCount}
` +
        `- Teilnehmer: ${backupSummary.riderCount}
` +
        `- Gespeicherte App-Daten: ${backupSummary.appDataCount}
` +
        `- Backup-Version: ${backupSummary.backupVersion}
` +
        `- Datenstruktur-Version: ${backupSummary.dataSchemaVersion}
` +
        `- Stand: ${updatedAt ? formatDateTime(updatedAt) : formatDateTime(backupSummary.exportedAt)}

` +
        `Ablauf:
` +
        `1. Die App erstellt zuerst automatisch ein Datei-Sicherheitsbackup der aktuellen lokalen Daten.
` +
        `2. Danach werden die lokalen Daten vollständig durch diesen Online-Stand ersetzt.
` +
        `3. Die App wird anschliessend neu geladen.`,
    );
    if (!detailsOk) return false;

    await exportBackup(`Sicherheitsbackup vor Laden von ${sourceLabel}`);
    await restoreFullAppBackupEnvelope(backup);
    alert(`${sourceLabel} erfolgreich geladen. Die App wird jetzt neu geladen.`);
    window.location.reload();
    return true;
  };

  const loadOnlineFullAppState = async () => {
    const authSession = await ensureOnlineAuthSession("Letzten Online-Stand laden");
    if (!authSession) return;

    try {
      setOnlineStorageMessage("Letzter Online-Speicherstand wird geprüft ...");
      const statusResult = await getOnlineAppStateStatus();
      setOnlineStatus(statusResult);
      setOnlineStatusCheckedAt(new Date().toISOString());
      if (!statusResult.ok) throw new Error(statusResult.message || "Online-Status konnte nicht geprüft werden.");
      if (!statusResult.exists) {
        setOnlineStorageMessage("Keine Online-Daten vorhanden.");
        window.alert("Es sind noch keine Online-Daten vorhanden. Bitte zuerst Online speichern.");
        return;
      }

      const canLoad = await askBeforeReplacingLocalData("letzten Online-Speicherstand", statusResult.updatedAt);
      if (!canLoad) {
        setOnlineStorageMessage("");
        return;
      }

      setOnlineStorageMessage("Letzter Online-Speicherstand wird geladen ...");
      const result = await loadOnlineAppState();
      if (!result.ok) throw new Error(result.message || "Online-Laden fehlgeschlagen.");
      await restoreOnlineBackupData(result.data, "Letzter Online-Speicherstand", result.updatedAt || statusResult.updatedAt);
    } catch (error: any) {
      setOnlineStorageMessage("");
      window.alert(`Online-Laden fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
    }
  };

  const createNamedOnlineBackup = async () => {
    const authSession = await ensureOnlineAuthSession("Online-Backup erstellen");
    if (!authSession) return;

    const defaultLabel = `${homeEventSeries || managedEvents.find((event) => event.id === currentEventId)?.name || "BMX Race Manager"} · ${formatDateTime(new Date().toISOString())}`;
    const label = window.prompt("Beschriftung für das Backup eingeben:", defaultLabel);
    if (label === null) return;
    const finalLabel = label.trim() || defaultLabel;

    try {
      setOnlineStorageMessage("Backup wird online und als Datei erstellt ...");
      await saveCurrentState();
      const { backup, ridersBackup, eventsBackup } = await buildFullAppBackupEnvelope(`Backup: ${finalLabel}`);
      const statusBeforeBackup = await getOnlineAppStateStatus();
      const meta = {
        appName: APP_NAME,
        appVersion: APP_VERSION,
        riderCount: ridersBackup.length,
        eventCount: eventsBackup.length,
        saveRevision: Number(statusBeforeBackup?.saveRevision || 0) + 1,
        savedByDevice: getEffectiveDeviceName(),
      };

      const mainResult = await saveOnlineAppState(backup, meta);
      if (!mainResult.ok) throw new Error(mainResult.message || "Online-Speichern fehlgeschlagen.");

      const result = await createOnlineBackup(backup, finalLabel, meta);
      if (!result.ok) throw new Error(result.message || "Online-Backup konnte nicht erstellt werden.");

      await exportBackup(`Backup-Datei zu Online-Backup: ${finalLabel}`);

      const iso = mainResult.updatedAt || result.updatedAt || new Date().toISOString();
      await saveBoth("bmx_last_online_save_at", iso);
      setLastOnlineSaveAt(iso);
      setHasUnsavedChanges(false);
      setOnlineStatus({ ok: true, exists: true, message: "Online-Daten vorhanden.", updatedAt: iso, appVersion: APP_VERSION, riderCount: ridersBackup.length, eventCount: eventsBackup.length, saveRevision: meta.saveRevision, savedByDevice: meta.savedByDevice });
      setOnlineStatusCheckedAt(new Date().toISOString());
      setOnlineBackups(result.backups || []);
      if (result.backupId) setSelectedOnlineBackupId(result.backupId);
      setOnlineStorageMessage(`Backup erstellt: online und als Datei · ${formatDateTime(iso)}`);
      setBackupMessage(`Backup erstellt: ${finalLabel}`);
      addChangeLog(`Backup online und als Datei erstellt: ${finalLabel}`);
    } catch (error: any) {
      setOnlineStorageMessage("");
      window.alert(`Backup fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
    }
  };

  const loadSelectedOnlineBackup = async (backupIdOverride?: string) => {
    const authSession = await ensureOnlineAuthSession("Online-Backup laden");
    if (!authSession) return;

    const backupId = backupIdOverride || selectedOnlineBackupId;
    if (!backupId) {
      window.alert("Bitte zuerst ein Online-Backup auswählen oder Online-Status prüfen.");
      return;
    }

    const selectedBackup = onlineBackups.find((backup) => backup.id === backupId);
    const sourceLabel = selectedBackup ? `Online-Backup „${selectedBackup.label}“` : "ausgewähltes Online-Backup";

    try {
      const canLoad = await askBeforeReplacingLocalData(sourceLabel, selectedBackup?.createdAt);
      if (!canLoad) return;

      setOnlineStorageMessage(`${sourceLabel} wird geladen ...`);
      const result = await loadOnlineBackup(backupId);
      if (!result.ok) throw new Error(result.message || "Online-Backup konnte nicht geladen werden.");
      await restoreOnlineBackupData(result.data, sourceLabel, result.updatedAt || selectedBackup?.createdAt);
    } catch (error: any) {
      setOnlineStorageMessage("");
      window.alert(`Online-Backup laden fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
    }
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      const validation = validateBackupStructure(backup);
      if (!validation.ok) {
        alert(validation.message || "Die Backup-Datei ist unvollständig oder beschädigt.");
        event.target.value = "";
        return;
      }

      const backupSummary = getBackupSummary(backup);
      const schemaNote = backupSummary.schemaNote;
      const exportedAt = backupSummary.exportedAt;
      const ok = window.confirm(
        `Komplettes Backup importieren?

Datei: ${file.name}
Erstellt: ${exportedAt}
Rennen/Rennserien: ${backupSummary.eventCount}
Teilnehmer: ${backupSummary.riderCount}
Gespeicherte App-Daten: ${backupSummary.appDataCount}
Backup-Version: ${backupSummary.backupVersion}
Datenstruktur-Version: ${backupSummary.dataSchemaVersion}${schemaNote}

Achtung: Die aktuellen lokalen Daten auf diesem Gerät werden vollständig überschrieben.`,
      );

      if (!ok) {
        event.target.value = "";
        return;
      }

      await exportBackup("Sicherheitsbackup vor komplettem Backup-Import");
      await restoreFullAppBackupEnvelope(backup);

      alert("Backup erfolgreich importiert. Die bisherigen lokalen Daten auf diesem Gerät wurden vollständig ersetzt. Die App wird jetzt neu geladen.");
      window.location.reload();
    } catch (error: any) {
      alert(
        `Backup-Import fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`,
      );
    }

    event.target.value = "";
  };
  const exportOverallExcel = () => {
    if (Object.keys(overallByCategory).length === 0) {
      window.alert("Es ist noch keine Gesamtwertung erstellt.");
      return;
    }
    const rows: any[] = [];
    sortCategories(Object.keys(overallByCategory)).forEach((category) => {
      const items = applyManualOrder(category, overallByCategory[category] || []);
      items.forEach((r: any, index: number) => {
        const row: any = {
          Kategorie: category,
          Rang: index + 1,
          Name: r.name,
          Plate: r.plate,
          Jahrgang: r.birthYear || "",
          Geschlecht: r.gender || "",
          Club: r.club || "",
        };
        activeRaces.forEach((_, raceIndex) => {
          const value = r[`race${raceIndex + 1}`];
          const isDropped = Array.isArray(r.droppedRaceIndexes) && r.droppedRaceIndexes.includes(raceIndex + 1);
          row[`Race ${raceIndex + 1}`] = value === null || value === undefined ? "" : isDropped ? `(${value})` : value;
        });
        row.Gesamt = r.total;
        row.Streichresultate = Array.isArray(r.dropResults) && r.dropResults.length ? r.dropResults.map((x: any) => `(${x})`).join(", ") : "";
        row["Anzahl Rennen"] = r.raceCount;
        rows.push(row);
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gesamtwertung");
    const cleanSeries = (homeEventSeries || "BMX-Race").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "BMX-Race";
    XLSX.writeFile(wb, `${cleanSeries}-Gesamtwertung.xlsx`);
    addChangeLog("Gesamtwertung Excel exportiert");
  };

  const exportOverallPdf = () => {
    const doc = new jsPDF("landscape");
    let firstPage = true;

    sortCategories(Object.keys(overallByCategory)).forEach((category) => {
      const items = applyManualOrder(
        category,
        overallByCategory[category] || [],
      );
      if (!items.length) return;

      if (!firstPage) doc.addPage();
      firstPage = false;

      addPdfHeader(
        doc,
        homeEventSeries.trim() ? `${homeEventSeries.trim()} Gesamtwertung` : "BMX Race Manager Gesamtwertung",
        `Kategorie: ${category}`,
        false,
      );

      doc.setFontSize(9);
      doc.setTextColor(80, 95, 110);
      doc.text(getSeriesRulesText(), 14, 47);
      doc.text("() = Streichresultat · Tie-Breaker: besseres Streichresultat", 14, 51);

      autoTable(doc, {
        startY: 56,
        margin: { left: 14, right: 20 },
        head: [["Rang", "Name", "Plate", "Jg | B/G", "Club", ...activeRaces.map((_, index) => `R${index + 1}`), "Gesamt", "Streich"]],
        body: items.map((r: any, index: number) => [
          index + 1,
          `${r.name}${r.raceCount < overallCountingRaces ? " *" : ""}`,
          r.plate,
          getRiderMetaLabel(r),
          r.club || "",
          ...activeRaces.map((_, raceIndex) => {
            const value = r[`race${raceIndex + 1}`];
            if (value === null || value === undefined) return "-";
            return Array.isArray(r.droppedRaceIndexes) && r.droppedRaceIndexes.includes(raceIndex + 1) ? `(${value})` : value;
          }),
          r.total,
          Array.isArray(r.dropResults) && r.dropResults.length ? r.dropResults.join(", ") : "-",
        ]),
        pageBreak: "auto",
        rowPageBreak: "avoid",
        styles: {
          fontSize: 8,
          cellPadding: 1.1,
          minCellHeight: 4.8,
        },
        headStyles: {
          fillColor: [45, 108, 223],
        },
        didParseCell: (data) => {
          if (data.section === "body") {
            const rowRank = Number(data.row.raw[0]);
            if (rowRank === 1) data.cell.styles.fillColor = [255, 244, 191];
            else if (rowRank === 2)
              data.cell.styles.fillColor = [241, 243, 245];
            else if (rowRank === 3)
              data.cell.styles.fillColor = [247, 223, 207];
          }
        },
      });

      const footerY = Math.min(((doc as any).lastAutoTable?.finalY || 56) + 10, 195);
      doc.setFontSize(9);
      doc.setTextColor(80, 95, 110);
      doc.text("() = Streichresultat", 14, footerY);
      if (items.some((r: any) => r.raceCount < overallCountingRaces)) {
        doc.text("*= noch nicht genügend Rennen für die aktuelle Serienwertung gefahren", 14, footerY + 5);
      }
    });

    addPdfPageNumbers(doc);
    doc.save(buildPdfFilename("bmx_gesamtwertung"));
  };


  const getPublicLiveUrl = () => {
    if (typeof window === "undefined") return "#live";
    return `${window.location.origin}${window.location.pathname}${window.location.search}#live`;
  };

  const openPublicLiveView = () => {
    if (typeof window === "undefined") return;
    window.location.hash = "live";
    setIsPublicLiveView(true);
  };

  const copyPublicLiveUrl = async () => {
    const liveUrl = getPublicLiveUrl();
    try {
      await navigator.clipboard.writeText(liveUrl);
      setLiveRaceMessage("Live-Link kopiert.");
    } catch {
      window.prompt("Live-Link kopieren:", liveUrl);
    }
  };

  const getPublicRiderRow = (rider: any, fallbackRank?: number) => ({
    gate: rider?.startPos || rider?.gate || "",
    plate: String(rider?.plate || "").trim(),
    name: String(rider?.name || "Ohne Name").trim(),
    club: String(rider?.club || "").trim(),
    category: String(rider?.category || "").trim(),
    rank: Number(rider?.rank || fallbackRank || 0) || undefined,
    status: String(rider?.status || "").trim(),
  });

  const buildPublicLiveRacePayload = (): PublicLiveRacePayload => {
    const nowIso = new Date().toISOString();
    const currentEvent = getCurrentEvent();
    const eventName = homeEventSeries.trim() || currentEvent?.name || "BMX Rennen";
    const raceStatus = getRaceStatus(selectedRace);
    const publicCategories = sortCategories(Object.keys(groupedRace || {})).map((category) => ({
      category,
      riders: [...(groupedRace[category] || [])]
        .sort((a: any, b: any) => String(a.plate || "").localeCompare(String(b.plate || ""), "de-CH", { numeric: true }) || String(a.name || "").localeCompare(String(b.name || ""), "de-CH", { numeric: true }))
        .map((rider: any) => getPublicRiderRow(rider)),
    }));

    const publicMotos = sortCategories(Object.keys(heats || {})).map((category) => ({
      category,
      runs: [0, 1, 2].map((runIndex) => ({
        name: `Moto ${runIndex + 1}`,
        races: ((heats?.[category]?.[runIndex] || []) as any[]).map((group: any[], heatIndex: number) => {
          const key = `${category}_${runIndex}_${heatIndex}`;
          const result = Array.isArray(results?.[key]) ? results[key] : [];
          return {
            flowKey: getMotoEntryKey(category, runIndex, heatIndex),
            raceNumber: getSequentialHeatRaceNumber(heats, category, runIndex, heatIndex),
            resultComplete: isCompleteRaceEntry(group || [], result),
            startList: [...(group || [])]
              .sort((a: any, b: any) => Number(a.startPos || 99) - Number(b.startPos || 99))
              .map((rider: any) => getPublicRiderRow(rider)),
            results: result.map((rider: any, index: number) => getPublicRiderRow(rider, index + 1)),
          };
        }),
      })).filter((run) => run.races.length > 0),
    })).filter((categoryBlock) => categoryBlock.runs.length > 0);

    const buildPublicFinalRound = (category: string, roundName: string) => {
      const heat = finals?.[category]?.[roundName] || [];
      const key = `${category}_${roundName}`;
      const result = Array.isArray(finalResults?.[key]) ? finalResults[key] : [];
      return {
        flowKey: getFinalEntryKey(category, roundName),
        name: getRoundDisplayName(roundName),
        resultComplete: isCompleteRaceEntry(heat, result),
        startList: [...heat]
          .sort((a: any, b: any) => Number(a.startPos || 99) - Number(b.startPos || 99))
          .map((rider: any) => getPublicRiderRow(rider)),
        results: result.map((rider: any, index: number) => getPublicRiderRow(rider, index + 1)),
      };
    };

    const publicFinalCategories = sortCategories(Object.keys(finals || {}));
    const publicFinals = [
      ...publicFinalCategories.map((category) => ({
        category: getFinalCategoryLabel(category),
        rounds: getVisiblePreAFinalRoundNames(finals?.[category]).map((roundName) => buildPublicFinalRound(category, roundName)),
      })).filter((categoryBlock) => categoryBlock.rounds.some((round) => round.startList.length > 0 || round.results.length > 0)),
      ...publicFinalCategories.map((category) => ({
        category: `${getFinalCategoryLabel(category)} · A-Final`,
        rounds: getVisibleAFinalRoundNames(finals?.[category]).map((roundName) => buildPublicFinalRound(category, roundName)),
      })).filter((categoryBlock) => categoryBlock.rounds.some((round) => round.startList.length > 0 || round.results.length > 0)),
    ];

    const publicFinalRankings = Object.keys(finals || {}).length > 0
      ? originalRaceCategories().map((category) => ({
          category,
          rows: buildFinalCategoryRanking(category).map((rider: any, index: number) => ({
            rank: rider.rank || index + 1,
            plate: String(rider.plate || ""),
            name: String(rider.name || ""),
            club: String(rider.club || ""),
            final: getRoundLabelForRankingAndPdf(rider.roundName),
            status: String(rider.status || ""),
          })),
        })).filter((categoryBlock) => categoryBlock.rows.length > 0)
      : [];

    const publicLiveHasRaceProgram = publicMotos.length > 0 || publicFinals.length > 0;

    return {
      publicVersion: 3,
      active: true,
      refreshSeconds: publicLiveHasRaceProgram ? PUBLIC_LIVE_RACE_REFRESH_SECONDS : PUBLIC_LIVE_STARTLIST_REFRESH_SECONDS,
      hasRaceProgram: publicLiveHasRaceProgram,
      publishedAt: nowIso,
      updatedAt: nowIso,
      appName: APP_NAME,
      appVersion: APP_VERSION,
      eventId: currentEventId || "legacy",
      eventName,
      raceName: selectedRace,
      raceStatus,
      location: eventLocation || "",
      date: eventDate || "",
      participantCount: riders.length,
      categories: publicCategories,
      motos: publicMotos,
      finals: publicFinals,
      finalRankings: publicFinalRankings,
    };
  };

  const isCurrentRaceLive = Boolean(
    adminLiveRace?.active &&
      String(adminLiveRace.eventId || "") === String(currentEventId || "legacy") &&
      String(adminLiveRace.raceName || "") === String(selectedRace || ""),
  );

  const refreshAdminLiveRaceStatus = async (showAlert = false) => {
    try {
      setLiveRaceLoading(true);
      const result = await loadPublicLiveRace();
      setAdminLiveRace(result.data || null);
      const message = result.active && result.data
        ? `Live veröffentlicht: ${result.data.eventName} · ${result.data.raceName} · ${formatDateTime(result.updatedAt || result.data.updatedAt)}`
        : result.message;
      setLiveRaceMessage(message);
      if (showAlert) window.alert(message);
      return result;
    } catch (error: any) {
      const message = `Live-Status konnte nicht geprüft werden: ${error?.message || "Unbekannter Fehler"}`;
      setLiveRaceMessage(message);
      if (showAlert) window.alert(message);
      return null;
    } finally {
      setLiveRaceLoading(false);
    }
  };

  const publishCurrentRaceLiveSnapshot = async (options: { manual?: boolean; showLoading?: boolean; saveLocalFirst?: boolean } = {}) => {
    const { manual = false, showLoading = false, saveLocalFirst = false } = options;
    const authSession = await ensureOnlineAuthSession(manual ? "Live-Rennen veröffentlichen" : "Live-Rennen automatisch aktualisieren", manual);
    if (!authSession) return false;

    if (!currentEventId) {
      if (manual) window.alert("Bitte zuerst ein Rennen öffnen.");
      return false;
    }

    try {
      if (showLoading) setLiveRaceLoading(true);
      setLiveRaceMessage(manual ? "Live-Rennen wird veröffentlicht ..." : "Live-Rennen wird automatisch aktualisiert ...");
      if (saveLocalFirst) await saveCurrentState();
      const payload = buildPublicLiveRacePayload();
      const result = await publishPublicLiveRace(payload);
      if (!result.ok) throw new Error(result.message || "Live-Rennen konnte nicht veröffentlicht werden.");
      const updatedPayload = { ...payload, updatedAt: result.updatedAt || payload.updatedAt, liveVersion: result.liveVersion || payload.liveVersion, active: true };
      setAdminLiveRace(updatedPayload);
      setLiveRaceMessage(
        manual
          ? `Live veröffentlicht: ${payload.eventName} · ${payload.raceName} · ${formatDateTime(updatedPayload.updatedAt)}`
          : `Live automatisch aktualisiert: ${formatDateTime(updatedPayload.updatedAt)}`
      );
      if (manual) addChangeLog(`${selectedRace}: Live-Rennen veröffentlicht/aktualisiert`);
      return true;
    } catch (error: any) {
      const message = manual
        ? `Live-Veröffentlichung fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`
        : `Automatische Live-Aktualisierung fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`;
      setLiveRaceMessage(message);
      if (manual) window.alert(message);
      return false;
    } finally {
      if (showLoading) setLiveRaceLoading(false);
    }
  };

  liveAutoPublishCallbackRef.current = async () => {
    await publishCurrentRaceLiveSnapshot({ manual: false, showLoading: false, saveLocalFirst: false });
  };

  const triggerAutomaticLivePublish = (delayMs = 500) => {
    if (!firebaseAuthReady || !isFirebaseSignedIn || !isCurrentRaceLive) return;
    if (liveAutoPublishInProgressRef.current) return;
    liveAutoPublishInProgressRef.current = true;
    window.setTimeout(() => {
      liveAutoPublishCallbackRef.current().finally(() => {
        liveAutoPublishInProgressRef.current = false;
      });
    }, delayMs);
  };

  const publishCurrentRaceLive = async () => {
    return publishCurrentRaceLiveSnapshot({ manual: true, showLoading: true, saveLocalFirst: true });
  };

  const deactivateCurrentRaceLive = async (skipConfirm = false) => {
    const authSession = await ensureOnlineAuthSession("Live-Rennen beenden");
    if (!authSession) return false;

    if (!skipConfirm) {
      const ok = window.confirm(
        `Live-Ansicht beenden?\n\nDie Zuschauer sehen danach kein aktives Live-Rennen mehr. Die internen Renn- und Resultatdaten bleiben unverändert.`,
      );
      if (!ok) return false;
    }

    try {
      setLiveRaceLoading(true);
      setLiveRaceMessage("Live-Rennen wird beendet ...");
      const payload = adminLiveRace || buildPublicLiveRacePayload();
      const result = await deactivatePublicLiveRace({ ...payload, active: false, appVersion: APP_VERSION });
      if (!result.ok) throw new Error(result.message || "Live-Rennen konnte nicht beendet werden.");
      const stoppedPayload = { ...payload, active: false, updatedAt: result.updatedAt || new Date().toISOString() };
      setAdminLiveRace(stoppedPayload);
      setLiveRaceMessage(`Live-Rennen beendet: ${formatDateTime(stoppedPayload.updatedAt)}`);
      addChangeLog(`${selectedRace}: Live-Rennen beendet`);
      return true;
    } catch (error: any) {
      const message = `Live-Rennen beenden fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`;
      setLiveRaceMessage(message);
      window.alert(message);
      return false;
    } finally {
      setLiveRaceLoading(false);
    }
  };

  const refreshPublicLiveRace = async (showLoading = true) => {
    try {
      if (showLoading) setPublicLiveLoading(true);
      const result = await loadPublicLiveRace();
      const checkedIso = new Date().toISOString();
      setPublicLiveCheckedAt(checkedIso);
      if (result.ok && result.active && result.data) {
        setPublicLiveRace(result.data);
        setPublicLiveMeta({
          liveVersion: Number(result.data.liveVersion || 0),
          active: true,
          updatedAt: result.updatedAt || result.data.updatedAt,
          appName: result.data.appName,
          appVersion: result.data.appVersion,
          eventId: result.data.eventId,
          eventName: result.data.eventName,
          raceName: result.data.raceName,
          raceStatus: result.data.raceStatus,
          participantCount: result.data.participantCount,
          hasRaceProgram: publicLiveHasRaceProgram(result.data),
        });
        setPublicLiveFullLoadedAt(checkedIso);
        setPublicLiveMessage(result.message);
      } else {
        setPublicLiveRace(null);
        setPublicLiveMeta(null);
        setPublicLiveFullLoadedAt("");
        setPublicLiveMessage(result.message || "Aktuell ist kein Rennen live veröffentlicht.");
      }
    } catch (error: any) {
      setPublicLiveRace(null);
      setPublicLiveMeta(null);
      setPublicLiveMessage(error?.message || "Live-Rennen konnte nicht geladen werden.");
    } finally {
      if (showLoading) setPublicLiveLoading(false);
    }
  };

  const checkPublicLiveRaceMeta = async () => {
    try {
      const result = await loadPublicLiveRaceMeta();
      setPublicLiveCheckedAt(new Date().toISOString());

      if (!result.ok) {
        setPublicLiveMessage(result.message || "Live-Status konnte nicht geprüft werden.");
        return;
      }

      if (!result.exists && publicLiveRace) {
        await refreshPublicLiveRace(false);
        return;
      }

      if (!result.active || !result.data) {
        setPublicLiveRace(null);
        setPublicLiveMeta(result.data || null);
        setPublicLiveFullLoadedAt("");
        setPublicLiveMessage(result.message || "Aktuell ist kein Rennen live veröffentlicht.");
        return;
      }

      setPublicLiveMeta(result.data);
      const currentVersion = Number(publicLiveRace?.liveVersion || 0);
      const nextVersion = Number(result.data.liveVersion || 0);
      const versionChanged = nextVersion > 0 && nextVersion !== currentVersion;
      const updatedAtChanged = Boolean(result.data.updatedAt && publicLiveRace?.updatedAt && result.data.updatedAt !== publicLiveRace.updatedAt);

      if (!publicLiveRace || versionChanged || updatedAtChanged) {
        await refreshPublicLiveRace(false);
      } else {
        setPublicLiveMessage("Live-Status geprüft. Keine neuen Daten vorhanden.");
      }
    } catch (error: any) {
      setPublicLiveMessage(error?.message || "Live-Status konnte nicht geprüft werden.");
    }
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const updateVisibility = () => setPublicLiveTabVisible(document.visibilityState !== "hidden");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (!isPublicLiveView) return;
    refreshPublicLiveRace(true);
  }, [isPublicLiveView]);

  useEffect(() => {
    if (!isPublicLiveView) return;
    const intervalSeconds = getPublicLiveRefreshSeconds(publicLiveRace, publicLiveMeta, publicLiveTabVisible);
    const timer = window.setInterval(() => void checkPublicLiveRaceMeta(), intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [isPublicLiveView, publicLiveRace?.liveVersion, publicLiveRace?.updatedAt, publicLiveMeta?.liveVersion, publicLiveMeta?.hasRaceProgram, publicLiveTabVisible]);

  useEffect(() => {
    if (!firebaseAuthReady || !isFirebaseSignedIn || appShellView !== "manager" || !currentEventId) return;
    refreshAdminLiveRaceStatus(false);
  }, [firebaseAuthReady, isFirebaseSignedIn, appShellView, currentEventId, selectedRace]);

  useEffect(() => {
    if (!firebaseAuthReady || !isFirebaseSignedIn || appShellView !== "manager" || !currentEventId || !isCurrentRaceLive) return;
    const hasRaceProgram = Object.keys(heats || {}).length > 0 || Object.keys(finals || {}).length > 0;
    if (hasRaceProgram) return;

    const timer = window.setTimeout(() => triggerAutomaticLivePublish(0), 1200);
    return () => window.clearTimeout(timer);
  }, [firebaseAuthReady, isFirebaseSignedIn, appShellView, currentEventId, selectedRace, isCurrentRaceLive, riders]);

  useEffect(() => {
    if (appShellView !== "events") return;
    refreshOnlineStatus(false);
  }, [appShellView]);

  const warningCards = [
    dashboardStats.missingCount
      ? `${dashboardStats.missingCount} Teilnehmer mit fehlenden Pflichtfeldern`
      : "",
    dashboardStats.duplicateCount
      ? `${dashboardStats.duplicateCount} doppelte Startnummer-Gruppe(n) pro Kategorie`
      : "",
    ...getSeriesSettingWarnings(),
    Object.keys(overallByCategory).length === 0
      ? "Gesamtwertung noch nicht erstellt"
      : "",
  ].filter(Boolean);

  const warningsPanel = (
    <div
      style={{
        ...basePanelStyle,
        marginBottom: 20,
        borderColor: warningCards.length ? colors.warningBorder : colors.cardBorder,
        background: warningCards.length ? colors.warningBg : colors.cardBg,
        borderLeft: warningCards.length ? `6px solid ${colors.warningBorder}` : `1px solid ${colors.cardBorder}`,
      }}
    >
      <h2 style={{ ...sectionTitleStyle, display: "flex", alignItems: "center", gap: 8 }}>
        {warningCards.length ? "⚠ Warnungen" : "✅ Warnungen"}
      </h2>
      {warningCards.length ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {warningCards.map((text) => (
            <div key={text} style={{ color: "#92400e", fontWeight: 900, lineHeight: 1.35, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.55)", border: `1px solid ${colors.warningBorder}` }}>
              {text}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 16, fontWeight: 900, color: "#166534" }}>Keine Warnungen</div>
      )}
    </div>
  );


  const renderFirebaseAuthBox = () => (
    <div
      style={{
        border: `1px solid ${isFirebaseSignedIn ? colors.greenBorder : colors.warningBorder}`,
        borderRadius: 18,
        padding: 14,
        background: isFirebaseSignedIn ? colors.greenBg : colors.warningBg,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Firebase Login</div>
          <div style={{ fontWeight: 1000, color: isFirebaseSignedIn ? colors.greenBtn : "#92400e", marginTop: 4, fontSize: 17 }}>
            {isFirebaseSignedIn ? `Angemeldet als ${firebaseAuthSession?.email || "Firebase Benutzer"}` : "Nicht angemeldet"}
          </div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 5, fontWeight: 800 }}>
            Online speichern, online laden und Online-Backups sind nur mit Anmeldung möglich.
          </div>
        </div>
        {isFirebaseSignedIn && (
          <button type="button" onClick={logoutFirebaseAuth} style={{ ...smallGhostButtonStyle, minHeight: 40 }}>
            Abmelden
          </button>
        )}
      </div>

      {!isFirebaseSignedIn && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr) auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={labelStyle}>E-Mail</label>
            <input
              value={firebaseAuthEmail}
              onChange={(e) => setFirebaseAuthEmail(e.target.value)}
              placeholder="deine E-Mail"
              autoComplete="username"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Passwort</label>
            <input
              type="password"
              value={firebaseAuthPassword}
              onChange={(e) => setFirebaseAuthPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") loginFirebaseAuth(); }}
              placeholder="Firebase Passwort"
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            onClick={loginFirebaseAuth}
            disabled={firebaseAuthLoading}
            style={firebaseAuthLoading ? compactDisabledButtonStyle : { ...compactPrimaryButtonStyle, minHeight: 46 }}
          >
            {firebaseAuthLoading ? "Anmelden ..." : "Anmelden"}
          </button>
        </div>
      )}

      {firebaseAuthMessage && (
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 900, color: isFirebaseSignedIn ? "#166534" : "#92400e" }}>
          {firebaseAuthMessage}
        </div>
      )}
    </div>
  );


  const renderLoginStartScreen = () => (
    <div
      style={{
        padding: 20,
        fontFamily: "Arial, sans-serif",
        background: colors.pageBg,
        minHeight: "100vh",
        color: colors.text,
        position: "relative",
        maxWidth: 1320,
        margin: "0 auto",
      }}
    >
      <div style={{ position: "relative", zIndex: 1 }}>
        {renderAppHeader()}

        <div
          style={{
            minHeight: "calc(100vh - 260px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 48,
          }}
        >
          <div
            style={{
              ...basePanelStyle,
              width: "min(560px, 100%)",
              borderRadius: 24,
              padding: 24,
              boxShadow: "0 18px 48px rgba(31, 42, 55, 0.18)",
              border: `1px solid ${colors.cardBorderStrong}`,
              background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Geschützter Zugang
            </div>
            <h1 style={{ margin: "8px 0 8px", color: colors.title, fontSize: 30, lineHeight: 1.1 }}>
              Anmeldung erforderlich
            </h1>
            <div style={{ fontSize: 15, fontWeight: 800, color: colors.muted, lineHeight: 1.45, marginBottom: 18 }}>
              Die App wird erst nach erfolgreicher Firebase-Anmeldung angezeigt.
            </div>

            {!isOnlineStorageConfigured() && (
              <div
                style={{
                  border: `1px solid ${colors.dangerBorder}`,
                  background: colors.dangerBg,
                  color: "#991b1b",
                  borderRadius: 14,
                  padding: "10px 12px",
                  fontWeight: 900,
                  marginBottom: 14,
                }}
              >
                Online-Speicher ist nicht vollständig konfiguriert. Bitte Vercel Environment Variables prüfen.
              </div>
            )}

            {!firebaseAuthReady ? (
              <div
                style={{
                  border: `1px solid ${colors.cardBorder}`,
                  background: colors.cardSoftBg,
                  color: colors.muted,
                  borderRadius: 14,
                  padding: "14px 12px",
                  fontWeight: 900,
                }}
              >
                Anmeldung wird geprüft ...
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>E-Mail</label>
                    <input
                      value={firebaseAuthEmail}
                      onChange={(e) => setFirebaseAuthEmail(e.target.value)}
                      placeholder="deine E-Mail"
                      autoComplete="username"
                      style={{ ...inputStyle, minHeight: 48, fontSize: 17 }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Passwort</label>
                    <input
                      type="password"
                      value={firebaseAuthPassword}
                      onChange={(e) => setFirebaseAuthPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") loginFirebaseAuth(); }}
                      placeholder="Firebase Passwort"
                      autoComplete="current-password"
                      style={{ ...inputStyle, minHeight: 48, fontSize: 17 }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={loginFirebaseAuth}
                    disabled={firebaseAuthLoading || !isOnlineStorageConfigured()}
                    style={firebaseAuthLoading || !isOnlineStorageConfigured() ? { ...compactDisabledButtonStyle, minHeight: 54 } : { ...compactPrimaryButtonStyle, minHeight: 54, fontSize: 17 }}
                  >
                    {firebaseAuthLoading ? "Anmelden ..." : "Anmelden"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={openPublicLiveView}
                  style={{ ...compactHomeButtonStyle, minHeight: 48, width: "100%", marginTop: 12 }}
                >
                  Zuschaueransicht öffnen
                </button>

                {firebaseAuthMessage && (
                  <div
                    style={{
                      marginTop: 12,
                      border: `1px solid ${colors.warningBorder}`,
                      background: colors.warningBg,
                      borderRadius: 14,
                      padding: "10px 12px",
                      color: "#92400e",
                      fontSize: 13,
                      fontWeight: 900,
                      lineHeight: 1.35,
                    }}
                  >
                    {firebaseAuthMessage}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );



  const publicLivePanelStyle: React.CSSProperties = {
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 18,
    background: colors.cardBg,
    padding: 14,
    boxShadow: "0 8px 20px rgba(23,32,51,0.07)",
  };

  const renderPublicLiveRows = (rows: any[], mode: "start" | "result") => {
    const visibleRows = filterPublicLiveRows(rows);
    return (
    <div style={{ display: "grid", gap: publicLiveTvMode ? 8 : 4, marginTop: 8 }}>
      {visibleRows.length === 0 ? (
        <div style={{ color: colors.muted, fontWeight: 800, padding: "8px 0" }}>{publicLiveSearchTerm ? "Keine passenden Fahrer in diesem Lauf" : "Noch nicht erfasst"}</div>
      ) : visibleRows.map((row: any, index: number) => (
        <div
          key={`${mode}-${row.plate}-${row.name}-${index}`}
          style={{
            display: "grid",
            gridTemplateColumns: mode === "start" ? "48px 76px minmax(140px, 1fr) minmax(90px, 0.7fr)" : "48px 76px minmax(140px, 1fr) minmax(80px, 0.6fr)",
            gap: 8,
            alignItems: "center",
            minHeight: publicLiveTvMode ? 44 : 32,
            padding: publicLiveTvMode ? "9px 10px" : "6px 8px",
            fontSize: publicLiveTvMode ? 20 : undefined,
            borderRadius: 10,
            background: index % 2 === 0 ? colors.cardSoftBg : colors.cardBg,
            border: `1px solid ${colors.cardBorder}`,
            fontWeight: 800,
          }}
        >
          <div style={{ color: colors.blueBtn, fontWeight: 1000 }}>{mode === "start" ? row.gate || "-" : row.rank || index + 1}</div>
          <div>#{row.plate || "-"}</div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name || "-"}</div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: colors.muted }}>{mode === "result" ? row.status || row.club || "-" : row.club || "-"}</div>
        </div>
      ))}
    </div>
    );
  };

  const getPublicLiveFlowState = (liveRace: any) => {
    const entries: any[] = [];
    (liveRace?.motos || []).forEach((categoryBlock: any) => {
      (categoryBlock.runs || []).forEach((run: any) => {
        (run.races || []).forEach((race: any) => {
          entries.push({
            key: race.flowKey || `moto|${categoryBlock.category}|${run.name}|${race.raceNumber}`,
            complete: Boolean(race.resultComplete || ((race.results || []).length > 0 && (race.results || []).length >= (race.startList || []).length)),
          });
        });
      });
    });
    (liveRace?.finals || []).forEach((categoryBlock: any) => {
      (categoryBlock.rounds || []).forEach((round: any) => {
        entries.push({
          key: round.flowKey || `final|${categoryBlock.category}|${round.name}`,
          complete: Boolean(round.resultComplete || ((round.results || []).length > 0 && (round.results || []).length >= (round.startList || []).length)),
        });
      });
    });
    const openEntries = entries.filter((entry) => !entry.complete);
    return {
      activeKey: openEntries[0]?.key || "",
      gateKey: openEntries[1]?.key || "",
    };
  };

  const getPublicLiveRaceCardStyle = (flowKey: string, flowState: { activeKey: string; gateKey: string }, complete: boolean): React.CSSProperties => {
    if (flowKey && flowKey === flowState.activeKey) {
      return { border: `4px solid ${colors.blueBtn}`, borderRadius: 14, padding: 12, background: "#eaf2ff", boxShadow: "0 10px 26px rgba(37,99,235,0.18)" };
    }
    if (flowKey && flowKey === flowState.gateKey) {
      return { border: `4px solid ${colors.redBtn}`, borderRadius: 14, padding: 12, background: "#fff1f1", boxShadow: "0 10px 26px rgba(220,38,38,0.14)" };
    }
    return { border: `1px solid ${complete ? colors.greenBorder : colors.cardBorder}`, borderRadius: 14, padding: 12, background: complete ? colors.greenBg : colors.cardSoftBg };
  };

  const getPublicLiveFlowLabel = (flowKey: string, flowState: { activeKey: string; gateKey: string }, complete: boolean) => {
    if (complete) return "abgeschlossen";
    if (flowKey && flowKey === flowState.activeKey) return "läuft jetzt";
    if (flowKey && flowKey === flowState.gateKey) return "ans Gate";
    return "wartet";
  };

  const getPublicLiveFlowLabelStyle = (flowKey: string, flowState: { activeKey: string; gateKey: string }, complete: boolean): React.CSSProperties => {
    const base: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 96, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 1000, textTransform: "uppercase", letterSpacing: 0.4, marginRight: 8 };
    if (complete) return { ...base, background: colors.greenBg, color: colors.greenBtn, border: `1px solid ${colors.greenBorder}` };
    if (flowKey && flowKey === flowState.activeKey) return { ...base, background: colors.blueBtn, color: "#fff", border: `1px solid ${colors.blueBtn}` };
    if (flowKey && flowKey === flowState.gateKey) return { ...base, background: colors.redBtn, color: "#fff", border: `1px solid ${colors.redBtn}` };
    return { ...base, background: colors.grayBtn, color: colors.grayBtnText, border: `1px solid ${colors.cardBorder}` };
  };

  const normalizePublicLiveSearchValue = (value: any) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const getPublicLiveRowSearchText = (row: any) => normalizePublicLiveSearchValue([
    row?.plate,
    row?.name,
    row?.club,
    row?.category,
    row?.status,
  ].filter(Boolean).join(" "));

  const publicLiveSearchTerm = normalizePublicLiveSearchValue(publicLiveSearch);
  const publicLiveMyRiderTerm = normalizePublicLiveSearchValue(publicLiveMyRiderQuery || publicLiveSearch);

  const publicLiveCategoryOptions = useMemo(() => {
    const values = new Set<string>();
    (publicLiveRace?.categories || []).forEach((block: any) => values.add(String(block.category || "Ohne Kategorie")));
    (publicLiveRace?.motos || []).forEach((block: any) => values.add(String(block.category || "Ohne Kategorie")));
    (publicLiveRace?.finals || []).forEach((block: any) => values.add(String(block.category || "Ohne Kategorie")));
    (publicLiveRace?.finalRankings || []).forEach((block: any) => values.add(String(block.category || "Ohne Kategorie")));
    return ["all", ...sortCategories(Array.from(values))];
  }, [publicLiveRace]);

  const publicLiveCategoryVisible = (category: string) =>
    publicLiveCategoryFilter === "all" || String(category || "Ohne Kategorie") === publicLiveCategoryFilter;

  const filterPublicLiveRows = (rows: any[]) => {
    const items = Array.isArray(rows) ? rows : [];
    if (!publicLiveSearchTerm) return items;
    return items.filter((row: any) => getPublicLiveRowSearchText(row).includes(publicLiveSearchTerm));
  };

  const findPublicLiveRiderOccurrences = (liveRace: any, query: string) => {
    const term = normalizePublicLiveSearchValue(query);
    if (!liveRace || !term) return { rider: null as any, entries: [] as any[] };
    const entries: any[] = [];
    let rider: any = null;

    const rowMatches = (row: any) => {
      if (!row) return false;
      const plateExact = String(row.plate || "").trim().toLowerCase() === String(query || "").trim().toLowerCase();
      return plateExact || getPublicLiveRowSearchText(row).includes(term);
    };
    const remember = (row: any, entry: any) => {
      if (!rowMatches(row)) return;
      if (!rider) rider = { ...row, category: entry.category || row.category };
      entries.push({ ...entry, row });
    };

    (liveRace.categories || []).forEach((block: any) => {
      (block.riders || []).forEach((row: any) => remember(row, { type: "Startliste", category: block.category, label: block.category, flowKey: "", complete: false }));
    });

    (liveRace.motos || []).forEach((block: any) => {
      (block.runs || []).forEach((run: any) => {
        (run.races || []).forEach((race: any) => {
          const resultRows = Array.isArray(race.results) && race.results.length ? race.results : [];
          const startRows = Array.isArray(race.startList) ? race.startList : [];
          startRows.forEach((row: any) => {
            const result = resultRows.find((res: any) => String(res.plate || "") === String(row.plate || "") && normalizePublicLiveSearchValue(res.name) === normalizePublicLiveSearchValue(row.name));
            remember(result || row, {
              type: "Moto",
              category: block.category,
              label: `${run.name} · Race ${race.raceNumber}`,
              flowKey: race.flowKey,
              complete: Boolean(race.resultComplete),
              result: result || null,
            });
          });
        });
      });
    });

    (liveRace.finals || []).forEach((block: any) => {
      (block.rounds || []).forEach((round: any) => {
        const resultRows = Array.isArray(round.results) && round.results.length ? round.results : [];
        const startRows = Array.isArray(round.startList) ? round.startList : [];
        startRows.forEach((row: any) => {
          const result = resultRows.find((res: any) => String(res.plate || "") === String(row.plate || "") && normalizePublicLiveSearchValue(res.name) === normalizePublicLiveSearchValue(row.name));
          remember(result || row, {
            type: "Final",
            category: block.category,
            label: round.name,
            flowKey: round.flowKey,
            complete: Boolean(round.resultComplete),
            result: result || null,
          });
        });
      });
    });

    (liveRace.finalRankings || []).forEach((block: any) => {
      (block.rows || []).forEach((row: any) => remember(row, { type: "Resultat", category: block.category, label: `Endrang ${row.rank || "-"}`, flowKey: "", complete: true, result: row }));
    });

    return { rider, entries };
  };

  const getPublicLiveDomId = (prefix: string, value: string) =>
    `${prefix}-${String(value || "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 90)}`;

  const publicLiveQrUrl = typeof window === "undefined"
    ? ""
    : `${window.location.origin}${window.location.pathname}${window.location.search}#live`;

  const publicLiveQrImageSrc = publicLiveQrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=10&data=${encodeURIComponent(publicLiveQrUrl)}`
    : "";

  const renderPublicLiveRiderDetail = (liveRace: any, flowState: { activeKey: string; gateKey: string }) => {
    const detail = findPublicLiveRiderOccurrences(liveRace, publicLiveMyRiderTerm);
    if (!publicLiveMyRiderTerm) return null;
    if (!detail.rider) {
      return (
        <div style={{ ...basePanelStyle, marginBottom: 18, borderLeft: `6px solid ${colors.warningBorder}`, background: colors.warningBg }}>
          <strong>Mein Fahrer</strong> · Kein Fahrer zu „{publicLiveMyRiderQuery || publicLiveSearch}“ gefunden.
        </div>
      );
    }
    const nextEntry = detail.entries.find((entry: any) => !entry.complete) || null;
    return (
      <div style={{ ...basePanelStyle, marginBottom: 18, borderLeft: `6px solid ${colors.blueBtn}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Mein Fahrer</div>
            <h2 style={{ margin: "4px 0", color: colors.title }}>#{detail.rider.plate || "-"} · {detail.rider.name || "-"}</h2>
            <div style={{ color: colors.muted, fontWeight: 900 }}>{detail.rider.category || detail.entries[0]?.category || "-"}{detail.rider.club ? ` · ${detail.rider.club}` : ""}</div>
          </div>
          <button type="button" onClick={() => setPublicLiveMyRiderQuery("")} style={smallGhostButtonStyle}>Ausblenden</button>
        </div>
        {nextEntry && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: nextEntry.flowKey === flowState.gateKey ? "#fff1f1" : "#eaf2ff", border: `2px solid ${nextEntry.flowKey === flowState.gateKey ? colors.redBtn : colors.blueBtn}`, fontWeight: 950 }}>
            Nächster Einsatz: {nextEntry.type} · {nextEntry.category} · {nextEntry.label}
            {nextEntry.flowKey === flowState.gateKey ? " · ans Gate" : nextEntry.flowKey === flowState.activeKey ? " · läuft jetzt" : ""}
          </div>
        )}
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {detail.entries.map((entry: any, index: number) => (
            <div key={`my-rider-${index}`} style={{ display: "grid", gridTemplateColumns: publicLiveTvMode ? "120px 1fr 120px" : "90px 1fr 90px", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 12, border: `1px solid ${colors.cardBorder}`, background: entry.complete ? colors.greenBg : colors.cardSoftBg, fontWeight: 850 }}>
              <div>{entry.type}</div>
              <div>{entry.category} · {entry.label}</div>
              <div style={{ textAlign: "right" }}>{entry.result?.rank ? `${entry.result.rank}.` : entry.row?.status || (entry.complete ? "fertig" : "offen")}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!isPublicLiveView || !publicLiveRace) return;
    const flowState = getPublicLiveFlowState(publicLiveRace);
    const targetKey = flowState.activeKey || flowState.gateKey;
    if (!targetKey) return;
    window.setTimeout(() => {
      document.getElementById(getPublicLiveDomId("live-flow", targetKey))?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 350);
  }, [isPublicLiveView, publicLiveRace?.liveVersion, publicLiveRace?.updatedAt]);

  const renderPublicLiveView = () => (
    <div
      style={{
        padding: 20,
        fontFamily: "Arial, sans-serif",
        background: colors.pageBg,
        minHeight: "100vh",
        color: colors.text,
        position: "relative",
        maxWidth: 1320,
        margin: "0 auto",
      }}
    >
      <div style={{ position: "relative", zIndex: 1 }}>
        {renderAppHeader()}

        <div style={{ ...basePanelStyle, marginBottom: 18, borderLeft: `6px solid ${publicLiveRace ? colors.greenBtn : colors.warningBorder}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Öffentliche Live-Ansicht</div>
              <h1 style={{ margin: "6px 0", color: colors.title, fontSize: 30 }}>BMX Race Manager Live</h1>
              <div style={{ color: colors.muted, fontWeight: 900 }}>
                {getPublicLiveRefreshSeconds(publicLiveRace, publicLiveMeta, publicLiveTabVisible) === PUBLIC_LIVE_BACKGROUND_REFRESH_SECONDS
                  ? "Browser im Hintergrund: sparsame Live-Prüfung alle 5 Minuten"
                  : publicLiveHasRaceProgram(publicLiveRace, publicLiveMeta)
                    ? "Rennen live: alle 30 Sekunden kleine Meta-Prüfung; komplette Daten nur bei Änderung"
                    : ""}
              </div>
              <div style={{ color: colors.muted, fontWeight: 800, fontSize: 13, marginTop: 4 }}>
                Live-Version: {publicLiveMeta?.liveVersion || publicLiveRace?.liveVersion || "-"}
                {publicLiveFullLoadedAt ? ` · Voll geladen: ${formatDateTime(publicLiveFullLoadedAt)}` : ""}
                {publicLiveCheckedAt ? ` · Geprüft: ${formatDateTime(publicLiveCheckedAt)}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => refreshPublicLiveRace(true)} disabled={publicLiveLoading} style={publicLiveLoading ? compactDisabledButtonStyle : compactHomeButtonStyle}>
                {publicLiveLoading ? "Aktualisiere ..." : "Jetzt aktualisieren"}
              </button>
              <button type="button" onClick={() => { if (typeof window !== "undefined") window.location.hash = ""; setIsPublicLiveView(false); }} style={smallGhostButtonStyle}>
                Zum Login
              </button>
            </div>
          </div>
        </div>

        {publicLiveRace && (
          <div style={{ ...basePanelStyle, marginBottom: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 220px 150px", gap: 12, alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Fahrer suchen</label>
                <input
                  value={publicLiveSearch}
                  onChange={(event) => setPublicLiveSearch(event.target.value)}
                  placeholder="Name oder Startnummer, z. B. 247"
                  style={{ ...inputStyle, minHeight: publicLiveTvMode ? 56 : 44, fontSize: publicLiveTvMode ? 22 : 16 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Kategorie</label>
                <select
                  value={publicLiveCategoryFilter}
                  onChange={(event) => setPublicLiveCategoryFilter(event.target.value)}
                  style={{ ...inputStyle, minHeight: publicLiveTvMode ? 56 : 44, fontSize: publicLiveTvMode ? 20 : 15 }}
                >
                  {publicLiveCategoryOptions.map((category) => (
                    <option key={category} value={category}>{category === "all" ? "Alle Kategorien" : category}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setPublicLiveMyRiderQuery(publicLiveSearch.trim())}
                disabled={!publicLiveSearch.trim()}
                style={!publicLiveSearch.trim() ? compactDisabledButtonStyle : compactPrimaryButtonStyle}
              >
                Mein Fahrer
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: publicLiveTvMode ? "190px 1fr" : "150px 1fr", gap: 14, marginTop: 14, alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                {publicLiveQrImageSrc && <img src={publicLiveQrImageSrc} alt="QR-Code zur Live-Ansicht" style={{ width: publicLiveTvMode ? 170 : 120, height: publicLiveTvMode ? 170 : 120, borderRadius: 12, border: `1px solid ${colors.cardBorder}`, background: "#fff" }} />}
              </div>
              <div style={{ color: colors.muted, fontWeight: 850, lineHeight: 1.45 }}>
                QR-Code zur Live-Ansicht. Suche nach Startnummer oder Name zeigt die Läufe, Resultate und den nächsten Einsatz dieses Fahrers.
              </div>
            </div>
          </div>
        )}

        {!publicLiveRace ? (
          <div style={{ ...basePanelStyle, textAlign: "center", padding: 34 }}>
            <h2 style={{ marginTop: 0, color: colors.title }}>{publicLiveMeta && publicLiveMeta.active === false ? "Live-Ansicht beendet" : "Aktuell ist kein Rennen live veröffentlicht"}</h2>
            <div style={{ color: colors.muted, fontWeight: 900, lineHeight: 1.45 }}>
              {publicLiveMeta && publicLiveMeta.active === false
                ? "Die Rennleitung hat die öffentliche Live-Ansicht beendet. Bitte später erneut öffnen oder die Rennleitung fragen."
                : "Sobald die Rennleitung ein Rennen live aktiviert, erscheinen hier zuerst die Startliste und danach Motos, Resultate und Finals."}
            </div>
            {publicLiveMessage && <div style={{ marginTop: 14, color: colors.muted, fontWeight: 800 }}>{publicLiveMessage}</div>}
          </div>
        ) : (() => {
          const liveFlowState = getPublicLiveFlowState(publicLiveRace);
          return (
          <>
            <div style={{ ...basePanelStyle, marginBottom: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase" }}>Rennen</div>
                  <div style={{ fontWeight: 1000, color: colors.title, fontSize: 18 }}>{publicLiveRace.eventName}</div>
                  <div style={{ color: colors.muted, fontWeight: 900 }}>{publicLiveRace.raceName}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase" }}>Status</div>
                  <div style={{ fontWeight: 1000, color: colors.greenBtn, fontSize: 18 }}>{publicLiveRace.raceStatus || "Live"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase" }}>Ort / Datum</div>
                  <div style={{ fontWeight: 1000, color: colors.title }}>{publicLiveRace.location || "-"}</div>
                  <div style={{ color: colors.muted, fontWeight: 900 }}>{publicLiveRace.date || "-"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase" }}>Aktualisiert</div>
                  <div style={{ fontWeight: 1000, color: colors.title }}>{formatDateTime(publicLiveRace.updatedAt)}</div>
                  <div style={{ color: colors.muted, fontWeight: 900 }}>{publicLiveCheckedAt ? `Geprüft: ${formatDateTime(publicLiveCheckedAt)}` : "-"}</div>
                </div>
              </div>
            </div>

            {renderPublicLiveRiderDetail(publicLiveRace, liveFlowState)}

            {(!publicLiveRace.motos?.length && !publicLiveRace.finals?.length && publicLiveRace.categories?.length > 0) && (
              <div style={{ ...basePanelStyle, marginBottom: 18 }}>
                <h2 style={{ ...sectionTitleStyle }}>Aktuelle Startliste</h2>
                <div style={{ color: colors.muted, fontWeight: 900, marginBottom: 12 }}>
                  Motos wurden noch nicht erstellt. Sichtbar ist die aktuelle Teilnehmerliste nach Kategorien.
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {publicLiveRace.categories.filter((categoryBlock: any) => publicLiveCategoryVisible(categoryBlock.category)).map((categoryBlock: any) => (
                    <div key={`live-category-${categoryBlock.category}`} style={publicLivePanelStyle}>
                      <h3 style={{ margin: "0 0 8px", color: colors.title }}>{categoryBlock.category}</h3>
                      {renderPublicLiveRows(categoryBlock.riders || [], "start")}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {publicLiveRace.motos?.length > 0 && (
              <div style={{ ...basePanelStyle, marginBottom: 18 }}>
                <h2 style={{ ...sectionTitleStyle }}>Motos / Laufeinteilung</h2>
                <div style={{ display: "grid", gap: 16 }}>
                  {publicLiveRace.motos.filter((categoryBlock: any) => publicLiveCategoryVisible(categoryBlock.category)).map((categoryBlock: any) => (
                    <div key={`live-moto-${categoryBlock.category}`} style={publicLivePanelStyle}>
                      <h3 style={{ margin: "0 0 10px", color: colors.title }}>{categoryBlock.category}</h3>
                      <div style={{ display: "grid", gap: 14 }}>
                        {categoryBlock.runs.map((run: any) => (
                          <div key={`${categoryBlock.category}-${run.name}`}>
                            <h4 style={{ margin: "4px 0 8px", color: colors.title }}>{run.name}</h4>
                            <div style={{ display: "grid", gap: 12 }}>
                              {run.races.map((race: any) => (
                                <div
                                  id={getPublicLiveDomId("live-flow", race.flowKey)}
                                  key={`${categoryBlock.category}-${run.name}-${race.raceNumber}`}
                                  style={getPublicLiveRaceCardStyle(race.flowKey, liveFlowState, Boolean(race.resultComplete))}
                                >
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                    <strong style={{ color: colors.title }}>Race {race.raceNumber}</strong>
                                    <span style={getPublicLiveFlowLabelStyle(race.flowKey, liveFlowState, Boolean(race.resultComplete))}>
                                      {getPublicLiveFlowLabel(race.flowKey, liveFlowState, Boolean(race.resultComplete))}
                                    </span>
                                  </div>
                                  <div style={{ marginTop: 10 }}>
                                    {(race.results || []).length > 0 ? (
                                      <>
                                        <strong>Resultat</strong>
                                        {renderPublicLiveRows(race.results || [], "result")}
                                      </>
                                    ) : (
                                      <>
                                        <strong>Startliste / Gate</strong>
                                        {renderPublicLiveRows(race.startList || [], "start")}
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {publicLiveRace.finals?.length > 0 && (
              <div style={{ ...basePanelStyle, marginBottom: 18 }}>
                <h2 style={{ ...sectionTitleStyle }}>Finals</h2>
                <div style={{ display: "grid", gap: 16 }}>
                  {publicLiveRace.finals.filter((categoryBlock: any) => publicLiveCategoryVisible(categoryBlock.category)).map((categoryBlock: any) => (
                    <div key={`live-final-${categoryBlock.category}`} style={publicLivePanelStyle}>
                      <h3 style={{ margin: "0 0 10px", color: colors.title }}>{categoryBlock.category}</h3>
                      <div style={{ display: "grid", gap: 12 }}>
                        {categoryBlock.rounds.map((round: any) => (
                          <div
                            id={getPublicLiveDomId("live-flow", round.flowKey)}
                            key={`${categoryBlock.category}-${round.name}`}
                            style={getPublicLiveRaceCardStyle(round.flowKey, liveFlowState, Boolean(round.resultComplete))}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                              <strong style={{ color: colors.title }}>{round.name}</strong>
                              <span style={getPublicLiveFlowLabelStyle(round.flowKey, liveFlowState, Boolean(round.resultComplete))}>
                                {getPublicLiveFlowLabel(round.flowKey, liveFlowState, Boolean(round.resultComplete))}
                              </span>
                            </div>
                            <div style={{ marginTop: 10 }}>
                              {(round.results || []).length > 0 ? (
                                <>
                                  <strong>Resultat</strong>
                                  {renderPublicLiveRows(round.results || [], "result")}
                                </>
                              ) : (
                                <>
                                  <strong>Startliste / Gate</strong>
                                  {renderPublicLiveRows(round.startList || [], "start")}
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {publicLiveRace.finalRankings?.length > 0 && (
              <div style={{ ...basePanelStyle, marginBottom: 18 }}>
                <h2 style={{ ...sectionTitleStyle }}>Resultate</h2>
                <div style={{ display: "grid", gap: 12 }}>
                  {publicLiveRace.finalRankings.filter((categoryBlock: any) => publicLiveCategoryVisible(categoryBlock.category)).map((categoryBlock: any) => (
                    <div key={`live-ranking-${categoryBlock.category}`} style={publicLivePanelStyle}>
                      <h3 style={{ margin: "0 0 8px", color: colors.title }}>{categoryBlock.category}</h3>
                      {renderPublicLiveRows(categoryBlock.rows || [], "result")}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!publicLiveRace.motos?.length && !publicLiveRace.finals?.length && !publicLiveRace.finalRankings?.length && !publicLiveRace.categories?.length) && (
              <div style={{ ...basePanelStyle, textAlign: "center", padding: 24 }}>
                <h2 style={{ marginTop: 0, color: colors.title }}>Live-Rennen ist aktiv</h2>
                <div style={{ color: colors.muted, fontWeight: 900 }}>Motos oder Resultate wurden noch nicht veröffentlicht.</div>
              </div>
            )}
          </>
          );
        })()}
      </div>
    </div>
  );

  const backupWarningBar = null;


  if (isPublicLiveView) {
    return renderPublicLiveView();
  }

  if (!firebaseAuthReady || !isFirebaseSignedIn) {
    return renderLoginStartScreen();
  }

  if (appShellView === "events") {
    const activeGroupedEvents = getEventGroupedByYear();
    const archivedGroupedEvents = getArchivedEventGroupedByYear();
    return (
      <div style={{ padding: 20, fontFamily: "Arial, sans-serif", background: colors.pageGradient, minHeight: "100vh", color: colors.text, maxWidth: 1320, margin: "0 auto" }}>
        {renderAppHeader()}
        {backupWarningBar}
        <div style={{ ...basePanelStyle, marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>Dashboard</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setShowEventCreateChoice((open) => !open)} style={mainButtonStyle}>Rennen / Rennserie erstellen</button>
            <button onClick={() => setAppShellView("masterParticipants")} style={secondaryButtonStyle}>Teilnehmer</button>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => setAppShellView("guide")} style={smallGhostButtonStyle}>Anleitung</button>
              <button onClick={() => setAppShellView("regulations")} style={smallGhostButtonStyle}>Renn-Reglement</button>
              <button onClick={() => { setAppShellView("dataCheck"); setTimeout(() => runDataIntegrityCheck(), 0); }} style={smallGhostButtonStyle}>Daten prüfen</button>
              <button onClick={() => setAppShellView("history")} style={smallGhostButtonStyle}>History / Speicher & Import</button>
            </div>
          </div>
          {showEventCreateChoice && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                border: `1px solid ${colors.cardBorder}`,
                borderRadius: 14,
                background: "#f8fbff",
              }}
            >
              <div style={{ fontWeight: 900, color: colors.title, marginBottom: 10 }}>
                Was möchtest du erstellen?
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    setShowEventCreateChoice(false);
                    createManagedEvent("single");
                  }}
                  style={compactHomeButtonStyle}
                >
                  Einzelrennen
                </button>
                <button
                  onClick={() => {
                    setShowEventCreateChoice(false);
                    createManagedEvent("series");
                  }}
                  style={compactPrimaryButtonStyle}
                >
                  Rennserie
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Rennen/Rennserie suchen</label>
            <input
              value={eventSearch}
              onChange={(e) => setEventSearch(e.target.value)}
              placeholder="Nach Name oder Jahr suchen ..."
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h2 style={{ ...sectionTitleStyle, marginBottom: 4 }}>Speicher</h2>
              <div style={{ color: colors.muted, fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>
                Online speichern ist der normale Speicherstand. Backups werden online abgelegt und zusätzlich als Datei heruntergeladen.
              </div>
            </div>

          </div>

          {renderFirebaseAuthBox()}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 14 }}>
            <div style={{ border: `1px solid ${onlineStatus?.exists ? colors.greenBorder : colors.cardBorder}`, borderRadius: 16, padding: 14, background: onlineStatus?.exists ? colors.greenBg : colors.cardSoftBg }}>
              <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Online</div>
              <div style={{ fontWeight: 1000, color: onlineStatus?.exists ? colors.greenBtn : colors.orangeBtn, marginTop: 5, fontSize: 17 }}>
                {onlineStatus?.exists ? "Online-Daten vorhanden" : onlineStatus?.ok === false ? "Status unklar" : "Keine Online-Daten"}
              </div>
              <div style={{ fontSize: 13, color: colors.muted, marginTop: 5, fontWeight: 800 }}>
                {onlineStatus?.updatedAt ? `Stand: ${formatDateTime(onlineStatus.updatedAt)}` : "Noch kein Online-Stand geprüft"}
              </div>
            </div>
            <div style={{ border: `1px solid ${colors.cardBorder}`, borderRadius: 16, padding: 14, background: colors.cardSoftBg }}>
              <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Speicherstand</div>
              <div style={{ fontWeight: 1000, color: colors.title, marginTop: 5, fontSize: 17 }}>
                Zuletzt online: {lastOnlineSaveAt ? formatDateTime(lastOnlineSaveAt) : "-"}
              </div>
              <div style={{ fontSize: 13, color: colors.muted, marginTop: 5, fontWeight: 800 }}>
                Offene Änderungen: {hasUnsavedChanges ? "Ja" : "Nein"}
              </div>
            </div>
            <div style={{ border: `1px solid ${onlineStatus?.exists && isLocalNewerThanOnline(onlineStatus.updatedAt) ? colors.warningBorder : colors.cardBorder}`, borderRadius: 16, padding: 14, background: onlineStatus?.exists && isLocalNewerThanOnline(onlineStatus.updatedAt) ? colors.warningBg : colors.cardSoftBg }}>
              <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Vergleich</div>
              <div style={{ fontWeight: 1000, color: onlineStatus?.exists && isLocalNewerThanOnline(onlineStatus.updatedAt) ? "#92400e" : onlineStatus?.exists ? colors.greenBtn : colors.muted, marginTop: 5, fontSize: 17 }}>
                {onlineStatus?.exists && isLocalNewerThanOnline(onlineStatus.updatedAt) ? "Änderungen offen" : onlineStatus?.exists ? "Synchron" : "Status offen"}
              </div>
              <div style={{ fontSize: 13, color: colors.muted, marginTop: 5, fontWeight: 800 }}>
                {onlineStatusCheckedAt ? `Geprüft: ${formatDateTime(onlineStatusCheckedAt)}` : `${onlineBackups.length} Online-Backups geladen`}
              </div>
            </div>
            <div style={{ border: `1px solid ${isOnlineStatusNewerThanLastKnownSave(onlineStatus) ? colors.warningBorder : colors.cardBorder}`, borderRadius: 16, padding: 14, background: isOnlineStatusNewerThanLastKnownSave(onlineStatus) ? colors.warningBg : colors.cardSoftBg }}>
              <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Gerät / Konflikt</div>
              <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Gerätename, z. B. iPad Rennleitung" style={{ ...inputStyle, minHeight: 38, marginTop: 5 }} />
              <div style={{ fontSize: 13, color: colors.muted, marginTop: 5, fontWeight: 800 }}>
                Online zuletzt: {onlineStatus?.savedByDevice || "-"}{onlineStatus?.saveRevision ? ` · Rev. ${onlineStatus.saveRevision}` : ""}
              </div>
            </div>
          </div>
          {saveConflictMessage && (
            <div style={{ ...basePanelStyle, marginBottom: 12, background: colors.warningBg, borderColor: colors.warningBorder, color: "#92400e", fontWeight: 900 }}>
              {saveConflictMessage}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10, marginBottom: 12 }}>
            <button
              onClick={saveOnlineFullAppState}
              disabled={!isFirebaseSignedIn}
              style={!isFirebaseSignedIn ? { ...compactDisabledButtonStyle, minHeight: 70, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", textAlign: "left", padding: "12px 14px" } : { ...compactSaveButtonStyle, minHeight: 70, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", textAlign: "left", padding: "12px 14px" }}
            >
              <span style={{ fontSize: 16 }}>Speichern</span>
              <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.9 }}>Aktuellen Stand online sichern</span>
            </button>
            <button
              onClick={loadOnlineFullAppState}
              disabled={!isFirebaseSignedIn}
              style={!isFirebaseSignedIn ? { ...compactDisabledButtonStyle, minHeight: 70, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", textAlign: "left", padding: "12px 14px" } : { ...compactHomeButtonStyle, minHeight: 70, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", textAlign: "left", padding: "12px 14px" }}
            >
              <span style={{ fontSize: 16 }}>Letzten Speicherstand laden</span>
              <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.85 }}>Lädt den letzten Online-Stand</span>
            </button>
            <button
              onClick={createNamedOnlineBackup}
              disabled={!isFirebaseSignedIn}
              style={!isFirebaseSignedIn ? { ...compactDisabledButtonStyle, minHeight: 70, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", textAlign: "left", padding: "12px 14px" } : { ...compactPrimaryButtonStyle, minHeight: 70, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", textAlign: "left", padding: "12px 14px" }}
            >
              <span style={{ fontSize: 16 }}>Backup erstellen</span>
              <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.9 }}>Online + Datei mit Beschriftung</span>
            </button>
          </div>

          <button
            onClick={() => setShowAdvancedStorageOptions((open) => !open)}
            style={{ ...smallGhostButtonStyle, minHeight: 38 }}
          >
            {showAdvancedStorageOptions ? "Weitere Speicheroptionen ausblenden" : "Weitere Speicheroptionen anzeigen"}
          </button>

          {showAdvancedStorageOptions && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch", padding: 12, border: `1px dashed ${colors.cardBorderStrong}`, borderRadius: 14, background: colors.cardSoftBg }}>
              <button onClick={() => refreshOnlineStatus(true)} disabled={onlineStatusLoading || !isFirebaseSignedIn} style={{ ...(!isFirebaseSignedIn ? compactDisabledButtonStyle : compactHomeButtonStyle), minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: onlineStatusLoading ? 0.65 : 1 }}>
                Online-Status prüfen
              </button>
              <label style={{ ...compactHomeButtonStyle, minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
                Lokale Backup-Datei laden
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={importBackup}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          )}

          <div style={{ marginTop: 14, border: `1px solid ${colors.cardBorder}`, borderRadius: 18, padding: 14, background: "#f8fbff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 1000, color: colors.title, fontSize: 17 }}>Online-Backups</div>
                <div style={{ color: colors.muted, fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>
                  Online-Backups, neuste zuerst. Zum Wiederherstellen direkt auf „Laden“ klicken oder unter weitere Speicheroptionen eine lokale Backup-Datei laden.
                </div>
              </div>
              <div style={{ fontWeight: 1000, color: colors.muted }}>{onlineBackups.length} / 20</div>
            </div>
            {onlineBackups.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                {onlineBackups.map((backup, index) => {
                  const isSelected = backup.id === selectedOnlineBackupId;
                  return (
                    <div
                      key={backup.id}
                      onClick={() => setSelectedOnlineBackupId(backup.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: 12,
                        alignItems: "center",
                        border: `1px solid ${isSelected ? colors.blueBorder : colors.cardBorder}`,
                        borderRadius: 14,
                        padding: 12,
                        background: isSelected ? "#eff6ff" : colors.cardBg,
                        boxShadow: isSelected ? "0 8px 20px rgba(37, 99, 235, 0.10)" : "none",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 1000, color: colors.title }}>#{index + 1} · {backup.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 900, color: colors.muted }}>{formatDateTime(backup.createdAt)}</span>
                        </div>
                        <div style={{ marginTop: 5, display: "flex", gap: 10, flexWrap: "wrap", color: colors.muted, fontSize: 13, fontWeight: 800 }}>
                          <span>{backup.riderCount ?? "?"} Teilnehmer</span>
                          <span>{backup.eventCount ?? "?"} Rennen/Rennserien</span>
                          <span>App {backup.appVersion || "-"}</span>
                          <span>{formatPayloadSize(backup.payloadSize)}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOnlineBackupId(backup.id);
                          loadSelectedOnlineBackup(backup.id);
                        }}
                        disabled={!isFirebaseSignedIn}
                        style={{ ...(!isFirebaseSignedIn ? compactDisabledButtonStyle : compactHomeButtonStyle), minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }}
                      >
                        Laden
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: colors.muted, fontSize: 13, fontWeight: 800, border: `1px dashed ${colors.cardBorderStrong}`, borderRadius: 14, padding: 14, background: colors.cardBg }}>
                Noch keine Online-Backups angezeigt. Öffne weitere Speicheroptionen und prüfe den Status oder erstelle ein neues Backup.
              </div>
            )}
          </div>

          {(backupMessage || onlineStorageMessage) && (
            <div style={{ marginTop: 10, color: colors.muted, display: "grid", gap: 4, padding: "10px 12px", borderRadius: 12, background: colors.cardSoftBg, border: `1px solid ${colors.cardBorder}` }}>
              {backupMessage && <div>{backupMessage}</div>}
              {onlineStorageMessage && <div>{onlineStorageMessage}</div>}
            </div>
          )}
          {!isOnlineStorageConfigured() && (
            <div style={{ marginTop: 8, color: "#92400e", background: colors.warningBg, border: `1px solid ${colors.warningBorder}`, borderRadius: 10, padding: "8px 10px", fontSize: 13, fontWeight: 900 }}>
              Firebase ist vorbereitet, aber noch nicht vollständig konfiguriert. Prüfe die Vercel Environment Variables.
            </div>
          )}
        </div>

        <div style={{ ...basePanelStyle }}>
          <h2 style={sectionTitleStyle}>Aktive Rennen / Rennserien</h2>
          {activeGroupedEvents.length === 0 ? (
            <div style={{ color: colors.muted, padding: 22, border: `1px dashed ${colors.cardBorderStrong}`, borderRadius: 16, textAlign: "center", fontWeight: 900, background: colors.cardSoftBg }}>{eventSearch.trim() ? "Keine passenden aktiven Rennen/Rennserien gefunden." : "Noch keine Rennen erstellt. Erstelle dein erstes Einzelrennen oder eine Rennserie."}</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {activeGroupedEvents.map((group) => (
                <div key={group.year}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0 10px" }}>
                    <strong style={{ color: colors.title, fontSize: 18 }}>{group.year}</strong>
                    <div style={{ height: 1, background: colors.cardBorder, flex: 1 }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18 }}>
                    {group.events.map((event) => {
                      const progress = getManagedEventProgress(event);
                      return (
                      <div
                        key={event.id}
                        onClick={() => openManagedEvent(event)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") openManagedEvent(event); }}
                        style={{
                          ...compactHomeButtonStyle,
                          width: "100%",
                          minHeight: 124,
                          textAlign: "left",
                          display: "grid",
                          gridTemplateRows: "auto auto 1fr auto",
                          alignItems: "start",
                          gap: 8,
                          cursor: "pointer",
                          boxSizing: "border-box",
                          padding: 16,
                          justifyItems: "stretch",
                          overflow: "hidden",
                          background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
                          boxShadow: "0 12px 24px rgba(23,32,51,0.10)",
                          border: `1px solid ${colors.cardBorderStrong}`,
                        }}
                      >
                        <span style={{ alignSelf: "start", minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: 17,
                              fontWeight: 950,
                              lineHeight: 1.12,
                              display: "block",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {event.name}
                          </span>
                        </span>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ ...getStatusBadgeStyle(event.type === "single" ? "Einzelrennen" : "Rennserie"), justifySelf: "start", fontSize: 11, padding: "3px 8px" }}>{event.type === "single" ? "Einzel" : "Serie"}</span>
                          <span style={{ ...getStatusBadgeStyle("ID"), fontSize: 11, padding: "3px 8px" }}>ID {getShortEventId(event)}</span>
                        </div>
                        <div style={{ color: colors.title, fontWeight: 900, fontSize: 12, lineHeight: 1.22, display: "grid", gridTemplateColumns: event.type === "series" ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: "2px 10px" }}>
                          {event.type === "series" ? getManagedEventRaceParticipantCounts(event).map((item) => (
                            <span key={`${event.id}-${item.race}`} style={{ whiteSpace: "nowrap" }}>{item.race}: {item.count}</span>
                          )) : (
                            <span>Teilnehmer: {getManagedEventParticipantCount(event.id)}</span>
                          )}
                        </div>
                        <div style={{ display: "grid", gap: 4 }}>
                          <div style={{ height: 8, borderRadius: 999, background: "#e5edf6", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${progress.percent}%`, background: colors.greenBtn }} />
                          </div>
                          <div style={{ fontSize: 11, color: colors.muted, fontWeight: 900 }}>Fortschritt: {progress.closed}/{progress.raceCount} abgeschlossen · Resultate in {progress.withResults} Race(s)</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, alignItems: "stretch" }}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); renameManagedEvent(event); }}
                            style={{ ...smallGhostButtonStyle, width: "100%", minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 12, padding: "7px 8px", boxSizing: "border-box" }}
                          >
                            Name bearbeiten
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleManagedEventArchive(event, true); }}
                            style={{ ...smallGhostButtonStyle, width: "100%", minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 12, padding: "7px 8px", boxSizing: "border-box" }}
                          >
                            Archivieren
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteManagedEvent(event); }}
                            style={{ ...smallGhostButtonStyle, width: "100%", minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 12, padding: "7px 8px", boxSizing: "border-box", color: colors.redBtn, borderColor: "#f2b8b5", background: "#fff5f5" }}
                          >
                            Löschen
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              onClick={() => setShowArchivedEvents((value) => !value)}
              style={smallGhostButtonStyle}
            >
              {showArchivedEvents ? "Archiv ausblenden" : `Archiv anzeigen (${getFilteredManagedEvents(true).length})`}
            </button>
          </div>
          {showArchivedEvents && (
            <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
              <h3 style={{ margin: 0, color: colors.title }}>Archivierte Rennen / Rennserien</h3>
              {archivedGroupedEvents.length === 0 ? (
                <div style={{ color: colors.muted }}>Keine archivierten Rennen/Rennserien vorhanden.</div>
              ) : archivedGroupedEvents.map((group) => (
                <details key={`archiv-${group.year}`} open={false} style={{ border: `1px solid ${colors.cardBorder}`, borderRadius: 12, padding: 12, background: "#fbfdff" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, color: colors.title }}>{group.year} · {group.events.length} archiviert</summary>
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    {group.events.map((event) => (
                      <div key={event.id} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", borderTop: `1px solid ${colors.cardBorder}`, paddingTop: 8 }}>
                        <button type="button" onClick={() => openManagedEvent(event)} style={{ ...smallGhostButtonStyle, textAlign: "left", flex: 1 }}>
                          {event.name} · {event.year} · {event.type === "single" ? "Einzelrennen" : "Rennserie"} · Teilnehmer: {getManagedEventParticipantCount(event.id)}
                        </button>
                        <button type="button" onClick={() => toggleManagedEventArchive(event, false)} style={smallGhostButtonStyle}>Wieder anzeigen</button>
                        <button type="button" onClick={() => deleteManagedEvent(event)} style={{ ...smallGhostButtonStyle, color: colors.redBtn, borderColor: "#f2b8b5", background: "#fff5f5" }}>Löschen</button>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
          {versionFooter}
        </div>
      </div>
    );
  }

  if (appShellView === "masterParticipants") {
    const activeGroups = getMasterParticipantGroups();
    const trashGroups = getDeletedMasterParticipantGroups();
    const masterDuplicateInfo = getDuplicateMasterParticipantInfo(activeGroups);
    const masterDuplicateKeys = masterDuplicateInfo.keys;
    const masterSearchQuery = masterParticipantSearch.trim().toLowerCase();
    const participantMatches = (participant: any) => {
      if (!masterSearchQuery) return true;
      return `${participant.name || ""} ${participant.plate || ""} ${participant.club || ""} ${participant.birthYear || ""} ${participant.gender || ""}`
        .toLowerCase()
        .includes(masterSearchQuery);
    };
    const visibleActiveGroups = activeGroups.filter((participant: any) => {
      if (!participantMatches(participant)) return false;
      if (masterParticipantFilter === "trash") return false;
      return true;
    });
    const visibleTrashGroups = trashGroups.filter((participant: any) => {
      if (!participantMatches(participant)) return false;
      if (masterParticipantFilter === "active") return false;
      return true;
    });
    const groups = visibleActiveGroups;
    const participantEntrySuggestions = getParticipantEntrySuggestions();
    return (
      <div style={{ padding: 20, fontFamily: "Arial, sans-serif", background: colors.pageGradient, minHeight: "100vh", color: colors.text, maxWidth: 1320, margin: "0 auto" }}>
        {renderAppHeader()}
        {backupWarningBar}
        <div style={{ ...basePanelStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
            <button
              onClick={() => setAppShellView("events")}
              style={{ ...secondaryButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              Zurück zur Startseite
            </button>
            <button
              onClick={loadMasterParticipants}
              style={{ ...secondaryButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              Teilnehmerdatenbank aktualisieren
            </button>
            <button
              type="button"
              onClick={exportMasterParticipantsExcel}
              style={{ ...mainButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              Teilnehmer Excel exportieren
            </button>
            <label style={{ ...secondaryButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              Teilnehmer Excel importieren
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleMasterParticipantsExcelImport}
                style={{ display: "none" }}
              />
            </label>
          </div>
          <div style={{ marginTop: 8, color: colors.muted, fontSize: 13, fontWeight: 800 }}>
            Aktualisiert die Hauptdatenbank aus allen gespeicherten Rennen und Rennserien. Über Excel-Export können Teilnehmerdaten bearbeitet und neue Teilnehmer wieder importiert werden; Resultate sind im Export sichtbar, werden beim Import aber nicht überschrieben.
          </div>
        </div>
        <div style={{ ...basePanelStyle }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>Teilnehmer-Hauptdatenbank</h2>
          <p style={{ color: colors.muted, marginTop: -4 }}>
            Teilnehmer werden zentral hier erfasst oder importiert. In einem Rennen / einer Rennserie werden sie danach aus dieser Liste hinzugefügt.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) auto", gap: 10, alignItems: "end", marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Teilnehmer suchen</label>
              <input
                value={masterParticipantSearch}
                onChange={(e) => setMasterParticipantSearch(e.target.value)}
                placeholder="Name, Startnummer, Verein, Jahrgang ..."
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {[
                ["active", "Aktiv"],
                ["trash", "Papierkorb"],
                ["all", "Alle"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMasterParticipantFilter(value as any)}
                  style={masterParticipantFilter === value ? compactPrimaryButtonStyle : compactHomeButtonStyle}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={deleteAllMasterParticipants}
                style={{ ...compactHomeButtonStyle, color: colors.redBtn, borderColor: "#f2b8b5", background: "#fff5f5" }}
              >
                Alle Teilnehmer löschen
              </button>
            </div>
          </div>
          {masterDuplicateKeys.size > 0 && masterParticipantFilter !== "trash" && (
            <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 12, border: `1px solid ${colors.warningBorder}`, borderLeft: `5px solid ${colors.warningBorder}`, background: colors.warningBg, color: "#92400e", fontWeight: 900 }}>
              ⚠ Mögliche Dubletten erkannt: {masterDuplicateKeys.size} Einträge in {masterDuplicateInfo.groupCount} Gruppe(n). Ähnliche Teilnehmer sind jeweils gleichfarbig markiert. Mit „Teilnehmer OK“ bestätigte Einträge werden nicht mehr als Dublette angezeigt.
            </div>
          )}
          <div ref={participantFormRef} onInputCapture={handleMasterParticipantDraftInputCapture} onChangeCapture={handleMasterParticipantDraftInputCapture} style={{ ...basePanelStyle, marginBottom: 18, background: "#fbfdff" }}>
            {editingRider && (
              <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 10, background: colors.greenBg, border: `1px solid ${colors.greenBorder}`, color: colors.title, fontWeight: 800 }}>
                Bearbeitung aktiv · Teilnehmer-ID: {getParticipantStableId(editingRider) || "wird beim Speichern erstellt"}
              </div>
            )}
            <div className="rider-form-no-legacy-cruiser">
              <RiderForm
                onChange={handleRiderFormChange}
                editingRider={editingRider}
                onCancelEdit={() => { setEditingRider(null); setParticipantSpecialCategoryDraft(""); setParticipantSpecialCategoryDraftDirty(false); setLastEditedMasterParticipantId(""); setMasterParticipantDraftLookup({ name: "", plate: "", birthYear: "", gender: "", club: "" }); }}
                eventYear={String(new Date().getFullYear())}
                currentEventId="master"
                masterMode
              />
            </div>
            {renderSpecialCategorySelector()}
            {!editingRider && participantEntrySuggestions.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 14, border: `1px solid ${colors.warningBorder}`, background: colors.warningBg }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <strong style={{ color: colors.title }}>Ähnliche bereits gespeicherte Teilnehmer</strong>
                  <span style={{ color: "#92400e", fontSize: 12, fontWeight: 900 }}>Bitte prüfen, bevor ein neuer Teilnehmer gespeichert wird.</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {participantEntrySuggestions.map(({ participant, score }: any) => (
                    <div key={`entry-suggestion-${participant.key}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "9px 10px", borderRadius: 12, border: `1px solid ${colors.cardBorder}`, background: "#fff" }}>
                      <div>
                        <strong>{participant.name || "Ohne Name"}</strong> · #{participant.plate || "-"} · {participant.birthYear || "-"} | {participant.gender || "-"} · {participant.club || "-"}
                        <div style={{ color: colors.muted, fontSize: 12, fontWeight: 800 }}>
                          Ähnlichkeit: {Math.min(100, Math.round(score))}% · ID: {String(participant.participantId || participant.masterId || participant.raw?.id || "-").slice(0, 8)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm("Diesen bestehenden Teilnehmer bearbeiten statt einen neuen Eintrag zu erstellen?")) return;
                          setSelectedMasterParticipant(null);
                          setLastEditedMasterParticipantId(String(participant.raw?.id || ""));
                          seedMasterParticipantDraftLookup(participant);
                          setEditingRider(participant.raw);
                        }}
                        style={smallGhostButtonStyle}
                      >
                        Bestehenden bearbeiten
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {groups.length === 0 && masterParticipantFilter !== "trash" ? (
            <div style={{ color: colors.muted }}>Keine passenden aktiven Teilnehmer gefunden.</div>
          ) : masterParticipantFilter === "trash" ? null : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#eef3f8" }}>
                    <th style={tableHeaderStyle}>Teilnehmer-ID</th>
                    <th style={tableHeaderStyle}>Name</th>
                    <th style={tableHeaderStyle}>Plate</th>
                    <th style={tableHeaderStyle}>Jg | B/G</th>
                    <th style={tableHeaderStyle}>Verein</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((participant: any, index: number) => {
                    const duplicateStyle = masterDuplicateInfo.byKey[String(participant.key || "")];
                    const rowBackground = duplicateStyle ? duplicateStyle.bg : (index % 2 ? colors.tableRowAlt : "#fff");
                    return (
                    <tr
                      key={`${participant.name}-${participant.birthYear}-${participant.gender}-${index}`}
                      ref={(element) => {
                        participantRowRefs.current[`master-${String(participant.raw?.id || "")}`] = element as any;
                      }}
                      onClick={() => setSelectedMasterParticipant(participant)}
                      title="Teilnehmerdetails anzeigen"
                      style={{ borderBottom: `1px solid ${duplicateStyle?.border || colors.cardBorder}`, cursor: "pointer", background: rowBackground }}
                    >
                      <td style={{ ...tableCellStyle, fontFamily: "monospace", fontSize: 12, color: colors.muted }} title={String(participant.participantId || participant.masterId || participant.raw?.id || "")}>
                        {String(participant.participantId || participant.masterId || participant.raw?.id || "-").slice(0, 8)}
                      </td>
                      <td style={tableCellStyle}>
                        <strong>{participant.name}</strong>{participant.cruiser ? " · Cruiser" : ""}
                        {duplicateStyle && (
                          <span style={{ ...getStatusBadgeStyle("Warnung"), marginLeft: 8, background: duplicateStyle.bg, color: duplicateStyle.text, borderColor: duplicateStyle.border }}>
                            Mögliche Dublette · Gruppe {duplicateStyle.groupIndex}
                          </span>
                        )}
                        <div style={{ color: colors.blueBtn, fontWeight: 800, fontSize: 12 }}>Details/Rangierungen anzeigen</div>
                      </td>
                      <td style={tableCellStyle}>#{participant.plate || "-"}</td>
                      <td style={tableCellStyle}>{participant.birthYear || "-"} | {participant.gender || "-"}</td>
                      <td style={tableCellStyle}>{participant.club || "-"}</td>
                      <td style={{ ...tableCellStyle, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedMasterParticipant(null);
                              setLastEditedMasterParticipantId(String(participant.raw?.id || ""));
                              seedMasterParticipantDraftLookup(participant);
                              setEditingRider(participant.raw);
                              window.setTimeout(() => {
                                participantFormRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
                              }, 0);
                            }}
                            style={smallGhostButtonStyle}
                          >
                            Bearbeiten
                          </button>
                          {duplicateStyle && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                markMasterParticipantDuplicateOk(String(participant.key || ""));
                              }}
                              style={{ ...smallGhostButtonStyle, color: duplicateStyle.text, borderColor: duplicateStyle.border, background: "#ffffff" }}
                              title="Bestätigen, dass dieser Teilnehmer kein problematisches Duplikat ist."
                            >
                              Teilnehmer OK
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteMasterParticipantGroup(participant);
                            }}
                            style={{ ...smallGhostButtonStyle, color: colors.redBtn, borderColor: "#f2b8b5", background: "#fff5f5" }}
                          >
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {visibleTrashGroups.length > 0 && (
            <details open={masterParticipantFilter === "trash" || masterParticipantFilter === "all"} style={{ ...basePanelStyle, marginTop: 18, background: "#fff8f1" }}>
              <summary style={{ cursor: "pointer", fontWeight: 900, color: colors.title }}>
                Papierkorb gelöschte Teilnehmer ({visibleTrashGroups.length})
              </summary>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ color: colors.muted, fontSize: 13 }}>
                  Papierkorb-Einträge können einzeln wiederhergestellt oder gesammelt endgültig gelöscht werden.
                </div>
                <button type="button" onClick={permanentlyDeleteAllTrashParticipants} style={{ ...smallGhostButtonStyle, color: colors.redBtn, borderColor: "#f2b8b5", background: "#fff5f5" }}>
                  Papierkorb leeren
                </button>
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {visibleTrashGroups.map((participant: any) => (
                  <div key={participant.key} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: 10, border: `1px solid ${colors.cardBorder}`, borderRadius: 10, background: "#fff" }}>
                    <div>
                      <strong>{participant.name}</strong> · #{participant.plate || "-"} · {participant.birthYear || "-"} | {participant.gender || "-"}
                      <div style={{ color: colors.muted, fontSize: 12 }}>Einträge im Papierkorb: {participant.count}</div>
                    </div>
                    <button type="button" onClick={() => restoreMasterParticipantGroup(participant)} style={smallGhostButtonStyle}>Wiederherstellen</button>
                    <button type="button" onClick={() => permanentlyDeleteMasterParticipantGroup(participant)} style={{ ...smallGhostButtonStyle, color: colors.redBtn, borderColor: "#f2b8b5", background: "#fff5f5" }}>Endgültig löschen</button>
                  </div>
                ))}
              </div>
            </details>
          )}

          {selectedMasterParticipant && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.48)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
              }}
              onClick={() => setSelectedMasterParticipant(null)}
            >
              <div
                style={{
                  ...basePanelStyle,
                  width: "min(980px, 96vw)",
                  maxHeight: "88vh",
                  overflowY: "auto",
                  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <h2 style={{ margin: 0, color: colors.title }}>{selectedMasterParticipant.name}</h2>
                    <div style={{ color: colors.muted, fontWeight: 700, marginTop: 4 }}>
                      #{selectedMasterParticipant.plate || "-"} · {selectedMasterParticipant.birthYear || "-"} | {selectedMasterParticipant.gender || "-"} · {selectedMasterParticipant.club || "-"}
                      {getSpecialCategoryValue(selectedMasterParticipant.raw || selectedMasterParticipant) ? ` · ${getSpecialCategoryValue(selectedMasterParticipant.raw || selectedMasterParticipant)}` : ""}
                    </div>
                  </div>
                  <button onClick={() => setSelectedMasterParticipant(null)} style={smallGhostButtonStyle}>Schliessen</button>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  {getMasterParticipantEventDetails(selectedMasterParticipant).map((entry: any, entryIndex: number) => (
                    <div key={`${entry.eventId}-${entryIndex}`} style={{ border: `1px solid ${colors.cardBorder}`, borderRadius: 14, padding: 12, background: "#fbfdff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                        <div>
                          <strong style={{ color: colors.title, fontSize: 16 }}>{entry.name}</strong>
                          <span style={{ color: colors.muted }}> · {entry.year || "-"} · {entry.type === "single" ? "Einzelrennen" : "Rennserie"}</span>
                        </div>
                        {entry.overall ? (
                          <span style={getStatusBadgeStyle("Resultate erfasst")}>Gesamtwertung: Rang {entry.overall.rank} · {entry.overall.total} Punkte</span>
                        ) : entry.type === "series" ? (
                          <span style={getStatusBadgeStyle("Offen")}>Keine Gesamtwertung</span>
                        ) : null}
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#eef3f8" }}>
                            <th style={tableHeaderStyle}>Race</th>
                            <th style={tableHeaderStyle}>Anmeldung</th>
                            <th style={tableHeaderStyle}>Kategorie</th>
                            <th style={tableHeaderStyle}>Rangierung</th>
                            <th style={tableHeaderStyle}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.races.map((raceEntry: any) => (
                            <tr key={`${entry.eventId}-${raceEntry.race}`} style={{ borderBottom: "1px solid #e5ebf1" }}>
                              <td style={tableCellStyle}><strong>{raceEntry.race}</strong></td>
                              <td style={tableCellStyle}>{raceEntry.assigned ? "angemeldet" : "-"}</td>
                              <td style={tableCellStyle}>{raceEntry.category || "-"}</td>
                              <td style={tableCellStyle}>{raceEntry.rank ? `Rang ${raceEntry.rank}` : "noch kein Resultat"}</td>
                              <td style={tableCellStyle}>{raceEntry.status || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {versionFooter}
        </div>
      </div>
    );
  }


  if (appShellView === "guide") {
    const guideCards = [
      {
        title: "1. Startseite",
        text: "Erstelle ein neues Rennen oder eine Rennserie, öffne bestehende Einträge, verwalte die Haupt-Teilnehmerdatenbank und erstelle globale Backups.",
      },
      {
        title: "2. Teilnehmerdatenbank",
        text: "Teilnehmer werden zentral erfasst. Beim Hinzufügen zu einem Rennen wählst du sie aus der Hauptdatenbank aus. Dubletten werden markiert und gelöschte Teilnehmer landen zuerst im Papierkorb.",
      },
      {
        title: "3. Rennen starten",
        text: "Im Bereich Rennen Starten öffnest du Race 1, Race 2 usw. Dort werden Teilnehmer hinzugefügt, Motos oder manuelle Ranglisten erstellt und Resultate gespeichert.",
      },
      {
        title: "4. Normale Rennabwicklung",
        text: "Teilnehmer auswählen, Motos erstellen, Resultate erfassen, Finals erstellen, Finalresultate erfassen, Race abschliessen und PDF exportieren.",
      },
      {
        title: "5. Manuelle Rangliste",
        text: "Wenn keine Läufe gefahren werden, öffne den Button Manuelle Rangliste. Danach platzierst du alle Fahrer einer Kategorie in Zielreihenfolge und speicherst daraus die Resultatliste.",
      },
      {
        title: "6. Speichern und Backup",
        text: "Speichern erstellt ein komplettes Datei-Backup mit allen Rennen, Teilnehmern, Resultaten und Einstellungen. Vor kritischen Aktionen wird automatisch ein Sicherheitsbackup erstellt.",
      },
      {
        title: "7. PDFs",
        text: "PDFs können für Motos, Finals, Resultate und Gesamtwertung erstellt werden. Die PDF-Ausgabe enthält Footer mit Version, Erstellungszeit und Seitenzahl.",
      },
    ];

    return (
      <div style={{ padding: 20, fontFamily: "Arial, sans-serif", background: colors.pageGradient, minHeight: "100vh", color: colors.text, maxWidth: 1320, margin: "0 auto" }}>
        {renderAppHeader()}
        <div style={{ ...basePanelStyle, marginBottom: 16, background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ ...sectionTitleStyle, fontSize: 24 }}>Anleitung</h2>
              <div style={helperTextStyle}>Kurzübersicht zur Bedienung des BMX Race Managers.</div>
            </div>
            <button onClick={() => setAppShellView("events")} style={secondaryButtonStyle}>Zurück zur Startseite</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          {guideCards.map((card) => (
            <div key={card.title} style={{ ...basePanelStyle, minHeight: 130 }}>
              <h3 style={{ margin: "0 0 8px", color: colors.title, fontSize: 18 }}>{card.title}</h3>
              <p style={{ ...helperTextStyle, margin: 0, fontSize: 14 }}>{card.text}</p>
            </div>
          ))}
        </div>
        <div style={{ ...basePanelStyle, marginTop: 16, borderLeft: `6px solid ${colors.blueBtn}` }}>
          <h3 style={{ marginTop: 0, color: colors.title }}>Empfohlener Ablauf am Renntag</h3>
          <ol style={{ marginBottom: 0, lineHeight: 1.7, fontWeight: 800, color: colors.text }}>
            <li>Backup erstellen.</li>
            <li>Renninformationen prüfen: Rennserie/Rennname, Ort und Datum.</li>
            <li>Teilnehmer aus der Hauptdatenbank ins Rennen übernehmen.</li>
            <li>Race öffnen und Motos oder manuelle Rangliste erstellen.</li>
            <li>Resultate erfassen, Race abschliessen und PDF erstellen.</li>
            <li>Bei Serien: Nach abgeschlossenen Rennen die Gesamtwertung erstellen.</li>
          </ol>
        </div>
        {versionFooter}
      </div>
    );
  }

  if (appShellView === "regulations") {
    const pointRows = Array.from({ length: 12 }, (_, index) => {
      const rank = index + 1;
      return { rank, points: getOverallPointsForRank(rank) };
    });

    const formatRows = [
      { count: "1–8", motos: "3 Motos + 4. Moto", finals: "Kein A/B-Final. Der 4. Moto ist der Endlauf und wird im Finalblock gefahren." },
      { count: "9–16", motos: "3 Motos", finals: "A-Final und B-Final nach Moto-Punkten." },
      { count: "17–19", motos: "3 Motos", finals: "A-, B- und C-Final nach Moto-Punkten." },
      { count: "20", motos: "3 Motos", finals: "Top 16 zuerst in zwei Halbfinals. Nach fertigen Halbfinalresultaten wird C-Final für die restlichen 4 Fahrer freigeschaltet." },
      { count: "21–24", motos: "3 Motos", finals: "Top 16 zuerst in zwei Halbfinals. Nach fertigen Halbfinalresultaten wird C-Final für die restlichen 5–8 Fahrer freigeschaltet." },
      { count: "25–32", motos: "3 Motos", finals: "Top 16 zuerst in zwei Halbfinals. Nach fertigen Halbfinalresultaten werden Plätze 17–24 im C-Final und 25–32 im D-Final freigeschaltet." },
      { count: ">32", motos: "Nicht erlaubt", finals: "App bricht mit Fehlermeldung ab." },
    ];

    return (
      <div style={{ padding: 20, fontFamily: "Arial, sans-serif", background: colors.pageGradient, minHeight: "100vh", color: colors.text, maxWidth: 1320, margin: "0 auto" }}>
        {renderAppHeader()}
        <div style={{ ...basePanelStyle, marginBottom: 16, background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ ...sectionTitleStyle, fontSize: 24 }}>Renn-Reglement</h2>
              <div style={helperTextStyle}>Übersicht der aktuell in der App hinterlegten Renn- und Wertungslogik.</div>
            </div>
            <button onClick={() => setAppShellView("events")} style={secondaryButtonStyle}>Zurück zur Startseite</button>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 14 }}>
          <h3 style={{ marginTop: 0, color: colors.title }}>Rennformat nach Teilnehmerzahl</h3>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1.6fr", gap: 0, border: `1px solid ${colors.cardBorder}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ ...tableHeaderStyle, position: "static" }}>Teilnehmer</div>
            <div style={{ ...tableHeaderStyle, position: "static" }}>Vorlauf</div>
            <div style={{ ...tableHeaderStyle, position: "static" }}>Final-/Halbfinal-Logik</div>
            {formatRows.map((row) => (
              <React.Fragment key={row.count}>
                <div style={{ ...tableCellStyle, padding: "10px 12px", fontWeight: 950 }}>{row.count}</div>
                <div style={{ ...tableCellStyle, padding: "10px 12px", fontWeight: 800 }}>{row.motos}</div>
                <div style={{ ...tableCellStyle, padding: "10px 12px", fontWeight: 800 }}>{row.finals}</div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 14, alignItems: "start" }}>
          <div style={{ ...basePanelStyle }}>
            <h3 style={{ marginTop: 0, color: colors.title }}>Motos, Finals und Halbfinals</h3>
            <ul style={{ marginBottom: 0, lineHeight: 1.7, fontWeight: 800 }}>
              <li>Pro Kategorie oder zusammengelegter Laufgruppe sind maximal {MAX_RIDERS_PER_RACE_CATEGORY} Teilnehmer erlaubt.</li>
              <li>Die App erstellt grundsätzlich 3 Motos. Pro Laufgruppe sind maximal 8 Fahrer vorgesehen.</li>
              <li>In den Motos werden eingegebene Ränge als Rangpunkte gezählt: 1. Platz = 1 Punkt, 2. Platz = 2 Punkte usw.</li>
              <li>DNF zählt in den Motos mit 10 Punkten, DSQ mit 50 Punkten.</li>
              <li>DNS in einem Final-/Endresultat wird nicht in der Race-Rangliste geführt und erhält keine Gesamtwertungspunkte für dieses Rennen.</li>
              <li>Ab 20 Teilnehmern gehen die besten 16 Fahrer nach den Motos in zwei Halbfinals.</li>
              <li>Aus den Halbfinals kommen die besten 4 Fahrer pro Halbfinal in den A-Final; die restlichen gewerteten Fahrer kommen in den B-Final.</li>
              <li>C- und D-Finals werden bei Halbfinal-Kategorien erst freigeschaltet, wenn die Halbfinalresultate vollständig erfasst sind und die Finals freigeschaltet werden.</li>
              <li>Die operative Final-Darstellung läuft nach dem Freischalten zuerst D-Final, C-Final und B-Final je Kategorie; alle A-Finals und 4. Motos werden am Schluss gesammelt angezeigt.</li>
              <li>Plausch 1, Plausch 2 und Plausch 3 sind eigene Spezial-Kategorien und starten im Programm vor allen regulären Alterskategorien.</li>
              <li>Cruiser bleibt eine eigene Spezial-Kategorie und startet direkt vor Boys 16+ / Girls 17+.</li>
            </ul>
          </div>

          <div style={{ ...basePanelStyle }}>
            <h3 style={{ marginTop: 0, color: colors.title }}>Punktetabelle Gesamtwertung</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, border: `1px solid ${colors.cardBorder}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ ...tableHeaderStyle, position: "static" }}>Rang</div>
              <div style={{ ...tableHeaderStyle, position: "static" }}>Punkte</div>
              {pointRows.map((row) => (
                <React.Fragment key={row.rank}>
                  <div style={{ ...tableCellStyle, padding: "8px 10px" }}>{row.rank}</div>
                  <div style={{ ...tableCellStyle, padding: "8px 10px", fontWeight: 900 }}>{row.points}</div>
                </React.Fragment>
              ))}
            </div>
            <div style={{ ...helperTextStyle, marginTop: 10 }}>Ab Rang 10 wird die Punktzahl nach der hinterlegten Formel weiter reduziert. DNS wird nicht gewertet.</div>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginTop: 14 }}>
          <h3 style={{ marginTop: 0, color: colors.title }}>Endrangliste und Gesamtwertung</h3>
          <ul style={{ marginBottom: 0, lineHeight: 1.7, fontWeight: 800 }}>
            <li>Finalresultate bestimmen die endgültige Race-Rangliste.</li>
            <li>A-Final steht vor B-Final, B-Final vor C-Final, C-Final vor D-Final.</li>
            <li>Halbfinals sind Qualifikationsläufe und erscheinen nicht als eigene Endranglisten-Blöcke.</li>
            <li>Bei Kategorien mit 1–8 Teilnehmern zählt der 4. Moto als Endlauf.</li>
            <li>Bei einer Rennserie wird eingestellt, wie viele Rennen zur Gesamtwertung zählen.</li>
            <li>Für die Gesamtwertung werden nur abgeschlossene Rennen berücksichtigt.</li>
            <li>Nicht zählende Resultate werden als Streichresultate in Klammern angezeigt.</li>
            <li>Bei Punktegleichheit entscheidet zuerst das bessere Streichresultat, danach weitere Streichresultate, danach das beste Einzelresultat und danach das letzte gefahrene Resultat.</li>
          </ul>
        </div>

        <div style={{ ...basePanelStyle, marginTop: 14, borderLeft: `6px solid ${colors.warningBorder}`, background: colors.warningBg }}>
          <h3 style={{ marginTop: 0, color: colors.title }}>Hinweis</h3>
          <div style={{ ...helperTextStyle, color: "#92400e" }}>
            Dieses Renn-Reglement beschreibt die in der App umgesetzte Logik. Falls eure Rennserie ein offizielles Vereins- oder Verbandsreglement hat, sollte diese Seite entsprechend angepasst werden.
          </div>
        </div>
        {versionFooter}
      </div>
    );
  }


  if (appShellView === "dataCheck") {
    const repairableCount = dataCheckIssues.filter((issue) => issue.repairable).length;
    const errorCount = dataCheckIssues.filter((issue) => issue.level === "error").length;
    const warningCount = dataCheckIssues.filter((issue) => issue.level === "warning").length;
    const infoCount = dataCheckIssues.filter((issue) => issue.level === "info").length;
    return (
      <div style={{ padding: 20, fontFamily: "Arial, sans-serif", background: colors.pageGradient, minHeight: "100vh", color: colors.text, maxWidth: 1320, margin: "0 auto" }}>
        {renderAppHeader()}
        {backupWarningBar}
        <div style={basePanelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, color: colors.title }}>Daten prüfen / Reparatur</h2>
              <div style={{ color: colors.muted, fontWeight: 800, marginTop: 4 }}>
                Prüft Teilnehmer-IDs, doppelte Startnummern, Kategorien über 32 Fahrer, fehlende Resultate, Halbfinal-/Finalstatus, Event-Zuordnung und alte Datenstrukturen.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={runDataIntegrityCheck} style={compactPrimaryButtonStyle} disabled={dataCheckRunning}>
                {dataCheckRunning ? "Prüfung läuft..." : "Daten jetzt prüfen"}
              </button>
              <button onClick={repairDataIntegrity} style={repairableCount ? compactSaveButtonStyle : disabledButtonStyle} disabled={!repairableCount}>
                Automatisch reparieren
              </button>
              <button onClick={() => setAppShellView("events")} style={secondaryButtonStyle}>Zurück zur Startseite</button>
            </div>
          </div>
          {lastIntegrityCheckAt && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ ...chipStyle, display: "inline-flex" }}>Letzte Prüfung: {formatDateTime(lastIntegrityCheckAt)}</div>
              <div style={{ ...chipStyle, display: "inline-flex", background: errorCount ? colors.dangerBg : colors.successBg, color: errorCount ? "#991b1b" : colors.greenBtn }}>Fehler: {errorCount}</div>
              <div style={{ ...chipStyle, display: "inline-flex", background: warningCount ? colors.warningBg : colors.successBg, color: warningCount ? "#92400e" : colors.greenBtn }}>Warnungen: {warningCount}</div>
              <div style={{ ...chipStyle, display: "inline-flex" }}>Infos: {infoCount}</div>
              <div style={{ ...chipStyle, display: "inline-flex" }}>Reparierbar: {repairableCount}</div>
            </div>
          )}
          {dataRepairMessage && (
            <div style={{ ...basePanelStyle, background: colors.successBg, borderColor: colors.successBorder, marginBottom: 12 }}>
              {dataRepairMessage}
            </div>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {dataCheckIssues.length === 0 ? (
              <div style={{ color: colors.muted, fontWeight: 800 }}>Noch keine Prüfung durchgeführt.</div>
            ) : dataCheckIssues.map((issue, index) => {
              const isError = issue.level === "error";
              const isWarning = issue.level === "warning";
              return (
                <div key={`issue-${index}`} style={{
                  border: `1px solid ${isError ? colors.dangerBorder : isWarning ? colors.warningBorder : colors.successBorder}`,
                  borderLeft: `6px solid ${isError ? colors.redBtn : isWarning ? colors.warningBorder : colors.successBorder}`,
                  background: isError ? colors.dangerBg : isWarning ? colors.warningBg : colors.successBg,
                  borderRadius: 12,
                  padding: 12,
                }}>
                  <div style={{ fontWeight: 950, color: colors.title }}>{isError ? "Fehler" : isWarning ? "Warnung" : "Info"}: {issue.title}</div>
                  <div style={{ marginTop: 4, color: colors.text, fontWeight: 750 }}>{issue.detail}</div>
                  {issue.repairable && <div style={{ marginTop: 6, color: colors.muted, fontWeight: 900 }}>Kann automatisch repariert werden.</div>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, color: colors.muted, fontSize: 13, fontWeight: 800 }}>
            Datenstruktur-Version: {DATA_SCHEMA_VERSION}. Vor Reparaturen wird automatisch ein vollständiges Backup erstellt.
          </div>
          {versionFooter}
        </div>
      </div>
    );
  }

  if (appShellView === "history") {
    const historyEntries = getEventHistoryEntries();
    return (
      <div style={{ padding: 20, fontFamily: "Arial, sans-serif", background: colors.pageGradient, minHeight: "100vh", color: colors.text, maxWidth: 1320, margin: "0 auto" }}>
        {renderAppHeader()}
        <div style={{ ...basePanelStyle, marginBottom: 16 }}>
          <button onClick={() => setAppShellView("events")} style={secondaryButtonStyle}>Zurück zur Startseite</button>
        </div>
        <div style={{ ...basePanelStyle, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>App Versions-History / Release Notes</h2>
          <ReleaseNotes colors={colors} getStatusBadgeStyle={getStatusBadgeStyle} />
        </div>
        <div style={{ ...basePanelStyle }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>Änderungshistory / Speicher- und Import-History</h2>
          {historyEntries.length === 0 ? (
            <div style={{ color: colors.muted }}>Noch keine History vorhanden.</div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              {historyEntries.map(({ event, logs, backups }) => (
                <div key={event.id} style={{ borderTop: "1px solid #e5ebf1", paddingTop: 12 }}>
                  <h3 style={{ margin: "0 0 8px", color: colors.title }}>{getEventDisplayName(event)}</h3>
                  <strong>Speicher / Import / Backup</strong>
                  <div style={{ marginTop: 6, color: colors.muted, display: "grid", gap: 4 }}>
                    {backups.length ? backups.slice(0, 8).map((entry: any, index: number) => (
                      <div key={`${event.id}-backup-${index}`}>{formatDateTime(entry.iso)} · {entry.fileName || "Backup"}{entry.reason ? ` · ${entry.reason}` : ""}</div>
                    )) : <div>Keine Backup-Einträge.</div>}
                  </div>
                  <strong style={{ display: "block", marginTop: 12 }}>Änderungen</strong>
                  <div style={{ marginTop: 6, color: colors.muted, display: "grid", gap: 4 }}>
                    {logs.length ? logs.slice(0, 12).map((entry: any, index: number) => (
                      <div key={`${event.id}-log-${index}`}>{entry}</div>
                    )) : <div>Keine Änderungen protokolliert.</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {versionFooter}
        </div>
      </div>
    );
  }

  if (viewMode === "dashboard") {
    return (
      <div
        style={{
          padding: 20,
          fontFamily: "Arial, sans-serif",
          background: colors.pageBg,
          minHeight: "100vh",
          color: colors.text,
          maxWidth: 1320,
          margin: "0 auto",
        }}
      >
        {renderAppHeader()}
        {backupWarningBar}

        <div
          style={{
            ...basePanelStyle,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 14,
            justifyContent: "space-between",
            background: "linear-gradient(135deg, #e8f1ff 0%, #f8fbff 100%)",
            borderColor: "#9bbcff",
            boxShadow: "0 10px 24px rgba(45, 108, 223, 0.14)",
          }}
        >
          <div>
            <strong style={{ fontSize: 22, color: colors.title }}>{getCurrentEvent()?.name || "Rennserie"}</strong><br />
            <span style={{ color: colors.muted, fontSize: 15, fontWeight: 800 }}>{getCurrentEvent()?.type === "single" ? "Einzel Rennen" : "Rennserie"} · {getCurrentEvent()?.year || ""}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <span style={getStatusBadgeStyle(getRaceStatus(selectedRace))}>Status {selectedRace}: {getRaceStatus(selectedRace)}</span>
              <span style={getStatusBadgeStyle("Teilnehmer")}>Teilnehmer: {getRaceParticipantCount(selectedRace)}</span>
              <span style={getStatusBadgeStyle("Speichern")}>Letzte Speicherung: {lastSaveAt ? formatDateTime(lastSaveAt) : "-"}</span>
              <span style={getStatusBadgeStyle("ID")}>Event-ID: {getShortEventId(getCurrentEvent())}</span>
              <span style={getStatusBadgeStyle(hasUnsavedChanges ? "Warnung" : "OK")}>{hasUnsavedChanges ? "Ungesicherte Änderungen" : "Keine offenen Änderungen"}</span>
            </div>
          </div>
          <button onClick={async () => { if (currentEventId && initialLoaded && hasUnsavedChanges) { const saved = await saveOnlineFullAppState(); if (!saved) return; } setAppShellView("events"); }} style={{ ...secondaryButtonStyle, minHeight: 46 }}>Zur Startseite</button>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 14 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gridTemplateRows: "22px 44px 18px", rowGap: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0, display: "flex", alignItems: "center" }}>Rennserie</label>
              <input
                value={homeEventSeries}
                onChange={(e) => setHomeEventSeries(e.target.value)}
                placeholder="Name der Rennserie eingeben"
                style={{ ...inputStyle, height: 44, boxSizing: "border-box" }}
              />
              <div />
            </div>
            <div style={{ display: "grid", gridTemplateRows: "22px 44px 18px", rowGap: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0, display: "flex", alignItems: "center" }}>Logo Rennblätter</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                style={{ ...inputStyle, height: 44, boxSizing: "border-box", paddingTop: 9 }}
              />
              <div style={{ color: colors.muted, fontSize: 12, fontWeight: 800, lineHeight: "18px", minHeight: 18 }}>
                {eventLogo ? "Logo gespeichert und für alle Rennen aktiv." : ""}
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, color: colors.title }}>{isSingleEvent ? "Renn-Status" : "Serien-Einstellungen"}</h2>
            <span style={getStatusBadgeStyle(seriesLocked ? "Abgeschlossen" : "Offen")}>
              {isSingleEvent ? (seriesLocked ? "Rennen abgeschlossen" : "Rennen offen") : (seriesLocked ? "Serie abgeschlossen" : "Serie offen")}
            </span>
          </div>
          {isSingleEvent ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ ...basePanelStyle, padding: "10px 12px", marginBottom: 0, background: "#f8fafc", minWidth: 220, minHeight: 62, display: "grid", alignContent: "center" }}>
                <div style={{ color: colors.muted, fontSize: 12, fontWeight: 900 }}>Rennformat</div>
                <div style={{ color: colors.title, fontSize: 16, fontWeight: 900 }}>Einzelrennen · 1 Race</div>
              </div>
              <button
                onClick={toggleSeriesLocked}
                style={{
                  ...(seriesLocked ? compactDangerButtonStyle : compactHomeButtonStyle),
                  height: 62,
                  minHeight: 62,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 14px",
                  boxSizing: "border-box",
                }}
              >
                {seriesLocked ? "Rennen öffnen" : "Rennen abschliessen"}
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Anzahl Rennen in Serie</label>
                <input
                  type="number"
                  min={getMinimumSeriesRaceCount()}
                  max={10}
                  disabled={seriesLocked}
                  value={seriesRaceCount}
                  onChange={(e) => updateSeriesRaceCount(Number(e.target.value))}
                  style={{ ...inputStyle, height: 42, opacity: seriesLocked ? 0.6 : 1 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Anzahl Rennen für Gesamtwertung</label>
                <input
                  type="number"
                  min={1}
                  max={seriesRaceCount}
                  disabled={seriesLocked}
                  value={overallCountingRaces}
                  onChange={(e) => updateOverallCountingRaces(Number(e.target.value))}
                  style={{ ...inputStyle, height: 42, opacity: seriesLocked ? 0.6 : 1 }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <button
                  onClick={toggleSeriesLocked}
                  style={{
                    ...(seriesLocked ? compactDangerButtonStyle : compactHomeButtonStyle),
                    height: 42,
                    minHeight: 42,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "8px 12px",
                    boxSizing: "border-box",
                  }}
                >
                  {seriesLocked ? "Serie öffnen" : "Serie abschliessen"}
                </button>
              </div>
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 13, color: colors.muted, fontWeight: 800, lineHeight: 1.35 }}>
            {isSingleEvent ? "Einzelrennen · ein Race · keine Gesamtwertung" : `${getSeriesRulesText()} · Für die Gesamtwertung zählen nur abgeschlossene Rennen.`}
            {!isSingleEvent && <><br />Streichresultate erscheinen in Klammern / durchgestrichen und entscheiden bei Punktegleichheit.</>}
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 14, borderColor: colors.greenBorder, background: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 70%)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <h2 style={{ ...sectionTitleStyle, marginBottom: 0 }}>Rennen Starten</h2>
            <span style={{ color: colors.muted, fontSize: 13, fontWeight: 800 }}>
              Wähle ein Race, um das Rennen zu starten oder weiter zu bearbeiten.
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 12,
              flexWrap: "nowrap",
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            {activeRaces.map((race) => (
              <button
                key={race}
                onClick={() => {
                  setSelectedRace(race);
                  setViewMode("race");
                }}
                title={`${race} starten`}
                style={{
                  ...compactHomeButtonStyle,
                  flex: "0 0 190px",
                  minHeight: 82,
                  textAlign: "left",
                  display: "grid",
                  alignContent: "center",
                  gap: 5,
                  borderColor: colors.greenBorder,
                  background: "linear-gradient(135deg, #ffffff 0%, #dcfce7 100%)",
                  boxShadow: "0 10px 22px rgba(22, 163, 74, 0.14)",
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 950, color: colors.greenBtn }}>{race} starten</span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={getStatusBadgeStyle(getRaceStatus(race))}>{getRaceStatus(race)}</span>
                  <span style={{ color: colors.muted, fontSize: 12, fontWeight: 900 }}>
                    {getRaceParticipantCount(race)} TN
                  </span>
                </span>
              </button>
            ))}
            {!isSingleEvent && (
              <button
                onClick={() => setViewMode("overall")}
                style={{ ...compactPrimaryButtonStyle, marginLeft: "auto", flex: "0 0 170px", minHeight: 82, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                Gesamtwertung
              </button>
            )}
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 14 }}>
          <h2 style={sectionTitleStyle}>Teilnehmer</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <button
              onClick={() => setViewMode("participants")}
              style={{ ...compactHomeButtonStyle, flex: "0 0 180px", minHeight: 54, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              Teilnehmer hinzufügen
            </button>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>Datenstatus</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div><strong>Letzte Änderung</strong><br />{changeLog[0] || "Noch keine Änderung"}</div>
            <div><strong>Letzte Online-Speicherung</strong><br />{lastOnlineSaveAt ? formatDateTime(lastOnlineSaveAt) : "Noch nicht online gespeichert"}</div>
            <div><strong>Speicherstatus</strong><br />{hasUnsavedChanges ? "Änderungen offen – bitte online speichern" : "Online gespeichert"}</div>
          </div>
        </div>

        {warningsPanel}

        {versionFooter}
      </div>
    );
  }

  if (viewMode === "overall" && isSingleEvent) {
    return (
      <div style={{ padding: 20, fontFamily: "Arial, sans-serif", background: colors.pageGradient, minHeight: "100vh", color: colors.text, maxWidth: 1320, margin: "0 auto" }}>
        {renderAppHeader()}
        <div style={{ ...basePanelStyle }}>
          <button onClick={() => setViewMode("dashboard")} style={secondaryButtonStyle}>Zurück</button>
          <h2 style={{ color: colors.title }}>Einzelrennen</h2>
          <p>Für Einzelrennen gibt es keine Gesamtwertung. Bitte verwende die Resultate-PDF auf dem Rennblatt.</p>
        </div>
        {versionFooter}
      </div>
    );
  }

  if (viewMode === "overall") {
    return (
      <div
        style={{
          padding: 20,
          fontFamily: "Arial, sans-serif",
          background: colors.pageBg,
          minHeight: "100vh",
          color: colors.text,
          maxWidth: 1320,
          margin: "0 auto",
        }}
      >
        {renderAppHeader()}
        {backupWarningBar}

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
              gap: 8,
              alignItems: "stretch",
            }}
          >
            <button
              onClick={() => setViewMode("dashboard")}
              style={{ ...secondaryButtonStyle, minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 8px" }}
            >
              Home
            </button>
            <button style={{ ...activeRaceButtonStyle, minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 8px" }}>Gesamtwertung</button>
            <button onClick={createOverallRanking} disabled={overallLocked} style={overallLocked ? { ...disabledButtonStyle, minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 8px" } : { ...mainButtonStyle, minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 8px" }}>
              Gesamtwertung erstellen
            </button>
            <button onClick={toggleOverallLocked} style={overallLocked ? { ...dangerButtonStyle, minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 8px" } : { ...secondaryButtonStyle, minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 8px" }}>
              {overallLocked ? "Gesamtwertung freigeben" : "Gesamtwertung sperren"}
            </button>
            <button onClick={exportOverallPdf} style={{ ...mainButtonStyle, minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 8px" }}>
              Gesamtwertung PDF
            </button>
            <button onClick={exportOverallExcel} style={{ ...secondaryButtonStyle, minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 8px" }}>
              Gesamtwertung Excel
            </button>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>Gesamtwertung</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            {getOverallPreviewRows().map((row) => (
              <div key={row.race} style={{ border: "1px solid #d8e0e6", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
                <strong>{row.race}</strong><br />
                <span style={{ color: colors.muted }}>{row.count} Resultate</span><br />
                <span style={getStatusBadgeStyle(row.status)}>{row.status}</span><br />
                <span style={{ color: row.countsForOverall ? "#176b38" : colors.muted, fontWeight: 900, fontSize: 12 }}>
                  {row.countsForOverall ? "Zählt für Gesamtwertung" : "Zählt noch nicht"}
                </span>
              </div>
            ))}
          </div>
          <div style={{ color: colors.muted, lineHeight: 1.5 }}>
            Gewertet werden die besten {overallCountingRaces} von {seriesRaceCount} Rennen. Bei Punktegleichheit
            zählen zuerst die besseren Streichresultate, danach das beste Einzelresultat.
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={getStatusBadgeStyle(overallLocked ? "Abgeschlossen" : Object.keys(overallByCategory).length ? "Resultate erfasst" : "Offen")}>
              {overallLocked ? "Gesperrt" : Object.keys(overallByCategory).length ? "Erstellt" : "Noch nicht erstellt"}
            </span>
            {overallCreatedAt && <strong>Erstellt: {overallCreatedAt}</strong>}
          </div>
        </div>

        {Object.keys(overallByCategory).length === 0 && (
          <div style={basePanelStyle}>
            Noch keine Gesamtwertung verfügbar. Klicke zuerst auf
            <strong> Gesamtwertung erstellen</strong>.
          </div>
        )}

        {sortCategories(Object.keys(overallByCategory)).map((category) => {
          const items = applyManualOrder(category, overallByCategory[category]);

          return (
            <div key={category} style={{ ...basePanelStyle, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, color: colors.title }}><span style={getCategoryBadgeStyle(category)}>{category}</span></h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    `60px 1.4fr 90px 95px 1.2fr repeat(${activeRaces.length}, 64px) 90px 90px 80px`,
                  gap: 8,
                  fontWeight: 700,
                  color: colors.title,
                  marginBottom: 10,
                }}
              >
                <div>Rang</div>
                <div>Name</div>
                <div>Plate</div>
                <div>Jg | B/G</div>
                <div>Club</div>
                {activeRaces.map((_, index) => <div key={`overall-head-r${index + 1}`}>R{index + 1}</div>)}
                <div>Gesamt</div>
                <div>Streich</div>
                <div />
              </div>

              {items.map((r: any, index: number) => (
                <div
                  key={r.riderId}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      `60px 1.4fr 90px 95px 1.2fr repeat(${activeRaces.length}, 64px) 90px 90px 80px`,
                    gap: 8,
                    alignItems: "center",
                    minHeight: 38,
                    borderTop: "1px solid #eef2f6",
                    ...(index < 3 ? getMedalRowStyle(index + 1) : {}),
                  }}
                >
                  <div>{index + 1}.</div>
                  <div>
                    {r.name}
                    {r.raceCount < overallCountingRaces ? " *" : ""}
                  </div>
                  <div>#{r.plate}</div>
                  <div>{getRiderMetaLabel(r)}</div>
                  <div>{r.club || "-"}</div>
                  {activeRaces.map((_, raceIndex) => {
                    const value = r[`race${raceIndex + 1}`];
                    const isDropped = Array.isArray(r.droppedRaceIndexes) && r.droppedRaceIndexes.includes(raceIndex + 1);
                    return (
                      <div key={`${r.riderId}-race-${raceIndex + 1}`} style={isDropped ? { color: colors.muted, textDecoration: "line-through", fontWeight: 800 } : undefined}>
                        {value === null || value === undefined ? "-" : isDropped ? `(${value})` : value}
                      </div>
                    );
                  })}
                  <div style={{ fontWeight: 700 }}>{r.total}</div>
                  <div>{Array.isArray(r.dropResults) && r.dropResults.length ? r.dropResults.map((x: any) => `(${x})`).join(", ") : "-"}</div>
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={() => moveOverall(category, index, -1)}
                      disabled={overallLocked}
                      style={overallLocked ? disabledButtonStyle : moveButtonStyle}
                    >
                      ⬆
                    </button>
                    <button
                      onClick={() => moveOverall(category, index, 1)}
                      disabled={overallLocked}
                      style={overallLocked ? disabledButtonStyle : moveButtonStyle}
                    >
                      ⬇
                    </button>
                  </div>
                </div>
              ))}

              {items.some((r: any) => r.raceCount < overallCountingRaces) && (
                <div
                  style={{ marginTop: 12, color: colors.muted, fontSize: 13 }}
                >
                  *= noch nicht genügend Rennen für die aktuelle Serienwertung gefahren
                </div>
              )}
            </div>
          );
        })}

        {versionFooter}
      </div>
    );
  }

  if (viewMode === "participants") {
    return (
      <div
        style={{
          padding: 20,
          fontFamily: "Arial, sans-serif",
          background: colors.pageBg,
          minHeight: "100vh",
          color: colors.text,
          maxWidth: 1320,
          margin: "0 auto",
        }}
      >
        {renderAppHeader()}
        {backupWarningBar}

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setViewMode("dashboard")}
              style={{ ...homeButtonStyle, minHeight: 52, padding: "10px 18px" }}
            >
              Home
            </button>
            {activeRaces.map((race) => (
              <button
                key={race}
                onClick={() => {
                  setSelectedRace(race);
                  setViewMode("race");
                }}
                style={{ ...compactHomeButtonStyle, minHeight: 52, padding: "10px 14px" }}
              >
                {race}
              </button>
            ))}
            {!isSingleEvent && (
              <button onClick={() => setViewMode("overall")} style={{ ...compactHomeButtonStyle, minHeight: 52, padding: "10px 14px" }}>
                Gesamtwertung
              </button>
            )}
          </div>
        </div>

        {warningsPanel}

        <div style={{ ...basePanelStyle, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, margin: 0, minWidth: 180 }}>Rennjahr für Kategorien</label>
            <input
              type="number"
              min="2000"
              max="2100"
              value={participantEventYear}
              onChange={(e) => setParticipantEventYear(e.target.value)}
              style={{ ...inputStyle, width: 160 }}
            />
          </div>
        </div>

        <div ref={participantFormRef} style={{ ...basePanelStyle, marginBottom: 20, borderLeft: `6px solid ${colors.blueBtn}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ marginTop: 0, marginBottom: 6, color: colors.title }}>{editingRider ? "Teilnehmer bearbeiten" : "Teilnehmer für dieses Rennen"}</h2>
              <p style={{ color: colors.muted, marginTop: 0, lineHeight: 1.35 }}>
                Bestehende Teilnehmer suchen, direkt zu {selectedRace} hinzufügen oder vor dem Erstellen der Motos einen neuen Teilnehmer erfassen.
              </p>
            </div>
            {!editingRider && (
              <button
                type="button"
                onClick={startEventParticipantCreate}
                disabled={Object.keys(heats || {}).length > 0 || raceClosed}
                style={Object.keys(heats || {}).length > 0 || raceClosed ? compactDisabledButtonStyle : { ...actionSaveButtonStyle, minHeight: 52 }}
                title={Object.keys(heats || {}).length > 0 ? "Nach Motos-Erstellung bitte die Notfall-Nachmeldung verwenden." : undefined}
              >
                + Neuer Teilnehmer
              </button>
            )}
          </div>

          {editingRider ? (
            <>
              <p style={{ color: colors.muted, marginTop: -4 }}>
                Die bestehende Teilnehmer-ID, Race-Häkchen und Resultat-Verknüpfungen bleiben beim Speichern erhalten.
              </p>
              <div className="rider-form-no-legacy-cruiser">
                <RiderForm
                  onChange={handleEventParticipantFormChange}
                  editingRider={editingRider}
                  onCancelEdit={() => { setEditingRider(null); setParticipantSpecialCategoryDraft(""); setParticipantSpecialCategoryDraftDirty(false); setLastEditedMasterParticipantId(""); }}
                  eventYear={participantEventYear}
                  currentEventId={currentEventId || "legacy"}
                />
              </div>
              {renderSpecialCategorySelector()}
            </>
          ) : showEventParticipantCreateForm ? (
            <div style={{ marginTop: 12, padding: 14, borderRadius: 16, border: `1px solid ${colors.greenBorder}`, background: colors.greenBg }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <strong style={{ color: colors.title }}>Neuen Teilnehmer erfassen und direkt zu {selectedRace} hinzufügen</strong>
                <button type="button" onClick={() => { setParticipantSpecialCategoryDraft(""); setParticipantSpecialCategoryDraftDirty(false); setShowEventParticipantCreateForm(false); }} style={smallGhostButtonStyle}>Abbrechen</button>
              </div>
              <div className="rider-form-no-legacy-cruiser">
                <RiderForm
                  onChange={handleEventParticipantFormChange}
                  editingRider={null}
                  onCancelEdit={() => { setParticipantSpecialCategoryDraft(""); setParticipantSpecialCategoryDraftDirty(false); setShowEventParticipantCreateForm(false); }}
                  eventYear={participantEventYear}
                  currentEventId={currentEventId || "legacy"}
                />
              </div>
              {renderSpecialCategorySelector("Nach dem Speichern wird der neue Teilnehmer direkt dieser Spezial-Kategorie zugeordnet, falls hier eine Auswahl gesetzt ist.")}
              <div style={{ marginTop: 8, color: colors.muted, fontSize: 13, fontWeight: 800 }}>
                Nach dem Speichern erhält der Teilnehmer automatisch eine stabile Teilnehmer-ID und wird in {selectedRace} ausgewählt.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(220px, 0.55fr)", gap: 12, alignItems: "end", marginTop: 12 }}>
                <div>
                  <label style={labelStyle}>Teilnehmer suchen</label>
                  <input
                    value={eventParticipantSearch}
                    onChange={(e) => setEventParticipantSearch(e.target.value)}
                    placeholder="Name, Startnummer, Verein oder Kategorie eingeben ..."
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Kategorie-Filter</label>
                  <select
                    value={eventParticipantCategoryFilter}
                    onChange={(e) => setEventParticipantCategoryFilter(e.target.value)}
                    style={inputStyle}
                  >
                    {getEventParticipantCategoryOptions().map((category) => (
                      <option key={category} value={category}>{category === "all" ? "Alle Kategorien" : category}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ color: colors.muted, fontSize: 13, fontWeight: 800 }}>
                  {getMasterParticipantSuggestions().length} verfügbare Teilnehmer · {selectedMasterParticipantKeys.length} ausgewählt · Ziel: {selectedRace}
                </div>
                <button
                  type="button"
                  onClick={addSelectedMasterParticipantsToCurrentEvent}
                  disabled={selectedMasterParticipantKeys.length === 0}
                  style={selectedMasterParticipantKeys.length === 0 ? disabledButtonStyle : compactPrimaryButtonStyle}
                >
                  Ausgewählte zu {selectedRace} hinzufügen
                </button>
              </div>

              <div style={{ marginTop: 10, border: `1px solid ${colors.cardBorder}`, borderRadius: 16, overflowY: "auto", overflowX: "hidden", background: "#fff", maxHeight: 430 }}>
                {getMasterParticipantSuggestions().length === 0 ? (
                  <div style={{ padding: 14, color: colors.muted }}>Keine passenden Teilnehmer in der Hauptdatenbank gefunden. Mit „+ Neuer Teilnehmer“ kannst du direkt einen neuen Fahrer erfassen.</div>
                ) : (
                  sortCategories(Object.keys(groupEventParticipantSuggestionsByCategory(getMasterParticipantSuggestions()))).map((category) => {
                    const categoryItems = groupEventParticipantSuggestionsByCategory(getMasterParticipantSuggestions())[category] || [];
                    return (
                      <div key={`event-suggestion-${category}`} style={{ borderBottom: `1px solid ${colors.cardBorder}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", background: colors.tableHeadBg }}>
                          <strong style={{ color: colors.title }}>{category} ({categoryItems.length})</strong>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="button" onClick={() => addVisibleMasterParticipantCategoryToCurrentRace(category)} style={smallGhostButtonStyle}>Alle zu {selectedRace}</button>
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: 0 }}>
                          {categoryItems.map((participant: any) => {
                            const checked = selectedMasterParticipantKeys.includes(participant.key);
                            return (
                              <button
                                type="button"
                                key={participant.key}
                                onClick={() => toggleMasterParticipantSelection(participant.key)}
                                style={{
                                  width: "100%",
                                  display: "grid",
                                  gridTemplateColumns: "38px 92px minmax(180px, 1fr) 120px minmax(110px, 0.8fr) auto",
                                  gap: 10,
                                  alignItems: "center",
                                  padding: "10px 12px",
                                  border: "none",
                                  borderTop: `1px solid ${colors.cardBorder}`,
                                  background: checked ? "#eef6ff" : "#fff",
                                  color: colors.text,
                                  textAlign: "left",
                                  fontSize: 13,
                                  boxSizing: "border-box",
                                  cursor: "pointer",
                                }}
                              >
                                <span style={{ fontWeight: 950, color: checked ? colors.blueBtn : colors.muted }}>{checked ? "✓" : "+"}</span>
                                <strong>#{participant.plate || "-"}</strong>
                                <span style={{ fontWeight: 900 }}>{participant.name}</span>
                                <span>{participant.birthYear || "-"} | {participant.gender || "-"}</span>
                                <span style={{ color: colors.muted }}>{participant.club || "-"}</span>
                                <span
                                  onClick={(e) => { e.stopPropagation(); addMasterParticipantToCurrentEvent(participant, true); }}
                                  style={{ ...smallGhostButtonStyle, display: "inline-flex", justifyContent: "center" } as React.CSSProperties}
                                >
                                  zu {selectedRace}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {manualResultsMode && (
          <div id="manual-results" style={{ ...basePanelStyle, marginBottom: 20, borderColor: colors.blueBtn, background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)", borderLeft: `6px solid ${colors.blueBtn}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <h2 style={{ ...sectionTitleStyle, display: "flex", alignItems: "center", gap: 8 }}>🏁 Manuelle Rangliste erstellen</h2>
                <div style={{ color: colors.muted, fontWeight: 700, marginTop: 4, lineHeight: 1.35 }}>
                  1. Kategorie prüfen · 2. Alle Fahrer in Zielreihenfolge anklicken · 3. Mit „Rangliste speichern“ speichern.
                  Alle Fahrer einer Kategorie bleiben in einer einzigen Kachel, auch bei mehr als 8 Teilnehmern.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={createManualResults} style={compactPrimaryButtonStyle}>Rangliste speichern</button>
                <button type="button" onClick={() => { setManualResultsMode(false); setManualResultOrder({}); }} style={compactHomeButtonStyle}>Abbrechen</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              {sortCategories(Object.keys(manualRankingGroups)).map((cat) => {
                const selectedIds = manualResultOrder[cat] || [];
                return (
                  <div key={`manual-${cat}`} style={{ border: `1px solid ${colors.cardBorder}`, borderRadius: 16, padding: 14, background: "#fff", boxShadow: "0 6px 16px rgba(23,32,51,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <strong style={{ color: colors.title }}>{cat}</strong>
                      <span style={{ color: colors.muted, fontSize: 12, fontWeight: 800 }}>{selectedIds.length}/{(manualRankingGroups[cat] || []).length}</span>
                    </div>
                    <div style={{ display: "grid", gap: 8, paddingRight: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: colors.muted, fontSize: 12, fontWeight: 900 }}>
                        <span>Alle Fahrer dieser Kategorie anklicken</span>
                        <span>{selectedIds.length}/{(manualRankingGroups[cat] || []).length} platziert</span>
                      </div>
                      {[...(manualRankingGroups[cat] || [])]
                        .sort((a: any, b: any) => {
                          const plateA = Number(String(a.plate || "").replace(/\D/g, ""));
                          const plateB = Number(String(b.plate || "").replace(/\D/g, ""));
                          if (Number.isFinite(plateA) && Number.isFinite(plateB) && plateA !== plateB) return plateA - plateB;
                          return String(a.name || "").localeCompare(String(b.name || ""), "de");
                        })
                        .map((r: any) => {
                        const riderId = String(r.id);
                        const selectedIndex = selectedIds.indexOf(riderId);
                        const selected = selectedIndex >= 0;
                        return (
                          <button
                            key={`manual-${cat}-${riderId}`}
                            type="button"
                            onClick={() => toggleManualResultRider(cat, r)}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "44px 90px minmax(0, 1fr) 90px",
                              gap: 8,
                              alignItems: "center",
                              textAlign: "left",
                              border: `1px solid ${selected ? colors.blueBtn : colors.cardBorder}`,
                              background: selected ? "#eaf2ff" : "#fff",
                              color: colors.text,
                              borderRadius: 8,
                              padding: "9px 10px",
                              cursor: "pointer",
                              fontWeight: selected ? 900 : 700,
                            }}
                          >
                            <span>{selected ? `${selectedIndex + 1}.` : ""}</span>
                            <span>#{r.plate || "-"}</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                            <span style={{ color: colors.muted, fontSize: 12 }}>{getRiderMetaLabel(r)}</span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedIds.length > 0 && (
                      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#f8fbff", border: `1px solid ${colors.cardBorder}` }}>
                        <div style={{ fontWeight: 900, color: colors.title, marginBottom: 6 }}>Bereits platzierte Fahrer</div>
                        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                          {selectedIds.map((id, orderIndex) => {
                            const selectedRider = (manualRankingGroups[cat] || []).find((r: any) => String(r.id) === String(id));
                            return (
                              <div key={`manual-order-${cat}-${id}`}>{orderIndex + 1}. #{selectedRider?.plate || "-"} {selectedRider?.name || "Unbekannter Fahrer"}</div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {selectedIds.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => setManualResultOrder((prev) => ({ ...prev, [cat]: (prev[cat] || []).slice(0, -1) }))}
                          style={smallGhostButtonStyle}
                        >
                          Letzten Fahrer rückgängig
                        </button>
                        <button type="button" onClick={() => addRemainingManualResultCategory(cat)} style={smallGhostButtonStyle}>
                          Rest ans Ende setzen
                        </button>
                        <button type="button" onClick={() => clearManualResultCategory(cat)} style={smallGhostButtonStyle}>
                          Kategorie zurücksetzen
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <button onClick={deleteAllRiders} style={dangerButtonStyle}>
            Alle Teilnehmer löschen
          </button>
        </div>

        <div style={{ ...basePanelStyle }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>
            Teilnehmer in dieser Rennserie / diesem Rennen ({allRiders.length})
          </h2>

          <div style={{ marginBottom: 10, color: colors.muted }}>
            Häkchen setzen, bei welchen Rennen der Fahrer startet. Kategorien
            werden automatisch aus Rennjahr, Jahrgang und Geschlecht berechnet.
            Cruiser und Plausch 1–3 werden separat gewertet.
          </div>

          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Fahrer suchen: Name, Startnummer, Verein, Kategorie ..."
              style={inputStyle}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
                gap: 10,
                alignItems: "stretch",
              }}
            >
              {[
                ["all", "Alle"],
                ["selectedRace", `${selectedRace} ausgewählt`],
                ["notSelectedRace", `${selectedRace} offen`],
                ["missing", "Fehlende Angaben"],
                ["duplicates", "Doppelte Nummern"],
                ["cruiser", "Cruiser"],
                ["plausch", "Plausch"],
              ].map(([key, label]) => {
                const active = participantQuickFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setParticipantQuickFilter(key as any)}
                    style={{
                      ...(active ? activeRaceButtonStyle : secondaryButtonStyle),
                      width: "100%",
                      minHeight: 52,
                      height: 52,
                      padding: "8px 10px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      fontSize: 13,
                      lineHeight: 1.15,
                      boxSizing: "border-box",
                      whiteSpace: "normal",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {(() => {
            const issues = getRiderValidationIssues(allRiders);
            if (!issues.missing.length && !issues.duplicates.length)
              return null;
            return (
              <div
                style={{
                  ...basePanelStyle,
                  borderColor: "#f0b429",
                  background: "#fff8e6",
                  marginBottom: 14,
                }}
              >
                <strong>Prüfung Teilnehmerdaten</strong>
                {issues.duplicates.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    Doppelte Startnummern pro Kategorie:{" "}
                    {issues.duplicates.slice(0, 6).join(" | ")}
                    <div style={{ marginTop: 4 }}>
                      Betroffene Fahrer sind unten rot markiert.
                    </div>
                  </div>
                )}
                {issues.missing.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    Fehlende Pflichtfelder:{" "}
                    {issues.missing.slice(0, 6).join(" | ")}
                  </div>
                )}
              </div>
            );
          })()}
          {filteredAllRiders.length === 0 && (
            <div style={{ ...basePanelStyle, color: colors.muted }}>
              Keine Teilnehmer mit diesem Filter gefunden.
            </div>
          )}

          {sortCategories(Object.keys(filteredGroupedAll)).map((cat) => (
            <div key={cat} style={{ marginBottom: 24 }}>
              <h3 style={{ color: colors.title }}>
                {cat} ({filteredGroupedAll[cat].length})
              </h3>
              <div style={{ ...basePanelStyle }}>
                <div
                  style={{
                    display: "flex",
                    fontWeight: 700,
                    marginBottom: 8,
                    color: colors.title,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: "grid",
                      gridTemplateColumns:
                        "80px minmax(160px, 1fr) 95px minmax(130px, 0.8fr)",
                      gap: 10,
                    }}
                  >
                    <div>Plate</div>
                    <div>Name</div>
                    <div>Jg | B/G</div>
                    <div>Verein</div>
                  </div>
                  {activeRaces.map((_, index) => (
                    <div key={`participant-race-head-${index + 1}`} style={checkboxCellStyle}>R{index + 1}</div>
                  ))}
                  <div style={{ width: 88 }} />
                </div>

                {filteredGroupedAll[cat].map((r: any) => (
                  <div
                    key={r.id}
                    ref={(element) => {
                      participantRowRefs.current[String(r.id || "")] = element;
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      minHeight: 34,
                      borderTop: "1px solid #eef2f6",
                      background: duplicatePlateRiderIds.has(String(r.id || ""))
                        ? "#ffe8e8"
                        : "transparent",
                      borderLeft: duplicatePlateRiderIds.has(String(r.id || ""))
                        ? "5px solid #d93025"
                        : "5px solid transparent",
                      paddingLeft: 6,
                    }}
                  >
                    <div style={{ flex: 1 }}>{renderRiderCells(r)}</div>

                    {activeRaces.map((race) => {
                      const flag = raceKeyMap[race];
                      return (
                        <div key={`${r.id}-${race}`} style={checkboxCellStyle}>
                          <input
                            type="checkbox"
                            checked={!!r[flag]}
                            onChange={(e) => toggleRaceForRider(r.id, race, e.target.checked)}
                            style={largeCheckboxStyle}
                          />
                        </div>
                      );
                    })}

                    <div
                      style={{
                        width: 88,
                        textAlign: "right",
                        display: "flex",
                        gap: 6,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => {
                          setLastEditedMasterParticipantId(String(r.id || ""));
                          setEditingRider(r);
                          window.setTimeout(() => {
                            participantFormRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
                          }, 0);
                        }}
                        style={editButtonStyle}
                      >
                        Bearbeiten
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {versionFooter}
      </div>
    );
  }

  const heatsCreated = Object.keys(heats || {}).length > 0;
  const finalsCreated = Object.keys(finals || {}).length > 0;

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "Arial, sans-serif",
        background: colors.pageBg,
        minHeight: "100vh",
        color: colors.text,
        position: "relative",
        maxWidth: 1320,
        margin: "0 auto",
      }}
    >
      <div style={{ position: "relative", zIndex: 1 }}>
        {renderAppHeader()}
        {backupWarningBar}

        <div style={stickyButtonBarStyle}>
          <div
            style={topRaceNavRowStyle}
          >
            <button
              onClick={() => setViewMode("dashboard")}
              style={{ ...compactHomeHighlightButtonStyle, ...topRaceNavButtonStyle }}
            >
              Home
            </button>
            <button
              type="button"
              onClick={saveOnlineFullAppState}
              disabled={!isFirebaseSignedIn}
              style={{ ...(!isFirebaseSignedIn ? compactDisabledButtonStyle : (hasUnsavedChanges || !lastOnlineSaveAt ? actionWarningButtonStyle : actionSaveButtonStyle)), ...topRaceNavButtonStyle }}
              title={!isFirebaseSignedIn ? "Bitte zuerst auf der Startseite anmelden" : hasUnsavedChanges || !lastOnlineSaveAt ? "Änderungen vorhanden – online speichern" : "Aktueller Stand ist online gespeichert"}
            >
              Speichern
            </button>
            <button
              onClick={createHeats}
              disabled={heatsCreated || raceClosed}
              style={
                heatsCreated || raceClosed
                  ? { ...compactDisabledButtonStyle, ...topRaceNavButtonStyle }
                  : { ...compactPrimaryButtonStyle, ...topRaceNavButtonStyle }
              }
              title={
                heatsCreated
                  ? "Motos sind bereits erstellt. Für Änderungen zuerst Reset klicken."
                  : undefined
              }
            >
              Motos erstellen
            </button>
            <button
              onClick={startManualResultsMode}
              disabled={raceClosed}
              style={raceClosed ? { ...compactDisabledButtonStyle, ...topRaceNavButtonStyle } : { ...compactPrimaryButtonStyle, ...topRaceNavButtonStyle }}
              title="Rangliste direkt manuell aus allen Teilnehmern je Kategorie erstellen"
            >
              Manuelle Rangliste
            </button>
            <button onClick={exportHeatsStartPdf} style={{ ...compactHomeButtonStyle, ...topRaceNavButtonStyle }}>
              Motos PDF
            </button>
            <button
              onClick={createFinals}
              disabled={!heatsCreated || finalsCreated || raceClosed}
              style={
                !heatsCreated || finalsCreated || raceClosed
                  ? { ...compactDisabledButtonStyle, ...topRaceNavButtonStyle }
                  : { ...compactPrimaryButtonStyle, ...topRaceNavButtonStyle }
              }
              title={
                !heatsCreated
                  ? "Zuerst Motos erstellen."
                  : finalsCreated
                    ? "Finals sind bereits erstellt. Für Änderungen zuerst Reset klicken."
                    : undefined
              }
            >
              Finals erstellen
            </button>
            <button
              onClick={createMainFinalsFromSemifinals}
              disabled={raceClosed || !Object.values(finals || {}).some((rounds: any) => isSemifinalProgram(rounds) && !rounds?.["A-Final"])}
              style={
                raceClosed || !Object.values(finals || {}).some((rounds: any) => isSemifinalProgram(rounds) && !rounds?.["A-Final"])
                  ? { ...compactDisabledButtonStyle, ...topRaceNavButtonStyle }
                  : { ...compactPrimaryButtonStyle, ...topRaceNavButtonStyle }
              }
              title="Nach vollständig erfassten Halbfinalresultaten D-, C-, B- und A-Finals freischalten"
            >
              Finals freischalten
            </button>
            <button onClick={exportFinalsStartPdf} style={{ ...compactHomeButtonStyle, ...topRaceNavButtonStyle }}>
              Finals PDF
            </button>
            <button
              onClick={toggleRaceClosed}
              style={raceClosed ? { ...actionWarningButtonStyle, ...topRaceNavButtonStyle } : { ...actionSaveButtonStyle, ...topRaceNavButtonStyle }}
            >
              {raceClosed ? "Race wieder öffnen" : "Race abschliessen"}
            </button>
            <button onClick={exportFinalsPdf} style={{ ...compactPrimaryButtonStyle, ...topRaceNavButtonStyle }}>
              Resultate PDF
            </button>
            <button
              onClick={resetHeats}
              disabled={raceClosed}
              style={raceClosed ? { ...compactDisabledButtonStyle, ...topRaceNavButtonStyle } : { ...actionDangerButtonStyle, ...topRaceNavButtonStyle }}
            >
              Reset
            </button>
          </div>
        </div>

        <div style={getRaceStatusPanelStyle(raceClosed, heatsCreated, finalsCreated)}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: colors.title, fontSize: 24 }}>
                Rennstatus – {selectedRace}
              </h2>
              <div style={{ marginTop: 5, color: colors.muted, fontSize: 14, fontWeight: 850 }}>
                Teilnehmer: {riders.length} · Motos: {heatsCreated ? "erstellt" : "offen"} · Finals: {finalsCreated ? "erstellt" : "offen"}
              </div>
            </div>
            <span style={{ ...getStatusBadgeStyle(getRaceStatus(selectedRace)), fontSize: 15, padding: "9px 14px" }}>
              Status: {getRaceStatus(selectedRace)}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            <div style={raceStatusStepStyle(true, riders.length > 0)}>
              <span>1 · Teilnehmer</span>
              <span style={{ fontSize: 12, fontWeight: 850 }}>{riders.length} erfasst</span>
            </div>
            <div style={raceStatusStepStyle(!heatsCreated && !raceClosed, heatsCreated)}>
              <span>2 · Motos</span>
              <span style={{ fontSize: 12, fontWeight: 850 }}>{heatsCreated ? "erstellt" : "noch offen"}</span>
            </div>
            <div style={raceStatusStepStyle(heatsCreated && !finalsCreated && !raceClosed, finalsCreated)}>
              <span>3 · Finals</span>
              <span style={{ fontSize: 12, fontWeight: 850 }}>{finalsCreated ? "erstellt" : "noch offen"}</span>
            </div>
            <div style={raceStatusStepStyle(finalsCreated && !raceClosed, raceClosed)}>
              <span>4 · Abschluss</span>
              <span style={{ fontSize: 12, fontWeight: 850 }}>{raceClosed ? "gesperrt" : "offen"}</span>
            </div>
          </div>

          {(!homeEventSeries.trim() || !eventLocation.trim() || !eventDate.trim()) && (
            <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 14, border: `1px solid ${colors.warningBorder}`, borderLeft: `6px solid ${colors.warningBorder}`, background: colors.warningBg, color: "#92400e", fontWeight: 900 }}>
              ⚠ Renninformationen unvollständig: {[!homeEventSeries.trim() ? "Rennserie" : "", !eventLocation.trim() ? "Rennort" : "", !eventDate.trim() ? "Datum" : ""].filter(Boolean).join(", ")} fehlt. Bitte vor dem Erstellen der Motos ergänzen.
            </div>
          )}

          <div style={{ marginBottom: 14, padding: 14, borderRadius: 16, border: `1px solid ${isCurrentRaceLive ? colors.greenBorder : colors.cardBorder}`, background: isCurrentRaceLive ? colors.greenBg : colors.cardSoftBg }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 1000, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Öffentliche Live-Ansicht</div>
                <div style={{ fontWeight: 1000, color: isCurrentRaceLive ? colors.greenBtn : colors.title, fontSize: 17, marginTop: 4 }}>
                  {isCurrentRaceLive ? `Dieses Rennen ist live veröffentlicht` : adminLiveRace?.active ? `Anderes Rennen ist live: ${adminLiveRace.eventName} · ${adminLiveRace.raceName}` : "Kein Rennen live veröffentlicht"}
                </div>
                <div style={{ color: colors.muted, fontSize: 13, fontWeight: 850, marginTop: 4 }}>
                  Öffentlich sichtbar: Motos, Startlisten, Resultate und Finals. Vor dem Rennen wird die Startliste nur manuell bzw. stündlich nachgeladen; während dem Rennen aktualisiert die Zuschaueransicht alle 30 Sekunden.
                  {isCurrentRaceLive ? " Die Admin-App veröffentlicht automatisch nach Moto-/Laufabschluss und bei Startlistenänderungen vor der Moto-Erstellung." : ""}
                </div>
                {liveRaceMessage && <div style={{ color: colors.muted, fontSize: 13, fontWeight: 850, marginTop: 4 }}>{liveRaceMessage}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                <button type="button" onClick={publishCurrentRaceLive} disabled={liveRaceLoading || !isFirebaseSignedIn} style={liveRaceLoading || !isFirebaseSignedIn ? compactDisabledButtonStyle : { ...compactPrimaryButtonStyle, minHeight: 42 }}>
                  {isCurrentRaceLive ? "Jetzt live aktualisieren" : "Dieses Rennen live veröffentlichen"}
                </button>
                <button type="button" onClick={() => void deactivateCurrentRaceLive()} disabled={liveRaceLoading || !isCurrentRaceLive} style={liveRaceLoading || !isCurrentRaceLive ? compactDisabledButtonStyle : { ...actionDangerButtonStyle, minHeight: 42 }}>
                  Live beenden
                </button>
                <button type="button" onClick={() => window.open(getPublicLiveUrl(), "_blank")} style={{ ...compactHomeButtonStyle, minHeight: 42 }}>
                  Live-Ansicht öffnen
                </button>
                <button type="button" onClick={copyPublicLiveUrl} style={{ ...smallGhostButtonStyle, minHeight: 42 }}>
                  Link kopieren
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Rennserie</label>
              <input
                value={buildRaceSeriesLabel()}
                readOnly
                style={{ ...inputStyle, background: "#f8fafc", fontWeight: 800 }}
              />
            </div>

            <div>
              <label style={labelStyle}>Rennort</label>
              <input
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Datum</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                style={{ ...inputStyle, maxWidth: 180 }}
              />
            </div>
          </div>

        </div>

        {manualResultsMode && (
          <div id="manual-results" style={{ ...basePanelStyle, marginBottom: 20, borderColor: colors.blueBtn, background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)", borderLeft: `6px solid ${colors.blueBtn}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <h2 style={{ ...sectionTitleStyle, display: "flex", alignItems: "center", gap: 8 }}>🏁 Manuelle Rangliste erstellen</h2>
                <div style={{ color: colors.muted, fontWeight: 700, marginTop: 4, lineHeight: 1.35 }}>
                  1. Kategorie prüfen · 2. Alle Fahrer in Zielreihenfolge anklicken · 3. Mit „Rangliste speichern“ speichern.
                  Alle Fahrer einer Kategorie bleiben in einer einzigen Kachel, auch bei mehr als 8 Teilnehmern.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={createManualResults} style={compactPrimaryButtonStyle}>Rangliste speichern</button>
                <button type="button" onClick={() => { setManualResultsMode(false); setManualResultOrder({}); }} style={compactHomeButtonStyle}>Abbrechen</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              {sortCategories(Object.keys(manualRankingGroups)).map((cat) => {
                const selectedIds = manualResultOrder[cat] || [];
                return (
                  <div key={`manual-${cat}`} style={{ border: `1px solid ${colors.cardBorder}`, borderRadius: 16, padding: 14, background: "#fff", boxShadow: "0 6px 16px rgba(23,32,51,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <strong style={{ color: colors.title }}>{cat}</strong>
                      <span style={{ color: colors.muted, fontSize: 12, fontWeight: 800 }}>{selectedIds.length}/{(manualRankingGroups[cat] || []).length}</span>
                    </div>
                    <div style={{ display: "grid", gap: 8, paddingRight: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: colors.muted, fontSize: 12, fontWeight: 900 }}>
                        <span>Alle Fahrer dieser Kategorie anklicken</span>
                        <span>{selectedIds.length}/{(manualRankingGroups[cat] || []).length} platziert</span>
                      </div>
                      {[...(manualRankingGroups[cat] || [])]
                        .sort((a: any, b: any) => {
                          const plateA = Number(String(a.plate || "").replace(/\D/g, ""));
                          const plateB = Number(String(b.plate || "").replace(/\D/g, ""));
                          if (Number.isFinite(plateA) && Number.isFinite(plateB) && plateA !== plateB) return plateA - plateB;
                          return String(a.name || "").localeCompare(String(b.name || ""), "de");
                        })
                        .map((r: any) => {
                        const riderId = String(r.id);
                        const selectedIndex = selectedIds.indexOf(riderId);
                        const selected = selectedIndex >= 0;
                        return (
                          <button
                            key={`manual-${cat}-${riderId}`}
                            type="button"
                            onClick={() => toggleManualResultRider(cat, r)}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "44px 90px minmax(0, 1fr) 90px",
                              gap: 8,
                              alignItems: "center",
                              textAlign: "left",
                              border: `1px solid ${selected ? colors.blueBtn : colors.cardBorder}`,
                              background: selected ? "#eaf2ff" : "#fff",
                              color: colors.text,
                              borderRadius: 8,
                              padding: "9px 10px",
                              cursor: "pointer",
                              fontWeight: selected ? 900 : 700,
                            }}
                          >
                            <span>{selected ? `${selectedIndex + 1}.` : ""}</span>
                            <span>#{r.plate || "-"}</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                            <span style={{ color: colors.muted, fontSize: 12 }}>{getRiderMetaLabel(r)}</span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedIds.length > 0 && (
                      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#f8fbff", border: `1px solid ${colors.cardBorder}` }}>
                        <div style={{ fontWeight: 900, color: colors.title, marginBottom: 6 }}>Bereits platzierte Fahrer</div>
                        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                          {selectedIds.map((id, orderIndex) => {
                            const selectedRider = (manualRankingGroups[cat] || []).find((r: any) => String(r.id) === String(id));
                            return (
                              <div key={`manual-order-${cat}-${id}`}>{orderIndex + 1}. #{selectedRider?.plate || "-"} {selectedRider?.name || "Unbekannter Fahrer"}</div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {selectedIds.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => setManualResultOrder((prev) => ({ ...prev, [cat]: (prev[cat] || []).slice(0, -1) }))}
                          style={smallGhostButtonStyle}
                        >
                          Letzten Fahrer rückgängig
                        </button>
                        <button type="button" onClick={() => addRemainingManualResultCategory(cat)} style={smallGhostButtonStyle}>
                          Rest ans Ende setzen
                        </button>
                        <button type="button" onClick={() => clearManualResultCategory(cat)} style={smallGhostButtonStyle}>
                          Kategorie zurücksetzen
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <details style={{ ...basePanelStyle, marginBottom: 16, background: "#fffdf7", borderColor: colors.warningBorder }} open={showEmergencyTools}>
          <summary
            onClick={(e) => { e.preventDefault(); setShowEmergencyTools((value) => !value); }}
            style={{ cursor: "pointer", fontWeight: 950, color: colors.title, fontSize: 16 }}
          >
            Notfall / Reparatur
          </summary>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={startManualResultsMode} disabled={raceClosed} style={raceClosed ? compactDisabledButtonStyle : { ...compactPrimaryButtonStyle, minHeight: 52 }}>
              Manuelle Rangliste
            </button>
            <select
              value={lateAddParticipantValue}
              onChange={(e) => setLateAddParticipantValue(e.target.value)}
              disabled={raceClosed || !heatsCreated || lateAddParticipantCandidates.length === 0}
              style={{ ...inputStyle, minWidth: 320, minHeight: 52, opacity: raceClosed || !heatsCreated ? 0.65 : 1 }}
              title={!heatsCreated ? "Zuerst Motos erstellen." : undefined}
            >
              <option value="">Teilnehmer für Nachmeldung wählen</option>
              {lateAddParticipantCandidates.map((candidate: any) => (
                <option key={candidate.value} value={candidate.value}>{candidate.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={addLateParticipantToCurrentRace}
              disabled={raceClosed || !heatsCreated || !lateAddParticipantValue}
              style={raceClosed || !heatsCreated || !lateAddParticipantValue ? compactDisabledButtonStyle : actionWarningButtonStyle}
            >
              Teilnehmer nachträglich hinzufügen
            </button>
            <button type="button" onClick={createNamedOnlineBackup} style={compactPrimaryButtonStyle}>
              Backup erstellen
            </button>
            <button type="button" onClick={resetHeats} disabled={raceClosed} style={raceClosed ? compactDisabledButtonStyle : actionDangerButtonStyle}>
              Race zurücksetzen
            </button>
            <span style={{ color: colors.muted, fontWeight: 800, fontSize: 13 }}>Seltene Notfallaktionen sind hier gebündelt, damit das Rennblatt übersichtlich bleibt.</span>
          </div>
        </details>

        <div style={sideRaceNavigationStyle}>
          <button
            type="button"
            onClick={() => setRaceNavigationOpen((open) => !open)}
            style={sideRaceNavigationButtonStyle}
            aria-label="Race Navigation"
            title="Race Navigation"
          >
            ☰
          </button>
          {raceNavigationOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={scrollHome} style={sideRaceNavigationSubButtonStyle}>
                Nach oben
              </button>
              <button
                onClick={() => scrollToSection("vorlauf-1")}
                style={sideRaceNavigationSubButtonStyle}
              >
                Moto 1
              </button>
              <button
                onClick={() => scrollToSection("vorlauf-2")}
                style={sideRaceNavigationSubButtonStyle}
              >
                Moto 2
              </button>
              <button
                onClick={() => scrollToSection("vorlauf-3")}
                style={sideRaceNavigationSubButtonStyle}
              >
                Moto 3
              </button>
              <button
                onClick={() => scrollToSection("finallaeufe")}
                style={sideRaceNavigationSubButtonStyle}
              >
                Finals
              </button>
              <button
                onClick={() => scrollToSection("resultate")}
                style={sideRaceNavigationSubButtonStyle}
              >
                Resultate
              </button>
            </div>
          )}
        </div>

        {raceClosed && (
          <div
            style={{
              ...basePanelStyle,
              marginBottom: 20,
              borderColor: colors.redBtn,
              background: "#fff1f1",
              fontWeight: 800,
            }}
          >
            {selectedRace} ist abgeschlossen und gegen Änderungen gesperrt.
          </div>
        )}

        <h2 style={{ color: colors.title }}>
          Teilnehmer ({riders.length}) – {selectedRace}
        </h2>

        {sortCategories(Object.keys(groupedRace)).map((cat) => {
          const ranking = getRanking(cat);

          return (
            <div
              key={cat}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)",
                gap: 16,
                alignItems: "flex-start",
                marginBottom: 24,
              }}
            >
              <div style={{ flex: 1, ...basePanelStyle }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <h3 style={{ margin: 0, color: colors.title }}>
                    {cat} ({groupedRace[cat].length})
                  </h3>

                  {getMergeableTargetsForCategory(cat).length > 0 && (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 700,
                        color: colors.title,
                      }}
                    >
                      Startet mit
                      <select
                        value={getCategoryMergeTarget(cat)}
                        disabled={heatsCreated}
                        onChange={(e) => setCategoryMergeTarget(cat, e.target.value)}
                        style={{
                          ...inputStyle,
                          width: 240,
                          opacity: heatsCreated ? 0.65 : 1,
                        }}
                        title={
                          heatsCreated
                            ? "Für Änderungen zuerst Reset klicken."
                            : undefined
                        }
                      >
                        <option value="">{cat} separat</option>
                        {getMergeableTargetsForCategory(cat).map((target) => (
                          <option key={target} value={target}>
                            {target}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                {getCategoryMergeTarget(cat) && (
                  <div
                    style={{
                      marginBottom: 8,
                      color: colors.muted,
                      fontWeight: 700,
                    }}
                  >
                    {cat} startet in den Motos und Finals zusammen mit {getCategoryMergeTarget(cat)}.
                    Rangliste und Gesamtwertung bleiben getrennt unter {cat}.
                  </div>
                )}

                <div style={{ ...listBoxStyle }}>
                  {renderRiderTableHeader()}
                  {renderRows(groupedRace[cat], (r) => (
                    <button
                      type="button"
                      onClick={() => openRiderInfo(r)}
                      style={{
                        width: "100%",
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      {renderRiderCells(r)}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, ...basePanelStyle }}>
                <h3 style={{ marginTop: 0, color: colors.title }}>
                  Zwischenrangliste
                </h3>

                <div style={{ ...listBoxStyle }}>
                  {renderRows(ranking, (r, i) => (
                    <div style={{ width: "100%", ...getMedalRowStyle(i + 1) }}>
                      {i + 1}. #{r.plate} {r.name} - {r.total} P
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {Object.keys(heats).length > 0 && (
          <div style={{ marginTop: 30 }}>
            <h2 style={{ color: colors.title }}>🏁 Motos</h2>

            {[0, 1, 2].map((runIndex) => (
              <div
                id={`vorlauf-${runIndex + 1}`}
                key={runIndex}
                style={{ marginBottom: 30, scrollMarginTop: 120 }}
              >
                <h3 style={{ color: colors.title }}>Moto {runIndex + 1}</h3>

                {sortCategories(Object.keys(heats)).map((cat) => (
                  <div key={cat} style={{ marginBottom: 20 }}>
                    <h4 style={{ color: colors.title }}>{cat}</h4>

                    {heats[cat][runIndex].map(
                      (group: any[], heatIndex: number) => {
                        const key = `${cat}_${runIndex}_${heatIndex}`;
                        const result = results[key] || [];

                        const entryKey = getMotoEntryKey(cat, runIndex, heatIndex);
                        const complete = isCompleteRaceEntry(group, result);

                        return (
                          <details
                            id={getRaceFlowSectionId(entryKey)}
                            key={key}
                            open={isRaceFlowEntryActive(entryKey)}
                            onToggle={(event) => {
                              if ((event.currentTarget as HTMLDetailsElement).open) setActiveRaceEntryKey(entryKey);
                            }}
                            style={getRaceFlowWrapperStyle(getRaceCardStyle(result.length > 0), entryKey, complete)}
                          >
                            <summary
                              style={{
                                cursor: "pointer",
                                listStyle: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 12,
                                flexWrap: "wrap",
                              }}
                            >
                              <strong style={{ color: colors.title }}>
                                Race {getSequentialHeatRaceNumber(heats, cat, runIndex, heatIndex)}
                              </strong>
                              <span style={getRaceFlowBadgeStyle(entryKey, complete)}>
                                {getRaceFlowBadgeLabel(entryKey, complete)}
                              </span>
                            </summary>

                            <div
                              style={{
                                display: "flex",
                                gap: 20,
                                marginTop: 10,
                              }}
                            >
                              {renderStartList(group)}
                              {renderSavedResult(result)}
                            </div>

                            <div id={`${getRaceFlowSectionId(entryKey)}-input`} style={{ marginTop: 16, scrollMarginTop: 120 }}>
                              <HeatInput
                                heat={group}
                                value={result}
                                onSave={(data: any[]) =>
                                  saveHeatResult(cat, runIndex, heatIndex, data)
                                }
                              />
                            </div>
                          </details>
                        );
                      },
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {Object.keys(finals).length > 0 && (
          <div id="finallaeufe" style={{ marginTop: 40, scrollMarginTop: 120 }}>
            <h2 style={{ color: colors.title }}>🏁 Finals</h2>
            <div style={{ ...helperTextStyle, marginBottom: 14 }}>
              Der 4. Moto wird nur im Finalblock gefahren. Abgeschlossene Läufe klappen automatisch zu; der nächste offene Lauf bleibt geöffnet. Bei Halbfinal-Kategorien werden C- und D-Finals erst nach vollständig erfassten Halbfinals freigeschaltet. Danach erscheinen zuerst D-, C- und B-Finals je Kategorie; alle A-Finals sowie 4. Motos werden am Schluss gesammelt angezeigt.
            </div>

            {sortCategories(Object.keys(finals)).map((cat) => {
              const roundNames = getVisiblePreAFinalRoundNames(finals[cat]);
              if (roundNames.length === 0) return null;

              return (
                <div key={cat} style={{ marginBottom: 30 }}>
                  <h3 style={{ color: colors.title }}>
                    {getFinalCategoryLabel(cat)}
                  </h3>
                  {roundNames.map((roundName) => renderFinalRoundCard(cat, roundName))}
                </div>
              );
            })}

            {sortCategories(Object.keys(finals)).some((cat) => getVisibleAFinalRoundNames(finals[cat]).length > 0) && (
              <div style={{ marginTop: 34, paddingTop: 16, borderTop: `4px solid ${colors.finalABorder}` }}>
                <h2 style={{ color: colors.title }}>🏆 A-Finals / 4. Motos am Schluss</h2>
                {sortCategories(Object.keys(finals)).map((cat) => {
                  const roundNames = getVisibleAFinalRoundNames(finals[cat]);
                  if (roundNames.length === 0) return null;

                  return (
                    <div key={`a-final-${cat}`} style={{ marginBottom: 30 }}>
                      <h3 style={{ color: colors.title }}>
                        {getFinalCategoryLabel(cat)}
                      </h3>
                      {roundNames.map((roundName) => renderFinalRoundCard(cat, roundName))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {Object.keys(finals).length > 0 && (
          <div id="resultate" style={{ marginTop: 50, scrollMarginTop: 120 }}>
            <h2 style={{ color: colors.title }}>
              🏆 Finalresultate / Ranglisten
            </h2>

            {originalRaceCategories().map((cat) => {
              const ranking = buildFinalCategoryRanking(cat);

              return (
                <div
                  key={`final-ranking-${cat}`}
                  style={{ ...basePanelStyle, marginBottom: 24 }}
                >
                  <h3 style={{ marginTop: 0, color: colors.title }}>{cat}</h3>

                  <div>
                    {ranking.length === 0 && (
                      <div style={{ color: colors.muted }}>
                        Noch keine Finalresultate gespeichert
                      </div>
                    )}

                    {ranking.map((r: any) => (
                      <div
                        key={`${cat}_${r.rank}_${r.plate}`}
                        style={{
                          minHeight: ROW_HEIGHT,
                          height: ROW_HEIGHT,
                          display: "flex",
                          alignItems: "center",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          ...getMedalRowStyle(r.rank),
                          marginBottom: 4,
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span style={{ width: 56, flexShrink: 0 }}>
                          {r.rank}.
                        </span>
                        <span style={{ width: 90, flexShrink: 0 }}>
                          #{r.plate}
                        </span>
                        <span style={{ flex: 1 }}>{r.name}</span>
                        <span style={{ width: 90, flexShrink: 0 }}>
                          {getRiderMetaLabel(r)}
                        </span>
                        <span style={{ flex: 1.1 }}>{r.club || "-"}</span>
                        <span style={{ width: 72, flexShrink: 0 }}>
                          L1: {r.run1 ?? "-"}
                        </span>
                        <span style={{ width: 72, flexShrink: 0 }}>
                          L2: {r.run2 ?? "-"}
                        </span>
                        <span style={{ width: 72, flexShrink: 0 }}>
                          L3: {r.run3 ?? "-"}
                        </span>
                        <span style={{ width: 88, flexShrink: 0 }}>
                          Finale: {r.finalRun ?? "-"}
                        </span>
                        <span style={{ width: 120, flexShrink: 0 }}>
                          {getRoundLabelForRankingAndPdf(r.roundName)}
                        </span>
                        <span
                          style={{
                            width: 74,
                            flexShrink: 0,
                            display: "flex",
                            gap: 4,
                          }}
                        >
                          <button
                            onClick={() =>
                              moveFinalRanking(cat, r.rank - 1, -1)
                            }
                            style={moveButtonStyle}
                          >
                            ⬆
                          </button>
                          <button
                            onClick={() => moveFinalRanking(cat, r.rank - 1, 1)}
                            style={moveButtonStyle}
                          >
                            ⬇
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {versionFooter}

        {selectedRiderInfo && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.45)",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
            onClick={() => setSelectedRiderInfo(null)}
          >
            <div
              style={{
                ...basePanelStyle,
                width: "min(760px, 92vw)",
                maxHeight: "82vh",
                overflow: "auto",
                boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 20,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <h2 style={{ marginTop: 0, color: colors.title }}>
                    #{selectedRiderInfo.rider.plate}{" "}
                    {selectedRiderInfo.rider.name}
                  </h2>
                  <div style={{ color: colors.muted, fontWeight: 700 }}>
                    {selectedRiderInfo.rider.category} ·{" "}
                    {getRiderMetaLabel(selectedRiderInfo.rider)} ·{" "}
                    {selectedRiderInfo.rider.club || "-"}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRiderInfo(null)}
                  style={secondaryButtonStyle}
                >
                  Schliessen
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 18,
                  marginTop: 18,
                }}
              >
                <div style={basePanelStyle}>
                  <h3 style={{ marginTop: 0, color: colors.title }}>
                    Motos
                  </h3>
                  {selectedRiderInfo.heatsInfo.length === 0 ? (
                    <div style={{ color: colors.muted }}>
                      Noch keine Motos erstellt.
                    </div>
                  ) : (
                    selectedRiderInfo.heatsInfo.map((item: any) => (
                      <div
                        key={`${item.run}-${item.heat}`}
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid #eef2f6",
                        }}
                      >
                        <strong>Moto {item.run}</strong>
                        <br />
                        Race {item.heat}, Startposition {item.startPos}
                      </div>
                    ))
                  )}
                </div>

                <div style={basePanelStyle}>
                  <h3 style={{ marginTop: 0, color: colors.title }}>Finals</h3>
                  {selectedRiderInfo.finalsInfo.length === 0 ? (
                    <div style={{ color: colors.muted }}>
                      Noch keine Finals erstellt.
                    </div>
                  ) : (
                    selectedRiderInfo.finalsInfo.map((item: any) => (
                      <div
                        key={`${item.roundName}-${item.startPos}`}
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid #eef2f6",
                        }}
                      >
                        <strong>{getRoundDisplayName(item.roundName)}</strong>
                        <br />
                        Startposition {item.startPos}
                      </div>
                    ))
                  )}
                </div>
              </div>
              {selectedRiderInfo.raceInfos && (
                <div style={{ ...basePanelStyle, marginTop: 18 }}>
                  <h3 style={{ marginTop: 0, color: colors.title }}>Alle Rennen und Gesamtwertung</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {selectedRiderInfo.raceInfos.map((info: any) => (
                      <div key={info.race} style={{ border: "1px solid #d8e0e6", borderRadius: 12, padding: 10, background: info.assigned ? "#f8fafc" : "#f1f4f7" }}>
                        <strong>{info.race}</strong><br />
                        <span>{info.assigned ? "zugeteilt" : "nicht zugeteilt"}</span><br />
                        <span style={{ color: colors.muted }}>{info.heatsInfo.length} Moto-Einträge · {info.finalsInfo.length} Final-Einträge</span><br />
                        {info.ranking ? <span>Rang: {info.ranking.rank} {info.ranking.status !== "OK" ? `(${info.ranking.status})` : ""}</span> : <span style={{ color: colors.muted }}>kein Resultat</span>}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, fontWeight: 800 }}>
                    Gesamtwertung: {selectedRiderInfo.overallInfo ? `${selectedRiderInfo.overallInfo.category}, Rang ${selectedRiderInfo.overallInfo.rank}, ${selectedRiderInfo.overallInfo.total} Punkte (${selectedRiderInfo.overallInfo.raceCount} Rennen)` : "noch nicht vorhanden"}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
