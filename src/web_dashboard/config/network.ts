const DEFAULT_ROSBRIDGE_URL = "ws://localhost:9090";

const getDynamicUrl = (envUrl: string | undefined, defaultUrl: string) => {
  let url =
    typeof envUrl === "string" && envUrl.trim().length > 0
      ? envUrl.trim()
      : defaultUrl;

  if (typeof window !== "undefined" && url.includes("localhost")) {
    // If the browser accesses the dashboard via a real IP, replace localhost with that IP
    if (window.location.hostname !== "localhost") {
      url = url.replace("localhost", window.location.hostname);
    }
  }
  return url;
};

export const ROSBRIDGE_URL = getDynamicUrl(
  process.env.NEXT_PUBLIC_ROSBRIDGE_URL,
  DEFAULT_ROSBRIDGE_URL
);

export const CAMERA_STREAM_URL = getDynamicUrl(
  process.env.NEXT_PUBLIC_CAMERA_URL,
  ""
);

export const CAMERA_STREAM_URL_2 = getDynamicUrl(
  process.env.NEXT_PUBLIC_CAMERA_2_URL,
  ""
);
