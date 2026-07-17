import type { SVGProps } from "react";

/** Lucide-style stroke icons matching the design spec (stroke 1.7–1.9, round caps). */
type P = SVGProps<SVGSVGElement> & { size?: number };

function S({ size = 20, children, strokeWidth = 1.8, ...rest }: P) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}
    >
      {children}
    </svg>
  );
}

export const LogoMark = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2.5c-2.4 3-4.9 5-8 6 3.1 1 5.6 3 8 6 2.4-3 4.9-5 8-6-3.1-1-5.6-3-8-6z" />
    <circle cx="12" cy="19.5" r="2" />
  </svg>
);

export const ChartIcon = (p: P) => (
  <S {...p}><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="3" y1="20" x2="21" y2="20" /></S>
);
export const FolderIcon = (p: P) => (
  <S {...p}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></S>
);
export const SearchIcon = (p: P) => (
  <S strokeWidth={1.9} {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></S>
);
export const ChevronDown = (p: P) => <S {...p}><polyline points="6 9 12 15 18 9" /></S>;
export const ChevronUp = (p: P) => <S {...p}><polyline points="18 15 12 9 6 15" /></S>;
export const ChevronLeft = (p: P) => <S strokeWidth={2.2} {...p}><polyline points="15 18 9 12 15 6" /></S>;
export const ChevronRight = (p: P) => <S strokeWidth={2.2} {...p}><polyline points="9 18 15 12 9 6" /></S>;
export const ArrowLeft = (p: P) => (
  <S strokeWidth={1.9} {...p}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></S>
);
export const CheckIcon = (p: P) => <S strokeWidth={3} {...p}><polyline points="20 6 9 17 4 12" /></S>;
export const PlusIcon = (p: P) => <S strokeWidth={2} {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></S>;
export const XIcon = (p: P) => <S strokeWidth={2} {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>;
export const ZapIcon = (p: P) => <S strokeWidth={1.7} {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></S>;
export const MessageIcon = (p: P) => (
  <S strokeWidth={1.9} {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></S>
);
export const MergeIcon = (p: P) => (
  <S {...p}><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" /></S>
);
export const GitBranchIcon = (p: P) => (
  <S {...p}><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></S>
);
export const TreeElbow = (p: P) => <S size={16} {...p}><path d="M6 3v9a3 3 0 0 0 3 3h6" /></S>;
export const DownloadIcon = (p: P) => (
  <S strokeWidth={1.7} {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></S>
);
export const UsersIcon = (p: P) => (
  <S strokeWidth={1.7} {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></S>
);
export const FileTextIcon = (p: P) => (
  <S strokeWidth={1.7} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></S>
);
export const LinkIcon = (p: P) => (
  <S strokeWidth={1.7} {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></S>
);
export const ExternalLinkIcon = (p: P) => (
  <S strokeWidth={1.9} {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></S>
);
export const CpuIcon = (p: P) => (
  <S strokeWidth={1.7} {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></S>
);
export const ShieldIcon = (p: P) => (
  <S strokeWidth={1.7} {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></S>
);
export const AlertIcon = (p: P) => (
  <S strokeWidth={1.8} {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></S>
);
export const QuarantineIcon = (p: P) => (
  <S strokeWidth={1.7} {...p}><circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /></S>
);
export const ScaleIcon = (p: P) => (
  <S strokeWidth={1.7} {...p}><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></S>
);
export const ArrowUpIcon = (p: P) => <S strokeWidth={2.4} size={13} {...p}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></S>;
export const MenuIcon = (p: P) => (
  <S strokeWidth={2} {...p}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></S>
);
export const HelpIcon = (p: P) => (
  <S strokeWidth={1.8} {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></S>
);
export const RotateIcon = (p: P) => (
  <S strokeWidth={1.8} {...p}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></S>
);
