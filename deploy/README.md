# Static Preview Deployment

这份目录用于把当前仓库主页部署成一个可直接访问的站点，并支持共享导航配置维护。

如果你的页面托管在 GitHub Pages、又没有自己的服务器，优先用 Cloudflare Worker 方案：

- 说明文档：[deploy/cloudflare-worker/README.md](/Users/mac/code/Zenkmap/deploy/cloudflare-worker/README.md:1)
- Worker 入口：[deploy/cloudflare-worker/index.mjs](/Users/mac/code/Zenkmap/deploy/cloudflare-worker/index.mjs:1)

如果你后面有自己的服务器，再用下面的 Python API + Nginx 方案。

## 默认发布参数

- 访问地址：`http://zhongkezhiyan.cn/`
- 站点目录：`/var/www/zenk-preview`
- Nginx 配置文件：`deploy/nginx/zenk-preview.conf`
- 导航配置文件：`/var/www/zenk-preview/nav-config.json`
- 导航配置 API：`http://127.0.0.1:8787/api/nav-config`

## 页面入口

- 首页：`http://zhongkezhiyan.cn/`
- 产品路线图：`http://zhongkezhiyan.cn/product-roadmap.html`
- 决策智能体方案：`http://zhongkezhiyan.cn/decision-intelligence-agent-solution.html`

## 导航维护能力

- 前端会先读取 `/api/nav-config`，如果 API 不可用，再回退到静态文件 `nav-config.json`
- 普通访问者只能预览当前最新导航
- 管理员需要输入 `ZENK_NAV_ADMIN_PASSWORD` 对应的口令，才能解锁维护并保存
- 保存成功后，`nav-config.json` 会被服务端更新，其他访问者下次打开页面默认看到最新一次维护结果

## 服务器部署步骤

1. 在服务器上创建静态目录：

```bash
sudo mkdir -p /var/www/zenk-preview
```

2. 把站点文件上传到服务器：

```bash
scp index.html nav-config.json user@zhongkezhiyan.cn:/tmp/zenk-preview/
scp -r image AIMG user@zhongkezhiyan.cn:/tmp/zenk-preview/
scp public/product-roadmap.html public/decision-intelligence-agent-solution.html user@zhongkezhiyan.cn:/tmp/zenk-preview/
ssh user@zhongkezhiyan.cn 'sudo mkdir -p /var/www/zenk-preview && sudo cp /tmp/zenk-preview/index.html /tmp/zenk-preview/nav-config.json /tmp/zenk-preview/product-roadmap.html /tmp/zenk-preview/decision-intelligence-agent-solution.html /var/www/zenk-preview/ && sudo cp -r /tmp/zenk-preview/image /tmp/zenk-preview/AIMG /var/www/zenk-preview/'
```

3. 上传导航配置 API：

```bash
scp deploy/nav_config_api.py user@zhongkezhiyan.cn:/tmp/nav_config_api.py
ssh user@zhongkezhiyan.cn 'sudo mkdir -p /opt/zenk-preview && sudo cp /tmp/nav_config_api.py /opt/zenk-preview/nav_config_api.py && sudo chmod +x /opt/zenk-preview/nav_config_api.py'
```

4. 在服务器上启动导航配置 API：

```bash
ssh user@zhongkezhiyan.cn 'export ZENK_NAV_ADMIN_PASSWORD="请替换成你的管理员口令" && nohup python3 /opt/zenk-preview/nav_config_api.py >/tmp/zenk-nav-api.log 2>&1 &'
```

如果你要长期运行，建议把这条命令改成 `systemd` 服务。

5. 安装 Nginx 配置：

```bash
scp deploy/nginx/zenk-preview.conf user@zhongkezhiyan.cn:/tmp/zenk-preview.conf
ssh user@zhongkezhiyan.cn 'sudo cp /tmp/zenk-preview.conf /etc/nginx/conf.d/zenk-preview.conf'
```

6. 检查并重载 Nginx：

```bash
ssh user@zhongkezhiyan.cn 'sudo nginx -t && sudo systemctl reload nginx'
```

## 说明

- 如果域名 DNS 还没有解析到部署这套静态站点的服务器，需要先把 `zhongkezhiyan.cn` 和 `www.zhongkezhiyan.cn` 指向目标主机。
- `decision-intelligence-agent-solution.html` 仍依赖外网字体和 Tailwind CDN；如果部署环境不能访问外网，建议后续改成完全离线版。
- 当前配置适合预览和轻量内容维护，不包含 HTTPS、Basic Auth 或访问控制。如果要对外网开放，建议补上 TLS 和权限控制。
- `ZENK_NAV_ADMIN_PASSWORD` 不要直接写进仓库，建议放到服务器环境变量或 `systemd` 服务配置里。
