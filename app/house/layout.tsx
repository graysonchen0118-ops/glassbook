import type { Metadata } from "next";

export const metadata: Metadata = { title: "House" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
