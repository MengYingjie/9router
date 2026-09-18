import qoder from "./qoder.js";
import { QODER_CN_PROFILE } from "open-sse/shared/qoder/profiles.js";

export default {
  ...qoder,
  config: QODER_CN_PROFILE,
  mapTokens(tokens) {
    const mapped = qoder.mapTokens(tokens);
    const userId = mapped.providerSpecificData.userId;
    return {
      ...mapped,
      email: tokens._qoderEmail?.trim() || (userId ? `qoderwork-cn-user-${userId}` : null),
      expiresIn: tokens.expires_in,
      providerSpecificData: {
        ...mapped.providerSpecificData,
        qoderRegion: "cn-work",
      },
    };
  },
};
