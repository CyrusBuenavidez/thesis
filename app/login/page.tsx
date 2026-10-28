import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import {
  getCurrentUserProfile,
  getUserLandingRoute,
} from "@/lib/auth/roles";
import { getPublicEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the PECIT Thesis Archive repository.",
};

// Authentication must be resolved before the login form is rendered so an
// existing session cannot briefly see or submit credentials for another user.
export const instant = false;

export default async function LoginPage() {
  const profile = await getCurrentUserProfile();

  if (profile && profile.status !== "disabled") {
    redirect(
      profile.must_change_password && profile.role !== "student"
        ? "/users/change-password"
        : getUserLandingRoute(profile.role),
    );
  }

  const env = getPublicEnv();

  return (
    <main className="login-page">
      <svg
        className="login-network"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g className="network-lines">
          <path d="M0 218 86 232 115 346 70 438 190 426 267 486 323 559" />
          <path d="M0 218 106 219 115 346 160 415 267 486 282 350 350 270" />
          <path d="M571 0 595 43 601 94 614 7 571 0" />
          <path d="M789 61 866 34 943 74 916 176" />
          <path d="M1165 265 1265 226 1243 286 1165 265" />
          <path d="M956 555 1004 595 1007 710 1082 710 1136 579 1250 531" />
          <path d="M1250 531 1300 475 1374 426 1440 430 1440 526" />
          <path d="M1262 744 1272 813 1305 775 1285 690" />
          <path d="M183 746 203 712 204 791 221 838" />
          <path d="M997 864 1034 900" />
        </g>
        <g className="network-nodes">
          <circle cx="0" cy="218" r="3" />
          <circle cx="86" cy="232" r="3" />
          <circle cx="115" cy="346" r="3" />
          <circle cx="190" cy="426" r="3" />
          <circle cx="267" cy="486" r="3" />
          <circle cx="323" cy="559" r="3" />
          <circle cx="350" cy="270" r="3" />
          <circle cx="789" cy="61" r="3" />
          <circle cx="943" cy="74" r="3" />
          <circle cx="956" cy="555" r="3" />
          <circle cx="1007" cy="710" r="3" />
          <circle cx="1136" cy="579" r="3" />
          <circle cx="1250" cy="531" r="3" />
          <circle cx="1374" cy="426" r="3" />
          <circle cx="203" cy="712" r="3" />
          <circle cx="221" cy="838" r="3" />
        </g>
      </svg>

      <section className="login-card" aria-labelledby="login-title">
        <div className="login-header">
          <span className="login-seal">
            <Image
              src="/pecit-logo.png"
              alt="PECIT official seal"
              width={62}
              height={62}
              priority
            />
          </span>
        </div>

        <div className="login-copy">
          <h1 id="login-title">Thesis Archive</h1>
        </div>

        <LoginForm
          turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          adminContactEmail="admin@pecit.edu.ph"
        />
      </section>
    </main>
  );
}
