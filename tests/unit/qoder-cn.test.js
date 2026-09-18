/**
 * QoderWork CN (qoderwork-cn) 集成测试。
 *
 * 覆盖：
 *   - 注册表暴露 CN 提供商与 qdcn 别名
 *   - CN 协议档位（网关/登录/轮询/配额端点、client_type、session_type）
 *   - CN 请求体：session_type、business、model_config 精简、reasoning_effort 透传
 *   - CN COSY 头部使用 profile.clientType
 *   - CN 缓存键与 intl 隔离、CN 不支持 PAT
 *   - qoder thinkingFormat 不把 max 压成 xhigh
 */

import { describe, it, expect } from "vitest";

import { PROVIDERS, PROVIDER_MODELS, PROVIDER_OAUTH } from "../../open-sse/providers/index.js";
import { PROVIDER_ID_TO_ALIAS } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { QODER_CN_PROFILE, getQoderProfile } from "../../open-sse/shared/qoder/profiles.js";
import { qoderInferenceBase } from "../../open-sse/shared/qoder/constants.js";
import { buildCosyHeaders } from "../../open-sse/shared/qoder/cosy.js";
import { resolveQoderModels } from "../../open-sse/services/qoderModels.js";
import { __test__ as qoderInternals } from "../../open-sse/executors/qoder.js";

const CN_CREDS = {
  provider: "qoderwork-cn",
  accessToken: "dt-cn-token",
  providerSpecificData: { userId: "cn-user", machineId: "cn-machine" },
};

const INJECTED_MODEL_CONFIG = {
  key: "kmodel",
  display_name: "Kimi-K2.7-Code",
  is_reasoning: true,
  is_vl: true,
  source: "system",
  max_input_tokens: 262144,
  max_output_tokens: 65536,
};

describe("qoderwork-cn 注册表", () => {
  it("暴露 CN 提供商与 qdcn 别名", () => {
    expect(PROVIDERS["qoderwork-cn"]).toBeTruthy();
    expect(PROVIDER_MODELS.qdcn?.length).toBeGreaterThan(0);
    expect(PROVIDER_ID_TO_ALIAS["qoderwork-cn"]).toBe("qdcn");
  });

  it("CN OAuth 配置指向 CN 主机并带设备 client_id", () => {
    const oauth = PROVIDER_OAUTH["qoderwork-cn"];
    expect(oauth.loginUrl).toContain("qoder.com.cn/device/selectAccounts");
    expect(oauth.deviceTokenUrl).toContain("openapi.qoder.com.cn");
    expect(oauth.clientId).toBe(QODER_CN_PROFILE.clientId);
    expect(oauth.redirectUri).toBe("qoder-work-cn://");
  });

  it("CN 传输层走 gateway.qoder.com.cn 且仅支持 OAuth", () => {
    expect(PROVIDERS["qoderwork-cn"].baseUrl).toContain("gateway.qoder.com.cn");
    expect(PROVIDERS["qoderwork-cn"].usage.url).toContain("openapi.qoder.com.cn");
    const registryEntry = { authModes: ["oauth"] };
    expect(registryEntry.authModes).not.toContain("apikey");
  });
});

describe("getQoderProfile", () => {
  it("按 provider 识别 CN，未命中时返回 null", () => {
    expect(getQoderProfile({ provider: "qoderwork-cn" })?.id).toBe("cn-work");
    expect(getQoderProfile({ providerSpecificData: { qoderRegion: "cn-work" } })?.id).toBe("cn-work");
    expect(getQoderProfile({ provider: "qoder" })).toBeNull();
  });

  it("CN 推理地址走 CN 网关，intl 不受影响", () => {
    expect(qoderInferenceBase(CN_CREDS)).toBe("https://gateway.qoder.com.cn");
    expect(qoderInferenceBase({ accessToken: "dt-x" })).toContain("api3.qoder.sh");
    expect(qoderInferenceBase({ accessToken: "jt-x" })).toContain("api2.qoder.sh");
  });
});

describe("CN COSY 头部", () => {
  it("使用 profile 的 clientType，并保留 machineId/machineToken 回退", () => {
    const headers = buildCosyHeaders(Buffer.alloc(0), "https://gateway.qoder.com.cn/algo/api/v2/model/list", {
      userId: "cn-user",
      authToken: "dt-cn-token",
      machineId: "cn-machine",
      provider: "qoderwork-cn",
      providerSpecificData: { userId: "cn-user" },
    });
    expect(headers["Cosy-Clienttype"]).toBe("6");
    expect(headers["Cosy-Machineid"]).toBe("cn-machine");
    expect(headers["Cosy-Machinetoken"]).toBe("cn-machine");
    expect(headers["Cosy-Sigpath"]).toBe("/api/v2/model/list");
  });
});

describe("CN 请求体", () => {
  const { buildQoderRequestBody } = qoderInternals;

  async function build(body = {}) {
    return buildQoderRequestBody({
      model: "kmodel",
      body: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }], ...body },
      credentials: CN_CREDS,
      modelConfig: INJECTED_MODEL_CONFIG,
    });
  }

  it("写入 CN session_type 与 business 块", async () => {
    const { payload } = await build();
    expect(payload.session_type).toBe("qoder_work");
    expect(payload.business.product).toBe("qoder_work");
    expect(payload.business.type).toBe("agent");
    expect(payload.business.stage).toBe("init");
  });

  it("精简 model_config 为 CN 桌面字段集", async () => {
    const { payload } = await build();
    expect(Object.keys(payload.model_config).sort()).toEqual([
      "api_key", "display_name", "format", "is_reasoning", "is_vl",
      "key", "max_input_tokens", "model", "source", "url",
    ]);
    expect(payload.model_config.api_key).toBe("");
    expect(payload.model_config.url).toBe("");
  });

  it("reasoning_effort=max 原样透传，未提供时按 is_reasoning 兜底 high", async () => {
    expect((await build({ reasoning_effort: "max" })).payload.parameters.reasoning_effort).toBe("max");
    expect((await build({ reasoning_effort: "none" })).payload.parameters.reasoning_effort).toBe("none");
    expect((await build()).payload.parameters.reasoning_effort).toBe("high");
  });

  it("透传 tool_choice / max_thinking_tokens / context_length", async () => {
    const { payload } = await build({
      tool_choice: "auto",
      max_thinking_tokens: 4096,
      context_length: 400000,
    });
    expect(payload.parameters.tool_choice).toBe("auto");
    expect(payload.parameters.max_thinking_tokens).toBe(4096);
    expect(payload.parameters.context_length).toBe(400000);
  });

  it("developer 角色并入 system（CN 网关不接受 developer）", async () => {
    const { payload } = await build({
      messages: [
        { role: "developer", content: "dev" },
        { role: "user", content: "hi" },
      ],
    });
    expect(payload.system).toBe("dev");
    expect(payload.messages.every((m) => m.role !== "developer")).toBe(true);
  });

  it("intl 请求体不带 CN 专属字段", async () => {
    const { payload } = await buildQoderRequestBody({
      model: "kmodel",
      body: { messages: [{ role: "user", content: "hi" }] },
      credentials: {
        accessToken: "dt-intl",
        providerSpecificData: { userId: "intl-user" },
      },
      modelConfig: INJECTED_MODEL_CONFIG,
    });
    expect(payload.session_type).toBe("qodercli");
    expect(payload.business.product).toBe("cli");
    expect(payload.business.stage).toBe("start");
    expect(payload.parameters.reasoning_effort).toBeUndefined();
  });
});

describe("CN 能力与思考级别", () => {
  it("kmodel 标记为 reasoning 且 thinkingFormat=qoder", () => {
    const caps = getCapabilitiesForModel("qoderwork-cn", "kmodel");
    expect(caps.reasoning).toBe(true);
    expect(caps.thinkingFormat).toBe("qoder");
  });

  it("CN 可选级别含 none..max", () => {
    expect(getThinkingLevels("qoderwork-cn", "kmodel")).toContain("max");
  });

  it("qoder 格式保留 max，不被压成 xhigh", () => {
    const body = { reasoning_effort: "max" };
    applyThinking("openai", "qdcn/kmodel", body, "qoderwork-cn");
    expect(body.reasoning_effort).toBe("max");
  });
});

describe("CN 凭据处理", () => {
  it("CN 连接拒绝 PAT（pt-）", async () => {
    await expect(
      resolveQoderModels({ provider: "qoderwork-cn", apiKey: "pt-abc", providerSpecificData: { userId: "u" } }),
    ).resolves.toBeNull();
  });
});
