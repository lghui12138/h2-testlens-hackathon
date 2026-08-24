# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [v3.5.40] - 2026-08-24

### Added
- 4 条计算准确性回归测试（电流平台容差、稳定窗口边界、绝缘 censored 判定、Theil-Sen 趋势）

### Changed
- 电流平台识别加入分箱容差，减少微小波动导致平台分裂
- 稳定窗口检测加入浮点容差，避免采样间隔边界漏判
- 绝缘阻值过滤改为显式谓词，确保 65535/0/负值/非数值安全处理
- 性能趋势线性回归升级为 Theil-Sen 鲁棒估计器

### Fixed
- 修复 public/src/app.mjs 与 src/app.mjs 输入面不一致问题

## [v3.5.39] - 2026-08-24

### Added
- 真实企业数据回归验证：青川科技 38,257 行电堆样例、氢质氢离 20,294/12,945 行车辆样例
- 新增 projects/h2-testlens.html GitHub Pages 项目页
- Python 增强版仓库：t02-equipment-test-report-assistant

### Changed
- npm test 达到 190/190 全绿
- README 升级并链接 Python 增强版
