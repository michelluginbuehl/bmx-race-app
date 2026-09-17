import React from "react";
import { APP_VERSION } from "../config/appConfig";
import { IS_TEST_ENVIRONMENT } from "../config/environment";
import headerBannerImage from "../assets/header-banner.jpg";

type AppHeaderProps = {
  onHomeClick: () => void | Promise<void>;
  colors: Record<string, string>;
};

export default function AppHeader({ onHomeClick }: AppHeaderProps) {
  return (
    <header className="bmx-ios-header" aria-label="BMX Race Manager Kopfzeile">
      <button
        type="button"
        onClick={onHomeClick}
        title="Zur Startseite"
        className="bmx-ios-header-home"
      >
        <img
          src={headerBannerImage}
          alt="BMX Race Manager"
          className="bmx-ios-header-logo"
        />
      </button>

      <div className="bmx-ios-header-meta">
        {IS_TEST_ENVIRONMENT && (
          <span className="bmx-ios-test-badge" title="Diese Ansicht ist nur die Testumgebung">
            TESTUMGEBUNG
          </span>
        )}
        <span className="bmx-ios-version">{APP_VERSION}</span>
      </div>
    </header>
  );
}
