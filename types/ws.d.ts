// @vercel/functions types its websocket helper against `ws`, which it does not
// depend on. Nothing here imports it. This stub keeps `tsc` off that dead path.
declare module "ws";
