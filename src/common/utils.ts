import { StdConstants } from '@dazn/core-stdlib';

export function getBrandFromOrigin(origin?: string): string {
  return origin ? 'dazn' : 'unknown';
}

export function getErrorStatusAndResponse(error: any): { status: number; response: any } {
  const status = error?.status || StdConstants.HttpStatusCodes.INTERNAL_SERVER_ERROR;
  const response = error?.response || { message: 'Internal Server Error' };
  return { status, response };
}
