import React from "react";
import { APP_VERSION } from "../config/appConfig";
import headerBannerImage from "../assets/header-banner.jpg";

type AppHeaderProps = {
  onHomeClick: () => void | Promise<void>;
  colors: Record<string, string>;
  chipStyle: React.CSSProperties;
  hasUnsavedChanges: boolean;
  backupWarningActive: boolean;
};

export default function AppHeader({
  onHomeClick,
  colors,
  chipStyle,
  hasUnsavedChanges,
  backupWarningActive,
}: AppHeaderProps) {
  return (
    <button
      type="button"
      onClick={onHomeClick}
      title="Zur Startseite"
      style={{
        width: "100%",
        minHeight: "clamp(220px, 19.5vw, 276px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 18,
        padding: "14px 16px 12px 16px",
        borderRadius: 20,
        backgroundColor: "#f8fbff",
        backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.22) 100%), url(${headerBannerImage})`,
        backgroundSize: "contain",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        boxSizing: "border-box",
        overflow: "hidden",
        border: `1px solid ${colors.cardBorder}`,
        boxShadow: "0 14px 32px rgba(23,32,51,0.12)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          alignSelf: "flex-end",
          padding: "4px 8px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.78)",
          border: "1px solid rgba(255,255,255,0.72)",
          color: colors.title,
          fontWeight: 950,
          fontSize: 13,
          boxShadow: "0 4px 12px rgba(17,24,39,0.08)",
        }}
      >
        {APP_VERSION}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          alignItems: "flex-end",
          alignSelf: "flex-end",
          marginTop: "auto",
        }}
      >
        <div
          style={{
            ...chipStyle,
            minHeight: 28,
            padding: "5px 10px",
            fontSize: 12,
            background: hasUnsavedChanges ? colors.warningBg : colors.successBg,
            borderColor: hasUnsavedChanges ? colors.warningBorder : colors.successBorder,
            boxShadow: "0 4px 12px rgba(17,24,39,0.10)",
          }}
        >
          {hasUnsavedChanges ? "⚠ Ungespeichert" : "✓ Gespeichert"}
        </div>
        <div
          style={{
            ...chipStyle,
            minHeight: 28,
            padding: "5px 10px",
            fontSize: 12,
            background: backupWarningActive ? colors.warningBg : colors.successBg,
            borderColor: backupWarningActive ? colors.warningBorder : colors.successBorder,
            boxShadow: "0 4px 12px rgba(17,24,39,0.10)",
          }}
        >
          {backupWarningActive ? "⚠ Backup empfohlen" : "💾 Backup OK"}
        </div>
      </div>
    </button>
  );
}
