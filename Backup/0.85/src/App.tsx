import React, { useEffect, useMemo, useState } from "react";
import { db } from "./db";
import RiderForm from "./components/RiderForm";
import { generateCategoryHeats, generateFinals } from "./race";
import HeatInput from "./components/HeatInput";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ROW_HEIGHT = 30;
const BOX_MIN_HEIGHT = 8 * ROW_HEIGHT + 34;
const RACES = ["Race 1", "Race 2", "Race 3", "Race 4"] as const;
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

export default function App() {
  const [selectedRace, setSelectedRace] = useState<RaceName>("Race 1");
  const [viewMode, setViewMode] = useState<"participants" | "race" | "overall">(
    "participants",
  );

  const [allRiders, setAllRiders] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [heats, setHeats] = useState<any>({});
  const [results, setResults] = useState<any>({});
  const [finals, setFinals] = useState<any>({});
  const [finalResults, setFinalResults] = useState<any>({});

  const [editingRider, setEditingRider] = useState<any | null>(null);
  const [overallManualOrder, setOverallManualOrder] = useState<
    Record<string, string[]>
  >({});
  const [finalManualOrder, setFinalManualOrder] = useState<
    Record<string, string[]>
  >({});
  const [cruiserMergeTarget, setCruiserMergeTarget] = useState<string>("");
  const [participantEventYear, setParticipantEventYear] = useState<string>(
    String(new Date().getFullYear()),
  );
  const [participantsUnlocked, setParticipantsUnlocked] = useState(false);
  const [participantPassword, setParticipantPassword] = useState("");
  const [participantPasswordError, setParticipantPasswordError] = useState("");

  const [eventSeries, setEventSeries] = useState("");
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
  };

  const raceKeyMap: Record<RaceName, "race1" | "race2" | "race3" | "race4"> = {
    "Race 1": "race1",
    "Race 2": "race2",
    "Race 3": "race3",
    "Race 4": "race4",
  };

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
      const categoryDiff =
        getCategorySortValue(a.category) - getCategorySortValue(b.category);
      if (categoryDiff !== 0) return categoryDiff;
      const categoryNameDiff = String(a.category).localeCompare(
        String(b.category),
        "de-CH",
        { numeric: true },
      );
      if (categoryNameDiff !== 0) return categoryNameDiff;
      return String(a.name).localeCompare(String(b.name), "de-CH", {
        numeric: true,
      });
    });

  const scrollToSection = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      setOverallManualOrder(savedOverallOrder || {});
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
      const nextEventLogo = await loadAppData<string>(
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

      if (cancelled) return;

      setEventSeries(nextEventSeries || "");
      setEventLocation(nextEventLocation || "");
      setEventDate(nextEventDate || "");
      setEventLogo(nextEventLogo || "");
      setHeats(nextHeats || {});
      setResults(nextResults || {});
      setFinals(nextFinals || {});
      setFinalResults(nextFinalResults || {});
      setFinalManualOrder(nextFinalManualOrder || {});
      setCruiserMergeTarget(nextCruiserMergeTarget || "");
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
    if (!canSaveRaceData) return;
    saveBoth(getStorageKey("event_logo"), eventLogo);
  }, [eventLogo, selectedRace, canSaveRaceData]);

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

  const deleteRider = async (id: string) => {
    await db.table("riders").delete(id);
    if (editingRider?.id === id) setEditingRider(null);
    await loadAllRiders();
    await loadRaceRiders();
  };

  const deleteAllRiders = async () => {
    await db.table("riders").clear();
    setEditingRider(null);
    setAllRiders([]);
    setRiders([]);
    setHeats({});
    setResults({});
    setFinals({});
    setFinalResults({});
    setOverallManualOrder({});
  };

  const deleteAllRaceAssignments = async () => {
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

  const createHeats = () => {
    const heatRiders = riders.map((r: any) => ({
      ...r,
      originalCategory: r.category,
      category: getEffectiveHeatCategory(r.category),
    }));

    const newHeats = generateCategoryHeats(heatRiders);
    setHeats(newHeats);
    setResults({});
    setFinals({});
    setFinalResults({});
    setFinalManualOrder({});
  };

  const resetHeats = () => {
    setHeats({});
    setResults({});
    setFinals({});
    setFinalResults({});
  };

  const saveHeatResult = (
    cat: string,
    run: number,
    heatIndex: number,
    data: any[],
  ) => {
    const key = `${cat}_${run}_${heatIndex}`;
    setResults((prev: any) => ({
      ...prev,
      [key]: data,
    }));
  };

  const saveFinalResult = (cat: string, roundName: string, data: any[]) => {
    const key = `${cat}_${roundName}`;
    setFinalResults((prev: any) => ({
      ...prev,
      [key]: data,
    }));
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

        scores[r.riderId].total += r.points;
        scores[r.riderId].runs[run] = r.rank;
      });
    });

    return Object.values(scores).sort((a: any, b: any) => {
      if (a.total !== b.total) return a.total - b.total;
      if ((a.runs[2] || 99) !== (b.runs[2] || 99))
        return (a.runs[2] || 99) - (b.runs[2] || 99);
      return (a.runs[1] || 99) - (b.runs[1] || 99);
    });
  };

  const createFinals = () => {
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
  };

  const groupedAll = useMemo(() => {
    return allRiders.reduce((acc: any, r: any) => {
      if (!acc[r.category]) acc[r.category] = [];
      acc[r.category].push(r);
      return acc;
    }, {});
  }, [allRiders]);

  const groupedRace = useMemo(() => {
    return riders.reduce((acc: any, r: any) => {
      if (!acc[r.category]) acc[r.category] = [];
      acc[r.category].push(r);
      return acc;
    }, {});
  }, [riders]);

  const basePanelStyle: React.CSSProperties = {
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 10,
    background: colors.cardBg,
    padding: 10,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  };

  const listBoxStyle: React.CSSProperties = {
    minHeight: BOX_MIN_HEIGHT,
  };

  const mainButtonStyle: React.CSSProperties = {
    background: colors.blueBtn,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  };

  const secondaryButtonStyle: React.CSSProperties = {
    background: colors.grayBtn,
    color: colors.grayBtnText,
    border: "1px solid #d3dbe3",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  };

  const disabledButtonStyle: React.CSSProperties = {
    background: "#d8e0e6",
    color: "#7b8794",
    border: "1px solid #c5ced8",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: "not-allowed",
    fontWeight: 700,
    opacity: 0.75,
  };

  const activeRaceButtonStyle: React.CSSProperties = {
    background: colors.blueBtn,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  };

  const inactiveRaceButtonStyle: React.CSSProperties = {
    background: "#ffffff",
    color: colors.grayBtnText,
    border: "1px solid #d3dbe3",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  };

  const dangerButtonStyle: React.CSSProperties = {
    background: colors.redBtn,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
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
    position: "sticky",
    top: 0,
    zIndex: 20,
    marginBottom: 20,
  };

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
      sanitizeFilePart(eventSeries),
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
    <div style={{ width: "40%", ...basePanelStyle }}>
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
    <div style={{ width: "60%", ...basePanelStyle }}>
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
        ))}
      </div>
    </div>
  );

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
          finalRun: r.rank,
        });
        globalRank += 1;
      });
    });

    if (!useManualOrder) return ranking;

    const saved = finalManualOrder[cat] || [];
    if (saved.length === 0) return ranking;

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
  };

  const addPdfHeader = (doc: jsPDF, title: string, subtitle: string) => {
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(245, 248, 252);
    doc.roundedRect(10, 8, pageWidth - 20, 34, 3, 3, "F");

    doc.setFontSize(18);
    doc.setTextColor(31, 42, 55);
    doc.text(title, 14, 18);

    doc.setFontSize(12);
    doc.text(subtitle, 14, 27);

    doc.setFillColor(232, 241, 255);
    doc.roundedRect(pageWidth - 88, 10, 60, 28, 3, 3, "F");

    doc.setFontSize(9);
    doc.setTextColor(31, 42, 55);
    doc.text(`Serie: ${eventSeries || "-"}`, pageWidth - 85, 17);
    doc.text(`Ort: ${eventLocation || "-"}`, pageWidth - 85, 24);
    doc.text(`Datum: ${eventDate || "-"}`, pageWidth - 85, 31);

    if (eventLogo) {
      try {
        doc.addImage(eventLogo, "PNG", pageWidth - 24, 10, 14, 14);
      } catch {
        try {
          doc.addImage(eventLogo, "JPEG", pageWidth - 24, 10, 14, 14);
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

      addPdfHeader(doc, "BMX Finalresultate", `Kategorie: ${cat}`);

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
        styles: { fontSize: 9, cellPadding: 2.5 },
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

          currentY = ensurePdfSpace(doc, currentY, 78, title, subtitle, cat);

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
            styles: { fontSize: 9, cellPadding: 2.5 },
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

          currentY = (doc as any).lastAutoTable.finalY + 10;
        });

        currentY += 4;
      });
    });

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
        currentY = ensurePdfSpace(doc, currentY, 78, title, subtitle, cat);

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
          styles: { fontSize: 9, cellPadding: 2.5 },
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

        currentY = (doc as any).lastAutoTable.finalY + 12;
      });
    });

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

    for (const rider of items) {
      await db.table("riders").update(rider.id, { [flag]: nextValue });
    }
    await loadAllRiders();
    await loadRaceRiders();
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

  const raceHasFinalResults = (race: RaceName) => {
    const parsed = loadFinalResultsForRace(race);
    return Object.values(parsed).some(
      (value: any) => Array.isArray(value) && value.length > 0,
    );
  };

  const buildRacePointsMap = (race: RaceName) => {
    const parsed = loadFinalResultsForRace(race);

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

    const pointsMap: Record<string, number> = {};

    Object.keys(byOriginalCategory).forEach((category) => {
      const ranking = byOriginalCategory[category];
      ranking.forEach((r: any, index: number) => {
        const riderId = String(r.riderId);
        const rank = index + 1;
        pointsMap[riderId] = getOverallPointsForRank(rank);
      });
    });

    return pointsMap;
  };

  const overallByCategory = useMemo(() => {
    const race1Map = buildRacePointsMap("Race 1");
    const race2Map = buildRacePointsMap("Race 2");
    const race3Map = buildRacePointsMap("Race 3");
    const race4Map = buildRacePointsMap("Race 4");
    const completedRaceCount = RACES.filter((race) =>
      raceHasFinalResults(race),
    ).length;

    const grouped: Record<string, any[]> = {};

    allRiders.forEach((r: any) => {
      const riderId = String(r.id);
      const racePoints = [
        race1Map[riderId] ?? null,
        race2Map[riderId] ?? null,
        race3Map[riderId] ?? null,
        race4Map[riderId] ?? null,
      ];

      const participated = racePoints.filter((x) => x !== null) as number[];
      if (participated.length === 0) return;
      if (completedRaceCount >= 4 && participated.length < 3) return;

      const scoredEntries = racePoints
        .map((points, index) => ({
          raceIndex: index + 1,
          points: points ?? -999,
        }))
        .filter((x) => x.points >= 0);

      const sortedBest = [...scoredEntries].sort(
        (a, b) => b.points - a.points || a.raceIndex - b.raceIndex,
      );
      const bestThree = sortedBest.slice(0, 3);
      const total = bestThree.reduce((sum, x) => sum + x.points, 0);

      const dropResult = sortedBest.length >= 4 ? sortedBest[3].points : -1;
      const lastRacePlayed =
        [...scoredEntries].sort((a, b) => b.raceIndex - a.raceIndex)[0]
          ?.points ?? -1;

      const item = {
        riderId,
        name: r.name,
        plate: r.plate,
        club: r.club || "",
        birthYear: getRiderBirthYear(r) || "",
        gender: getRiderGenderCode(r) || "",
        category: r.category,
        race1: racePoints[0],
        race2: racePoints[1],
        race3: racePoints[2],
        race4: racePoints[3],
        raceCount: participated.length,
        total,
        dropResult,
        lastRacePlayed,
      };

      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(item);
    });

    Object.keys(grouped).forEach((category) => {
      grouped[category].sort((a, b) => {
        if (a.total !== b.total) return b.total - a.total;
        if (a.dropResult !== b.dropResult) return b.dropResult - a.dropResult;
        if (a.lastRacePlayed !== b.lastRacePlayed)
          return b.lastRacePlayed - a.lastRacePlayed;
        return String(a.name).localeCompare(String(b.name));
      });
    });

    return grouped;
  }, [allRiders, finalResults, selectedRace, participantEventYear]);

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
  };

  const buildBackupFileName = () => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
    const cleanSeries = (eventSeries || "BMX-Race")
      .replace(/[^a-z0-9äöüÄÖÜ_-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return `${cleanSeries}-Backup-${date}-${time}.json`;
  };

  const exportBackup = async () => {
    try {
      const ridersBackup = await db.table("riders").toArray();
      const appDataBackup = await db.table("appData").toArray();

      const backup = {
        app: "BMX Racing Software",
        version: 2,
        exportedAt: new Date().toISOString(),
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
      setBackupMessage(`Backup erstellt: ${fileName}`);
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
          "Ungültige Backup-Datei. Bitte eine JSON-Backup-Datei der BMX Racing Software auswählen.",
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
        "BMX Bernercup Gesamtwertung 2026",
        `Kategorie: ${category}`,
      );

      autoTable(doc, {
        startY: 52,
        head: [
          [
            "Rang",
            "Name",
            "Plate",
            "Jg | B/G",
            "Club",
            "R1",
            "R2",
            "R3",
            "R4",
            "Gesamt",
          ],
        ],
        body: items.map((r: any, index: number) => [
          index + 1,
          `${r.name}${r.raceCount < 3 ? " *" : ""}`,
          r.plate,
          getRiderMetaLabel(r),
          r.club || "",
          r.race1 ?? "-",
          r.race2 ?? "-",
          r.race3 ?? "-",
          r.race4 ?? "-",
          r.total,
        ]),
        styles: {
          fontSize: 10,
          cellPadding: 3,
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

      if (items.some((r: any) => r.raceCount < 3)) {
        const y = Math.min(
          ((doc as any).lastAutoTable?.finalY || 52) + 10,
          195,
        );
        doc.setFontSize(9);
        doc.text("*= noch keine 3 Rennen gefahren", 14, y);
      }
    });

    doc.save(buildPdfFilename("bmx_gesamtwertung"));
  };

  if (viewMode === "overall") {
    return (
      <div
        style={{
          padding: 20,
          fontFamily: "Arial, sans-serif",
          background: colors.pageBg,
          minHeight: "100vh",
          color: colors.text,
        }}
      >
        <h1 style={{ color: colors.title, marginTop: 0 }}>
          🚴 BMX Racing Software
        </h1>

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
              onClick={() => setViewMode("participants")}
              style={secondaryButtonStyle}
            >
              Teilnehmer
            </button>
            {RACES.map((race) => (
              <button
                key={race}
                onClick={() => {
                  setSelectedRace(race);
                  setViewMode("race");
                }}
                style={inactiveRaceButtonStyle}
              >
                {race}
              </button>
            ))}
            <button style={activeRaceButtonStyle}>Gesamtwertung</button>
            <button onClick={exportOverallPdf} style={mainButtonStyle}>
              Gesamtwertung PDF
            </button>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>Gesamtwertung</h2>
          <div style={{ color: colors.muted }}>
            Gewertet werden die besten 3 von 4 Rennen. Bei Punktegleichheit
            zählt zuerst das Streichresultat, sonst das bessere letzte Rennen.
          </div>
        </div>

        {Object.keys(overallByCategory).length === 0 && (
          <div style={basePanelStyle}>Noch keine Gesamtwertung verfügbar.</div>
        )}

        {sortCategories(Object.keys(overallByCategory)).map((category) => {
          const items = applyManualOrder(category, overallByCategory[category]);

          return (
            <div key={category} style={{ ...basePanelStyle, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, color: colors.title }}>{category}</h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "60px 1.4fr 90px 95px 1.2fr 70px 70px 70px 70px 90px 80px",
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
                <div>R1</div>
                <div>R2</div>
                <div>R3</div>
                <div>R4</div>
                <div>Gesamt</div>
                <div />
              </div>

              {items.map((r: any, index: number) => (
                <div
                  key={r.riderId}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "60px 1.4fr 90px 95px 1.2fr 70px 70px 70px 70px 90px 80px",
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
                    {r.raceCount < 3 ? " *" : ""}
                  </div>
                  <div>#{r.plate}</div>
                  <div>{getRiderMetaLabel(r)}</div>
                  <div>{r.club || "-"}</div>
                  <div>{r.race1 ?? "-"}</div>
                  <div>{r.race2 ?? "-"}</div>
                  <div>{r.race3 ?? "-"}</div>
                  <div>{r.race4 ?? "-"}</div>
                  <div style={{ fontWeight: 700 }}>{r.total}</div>
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={() => moveOverall(category, index, -1)}
                      style={moveButtonStyle}
                    >
                      ⬆
                    </button>
                    <button
                      onClick={() => moveOverall(category, index, 1)}
                      style={moveButtonStyle}
                    >
                      ⬇
                    </button>
                  </div>
                </div>
              ))}

              {items.some((r: any) => r.raceCount < 3) && (
                <div
                  style={{ marginTop: 12, color: colors.muted, fontSize: 13 }}
                >
                  *= noch keine 3 Rennen gefahren
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const unlockParticipants = (event: React.FormEvent) => {
    event.preventDefault();

    if (participantPassword === "19021986") {
      setParticipantsUnlocked(true);
      setParticipantPassword("");
      setParticipantPasswordError("");
      return;
    }

    setParticipantPasswordError("Falsches Passwort.");
  };

  if (viewMode === "participants") {
    return (
      <div
        style={{
          padding: 20,
          fontFamily: "Arial, sans-serif",
          background: colors.pageBg,
          minHeight: "100vh",
          color: colors.text,
        }}
      >
        <h1 style={{ color: colors.title, marginTop: 0 }}>
          🚴 BMX Racing Software
        </h1>

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button style={activeRaceButtonStyle}>Teilnehmer</button>
            {RACES.map((race) => (
              <button
                key={race}
                onClick={() => {
                  setSelectedRace(race);
                  setViewMode("race");
                }}
                style={inactiveRaceButtonStyle}
              >
                {race}
              </button>
            ))}
            <button
              onClick={() => setViewMode("overall")}
              style={secondaryButtonStyle}
            >
              Gesamtwertung
            </button>
            <button onClick={exportBackup} style={mainButtonStyle}>
              Backup exportieren
            </button>
            <label style={{ ...secondaryButtonStyle, display: "inline-block" }}>
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
            <div style={{ marginTop: 10, color: colors.muted, fontSize: 14 }}>
              {backupMessage}
            </div>
          )}
        </div>

        {!participantsUnlocked ? (
          <form
            onSubmit={unlockParticipants}
            style={{ ...basePanelStyle, maxWidth: 420, marginBottom: 20 }}
          >
            <h2 style={{ marginTop: 0, color: colors.title }}>
              Teilnehmer erfassen geschützt
            </h2>
            <p style={{ color: colors.muted, marginTop: 0 }}>
              Bitte Passwort eingeben, um Teilnehmer zu erfassen oder zu bearbeiten.
            </p>
            <label style={labelStyle}>Passwort</label>
            <input
              type="password"
              value={participantPassword}
              onChange={(e) => {
                setParticipantPassword(e.target.value);
                setParticipantPasswordError("");
              }}
              style={inputStyle}
              autoFocus
            />
            {participantPasswordError && (
              <div style={{ marginTop: 8, color: colors.redBtn, fontWeight: 700 }}>
                {participantPasswordError}
              </div>
            )}
            <button type="submit" style={{ ...mainButtonStyle, marginTop: 14 }}>
              Entsperren
            </button>
          </form>
        ) : (
          <>
        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
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
              setEditingRider(null);
              await loadAllRiders();
              await loadRaceRiders();
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
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            {RACES.map((race) => (
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

          {sortCategories(Object.keys(groupedAll)).map((cat) => (
            <div key={cat} style={{ marginBottom: 24 }}>
              <h3 style={{ color: colors.title }}>
                {cat} ({groupedAll[cat].length})
              </h3>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                {RACES.map((race) => (
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
                  <div style={checkboxCellStyle}>R1</div>
                  <div style={checkboxCellStyle}>R2</div>
                  <div style={checkboxCellStyle}>R3</div>
                  <div style={checkboxCellStyle}>R4</div>
                  <div style={{ width: 170 }} />
                </div>

                {groupedAll[cat].map((r: any) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      minHeight: 34,
                      borderTop: "1px solid #eef2f6",
                    }}
                  >
                    <div style={{ flex: 1 }}>{renderRiderCells(r)}</div>

                    <div style={checkboxCellStyle}>
                      <input
                        type="checkbox"
                        checked={!!r.race1}
                        onChange={(e) =>
                          toggleRaceForRider(r.id, "Race 1", e.target.checked)
                        }
                        style={largeCheckboxStyle}
                      />
                    </div>

                    <div style={checkboxCellStyle}>
                      <input
                        type="checkbox"
                        checked={!!r.race2}
                        onChange={(e) =>
                          toggleRaceForRider(r.id, "Race 2", e.target.checked)
                        }
                        style={largeCheckboxStyle}
                      />
                    </div>

                    <div style={checkboxCellStyle}>
                      <input
                        type="checkbox"
                        checked={!!r.race3}
                        onChange={(e) =>
                          toggleRaceForRider(r.id, "Race 3", e.target.checked)
                        }
                        style={largeCheckboxStyle}
                      />
                    </div>

                    <div style={checkboxCellStyle}>
                      <input
                        type="checkbox"
                        checked={!!r.race4}
                        onChange={(e) =>
                          toggleRaceForRider(r.id, "Race 4", e.target.checked)
                        }
                        style={largeCheckboxStyle}
                      />
                    </div>

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
          </>
        )}
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
      }}
    >
      {eventLogo && (
        <img
          src={eventLogo}
          alt="Logo"
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            width: 140,
            maxHeight: 110,
            objectFit: "contain",
            opacity: 0.12,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <h1 style={{ color: colors.title, marginTop: 0 }}>
          🚴 BMX Racing Software
        </h1>

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
              onClick={() => setViewMode("participants")}
              style={secondaryButtonStyle}
            >
              Teilnehmer
            </button>
            {RACES.map((race) => (
              <button
                key={race}
                onClick={() => {
                  setSelectedRace(race);
                  setViewMode("race");
                }}
                style={
                  selectedRace === race
                    ? activeRaceButtonStyle
                    : inactiveRaceButtonStyle
                }
              >
                {race}
              </button>
            ))}
            <button
              onClick={() => setViewMode("overall")}
              style={secondaryButtonStyle}
            >
              Gesamtwertung
            </button>
          </div>
        </div>

        <div style={{ ...basePanelStyle, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, color: colors.title }}>
            Renninformationen – {selectedRace}
          </h2>

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
                value={eventSeries}
                onChange={(e) => setEventSeries(e.target.value)}
                style={inputStyle}
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

          <div style={{ maxWidth: 420 }}>
            <label style={labelStyle}>Logo importieren</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={stickyButtonBarStyle}>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={createHeats}
              disabled={heatsCreated}
              style={heatsCreated ? disabledButtonStyle : mainButtonStyle}
              title={
                heatsCreated
                  ? "Vorläufe sind bereits erstellt. Für Änderungen zuerst Reset klicken."
                  : undefined
              }
            >
              Vorläufe erstellen
            </button>
            <button onClick={exportHeatsStartPdf} style={secondaryButtonStyle}>
              Startplätze Vorläufe PDF
            </button>
            <button onClick={resetHeats} style={secondaryButtonStyle}>
              Reset
            </button>
            <button
              onClick={createFinals}
              disabled={!heatsCreated || finalsCreated}
              style={
                !heatsCreated || finalsCreated
                  ? disabledButtonStyle
                  : mainButtonStyle
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
            <button onClick={exportFinalsStartPdf} style={secondaryButtonStyle}>
              Startplätze Finals PDF
            </button>
            <button onClick={exportFinalsPdf} style={mainButtonStyle}>
              Finalresultate PDF
            </button>
            <button
              onClick={() => scrollToSection("vorlauf-1")}
              style={secondaryButtonStyle}
            >
              Vorlauf 1
            </button>
            <button
              onClick={() => scrollToSection("vorlauf-2")}
              style={secondaryButtonStyle}
            >
              Vorlauf 2
            </button>
            <button
              onClick={() => scrollToSection("vorlauf-3")}
              style={secondaryButtonStyle}
            >
              Vorlauf 3
            </button>
            <button
              onClick={() => scrollToSection("finallaeufe")}
              style={secondaryButtonStyle}
            >
              Finalläufe
            </button>
          </div>
        </div>

        <h2 style={{ color: colors.title }}>
          Teilnehmer ({riders.length}) – {selectedRace}
        </h2>

        {sortCategories(Object.keys(groupedRace)).map((cat) => {
          const ranking = getRanking(cat);

          return (
            <div
              key={cat}
              style={{
                display: "flex",
                gap: 20,
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
                  {renderRows(groupedRace[cat], (r) => renderRiderCells(r))}
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
          <div style={{ marginTop: 50 }}>
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
      </div>
    </div>
  );
}
