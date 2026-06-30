import { type ReactNode } from "react";

import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/jetbrains-mono/400.css";

import "../styles.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div lang="en" className="min-h-screen">
      {children}
    </div>
  );
}
