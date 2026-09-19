import { QODER_CN_PROFILE as profile } from "../../shared/qoder/profiles.js";

export default {
  id: "qoderwork-cn",
  priority: 85,
  alias: "qdcn",
  uiAlias: "qdcn",
  display: {
    name: "Qoder CN",
    icon: "water_drop",
    color: "#EC4899",
    website: "https://qoder.com.cn",
    notice: { signupUrl: "https://qoder.com.cn" },
  },
  category: "oauth",
  hasOAuth: true,
  authModes: ["oauth"],
  transport: {
    baseUrl: `${profile.chatBase}/algo/api/v2/service/pro/sse/agent_chat_generation`,
    headers: {},
    timeoutMs: 120000,
    usage: { url: profile.quotaUrl },
  },
  // 与 intl(qoder) 对齐的静态兜底清单，镜像 CN 网关 /algo/api/v2/model/list
  // 的实时目录（2026-09-19 抓取）。运行时以连接级实时目录为准。
  models: [
    { id: "auto", name: "Auto" },
    { id: "qmodel_38max", name: "Qwen3.8-Max" },
    { id: "qfmodel", name: "Qwen3.8-Flash" },
    { id: "qmodel_latest", name: "Qwen3.7-Max" },
    { id: "qmodel", name: "Qwen3.7-Plus" },
    { id: "q37fmodel", name: "Qwen3.7-Flash" },
    { id: "dmodel", name: "DeepSeek-V4-Pro" },
    { id: "dfmodel", name: "DeepSeek-V4-Flash" },
    { id: "gmodel", name: "GLM-5.3" },
    { id: "gfmodel", name: "GLM-5.3-Flash" },
    { id: "gm51model", name: "GLM-5.2" },
    { id: "kmodel_latest", name: "Kimi-K3" },
    { id: "kmodel", name: "Kimi-K2.7-Code" },
    { id: "mmodel", name: "MiniMax-M2.7" },
  ],
  oauth: {
    openApiBaseUrl: "https://openapi.qoder.com.cn",
    chatBaseUrl: profile.chatBase,
    deviceTokenUrl: profile.deviceTokenUrl,
    refreshUrl: profile.refreshUrl,
    userInfoUrl: profile.userInfoUrl,
    quotaUsageUrl: profile.quotaUrl,
    loginUrl: profile.loginUrl,
    clientId: profile.clientId,
    redirectUri: profile.redirectUri,
  },
  features: { usage: true, profileRefresh: true },
};
