# Proposal

## Why

部署后的 Headless UI 从 `10.100.31.167:5173` 打开时，页面在没有显式配置 `VITE_HEADLESS_API_URL` 的情况下仍请求浏览器本机的 `127.0.0.1:4097`。因此新建 Session 的工作目录校验和保存请求在远程浏览器中直接失败，用户只能看到 `Transport: Failed to fetch`。

## What Changes

- 保留 `VITE_HEADLESS_API_URL` 的显式配置优先级。
- 未配置时，根据当前 UI 页面协议和主机名拼接 Headless API 地址，默认使用端口 `4097`。
- 增加跨主机访问的浏览器冒烟回归测试，覆盖实际请求地址而非只测试同主机场景。

## Impact

- 影响 `packages/headless-ui/src/main.tsx` 和 `packages/headless-ui/test/permission.smoke.spec.ts`。
- 不修改 Headless API 契约、Session 持久化或服务器端工作目录校验。
- 需要重新构建前端静态资源并部署新 release。
