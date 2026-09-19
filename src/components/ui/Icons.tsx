/** Conjunto de icones proprio — traco 1.5, grade 16, estilo uniforme. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden focusable="false" {...rest}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: P) => (
  <Svg {...p}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></Svg>
);
export const IconPulse = (p: P) => (
  <Svg {...p}><path d="M1 8h3l2-5 3 10 2-5h4" /></Svg>
);
export const IconTruckIn = (p: P) => (
  <Svg {...p}><path d="M1 4h8v7H1z" /><path d="M9 6h3l2 2.5V11H9z" /><circle cx="4" cy="12.5" r="1.3" /><circle cx="11" cy="12.5" r="1.3" /></Svg>
);
export const IconCart = (p: P) => (
  <Svg {...p}><path d="M1 2h2l1.6 7.5h7L13 4H4" /><circle cx="6" cy="13" r="1.1" /><circle cx="11" cy="13" r="1.1" /></Svg>
);
export const IconBox = (p: P) => (
  <Svg {...p}><path d="M8 1.5 14 4.5v7L8 14.5 2 11.5v-7z" /><path d="M2 4.5 8 7.5l6-3M8 7.5v7" /></Svg>
);
export const IconGrid = (p: P) => (
  <Svg {...p}><rect x="1.5" y="1.5" width="13" height="13" rx="1.5" /><path d="M1.5 6h13M1.5 10h13M6 1.5v13M10.5 1.5v13" /></Svg>
);
export const IconPick = (p: P) => (
  <Svg {...p}><path d="M2 2h4v4H2z" /><path d="M10 4h4M10 7h4M10 10h4" /><path d="M2.5 9.5 4 11l2.5-3" /></Svg>
);
export const IconPack = (p: P) => (
  <Svg {...p}><rect x="2" y="4" width="12" height="9" rx="1" /><path d="M2 7h12M8 4v9" /><path d="M5.5 1.5h5l1 2.5h-7z" /></Svg>
);
export const IconTruckOut = (p: P) => (
  <Svg {...p}><path d="M7 4h8v7H7z" /><path d="M7 6H4L2 8.5V11h5z" /><circle cx="5" cy="12.5" r="1.3" /><circle cx="12" cy="12.5" r="1.3" /></Svg>
);
export const IconDoc = (p: P) => (
  <Svg {...p}><path d="M3 1.5h6l4 4v9H3z" /><path d="M9 1.5v4h4" /><path d="M5.5 8.5h5M5.5 11h3" /></Svg>
);
export const IconCount = (p: P) => (
  <Svg {...p}><rect x="2" y="1.5" width="12" height="13" rx="1.5" /><path d="M5 5h6M5 8h6M5 11h3" /></Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}><path d="M8 1.8 15 13.5H1z" /><path d="M8 6v3.5M8 11.5v.01" /></Svg>
);
export const IconTool = (p: P) => (
  <Svg {...p}><path d="M10.5 1.8a3.5 3.5 0 0 0-3.2 4.9L2 12v2h2l5.3-5.3a3.5 3.5 0 0 0 4.9-4.3L12 6.5 9.5 4z" /></Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}><path d="M8 1.5 13.5 4v4.5c0 3-2.4 5-5.5 6-3.1-1-5.5-3-5.5-6V4z" /><path d="M5.8 8 7.4 9.6 10.4 6.4" /></Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p}><circle cx="8" cy="8" r="6.5" /><path d="M6.5 5.5 11 8l-4.5 2.5z" /></Svg>
);
export const IconSettings = (p: P) => (
  <Svg {...p}><circle cx="8" cy="8" r="2.3" /><path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7 3.4 3.4" /></Svg>
);
export const IconScan = (p: P) => (
  <Svg {...p}><path d="M1.5 5V2.5H4M12 1.5h2.5V4M14.5 11v2.5H12M4 14.5H1.5V12" /><path d="M1.5 8h13" /></Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14.5 14.5" /></Svg>
);
export const IconArrowRight = (p: P) => (
  <Svg {...p}><path d="M3 8h10M9 4l4 4-4 4" /></Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}><path d="M3 8.5 6.2 11.5 13 4.5" /></Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}><path d="M4 4l8 8M12 4l-8 8" /></Svg>
);
export const IconPrint = (p: P) => (
  <Svg {...p}><path d="M4.5 6V1.5h7V6" /><rect x="2" y="6" width="12" height="5" rx="1" /><path d="M4.5 9.5h7v5h-7z" /></Svg>
);
export const IconReset = (p: P) => (
  <Svg {...p}><path d="M13.5 8a5.5 5.5 0 1 1-1.8-4" /><path d="M13.8 1.5v3h-3" /></Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="8" cy="8" r="6.5" /><path d="M8 4.5V8l2.5 1.5" /></Svg>
);
export const IconPallet = (p: P) => (
  <Svg {...p}><rect x="2" y="2.5" width="12" height="6" rx="1" /><path d="M1.5 11h13M3.5 11v2.5M8 11v2.5M12.5 11v2.5" /></Svg>
);
export const IconWeight = (p: P) => (
  <Svg {...p}><path d="M3 5.5h10l1.2 8.5H1.8z" /><circle cx="8" cy="3" r="1.5" /></Svg>
);
export const IconMap = (p: P) => (
  <Svg {...p}><path d="M1.5 3.5 5.5 2l5 2 4-1.5v10l-4 1.5-5-2-4 1.5z" /><path d="M5.5 2v10M10.5 4v10" /></Svg>
);
export const IconLink = (p: P) => (
  <Svg {...p}><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1" /><path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1" /></Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p}><path d="M6 3.5 10.5 8 6 12.5" /></Svg>
);
export const IconMenu = (p: P) => (
  <Svg {...p}><path d="M2 4h12M2 8h12M2 12h12" /></Svg>
);
export const IconSun = (p: P) => (
  <Svg {...p}><circle cx="8" cy="8" r="3.1" /><path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1" /></Svg>
);
export const IconMoon = (p: P) => (
  <Svg {...p}><path d="M13.5 9.4A5.8 5.8 0 0 1 6.6 2.5a5.9 5.9 0 1 0 6.9 6.9Z" /></Svg>
);
