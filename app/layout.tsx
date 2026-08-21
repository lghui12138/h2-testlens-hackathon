import type { Metadata } from "next";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "H₂ TestLens · 氢能测试智报",
  description: "面向氢能设备测试工程师的测试数据分析与自动报告在线原型。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
