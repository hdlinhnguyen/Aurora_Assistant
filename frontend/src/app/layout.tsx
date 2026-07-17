import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aurora Socratic Assistant — Học thật, hiểu thật",
  description:
    "Hệ thống AI gia sư phản biện giúp học sinh cấp 1 tự tư duy tìm ra đáp án, kết hợp dashboard thông minh cho giáo viên.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
