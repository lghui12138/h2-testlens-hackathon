import "../src/styles.css";

export const metadata = {
  title: "H₂ TestLens · 氢能测试智报",
  description: "面向氢能设备测试工程师的测试数据分析与自动报告在线原型。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "H₂ TestLens · 氢能测试智报", description: "T02 氢能设备测试数据分析与自动报告原型。", images: ["/og-card.svg"] },
  twitter: { card: "summary_large_image", title: "H₂ TestLens · 氢能测试智报", description: "T02 氢能设备测试数据分析与自动报告原型。", images: ["/og-card.svg"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
