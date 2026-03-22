import { AdapterMode, SystemModes } from "@/lib/types";

function resolveMode(hasLiveCredentials: boolean): AdapterMode {
  const forceMock = process.env.FORCE_MOCK_MODE === "true";

  if (forceMock) {
    return "mock";
  }

  return hasLiveCredentials ? "live" : "mock";
}

export function getSystemModes(): SystemModes {
  return {
    ocr: resolveMode(
      Boolean(process.env.INTERFAZE_API_URL && process.env.INTERFAZE_API_KEY),
    ),
    supplierSearch: resolveMode(Boolean(process.env.EXA_API_KEY)),
    tinyFish: resolveMode(
      Boolean(process.env.TINYFISH_API_URL && process.env.TINYFISH_API_KEY),
    ),
  };
}
