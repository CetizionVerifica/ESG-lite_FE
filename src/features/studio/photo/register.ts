// PE-1 · the image and frame toolbar: the shell's media tools followed by the photo tools.
import { registerToolbar } from "../editor/registry";
import { PhotoToolbar } from "./PhotoTools";

export function registerPhotoPlugins(): void {
  registerToolbar("image", PhotoToolbar);
  registerToolbar("frame", PhotoToolbar);
}
