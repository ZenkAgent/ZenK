# Static Preview Deployment

这份目录用于把 `public/` 部署成一个可直接访问的静态站点。

## 默认发布参数

- 访问地址：`http://zhongkezhiyan.cn/`
- 站点目录：`/var/www/zenk-preview`
- Nginx 配置文件：`deploy/nginx/zenk-preview.conf`

## 页面入口

- 首页：`http://zhongkezhiyan.cn/`
- 产品路线图：`http://zhongkezhiyan.cn/product-roadmap.html`
- 决策智能体方案：`http://zhongkezhiyan.cn/decision-intelligence-agent-solution.html`

## 服务器部署步骤

1. 在服务器上创建静态目录：

```bash
sudo mkdir -p /var/www/zenk-preview
```

2. 把仓库里的 `public/` 文件上传到服务器：

```bash
scp -r public/* user@zhongkezhiyan.cn:/tmp/zenk-preview/
ssh user@zhongkezhiyan.cn 'sudo mkdir -p /var/www/zenk-preview && sudo cp -r /tmp/zenk-preview/* /var/www/zenk-preview/'
```

3. 安装 Nginx 配置：

```bash
scp deploy/nginx/zenk-preview.conf user@zhongkezhiyan.cn:/tmp/zenk-preview.conf
ssh user@zhongkezhiyan.cn 'sudo cp /tmp/zenk-preview.conf /etc/nginx/conf.d/zenk-preview.conf'
```

4. 检查并重载 Nginx：

```bash
ssh user@zhongkezhiyan.cn 'sudo nginx -t && sudo systemctl reload nginx'
```

## 说明

- 如果域名 DNS 还没有解析到部署这套静态站点的服务器，需要先把 `zhongkezhiyan.cn` 和 `www.zhongkezhiyan.cn` 指向目标主机。
- `decision-intelligence-agent-solution.html` 仍依赖外网字体和 Tailwind CDN；如果部署环境不能访问外网，建议后续改成完全离线版。
- 当前配置适合静态页面预览，不包含 HTTPS、Basic Auth 或访问控制。如果要对外网开放，建议补上 TLS 和权限控制。
