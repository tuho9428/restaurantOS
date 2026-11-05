import type { Metadata } from "next";
import "./globals.css";
import { runtimeEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "RestaurantOS",
  description: "Restaurant operations workspace",
};

export const runtime = "nodejs";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Evaluate validated server configuration at startup/render without serializing it to clients.
  void runtimeEnv.APP_ENV;

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
