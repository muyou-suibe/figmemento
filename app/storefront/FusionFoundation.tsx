import type { HTMLAttributes, ReactNode } from "react";
import styles from "./fusion-foundation.module.css";

type ClassNameProps = { className?: string };

function classes(...names: Array<string | undefined>) {
  return names.filter(Boolean).join(" ");
}

export function EditorialHeading({ eyebrow, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { eyebrow?: ReactNode }) {
  return (
    <div className={classes(styles.editorialHeading, className)} {...props}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <h2>{children}</h2>
    </div>
  );
}

export function Eyebrow({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement> & ClassNameProps) {
  return <p className={classes(styles.eyebrow, className)} {...props}>{children}</p>;
}

export function PaperCard({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={classes(styles.paperCard, className)} {...props}>{children}</article>;
}

export function MediaFrame({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes(styles.mediaFrame, className)} {...props}>{children}</div>;
}

export function DoubleRule({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={classes(styles.doubleRule, className)} role="separator" {...props} />;
}

export function Annotation({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={classes(styles.annotation, className)} {...props}>{children}</p>;
}

export function StatusBlock({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={classes(styles.statusBlock, className)} {...props}>{children}</section>;
}

export function ActionRow({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes(styles.actionRow, className)} {...props}>{children}</div>;
}

export function ResponsiveGrid({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes(styles.responsiveGrid, className)} {...props}>{children}</div>;
}

export function PolaroidFrame({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return <figure className={classes(styles.polaroidFrame, className)} {...props}>{children}</figure>;
}

export function WashiTape({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" className={classes(styles.washiTape, className)} {...props} />;
}

export function PinAccent({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" className={classes(styles.pinAccent, className)} {...props} />;
}
