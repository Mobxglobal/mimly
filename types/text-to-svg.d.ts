declare module "text-to-svg" {
  export type TextToSVGAnchor =
    | string
    | "left baseline"
    | "center baseline"
    | "right baseline"
    | "left top"
    | "center middle"
    | "right bottom";

  export interface TextToSVGPathOptions {
    x?: number;
    y?: number;
    fontSize?: number;
    anchor?: TextToSVGAnchor;
    attributes?: Record<string, string>;
    kerning?: boolean;
    letterSpacing?: number;
    tracking?: number;
  }

  export default class TextToSVG {
    static loadSync(file?: string): TextToSVG;
    getPath(text: string, options?: TextToSVGPathOptions): string;
    getWidth(text: string, options?: TextToSVGPathOptions): number;
    getHeight(fontSize: number): number;
  }
}
