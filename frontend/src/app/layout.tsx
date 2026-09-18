import type { Metadata } from "next";
import "./globals.css";
import VoiceAssistant from "@/components/VoiceAssistant";


export const metadata: Metadata = {

  title:
    "LogiShield | Yash Shelke",

  description:
    "LogiShield - Logistics Disruption Prediction & Recovery Intelligence System developed by Yash Shelke.",

  authors: [
    {
      name: "Yash Shelke",
    },
  ],

  creator:
    "Yash Shelke",

  publisher:
    "Yash Shelke",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (

    <html lang="en">

      <body>

        {children}

        <VoiceAssistant />

      </body>

    </html>
  );
}