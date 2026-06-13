import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
};

export function IconButton({ children, label, title, type = "button", ...props }: IconButtonProps) {
  return (
    <button aria-label={label} title={title ?? label} type={type} {...props}>
      {children}
    </button>
  );
}
