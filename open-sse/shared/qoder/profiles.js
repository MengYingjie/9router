export const QODER_CN_PROFILE = {
  id: "cn-work",
  chatBase: "https://gateway.qoder.com.cn",
  modelListUrl: "https://gateway.qoder.com.cn/algo/api/v2/model/list?Encode=1",
  loginUrl: "https://qoder.com.cn/device/selectAccounts",
  deviceTokenUrl: "https://openapi.qoder.com.cn/api/v1/deviceToken/poll",
  userInfoUrl: "https://openapi.qoder.com.cn/api/v1/userinfo",
  refreshUrl: "https://openapi.qoder.com.cn/api/v1/deviceToken/refresh",
  quotaUrl: "https://openapi.qoder.com.cn/api/v2/quota/usage",
  clientId: "1c5e33e1-364d-4ce6-b02c-acaa81274a5c",
  redirectUri: "qoder-work-cn://",
  clientType: "6",
  sessionType: "qoder_work",
  userAgent: "QoderWork",
};

export function getQoderProfile(credentials) {
  return credentials?.provider === "qoderwork-cn" || credentials?.providerSpecificData?.qoderRegion === "cn-work"
    ? QODER_CN_PROFILE
    : null;
}
