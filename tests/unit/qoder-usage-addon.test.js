// 上游 0.5.85 的 getQoderUsage 只解析 userQuota/orgResourcePackage，
// 丢掉了实际承载积分的 addOnQuota 层（Qoder 个人号的套餐额度常为 0，
// 资源包才是真实可用配额），导致仪表盘 Qoder / Qoder CN 配额卡片显示
// "0 / ∞"。本测试用三个真实账号的响应形状（userId 已脱敏）复现并守护修复。
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";
import { parseQuotaData } from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

const CN_USAGE_URL = "https://openapi.qoder.com.cn/api/v2/quota/usage";
const INTL_USAGE_URL = "https://openapi.qoder.sh/api/v2/quota/usage";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// CN 小号真机响应：trial 套餐 300 用尽，资源包 200/400 是唯一余量来源
const CN_BODY = {
  userId: "u-cn-1",
  userType: "personal_professional_trial",
  usageType: "credits",
  totalUsagePercentage: 0.72,
  isQuotaExceeded: false,
  expiresAt: 1791005667118,
  userQuota: { total: 300.0, used: 300.0, remaining: 0.0, unit: "credits" },
  addOnQuota: { total: 400.0, used: 200.0, remaining: 200.0, unit: "credits" },
  isPlanQuotaProrated: false,
};

// intl 大号真机响应：免费套餐 0，资源包 200 全未用
const INTL_BODY = {
  userId: "u-intl-1",
  userType: "personal_standard",
  usageType: "credits",
  totalUsagePercentage: 0.01,
  isQuotaExceeded: false,
  expiresAt: 253402214400000,
  userQuota: { total: 0.0, used: 0.0, remaining: 0.0, unit: "credits" },
  addOnQuota: { total: 200.0, used: 0.0, remaining: 200.0, unit: "credits" },
  isPlanQuotaProrated: false,
};

// 无组织包时响应中不存在 orgResourcePackage 字段（个人号真实形状）
describe("getUsageForProvider(qoder-cn) add-on quota", () => {
  beforeEach(() => vi.clearAllMocks());

  it("surfaces addOnQuota layer alongside user quota", async () => {
    proxyAwareFetch.mockResolvedValue(jsonResponse(CN_BODY));
    const usage = await getUsageForProvider({
      provider: "qoder-cn",
      accessToken: "dt-fake",
      providerSpecificData: { userId: "u-cn-1" },
    });
    expect(proxyAwareFetch.mock.calls[0][0]).toBe(CN_USAGE_URL);
    expect(usage.quotas.addOn).toEqual({
      total: 400,
      used: 200,
      remaining: 200,
      unit: "credits",
      resetAt: new Date(1791005667118).toISOString(),
    });
    expect(usage.quotas.user.total).toBe(300);
  });
});

describe("getUsageForProvider(qoder intl) add-on quota", () => {
  beforeEach(() => vi.clearAllMocks());

  it("surfaces addOnQuota for intl too", async () => {
    proxyAwareFetch.mockResolvedValue(jsonResponse(INTL_BODY));
    const usage = await getUsageForProvider({
      provider: "qoder",
      accessToken: "dt-fake",
      providerSpecificData: { userId: "u-intl-1" },
    });
    expect(proxyAwareFetch.mock.calls[0][0]).toBe(INTL_USAGE_URL);
    expect(usage.quotas.addOn.remaining).toBe(200);
  });
});

describe("parseQuotaData qoder rows", () => {
  it("renders Personal + Add-on rows, hides empty organization", () => {
    const rows = parseQuotaData("qoder-cn", {
      quotas: {
        user: { total: 300, used: 300, remaining: 0, unit: "credits", resetAt: "2026-10-03T05:34:27.118Z" },
        addOn: { total: 400, used: 200, remaining: 200, unit: "credits", resetAt: "2026-10-03T05:34:27.118Z" },
        organization: { total: 0, used: 0, remaining: 0, unit: "credits", resetAt: null },
      },
    });
    const names = rows.map((r) => r.name);
    expect(names).toEqual(["Personal", "Add-on"]);
    const addon = rows.find((r) => r.name === "Add-on");
    expect(addon.used).toBe(200);
    expect(addon.total).toBe(400);
  });

  it("omits Add-on when provider response has no addOnQuota", async () => {
    vi.clearAllMocks();
    const body = { ...CN_BODY };
    delete body.addOnQuota;
    proxyAwareFetch.mockResolvedValue(jsonResponse(body));
    const usage = await getUsageForProvider({
      provider: "qoder-cn",
      accessToken: "dt-fake",
      providerSpecificData: { userId: "u-cn-1" },
    });
    expect(usage.quotas.addOn).toBeUndefined();
  });
});
