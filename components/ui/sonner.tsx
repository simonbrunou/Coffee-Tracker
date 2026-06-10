"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// No custom `icons` override — Sonner's own built-in type icons render for the
// app's toast.success()/error() (the email-verification toasts); plain toast()
// calls show no icon either way. This swaps those two toasts' glyphs from the old
// lucide ones to Sonner's defaults, and drops the icon dependency for five glyphs.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
