declare module "picomatch" {
  export interface PicomatchOptions {
    readonly dot?: boolean;
    readonly bash?: boolean;
  }

  export default function picomatch(pattern: string, options?: PicomatchOptions): (path: string) => boolean;
}
