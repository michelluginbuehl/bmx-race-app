import React from "react";
import { APP_VERSION } from "../config/appConfig";
import { APP_RELEASE_NOTES } from "../config/releaseNotes";

type ReleaseNotesProps = {
  colors: Record<string, string>;
  getStatusBadgeStyle: (status: string) => React.CSSProperties;
};

export default function ReleaseNotes({ colors, getStatusBadgeStyle }: ReleaseNotesProps) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {APP_RELEASE_NOTES.map((release) => (
        <div
          key={release.version}
          style={{
            border: `1px solid ${release.version === APP_VERSION ? colors.blueBorder : colors.cardBorder}`,
            background: release.version === APP_VERSION ? "linear-gradient(135deg, #eef6ff 0%, #ffffff 100%)" : colors.cardSoftBg,
            borderRadius: 16,
            padding: 14,
            boxShadow: release.version === APP_VERSION ? "0 10px 22px rgba(37, 99, 235, 0.12)" : "none",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <span style={getStatusBadgeStyle(release.version === APP_VERSION ? "offiziell" : "ID")}>{release.version}</span>
            {release.version === APP_VERSION && <span style={getStatusBadgeStyle("Speichern")}>Aktuelle Version</span>}
            <strong style={{ color: colors.title, fontSize: 17 }}>{release.title}</strong>
            <span style={{ color: colors.muted, fontWeight: 850 }}>{release.date}</span>
          </div>
          <ul style={{ margin: "8px 0 0 22px", padding: 0, color: colors.text, fontWeight: 760, lineHeight: 1.55 }}>
            {release.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
