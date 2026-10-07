// Distill — component types (documentation). Hand-written from app/page.tsx; exposed as window.Distill.
import type * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = `action` fill; secondary = `line-strong` outline. Default "primary". */
  variant?: "primary" | "secondary";
  /** md = form submit (`ui`, radius-lg); sm = toolbar download actions (`caption-strong`, radius-md). Default "md". */
  size?: "md" | "sm";
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface TabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The selected segment: `action` fill with `on-action` text. */
  active?: boolean;
}
export declare function Tab(props: TabProps): React.ReactElement;

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export declare function TextField(props: TextFieldProps): React.ReactElement;

export interface DropzoneProps {
  /** Files already selected; switches the label to "N images selected — add more". */
  count?: number;
  onFiles?: (files: File[]) => void;
  accept?: string;
  id?: string;
  className?: string;
}
export declare function Dropzone(props: DropzoneProps): React.ReactElement;

export interface ThumbnailProps {
  src: string;
  alt?: string;
  /** Shows the hover-revealed × button when set. */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}
export declare function Thumbnail(props: ThumbnailProps): React.ReactElement;

export interface AlertProps {
  /** danger = request error; warning = degraded result; hint = setup advice. Default "danger". */
  tone?: "danger" | "warning" | "hint";
  /** Bold one-line verdict before the detail. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}
export declare function Alert(props: AlertProps): React.ReactElement;

export interface BadgeProps {
  /** default = header mode kicker; provenance = 10px uppercase label beside a section title. */
  variant?: "default" | "provenance";
  children?: React.ReactNode;
  className?: string;
}
export declare function Badge(props: BadgeProps): React.ReactElement;

export interface ChipProps {
  /** outline = contrast pair; filled = identity adjective; tag = font-family tag (radius-md). Default "outline". */
  variant?: "outline" | "filled" | "tag";
  /** Appends a bold WCAG verdict word in `pass-ink` or `fail-ink`. */
  verdict?: "AAA" | "AA" | "AA-large" | "fail" | string;
  children?: React.ReactNode;
  className?: string;
}
export declare function Chip(props: ChipProps): React.ReactElement;

export interface SwatchProps {
  role: string;
  hex: string;
  usage?: string;
  /** 0–1 share of the page area; shown as a percentage after usage. */
  areaWeight?: number;
  /** Adds the faint "img" marker: the colour came from image pixels, not the DOM. */
  imageSourced?: boolean;
  className?: string;
}
export declare function Swatch(props: SwatchProps): React.ReactElement;

export interface MetaItemProps {
  label: string;
  value: string;
  className?: string;
}
/** Render inside a `<dl className="dt-meta">`. */
export declare function MetaItem(props: MetaItemProps): React.ReactElement;

export interface SectionTitleProps {
  children?: React.ReactNode;
  /** "measured" | "inferred" | "ai" — rendered as a provenance Badge. */
  provenance?: string;
  className?: string;
}
export declare function SectionTitle(props: SectionTitleProps): React.ReactElement;

export interface MoodListProps {
  label: string;
  items: string[];
  className?: string;
}
export declare function MoodList(props: MoodListProps): React.ReactElement;

export interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
}
export declare function CodeBlock(props: CodeBlockProps): React.ReactElement;

export interface TokenSampleProps {
  kind?: "spacing" | "radius" | "shadow";
  /** spacing: px number; radius: CSS length; shadow: box-shadow string. */
  value: number | string;
  /** Shadow level name, e.g. "sm". */
  name?: string;
}
export declare function TokenSample(props: TokenSampleProps): React.ReactElement;
