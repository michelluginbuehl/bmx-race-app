import React, { useEffect, useMemo, useState } from "react";
import { db } from "../db";
import * as XLSX from "xlsx";

type Props = {
  onChange: () => void | Promise<void>;
  editingRider?: any | null;
  onCancelEdit?: () => void;
  existingCategories?: string[];
  eventYear?: string;
  currentEventId?: string;
  masterMode?: boolean;
};

const raceDefaults = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => [`race${index + 1}`, false]),
) as Record<string, boolean>;

const normalizeHeader = (value: any) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[._-]/g, "");

const getValue = (row: any, aliases: string[]) => {
  const normalizedAliases = aliases.map(normalizeHeader);
  const key = Object.keys(row).find((candidate) =>
    normalizedAliases.includes(normalizeHeader(candidate)),
  );
  return key ? row[key] : "";
};

const normalizeGender = (value: any) => {
  const raw = String(value || "")
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
    ].includes(raw)
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
    ].includes(raw)
  )
    return "B";
  return "";
};

const parseBoolean = (value: any) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "ja", "yes", "x", "cruiser", "✓", "oui"].includes(raw);
};


type DuplicateCandidate = {
  id?: string;
  name: string;
  plate?: string;
  birthYear?: number | string;
  gender?: string;
  club?: string;
  reason: string;
  score: number;
};

type PendingImportRow = {
  tempId: string;
  row: any;
  duplicates: DuplicateCandidate[];
};

const normalizeNameForMatch = (value: any) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const sortedNameTokens = (value: any) =>
  normalizeNameForMatch(value).split(" ").filter(Boolean).sort().join(" ");

const levenshteinDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
};

const nameSimilarity = (a: any, b: any) => {
  const left = normalizeNameForMatch(a);
  const right = normalizeNameForMatch(b);
  if (!left || !right) return 0;
  const direct = 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length, 1);
  const tokenLeft = sortedNameTokens(left);
  const tokenRight = sortedNameTokens(right);
  const token = 1 - levenshteinDistance(tokenLeft, tokenRight) / Math.max(tokenLeft.length, tokenRight.length, 1);
  return Math.max(direct, token);
};

const riderBirthYear = (rider: any) => Number(rider?.birthYear || rider?.jahrgang || 0);
const riderGender = (rider: any) => normalizeGender(rider?.gender || rider?.geschlecht || "");

const findDuplicateCandidates = (candidate: any, existingRiders: any[], currentId?: string | null) => {
  const candidateName = candidate.name || "";
  const candidatePlate = String(candidate.plate || "").trim();
  const candidateBirthYear = Number(candidate.birthYear || candidate.jahrgang || 0);
  const candidateGender = normalizeGender(candidate.gender || candidate.geschlecht || "");

  return existingRiders
    .filter((rider) => !currentId || String(rider.id || "") !== String(currentId))
    .map((rider) => {
      const similarity = nameSimilarity(candidateName, rider.name);
      const samePlate = candidatePlate && String(rider.plate || "").trim() === candidatePlate;
      const sameBirthYear = !!candidateBirthYear && riderBirthYear(rider) === candidateBirthYear;
      const sameGender = !!candidateGender && riderGender(rider) === candidateGender;
      const sameNameTokens = sortedNameTokens(candidateName) === sortedNameTokens(rider.name);

      const reasons: string[] = [];
      if (sameNameTokens) reasons.push("Name/Vorname möglicherweise vertauscht");
      if (similarity >= 0.88 && !sameNameTokens) reasons.push("Name sehr ähnlich");
      if (samePlate) reasons.push("gleiche Startnummer");
      if (sameBirthYear && sameGender) reasons.push("gleicher Jahrgang und B/G");

      const isLikelyDuplicate =
        sameNameTokens ||
        (similarity >= 0.88 && (sameBirthYear || samePlate)) ||
        (similarity >= 0.78 && sameBirthYear && sameGender) ||
        (similarity >= 0.72 && samePlate && (sameBirthYear || sameGender));

      if (!isLikelyDuplicate) return null;

      return {
        id: rider.id,
        name: rider.name || "",
        plate: rider.plate,
        birthYear: rider.birthYear || rider.jahrgang,
        gender: rider.gender || rider.geschlecht,
        club: rider.club,
        reason: reasons.join(", ") || "ähnliche Daten",
        score: Math.round(similarity * 100),
      } as DuplicateCandidate;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5) as DuplicateCandidate[];
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 10px",
  border: "1px solid #cfd8e3",
  borderRadius: 8,
  fontSize: 15,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 700,
  marginBottom: 5,
  color: "#1f2a37",
};

const buttonStyle: React.CSSProperties = {
  background: "#2d6cdf",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "#e9eef3",
  color: "#23303b",
  border: "1px solid #d3dbe3",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

export default function RiderForm({
  onChange,
  editingRider,
  onCancelEdit,
  eventYear,
  currentEventId,
  masterMode = false,
}: Props) {
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState("");
  const [club, setClub] = useState("");
  const [cruiser, setCruiser] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCandidate[]>([]);
  const [allowDuplicateSave, setAllowDuplicateSave] = useState(false);
  const [pendingImportRows, setPendingImportRows] = useState<PendingImportRow[]>([]);
  const [importDecisions, setImportDecisions] = useState<Record<string, "import" | "skip">>({});
  const [importSkippedRows, setImportSkippedRows] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [nameSuggestions, setNameSuggestions] = useState<DuplicateCandidate[]>([]);

  const calculatedAge = useMemo(() => {
    const raceYear = Number(eventYear);
    const year = Number(birthYear);
    if (!Number.isFinite(raceYear) || !Number.isFinite(year) || !year)
      return "";
    return String(raceYear - year);
  }, [eventYear, birthYear]);

  useEffect(() => {
    let cancelled = false;
    const query = name.trim();
    if (query.length < 2 || editId) {
      setNameSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const existingRiders = await db.table("riders").toArray();
      const suggestions = findDuplicateCandidates(
        { name: query, plate, birthYear, gender },
        existingRiders,
      );
      if (!cancelled) setNameSuggestions(suggestions.slice(0, 6));
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [name, plate, birthYear, gender, editId]);

  useEffect(() => {
    if (!editingRider) return;
    setEditId(editingRider.id);
    setName(editingRider.name || "");
    setPlate(String(editingRider.plate || ""));
    setBirthYear(String(editingRider.birthYear || editingRider.jahrgang || ""));
    setGender(
      normalizeGender(editingRider.gender || editingRider.geschlecht || ""),
    );
    setClub(editingRider.club || "");
    setCruiser(!!(editingRider.cruiser || editingRider.isCruiser));
    setImportMessage("");
  }, [editingRider]);

  const resetForm = () => {
    setName("");
    setPlate("");
    setBirthYear("");
    setGender("");
    setClub("");
    setCruiser(false);
    setEditId(null);
    setImportMessage("");
    setDuplicateWarning([]);
    setAllowDuplicateSave(false);
    setNameSuggestions([]);
  };

  const saveRider = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim() || !plate.trim()) {
      alert("Bitte mindestens Name und Plate erfassen.");
      return;
    }

    if (!birthYear || !gender) {
      alert(
        "Bitte Jahrgang und Geschlecht erfassen, damit die Kategorie automatisch berechnet werden kann.",
      );
      return;
    }

    const rider = {
      name: name.trim(),
      plate: plate.trim(),
      birthYear: Number(birthYear),
      jahrgang: Number(birthYear),
      gender,
      geschlecht: gender,
      club: club.trim(),
      cruiser,
      isCruiser: cruiser,
      eventId: masterMode ? "master" : currentEventId || "legacy",
    };

    if (!editId && !allowDuplicateSave) {
      const existingRiders = await db.table("riders").toArray();
      const duplicates = findDuplicateCandidates(rider, existingRiders);
      if (duplicates.length > 0) {
        setDuplicateWarning(duplicates);
        setImportMessage(
          "Mögliche doppelte Teilnehmer gefunden. Bitte prüfen und unten entscheiden.",
        );
        return;
      }
    }

    if (editId) {
      await db.table("riders").update(editId, rider);
    } else {
      const id = crypto.randomUUID();
      await db.table("riders").add({
        id,
        masterId: masterMode ? id : "",
        ...rider,
        ...raceDefaults,
      });
    }

    resetForm();
    await onChange();
  };

  const cancelEdit = () => {
    resetForm();
    onCancelEdit?.();
  };

  const importExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);
      const existingRiders = await db.table("riders").toArray();

      const validRows: PendingImportRow[] = [];
      const skippedRows: string[] = [];
      const plateCategoryMap = new Map<string, string[]>();
      const importComparisonRows: any[] = [];
      const decisions: Record<string, "import" | "skip"> = {};

      rows.forEach((row, index) => {
        const importedName = String(
          getValue(row, ["Name", "Fahrer", "Teilnehmer", "Rider"]) || "",
        ).trim();
        const importedPlate = String(
          getValue(row, ["Plate", "Startnummer", "Nummer", "Number", "Nr"]) ||
            "",
        ).trim();
        const importedClub = String(
          getValue(row, ["Club", "Verein", "Team"]) || "",
        ).trim();
        const importedBirthYear = Number(
          getValue(row, ["Jahrgang", "Geburtsjahr", "BirthYear", "Year", "JG"]),
        );
        const importedGender = normalizeGender(
          getValue(row, ["Geschlecht", "Gender", "Sex", "B/G", "BG"]),
        );
        const importedCruiser = parseBoolean(
          getValue(row, ["Cruiser", "Kategorie Cruiser", "IsCruiser"]),
        );

        const missing = [
          !importedName ? "Name" : "",
          !importedPlate ? "Plate" : "",
          !importedBirthYear ? "Jahrgang" : "",
          !importedGender ? "Geschlecht" : "",
        ].filter(Boolean);

        if (missing.length > 0) {
          skippedRows.push(`Zeile ${index + 2}: ${missing.join(", ")} fehlt`);
          return;
        }

        const importedRider = {
          id: crypto.randomUUID(),
          name: importedName,
          plate: importedPlate,
          birthYear: importedBirthYear,
          jahrgang: importedBirthYear,
          gender: importedGender,
          geschlecht: importedGender,
          club: importedClub,
          cruiser: importedCruiser,
          isCruiser: importedCruiser,
          eventId: masterMode ? "master" : currentEventId || "legacy",
          masterId: masterMode ? "" : "",
          ...Object.fromEntries(
            Array.from({ length: 10 }, (_, raceIndex) => {
              const raceNo = raceIndex + 1;
              const value = getValue(row, [`Race ${raceNo}`, `Race${raceNo}`, `R${raceNo}`]);
              return [`race${raceNo}`, value === "" ? false : parseBoolean(value)];
            }),
          ),
        };

        if (masterMode) importedRider.masterId = importedRider.id;

        const categoryHint = importedCruiser ? "Cruiser" : `${importedGender}-${importedBirthYear}`;
        const duplicateKey = `${categoryHint}|||${importedPlate}`;
        const names = plateCategoryMap.get(duplicateKey) || [];
        names.push(importedName);
        plateCategoryMap.set(duplicateKey, names);

        const duplicates = findDuplicateCandidates(importedRider, [
          ...existingRiders,
          ...importComparisonRows,
        ]);

        const tempId = importedRider.id;
        validRows.push({ tempId, row: importedRider, duplicates });
        if (duplicates.length > 0) decisions[tempId] = "skip";
        importComparisonRows.push(importedRider);
      });

      const duplicateRows = Array.from(plateCategoryMap.entries())
        .filter(([, names]) => names.length > 1)
        .map(([key, names]) => `${key.split("|||")[0]} #${key.split("|||")[1]}: ${names.join(", ")}`);

      setPendingImportRows(validRows);
      setImportDecisions(decisions);
      setImportSkippedRows([...skippedRows, ...duplicateRows.map((row) => `Doppelte Nummern in Datei: ${row}`)]);
      setImportFileName(file.name);
      setImportMessage(
        `Import-Vorschau geladen: ${validRows.length} gültige Teilnehmer, ${validRows.filter((row) => row.duplicates.length > 0).length} mögliche Duplikate.`,
      );
    } catch (error: any) {
      alert(
        `Excel-Import fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`,
      );
    }

    event.target.value = "";
  };

  const confirmPendingImport = async () => {
    const rowsToImport = pendingImportRows
      .filter((entry) => entry.duplicates.length === 0 || importDecisions[entry.tempId] === "import")
      .map((entry) => entry.row);
    const skippedDuplicates = pendingImportRows.filter(
      (entry) => entry.duplicates.length > 0 && importDecisions[entry.tempId] !== "import",
    ).length;

    if (rowsToImport.length > 0) {
      await db.table("riders").bulkAdd(rowsToImport);
    }

    setImportMessage(
      `${rowsToImport.length} Teilnehmer importiert${skippedDuplicates ? `, ${skippedDuplicates} mögliche Duplikate übersprungen` : ""}${importSkippedRows.length ? `, ${importSkippedRows.length} Hinweise` : ""}.`,
    );
    setPendingImportRows([]);
    setImportDecisions({});
    setImportSkippedRows([]);
    setImportFileName("");
    await onChange();
  };

  const cancelPendingImport = () => {
    setPendingImportRows([]);
    setImportDecisions({});
    setImportSkippedRows([]);
    setImportFileName("");
    setImportMessage("Import abgebrochen.");
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, color: "#1f2a37" }}>
        {editId ? "Teilnehmer bearbeiten" : masterMode ? "Teilnehmer in Hauptdatenbank erfassen" : "Teilnehmer erfassen"}
      </h2>

      <form onSubmit={saveRider}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 120px 130px 130px 1fr",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Name</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setAllowDuplicateSave(false);
                setDuplicateWarning([]);
              }}
              style={inputStyle}
            />
            {nameSuggestions.length > 0 && (
              <div style={{ marginTop: 6, border: "1px solid #f59e0b", borderRadius: 8, background: "#fffbeb", padding: 8, fontSize: 13, color: "#78350f" }}>
                <strong>Mögliche vorhandene Teilnehmer</strong>
                {nameSuggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.id || suggestion.name}-${suggestion.score}`}
                    type="button"
                    onClick={() => {
                      setName(suggestion.name || "");
                      if (suggestion.plate) setPlate(String(suggestion.plate));
                      if (suggestion.birthYear) setBirthYear(String(suggestion.birthYear));
                      if (suggestion.gender) setGender(normalizeGender(suggestion.gender));
                      if (suggestion.club) setClub(String(suggestion.club));
                      setNameSuggestions([]);
                    }}
                    style={{
                      marginTop: 4,
                      padding: "6px 8px",
                      textAlign: "left",
                      border: "1px solid #fcd34d",
                      borderRadius: 8,
                      background: "#fff7ed",
                      color: "#78350f",
                      cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    #{suggestion.plate || "-"} {suggestion.name} · {suggestion.birthYear || "-"} | {suggestion.gender || "-"}{suggestion.club ? ` · ${suggestion.club}` : ""} · {suggestion.score}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Plate</label>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Jahrgang</label>
            <input
              type="number"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Geschlecht</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              style={inputStyle}
            >
              <option value="">Bitte wählen</option>
              <option value="B">B</option>
              <option value="G">G</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Verein</label>
            <input
              value={club}
              onChange={(e) => setClub(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
            }}
          >
            <input
              type="checkbox"
              checked={cruiser}
              onChange={(e) => setCruiser(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            Startet in Kategorie Cruiser
          </label>

          {calculatedAge && (
            <span style={{ color: "#7b8794" }}>
              Alter im Rennjahr: {calculatedAge}
            </span>
          )}
        </div>

        <div
          style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <button type="submit" style={buttonStyle}>
            {editId ? "Änderungen speichern" : masterMode ? "In Hauptdatenbank speichern" : "Teilnehmer hinzufügen"}
          </button>
          {editId && (
            <button
              type="button"
              onClick={cancelEdit}
              style={secondaryButtonStyle}
            >
              Abbrechen
            </button>
          )}
          <label style={{ ...secondaryButtonStyle, display: "inline-block" }}>
            Excel importieren
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={importExcel}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </form>

      {duplicateWarning.length > 0 && !editId && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            color: "#78350f",
          }}
        >
          <strong>Mögliche doppelte Teilnehmer gefunden</strong>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {duplicateWarning.map((duplicate) => (
              <div key={`${duplicate.id || duplicate.name}-${duplicate.score}`}>
                #{duplicate.plate || "-"} {duplicate.name} · {duplicate.birthYear || "-"} | {duplicate.gender || "-"}
                {duplicate.club ? ` · ${duplicate.club}` : ""}
                <br />
                <span style={{ fontSize: 13 }}>
                  {duplicate.reason} · Ähnlichkeit {duplicate.score}%
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={allowDuplicateSave}
                onChange={(event) => setAllowDuplicateSave(event.target.checked)}
                style={{ width: 20, height: 20 }}
              />
              Diesen Teilnehmer trotzdem erfassen
            </label>
            <button type="button" onClick={resetForm} style={secondaryButtonStyle}>
              Diesen Teilnehmer überspringen
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, color: "#7b8794", fontSize: 13 }}>
        Excel-Spalten möglich: Name, Plate, Verein, Jahrgang, Geschlecht,
        Cruiser, Race1 bis Race10. Geschlecht: B oder G.
      </div>

      {pendingImportRows.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid #d3dbe3",
            borderRadius: 10,
            background: "#f8fafc",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Import-Vorschau: {importFileName}</h3>
          <div style={{ color: "#7b8794", marginBottom: 10 }}>
            Gültige Teilnehmer: {pendingImportRows.length} · Mögliche Duplikate: {pendingImportRows.filter((row) => row.duplicates.length > 0).length}
          </div>

          {importSkippedRows.length > 0 && (
            <div style={{ marginBottom: 12, color: "#92400e", fontSize: 13 }}>
              {importSkippedRows.slice(0, 8).map((message) => (
                <div key={message}>⚠ {message}</div>
              ))}
            </div>
          )}

          {pendingImportRows.filter((row) => row.duplicates.length > 0).length > 0 && (
            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              {pendingImportRows
                .filter((row) => row.duplicates.length > 0)
                .map((entry) => (
                  <div
                    key={entry.tempId}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid #f59e0b",
                      background: "#fffbeb",
                    }}
                  >
                    <strong>
                      Import: #{entry.row.plate} {entry.row.name} · {entry.row.birthYear} | {entry.row.gender}
                    </strong>
                    <div style={{ marginTop: 6, color: "#78350f" }}>
                      Mögliche Treffer:
                      {entry.duplicates.map((duplicate) => (
                        <div key={`${entry.tempId}-${duplicate.id || duplicate.name}`} style={{ marginTop: 4 }}>
                          #{duplicate.plate || "-"} {duplicate.name} · {duplicate.birthYear || "-"} | {duplicate.gender || "-"}
                          {duplicate.club ? ` · ${duplicate.club}` : ""} · {duplicate.reason} · {duplicate.score}%
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                        <input
                          type="checkbox"
                          checked={importDecisions[entry.tempId] === "import"}
                          onChange={(event) =>
                            setImportDecisions((prev) => ({
                              ...prev,
                              [entry.tempId]: event.target.checked ? "import" : "skip",
                            }))
                          }
                          style={{ width: 20, height: 20 }}
                        />
                        Diesen Teilnehmer trotzdem importieren
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                        <input
                          type="checkbox"
                          checked={importDecisions[entry.tempId] !== "import"}
                          onChange={(event) =>
                            setImportDecisions((prev) => ({
                              ...prev,
                              [entry.tempId]: event.target.checked ? "skip" : "import",
                            }))
                          }
                          style={{ width: 20, height: 20 }}
                        />
                        Diesen Teilnehmer überspringen
                      </label>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={confirmPendingImport} style={buttonStyle}>
              Import bestätigen
            </button>
            <button type="button" onClick={cancelPendingImport} style={secondaryButtonStyle}>
              Import abbrechen
            </button>
          </div>
        </div>
      )}

      {importMessage && (
        <div style={{ marginTop: 10, color: "#7b8794" }}>{importMessage}</div>
      )}
    </div>
  );
}
