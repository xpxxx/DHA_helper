# DHA Helper · 处方计价

给迪拜中医师朋友 Gia 用的处方价格计算器（GitHub Pages 静态站）。

## 功能

- 搜索草药 / 中成药并加入处方
- 草药按 **克**、中成药按 **盒** 计价
- 显示单价、小计、处方总价（DHS）
- 展示草药 ↔ 中成药关联（相关成药 / 已知含）
- 目录中未找到时，可添加 **临时药品** 并手填单价

## 本地预览

```bash
# 如需从 Excel 重新生成数据
pip install -r preprocess/requirements.txt
python3 preprocess/build_data.py

# 启动本地静态服务（勿直接用 file:// 打开，否则无法加载 JSON）
python3 -m http.server 8080
```

浏览器打开 <http://localhost:8080>。

## 更新药价数据

1. 更新根目录的 `药品.xlsx`、`药品零售价.xlsx`
2. 运行 `python3 preprocess/build_data.py`
3. 提交并推送 `data/medicines.json`

预处理会：去掉无单价条目、同名同价去重、清洗括号、写入草药/成药双向关联。

## GitHub Pages

仓库 Settings → Pages → Source 选择 **Deploy from a branch**，Branch 选 `main` / `/ (root)`。

站点地址一般为：`https://<用户名>.github.io/DHA_helper/`
