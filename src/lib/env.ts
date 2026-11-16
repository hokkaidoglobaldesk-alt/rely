export function hasEnv(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export function getEnv(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}
