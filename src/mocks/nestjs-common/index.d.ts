export declare function Body(options?: any): any;
export declare function Controller(prefix?: string): any;
export declare function Post(path?: string): any;
export declare function Res(options?: any): any;
export declare function Headers(options?: any): any;
export declare function UseGuards(...guards: any[]): any;
export declare function Injectable(options?: any): any;

export declare class HttpException extends Error {
  readonly response: any;
  readonly status: number;
  constructor(response: any, status: number);
}

export interface CanActivate {
  canActivate(context: any): boolean;
}

export interface ExecutionContext {}
