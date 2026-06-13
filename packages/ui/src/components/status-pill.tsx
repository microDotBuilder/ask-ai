import type { HTMLAttributes, ReactNode } from "react";

export type StatusPillProps = HTMLAttributes<HTMLSpanElement> & {
  state?: string;
  children: ReactNode;
};

export function StatusPill({ children, state, ...props }: StatusPillProps) {
  return (
    <span data-state={state} {...props}>
      {children}
    </span>
  );
}
