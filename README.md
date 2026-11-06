# DHA Helper · 处方计价

给迪拜中医师朋友 Gia 用的处方价格计算器（GitHub Pages 静态站）。

## 功能

- 搜索草药 / 中成药并加入处方
- 草药按 **克**、中成药按 **盒** 计价
- 显示单价、小计、处方总价（DHS / AED · درهم）
- 处方药名与价格支持 **中文 · English · العربية**（方便当地顾客阅读）
- 展示草药 ↔ 中成药关联（相关成药 / 已知含）
- 目录中未找到时，可添加 **临时药品** 并手填单价与可选英/阿文名

## 本地预览

```bash
# 如需从 Excel 重新生成数据
pip install -r preprocess/requirements.txt
python3 preprocess/build_data.py

# 生成 / 更新英阿译名（首次或药名变更后）
python3 preprocess/build_translations.py

# 启动本地静态服务（勿直接用 file:// 打开，否则无法加载 JSON）
python3 -m http.server 8080
```

浏览器打开 <http://localhost:8080>。

## 更新药价数据

1. 更新根目录的 `药品.xlsx`、`药品零售价.xlsx`
2. 运行 `python3 preprocess/build_data.py`
3. 若有新药名，再运行 `python3 preprocess/build_translations.py`
4. 提交并推送 `data/medicines.json`（及 `data/name_i18n.json`）

预处理会：去掉无单价条目、同名同价去重、清洗括号、写入草药/成药双向关联。  
译名可在 `preprocess/build_translations.py` 的 `MANUAL_OVERRIDES` 或 `data/name_i18n.json` 中人工校正。

## Google Sheet 在线维护（推荐）

网站可优先读取 Google Sheet，并在在线接口不可用时自动回退到 `data/medicines.json`。

当前在线目录：[DHA Helper 药品目录](https://docs.google.com/spreadsheets/d/1lURO_8sq10IZZH7i7dhmERJk-DcpKzxiuVYqwbjMl54/edit)

1. 将当前药品目录导入 Google Sheets，工作表名称保持为 `药品目录`
2. 打开 Google Sheets 的“扩展程序 → Apps Script”
3. 将 `google_apps_script/Code.gs` 粘贴到绑定脚本并部署为 Web App
4. 执行身份选择脚本所有者，访问权限选择任何人
5. 将部署所得 `/exec` URL 填入 `js/config.js` 的 `dataApiUrl`

表格中的 `DHA Helper` 菜单可生成所选行的免费机器翻译并检查目录数据。英阿名称属于 AI 初译，正式使用前建议人工复核。
在线接口使用 5 分钟缓存；编辑表格后，网站最多约 5 分钟显示新数据。Google Sheets、Apps Script 与 GitHub Pages 在常规免费额度内均无需付费。

## GitHub Pages

仓库 Settings → Pages → Source 选择 **Deploy from a branch**，Branch 选 `main` / `/ (root)`。

站点地址一般为：`https://<用户名>.github.io/DHA_helper/`
