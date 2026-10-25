# 大肥鱼快跑 · 站点

纯静态站点，无构建、无依赖。任意静态服务器都能跑。

## 结构

```
index.html            页面外壳：只负责加载内容、校验、启动引擎
engine/game.js        引擎：规则、物理、渲染、界面（不含任何具体内容）
content/sprites.json  角色像素图 + 调色板 + 缩放
content/items.json    装饰品（id / slot / 名字 / 价格 / 描述）
content/enemies.json  怪物定义（血量、尺寸、配色、行为参数）
content/chapter1.json 篇章：关卡表、主题配色、计分规则、buff 池
```

**加内容不用改引擎：**

| 想加什么 | 改哪个文件 |
|---|---|
| 新关卡 | `chapter1.json` 的 `levels` 数组加一条 |
| 新怪物（沿用已有行为） | `enemies.json` 加一条，再在 `chapter1.json` 里调权重 |
| 新怪物（全新行为） | `engine/game.js` 写一个行为分支，再登记到 `enemies.json` |
| 新装饰品 | `items.json` 加一条 + 在 `engine/game.js` 的 `drawCostume` 里加一段绘制 |
| 新篇章 | 复制 `chapter1.json` 为 `chapter2.json`，在 `index.html` 里按需加载 |

## 本地跑

站点要经过 HTTP 才能加载 json 和模块（`file://` 会被 CORS 拦），二选一：

```powershell
python -m http.server 8080
```

或任何静态服务器。然后打开 http://127.0.0.1:8080/

## 上线

推到一个支持静态托管的平台即可，不需要构建步骤：

- **GitHub Pages**：仓库根目录放这些文件，Settings → Pages → Deploy from branch
- **Cloudflare Pages**：连仓库，构建命令留空，输出目录填 `/`
- **Vercel / Netlify**：同上

## 调试参数

`?dev=1&lv=3`：直接进第 3 关（两个参数都给才生效，正常打开不受影响）。

## 存档

`localStorage` 的 `dfy_save`，带 `v` 字段用于以后迁移。清空存档：控制台执行
`localStorage.removeItem('dfy_save')`。
