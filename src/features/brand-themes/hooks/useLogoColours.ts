import { useCallback, useState } from "react";
import { dominantColours } from "../logic";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; colours: string[] }
  | { status: "error"; message: string };

const SIZE = 64;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Saved logos live on R2; without CORS the canvas can't be read.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load"));
    img.src = src;
  });
}

/** "Suggest from logo": reads the logo into a small canvas and picks its main colours. */
export function useLogoColours() {
  const [state, setState] = useState<State>({ status: "idle" });
  const suggest = useCallback(async (src: string | null) => {
    if (!src) {
      setState({ status: "error", message: "Add a logo first." });
      return;
    }
    setState({ status: "loading" });
    try {
      const img = await loadImage(src);
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const colours = dominantColours(ctx.getImageData(0, 0, SIZE, SIZE).data);
      setState(
        colours.length
          ? { status: "done", colours }
          : { status: "error", message: "No clear colours found in this logo." },
      );
    } catch {
      setState({
        status: "error",
        message: "This logo can't be read. Drop the logo file here again and try once more.",
      });
    }
  }, []);
  const clear = useCallback(() => setState({ status: "idle" }), []);
  return { state, suggest, clear };
}
