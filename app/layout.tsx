import "../src/styles.css";

export const metadata = {
  metadataBase: new URL("https://lghui12138.github.io/h2-testlens-hackathon/"),
  title: "H₂ TestLens · 氢能测试数据分析系统",
  description: "面向氢能设备测试工程师的测试数据分析与自动报告在线原型。",
  alternates: { canonical: "https://lghui12138.github.io/h2-testlens-hackathon/" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { type: "website", url: "https://lghui12138.github.io/h2-testlens-hackathon/", title: "H₂ TestLens · 氢能测试数据分析系统", description: "T02 氢能设备测试数据分析与自动报告原型。", images: ["https://raw.githubusercontent.com/lghui12138/h2-testlens-hackathon/main/public/og-card.svg"] },
  twitter: { card: "summary_large_image", title: "H₂ TestLens · 氢能测试数据分析系统", description: "T02 氢能设备测试数据分析与自动报告原型。", images: ["https://raw.githubusercontent.com/lghui12138/h2-testlens-hackathon/main/public/og-card.svg"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
