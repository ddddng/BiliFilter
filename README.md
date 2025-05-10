# BiliFilter —— 基于本地LLM的 Bilibili 弹幕过滤器

> 本项目依赖 Hugging Face 上的配套微调模型  
> [`dddng/gemma3_4b_BiliFilter_v2`](https://huggingface.co/dddng/gemma3_4b_BiliFilter_v2)

借助 **[LM Studio](https://lmstudio.ai/)** 的 OpenAI 兼容本地接口，你可以在本地过滤B站弹幕。浏览器中只需安装脚本。

---

## ✨ 特性

* **本地运行**：所有推理均在本地完成  
* **多种分类**：色情低俗、恶意刷屏、人身攻击、垃圾广告、引战、剧透、错误科普、正常、未分类  
* **即装即用**：无需修改网页源代码，脚本自动 Hook 弹幕  
* **可调策略**：保留 / 隐藏指定分类、调试模式、并发与队列长度等均可一键修改

---

## 🚀 快速开始

### 1. 安装 LM Studio 并下载模型

1. 前往 <https://lmstudio.ai> 下载安装包并安装  
2. 下载`dddng/gemma3_4b_BiliFilter_v2`

### 2. 启动本地 OpenAI 兼容服务器并启用 CORS

1. 前往 **开发者**
2. 点击左上 **Settings**，勾选 **启用 CORS**  
3. 确认「Status」为 **Running**，端口默认为 **1234**

### 3. 安装浏览器脚本

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)  
2. 点击「新建脚本」，粘贴BiliFilter.js的内容
3. 保存并刷新页面

## ⚙️ 高级配置

| 变量 | 功能 | 默认值 |
|------|------|--------|
| `BATCH_SIZE` | 单次推送给模型的弹幕数 | `10` |
| `MAX_CONCURRENT_REQUESTS` | 并发请求上限 | `2` |
| `KEEP_CATEGORIES` | 永远保留的分类集合 | `['正常', '未分类']` |
| `SHOW_CATEGORY` | `true` 时在弹幕后追加 `[分类]` | `false` |
| `DEBUG` | 控制台输出调试信息 | `false` |
| `HIDE_BEFORE_RESPONSE` | 设置是否在 API 返回之前隐藏弹幕 | `true` |
| `BATCH_TIMEOUT` | 批次超时设置（单位：毫秒） | `500` |
| `MAX_QUEUE_LENGTH` | 排队弹幕的最大数量 | `0`（不排队） |
