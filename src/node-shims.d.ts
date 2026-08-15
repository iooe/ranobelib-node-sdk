declare module "node:fs/promises" {
  export const access: (...args: any[]) => Promise<any>;
  export const mkdir: (...args: any[]) => Promise<any>;
  export const readFile: (...args: any[]) => Promise<any>;
  export const writeFile: (...args: any[]) => Promise<any>;
  export const rename: (...args: any[]) => Promise<any>;
  export const rm: (...args: any[]) => Promise<any>;
  export const readdir: (...args: any[]) => Promise<any>;
  export const stat: (...args: any[]) => Promise<any>;
}
declare module "node:path" {
  export const basename: (...args: string[]) => string;
  export const dirname: (...args: string[]) => string;
  export const join: (...args: string[]) => string;
  export const resolve: (...args: string[]) => string;
}
declare module "node:crypto" {
  export function createHash(algorithm: string): {
    update(data: string | Uint8Array): any;
    digest(encoding: "hex"): string;
  };
}
declare module "node:url" {
  export function pathToFileURL(path: string): URL;
}
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  cwd(): string;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
};
