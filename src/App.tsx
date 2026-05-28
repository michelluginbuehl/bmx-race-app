import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "./db";
import RiderForm from "./components/RiderForm";
import { generateCategoryHeats, generateFinals } from "./race";
import HeatInput from "./components/HeatInput";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const ROW_HEIGHT = 30;
const BOX_MIN_HEIGHT = 8 * ROW_HEIGHT + 34;
const RACES = ["Race 1", "Race 2", "Race 3", "Race 4", "Race 5", "Race 6", "Race 7", "Race 8", "Race 9", "Race 10"] as const;
type RaceName = (typeof RACES)[number];

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
const APP_VERSION = "v1.7.5";
const APP_NAME = "BMX Race Manager";
const APP_CHANGE_NOTE = "Bearbeitungsnavigation ohne Scroll-Effekt angepasst";

export default function App() {
  const [selectedRace, setSelectedRace] = useState<RaceName>("Race 1");
  const [viewMode, setViewMode] = useState<
    "dashboard" | "participants" | "race" | "overall"
  >("dashboard");

  const [allRiders, setAllRiders] = useState<any[]>([]);
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
  const [participantEventYear, setParticipantEventYear] = useState<string>(
    String(new Date().getFullYear()),
  );
  const [raceClosed, setRaceClosed] = useState(false);
  const [selectedRiderInfo, setSelectedRiderInfo] = useState<any | null>(null);
  const [raceNavigationOpen, setRaceNavigationOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [participantQuickFilter, setParticipantQuickFilter] = useState<
    "all" | "missing" | "duplicates" | "cruiser"
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
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loadedRace, setLoadedRace] = useState<RaceName | null>(null);

  const colors = {
    pageBg: "#f3f6f8",
    cardBg: "#ffffff",
    cardBorder: "#d8e0e6",
    title: "#1f2a37",
    text: "#2f3b45",
    muted: "#7b8794",
    greenBg: "#dff5e3",
    greenBorder: "#86d19d",
    blueBtn: "#2d6cdf",
    redBtn: "#d64545",
    grayBtn: "#e9eef3",
    grayBtnText: "#23303b",
    finalA: "#ffe9a8",
    finalABorder: "#d7a800",
    finalB: "#e8f1ff",
    finalBBorder: "#8ab2ff",
    finalC: "#f1e8ff",
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
    warningBg: "#fff7e6",
    dangerBg: "#fff1f1",
  };

  const raceKeyMap = Object.fromEntries(
    RACES.map((race, index) => [race, `race${index + 1}`]),
  ) as Record<RaceName, string>;

  const activeRaces = useMemo(
    () => RACES.slice(0, Math.max(1, Math.min(10, seriesRaceCount))) as RaceName[],
    [seriesRaceCount],
  );

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

  const getDerivedCategory = (rider: any) => {
    if (rider?.cruiser || rider?.isCruiser) return CRUISER_CATEGORY;

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
    const lower = String(category || "").toLowerCase();
    if (lower.includes("cruiser")) return 9999;
    const fixedIndex = BMX_AGE_CATEGORIES.findIndex(
      (cat) => cat.label === category,
    );
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

  const scrollToSection = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      borderRadius: 999,
      padding: "5px 10px",
      fontSize: 12,
      fontWeight: 900,
      border: "1px solid transparent",
      whiteSpace: "nowrap",
    };
    if (status === "Abgeschlossen")
      return {
        ...base,
        background: colors.successBg,
        color: "#176b38",
        borderColor: "#9addb5",
      };
    if (status === "Resultate erfasst")
      return {
        ...base,
        background: "#e8f1ff",
        color: "#1f5fbf",
        borderColor: "#acc8ff",
      };
    if (status === "Finals erstellt")
      return {
        ...base,
        background: colors.warningBg,
        color: "#985f00",
        borderColor: "#f3c46a",
      };
    if (status === "Vorläufe erstellt")
      return {
        ...base,
        background: "#eef4ff",
        color: "#2d6cdf",
        borderColor: "#bfd2ff",
      };
    return {
      ...base,
      background: "#f1f4f7",
      color: colors.muted,
      borderColor: "#d8e0e6",
    };
  };

  const getRiderSearchText = (r: any) =>
    `${r.name || ""} ${r.plate || ""} ${r.club || ""} ${r.category || ""} ${getRiderMetaLabel(r)}`.toLowerCase();

  const matchesGlobalSearch = (r: any) => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return true;
    return getRiderSearchText(r).includes(query);
  };



  const globalSearchResults = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return [];
    return allRiders.filter((r: any) => getRiderSearchText(r).includes(query)).slice(0, 12);
  }, [allRiders, globalSearch]);

  const getStoredRaceData = (race: RaceName, key: string, fallback: any) => {
    if (race === selectedRace && key === "heats") return heats;
    if (race === selectedRace && key === "finals") return finals;
    if (race === selectedRace && key === "final_results") return finalResults;
    try {
      return JSON.parse(localStorage.getItem(getRaceStorageKey(race, key)) || JSON.stringify(fallback));
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

  const downloadExcelTemplate = () => {
    const rows = [
      { Name: "Max Muster", Plate: "23", Verein: "BMX Club", Jahrgang: "2014", Geschlecht: "B", Cruiser: "", Race1: "x", Race2: "x", Race3: "x", Race4: "x", Race5: "", Race6: "", Race7: "", Race8: "", Race9: "", Race10: "" },
      { Name: "Lina Beispiel", Plate: "41", Verein: "BMX Club", Jahrgang: "2015", Geschlecht: "G", Cruiser: "x", Race1: "x", Race2: "", Race3: "x", Race4: "", Race5: "", Race6: "", Race7: "", Race8: "", Race9: "", Race10: "" },
    ];
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["Name", "Plate", "Verein", "Jahrgang", "Geschlecht", "Cruiser", "Race1", "Race2", "Race3", "Race4", "Race5", "Race6", "Race7", "Race8", "Race9", "Race10"] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Teilnehmer Vorlage");
    XLSX.writeFile(wb, "BMX-Teilnehmer-Vorlage.xlsx");
    addChangeLog("Teilnehmer Excel-Vorlage heruntergeladen");
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
        {r.name}
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
    `bmx_${selectedRace.toLowerCase().replace(/\s+/g, "_")}_${suffix}`;

  const getRaceStorageKey = (race: RaceName, suffix: string) =>
    `bmx_${race.toLowerCase().replace(/\s+/g, "_")}_${suffix}`;

  const saveAppData = async (key: string, value: any) => {
    await db.table("appData").put({ key, value });
  };

  const loadAppData = async <T,>(key: string, fallback: T): Promise<T> => {
    const saved = await db.table("appData").get(key);
    if (saved && Object.prototype.hasOwnProperty.call(saved, "value"))
      return saved.value as T;

    const localValue = localStorage.getItem(key);
    if (localValue === null) return fallback;

    try {
      return JSON.parse(localValue) as T;
    } catch {
      return localValue as T;
    }
  };

  const saveBoth = async (key: string, value: any) => {
    localStorage.setItem(
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    );
    await saveAppData(key, value);
  };

  const loadAllRiders = async () => {
    const all = (await db.table("riders").toArray()).map(normalizeRider);

    setAllRiders(sortRidersByCategoryAndName(all));
  };

  const loadRaceRiders = async () => {
    const all = (await db.table("riders").toArray()).map(normalizeRider);
    const flag = raceKeyMap[selectedRace];

    const filtered = all.filter((r: any) => !!r[flag]);

    setRiders(sortRidersByCategoryAndName(filtered));
    setAllRiders(sortRidersByCategoryAndName(all));
  };

  useEffect(() => {
    if (!editingRider || viewMode !== "participants") return;
    window.setTimeout(() => {
      participantFormRef.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    }, 60);
  }, [editingRider?.id, viewMode]);

  useEffect(() => {
    const loadInitialData = async () => {
      const allSavedAppData = await db.table("appData").toArray();
      allSavedAppData.forEach((row: any) => {
        if (!row?.key) return;
        localStorage.setItem(
          row.key,
          typeof row.value === "string" ? row.value : JSON.stringify(row.value),
        );
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
      const savedHomeEventSeries = await loadAppData<string>("bmx_home_event_series", "");
      const savedSeriesRaceCount = await loadAppData<number>("bmx_series_race_count", 4);
      const savedOverallCountingRaces = await loadAppData<number>("bmx_overall_counting_races", 3);
      const savedGlobalEventLogo = await loadAppData<string>("bmx_event_logo", "");
      setHomeEventSeries(savedHomeEventSeries || "");
      setSeriesRaceCount(Math.max(1, Math.min(10, Number(savedSeriesRaceCount) || 4)));
      setOverallCountingRaces(Math.max(1, Math.min(10, Number(savedOverallCountingRaces) || 3)));
      setEventLogo(savedGlobalEventLogo || "");
      setBackupHistory(Array.isArray(savedBackupHistory) ? savedBackupHistory : []);
      setLastSaveAt(savedLastSaveAt || "");
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
  }, []);

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
    if (!initialLoaded) return;
    saveBoth("bmx_participant_event_year", participantEventYear);
    loadAllRiders();
    loadRaceRiders();
  }, [participantEventYear, initialLoaded]);

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
    saveBoth(getStorageKey("race_closed"), raceClosed);
  }, [raceClosed, selectedRace, canSaveRaceData]);

  useEffect(() => {
    if (!initialLoaded) return;
    saveBoth("bmx_change_log", changeLog);
  }, [changeLog, initialLoaded]);

  const deleteRider = async (id: string) => {
    if (!window.confirm("Teilnehmer wirklich löschen?")) return;
    await db.table("riders").delete(id);
    if (editingRider?.id === id) setEditingRider(null);
    await loadAllRiders();
    await loadRaceRiders();
    addChangeLog("Teilnehmer gelöscht");
  };

  const deleteAllRiders = async () => {
    if (
      !window.confirm(
        "Alle Teilnehmer wirklich löschen? Diese Aktion kann nur mit einem Backup rückgängig gemacht werden.",
      )
    )
      return;
    await exportBackup("Sicherheitsbackup vor Teilnehmer-Löschung");
    await db.table("riders").clear();
    setEditingRider(null);
    setAllRiders([]);
    setRiders([]);
    setHeats({});
    setResults({});
    setFinals({});
    setFinalResults({});
    setOverallManualOrder({});
    setGeneratedOverallByCategory({});
    addChangeLog("Alle Teilnehmer gelöscht");
  };

  const deleteAllRaceAssignments = async () => {
    if (!window.confirm(`${selectedRace}: Race-Zuordnungen wirklich löschen?`))
      return;
    const all = await db.table("riders").toArray();
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

  const getEffectiveHeatCategory = (category: string) => {
    if (!isCruiserCategory(category)) return category;
    if (!cruiserMergeTarget) return category;
    if (!mergeableCruiserTargets.includes(cruiserMergeTarget)) return category;
    return cruiserMergeTarget;
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

  const getFinalCategoryLabel = (finalCategory: string) => {
    const originals = getOriginalCategoriesForFinalRaceCategory(finalCategory);
    if (originals.length <= 1) return finalCategory;
    return `${finalCategory} + ${originals.filter((cat) => cat !== finalCategory).join(" + ")}`;
  };

  useEffect(() => {
    if (!cruiserMergeTarget) return;
    if (!mergeableCruiserTargets.includes(cruiserMergeTarget))
      setCruiserMergeTarget("");
  }, [cruiserMergeTarget, mergeableCruiserTargets]);

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

    if (issues.duplicates.length > 0) {
      return window.confirm(
        [
          "Warnung: Es gibt doppelte Startnummern in derselben Kategorie.",
          "Das Rennen kann trotzdem durchgeführt werden.",
          `\nDoppelte Startnummern pro Kategorie:\n${issues.duplicates.slice(0, 12).join("\n")}`,
          issues.duplicates.length > 12 ? "\nWeitere Einträge vorhanden." : "",
          "\nVorläufe trotzdem erstellen?",
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
            localStorage.getItem(getRaceStorageKey(race, "heats")) || "{}",
          );
    const finalData =
      race === selectedRace
        ? finals
        : JSON.parse(
            localStorage.getItem(getRaceStorageKey(race, "finals")) || "{}",
          );
    const finalResultData =
      race === selectedRace
        ? finalResults
        : JSON.parse(
            localStorage.getItem(getRaceStorageKey(race, "final_results")) ||
              "{}",
          );
    const closed =
      race === selectedRace
        ? raceClosed
        : JSON.parse(
            localStorage.getItem(getRaceStorageKey(race, "race_closed")) ||
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
    if (Object.keys(heatData || {}).length > 0) return "Vorläufe erstellt";
    return "Offen";
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
            if (found) heatsInfo.push({ run: runIndex + 1, heat: heatIndex + 1, startPos: found.startPos || "-", category: cat });
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

  const createHeats = () => {
    if (raceClosed) {
      alert(
        "Dieses Race ist abgeschlossen. Für Änderungen Race zuerst wieder öffnen.",
      );
      return;
    }
    if (!validateSelectedRaceBeforeBuild()) return;
    if (
      Object.keys(heats || {}).length > 0 &&
      !window.confirm(
        "Vorläufe neu erstellen? Bestehende Vorläufe/Resultate werden überschrieben.",
      )
    )
      return;

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
    addChangeLog(`${selectedRace}: Vorläufe erstellt`);
  };

  const resetHeats = async () => {
    if (
      !window.confirm(
        `${selectedRace} wirklich zurücksetzen? Vorläufe, Finals und Resultate dieses Race werden gelöscht.`,
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
    setResults((prev: any) => ({
      ...prev,
      [key]: data,
    }));
  };

  const saveFinalResult = (cat: string, roundName: string, data: any[]) => {
    if (raceClosed) {
      alert(
        "Dieses Race ist abgeschlossen. Resultate können erst nach dem Wiederöffnen geändert werden.",
      );
      return;
    }
    const key = `${cat}_${roundName}`;
    setFinalResults((prev: any) => ({
      ...prev,
      [key]: data,
    }));
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

  const createFinals = () => {
    if (raceClosed) {
      alert(
        "Dieses Race ist abgeschlossen. Für Änderungen Race zuerst wieder öffnen.",
      );
      return;
    }
    if (
      Object.keys(finals || {}).length > 0 &&
      !window.confirm(
        "Finals neu erstellen? Bestehende Finalresultate werden gelöscht.",
      )
    )
      return;
    const all: any = {};

    getFinalRaceCategories().forEach((finalCategory) => {
      const categoryRiders = riders.filter(
        (r: any) => getEffectiveFinalCategory(r.category) === finalCategory,
      );
      const ranking = getCombinedFinalRanking(finalCategory);
      if (ranking.length === 0) return;

      if (categoryRiders.length <= 8) {
        const fourthMoto = ranking.map((r: any, index: number) => ({
          ...r,
          startPos: index + 1,
        }));

        all[finalCategory] = {
          "4. Vorlauf": fourthMoto,
        };
      } else {
        all[finalCategory] = generateFinals(ranking);
      }
    });

    setFinals(all);
    setFinalResults({});
    setFinalManualOrder({});
    addChangeLog(`${selectedRace}: Finals erstellt`);
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
      if (participantQuickFilter === "duplicates")
        return duplicatePlateRiderIds.has(String(r.id || ""));
      if (participantQuickFilter === "cruiser")
        return isCruiserCategory(r.category);
      if (participantQuickFilter === "missing") {
        const issue = getRiderValidationIssues([r]);
        return issue.missing.length > 0;
      }
      return true;
    });
  }, [allRiders, globalSearch, participantQuickFilter, duplicatePlateRiderIds]);

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
      return JSON.parse(localStorage.getItem(getRaceStorageKey(race, "race_closed")) || "false");
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
    const [background, color, borderColor] = String(category || "").toLowerCase().includes("cruiser")
      ? ["#111827", "#ffffff", "#111827"]
      : palette[index];
    return {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "5px 10px",
      fontSize: 12,
      fontWeight: 900,
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

  const basePanelStyle: React.CSSProperties = {
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 16,
    background: colors.cardBg,
    padding: 16,
    boxShadow: "0 8px 24px rgba(31,42,55,0.06)",
  };

  const listBoxStyle: React.CSSProperties = {
    minHeight: BOX_MIN_HEIGHT,
  };

  const mainButtonStyle: React.CSSProperties = {
    background: colors.blueBtn,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 18px",
    minHeight: 46,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 15,
  };

  const secondaryButtonStyle: React.CSSProperties = {
    background: colors.grayBtn,
    color: colors.grayBtnText,
    border: "1px solid #d3dbe3",
    borderRadius: 8,
    padding: "12px 18px",
    minHeight: 46,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 15,
  };

  const homeButtonStyle: React.CSSProperties = {
    background: colors.title,
    color: "#fff",
    border: "2px solid #111827",
    borderRadius: 8,
    padding: "12px 20px",
    minHeight: 46,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 15,
    boxShadow: "0 4px 12px rgba(17,24,39,0.18)",
  };

  const compactHomeButtonStyle: React.CSSProperties = {
    background: colors.grayBtn,
    color: colors.grayBtnText,
    border: "1px solid #d3dbe3",
    borderRadius: 8,
    padding: "7px 8px",
    minHeight: 34,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  const compactPrimaryButtonStyle: React.CSSProperties = {
    background: colors.blueBtn,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "7px 8px",
    minHeight: 34,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
    whiteSpace: "nowrap",
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
    borderRadius: 8,
    padding: "8px 10px",
    minHeight: 38,
    cursor: "not-allowed",
    fontWeight: 800,
    fontSize: 13,
    opacity: 0.75,
    whiteSpace: "nowrap",
  };

  const smallGhostButtonStyle: React.CSSProperties = {
    background: "#fff",
    color: colors.grayBtnText,
    border: "1px solid #d3dbe3",
    borderRadius: 8,
    padding: "6px 8px",
    minHeight: 30,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  const disabledButtonStyle: React.CSSProperties = {
    background: "#d8e0e6",
    color: "#7b8794",
    border: "1px solid #c5ced8",
    borderRadius: 8,
    padding: "12px 18px",
    minHeight: 46,
    cursor: "not-allowed",
    fontWeight: 800,
    fontSize: 15,
    opacity: 0.75,
  };

  const activeRaceButtonStyle: React.CSSProperties = {
    background: colors.blueBtn,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 18px",
    minHeight: 46,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 15,
  };

  const inactiveRaceButtonStyle: React.CSSProperties = {
    background: "#ffffff",
    color: colors.grayBtnText,
    border: "1px solid #d3dbe3",
    borderRadius: 8,
    padding: "12px 18px",
    minHeight: 46,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 15,
  };

  const dangerButtonStyle: React.CSSProperties = {
    background: colors.redBtn,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 18px",
    minHeight: 46,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 15,
  };

  const smallDeleteButtonStyle: React.CSSProperties = {
    background: "#fff1f1",
    color: colors.redBtn,
    border: `1px solid #f2bcbc`,
    borderRadius: 6,
    padding: "5px 8px",
    cursor: "pointer",
    fontWeight: 600,
  };

  const editButtonStyle: React.CSSProperties = {
    background: "#eef4ff",
    color: colors.blueBtn,
    border: "1px solid #bfd2ff",
    borderRadius: 6,
    padding: "5px 8px",
    cursor: "pointer",
    fontWeight: 600,
  };

  const moveButtonStyle: React.CSSProperties = {
    background: "#eef4ff",
    color: colors.blueBtn,
    border: "1px solid #bfd2ff",
    borderRadius: 6,
    padding: "4px 7px",
    cursor: "pointer",
    fontWeight: 700,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #cfd8e3",
    fontSize: 14,
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontWeight: 700,
    color: colors.title,
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
    padding: 10,
    position: "sticky",
    top: 0,
    zIndex: 20,
    marginBottom: 20,
    borderRadius: "0 0 14px 14px",
    boxShadow: "0 8px 18px rgba(31,42,55,0.12)",
  };

  const sideRaceNavigationStyle: React.CSSProperties = {
    position: "fixed",
    right: 12,
    top: 12,
    zIndex: 30,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    width: 92,
  };

  const sideRaceNavigationButtonStyle: React.CSSProperties = {
    background: colors.title,
    color: "#fff",
    border: "1px solid #111827",
    borderRadius: 8,
    padding: "8px 7px",
    minHeight: 36,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 22,
    lineHeight: 1,
    boxShadow: "0 5px 14px rgba(17,24,39,0.20)",
  };

  const sideRaceNavigationSubButtonStyle: React.CSSProperties = {
    background: "#ffffff",
    color: colors.grayBtnText,
    border: "1px solid #cfd8e3",
    borderRadius: 8,
    padding: "7px 6px",
    minHeight: 31,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 11,
    lineHeight: 1.1,
    boxShadow: "0 3px 10px rgba(31,42,55,0.10)",
  };

  const buildRaceSeriesLabel = (race: RaceName = selectedRace) => {
    const base = homeEventSeries.trim();
    return base ? `${base} ${race}` : race;
  };

  const renderAppHeader = () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 18,
      }}
    >
      <div>
        <h1 style={{ color: colors.title, margin: 0, letterSpacing: "-0.02em" }}>
          🏁 {APP_NAME}
        </h1>
        <div style={{ color: colors.muted, fontWeight: 800, marginTop: 4 }}>
          {APP_VERSION}
        </div>
      </div>
    </div>
  );

  const versionFooter = (
    <div
      style={{
        marginTop: 28,
        padding: "12px 14px",
        borderTop: "1px solid #d8e0e6",
        color: colors.muted,
        fontWeight: 800,
        display: "flex",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span>{APP_NAME} {APP_VERSION}</span>
      <span style={{ textAlign: "right" }}>{APP_CHANGE_NOTE}</span>
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
    } else if (roundName === "4. Vorlauf") {
      background = colors.fourthMotoBg;
      border = colors.fourthMotoBorder;
      borderWidth = 3;
      boxShadow = "0 4px 14px rgba(70,185,122,0.15)";
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
      marginBottom: roundName === "A-Final" ? 24 : 15,
      padding: roundName === "A-Final" ? 16 : 12,
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
    roundName === "4. Vorlauf" ? "Wertungsläufe" : roundName;

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
    const parts = [
      sanitizeFilePart(base),
      sanitizeFilePart(buildRaceSeriesLabel()),
      sanitizeFilePart(eventLocation),
      sanitizeFilePart(eventDate),
    ].filter(Boolean);

    return `${parts.join("_") || "pdf"}.pdf`;
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

  const renderStartList = (heat: any[]) => (
    <div style={{ flex: "0 0 44%", ...basePanelStyle }}>
      <strong style={{ color: colors.title }}>Startliste</strong>
      <div style={{ ...listBoxStyle, marginTop: 8 }}>
        {renderRiderTableHeader()}
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
              {renderRiderCells(r)}
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
    const roundOrder = ["A-Final", "B-Final", "C-Final", "4. Vorlauf"];
    const ranking: any[] = [];
    let globalRank = 1;

    roundOrder.forEach((roundName) => {
      const finalCategory = getEffectiveFinalCategory(cat);
      const saved = finalResults[`${finalCategory}_${roundName}`] || [];
      saved.forEach((r: any) => {
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

    doc.setFillColor(245, 248, 252);
    doc.roundedRect(10, 8, pageWidth - 20, 34, 3, 3, "F");

    doc.setFontSize(18);
    doc.setTextColor(31, 42, 55);
    doc.text(title, 14, 18);

    doc.setFontSize(12);
    doc.text(subtitle, 14, 27);

    const logoSize = 30;
    const logoX = pageWidth - 14 - logoSize;
    const logoY = 10;

    if (showEventInfo) {
      const eventInfoWidth = 60;
      const eventInfoX = logoX - eventInfoWidth - 4;

      doc.setFillColor(232, 241, 255);
      doc.roundedRect(eventInfoX, 10, eventInfoWidth, 28, 3, 3, "F");

      doc.setFontSize(9);
      doc.setTextColor(31, 42, 55);
      doc.text(`Ort: ${eventLocation || "-"}`, eventInfoX + 3, 20);
      doc.text(`Datum: ${eventDate || "-"}`, eventInfoX + 3, 29);
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

    doc.setDrawColor(210, 220, 230);
    doc.line(10, 44, pageWidth - 10, 44);
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
      doc.text(
        `Seite ${page} / ${totalPages}`,
        pageWidth - 32,
        pageHeightValue - 7,
      );
    }
  };

  const getPdfSectionColor = (label: string) => {
    if (label === "Heat 1") return [232, 241, 255];
    if (label === "Heat 2") return [233, 248, 239];
    if (label === "Heat 3") return [245, 237, 255];
    if (label === "A-Final") return [255, 233, 168];
    if (label === "B-Final") return [232, 241, 255];
    if (label === "C-Final") return [241, 232, 255];
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
            "Finale/Lauf 4",
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

      const title = "BMX Vorläufe - Startplätze";
      const subtitle = `Vorlauf ${runIndex + 1}`;
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
          const heatLabel = `Heat ${heatIndex + 1}`;
          const sectionColor = getPdfSectionColor(heatLabel);

          currentY = ensurePdfSpace(doc, currentY, 52, title, subtitle, cat);

          autoTable(doc, {
            startY: currentY,
            margin: { left: 14, right: 14 },
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
    doc.save(buildPdfFilename("bmx_vorlaeufe_startplaetze"));
  };

  const exportFinalsStartPdf = () => {
    const doc = new jsPDF("landscape");
    let firstPage = true;

    sortCategories(Object.keys(finals)).forEach((cat) => {
      const rounds = finals[cat];
      if (!rounds) return;

      if (!firstPage) doc.addPage();
      firstPage = false;

      const title = "BMX Finals - Startplätze";
      const subtitle = `Kategorie: ${getFinalCategoryLabel(cat)}`;
      addPdfHeader(doc, title, subtitle);

      let currentY = 52;

      ["4. Vorlauf", "C-Final", "B-Final", "A-Final"].forEach((roundName) => {
        const heat = rounds[roundName];
        if (!heat || !heat.length) return;

        const sectionColor = getPdfSectionColor(roundName);
        currentY = ensurePdfSpace(doc, currentY, 52, title, subtitle, cat);

        autoTable(doc, {
          startY: currentY,
          margin: { left: 14, right: 14 },
          head: [[roundName, "", "", "", ""]],
          body: Array.from({ length: 8 }).map((_, pos) => {
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
              if (data.column.index === 0) data.cell.text = [roundName];
              else if (data.column.index === 1) data.cell.text = ["Name"];
              else if (data.column.index === 2) data.cell.text = ["Plate"];
              else if (data.column.index === 3) data.cell.text = ["Jg | B/G"];
              else if (data.column.index === 4) data.cell.text = ["Club"];
            }
          },
        });

        currentY = (doc as any).lastAutoTable.finalY + 6;
      });
    });

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
    const raw = localStorage.getItem(getRaceStorageKey(race, "final_results"));
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  };

  const loadFinalManualOrderForRace = (race: RaceName) => {
    const raw = localStorage.getItem(
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
      : JSON.parse(localStorage.getItem(getRaceStorageKey(race, "race_closed")) || "false");
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


  const buildRacePointsMap = (race: RaceName) => {
    const parsed = loadFinalResultsForRace(race);
    const savedFinalOrder = loadFinalManualOrderForRace(race);

    const byOriginalCategory: Record<string, any[]> = {};

    Object.keys(parsed).forEach((key) => {
      const value = parsed[key] || [];
      value.forEach((entry: any) => {
        const riderData = allRiders.find(
          (x: any) => String(x.id) === String(entry.riderId),
        );
        const originalCategory = riderData?.category || entry.category || "";
        if (!originalCategory) return;
        if (!byOriginalCategory[originalCategory])
          byOriginalCategory[originalCategory] = [];
        byOriginalCategory[originalCategory].push(entry);
      });
    });

    const pointsMap: Record<string, number | null> = {};

    Object.keys(byOriginalCategory).forEach((category) => {
      const ranking = byOriginalCategory[category];
      const savedOrder = savedFinalOrder[category] || [];
      let orderedRanking = ranking;

      if (savedOrder.length > 0) {
        const map = new Map(
          ranking.map((item: any) => [String(item.riderId), item]),
        );
        const ordered: any[] = [];
        savedOrder.forEach((id: string) => {
          const found = map.get(String(id));
          if (found) {
            ordered.push(found);
            map.delete(String(id));
          }
        });
        map.forEach((value) => ordered.push(value));
        orderedRanking = ordered;
      }

      // Für die Gesamtwertung zählt exakt die gespeicherte Race-Rangliste.
      // Wenn die Rangliste manuell verschoben wurde, darf hier NICHT nochmals sortiert werden,
      // sonst würde die Gesamtwertung wieder von der manuellen Reihenfolge abweichen.
      const raceRankingForOverall = savedOrder.length > 0
        ? orderedRanking
        : sortRaceResultRows(orderedRanking);

      raceRankingForOverall.forEach((r: any, index: number) => {
        const riderId = String(r.riderId);
        const rank = index + 1;
        pointsMap[riderId] = getOverallPointsForRank(rank);
      });
    });

    return pointsMap;
  };

  const calculateOverallByCategory = () => {
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
      if (completedRaceCount >= seriesRaceCount && participated.length < requiredCountingRaces) return;

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

  const createOverallRanking = () => {
    if (overallLocked) {
      window.alert("Die Gesamtwertung ist gesperrt. Bitte zuerst freigeben, bevor sie neu erstellt wird.");
      return;
    }
    const preview = getOverallPreviewRows();
    const summary = preview.map((x) => `${x.race}: ${x.count} Resultate (${x.status})`).join("\n");
    if (!window.confirm(`Gesamtwertung jetzt erstellen/aktualisieren?\n\nSerien-Einstellung: ${seriesRaceCount} Rennen, beste ${overallCountingRaces} zählen.\nTie-Breaker: bessere Streichresultate.\n\n${summary}`)) return;
    const nextOverall = calculateOverallByCategory();
    setGeneratedOverallByCategory(nextOverall);
    setOverallManualOrder({});
    const createdAt = new Date().toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
    setOverallCreatedAt(createdAt);
    setOverallLocked(false);
    addChangeLog(`Gesamtwertung erstellt (${createdAt})`);
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
      warnings.push("Vorläufe wurden noch nicht erstellt.");
    if (Object.keys(finals || {}).length === 0)
      warnings.push("Finals wurden noch nicht erstellt.");

    Object.keys(finals || {}).forEach((cat) => {
      Object.keys(finals[cat] || {}).forEach((roundName) => {
        const startList = finals[cat][roundName] || [];
        const saved = finalResults[`${cat}_${roundName}`] || [];
        if (startList.length > 0 && saved.length !== startList.length) {
          warnings.push(
            `${getFinalCategoryLabel(cat)} ${roundName}: ${saved.length}/${startList.length} Resultate erfasst.`,
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
              `${getFinalCategoryLabel(cat)} ${roundName}: Fahrer doppelt im Resultat.`,
            );
          if (id) ids.add(id);
          if (!status && (!Number.isFinite(rank) || rank <= 0)) {
            warnings.push(`${getFinalCategoryLabel(cat)} ${roundName}: Resultat ohne Rang oder Status.`);
          }
          if (!status && Number.isFinite(rank) && rank > 0) {
            if (ranks.has(rank)) warnings.push(`${getFinalCategoryLabel(cat)} ${roundName}: Rang ${rank} ist doppelt vergeben.`);
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
        `${selectedRace} abschliessen und sperren? Vorläufe, Finals und Resultate sind danach gegen versehentliche Änderungen geschützt.${warningText}`,
      )
    )
      return;
    setRaceClosed(true);
    addChangeLog(`${selectedRace}: abgeschlossen`);
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

  const saveCurrentState = async () => {
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
      setBackupMessage(`Gespeichert: ${formatDateTime(iso)}`);
      addChangeLog(`Lokal gespeichert: ${formatDateTime(iso)}`);
    } catch (error: any) {
      alert(`Speichern fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`);
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
    return `${cleanSeries}-Backup-${date}-${time}.json`;
  };

  const exportBackup = async (reason = "Manuelles Backup") => {
    try {
      const ridersBackup = await db.table("riders").toArray();
      const appDataBackup = await db.table("appData").toArray();

      const backup = {
        app: APP_NAME,
        version: 2,
        exportedAt: new Date().toISOString(),
        reason,
        lastSaveAt,
        riders: ridersBackup,
        appData: appDataBackup,
      };

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
      const backupEntry = { fileName, iso: new Date().toISOString(), riderCount: ridersBackup.length, reason };
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

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (
        !backup ||
        !Array.isArray(backup.riders) ||
        !Array.isArray(backup.appData)
      ) {
        alert(
          "Ungültige Backup-Datei. Bitte eine JSON-Backup-Datei des BMX Race Manager auswählen.",
        );
        event.target.value = "";
        return;
      }

      const invalidAppData = backup.appData.some(
        (row: any) =>
          !row ||
          typeof row.key !== "string" ||
          !Object.prototype.hasOwnProperty.call(row, "value"),
      );
      const invalidRiders = backup.riders.some(
        (rider: any) => !rider || typeof rider.id === "undefined",
      );

      if (invalidAppData || invalidRiders) {
        alert("Die Backup-Datei ist unvollständig oder beschädigt.");
        event.target.value = "";
        return;
      }

      const exportedAt = backup.exportedAt
        ? new Date(backup.exportedAt).toLocaleString("de-CH")
        : "unbekannt";
      const ok = window.confirm(
        `Backup importieren?\n\nDatei: ${file.name}\nErstellt: ${exportedAt}\nTeilnehmer: ${backup.riders.length}\nGespeicherte App-Daten: ${backup.appData.length}\n\nAchtung: Die aktuellen lokalen Daten auf diesem iPad werden überschrieben.`,
      );

      if (!ok) {
        event.target.value = "";
        return;
      }

      await exportBackup("Sicherheitsbackup vor Backup-Import");

      await db.transaction(
        "rw",
        db.table("riders"),
        db.table("appData"),
        async () => {
          await db.table("riders").clear();
          await db.table("appData").clear();
          if (backup.riders.length > 0)
            await db.table("riders").bulkPut(backup.riders);
          if (backup.appData.length > 0)
            await db.table("appData").bulkPut(backup.appData);
        },
      );

      localStorage.clear();
      for (const row of backup.appData) {
        localStorage.setItem(
          row.key,
          typeof row.value === "string" ? row.value : JSON.stringify(row.value),
        );
      }

      alert("Backup erfolgreich importiert. Die App wird jetzt neu geladen.");
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
        borderColor: warningCards.length ? "#f0b429" : colors.cardBorder,
        background: warningCards.length ? colors.warningBg : colors.cardBg,
      }}
    >
      <h2 style={{ marginTop: 0, color: colors.title }}>Warnungen</h2>
      {warningCards.length ? (
        <div style={{ display: "grid", gap: 6 }}>
          {warningCards.map((text) => (
            <div key={text} style={{ color: colors.redBtn, fontWeight: 800, lineHeight: 1.3 }}>
              ⚠ {text}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 18, fontWeight: 900, color: "#176b38" }}>Keine Warnungen</div>
      )}
    </div>
  );

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
            <h2 style={{ margin: 0, color: colors.title }}>Serien-Einstellungen</h2>
            <span style={getStatusBadgeStyle(seriesLocked ? "Abgeschlossen" : "Offen")}>
              {seriesLocked ? "Serie abgeschlossen" : "Serie offen"}
            </span>
          </div>
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
            <div>
              <label style={labelStyle}>Serienvorlage</label>
              <select
                value=""
                disabled={seriesLocked || seriesTemplates.length === 0}
                onChange={(e) => applySeriesTemplate(e.target.value)}
                style={{ ...inputStyle, height: 42, opacity: seriesLocked ? 0.6 : 1 }}
              >
                <option value="">{seriesTemplates.length ? "Vorlage laden..." : "Keine Vorlage gespeichert"}</option>
                {seriesTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <button onClick={saveSeriesTemplate} style={compactHomeButtonStyle}>Vorlage speichern</button>
              <button onClick={toggleSeriesLocked} style={seriesLocked ? compactDangerButtonStyle : compactHomeButtonStyle}>
                {seriesLocked ? "Serie öffnen" : "Serie abschliessen"}
              </button>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: colors.muted, fontWeight: 800, lineHeight: 1.35 }}>
            {getSeriesRulesText()} · Für die Gesamtwertung zählen nur abgeschlossene Rennen.
            <br />Streichresultate erscheinen in Klammern / durchgestrichen und entscheiden bei Punktegleichheit.
          </div>
          {seriesTemplates.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {seriesTemplates.slice(0, 5).map((template) => (
                <button key={`delete-template-${template.id}`} onClick={() => deleteSeriesTemplate(template.id)} style={smallGhostButtonStyle}>
                  Vorlage löschen: {template.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, marginBottom: 12, color: colors.title }}>Race-Status</h2>
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 8,
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
                style={{
                  ...compactHomeButtonStyle,
                  flex: "0 0 156px",
                  minHeight: 64,
                  textAlign: "left",
                  display: "grid",
                  alignContent: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 900 }}>{race}</span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={getStatusBadgeStyle(getRaceStatus(race))}>{getRaceStatus(race)}</span>
                  <span style={{ color: colors.muted, fontSize: 12, fontWeight: 900 }}>
                    TN: {getRaceParticipantCount(race)}
                  </span>
                </span>
              </button>
            ))}
            <button
              onClick={() => setViewMode("overall")}
              style={{ ...compactHomeButtonStyle, marginLeft: "auto", flex: "0 0 128px", minHeight: 64, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              Gesamtwertung
            </button>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, marginBottom: 12, color: colors.title }}>Teilnehmer</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <button
              onClick={() => setViewMode("participants")}
              style={{ ...compactHomeButtonStyle, flex: "0 0 180px", minHeight: 54, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              Teilnehmer erfassen
            </button>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>Datenstatus</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div><strong>Letzte Änderung</strong><br />{changeLog[0] || "Noch keine Änderung"}</div>
            <div><strong>Letzte Speicherung</strong><br />{formatDateTime(lastSaveAt)}</div>
            <div><strong>Letztes Backup</strong><br />{getLastBackup() ? `${formatDateTime(getLastBackup().iso)} · ${getLastBackup().fileName}` : "Noch kein Backup"}</div>
            <div style={{ gridColumn: "1 / -1", color: backupWarningActive ? colors.redBtn : colors.muted, fontWeight: 800 }}>
              {backupWarningActive ? (backupAgeMinutes === null ? "Warnung: Noch kein Backup erstellt." : `Warnung: Seit ${backupAgeMinutes} Minuten kein Backup erstellt.`) : "Backup aktuell"}
            </div>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>Import / Export</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button onClick={downloadExcelTemplate} style={compactHomeButtonStyle}>
              Excel-Vorlage herunterladen
            </button>
            <button onClick={saveCurrentState} style={compactSaveButtonStyle}>
              Speichern
            </button>
            <button onClick={() => exportBackup("Manuelles Backup")} style={compactPrimaryButtonStyle}>
              Backup erstellen
            </button>
            <label style={{ ...compactHomeButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              Backup importieren
              <input
                type="file"
                accept="application/json,.json"
                onChange={importBackup}
                style={{ display: "none" }}
              />
            </label>
          </div>
          {backupMessage && (
            <div style={{ marginTop: 10, color: colors.muted }}>
              {backupMessage}
            </div>
          )}
          {backupHistory.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid #eef2f6", paddingTop: 12 }}>
              <strong>Backup-Historie</strong>
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {backupHistory.slice(0, 5).map((entry: any, index: number) => (
                  <div key={`${entry.fileName}-${index}`} style={{ color: colors.muted }}>
                    {formatDateTime(entry.iso)} · {entry.fileName}{entry.reason ? ` · ${entry.reason}` : ""} · {entry.riderCount ?? "?"} Teilnehmer
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {warningsPanel}

        <div style={{ ...basePanelStyle }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>
            Änderungsprotokoll
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {getChangeLogFilterOptions().map((option) => (
              <button
                key={option}
                onClick={() => setChangeLogFilter(option)}
                style={changeLogFilter === option ? activeRaceButtonStyle : secondaryButtonStyle}
              >
                {option}
              </button>
            ))}
          </div>
          {filteredChangeLog.length === 0 ? (
            <div style={{ color: colors.muted }}>
              Noch keine protokollierten Aktionen.
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflow: "auto", borderTop: "1px solid #eef2f6" }}>
              {filteredChangeLog.slice(0, 50).map((entry, index) => (
                <div
                  key={`${entry}-${index}`}
                  style={{ padding: "8px 0", borderBottom: "1px solid #eef2f6" }}
                >
                  {entry}
                </div>
              ))}
            </div>
          )}
          {versionFooter}
        </div>
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

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "nowrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setViewMode("dashboard")}
              style={secondaryButtonStyle}
            >
              Home
            </button>
            <button style={activeRaceButtonStyle}>Gesamtwertung</button>
            <button onClick={createOverallRanking} disabled={overallLocked} style={overallLocked ? disabledButtonStyle : mainButtonStyle}>
              Gesamtwertung erstellen
            </button>
            <button onClick={toggleOverallLocked} style={overallLocked ? dangerButtonStyle : secondaryButtonStyle}>
              {overallLocked ? "Gesamtwertung freigeben" : "Gesamtwertung sperren"}
            </button>
            <button onClick={exportOverallPdf} style={mainButtonStyle}>
              Gesamtwertung PDF
            </button>
            <button onClick={exportOverallExcel} style={secondaryButtonStyle}>
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
            <button onClick={() => setViewMode("overall")} style={{ ...compactHomeButtonStyle, minHeight: 52, padding: "10px 14px" }}>
              Gesamtwertung
            </button>
          </div>
        </div>

        {warningsPanel}

        <div ref={participantFormRef} style={{ ...basePanelStyle, marginBottom: 20 }}>
          <div style={{ maxWidth: 240, marginBottom: 14 }}>
            <label style={labelStyle}>Rennjahr für Kategorien</label>
            <input
              type="number"
              min="2000"
              max="2100"
              value={participantEventYear}
              onChange={(e) => setParticipantEventYear(e.target.value)}
              style={inputStyle}
            />
          </div>
          <RiderForm
            onChange={async () => {
              const savedRiderId = editingRider?.id ? String(editingRider.id) : "";
              setEditingRider(null);
              await loadAllRiders();
              await loadRaceRiders();
              if (savedRiderId) {
                window.setTimeout(() => {
                  participantRowRefs.current[savedRiderId]?.scrollIntoView({
                    behavior: "auto",
                    block: "center",
                  });
                }, 120);
              }
            }}
            editingRider={editingRider}
            onCancelEdit={() => setEditingRider(null)}
            existingCategories={sortCategories(Object.keys(groupedAll))}
            eventYear={participantEventYear}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <button onClick={deleteAllRiders} style={dangerButtonStyle}>
            Alle Teilnehmer löschen
          </button>
        </div>

        <div style={{ ...basePanelStyle }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>
            Teilnehmer gesamt ({allRiders.length})
          </h2>

          <div style={{ marginBottom: 10, color: colors.muted }}>
            Häkchen setzen, bei welchen Rennen der Fahrer startet. Kategorien
            werden automatisch aus Rennjahr, Jahrgang und Geschlecht berechnet.
            Cruiser wird separat gewertet.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr repeat(4, auto)",
              gap: 10,
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Fahrer suchen: Name, Startnummer, Verein, Kategorie ..."
              style={inputStyle}
            />
            {[
              ["all", "Alle"],
              ["missing", "Fehlende Angaben"],
              ["duplicates", "Doppelte Nummern"],
              ["cruiser", "Cruiser"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setParticipantQuickFilter(key as any)}
                style={
                  participantQuickFilter === key
                    ? activeRaceButtonStyle
                    : secondaryButtonStyle
                }
              >
                {label}
              </button>
            ))}
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
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            {activeRaces.map((race) => (
              <button
                key={race}
                onClick={() => selectAllForRace(race)}
                style={secondaryButtonStyle}
              >
                {race}:{" "}
                {areAllSelectedForRace(race)
                  ? "alle abwählen"
                  : "alle auswählen"}
              </button>
            ))}
          </div>

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
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                {activeRaces.map((race) => (
                  <button
                    key={`${cat}-${race}`}
                    onClick={() => selectAllForRace(race, cat)}
                    style={secondaryButtonStyle}
                  >
                    {race}: Kategorie{" "}
                    {areAllSelectedForRace(race, cat)
                      ? "abwählen"
                      : "auswählen"}
                  </button>
                ))}
              </div>

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
                  <div style={{ width: 170 }} />
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
                        width: 170,
                        textAlign: "right",
                        display: "flex",
                        gap: 6,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => setEditingRider(r)}
                        style={editButtonStyle}
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => deleteRider(r.id)}
                        style={smallDeleteButtonStyle}
                      >
                        Teilnehmer löschen
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

        <div style={stickyButtonBarStyle}>
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "nowrap",
              alignItems: "center",
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            <button
              onClick={() => setViewMode("dashboard")}
              style={compactHomeHighlightButtonStyle}
            >
              Home
            </button>
            <button
              onClick={createHeats}
              disabled={heatsCreated || raceClosed}
              style={
                heatsCreated || raceClosed
                  ? compactDisabledButtonStyle
                  : compactPrimaryButtonStyle
              }
              title={
                heatsCreated
                  ? "Vorläufe sind bereits erstellt. Für Änderungen zuerst Reset klicken."
                  : undefined
              }
            >
              Vorläufe erstellen
            </button>
            <button onClick={exportHeatsStartPdf} style={compactHomeButtonStyle}>
              Vorläufe PDF
            </button>
            <button
              onClick={createFinals}
              disabled={!heatsCreated || finalsCreated || raceClosed}
              style={
                !heatsCreated || finalsCreated || raceClosed
                  ? compactDisabledButtonStyle
                  : compactPrimaryButtonStyle
              }
              title={
                !heatsCreated
                  ? "Zuerst Vorläufe erstellen."
                  : finalsCreated
                    ? "Finals sind bereits erstellt. Für Änderungen zuerst Reset klicken."
                    : undefined
              }
            >
              Finals erstellen
            </button>
            <button onClick={exportFinalsStartPdf} style={compactHomeButtonStyle}>
              Finals PDF
            </button>
            <button
              onClick={toggleRaceClosed}
              style={raceClosed ? compactDangerButtonStyle : compactHomeButtonStyle}
            >
              {raceClosed ? "Race wieder öffnen" : "Race abschliessen"}
            </button>
            <button onClick={exportFinalsPdf} style={compactPrimaryButtonStyle}>
              Resultate PDF
            </button>
            <button onClick={saveCurrentState} style={compactSaveButtonStyle}>
              Speichern
            </button>
            <button
              onClick={resetHeats}
              disabled={raceClosed}
              style={raceClosed ? compactDisabledButtonStyle : compactDangerButtonStyle}
            >
              Reset
            </button>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <h2 style={{ margin: 0, color: colors.title }}>
              Renninformationen – {selectedRace}
            </h2>
            <span style={getStatusBadgeStyle(getRaceStatus(selectedRace))}>
              Status: {getRaceStatus(selectedRace)}
            </span>
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
                Vorlauf 1
              </button>
              <button
                onClick={() => scrollToSection("vorlauf-2")}
                style={sideRaceNavigationSubButtonStyle}
              >
                Vorlauf 2
              </button>
              <button
                onClick={() => scrollToSection("vorlauf-3")}
                style={sideRaceNavigationSubButtonStyle}
              >
                Vorlauf 3
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

                  {isCruiserCategory(cat) &&
                    mergeableCruiserTargets.length > 0 && (
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
                          value={cruiserMergeTarget}
                          disabled={heatsCreated}
                          onChange={(e) =>
                            setCruiserMergeTarget(e.target.value)
                          }
                          style={{
                            ...inputStyle,
                            width: 220,
                            opacity: heatsCreated ? 0.65 : 1,
                          }}
                          title={
                            heatsCreated
                              ? "Für Änderungen zuerst Reset klicken."
                              : undefined
                          }
                        >
                          <option value="">Cruiser separat</option>
                          {mergeableCruiserTargets.map((target) => (
                            <option key={target} value={target}>
                              {target}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                </div>

                {isCruiserCategory(cat) && cruiserMergeTarget && (
                  <div
                    style={{
                      marginBottom: 8,
                      color: colors.muted,
                      fontWeight: 700,
                    }}
                  >
                    Cruiser fahren in den Vorläufen und Finals zusammen mit{" "}
                    {cruiserMergeTarget}. Rangliste und Gesamtwertung bleiben
                    getrennt unter Cruiser.
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
            <h2 style={{ color: colors.title }}>🏁 Vorläufe</h2>

            {[0, 1, 2].map((runIndex) => (
              <div
                id={`vorlauf-${runIndex + 1}`}
                key={runIndex}
                style={{ marginBottom: 30, scrollMarginTop: 120 }}
              >
                <h3 style={{ color: colors.title }}>Vorlauf {runIndex + 1}</h3>

                {sortCategories(Object.keys(heats)).map((cat) => (
                  <div key={cat} style={{ marginBottom: 20 }}>
                    <h4 style={{ color: colors.title }}>{cat}</h4>

                    {heats[cat][runIndex].map(
                      (group: any[], heatIndex: number) => {
                        const key = `${cat}_${runIndex}_${heatIndex}`;
                        const result = results[key] || [];

                        return (
                          <div
                            key={key}
                            style={getRaceCardStyle(result.length > 0)}
                          >
                            <strong style={{ color: colors.title }}>
                              Heat {heatIndex + 1}
                            </strong>

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

                            <div style={{ marginTop: 16 }}>
                              <HeatInput
                                heat={group}
                                value={result}
                                onSave={(data: any[]) =>
                                  saveHeatResult(cat, runIndex, heatIndex, data)
                                }
                              />
                            </div>
                          </div>
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

            {sortCategories(Object.keys(finals)).map((cat) => (
              <div key={cat} style={{ marginBottom: 30 }}>
                <h3 style={{ color: colors.title }}>
                  {getFinalCategoryLabel(cat)}
                </h3>

                {["4. Vorlauf", "C-Final", "B-Final", "A-Final"].map(
                  (roundName) => {
                    const heat = finals[cat]?.[roundName];
                    if (!heat || heat.length === 0) return null;

                    const key = `${cat}_${roundName}`;
                    const result = finalResults[key] || [];

                    return (
                      <div
                        key={key}
                        style={getFinalCardStyle(roundName, result.length > 0)}
                      >
                        <strong
                          style={{
                            color: colors.title,
                            fontSize: roundName === "A-Final" ? 22 : 18,
                          }}
                        >
                          {roundName}
                        </strong>

                        <div
                          style={{ display: "flex", gap: 20, marginTop: 10 }}
                        >
                          {renderStartList(heat)}
                          {renderSavedResult(result)}
                        </div>

                        <div style={{ marginTop: 16 }}>
                          <HeatInput
                            heat={heat}
                            value={result}
                            onSave={(data: any[]) =>
                              saveFinalResult(cat, roundName, data)
                            }
                          />
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            ))}
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
                    Vorläufe
                  </h3>
                  {selectedRiderInfo.heatsInfo.length === 0 ? (
                    <div style={{ color: colors.muted }}>
                      Noch keine Vorläufe erstellt.
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
                        <strong>Vorlauf {item.run}</strong>
                        <br />
                        Heat {item.heat}, Startposition {item.startPos}
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
                        <strong>{item.roundName}</strong>
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
                        <span style={{ color: colors.muted }}>{info.heatsInfo.length} Vorlauf-Einträge · {info.finalsInfo.length} Final-Einträge</span><br />
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
