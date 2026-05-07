# Cloudflare Worker 导航维护方案

这个方案适合：

- 页面托管在 GitHub Pages
- 没有自己的服务器
- 仍然希望“管理员在线维护导航，其他访问者下次打开看到最新结果”

## 架构

- `index.html` 继续放在 GitHub Pages
- 页面优先请求 Cloudflare Worker 的 `/api/nav-config`
- 如果 Worker 暂时不可用，页面会回退到仓库里的静态 `nav-config.json`
- 管理员在“设置”里输入口令后，可通过 Worker 把最新导航配置保存到 Cloudflare KV

## 目录

- Worker 入口：[index.mjs](/Users/mac/code/Zenkmap/deploy/cloudflare-worker/index.mjs:1)
- Wrangler 示例配置：[wrangler.toml.example](/Users/mac/code/Zenkmap/deploy/cloudflare-worker/wrangler.toml.example:1)

## 部署步骤

1. 安装 Wrangler

```bash
npm install -g wrangler
```

2. 登录 Cloudflare

```bash
wrangler login
```

3. 创建 KV Namespace

```bash
wrangler kv namespace create NAV_CONFIG_KV
```

把返回的 namespace id 填到 `wrangler.toml` 里。

4. 复制配置文件

```bash
cp deploy/cloudflare-worker/wrangler.toml.example deploy/cloudflare-worker/wrangler.toml
```

把下面这个值改掉：

- `id` 改成你自己的 KV namespace id

`ALLOWED_ORIGIN` 默认可以保持 `*`，这样本地预览、GitHub Pages 和自定义域名都能访问。  
如果你后面只想允许单一正式域名，再把它改成你的站点 origin，例如：`https://zenkagent.github.io`

5. 设置管理员口令

```bash
cd deploy/cloudflare-worker
wrangler secret put NAV_ADMIN_PASSWORD
```

6. 部署 Worker

```bash
wrangler deploy
```

部署成功后，你会拿到一个类似这样的地址：

```text
https://zenk-nav-config.xxx.workers.dev
```

## 让 GitHub Pages 页面接入 Worker

打开根目录 [index.html](/Users/mac/code/Zenkmap/index.html:1)，把这行：

```html
<meta name="zenk-nav-config-api" content="">
```

改成：

```html
<meta name="zenk-nav-config-api" content="https://你的-worker地址.workers.dev/api/nav-config">
```

然后把 `index.html` 推到 GitHub。

## 验证

1. 打开 GitHub Pages 页面
2. 点击右上角“设置”
3. 输入管理员口令并解锁
4. 新增或编辑导航
5. 点击“保存全部变更”
6. 刷新页面，或让别人重新打开页面，确认看到最新导航

## 说明

- Worker 只负责导航配置，不影响你页面其他内容
- 即使 Worker 暂时不可用，页面也仍会用静态 `nav-config.json` 正常展示
- 如果你未来想把截图、其它页面配置也做成在线维护，这个 Worker 模式也能继续扩展
- 如果你在中国大陆网络下访问 `workers.dev` 仍然不稳定，下一步建议给 Worker 绑定自定义域名，而不是继续使用 `workers.dev`
