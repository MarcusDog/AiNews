# Trading Gym 前端临时覆盖

> **发布纪律提醒**：2026-10-02 起，本仓库同时存在**源码层改动**与**dist 直注**，每次改动必须两边都改。

---

2026-10-01：用户要求隐藏 K 线画图工具栏（`.chart-drawing-tools`）。

## 改动位置
`apps/web/dist/assets/index-W6ctCzeU.css` 文件末尾追加：

```css
.chart-drawing-tools{display:none!important}
.chart-shell.drawing-active{cursor:default!important}
```

## ⚠️ 注意事项
- 这是直接修改 dist 的临时改动，**`npm run build` 会重写 dist 覆盖这条规则**
- 真正长期修复应该改 `src/styles.css` 然后重新 build
- 或者改 `src/ReplayChart.tsx` line 663 把 `<div className="chart-drawing-tools">...</div>` 整段删掉
- 浏览器需要 **Ctrl+F5 硬刷新**才能看到效果（命中 304 缓存）

---

2026-10-02：用户反馈"紫色成本线字太大挡住日 K 线"。

### 改动一（**源码层**）
`apps/web/src/ReplayChart.tsx` line 869–873，注释从"最新价标签"改为"成本价标签"并整体缩小：

```diff
- {/* 最新价标签 */}
+ {/* 成本价标签（字号缩小，避免遮挡日K线）*/}
  {costPrice && costPrice > 0 && ... && (
    <g className="cost-line">
      <line ... stroke="#7c3aed" strokeWidth="1.2" strokeDasharray="7 5" />
-     <rect x={AXIS_X - 78} y={scale.yFor(costPrice) - 10} width="76" height="19" rx="5" fill="#7c3aed" />
-     <text x={AXIS_X - 40} y={scale.yFor(costPrice) + 3.5} fontSize="10" fill="#fff" textAnchor="middle">成本 {costPrice.toFixed(2)}</text>
+     <rect x={AXIS_X - 60} y={scale.yFor(costPrice) - 7} width="58" height="13" rx="3" fill="#7c3aed" />
+     <text x={AXIS_X - 31} y={scale.yFor(costPrice) + 3} fontSize="8" fill="#fff" textAnchor="middle">成本 {costPrice.toFixed(2)}</text>
    </g>
  )}
```

字号 10 → 8，rect 高度 19 → 13（保持文字垂直居中），宽度 76 → 58。

### 改动二（**dist 直注** — 同步生效）
服务器无 web 依赖（`node_modules/` 缺失，`tsc: not found`），无法本地 build，已同步把 dist js 里相同段落（`x:870 width:76 height:19 rx:5 fontSize:10`）改成 `x:888 width:58 height:13 rx:3 fontSize:8`（`AXIS_X=948`，减 60=888，中心点 917）。

### 验收
- 浏览器 **Ctrl+F5 硬刷新**后生效
- 成本标签不再覆盖日 K 线主体
- ⚠️ 真正长期修复仍需在本地 `npm run build` 后回传；下次 build 会把 dist 重建为源码版本（已一致，无需额外动作）
