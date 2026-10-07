# Web ReNamer —— 自托管 Docker 版文件批量重命名工具 · 方案设计

> 目标：做一个跑在 Docker 里的 Web 应用，功能对齐 ReNamer（den4b）的核心能力，但**彻底去掉 Lite 版的规则数 / 预设数限制**，并且支持远程访问、自动化、可自托管。

---

## 0. 已确认的决定（落地版）

| 议题 | 决定 |
| --- | --- |
| 技术栈 | 后端 **Node.js + TypeScript + Fastify + 内置 node:sqlite**；前端 **React + Vite + Tailwind v4** |
| UI 风格 | 现代化深色界面，三栏布局（文件浏览器 / 规则链 / 预览·历史·监听），支持明暗主题 |
| 文件夹重命名 | **不做**，只处理文件 |
| 目录监听自动改名 | **做**，且带开关（右侧「监听」标签页） |
| 发布 | **只放本地**，暂不上传 GitHub |

> 下文是原始方案设计，实现基本按其落地。**规则类型已全部实现**，共 16 种：
> 插入 / 替换 / 正则替换 / 移除 / 大小写 / 扩展名 / 序列号 / 清理空白 / 清理非法字符 / 补位 / 随机字符串 /
> 重排（Rearrange）/ 拼音转写（Translit）/ 日期重格式化（Reformat Date）/ 元标签 / JS 脚本。
> 唯一的有意替换：脚本规则用 JavaScript 沙箱替代 ReNamer 的 Pascal 脚本；哈希类元标签
> （MD5/CRC32/SHA1）未纳入，元标签只覆盖音频 ID3 与图片 EXIF。

---

## 1. 定位与为什么要自己做

| 维度 | ReNamer Lite（桌面免费） | 本项目（Docker 自托管） |
|---|---|---|
| 规则数量 | 每规则集最多 5 条 | 无限 |
| 预设数量 | 最多 5 个 | 无限，支持目录分类 |
| 商业用途 | 不允许 | 自己用，无限制 |
| 访问方式 | 只能本机 GUI | 浏览器，局域网/远程均可 |
| 自动化 | 手动点 | API / CLI / 定时任务 |
| 平台 | 仅 Windows | 任何能跑 Docker 的机器 |

**核心价值 = 无限制 + 跨平台 + 可自动化。** 桌面版能干的活它都能干，桌面版干不了的（远程、批量脚本调用、定时跑）也能干。

> 注意一个前提：Docker 里的应用只能操作**挂载进来的目录**。所以使用方式是把自己要处理的文件夹挂进容器
> （Windows/macOS 用 Docker Desktop 挂本地盘，NAS 直接挂存储卷）。这是这类工具绕不开的模型，方案里会重点处理安全边界。

---

## 2. 功能范围（分阶段）

### 2.1 重命名规则（对齐 ReNamer 规则类型）
- 基础：插入(Insert)、删除(Delete)、移除(Remove)、替换(Replace)、大小写(Case)、扩展名(Extension)、去空格/符号(Strip)
- 序列：Serialize（自增编号，可设置起始/步长/位数/按目录重置）
- 定位：Rearrange（按分隔符/位置重排片段）、Padding（补零/补齐）、Simplify
- 高级：正则(RegEx)、随机化(Randomize)、音译(Translit 拼音→拉丁等)、日期重格式化(Reformat Date)
- 元标签(Meta Tags)：从文件内容提取 `<title> <artist> <track> <year>`、EXIF 拍摄时间、以及 MD5/CRC32/SHA1 哈希
- 脚本规则：**用 JavaScript 替代 Pascal**（见 6.5）

每条规则都有：启用开关、作用域（主名/扩展名/整体）、匹配条件、执行顺序。

### 2.2 规则集 / 预设
- 规则集 = 有序的规则栈，可保存、加载、克隆、导入导出（JSON）
- 预设**无限个**，支持目录分组（这是干掉 Lite 限制的关键点）
- 内置一批常用模板（照片按拍摄日期、音乐 `艺术家-曲目-标题`、电视剧补零集数等）

### 2.3 操作流程（对齐 ReNamer 三栏心智）
`源文件列表` → `规则栈` → `预览(old→new)` → `执行` → `可撤销`

### 2.4 安全与可逆
- 干跑预览：先算出改名映射，标出冲突/非法字符/重名，确认后才真正执行
- 全量撤销：每次执行写日志，可一键回滚到操作前状态
- 冲突策略：中止 / 跳过 / 自动加后缀 / 覆盖（每任务可选）

### 2.5 自动化（桌面版没有的加分项）
- REST API + 命令行
- 定时任务 / 监听目录：满足条件自动跑某个预设
- 可选：执行后 webhook 通知

---

## 3. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 后端 | **Node.js 20 + TypeScript + Fastify** | 前后端同语言、开发快、生态全、Docker 友好 |
| 前端 | **React + Vite + TS**，组件库 Ant Design / Mantine | 表格/表单密集，现成组件省事 |
| 状态/存储 | **SQLite**（better-sqlite3）存预设、历史；配置卷持久化 | 单文件、零运维、容器里最稳 |
| 元标签 | `exiftool`（EXIF/综合）+ `music-metadata`（ID3）+ Node `crypto`（哈希） | 覆盖度最全 |
| 脚本沙箱 | Node `vm`（超时 + 禁 require/fs） | 安全 & 用户熟悉 |
| 校验 | Zod（规则 schema / API 入参） | 运行时校验，避免脏数据 |
| 测试 | Vitest（引擎单测）+ 真实临时目录（执行器）+ Playwright（E2E） | 改名逻辑必须可回放 |
| 打包 | 多阶段 Dockerfile，runtime 用 `node:20-alpine` 或 distroless | 镜像小、启动快 |

> 备选：如果你更想要「一个静态二进制、镜像更小」，后端可以换 **Go**。TS 的优势是开发迭代快、前后端一套类型。这个点建议你拍板。

---

## 4. 系统架构

```
┌──────────────────────── 浏览器 (React SPA) ────────────────────────┐
│  源文件浏览器 │ 规则栈编辑 │ 预览表格 │ 预设管理 │ 历史/撤销          │
└───────────────────────────────┬───────────────────────────────────┘
                                │ REST / JSON
┌───────────────────────────────▼───────────────────────────────────┐
│                     后端服务 (Fastify, 单容器)                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌─────────────┐  │
│  │ 文件浏览/   │  │ 规则引擎    │  │ 计划&执行器 │  │ 预设/历史库  │  │
│  │ 路径安全闸  │  │ (纯函数)    │  │ (两阶段改名)│  │ (SQLite)    │  │
│  └────────────┘  └────────────┘  └────────────┘  └─────────────┘  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                   │
│  │ 元标签提取  │  │ JS 脚本沙箱 │  │ 定时/监听   │                   │
│  └────────────┘  └────────────┘  └────────────┘                   │
└──────────────┬───────────────────────────────┬────────────────────┘
        /data (待处理文件, 可多挂载)        /config (预设/DB/日志, 持久卷)
```

---

## 5. 数据模型（核心）

```ts
type RuleType =
  | 'insert' | 'delete' | 'remove' | 'replace' | 'case' | 'extension'
  | 'strip' | 'serialize' | 'rearrange' | 'padding' | 'simplify'
  | 'regex' | 'randomize' | 'translit' | 'reformat-date'
  | 'meta' | 'script';

interface Rule {
  id: string;
  type: RuleType;
  enabled: boolean;
  name?: string;                 // 用户备注
  scope: 'name' | 'ext' | 'full';
  params: Record<string, unknown>; // 各规则的参数，Zod 校验
}

interface RuleSet {
  id: string;
  name: string;
  folder?: string;               // 预设分组目录
  rules: Rule[];                 // 有顺序
  createdAt: string;
  updatedAt: string;
}

// 预览/执行计划
interface PlanItem {
  src: string;
  dst: string;
  status: 'ok' | 'conflict' | 'invalid' | 'unchanged' | 'skipped';
  reason?: string;
}

// 历史（撤销依据）
interface Journal {
  id: string;
  root: string;
  createdAt: string;
  entries: { from: string; to: string }[]; // 执行前 from→to，用于反向回滚
  undone?: boolean;
}
```

规则求值签名（纯函数，便于测试）：
```ts
applyRules(input: { name: string; ext: string; path: string; meta: MetaTags },
           rules: Rule[], ctx: { index: number; total: number; dir: string })
  => { name: string; ext: string }
```

---

## 6. 关键难点与对策

### 6.1 路径安全闸
- 所有文件操作前，`path.resolve` + `fs.realpath`，强制落在白名单根目录内
- 拒绝 `..`、拒绝符号链接逃逸、拒绝绝对路径注入
- 根目录由启动参数/环境变量指定（`ROOTS=/data,/photos`），前端只能在这几个根里浏览

### 6.2 两阶段改名（保证安全 & 可逆）
直接逐个 `rename` 会在这些场景翻车：**交换**（A→B、B→A）、**成环**、**仅改大小写**（Windows/macOS 大小写不敏感，`A.txt→a.txt` 直接改会失败或无效）。
对策：
1. 先算完整计划，检测冲突与环
2. 凡涉及环/交换/仅改大小写，先全部改到**唯一临时名**（`.wr-tmp-<uuid>`）
3. 第二步由临时名改到最终名
4. 每步写入 Journal，失败可回滚
5. 同一文件系统内 rename 是原子的；不触碰文件内容

### 6.3 跨平台文件名差异
- Windows 非法字符 `\ / : * ? " < > |`、保留名 `CON/PRN/AUX/NUL/COM1...`、结尾空格与点
- 路径长度限制（260 字符）
- 校验阶段就给出明确报错，而不是执行到一半炸掉

### 6.4 元标签
- 统一占位符语法，例如 `{title}`、`{artist}`、`{track:2}`（补零 2 位）、`{exif.date:yyyyMMdd}`、`{md5:8}`
- 提取失败不中断，占位符留空或按策略跳过该文件

### 6.5 脚本规则（用 JS 取代 Pascal）
- 提供 `rename(name, ext, meta)` 钩子，用户在文本框写 JS
- 跑在 Node `vm` 里：无 `require`/`fs`/网络，设置执行超时（如 200ms）与内存上限
- 明确告知这是**对 ReNamer Pascal 脚本的有意替换**，无法直接搬运 Pascal 代码

### 6.6 性能
- 万级文件的预览：规则求值纯内存计算，分批返回；目录扫描流式处理
- 大目录用虚拟滚动表格

---

## 7. Docker 交付设计

**镜像**：多阶段构建，runtime 非 root，暴露 7582（可用 `PORT` 覆盖）。

**卷**：
- `/data`（或自定义多根）→ 待处理的文件目录（挂本地盘/NAS 卷）
- `/config` → SQLite、预设、日志（**必须持久化**，否则重建容器丢预设）

**关键环境变量**：
```
ROOTS=/data,/photos      # 允许操作的根目录
CONFIG_DIR=/config
PUID=1000 / PGID=1000    # 以指定用户读写宿主文件（NAS 场景必需）
PORT=7582
```

**compose 示例**：
```yaml
services:
  web-renamer:
    image: yourname/web-renamer:latest
    ports: ["7582:7582"]
    environment:
      ROOTS: /data
      PUID: 1000
      PGID: 1000
    volumes:
      - /path/to/your/files:/data     # 要改名的文件
      - ./renamer-config:/config      # 预设与历史，持久化
    restart: unless-stopped
```

**NAS 面板（群晖/威联通/极空间等）适配**：不依赖外部服务、纯环境变量配置、日志走 stdout、PUID/PGID 可设，符合「只能面板操作、不能 SSH」的部署方式。

---

## 8. API 草案

```
GET    /api/roots                       # 可浏览的根目录
GET    /api/browse?path=/data/sub       # 列目录
POST   /api/preview                     # {root, paths[], rules} → PlanItem[]
POST   /api/apply                       # {plan} → {journalId, results}
POST   /api/undo                        # {journalId}
GET    /api/rulesets                    # 预设列表（可 ?folder=）
POST   /api/rulesets                    # 新建/保存
PUT    /api/rulesets/:id
DELETE /api/rulesets/:id
POST   /api/rulesets/:id/run            # 服务端对某目录直接跑（自动化）
GET    /api/history
```

---

## 9. 里程碑

| 阶段 | 内容 | 产出 |
|---|---|---|
| **M1 · MVP** | 单根目录 + 6 个基础规则 + 预览 + 执行 + 撤销 + 最简 UI | 能端到端跑通改一批文件 |
| **M2 · 功能对齐** | 全部标准规则 + 正则 + 无限预设/分组 + 文件夹重命名 + 冲突策略 | 与 ReNamer 核心持平 |
| **M3 · 高级** | 元标签 + JS 脚本 + 多根目录 + 导入导出 | 超出 Lite 能力 |
| **M4 · 交付运营** | Dockerfile/compose 打磨 + NAS 适配 + REST/CLI + 定时/监听 | 可分享、可自托管 |

每阶段都带测试：引擎用 golden case 单测；执行器用真实临时目录验环/大小写/冲突；UI 走 Playwright。

---

## 10. 风险与取舍

1. **文件位置**：容器只能改挂载目录 → 需要用户理解挂载；给清晰的 compose 模板与文档即可。
2. **脚本语言替换**：Pascal → JS，老脚本不能直接迁移（可接受，用户群以新写为主）。
3. **元标签覆盖度**：依赖 exiftool，需求上不可能 100% 对齐，覆盖主流格式即可。
4. **沙箱安全**：JS 脚本是唯一「用户可执行代码」入口，必须严格隔离；也可提供「关掉脚本功能」的开关。
5. **Windows 文件名规则**：校验要提前、报错要准。

---

## 待你拍板的点
1. 后端 TS 还是 Go？（TS 开发快，Go 镜像小）
2. 前端组件库：Ant Design 还是 Mantine？
3. M1 是否就包含「文件夹重命名」，还是只做文件？
4. 是否需要「监听目录自动改名」这种无人值守能力？
