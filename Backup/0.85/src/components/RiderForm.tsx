import React, { useEffect, useMemo, useState } from "react";
import { db } from "../db";
import * as XLSX from "xlsx";

type Props = {
  onChange: () => void | Promise<void>;
  editingRider?: any | null;
  onCancelEdit?: () => void;
  existingCategories?: string[];
  eventYear?: string;
};

const raceDefaults = {
  race1: true,
  race2: true,
  race3: true,
  race4: true,
};

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
}: Props) {
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState("");
  const [club, setClub] = useState("");
  const [cruiser, setCruiser] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState("");

  const calculatedAge = useMemo(() => {
    const raceYear = Number(eventYear);
    const year = Number(birthYear);
    if (!Number.isFinite(raceYear) || !Number.isFinite(year) || !year)
      return "";
    return String(raceYear - year);
  }, [eventYear, birthYear]);

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
    };

    if (editId) {
      await db.table("riders").update(editId, rider);
    } else {
      await db.table("riders").add({
        id: crypto.randomUUID(),
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

      let imported = 0;
      let skipped = 0;

      for (const row of rows) {
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

        if (
          !importedName ||
          !importedPlate ||
          !importedBirthYear ||
          !importedGender
        ) {
          skipped += 1;
          continue;
        }

        await db.table("riders").add({
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
          race1: parseBoolean(getValue(row, ["Race 1", "Race1", "R1"])) || true,
          race2: parseBoolean(getValue(row, ["Race 2", "Race2", "R2"])) || true,
          race3: parseBoolean(getValue(row, ["Race 3", "Race3", "R3"])) || true,
          race4: parseBoolean(getValue(row, ["Race 4", "Race4", "R4"])) || true,
        });
        imported += 1;
      }

      setImportMessage(
        `${imported} Teilnehmer importiert${skipped ? `, ${skipped} Zeilen übersprungen` : ""}.`,
      );
      await onChange();
    } catch (error: any) {
      alert(
        `Excel-Import fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`,
      );
    }

    event.target.value = "";
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, color: "#1f2a37" }}>
        {editId ? "Teilnehmer bearbeiten" : "Teilnehmer erfassen"}
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
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
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
            {editId ? "Speichern" : "Teilnehmer hinzufügen"}
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

      <div style={{ marginTop: 10, color: "#7b8794", fontSize: 13 }}>
        Excel-Spalten möglich: Name, Plate, Verein, Jahrgang, Geschlecht,
        Cruiser, Race1/Race2/Race3/Race4. Geschlecht: B oder G.
      </div>

      {importMessage && (
        <div style={{ marginTop: 10, color: "#7b8794" }}>{importMessage}</div>
      )}
    </div>
  );
}
