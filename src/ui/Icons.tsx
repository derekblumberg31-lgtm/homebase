import type { ReactNode, SVGProps } from 'react';
import type { Category } from '../features/tasks/presets';

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function IconBase({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Wind = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M3 8h9a3 3 0 1 0-3-3" />
    <path d="M3 12h13a3 3 0 1 1-3 3" />
    <path d="M3 16h7" />
  </IconBase>
);

export const Droplet = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 2.5s6.2 6.3 6.2 10.7a6.2 6.2 0 0 1-12.4 0C5.8 8.8 12 2.5 12 2.5Z" />
    <path d="M9.5 13.6a2.6 2.6 0 0 0 2.5 2.6" />
  </IconBase>
);

export const Plug = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M9 2v5M15 2v5" />
    <path d="M6 7h12v3.5a6 6 0 0 1-12 0V7Z" />
    <path d="M12 16.5V22" />
  </IconBase>
);

export const Car = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M4 16v-4.2L6.2 6h11.6L20 11.8V16" />
    <path d="M2 16h20" />
    <path d="M6.5 11h11" />
    <circle cx="7.2" cy="18" r="1.6" />
    <circle cx="16.8" cy="18" r="1.6" />
  </IconBase>
);

export const Waves = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M2 6.5c2.1 0 2.1 2 4.2 2s2.1-2 4.2-2 2.1 2 4.2 2 2.1-2 4.2-2 2.1 2 3.2 2" />
    <path d="M2 12.5c2.1 0 2.1 2 4.2 2s2.1-2 4.2-2 2.1 2 4.2 2 2.1-2 4.2-2 2.1 2 3.2 2" />
    <path d="M2 18.5c2.1 0 2.1 2 4.2 2s2.1-2 4.2-2 2.1 2 4.2 2 2.1-2 4.2-2 2.1 2 3.2 2" />
  </IconBase>
);

export const Box = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m12 2.8 8.2 4.6v9.2L12 21.2l-8.2-4.6V7.4L12 2.8Z" />
    <path d="M3.8 7.4 12 12l8.2-4.6M12 12v9.2" />
  </IconBase>
);

export const Plus = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 5v14M5 12h14" />
  </IconBase>
);

export const X = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </IconBase>
);

export const Search = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </IconBase>
);

export const Check = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m4.5 12.5 5 5 10-11" />
  </IconBase>
);

export const RefreshCw = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </IconBase>
);

export const Calendar = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </IconBase>
);

export const MapPin = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M20 10c0 5.5-8 11.5-8 11.5S4 15.5 4 10a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="2.6" />
  </IconBase>
);

export const Sun = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </IconBase>
);

export const Moon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </IconBase>
);

export const Settings = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.12-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.85a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.03 4.1l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
  </IconBase>
);

export const Download = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 19h16" />
  </IconBase>
);

export const Upload = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 17V5" />
    <path d="m7 10 5-5 5 5" />
    <path d="M4 19h16" />
  </IconBase>
);

export const Trash2 = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="m6 7 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
  </IconBase>
);

export const Pencil = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </IconBase>
);

export const AlertTriangle = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </IconBase>
);

export const Bell = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </IconBase>
);

export const ChevronDown = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m6 9 6 6 6-6" />
  </IconBase>
);

export const Sparkles = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
  </IconBase>
);

export const Lock = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </IconBase>
);

export const ArrowRight = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </IconBase>
);

export const Layers = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </IconBase>
);

export const Clock = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </IconBase>
);

export const Wallet = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="2.5" y="6" width="19" height="13" rx="3" />
    <path d="M2.5 10.5h19" />
    <path d="M16 15h2" />
  </IconBase>
);

export const ListFilter = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </IconBase>
);

export const ChartBar = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 20v-6M12 20V6M19 20v-9" />
    <path d="M3 20h18" />
  </IconBase>
);

export const ChevronRight = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m9 6 6 6-6 6" />
  </IconBase>
);

export const BookOpen = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 6.5C10 4.8 7 4.4 4 5.2v13c3-.8 6-.4 8 1.3 2-1.7 5-2.1 8-1.3v-13c-3-.8-6-.4-8 1.3Z" />
    <path d="M12 6.5v13" />
  </IconBase>
);

export const Share = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 15V3" />
    <path d="m8 7 4-4 4 4" />
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
  </IconBase>
);

export const Info = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </IconBase>
);

export const CircleCheck = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </IconBase>
);

export const Wrench = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </IconBase>
);

export const Leaf = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </IconBase>
);

export const ShieldCheck = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </IconBase>
);

const CATEGORY_ICONS = {
  cleaning: Sparkles,
  maintenance: Wrench,
  outdoor: Leaf,
  safety: ShieldCheck,
  air: Wind,
  water: Droplet,
  appliance: Plug,
  vehicle: Car,
  pool: Waves,
  other: Box,
} as const;

export function CategoryIcon({ category, size = 20 }: { category: Category; size?: number }) {
  const Component = CATEGORY_ICONS[category] ?? Box;
  return <Component size={size} />;
}

// ---------- Homebase navigation and areas ----------

export const House = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
    <path d="M10 20v-5h4v5" />
  </IconBase>
);

export const Building = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" />
  </IconBase>
);

export const ClipboardCheck = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4.5V3h6v1.5" />
    <path d="m9 13 2 2 4-4" />
  </IconBase>
);

export const MessageCircle = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5Z" />
  </IconBase>
);

export const Folder = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </IconBase>
);

export const Key = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="8" cy="8" r="4.5" />
    <path d="m11.2 11.2 8.3 8.3M16 16l2-2M18.5 18.5l1.5-1.5" />
  </IconBase>
);

export const Camera = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </IconBase>
);

export const User = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </IconBase>
);

export const Paperclip = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1L13 4.3a3.3 3.3 0 0 1 4.7 4.7L9.5 17.2a1.7 1.7 0 0 1-2.4-2.4L14.7 7.2" />
  </IconBase>
);

export const ArrowLeft = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </IconBase>
);

export const Send = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 12h12M13 6l6 6-6 6" />
  </IconBase>
);

export const FileText = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </IconBase>
);

export const Receipt = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </IconBase>
);

export const NotePad = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 4h14v12l-4 4H5z" />
    <path d="M15 20v-4h4M8.5 9h7M8.5 13h4" />
  </IconBase>
);

export const MoreHorizontal = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="6" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" />
  </IconBase>
);

export const Phone = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 4h3.5l1.6 4.2-2.1 1.3a11 11 0 0 0 6.5 6.5l1.3-2.1L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" />
  </IconBase>
);

export const Mail = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </IconBase>
);

export const HeartPulse = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M20.4 12.5 12 20.5l-8.4-8A4.9 4.9 0 0 1 12 6a4.9 4.9 0 0 1 8.4 6.5z" />
    <path d="M7 12h2.5l1.5-2.5 2 5 1.5-2.5H17" />
  </IconBase>
);

export const DoorOpen = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M4 20h16M6 20V4h9v16" />
    <path d="M15 5.5l3 1V20" />
    <circle cx="12" cy="12.5" r="0.8" fill="currentColor" />
  </IconBase>
);

export const Thermometer = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" />
    <path d="M12 9v7" />
  </IconBase>
);

export const Hammer = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m14 7 3 3-9.5 9.5a2.1 2.1 0 0 1-3-3z" />
    <path d="m13 6 2.5-2.5a2 2 0 0 1 2.8 0L21 6.2l-2.5 2.5" />
  </IconBase>
);
